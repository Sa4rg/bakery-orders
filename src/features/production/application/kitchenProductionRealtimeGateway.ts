/**
 * Transport-independent notification boundary for Kitchen production.
 * Notifications contain NO persisted rows. The read gateway remains authoritative.
 * Start this subscription only for an active KITCHEN session; PostgreSQL RLS is
 * the data-delivery security boundary.
 */
export type KitchenRealtimeConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'

export interface KitchenRealtimeListener {
  onInvalidation(): void
  onConnectionStatusChange(status: KitchenRealtimeConnectionStatus): void
}

export interface KitchenProductionRealtimeGateway {
  /** Returns an idempotent, synchronous listener cleanup function. */
  subscribe(listener: KitchenRealtimeListener): () => void
}
