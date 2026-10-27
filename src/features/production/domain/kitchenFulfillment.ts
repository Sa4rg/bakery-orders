import type { KitchenProductionItem } from './kitchenProductionOrder'

/** All totals are exact integer thousandths, never JS floating-point quantities. */
export interface KitchenFulfillmentTotals {
  readonly requestedThousandths: number
  readonly preparedThousandths: number
  readonly unavailableThousandths: number
  readonly remainingThousandths: number
}

/** UNRESOLVED is progress, not a fourth completed fulfillment condition. */
export type KitchenFulfillment =
  | {
    readonly resolution: 'UNRESOLVED'
    readonly condition: null
    readonly totals: KitchenFulfillmentTotals
  }
  | {
    readonly resolution: 'RESOLVED'
    readonly condition: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'
    readonly totals: KitchenFulfillmentTotals
  }

export class KitchenFulfillmentDataError extends Error {
  constructor() {
    super('Kitchen fulfillment quantities are invalid.')
    this.name = 'KitchenFulfillmentDataError'
  }
}

type FulfillmentLine = Pick<
  KitchenProductionItem,
  | 'requestedThousandths'
  | 'preparedThousandths'
  | 'unavailableThousandths'
  | 'remainingThousandths'
>

function exactSum(a: number, b: number): number {
  const value = a + b
  if (!Number.isSafeInteger(value)) throw new KitchenFulfillmentDataError()
  return value
}

/**
 * Read-only derivation from the authoritative, RLS-protected OrderItem read model.
 * This is NOT a trusted READY guard; M4-008 must re-check inside its SQL lock.
 */
export function deriveKitchenFulfillment(
  items: readonly FulfillmentLine[],
): KitchenFulfillment {
  if (!Array.isArray(items) || items.length === 0) {
    throw new KitchenFulfillmentDataError()
  }

  let requestedThousandths = 0
  let preparedThousandths = 0
  let unavailableThousandths = 0
  let remainingThousandths = 0

  for (const item of items) {
    const { requestedThousandths: requested, preparedThousandths: prepared,
      unavailableThousandths: unavailable, remainingThousandths: remaining } = item

    if (
      ![requested, prepared, unavailable, remaining].every(Number.isSafeInteger)
      || requested <= 0 || prepared < 0 || unavailable < 0 || remaining < 0
      || exactSum(exactSum(prepared, unavailable), remaining) !== requested
    ) {
      throw new KitchenFulfillmentDataError()
    }

    requestedThousandths = exactSum(requestedThousandths, requested)
    preparedThousandths = exactSum(preparedThousandths, prepared)
    unavailableThousandths = exactSum(unavailableThousandths, unavailable)
    remainingThousandths = exactSum(remainingThousandths, remaining)
  }

  const totals: KitchenFulfillmentTotals = {
    requestedThousandths,
    preparedThousandths,
    unavailableThousandths,
    remainingThousandths,
  }

  if (remainingThousandths > 0) {
    return { resolution: 'UNRESOLVED', condition: null, totals }
  }
  if (unavailableThousandths === 0 && preparedThousandths === requestedThousandths) {
    return { resolution: 'RESOLVED', condition: 'COMPLETE', totals }
  }
  if (preparedThousandths > 0 && unavailableThousandths > 0) {
    return { resolution: 'RESOLVED', condition: 'PARTIAL', totals }
  }
  if (preparedThousandths === 0 && unavailableThousandths === requestedThousandths) {
    return { resolution: 'RESOLVED', condition: 'UNAVAILABLE', totals }
  }

  throw new KitchenFulfillmentDataError()
}
