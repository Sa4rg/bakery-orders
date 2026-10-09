import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  buildMembership,
  buildProfile,
  createFakeAuthGateway,
  customerUserId,
} from '../features/auth/testing/fakeAuthGateway'
import type { CustomerCatalog } from '../features/catalog/application/catalogGateway'
import type { ManagerCatalogGateway } from '../features/catalog/application/managerCatalogGateway'
import type { ProductAvailabilityGateway } from '../features/catalog/application/productAvailabilityGateway'
import { createFakeCatalogGateway } from '../features/catalog/testing/fakeCatalogGateway'

import App from './App'

const emptyCatalog: CustomerCatalog = { categories: [], products: [] }

const productAvailabilityGateway: ProductAvailabilityGateway = {
  setAvailability: async (_productId, available) => available,
}

const managerCatalogGateway: ManagerCatalogGateway = {
  loadManagerCatalog: async () => ({ categories: [], products: [] }),
  createCategory: async () => 'category-id',
  updateCategory: async () => undefined,
  createProduct: async () => 'product-id',
  updateProduct: async () => undefined,
}

function renderReadyApp(authGateway = createFakeAuthGateway()) {
  const catalogFake = createFakeCatalogGateway([emptyCatalog])

  return render(
    <App
      bootstrap={{
        status: 'ready',
        authGateway,
        catalogGateway: catalogFake.gateway,
        managerCatalogGateway,
        productAvailabilityGateway,
      }}
    />,
  )
}

