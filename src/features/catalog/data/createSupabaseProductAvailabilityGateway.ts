import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  ProductAvailabilityError,
  ProductAvailabilityValidationError,
  type ProductAvailabilityGateway,
} from '../application/productAvailabilityGateway'
import { productAvailabilityInputSchema } from '../domain/productAvailabilitySchema'

export function createSupabaseProductAvailabilityGateway(
  client: SupabaseBrowserClient,
): ProductAvailabilityGateway {
  return {
    async setAvailability(productId, available) {
      const parsed = productAvailabilityInputSchema.safeParse({
        productId,
        available,
      })

      if (!parsed.success) {
        throw new ProductAvailabilityValidationError()
      }

      try {
        const { data, error } = await client.rpc('set_product_availability', {
          p_product_id: parsed.data.productId,
          p_available: parsed.data.available,
        })

        if (error) {
          throw new ProductAvailabilityError()
        }

        return data
      } catch {
        throw new ProductAvailabilityError()
      }
    },
  }
}
