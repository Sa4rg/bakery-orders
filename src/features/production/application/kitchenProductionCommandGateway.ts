import type { QuantityThousandths } from '../domain/kitchenProductionOrder'

/** All KITCHEN production writes go through trusted PostgreSQL commands. */
export interface KitchenProductionCommandGateway {
  startOrder(orderId: string): Promise<void>

  /** Transition an IN_PROGRESS Order to READY only through the trusted SQL RPC. */
  markOrderReady(orderId: string): Promise<void>

  /** Positive DELTA in exact integer thousandths, not a replacement total. */
  recordPreparedQuantity(
    orderItemId: string,
    quantityThousandths: QuantityThousandths,
  ): Promise<void>

  /** Positive unavailable DELTA, with a mandatory reason for this operation. */
  recordUnavailableQuantity(
    orderItemId: string,
    quantityThousandths: QuantityThousandths,
    reason: string,
  ): Promise<void>
}

/** Safe start-order failure; provider details never escape the adapter. */
export class KitchenProductionCommandError extends Error {
  constructor() {
    super('Unable to start order preparation.')
    this.name = 'KitchenProductionCommandError'
  }
}

export class KitchenProductionValidationError extends Error {
  constructor() {
    super('Order identifier is invalid.')
    this.name = 'KitchenProductionValidationError'
  }
}

export class KitchenPreparedQuantityValidationError extends Error {
  constructor() {
    super('Prepared quantity input is invalid.')
    this.name = 'KitchenPreparedQuantityValidationError'
  }
}

export class KitchenPreparedQuantityCommandError extends Error {
  constructor() {
    super('Unable to record prepared quantity.')
    this.name = 'KitchenPreparedQuantityCommandError'
  }
}

/** Invalid item id, positive thousandths delta or missing reason. */
export class KitchenUnavailableQuantityValidationError extends Error {
  constructor() {
    super('Unavailable quantity input is invalid.')
    this.name = 'KitchenUnavailableQuantityValidationError'
  }
}

/** Safe RPC failure; never include provider details or sensitive reason text. */
export class KitchenUnavailableQuantityCommandError extends Error {
  constructor() {
    super('Unable to record unavailable quantity.')
    this.name = 'KitchenUnavailableQuantityCommandError'
  }
}

/** Invalid Order id: reject locally, before any READY RPC. */
export class KitchenMarkReadyValidationError extends Error {
  constructor() {
    super('Order identifier is invalid.')
    this.name = 'KitchenMarkReadyValidationError'
  }
}

/** Safe SQL/network failure: never expose PostgreSQL details or internal actor data. */
export class KitchenMarkReadyCommandError extends Error {
  constructor() {
    super('Unable to mark order ready.')
    this.name = 'KitchenMarkReadyCommandError'
  }
}
