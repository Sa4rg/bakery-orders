import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { CustomerTrackingAccessError, CustomerTrackingValidationError, CustomerTrackingQueryError } from '../application/customerTrackingQueryGateway'
import { createSupabaseCustomerTrackingQueryGateway } from './createSupabaseCustomerTrackingQueryGateway'

const id = '00000000-0000-4000-8000-000000000011'
const order = {
  id, order_number: 123, business_id: '00000000-0000-4000-8000-000000000022',
  status: 'RECEIVED', requested_delivery_at: '2026-11-01T12:00:00+00:00',
  created_at: '2026-10-28T10:00:00.123456+00:00', customer_notes: null,
  items: [{ id: '00000000-0000-4000-8000-000000000033', product_name_snapshot: 'Bread', unit_code_snapshot: 'UNIT',
    quantity_step_snapshot: '1', requested_quantity: '3', prepared_quantity: '1', unavailable_quantity: '0' }],
}

type QueryResult = { data: unknown; error: { code?: string; message: string } | null }
function fakeClient(options: {
  role?: string; active?: boolean; memberships?: unknown[]; list?: QueryResult; detail?: QueryResult;
} = {}) {
  const calls: string[] = []
  const query = (table: string) => {
    const chain = {
      select(columns: string) { calls.push(`select:${table}:${columns}`); return chain },
      eq(column: string, value: unknown) { calls.push(`eq:${table}:${column}:${String(value)}`); return chain },
      in(column: string, values: unknown[]) { calls.push(`in:${table}:${column}:${values.join(',')}`); return chain },
      order(column: string, opts: { ascending: boolean }) { calls.push(`order:${column}:${opts.ascending}`); return chain },
      limit(amount: number) { calls.push(`limit:${amount}`); return chain },
      or(expression: string) { calls.push(`or:${expression}`); return chain },
      maybeSingle() { calls.push(`single:${table}`); return Promise.resolve(table === 'profiles'
        ? { data: { role: options.role ?? 'CUSTOMER', active: options.active ?? true }, error: null }
        : (options.detail ?? { data: order, error: null })) },
      then(resolve: (value: QueryResult) => unknown, reject?: (error: unknown) => unknown) {
        const result = table === 'business_memberships'
          ? { data: options.memberships ?? [{ business_id: order.business_id }], error: null }
          : options.list ?? { data: [order], error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return chain
  }
  const client = { from(table: string) { calls.push(`from:${table}`); return query(table) } }
  return { client: client as unknown as SupabaseBrowserClient, calls }
}

describe('CUSTOMER tracking adapter', () => {
  it('checks role and active membership before reading a bounded, RLS-scoped queue', async () => {
    const h = fakeClient()
    const page = await createSupabaseCustomerTrackingQueryGateway(h.client).loadActiveOrders()
    expect(page.orders).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
    expect(page.orders[0]?.items[0]?.requestedThousandths).toBe(3000)
    expect(h.calls.slice(0, 6)).toEqual([
      'from:profiles', 'select:profiles:role, active', 'single:profiles',
      'from:business_memberships', 'select:business_memberships:business_id',
      'eq:business_memberships:active:true',
    ])
    expect(h.calls).toContain('in:orders:status:RECEIVED,IN_PROGRESS,READY,DISPATCHED')
    expect(h.calls).toContain('order:created_at:false')
    expect(h.calls).toContain('order:id:false')
    expect(h.calls).toContain('limit:26')
    const projection = h.calls.find((call) => call.startsWith('select:orders:')) ?? ''
    expect(projection).toContain('items:order_items')
    expect(projection).not.toMatch(/(?:\*|created_by_user_id|delivery_address_snapshot|actor_user_id|order_events)/)
  })
  it('denies KITCHEN, MANAGER, inactive CUSTOMER and customers without memberships before any Order read', async () => {
    for (const options of [{ role: 'KITCHEN' }, { role: 'MANAGER' }, { active: false }, { memberships: [] }]) {
      const h = fakeClient(options)
      await expect(createSupabaseCustomerTrackingQueryGateway(h.client).loadActiveOrders())
        .rejects.toBeInstanceOf(CustomerTrackingAccessError)
      expect(h.calls).not.toContain('from:orders')
    }
  })
  it('allows an authorized CUSTOMER to receive an empty page without mistaking it for an access denial', async () => {
    const h = fakeClient({ list: { data: [], error: null } })
    expect(await createSupabaseCustomerTrackingQueryGateway(h.client).loadActiveOrders())
      .toEqual({ orders: [], nextCursor: null })
  })
  it('uses a stable keyset cursor, and does not expose terminal orders in active listings', async () => {
    const h = fakeClient({ list: { data: [order, { ...order, id: '00000000-0000-4000-8000-000000000012' }], error: null } })
    const gateway = createSupabaseCustomerTrackingQueryGateway(h.client)
    const page = await gateway.loadActiveOrders({ pageSize: 1 })
    expect(page.orders).toHaveLength(1)
    expect(page.nextCursor).toBeTruthy()
    const second = await gateway.loadActiveOrders({ pageSize: 1, cursor: page.nextCursor })
    expect(second.orders).toHaveLength(1)
    expect(h.calls.some((c) => c.startsWith('or:created_at.lt.'))).toBe(true)
  })
  it('loads terminal orders by ID, and returns null on RLS-invisible/missing orders', async () => {
    const h = fakeClient({ detail: { data: { ...order, status: 'DELIVERED' }, error: null } })
    expect((await createSupabaseCustomerTrackingQueryGateway(h.client).loadOrder(id))?.status).toBe('DELIVERED')
    const missing = fakeClient({ detail: { data: null, error: null } })
    expect(await createSupabaseCustomerTrackingQueryGateway(missing.client).loadOrder(id)).toBeNull()
  })
  it('rejects invalid inputs before contacting the provider', async () => {
    const h = fakeClient()
    const gateway = createSupabaseCustomerTrackingQueryGateway(h.client)
    await expect(gateway.loadActiveOrders({ pageSize: 0 })).rejects.toBeInstanceOf(CustomerTrackingValidationError)
    await expect(gateway.loadOrder('not-a-uuid')).rejects.toBeInstanceOf(CustomerTrackingValidationError)
    expect(h.calls).toEqual([])
  })
  it('sanitizes provider failures without leaking raw SQL diagnostics', async () => {
    const h = fakeClient({ list: { data: null, error: { code: 'XX000', message: 'database secret' } } })
    await expect(createSupabaseCustomerTrackingQueryGateway(h.client).loadActiveOrders())
      .rejects.toBeInstanceOf(CustomerTrackingQueryError)
  })
})