describe('App', () => {
  it('renders the application heading', () => {
    renderReadyApp()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Bakery Orders' }),
    ).toBeInTheDocument()
  })

  it('renders a safe configuration error when browser configuration is missing', () => {
    render(
      <App
        bootstrap={{
          status: 'misconfigured',
          variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Bakery Orders' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The application is not configured.',
    )
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeVisible()
    expect(screen.getByText('VITE_SUPABASE_PUBLISHABLE_KEY')).toBeVisible()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('shows the login form when signed out', async () => {
    const gateway = createFakeAuthGateway()
    renderReadyApp(gateway)

    act(() => gateway.emit(null))

    expect(await screen.findByLabelText('Email')).toBeVisible()
  })

  it('communicates that the foundation is ready inside the protected shell', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ displayName: 'Mia Manager', role: 'MANAGER' }),
    })
    renderReadyApp(gateway)

    act(() => gateway.emit({ userId: customerUserId }))

    expect(await screen.findByText('Application foundation ready.')).toBeVisible()
    expect(screen.getByText('Mia Manager')).toBeVisible()
    expect(screen.getByText('MANAGER')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  it('does not expose session tokens or secrets in the protected shell', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'CUSTOMER' }),
      memberships: [buildMembership()],
    })
    const { container } = renderReadyApp(gateway)

    act(() => gateway.emit({ userId: customerUserId }))
    await screen.findByText('Application foundation ready.')

    expect(container.textContent).not.toMatch(/token|secret|sb_/i)
  })

  it('signs out locally from the protected shell and returns to the login form', async () => {
    const user = userEvent.setup()
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'KITCHEN' }),
    })
    renderReadyApp(gateway)

    act(() => gateway.emit({ userId: customerUserId }))
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(gateway.signOutLocal).toHaveBeenCalledTimes(1)
    expect(await screen.findByLabelText('Email')).toBeVisible()
  })

  it('reports a failed sign-out without leaving the protected shell', async () => {
    const user = userEvent.setup()
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'KITCHEN' }),
      signOutSucceeds: false,
    })
    renderReadyApp(gateway)

    act(() => gateway.emit({ userId: customerUserId }))
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to sign out. Please try again.',
    )
    expect(screen.getByText('Application foundation ready.')).toBeVisible()
  })

  it('shows the catalog to CUSTOMER while preserving the protected session controls', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'CUSTOMER' }),
      memberships: [buildMembership()],
    })
    renderReadyApp(gateway)

    act(() => gateway.emit({ userId: customerUserId }))

    expect(await screen.findByRole('heading', { name: 'Catalog' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  it('shows KITCHEN availability operations through the trusted availability gateway', async () => {
    const user = userEvent.setup()

    const authGateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'KITCHEN' }),
    })

    const catalog: CustomerCatalog = {
      categories: [
        {
          id: '82000000-0000-4000-8000-000000000001',
          name: 'Bread',
          description: null,
          displayOrder: 1,
        },
      ],
      products: [
        {
          id: '83000000-0000-4000-8000-000000000001',
          categoryId: '82000000-0000-4000-8000-000000000001',
          name: 'Sourdough',
          description: 'Country loaf.',
          unitCode: 'UNIT',
          quantityStep: 1,
          available: true,
        },
      ],
    }

    const catalogFake = createFakeCatalogGateway([catalog])

    const setAvailability = vi.fn(
      async (_productId: string, available: boolean) => available,
    )

    const availabilityGateway: ProductAvailabilityGateway = {
      setAvailability,
    }

    render(
      <App
        bootstrap={{
          status: 'ready',
          authGateway,
          catalogGateway: catalogFake.gateway,
          managerCatalogGateway,
          productAvailabilityGateway: availabilityGateway,
        }}
      />,
    )

    act(() => authGateway.emit({ userId: customerUserId }))

    expect(
      await screen.findByRole('heading', {
        name: 'Product availability',
      }),
    ).toBeVisible()

    expect(
      screen.queryByRole('heading', {
        name: 'Catalog administration',
      }),
    ).toBeNull()

    expect(
      screen.queryByRole('heading', {
        name: 'Catalog',
      }),
    ).toBeNull()

    await user.click(
      await screen.findByRole('button', {
        name: 'Mark Sourdough unavailable',
      }),
    )

    expect(setAvailability).toHaveBeenCalledWith(
      '83000000-0000-4000-8000-000000000001',
      false,
    )

    expect(await screen.findByText('Unavailable')).toBeVisible()
  })

  it('lets MANAGER change Product availability through the trusted availability command', async () => {
    const user = userEvent.setup()

    const authGateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'MANAGER' }),
    })

    const updateProduct = vi.fn(async () => undefined)

    const managerGateway: ManagerCatalogGateway = {
      loadManagerCatalog: vi.fn(async () => ({
        categories: [
          {
            id: '82000000-0000-4000-8000-000000000001',
            name: 'Bread',
            description: null,
            active: true,
            displayOrder: 1,
          },
        ],
        products: [
          {
            id: '83000000-0000-4000-8000-000000000001',
            categoryId: '82000000-0000-4000-8000-000000000001',
            name: 'Sourdough',
            description: 'Country loaf.',
            unitCode: 'UNIT',
            quantityStep: 1,
            active: true,
            available: false,
          },
        ],
      })),
      createCategory: vi.fn(async () => 'category-id'),
      updateCategory: vi.fn(async () => undefined),
      createProduct: vi.fn(async () => 'product-id'),
      updateProduct,
    }

    const setAvailability = vi.fn(
      async (_productId: string, available: boolean) => available,
    )

    const availabilityGateway: ProductAvailabilityGateway = {
      setAvailability,
    }

    const catalogFake = createFakeCatalogGateway([emptyCatalog])

    render(
      <App
        bootstrap={{
          status: 'ready',
          authGateway,
          catalogGateway: catalogFake.gateway,
          managerCatalogGateway: managerGateway,
          productAvailabilityGateway: availabilityGateway,
        }}
      />,
    )

    act(() => authGateway.emit({ userId: customerUserId }))

    const product = await screen.findByRole('article', {
      name: 'Product: Sourdough',
    })

    await user.click(
      within(product).getByRole('button', {
        name: 'Mark Sourdough available',
      }),
    )

    expect(setAvailability).toHaveBeenCalledWith(
      '83000000-0000-4000-8000-000000000001',
      true,
    )

    expect(updateProduct).not.toHaveBeenCalled()
    expect(within(product).getByText('Available')).toBeVisible()
  })

  it.each(['KITCHEN', 'MANAGER'] as const)(
    'does not show the customer catalog to %s',
    async (role) => {
      const gateway = createFakeAuthGateway({
        profile: buildProfile({ role }),
      })
      renderReadyApp(gateway)

      act(() => gateway.emit({ userId: customerUserId }))

      expect(await screen.findByText('Application foundation ready.')).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Catalog' })).toBeNull()
      if (role === 'MANAGER') {
        expect(await screen.findByRole('heading', { name: 'Catalog administration' })).toBeVisible()
      } else {
        expect(screen.queryByRole('heading', { name: 'Catalog administration' })).toBeNull()
      }
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
    },
  )
})
