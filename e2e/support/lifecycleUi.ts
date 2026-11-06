import { expect, type Locator, type Page } from '@playwright/test'
import { customerOrderingFixture } from './fixtures.ts'

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** CUSTOMER browser writes only. The authenticated UI submits create_order. */
export async function placeLifecycleOrder(page: Page, notes: string): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search products' })
    .fill(customerOrderingFixture.productName)
  await expect(page.getByRole('heading', { name: customerOrderingFixture.productName })).toBeVisible()
  await page.getByRole('button', {
    name: `Add ${customerOrderingFixture.productName} to cart`,
  }).click()
  const increment = page.getByRole('button', {
    name: `Increase ${customerOrderingFixture.productName} quantity`,
  })
  await increment.click()
  await increment.click()
  await expect(page.getByRole('spinbutton', {
    name: `Quantity for ${customerOrderingFixture.productName}`,
  })).toHaveValue('3')
  await page.getByRole('button', { name: 'Review order' }).click()
  await expect(page.getByRole('heading', { name: 'Review order' })).toBeVisible()

  // A fresh future date remains valid across repeated runs; no fixed year.
  const delivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  await page.getByLabel('Requested delivery date and time')
    .fill(delivery.toISOString().slice(0, 16))
  await page.getByRole('textbox', { name: 'Optional notes' }).fill(notes)
  await page.getByRole('button', { name: 'Place order' }).click() // Exactly once.
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()
  const identifier = page.getByText(ORDER_ID)
  await expect(identifier).toBeVisible()
  const id = (await identifier.textContent())?.trim()
  if (!id || !ORDER_ID.test(id)) throw new Error('Confirmation has no valid Order id.')
  return id
}

/**
 * Read-only navigation of the real keyset pages. Realtime must have finished
 * invalidation/refetch; a disabled Next during refresh is not the last page.
 * Never use manual Refresh or page.reload() to find the new Order.
 */
export async function findLifecycleOrderInKitchen(page: Page, view: Locator): Promise<void> {
  const fresh = page.getByText('Realtime: connected. Queue up to date.', { exact: true })
  const refreshing = page.getByText('Refreshing production orders…', { exact: true })
  const next = page.getByRole('navigation', { name: 'Production pages' })
    .getByRole('button', { name: 'Next page' })

  for (let index = 0; index < 100; index += 1) {
    await expect.poll(async () => {
      if (!(await fresh.isVisible()) || await refreshing.isVisible()) return false
      return await view.isVisible() || await next.isEnabled()
    }, {
      timeout: 20_000,
      message: `Order absent and no usable next page at production page ${index + 1}.`,
    }).toBe(true)
    if (await view.isVisible()) return
    await expect(next).toBeEnabled()
    await next.click()
  }
  throw new Error('Order exceeded 100 pages in production queue.')
}

export function lifecycleAmount(item: Locator, label: string): Locator {
  return item.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]')
}
