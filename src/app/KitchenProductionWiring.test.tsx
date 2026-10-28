import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { buildMembership, buildProfile, createFakeAuthGateway, customerUserId } from '../features/auth/testing/fakeAuthGateway'
import { createFakeCatalogGateway } from '../features/catalog/testing/fakeCatalogGateway'
import type { AppRole } from '../features/auth/domain/access'
import type { KitchenQueueSyncState } from '../features/production/application/kitchenQueueSynchronization'
import type { AppBootstrap } from './bootstrap'

function renderWithRole(role: AppRole) {
  const authGateway = createFakeAuthGateway({
    profile: buildProfile({ role }),
    memberships: role === 'CUSTOMER' ? [buildMembership()] : [],
  })
  const catalogGateway = createFakeCatalogGateway([{ categories: [], products: [] }]).gateway
  const dispose = vi.fn()
  const createKitchenQueueSynchronizer = vi.fn(() => ({
    start: vi.fn((callback: (state: KitchenQueueSyncState) => void) => {
      callback({ connection: 'connected', stale: false, loading: false, error: null,
        page: { orders: [], nextCursor: null } })
      return dispose
    }),
    refresh: vi.fn(),
  })) satisfies Extract<AppBootstrap, { status: 'ready' }>['createKitchenQueueSynchronizer']

  const bootstrap: Extract<AppBootstrap, { status: 'ready' }> = {
    status: 'ready', authGateway, catalogGateway,
    managerCatalogGateway: {
      loadManagerCatalog: async () => ({ categories: [], products: [] }),
      createCategory: async () => 'id', updateCategory: async () => undefined,
      createProduct: async () => 'id', updateProduct: async () => undefined,
    },
    productAvailabilityGateway: { setAvailability: async (_id, available) => available },
    createOrderGateway: { createOrder: async () => '00000000-0000-4000-8000-000000000001' },
    customerCancellationGateway: { cancelOrder: async () => undefined },
    kitchenOrderQueryGateway: { loadProductionQueue: async () => ({ orders: [], nextCursor: null }), loadProductionOrder: async () => null },
    managerBlockedOrdersGateway: { loadPage: async () => ({ incidents: [], hasNextPage: false }) },
    kitchenProductionCommandGateway: {
      startOrder: vi.fn(async () => undefined),
      recordPreparedQuantity: vi.fn(async () => undefined),
      recordUnavailableQuantity: vi.fn(async () => undefined),
      markOrderReady: vi.fn(async () => undefined),
    },
    createKitchenQueueSynchronizer,
  }
  const view = render(<App bootstrap={bootstrap} />)
  act(() => authGateway.emit({ userId: customerUserId }))
  return { ...view, authGateway, createKitchenQueueSynchronizer, dispose }
}

describe('Kitchen production application wiring (M4-006C)', () => {
  it('starts the queue only in the authorized KITCHEN shell and stops it at logout', async () => {
    const h = renderWithRole('KITCHEN')
    expect(await screen.findByRole('heading', { name: 'Kitchen production' })).toBeVisible()
    await waitFor(() => {
      expect(h.createKitchenQueueSynchronizer).toHaveBeenCalledOnce()
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => {
      expect(h.dispose).toHaveBeenCalledOnce()
    })
    expect(await screen.findByLabelText('Email')).toBeVisible()
  })

  it.each(['MANAGER', 'CUSTOMER'] as const)('does not subscribe or show production commands for %s', async (role) => {
    const h = renderWithRole(role)
    await screen.findByText('Application foundation ready.')
    expect(screen.queryByRole('heading', { name: 'Kitchen production' })).toBeNull()
    expect(h.createKitchenQueueSynchronizer).not.toHaveBeenCalled()
    if (role === 'MANAGER') {
      expect(screen.getByRole('heading', { name: 'Production interventions' })).toBeVisible()
    } else {
      expect(screen.queryByRole('heading', { name: 'Production interventions' })).toBeNull()
    }
    expect(h.dispose).not.toHaveBeenCalled()
  })
})
