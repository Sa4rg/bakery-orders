import { describe, expect, it, vi } from 'vitest'
import type { CartItem } from '../../cart/domain/cart'
import { prepareCreateOrderAttempt } from './prepareCreateOrderAttempt'

const businessId =
  '10000000-0000-4000-8000-000000000001'

const anotherBusinessId =
  '10000000-0000-4000-8000-000000000002'

const firstIdempotencyKey =
  '20000000-0000-4000-8000-000000000001'

const secondIdempotencyKey =
  '20000000-0000-4000-8000-000000000002'

const items: CartItem[] = [
  {
    productId:
      '30000000-0000-4000-8000-000000000001',
    productName: 'Country Sourdough',
    unitCode: 'UNIT',
    quantityStep: 1,
    requestedQuantity: 2,
  },
  {
    productId:
      '40000000-0000-4000-8000-000000000001',
    productName: 'Pastry Mix',
    unitCode: 'KG',
    quantityStep: 0.25,
    requestedQuantity: 0.5,
  },
]

const reviewDraft = {
  requestedDeliveryAtLocal:
    '2026-10-18T08:15',
  customerNotes: 'Use side entrance.',
}

describe('prepareCreateOrderAttempt', () => {
  it('creates an idempotency key for the first logical submission attempt', () => {
    const createIdempotencyKey = vi.fn(
      () => firstIdempotencyKey,
    )

    const result = prepareCreateOrderAttempt({
      currentAttempt: null,
      businessId,
      items,
      reviewDraft,
      createIdempotencyKey,
    })

    expect(
      result.input.idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(
      result.attempt.idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      1,
    )
  })

  it('reuses the same idempotency key when the same logical submission is retried', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const retry =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    expect(
      retry.input.idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(retry.attempt).toEqual(
      first.attempt,
    )

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      1,
    )
  })

  it('creates a new idempotency key when an ordered quantity changes', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const changedItems: CartItem[] = [
      {
        ...items[0]!,
        requestedQuantity: 3,
      },
      items[1]!,
    ]

    const changed =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId,
        items: changedItems,
        reviewDraft,
        createIdempotencyKey,
      })

    expect(
      changed.input.idempotencyKey,
    ).toBe(secondIdempotencyKey)

    expect(
      changed.attempt.idempotencyKey,
    ).toBe(secondIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      2,
    )
  })

  it('creates a new idempotency key when delivery information changes', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const changed =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId,
        items,
        reviewDraft: {
          ...reviewDraft,
          requestedDeliveryAtLocal:
            '2026-10-18T10:30',
        },
        createIdempotencyKey,
      })

    expect(
      changed.input.idempotencyKey,
    ).toBe(secondIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      2,
    )
  })

  it('creates a new idempotency key when notes change', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const changed =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId,
        items,
        reviewDraft: {
          ...reviewDraft,
          customerNotes: 'Call on arrival.',
        },
        createIdempotencyKey,
      })

    expect(
      changed.input.idempotencyKey,
    ).toBe(secondIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      2,
    )
  })

  it('creates a new idempotency key when the Business context changes', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const changed =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId: anotherBusinessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    expect(
      changed.input.idempotencyKey,
    ).toBe(secondIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      2,
    )
  })

  it('does not rotate the key for Cart display metadata that never reaches create_order', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const changedDisplayMetadata: CartItem[] =
      items.map((item) => ({
        ...item,
        productName: `Changed ${item.productName}`,
        unitCode: `DISPLAY-${item.unitCode}`,
        quantityStep:
          item.quantityStep === 1
            ? 0.5
            : item.quantityStep,
      }))

    const retry =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId,
        items: changedDisplayMetadata,
        reviewDraft,
        createIdempotencyKey,
      })

    expect(
      retry.input.idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      1,
    )
  })

  it('treats item ordering as irrelevant to the logical submission', () => {
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(firstIdempotencyKey)
      .mockReturnValueOnce(secondIdempotencyKey)

    const first =
      prepareCreateOrderAttempt({
        currentAttempt: null,
        businessId,
        items,
        reviewDraft,
        createIdempotencyKey,
      })

    const reordered =
      prepareCreateOrderAttempt({
        currentAttempt: first.attempt,
        businessId,
        items: [...items].reverse(),
        reviewDraft,
        createIdempotencyKey,
      })

    expect(
      reordered.input.idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(createIdempotencyKey).toHaveBeenCalledTimes(
      1,
    )
  })
})