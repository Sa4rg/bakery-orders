import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { KitchenOrderQueryFilters } from '../application/kitchenOrderQueryGateway'
import type { KitchenQueueSyncState } from '../application/kitchenQueueSynchronization'
import type { KitchenProductionOrder } from '../domain/kitchenProductionOrder'
import { KitchenProductionBoard } from './KitchenProductionBoard'

const order: KitchenProductionOrder = {
  id: '00000000-0000-4000-8000-000000000a01',
  orderNumber: 12,
  businessId: '00000000-0000-4000-8000-000000000a02',
  businessName: 'Café Central',
  status: 'IN_PROGRESS',
  requestedDeliveryAt: '2026-11-02T10:00:00Z',
  createdAt: '2026-10-26T09:00:00Z',
  customerNotes: 'Pack carefully.',
  items: [{
    id: '00000000-0000-4000-8000-000000000a03',
    productId: '00000000-0000-4000-8000-000000000a04',
    productName: 'Sourdough',
    unitCode: 'UNIT',
    quantityStepThousandths: 1000,
    requestedThousandths: 3000,
    preparedThousandths: 1000,
    unavailableThousandths: 0,
    remainingThousandths: 2000,
  }],
}

function setup() {
  const listeners: Array<(state: KitchenQueueSyncState) => void> = []
  const dispose = vi.fn()
  const refresh = vi.fn()
  const filters: KitchenOrderQueryFilters[] = []
  const createKitchenQueueSynchronizer = vi.fn((filter?: KitchenOrderQueryFilters) => {
    if (filter) filters.push(filter)
    return {
      start(onState: (state: KitchenQueueSyncState) => void) {
        listeners.push(onState)
        return dispose
      },
      refresh,
    }
  })
  const queryGateway = {
    loadProductionOrder: vi.fn(async (orderId: string): Promise<KitchenProductionOrder | null> => {
      if (orderId !== order.id) return null
      return order
    }),
  }
  const commandGateway = {
    startOrder: vi.fn(async () => undefined),
    recordPreparedQuantity: vi.fn(async () => undefined),
    recordUnavailableQuantity: vi.fn(async () => undefined),
    markOrderReady: vi.fn(async () => undefined),
  }
  const emit = (next: Partial<KitchenQueueSyncState>, index = listeners.length - 1) => {
    act(() => listeners[index]!({
      connection: 'connected',
      page: { orders: [order], nextCursor: null },
      loading: false,
      stale: false,
      error: null,
      ...next,
    }))
  }
  const view = render(<KitchenProductionBoard
    createKitchenQueueSynchronizer={createKitchenQueueSynchronizer}
    queryGateway={queryGateway}
    commandGateway={commandGateway}
  />)
  return { emit, view, dispose, refresh, filters, commandGateway, queryGateway }
}

