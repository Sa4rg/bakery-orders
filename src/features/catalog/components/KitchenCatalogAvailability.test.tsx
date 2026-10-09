import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  CatalogGateway,
  CustomerCatalog,
} from '../application/catalogGateway'
import type { ProductAvailabilityGateway } from '../application/productAvailabilityGateway'
import { KitchenCatalogAvailability } from './KitchenCatalogAvailability'

const productId = '83000000-0000-4000-8000-000000000001'
const categoryId = '82000000-0000-4000-8000-000000000001'

const catalog: CustomerCatalog = {
  categories: [
    {
      id: categoryId,
      name: 'Bread',
      description: null,
      displayOrder: 1,
    },
  ],
  products: [
    {
      id: productId,
      categoryId,
      name: 'Sourdough',
      description: 'Country loaf.',
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
  ],
}

function createCatalogGateway(): CatalogGateway {
  return {
    loadCatalog: vi.fn(async () => catalog),
  }
}

function createAvailabilityGateway(): ProductAvailabilityGateway {
  return {
    setAvailability: vi.fn(async (_productId, available) => available),
  }
}

describe('KitchenCatalogAvailability', () => {
  it('loads the operational catalog and updates availability from the persisted result', async () => {
    const user = userEvent.setup()
    const catalogGateway = createCatalogGateway()
    const availabilityGateway = createAvailabilityGateway()

    render(
      <KitchenCatalogAvailability
        catalogGateway={catalogGateway}
        availabilityGateway={availabilityGateway}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading catalog')

    const product = await screen.findByRole('article', {
      name: 'Product availability: Sourdough',
    })

    expect(within(product).getByText('Available')).toBeVisible()

    await user.click(
      within(product).getByRole('button', {
        name: 'Mark Sourdough unavailable',
      }),
    )

    expect(availabilityGateway.setAvailability).toHaveBeenCalledWith(
      productId,
      false,
    )

    expect(within(product).getByText('Unavailable')).toBeVisible()
    expect(
      within(product).getByRole('button', {
        name: 'Mark Sourdough available',
      }),
    ).toBeVisible()
  })

  it('retries after a catalog load failure without exposing provider details', async () => {
    const user = userEvent.setup()

    const loadCatalog = vi
      .fn<CatalogGateway['loadCatalog']>()
      .mockRejectedValueOnce(new Error('PostgREST private SQL detail'))
      .mockResolvedValueOnce(catalog)

    const catalogGateway: CatalogGateway = {
      loadCatalog,
    }

    render(
      <KitchenCatalogAvailability
        catalogGateway={catalogGateway}
        availabilityGateway={createAvailabilityGateway()}
      />,
    )

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent(
      'We could not load Product availability. Please try again.',
    )
    expect(screen.queryByText(/PostgREST|SQL detail/i)).toBeNull()

    await user.click(
      screen.getByRole('button', {
        name: 'Retry',
      }),
    )

    expect(
      await screen.findByRole('article', {
        name: 'Product availability: Sourdough',
      }),
    ).toBeVisible()

    expect(loadCatalog).toHaveBeenCalledTimes(2)
  })
})