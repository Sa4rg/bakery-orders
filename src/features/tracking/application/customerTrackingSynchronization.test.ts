import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeCustomerTrackingRealtimeGateway } from '../testing/createFakeCustomerTrackingRealtimeGateway'
import { createCustomerTrackingSynchronizer, type CustomerTrackingSyncState } from './customerTrackingSynchronization'

const businessId = 'a2100000-0000-4000-8000-000000000001'
const orderId = 'a2200000-0000-4000-8000-000000000001'
afterEach(() => vi.useRealTimers())

describe('M5-003 CUSTOMER Tracking synchronizer', () => {
  it('refetches on connection and ignores row content entirely', () => {
    const fake = createFakeCustomerTrackingRealtimeGateway()
    const history: CustomerTrackingSyncState[] = []
    const sync = createCustomerTrackingSynchronizer({ realtimeGateway: fake.gateway, businessId, orderId, debounceMs: 0 })
    const stop = sync.start((state) => history.push(state))
    expect(fake.scopes).toEqual([{ businessId, orderId }])
    expect(history.at(-1)).toEqual({ connection: 'connecting', revision: 0 })
    fake.emitStatus('connected')
    expect(history.at(-1)).toEqual({ connection: 'connected', revision: 1 })
    sync.refresh()
    expect(history.at(-1)?.revision).toBe(2)
    stop()
    expect(fake.activeSubscriptions).toBe(0)
  })

  it('debounces bursts and refetches after reconnect even if changes were missed', async () => {
    vi.useFakeTimers()
    const fake = createFakeCustomerTrackingRealtimeGateway()
    const states: CustomerTrackingSyncState[] = []
    const stop = createCustomerTrackingSynchronizer({ realtimeGateway: fake.gateway, businessId, debounceMs: 40 })
      .start((value) => states.push(value))
    fake.emitStatus('connected')
    expect(states.at(-1)?.revision).toBe(1)
    fake.emitInvalidation()
    fake.emitInvalidation()
    fake.emitInvalidation()
    await vi.advanceTimersByTimeAsync(40)
    expect(states.at(-1)?.revision).toBe(2)
    fake.emitStatus('disconnected')
    fake.emitInvalidation()
    await vi.advanceTimersByTimeAsync(40)
    expect(states.at(-1)?.revision).toBe(2)
    fake.emitStatus('connected')
    expect(states.at(-1)).toEqual({ connection: 'connected', revision: 3 })
    stop()
  })

  it('clears pending invalidations and listener callbacks on logout/unmount', async () => {
    vi.useFakeTimers()
    const fake = createFakeCustomerTrackingRealtimeGateway()
    const states: CustomerTrackingSyncState[] = []
    const sync = createCustomerTrackingSynchronizer({ realtimeGateway: fake.gateway, businessId })
    const stop = sync.start((state) => states.push(state))
    fake.emitStatus('connected')
    fake.emitInvalidation()
    const before = states.length
    stop(); stop()
    await vi.advanceTimersByTimeAsync(100)
    fake.emitInvalidation()
    fake.emitStatus('connected')
    expect(states).toHaveLength(before)
    expect(fake.cleanupCount).toBe(1)
    expect(fake.activeSubscriptions).toBe(0)
  })

  it('rejects a concurrent session but permits a new session after cleanup', () => {
    const fake = createFakeCustomerTrackingRealtimeGateway()
    const sync = createCustomerTrackingSynchronizer({ realtimeGateway: fake.gateway, businessId })
    const stop = sync.start(() => undefined)
    expect(() => sync.start(() => undefined)).toThrow('already running')
    stop()
    const stopNext = sync.start(() => undefined)
    stopNext()
    expect(fake.cleanupCount).toBe(2)
  })

  it('manual refresh is permitted while disconnected; it never executes mutations', () => {
    const fake = createFakeCustomerTrackingRealtimeGateway()
    const states: CustomerTrackingSyncState[] = []
    const sync = createCustomerTrackingSynchronizer({ realtimeGateway: fake.gateway, businessId })
    const stop = sync.start((state) => states.push(state))
    fake.emitStatus('disconnected')
    sync.refresh()
    expect(states.at(-1)).toEqual({ connection: 'disconnected', revision: 1 })
    stop()
  })
})
