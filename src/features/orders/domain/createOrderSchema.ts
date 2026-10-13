import { z } from 'zod'

export const createOrderItemInputSchema = z
  .object({
    productId: z.string().uuid(),
    requestedQuantity: z.number().finite().positive(),
  })
  .strict()

export const createOrderInputSchema = z
  .object({
    businessId: z.string().uuid(),
    requestedDeliveryAt: z.string().datetime({ offset: true }),
    customerNotes: z.string().nullable(),
    idempotencyKey: z.string().uuid(),
    items: z.array(createOrderItemInputSchema).min(1),
  })
  .strict()

export type CreateOrderItemInput = z.infer<
  typeof createOrderItemInputSchema
>

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>