import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { createSupabaseCustomerTrackingRealtimeGateway } from './createSupabaseCustomerTrackingRealtimeGateway'

const businessId = 'a2100000-0000-4000-8000-000000000001'
const orderId = 'a2200000-0000-4000-8000-000000000001'

type Status = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
type Filter = { event: string; schema: string; table: string; filter?: string }
function fakeClient() {
  const filters: Filter[] = []
  const callbacks: Array<() => void> = []
  let subscribeStatus: ((status: Status) => void) | undefined
  let systemListener: ((payload: { extension: string; status: string }) => void) | undefined
  let removed = 0
  const channel = {
    on(type: string, filter: Partial<Filter>, callback: (...args: unknown[]) => void) {
      if (type === 'system') {
        expect(filter).toEqual({})
        systemListener = (payload) => callback(payload)
        return channel
      }
      expect(type).toBe('postgres_changes')
      filters.push(filter as Filter)
      callbacks.push(() => callback())
      return channel
    },
    subscribe(callback: (status: Status) => void) { subscribeStatus = callback; return channel },
  }
  const client = {
    channel(name: string) { expect(name).toMatch(/^customer-tracking-\d+$/); return channel },
    removeChannel(arg: unknown) { expect(arg).toBe(channel); removed += 1; return Promise.resolve('ok') },
  }
  return {
    client: client as unknown as SupabaseBrowserClient,
    filters,
    emitChange() { for (const callback of callbacks) callback() },
    status(value: Status) { subscribeStatus?.(value) },
    ready(value: 'ok' | 'error') { systemListener?.({ extension: 'postgres_changes', status: value }) },
    get removed() { return removed },
  }
}

describe('M5-003 customer Postgres Changes transport', () => {
  it('filters Order INSERT/UPDATE to the Business and omits item listeners without a detail', () => {
    const fake = fakeClient()
    const changes: number[] = []
    const statuses: string[] = []
    const stop = createSupabaseCustomerTrackingRealtimeGateway(fake.client).subscribe({ businessId }, {
      onInvalidation: () => changes.push(1),
      onConnectionStatusChange: (status) => statuses.push(status),
    })
    expect(fake.filters).toEqual([
      { table: 'orders', schema: 'public', event: 'INSERT', filter: `business_id=eq.${businessId}` },
      { table: 'orders', schema: 'public', event: 'UPDATE', filter: `business_id=eq.${businessId}` },
    ])
    fake.status('SUBSCRIBED')
    expect(statuses).toEqual(['connecting'])
    fake.ready('ok')
    fake.emitChange()
    expect(changes).toHaveLength(2)
    expect(statuses).toEqual(['connecting', 'connected'])
    stop()
  })

  it('subscribes to only the selected OrderItems and ignores callbacks after cleanup', async () => {
    const fake = fakeClient()
    let invalidations = 0
    const statuses: string[] = []
    const stop = createSupabaseCustomerTrackingRealtimeGateway(fake.client).subscribe({ businessId, orderId }, {
      onInvalidation: () => { invalidations += 1 },
      onConnectionStatusChange: (status) => statuses.push(status),
    })
    expect(fake.filters).toHaveLength(4)
    expect(fake.filters.slice(2)).toEqual([
      { table: 'order_items', schema: 'public', event: 'INSERT', filter: `order_id=eq.${orderId}` },
      { table: 'order_items', schema: 'public', event: 'UPDATE', filter: `order_id=eq.${orderId}` },
    ])
    fake.status('SUBSCRIBED')
    fake.ready('ok')
    fake.status('CHANNEL_ERROR')
    fake.status('TIMED_OUT')
    fake.status('SUBSCRIBED')
    expect(statuses).toEqual(['connecting', 'connected', 'disconnected', 'connecting'])
    fake.ready('ok')
    expect(statuses).toEqual(['connecting', 'connected', 'disconnected', 'connecting', 'connected'])
    stop(); stop()
    fake.emitChange()
    fake.status('SUBSCRIBED')
    fake.ready('ok')
    await Promise.resolve(); await Promise.resolve()
    expect(invalidations).toBe(0)
    expect(fake.removed).toBe(1)
  })

  it('rejects invalid scope before registering a channel', () => {
    const fake = fakeClient()
    expect(() => createSupabaseCustomerTrackingRealtimeGateway(fake.client).subscribe({ businessId: 'bad' }, {
      onInvalidation: () => undefined,
      onConnectionStatusChange: () => undefined,
    })).toThrow('Invalid Realtime business scope')
    expect(fake.filters).toHaveLength(0)
  })
})
