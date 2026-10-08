import { createSupabaseBrowserClient } from '../lib/supabase/client'
import {
  readSupabaseConfig,
  type SupabaseConfigVariable,
} from '../lib/supabase/config'
import type { AuthGateway } from '../features/auth/application/authGateway'
import { createSupabaseAuthGateway } from '../features/auth/data/createSupabaseAuthGateway'
import type { CatalogGateway } from '../features/catalog/application/catalogGateway'
import { createSupabaseCatalogGateway } from '../features/catalog/data/createSupabaseCatalogGateway'
import type { ManagerCatalogGateway } from '../features/catalog/application/managerCatalogGateway'
import { createSupabaseManagerCatalogGateway } from '../features/catalog/data/createSupabaseManagerCatalogGateway'
import type { ProductAvailabilityGateway } from '../features/catalog/application/productAvailabilityGateway'
import { createSupabaseProductAvailabilityGateway } from '../features/catalog/data/createSupabaseProductAvailabilityGateway'

export type AppBootstrap =
  | {
      status: 'ready'
      authGateway: AuthGateway
      catalogGateway: CatalogGateway
      productAvailabilityGateway: ProductAvailabilityGateway
      managerCatalogGateway: ManagerCatalogGateway
    }
  | { status: 'misconfigured'; variables: SupabaseConfigVariable[] }

/**
 * Composition root: validates the browser environment and wires the Supabase
 * client into the feature boundaries. Never throws for bad configuration.
 */
export function createAppBootstrap(env: Record<string, unknown>): AppBootstrap {
  const config = readSupabaseConfig(env)

  if (config.status === 'invalid') {
    return { status: 'misconfigured', variables: config.variables }
  }

  const client = createSupabaseBrowserClient(config)

  return {
    status: 'ready',
    authGateway: createSupabaseAuthGateway(client),
    catalogGateway: createSupabaseCatalogGateway(client),
    productAvailabilityGateway: createSupabaseProductAvailabilityGateway(client),
    managerCatalogGateway: createSupabaseManagerCatalogGateway(client),
  }
}
