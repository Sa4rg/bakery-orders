import {
  KitchenOrderQueryValidationError,
  type KitchenOrderQueryFilters,
} from '../application/kitchenOrderQueryGateway'
import type { KitchenOrderStatus, KitchenStoredOrder } from './kitchenProductionOrder'
import { KitchenProductionDataError } from './kitchenProductionOrder'

const ALL_STATUSES: readonly KitchenOrderStatus[] = [
  'RECEIVED', 'IN_PROGRESS', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED',
]
const ACTIVE_STATUSES: readonly KitchenOrderStatus[] = ['RECEIVED', 'IN_PROGRESS']
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const MAX_CURSOR_LENGTH = 1024
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const dbTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

export interface KitchenQueuePosition {
  readonly requestedDeliveryAt: string
  readonly createdAt: string
  readonly id: string
}

interface CursorPayload {
  readonly v: 1
  readonly statuses: readonly KitchenOrderStatus[]
  readonly last: KitchenQueuePosition
}

export interface NormalizedKitchenQueueQuery {
  readonly statuses: readonly KitchenOrderStatus[]
  readonly pageSize: number
  readonly after: KitchenQueuePosition | null
}

function isDbTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && dbTimestampPattern.test(value)
    && Number.isFinite(Date.parse(value))
}

function preserveDbTimestamp(value: unknown): string {
  // PostgreSQL timestamptz has microsecond precision. Converting to JS Date
  // would silently truncate sub-millisecond digits and break keyset equality.
  if (!isDbTimestamp(value)) throw new KitchenProductionDataError()
  return value
}

function decodeCursor(value: string, statuses: readonly KitchenOrderStatus[]): KitchenQueuePosition {
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new KitchenOrderQueryValidationError()
  }

  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const parsed: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new KitchenOrderQueryValidationError()
    }
    const cursor = parsed as Partial<CursorPayload>
    if (
      cursor.v !== 1
      || !Array.isArray(cursor.statuses)
      || cursor.statuses.length !== statuses.length
      || !statuses.every((status, index) => cursor.statuses?.[index] === status)
      || typeof cursor.last !== 'object'
      || cursor.last === null
      || !isDbTimestamp(cursor.last.requestedDeliveryAt)
      || !isDbTimestamp(cursor.last.createdAt)
      || typeof cursor.last.id !== 'string'
      || !uuidPattern.test(cursor.last.id)
    ) {
      throw new KitchenOrderQueryValidationError()
    }
    return cursor.last
  } catch {
    throw new KitchenOrderQueryValidationError()
  }
}

/** All untrusted query input is checked before invoking any provider method. */
export function normalizeKitchenQueueQuery(
  filters: KitchenOrderQueryFilters = {},
): NormalizedKitchenQueueQuery {
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) {
    throw new KitchenOrderQueryValidationError()
  }

  const suppliedStatuses: unknown = filters.statuses === undefined
    ? ACTIVE_STATUSES
    : filters.statuses
  if (
    !Array.isArray(suppliedStatuses)
    || suppliedStatuses.length === 0
    || suppliedStatuses.length > ALL_STATUSES.length
    || !suppliedStatuses.every((status) => ALL_STATUSES.includes(status))
    || new Set(suppliedStatuses).size !== suppliedStatuses.length
  ) {
    throw new KitchenOrderQueryValidationError()
  }
  // Canonical order makes the cursor independent of caller-provided status order.
  const statuses = ALL_STATUSES.filter((status) => suppliedStatuses.includes(status))

  const pageSize: unknown = filters.pageSize === undefined ? DEFAULT_PAGE_SIZE : filters.pageSize
  if (
    typeof pageSize !== 'number'
    || !Number.isInteger(pageSize)
    || pageSize < 1
    || pageSize > MAX_PAGE_SIZE
  ) {
    throw new KitchenOrderQueryValidationError()
  }

  const cursor = filters.cursor ?? null
  if (cursor !== null && typeof cursor !== 'string') {
    throw new KitchenOrderQueryValidationError()
  }
  return {
    statuses,
    pageSize,
    after: cursor === null ? null : decodeCursor(cursor, statuses),
  }
}

/** Encode only verified DB values, never values supplied directly by the caller. */
export function encodeKitchenQueueCursor(
  row: KitchenStoredOrder,
  statuses: readonly KitchenOrderStatus[],
): string {
  if (typeof row.id !== 'string' || !uuidPattern.test(row.id)) {
    throw new KitchenProductionDataError()
  }
  const payload: CursorPayload = {
    v: 1,
    statuses,
    last: {
      requestedDeliveryAt: preserveDbTimestamp(row.requested_delivery_at),
      createdAt: preserveDbTimestamp(row.created_at),
      id: row.id,
    },
  }
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * Keyset continuation for ORDER BY requested_delivery_at, created_at, id ASC.
 * All values come from a strictly validated cursor; quoted dates
 * are required by PostgREST's logic-tree grammar (ISO values include dots).
 * requested_delivery_at and created_at are NOT NULL in the real schema.
 */
export function kitchenQueueAfterExpression(after: KitchenQueuePosition): string {
  const delivery = `"${after.requestedDeliveryAt}"`
  const created = `"${after.createdAt}"`
  return [
    `requested_delivery_at.gt.${delivery}`,
    `and(requested_delivery_at.eq.${delivery},created_at.gt.${created})`,
    `and(requested_delivery_at.eq.${delivery},created_at.eq.${created},id.gt.${after.id})`,
  ].join(',')
}
