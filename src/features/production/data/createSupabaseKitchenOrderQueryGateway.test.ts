import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { describe, expect, it } from 'vitest'
import {
  KitchenOrderAccessError,
  KitchenOrderQueryError,
  KitchenOrderQueryValidationError,
} from '../application/kitchenOrderQueryGateway'
import { KitchenProductionDataError } from '../domain/kitchenProductionOrder'
import { createSupabaseKitchenOrderQueryGateway } from './createSupabaseKitchenOrderQueryGateway'

const businessId = '51000000-0000-4000-8000-000000000001'
const orderId = '52000000-0000-4000-8000-000000000001'
const itemId = '53000000-0000-4000-8000-000000000001'
const row = {
  id: orderId,
  order_number: 123,
  business_id: businessId,
  status: 'RECEIVED',
  requested_delivery_at: '2026-10-23T09:00:00+00:00',
  created_at: '2026-10-21T08:00:00+00:00',
  customer_notes: null,
  items: [{
    id: itemId,
    product_id: '54000000-0000-4000-8000-000000000001',
    product_name_snapshot: 'Bread',
    unit_code_snapshot: 'UNIT',
    quantity_step_snapshot: 1,
    requested_quantity: 3,
    prepared_quantity: 1,
    unavailable_quantity: 1,
  }],
}

type TestResult = { data: unknown; error: { code?: string; message: string } | null }

function fakeClient(options: {
  queue?: TestResult
  detail?: TestResult
  roleCheck?: TestResult
  names?: TestResult
} = {}) {
  const calls: Array<{ type: string; args: unknown[] }> = []
  const client = {
    rpc(name: string, args: { p_business_ids: string[] }) {
      calls.push({ type: `rpc:${name}`, args: [args] })
      return Promise.resolve(args.p_business_ids.length === 0
        ? (options.roleCheck ?? { data: [], error: null })
        : (options.names ?? { data: [{ id: businessId, name: 'Cafe Roma' }], error: null }))
    },
    from(table: string) {
      calls.push({ type: 'from', args: [table] })
      const query = {
        select(columns: string) {
          calls.push({ type: 'select', args: [columns] })
          return query
        },
        in(column: string, values: string[]) {
          calls.push({ type: 'in', args: [column, values] })
          return query
        },
        order(column: string, opts: { ascending: boolean }) {
          calls.push({ type: 'order', args: [column, opts] })
          return query
        },
        or(expression: string) {
          calls.push({ type: 'or', args: [expression] })
          return query
        },
        limit(amount: number) {
          calls.push({ type: 'limit', args: [amount] })
          return query
        },
        eq(column: string, value: string) {
          calls.push({ type: 'eq', args: [column, value] })
          return query
        },
        maybeSingle() {
          calls.push({ type: 'maybeSingle', args: [] })
          return Promise.resolve(options.detail ?? { data: row, error: null })
        },
        then(onFulfilled: (result: TestResult) => unknown, onRejected?: (error: unknown) => unknown) {
          return Promise.resolve(options.queue ?? { data: [row], error: null }).then(onFulfilled, onRejected)
        },
      }
      return query
    },
  }

  return { client: client as unknown as SupabaseBrowserClient, calls }
}

