import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  ManagerCatalogError,
  ManagerCatalogValidationError,
  type ManagerCatalogGateway,
} from '../application/managerCatalogGateway'
import {
  categoryAdminInputSchema,
  productCreationInputSchema,
  productUpdateInputSchema,
} from '../domain/managerCatalogSchema'

/** Maps narrow Manager catalog commands onto grants and RLS-protected Data API operations. */
export function createSupabaseManagerCatalogGateway(
  client: SupabaseBrowserClient,
): ManagerCatalogGateway {
  return {
    async loadManagerCatalog() {
      try {
        const [categoriesResult, productsResult] = await Promise.all([
          client
            .from('categories')
            .select('id, name, description, active, display_order')
            .order('display_order', { ascending: true })
            .order('name', { ascending: true }),
          client
            .from('products')
            .select(
              'id, category_id, name, description, unit_code, quantity_step, active, available',
            )
            .order('name', { ascending: true }),
        ])

        if (categoriesResult.error || productsResult.error) {
          throw new ManagerCatalogError()
        }

        return {
          categories: categoriesResult.data.map((category) => ({
            id: category.id,
            name: category.name,
            description: category.description,
            active: category.active,
            displayOrder: category.display_order,
          })),
          products: productsResult.data.map((product) => ({
            id: product.id,
            categoryId: product.category_id,
            name: product.name,
            description: product.description,
            unitCode: product.unit_code,
            quantityStep: product.quantity_step,
            active: product.active,
            available: product.available,
          })),
        }
      } catch {
        throw new ManagerCatalogError()
      }
    },

    async createCategory(input) {
      const parsed = categoryAdminInputSchema.safeParse(input)

      if (!parsed.success) {
        throw new ManagerCatalogValidationError()
      }

      try {
        const { data, error } = await client
          .from('categories')
          .insert({
            name: parsed.data.name,
            description: parsed.data.description,
            active: parsed.data.active,
            display_order: parsed.data.displayOrder,
          })
          .select('id')
          .single()

        if (error || data === null) {
          throw new ManagerCatalogError()
        }

        return data.id
      } catch {
        throw new ManagerCatalogError()
      }
    },

    async updateCategory(id, input) {
      const parsed = categoryAdminInputSchema.safeParse(input)

      if (!parsed.success) {
        throw new ManagerCatalogValidationError()
      }

      try {
        const { data, error } = await client
          .from('categories')
          .update({
            name: parsed.data.name,
            description: parsed.data.description,
            active: parsed.data.active,
            display_order: parsed.data.displayOrder,
          })
          .eq('id', id)
          .select('id')
          .maybeSingle()

        if (error || data === null) {
          throw new ManagerCatalogError()
        }
      } catch {
        throw new ManagerCatalogError()
      }
    },

    async createProduct(input) {
      const parsed = productCreationInputSchema.safeParse(input)

      if (!parsed.success) {
        throw new ManagerCatalogValidationError()
      }

      try {
        const { data, error } = await client
          .from('products')
          .insert({
            category_id: parsed.data.categoryId,
            name: parsed.data.name,
            description: parsed.data.description,
            unit_code: parsed.data.unitCode,
            quantity_step: parsed.data.quantityStep,
            active: parsed.data.active,
            available: parsed.data.available,
          })
          .select('id')
          .single()

        if (error || data === null) {
          throw new ManagerCatalogError()
        }

        return data.id
      } catch {
        throw new ManagerCatalogError()
      }
    },

    async updateProduct(id, input) {
      const parsed = productUpdateInputSchema.safeParse(input)

      if (!parsed.success) {
        throw new ManagerCatalogValidationError()
      }

      try {
        const { data, error } = await client
          .from('products')
          .update({
            category_id: parsed.data.categoryId,
            name: parsed.data.name,
            description: parsed.data.description,
            unit_code: parsed.data.unitCode,
            quantity_step: parsed.data.quantityStep,
            active: parsed.data.active,
          })
          .eq('id', id)
          .select('id')
          .maybeSingle()

        if (error || data === null) {
          throw new ManagerCatalogError()
        }
      } catch {
        throw new ManagerCatalogError()
      }
    },
  }
}
