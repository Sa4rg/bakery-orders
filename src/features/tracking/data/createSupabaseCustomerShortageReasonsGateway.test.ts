import { describe, expect, it, vi } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CustomerShortageAccessError,
  CustomerShortageDataError,
  CustomerShortageQueryError,
  CustomerShortageValidationError,
} from '../application/customerShortageReasonsGateway'
import { createSupabaseCustomerShortageReasonsGateway } from './createSupabaseCustomerShortageReasonsGateway'

const orderId = 'a2200000-0000-4000-8000-000000000001'
const itemId = 'a2600000-0000-4000-8000-000000000001'
const reason = {
  order_item_id: itemId,
  reason: 'Ingredient not supplied',
  occurred_at: '2026-11-02T08:00:00.123456+00:00',
}

function fakeClient(result: { data: unknown; error: { code: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc } as unknown as SupabaseBrowserClient, rpc }
}

describe('CUSTOMER shortage reasons projection adapter', () => {
  it('requests only the narrow server-authorized RPC and maps historical reasons', async () => {
    const { client, rpc } = fakeClient({ data: [reason], error: null })
    const data = await createSupabaseCustomerShortageReasonsGateway(client).loadReasons(orderId)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'get_customer_order_unavailability_reasons', { p_order_id: orderId },
    )
    expect(data).toEqual([{
      orderItemId: itemId,
      reason: 'Ingredient not supplied',
      occurredAt: reason.occurred_at,
    }])
  })

  it('accepts empty result without inferring whether an Order is missing or foreign', async () => {
    const { client } = fakeClient({ data: [], error: null })
    expect(await createSupabaseCustomerShortageReasonsGateway(client).loadReasons(orderId)).toEqual([])
  })

  it.each(['not-an-id', '', '00000000-0000-0000-0000-000000000001'])(
    'rejects an invalid id without network access: %s', async (invalid) => {
      const { client, rpc } = fakeClient({ data: [], error: null })
      await expect(createSupabaseCustomerShortageReasonsGateway(client).loadReasons(invalid))
        .rejects.toBeInstanceOf(CustomerShortageValidationError)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('maps authorization errors without leaking provider detail', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501' } })
    await expect(createSupabaseCustomerShortageReasonsGateway(client).loadReasons(orderId))
      .rejects.toBeInstanceOf(CustomerShortageAccessError)
  })

  it('maps unknown provider failures to a safe query error', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'PGRST999' } })
    await expect(createSupabaseCustomerShortageReasonsGateway(client).loadReasons(orderId))
      .rejects.toBeInstanceOf(CustomerShortageQueryError)
  })

  it.each([
    null,
    [null],
    [{ ...reason, order_item_id: 'invalid' }],
    [{ ...reason, reason: '  ' }],
    [{ ...reason, occurred_at: 'not a timestamp' }],
  ])('rejects malformed projected data without silent substitution', async (data) => {
    const { client } = fakeClient({ data, error: null })
    await expect(createSupabaseCustomerShortageReasonsGateway(client).loadReasons(orderId))
      .rejects.toBeInstanceOf(CustomerShortageDataError)
  })
})
