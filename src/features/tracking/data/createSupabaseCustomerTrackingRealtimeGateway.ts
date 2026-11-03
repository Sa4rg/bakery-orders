import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { subscribeToOrderChanges } from '../../../shared/realtime/orderChangesRealtime'
import type { CustomerTrackingRealtimeGateway } from '../application/customerTrackingRealtimeGateway'

/** CUSTOMER transport; PostgreSQL RLS, not the browser filter, authorizes each event. */
export function createSupabaseCustomerTrackingRealtimeGateway(
  client: SupabaseBrowserClient,
): CustomerTrackingRealtimeGateway {
  return {
    subscribe(scope, listener) {
      return subscribeToOrderChanges(client, 'customer-tracking', listener, scope)
    },
  }
}
