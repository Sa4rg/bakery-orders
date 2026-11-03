/** A minimal, historical CUSTOMER projection; never expose OrderEvent internals. */
export interface CustomerShortageReason {
  readonly orderItemId: string
  readonly reason: string
  readonly occurredAt: string
}

export interface CustomerShortageReasonsGateway {
  /** Empty for a visible order without shortages or a missing/invisible order. */
  loadReasons(orderId: string): Promise<readonly CustomerShortageReason[]>
}

export class CustomerShortageAccessError extends Error {
  constructor() {
    super('Customer shortage reasons are not authorized.')
    this.name = 'CustomerShortageAccessError'
  }
}

export class CustomerShortageValidationError extends Error {
  constructor() {
    super('Invalid customer shortage request.')
    this.name = 'CustomerShortageValidationError'
  }
}

export class CustomerShortageQueryError extends Error {
  constructor() {
    super('Unable to load customer shortage reasons.')
    this.name = 'CustomerShortageQueryError'
  }
}

export class CustomerShortageDataError extends Error {
  constructor() {
    super('Customer shortage data is invalid.')
    this.name = 'CustomerShortageDataError'
  }
}
