import type { SupabaseBrowserClient } from '../../lib/supabase/client'

export type OrderChangesConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface OrderChangesListener {
  onInvalidation(): void
  onConnectionStatusChange(status: OrderChangesConnectionStatus): void
}

export interface OrderChangesSubscriptionScope {
  /** Only relevant Orders; the server still enforces RLS. */
  readonly businessId?: string
  /** Only lines of the selected Order; never a reason/audit stream. */
  readonly orderId?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let channelSerial = 0

/**
 * Common transport for KITCHEN and CUSTOMER. This produces signals only,
 * never database rows or payloads. PostgreSQL SELECT/RLS controls delivery.
 */
export function subscribeToOrderChanges(
  client: SupabaseBrowserClient,
  name: 'kitchen-production' | 'customer-tracking',
  listener: OrderChangesListener,
  scope: OrderChangesSubscriptionScope = {},
): () => void {
  if (scope.businessId !== undefined && !UUID.test(scope.businessId)) {
    throw new Error('Invalid Realtime business scope.')
  }
  if (scope.orderId !== undefined && !UUID.test(scope.orderId)) {
    throw new Error('Invalid Realtime order scope.')
  }

  let active = true
  let latest: OrderChangesConnectionStatus | null = null
  const channel = client.channel(`${name}-${++channelSerial}`)
  const status = (value: OrderChangesConnectionStatus) => {
    if (active && latest !== value) {
      latest = value
      listener.onConnectionStatusChange(value)
    }
  }
  const invalidate = () => {
    if (active) listener.onInvalidation()
  }
  const dispose = () => {
    if (!active) return
    active = false
    void Promise.resolve().then(() => client.removeChannel(channel)).catch(() => undefined)
  }

  try {
    status('connecting')
    // KITCHEN keeps its legacy unfiltered subscription; CUSTOMER restricts
    // order changes to the active Business, and item changes to the detail.
    const ordersFilter = scope.businessId ? { filter: `business_id=eq.${scope.businessId}` } : {}
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel.on('postgres_changes', { event, schema: 'public', table: 'orders', ...ordersFilter }, invalidate)
    }
    if (name === 'kitchen-production' || scope.orderId !== undefined) {
      const itemsFilter = scope.orderId ? { filter: `order_id=eq.${scope.orderId}` } : {}
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on('postgres_changes', { event, schema: 'public', table: 'order_items', ...itemsFilter }, invalidate)
      }
    }
    channel.subscribe((value) => {
      if (value === 'SUBSCRIBED') status('connected')
      else if (value === 'CHANNEL_ERROR' || value === 'TIMED_OUT' || value === 'CLOSED') status('disconnected')
    })
  } catch {
    dispose()
    throw new Error('Unable to start order synchronization.')
  }
  return dispose
}
