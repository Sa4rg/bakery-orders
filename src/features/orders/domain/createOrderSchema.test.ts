import { describe, expect, it } from 'vitest'
import { createOrderInputSchema } from './createOrderSchema'

const validInput = {
  businessId: '10000000-0000-4000-8000-000000000001',
  requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
  customerNotes: 'Leave at reception.',
  idempotencyKey: '20000000-0000-4000-8000-000000000001',
  items: [
    {
      productId: '30000000-0000-4000-8000-000000000001',
      requestedQuantity: 1.5,
    },
  ],
}

describe('createOrderInputSchema', () => {
  it('accepts a valid create-order command', () => {
    expect(createOrderInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('requires at least one OrderItem', () => {
    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        items: [],
      }).success,
    ).toBe(false)
  })

  it('requires UUID identifiers', () => {
    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        businessId: 'not-a-uuid',
      }).success,
    ).toBe(false)

    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        idempotencyKey: 'not-a-uuid',
      }).success,
    ).toBe(false)

    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        items: [
          {
            productId: 'not-a-uuid',
            requestedQuantity: 1,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('requires a positive finite requested quantity', () => {
    for (const requestedQuantity of [0, -1, Number.POSITIVE_INFINITY]) {
      expect(
        createOrderInputSchema.safeParse({
          ...validInput,
          items: [
            {
              productId: validInput.items[0].productId,
              requestedQuantity,
            },
          ],
        }).success,
      ).toBe(false)
    }
  })

  it('requires an absolute ISO delivery timestamp', () => {
    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        requestedDeliveryAt: '2026-10-15T10:30',
      }).success,
    ).toBe(false)

    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        requestedDeliveryAt: 'not-a-date',
      }).success,
    ).toBe(false)
  })

  it('rejects unknown top-level fields', () => {
    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        status: 'DELIVERED',
      }).success,
    ).toBe(false)
  })

  it('rejects privileged fields inside OrderItems', () => {
    expect(
      createOrderInputSchema.safeParse({
        ...validInput,
        items: [
          {
            ...validInput.items[0],
            preparedQuantity: 1,
            actorUserId: '40000000-0000-4000-8000-000000000001',
          },
        ],
      }).success,
    ).toBe(false)
  })
})