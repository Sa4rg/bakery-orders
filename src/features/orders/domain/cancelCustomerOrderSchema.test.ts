import { describe, expect, it } from 'vitest'
import {
  cancelCustomerOrderFormSchema,
  cancelCustomerOrderInputSchema,
} from './cancelCustomerOrderSchema'

const orderId =
  '90000000-0000-4000-8000-000000000001'

describe('cancelCustomerOrderSchema', () => {
  it('accepts and normalizes a valid cancellation reason', () => {
    expect(
      cancelCustomerOrderInputSchema.parse({
        orderId,
        reason: '  Customer requirements changed.  ',
      }),
    ).toEqual({
      orderId,
      reason: 'Customer requirements changed.',
    })
  })

  it('rejects an invalid Order identifier', () => {
    expect(
      cancelCustomerOrderInputSchema.safeParse({
        orderId: 'not-a-uuid',
        reason: 'Valid reason',
      }).success,
    ).toBe(false)
  })

  it('rejects an empty cancellation reason', () => {
    expect(
      cancelCustomerOrderInputSchema.safeParse({
        orderId,
        reason: '',
      }).success,
    ).toBe(false)

    expect(
      cancelCustomerOrderInputSchema.safeParse({
        orderId,
        reason: '   ',
      }).success,
    ).toBe(false)
  })

  it('rejects privileged cancellation fields from the client', () => {
    expect(
      cancelCustomerOrderInputSchema.safeParse({
        orderId,
        reason: 'Valid reason',
        actorUserId:
          '10000000-0000-4000-8000-000000000001',
        cancelledAt:
          '2026-10-20T10:00:00Z',
        status: 'CANCELLED',
      }).success,
    ).toBe(false)
  })

  it('validates the cancellation form without requiring trusted identifiers', () => {
    expect(
      cancelCustomerOrderFormSchema.parse({
        reason: '  Changed quantities.  ',
      }),
    ).toEqual({
      reason: 'Changed quantities.',
    })
  })
})