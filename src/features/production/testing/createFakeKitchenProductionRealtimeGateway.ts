import type {
  KitchenProductionRealtimeGateway,
  KitchenRealtimeConnectionStatus,
  KitchenRealtimeListener,
} from '../application/kitchenProductionRealtimeGateway'

/** In-memory test double. Never used to authorize or hydrate persisted Orders. */
export function createFakeKitchenProductionRealtimeGateway() {
  const listeners = new Set<KitchenRealtimeListener>()
  let subscriptions = 0
  let cleanups = 0

  const gateway: KitchenProductionRealtimeGateway = {
    subscribe(listener) {
      subscriptions += 1
      listeners.add(listener)
      let closed = false
      return () => {
        if (closed) return
        closed = true
        cleanups += 1
        listeners.delete(listener)
      }
    },
  }

  return {
    gateway,
    emitInvalidation() {
      for (const listener of [...listeners]) listener.onInvalidation()
    },
    emitStatus(status: KitchenRealtimeConnectionStatus) {
      for (const listener of [...listeners]) listener.onConnectionStatusChange(status)
    },
    get listenerCount() { return listeners.size },
    get subscriptionCount() { return subscriptions },
    get cleanupCount() { return cleanups },
  }
}
