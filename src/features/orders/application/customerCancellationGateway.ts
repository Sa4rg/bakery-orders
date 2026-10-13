import type { CancelCustomerOrderInput } from '../domain/cancelCustomerOrderSchema'

export interface CustomerCancellationGateway {
  cancelOrder(
    input: CancelCustomerOrderInput,
  ): Promise<void>
}

export class CustomerCancellationError extends Error {
  constructor() {
    super('Unable to cancel order.')
    this.name = 'CustomerCancellationError'
  }
}

export class CustomerCancellationValidationError extends Error {
  constructor() {
    super('Cancellation input is invalid.')
    this.name =
      'CustomerCancellationValidationError'
  }
}