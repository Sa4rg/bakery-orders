import type { KitchenOrderStatus, KitchenProductionOrder } from '../domain/kitchenProductionOrder'

export interface KitchenOrderQueryFilters {
  /** Defaults to RECEIVED and IN_PROGRESS; an empty list is invalid. */
  readonly statuses?: readonly KitchenOrderStatus[]
  /** Defaults to 25. Allowed range: 1..100. */
  readonly pageSize?: number
  /** Opaque continuation token. Valid only for the same set of statuses. */
  readonly cursor?: string | null
}

export interface KitchenOrderPage {
  readonly orders: readonly KitchenProductionOrder[]
  readonly nextCursor: string | null
}

/** Read-only application boundary; PostgreSQL RLS and the trusted RPC enforce access. */
export interface KitchenOrderQueryGateway {
  loadProductionQueue(filters?: KitchenOrderQueryFilters): Promise<KitchenOrderPage>
  /** Loads a single Order regardless of lifecycle status; null if invisible/missing. */
  loadProductionOrder(orderId: string): Promise<KitchenProductionOrder | null>
}

export class KitchenOrderQueryError extends Error {
  constructor() {
    super('Unable to load kitchen production orders.')
    this.name = 'KitchenOrderQueryError'
  }
}

export class KitchenOrderAccessError extends Error {
  constructor() {
    super('Kitchen production access is not authorized.')
    this.name = 'KitchenOrderAccessError'
  }
}

export class KitchenOrderQueryValidationError extends Error {
  constructor() {
    super('Kitchen order query input is invalid.')
    this.name = 'KitchenOrderQueryValidationError'
  }
}
