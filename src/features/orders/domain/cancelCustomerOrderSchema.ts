import { z } from 'zod'

export const cancellationReasonSchema = z
  .string()
  .trim()
  .min(1, 'Enter a cancellation reason.')

export const cancelCustomerOrderInputSchema = z
  .object({
    orderId: z.string().uuid(),
    reason: cancellationReasonSchema,
  })
  .strict()

export const cancelCustomerOrderFormSchema = z
  .object({
    reason: cancellationReasonSchema,
  })
  .strict()

export type CancelCustomerOrderInput = z.infer<
  typeof cancelCustomerOrderInputSchema
>

export type CancelCustomerOrderForm = z.infer<
  typeof cancelCustomerOrderFormSchema
>