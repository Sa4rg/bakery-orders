import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { signInThroughUi } from './support/browserAuth.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

// The test creates only its own Order through the real JWT command boundary.
test('M5-004 KITCHEN confirms dispatch from READY queue, then CUSTOMER sees DISPATCHED', async ({ page }) => {
  test.setTimeout(90_000)
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const customer = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const kitchen = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  try {
    expect((await customer.auth.signInWithPassword(fixtureCredentials('customerA'))).error).toBeNull()
    expect((await kitchen.auth.signInWithPassword(fixtureCredentials('kitchen'))).error).toBeNull()
    const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    delivery.setUTCHours(10, 0, 0, 0)
    const { data: id, error: createdError } = await customer.rpc('create_order', {
      p_business_id: fixtureBusinesses.A.id,
      p_idempotency_key: randomUUID(),
      p_requested_delivery_at: delivery.toISOString(),
      p_customer_notes: 'M5-004 UI confirmation',
      p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
    })
    expect(createdError).toBeNull()
    if (!id) throw new Error('No created Order id')
    const item = await kitchen.from('order_items').select('id').eq('order_id', id).single()
    expect(item.error).toBeNull()
    if (!item.data) throw new Error('No OrderItem')
    expect((await kitchen.rpc('start_order', { p_order_id: id })).error).toBeNull()
    expect((await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: item.data.id, p_quantity: 3,
    })).error).toBeNull()
    expect((await kitchen.rpc('mark_order_ready', { p_order_id: id })).error).toBeNull()
    const persisted = await kitchen.from('orders').select('order_number').eq('id', id).single()
    expect(persisted.error).toBeNull()
    const number = persisted.data?.order_number
    if (!number) throw new Error('Order number is missing')

    await signInThroughUi(page, 'kitchen')
    await expect(page.getByRole('heading', { name: 'Kitchen production' })).toBeVisible()
    const filter = page.getByRole('combobox', { name: 'Production status filter' })
    await filter.selectOption('READY')
    const fresh = page.getByText('Realtime: connected. Queue up to date.', { exact: true })
    const view = page.getByRole('button', { name: `View details for order #${number}` })
    const next = page.getByRole('navigation', { name: 'Production pages' })
      .getByRole('button', { name: 'Next page' })
    for (let step = 0; step < 100; step += 1) {
      await expect(fresh).toBeVisible({ timeout: 20_000 })
      if (await view.isVisible()) break
      if (!(await next.isEnabled())) throw new Error('READY Order not found in production pages')
      await next.click()
    }
    await expect(view).toBeVisible()
    await view.click()
    const detail = page.getByRole('region', { name: 'Selected production order' })
    await expect(detail.getByText('READY', { exact: true })).toBeVisible()
    const card = detail.getByRole('article', {
      name: `Production order ${number} for ${fixtureBusinesses.A.name}`, exact: true,
    })
    await card.getByRole('button', { name: `Dispatch order #${number}` }).click()
    // First button only opens a confirmation; no mutation has happened yet.
    expect((await kitchen.from('orders').select('status').eq('id', id).single()).data?.status)
      .toBe('READY')
    await card.getByRole('button', { name: `Confirm dispatch order #${number}` }).click()
    await expect.poll(async () => {
      const result = await kitchen.from('orders').select('status').eq('id', id).single()
      if (result.error) throw result.error
      return result.data?.status
    }, { timeout: 20_000 }).toBe('DISPATCHED')
    // Realtime invalidates the READY queue and refetches the selected Order.
    // The UI must show the persisted transition without reloading the page.
    await expect(detail.getByText('DISPATCHED', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(card.getByRole('button', { name: `Dispatch order #${number}` })).toHaveCount(0)
    const tracked = await customer.from('orders').select('status').eq('id', id).single()
    expect(tracked.error).toBeNull()
    expect(tracked.data?.status).toBe('DISPATCHED')
    const audit = await kitchen.from('order_events').select('id').eq('order_id', id)
      .eq('event_type', 'ORDER_DISPATCHED')
    expect(audit.error).toBeNull()
    expect(audit.data).toHaveLength(1)
  } finally {
    await Promise.allSettled([customer, kitchen].map((client) =>
      client.auth.signOut({ scope: 'local' })))
  }
})
