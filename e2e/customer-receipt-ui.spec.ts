import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { createDispatchedReceiptFixture, receiptTestSignIn } from './support/receiptOrderFixture.ts'

// This E2E is an actual browser CUSTOMER, not a mocked React test.
test('M5-005 CUSTOMER confirms a persisted DISPATCHED Order from Tracking', async ({ page }) => {
  test.setTimeout(90_000)
  const customer = await receiptTestSignIn('customerA')
  const kitchen = await receiptTestSignIn('kitchen')
  try {
    const { orderId, orderNumber } = await createDispatchedReceiptFixture(customer, kitchen, true)
    await signInThroughUi(page, 'customerA')
    await expect(page.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await page.getByRole('button', { name: 'Open tracked order' }).click()
    const detail = page.getByRole('region', { name: 'Selected customer order' })
    const tracked = detail.getByRole('article', { name: `Tracked order #${orderNumber}` })
    await expect(tracked.getByText('DISPATCHED', { exact: true })).toBeVisible()
    await expect(tracked.getByText('M5-005 historical shortage')).toBeVisible()

    const confirm = tracked.getByRole('region', { name: `Receipt confirmation for order #${orderNumber}` })
    await confirm.getByRole('button', { name: `Confirm receipt for order #${orderNumber}` }).click()
    // The first click must be read-only.
    const before = await kitchen.from('orders').select('status').eq('id', orderId).single()
    expect(before.error).toBeNull()
    expect(before.data?.status).toBe('DISPATCHED')
    await confirm.getByRole('button', { name: `Yes, received order #${orderNumber}` }).click()
    await expect(tracked.getByText('DELIVERED', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(tracked.getByText('This Order has been confirmed delivered.')).toBeVisible()
    await expect(confirm).toHaveCount(0)

    const audit = await kitchen.from('order_events').select('id').eq('order_id', orderId)
      .eq('event_type', 'ORDER_DELIVERED')
    expect(audit.error).toBeNull()
    expect(audit.data).toHaveLength(1)
    // Terminal Order is retrievable by authorized ID even when absent from
    // the active list. A browser reload must not restore the command button.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Find order by ID' }).fill(orderId)
    await page.getByRole('button', { name: 'Open tracked order' }).click()
    await expect(page.getByRole('article', { name: `Tracked order #${orderNumber}` })
      .getByText('DELIVERED', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Confirm receipt for order #${orderNumber}` })).toHaveCount(0)
  } finally {
    await Promise.allSettled([customer, kitchen]
      .map((client) => client.auth.signOut({ scope: 'local' })))
  }
})
