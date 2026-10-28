import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { KitchenOrderPage, KitchenOrderQueryFilters } from '../application/kitchenOrderQueryGateway'
import type { KitchenQueueSyncState } from '../application/kitchenQueueSynchronization'
import type { KitchenProductionOrder } from '../domain/kitchenProductionOrder'
import { KitchenProductionBoard } from './KitchenProductionBoard'

const received: KitchenProductionOrder = {
  id: '00000000-0000-4000-8000-000000000a01',
  orderNumber: 12,
  businessId: '00000000-0000-4000-8000-000000000a02',
  businessName: 'Café Central', status: 'RECEIVED',
  requestedDeliveryAt: '2026-11-02T10:00:00Z',
  createdAt: '2026-10-26T09:00:00Z', customerNotes: 'Pack carefully.',
  items: [{
    id: '00000000-0000-4000-8000-000000000a03',
    productId: '00000000-0000-4000-8000-000000000a04',
    productName: 'Sourdough', unitCode: 'UNIT',
    quantityStepThousandths: 1000, requestedThousandths: 3000,
    preparedThousandths: 0, unavailableThousandths: 0,
    remainingThousandths: 3000,
  }],
}
const inProgress: KitchenProductionOrder = {
  ...received, status: 'IN_PROGRESS',
  items: [{
    ...received.items[0]!, requestedThousandths: 3000,
    preparedThousandths: 1000, unavailableThousandths: 0,
    remainingThousandths: 2000,
  }],
}

function page(...orders: KitchenProductionOrder[]): KitchenOrderPage {
  return { orders, nextCursor: null }
}

function harness() {
  const subscribers: Array<(state: KitchenQueueSyncState) => void> = []
  const stopped = vi.fn()
  const refresh = vi.fn()
  const filters: (KitchenOrderQueryFilters | undefined)[] = []
  const createKitchenQueueSynchronizer = vi.fn((filter?: KitchenOrderQueryFilters) => {
    filters.push(filter)
    return {
      start(callback: (state: KitchenQueueSyncState) => void) {
        subscribers.push(callback)
        return stopped
      },
      refresh,
    }
  })
  const commands = {
    startOrder: vi.fn(async () => undefined),
    recordPreparedQuantity: vi.fn(async () => undefined),
    recordUnavailableQuantity: vi.fn(async () => undefined),
    markOrderReady: vi.fn(async () => undefined),
  }
  const emitState = (state: KitchenQueueSyncState, index = subscribers.length - 1) => {
    act(() => subscribers[index]!(state))
  }
  const emit = (snapshot: KitchenOrderPage, index = subscribers.length - 1) => {
    emitState({
      connection: 'connected', page: snapshot, loading: false, stale: false, error: null,
    }, index)
  }
  return { commands, emit, emitState, filters, stopped, refresh, createKitchenQueueSynchronizer }
}

function show(h: ReturnType<typeof harness>) {
  return render(<KitchenProductionBoard
    commandGateway={h.commands}
    queryGateway={{ loadProductionOrder: async () => null }}
    createKitchenQueueSynchronizer={h.createKitchenQueueSynchronizer}
  />)
}

