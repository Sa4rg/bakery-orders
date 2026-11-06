import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseCustomerTrackingQueryGateway } from '../src/features/tracking/data/createSupabaseCustomerTrackingQueryGateway.ts'
import { CustomerTrackingAccessError } from '../src/features/tracking/application/customerTrackingQueryGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials, type FixtureKey } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

async function signedIn(actor: FixtureKey): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(actor))
  expect(error, `Auth failed for ${actor}`).toBeNull()
  return client
}

async function createOrder(customer: SupabaseBrowserClient, businessId: string): Promise<string> {
  const delivery = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: businessId, p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-001 customer tracking E2E', p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  expect(data).toBeTruthy()
  if (!data) throw new Error('Trusted create_order returned no Order ID.')
  return data
}

async function closeClients(...clients: SupabaseBrowserClient[]) {
  await Promise.allSettled(clients.map((client) => client.auth.signOut({ scope: 'local' })))
}

test.describe('M5-001 — CUSTOMER read model with real JWT/RLS', () => {
  test('active orders are scoped to the receiving Business and paginated without duplicate rows', async () => {
    const a = await signedIn('customerA')
    const b = await signedIn('customerB')
    const kitchen = await signedIn('kitchen')
    const manager = await signedIn('manager')
    try {
      const ownIds = await Promise.all([
        createOrder(a, fixtureBusinesses.A.id),
        createOrder(a, fixtureBusinesses.A.id),
        createOrder(a, fixtureBusinesses.A.id),
      ])
      const otherId = await createOrder(b, fixtureBusinesses.B.id)
      const aGateway = createSupabaseCustomerTrackingQueryGateway(a)
      const bGateway = createSupabaseCustomerTrackingQueryGateway(b)
      const foreign = await aGateway.loadOrder(otherId)
      expect(foreign).toBeNull()
      expect((await bGateway.loadOrder(ownIds[0]!))).toBeNull()
      for (const id of ownIds) {
        const order = await aGateway.loadOrder(id)
        expect(order).toMatchObject({ id, businessId: fixtureBusinesses.A.id, status: 'RECEIVED' })
        expect(order?.items[0]).toMatchObject({
          requestedThousandths: 3000, preparedThousandths: 0,
          unavailableThousandths: 0, remainingThousandths: 3000,
        })
      }
      // Concurrent E2E workers can create earlier or later Orders. Traverse
      // the actual keyset until ALL three known fixture Orders are recovered;
      // checking only the first two pages could silently miss them.
      const expectedIds = new Set(ownIds)
      const seen = new Set<string>()
      const found = new Set<string>()
      let cursor: string | null = null
      for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
        const page = await aGateway.loadActiveOrders({ pageSize: 2, cursor })
        expect(page.orders.length).toBeGreaterThan(0)
        expect(page.orders.length).toBeLessThanOrEqual(2)
        for (const order of page.orders) {
          expect(seen.has(order.id), 'Keyset pagination returned an Order twice').toBe(false)
          seen.add(order.id)
          expect(order.businessId).toBe(fixtureBusinesses.A.id)
          expect(order.id).not.toBe(otherId)
          if (expectedIds.has(order.id)) found.add(order.id)
        }
        if (found.size === expectedIds.size || page.nextCursor === null) break
        expect(page.nextCursor).not.toBe(cursor)
        cursor = page.nextCursor
      }
      expect(found, 'Every created CUSTOMER Order must be reachable through paginated reads')
        .toEqual(expectedIds)
      await expect(createSupabaseCustomerTrackingQueryGateway(kitchen).loadActiveOrders())
        .rejects.toBeInstanceOf(CustomerTrackingAccessError)
      await expect(createSupabaseCustomerTrackingQueryGateway(manager).loadActiveOrders())
        .rejects.toBeInstanceOf(CustomerTrackingAccessError)
    } finally { await closeClients(a, b, kitchen, manager) }
  })

  test('CANCELLED is not active but remains available by ID; inactive membership is denied', async () => {
    const customer = await signedIn('customerA')
    const noMembership = await signedIn('customerWithoutActiveMembership')
    const inactive = await signedIn('inactiveProfile')
    try {
      const id = await createOrder(customer, fixtureBusinesses.A.id)
      const before = await createSupabaseCustomerTrackingQueryGateway(customer).loadOrder(id)
      expect(before?.status).toBe('RECEIVED')
      const { error } = await customer.rpc('cancel_customer_order', { p_order_id: id, p_reason: 'M5-001 E2E read terminal order' })
      expect(error).toBeNull()
      const gateway = createSupabaseCustomerTrackingQueryGateway(customer)
      expect((await gateway.loadOrder(id))?.status).toBe('CANCELLED')
      const first = await gateway.loadActiveOrders({ pageSize: 100 })
      expect(first.orders.map((o) => o.id)).not.toContain(id)
      await expect(createSupabaseCustomerTrackingQueryGateway(noMembership).loadActiveOrders())
        .rejects.toBeInstanceOf(CustomerTrackingAccessError)
      await expect(createSupabaseCustomerTrackingQueryGateway(inactive).loadOrder(id))
        .rejects.toBeInstanceOf(CustomerTrackingAccessError)
    } finally { await closeClients(customer, noMembership, inactive) }
  })
})
