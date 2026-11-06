import type { CustomerTrackedOrder } from '../domain/customerTrackedOrder'

export interface CustomerTrackingFilters {
  /** Defaults to 25; allowed range is 1..100. */
  readonly pageSize?: number
  /** Opaque cursor, scoped to the active-order list. */
  readonly cursor?: string | null
}

export interface CustomerTrackingPage {
  readonly orders: readonly CustomerTrackedOrder[]
  readonly nextCursor: string | null
}

/** Read-only CUSTOMER boundary. PostgreSQL RLS remains authoritative. */
export interface CustomerTrackingQueryGateway {
  loadActiveOrders(filters?: CustomerTrackingFilters): Promise<CustomerTrackingPage>
  /** Includes terminal statuses when visible through RLS; null means missing or invisible. */
  loadOrder(orderId: string): Promise<CustomerTrackedOrder | null>
}

export class CustomerTrackingAccessError extends Error {
  constructor() { super('Customer tracking access is not authorized.'); this.name = 'CustomerTrackingAccessError' }
}
export class CustomerTrackingQueryError extends Error {
  constructor() { super('Unable to load customer tracking orders.'); this.name = 'CustomerTrackingQueryError' }
}
export class CustomerTrackingValidationError extends Error {
  constructor() { super('Customer tracking query input is invalid.'); this.name = 'CustomerTrackingValidationError' }
}
