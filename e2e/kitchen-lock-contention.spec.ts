import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'
import { contend, type Command, type Outcome } from './support/pgContention.ts'

/**
 * DB contention is delegated to the shared local-only helper.
 * Existing concurrency HTTP tests separately exercise real JWT sessions.
 * These scenarios retain their original deterministic blocking assertions.
 */

type Role = 'customerA' | 'kitchen'
type Actors = {
  customer: SupabaseBrowserClient
  kitchen: SupabaseBrowserClient
  customerId: string
  kitchenId: string
}

async function signIn(role: Role): Promise<{ client: SupabaseBrowserClient; id: string }> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signInWithPassword(fixtureCredentials(role))
  expect(error, `Cannot sign in ${role}`).toBeNull()
  if (!data.user) throw new Error('Fixture sign-in did not provide a user.')
  return { client, id: data.user.id }
}

async function withActors(body: (actors: Actors) => Promise<void>): Promise<void> {
  const sessions: SupabaseBrowserClient[] = []
  try {
    const customer = await signIn('customerA')
    sessions.push(customer.client)
    const kitchen = await signIn('kitchen')
    sessions.push(kitchen.client)
    await body({
      customer: customer.client, kitchen: kitchen.client,
      customerId: customer.id, kitchenId: kitchen.id,
    })
  } finally {
    await Promise.allSettled(sessions.map((client) => client.auth.signOut({ scope: 'local' })))
  }
}

async function createOrder(actors: Actors, label: string): Promise<{ orderId: string; itemId: string }> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data: orderId, error } = await actors.customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: `M4-010 deterministic ${label}`,
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!orderId) throw new Error('create_order returned no id')
  const loaded = await createSupabaseKitchenOrderQueryGateway(actors.kitchen).loadProductionOrder(orderId)
  expect(loaded?.items).toHaveLength(1)
  if (!loaded) throw new Error('KITCHEN did not load the test Order')
  return { orderId, itemId: loaded.items[0]!.id }
}

async function readState(actors: Actors, orderId: string, itemId: string) {
  const [order, item, events] = await Promise.all([
    actors.kitchen.from('orders').select('status, started_at, cancelled_at, ready_at').eq('id', orderId).single(),
    actors.kitchen.from('order_items').select('requested_quantity, prepared_quantity, unavailable_quantity').eq('id', itemId).single(),
    actors.kitchen.from('order_events').select('event_type, previous_value, new_value, metadata').eq('order_id', orderId),
  ])
  expect(order.error).toBeNull()
  expect(item.error).toBeNull()
  expect(events.error).toBeNull()
  if (!order.data || !item.data || !events.data) throw new Error('Missing persisted test data')
  return { order: order.data, item: item.data, events: events.data }
}

const prepared = (itemId: string, delta: number): Command => ({
  sql: 'SELECT public.record_prepared_quantity($1::uuid, $2::numeric)', args: [itemId, delta],
})
const unavailable = (itemId: string, delta: number): Command => ({
  sql: 'SELECT public.record_unavailable_quantity($1::uuid, $2::numeric, $3::text)',
  args: [itemId, delta, 'M4-010 deterministic shortage'],
})
const start = (orderId: string): Command => ({
  sql: 'SELECT public.start_order($1::uuid)', args: [orderId],
})
const cancel = (orderId: string): Command => ({
  sql: 'SELECT public.cancel_customer_order($1::uuid, $2::text)',
  args: [orderId, 'M4-010 deterministic cancellation'],
})
const ready = (orderId: string): Command => ({
  sql: 'SELECT public.mark_order_ready($1::uuid)', args: [orderId],
})

function expectFirstWins(result: { first: Outcome; second: Outcome }) {
  expect(result.first).toEqual({ ok: true, code: null })
  expect(result.second).toEqual({ ok: false, code: '22023' })
}

const count = (events: { event_type: string }[], event: string) =>
  events.filter((row) => row.event_type === event).length

test.describe('M4-010 — deterministic PostgreSQL row-lock contention', () => {
  test.setTimeout(60_000) // Includes local DB connection setup and lock observation.

  test('A: prepared/prepared serializes and records exactly one increment', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'A')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: prepared(itemId, 2), secondCommand: prepared(itemId, 2),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.item).toMatchObject({ requested_quantity: 3, prepared_quantity: 2, unavailable_quantity: 0 })
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(1)
      expect(state.order.status).toBe('IN_PROGRESS')
    })
  })

  test('B: prepared/unavailable serializes against shared remaining', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'B')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: prepared(itemId, 2), secondCommand: unavailable(itemId, 2),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.item).toMatchObject({ requested_quantity: 3, prepared_quantity: 2, unavailable_quantity: 0 })
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(1)
      expect(count(state.events, 'QUANTITY_UNAVAILABLE')).toBe(0)
    })
  })

  test('C1: final quantity commits before READY; READY succeeds after waiting', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'C1')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expect((await actors.kitchen.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 })).error).toBeNull()
      const result = await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: prepared(itemId, 1), secondCommand: ready(orderId),
      })
      expect(result.first.ok).toBe(true)
      expect(result.second.ok).toBe(true)
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('READY')
      expect(state.order.ready_at).toBeTruthy()
      expect(state.item.prepared_quantity).toBe(3)
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(2)
      expect(count(state.events, 'ORDER_READY')).toBe(1)
    })
  })

  test('C2: READY observes unresolved quantities, rejects; quantity can proceed', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'C2')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expect((await actors.kitchen.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 })).error).toBeNull()
      const result = await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: ready(orderId), secondCommand: prepared(itemId, 1),
        preserveLockOnFailure: true,
      })
      expect(result.first).toEqual({ ok: false, code: '22023' })
      expect(result.second.ok).toBe(true)
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('IN_PROGRESS')
      expect(state.order.ready_at).toBeNull()
      expect(state.item.prepared_quantity).toBe(3)
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(2)
      expect(count(state.events, 'ORDER_READY')).toBe(0)
    })
  })

  test('D1: start commits before customer cancellation, which is rejected', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'D1')
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.customerId,
        firstCommand: start(orderId), secondCommand: cancel(orderId),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('IN_PROGRESS')
      expect(state.order.started_at).toBeTruthy()
      expect(state.order.cancelled_at).toBeNull()
      expect(count(state.events, 'PREPARATION_STARTED')).toBe(1)
      expect(count(state.events, 'ORDER_CANCELLED')).toBe(0)
    })
  })

  test('D2: customer cancellation commits before start, which is rejected', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'D2')
      expectFirstWins(await contend({
        orderId, firstActorId: actors.customerId, secondActorId: actors.kitchenId,
        firstCommand: cancel(orderId), secondCommand: start(orderId),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('CANCELLED')
      expect(state.order.cancelled_at).toBeTruthy()
      expect(state.order.started_at).toBeNull()
      expect(count(state.events, 'ORDER_CANCELLED')).toBe(1)
      expect(count(state.events, 'PREPARATION_STARTED')).toBe(0)
    })
  })

  test('E: double-start is serialized and audited once', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'E')
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: start(orderId), secondCommand: start(orderId),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('IN_PROGRESS')
      expect(count(state.events, 'PREPARATION_STARTED')).toBe(1)
    })
  })
})
