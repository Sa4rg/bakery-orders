import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'kitchen' | 'manager'
type Case = {
  label: string
  prepared: number
  unavailable: number
  succeeds: boolean
  condition: 'COMPLETE' | 'PARTIAL' | null
}

async function actorClient(actor: Actor): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(actor))
  expect(error, `Unable to sign in as ${actor}`).toBeNull()
  return client
}

async function newOrder(client: SupabaseBrowserClient, label: string): Promise<string> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await client.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: `M4-008E2E ${label}`,
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!data) throw new Error('create_order returned no id')
  return data
}

const cases: readonly Case[] = [
  { label: 'COMPLETE', prepared: 3000, unavailable: 0, succeeds: true, condition: 'COMPLETE' },
  { label: 'PARTIAL', prepared: 1000, unavailable: 2000, succeeds: true, condition: 'PARTIAL' },
  { label: 'UNRESOLVED', prepared: 1000, unavailable: 1000, succeeds: false, condition: null },
  { label: 'UNAVAILABLE', prepared: 0, unavailable: 3000, succeeds: false, condition: null },
]

test.describe('M4-008 — trusted READY with real JWT and persisted audit', () => {
  for (const scenario of cases) {
    test(scenario.label, async () => {
      const customer = await actorClient('customerA')
      const kitchen = await actorClient('kitchen')
      const manager = await actorClient('manager')
      try {
        const orderId = await newOrder(customer, scenario.label)
        const query = createSupabaseKitchenOrderQueryGateway(kitchen)
        const command = createSupabaseKitchenProductionCommandGateway(kitchen)
        const received = await query.loadProductionOrder(orderId)
        expect(received?.items).toHaveLength(1)
        if (!received) throw new Error('No authorized KITCHEN read model for created order')
        const itemId = received.items[0]!.id
        await command.startOrder(orderId)
        if (scenario.prepared > 0) await command.recordPreparedQuantity(itemId, scenario.prepared)
        if (scenario.unavailable > 0) {
          await command.recordUnavailableQuantity(itemId, scenario.unavailable, 'M4-008 shortage')
        }

        // A CUSTOMER and MANAGER must never authorize READY, even if resolved.
        for (const forbidden of [customer, manager]) {
          const result = await forbidden.rpc('mark_order_ready', { p_order_id: orderId })
          expect(result.error?.code).toBe('42501')
        }

        const before = await kitchen.from('order_items')
          .select('requested_quantity, prepared_quantity, unavailable_quantity')
          .eq('id', itemId).single()
        expect(before.error).toBeNull()
        expect(before.data).toMatchObject({
          requested_quantity: 3,
          prepared_quantity: scenario.prepared / 1000,
          unavailable_quantity: scenario.unavailable / 1000,
        })

        if (scenario.succeeds) {
          await expect(command.markOrderReady(orderId)).resolves.toBeUndefined()
        } else {
          const rejected = await kitchen.rpc('mark_order_ready', { p_order_id: orderId })
          expect(rejected.error?.code).toBe('22023')
        }

        const stored = await kitchen.from('orders')
          .select('status, ready_at, ready_by_user_id').eq('id', orderId).single()
        expect(stored.error).toBeNull()
        expect(stored.data?.status).toBe(scenario.succeeds ? 'READY' : 'IN_PROGRESS')
        const { data: userData, error: userError } = await kitchen.auth.getUser()
        expect(userError).toBeNull()
        expect(userData.user?.id).toBeTruthy()
        if (scenario.succeeds) {
          expect(stored.data?.ready_at).toBeTruthy()
          expect(stored.data?.ready_by_user_id).toBe(userData.user?.id)
        } else {
          expect(stored.data?.ready_at).toBeNull()
          expect(stored.data?.ready_by_user_id).toBeNull()
        }

        const audit = await kitchen.from('order_events')
          .select('event_type, actor_user_id, order_item_id, previous_value, new_value, metadata, occurred_at')
          .eq('order_id', orderId).eq('event_type', 'ORDER_READY')
        expect(audit.error).toBeNull()
        expect(audit.data).toHaveLength(scenario.succeeds ? 1 : 0)
        if (scenario.succeeds) {
          expect(audit.data?.[0]).toMatchObject({
            actor_user_id: userData.user?.id,
            order_item_id: null,
            previous_value: { status: 'IN_PROGRESS' },
            new_value: { status: 'READY' },
            metadata: {
              fulfillment_condition: scenario.condition,
              prepared_quantity: scenario.prepared / 1000,
              unavailable_quantity: scenario.unavailable / 1000,
            },
          })
          expect(audit.data?.[0]?.occurred_at).toBe(stored.data?.ready_at)
          // Repeated READY must fail and create no second audit event.
          const second = await kitchen.rpc('mark_order_ready', { p_order_id: orderId })
          expect(second.error?.code).toBe('22023')
          const repeatedAudit = await kitchen.from('order_events')
            .select('id').eq('order_id', orderId).eq('event_type', 'ORDER_READY')
          expect(repeatedAudit.error).toBeNull()
          expect(repeatedAudit.data).toHaveLength(1)
        }

        const after = await kitchen.from('order_items')
          .select('requested_quantity, prepared_quantity, unavailable_quantity')
          .eq('id', itemId).single()
        expect(after.error).toBeNull()
        expect(after.data).toEqual(before.data)
        const refreshed = await query.loadProductionOrder(orderId)
        expect(refreshed?.status).toBe(scenario.succeeds ? 'READY' : 'IN_PROGRESS')
      } finally {
        await Promise.allSettled([
          customer.auth.signOut({ scope: 'local' }),
          kitchen.auth.signOut({ scope: 'local' }),
          manager.auth.signOut({ scope: 'local' }),
        ])
      }
    })
  }
})
