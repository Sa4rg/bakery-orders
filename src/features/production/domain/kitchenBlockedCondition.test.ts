import { describe, expect, it } from 'vitest'
import { deriveKitchenBlockedCondition } from './kitchenBlockedCondition'
import type { KitchenProductionItem, KitchenProductionOrder } from './kitchenProductionOrder'

const item: KitchenProductionItem = {
  id: '03000000-0000-4000-8000-000000000003',
  productId: '04000000-0000-4000-8000-000000000004',
  productName: 'Bread', unitCode: 'UNIT', quantityStepThousandths: 125,
  requestedThousandths: 1125, preparedThousandths: 0,
  unavailableThousandths: 1125, remainingThousandths: 0,
}
const order: KitchenProductionOrder = {
  id: '01000000-0000-4000-8000-000000000001', orderNumber: 901,
  businessId: '02000000-0000-4000-8000-000000000002', businessName: 'Bakery',
  status: 'IN_PROGRESS', requestedDeliveryAt: '2030-01-15T10:30:00Z',
  createdAt: '2026-10-27T10:00:00Z', customerNotes: null, items: [item],
}

describe('M4-009A — blocked condition is derived, never persisted as a new status', () => {
  it('flags fully unavailable IN_PROGRESS Orders for MANAGER intervention', () => {
    const actual = deriveKitchenBlockedCondition(order)
    expect(actual).toMatchObject({
      blocked: true, reason: 'TOTAL_UNAVAILABILITY',
      fulfillment: { resolution: 'RESOLVED', condition: 'UNAVAILABLE', totals: {
        requestedThousandths: 1125, preparedThousandths: 0,
        unavailableThousandths: 1125, remainingThousandths: 0,
      } },
    })
    expect(order.status).toBe('IN_PROGRESS')
  })
  it('does not block UNRESOLVED (remaining positive), even with zero prepared', () => {
    const input = { ...order, items: [{ ...item, unavailableThousandths: 1000,
      remainingThousandths: 125 }] }
    expect(deriveKitchenBlockedCondition(input)).toMatchObject({
      blocked: false, reason: null, fulfillment: { resolution: 'UNRESOLVED' },
    })
  })
  it('does not block resolved PARTIAL or COMPLETE Orders', () => {
    expect(deriveKitchenBlockedCondition({ ...order, items: [{ ...item,
      preparedThousandths: 125, unavailableThousandths: 1000 }] }).blocked).toBe(false)
    expect(deriveKitchenBlockedCondition({ ...order, items: [{ ...item,
      preparedThousandths: 1125, unavailableThousandths: 0 }] }).blocked).toBe(false)
  })
  it('aggregates multiple OrderItems rather than checking just one line', () => {
    const lines = [item, { ...item, id: '05000000-0000-4000-8000-000000000005',
      requestedThousandths: 250, unavailableThousandths: 250 }]
    expect(deriveKitchenBlockedCondition({ ...order, items: lines })).toMatchObject({
      blocked: true, fulfillment: { totals: { unavailableThousandths: 1375 } },
    })
    expect(deriveKitchenBlockedCondition({ ...order, items: [{ ...item,
      preparedThousandths: 125, unavailableThousandths: 1000 }, lines[1]!] }).blocked).toBe(false)
  })
  it.each(['RECEIVED', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const)(
    'never invents a blocked operational status for %s', (status) => {
      expect(deriveKitchenBlockedCondition({ ...order, status })).toMatchObject({
        blocked: false, reason: null,
      })
    },
  )
  it('rejects inconsistent quantities rather than manufacturing an intervention', () => {
    expect(() => deriveKitchenBlockedCondition({ ...order, items: [{ ...item,
      preparedThousandths: 125 }] })).toThrow('Kitchen fulfillment quantities are invalid.')
  })
})
