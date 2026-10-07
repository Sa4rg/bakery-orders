import { useEffect, useState } from 'react'
import type {
  CatalogGateway,
  CustomerCatalog as CustomerCatalogData,
} from '../application/catalogGateway'
import { filterCatalogProducts } from '../domain/filterCatalogProducts'

interface CustomerCatalogProps {
  gateway: CatalogGateway
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; catalog: CustomerCatalogData }

export function CustomerCatalog({ gateway }: CustomerCatalogProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryId, setCategoryId] = useState('all')

  useEffect(() => {
    let cancelled = false

    gateway.loadCatalog().then(
      (catalog) => {
        if (!cancelled) {
          setLoadState({ status: 'loaded', catalog })
        }
      },
      () => {
        if (!cancelled) {
          setLoadState({ status: 'error' })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [attempt, gateway])

  function retry() {
    setLoadState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  const eligibleProducts =
    loadState.status === 'loaded'
      ? filterCatalogProducts(loadState.catalog.products, loadState.catalog.categories, {
          searchTerm: '',
          categoryId: 'all',
        })
      : []
  const filteredProducts =
    loadState.status === 'loaded'
      ? filterCatalogProducts(loadState.catalog.products, loadState.catalog.categories, {
          searchTerm,
          categoryId,
        })
      : []

  return (
    <section aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Catalog</h2>

      {loadState.status === 'loading' && (
        <p role="status" aria-live="polite">
          Loading catalog…
        </p>
      )}

      {loadState.status === 'error' && (
        <div role="alert">
          <p>We could not load the catalog. Please try again.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {loadState.status === 'loaded' && (
        <>
          <div>
            <label htmlFor="catalog-search">Search products</label>
            <input
              id="catalog-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
            />
          </div>

          <div>
            <label htmlFor="catalog-category">Category</label>
            <select
              id="catalog-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
            >
              <option value="all">All categories</option>
              {loadState.catalog.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {eligibleProducts.length === 0 ? (
            <p>There are no products in the catalog yet.</p>
          ) : filteredProducts.length === 0 ? (
            <p>No products match your search and category filters.</p>
          ) : (
            <ul aria-label="Catalog products">
              {filteredProducts.map((product) => (
                <li key={product.id}>
                  <article>
                    <h3>{product.name}</h3>
                    {product.description !== null && <p>{product.description}</p>}
                    <p>
                      Unit: {product.unitCode} · order step: {product.quantityStep}
                    </p>
                    <p>{product.available ? 'Available' : 'Unavailable'}</p>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
