import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CustomerCatalog as CustomerCatalogData } from '../application/catalogGateway'
import {
  createFakeCatalogGateway,
  type CatalogLoadOutcome,
} from '../testing/fakeCatalogGateway'
import { CustomerCatalog } from './CustomerCatalog'

const catalog: CustomerCatalogData = {
  categories: [
    { id: 'bread', name: 'Bread', description: null, displayOrder: 0 },
    { id: 'pastries', name: 'Pastries', description: null, displayOrder: 1 },
    { id: 'savory', name: 'Savory', description: null, displayOrder: 2 },
  ],
  products: [
    {
      id: 'sourdough',
      categoryId: 'bread',
      name: 'Country Sourdough',
      description: 'Naturally leavened loaf.',
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
    {
      id: 'butter-croissant',
      categoryId: 'pastries',
      name: 'Butter Croissant',
      description: 'Flaky and buttery.',
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
    {
      id: 'chocolate-croissant',
      categoryId: 'pastries',
      name: 'Chocolate Croissant',
      description: 'Filled with dark chocolate.',
      unitCode: 'UNIT',
      quantityStep: 1,
      available: false,
    },
    {
      id: 'empanada',
      categoryId: 'savory',
      name: 'Cheese Empanada',
      description: null,
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
  ],
}

function renderCatalog(outcomes: CatalogLoadOutcome[] = [catalog]) {
  const fake = createFakeCatalogGateway(outcomes)
  const view = render(<CustomerCatalog gateway={fake.gateway} />)

  return { ...view, fake }
}

describe('CustomerCatalog', () => {
  it('shows an accessible loading state until the catalog request completes', async () => {
    let resolveCatalog: ((value: CustomerCatalogData) => void) | undefined
    const pending = new Promise<CustomerCatalogData>((resolve) => {
      resolveCatalog = resolve
    })
    renderCatalog([pending])

    expect(screen.getByRole('status')).toHaveTextContent('Loading catalog')
    expect(screen.queryByRole('heading', { name: 'Country Sourdough' })).toBeNull()

    await act(async () => resolveCatalog?.(catalog))

    expect(
      await screen.findByRole('heading', { name: 'Country Sourdough' }),
    ).toBeVisible()
  })

  it('renders product names, descriptions, and unit information without prices or cart actions', async () => {
    renderCatalog()

    expect(
      await screen.findByRole('heading', { name: 'Country Sourdough' }),
    ).toBeVisible()
    expect(screen.getByText('Naturally leavened loaf.')).toBeVisible()
    expect(screen.getAllByText(/Unit: UNIT/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/price|\$|£|€/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull()
  })

  it('keeps unavailable products visible with explicit availability text', async () => {
    renderCatalog()

    expect(
      await screen.findByRole('heading', { name: 'Chocolate Croissant' }),
    ).toBeVisible()
    expect(screen.getByText('Unavailable')).toBeVisible()
  })

  it('searches product names case-insensitively and ignores surrounding whitespace', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Country Sourdough' })

    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), '  cRoIsSaNt  ')

    expect(screen.getByRole('heading', { name: 'Butter Croissant' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Chocolate Croissant' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Country Sourdough' })).toBeNull()
  })

  it('filters products by the selected category', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Country Sourdough' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'bread')

    expect(screen.getByRole('heading', { name: 'Country Sourdough' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Butter Croissant' })).toBeNull()
  })

  it('combines category filtering with product search', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Country Sourdough' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'pastries')
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'croissant')

    expect(screen.getByRole('heading', { name: 'Butter Croissant' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Chocolate Croissant' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Country Sourdough' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Cheese Empanada' })).toBeNull()
  })

  it('shows a distinct empty state when filters match no products', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Country Sourdough' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'bread')
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'croissant')

    expect(
      screen.getByText('No products match your search and category filters.'),
    ).toBeVisible()
  })

  it('shows an intentional empty state when the catalog has no visible products', async () => {
    renderCatalog([{ categories: catalog.categories, products: [] }])

    expect(
      await screen.findByText('There are no products in the catalog yet.'),
    ).toBeVisible()
  })

  it('shows a generic error and retries by loading the catalog again', async () => {
    const user = userEvent.setup()
    const { fake } = renderCatalog([
      new Error('PostgREST internal details and SQL'),
      catalog,
    ])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the catalog. Please try again.',
    )
    expect(screen.queryByText(/PostgREST|SQL|internal details/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: 'Country Sourdough' }),
    ).toBeVisible()
    expect(fake.loadCalls).toBe(2)
  })
})
