import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CustomerTrackingQueryGateway } from '../application/customerTrackingQueryGateway'
import type { CustomerShortageReasonsGateway } from '../application/customerShortageReasonsGateway'
import type { CustomerTrackedOrder } from '../domain/customerTrackedOrder'
import { CustomerTrackingBoard } from './CustomerTrackingBoard'
import { createFakeCustomerTrackingRealtimeGateway } from '../testing/createFakeCustomerTrackingRealtimeGateway'

const businessId = 'a2100000-0000-4000-8000-000000000001'
const realtimeGateway = createFakeCustomerTrackingRealtimeGateway().gateway
const id = 'a2200000-0000-4000-8000-000000000001'
const otherId = 'a2200000-0000-4000-8000-000000000002'
const itemId = 'a2600000-0000-4000-8000-000000000001'
const order: CustomerTrackedOrder = {
  id,
  orderNumber: 401,
  businessId: 'a2100000-0000-4000-8000-000000000001',
  status: 'IN_PROGRESS',
  createdAt: '2026-11-02T08:00:00Z',
  requestedDeliveryAt: '2026-11-08T10:00:00Z',
  customerNotes: 'No substitutions',
  items: [{
    id: itemId, productName: 'Croissant', unitCode: 'UNIT', quantityStepThousandths: 125,
    requestedThousandths: 3000, preparedThousandths: 1125,
    unavailableThousandths: 875, remainingThousandths: 1000,
  }],
}

function fakeGateways(options: {
  query?: Partial<CustomerTrackingQueryGateway>
  reasons?: Partial<CustomerShortageReasonsGateway>
} = {}) {
  const loadActiveOrders = vi.fn(async () => ({ orders: [order], nextCursor: null }))
  const loadOrder = vi.fn(async () => order)
  const loadReasons = vi.fn(async () => [{
    orderItemId: itemId, reason: 'Flour shortage', occurredAt: '2026-11-02T08:01:00Z',
  }])
  const queryGateway: CustomerTrackingQueryGateway = {
    loadActiveOrders: options.query?.loadActiveOrders ?? loadActiveOrders,
    loadOrder: options.query?.loadOrder ?? loadOrder,
  }
  const shortageGateway: CustomerShortageReasonsGateway = {
    loadReasons: options.reasons?.loadReasons ?? loadReasons,
  }
  return { queryGateway, shortageGateway, loadActiveOrders, loadOrder, loadReasons }
}

