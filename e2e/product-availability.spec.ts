import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { productAvailabilityFixtureForRepeat } from './support/fixtures.ts'

test('KITCHEN changes Product availability and the persisted state survives reload', async ({
  page,
}, testInfo) => {
  // The first repetition marks its Product unavailable. A second repetition
  // must use a distinct, freshly provisioned Product to remain independent.
  const fixture = productAvailabilityFixtureForRepeat(testInfo.repeatEachIndex)
  await signInThroughUi(page, 'kitchen')

  await expect(
    page.getByRole('heading', {
    level: 2,
    name: 'Product availability',
    exact: true,
    })
  ).toBeVisible()

  const product = page.getByRole('article', {
    name: `Product availability: ${fixture.productName}`, exact: true,
  })

  await expect(product).toBeVisible()
  await expect(product.getByText('Available', { exact: true })).toBeVisible()

  await product
    .getByRole('button', {
      name: `Mark ${fixture.productName} unavailable`,
    })
    .click()

  await expect(product.getByText('Unavailable', { exact: true })).toBeVisible()

  await page.reload()

  const reloadedProduct = page.getByRole('article', {
    name: `Product availability: ${fixture.productName}`, exact: true,
  })

  await expect(reloadedProduct).toBeVisible()
  await expect(
    reloadedProduct.getByText('Unavailable', { exact: true }),
  ).toBeVisible()
})