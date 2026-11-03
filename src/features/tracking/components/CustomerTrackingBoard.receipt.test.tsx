import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CustomerTrackedOrder } from '../domain/customerTrackedOrder'
import { createFakeCustomerTrackingRealtimeGateway } from '../testing/createFakeCustomerTrackingRealtimeGateway'
import { CustomerTrackingBoard } from './CustomerTrackingBoard'

const businessId = 'c4100000-0000-4000-8000-000000000001'
const orderId = 'c4200000-0000-4000-8000-000000000001'
const dispatched: CustomerTrackedOrder = {
  id: orderId, orderNumber: 505, businessId, status: 'DISPATCHED',
  createdAt: '2026-11-03T10:00:00Z', requestedDeliveryAt: '2026-11-08T10:00:00Z',
  customerNotes: null,
  items: [{ id: 'c4600000-0000-4000-8000-000000000001', productName: 'Bread',
    unitCode: 'UNIT', quantityStepThousandths: 1000, requestedThousandths: 3000,
    preparedThousandths: 1000, unavailableThousandths: 2000, remainingThousandths: 0 }],
}

function setup(options: {
  initial?: CustomerTrackedOrder
  receipt?: (orderId: string) => Promise<void>
} = {}) {
  let saved: CustomerTrackedOrder = options.initial ?? dispatched
  const loadOrder = vi.fn(async () => saved)
  const loadActiveOrders = vi.fn(async () => ({ orders: [saved], nextCursor: null }))
  const confirmReceipt = vi.fn(options.receipt ?? (async () => { saved = { ...saved, status: 'DELIVERED' } }))
  const realtime = createFakeCustomerTrackingRealtimeGateway()
  const view = render(<CustomerTrackingBoard
    businessId={businessId} realtimeGateway={realtime.gateway}
    queryGateway={{ loadOrder, loadActiveOrders }}
    shortageGateway={{ loadReasons: async () => [{ orderItemId: dispatched.items[0]!.id,
      reason: 'Not enough ingredients', occurredAt: '2026-11-03T10:00:00Z' }] }}
    receiptGateway={{ confirmReceipt }}
  />)
  return { ...view, confirmReceipt, loadOrder, loadActiveOrders, realtime,
    setSaved: (value: CustomerTrackedOrder) => { saved = value } }
}

async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'View tracking for order #505' }))
  const selected = screen.getByRole('region', { name: 'Selected customer order' })
  await within(selected).findByRole('article', { name: 'Tracked order #505' })
  return selected
}

describe('M5-005 CUSTOMER receipt confirmation UI', () => {
  it('requires explicit confirmation, supports cancellation, then verifies DELIVERED from PostgreSQL', async () => {
    const user = userEvent.setup()
    const h = setup()
    const selected = await openDetail(user)
    const panel = within(selected).getByRole('region', { name: 'Receipt confirmation for order #505' })
    await user.click(within(panel).getByRole('button', { name: 'Confirm receipt for order #505' }))
    expect(h.confirmReceipt).not.toHaveBeenCalled()
    await user.click(within(panel).getByRole('button', { name: 'Cancel receipt confirmation' }))
    expect(h.confirmReceipt).not.toHaveBeenCalled()
    await user.click(within(panel).getByRole('button', { name: 'Confirm receipt for order #505' }))
    await user.click(within(panel).getByRole('button', { name: 'Yes, received order #505' }))
    await within(selected).findByText('This Order has been confirmed delivered.')
    expect(within(selected).getByText('DELIVERED', { exact: true })).toBeVisible()
    expect(within(selected).getByText('Not enough ingredients')).toBeVisible()
    expect(h.confirmReceipt).toHaveBeenCalledTimes(1)
    expect(h.confirmReceipt).toHaveBeenCalledWith(orderId)
    expect(h.loadOrder.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(within(selected).queryByRole('button', { name: 'Confirm receipt for order #505' })).toBeNull()
  })

  it.each(['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'] as const)(
    'never exposes receipt action for %s', async (status) => {
      const h = setup({ initial: { ...dispatched, status } })
      await screen.findByRole('button', { name: 'View tracking for order #505' })
      await userEvent.setup().click(screen.getByRole('button', { name: 'View tracking for order #505' }))
      const selected = screen.getByRole('region', { name: 'Selected customer order' })
      await within(selected).findByText(status, { exact: true })
      expect(within(selected).queryByRole('button', { name: 'Confirm receipt for order #505' })).toBeNull()
      expect(h.confirmReceipt).not.toHaveBeenCalled()
    },
  )

  it('never retries uncertain RPC responses; a committed delivery is detected on re-read', async () => {
    const user = userEvent.setup()
    const h = setup({ receipt: async () => { h.setSaved({ ...dispatched, status: 'DELIVERED' }); throw new Error('private network details') } })
    const selected = await openDetail(user)
    await user.click(within(selected).getByRole('button', { name: 'Confirm receipt for order #505' }))
    await user.click(within(selected).getByRole('button', { name: 'Yes, received order #505' }))
    await within(selected).findByText('Receipt confirmed and saved.')
    expect(h.confirmReceipt).toHaveBeenCalledTimes(1)
    expect(within(selected).queryByText('private network details')).toBeNull()
  })

  it('when an uncertain RPC did not commit, shows safe feedback only after authoritative re-read', async () => {
    const user = userEvent.setup()
    const h = setup({ receipt: async () => { throw new Error('private network details') } })
    const selected = await openDetail(user)
    await user.click(within(selected).getByRole('button', { name: 'Confirm receipt for order #505' }))
    await user.click(within(selected).getByRole('button', { name: 'Yes, received order #505' }))
    await within(selected).findByText(/Receipt is not confirmed/)
    expect(h.confirmReceipt).toHaveBeenCalledTimes(1)
    expect(within(selected).queryByText('private network details')).toBeNull()
    // A second request is possible only after a new explicit two-step decision.
    expect(within(selected).getByRole('button', { name: 'Confirm receipt for order #505' })).toBeVisible()
  })

  it('holds the command pending while the first request is in flight and never sends a duplicate', async () => {
    const user = userEvent.setup()
    let complete!: () => void
    const pending = new Promise<void>((resolve) => { complete = resolve })
    const h = setup({ receipt: async () => {
      await pending
      h.setSaved({ ...dispatched, status: 'DELIVERED' })
    } })
    const selected = await openDetail(user)
    await user.click(within(selected).getByRole('button', { name: 'Confirm receipt for order #505' }))
    await user.click(within(selected).getByRole('button', { name: 'Yes, received order #505' }))
    await waitFor(() => expect(h.confirmReceipt).toHaveBeenCalledTimes(1))
    expect(within(selected).queryByRole('button', { name: 'Yes, received order #505' })).toBeNull()
    expect(within(selected).getByRole('button', { name: 'Confirm receipt for order #505' })).toBeDisabled()
    complete()
    await within(selected).findByText('This Order has been confirmed delivered.')
    expect(h.confirmReceipt).toHaveBeenCalledTimes(1)
  })
})
