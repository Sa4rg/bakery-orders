import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenUnavailableQuantityCommandError,
  KitchenUnavailableQuantityValidationError,
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

describe('recordUnavailableQuantity on KitchenProductionCommandGateway', () => {
  it.each([
    { thousandths: 1, decimal: 0.001 },
    { thousandths: 125, decimal: 0.125 },
    { thousandths: 1500, decimal: 1.5 },
    { thousandths: 999_999_999_999, decimal: 999_999_999.999 },
  ])('sends only item id, exact positive delta $thousandths, and reason', async ({ thousandths, decimal }) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordUnavailableQuantity(itemId, thousandths, '  Missing ingredients  '))
      .resolves.toBeUndefined()
    expect(calls).toEqual([{
      name: 'record_unavailable_quantity',
      args: {
        p_order_item_id: itemId,
        p_quantity: decimal,
        p_reason: 'Missing ingredients',
      },
    }])
    expect(JSON.stringify(calls)).not.toMatch(/actor_user_id|business_id|status|unavailable_total|occurred_at/i)
  })

  it.each([
    '',
    'not-an-id',
    '90000000-0000-4000-8000-00000000000x',
  ])('rejects invalid item identifiers without calling SQL (%s)', async (invalidId) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordUnavailableQuantity(invalidId, 1000, 'Missing stock'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    expect(calls).toEqual([])
  })

  it.each([
    0, -1, 1.5, Number.NaN, Infinity, -Infinity,
    999_999_999_999 + 1, Number.MAX_SAFE_INTEGER,
  ])('rejects invalid thousandths before SQL (%s)', async (amount) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordUnavailableQuantity(itemId, amount, 'Missing stock'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    expect(calls).toEqual([])
  })

  it.each(['', ' ', '\t\r\n', '   \t  '])('rejects a blank reason without calling SQL (%s)', async (reason) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordUnavailableQuantity(itemId, 1000, reason))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    expect(calls).toEqual([])
  })

  it('rejects runtime non-string reasons without making an RPC', async () => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordUnavailableQuantity(itemId, 1000, null as unknown as string))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    expect(calls).toEqual([])
  })

  it('maps SQL role, lifecycle and quantity failures to a safe error', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'private SQL lifecycle and stock information', code: '22023' },
    })
    const gateway = createSupabaseKitchenProductionCommandGateway(client)
    const error = await gateway.recordUnavailableQuantity(itemId, 1000, 'supplier issue')
      .catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(KitchenUnavailableQuantityCommandError)
    expect(String(error)).not.toMatch(/private SQL|lifecycle|22023|supplier issue/i)
  })

  it('maps rejected provider promises to a safe error', async () => {
    const { client } = fakeClient({ data: null, error: null }, true)
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.recordUnavailableQuantity(itemId, 1000, 'supplier issue'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityCommandError)
  })

  it('treats repeated successful calls as distinct incremental operations', async () => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await gateway.recordUnavailableQuantity(itemId, 1000, 'batch A')
    await gateway.recordUnavailableQuantity(itemId, 1000, 'batch B')

    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ args: { p_reason: 'batch A' } })
    expect(calls[1]).toMatchObject({ args: { p_reason: 'batch B' } })
  })
})
