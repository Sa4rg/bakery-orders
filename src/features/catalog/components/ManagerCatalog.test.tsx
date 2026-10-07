import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  ManagerCatalog,
  ManagerCatalogGateway,
} from '../application/managerCatalogGateway'
import { ManagerCatalogAdministration } from './ManagerCatalog'

const categoryId = '71000000-0000-4000-8000-000000000001'
const productId = '72000000-0000-4000-8000-000000000001'
const catalog: ManagerCatalog = {
  categories: [
    { id: categoryId, name: 'Bread', description: 'Baked daily.', active: true, displayOrder: 1 },
    { id: '71000000-0000-4000-8000-000000000002', name: 'Archive', description: null, active: false, displayOrder: 9 },
  ],
  products: [
    { id: productId, categoryId, name: 'Sourdough', description: 'Country loaf.', unitCode: 'UNIT', quantityStep: 1, active: true, available: false },
    { id: '72000000-0000-4000-8000-000000000002', categoryId, name: 'Old Roll', description: null, unitCode: 'TRAY', quantityStep: 0.5, active: false, available: true },
  ],
}

function createGateway(outcomes: Array<ManagerCatalog | Error | Promise<ManagerCatalog>> = [catalog]) {
  let loadIndex = 0
  const gateway: ManagerCatalogGateway = {
    loadManagerCatalog: vi.fn(async () => {
      const outcome = outcomes[Math.min(loadIndex++, outcomes.length - 1)]
      if (outcome instanceof Error) throw outcome
      return await outcome ?? { categories: [], products: [] }
    }),
    createCategory: vi.fn(async () => 'new-category'),
    updateCategory: vi.fn(async () => undefined),
    createProduct: vi.fn(async () => 'new-product'),
    updateProduct: vi.fn(async () => undefined),
  }

  return gateway
}

