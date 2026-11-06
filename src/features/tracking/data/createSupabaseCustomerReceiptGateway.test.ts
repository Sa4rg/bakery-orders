import { describe, expect, it, vi } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CustomerReceiptCommandError,
  CustomerReceiptValidationError,
} from '../application/customerReceiptGateway'
import { createSupabaseCustomerReceiptGateway } from './createSupabaseCustomerReceiptGateway'

const orderId = 'c4200000-0000-4000-8000-000000000001'

function fake(result: { error: { code: string; message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result)
  const client = { rpc } as unknown as SupabaseBrowserClient
  return { rpc, gateway: createSupabaseCustomerReceiptGateway(client) }
}

describe('M5-005 trusted CUSTOMER receipt adapter', () => {
  it('calls the one SQL command exactly once with only its Order ID', async () => {
    const { rpc, gateway } = fake({ error: null })
    await expect(gateway.confirmReceipt(orderId)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('confirm_order_receipt', { p_order_id: orderId })
  })

  it.each(['', 'bad-id', '00000000-0000-0000-0000-000000000000'])(
    'rejects invalid or nil UUID before any network request (%s)', async (value) => {
      const { rpc, gateway } = fake({ error: null })
      await expect(gateway.confirmReceipt(value))
        .rejects.toBeInstanceOf(CustomerReceiptValidationError)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('sanitizes SQL rejection and never retries', async () => {
    const { rpc, gateway } = fake({ error: { code: '42501', message: 'sensitive SQL detail' } })
    await expect(gateway.confirmReceipt(orderId)).rejects.toBeInstanceOf(CustomerReceiptCommandError)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('sanitizes ambiguous transport failures without retries', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('private network details'))
    const client = { rpc } as unknown as SupabaseBrowserClient
    await expect(createSupabaseCustomerReceiptGateway(client).confirmReceipt(orderId))
      .rejects.toBeInstanceOf(CustomerReceiptCommandError)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
