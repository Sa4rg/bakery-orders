import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { customerOrderingFixture, fixtureBusinesses } from './support/fixtures.ts'
import { createLocalAdminClient, resolveLocalSupabaseRuntime, type LocalAdminClient } from './support/localSupabase.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DELIVERY = '2030-01-15T10:30'

// The admin client is used ONLY for read-side assertions. All writes below
// go through the real browser, its JWT, and the production trusted RPCs.
function readOnlyVerifier() {
  return createLocalAdminClient(resolveLocalSupabaseRuntime())
}

function amount(card: Locator, label: string): Locator {
  return card.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]')
}

async function customerCreatesOrder(page: Page, label: string): Promise<string> {
  await signInThroughUi(page, 'customerA')
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search products' })
    .fill(customerOrderingFixture.productName)
  await expect(page.getByRole('heading', { name: customerOrderingFixture.productName })).toBeVisible()
  await page.getByRole('button', {
    name: `Add ${customerOrderingFixture.productName} to cart`,
  }).click()
  const addOne = page.getByRole('button', {
    name: `Increase ${customerOrderingFixture.productName} quantity`,
  })
  await addOne.click()
  await addOne.click()
  await expect(page.getByRole('spinbutton', {
    name: `Quantity for ${customerOrderingFixture.productName}`,
  })).toHaveValue('3')
  await page.getByRole('button', { name: 'Review order' }).click()
  await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible()
  await page.getByLabel('Requested delivery date and time').fill(DELIVERY)
  await page.getByRole('textbox', { name: 'Optional notes' }).fill(label)
  await page.getByRole('button', { name: 'Place order' }).click()
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()
  const id = page.getByText(UUID)
  await expect(id).toBeVisible()
  const orderId = (await id.textContent())?.trim()
  if (!orderId || !UUID.test(orderId)) throw new Error('CUSTOMER confirmation did not contain a valid Order id.')
  return orderId
}

async function openNewOrderInKitchen(page: Page, orderNumber: number, notes: string) {
  const connected = page.getByText('Realtime: connected. Queue up to date.', { exact: true })
  const view = page.getByRole('button', {
    name: `View details for order #${orderNumber}`, exact: true,
  })
  // The filter is set to RECEIVED before CUSTOMER creates the Order. No manual
  // refresh or page reload may be necessary for the new Order to appear.
  await expect(view).toBeVisible({ timeout: 20_000 })
  await connected.waitFor({ state: 'visible', timeout: 20_000 })
  await view.click()
  const region = page.getByRole('region', { name: 'Selected production order' })
  const orderCard = region.getByRole('article', {
    name: `Production order ${orderNumber} for ${fixtureBusinesses.A.name}`, exact: true,
  })
  await expect(orderCard).toBeVisible()
  await expect(orderCard.getByText(notes, { exact: false })).toBeVisible()
  const item = orderCard.getByRole('article', {
    name: `Production item: ${customerOrderingFixture.productName}`, exact: true,
  })
  await expect(item).toBeVisible()
  await expect(amount(item, 'Requested')).toHaveText('3')
  return { connected, view, orderCard, item }
}

async function persistedOrderNumber(admin: LocalAdminClient, orderId: string): Promise<number> {
  const result = await admin.from('orders')
    .select('order_number').eq('id', orderId).single()
  expect(result.error).toBeNull()
  if (result.data?.order_number == null) throw new Error('Created Order has no order number.')
  return result.data.order_number
}

async function persistedQuantities(admin: LocalAdminClient, orderId: string) {
  const result = await admin.from('order_items')
    .select('id, requested_quantity, prepared_quantity, unavailable_quantity')
    .eq('order_id', orderId).single()
  expect(result.error).toBeNull()
  if (!result.data) throw new Error('Created Order has no persisted item.')
  return result.data
}