describe('ManagerCatalogAdministration', () => {
  it('shows loading until the Manager catalog arrives', async () => {
    let resolve: ((value: ManagerCatalog) => void) | undefined
    const gateway = createGateway([
      new Promise<ManagerCatalog>((done) => { resolve = done }),
    ])
    render(<ManagerCatalogAdministration gateway={gateway} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading catalog')
    expect(screen.queryByText('No categories yet.')).toBeNull()

    await act(async () => resolve?.(catalog))
    expect(await screen.findByRole('heading', { name: 'Sourdough' })).toBeVisible()
  })

  it('shows active and inactive records and keeps existing availability read-only', async () => {
    render(<ManagerCatalogAdministration gateway={createGateway()} />)

    expect(await screen.findByText('Archive')).toBeVisible()
    expect(screen.getAllByText('Inactive', { selector: 'p' })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Old Roll' })).toBeVisible()
    expect(screen.getAllByText('Unavailable', { exact: true })).toHaveLength(1)
    expect(screen.getByText('Available', { exact: true })).toBeVisible()
    expect(screen.queryByLabelText(/availability/i)).toBeNull()
  })

  it('creates a Category and reloads authoritative catalog after persistence', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([catalog, catalog])
    render(<ManagerCatalogAdministration gateway={gateway} />)
    await screen.findByText('Bread')

    await user.click(screen.getByRole('button', { name: 'Create category' }))
    await user.type(screen.getByLabelText('Category name'), 'Seasonal')
    await user.type(screen.getByLabelText('Category description'), 'Limited range')
    await user.clear(screen.getByLabelText('Display order'))
    await user.type(screen.getByLabelText('Display order'), '3')
    await user.click(screen.getByRole('button', { name: 'Save category' }))

    expect(gateway.createCategory).toHaveBeenCalledWith({ name: 'Seasonal', description: 'Limited range', active: true, displayOrder: 3 })
    expect(gateway.loadManagerCatalog).toHaveBeenCalledTimes(2)
  })

  it('edits and deactivates a Category, and reactivates an inactive Category', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    render(<ManagerCatalogAdministration gateway={gateway} />)
    await screen.findByText('Bread')
    const bread = screen.getByRole('article', { name: 'Category: Bread' })
    await user.click(within(bread).getByRole('button', { name: 'Edit category' }))
    expect(screen.getByLabelText('Category name')).toHaveValue('Bread')
    await user.clear(screen.getByLabelText('Category name'))
    await user.type(screen.getByLabelText('Category name'), 'Daily Bread')
    await user.click(screen.getByRole('button', { name: 'Save category' }))
    await waitFor(() => expect(gateway.updateCategory).toHaveBeenCalledWith(categoryId, expect.objectContaining({ name: 'Daily Bread', active: true })))

    await user.click(within(bread).getByRole('button', { name: 'Deactivate category' }))
    await waitFor(() => expect(gateway.updateCategory).toHaveBeenLastCalledWith(categoryId, expect.objectContaining({ active: false })))
    const archive = screen.getByRole('article', { name: 'Category: Archive' })
    await user.click(within(archive).getByRole('button', { name: 'Reactivate category' }))
    await waitFor(() => expect(gateway.updateCategory).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ active: true })))
  })

  it('creates a Product with explicit initial availability', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    render(<ManagerCatalogAdministration gateway={gateway} />)
    await screen.findByText('Bread')
    await user.click(screen.getByRole('button', { name: 'Create product' }))
    await user.selectOptions(screen.getByLabelText('Product category'), categoryId)
    await user.type(screen.getByLabelText('Product name'), 'Seeded Rye')
    await user.type(screen.getByLabelText('Unit code'), 'LOAF')
    await user.clear(screen.getByLabelText('Quantity step'))
    await user.type(screen.getByLabelText('Quantity step'), '0.5')
    await user.selectOptions(screen.getByLabelText('Initial availability'), 'false')
    await user.click(screen.getByRole('button', { name: 'Save product' }))

    expect(gateway.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Seeded Rye', categoryId, quantityStep: 0.5, available: false }))
  })

  it('edits/deactivates and reactivates Products without sending availability', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    render(<ManagerCatalogAdministration gateway={gateway} />)
    await screen.findByRole('heading', { name: 'Sourdough' })
    const sourdough = screen.getByRole('article', { name: 'Product: Sourdough' })
    await user.click(within(sourdough).getByRole('button', { name: 'Edit product' }))
    expect(screen.queryByLabelText('Initial availability')).toBeNull()
    await user.clear(screen.getByLabelText('Product name'))
    await user.type(screen.getByLabelText('Product name'), 'Updated Sourdough')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(gateway.updateProduct).toHaveBeenCalledWith(productId, expect.objectContaining({ name: 'Updated Sourdough', active: true })))
    expect(vi.mocked(gateway.updateProduct).mock.calls[0]?.[1]).not.toHaveProperty(
      'available',
    )

    await user.click(within(sourdough).getByRole('button', { name: 'Deactivate product' }))
    await waitFor(() => expect(gateway.updateProduct).toHaveBeenLastCalledWith(productId, expect.objectContaining({ active: false })))
    const oldRoll = screen.getByRole('article', { name: 'Product: Old Roll' })
    await user.click(within(oldRoll).getByRole('button', { name: 'Reactivate product' }))
    expect(
      vi.mocked(gateway.updateProduct).mock.calls.at(-1)?.[1],
    ).not.toHaveProperty('available')

    expect(vi.mocked(gateway.updateProduct).mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({ active: true }),
    )
  })

  it('disables duplicate submission while a mutation is pending', async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    const gateway = createGateway()
    vi.mocked(gateway.createCategory).mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve('created')
    }))
    render(<ManagerCatalogAdministration gateway={gateway} />)
    await screen.findByText('Bread')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    await user.type(screen.getByLabelText('Category name'), 'Temporary')
    const submit = screen.getByRole('button', { name: 'Save category' })
    await user.click(submit)
    expect(submit).toBeDisabled()
    expect(gateway.createCategory).toHaveBeenCalledTimes(1)
    await act(async () => finish?.())
  })

  it('shows a generic accessible mutation failure without provider details', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    vi.mocked(gateway.createCategory).mockRejectedValue(new Error('PostgREST secret SQL detail'))
    render(<ManagerCatalogAdministration gateway={gateway} />)
    await screen.findByText('Bread')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    await user.type(screen.getByLabelText('Category name'), 'Temporary')
    await user.click(screen.getByRole('button', { name: 'Save category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save catalog changes. Please try again.')
    expect(screen.queryByText(/PostgREST|SQL detail/i)).toBeNull()
    expect(screen.getByLabelText('Category name')).toHaveValue('Temporary')
  })

  it('retries a load failure and shows empty states for both sections', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([new Error('private detail'), { categories: [], products: [] }])
    render(<ManagerCatalogAdministration gateway={gateway} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the Manager catalog.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No categories yet.')).toBeVisible()
    expect(screen.getByText('No products yet.')).toBeVisible()
    expect(gateway.loadManagerCatalog).toHaveBeenCalledTimes(2)
  })
})
