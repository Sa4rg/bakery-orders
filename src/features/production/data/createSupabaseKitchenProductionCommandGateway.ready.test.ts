import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenMarkReadyCommandError,
  KitchenMarkReadyValidationError,
} from '../application/kitchenProductionCommandGateway'
import { createSupabaseKitchenProductionCommandGateway } from './createSupabaseKitchenProductionCommandGateway'

const orderId = '90000000-0000-4000-8000-000000000001'

type RpcCall = { name: string; args: unknown }
function fakeClient(failure: unknown = null, rejected = false) {
  const calls: RpcCall[] = []
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args })
      return rejected
        ? Promise.reject(new Error('private provider stack'))
        : Promise.resolve({ data: null, error: failure })
    },
  } as unknown as SupabaseBrowserClient
  return { client, calls }
}

describe('M4-008F — markOrderReady trusted application adapter', () => {
  it('sends exactly the Order id to the trusted RPC (no client-provided actor, state or fulfillment)', async () => {
    const { client, calls } = fakeClient()
    await expect(createSupabaseKitchenProductionCommandGateway(client).markOrderReady(orderId))
      .resolves.toBeUndefined()
    expect(calls).toEqual([{ name: 'mark_order_ready', args: { p_order_id: orderId } }])
    expect(JSON.stringify(calls)).not.toMatch(/ready_at|status|condition|actor|prepared|fulfillment|audit/i)
  })

  it.each(['', ' ', 'invalid-uuid', '90000000-0000-4000-8000-00000000000x', null])(
    'rejects invalid Order ids before any RPC: %s', async (invalid) => {
      const { client, calls } = fakeClient()
      await expect(createSupabaseKitchenProductionCommandGateway(client)
        .markOrderReady(invalid as string)).rejects.toBeInstanceOf(KitchenMarkReadyValidationError)
      expect(calls).toEqual([])
    },
  )

  it('maps SQL lifecycle and security errors to a safe domain failure', async () => {
    const { client } = fakeClient({ code: '42501', message: 'secret postgres profile details' })
    const failure = await createSupabaseKitchenProductionCommandGateway(client)
      .markOrderReady(orderId).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(KitchenMarkReadyCommandError)
    expect(String(failure)).not.toMatch(/42501|secret|postgres|profile/i)
  })

  it('maps rejected network promises to the same safe failure, without automatic retry', async () => {
    const { client, calls } = fakeClient(null, true)
    await expect(createSupabaseKitchenProductionCommandGateway(client)
      .markOrderReady(orderId)).rejects.toBeInstanceOf(KitchenMarkReadyCommandError)
    expect(calls).toHaveLength(1)
  })

  it('treats a second READY call rejected by SQL as a failure, never as idempotent success', async () => {
    const { client, calls } = fakeClient({ code: '22023', message: 'IN_PROGRESS required' })
    await expect(createSupabaseKitchenProductionCommandGateway(client)
      .markOrderReady(orderId)).rejects.toBeInstanceOf(KitchenMarkReadyCommandError)
    expect(calls).toHaveLength(1)
  })
})
