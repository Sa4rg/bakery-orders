import { describe, expect, it } from 'vitest'
import type { CustomerCatalog } from '../application/catalogGateway'
import { filterCatalogProducts } from './filterCatalogProducts'

const catalog: CustomerCatalog = {
  categories: [
    { id: 'bread', name: 'Bread', description: null, displayOrder: 0 },
    { id: 'pastries', name: 'Pastries', description: null, displayOrder: 1 },
  ],
  products: [
    {
      id: 'loaf',
      categoryId: 'bread',
      name: 'Country Sourdough',
      description: null,
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
    {
      id: 'croissant',
      categoryId: 'pastries',
      name: 'Chocolate Croissant',
      description: null,
      unitCode: 'UNIT',
      quantityStep: 1,
      available: false,
    },
  ],
}

describe('filterCatalogProducts', () => {
  it('returns products in categories from the authorized catalog when no filters are set', () => {
    expect(
      filterCatalogProducts(catalog.products, catalog.categories, {
        searchTerm: '',
        categoryId: 'all',
      }),
    ).toEqual(catalog.products)
  })

  it('combines trimmed case-insensitive name search with a stable category ID', () => {
    expect(
      filterCatalogProducts(catalog.products, catalog.categories, {
        searchTerm: '  CROISSANT  ',
        categoryId: 'pastries',
      }).map(({ id }) => id),
    ).toEqual(['croissant'])
  })

  it('excludes products whose category is not in the loaded catalog categories', () => {
    const productWithUnlistedCategory = {
      ...catalog.products[0]!,
      id: 'unlisted',
      categoryId: 'not-loaded',
    }

    expect(
      filterCatalogProducts(
        [productWithUnlistedCategory],
        catalog.categories,
        { searchTerm: '', categoryId: 'all' },
      ),
    ).toEqual([])
  })
})
