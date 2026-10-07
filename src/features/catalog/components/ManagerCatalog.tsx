import { useEffect, useState } from 'react'
import type {
  ManagerCatalog,
  ManagerCatalogCategory,
  ManagerCatalogGateway,
  ManagerCatalogProduct,
} from '../application/managerCatalogGateway'
import type {
  CategoryAdminInput,
  ProductCreationInput,
  ProductUpdateInput,
} from '../domain/managerCatalogSchema'
import { CategoryForm, ProductForm } from './ManagerCatalogForms'

interface ManagerCatalogAdministrationProps {
  gateway: ManagerCatalogGateway
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; savedButNotRefreshed: boolean }
  | { status: 'loaded'; catalog: ManagerCatalog }

type ActiveForm =
  | { entity: 'category'; id: string | null }
  | { entity: 'product'; id: string | null }
  | null

export function ManagerCatalogAdministration({ gateway }: ManagerCatalogAdministrationProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)
  const [mutationPending, setMutationPending] = useState(false)
  const [mutationFailed, setMutationFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    gateway.loadManagerCatalog().then(
      (catalog) => {
        if (!cancelled) {
          setLoadState({ status: 'loaded', catalog })
        }
      },
      () => {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            savedButNotRefreshed: false,
          })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [attempt, gateway])

  async function persistAndReload(operation: () => Promise<unknown>) {
    setMutationFailed(false)
    setMutationPending(true)

    try {
      await operation()
      setActiveForm(null)
      setLoadState({ status: 'loading' })

      try {
        const catalog = await gateway.loadManagerCatalog()
        setLoadState({ status: 'loaded', catalog })
      } catch {
        setLoadState({
          status: 'error',
          savedButNotRefreshed: true,
        })
      }
    } catch {
      setMutationFailed(true)
    } finally {
      setMutationPending(false)
    }
  }

  function saveCategory(id: string | null, input: CategoryAdminInput) {
    return persistAndReload(() => id === null
      ? gateway.createCategory(input)
      : gateway.updateCategory(id, input))
  }

  function saveProduct(
    id: string | null,
    input: ProductCreationInput,
  ) {
    if (id === null) {
      return persistAndReload(() => gateway.createProduct(input))
    }

    const updateInput: ProductUpdateInput = {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      unitCode: input.unitCode,
      quantityStep: input.quantityStep,
      active: input.active,
    }
    return persistAndReload(() => gateway.updateProduct(id, updateInput))
  }

  function changeCategoryStatus(category: ManagerCatalogCategory, active: boolean) {
    return persistAndReload(() => gateway.updateCategory(category.id, {
      name: category.name,
      description: category.description,
      active,
      displayOrder: category.displayOrder,
    }))
  }

  function changeProductStatus(product: ManagerCatalogProduct, active: boolean) {
    return persistAndReload(() => gateway.updateProduct(product.id, {
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      unitCode: product.unitCode,
      quantityStep: product.quantityStep,
      active,
    }))
  }

  return (
    <section aria-labelledby="manager-catalog-heading">
      <h2 id="manager-catalog-heading">Catalog administration</h2>
      {loadState.status === 'loading' && (
        <p role="status" aria-live="polite">Loading catalog…</p>
      )}
      {loadState.status === 'error' && (
        <div role="alert">
          <p>{loadState.savedButNotRefreshed
            ? 'Changes were saved, but the catalog could not be refreshed.'
            : 'We could not load the Manager catalog. Please try again.'}</p>
          <button
            type="button"
            onClick={() => {
              setLoadState({ status: 'loading' })
              setAttempt((current) => current + 1)
            }}
          >
            Retry
          </button>
        </div>
      )}
      {mutationFailed && (
        <p role="alert">Unable to save catalog changes. Please try again.</p>
      )}
      {loadState.status === 'loaded' && (
        <>
          <section aria-labelledby="manager-categories-heading">
            <h3 id="manager-categories-heading">Categories</h3>
            <button type="button" disabled={mutationPending} onClick={() => setActiveForm({ entity: 'category', id: null })}>
              Create category
            </button>
            {activeForm?.entity === 'category' && activeForm.id === null && (
              <CategoryForm pending={mutationPending} onSave={(input) => saveCategory(null, input)} onCancel={() => setActiveForm(null)} />
            )}
            {loadState.catalog.categories.length === 0 ? (
              <p>No categories yet.</p>
            ) : (
              <ul aria-label="Managed categories">
                {loadState.catalog.categories.map((category) => (
                  <li key={category.id}>
                    <article aria-label={`Category: ${category.name}`}>
                      <h4>{category.name}</h4>
                      {category.description !== null && <p>{category.description}</p>}
                      <p>Display order: {category.displayOrder}</p>
                      <p>{category.active ? 'Active' : 'Inactive'}</p>
                      <button type="button" disabled={mutationPending} onClick={() => setActiveForm({ entity: 'category', id: category.id })}>Edit category</button>
                      <button type="button" disabled={mutationPending} onClick={() => void changeCategoryStatus(category, !category.active)}>
                        {category.active ? 'Deactivate category' : 'Reactivate category'}
                      </button>
                      {activeForm?.entity === 'category' && activeForm.id === category.id && (
                        <CategoryForm initialValue={category} pending={mutationPending} onSave={(input) => saveCategory(category.id, input)} onCancel={() => setActiveForm(null)} />
                      )}
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="manager-products-heading">
            <h3 id="manager-products-heading">Products</h3>
            <button type="button" disabled={mutationPending || loadState.catalog.categories.length === 0} onClick={() => setActiveForm({ entity: 'product', id: null })}>
              Create product
            </button>
            {loadState.catalog.categories.length === 0 && <p>Create a category before adding a product.</p>}
            {activeForm?.entity === 'product' && activeForm.id === null && (
              <ProductForm categories={loadState.catalog.categories} pending={mutationPending} onSave={(input) => saveProduct(null, input)} onCancel={() => setActiveForm(null)} />
            )}
            {loadState.catalog.products.length === 0 ? (
              <p>No products yet.</p>
            ) : (
              <ul aria-label="Managed products">
                {loadState.catalog.products.map((product) => {
                  const categoryName = loadState.catalog.categories.find(({ id }) => id === product.categoryId)?.name ?? 'Unknown category'
                  return (
                    <li key={product.id}>
                      <article aria-label={`Product: ${product.name}`}>
                        <h4>{product.name}</h4>
                        <p>Category: {categoryName}</p>
                        {product.description !== null && <p>{product.description}</p>}
                        <p>Unit: {product.unitCode}</p>
                        <p>Quantity step: {product.quantityStep}</p>
                        <p>{product.active ? 'Active' : 'Inactive'}</p>
                        <p>{product.available ? 'Available' : 'Unavailable'}</p>
                        <button type="button" disabled={mutationPending} onClick={() => setActiveForm({ entity: 'product', id: product.id })}>Edit product</button>
                        <button type="button" disabled={mutationPending} onClick={() => void changeProductStatus(product, !product.active)}>
                          {product.active ? 'Deactivate product' : 'Reactivate product'}
                        </button>
                        {activeForm?.entity === 'product' && activeForm.id === product.id && (
                          <ProductForm categories={loadState.catalog.categories} initialValue={product} pending={mutationPending} onSave={(input) => saveProduct(product.id, input)} onCancel={() => setActiveForm(null)} />
                        )}
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
