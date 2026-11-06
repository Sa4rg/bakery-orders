import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../lib/supabase/client'
import { subscribeToOrderChanges } from './orderChangesRealtime'

type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
type SystemPayload = { extension: string; status: string }

function fakeRealtime() {
  let onSystem: ((payload: SystemPayload) => void) | undefined
  let onSubscription: ((status: ChannelStatus) => void) | undefined
  const onChanges: Array<() => void> = []
  let removals = 0
  const channel = {
    on(kind: string, filter: Record<string, unknown>, callback: (...args: unknown[]) => void) {
      if (kind === 'system') {
        expect(filter).toEqual({})
        onSystem = (payload) => callback(payload)
      } else {
        expect(kind).toBe('postgres_changes')
        onChanges.push(() => callback())
      }
      return channel
    },
    subscribe(callback: (status: ChannelStatus) => void) {
      onSubscription = callback
      return channel
    },
  }
  const client = {
    channel() { return channel },
    removeChannel(removed: unknown) {
      expect(removed).toBe(channel)
      removals += 1
      return Promise.resolve('ok')
    },
  }
  return {
    client: client as unknown as SupabaseBrowserClient,
    status(value: ChannelStatus) { onSubscription?.(value) },
    system(extension: string, status: string) { onSystem?.({ extension, status }) },
    change() { onChanges[0]?.() },
    get removals() { return removals },
  }
}

describe('M5-007 PostgreSQL subscription readiness (shared Realtime transport)', () => {
  it('keeps the channel untrusted until postgres_changes reports ok, then announces readiness once', () => {
    const fake = fakeRealtime()
    const states: string[] = []
    const stop = subscribeToOrderChanges(fake.client, 'kitchen-production', {
      onInvalidation: () => undefined,
      onConnectionStatusChange: (value) => { states.push(value) },
    })
    fake.status('SUBSCRIBED')
    fake.system('system', 'ok') // Not a Postgres Changes subscription acknowledgement.
    expect(states).toEqual(['connecting'])
    fake.system('postgres_changes', 'ok')
    fake.system('postgres_changes', 'ok')
    expect(states).toEqual(['connecting', 'connected'])
    stop()
  })

  it('accepts postgres_changes readiness even when it arrives before SUBSCRIBED', () => {
    const fake = fakeRealtime()
    const states: string[] = []
    const stop = subscribeToOrderChanges(fake.client, 'customer-tracking', {
      onInvalidation: () => undefined,
      onConnectionStatusChange: (value) => { states.push(value) },
    })
    fake.system('postgres_changes', 'ok')
    expect(states).toEqual(['connecting'])
    fake.status('SUBSCRIBED')
    expect(states).toEqual(['connecting', 'connected'])
    stop()
  })

  it('resets readiness after disconnection and only reconnects after a new PostgreSQL ok', () => {
    const fake = fakeRealtime()
    const states: string[] = []
    const stop = subscribeToOrderChanges(fake.client, 'kitchen-production', {
      onInvalidation: () => undefined,
      onConnectionStatusChange: (value) => { states.push(value) },
    })
    fake.status('SUBSCRIBED')
    fake.system('postgres_changes', 'ok')
    fake.status('CHANNEL_ERROR')
    fake.status('SUBSCRIBED')
    expect(states).toEqual(['connecting', 'connected', 'disconnected', 'connecting'])
    fake.system('postgres_changes', 'error')
    expect(states.at(-1)).toBe('disconnected')
    fake.system('postgres_changes', 'ok') // Server successfully retried registration.
    expect(states.at(-1)).toBe('connected')
    fake.status('CLOSED')
    expect(states.at(-1)).toBe('disconnected')
    stop()
  })

  it('ignores Postgres callbacks and readiness notifications after cleanup', async () => {
    const fake = fakeRealtime()
    const states: string[] = []
    let invalidations = 0
    const stop = subscribeToOrderChanges(fake.client, 'kitchen-production', {
      onInvalidation: () => { invalidations += 1 },
      onConnectionStatusChange: (value) => { states.push(value) },
    })
    fake.status('SUBSCRIBED')
    stop()
    stop()
    fake.system('postgres_changes', 'ok')
    fake.status('SUBSCRIBED')
    fake.change()
    await Promise.resolve()
    await Promise.resolve()
    expect(states).toEqual(['connecting'])
    expect(invalidations).toBe(0)
    expect(fake.removals).toBe(1)
  })
})
