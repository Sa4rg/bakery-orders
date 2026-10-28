/** Read-only MANAGER queue, separate from the KITCHEN-only production gateway. */
export interface ManagerUnavailableReason {
  readonly reason: string
  readonly occurredAt: string
}
export interface ManagerBlockedOrder {
  readonly orderId: string
  readonly orderNumber: number
  readonly requestedDeliveryAt: string
  readonly unavailableThousandths: number
  /** Recent reasons from append-only QUANTITY_UNAVAILABLE events. */
  readonly reasons: readonly ManagerUnavailableReason[]
}
export interface ManagerBlockedOrdersPage {
  readonly incidents: readonly ManagerBlockedOrder[]
  readonly hasNextPage: boolean
}
export interface ManagerBlockedOrdersGateway {
  /** Searches one page of IN_PROGRESS orders; derived incidents may be fewer than page size. */
  loadPage(pageIndex: number): Promise<ManagerBlockedOrdersPage>
}
export class ManagerBlockedOrdersAccessError extends Error {
  constructor() { super('Manager access required.'); this.name = 'ManagerBlockedOrdersAccessError' }
}
export class ManagerBlockedOrdersValidationError extends Error {
  constructor() { super('Invalid manager intervention page.'); this.name = 'ManagerBlockedOrdersValidationError' }
}
export class ManagerBlockedOrdersQueryError extends Error {
  constructor() { super('Unable to load manager interventions.'); this.name = 'ManagerBlockedOrdersQueryError' }
}