describe('M5-002 CUSTOMER Tracking UI', () => {
  it('renders the active list and the exact persisted item progress and shortage reasons', async () => {
    const user = userEvent.setup()
    const { queryGateway, shortageGateway, loadReasons } = fakeGateways()
    render(<CustomerTrackingBoard queryGateway={queryGateway} shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId} />)
    const button = await screen.findByRole('button', { name: 'View tracking for order #401' })
    expect(screen.getByRole('heading', { name: 'My active orders' })).toBeVisible()
    await user.click(button)

    const detail = await screen.findByRole('region', { name: 'Selected customer order' })
    const tracked = await within(detail).findByRole('article', { name: 'Tracked order #401' })
    expect(within(tracked).getByText('IN_PROGRESS')).toBeVisible()
    expect(within(tracked).getByText('Customer notes: No substitutions')).toBeVisible()
    const item = within(tracked).getByRole('article', { name: 'Tracked item: Croissant' })
    expect(within(item).getByText('1.125')).toBeVisible()
    expect(within(item).getByText('0.875')).toBeVisible()
    expect(within(item).getByText('3')).toBeVisible()
    expect(within(item).getByText('1')).toBeVisible()
    expect(within(item).getByText('Flour shortage')).toBeVisible()
    expect(loadReasons).toHaveBeenCalledWith(id)
  })

  it('shows a safe empty list and supports explicit refresh', async () => {
    const user = userEvent.setup()
    const loadActiveOrders = vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    const { shortageGateway } = fakeGateways()
    render(<CustomerTrackingBoard
      queryGateway={{ loadActiveOrders, loadOrder: async () => null }}
      shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId}
    />)
    expect(await screen.findByText('No active orders for your establishment.')).toBeVisible()
    expect(loadActiveOrders).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Refresh tracking' }))
    expect(await screen.findByText('No active orders for your establishment.')).toBeVisible()
    expect(loadActiveOrders).toHaveBeenCalledTimes(2)
  })

  it('navigates cursor pages with stable filters', async () => {
    const user = userEvent.setup()
    const loadActiveOrders = vi.fn().mockImplementation(async ({ cursor }: { cursor?: string | null }) =>
      cursor === null
        ? { orders: [order], nextCursor: 'opaque-cursor' }
        : { orders: [{ ...order, id: otherId, orderNumber: 402 }], nextCursor: null },
    )
    const { shortageGateway } = fakeGateways()
    render(<CustomerTrackingBoard
      queryGateway={{ loadActiveOrders, loadOrder: async () => null }}
      shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId}
    />)
    await screen.findByRole('button', { name: 'View tracking for order #401' })
    const nav = screen.getByRole('navigation', { name: 'Customer tracking pages' })
    await user.click(within(nav).getByRole('button', { name: 'Next page' }))
    await screen.findByRole('button', { name: 'View tracking for order #402' })
    expect(loadActiveOrders).toHaveBeenCalledWith({ pageSize: 25, cursor: 'opaque-cursor' })
    // The nav unmounts while a page loads, so the earlier reference is detached.
    const currentNav = screen.getByRole('navigation', { name: 'Customer tracking pages' })
    await user.click(within(currentNav).getByRole('button', { name: 'Previous page' }))
    await screen.findByRole('button', { name: 'View tracking for order #401' })
  })

  it('keeps unauthorized and missing Order responses indistinguishable', async () => {
    const user = userEvent.setup()
    const { queryGateway, shortageGateway } = fakeGateways({
      query: { loadOrder: async () => null },
    })
    render(<CustomerTrackingBoard queryGateway={queryGateway} shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId} />)
    await screen.findByRole('button', { name: 'View tracking for order #401' })
    await user.type(screen.getByRole('textbox', { name: 'Find order by ID' }), otherId)
    await user.click(screen.getByRole('button', { name: 'Open tracked order' }))
    expect(await screen.findByText('Order not found or access denied.')).toBeVisible()
    expect(screen.queryByText('Flour shortage')).toBeNull()
  })

  it('does not fetch audit reasons when no quantity is unavailable', async () => {
    const user = userEvent.setup()
    const { queryGateway, shortageGateway, loadReasons } = fakeGateways({
      query: { loadOrder: async () => ({
        ...order,
        items: [{ ...order.items[0]!, unavailableThousandths: 0, remainingThousandths: 1875 }],
      }) },
    })
    render(<CustomerTrackingBoard queryGateway={queryGateway} shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId} />)
    await user.click(await screen.findByRole('button', { name: 'View tracking for order #401' }))
    expect(await screen.findByText('No unavailable quantities recorded.')).toBeVisible()
    expect(loadReasons).not.toHaveBeenCalled()
  })

  it('does not display stale detail after switching away from a pending lookup', async () => {
    const user = userEvent.setup()
    let resolveOrder!: (value: CustomerTrackedOrder) => void
    const pendingOrder = new Promise<CustomerTrackedOrder>((resolve) => { resolveOrder = resolve })
    const { shortageGateway } = fakeGateways()
    render(<CustomerTrackingBoard
      queryGateway={{ loadActiveOrders: async () => ({ orders: [order], nextCursor: null }), loadOrder: async () => pendingOrder }}
      shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId}
    />)
    await user.click(await screen.findByRole('button', { name: 'View tracking for order #401' }))
    await user.click(screen.getByRole('button', { name: 'Back to active orders' }))
    resolveOrder(order)
    expect(screen.queryByRole('article', { name: 'Tracked order #401' })).toBeNull()
  })

  it('shows safe errors and never exposes raw provider messages', async () => {
    const { shortageGateway } = fakeGateways()
    render(<CustomerTrackingBoard
      queryGateway={{ loadActiveOrders: async () => { throw new Error('sensitive provider details') }, loadOrder: async () => null }}
      shortageGateway={shortageGateway}
      realtimeGateway={realtimeGateway} receiptGateway={{ confirmReceipt: async () => undefined }} businessId={businessId}
    />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load active orders.')
    expect(screen.queryByText('sensitive provider details')).toBeNull()
  })
})
