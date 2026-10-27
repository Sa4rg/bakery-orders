import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { deriveKitchenFulfillment } from '../src/features/production/domain/kitchenFulfillment.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
  fixtureCredentials,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'kitchen'
type FinalCondition = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'

interface Scenario {
  name: string
  preparedThousandths: number
  unavailableThousandths: number
  expectedRemainingThousandths: number
  expectedCondition: FinalCondition | null
}

const REQUESTED_THOUSANDTHS = 3000

/** Separate, non-privileged JWT sessions; do not leak a service-role client into the E2E. */
async function signedInClient(actor: Actor): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(actor))
  expect(error, `Unable to sign in as ${actor}`).toBeNull()
  return client
}

async function createFixtureOrder(customer: SupabaseBrowserClient, scenario: string): Promise<string> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: `E2E M4-007 fulfillment ${scenario}`,
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error, `Unable to create the ${scenario} Order`).toBeNull()
  expect(data).toBeTruthy()
  if (!data) throw new Error('Create Order returned no id.')
  return data
}

const scenarios: readonly Scenario[] = [
  {
    name: 'UNRESOLVED while a line still has remaining quantity',
    preparedThousandths: 1000,
    unavailableThousandths: 1000,
    expectedRemainingThousandths: 1000,
    expectedCondition: null,
  },
  {
    name: 'COMPLETE when everything requested was prepared',
    preparedThousandths: 3000,
    unavailableThousandths: 0,
    expectedRemainingThousandths: 0,
    expectedCondition: 'COMPLETE',
  },
  {
    name: 'PARTIAL when some quantity was prepared and the rest unavailable',
    preparedThousandths: 1000,
    unavailableThousandths: 2000,
    expectedRemainingThousandths: 0,
    expectedCondition: 'PARTIAL',
  },
  {
    name: 'UNAVAILABLE when no requested quantity was prepared',
    preparedThousandths: 0,
    unavailableThousandths: 3000,
    expectedRemainingThousandths: 0,
    expectedCondition: 'UNAVAILABLE',
  },
]

test.describe('M4-007 — fulfillment derived from persisted, JWT-authorized production data', () => {
  for (const scenario of scenarios) {
    test(scenario.name, async () => {
      const customer = await signedInClient('customerA')
      const kitchen = await signedInClient('kitchen')
      try {
        const orderId = await createFixtureOrder(customer, scenario.name)
        const query = createSupabaseKitchenOrderQueryGateway(kitchen)
        const command = createSupabaseKitchenProductionCommandGateway(kitchen)
        const received = await query.loadProductionOrder(orderId)

        expect(received?.status).toBe('RECEIVED')
        expect(received?.items).toHaveLength(1)
        if (!received) throw new Error('The KITCHEN read model did not expose the new Order.')
        const itemId = received.items[0]!.id
        expect(deriveKitchenFulfillment(received.items)).toEqual({
          resolution: 'UNRESOLVED',
          condition: null,
          totals: {
            requestedThousandths: REQUESTED_THOUSANDTHS,
            preparedThousandths: 0,
            unavailableThousandths: 0,
            remainingThousandths: REQUESTED_THOUSANDTHS,
          },
        })

        // Real trusted operations (JWT only) modify the SAME persisted OrderItem.
        await command.startOrder(orderId)
        if (scenario.preparedThousandths > 0) {
          await command.recordPreparedQuantity(itemId, scenario.preparedThousandths)
        }
        if (scenario.unavailableThousandths > 0) {
          await command.recordUnavailableQuantity(
            itemId,
            scenario.unavailableThousandths,
            `M4-007 audited shortage: ${scenario.name}`,
          )
        }

        // Re-read from the RLS-protected query gateway; never derive from the
        // quantities passed to the commands, and never trust a Realtime payload.
        const persistedModel = await query.loadProductionOrder(orderId)
        expect(persistedModel).not.toBeNull()
        if (!persistedModel) throw new Error('Order disappeared after its trusted updates.')
        expect(persistedModel.status).toBe('IN_PROGRESS')
        expect(persistedModel.items).toHaveLength(1)
        expect(persistedModel.items[0]).toMatchObject({
          id: itemId,
          requestedThousandths: REQUESTED_THOUSANDTHS,
          preparedThousandths: scenario.preparedThousandths,
          unavailableThousandths: scenario.unavailableThousandths,
          remainingThousandths: scenario.expectedRemainingThousandths,
          quantityStepThousandths: 1000,
        })

        const derived = deriveKitchenFulfillment(persistedModel.items)
        expect(derived.resolution).toBe(
          scenario.expectedCondition === null ? 'UNRESOLVED' : 'RESOLVED',
        )
        expect(derived.condition).toBe(scenario.expectedCondition)
        expect(derived.totals).toEqual({
          requestedThousandths: REQUESTED_THOUSANDTHS,
          preparedThousandths: scenario.preparedThousandths,
          unavailableThousandths: scenario.unavailableThousandths,
          remainingThousandths: scenario.expectedRemainingThousandths,
        })

        // Verify the independent persisted quantities, not only the TS mapping.
        const dbItem = await kitchen.from('order_items')
          .select('requested_quantity, prepared_quantity, unavailable_quantity, quantity_step_snapshot')
          .eq('id', itemId).single()
        expect(dbItem.error).toBeNull()
        expect(dbItem.data).toMatchObject({
          requested_quantity: 3,
          prepared_quantity: scenario.preparedThousandths / 1000,
          unavailable_quantity: scenario.unavailableThousandths / 1000,
          quantity_step_snapshot: 1,
        })

        const order = await kitchen.from('orders').select('status').eq('id', orderId).single()
        expect(order.error).toBeNull()
        // A resolved line is NOT an authorization for the browser to mark READY.
        // M4-008 will own that transition in a separate trusted SQL transaction.
        expect(order.data?.status).toBe('IN_PROGRESS')

        // Every successful operation has its own persisted audit event.
        const events = await kitchen.from('order_events')
          .select('event_type, reason, order_item_id')
          .eq('order_id', orderId)
          .in('event_type', ['PREPARATION_STARTED', 'QUANTITY_PREPARED', 'QUANTITY_UNAVAILABLE'])
        expect(events.error).toBeNull()
        expect(events.data?.filter((event) => event.event_type === 'PREPARATION_STARTED'))
          .toHaveLength(1)
        expect(events.data?.filter((event) => event.event_type === 'QUANTITY_PREPARED'))
          .toHaveLength(scenario.preparedThousandths > 0 ? 1 : 0)
        const unavailableEvents = events.data?.filter((event) => event.event_type === 'QUANTITY_UNAVAILABLE')
        expect(unavailableEvents).toHaveLength(scenario.unavailableThousandths > 0 ? 1 : 0)
        if (scenario.unavailableThousandths > 0) {
          expect(unavailableEvents?.[0]).toMatchObject({
            order_item_id: itemId,
            reason: `M4-007 audited shortage: ${scenario.name}`,
          })
        }
      } finally {
        // Parallel/repeated E2E tests share fixture accounts, not auth sessions.
        await Promise.allSettled([
          customer.auth.signOut({ scope: 'local' }),
          kitchen.auth.signOut({ scope: 'local' }),
        ])
      }
    })
  }
})
