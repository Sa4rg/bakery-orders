import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CustomerCancellationError,
  CustomerCancellationValidationError,
  type CustomerCancellationGateway,
} from '../application/customerCancellationGateway'
import { cancelCustomerOrderInputSchema } from '../domain/cancelCustomerOrderSchema'

export function createSupabaseCustomerCancellationGateway(
  client: SupabaseBrowserClient,
): CustomerCancellationGateway {
  return {
    async cancelOrder(input) {
      const parsed =
        cancelCustomerOrderInputSchema.safeParse(
          input,
        )

      if (!parsed.success) {
        throw new CustomerCancellationValidationError()
      }

      try {
        const { error } = await client.rpc(
          'cancel_customer_order',
          {
            p_order_id:
              parsed.data.orderId,
            p_reason:
              parsed.data.reason,
          },
        )

        if (error) {
          throw error
        }
      } catch {
        throw new CustomerCancellationError()
      }
    },
  }
}