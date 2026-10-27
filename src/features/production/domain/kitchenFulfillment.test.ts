import { describe, expect, it } from 'vitest'
import type { KitchenProductionItem } from './kitchenProductionOrder'
import {
  KitchenFulfillmentDataError,
  deriveKitchenFulfillment,
} from './kitchenFulfillment'

function item(
  requestedThousandths: number,
  preparedThousandths: number,
  unavailableThousandths: number,
): KitchenProductionItem {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    productId: '20000000-0000-4000-8000-000000000002',
    productName: 'Historical product',
    unitCode: 'UNIT',
    quantityStepThousandths: 1,
    requestedThousandths,
    preparedThousandths,
    unavailableThousandths,
    remainingThousandths: requestedThousandths - preparedThousandths - unavailableThousandths,
  }
}

function totals(requested: number, prepared: number, unavailable: number, remaining: number) {
  return {
    requestedThousandths: requested,
    preparedThousandths: prepared,
    unavailableThousandths: unavailable,
    remainingThousandths: remaining,
  }
}

describe('M4-007 — derived fulfillment (not operational status)', () => {
  it('remains UNRESOLVED while any requested quantity has no outcome', () => {
    const result = deriveKitchenFulfillment([item(3000, 1000, 1000)])
    expect(result).toEqual({
      resolution: 'UNRESOLVED', condition: null,
      totals: totals(3000, 1000, 1000, 1000),
    })
  })

  it('does not classify a shortage as PARTIAL before all lines are resolved', () => {
    const result = deriveKitchenFulfillment([
      item(2000, 1000, 1000),
      item(3000, 0, 0),
    ])
    expect(result.resolution).toBe('UNRESOLVED')
    expect(result.condition).toBeNull()
    expect(result.totals.remainingThousandths).toBe(3000)
  })

  it('classifies fully prepared quantities as COMPLETE across multiple lines', () => {
    expect(deriveKitchenFulfillment([item(1500, 1500, 0), item(250, 250, 0)])).toEqual({
      resolution: 'RESOLVED', condition: 'COMPLETE',
      totals: totals(1750, 1750, 0, 0),
    })
  })

  it('classifies mixed prepared and unavailable quantities as PARTIAL', () => {
    expect(deriveKitchenFulfillment([item(3000, 1000, 2000)])).toEqual({
      resolution: 'RESOLVED', condition: 'PARTIAL',
      totals: totals(3000, 1000, 2000, 0),
    })
    expect(deriveKitchenFulfillment([item(1000, 1000, 0), item(2500, 0, 2500)])).toEqual({
      resolution: 'RESOLVED', condition: 'PARTIAL',
      totals: totals(3500, 1000, 2500, 0),
    })
  })

  it('classifies every requested quantity unavailable as UNAVAILABLE', () => {
    expect(deriveKitchenFulfillment([item(125, 0, 125), item(1000, 0, 1000)])).toEqual({
      resolution: 'RESOLVED', condition: 'UNAVAILABLE',
      totals: totals(1125, 0, 1125, 0),
    })
  })

  it('never uses the operational status to determine fulfillment', () => {
    const lines = [item(1000, 500, 500)]
    expect(deriveKitchenFulfillment(lines).condition).toBe('PARTIAL')
    // The order can still be IN_PROGRESS until the trusted READY RPC runs.
  })

  it('works with exact one-thousandth fractions without floating point', () => {
    expect(deriveKitchenFulfillment([item(1001, 1000, 1)])).toEqual({
      resolution: 'RESOLVED', condition: 'PARTIAL',
      totals: totals(1001, 1000, 1, 0),
    })
  })

  it('does not mutate the source read model', () => {
    const source = [Object.freeze(item(2000, 1000, 0))]
    const before = structuredClone(source)
    deriveKitchenFulfillment(source)
    expect(source).toEqual(before)
  })

  it('rejects empty Orders instead of inventing a COMPLETE outcome', () => {
    expect(() => deriveKitchenFulfillment([])).toThrow(KitchenFulfillmentDataError)
  })

  it.each([
    ['negative prepared', { preparedThousandths: -1 }],
    ['negative unavailable', { unavailableThousandths: -1 }],
    ['negative remaining', { remainingThousandths: -1 }],
    ['zero requested', { requestedThousandths: 0 }],
    ['fractional thousandths', { preparedThousandths: 0.5 }],
    ['unsafe amount', { requestedThousandths: Number.MAX_SAFE_INTEGER + 1 }],
    ['inconsistent remaining', { remainingThousandths: 0 }],
    ['overprepared', { preparedThousandths: 3000, remainingThousandths: 0 }],
    ['not-a-number', { unavailableThousandths: Number.NaN }],
  ])('rejects %s rather than returning a misleading classification', (_label, override) => {
    const row = { ...item(2000, 1000, 0), ...override }
    expect(() => deriveKitchenFulfillment([row])).toThrow(KitchenFulfillmentDataError)
  })

  it('fails closed if the sum across many valid items exceeds safe integer precision', () => {
    const large = item(900_000_000_000, 900_000_000_000, 0)
    expect(() => deriveKitchenFulfillment(Array.from({ length: 11_000 }, () => large)))
      .toThrow(KitchenFulfillmentDataError)
  })
})
