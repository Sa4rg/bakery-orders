import { z } from 'zod'

export const productAvailabilityInputSchema = z
  .object({
    productId: z.string().uuid(),
    available: z.boolean(),
  })
  .strict()

export type ProductAvailabilityInput = z.infer<
  typeof productAvailabilityInputSchema
>