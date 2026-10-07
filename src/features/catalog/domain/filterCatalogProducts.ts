import type {
  CatalogCategory,
  CatalogProduct,
} from '../application/catalogGateway'

export interface CatalogFilters {
  searchTerm: string
  categoryId: string
}

/** UX filtering over rows already returned by the authorized catalog query. */
export function filterCatalogProducts(
  products: readonly CatalogProduct[],
  categories: readonly CatalogCategory[],
  filters: CatalogFilters,
): CatalogProduct[] {
  const eligibleCategoryIds = new Set(categories.map(({ id }) => id))
  const searchTerm = filters.searchTerm.trim().toLowerCase()

  return products.filter((product) => {
    if (!eligibleCategoryIds.has(product.categoryId)) {
      return false
    }

    if (filters.categoryId !== 'all' && product.categoryId !== filters.categoryId) {
      return false
    }

    return product.name.toLowerCase().includes(searchTerm)
  })
}