test.describe('M4-011 — complete Production acceptance through real browsers', () => {
  test('COMPLETE: CUSTOMER browser → Realtime KITCHEN → trusted READY → exact persisted audit', async ({ browser, page }) => {
    test.setTimeout(120_000)
    const customerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    const managerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      const admin = readOnlyVerifier()
      await signInThroughUi(page, 'kitchen')
      await expect(page.getByRole('heading', { name: 'Kitchen production' })).toBeVisible()
      const filter = page.getByRole('combobox', { name: 'Production status filter' })
      await filter.selectOption('RECEIVED')
      await expect(page.getByText('Realtime: connected. Queue up to date.', { exact: true }))
        .toBeVisible({ timeout: 20_000 })

      const customer = await customerContext.newPage()
      const notes = `M4-011 COMPLETE ${randomUUID()}`
      const orderId = await customerCreatesOrder(customer, notes)
      await expect(customer.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)
      await expect(customer.getByRole('region', { name: 'Manager production interventions' })).toHaveCount(0)
      const orderNumber = await persistedOrderNumber(admin, orderId)
      const { connected, view, orderCard, item } = await openNewOrderInKitchen(page, orderNumber, notes)
      await expect(amount(orderCard, 'Fulfillment progress')).toHaveText('Unresolved')
      await expect(amount(orderCard, 'Order remaining')).toHaveText('3')

      await orderCard.getByRole('button', { name: `Start order #${orderNumber}` }).click()
      const prepared = item.getByRole('textbox', {
        name: `Prepare more ${customerOrderingFixture.productName}`,
      })
      await expect(prepared).toBeEnabled({ timeout: 20_000 })
      await expect(connected).toBeVisible({ timeout: 20_000 })
      await prepared.fill('3')
      await expect(prepared).toHaveValue('3')
      const submit = item.getByRole('button', { name: 'Record prepared' })
      await expect(submit).toBeEnabled({ timeout: 20_000 })
      await submit.click() // One mutation only; read assertions may poll, mutations never retry.

      await expect.poll(async () => (await persistedQuantities(admin, orderId)).prepared_quantity, {
        timeout: 20_000,
      }).toBe(3)
      await expect(amount(item, 'Prepared')).toHaveText('3', { timeout: 20_000 })
      await expect(amount(item, 'Remaining')).toHaveText('0')
      await expect(amount(orderCard, 'Fulfillment progress')).toHaveText('Resolved')
      await expect(amount(orderCard, 'Fulfillment condition')).toHaveText('COMPLETE')
      await expect(amount(orderCard, 'Order remaining')).toHaveText('0')

      await expect(connected).toBeVisible({ timeout: 20_000 })
      const ready = orderCard.getByRole('button', { name: `Mark order #${orderNumber} ready` })
      await expect(ready).toBeEnabled({ timeout: 20_000 })
      await ready.click() // One trusted READY mutation only.
      await expect.poll(async () => {
        const row = await admin.from('orders').select('status').eq('id', orderId).single()
        expect(row.error).toBeNull()
        return row.data?.status
      }, { timeout: 20_000 }).toBe('READY')

      const orderResult = await admin.from('orders')
        .select('status, started_at, started_by_user_id, ready_at, ready_by_user_id, cancelled_at, dispatched_at, delivered_at')
        .eq('id', orderId).single()
      expect(orderResult.error).toBeNull()
      const order = orderResult.data
      expect(order).toMatchObject({ status: 'READY', cancelled_at: null, dispatched_at: null, delivered_at: null })
      expect(order?.started_at).toBeTruthy()
      expect(order?.ready_at).toBeTruthy()
      expect(order?.started_by_user_id).toBeTruthy()
      expect(order?.ready_by_user_id).toBe(order?.started_by_user_id)
      expect(await persistedQuantities(admin, orderId)).toMatchObject({
        requested_quantity: 3, prepared_quantity: 3, unavailable_quantity: 0,
      })
      const events = await admin.from('order_events')
        .select('event_type, actor_user_id, order_item_id, previous_value, new_value, metadata, occurred_at')
        .eq('order_id', orderId)
      expect(events.error).toBeNull()
      expect(events.data?.map(({ event_type }) => event_type).sort()).toEqual([
        'ORDER_CREATED', 'ORDER_READY', 'PREPARATION_STARTED', 'QUANTITY_PREPARED',
      ])
      const started = events.data?.find((event) => event.event_type === 'PREPARATION_STARTED')
      const recorded = events.data?.find((event) => event.event_type === 'QUANTITY_PREPARED')
      const marked = events.data?.find((event) => event.event_type === 'ORDER_READY')
      expect(started?.actor_user_id).toBe(order?.started_by_user_id)
      expect(recorded).toMatchObject({
        actor_user_id: order?.started_by_user_id,
        previous_value: { prepared_quantity: 0 },
        new_value: { prepared_quantity: 3 },
        metadata: { quantity_delta: 3 },
      })
      expect(marked).toMatchObject({
        actor_user_id: order?.ready_by_user_id,
        order_item_id: null,
        previous_value: { status: 'IN_PROGRESS' },
        new_value: { status: 'READY' },
        metadata: { fulfillment_condition: 'COMPLETE', prepared_quantity: 3, unavailable_quantity: 0 },
      })
      expect(marked?.occurred_at).toBe(order?.ready_at)

      // READY exits the active production queue via Realtime/refetch, not by
      // an optimistic local status write.
      await page.getByRole('button', { name: 'Back to production queue' }).click()
      await filter.selectOption('ALL_ACTIVE')
      await expect(connected).toBeVisible({ timeout: 20_000 })
      await expect(view).toHaveCount(0, { timeout: 20_000 })

      // MANAGER's intervention inbox must not classify a READY/COMPLETE Order
      // as blocked. This is only a page-local assertion, not a global count.
      const manager = await managerContext.newPage()
      await signInThroughUi(manager, 'manager')
      const inbox = manager.getByRole('region', { name: 'Manager production interventions' })
      await expect(inbox).toBeVisible()
      await expect(inbox.getByRole('button', { name: 'Refresh interventions' })).toBeEnabled()
      await expect(inbox.getByRole('article', { name: `Blocked order #${orderNumber}` })).toHaveCount(0)
      await expect(manager.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)
    } finally {
      await Promise.allSettled([customerContext.close(), managerContext.close()])
    }
  })

  test('UNAVAILABLE: CUSTOMER → KITCHEN → MANAGER intervention; no READY or invented cancellation', async ({ browser, page }) => {
    test.setTimeout(120_000)
    const customerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    const managerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      const admin = readOnlyVerifier()
      await signInThroughUi(page, 'kitchen')
      await expect(page.getByRole('heading', { name: 'Kitchen production' })).toBeVisible()
      const filter = page.getByRole('combobox', { name: 'Production status filter' })
      await filter.selectOption('RECEIVED')
      await expect(page.getByText('Realtime: connected. Queue up to date.', { exact: true }))
        .toBeVisible({ timeout: 20_000 })

      const customer = await customerContext.newPage()
      const notes = `M4-011 UNAVAILABLE ${randomUUID()}`
      const orderId = await customerCreatesOrder(customer, notes)
      await expect(customer.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)
      await expect(customer.getByRole('region', { name: 'Manager production interventions' })).toHaveCount(0)
      const orderNumber = await persistedOrderNumber(admin, orderId)
      const { connected, orderCard, item } = await openNewOrderInKitchen(page, orderNumber, notes)
      await orderCard.getByRole('button', { name: `Start order #${orderNumber}` }).click()
      const unavailable = item.getByRole('textbox', {
        name: `Unavailable amount for ${customerOrderingFixture.productName}`,
      })
      await expect(unavailable).toBeEnabled({ timeout: 20_000 })
      await expect(connected).toBeVisible({ timeout: 20_000 })
      await unavailable.fill('3')
      await expect(unavailable).toHaveValue('3')
      await item.getByRole('textbox', { name: `Reason for ${customerOrderingFixture.productName}` })
        .fill('M4-011 no ingredients')
      const submit = item.getByRole('button', { name: 'Record unavailable' })
      await expect(submit).toBeEnabled({ timeout: 20_000 })
      await submit.click()
      await expect.poll(async () => (await persistedQuantities(admin, orderId)).unavailable_quantity, {
        timeout: 20_000,
      }).toBe(3)
      await expect(amount(item, 'Remaining')).toHaveText('0', { timeout: 20_000 })
      await expect(amount(orderCard, 'Fulfillment condition')).toHaveText('UNAVAILABLE')
      await expect(orderCard.getByRole('complementary', {
        name: `Manager intervention required for order #${orderNumber}`,
      })).toBeVisible()
      await expect(orderCard.getByRole('button', { name: `Mark order #${orderNumber} ready` })).toHaveCount(0)

      const manager = await managerContext.newPage()
      await signInThroughUi(manager, 'manager')
      const inbox = manager.getByRole('region', { name: 'Manager production interventions' })
      await expect(inbox).toBeVisible()
      await expect(manager.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)
      const incident = inbox.getByRole('article', { name: `Blocked order #${orderNumber}` })
      for (let index = 0; index < 20; index += 1) {
        await expect(inbox.getByRole('button', { name: 'Refresh interventions' })).toBeEnabled()
        if (await incident.count() > 0) break
        const next = inbox.getByRole('button', { name: 'Next orders page' })
        await expect(next).toBeEnabled()
        await next.click()
      }
      await expect(incident).toBeVisible()
      await expect(incident.getByText('M4-011 no ingredients')).toBeVisible()
      await expect(incident.getByRole('button', { name: /Cancel|Ready|Dispatch/i })).toHaveCount(0)

      const stored = await admin.from('orders')
        .select('status, ready_at, ready_by_user_id, cancelled_at, cancelled_by_user_id, dispatched_at, delivered_at')
        .eq('id', orderId).single()
      expect(stored.error).toBeNull()
      expect(stored.data).toMatchObject({
        status: 'IN_PROGRESS', ready_at: null, ready_by_user_id: null,
        cancelled_at: null, cancelled_by_user_id: null, dispatched_at: null, delivered_at: null,
      })
      expect(await persistedQuantities(admin, orderId)).toMatchObject({
        requested_quantity: 3, prepared_quantity: 0, unavailable_quantity: 3,
      })
      const events = await admin.from('order_events')
        .select('event_type, reason').eq('order_id', orderId)
      expect(events.error).toBeNull()
      expect(events.data?.map((event) => event.event_type).sort()).toEqual([
        'ORDER_CREATED', 'PREPARATION_STARTED', 'QUANTITY_UNAVAILABLE',
      ])
      expect(events.data?.find((event) => event.event_type === 'QUANTITY_UNAVAILABLE')?.reason)
        .toBe('M4-011 no ingredients')
    } finally {
      await Promise.allSettled([customerContext.close(), managerContext.close()])
    }
  })
})
