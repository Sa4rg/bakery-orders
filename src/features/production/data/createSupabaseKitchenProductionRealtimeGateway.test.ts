import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { createSupabaseKitchenProductionRealtimeGateway } from './createSupabaseKitchenProductionRealtimeGateway'

type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
type Table = 'orders' | 'order_items'
type Event = 'INSERT' | 'UPDATE'

function fakeSupabaseRealtime() {
  const registrations: Array<{
    table: Table
    event: Event
    callback: () => void
  }> = []
  const calls: string[] = []
  let statusListener: ((status: ChannelStatus) => void) | null = null
  let systemListener: ((payload: { extension: string; status: string }) => void) | null = null
  const channel = {
    on(
      kind: string,
      filter: { event?: Event; schema?: string; table?: Table },
      callback: (...args: unknown[]) => void,
    ) {
      if (kind === 'system') {
        expect(filter).toEqual({})
        systemListener = (payload) => callback(payload)
        calls.push('register:system')
        return channel
      }
      expect(kind).toBe('postgres_changes')
      expect(filter.schema).toBe('public')
      expect(filter.table).toBeDefined()
      expect(filter.event).toBeDefined()
      registrations.push({ table: filter.table as Table, event: filter.event as Event, callback: () => callback() })
      calls.push(`register:${filter.table}:${filter.event}`)
      return channel
    },
    subscribe(callback: (status: ChannelStatus) => void) {
      calls.push('subscribe')
      statusListener = callback
      return channel
    },
  }
  const client = {
    channel(name: string) {
      calls.push(`channel:${name}`)
      return channel
    },
    removeChannel(removed: unknown) {
      expect(removed).toBe(channel)
      calls.push('remove')
      return Promise.resolve('ok')
    },
  }
  return {
    client: client as unknown as SupabaseBrowserClient,
    calls,
    registrations,
    status(status: ChannelStatus) { statusListener?.(status) },
    ready(value: 'ok' | 'error') { systemListener?.({ extension: 'postgres_changes', status: value }) },
    emit(table: Table, event: Event) {
      const registration = registrations.find((candidate) =>
        candidate.table === table && candidate.event === event)
      expect(registration).toBeDefined()
      registration?.callback()
    },
  }
}

describe('Supabase Kitchen realtime adapter (M4-002C)', () => {
  it('registers four INSERT/UPDATE listeners before joining; forwards no payloads', () => {
    const fake = fakeSupabaseRealtime()
    const states: string[] = []
    let invalidations = 0
    const stop = createSupabaseKitchenProductionRealtimeGateway(fake.client).subscribe({
      onInvalidation: () => { invalidations += 1 },
      onConnectionStatusChange: (status) => { states.push(status) },
    })
    expect(fake.calls.slice(1)).toEqual([
      'register:system',
      'register:orders:INSERT',
      'register:orders:UPDATE',
      'register:order_items:INSERT',
      'register:order_items:UPDATE',
      'subscribe',
    ])
    fake.status('SUBSCRIBED')
    expect(states).toEqual(['connecting'])
    fake.ready('ok')
    fake.emit('orders', 'INSERT')
    fake.emit('orders', 'UPDATE')
    fake.emit('order_items', 'INSERT')
    fake.emit('order_items', 'UPDATE')
    expect(invalidations).toBe(4)
    expect(states).toEqual(['connecting', 'connected'])
    stop()
  })

  it('notifies disconnects, supports re-subscription, and ignores late callbacks after cleanup', async () => {
    const fake = fakeSupabaseRealtime()
    const states: string[] = []
    let invalidations = 0
    const stop = createSupabaseKitchenProductionRealtimeGateway(fake.client).subscribe({
      onInvalidation: () => { invalidations += 1 },
      onConnectionStatusChange: (status) => { states.push(status) },
    })
    fake.status('SUBSCRIBED')
    fake.ready('ok')
    fake.status('CHANNEL_ERROR')
    fake.status('TIMED_OUT')
    fake.status('SUBSCRIBED')
    expect(states).toEqual(['connecting', 'connected', 'disconnected', 'connecting'])
    fake.ready('ok')
    expect(states).toEqual(['connecting', 'connected', 'disconnected', 'connecting', 'connected'])
    stop()
    stop()
    fake.emit('orders', 'INSERT')
    fake.status('SUBSCRIBED')
    fake.ready('ok')
    await Promise.resolve()
    await Promise.resolve()
    expect(invalidations).toBe(0)
    expect(fake.calls.filter((value) => value === 'remove')).toHaveLength(1)
    expect(states).toHaveLength(5)
  })
})
