/** M4-003 trusted production mutations. Further commands are added in later slices. */
export interface KitchenProductionCommandGateway {
  startOrder(orderId: string): Promise<void>
}

/** Safe command failure; no database error detail escapes infrastructure. */
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
