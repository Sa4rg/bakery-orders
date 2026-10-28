import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import { managerCatalogFixtureForRepeat } from './support/fixtures.ts'

test('MANAGER administers catalog data through grants and RLS', async ({ page }, testInfo) => {
  // Repeat executions can overlap when fullyParallel is enabled. Give each
  // repeat its own Category and Product instead of reusing mutable DB rows.
  const fixture = managerCatalogFixtureForRepeat(testInfo.repeatEachIndex)
  await signInThroughUi(page, 'manager')

  await expect(page.getByRole('heading', { name: 'Catalog administration' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Category: Seasonal Archive' })).toContainText('Inactive')

  await page.getByRole('button', { name: 'Create category' }).click()
  await page.getByLabel('Category name').fill(fixture.categoryName)
  await page.getByLabel('Category description').fill('Reserved Manager administration E2E data.')
  await page.getByLabel('Display order').fill('100')
  await page.getByRole('button', { name: 'Save category' }).click()

  const createdCategory = page.getByRole('article', {
    name: `Category: ${fixture.categoryName}`, exact: true,
  })
  await expect(createdCategory).toBeVisible()

  await page.getByRole('button', { name: 'Create product' }).click()
  await page.getByLabel('Product category').selectOption({ label: fixture.categoryName })
  await page.getByLabel('Product name').fill(fixture.productName)
  await page.getByLabel('Product description').fill('Reserved Manager administration E2E data.')
  await page.getByLabel('Unit code').fill('UNIT')
  await page.getByLabel('Quantity step').fill('1')
  await page.getByLabel('Initial availability').selectOption('true')
  await page.getByRole('button', { name: 'Save product' }).click()

  const createdProduct = page.getByRole('article', {
    name: `Product: ${fixture.productName}`, exact: true,
  })
  await expect(createdProduct).toContainText('Available')
  await createdProduct.getByRole('button', { name: 'Edit product' }).click()
  await page.getByLabel('Product description').fill('Updated by the Manager administration E2E.')
  await page.getByRole('button', { name: 'Save product' }).click()
  const updatedProduct = page.getByRole('article', {
    name: `Product: ${fixture.productName}`, exact: true,
  })
  await expect(updatedProduct).toContainText('Updated by the Manager administration E2E.')
  await updatedProduct.getByRole('button', { name: 'Deactivate product' }).click()

  const persistedProduct = page.getByRole('article', {
    name: `Product: ${fixture.productName}`, exact: true,
  })
  await expect(persistedProduct).toContainText('Inactive')
  await expect(persistedProduct).toContainText('Available')
  await expect(persistedProduct.getByRole('button', { name: 'Reactivate product' })).toBeVisible()
})
