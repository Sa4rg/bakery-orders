import type {
  KitchenOrderPage,
  KitchenOrderQueryFilters,
  KitchenOrderQueryGateway,
} from './kitchenOrderQueryGateway'
import type {
  KitchenProductionRealtimeGateway,
  KitchenRealtimeConnectionStatus,
} from './kitchenProductionRealtimeGateway'

/** Each update is a fresh immutable snapshot, never a Realtime row payload. */
export interface KitchenQueueSyncState {
  readonly connection: KitchenRealtimeConnectionStatus
  readonly page: KitchenOrderPage | null
  readonly loading: boolean
  /** True until a successful authoritative read in a connected session. */
  readonly stale: boolean
  /** Safe user-facing failure, without SQL or socket internals. */
  readonly error: string | null
}

export interface KitchenQueueSynchronizer {
  /** Subscribe with a KITCHEN-authorized actor; stop on logout/unmount. */
  start(onStateChange: (state: KitchenQueueSyncState) => void): () => void
  /** Manual retry, even if Realtime is temporarily disconnected. */
  refresh(): void
}

export interface KitchenQueueSynchronizationOptions {
  readonly queryGateway: KitchenOrderQueryGateway
  readonly realtimeGateway: KitchenProductionRealtimeGateway
  /** Recreate synchronization for a different filter set. */
  readonly filters?: KitchenOrderQueryFilters
  /** Groups bursts of INSERT/UPDATE signals into one authoritative refetch. */
  readonly debounceMs?: number
}

interface ActiveSession {
  active: boolean
  dirty: boolean
  inFlight: boolean
  timer: ReturnType<typeof setTimeout> | null
  state: KitchenQueueSyncState
  notify: (state: KitchenQueueSyncState) => void
  dispose: () => void
  runRead: () => Promise<void>
  request: (immediate: boolean) => void
}

const readFailure = 'Unable to refresh Kitchen production orders.'

/**
 * Bridges volatile Realtime notifications to the M4-001 authoritative read model.
 * No React state, business mutations, or Realtime row payloads here.
 */
export function createKitchenQueueSynchronizer({
  queryGateway,
  realtimeGateway,
  filters,
  debounceMs = 40,
}: KitchenQueueSynchronizationOptions): KitchenQueueSynchronizer {
  if (!Number.isInteger(debounceMs) || debounceMs < 0 || debounceMs > 1000) {
    throw new Error('Invalid Kitchen synchronization debounce interval.')
  }

  let current: ActiveSession | null = null

  return {
    start(onStateChange) {
      if (current?.active) {
        throw new Error('Kitchen production synchronization is already running.')
      }

      const session: ActiveSession = {
        active: true,
        dirty: false,
        inFlight: false,
        timer: null,
        state: {
          connection: 'connecting', page: null,
          loading: false, stale: true, error: null,
        },
        notify: onStateChange,
        dispose: () => undefined,
        runRead: async () => undefined,
        request: () => undefined,
      }
      current = session
      const emit = () => {
        if (session.active && current === session) session.notify(session.state)
      }
      const clearScheduled = () => {
        if (session.timer !== null) {
          clearTimeout(session.timer)
          session.timer = null
        }
      }

      session.runRead = async () => {
        if (!session.active || session.inFlight || !session.dirty) return
        session.dirty = false
        session.inFlight = true
        session.state = { ...session.state, loading: true, stale: true, error: null }
        emit()
        try {
          const page = await queryGateway.loadProductionQueue(filters)
          if (!session.active || current !== session) return
          session.state = {
            ...session.state,
            page,
            loading: false,
            stale: session.state.connection !== 'connected' || session.dirty,
            error: null,
          }
          emit()
        } catch {
          if (!session.active || current !== session) return
          session.state = { ...session.state, loading: false, stale: true, error: readFailure }
          emit()
        } finally {
          session.inFlight = false
          if (session.active && current === session && session.dirty
            && session.state.connection === 'connected') {
            session.request(false)
          }
        }
      }

      session.request = (immediate) => {
        if (!session.active || current !== session) return
        session.dirty = true
        if (!session.state.stale) {
          session.state = { ...session.state, stale: true }
          emit()
        }
        if (session.inFlight) return
        clearScheduled()
        if (immediate) {
          void session.runRead()
        } else {
          session.timer = setTimeout(() => {
            session.timer = null
            void session.runRead()
          }, debounceMs)
        }
      }

      emit()
      let unsubscribe: () => void
      try {
        unsubscribe = realtimeGateway.subscribe({
          onInvalidation() {
            if (session.state.connection === 'connected') {
              session.request(false)
            }
            // A reconnecting/disconnected channel will refetch on SUBSCRIBED.
          },
          onConnectionStatusChange(status) {
            if (!session.active || current !== session) return
            const changed = status !== session.state.connection
            session.state = {
              ...session.state,
              connection: status,
              stale: status !== 'connected' || session.state.stale,
            }
            if (status !== 'connected') clearScheduled()
            if (changed) emit()
            if (status === 'connected' && changed) session.request(true)
          },
        })
      } catch {
        session.state = {
          ...session.state, connection: 'disconnected', stale: true,
          error: 'Unable to start Kitchen synchronization.',
        }
        emit()
        unsubscribe = () => undefined
      }
      session.dispose = unsubscribe

      return () => {
        if (!session.active) return
        session.active = false
        clearScheduled()
        session.dispose()
        // Drop potentially sensitive data and invalidate in-flight results.
        session.state = { ...session.state, page: null, stale: true, loading: false }
        if (current === session) current = null
      }
    },

    refresh() {
      current?.request(true)
    },
  }
}
