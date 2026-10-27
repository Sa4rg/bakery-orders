import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { KitchenQueueSyncState } from '../application/kitchenQueueSynchronization'
import type { KitchenProductionOrder } from '../domain/kitchenProductionOrder'
import { KitchenProductionBoard } from './KitchenProductionBoard'

const base: KitchenProductionOrder = {
  id: '01000000-0000-4000-8000-000000000001',
  orderNumber: 801,
  businessId: '02000000-0000-4000-8000-000000000002',
  businessName: 'Bakery A',
  status: 'IN_PROGRESS',
  requestedDeliveryAt: '2030-01-15T10:30:00Z',
  createdAt: '2026-10-27T10:00:00Z',
  customerNotes: null,
  items: [{
    id: '03000000-0000-4000-8000-000000000003',
    productId: '04000000-0000-4000-8000-000000000004',
    productName: 'Bread',
    unitCode: 'UNIT',
    quantityStepThousandths: 1000,
    requestedThousandths: 3000,
    preparedThousandths: 1000,
    unavailableThousandths: 2000,
    remainingThousandths: 0,
  }],
}

function setup() {
  let send: ((state: KitchenQueueSyncState) => void) | null = null
  const refresh = vi.fn()
  const markOrderReady = vi.fn(async () => undefined)
  const view = render(<KitchenProductionBoard
    createKitchenQueueSynchronizer={() => ({
      start(callback) { send = callback; return vi.fn() },
      refresh,
    })}
    commandGateway={{
      startOrder: vi.fn(async () => undefined),
      recordPreparedQuantity: vi.fn(async () => undefined),
      recordUnavailableQuantity: vi.fn(async () => undefined),
      markOrderReady,
    }}
    queryGateway={{ loadProductionOrder: async () => null }}
  />)
  function emit(order: KitchenProductionOrder, stale = false) {
    if (!send) throw new Error('Realtime subscription not started')
    act(() => send!({
      connection: 'connected', loading: stale, stale, error: null,
      page: { orders: [order], nextCursor: null },
    }))
    return screen.getByRole('article', { name: /Production order 801 for Bakery A/ })
  }
  return { emit, refresh, markOrderReady, view }
}

describe('M4-008F — READY production action', () => {
  it.each([
    ['COMPLETE', 3000, 0],
    ['PARTIAL', 1000, 2000],
  ] as const)('offers READY for resolved %s and refetches after exactly one trusted call', async (_condition, prepared, unavailable) => {
    const h = setup()
    const order = h.emit({ ...base, items: [{ ...base.items[0]!, preparedThousandths: prepared,
      unavailableThousandths: unavailable }] })
    const action = within(order).getByRole('button', { name: 'Mark order #801 ready' })
    await userEvent.setup().click(action)
    expect(h.markOrderReady).toHaveBeenCalledOnce()
    expect(h.markOrderReady).toHaveBeenCalledWith(base.id)
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(screen.getByText('Change saved. Refreshing production data.')).toBeVisible()
  })

  it.each([
    ['UNRESOLVED', 1000, 1000, 1000],
    ['UNAVAILABLE', 0, 3000, 0],
    ['RECEIVED', 3000, 0, 0],
    ['READY', 3000, 0, 0],
  ] as const)('does not offer READY for %s', (name, prepared, unavailable, remaining) => {
    const h = setup()
    const order = h.emit({ ...base, status: name === 'RECEIVED' || name === 'READY' ? name : 'IN_PROGRESS',
      items: [{ ...base.items[0]!, preparedThousandths: prepared,
        unavailableThousandths: unavailable, remainingThousandths: remaining }] })
    expect(within(order).queryByRole('button', { name: 'Mark order #801 ready' })).toBeNull()
    expect(h.markOrderReady).not.toHaveBeenCalled()
  })

  it('disables READY when Realtime invalidates the queue, even while the prior Order remains visible', () => {
    const h = setup()
    h.emit(base)
    const order = h.emit(base, true)
    expect(within(order).getByRole('button', { name: 'Mark order #801 ready' })).toBeDisabled()
    expect(h.markOrderReady).not.toHaveBeenCalled()
  })

  it('keeps SQL errors private and never repeats a rejected READY command', async () => {
    const h = setup()
    h.markOrderReady.mockRejectedValueOnce(new Error('private PostgreSQL details'))
    h.emit(base)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark order #801 ready' }))
    expect(h.markOrderReady).toHaveBeenCalledOnce()
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the operation')
    expect(document.body.textContent).not.toContain('private PostgreSQL details')
  })
})
