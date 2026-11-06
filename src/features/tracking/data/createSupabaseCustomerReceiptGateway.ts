import { z } from 'zod'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CustomerReceiptCommandError,
  CustomerReceiptValidationError,
  type CustomerReceiptGateway,
} from '../application/customerReceiptGateway'

const orderIdSchema = z.string().uuid()
const nilUuid = '00000000-0000-0000-0000-000000000000'

/** Never accept a role, Business, actor, timestamp or status from the browser. */
export function createSupabaseCustomerReceiptGateway(
  client: SupabaseBrowserClient,
): CustomerReceiptGateway {
  return {
    async confirmReceipt(orderId) {
      const parsed = orderIdSchema.safeParse(orderId)
      if (!parsed.success || parsed.data.toLowerCase() === nilUuid) {
        throw new CustomerReceiptValidationError()
      }
      try {
        const { error } = await client.rpc('confirm_order_receipt', {
          p_order_id: parsed.data,
        })
        if (error) throw error
      } catch {
        // Never surface SQL/transport internals; a failed response may be
        // ambiguous, so the caller must read saved state before retrying.
        throw new CustomerReceiptCommandError()
      }
    },
  }
}
