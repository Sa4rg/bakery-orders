import type { QuantityThousandths } from '../domain/kitchenProductionOrder'

/** All KITCHEN production writes go through trusted PostgreSQL commands. */
export interface KitchenProductionCommandGateway {
  startOrder(orderId: string): Promise<void>

  /** Positive DELTA in exact integer thousandths, not a replacement total. */
  recordPreparedQuantity(
    orderItemId: string,
    quantityThousandths: QuantityThousandths,
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
