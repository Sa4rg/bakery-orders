import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import type {
  KitchenProductionRealtimeGateway,
  KitchenRealtimeConnectionStatus,
} from '../application/kitchenProductionRealtimeGateway'

let nextChannelId = 0

/**
 * Supabase Postgres Changes is an invalidation signal ONLY.
 * Never surface raw order/order_item payloads to the application layer.
 */
export function createSupabaseKitchenProductionRealtimeGateway(
  client: SupabaseBrowserClient,
): KitchenProductionRealtimeGateway {
  return {
    subscribe(listener) {
      let active = true
      let currentStatus: KitchenRealtimeConnectionStatus | null = null
      const channel = client.channel(`kitchen-production-${++nextChannelId}`)

      const notifyStatus = (status: KitchenRealtimeConnectionStatus) => {
        if (!active || currentStatus === status) return
        currentStatus = status
        listener.onConnectionStatusChange(status)
      }

      const notifyChange = () => {
        if (active) listener.onInvalidation()
      }

      const cleanup = () => {
        if (!active) return
        active = false
        // Supabase removal is asynchronous. Stop local callbacks immediately.
        void Promise.resolve()
          .then(() => client.removeChannel(channel))
          .catch(() => undefined)
      }

      try {
        notifyStatus('connecting')
        for (const table of ['orders', 'order_items'] as const) {
          for (const event of ['INSERT', 'UPDATE'] as const) {
            channel.on('postgres_changes', { event, schema: 'public', table }, notifyChange)
          }
        }
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            notifyStatus('connected')
          } else if (
            status === 'CHANNEL_ERROR'
            || status === 'TIMED_OUT'
            || status === 'CLOSED'
          ) {
            notifyStatus('disconnected')
          }
        })
      } catch {
        cleanup()
        throw new Error('Unable to start Kitchen production synchronization.')
      }

      return cleanup
    },
  }
}
