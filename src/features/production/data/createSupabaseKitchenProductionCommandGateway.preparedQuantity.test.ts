import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenPreparedQuantityCommandError,
  KitchenPreparedQuantityValidationError,
} from '../application/kitchenProductionCommandGateway'
import { createSupabaseKitchenProductionCommandGateway } from './createSupabaseKitchenProductionCommandGateway'

const itemId = '90000000-0000-4000-8000-000000000002'

type RpcCall = { name: string; args: unknown }
type RpcResult = {
  data: null
  error: { message: string; code?: string } | null
}

function fakeClient(result: RpcResult = { data: null, error: null }, rejects = false) {
  const calls: RpcCall[] = []
  return {
    calls,
    client: {
      rpc(name: string, args: unknown) {
        calls.push({ name, args })
        return rejects
          ? Promise.reject(new Error('private provider stack'))
          : Promise.resolve(result)
      },
    } as unknown as SupabaseBrowserClient,
  }
}

describe('recordPreparedQuantity on KitchenProductionCommandGateway', () => {
  it.each([
    { thousandths: 1, decimal: 0.001 },
    { thousandths: 125, decimal: 0.125 },
    { thousandths: 1500, decimal: 1.5 },
    { thousandths: 999_999_999_999, decimal: 999_999_999.999 },
  ])('sends only the item id and positive delta $thousandths', async ({ thousandths, decimal }) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordPreparedQuantity(itemId, thousandths)).resolves.toBeUndefined()
    expect(calls).toEqual([{
      name: 'record_prepared_quantity',
      args: { p_order_item_id: itemId, p_quantity: decimal },
    }])
    expect(JSON.stringify(calls)).not.toMatch(/actor|started_at|status|business|prepared_total|audit/i)
  })

  it.each([
    '',
    'not-an-id',
    '90000000-0000-4000-8000-00000000000x',
  ])('rejects an invalid item id before making an RPC (%s)', async (invalidId) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordPreparedQuantity(invalidId, 1000))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityValidationError)
    expect(calls).toEqual([])
  })

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Infinity,
    -Infinity,
    999_999_999_999 + 1,
    Number.MAX_SAFE_INTEGER,
  ])('rejects an invalid thousandths amount before RPC (%s)', async (amount) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordPreparedQuantity(itemId, amount))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityValidationError)
    expect(calls).toEqual([])
  })

  it('maps SQL authorization and lifecycle denials to a safe command error', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'private SQL lifecycle information', code: '22023' },
    })
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    const failure = await gateway.recordPreparedQuantity(itemId, 1000)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(KitchenPreparedQuantityCommandError)
    expect(String(failure)).not.toMatch(/private SQL|lifecycle|22023/i)
  })

  it('maps a rejected provider promise to the same safe command error', async () => {
    const { client } = fakeClient({ data: null, error: null }, true)
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordPreparedQuantity(itemId, 1000))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityCommandError)
  })

  it('does not silently treat repeated successful calls as a single idempotent operation', async () => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await gateway.recordPreparedQuantity(itemId, 1000)
    await gateway.recordPreparedQuantity(itemId, 1000)

    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual(calls[1])
  })
})
