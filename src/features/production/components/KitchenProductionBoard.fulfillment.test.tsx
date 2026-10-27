import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KitchenQueueSyncState } from '../application/kitchenQueueSynchronization'
import type { KitchenProductionOrder } from '../domain/kitchenProductionOrder'
import { KitchenProductionBoard } from './KitchenProductionBoard'

const base: KitchenProductionOrder = {
  id: '01000000-0000-4000-8000-000000000001',
  orderNumber: 501,
  businessId: '02000000-0000-4000-8000-000000000002',
  businessName: 'E2E Bakery',
  status: 'IN_PROGRESS',
  requestedDeliveryAt: '2030-01-15T10:30:00Z',
  createdAt: '2026-10-27T10:00:00Z',
  customerNotes: null,
  items: [{
    id: '03000000-0000-4000-8000-000000000003',
    productId: '04000000-0000-4000-8000-000000000004',
    productName: 'Sourdough',
    unitCode: 'UNIT',
    quantityStepThousandths: 1000,
    requestedThousandths: 3000,
    preparedThousandths: 0,
    unavailableThousandths: 0,
    remainingThousandths: 3000,
  }],
}

function setup() {
  let emit: ((state: KitchenQueueSyncState) => void) | null = null
  const createKitchenQueueSynchronizer = vi.fn(() => ({
    start(callback: (state: KitchenQueueSyncState) => void) {
      emit = callback
      return vi.fn()
    },
    refresh: vi.fn(),
  }))
  render(<KitchenProductionBoard
    createKitchenQueueSynchronizer={createKitchenQueueSynchronizer}
    queryGateway={{ loadProductionOrder: async () => null }}
    commandGateway={{
      startOrder: vi.fn(async () => undefined),
      recordPreparedQuantity: vi.fn(async () => undefined),
      recordUnavailableQuantity: vi.fn(async () => undefined),
    }}
  />)
  return (order: KitchenProductionOrder) => {
    if (!emit) throw new Error('Production subscription not started.')
    act(() => emit!({
      connection: 'connected', stale: false, loading: false, error: null,
      page: { orders: [order], nextCursor: null },
    }))
    return screen.getByRole('article', { name: /Production order 501 for E2E Bakery/ })
  }
}

describe('M4-007 — fulfillment read-only presentation', () => {
  it('shows unresolved progress instead of a premature PARTIAL classification', () => {
    const publish = setup()
    const order = publish({ ...base, items: [{
      ...base.items[0]!, preparedThousandths: 1000,
      unavailableThousandths: 1000, remainingThousandths: 1000,
    }] })
    expect(within(order).getByText('Unresolved')).toBeVisible()
    expect(within(order).queryByText('PARTIAL')).toBeNull()
    const remainingLabel = within(order).getByText('Order remaining')
    expect(remainingLabel.nextElementSibling).toHaveTextContent('1')
  })

  it.each([
    ['COMPLETE', 3000, 0],
    ['PARTIAL', 1000, 2000],
    ['UNAVAILABLE', 0, 3000],
  ] as const)('shows %s only when all quantities are resolved', (condition, prepared, unavailable) => {
    const publish = setup()
    const order = publish({ ...base, items: [{
      ...base.items[0]!, preparedThousandths: prepared,
      unavailableThousandths: unavailable, remainingThousandths: 0,
    }] })
    expect(within(order).getByText(condition, { exact: true })).toBeVisible()
    expect(within(order).getByText('IN_PROGRESS', { exact: true })).toBeVisible()
  })
})
