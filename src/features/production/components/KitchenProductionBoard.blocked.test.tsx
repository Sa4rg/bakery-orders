import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KitchenProductionOrder } from '../domain/kitchenProductionOrder'
import type { KitchenQueueSyncState } from '../application/kitchenQueueSynchronization'
import { KitchenProductionBoard } from './KitchenProductionBoard'

const order: KitchenProductionOrder = {
  id: '01000000-0000-4000-8000-000000000001', orderNumber: 901,
  businessId: '02000000-0000-4000-8000-000000000002', businessName: 'Bakery',
  status: 'IN_PROGRESS', requestedDeliveryAt: '2030-01-15T10:30:00Z',
  createdAt: '2026-10-27T10:00:00Z', customerNotes: null,
  items: [{ id: '03000000-0000-4000-8000-000000000003',
    productId: '04000000-0000-4000-8000-000000000004', productName: 'Bread',
    unitCode: 'UNIT', quantityStepThousandths: 1000, requestedThousandths: 3000,
    preparedThousandths: 0, unavailableThousandths: 3000, remainingThousandths: 0 }],
}

function setup(value: KitchenProductionOrder) {
  let emit: ((state: KitchenQueueSyncState) => void) | undefined
  const markOrderReady = vi.fn(async () => undefined)
  const startOrder = vi.fn(async () => undefined)
  render(<KitchenProductionBoard
    createKitchenQueueSynchronizer={() => ({
      start(callback) { emit = callback; return vi.fn() }, refresh: vi.fn(),
    })}
    commandGateway={{ startOrder, markOrderReady,
      recordPreparedQuantity: vi.fn(async () => undefined),
      recordUnavailableQuantity: vi.fn(async () => undefined),
    }}
    queryGateway={{ loadProductionOrder: async () => null }}
  />)
  if (!emit) throw new Error('Queue not subscribed')
  act(() => emit!({ connection: 'connected', stale: false, loading: false,
    error: null, page: { orders: [value], nextCursor: null },
  }))
  return { card: screen.getByRole('article', { name: /Production order 901 for Bakery/ }),
    markOrderReady, startOrder }
}

describe('M4-009B — KITCHEN blocking guidance is read only', () => {
  it('explains that total unavailability requires MANAGER intervention', () => {
    const h = setup(order)
    expect(within(h.card).getByText(/Manager intervention required/i)).toBeVisible()
    expect(within(h.card).getByText(/No automatic cancellation/i)).toBeVisible()
    expect(within(h.card).queryByRole('button', { name: /Mark order.*ready/i })).toBeNull()
    expect(within(h.card).queryByRole('button', { name: /Cancel/i })).toBeNull()
    expect(h.startOrder).not.toHaveBeenCalled()
    expect(h.markOrderReady).not.toHaveBeenCalled()
  })
  it('does not raise a manager block while the order is still unresolved', () => {
    const h = setup({ ...order, items: [{ ...order.items[0]!,
      unavailableThousandths: 2000, remainingThousandths: 1000 }] })
    expect(within(h.card).queryByText(/Manager intervention required/i)).toBeNull()
  })
  it('does not raise a manager block for PARTIAL or for other operational statuses', () => {
    const partial = setup({ ...order, items: [{ ...order.items[0]!,
      preparedThousandths: 1000, unavailableThousandths: 2000 }] })
    expect(within(partial.card).queryByText(/Manager intervention required/i)).toBeNull()
  })
})
