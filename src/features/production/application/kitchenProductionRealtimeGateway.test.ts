import { describe, expect, it } from 'vitest'
import { createFakeKitchenProductionRealtimeGateway } from '../testing/createFakeKitchenProductionRealtimeGateway'

describe('KitchenProductionRealtimeGateway contract (M4-002B)', () => {
  it('delivers invalidation signals and connection states without row payloads', () => {
    const fake = createFakeKitchenProductionRealtimeGateway()
    const seen: string[] = []
    const unsubscribe = fake.gateway.subscribe({
      onInvalidation: () => seen.push('invalidate'),
      onConnectionStatusChange: (status) => seen.push(status),
    })
    fake.emitStatus('connecting')
    fake.emitStatus('connected')
    fake.emitInvalidation()
    fake.emitStatus('disconnected')
    expect(seen).toEqual(['connecting', 'connected', 'invalidate', 'disconnected'])
    unsubscribe()
    unsubscribe()
    fake.emitInvalidation()
    expect(seen).toHaveLength(4)
    expect(fake.listenerCount).toBe(0)
    expect(fake.cleanupCount).toBe(1)
  })

  it('allows independent listeners and cleans them up individually', () => {
    const fake = createFakeKitchenProductionRealtimeGateway()
    let first = 0
    let second = 0
    const unsubFirst = fake.gateway.subscribe({
      onInvalidation: () => { first += 1 },
      onConnectionStatusChange: () => undefined,
    })
    const unsubSecond = fake.gateway.subscribe({
      onInvalidation: () => { second += 1 },
      onConnectionStatusChange: () => undefined,
    })
    unsubFirst()
    fake.emitInvalidation()
    expect([first, second]).toEqual([0, 1])
    unsubSecond()
    expect(fake.listenerCount).toBe(0)
  })
})
