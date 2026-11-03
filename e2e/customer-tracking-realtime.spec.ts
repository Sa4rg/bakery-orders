import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Locator } from '@playwright/test'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { signInThroughUi } from './support/browserAuth.ts'
import {
  fixtureBusinesses, fixtureCredentials, customerOrderingFixture, type FixtureKey,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'
import { createSupabaseCustomerTrackingRealtimeGateway } from '../src/features/tracking/data/createSupabaseCustomerTrackingRealtimeGateway.ts'
import { createSupabaseCustomerTrackingQueryGateway } from '../src/features/tracking/data/createSupabaseCustomerTrackingQueryGateway.ts'

async function signedIn(key: FixtureKey): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(key))
  expect(error, `Auth failed for ${key}`).toBeNull()
  return client
}

async function createOrder(customer: SupabaseBrowserClient): Promise<string> {
  const delivery = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-003 real Realtime tracking',
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!data) throw new Error('Trusted create_order returned no ID.')
  return data
}

function amount(item: Locator, label: string): Locator {
  return item.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]')
}

test('M5-003 CUSTOMER browser receives persisted progress and shortages without a manual refresh', async ({ page }) => {
  test.setTimeout(120_000)
  const customer = await signedIn('customerA')
  const kitchen = await signedIn('kitchen')
  try {
    await signInThroughUi(page, 'customerA')
    // The main section is identified by its heading, not region. Wait for its
    // actual Realtime session before creating the fixture Order.
    await expect(page.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await expect(page.getByText(/Realtime: connected\./)).toBeVisible({ timeout: 30_000 })
    const orderId = await createOrder(customer)
    await page.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await page.getByRole('button', { name: 'Open tracked order' }).click()
    const detail = page.getByRole('region', { name: 'Selected customer order' })
    const tracked = detail.getByRole('article', { name: /Tracked order #\d+/ })
    await expect(tracked).toBeVisible()
    await expect(tracked.getByText('RECEIVED', { exact: true })).toBeVisible()
    // Opening the detail replaces the list-only channel with one that also
    // observes precisely this Order's order_items changes.
    await expect(page.getByText(/Realtime: connected\./)).toBeVisible({ timeout: 30_000 })
    const item = tracked.getByRole('article', { name: `Tracked item: ${customerOrderingFixture.productName}` })
    const row = await kitchen.from('order_items').select('id').eq('order_id', orderId).single()
    expect(row.error).toBeNull()
    if (!row.data) throw new Error('Missing OrderItem')

    expect((await kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
    await expect(tracked.getByText('IN_PROGRESS', { exact: true })).toBeVisible({ timeout: 30_000 })
    expect((await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: row.data.id, p_quantity: 1,
    })).error).toBeNull()
    await expect(amount(item, 'Prepared')).toHaveText('1', { timeout: 30_000 })
    expect((await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: row.data.id, p_quantity: 2,
      p_reason: '  M5-003 Realtime ingredient shortage  ',
    })).error).toBeNull()
    await expect(amount(item, 'Unavailable')).toHaveText('2', { timeout: 30_000 })
    await expect(item.getByText('M5-003 Realtime ingredient shortage')).toBeVisible({ timeout: 30_000 })
    await expect(amount(item, 'Remaining')).toHaveText('0')

    // Neither a reload nor the manual tracking refresh was used.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'My active orders' })).toHaveCount(0)
  } finally {
    await Promise.allSettled([customer, kitchen].map((client) => client.auth.signOut({ scope: 'local' })))
  }
})

test('M5-003 unauthorized Business subscription receives no foreign event; reconnect refetches missed state', async () => {
  test.setTimeout(120_000)
  const a = await signedIn('customerA')
  const b = await signedIn('customerB')
  const kitchen = await signedIn('kitchen')
  const states: string[] = []
  let aChanges = 0
  let forbiddenChanges = 0
  const bStates: string[] = []
  let stopA: (() => void) | null = null
  let stopB: (() => void) | null = null
  try {
    stopA = createSupabaseCustomerTrackingRealtimeGateway(a).subscribe({ businessId: fixtureBusinesses.A.id }, {
      onInvalidation: () => { aChanges += 1 },
      onConnectionStatusChange: (status) => states.push(status),
    })
    // Deliberately forge the Business filter with a real Business B CUSTOMER.
    // Filters alone are not an authorization mechanism: RLS must block events.
    stopB = createSupabaseCustomerTrackingRealtimeGateway(b).subscribe({ businessId: fixtureBusinesses.A.id }, {
      onInvalidation: () => { forbiddenChanges += 1 },
      onConnectionStatusChange: (status) => bStates.push(status),
    })
    await expect.poll(() => states.at(-1), { timeout: 30_000 }).toBe('connected')
    await expect.poll(() => bStates.at(-1), { timeout: 30_000 }).toBe('connected')
    const orderId = await createOrder(a)
    await expect.poll(() => aChanges, { timeout: 30_000 }).toBeGreaterThan(0)
    const forbiddenOrder = await createSupabaseCustomerTrackingQueryGateway(b).loadOrder(orderId)
    expect(forbiddenOrder).toBeNull()
    expect(forbiddenChanges, 'Foreign RLS-protected Order notifications must not arrive').toBe(0)

    // Change the forged channel to include order_items for this exact foreign
    // Order. It must remain silent even when KITCHEN updates its items.
    stopB()
    stopB = null
    const forbiddenGateway = createSupabaseCustomerTrackingRealtimeGateway(b)
    stopB = forbiddenGateway.subscribe({ businessId: fixtureBusinesses.A.id, orderId }, {
      onInvalidation: () => { forbiddenChanges += 1 },
      onConnectionStatusChange: (status) => bStates.push(status),
    })
    await expect.poll(() => bStates.at(-1), { timeout: 30_000 }).toBe('connected')
    const item = await kitchen.from('order_items').select('id').eq('order_id', orderId).single()
    expect(item.error).toBeNull()
    if (!item.data) throw new Error('Missing fixture OrderItem')

    stopA()
    stopA = null
    await expect.poll(() => a.getChannels().length, { timeout: 10_000 }).toBe(0)
    expect((await kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
    expect((await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: item.data.id, p_quantity: 1,
    })).error).toBeNull()
    // The authorized CUSTOMER A subscription was absent for both updates.

    const recovered: string[] = []
    let observedStatus: string | null = null
    let observedPrepared: number | null = null
    stopA = createSupabaseCustomerTrackingRealtimeGateway(a).subscribe({ businessId: fixtureBusinesses.A.id }, {
      onInvalidation: () => { aChanges += 1 },
      onConnectionStatusChange: (status) => {
        recovered.push(status)
        if (status === 'connected') {
          // Re-subscription is a mandatory authoritative read, even without
          // receiving the event that occurred during the connection gap.
          void createSupabaseCustomerTrackingQueryGateway(a).loadOrder(orderId)
            .then((order) => {
              observedStatus = order?.status ?? null
              observedPrepared = order?.items[0]?.preparedThousandths ?? null
            })
        }
      },
    })
    await expect.poll(() => recovered.at(-1), { timeout: 30_000 }).toBe('connected')
    await expect.poll(() => observedStatus, { timeout: 30_000 }).toBe('IN_PROGRESS')
    await expect.poll(() => observedPrepared, { timeout: 30_000 }).toBe(1000)
    expect(forbiddenChanges).toBe(0)
  } finally {
    stopA?.(); stopB?.()
    await Promise.allSettled([a, b, kitchen].map((client) => client.auth.signOut({ scope: 'local' })))
  }
})
