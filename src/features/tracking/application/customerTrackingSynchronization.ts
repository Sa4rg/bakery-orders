import type {
  CustomerTrackingRealtimeGateway,
  CustomerTrackingConnectionStatus,
} from './customerTrackingRealtimeGateway'

export interface CustomerTrackingSyncState {
  readonly connection: CustomerTrackingConnectionStatus
  /** Incremented for each authoritative refetch request; never derived from a row payload. */
  readonly revision: number
}

export interface CustomerTrackingSynchronizer {
  start(onState: (state: CustomerTrackingSyncState) => void): () => void
  /** Read-only user action; does not re-issue mutations. */
  refresh(): void
}

interface TrackingSyncOptions {
  readonly realtimeGateway: CustomerTrackingRealtimeGateway
  readonly businessId: string
  readonly orderId?: string
  readonly debounceMs?: number
}

/**
 * The UI already owns authoritative queries (M5-001/002). This controller
 * controls only when to re-run them. Any event missed during a disconnect is
 * recovered by an unconditional refetch when SUBSCRIBED occurs again.
 */
export function createCustomerTrackingSynchronizer({
  realtimeGateway, businessId, orderId, debounceMs = 40,
}: TrackingSyncOptions): CustomerTrackingSynchronizer {
  if (!Number.isInteger(debounceMs) || debounceMs < 0 || debounceMs > 1000) {
    throw new Error('Invalid customer synchronization debounce.')
  }

  let current: {
    active: boolean
    state: CustomerTrackingSyncState
    timer: ReturnType<typeof setTimeout> | null
    notify: (state: CustomerTrackingSyncState) => void
    stopTransport: () => void
  } | null = null

  return {
    start(onState) {
      if (current?.active) throw new Error('Customer synchronization is already running.')
      const session: NonNullable<typeof current> = {
        active: true,
        state: { connection: 'connecting', revision: 0 } as CustomerTrackingSyncState,
        timer: null as ReturnType<typeof setTimeout> | null,
        notify: onState,
        stopTransport: () => undefined,
      }
      current = session
      const clear = () => {
        if (session.timer !== null) clearTimeout(session.timer)
        session.timer = null
      }
      const emit = () => {
        if (session.active && current === session) session.notify(session.state)
      }
      const request = (immediate: boolean) => {
        if (!session.active || current !== session) return
        clear()
        const publish = () => {
          if (!session.active || current !== session) return
          session.state = { ...session.state, revision: session.state.revision + 1 }
          emit()
        }
        if (immediate) publish()
        else session.timer = setTimeout(() => {
          session.timer = null
          publish()
        }, debounceMs)
      }

      emit()
      try {
        session.stopTransport = realtimeGateway.subscribe({ businessId, ...(orderId ? { orderId } : {}) }, {
          onInvalidation() {
            if (session.state.connection === 'connected') request(false)
            // While disconnected, rely on unconditional refetch on SUBSCRIBED.
          },
          onConnectionStatusChange(connection) {
            if (!session.active || current !== session) return
            const changed = connection !== session.state.connection
            session.state = { ...session.state, connection }
            if (connection !== 'connected') clear()
            if (changed) emit()
            if (connection === 'connected' && changed) request(true)
          },
        })
      } catch {
        session.state = { ...session.state, connection: 'disconnected' }
        emit()
      }
      return () => {
        if (!session.active) return
        session.active = false
        clear()
        session.stopTransport()
        if (current === session) current = null
      }
    },
    refresh() {
      const session = current
      if (!session?.active) return
      // A manual refresh also invalidates the in-flight prior read.
      if (session.timer !== null) clearTimeout(session.timer)
      session.timer = null
      session.state = { ...session.state, revision: session.state.revision + 1 }
      session.notify(session.state)
    },
  }
}
