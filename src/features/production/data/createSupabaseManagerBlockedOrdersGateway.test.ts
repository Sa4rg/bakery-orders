import { describe, expect, it, vi } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { createSupabaseManagerBlockedOrdersGateway } from './createSupabaseManagerBlockedOrdersGateway'

function resultQuery(response: unknown) {
  const query = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(),
    range: vi.fn(async () => response), limit: vi.fn(async () => response),
    single: vi.fn(async () => response),
  }
  for (const method of ['select', 'eq', 'in', 'order'] as const) query[method].mockReturnValue(query)
  return query
}
const unavailable = { id: '11111111-1111-4111-8111-111111111111', order_number: 901,
  status: 'IN_PROGRESS', requested_delivery_at: '2030-01-15T10:30:00Z',
  items: [{ id: '22222222-2222-4222-8222-222222222222',
    requested_quantity: 3, prepared_quantity: 0, unavailable_quantity: 3 }],
}
const partial = { ...unavailable, id: '33333333-3333-4333-8333-333333333333', order_number: 902,
  items: [{ ...unavailable.items[0], prepared_quantity: 1, unavailable_quantity: 2 }],
}
function fixture(role: string, orders = [unavailable, partial]) {
  const profiles = resultQuery({ data: { role, active: true }, error: null })
  const rows = resultQuery({ data: orders, error: null })
  const audit = resultQuery({ data: [{ order_id: unavailable.id, reason: 'No flour',
    occurred_at: '2026-10-27T12:00:00Z' }], error: null })
  const from = vi.fn((name: string) => {
    if (name === 'profiles') return profiles
    if (name === 'orders') return rows
    if (name === 'order_events') return audit
    throw new Error('Unexpected table')
  })
  return { client: { from } as unknown as SupabaseBrowserClient, from, profiles, rows, audit }
}

describe('M4-009B — manager-specific authorized read boundary', () => {
  it('uses RLS reads and derives blocked condition; never writes or calls a KITCHEN RPC', async () => {
    const h = fixture('MANAGER')
    const gateway = createSupabaseManagerBlockedOrdersGateway(h.client)
    const page = await gateway.loadPage(0)
    expect(page.incidents).toHaveLength(1)
    expect(page.incidents[0]).toMatchObject({ orderNumber: 901, unavailableThousandths: 3000,
      reasons: [{ reason: 'No flour' }] })
    expect(h.from.mock.calls.map(([table]) => table)).toEqual(['profiles', 'orders', 'order_events'])
    expect(h.rows.eq).toHaveBeenCalledWith('status', 'IN_PROGRESS')
    expect(h.rows.range).toHaveBeenCalledWith(0, 25)
    expect(h.audit.eq).toHaveBeenCalledWith('event_type', 'QUANTITY_UNAVAILABLE')
  })
  it.each(['CUSTOMER', 'KITCHEN'])('rejects %s before querying Orders', async (role) => {
    const h = fixture(role)
    await expect(createSupabaseManagerBlockedOrdersGateway(h.client).loadPage(0)).rejects.toThrow('Manager access required.')
    expect(h.from).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid page indexes before network access', async () => {
    const h = fixture('MANAGER')
    await expect(createSupabaseManagerBlockedOrdersGateway(h.client).loadPage(-1)).rejects.toThrow('Invalid manager intervention page.')
    expect(h.from).not.toHaveBeenCalled()
  })
})
