export interface ProductAvailabilityGateway {
  setAvailability(productId: string, available: boolean): Promise<boolean>
}

/** Safe application-level failure that never exposes provider details. */
export class ProductAvailabilityError extends Error {
  constructor() {
    super('Unable to change Product availability.')
    this.name = 'ProductAvailabilityError'
  }
}

export class ProductAvailabilityValidationError extends Error {
  constructor() {
    super('Product availability input is invalid.')
    this.name = 'ProductAvailabilityValidationError'
  }
}