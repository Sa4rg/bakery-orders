import { expect, test } from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'

test('authorized CUSTOMER browses and filters the RLS-protected catalog', async ({
  page,
}) => {
  await signInThroughUi(page, 'customerA')

  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Country Sourdough' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Chocolate Croissant' }),
  ).toBeVisible()
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Ham and Cheese Croissant' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Winter Spice Loaf' }),
  ).toHaveCount(0)

  const category = page.getByRole('combobox', { name: 'Category' })
  await expect(
    category.getByRole('option', { name: 'Seasonal Archive' }),
  ).toHaveCount(0)

  await category.selectOption({ label: 'Cakes' })
  await expect(page.getByRole('heading', { name: 'Carrot Cake' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Country Sourdough' }),
  ).toHaveCount(0)

  await category.selectOption({ label: 'Pastries' })
  await page
    .getByRole('searchbox', { name: 'Search products' })
    .fill('  CROISSANT  ')

  await expect(
    page.getByRole('heading', { name: 'Butter Croissant' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Chocolate Croissant' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cinnamon Roll' })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Country Sourdough' }),
  ).toHaveCount(0)
})
