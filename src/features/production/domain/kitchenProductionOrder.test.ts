import { describe, expect, it } from 'vitest'
import {
  KitchenProductionDataError,
  mapKitchenProductionOrder,
  toQuantityThousandths,
  type KitchenStoredOrder,
} from './kitchenProductionOrder'

const baseOrder: KitchenStoredOrder = {
  id: '41000000-0000-4000-8000-000000000001',
  order_number: 42,
  business_id: '42000000-0000-4000-8000-000000000001',
  status: 'IN_PROGRESS',
  requested_delivery_at: '2026-10-23T10:00:00+00:00',
  created_at: '2026-10-21T10:00:00+00:00',
  customer_notes: 'Handle with care.',
  items: [{
    id: '43000000-0000-4000-8000-000000000001',
    product_id: '44000000-0000-4000-8000-000000000001',
    product_name_snapshot: 'Sourdough',
    unit_code_snapshot: 'KG',
    quantity_step_snapshot: 0.1,
    requested_quantity: 10,
    prepared_quantity: 3.5,
    unavailable_quantity: 1,
  }],
}

describe('kitchen production read model', () => {
  it('translates numeric(12,3) quantities into exact thousandths', () => {
    expect(toQuantityThousandths(0.001)).toBe(1)
    expect(toQuantityThousandths(1.005)).toBe(1005)
    expect(toQuantityThousandths('10.250')).toBe(10250)
    expect(toQuantityThousandths(999999999.999)).toBe(999999999999)
    expect(toQuantityThousandths(0)).toBe(0)
  })

  it.each([-1, 1.0001, Number.NaN, Infinity, '1.0001', '1e-3']) (
    'rejects invalid database quantity %s', (value) => {
      expect(() => toQuantityThousandths(value)).toThrow(KitchenProductionDataError)
    },
  )

  it('preserves historical product snapshots, order status and exact remaining', () => {
    expect(mapKitchenProductionOrder(baseOrder, 'Cafe Roma')).toEqual({
      id: baseOrder.id,
      orderNumber: 42,
      businessId: baseOrder.business_id,
      businessName: 'Cafe Roma',
      status: 'IN_PROGRESS',
      requestedDeliveryAt: baseOrder.requested_delivery_at,
      createdAt: baseOrder.created_at,
      customerNotes: 'Handle with care.',
      items: [{
        id: baseOrder.items[0]!.id,
        productId: baseOrder.items[0]!.product_id,
        productName: 'Sourdough',
        unitCode: 'KG',
        quantityStepThousandths: 100,
        requestedThousandths: 10000,
        preparedThousandths: 3500,
        unavailableThousandths: 1000,
        remainingThousandths: 5500,
      }],
    })
  })

  it('preserves all lifecycle statuses, including CANCELLED', () => {
    expect(mapKitchenProductionOrder({ ...baseOrder, status: 'CANCELLED' }, 'Cafe Roma').status)
      .toBe('CANCELLED')
  })

  it('rejects item quantities exceeding the requested snapshot', () => {
    const invalid = {
      ...baseOrder,
      items: [{ ...baseOrder.items[0]!, prepared_quantity: 9.5, unavailable_quantity: 1 }],
    }
    expect(() => mapKitchenProductionOrder(invalid, 'Cafe Roma'))
      .toThrow(KitchenProductionDataError)
  })

  it('rejects an empty confirmed Order, invalid timestamp, missing Business, and unsafe order number', () => {
    expect(() => mapKitchenProductionOrder({ ...baseOrder, items: [] }, 'Cafe Roma'))
      .toThrow(KitchenProductionDataError)
    expect(() => mapKitchenProductionOrder({ ...baseOrder, requested_delivery_at: 'yesterday' }, 'Cafe Roma'))
      .toThrow(KitchenProductionDataError)
    expect(() => mapKitchenProductionOrder(baseOrder, ''))
      .toThrow(KitchenProductionDataError)
    expect(() => mapKitchenProductionOrder({ ...baseOrder, order_number: Number.MAX_SAFE_INTEGER + 1 }, 'Cafe Roma'))
      .toThrow(KitchenProductionDataError)
  })

  it('sorts Items deterministically by ID', () => {
    const first = { ...baseOrder.items[0]!, id: '43000000-0000-4000-8000-000000000001' }
    const last = { ...baseOrder.items[0]!, id: '43000000-0000-4000-8000-000000000002' }
    const model = mapKitchenProductionOrder({ ...baseOrder, items: [last, first] }, 'Cafe Roma')
    expect(model.items.map((item) => item.id)).toEqual([first.id, last.id])
  })
})
