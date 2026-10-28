import { describe, expect, it } from 'vitest'
import { KitchenOrderQueryValidationError } from '../application/kitchenOrderQueryGateway'
import { KitchenProductionDataError, type KitchenStoredOrder } from './kitchenProductionOrder'
import {
  encodeKitchenQueueCursor,
  kitchenQueueAfterExpression,
  normalizeKitchenQueueQuery,
} from './kitchenQueuePagination'

const row = {
  id: '52000000-0000-4000-8000-000000000001',
  requested_delivery_at: '2026-10-23T09:00:00+00:00',
  created_at: '2026-10-22T10:30:00+01:00',
} as KitchenStoredOrder

describe('Kitchen queue keyset pagination contract', () => {
  it('defaults to active statuses and 25 Orders', () => {
    expect(normalizeKitchenQueueQuery()).toEqual({
      statuses: ['RECEIVED', 'IN_PROGRESS'],
      pageSize: 25,
      after: null,
    })
  })

  it('supports all lifecycle statuses and normalizes filter order', () => {
    expect(normalizeKitchenQueueQuery({
      statuses: ['CANCELLED', 'READY', 'RECEIVED'],
      pageSize: 100,
    })).toEqual({
      statuses: ['RECEIVED', 'READY', 'CANCELLED'],
      pageSize: 100,
      after: null,
    })
  })

  it('roundtrips exact timestamps and preserves status scope', () => {
    const statuses = ['RECEIVED', 'IN_PROGRESS'] as const
    const token = encodeKitchenQueueCursor(row, statuses)
    const parsed = normalizeKitchenQueueQuery({ cursor: token })
    expect(parsed.after).toEqual({
      requestedDeliveryAt: '2026-10-23T09:00:00+00:00',
      createdAt: '2026-10-22T10:30:00+01:00',
      id: row.id,
    })
    expect(kitchenQueueAfterExpression(parsed.after!)).toBe([
      'requested_delivery_at.gt."2026-10-23T09:00:00+00:00"',
      'and(requested_delivery_at.eq."2026-10-23T09:00:00+00:00",created_at.gt."2026-10-22T10:30:00+01:00")',
      `and(requested_delivery_at.eq."2026-10-23T09:00:00+00:00",created_at.eq."2026-10-22T10:30:00+01:00",id.gt.${row.id})`,
    ].join(','))
  })

  it('preserves PostgreSQL microseconds in keyset equality', () => {
    const micro = { ...row, created_at: '2026-10-22T10:30:00.123456+01:00' }
    const token = encodeKitchenQueueCursor(micro, ['RECEIVED'])
    const cursor = normalizeKitchenQueueQuery({ statuses: ['RECEIVED'], cursor: token }).after!
    expect(cursor.createdAt).toBe(micro.created_at)
    expect(kitchenQueueAfterExpression(cursor)).toContain('created_at.eq."2026-10-22T10:30:00.123456+01:00"')
  })

  it('denies cursor reuse for a different status scope', () => {
    const token = encodeKitchenQueueCursor(row, ['RECEIVED', 'IN_PROGRESS'])
    expect(() => normalizeKitchenQueueQuery({ statuses: ['READY'], cursor: token }))
      .toThrow(KitchenOrderQueryValidationError)
  })

  it('rejects malformed and oversized cursors', () => {
    for (const cursor of ['', '.', 'a'.repeat(1025), btoa('{}')]) {
      expect(() => normalizeKitchenQueueQuery({ cursor })).toThrow(KitchenOrderQueryValidationError)
    }
  })

  it('rejects an invalid database UUID before encoding it', () => {
    expect(() => encodeKitchenQueueCursor({ ...row, id: 'SQL,or(injected)' }, ['RECEIVED']))
      .toThrow(KitchenProductionDataError)
  })

  it('rejects invalid timestamps from a provider rather than forming an unsafe filter', () => {
    expect(() => encodeKitchenQueueCursor({ ...row, created_at: '2026-10-22T10:30:00Z,or(status.eq.READY)' }, ['RECEIVED']))
      .toThrow(KitchenProductionDataError)
  })
})
