import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenProductionCommandError,
  KitchenProductionValidationError,
} from '../application/kitchenProductionCommandGateway'
import { createSupabaseKitchenProductionCommandGateway } from './createSupabaseKitchenProductionCommandGateway'

const validOrderId = '90000000-0000-4000-8000-000000000001'

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

describe('createSupabaseKitchenProductionCommandGateway', () => {
  it('calls only start_order with the validated Order id; never supplies actor or state', async () => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.startOrder(validOrderId)).resolves.toBeUndefined()

    expect(calls).toEqual([{
      name: 'start_order',
      args: { p_order_id: validOrderId },
    }])
    expect(JSON.stringify(calls)).not.toMatch(/actor|started_at|status|business|audit/i)
  })

  it.each([
    '',
    '  ',
    'not-a-uuid',
    '90000000-0000-4000-8000-00000000000x',
  ])('rejects invalid identifiers before RPC (%s)', async (invalidId) => {
    const { calls, client } = fakeClient()
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.startOrder(invalidId)).rejects.toBeInstanceOf(
      KitchenProductionValidationError,
    )
    expect(calls).toEqual([])
  })

  it('maps authorization and lifecycle errors to a safe application failure', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'SQLSTATE 42501 internal authorization detail', code: '42501' },
    })
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    const failure = await gateway.startOrder(validOrderId).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(KitchenProductionCommandError)
    expect(String(failure)).not.toMatch(/SQLSTATE|42501|internal|authorization detail/i)
  })

  it('maps unexpected provider exceptions to the same safe failure', async () => {
    const { client } = fakeClient({ data: null, error: null }, true)
    const gateway = createSupabaseKitchenProductionCommandGateway(client)

    await expect(gateway.startOrder(validOrderId)).rejects.toBeInstanceOf(
      KitchenProductionCommandError,
    )
  })

  it('does not treat a rejected second start as successful idempotency', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'Order cannot start preparation in its current state.', code: '22023' },
    })
    await expect(createSupabaseKitchenProductionCommandGateway(client)
      .startOrder(validOrderId)).rejects.toBeInstanceOf(KitchenProductionCommandError)
  })
})
