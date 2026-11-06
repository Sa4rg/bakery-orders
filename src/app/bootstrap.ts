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
import type { KitchenOrderQueryGateway } from '../features/production/application/kitchenOrderQueryGateway'
import { createSupabaseKitchenOrderQueryGateway } from '../features/production/data/createSupabaseKitchenOrderQueryGateway'
import type { KitchenOrderQueryFilters } from '../features/production/application/kitchenOrderQueryGateway'
import type { KitchenQueueSynchronizer } from '../features/production/application/kitchenQueueSynchronization'
import { createKitchenQueueSynchronizer } from '../features/production/application/kitchenQueueSynchronization'
import { createSupabaseKitchenProductionRealtimeGateway } from '../features/production/data/createSupabaseKitchenProductionRealtimeGateway'
import type { KitchenProductionCommandGateway } from '../features/production/application/kitchenProductionCommandGateway'
import { createSupabaseKitchenProductionCommandGateway } from '../features/production/data/createSupabaseKitchenProductionCommandGateway'
import type { ManagerBlockedOrdersGateway } from '../features/production/application/managerBlockedOrdersGateway'
import { createSupabaseManagerBlockedOrdersGateway } from '../features/production/data/createSupabaseManagerBlockedOrdersGateway'
import type { CustomerTrackingQueryGateway } from '../features/tracking/application/customerTrackingQueryGateway'
import { createSupabaseCustomerTrackingQueryGateway } from '../features/tracking/data/createSupabaseCustomerTrackingQueryGateway'
import type { CustomerShortageReasonsGateway } from '../features/tracking/application/customerShortageReasonsGateway'
import { createSupabaseCustomerShortageReasonsGateway } from '../features/tracking/data/createSupabaseCustomerShortageReasonsGateway'
import type { CustomerTrackingRealtimeGateway } from '../features/tracking/application/customerTrackingRealtimeGateway'
import { createSupabaseCustomerTrackingRealtimeGateway } from '../features/tracking/data/createSupabaseCustomerTrackingRealtimeGateway'
import type { CustomerReceiptGateway } from '../features/tracking/application/customerReceiptGateway'
import { createSupabaseCustomerReceiptGateway } from '../features/tracking/data/createSupabaseCustomerReceiptGateway'

export type AppBootstrap =
  | {
      status: 'ready'
      authGateway: AuthGateway
      catalogGateway: CatalogGateway
      productAvailabilityGateway: ProductAvailabilityGateway
      managerCatalogGateway: ManagerCatalogGateway
      createOrderGateway: CreateOrderGateway
      customerCancellationGateway: CustomerCancellationGateway
      customerTrackingQueryGateway: CustomerTrackingQueryGateway
      customerShortageReasonsGateway: CustomerShortageReasonsGateway
      customerTrackingRealtimeGateway: CustomerTrackingRealtimeGateway
      customerReceiptGateway: CustomerReceiptGateway
      kitchenOrderQueryGateway: KitchenOrderQueryGateway
      kitchenProductionCommandGateway: KitchenProductionCommandGateway
      managerBlockedOrdersGateway: ManagerBlockedOrdersGateway
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
    customerTrackingQueryGateway: createSupabaseCustomerTrackingQueryGateway(client),
    customerShortageReasonsGateway: createSupabaseCustomerShortageReasonsGateway(client),
    customerTrackingRealtimeGateway: createSupabaseCustomerTrackingRealtimeGateway(client),
    customerReceiptGateway: createSupabaseCustomerReceiptGateway(client),
    kitchenOrderQueryGateway,
    kitchenProductionCommandGateway: createSupabaseKitchenProductionCommandGateway(client),
    managerBlockedOrdersGateway: createSupabaseManagerBlockedOrdersGateway(client),
    createKitchenQueueSynchronizer: (filters) => createKitchenQueueSynchronizer({
      queryGateway: kitchenOrderQueryGateway,
      realtimeGateway: kitchenRealtimeGateway,
      filters,
    }),
  }
}
