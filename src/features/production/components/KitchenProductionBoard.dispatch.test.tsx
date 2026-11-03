import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { KitchenQueueSyncState } from '../application/kitchenQueueSynchronization'
import type { KitchenProductionOrder } from '../domain/kitchenProductionOrder'
import { KitchenProductionBoard } from './KitchenProductionBoard'

const ready: KitchenProductionOrder = {
  id: 'd1100000-0000-4000-8000-000000000001',
  orderNumber: 804,
  businessId: 'd1200000-0000-4000-8000-000000000001',
  businessName: 'Bakery A',
  status: 'READY',
  requestedDeliveryAt: '2030-01-15T10:30:00Z',
  createdAt: '2026-11-03T10:00:00Z',
  customerNotes: null,
  items: [{
    id: 'd1300000-0000-4000-8000-000000000001',
    productId: 'd1400000-0000-4000-8000-000000000001',
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
  const callbacks: Array<(state: KitchenQueueSyncState) => void> = []
  const refresh = vi.fn()
  const stop = vi.fn()
  const dispatchOrder = vi.fn(async () => undefined)
  const createKitchenQueueSynchronizer = vi.fn(() => ({
    start(callback: (state: KitchenQueueSyncState) => void) {
      callbacks.push(callback)
      return stop
    },
    refresh,
  }))
  const view = render(<KitchenProductionBoard
    createKitchenQueueSynchronizer={createKitchenQueueSynchronizer}
    commandGateway={{
      startOrder: vi.fn(async () => undefined),
      markOrderReady: vi.fn(async () => undefined),
      dispatchOrder,
      recordPreparedQuantity: vi.fn(async () => undefined),
      recordUnavailableQuantity: vi.fn(async () => undefined),
    }}
    queryGateway={{ loadProductionOrder: async () => null }}
  />)
  const emit = (order: KitchenProductionOrder, stale = false) => {
    const cb = callbacks[callbacks.length - 1]
    if (!cb) throw new Error('Expected a subscriber')
    act(() => cb({
      connection: 'connected', stale, loading: stale, error: null,
      page: { orders: [order], nextCursor: null },
    }))
  }
  return { view, emit, refresh, dispatchOrder, createKitchenQueueSynchronizer, stop }
}

describe('M5-004 KITCHEN dispatch confirmation', () => {
  it('selects a READY-only queue and confirms exactly one trusted command', async () => {
    const h = setup()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'READY')
    expect(h.createKitchenQueueSynchronizer).toHaveBeenLastCalledWith({
      statuses: ['READY'], pageSize: 25, cursor: null,
    })
    h.emit(ready)
    const card = screen.getByRole('article', { name: /Production order 804 for Bakery A/ })
    await user.click(within(card).getByRole('button', { name: 'Dispatch order #804' }))
    expect(h.dispatchOrder).not.toHaveBeenCalled()
    await user.click(within(card).getByRole('button', { name: 'Confirm dispatch order #804' }))
    expect(h.dispatchOrder).toHaveBeenCalledTimes(1)
    expect(h.dispatchOrder).toHaveBeenCalledWith(ready.id)
    expect(h.refresh).toHaveBeenCalledOnce()
  })

  it('permits cancelling confirmation without submitting any RPC', async () => {
    const h = setup()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'READY')
    h.emit(ready)
    await user.click(screen.getByRole('button', { name: 'Dispatch order #804' }))
    await user.click(screen.getByRole('button', { name: 'Cancel dispatch confirmation' }))
    expect(h.dispatchOrder).not.toHaveBeenCalled()
  })

  it.each(['RECEIVED', 'IN_PROGRESS', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const)(
    'never offers dispatch for %s', async (status) => {
      const h = setup()
      const user = userEvent.setup()
      await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'READY')
      h.emit({ ...ready, status })
      expect(screen.queryByRole('button', { name: 'Dispatch order #804' })).toBeNull()
      expect(h.dispatchOrder).not.toHaveBeenCalled()
    },
  )

  it('disables confirmation while the Realtime snapshot is stale', async () => {
    const h = setup()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'READY')
    h.emit(ready)
    await user.click(screen.getByRole('button', { name: 'Dispatch order #804' }))
    h.emit(ready, true)
    expect(screen.getByRole('button', { name: 'Confirm dispatch order #804' })).toBeDisabled()
    expect(h.dispatchOrder).not.toHaveBeenCalled()
  })

  it('sanitizes uncertain SQL failure and never resends dispatch automatically', async () => {
    const h = setup()
    const user = userEvent.setup()
    h.dispatchOrder.mockRejectedValueOnce(new Error('secret database details'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'READY')
    h.emit(ready)
    await user.click(screen.getByRole('button', { name: 'Dispatch order #804' }))
    await user.click(screen.getByRole('button', { name: 'Confirm dispatch order #804' }))
    expect(h.dispatchOrder).toHaveBeenCalledTimes(1)
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the operation')
    expect(document.body.textContent).not.toContain('secret database details')
  })
})
