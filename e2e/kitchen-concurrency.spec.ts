import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'kitchen'
type RpcResult = { error: { code?: string } | null }

async function signIn(role: Actor): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(role))
  expect(error, `Cannot sign in ${role}`).toBeNull()
  return client
}

async function newOrder(customer: SupabaseBrowserClient, label: string) {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: `M4-010 ${label}`,
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!data) throw new Error('create_order returned no Order id')
  return data
}

async function itemIdFor(kitchen: SupabaseBrowserClient, orderId: string) {
  const order = await createSupabaseKitchenOrderQueryGateway(kitchen).loadProductionOrder(orderId)
  expect(order?.items).toHaveLength(1)
  if (!order) throw new Error('KITCHEN cannot read created Order')
  return order.items[0]!.id
}

async function loadItem(kitchen: SupabaseBrowserClient, itemId: string) {
  const result = await kitchen.from('order_items')
    .select('requested_quantity, prepared_quantity, unavailable_quantity')
    .eq('id', itemId).single()
  expect(result.error).toBeNull()
  if (!result.data) throw new Error('Missing persisted OrderItem')
  return result.data
}

async function loadOrder(kitchen: SupabaseBrowserClient, orderId: string) {
  const result = await kitchen.from('orders')
    .select('status, started_at, started_by_user_id, cancelled_at, cancelled_by_user_id, ready_at, ready_by_user_id')
    .eq('id', orderId).single()
  expect(result.error).toBeNull()
  if (!result.data) throw new Error('Missing persisted Order')
  return result.data
}

async function loadEvents(kitchen: SupabaseBrowserClient, orderId: string) {
  const result = await kitchen.from('order_events')
    .select('event_type, actor_user_id, previous_value, new_value, metadata, occurred_at')
    .eq('order_id', orderId).order('occurred_at', { ascending: true })
  expect(result.error).toBeNull()
  if (!result.data) throw new Error('Missing audit result')
  return result.data
}

function expectExactlyOneSuccess(left: RpcResult, right: RpcResult) {
  const successes = [left, right].filter((r) => r.error === null)
  const failures = [left, right].filter((r) => r.error !== null)
  expect(successes).toHaveLength(1)
  expect(failures).toHaveLength(1)
  expect(failures[0]?.error?.code).toBe('22023')
}

async function withClients(
  body: (clients: { customer: SupabaseBrowserClient; kitchenA: SupabaseBrowserClient; kitchenB: SupabaseBrowserClient }) => Promise<void>,
) {
  const clients: SupabaseBrowserClient[] = []
  try {
    const customer = await signIn('customerA')
    clients.push(customer)
    const kitchenA = await signIn('kitchen')
    clients.push(kitchenA)
    const kitchenB = await signIn('kitchen')
    clients.push(kitchenB)
    await body({ customer, kitchenA, kitchenB })
  } finally {
    await Promise.allSettled(clients.map((client) => client.auth.signOut({ scope: 'local' })))
  }
}

