import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type { KitchenOrderPage } from '../src/features/orders/application/kitchenOrderQueryGateway.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/orders/data/createSupabaseKitchenOrderQueryGateway.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
  fixtureCredentials,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

/** Real JWT and Data API. No privileged key, browser UI, or mocked query builder. */
async function signedInClient(role: 'customerA' | 'kitchen'): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { error } = await client.auth.signInWithPassword(fixtureCredentials(role))
  expect(error, `Unable to sign in as ${role}`).toBeNull()
  return client
}

test('KITCHEN keyset pagination works through real PostgREST and preserves OrderItems', async () => {
  const customer = await signedInClient('customerA')
  const kitchen = await signedInClient('kitchen')
  const gateway = createSupabaseKitchenOrderQueryGateway(kitchen)

  // All fixtures are cleaned by the existing Playwright global teardown.
  // A shared delivery time exercises the created_at and id tie breakers.
  const firstDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  firstDelivery.setUTCHours(12, 0, 0, 0)
  const laterDelivery = new Date(firstDelivery.getTime() + 24 * 60 * 60 * 1000)
  const requestedDeliveries = [
    firstDelivery.toISOString(),
    firstDelivery.toISOString(),
    laterDelivery.toISOString(),
  ]

  const fixtureIds: string[] = []

  for (const [index, delivery] of requestedDeliveries.entries()) {
    const { data, error } = await customer.rpc('create_order', {
      p_business_id: fixtureBusinesses.A.id,
      p_requested_delivery_at: delivery,
      p_customer_notes: 'E2E Kitchen pagination read verification',
      p_idempotency_key: randomUUID(),
      p_items: [{
        product_id: customerOrderingFixture.productId,
        requested_quantity: index + 1,
      }],
    })

    expect(error, 'Unable to persist fixture Order').toBeNull()
    expect(data).toBeTruthy()
    fixtureIds.push(data!)
  }

  const fixtureIdSet = new Set(fixtureIds)
  const allSeen = new Set<string>()
  const foundFixtures: string[] = []
  let cursor: string | null = null

  // Page through real KITCHEN-visible Orders. Do not assume this test owns
  // the whole local database or that its Orders are on the first page.
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page: KitchenOrderPage = await gateway.loadProductionQueue({
      statuses: ['RECEIVED'],
      pageSize: 1,
      cursor,
    })

    expect(page.orders.length).toBeLessThanOrEqual(1)

    if (page.orders.length === 0) {
      expect(page.nextCursor).toBeNull()
      break
    }

    const order = page.orders[0]!
    expect(allSeen.has(order.id), 'Pagination repeated an Order').toBe(false)
    allSeen.add(order.id)

    if (fixtureIdSet.has(order.id)) {
      foundFixtures.push(order.id)
      expect(order.businessId).toBe(fixtureBusinesses.A.id)
      expect(order.businessName).toBe(fixtureBusinesses.A.name)
      expect(order.items).toHaveLength(1)
      expect(order.items[0]!.productName).toBe(customerOrderingFixture.productName)
      const index = fixtureIds.indexOf(order.id)
      expect(order.items[0]!.requestedThousandths).toBe((index + 1) * 1000)
      expect(order.items[0]!.remainingThousandths).toBe((index + 1) * 1000)
    }

    if (foundFixtures.length === fixtureIds.length) break
    if (page.nextCursor === null) break

    expect(page.nextCursor).not.toBe(cursor)
    cursor = page.nextCursor
  }

  // Confirms no fixture Order was skipped, not merely that one cursor worked.
  expect(new Set(foundFixtures)).toEqual(fixtureIdSet)
  // Two Orders share a delivery time; the later delivery must appear last.
  expect(foundFixtures.at(-1)).toBe(fixtureIds[2])
})
