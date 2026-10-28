import { expect, test, type Locator, type Page } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { customerOrderingFixture, fixtureBusinesses } from './support/fixtures.ts'
import { createLocalAdminClient, resolveLocalSupabaseRuntime } from './support/localSupabase.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DELIVERY_DATE_TIME = '2030-01-15T10:30'

/** Create through the actual CUSTOMER browser UI, not an admin insert or mock. */
async function placeCustomerOrder(page: Page, notes: string): Promise<string> {
  await signInThroughUi(page, 'customerA')
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Search products' })
    .fill(customerOrderingFixture.productName)
  await expect(page.getByRole('heading', { name: customerOrderingFixture.productName }))
    .toBeVisible()
  await page.getByRole('button', {
    name: `Add ${customerOrderingFixture.productName} to cart`,
  }).click()
  const increase = page.getByRole('button', {
    name: `Increase ${customerOrderingFixture.productName} quantity`,
  })
  await increase.click()
  await increase.click()
  await expect(page.getByRole('spinbutton', {
    name: `Quantity for ${customerOrderingFixture.productName}`,
  })).toHaveValue('3')

  await page.getByRole('button', { name: 'Review order' }).click()
  await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible()
  await page.getByLabel('Requested delivery date and time').fill(DELIVERY_DATE_TIME)
  await page.getByRole('textbox', { name: 'Optional notes' }).fill(notes)
  await page.getByRole('button', { name: 'Place order' }).click()
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()

  const idLabel = page.getByText(UUID_PATTERN)
  await expect(idLabel).toBeVisible()
  const orderId = (await idLabel.textContent())?.trim()
  if (!orderId || !UUID_PATTERN.test(orderId)) {
    throw new Error('CUSTOMER confirmation did not show the persisted Order id.')
  }
  return orderId
}

/** Read the numeric amount associated with one named production field. */
function amount(item: Locator, label: string): Locator {
  return item.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]')
}

/** E2E read assertions only. Browser mutations use JWT + trusted RPC exclusively. */
function localAdmin() {
  return createLocalAdminClient(resolveLocalSupabaseRuntime())
}

async function uiNotices(page: Page): Promise<string> {
  const notices = await page.locator('[role="alert"], [role="status"]').allTextContents()
  return notices.map((notice) => notice.trim()).filter(Boolean).slice(0, 12).join(' | ')
}

