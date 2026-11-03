import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CustomerTrackedOrder } from '../domain/customerTrackedOrder'
import { createFakeCustomerTrackingRealtimeGateway } from '../testing/createFakeCustomerTrackingRealtimeGateway'
import { CustomerTrackingBoard } from './CustomerTrackingBoard'

const businessId = 'a2100000-0000-4000-8000-000000000001'
const id = 'a2200000-0000-4000-8000-000000000001'
const itemId = 'a2600000-0000-4000-8000-000000000001'

const received: CustomerTrackedOrder = {
  id, businessId, orderNumber: 501, status: 'RECEIVED',
  createdAt: '2026-11-02T08:00:00Z', requestedDeliveryAt: '2026-11-08T10:00:00Z',
  customerNotes: null,
  items: [{ id: itemId, productName: 'Bread', unitCode: 'UNIT',
    quantityStepThousandths: 1000, requestedThousandths: 3000,
    preparedThousandths: 0, unavailableThousandths: 0, remainingThousandths: 3000 }],
}

function setup() {
  const realtime = createFakeCustomerTrackingRealtimeGateway()
  let tracked: CustomerTrackedOrder = received
  const list = vi.fn(async () => ({ orders: [tracked], nextCursor: null }))
  const detail = vi.fn(async () => tracked)
  const reasons = vi.fn(async () => tracked.items[0]!.unavailableThousandths > 0
    ? [{ orderItemId: itemId, reason: 'Ingredient shortage', occurredAt: '2026-11-02T08:01:00Z' }]
    : [])
  const result = render(<CustomerTrackingBoard businessId={businessId}
    realtimeGateway={realtime.gateway}
    receiptGateway={{ confirmReceipt: async () => undefined }}
    queryGateway={{ loadActiveOrders: list, loadOrder: detail }}
    shortageGateway={{ loadReasons: reasons }} />)
  return { realtime, list, detail, reasons, ...result, update(value: CustomerTrackedOrder) { tracked = value } }
}

describe('M5-003 CUSTOMER Tracking UI realtime', () => {
  it('updates persisted detail and historical reasons after invalidation without refresh', async () => {
    const user = userEvent.setup()
    const h = setup()
    await screen.findByRole('button', { name: 'View tracking for order #501' })
    act(() => h.realtime.emitStatus('connected'))
    // SUBSCRIBED triggers an authoritative list refetch. Wait for its result
    // before clicking: the button is temporarily absent while loading.
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2))
    await user.click(await screen.findByRole('button', { name: 'View tracking for order #501' }))
    await waitFor(() => expect(h.realtime.scopes.at(-1)).toEqual({ businessId, orderId: id }))
    act(() => h.realtime.emitStatus('connected'))
    const selected = screen.getByRole('region', { name: 'Selected customer order' })
    await within(selected).findByText('RECEIVED')
    const before = h.detail.mock.calls.length

    h.update({ ...received, status: 'IN_PROGRESS', items: [{ ...received.items[0]!,
      preparedThousandths: 1000, unavailableThousandths: 2000, remainingThousandths: 0,
    }] })
    act(() => h.realtime.emitInvalidation())
    await waitFor(() => expect(h.detail.mock.calls.length).toBeGreaterThan(before))
    expect(await within(selected).findByText('IN_PROGRESS')).toBeVisible()
    expect(await within(selected).findByText('Ingredient shortage')).toBeVisible()
    const item = within(selected).getByRole('article', { name: 'Tracked item: Bread' })
    expect(within(item).getByText('2')).toBeVisible()
    expect(within(item).getByText('1')).toBeVisible()
    expect(h.reasons).toHaveBeenCalledWith(id)
    h.unmount()
  })

  it('recovers a missed change on reconnect, without a new invalidation', async () => {
    const h = setup()
    await screen.findByRole('button', { name: 'View tracking for order #501' })
    act(() => h.realtime.emitStatus('connected'))
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2))
    act(() => h.realtime.emitStatus('disconnected'))
    await screen.findByText(/Tracking may be outdated/)
    const before = h.list.mock.calls.length
    h.update({ ...received, status: 'READY' })
    act(() => h.realtime.emitInvalidation())
    await Promise.resolve()
    expect(h.list).toHaveBeenCalledTimes(before)
    act(() => h.realtime.emitStatus('connected'))
    await waitFor(() => expect(h.list.mock.calls.length).toBeGreaterThan(before))
    await screen.findByText('Status: READY')
    h.unmount()
  })

  it('replaces detail channel on selection/back, then removes all listeners at unmount', async () => {
    const user = userEvent.setup()
    const h = setup()
    await screen.findByRole('button', { name: 'View tracking for order #501' })
    expect(h.realtime.scopes.at(-1)).toEqual({ businessId })
    await user.click(screen.getByRole('button', { name: 'View tracking for order #501' }))
    await waitFor(() => expect(h.realtime.scopes.at(-1)).toEqual({ businessId, orderId: id }))
    expect(h.realtime.activeSubscriptions).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Back to active orders' }))
    await waitFor(() => expect(h.realtime.scopes.at(-1)).toEqual({ businessId }))
    expect(h.realtime.activeSubscriptions).toBe(1)
    const before = h.list.mock.calls.length
    h.unmount()
    expect(h.realtime.activeSubscriptions).toBe(0)
    act(() => { h.realtime.emitInvalidation(); h.realtime.emitStatus('connected') })
    expect(h.list).toHaveBeenCalledTimes(before)
  })
})
