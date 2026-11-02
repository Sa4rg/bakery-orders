import { describe, expect, it } from 'vitest'
import { parseQuantityThousandths, QuantityPrecisionError } from './quantityThousandths'

describe('shared exact quantity parser', () => {
  it('preserves thousandths exactly for stored numeric representations', () => {
    expect(parseQuantityThousandths('0.125')).toBe(125)
    expect(parseQuantityThousandths(3)).toBe(3000)
    expect(parseQuantityThousandths('0')).toBe(0)
  })
  it.each(['1.0001', '-1', '1e3', '01', 'NaN', '1000000000', '3.1.2', ''])('rejects invalid stored spelling %s', (value) => {
    expect(() => parseQuantityThousandths(value)).toThrow(QuantityPrecisionError)
  })
  it('rejects unsafe and nonfinite numeric inputs', () => {
    expect(() => parseQuantityThousandths(Infinity)).toThrow(QuantityPrecisionError)
    expect(() => parseQuantityThousandths(NaN)).toThrow(QuantityPrecisionError)
  })
})
