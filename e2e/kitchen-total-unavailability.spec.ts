import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import { createSupabaseManagerBlockedOrdersGateway } from '../src/features/production/data/createSupabaseManagerBlockedOrdersGateway.ts'
import { deriveKitchenBlockedCondition } from '../src/features/production/domain/kitchenBlockedCondition.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

async function signIn(role: 'customerA' | 'kitchen' | 'manager'): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(role))
  expect(error).toBeNull()
  return client
}

test('total unavailability requires MANAGER review; SQL rejects READY without cancellation', async ({ page }) => {
  test.setTimeout(90_000)
  const customer = await signIn('customerA')
  const kitchen = await signIn('kitchen')
  const manager = await signIn('manager')
  try {
    const delivery = new Date(Date.now() + 72 * 3600_000)
    delivery.setUTCHours(10, 0, 0, 0)
    const { data: orderId, error: createError } = await customer.rpc('create_order', {
      p_business_id: fixtureBusinesses.A.id, p_requested_delivery_at: delivery.toISOString(),
      p_customer_notes: 'M4-009 manager intervention', p_idempotency_key: randomUUID(),
      p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
    })
    expect(createError).toBeNull()
    if (!orderId) throw new Error('Order was not created.')
    const query = createSupabaseKitchenOrderQueryGateway(kitchen)
    const commands = createSupabaseKitchenProductionCommandGateway(kitchen)
    const order = await query.loadProductionOrder(orderId)
    expect(order?.items).toHaveLength(1)
    if (!order) throw new Error('Cannot read created Order.')
    await commands.startOrder(orderId)
    await commands.recordUnavailableQuantity(order.items[0]!.id, 3000, 'No ingredients available')
    const state = await query.loadProductionOrder(orderId)
    if (!state) throw new Error('Cannot read unavailable Order.')
    expect(deriveKitchenBlockedCondition(state)).toMatchObject({
      blocked: true, reason: 'TOTAL_UNAVAILABILITY',
      fulfillment: { resolution: 'RESOLVED', condition: 'UNAVAILABLE' },
    })

    // C: PostgreSQL is the authority; a forged direct RPC must still reject READY.
    const rejected = await kitchen.rpc('mark_order_ready', { p_order_id: orderId })
    expect(rejected.error?.code).toBe('22023')
    const stored = await manager.from('orders').select('order_number, status, ready_at, ready_by_user_id, cancelled_at, cancelled_by_user_id')
      .eq('id', orderId).single()
    expect(stored.error).toBeNull()
    expect(stored.data).toMatchObject({ status: 'IN_PROGRESS', ready_at: null,
      ready_by_user_id: null, cancelled_at: null, cancelled_by_user_id: null })
    const events = await manager.from('order_events').select('event_type, reason').eq('order_id', orderId)
    expect(events.error).toBeNull()
    expect(events.data?.filter((entry) => entry.event_type === 'QUANTITY_UNAVAILABLE')).toHaveLength(1)
    expect(events.data?.some((entry) => /CANCEL|READY|DISPATCH/i.test(entry.event_type))).toBe(false)

    // B: a MANAGER can read the blocked page and historical reason through own JWT + RLS.
    const inbox = createSupabaseManagerBlockedOrdersGateway(manager)
    // Read successive pages, not just the first, because the list is paginated.
    let incident: Awaited<ReturnType<typeof inbox.loadPage>>['incidents'][number] | undefined
    for (let i = 0; i < 20; i += 1) {
      const snapshot = await inbox.loadPage(i)
      incident = snapshot.incidents.find((entry) => entry.orderId === orderId)
      if (incident || !snapshot.hasNextPage) break
    }
    expect(incident).toBeDefined()
    expect(incident?.reasons.some((entry) => entry.reason === 'No ingredients available')).toBe(true)
    await expect(createSupabaseManagerBlockedOrdersGateway(customer).loadPage(0))
      .rejects.toThrow('Manager access required.')

    // Browser UX: only MANAGER sees this read-only intervention inbox.
    await signInThroughUi(page, 'manager')
    const region = page.getByRole('region', { name: 'Manager production interventions' })
    await expect(region).toBeVisible()
    await expect(region.getByText(/No automatic cancellation occurs/i)).toBeVisible()
    const card = region.getByRole('article', { name: `Blocked order #${stored.data?.order_number}` })
    for (let i = 0; i < 20; i += 1) {
      await expect(region.getByRole('button', { name: 'Refresh interventions' })).toBeEnabled()
      if (await card.count() > 0) break
      const next = region.getByRole('button', { name: 'Next orders page' })
      await expect(next).toBeEnabled()
      await next.click()
    }
    await expect(card).toBeVisible()
    await expect(card.getByText('No ingredients available')).toBeVisible()
    await expect(card.getByRole('button', { name: /Cancel|Ready|Dispatch/i })).toHaveCount(0)
  } finally {
    await Promise.allSettled([
      customer.auth.signOut({ scope: 'local' }),
      kitchen.auth.signOut({ scope: 'local' }),
      manager.auth.signOut({ scope: 'local' }),
    ])
  }
})