describe('createSupabaseKitchenOrderQueryGateway', () => {
  it('authorizes KITCHEN before querying and reads only approved Order/Item fields', async () => {
    const { client, calls } = fakeClient()
    const page = await createSupabaseKitchenOrderQueryGateway(client).loadProductionQueue()

    expect(page.orders).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
    expect(page.orders[0]).toMatchObject({
      businessId,
      businessName: 'Cafe Roma',
      orderNumber: 123,
      status: 'RECEIVED',
      items: [{ requestedThousandths: 3000, preparedThousandths: 1000, remainingThousandths: 1000 }],
    })
    expect(calls[0]).toEqual({ type: 'rpc:get_kitchen_order_business_names', args: [{ p_business_ids: [] }] })
    expect(calls.map(({ type }) => type)).toEqual([
      'rpc:get_kitchen_order_business_names',
      'from', 'select', 'in', 'order', 'order', 'order', 'limit',
      'rpc:get_kitchen_order_business_names',
    ])
    const projection = String(calls.find((call) => call.type === 'select')?.args[0])
    expect(projection).toContain('items:order_items')
    expect(projection).not.toMatch(/(?:^|\W)(?:\*|contact_name|contact_phone|delivery_address|created_by_user_id)(?:\W|$)/)
    expect(calls.find((call) => call.type === 'in')?.args).toEqual(['status', ['RECEIVED', 'IN_PROGRESS']])
    expect(calls.filter((call) => call.type === 'order').map((call) => call.args[0]))
      .toEqual(['requested_delivery_at', 'created_at', 'id'])
    expect(calls.find((call) => call.type === 'limit')?.args).toEqual([26])
    expect(calls.at(-1)).toEqual({
      type: 'rpc:get_kitchen_order_business_names',
      args: [{ p_business_ids: [businessId] }],
    })
  })

  it('does not query Orders after a denied KITCHEN preflight, including an empty queue', async () => {
    const { client, calls } = fakeClient({
      roleCheck: { data: null, error: { code: '42501', message: 'private SQL detail' } },
      queue: { data: [], error: null },
    })
    await expect(createSupabaseKitchenOrderQueryGateway(client).loadProductionQueue())
      .rejects.toBeInstanceOf(KitchenOrderAccessError)
    expect(calls.map((call) => call.type)).toEqual(['rpc:get_kitchen_order_business_names'])
  })

  it('supports a genuinely empty KITCHEN queue without exposing or requesting Business data', async () => {
    const { client, calls } = fakeClient({
      queue: { data: [], error: null },
    })

    await expect(
      createSupabaseKitchenOrderQueryGateway(client).loadProductionQueue()
    ).resolves.toEqual({
      orders: [],
      nextCursor: null,
    })

    expect(
      calls.filter((call) => call.type.startsWith('rpc:'))
    ).toHaveLength(1)
  })

  it('loads a single Order regardless of status and maps a Business projection', async () => {
    const { client, calls } = fakeClient({ detail: { data: { ...row, status: 'CANCELLED' }, error: null } })
    const order = await createSupabaseKitchenOrderQueryGateway(client).loadProductionOrder(orderId)
    expect(order?.status).toBe('CANCELLED')
    expect(calls.some((call) => call.type === 'in')).toBe(false)
    expect(calls.find((call) => call.type === 'eq')?.args).toEqual(['id', orderId])
    expect(calls.some((call) => call.type === 'maybeSingle')).toBe(true)
  })

  it('returns null for missing or RLS-invisible Orders without Business RPC', async () => {
    const { client, calls } = fakeClient({ detail: { data: null, error: null } })
    await expect(createSupabaseKitchenOrderQueryGateway(client).loadProductionOrder(orderId)).resolves.toBeNull()
    expect(calls.filter((call) => call.type.startsWith('rpc:'))).toHaveLength(1)
  })

  it('rejects invalid UUID input without any provider call', async () => {
    const { client, calls } = fakeClient()
    await expect(createSupabaseKitchenOrderQueryGateway(client).loadProductionOrder('bad-id'))
      .rejects.toBeInstanceOf(KitchenOrderQueryValidationError)
    expect(calls).toHaveLength(0)
  })

  it('fails closed when a Business name is missing or duplicated', async () => {
    const missing = fakeClient({ names: { data: [], error: null } })
    await expect(createSupabaseKitchenOrderQueryGateway(missing.client).loadProductionQueue())
      .rejects.toBeInstanceOf(KitchenProductionDataError)

    const duplicate = fakeClient({ names: { data: [
      { id: businessId, name: 'Cafe Roma' },
      { id: businessId, name: 'Cafe Roma' },
    ], error: null } })
    await expect(createSupabaseKitchenOrderQueryGateway(duplicate.client).loadProductionQueue())
      .rejects.toBeInstanceOf(KitchenProductionDataError)
  })

  it('never leaks low-level provider errors', async () => {
    const { client } = fakeClient({ queue: { data: null, error: { code: '42P01', message: 'relation does not exist' } } })
    const result = await createSupabaseKitchenOrderQueryGateway(client).loadProductionQueue()
      .catch((error: unknown) => error)
    expect(result).toBeInstanceOf(KitchenOrderQueryError)
    expect(String(result)).not.toMatch(/42P01|relation does not exist/)
  })
})