describe('KitchenProductionBoard (M4-006B/C)', () => {
  it('subscribes only to the persisted queue and renders status, snapshots and all four quantities', () => {
    const h = harness()
    show(h)
    expect(screen.getByText(/Connecting to production queue/)).toBeVisible()
    expect(h.filters[0]).toEqual({ statuses: ['RECEIVED', 'IN_PROGRESS'], pageSize: 25, cursor: null })
    h.emit(page(received))
    const order = screen.getByRole('article', { name: /Production order 12 for Café Central/ })
    expect(within(order).getByText('Pack carefully.', { exact: false })).toBeVisible()
    const item = within(order).getByRole('article', { name: 'Production item: Sourdough' })
    for (const field of ['Requested', 'Prepared', 'Unavailable', 'Remaining', 'Quantity step']) {
      expect(within(item).getByText(field)).toBeVisible()
    }
    expect(within(order).getByRole('button', { name: 'Start order #12' })).toBeEnabled()
    expect(within(item).queryByRole('button', { name: 'Record prepared' })).toBeNull()
  })

  it('starts an order using only the trusted gateway and refetches after success', async () => {
    const h = harness()
    show(h)
    h.emit(page(received))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start order #12' }))
    expect(h.commands.startOrder).toHaveBeenCalledOnce()
    expect(h.commands.startOrder).toHaveBeenCalledWith(received.id)
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(screen.getByText(/Change saved. Refreshing/)).toBeVisible()
  })

  it('records prepared and unavailable positive DELTAS, trims reasons and refreshes', async () => {
    const h = harness()
    show(h)
    h.emit(page(inProgress))
    const item = screen.getByRole('article', { name: 'Production item: Sourdough' })
    const user = userEvent.setup()
    await user.type(within(item).getByRole('textbox', { name: 'Prepare more Sourdough' }), '1')
    await user.click(within(item).getByRole('button', { name: 'Record prepared' }))
    expect(h.commands.recordPreparedQuantity).toHaveBeenCalledWith(inProgress.items[0]!.id, 1000)
    expect(h.refresh).toHaveBeenCalledTimes(1)
    await user.type(within(item).getByRole('textbox', { name: 'Unavailable amount for Sourdough' }), '1')
    await user.type(within(item).getByRole('textbox', { name: 'Reason for Sourdough' }), '  Ingredients missing  ')
    await user.click(within(item).getByRole('button', { name: 'Record unavailable' }))
    expect(h.commands.recordUnavailableQuantity).toHaveBeenCalledWith(
      inProgress.items[0]!.id, 1000, 'Ingredients missing',
    )
    expect(h.refresh).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid step/amount and missing reason without submitting to SQL', async () => {
    const h = harness()
    show(h)
    h.emit(page(inProgress))
    const item = screen.getByRole('article', { name: 'Production item: Sourdough' })
    const user = userEvent.setup()
    await user.type(within(item).getByRole('textbox', { name: 'Prepare more Sourdough' }), '0.5')
    await user.click(within(item).getByRole('button', { name: 'Record prepared' }))
    expect(h.commands.recordPreparedQuantity).not.toHaveBeenCalled()
    expect(within(item).getByRole('alert')).toHaveTextContent('historical quantity step')
    await user.type(within(item).getByRole('textbox', { name: 'Unavailable amount for Sourdough' }), '2')
    await user.click(within(item).getByRole('button', { name: 'Record unavailable' }))
    expect(h.commands.recordUnavailableQuantity).not.toHaveBeenCalled()
    expect(within(item).getByRole('alert')).toHaveTextContent('reason is required')
  })

  it('disables writes while stale or disconnected and when the line is resolved', async () => {
    const h = harness()
    show(h)
    h.emit(page(inProgress))
    const current = page(inProgress)
    h.emitState({ connection: 'disconnected', page: current, loading: false, stale: true, error: null })
    expect(screen.getByRole('button', { name: 'Record prepared' })).toBeDisabled()
    h.emitState({ connection: 'connected', page: current, loading: false, stale: true, error: null })
    expect(screen.getByRole('button', { name: 'Record prepared' })).toBeDisabled()
    h.emit(page({ ...inProgress, items: [{ ...inProgress.items[0]!, preparedThousandths: 3000, remainingThousandths: 0 }] }))
    expect(screen.queryByRole('button', { name: 'Record prepared' })).toBeNull()
    expect(screen.getByText('Line fully resolved.')).toBeVisible()
    expect(h.commands.recordPreparedQuantity).not.toHaveBeenCalled()
  })

  it('hides provider internals on command failure and does not automatically retry', async () => {
    const h = harness()
    h.commands.startOrder.mockRejectedValueOnce(new Error('private SQL details'))
    show(h)
    h.emit(page(received))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start order #12' }))
    expect(h.commands.startOrder).toHaveBeenCalledTimes(1)
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the operation')
    expect(document.body.textContent).not.toContain('private SQL details')
  })

  it('recreates the subscription on keyset navigation and stops it on unmount', async () => {
    const h = harness()
    const view = show(h)
    h.emit({ orders: [received], nextCursor: 'opaque-page-two' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }))
    expect(h.stopped).toHaveBeenCalledTimes(1)
    expect(h.filters[1]?.cursor).toBe('opaque-page-two')
    h.emit(page(inProgress))
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
    view.unmount()
    expect(h.stopped).toHaveBeenCalledTimes(2)
  })
})
