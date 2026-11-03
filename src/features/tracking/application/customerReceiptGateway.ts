/** CUSTOMER-only trusted receipt command; PostgreSQL owns all decisions. */
export interface CustomerReceiptGateway {
  /** No retries: the mutation may have committed despite a transport failure. */
  confirmReceipt(orderId: string): Promise<void>
}

export class CustomerReceiptValidationError extends Error {
  constructor() {
    super('Order identifier is invalid.')
    this.name = 'CustomerReceiptValidationError'
  }
}

export class CustomerReceiptCommandError extends Error {
  constructor() {
    super('Unable to confirm order receipt.')
    this.name = 'CustomerReceiptCommandError'
  }
}