describe('Kitchen queue filtering and keyset pagination (M4-001D)', () => {
  it('accepts an explicit status filter, normalizes order, and limits parent Orders to pageSize + 1', async () => {
    const { client, calls } = fakeClient({
      queue: { data: [{ ...row, status: 'READY' }], error: null },
    })
    const page = await createSupabaseKitchenOrderQueryGateway(client)
      .loadProductionQueue({ statuses: ['READY', 'IN_PROGRESS'], pageSize: 1 })

    expect(page.orders).toHaveLength(1)
    expect(page.orders[0]?.status).toBe('READY')
    expect(page.nextCursor).toBeNull()
    expect(calls.find((call) => call.type === 'in')?.args)
      .toEqual(['status', ['IN_PROGRESS', 'READY']])
    expect(calls.find((call) => call.type === 'limit')?.args).toEqual([2])
  })

  it('creates a cursor from the last visible Order, not the lookahead Order', async () => {
    const secondId = '52000000-0000-4000-8000-000000000002'
    const second = {
      ...row,
      id: secondId,
      requested_delivery_at: '2026-10-24T09:00:00+00:00',
    }
    const first = fakeClient({ queue: { data: [row, second], error: null } })
    const page = await createSupabaseKitchenOrderQueryGateway(first.client)
      .loadProductionQueue({ statuses: ['RECEIVED'], pageSize: 1 })

    expect(page.orders).toHaveLength(1)
    expect(page.orders[0]?.id).toBe(orderId)
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(first.calls.at(-1)).toMatchObject({
      type: 'rpc:get_kitchen_order_business_names',
      args: [{ p_business_ids: [businessId] }],
    })

    const next = fakeClient({ queue: { data: [second], error: null } })
    const secondPage = await createSupabaseKitchenOrderQueryGateway(next.client)
      .loadProductionQueue({ statuses: ['RECEIVED'], pageSize: 1, cursor: page.nextCursor })
    expect(secondPage.orders.map((order) => order.id)).toEqual([secondId])
    expect(secondPage.nextCursor).toBeNull()
    const logic = String(next.calls.find((call) => call.type === 'or')?.args[0])
    expect(logic).toBe([
      'requested_delivery_at.gt."2026-10-23T09:00:00+00:00"',
      'and(requested_delivery_at.eq."2026-10-23T09:00:00+00:00",created_at.gt."2026-10-21T08:00:00+00:00")',
      `and(requested_delivery_at.eq."2026-10-23T09:00:00+00:00",created_at.eq."2026-10-21T08:00:00+00:00",id.gt.${orderId})`,
    ].join(','))
  })

  it('allows an equivalent reordered status set when continuing a cursor', async () => {
    const second = { ...row, id: '52000000-0000-4000-8000-000000000002' }
    const initial = fakeClient({ queue: { data: [row, second], error: null } })
    const token = (await createSupabaseKitchenOrderQueryGateway(initial.client)
      .loadProductionQueue({ statuses: ['READY', 'RECEIVED'], pageSize: 1 })).nextCursor
    // Provider stub: respect the requested statuses on the initial page.
    // The token is independent of input order, so reversed filters remain valid.
    const continued = fakeClient({ queue: { data: [], error: null } })
    await expect(createSupabaseKitchenOrderQueryGateway(continued.client)
      .loadProductionQueue({ statuses: ['RECEIVED', 'READY'], pageSize: 5, cursor: token }))
      .resolves.toEqual({ orders: [], nextCursor: null })
    expect(continued.calls.some((call) => call.type === 'or')).toBe(true)
  })

  it.each([
    { statuses: [] },
    { statuses: ['RECEIVED', 'RECEIVED'] },
    { statuses: ['NOT_A_STATUS'] },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: 1.5 },
    { pageSize: null },
    { pageSize: Number.NaN },
    { cursor: '' },
    { cursor: 'not-valid?' },
    { cursor: 'a'.repeat(1025) },
    { cursor: 42 },
    { statuses: null },
  ])('rejects untrusted filters before any network call: %j', async (filters) => {
    const { client, calls } = fakeClient()
    await expect(createSupabaseKitchenOrderQueryGateway(client)
      .loadProductionQueue(filters as never)).rejects.toBeInstanceOf(KitchenOrderQueryValidationError)
    expect(calls).toHaveLength(0)
  })

  it('rejects cursor reuse with changed filters or forged shape before network access', async () => {
    const extra = { ...row, id: '52000000-0000-4000-8000-000000000002' }
    const { client } = fakeClient({ queue: { data: [row, extra], error: null } })
    const cursor = (await createSupabaseKitchenOrderQueryGateway(client)
      .loadProductionQueue({ pageSize: 1 })).nextCursor

    const wrongStatus = fakeClient()
    await expect(createSupabaseKitchenOrderQueryGateway(wrongStatus.client)
      .loadProductionQueue({ statuses: ['READY'], cursor }))
      .rejects.toBeInstanceOf(KitchenOrderQueryValidationError)
    expect(wrongStatus.calls).toHaveLength(0)

    const forged = btoa(JSON.stringify({
      v: 1,
      statuses: ['RECEIVED', 'IN_PROGRESS'],
      last: { requestedDeliveryAt: '2026-10-23T09:00:00+00:00', createdAt: 'BAD', id: orderId },
    })).replace(/=+$/g, '')
    const invalid = fakeClient()
    await expect(createSupabaseKitchenOrderQueryGateway(invalid.client)
      .loadProductionQueue({ cursor: forged })).rejects.toBeInstanceOf(KitchenOrderQueryValidationError)
    expect(invalid.calls).toHaveLength(0)
  })

  it('does not request Business data for the extra lookahead row', async () => {
    const unseenBusiness = '51000000-0000-4000-8000-000000000002'
    const lookahead = { ...row, id: '52000000-0000-4000-8000-000000000002', business_id: unseenBusiness }
    const { client, calls } = fakeClient({ queue: { data: [row, lookahead], error: null } })
    const page = await createSupabaseKitchenOrderQueryGateway(client)
      .loadProductionQueue({ pageSize: 1 })
    expect(page.orders).toHaveLength(1)
    expect(calls.at(-1)?.args).toEqual([{ p_business_ids: [businessId] }])
  })

  it('fails closed on extra or inconsistent provider rows and maps backend errors safely', async () => {
    const inconsistent = fakeClient({ queue: { data: [{ ...row, status: 'DELIVERED' }], error: null } })
    await expect(createSupabaseKitchenOrderQueryGateway(inconsistent.client).loadProductionQueue())
      .rejects.toBeInstanceOf(KitchenProductionDataError)

    const extra = fakeClient({ queue: { data: [row, row, row], error: null } })
    await expect(createSupabaseKitchenOrderQueryGateway(extra.client).loadProductionQueue({ pageSize: 1 }))
      .rejects.toBeInstanceOf(KitchenProductionDataError)

    const forbidden = fakeClient({ queue: { data: null, error: { code: '42501', message: 'private' } } })
    await expect(createSupabaseKitchenOrderQueryGateway(forbidden.client).loadProductionQueue())
      .rejects.toBeInstanceOf(KitchenOrderAccessError)
  })
})
