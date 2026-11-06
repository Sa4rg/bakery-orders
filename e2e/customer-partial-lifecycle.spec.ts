import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { customerOrderingFixture, fixtureBusinesses } from './support/fixtures.ts'
import { createLocalAdminClient, resolveLocalSupabaseRuntime } from './support/localSupabase.ts'
import {
  findLifecycleOrderInKitchen, lifecycleAmount, placeLifecycleOrder,
} from './support/lifecycleUi.ts'

/**
 * M5-008: ONE partial-fulfillment journey on ONE real Order. Browser actors
 * perform all writes via trusted commands; admin only reads persisted evidence.
 * M5-006 already owns denial matrices and concurrency. M5-007 owns COMPLETE.
 */
test('M5-008 PARTIAL: 3 requested → 1 prepared + 2 unavailable → READY → DISPATCHED → DELIVERED, with historical reason', async ({ browser, page: kitchen }) => {
  test.setTimeout(210_000)
  const customerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })

  try {
    const admin = createLocalAdminClient(resolveLocalSupabaseRuntime())
    const kitchenConnected = kitchen.getByText('Realtime: connected. Queue up to date.', { exact: true })

    // Both receiving subscriptions must be ready before the first mutation.
    await signInThroughUi(kitchen, 'kitchen')
    await expect(kitchen.getByRole('heading', { name: 'Kitchen production' })).toBeVisible()
    const filter = kitchen.getByRole('combobox', { name: 'Production status filter' })
    await filter.selectOption('RECEIVED')
    await expect(kitchenConnected).toBeVisible({ timeout: 30_000 })

    const customer = await customerContext.newPage()
    await signInThroughUi(customer, 'customerA')
    await expect(customer.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    const trackingConnected = customer.getByText(
      'Realtime: connected. Changes trigger a fresh authorized read.', { exact: true },
    )
    await expect(trackingConnected).toBeVisible({ timeout: 30_000 })

    const notes = `M5-008 partial lifecycle ${randomUUID()}`
    const reason = `M5-008 insufficient ingredients ${randomUUID()}`
    const orderId = await placeLifecycleOrder(customer, notes)
    const saved = await admin.from('orders').select('order_number,status')
      .eq('id', orderId).single()
    expect(saved.error).toBeNull()
    expect(saved.data?.status).toBe('RECEIVED')
    const number = saved.data?.order_number
    if (number == null) throw new Error('Persisted Order has no number.')

    // Realtime, never manual Refresh/reload, must introduce the new Order to KITCHEN.
    const view = kitchen.getByRole('button', { name: `View details for order #${number}` })
    await findLifecycleOrderInKitchen(kitchen, view)

    // Keep the same authorized CUSTOMER detail mounted for all live changes.
    await customer.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await customer.getByRole('button', { name: 'Open tracked order' }).click()
    const customerDetail = customer.getByRole('region', { name: 'Selected customer order' })
    const tracked = customerDetail.getByRole('article', { name: `Tracked order #${number}` })
    const trackedItem = tracked.getByRole('article', {
      name: `Tracked item: ${customerOrderingFixture.productName}`, exact: true,
    })
    await expect(tracked.getByText('RECEIVED', { exact: true })).toBeVisible()
    await expect(trackingConnected).toBeVisible({ timeout: 30_000 })

    await filter.selectOption('ALL_ACTIVE')
    await findLifecycleOrderInKitchen(kitchen, view)
    await view.click()
    const detail = kitchen.getByRole('region', { name: 'Selected production order' })
    const card = detail.getByRole('article', {
      name: `Production order ${number} for ${fixtureBusinesses.A.name}`, exact: true,
    })
    await expect(card.getByText(notes, { exact: false })).toBeVisible()
    const item = card.getByRole('article', {
      name: `Production item: ${customerOrderingFixture.productName}`, exact: true,
    })
    await expect(lifecycleAmount(item, 'Requested')).toHaveText('3')

    await card.getByRole('button', { name: `Start order #${number}` }).click()
    await expect(tracked.getByText('IN_PROGRESS', { exact: true })).toBeVisible({ timeout: 30_000 })

    // Trusted increment #1: 1 prepared. No invented shortage or premature READY.
    await expect(kitchenConnected).toBeVisible({ timeout: 20_000 })
    const prepare = item.getByRole('textbox', {
      name: `Prepare more ${customerOrderingFixture.productName}`,
    })
    await expect(prepare).toBeEnabled({ timeout: 20_000 })
    await prepare.fill('1')
    await item.getByRole('button', { name: 'Record prepared' }).click()
    await expect(lifecycleAmount(trackedItem, 'Requested')).toHaveText('3')
    await expect(lifecycleAmount(trackedItem, 'Prepared')).toHaveText('1', { timeout: 30_000 })
    await expect(lifecycleAmount(trackedItem, 'Unavailable')).toHaveText('0')
    await expect(lifecycleAmount(trackedItem, 'Remaining')).toHaveText('2')
    await expect(tracked.getByText('IN_PROGRESS', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: `Mark order #${number} ready` })).toHaveCount(0)

    // Trusted increment #2: 2 unavailable with a mandatory, server-trimmed
    // historical reason. This must refetch both OrderItems and the projection.
    await expect(kitchenConnected).toBeVisible({ timeout: 20_000 })
    const unavailable = item.getByRole('textbox', {
      name: `Unavailable amount for ${customerOrderingFixture.productName}`,
    })
    await expect(unavailable).toBeEnabled({ timeout: 20_000 })
    await unavailable.fill('2')
    await item.getByRole('textbox', {
      name: `Reason for ${customerOrderingFixture.productName}`,
    }).fill(`  ${reason}  `)
    await item.getByRole('button', { name: 'Record unavailable' }).click()

    await expect(lifecycleAmount(trackedItem, 'Prepared')).toHaveText('1', { timeout: 30_000 })
    await expect(lifecycleAmount(trackedItem, 'Unavailable')).toHaveText('2', { timeout: 30_000 })
    await expect(lifecycleAmount(trackedItem, 'Remaining')).toHaveText('0')
    const shortages = trackedItem.getByRole('region', {
      name: `Shortage reasons for ${customerOrderingFixture.productName}`,
    })
    await expect(shortages.getByText(reason, { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(shortages.getByText(reason, { exact: true })).toHaveCount(1)
    const projectedReasonTime = await shortages.locator('time').getAttribute('datetime')
    expect(projectedReasonTime).toBeTruthy()
    await expect(shortages.getByText('No historical shortage reason was returned for this item.'))
      .toHaveCount(0)
    await expect(lifecycleAmount(card, 'Fulfillment condition')).toHaveText('PARTIAL')
    await expect(lifecycleAmount(card, 'Order remaining')).toHaveText('0')

    // M4 allows PARTIAL READY only when all quantities are resolved and some
    // quantity was actually prepared. The browser requests each command once.
    await expect(kitchenConnected).toBeVisible({ timeout: 20_000 })
    const ready = card.getByRole('button', { name: `Mark order #${number} ready` })
    await expect(ready).toBeEnabled({ timeout: 20_000 })
    await ready.click()
    await expect(tracked.getByText('READY', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(lifecycleAmount(trackedItem, 'Prepared')).toHaveText('1')
    await expect(lifecycleAmount(trackedItem, 'Unavailable')).toHaveText('2')
    await expect(shortages.getByText(reason, { exact: true })).toBeVisible()

    await kitchen.getByRole('button', { name: 'Back to production queue' }).click()
    await filter.selectOption('READY')
    await findLifecycleOrderInKitchen(kitchen, view)
    await view.click()
    const readyCard = detail.getByRole('article', {
      name: `Production order ${number} for ${fixtureBusinesses.A.name}`, exact: true,
    })
    await expect(lifecycleAmount(readyCard, 'Fulfillment condition')).toHaveText('PARTIAL')
    await readyCard.getByRole('button', { name: `Dispatch order #${number}` }).click()
    const beforeDispatch = await admin.from('orders').select('status').eq('id', orderId).single()
    expect(beforeDispatch.error).toBeNull()
    expect(beforeDispatch.data?.status).toBe('READY')
    await readyCard.getByRole('button', { name: `Confirm dispatch order #${number}` }).click()
    await expect(tracked.getByText('DISPATCHED', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(shortages.getByText(reason, { exact: true })).toBeVisible()

    const receipt = tracked.getByRole('region', { name: `Receipt confirmation for order #${number}` })
    await receipt.getByRole('button', { name: `Confirm receipt for order #${number}` }).click()
    const beforeReceipt = await admin.from('orders').select('status').eq('id', orderId).single()
    expect(beforeReceipt.error).toBeNull()
    expect(beforeReceipt.data?.status).toBe('DISPATCHED')
    await receipt.getByRole('button', { name: `Yes, received order #${number}` }).click()
    await expect(tracked.getByText('DELIVERED', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(receipt).toHaveCount(0)
    await expect(shortages.getByText(reason, { exact: true })).toBeVisible()

    // Final authoritative read. Exactly seven events (one extra shortage vs
    // M5-007), same actor attribution, server timestamps, and no quantity loss.
    const order = await admin.from('orders').select(
      'status,created_by_user_id,started_by_user_id,started_at,ready_by_user_id,ready_at,dispatched_by_user_id,dispatched_at,delivered_by_user_id,delivered_at,cancelled_at',
    ).eq('id', orderId).single()
    expect(order.error).toBeNull()
    expect(order.data?.status).toBe('DELIVERED')
    expect(order.data?.cancelled_at).toBeNull()
    expect(order.data?.created_by_user_id).toBeTruthy()
    expect(order.data?.started_by_user_id).toBeTruthy()
    expect(order.data?.ready_by_user_id).toBe(order.data?.started_by_user_id)
    expect(order.data?.dispatched_by_user_id).toBe(order.data?.started_by_user_id)
    expect(order.data?.delivered_by_user_id).toBe(order.data?.created_by_user_id)
    for (const field of ['started_at', 'ready_at', 'dispatched_at', 'delivered_at'] as const) {
      expect(order.data?.[field]).toBeTruthy()
    }

    const savedItem = await admin.from('order_items')
      .select('id,requested_quantity,prepared_quantity,unavailable_quantity')
      .eq('order_id', orderId).single()
    expect(savedItem.error).toBeNull()
    expect(savedItem.data).toMatchObject({
      requested_quantity: 3, prepared_quantity: 1, unavailable_quantity: 2,
    })

    const events = await admin.from('order_events')
      .select('event_type,actor_user_id,order_item_id,reason,metadata,occurred_at')
      .eq('order_id', orderId).order('occurred_at', { ascending: true })
    expect(events.error).toBeNull()
    expect(events.data?.map((row) => row.event_type)).toEqual([
      'ORDER_CREATED', 'PREPARATION_STARTED', 'QUANTITY_PREPARED',
      'QUANTITY_UNAVAILABLE', 'ORDER_READY', 'ORDER_DISPATCHED', 'ORDER_DELIVERED',
    ])
    const audit = events.data ?? []
    expect(audit[0]?.actor_user_id).toBe(order.data?.created_by_user_id)
    for (const index of [1, 2, 3, 4, 5]) {
      expect(audit[index]?.actor_user_id).toBe(order.data?.started_by_user_id)
    }
    expect(audit[6]?.actor_user_id).toBe(order.data?.delivered_by_user_id)
    expect(audit[3]).toMatchObject({
      order_item_id: savedItem.data?.id, reason, metadata: { quantity_delta: 2 },
    })
    // The CUSTOMER projection comes from the same historical SQL event.
    expect(new Date(projectedReasonTime!).getTime())
      .toBe(new Date(audit[3]!.occurred_at).getTime())
    expect(audit[4]?.metadata).toMatchObject({
      fulfillment_condition: 'PARTIAL', prepared_quantity: 1, unavailable_quantity: 2,
    })
    for (const [index, field] of [
      [1, 'started_at'], [4, 'ready_at'], [5, 'dispatched_at'], [6, 'delivered_at'],
    ] as const) {
      expect(audit[index]?.occurred_at).toBe(order.data?.[field])
    }
    const times = audit.map((row) => new Date(row.occurred_at).getTime())
    expect(times.every((time, index) => index === 0 || time >= times[index - 1]!)).toBe(true)

    // DELIVERED is absent from the active list, but authorized access by UUID
    // survives a real reload, including historical reason and all quantities.
    await customer.reload()
    await expect(customer.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await customer.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await customer.getByRole('button', { name: 'Open tracked order' }).click()
    const historical = customer.getByRole('article', { name: `Tracked order #${number}` })
    const historicalItem = historical.getByRole('article', {
      name: `Tracked item: ${customerOrderingFixture.productName}`, exact: true,
    })
    await expect(historical.getByText('DELIVERED', { exact: true })).toBeVisible()
    await expect(lifecycleAmount(historicalItem, 'Requested')).toHaveText('3')
    await expect(lifecycleAmount(historicalItem, 'Prepared')).toHaveText('1')
    await expect(lifecycleAmount(historicalItem, 'Unavailable')).toHaveText('2')
    await expect(lifecycleAmount(historicalItem, 'Remaining')).toHaveText('0')
    await expect(historicalItem.getByRole('region', {
      name: `Shortage reasons for ${customerOrderingFixture.productName}`,
    }).getByText(reason, { exact: true })).toBeVisible()
    await expect(customer.getByRole('button', { name: `Confirm receipt for order #${number}` })).toHaveCount(0)
  } finally {
    await customerContext.close()
  }
})