test('CUSTOMER order arrives via Realtime; KITCHEN operates UI and SQL records exact audit', async ({ browser, page }) => {
  test.setTimeout(120_000)

  // `page` is KITCHEN's isolated browser context. The separate CUSTOMER context
  // has different auth storage; it inherits the server URL from Playwright config.
  const customerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  try {
    await signInThroughUi(page, 'kitchen')
    await expect(page.getByRole('heading', { name: 'Kitchen production' })).toBeVisible()
    const status = page.getByText('Realtime: connected. Queue up to date.', { exact: true })
    await expect(status).toBeVisible({ timeout: 20_000 })

    // The RECEIVED-only listener must be fully established BEFORE order creation.
    const filter = page.getByRole('combobox', { name: 'Production status filter' })
    await filter.selectOption('RECEIVED')
    await expect(status).toBeVisible({ timeout: 20_000 })

    const customer = await customerContext.newPage()
    const notes = `E2E M4-006 browser production repeat ${test.info().repeatEachIndex}`
    const orderId = await placeCustomerOrder(customer, notes)

    const admin = localAdmin()
    const orderLookup = await admin.from('orders')
      .select('order_number, status')
      .eq('id', orderId)
      .single()
    expect(orderLookup.error).toBeNull()
    expect(orderLookup.data?.status).toBe('RECEIVED')
    const orderNumber = orderLookup.data?.order_number
    expect(orderNumber).toBeTruthy()
    if (orderNumber === undefined) throw new Error('Order number missing after confirmation.')

    // Must appear without a browser reload or manual queue refresh: real WAL
    // invalidation triggers a fresh authorized read of Orders and OrderItems.
    const view = page.getByRole('button', {
      name: `View details for order #${orderNumber}`, exact: true,
    })
    await expect(view).toBeVisible({ timeout: 20_000 })

    // Switching filters rebuilds the listener/cursor while retaining this Order.
    await filter.selectOption('ALL_ACTIVE')
    await expect(view).toBeVisible({ timeout: 20_000 })
    await view.click()

    const detail = page.getByRole('region', { name: 'Selected production order' })
    const card = detail.getByRole('article', {
      name: `Production order ${orderNumber} for ${fixtureBusinesses.A.name}`,
      exact: true,
    })
    await expect(card).toBeVisible()
    await expect(card.getByText(notes, { exact: false })).toBeVisible()
    const item = card.getByRole('article', {
      name: `Production item: ${customerOrderingFixture.productName}`,
      exact: true,
    })
    await expect(item).toBeVisible()
    await expect(amount(item, 'Requested')).toHaveText('3')
    await expect(amount(item, 'Remaining')).toHaveText('3')
    await expect(amount(card, 'Fulfillment progress')).toHaveText('Unresolved')
    await expect(amount(card, 'Order remaining')).toHaveText('3')
    await expect(amount(card, 'Fulfillment condition')).toHaveCount(0)

    // First trusted mutation: RECEIVED -> IN_PROGRESS, exactly once.
    await card.getByRole('button', { name: `Start order #${orderNumber}` }).click()
    const preparedInput = item.getByRole('textbox', {
      name: `Prepare more ${customerOrderingFixture.productName}`,
    })
    await expect(preparedInput).toBeEnabled({ timeout: 20_000 })

    // Invalid input fails locally: neither quantity nor audit may change.
    // Realtime can refresh the selected detail after start_order; verify the
    // intended value survived revalidation before asserting its exact error.
    await expect(status).toBeVisible({ timeout: 20_000 })
    await preparedInput.fill('0.5')
    await expect(preparedInput).toHaveValue('0.5')
    await expect(item.getByRole('button', { name: 'Record prepared' })).toBeEnabled()
    await item.getByRole('button', { name: 'Record prepared' }).click()
    await expect(item.getByRole('alert'))
      .toHaveText('Quantity must be a multiple of the historical quantity step.')
    await expect(amount(item, 'Prepared')).toHaveText('0')

    // Second trusted mutation: +1 prepared. An unrelated Realtime event
    // can temporarily invalidate the queue while another browser is working.
    await expect(status).toBeVisible({ timeout: 20_000 })
    await preparedInput.fill('1')
    const prepareButton = item.getByRole('button', { name: 'Record prepared' })
    await expect(prepareButton).toBeEnabled({ timeout: 20_000 })
    await prepareButton.click()

    // Separate an absent/rejected command from a successful write whose UI
    // detail has not refreshed. These are read-only checks, NOT RPC retries.
    try {
      await expect.poll(async () => {
        const persisted = await admin.from('order_items')
          .select('prepared_quantity').eq('order_id', orderId).single()
        if (persisted.error) throw new Error('Unable to read the persisted prepared quantity.')
        return persisted.data?.prepared_quantity
      }, { timeout: 15_000, message: 'The prepared increment was not persisted by PostgreSQL.' }).toBe(1)
    } catch (error) {
      throw new Error(
        `Prepared command not confirmed in PostgreSQL. UI notices: ${await uiNotices(page)}.`,
        { cause: error },
      )
    }
    try {
      await expect(amount(item, 'Prepared')).toHaveText('1', { timeout: 20_000 })
    } catch (error) {
      throw new Error(
        `PostgreSQL persisted prepared=1, but the selected-order detail did not refresh. UI notices: ${await uiNotices(page)}.`,
        { cause: error },
      )
    }
    await expect(amount(item, 'Remaining')).toHaveText('2')
    await expect(amount(card, 'Fulfillment progress')).toHaveText('Unresolved')
    await expect(amount(card, 'Fulfillment condition')).toHaveCount(0)

    // Missing reason rejected locally; a valid trimmed reason stores +2
    // unavailable and resolves the line without transitioning Order to READY.
    const unavailableInput = item.getByRole('textbox', {
      name: `Unavailable amount for ${customerOrderingFixture.productName}`,
    })
    await expect(unavailableInput).toBeEnabled({ timeout: 20_000 })
    await unavailableInput.fill('2')
    await item.getByRole('button', { name: 'Record unavailable' }).click()
    await expect(item.getByRole('alert'))
      .toHaveText('A reason is required for unavailable quantity.')

    await item.getByRole('textbox', {
      name: `Reason for ${customerOrderingFixture.productName}`,
    }).fill('  Ingredients unavailable  ')
    await expect(status).toBeVisible({ timeout: 20_000 })
    const unavailableButton = item.getByRole('button', { name: 'Record unavailable' })
    await expect(unavailableButton).toBeEnabled({ timeout: 20_000 })
    await unavailableButton.click()
    try {
      await expect.poll(async () => {
        const persisted = await admin.from('order_items')
          .select('unavailable_quantity').eq('order_id', orderId).single()
        if (persisted.error) throw new Error('Unable to read the persisted unavailable quantity.')
        return persisted.data?.unavailable_quantity
      }, { timeout: 15_000, message: 'The unavailable increment was not persisted by PostgreSQL.' }).toBe(2)
    } catch (error) {
      throw new Error(
        `Unavailable command not confirmed in PostgreSQL. UI notices: ${await uiNotices(page)}.`,
        { cause: error },
      )
    }
    await expect(amount(item, 'Unavailable')).toHaveText('2', { timeout: 20_000 })
    await expect(amount(item, 'Remaining')).toHaveText('0')
    await expect(item.getByText('Line fully resolved.')).toBeVisible()
    await expect(amount(card, 'Fulfillment progress')).toHaveText('Resolved')
    await expect(amount(card, 'Fulfillment condition')).toHaveText('PARTIAL')
    await expect(amount(card, 'Order remaining')).toHaveText('0')
    await expect(card.getByText('IN_PROGRESS', { exact: true })).toBeVisible()

    // Status-filter behavior after commands: in-progress remains; received excludes it.
    await page.getByRole('button', { name: 'Back to production queue' }).click()
    await filter.selectOption('IN_PROGRESS')
    await expect(view).toBeVisible({ timeout: 20_000 })
    await filter.selectOption('RECEIVED')
    await expect(status).toBeVisible({ timeout: 20_000 })
    await expect(view).toHaveCount(0)

    // Authoritative persistence + exactly one audit event per successful action.
    const persisted = await admin.from('orders')
      .select('status, started_by_user_id')
      .eq('id', orderId).single()
    expect(persisted.error).toBeNull()
    expect(persisted.data?.status).toBe('IN_PROGRESS')
    expect(persisted.data?.started_by_user_id).toBeTruthy()

    const persistedItem = await admin.from('order_items')
      .select('id, requested_quantity, prepared_quantity, unavailable_quantity, quantity_step_snapshot')
      .eq('order_id', orderId).single()
    expect(persistedItem.error).toBeNull()
    expect(persistedItem.data).toMatchObject({
      requested_quantity: 3,
      prepared_quantity: 1,
      unavailable_quantity: 2,
      quantity_step_snapshot: 1,
    })

    const audit = await admin.from('order_events')
      .select('event_type, actor_user_id, order_item_id, reason, previous_value, new_value, metadata')
      .eq('order_id', orderId)
      .in('event_type', ['PREPARATION_STARTED', 'QUANTITY_PREPARED', 'QUANTITY_UNAVAILABLE'])
    expect(audit.error).toBeNull()
    expect(audit.data).toHaveLength(3)
    const prepared = audit.data?.find((entry) => entry.event_type === 'QUANTITY_PREPARED')
    const unavailable = audit.data?.find((entry) => entry.event_type === 'QUANTITY_UNAVAILABLE')
    const started = audit.data?.find((entry) => entry.event_type === 'PREPARATION_STARTED')
    expect(started).toBeTruthy()
    expect(prepared).toMatchObject({
      order_item_id: persistedItem.data?.id,
      previous_value: { prepared_quantity: 0 },
      new_value: { prepared_quantity: 1 },
      metadata: { quantity_delta: 1 },
    })
    expect(unavailable).toMatchObject({
      order_item_id: persistedItem.data?.id,
      reason: 'Ingredients unavailable',
      previous_value: { unavailable_quantity: 0 },
      new_value: { unavailable_quantity: 2 },
      metadata: { quantity_delta: 2 },
    })
    expect(audit.data?.every((entry) => entry.actor_user_id === persisted.data?.started_by_user_id))
      .toBe(true)

    // M4-008: PARTIAL is eligible for READY only through the trusted SQL RPC.
    // The active queue must drop the Order after authoritative Realtime/refetch.
    await filter.selectOption('IN_PROGRESS')
    await expect(view).toBeVisible({ timeout: 20_000 })
    await expect(status).toBeVisible({ timeout: 20_000 })
    await view.click()
    const ready = card.getByRole('button', { name: `Mark order #${orderNumber} ready` })
    await expect(ready).toBeEnabled({ timeout: 20_000 })
    await ready.click()

    await expect.poll(async () => {
      const result = await admin.from('orders').select('status').eq('id', orderId).single()
      if (result.error) throw new Error('Unable to read the persisted READY status.')
      return result.data?.status
    }, { timeout: 20_000 }).toBe('READY')
    const readyOrder = await admin.from('orders')
      .select('status, ready_at, ready_by_user_id').eq('id', orderId).single()
    expect(readyOrder.error).toBeNull()
    expect(readyOrder.data?.ready_at).toBeTruthy()
    expect(readyOrder.data?.ready_by_user_id).toBe(persisted.data?.started_by_user_id)
    const readyAudit = await admin.from('order_events')
      .select('event_type, actor_user_id, previous_value, new_value, metadata, occurred_at')
      .eq('order_id', orderId).eq('event_type', 'ORDER_READY')
    expect(readyAudit.error).toBeNull()
    expect(readyAudit.data).toHaveLength(1)
    expect(readyAudit.data?.[0]).toMatchObject({
      actor_user_id: readyOrder.data?.ready_by_user_id,
      previous_value: { status: 'IN_PROGRESS' },
      new_value: { status: 'READY' },
      metadata: { fulfillment_condition: 'PARTIAL', prepared_quantity: 1, unavailable_quantity: 2 },
    })
    expect(readyAudit.data?.[0]?.occurred_at).toBe(readyOrder.data?.ready_at)

    // Selected detail may still read READY; the IN_PROGRESS queue cannot.
    await page.getByRole('button', { name: 'Back to production queue' }).click()
    await expect(status).toBeVisible({ timeout: 20_000 })
    await expect(view).toHaveCount(0, { timeout: 20_000 })
  } finally {
    await customerContext.close()
  }
})

test('MANAGER cannot mount the KITCHEN production board', async ({ page }) => {
  await signInThroughUi(page, 'manager')
  await expect(page.getByRole('region', { name: 'Your session' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)
})
