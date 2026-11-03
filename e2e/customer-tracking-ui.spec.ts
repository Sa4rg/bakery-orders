import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Locator } from '@playwright/test'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { signInThroughUi } from './support/browserAuth.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials, type FixtureKey } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

async function signedInClient(key: FixtureKey): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(key))
  expect(error, `${key}: sign-in failed`).toBeNull()
  return client
}

async function createOrder(client: SupabaseBrowserClient, businessId: string): Promise<string> {
  const delivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data, error } = await client.rpc('create_order', {
    p_business_id: businessId,
    p_idempotency_key: randomUUID(),
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-002 browser tracking verification',
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!data) throw new Error('Trusted Order creation returned no ID.')
  return data
}

function amount(item: Locator, label: string): Locator {
  return item.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]')
}

test('M5-002 CUSTOMER browser tracks persisted changes and safe shortage reasons on explicit refresh', async ({ page }) => {
  test.setTimeout(90_000)
  const customerA = await signedInClient('customerA')
  const customerB = await signedInClient('customerB')
  const kitchen = await signedInClient('kitchen')
  try {
    await signInThroughUi(page, 'customerA')
    await expect(page.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Kitchen production' })).toHaveCount(0)

    const ownOrderId = await createOrder(customerA, fixtureBusinesses.A.id)
    const foreignOrderId = await createOrder(customerB, fixtureBusinesses.B.id)

    await page.getByRole('textbox', { name: 'Find order by ID' }).fill(ownOrderId)
    await page.getByRole('button', { name: 'Open tracked order' }).click()
    const detail = page.getByRole('region', { name: 'Selected customer order' })
    const tracked = detail.getByRole('article', { name: /Tracked order #\d+/ })
    await expect(tracked).toBeVisible()
    await expect(tracked.getByText('RECEIVED', { exact: true })).toBeVisible()
    const item = tracked.getByRole('article', {
      name: `Tracked item: ${customerOrderingFixture.productName}`, exact: true,
    })
    await expect(item).toBeVisible()
    await expect(tracked.getByText('No unavailable quantities recorded.')).toBeVisible()

    const storedItem = await kitchen.from('order_items').select('id').eq('order_id', ownOrderId).single()
    expect(storedItem.error).toBeNull()
    if (!storedItem.data) throw new Error('OrderItem missing.')
    expect((await kitchen.rpc('start_order', { p_order_id: ownOrderId })).error).toBeNull()
    expect((await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: storedItem.data.id, p_quantity: 1,
    })).error).toBeNull()
    expect((await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: storedItem.data.id, p_quantity: 2,
      p_reason: '  M5-002 recorded historic ingredients shortage  ',
    })).error).toBeNull()

    // M5-002 deliberately provides manual refresh; M5-003 adds Realtime.
    await detail.getByRole('button', { name: 'Refresh order details' }).click()
    await expect(tracked.getByText('IN_PROGRESS', { exact: true })).toBeVisible()
    await expect(item.getByText('M5-002 recorded historic ingredients shortage')).toBeVisible()
    await expect(amount(item, 'Requested')).toHaveText('3')
    await expect(amount(item, 'Prepared')).toHaveText('1')
    await expect(amount(item, 'Unavailable')).toHaveText('2')
    await expect(amount(item, 'Remaining')).toHaveText('0')

    await detail.getByRole('button', { name: 'Back to active orders' }).click()
    await page.getByRole('textbox', { name: 'Find order by ID' }).fill(foreignOrderId)
    await page.getByRole('button', { name: 'Open tracked order' }).click()
    await expect(detail.getByText('Order not found or access denied.')).toBeVisible()
    await expect(detail.getByText('M5-002 recorded historic ingredients shortage')).toHaveCount(0)
  } finally {
    await Promise.allSettled([customerA, customerB, kitchen]
      .map((client) => client.auth.signOut({ scope: 'local' })))
  }
})
