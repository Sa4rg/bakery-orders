import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials, type FixtureKey } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

async function login(key: FixtureKey): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(key))
  expect(error).toBeNull()
  return client
}

async function newOrder(customer: SupabaseBrowserClient): Promise<string> {
  const delivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_idempotency_key: randomUUID(),
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-004 trusted dispatch E2E',
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!data) throw new Error('Unable to create dispatch fixture Order')
  return data
}

async function prepareReady(kitchen: SupabaseBrowserClient, orderId: string, partial: boolean) {
  const command = createSupabaseKitchenProductionCommandGateway(kitchen)
  const query = createSupabaseKitchenOrderQueryGateway(kitchen)
  const order = await query.loadProductionOrder(orderId)
  if (!order || order.items.length !== 1) throw new Error('Missing KITCHEN fixture Order')
  const itemId = order.items[0]!.id
  await command.startOrder(orderId)
  await command.recordPreparedQuantity(itemId, partial ? 1000 : 3000)
  if (partial) await command.recordUnavailableQuantity(itemId, 2000, 'M5-004 partial shortage')
  await command.markOrderReady(orderId)
  return itemId
}

for (const partial of [false, true]) {
  test(`M5-004 real JWT ${partial ? 'PARTIAL' : 'COMPLETE'} dispatch is trusted and audited once`, async () => {
    const customer = await login('customerA')
    const kitchen = await login('kitchen')
    const manager = await login('manager')
    try {
      const id = await newOrder(customer)
      // State precondition: READY cannot be bypassed.
      expect((await kitchen.rpc('dispatch_order', { p_order_id: id })).error?.code).toBe('22023')
      const itemId = await prepareReady(kitchen, id, partial)
      for (const actor of [customer, manager]) {
        expect((await actor.rpc('dispatch_order', { p_order_id: id })).error?.code).toBe('42501')
      }

      const command = createSupabaseKitchenProductionCommandGateway(kitchen)
      await expect(command.dispatchOrder(id)).resolves.toBeUndefined()
      const retry = await kitchen.rpc('dispatch_order', { p_order_id: id })
      expect(retry.error?.code).toBe('22023')

      const saved = await kitchen.from('orders')
        .select('status, dispatched_at, dispatched_by_user_id, updated_at, ready_at')
        .eq('id', id).single()
      expect(saved.error).toBeNull()
      expect(saved.data?.status).toBe('DISPATCHED')
      expect(saved.data?.dispatched_at).toBeTruthy()
      expect(saved.data?.updated_at).toBe(saved.data?.dispatched_at)
      expect(saved.data?.ready_at).toBeTruthy()
      const { data: user, error: userError } = await kitchen.auth.getUser()
      expect(userError).toBeNull()
      expect(saved.data?.dispatched_by_user_id).toBe(user.user?.id)

      const events = await kitchen.from('order_events')
        .select('event_type, order_item_id, actor_user_id, previous_value, new_value, occurred_at, metadata')
        .eq('order_id', id).eq('event_type', 'ORDER_DISPATCHED')
      expect(events.error).toBeNull()
      expect(events.data).toHaveLength(1)
      expect(events.data?.[0]).toMatchObject({
        event_type: 'ORDER_DISPATCHED',
        order_item_id: null,
        actor_user_id: user.user?.id,
        previous_value: { status: 'READY' },
        new_value: { status: 'DISPATCHED' },
        metadata: {},
        occurred_at: saved.data?.dispatched_at,
      })
      const item = await kitchen.from('order_items')
        .select('prepared_quantity, unavailable_quantity').eq('id', itemId).single()
      expect(item.error).toBeNull()
      expect(item.data?.prepared_quantity).toBe(partial ? 1 : 3)
      expect(item.data?.unavailable_quantity).toBe(partial ? 2 : 0)

      // Customer sees authoritative state through M5-001 Tracking (not audit).
      const tracking = await customer.from('orders').select('status').eq('id', id).single()
      expect(tracking.data?.status).toBe('DISPATCHED')
    } finally {
      await Promise.allSettled([customer, kitchen, manager].map((client) =>
        client.auth.signOut({ scope: 'local' })))
    }
  })
}

test('M5-004 two concurrent dispatch requests serialize: one success and one audit event', async () => {
  const customer = await login('customerA')
  const kitchenA = await login('kitchen')
  const kitchenB = await login('kitchen')
  try {
    const id = await newOrder(customer)
    await prepareReady(kitchenA, id, false)
    const attempts = await Promise.all([
      kitchenA.rpc('dispatch_order', { p_order_id: id }),
      kitchenB.rpc('dispatch_order', { p_order_id: id }),
    ])
    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1)
    expect(attempts.filter(({ error }) => error?.code === '22023')).toHaveLength(1)

    const saved = await kitchenA.from('orders')
      .select('status, dispatched_at, dispatched_by_user_id').eq('id', id).single()
    expect(saved.error).toBeNull()
    expect(saved.data?.status).toBe('DISPATCHED')
    const audit = await kitchenA.from('order_events')
      .select('occurred_at, actor_user_id').eq('order_id', id).eq('event_type', 'ORDER_DISPATCHED')
    expect(audit.error).toBeNull()
    expect(audit.data).toHaveLength(1)
    expect(audit.data?.[0]?.occurred_at).toBe(saved.data?.dispatched_at)
    expect(audit.data?.[0]?.actor_user_id).toBe(saved.data?.dispatched_by_user_id)
  } finally {
    await Promise.allSettled([customer, kitchenA, kitchenB].map((client) =>
      client.auth.signOut({ scope: 'local' })))
  }
})
