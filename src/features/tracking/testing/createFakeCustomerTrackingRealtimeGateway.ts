import type { CustomerTrackingRealtimeGateway, CustomerTrackingRealtimeListener } from '../application/customerTrackingRealtimeGateway'

export function createFakeCustomerTrackingRealtimeGateway() {
  const subscribers = new Set<CustomerTrackingRealtimeListener>()
  const scopes: Array<{ businessId: string; orderId?: string }> = []
  let removed = 0
  const gateway: CustomerTrackingRealtimeGateway = {
    subscribe(scope, listener) {
      scopes.push(scope)
      subscribers.add(listener)
      let active = true
      return () => {
        if (!active) return
        active = false
        removed += 1
        subscribers.delete(listener)
      }
    },
  }
  return {
    gateway,
    scopes,
    get activeSubscriptions() { return subscribers.size },
    get cleanupCount() { return removed },
    emitInvalidation() { for (const listener of [...subscribers]) listener.onInvalidation() },
    emitStatus(status: 'connecting' | 'connected' | 'disconnected') {
      for (const listener of [...subscribers]) listener.onConnectionStatusChange(status)
    },
  }
}
