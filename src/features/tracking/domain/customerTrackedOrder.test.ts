import { describe, expect, it } from 'vitest'
import { CustomerTrackingDataError, mapCustomerTrackedOrder, type StoredTrackedOrder } from './customerTrackedOrder'

const row: StoredTrackedOrder = {
  id: '00000000-0000-4000-8000-000000000011',
  order_number: 42,
  business_id: '00000000-0000-4000-8000-000000000022',
  status: 'IN_PROGRESS',
  requested_delivery_at: '2026-11-01T12:00:00.123456+00:00',
  created_at: '2026-10-27T09:00:00.987654+00:00',
  customer_notes: null,
  items: [
    { id: '00000000-0000-4000-8000-000000000033', product_name_snapshot: 'Bread', unit_code_snapshot: 'UNIT',
      quantity_step_snapshot: '0.125', requested_quantity: '3.125', prepared_quantity: '1.125', unavailable_quantity: '0.875' },
  ],
}

describe('customer tracking mapping', () => {
  it('maps historical snapshots and exact thousandths without rounding', () => {
    expect(mapCustomerTrackedOrder(row)).toEqual({
      id: row.id, orderNumber: 42, businessId: row.business_id, status: 'IN_PROGRESS',
      requestedDeliveryAt: row.requested_delivery_at, createdAt: row.created_at, customerNotes: null,
      items: [{ id: row.items[0]!.id, productName: 'Bread', unitCode: 'UNIT',
        quantityStepThousandths: 125, requestedThousandths: 3125,
        preparedThousandths: 1125, unavailableThousandths: 875, remainingThousandths: 1125 }],
    })
  })
  it('preserves terminal DELIVERED for authorized detail reads', () => {
    expect(mapCustomerTrackedOrder({ ...row, status: 'DELIVERED' }).status).toBe('DELIVERED')
  })
  it('fails closed on missing lines or inconsistent balances', () => {
    expect(() => mapCustomerTrackedOrder({ ...row, items: [] })).toThrow(CustomerTrackingDataError)
    expect(() => mapCustomerTrackedOrder({ ...row, items: [{ ...row.items[0]!, prepared_quantity: '3.000', unavailable_quantity: '1.000' }] }))
      .toThrow(CustomerTrackingDataError)
  })
  it('rejects malformed timestamps and overprecise quantities', () => {
    expect(() => mapCustomerTrackedOrder({ ...row, created_at: 'not-a-date' })).toThrow(CustomerTrackingDataError)
    expect(() => mapCustomerTrackedOrder({ ...row, items: [{ ...row.items[0]!, requested_quantity: '3.0001' }] }))
      .toThrow(CustomerTrackingDataError)
  })
})
