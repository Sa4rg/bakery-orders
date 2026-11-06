import { CustomerTrackingValidationError, type CustomerTrackingFilters } from '../application/customerTrackingQueryGateway'
import { validCustomerTrackingTimestamp, type StoredTrackedOrder } from './customerTrackedOrder'

export const ACTIVE_CUSTOMER_STATUSES = [
  'RECEIVED', 'IN_PROGRESS', 'READY', 'DISPATCHED',
] as const

interface Position {
  readonly createdAt: string
  readonly id: string
}
interface CursorPayload {
  readonly v: 1
  readonly list: 'customer-active'
  readonly last: Position
}
export interface NormalizedCustomerTrackingQuery {
  readonly pageSize: number
  readonly after: Position | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeCustomerTrackingQuery(filters: CustomerTrackingFilters = {}): NormalizedCustomerTrackingQuery {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw new CustomerTrackingValidationError()
  }
  const size: unknown = filters.pageSize === undefined ? 25 : filters.pageSize
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 100) {
    throw new CustomerTrackingValidationError()
  }
  const cursor: unknown = filters.cursor ?? null
  if (cursor === null) return { pageSize: size, after: null }
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 1024
    || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new CustomerTrackingValidationError()
  try {
    const decoded: unknown = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(cursor.length / 4) * 4, '=')))
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      throw new CustomerTrackingValidationError()
    }
    const payload = decoded as Partial<CursorPayload>
    if (payload.v !== 1 || payload.list !== 'customer-active'
      || !payload.last || !validCustomerTrackingTimestamp(payload.last.createdAt)
      || typeof payload.last.id !== 'string' || !UUID.test(payload.last.id)) {
      throw new CustomerTrackingValidationError()
    }
    return { pageSize: size, after: payload.last }
  } catch {
    throw new CustomerTrackingValidationError()
  }
}

export function encodeCustomerTrackingCursor(row: Pick<StoredTrackedOrder, 'id' | 'created_at'>): string {
  if (!UUID.test(row.id) || !validCustomerTrackingTimestamp(row.created_at)) {
    throw new CustomerTrackingValidationError()
  }
  const value: CursorPayload = {
    v: 1, list: 'customer-active', last: { createdAt: row.created_at, id: row.id },
  }
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Values always originate from a validated cursor, not unescaped user input. */
export function customerTrackingAfterExpression(after: Position): string {
  return `created_at.lt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.lt.${after.id})`
}
