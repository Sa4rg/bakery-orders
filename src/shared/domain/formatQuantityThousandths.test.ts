import { describe, expect, it } from 'vitest'
import { formatQuantityThousandths } from './quantityThousandths'

describe('formatQuantityThousandths', () => {
  it.each([
    [0, '0'], [1000, '1'], [125, '0.125'], [2001, '2.001'],
    [2500, '2.5'], [30000, '30'], [1234567, '1234.567'],
  ])('formats %i thousandths as %s without floating point rounding', (value, expected) => {
    expect(formatQuantityThousandths(value)).toBe(expected)
  })
})
