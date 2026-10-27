import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitchenOrderPage, KitchenOrderQueryGateway } from './kitchenOrderQueryGateway'
import { createFakeKitchenProductionRealtimeGateway } from '../testing/createFakeKitchenProductionRealtimeGateway'
import { createKitchenQueueSynchronizer, type KitchenQueueSyncState } from './kitchenQueueSynchronization'

const emptyPage: KitchenOrderPage = { orders: [], nextCursor: null }
const anotherPage: KitchenOrderPage = { orders: [], nextCursor: 'next-token' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => { vi.useRealTimers() })

describe('KitchenQueueSynchronizer (M4-002D)', () => {
  it('loads from the read gateway on initial SUBSCRIBED, never from payloads', async () => {
    const realtime = createFakeKitchenProductionRealtimeGateway()
    const queryGateway: KitchenOrderQueryGateway = {
      loadProductionQueue: vi.fn().mockResolvedValue(emptyPage),
      loadProductionOrder: vi.fn(),
    }
    const seen: KitchenQueueSyncState[] = []
    const sync = createKitchenQueueSynchronizer({ queryGateway, realtimeGateway: realtime.gateway })
    const stop = sync.start((snapshot) => seen.push(snapshot))
    expect(queryGateway.loadProductionQueue).not.toHaveBeenCalled()
    realtime.emitStatus('connected')
    await flushPromises()
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledOnce()
    expect(seen.at(-1)).toMatchObject({ connection: 'connected', page: emptyPage, loading: false, stale: false })
    stop()
    expect(realtime.listenerCount).toBe(0)
  })

  it('debounces multiple table changes to one read and refetches when reconnected', async () => {
    vi.useFakeTimers()
    const realtime = createFakeKitchenProductionRealtimeGateway()
    const queryGateway: KitchenOrderQueryGateway = {
      loadProductionQueue: vi.fn().mockResolvedValue(emptyPage),
      loadProductionOrder: vi.fn(),
    }
    const seen: KitchenQueueSyncState[] = []
    const sync = createKitchenQueueSynchronizer({ queryGateway, realtimeGateway: realtime.gateway, debounceMs: 40 })
    const stop = sync.start((snapshot) => seen.push(snapshot))
    realtime.emitStatus('connected')
    await flushPromises()
    realtime.emitInvalidation()
    realtime.emitInvalidation()
    realtime.emitInvalidation()
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(40)
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledTimes(2)
    realtime.emitStatus('disconnected')
    expect(seen.at(-1)?.stale).toBe(true)
    realtime.emitInvalidation()
    await vi.advanceTimersByTimeAsync(40)
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledTimes(2)
    realtime.emitStatus('connected')
    await flushPromises()
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledTimes(3)
    expect(seen.at(-1)?.stale).toBe(false)
    stop()
  })

  it('does not lose an invalidation that arrives during an in-flight read', async () => {
    vi.useFakeTimers()
    const realtime = createFakeKitchenProductionRealtimeGateway()
    const first = deferred<KitchenOrderPage>()
    const queryGateway: KitchenOrderQueryGateway = {
      loadProductionQueue: vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(anotherPage),
      loadProductionOrder: vi.fn(),
    }
    const states: KitchenQueueSyncState[] = []
    const sync = createKitchenQueueSynchronizer({ queryGateway, realtimeGateway: realtime.gateway, debounceMs: 10 })
    const stop = sync.start((state) => states.push(state))
    realtime.emitStatus('connected')
    realtime.emitInvalidation()
    first.resolve(emptyPage)
    await flushPromises()
    expect(states.at(-1)?.stale).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledTimes(2)
    expect(states.at(-1)).toMatchObject({ page: anotherPage, stale: false, loading: false })
    stop()
  })

  it('discards late read results after stop and allows a clean new session', async () => {
    const realtime = createFakeKitchenProductionRealtimeGateway()
    const first = deferred<KitchenOrderPage>()
    const queryGateway: KitchenOrderQueryGateway = {
      loadProductionQueue: vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(anotherPage),
      loadProductionOrder: vi.fn(),
    }
    const states: KitchenQueueSyncState[] = []
    const sync = createKitchenQueueSynchronizer({ queryGateway, realtimeGateway: realtime.gateway })
    const stop = sync.start((state) => states.push(state))
    realtime.emitStatus('connected')
    const countBeforeStop = states.length
    stop()
    first.resolve(emptyPage)
    await flushPromises()
    expect(states).toHaveLength(countBeforeStop)
    const nextStates: KitchenQueueSyncState[] = []
    const stopNext = sync.start((state) => nextStates.push(state))
    realtime.emitStatus('connected')
    await flushPromises()
    expect(nextStates.at(-1)).toMatchObject({ page: anotherPage, stale: false })
    stopNext()
    expect(realtime.cleanupCount).toBe(2)
  })

  it('reports read errors safely, preserving last good page and allowing manual retry', async () => {
    const realtime = createFakeKitchenProductionRealtimeGateway()
    const queryGateway: KitchenOrderQueryGateway = {
      loadProductionQueue: vi.fn()
        .mockResolvedValueOnce(emptyPage)
        .mockRejectedValueOnce(new Error('Internal SQL: confidential'))
        .mockResolvedValueOnce(anotherPage),
      loadProductionOrder: vi.fn(),
    }
    const states: KitchenQueueSyncState[] = []
    const sync = createKitchenQueueSynchronizer({ queryGateway, realtimeGateway: realtime.gateway, debounceMs: 0 })
    const stop = sync.start((state) => states.push(state))
    realtime.emitStatus('connected')
    await flushPromises()
    sync.refresh()
    await flushPromises()
    expect(states.at(-1)).toMatchObject({ page: emptyPage, stale: true, loading: false })
    expect(states.at(-1)?.error).not.toContain('confidential')
    sync.refresh()
    await flushPromises()
    expect(states.at(-1)).toMatchObject({ page: anotherPage, stale: false, error: null })
    stop()
  })

  it('rejects duplicate starts, cleans timer on stop, and passes filters on authoritative reads', async () => {
    vi.useFakeTimers()
    const realtime = createFakeKitchenProductionRealtimeGateway()
    const queryGateway: KitchenOrderQueryGateway = {
      loadProductionQueue: vi.fn().mockResolvedValue(emptyPage),
      loadProductionOrder: vi.fn(),
    }
    const sync = createKitchenQueueSynchronizer({
      queryGateway, realtimeGateway: realtime.gateway,
      filters: { statuses: ['READY'], pageSize: 5 }, debounceMs: 40,
    })
    const stop = sync.start(() => undefined)
    expect(() => sync.start(() => undefined)).toThrow()
    realtime.emitStatus('connected')
    await flushPromises()
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledWith({ statuses: ['READY'], pageSize: 5 })
    realtime.emitInvalidation()
    stop()
    await vi.advanceTimersByTimeAsync(100)
    expect(queryGateway.loadProductionQueue).toHaveBeenCalledTimes(1)
  })
})
