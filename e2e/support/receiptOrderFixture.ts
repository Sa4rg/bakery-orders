import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'
import type { SupabaseBrowserClient } from '../../src/lib/supabase/client.ts'
import type { Database } from '../../src/lib/supabase/database.types.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials, type FixtureKey } from './fixtures.ts'
import { getLocalSupabasePublicConfig } from './localSupabase.ts'

export async function receiptTestSignIn(key: FixtureKey): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(key))
  expect(error, `Unable to authenticate ${key}`).toBeNull()
  return client
}

/** Real JWT command lifecycle; fixture is uniquely created per test. */
export async function createDispatchedReceiptFixture(
  customer: SupabaseBrowserClient,
  kitchen: SupabaseBrowserClient,
  partial: boolean,
): Promise<{ orderId: string; itemId: string; orderNumber: number }> {
  const delivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const created = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_idempotency_key: randomUUID(),
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-005 receipt confirmation E2E',
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(created.error).toBeNull()
  if (!created.data) throw new Error('Receipt fixture Order creation failed')
  const orderId = created.data
  const item = await kitchen.from('order_items').select('id').eq('order_id', orderId).single()
  expect(item.error).toBeNull()
  if (!item.data) throw new Error('Receipt fixture OrderItem is missing')
  const itemId = item.data.id
  const kitchenCommands = createSupabaseKitchenProductionCommandGateway(kitchen)
  await kitchenCommands.startOrder(orderId)
  await kitchenCommands.recordPreparedQuantity(itemId, partial ? 1000 : 3000)
  if (partial) await kitchenCommands.recordUnavailableQuantity(itemId, 2000, 'M5-005 historical shortage')
  await kitchenCommands.markOrderReady(orderId)
  await kitchenCommands.dispatchOrder(orderId)
  const order = await kitchen.from('orders').select('order_number,status').eq('id', orderId).single()
  expect(order.error).toBeNull()
  expect(order.data?.status).toBe('DISPATCHED')
  if (!order.data) throw new Error('Receipt fixture Order number is missing')
  return { orderId, itemId, orderNumber: order.data.order_number }
}
