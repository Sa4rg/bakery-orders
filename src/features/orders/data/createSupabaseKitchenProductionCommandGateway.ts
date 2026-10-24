import { z } from 'zod'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  KitchenProductionCommandError,
  KitchenProductionValidationError,
  type KitchenProductionCommandGateway,
} from '../application/kitchenProductionCommandGateway'

const orderIdSchema = z.string().uuid()

/** Browser adapter: SQL owns actor, time, state transition, lock and audit. */
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
  }
}