describe('Kitchen production completion — M4-006B/D/E', () => {
  it('opens an authoritative selected-order detail and returns to the queue', async () => {
    const h = setup()
    h.emit({})
    await userEvent.setup().click(screen.getByRole('button', { name: 'View details for order #12' }))
    await waitFor(() => expect(h.queryGateway.loadProductionOrder).toHaveBeenCalledWith(order.id))
    const detail = await screen.findByRole('region', { name: 'Selected production order' })
    expect(within(detail).getByText('Pack carefully.', { exact: false })).toBeVisible()
    expect(within(detail).getByRole('article', { name: 'Production item: Sourdough' })).toBeVisible()
    expect(screen.getAllByRole('article', { name: /Production order 12/ })).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to production queue' }))
    expect(screen.queryByRole('region', { name: 'Selected production order' })).toBeNull()
    expect(screen.getByRole('button', { name: 'View details for order #12' })).toBeVisible()
  })

  it('renders a safe detail error with read-only retry; never exposes the provider error', async () => {
    const h = setup()
    h.queryGateway.loadProductionOrder.mockRejectedValueOnce(new Error('private postgres error'))
    h.emit({})
    await userEvent.setup().click(screen.getByRole('button', { name: 'View details for order #12' }))
    expect(await screen.findByText('Unable to load production order detail.')).toBeVisible()
    expect(document.body.textContent).not.toContain('private postgres error')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry order detail' }))
    await waitFor(() => expect(h.queryGateway.loadProductionOrder).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('article', { name: /Production order 12/ })).toBeVisible()
    expect(h.commandGateway.recordPreparedQuantity).not.toHaveBeenCalled()
  })

  it('handles inaccessible or removed orders without showing a stale detail', async () => {
    const h = setup()
    h.queryGateway.loadProductionOrder.mockResolvedValueOnce(null)
    h.emit({})
    await userEvent.setup().click(screen.getByRole('button', { name: 'View details for order #12' }))
    expect(await screen.findByText('Order is unavailable or no longer accessible.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Record prepared' })).toBeNull()
  })

  it('filters by status, resets cursor, and disposes previous realtime subscriptions', async () => {
    const h = setup()
    expect(h.filters[0]).toEqual({ statuses: ['RECEIVED', 'IN_PROGRESS'], pageSize: 25, cursor: null })
    h.emit({ page: { orders: [order], nextCursor: 'opaque-cursor' } })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(h.filters[1]?.cursor).toBe('opaque-cursor')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'RECEIVED')
    expect(h.filters[2]).toEqual({ statuses: ['RECEIVED'], pageSize: 25, cursor: null })
    expect(h.dispose).toHaveBeenCalledTimes(2)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production status filter' }), 'IN_PROGRESS')
    expect(h.filters[3]).toEqual({ statuses: ['IN_PROGRESS'], pageSize: 25, cursor: null })
    h.view.unmount()
    expect(h.dispose).toHaveBeenCalledTimes(4)
  })

  it('shows loading, empty, safe error and read retry without replaying commands', async () => {
    const h = setup()
    expect(screen.getByText('Connecting to production queue…')).toBeVisible()
    h.emit({ loading: true, stale: true, page: null })
    expect(screen.getByText('Refreshing production orders…')).toBeVisible()
    h.emit({ page: { orders: [], nextCursor: null } })
    expect(screen.getByText('No production orders match this filter.')).toBeVisible()
    h.emit({ stale: true, error: 'Unable to refresh Kitchen production orders.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to refresh')
    expect(screen.getByText(/Retry refreshes a read only/)).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh production queue' }))
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(h.commandGateway.startOrder).not.toHaveBeenCalled()
    expect(h.commandGateway.recordUnavailableQuantity).not.toHaveBeenCalled()
  })

  it('explains a submission invalidated by Realtime without sending a command', async () => {
    const h = setup()
    h.emit({})
    const input = screen.getByRole('textbox', { name: 'Prepare more Sourdough' })
    await userEvent.setup().type(input, '1')
    const form = input.closest('form')
    expect(form).not.toBeNull()

    // Simulate an already-dispatched submit arriving as a Realtime update
    // changes the rendered form to disabled; no mutation may be sent.
    h.emit({ stale: true, loading: true })
    expect(screen.getByRole('button', { name: 'Record prepared' })).toBeDisabled()
    fireEvent.submit(form!)
    expect(screen.getByRole('alert'))
      .toHaveTextContent('No command was sent. Wait for a fresh queue')
    expect(h.commandGateway.recordPreparedQuantity).not.toHaveBeenCalled()
  })

  it('preserves an unsent quantity draft across Realtime detail revalidation', async () => {
    const h = setup()
    h.emit({})
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'View details for order #12' }))
    const detail = await screen.findByRole('region', { name: 'Selected production order' })
    const prepared = await within(detail).findByRole('textbox', { name: 'Prepare more Sourdough' })
    await user.type(prepared, '0.5')
    expect(prepared).toHaveValue('0.5')

    // Simulate an unrelated Realtime invalidation and a new authorized page.
    // The form must remain mounted, but no mutation can be sent while stale.
    h.emit({ stale: true, loading: true })
    expect(prepared.isConnected).toBe(true)
    expect(within(detail).getByRole('textbox', { name: 'Prepare more Sourdough' })).toBe(prepared)
    expect(prepared).toHaveValue('0.5')
    expect(within(detail).getByRole('button', { name: 'Record prepared' })).toBeDisabled()
    expect(h.commandGateway.recordPreparedQuantity).not.toHaveBeenCalled()

    h.emit({})
    await waitFor(() => {
      expect(within(detail).getByRole('button', { name: 'Record prepared' })).toBeEnabled()
    })
    expect(prepared.isConnected).toBe(true)
    expect(within(detail).getByRole('textbox', { name: 'Prepare more Sourdough' })).toBe(prepared)
    expect(prepared).toHaveValue('0.5')
    await user.click(within(detail).getByRole('button', { name: 'Record prepared' }))
    expect(within(detail).getByRole('alert'))
      .toHaveTextContent('Quantity must be a multiple of the historical quantity step.')
    expect(h.commandGateway.recordPreparedQuantity).not.toHaveBeenCalled()
  })

  it('shows command pending and blocks double submission without automatic retry', async () => {
    const h = setup()
    let complete!: (value: undefined) => void
    const pending = new Promise<undefined>((resolve) => { complete = resolve })
    h.commandGateway.recordPreparedQuantity.mockImplementationOnce(() => pending)
    h.emit({})
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Prepare more Sourdough' }), '1')
    await user.click(screen.getByRole('button', { name: 'Record prepared' }))
    expect(screen.getByText('Saving production change…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Record prepared' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Production status filter' })).toBeDisabled()
    expect(h.commandGateway.recordPreparedQuantity).toHaveBeenCalledTimes(1)
    await act(async () => { complete(undefined); await pending })
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(h.commandGateway.recordPreparedQuantity).toHaveBeenCalledTimes(1)
  })
})
