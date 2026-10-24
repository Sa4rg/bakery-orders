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
import type { CreateOrderGateway } from '../features/orders/application/createOrderGateway'
import { createSupabaseCreateOrderGateway } from '../features/orders/data/createSupabaseCreateOrderGateway'
import type { CustomerCancellationGateway } from '../features/orders/application/customerCancellationGateway'
import { createSupabaseCustomerCancellationGateway } from '../features/orders/data/createSupabaseCustomerCancellationGateway'
import type { KitchenOrderQueryGateway } from '../features/orders/application/kitchenOrderQueryGateway'
import { createSupabaseKitchenOrderQueryGateway } from '../features/orders/data/createSupabaseKitchenOrderQueryGateway'
import type { KitchenOrderQueryFilters } from '../features/orders/application/kitchenOrderQueryGateway'
import type { KitchenQueueSynchronizer } from '../features/orders/application/kitchenQueueSynchronization'
import { createKitchenQueueSynchronizer } from '../features/orders/application/kitchenQueueSynchronization'
import { createSupabaseKitchenProductionRealtimeGateway } from '../features/orders/data/createSupabaseKitchenProductionRealtimeGateway'

export type AppBootstrap =
  | {
      status: 'ready'
      authGateway: AuthGateway
      catalogGateway: CatalogGateway
      productAvailabilityGateway: ProductAvailabilityGateway
      managerCatalogGateway: ManagerCatalogGateway
      createOrderGateway: CreateOrderGateway
      customerCancellationGateway: CustomerCancellationGateway
      kitchenOrderQueryGateway: KitchenOrderQueryGateway
      createKitchenQueueSynchronizer: (filters?: KitchenOrderQueryFilters) => KitchenQueueSynchronizer
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
  const kitchenOrderQueryGateway = createSupabaseKitchenOrderQueryGateway(client)
  const kitchenRealtimeGateway = createSupabaseKitchenProductionRealtimeGateway(client)

  return {
    status: 'ready',
    authGateway: createSupabaseAuthGateway(client),
    catalogGateway: createSupabaseCatalogGateway(client),
    productAvailabilityGateway: createSupabaseProductAvailabilityGateway(client),
    managerCatalogGateway: createSupabaseManagerCatalogGateway(client),
    createOrderGateway: createSupabaseCreateOrderGateway(client),
    customerCancellationGateway: createSupabaseCustomerCancellationGateway(client),
    kitchenOrderQueryGateway,
    createKitchenQueueSynchronizer: (filters) => createKitchenQueueSynchronizer({
      queryGateway: kitchenOrderQueryGateway,
      realtimeGateway: kitchenRealtimeGateway,
      filters,
    }),
  }
}
