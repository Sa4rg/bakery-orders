import { describe, expect, it } from 'vitest'
import type { CartItem } from '../../cart/domain/cart'
import { CreateOrderValidationError } from './createOrderGateway'
import { buildCreateOrderInput } from './buildCreateOrderInput'

const businessId =
  '10000000-0000-4000-8000-000000000001'

const idempotencyKey =
  '20000000-0000-4000-8000-000000000001'

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

describe('buildCreateOrderInput', () => {
  it('maps the customer draft to the narrow CreateOrder contract', () => {
    const input = buildCreateOrderInput({
      businessId,
      idempotencyKey,
      items,
      reviewDraft: {
        requestedDeliveryAtLocal:
          '2026-10-18T08:15',
        customerNotes: 'Use side entrance.',
      },
    })

    expect(input.businessId).toBe(businessId)
    expect(input.idempotencyKey).toBe(
      idempotencyKey,
    )
    expect(input.customerNotes).toBe(
      'Use side entrance.',
    )

    expect(input.items).toEqual([
      {
        productId:
          '30000000-0000-4000-8000-000000000001',
        requestedQuantity: 2,
      },
      {
        productId:
          '40000000-0000-4000-8000-000000000001',
        requestedQuantity: 0.5,
      },
    ])
  })

  it('converts the local delivery selection to an absolute ISO timestamp while preserving the selected local time', () => {
    const input = buildCreateOrderInput({
      businessId,
      idempotencyKey,
      items,
      reviewDraft: {
        requestedDeliveryAtLocal:
          '2026-10-18T08:15',
        customerNotes: '',
      },
    })

    expect(
      Number.isNaN(
        Date.parse(input.requestedDeliveryAt),
      ),
    ).toBe(false)

    expect(
      input.requestedDeliveryAt,
    ).toMatch(/Z$/)

    const converted = new Date(
      input.requestedDeliveryAt,
    )

    expect(converted.getFullYear()).toBe(2026)
    expect(converted.getMonth()).toBe(9)
    expect(converted.getDate()).toBe(18)
    expect(converted.getHours()).toBe(8)
    expect(converted.getMinutes()).toBe(15)
  })

  it('maps empty optional notes to null', () => {
    const input = buildCreateOrderInput({
      businessId,
      idempotencyKey,
      items,
      reviewDraft: {
        requestedDeliveryAtLocal:
          '2026-10-18T08:15',
        customerNotes: '',
      },
    })

    expect(input.customerNotes).toBeNull()
  })

  it('does not forward Cart display metadata across the command boundary', () => {
    const input = buildCreateOrderInput({
      businessId,
      idempotencyKey,
      items,
      reviewDraft: {
        requestedDeliveryAtLocal:
          '2026-10-18T08:15',
        customerNotes: '',
      },
    })

    expect(input.items[0]).toEqual({
      productId:
        '30000000-0000-4000-8000-000000000001',
      requestedQuantity: 2,
    })

    expect(input.items[0]).not.toHaveProperty(
      'productName',
    )
    expect(input.items[0]).not.toHaveProperty(
      'unitCode',
    )
    expect(input.items[0]).not.toHaveProperty(
      'quantityStep',
    )
  })

  it('rejects an empty Cart at the application boundary', () => {
    expect(() =>
      buildCreateOrderInput({
        businessId,
        idempotencyKey,
        items: [],
        reviewDraft: {
          requestedDeliveryAtLocal:
            '2026-10-18T08:15',
          customerNotes: '',
        },
      }),
    ).toThrow(CreateOrderValidationError)
  })

  it('rejects malformed local delivery information', () => {
    expect(() =>
      buildCreateOrderInput({
        businessId,
        idempotencyKey,
        items,
        reviewDraft: {
          requestedDeliveryAtLocal:
            'not-a-date',
          customerNotes: '',
        },
      }),
    ).toThrow(CreateOrderValidationError)
  })

  it('rejects invalid command identifiers before reaching the provider', () => {
    expect(() =>
      buildCreateOrderInput({
        businessId: 'not-a-uuid',
        idempotencyKey,
        items,
        reviewDraft: {
          requestedDeliveryAtLocal:
            '2026-10-18T08:15',
          customerNotes: '',
        },
      }),
    ).toThrow(CreateOrderValidationError)
  })
})