import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ManagerBlockedOrdersInbox } from './ManagerBlockedOrdersInbox'
import type { ManagerBlockedOrdersGateway } from '../application/managerBlockedOrdersGateway'

function fakeGateway(): ManagerBlockedOrdersGateway {
  return {
    loadPage: vi.fn(async (pageIndex) => ({
      incidents: pageIndex === 0 ? [{
        orderId: '11111111-1111-4111-8111-111111111111', orderNumber: 901,
        requestedDeliveryAt: '2030-01-15T10:30:00Z', unavailableThousandths: 3000,
        reasons: [{ reason: 'No flour available', occurredAt: '2026-10-27T12:00:00Z' }],
      }] : [],
      hasNextPage: pageIndex === 0,
    })),
  }
}

describe('M4-009B — MANAGER read-only intervention view', () => {
  it('shows unavailable orders and shortage reasons without offering any mutation', async () => {
    const gateway = fakeGateway()
    render(<ManagerBlockedOrdersInbox gateway={gateway} />)
    const region = await screen.findByRole('region', { name: 'Manager production interventions' })
    expect(await within(region).findByText('Order #901')).toBeVisible()
    expect(within(region).getByText('No flour available')).toBeVisible()
    expect(within(region).getByText(/No automatic cancellation/i)).toBeVisible()
    expect(within(region).queryByRole('button', { name: /Cancel|Ready|Dispatch/i })).toBeNull()
    await userEvent.setup().click(within(region).getByRole('button', { name: 'Next orders page' }))
    expect(await within(region).findByText('No blocked orders on this page.')).toBeVisible()
    expect(within(region).getByText('Page 2')).toBeVisible()
    expect(gateway.loadPage).toHaveBeenCalledWith(1)
  })
  it('fails closed with a safe retry message', async () => {
    const gateway: ManagerBlockedOrdersGateway = { loadPage: vi.fn(async () => { throw new Error('secret SQL trace') }) }
    render(<ManagerBlockedOrdersInbox gateway={gateway} />)
    const region = await screen.findByRole('region', { name: 'Manager production interventions' })
    expect(await within(region).findByRole('alert')).toHaveTextContent('Unable to load manager interventions.')
    expect(within(region).queryByText(/secret SQL trace/)).toBeNull()
  })
})
