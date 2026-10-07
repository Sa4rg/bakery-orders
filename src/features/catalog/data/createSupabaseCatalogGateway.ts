import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CatalogLoadError,
  type CatalogGateway,
} from '../application/catalogGateway'

/** Reads only the CUSTOMER-facing catalog fields; PostgreSQL RLS authorizes rows. */
export function createSupabaseCatalogGateway(
  client: SupabaseBrowserClient,
): CatalogGateway {
  return {
    async loadCatalog() {
      try {
        const [categoriesResult, productsResult] = await Promise.all([
          client
            .from('categories')
            .select('id, name, description, display_order')
            .order('display_order', { ascending: true })
            .order('name', { ascending: true }),
          client
            .from('products')
            .select(
              'id, category_id, name, description, unit_code, quantity_step, available',
            )
            .order('name', { ascending: true }),
        ])

        if (categoriesResult.error || productsResult.error) {
          throw new CatalogLoadError()
        }

        return {
          categories: categoriesResult.data.map((category) => ({
            id: category.id,
            name: category.name,
            description: category.description,
            displayOrder: category.display_order,
          })),
          products: productsResult.data.map((product) => ({
            id: product.id,
            categoryId: product.category_id,
            name: product.name,
            description: product.description,
            unitCode: product.unit_code,
            quantityStep: product.quantity_step,
            available: product.available,
          })),
        }
      } catch {
        throw new CatalogLoadError()
      }
    },
  }
}
