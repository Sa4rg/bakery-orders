import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { customerOrderingFixture, fixtureBusinesses } from './support/fixtures.ts'
import { createLocalAdminClient, resolveLocalSupabaseRuntime } from './support/localSupabase.ts'
import {
  findLifecycleOrderInKitchen, lifecycleAmount, placeLifecycleOrder,
} from './support/lifecycleUi.ts'

/**
 * M5-007: the same Order crosses both real browser roles and the complete
 * trusted lifecycle. Admin is used ONLY for read-side persisted assertions;
 * all mutations are performed once using the actual CUSTOMER/KITCHEN UIs.
 */
test('M5-007 COMPLETE: CUSTOMER → Realtime KITCHEN → READY → DISPATCHED → Realtime CUSTOMER → DELIVERED', async ({ browser, page: kitchen }) => {
  test.setTimeout(180_000)
  const customerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })

  try {
    const admin = createLocalAdminClient(resolveLocalSupabaseRuntime())
    const kitchenConnected = kitchen.getByText('Realtime: connected. Queue up to date.', { exact: true })

    // Establish the receiving KITCHEN subscription BEFORE CUSTOMER creates.
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

    const notes = `M5-007 lifecycle ${randomUUID()}`
    const orderId = await placeLifecycleOrder(customer, notes)
    const savedNumber = await admin.from('orders').select('order_number,status')
      .eq('id', orderId).single()
    expect(savedNumber.error).toBeNull()
    expect(savedNumber.data?.status).toBe('RECEIVED')
    const number = savedNumber.data?.order_number
    if (number == null) throw new Error('Persisted Order has no number.')

    // The KITCHEN order must arrive via Realtime, without reload or refresh.
    const view = kitchen.getByRole('button', { name: `View details for order #${number}` })
    await findLifecycleOrderInKitchen(kitchen, view)

    // Keep CUSTOMER tracking open for the whole production/dispatch journey.
    await customer.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await customer.getByRole('button', { name: 'Open tracked order' }).click()
    const customerDetail = customer.getByRole('region', { name: 'Selected customer order' })
    const tracked = customerDetail.getByRole('article', { name: `Tracked order #${number}` })
    await expect(tracked.getByText('RECEIVED', { exact: true })).toBeVisible()
    await expect(trackingConnected).toBeVisible({ timeout: 30_000 })

    // ALL_ACTIVE retains the Order after the start transition; RECEIVED would
    // remove it and could invalidate our selected KITCHEN card.
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

    // Production writes happen ONCE through KITCHEN UI; Realtime refetches
    // the selected CUSTOMER detail after each relevant persisted change.
    await card.getByRole('button', { name: `Start order #${number}` }).click()
    await expect(tracked.getByText('IN_PROGRESS', { exact: true })).toBeVisible({ timeout: 30_000 })
    const prepare = item.getByRole('textbox', {
      name: `Prepare more ${customerOrderingFixture.productName}`,
    })
    await expect(prepare).toBeEnabled({ timeout: 20_000 })
    await expect(kitchenConnected).toBeVisible({ timeout: 20_000 })
    await prepare.fill('3')
    await item.getByRole('button', { name: 'Record prepared' }).click()
    const trackedItem = tracked.getByRole('article', {
      name: `Tracked item: ${customerOrderingFixture.productName}`, exact: true,
    })
    await expect(lifecycleAmount(trackedItem, 'Prepared')).toHaveText('3', { timeout: 30_000 })
    await expect(lifecycleAmount(trackedItem, 'Unavailable')).toHaveText('0')
    await expect(lifecycleAmount(trackedItem, 'Remaining')).toHaveText('0')
    await expect(tracked.getByText('No unavailable quantities recorded.')).toBeVisible()
    await expect(lifecycleAmount(card, 'Fulfillment condition')).toHaveText('COMPLETE')

    await expect(kitchenConnected).toBeVisible({ timeout: 20_000 })
    const ready = card.getByRole('button', { name: `Mark order #${number} ready` })
    await expect(ready).toBeEnabled({ timeout: 20_000 })
    await ready.click()
    await expect(tracked.getByText('READY', { exact: true })).toBeVisible({ timeout: 30_000 })

    // READY exits ALL_ACTIVE, but is visible in the explicit dispatch queue.
    await kitchen.getByRole('button', { name: 'Back to production queue' }).click()
    await filter.selectOption('READY')
    await findLifecycleOrderInKitchen(kitchen, view)
    await view.click()
    const readyCard = detail.getByRole('article', {
      name: `Production order ${number} for ${fixtureBusinesses.A.name}`, exact: true,
    })
    await expect(readyCard.getByText('READY', { exact: true })).toBeVisible()
    await readyCard.getByRole('button', { name: `Dispatch order #${number}` }).click()
    const beforeDispatch = await admin.from('orders').select('status').eq('id', orderId).single()
    expect(beforeDispatch.error).toBeNull()
    expect(beforeDispatch.data?.status).toBe('READY') // First click was read-only.
    await readyCard.getByRole('button', { name: `Confirm dispatch order #${number}` }).click()
    await expect(tracked.getByText('DISPATCHED', { exact: true })).toBeVisible({ timeout: 30_000 })

    const receipt = tracked.getByRole('region', { name: `Receipt confirmation for order #${number}` })
    await receipt.getByRole('button', { name: `Confirm receipt for order #${number}` }).click()
    const beforeReceipt = await admin.from('orders').select('status').eq('id', orderId).single()
    expect(beforeReceipt.error).toBeNull()
    expect(beforeReceipt.data?.status).toBe('DISPATCHED') // First click was read-only.
    await receipt.getByRole('button', { name: `Yes, received order #${number}` }).click()
    await expect(tracked.getByText('DELIVERED', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(receipt).toHaveCount(0)

    // One authoritative final read: persisted terminal state, exact quantities,
    // a single ordered event sequence and actors/timestamps from PostgreSQL.
    const order = await admin.from('orders').select(
      'status, created_by_user_id, started_by_user_id, started_at, ready_by_user_id, ready_at, dispatched_by_user_id, dispatched_at, delivered_by_user_id, delivered_at, cancelled_at',
    ).eq('id', orderId).single()
    expect(order.error).toBeNull()
    expect(order.data?.status).toBe('DELIVERED')
    expect(order.data?.cancelled_at).toBeNull()
    for (const field of ['started_at', 'ready_at', 'dispatched_at', 'delivered_at'] as const) {
      expect(order.data?.[field]).toBeTruthy()
    }
    expect(order.data?.created_by_user_id).toBeTruthy()
    expect(order.data?.started_by_user_id).toBeTruthy()
    expect(order.data?.dispatched_by_user_id).toBeTruthy()
    expect(order.data?.delivered_by_user_id).toBeTruthy()
    expect(order.data?.started_by_user_id).toBe(order.data?.ready_by_user_id)
    expect(order.data?.started_by_user_id).toBe(order.data?.dispatched_by_user_id)
    expect(order.data?.delivered_by_user_id).toBe(order.data?.created_by_user_id)
    expect(order.data?.delivered_by_user_id).not.toBe(order.data?.dispatched_by_user_id)

    const amounts = await admin.from('order_items')
      .select('requested_quantity,prepared_quantity,unavailable_quantity')
      .eq('order_id', orderId).single()
    expect(amounts.error).toBeNull()
    expect(amounts.data).toMatchObject({ requested_quantity: 3, prepared_quantity: 3, unavailable_quantity: 0 })

    const events = await admin.from('order_events')
      .select('event_type,actor_user_id,occurred_at').eq('order_id', orderId)
      .order('occurred_at', { ascending: true })
    expect(events.error).toBeNull()
    expect(events.data?.map(({ event_type }) => event_type)).toEqual([
      'ORDER_CREATED', 'PREPARATION_STARTED', 'QUANTITY_PREPARED',
      'ORDER_READY', 'ORDER_DISPATCHED', 'ORDER_DELIVERED',
    ])
    const eventRows = events.data ?? []
    expect(eventRows[0]?.actor_user_id).toBe(order.data?.created_by_user_id)
    for (const [index, actorField, timeField] of [
      [1, 'started_by_user_id', 'started_at'],
      [2, 'started_by_user_id', null],
      [3, 'ready_by_user_id', 'ready_at'],
      [4, 'dispatched_by_user_id', 'dispatched_at'],
      [5, 'delivered_by_user_id', 'delivered_at'],
    ] as const) {
      expect(eventRows[index]?.actor_user_id).toBe(order.data?.[actorField])
      if (timeField) expect(eventRows[index]?.occurred_at).toBe(order.data?.[timeField])
    }
    const times = eventRows.map(({ occurred_at }) => new Date(occurred_at).getTime())
    expect(times.every((time, index) => index === 0 || time >= times[index - 1]!)).toBe(true)

    // The terminal state remains accessible by authorized ID after reload.
    await customer.reload()
    await expect(customer.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await customer.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await customer.getByRole('button', { name: 'Open tracked order' }).click()
    await expect(customer.getByRole('article', { name: `Tracked order #${number}` })
      .getByText('DELIVERED', { exact: true })).toBeVisible()
    await expect(customer.getByRole('button', { name: `Confirm receipt for order #${number}` })).toHaveCount(0)
  } finally {
    await customerContext.close()
  }
})
