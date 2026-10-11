import type { CreateOrderInput } from '../domain/createOrderSchema'

export interface CreateOrderGateway {
  createOrder(input: CreateOrderInput): Promise<string>
}

/** Safe application-level failure that never exposes provider details. */
export class CreateOrderError extends Error {
  constructor() {
    super('Unable to create order.')
    this.name = 'CreateOrderError'
  }
}

export class CreateOrderValidationError extends Error {
  constructor() {
    super('Order input is invalid.')
    this.name = 'CreateOrderValidationError'
  }
}