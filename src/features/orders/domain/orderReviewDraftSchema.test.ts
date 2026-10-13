import { describe, expect, it } from 'vitest'
import { orderReviewDraftSchema } from './orderReviewDraftSchema'

describe('orderReviewDraftSchema', () => {
  it('accepts a valid requested delivery date/time and optional notes', () => {
    expect(
      orderReviewDraftSchema.safeParse({
        requestedDeliveryAtLocal: '2026-10-16T09:30',
        customerNotes: 'Leave at reception.',
      }).success,
    ).toBe(true)
  })

  it('accepts empty optional notes', () => {
    expect(
      orderReviewDraftSchema.safeParse({
        requestedDeliveryAtLocal: '2026-10-16T09:30',
        customerNotes: '',
      }).success,
    ).toBe(true)
  })

  it('requires a requested delivery date and time', () => {
    expect(
      orderReviewDraftSchema.safeParse({
        requestedDeliveryAtLocal: '',
        customerNotes: '',
      }).success,
    ).toBe(false)
  })

  it('rejects malformed local date/time values', () => {
    for (const requestedDeliveryAtLocal of [
      'not-a-date',
      '2026-10-16',
      '2026-10-16T09',
      '2026-13-16T09:30',
      '2026-02-30T09:30',
      '2026-10-16T25:00',
    ]) {
      expect(
        orderReviewDraftSchema.safeParse({
          requestedDeliveryAtLocal,
          customerNotes: '',
        }).success,
      ).toBe(false)
    }
  })

  it('does not invent a future-date rule before scheduling rules are approved', () => {
    expect(
      orderReviewDraftSchema.safeParse({
        requestedDeliveryAtLocal: '2020-01-01T10:00',
        customerNotes: '',
      }).success,
    ).toBe(true)
  })

  it('rejects unknown fields', () => {
    expect(
      orderReviewDraftSchema.safeParse({
        requestedDeliveryAtLocal: '2026-10-16T09:30',
        customerNotes: '',
        status: 'DELIVERED',
      }).success,
    ).toBe(false)
  })
})