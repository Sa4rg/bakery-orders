import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { CustomerShortageAccessError } from '../src/features/tracking/application/customerShortageReasonsGateway.ts'
import { createSupabaseCustomerShortageReasonsGateway } from '../src/features/tracking/data/createSupabaseCustomerShortageReasonsGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials, type FixtureKey } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

async function signIn(key: FixtureKey): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(key))
  expect(error, `${key}: failed to authenticate`).toBeNull()
  return client
}

async function orderAs(customer: SupabaseBrowserClient, businessId: string): Promise<string> {
  const delivery = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: businessId,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-002 CUSTOMER shortage projection E2E',
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!data) throw new Error('Unable to persist the fixture Order.')
  return data
}

test('M5-002A CUSTOMER sees only authorized shortage reasons using real JWT and RLS', async () => {
  const customerA = await signIn('customerA')
  const customerB = await signIn('customerB')
  const kitchen = await signIn('kitchen')
  const manager = await signIn('manager')
  const noMembership = await signIn('customerWithoutActiveMembership')
  try {
    const aId = await orderAs(customerA, fixtureBusinesses.A.id)
    const bId = await orderAs(customerB, fixtureBusinesses.B.id)
    const aItem = await kitchen.from('order_items').select('id').eq('order_id', aId).single()
    const bItem = await kitchen.from('order_items').select('id').eq('order_id', bId).single()
    expect(aItem.error).toBeNull()
    expect(bItem.error).toBeNull()
    if (!aItem.data || !bItem.data) throw new Error('Fixture OrderItem is missing.')

    for (const id of [aId, bId]) {
      const result = await kitchen.rpc('start_order', { p_order_id: id })
      expect(result.error).toBeNull()
    }
    expect((await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: aItem.data.id, p_quantity: 2,
      p_reason: '  M5-002A shortage for Business A  ',
    })).error).toBeNull()
    expect((await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: bItem.data.id, p_quantity: 1,
      p_reason: 'Private Business B shortage',
    })).error).toBeNull()

    const aRead = createSupabaseCustomerShortageReasonsGateway(customerA)
    const bRead = createSupabaseCustomerShortageReasonsGateway(customerB)
    const aReasons = await aRead.loadReasons(aId)
    expect(aReasons).toHaveLength(1)
    expect(aReasons[0]).toMatchObject({
      orderItemId: aItem.data.id,
      reason: 'M5-002A shortage for Business A',
    })
    expect(Number.isFinite(Date.parse(aReasons[0]!.occurredAt))).toBe(true)
    expect(await aRead.loadReasons(bId)).toEqual([])
    expect(await bRead.loadReasons(aId)).toEqual([])
    expect(await bRead.loadReasons(bId)).toMatchObject([{
      orderItemId: bItem.data.id,
      reason: 'Private Business B shortage',
    }])

    const directAudit = await customerA.from('order_events').select('event_type, reason').eq('order_id', aId)
    expect(directAudit.error).toBeNull()
    expect(directAudit.data).toEqual([])

    await expect(createSupabaseCustomerShortageReasonsGateway(kitchen).loadReasons(aId))
      .rejects.toBeInstanceOf(CustomerShortageAccessError)
    await expect(createSupabaseCustomerShortageReasonsGateway(manager).loadReasons(aId))
      .rejects.toBeInstanceOf(CustomerShortageAccessError)
    await expect(createSupabaseCustomerShortageReasonsGateway(noMembership).loadReasons(aId))
      .rejects.toBeInstanceOf(CustomerShortageAccessError)
  } finally {
    await Promise.allSettled(
      [customerA, customerB, kitchen, manager, noMembership]
        .map((client) => client.auth.signOut({ scope: 'local' })),
    )
  }
})
