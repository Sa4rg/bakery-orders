import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/orders/data/createSupabaseKitchenProductionCommandGateway.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/orders/data/createSupabaseKitchenOrderQueryGateway.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
  fixtureCredentials,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'kitchen' | 'manager'

/** JWT-authenticated clients only. No privileged key is used by this test. */
async function signedInClient(actor: Actor): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(actor))
  expect(error, `Unable to sign in as ${actor}`).toBeNull()
  return client
}

async function createFixtureOrder(customer: SupabaseBrowserClient): Promise<string> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'E2E M4-003 start_order',
    p_idempotency_key: randomUUID(),
    p_items: [{
      product_id: customerOrderingFixture.productId,
      requested_quantity: 2,
    }],
  })
  expect(error, 'Failed to create test Order via trusted CUSTOMER command').toBeNull()
  expect(data).toBeTruthy()
  return data!
}

test('KITCHEN starts a persisted RECEIVED Order, audits exactly once and excludes unauthorized actors', async () => {
  test.setTimeout(60_000)

  const customer = await signedInClient('customerA')
  const kitchen = await signedInClient('kitchen')
  const manager = await signedInClient('manager')

  try {
    const orderId = await createFixtureOrder(customer)
    const query = createSupabaseKitchenOrderQueryGateway(kitchen)
    const command = createSupabaseKitchenProductionCommandGateway(kitchen)

    const before = await query.loadProductionOrder(orderId)
    expect(before?.status).toBe('RECEIVED')
    expect(before?.items).toHaveLength(1)

    // Backend authorization must reject other roles even with a real Order ID.
    const customerDenial = await customer.rpc('start_order', { p_order_id: orderId })
    expect(customerDenial.error?.code).toBe('42501')
    const managerDenial = await manager.rpc('start_order', { p_order_id: orderId })
    expect(managerDenial.error?.code).toBe('42501')

    const preStartEvents = await kitchen.from('order_events')
      .select('id').eq('order_id', orderId).eq('event_type', 'PREPARATION_STARTED')
    expect(preStartEvents.error).toBeNull()
    expect(preStartEvents.data).toEqual([])

    // The application adapter calls the actual SECURITY DEFINER RPC.
    await expect(command.startOrder(orderId)).resolves.toBeUndefined()
    const after = await query.loadProductionOrder(orderId)
    expect(after?.status).toBe('IN_PROGRESS')
    expect(after?.items).toEqual(before?.items)

    const { data: userData, error: userError } = await kitchen.auth.getUser()
    expect(userError).toBeNull()
    expect(userData.user?.id).toBeTruthy()

    const orderResult = await kitchen.from('orders')
      .select('status, started_at, started_by_user_id, updated_at')
      .eq('id', orderId).single()
    expect(orderResult.error).toBeNull()
    expect(orderResult.data?.status).toBe('IN_PROGRESS')
    expect(orderResult.data?.started_by_user_id).toBe(userData.user?.id)
    expect(orderResult.data?.started_at).toBeTruthy()
    expect(orderResult.data?.updated_at).toBe(orderResult.data?.started_at)

    const eventResult = await kitchen.from('order_events')
      .select('order_id, actor_user_id, event_type, occurred_at, previous_value, new_value, reason, order_item_id')
      .eq('order_id', orderId).eq('event_type', 'PREPARATION_STARTED')
    expect(eventResult.error).toBeNull()
    expect(eventResult.data).toHaveLength(1)
    const event = eventResult.data?.[0]
    expect(event?.actor_user_id).toBe(userData.user?.id)
    expect(event?.occurred_at).toBe(orderResult.data?.started_at)
    expect(event?.previous_value).toEqual({ status: 'RECEIVED' })
    expect(event?.new_value).toEqual({ status: 'IN_PROGRESS' })
    expect(event?.reason).toBeNull()
    expect(event?.order_item_id).toBeNull()

    // A second start and the old CUSTOMER cancellation must both fail.
    await expect(command.startOrder(orderId)).rejects.toThrow(
      'Unable to start order preparation.',
    )
    const cancellation = await customer.rpc('cancel_customer_order', {
      p_order_id: orderId,
      p_reason: 'Too late: preparation has begun.',
    })
    expect(cancellation.error?.code).toBe('22023')

    const orderAfterDenials = await kitchen.from('orders')
      .select('status, started_at, started_by_user_id')
      .eq('id', orderId).single()
    expect(orderAfterDenials.error).toBeNull()
    expect(orderAfterDenials.data?.status).toBe('IN_PROGRESS')
    expect(orderAfterDenials.data?.started_at).toBe(orderResult.data?.started_at)
    expect(orderAfterDenials.data?.started_by_user_id).toBe(userData.user?.id)

    const eventsAfterDenials = await kitchen.from('order_events')
      .select('id').eq('order_id', orderId).eq('event_type', 'PREPARATION_STARTED')
    expect(eventsAfterDenials.error).toBeNull()
    expect(eventsAfterDenials.data).toHaveLength(1)
  } finally {
    await Promise.allSettled([
      customer.auth.signOut(),
      kitchen.auth.signOut(),
      manager.auth.signOut(),
    ])
  }
})
