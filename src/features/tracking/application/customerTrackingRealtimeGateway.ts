import type {
  OrderChangesConnectionStatus,
  OrderChangesListener,
} from '../../../shared/realtime/orderChangesRealtime'

export type CustomerTrackingConnectionStatus = OrderChangesConnectionStatus
export type CustomerTrackingRealtimeListener = OrderChangesListener

export interface CustomerTrackingRealtimeGateway {
  /** Business identifier comes from the authorized session, never a form. */
  subscribe(
    scope: { readonly businessId: string; readonly orderId?: string },
    listener: CustomerTrackingRealtimeListener,
  ): () => void
}
