import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { subscribeToOrderChanges } from '../../../shared/realtime/orderChangesRealtime'
import type { KitchenProductionRealtimeGateway } from '../application/kitchenProductionRealtimeGateway'

/** Existing M4 semantics, now backed by the shared signal-only transport. */
export function createSupabaseKitchenProductionRealtimeGateway(
  client: SupabaseBrowserClient,
): KitchenProductionRealtimeGateway {
  return {
    subscribe(listener) {
      return subscribeToOrderChanges(client, 'kitchen-production', listener)
    },
  }
}
