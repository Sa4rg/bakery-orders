import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import type { Database } from '../../../lib/supabase/database.types'
import {
  CreateOrderError,
  CreateOrderValidationError,
  type CreateOrderGateway,
} from '../application/createOrderGateway'
import { createOrderInputSchema } from '../domain/createOrderSchema'

type CreateOrderRpcArgs =
  Database['public']['Functions']['create_order']['Args']

type CreateOrderRpcCustomerNotes =
  CreateOrderRpcArgs['p_customer_notes']

// PostgreSQL accepts NULL for the optional notes argument, while the
// generated Supabase RPC type exposes the text parameter as string.

export function createSupabaseCreateOrderGateway(
  client: SupabaseBrowserClient,
): CreateOrderGateway {
  return {
    async createOrder(input) {
      const parsed = createOrderInputSchema.safeParse(input)

      if (!parsed.success) {
        throw new CreateOrderValidationError()
      }

      try {
        const { data, error } = await client.rpc('create_order', {
          p_business_id: parsed.data.businessId,
          p_requested_delivery_at:
            parsed.data.requestedDeliveryAt,
          p_customer_notes:
            parsed.data.customerNotes as CreateOrderRpcCustomerNotes,
          p_idempotency_key: parsed.data.idempotencyKey,
          p_items: parsed.data.items.map((item) => ({
            product_id: item.productId,
            requested_quantity: item.requestedQuantity,
          })),
        })

        if (error || data === null) {
          throw new CreateOrderError()
        }

        return data
      } catch {
        throw new CreateOrderError()
      }
    },
  }
}