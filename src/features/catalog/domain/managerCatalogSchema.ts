import { z } from 'zod'

const categoryAdminFields = {
  name: z.string().trim().min(1),
  description: z.string().nullable(),
  active: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
}

export const categoryAdminInputSchema = z
  .object(categoryAdminFields)
  .strict()

export const productCreationInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1),
    description: z.string().nullable(),
    unitCode: z.string().trim().min(1),
    quantityStep: z.number().positive(),
    active: z.boolean(),
    available: z.boolean(),
  })
  .strict()

export const productUpdateInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1),
    description: z.string().nullable(),
    unitCode: z.string().trim().min(1),
    quantityStep: z.number().positive(),
    active: z.boolean(),
  })
  .strict()

export type CategoryAdminInput = z.infer<typeof categoryAdminInputSchema>
export type ProductCreationInput = z.infer<typeof productCreationInputSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>
