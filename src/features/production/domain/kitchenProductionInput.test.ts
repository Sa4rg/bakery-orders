import { describe, expect, it } from 'vitest'
import type { KitchenProductionItem } from './kitchenProductionOrder'
import { formatKitchenQuantity, parseKitchenQuantityDelta } from './kitchenProductionInput'

const item: KitchenProductionItem = {
  id: '10000000-0000-4000-8000-000000000001',
  productId: '10000000-0000-4000-8000-000000000002',
  productName: 'Pastry', unitCode: 'KG',
  quantityStepThousandths: 125,
  requestedThousandths: 2500,
  preparedThousandths: 375,
  unavailableThousandths: 125,
  remainingThousandths: 2000,
}

describe('Kitchen production quantity input (M4-006A)', () => {
  it('parses positive exact decimal deltas into integer thousandths', () => {
    expect(parseKitchenQuantityDelta('0.125', item)).toEqual({ ok: true, thousandths: 125 })
    expect(parseKitchenQuantityDelta(' 1.875 ', item)).toEqual({ ok: true, thousandths: 1875 })
    expect(parseKitchenQuantityDelta('2.000', item)).toEqual({ ok: true, thousandths: 2000 })
  })

  it.each(['0', '0.000', '-0.125', '0.0005', '1e3', 'NaN', '1,5', '01.000', '9999999999', ''])(
    'rejects an invalid or potentially rounded token %s', (value) => {
      expect(parseKitchenQuantityDelta(value, item).ok).toBe(false)
    },
  )

  it('enforces the historical step and shared remaining amount before submission', () => {
    expect(parseKitchenQuantityDelta('0.150', item)).toMatchObject({ ok: false })
    expect(parseKitchenQuantityDelta('2.125', item)).toMatchObject({ ok: false })
  })

  it('formats thousandths without rounding or losing fractional meaning', () => {
    expect(formatKitchenQuantity(0)).toBe('0')
    expect(formatKitchenQuantity(125)).toBe('0.125')
    expect(formatKitchenQuantity(1500)).toBe('1.5')
    expect(formatKitchenQuantity(2000)).toBe('2')
  })
})
