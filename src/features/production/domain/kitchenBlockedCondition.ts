import { deriveKitchenFulfillment, type KitchenFulfillment } from './kitchenFulfillment'
import type { KitchenProductionItem, KitchenOrderStatus } from './kitchenProductionOrder'

/**
 * Derived operational exception, not an Order status and not an authorization.
 * Only an active, fully resolved, entirely unavailable Order needs MANAGER action.
 */
export type KitchenBlockedCondition =
  | { readonly blocked: true; readonly reason: 'TOTAL_UNAVAILABILITY'; readonly fulfillment: KitchenFulfillment }
  | { readonly blocked: false; readonly reason: null; readonly fulfillment: KitchenFulfillment }

export function deriveKitchenBlockedCondition(
  order: { readonly status: KitchenOrderStatus; readonly items: readonly Pick<KitchenProductionItem,
    'requestedThousandths' | 'preparedThousandths' | 'unavailableThousandths' | 'remainingThousandths'>[] },
): KitchenBlockedCondition {
  const fulfillment = deriveKitchenFulfillment(order.items)
  if (order.status === 'IN_PROGRESS'
    && fulfillment.resolution === 'RESOLVED'
    && fulfillment.condition === 'UNAVAILABLE') {
    return { blocked: true, reason: 'TOTAL_UNAVAILABILITY', fulfillment }
  }
  return { blocked: false, reason: null, fulfillment }
}
