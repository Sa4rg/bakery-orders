import type { Database } from '../../../lib/supabase/database.types'
import { parseQuantityThousandths } from '../../../shared/domain/quantityThousandths'

export type CustomerOrderStatus = Database['public']['Enums']['order_status']

export interface CustomerTrackedItem {
  readonly id: string
  readonly productName: string
  readonly unitCode: string
  readonly quantityStepThousandths: number
  readonly requestedThousandths: number
  readonly preparedThousandths: number
  readonly unavailableThousandths: number
  readonly remainingThousandths: number
}

export interface CustomerTrackedOrder {
  readonly id: string
  readonly orderNumber: number
  readonly businessId: string
  readonly status: CustomerOrderStatus
  readonly requestedDeliveryAt: string
  readonly createdAt: string
  readonly customerNotes: string | null
  readonly items: readonly CustomerTrackedItem[]
}

export interface StoredTrackedItem {
  id: string
  product_name_snapshot: string
  unit_code_snapshot: string
  quantity_step_snapshot: number | string
  requested_quantity: number | string
  prepared_quantity: number | string
  unavailable_quantity: number | string
}

export interface StoredTrackedOrder {
  id: string
  order_number: number
  business_id: string
  status: CustomerOrderStatus
  requested_delivery_at: string
  created_at: string
  customer_notes: string | null
  items: StoredTrackedItem[]
}

export class CustomerTrackingDataError extends Error {
  constructor() {
    super('Customer tracking data is invalid.')
    this.name = 'CustomerTrackingDataError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STATUSES: readonly CustomerOrderStatus[] = [
  'RECEIVED', 'IN_PROGRESS', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED',
]

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

export function validCustomerTrackingTimestamp(value: unknown): value is string {
  return isTimestamp(value)
}

export function mapCustomerTrackedOrder(row: StoredTrackedOrder): CustomerTrackedOrder {
  try {
    if (!UUID.test(row.id) || !UUID.test(row.business_id)
      || !Number.isSafeInteger(row.order_number) || row.order_number <= 0
      || !STATUSES.includes(row.status)
      || !isTimestamp(row.created_at) || !isTimestamp(row.requested_delivery_at)
      || (row.customer_notes !== null && typeof row.customer_notes !== 'string')
      || !Array.isArray(row.items) || row.items.length === 0) {
      throw new CustomerTrackingDataError()
    }
    const items = row.items.map((item): CustomerTrackedItem => {
      const quantityStepThousandths = parseQuantityThousandths(item.quantity_step_snapshot)
      const requestedThousandths = parseQuantityThousandths(item.requested_quantity)
      const preparedThousandths = parseQuantityThousandths(item.prepared_quantity)
      const unavailableThousandths = parseQuantityThousandths(item.unavailable_quantity)
      const remainingThousandths = requestedThousandths - preparedThousandths - unavailableThousandths
      if (!UUID.test(item.id)
        || typeof item.product_name_snapshot !== 'string' || !item.product_name_snapshot.trim()
        || typeof item.unit_code_snapshot !== 'string' || !item.unit_code_snapshot.trim()
        || quantityStepThousandths <= 0 || requestedThousandths <= 0
        || remainingThousandths < 0) throw new CustomerTrackingDataError()
      return {
        id: item.id,
        productName: item.product_name_snapshot,
        unitCode: item.unit_code_snapshot,
        quantityStepThousandths, requestedThousandths,
        preparedThousandths, unavailableThousandths, remainingThousandths,
      }
    }).sort((a, b) => a.id.localeCompare(b.id))
    return {
      id: row.id, orderNumber: row.order_number, businessId: row.business_id,
      status: row.status, requestedDeliveryAt: row.requested_delivery_at,
      createdAt: row.created_at, customerNotes: row.customer_notes, items,
    }
  } catch {
    throw new CustomerTrackingDataError()
  }
}
