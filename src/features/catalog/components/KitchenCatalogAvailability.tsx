import { useEffect, useState } from 'react'
import type {
  CatalogGateway,
  CustomerCatalog,
} from '../application/catalogGateway'
import type { ProductAvailabilityGateway } from '../application/productAvailabilityGateway'
import { ProductAvailabilityControl } from './ProductAvailabilityControl'

interface KitchenCatalogAvailabilityProps {
  catalogGateway: CatalogGateway
  availabilityGateway: ProductAvailabilityGateway
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; catalog: CustomerCatalog }

export function KitchenCatalogAvailability({
  catalogGateway,
  availabilityGateway,
}: KitchenCatalogAvailabilityProps) {
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    catalogGateway.loadCatalog().then(
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
  }, [catalogGateway, attempt])

  function retry() {
    setLoadState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }  

  function updateProductAvailability(productId: string, available: boolean) {
    setLoadState((current) => {
      if (current.status !== 'loaded') {
        return current
      }

      return {
        status: 'loaded',
        catalog: {
          ...current.catalog,
          products: current.catalog.products.map((product) =>
            product.id === productId
              ? { ...product, available }
              : product,
          ),
        },
      }
    })
  }

  return (
    <section aria-labelledby="kitchen-availability-heading">
      <h2 id="kitchen-availability-heading">Product availability</h2>

      {loadState.status === 'loading' && (
        <p role="status" aria-live="polite">
          Loading catalog…
        </p>
      )}

      {loadState.status === 'error' && (
        <div role="alert">
            <p>We could not load Product availability. Please try again.</p>
            <button type="button" onClick={retry}>
            Retry
            </button>
        </div>
      )}

      {loadState.status === 'loaded' &&
        (loadState.catalog.products.length === 0 ? (
          <p>There are no products available for Kitchen operations.</p>
        ) : (
          <ul aria-label="Kitchen product availability">
            {loadState.catalog.products.map((product) => (
              <li key={product.id}>
                <article
                  aria-label={`Product availability: ${product.name}`}
                >
                  <h3>{product.name}</h3>

                  <ProductAvailabilityControl
                    productId={product.id}
                    productName={product.name}
                    available={product.available}
                    gateway={availabilityGateway}
                    onAvailabilityChanged={(available) =>
                      updateProductAvailability(product.id, available)
                    }
                  />
                </article>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}