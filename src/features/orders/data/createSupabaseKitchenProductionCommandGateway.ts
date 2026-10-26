import { z } from 'zod'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenPreparedQuantityCommandError,
  KitchenPreparedQuantityValidationError,
  KitchenProductionCommandError,
  KitchenProductionValidationError,
  type KitchenProductionCommandGateway,
} from '../application/kitchenProductionCommandGateway'

const orderIdSchema = z.string().uuid()
const orderItemIdSchema = z.string().uuid()

/** Maximum numeric(12,3), represented as an integer number of thousandths. */
const maxQuantityThousandths = 999_999_999_999

/**
 * A browser number is only accepted as an integer count of thousandths.
 * No floating-point addition is performed: PostgreSQL owns all totals.
 */
function preparedQuantityRpcNumber(quantityThousandths: number): number | null {
  if (
    !Number.isSafeInteger(quantityThousandths)
    || quantityThousandths <= 0
    || quantityThousandths > maxQuantityThousandths
  ) {
    return null
  }

  const whole = Math.floor(quantityThousandths / 1000)
  const remainder = quantityThousandths % 1000
  const decimal = `${whole}.${String(remainder).padStart(3, '0')}`

  // RPC's generated numeric argument is `number`; this produces a canonical
  // decimal JSON token. The SQL numeric argument does exact arithmetic.
  return Number(decimal)
}

/** Browser adapter: SQL owns authorization, lifecycle, locks and audit. */
export function createSupabaseKitchenProductionCommandGateway(
  client: SupabaseBrowserClient,
): KitchenProductionCommandGateway {
  return {
    async startOrder(orderId) {
      const parsed = orderIdSchema.safeParse(orderId)
      if (!parsed.success) {
        throw new KitchenProductionValidationError()
      }

      try {
        const { error } = await client.rpc('start_order', {
          p_order_id: parsed.data,
        })
        if (error) {
          throw error
        }
      } catch {
        throw new KitchenProductionCommandError()
      }
    },

    async recordPreparedQuantity(orderItemId, quantityThousandths) {
      const parsedItemId = orderItemIdSchema.safeParse(orderItemId)
      const quantity = preparedQuantityRpcNumber(quantityThousandths)
      if (!parsedItemId.success || quantity === null) {
        throw new KitchenPreparedQuantityValidationError()
      }

      try {
        const { error } = await client.rpc('record_prepared_quantity', {
          p_order_item_id: parsedItemId.data,
          p_quantity: quantity,
        })
        if (error) {
          throw error
        }
      } catch {
        throw new KitchenPreparedQuantityCommandError()
      }
    },
  }
}
