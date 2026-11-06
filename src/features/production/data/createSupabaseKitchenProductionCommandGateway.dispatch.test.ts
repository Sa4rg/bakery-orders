import { describe, expect, it, vi } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenDispatchCommandError,
  KitchenDispatchValidationError,
} from '../application/kitchenProductionCommandGateway'
import { createSupabaseKitchenProductionCommandGateway } from './createSupabaseKitchenProductionCommandGateway'

const orderId = 'd1000000-0000-4000-8000-000000000001'

function gateway(result: { error: { code: string; message: string } | null } = { error: null }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { rpc, command: createSupabaseKitchenProductionCommandGateway(
    { rpc } as unknown as SupabaseBrowserClient,
  ) }
}

describe('M5-004 trusted KITCHEN dispatch adapter', () => {
  it('sends one narrow dispatch RPC and never supplies actor, timestamp or status', async () => {
    const { rpc, command } = gateway()
    await expect(command.dispatchOrder(orderId)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('dispatch_order', { p_order_id: orderId })
  })

  it.each(['', 'not-an-id', '00000000-0000-0000-0000-000000000000'])(
    'rejects an invalid Order id before network access (%s)', async (id) => {
      const { rpc, command } = gateway()
      await expect(command.dispatchOrder(id)).rejects.toBeInstanceOf(KitchenDispatchValidationError)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('does not leak PostgreSQL errors and never retries the command', async () => {
    const { rpc, command } = gateway({ error: { code: '22023', message: 'private SQL message' } })
    await expect(command.dispatchOrder(orderId)).rejects.toBeInstanceOf(KitchenDispatchCommandError)
    expect(rpc).toHaveBeenCalledOnce()
    await expect(command.dispatchOrder('invalid')).rejects.toBeInstanceOf(KitchenDispatchValidationError)
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('maps network rejection to safe error without a retry', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network/private connection details'))
    const command = createSupabaseKitchenProductionCommandGateway(
      { rpc } as unknown as SupabaseBrowserClient,
    )
    await expect(command.dispatchOrder(orderId)).rejects.toBeInstanceOf(KitchenDispatchCommandError)
    expect(rpc).toHaveBeenCalledOnce()
  })
})