test.describe('M4-010 — concurrent authenticated production commands', () => {
  test('A: prepared/prepared increments cannot exceed remaining or double-audit', async () => {
    await withClients(async ({ customer, kitchenA, kitchenB }) => {
      const orderId = await newOrder(customer, 'prepared/prepared')
      const itemId = await itemIdFor(kitchenA, orderId)
      expect((await kitchenA.rpc('start_order', { p_order_id: orderId })).error).toBeNull()

      const [a, b] = await Promise.all([
        kitchenA.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 }),
        kitchenB.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 }),
      ])
      expectExactlyOneSuccess(a, b)
      expect(await loadItem(kitchenA, itemId)).toMatchObject({
        requested_quantity: 3, prepared_quantity: 2, unavailable_quantity: 0,
      })
      const events = (await loadEvents(kitchenA, orderId)).filter((e) => e.event_type === 'QUANTITY_PREPARED')
      expect(events).toHaveLength(1)
      expect(events[0]?.metadata).toMatchObject({ quantity_delta: 2 })
      expect(events[0]?.previous_value).toMatchObject({ prepared_quantity: 0 })
      expect(events[0]?.new_value).toMatchObject({ prepared_quantity: 2 })
    })
  })

  test('B: prepared/unavailable cannot jointly consume more than remaining', async () => {
    await withClients(async ({ customer, kitchenA, kitchenB }) => {
      const orderId = await newOrder(customer, 'prepared/unavailable')
      const itemId = await itemIdFor(kitchenA, orderId)
      expect((await kitchenA.rpc('start_order', { p_order_id: orderId })).error).toBeNull()

      const [prepared, unavailable] = await Promise.all([
        kitchenA.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 }),
        kitchenB.rpc('record_unavailable_quantity', { p_order_item_id: itemId, p_quantity: 2, p_reason: 'M4-010 shortage' }),
      ])
      expectExactlyOneSuccess(prepared, unavailable)
      const stored = await loadItem(kitchenA, itemId)
      expect(stored.prepared_quantity + stored.unavailable_quantity).toBe(2)
      expect([stored.prepared_quantity, stored.unavailable_quantity].sort()).toEqual([0, 2])
      const events = (await loadEvents(kitchenA, orderId))
        .filter((e) => e.event_type === 'QUANTITY_PREPARED' || e.event_type === 'QUANTITY_UNAVAILABLE')
      expect(events).toHaveLength(1)
      expect(events[0]?.event_type).toBe(prepared.error === null ? 'QUANTITY_PREPARED' : 'QUANTITY_UNAVAILABLE')
      expect((await loadOrder(kitchenA, orderId)).status).toBe('IN_PROGRESS')
    })
  })

  test('C: quantity/READY preserves a serializable result and audit order', async () => {
    await withClients(async ({ customer, kitchenA, kitchenB }) => {
      const orderId = await newOrder(customer, 'quantity/READY')
      const itemId = await itemIdFor(kitchenA, orderId)
      expect((await kitchenA.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expect((await kitchenA.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 })).error).toBeNull()

      // READY racing with the last incremental quantity has two valid outcomes:
      // READY reads unresolved and rejects; or quantity commits first and READY succeeds.
      const [quantity, ready] = await Promise.all([
        kitchenA.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 1 }),
        kitchenB.rpc('mark_order_ready', { p_order_id: orderId }),
      ])
      expect(quantity.error).toBeNull()
      if (ready.error !== null) expect(ready.error.code).toBe('22023')

      expect(await loadItem(kitchenA, itemId)).toMatchObject({
        requested_quantity: 3, prepared_quantity: 3, unavailable_quantity: 0,
      })
      const order = await loadOrder(kitchenA, orderId)
      expect(order.status).toBe(ready.error === null ? 'READY' : 'IN_PROGRESS')
      expect(Boolean(order.ready_at)).toBe(ready.error === null)
      const events = await loadEvents(kitchenA, orderId)
      const prepared = events.filter((e) => e.event_type === 'QUANTITY_PREPARED')
      const readyEvents = events.filter((e) => e.event_type === 'ORDER_READY')
      expect(prepared).toHaveLength(2)
      expect(readyEvents).toHaveLength(ready.error === null ? 1 : 0)
      if (ready.error === null) {
        expect(readyEvents[0]?.occurred_at).toBe(order.ready_at)
        expect(readyEvents[0]?.metadata).toMatchObject({ fulfillment_condition: 'COMPLETE', prepared_quantity: 3 })
        expect(new Date(readyEvents[0]!.occurred_at).getTime())
          .toBeGreaterThanOrEqual(new Date(prepared[1]!.occurred_at).getTime())
      }
    })
  })

  test('D: start/CUSTOMER cancellation produces exactly one terminal decision', async () => {
    await withClients(async ({ customer, kitchenA }) => {
      const orderId = await newOrder(customer, 'start/customer-cancel')
      const [started, cancelled] = await Promise.all([
        kitchenA.rpc('start_order', { p_order_id: orderId }),
        customer.rpc('cancel_customer_order', { p_order_id: orderId, p_reason: 'Customer changed plans' }),
      ])
      expectExactlyOneSuccess(started, cancelled)
      const order = await loadOrder(kitchenA, orderId)
      const events = (await loadEvents(kitchenA, orderId))
        .filter((e) => e.event_type === 'PREPARATION_STARTED' || e.event_type === 'ORDER_CANCELLED')
      expect(events).toHaveLength(1)
      if (started.error === null) {
        expect(order).toMatchObject({ status: 'IN_PROGRESS', cancelled_at: null, cancelled_by_user_id: null })
        expect(order.started_at).toBeTruthy()
        expect(events[0]?.event_type).toBe('PREPARATION_STARTED')
      } else {
        expect(order).toMatchObject({ status: 'CANCELLED', started_at: null, started_by_user_id: null })
        expect(order.cancelled_at).toBeTruthy()
        expect(events[0]?.event_type).toBe('ORDER_CANCELLED')
      }
      expect(order.ready_at).toBeNull()
    })
  })

  test('E: double-start has exactly one winner and one PREPARATION_STARTED', async () => {
    await withClients(async ({ customer, kitchenA, kitchenB }) => {
      const orderId = await newOrder(customer, 'double-start')
      const [a, b] = await Promise.all([
        kitchenA.rpc('start_order', { p_order_id: orderId }),
        kitchenB.rpc('start_order', { p_order_id: orderId }),
      ])
      expectExactlyOneSuccess(a, b)
      const order = await loadOrder(kitchenA, orderId)
      expect(order.status).toBe('IN_PROGRESS')
      expect(order.started_at).toBeTruthy()
      expect(order.cancelled_at).toBeNull()
      expect((await loadEvents(kitchenA, orderId))
        .filter((e) => e.event_type === 'PREPARATION_STARTED')).toHaveLength(1)
    })
  })
})
