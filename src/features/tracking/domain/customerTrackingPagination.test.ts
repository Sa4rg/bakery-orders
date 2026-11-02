import { describe, expect, it } from 'vitest'
import { CustomerTrackingValidationError } from '../application/customerTrackingQueryGateway'
import { customerTrackingAfterExpression, encodeCustomerTrackingCursor, normalizeCustomerTrackingQuery } from './customerTrackingPagination'

const row = { id: '00000000-0000-4000-8000-000000000011', created_at: '2026-10-28T10:05:01.123456+00:00' }

describe('customer keyset pagination', () => {
  it('defaults to a bounded first page', () => {
    expect(normalizeCustomerTrackingQuery()).toEqual({ pageSize: 25, after: null })
  })
  it('round-trips a microsecond-precision cursor and orders newest-first', () => {
    const cursor = encodeCustomerTrackingCursor(row)
    const result = normalizeCustomerTrackingQuery({ pageSize: 2, cursor })
    expect(result).toEqual({ pageSize: 2, after: { createdAt: row.created_at, id: row.id } })
    expect(customerTrackingAfterExpression(result.after!)).toBe(
      `created_at.lt."${row.created_at}",and(created_at.eq."${row.created_at}",id.lt.${row.id})`,
    )
  })
  it.each([
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: 1.2 },
    { pageSize: NaN },
    { cursor: 'garbage' },
    { cursor: '%%%' },
  ])('rejects invalid query options', (input) => {
    expect(() => normalizeCustomerTrackingQuery(input)).toThrow(CustomerTrackingValidationError)
  })
  it('rejects a cursor meant for another list', () => {
    const foreign = btoa(JSON.stringify({ v: 1, list: 'kitchen', last: { createdAt: row.created_at, id: row.id } }))
    expect(() => normalizeCustomerTrackingQuery({ cursor: foreign })).toThrow(CustomerTrackingValidationError)
  })
  it('rejects a malformed timestamp inside an encoded cursor', () => {
    const malicious = btoa(JSON.stringify({ v: 1, list: 'customer-active', last: { createdAt: '2026-10-28",status.eq.READY', id: row.id } }))
    expect(() => normalizeCustomerTrackingQuery({ cursor: malicious })).toThrow(CustomerTrackingValidationError)
  })
})
