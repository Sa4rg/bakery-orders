//import type { Database } from '../../../lib/supabase/database.types'

export type KitchenOrderStatus =
  | 'RECEIVED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'

/** Exact domain representation: one unit is 1,000 thousandths. */
export type QuantityThousandths = number

export interface KitchenProductionItem {
  readonly id: string
  readonly productId: string
  readonly productName: string
  readonly unitCode: string
  readonly quantityStepThousandths: QuantityThousandths
  readonly requestedThousandths: QuantityThousandths
  readonly preparedThousandths: QuantityThousandths
  readonly unavailableThousandths: QuantityThousandths
  readonly remainingThousandths: QuantityThousandths
}

export interface KitchenProductionOrder {
  readonly id: string
  readonly orderNumber: number
  readonly businessId: string
  readonly businessName: string
  readonly status: KitchenOrderStatus
  readonly requestedDeliveryAt: string
  readonly createdAt: string
  readonly customerNotes: string | null
  readonly items: readonly KitchenProductionItem[]
}

/** Internal mapping inputs; database snake_case is confined to the adapter. */
export interface KitchenStoredItem {
  id: string
  product_id: string
  product_name_snapshot: string
  unit_code_snapshot: string
  quantity_step_snapshot: number | string
  requested_quantity: number | string
  prepared_quantity: number | string
  unavailable_quantity: number | string
}

export interface KitchenStoredOrder {
  id: string
  order_number: number
  business_id: string
  status: KitchenOrderStatus
  requested_delivery_at: string
  created_at: string
  customer_notes: string | null
  items: KitchenStoredItem[]
}

export class KitchenProductionDataError extends Error {
  constructor() {
    super('Kitchen production data is invalid.')
    this.name = 'KitchenProductionDataError'
  }
}

const allowedStatuses: readonly string[] = [
  'RECEIVED',
  'IN_PROGRESS',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
]

/**
 * Avoid binary float arithmetic on quantities. PostgreSQL numeric(12,3)
 * arrives as a JS number with the generated client types, but its decimal
 * spelling can be parsed into an exact integer number of thousandths.
 */
export function toQuantityThousandths(value: number | string): number {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new KitchenProductionDataError()
  }

  const decimal = String(value)
  const parts = /^(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(decimal)

  if (!parts) {
    throw new KitchenProductionDataError()
  }

  const whole = Number(parts[1])
  const fraction = Number((parts[2] ?? '').padEnd(3, '0'))
  const result = whole * 1000 + fraction

  if (!Number.isSafeInteger(result)) {
    throw new KitchenProductionDataError()
  }

  return result
}

function hasTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && Number.isFinite(Date.parse(value))
}

function mapItem(row: KitchenStoredItem): KitchenProductionItem {
  const quantityStepThousandths = toQuantityThousandths(row.quantity_step_snapshot)
  const requestedThousandths = toQuantityThousandths(row.requested_quantity)
  const preparedThousandths = toQuantityThousandths(row.prepared_quantity)
  const unavailableThousandths = toQuantityThousandths(row.unavailable_quantity)
  const remainingThousandths = requestedThousandths
    - preparedThousandths
    - unavailableThousandths

  if (
    quantityStepThousandths <= 0
    || requestedThousandths <= 0
    || remainingThousandths < 0
    || typeof row.product_name_snapshot !== 'string'
    || row.product_name_snapshot.trim() === ''
    || typeof row.unit_code_snapshot !== 'string'
    || row.unit_code_snapshot.trim() === ''
  ) {
    throw new KitchenProductionDataError()
  }

  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name_snapshot,
    unitCode: row.unit_code_snapshot,
    quantityStepThousandths,
    requestedThousandths,
    preparedThousandths,
    unavailableThousandths,
    remainingThousandths,
  }
}

export function mapKitchenProductionOrder(
  row: KitchenStoredOrder,
  businessName: string,
): KitchenProductionOrder {
  if (
    !Number.isSafeInteger(row.order_number)
    || row.order_number <= 0
    || !allowedStatuses.includes(row.status)
    || !hasTimestamp(row.requested_delivery_at)
    || !hasTimestamp(row.created_at)
    || !Array.isArray(row.items)
    || row.items.length === 0
    || typeof businessName !== 'string'
    || businessName.trim() === ''
    || (row.customer_notes !== null && typeof row.customer_notes !== 'string')
  ) {
    throw new KitchenProductionDataError()
  }

  return {
    id: row.id,
    orderNumber: row.order_number,
    businessId: row.business_id,
    businessName,
    status: row.status,
    requestedDeliveryAt: row.requested_delivery_at,
    createdAt: row.created_at,
    customerNotes: row.customer_notes,
    items: row.items.map(mapItem).sort((a, b) => a.id.localeCompare(b.id)),
  }
}
