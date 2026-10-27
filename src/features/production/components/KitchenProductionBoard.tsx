import { useEffect, useRef, useState } from 'react'
import './kitchenProductionBoard.css'
import type { FormEvent } from 'react'
import type {
  KitchenOrderQueryFilters,
  KitchenOrderQueryGateway,
} from '../application/kitchenOrderQueryGateway'
import type { KitchenProductionCommandGateway } from '../application/kitchenProductionCommandGateway'
import type {
  KitchenQueueSynchronizer,
  KitchenQueueSyncState,
} from '../application/kitchenQueueSynchronization'
import type {
  KitchenProductionItem,
  KitchenProductionOrder,
} from '../domain/kitchenProductionOrder'
import {
  formatKitchenQuantity,
  parseKitchenQuantityDelta,
} from '../domain/kitchenProductionInput'

export interface KitchenProductionBoardProps {
  createKitchenQueueSynchronizer(filters?: KitchenOrderQueryFilters): KitchenQueueSynchronizer
  commandGateway: KitchenProductionCommandGateway
  queryGateway: Pick<KitchenOrderQueryGateway, 'loadProductionOrder'>
}

const initialQueueState: KitchenQueueSyncState = {
  connection: 'connecting',
  page: null,
  loading: false,
  stale: true,
  error: null,
}

type StatusFilter = 'ALL_ACTIVE' | 'RECEIVED' | 'IN_PROGRESS'

interface QueuePageProps extends KitchenProductionBoardProps {
  statusFilter: StatusFilter
  onBusyChange(busy: boolean): void
  cursor: string | null
  canGoBack: boolean
  onBack(): void
  onNext(cursor: string): void
}

type Operation =
  | { readonly type: 'start'; readonly orderId: string }
  | { readonly type: 'prepared'; readonly itemId: string; readonly thousandths: number }
  | { readonly type: 'unavailable'; readonly itemId: string; readonly thousandths: number; readonly reason: string }

type Feedback = { readonly failed: boolean; readonly text: string } | null

/**
 * A cursor has exactly one Realtime session. Navigating or unmounting stops
 * the old listener; all displayed snapshots come from the query gateway.
 */
function KitchenQueuePage({
  cursor,
  canGoBack,
  onBack,
  onNext,
  createKitchenQueueSynchronizer,
  commandGateway,
  queryGateway,
  statusFilter,
  onBusyChange,
}: QueuePageProps) {
  const [queue, setQueue] = useState<KitchenQueueSyncState>(initialQueueState)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailRevision, setDetailRevision] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const syncRef = useRef<KitchenQueueSynchronizer | null>(null)
  const busyRef = useRef(false)
  const activeRef = useRef(false)

  useEffect(() => {
    activeRef.current = true
    const sync = createKitchenQueueSynchronizer({
      statuses: statusFilter === 'ALL_ACTIVE' ? ['RECEIVED', 'IN_PROGRESS'] : [statusFilter],
      pageSize: 25,
      cursor,
    })
    syncRef.current = sync
    const stop = sync.start(setQueue)

    return () => {
      activeRef.current = false
      syncRef.current = null
      stop()
    }
  }, [cursor, createKitchenQueueSynchronizer, statusFilter])

  async function execute(operation: Operation): Promise<boolean> {
    if (busyRef.current) return false
    // A Realtime invalidation may arrive between rendering an enabled button
    // and the form submit. Never silently discard that user action.
    if (queue.stale || queue.loading || queue.connection !== 'connected' || queue.error !== null) {
      if (activeRef.current) {
        setFeedback({
          failed: true,
          text: 'Production data changed before this command could be sent. No mutation was submitted. Wait for a fresh queue and submit again.',
        })
      }
      return false
    }
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setFeedback(null)
    let succeeded = false
    try {
      switch (operation.type) {
        case 'start':
          await commandGateway.startOrder(operation.orderId)
          break
        case 'prepared':
          await commandGateway.recordPreparedQuantity(operation.itemId, operation.thousandths)
          break
        case 'unavailable':
          await commandGateway.recordUnavailableQuantity(
            operation.itemId, operation.thousandths, operation.reason,
          )
          break
      }
      succeeded = true
      if (activeRef.current) {
        setFeedback({ failed: false, text: 'Change saved. Refreshing production data.' })
      }
    } catch {
      if (activeRef.current) {
        setFeedback({
          failed: true,
          text: 'Could not confirm the operation. Refresh the queue and verify quantities before attempting it again.',
        })
      }
    } finally {
      // Even after a rejected/uncertain response, re-read server truth before
      // enabling another incremental command. Never retry an RPC automatically.
      if (activeRef.current) {
        syncRef.current?.refresh()
        setDetailRevision((current) => current + 1)
        setBusy(false)
        onBusyChange(false)
      }
      busyRef.current = false
    }
    return succeeded
  }

  const canMutate = !busy && !queue.stale && !queue.loading
    && queue.connection === 'connected' && queue.error === null

  return (
    <div className="kitchen-production__queue">
      <p role="status" aria-live="polite">
        Realtime: {queue.connection}. {queue.stale ? 'Queue awaiting an authoritative refresh.' : 'Queue up to date.'}
      </p>
      {busy && <p role="status">Saving production change…</p>}
      {queue.loading && <p role="status">Refreshing production orders…</p>}
      {queue.error && <p role="alert">{queue.error}</p>}
      {feedback && (
        <p role={feedback.failed ? 'alert' : 'status'}>{feedback.text}</p>
      )}
      <button type="button" onClick={() => syncRef.current?.refresh()} disabled={busy || queue.loading}>
        Refresh production queue
      </button>
      {queue.error && <p>Retry refreshes a read only. It does not repeat any quantity command.</p>}

      {queue.page === null && !queue.error && <p>Connecting to production queue…</p>}
      {selectedId !== null ? (
        <>
          <button type="button" disabled={busy} onClick={() => setSelectedId(null)}>
            Back to production queue
          </button>
          <KitchenSelectedOrder
            key={selectedId}
            orderId={selectedId}
            queryGateway={queryGateway}
            refreshToken={detailRevision}
            queuePage={queue.page}
            canMutate={canMutate}
            onCommand={execute}
          />
        </>
      ) : (
        <>
          {queue.page && queue.page.orders.length === 0 && !queue.loading && !queue.stale && (
            <p>No production orders match this filter.</p>
          )}
          {queue.page && (
            <ol className="kitchen-production__orders" aria-label="Production orders">
              {queue.page.orders.map((order) => (
                <li key={order.id}>
                  <button type="button" disabled={busy} onClick={() => setSelectedId(order.id)}>
                    View details for order #{order.orderNumber}
                  </button>
                  <KitchenOrderCard order={order} canMutate={canMutate}
                    onCommand={execute} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {selectedId === null && <nav aria-label="Production pages">
        <button type="button" disabled={!canGoBack || busy} onClick={onBack}>Previous page</button>
        <button type="button"
          disabled={!queue.page?.nextCursor || queue.stale || busy}
          onClick={() => {
            if (queue.page?.nextCursor) onNext(queue.page.nextCursor)
          }}>
          Next page
        </button>
      </nav>}
    </div>
  )
}

interface SelectedOrderProps {
  orderId: string
  queryGateway: Pick<KitchenOrderQueryGateway, 'loadProductionOrder'>
  refreshToken: number
  queuePage: KitchenQueueSyncState['page']
  canMutate: boolean
  onCommand(operation: Operation): Promise<boolean>
}

/** The single-order view always comes from the authorized query gateway. */
function KitchenSelectedOrder({
  orderId,
  queryGateway,
  refreshToken,
  queuePage,
  canMutate,
  onCommand,
}: SelectedOrderProps) {
  type DetailState =
    | { kind: 'loading' }
    | { kind: 'missing' }
    | { kind: 'error' }
    | { kind: 'loaded'; order: KitchenProductionOrder }
  const [retryKey, setRetryKey] = useState(0)
  const requestKey = `${orderId}:${refreshToken}:${retryKey}`
  const [result, setResult] = useState<{
    requestKey: string
    page: KitchenQueueSyncState['page']
    state: DetailState
  } | null>(null)
  const detailIsCurrent = result?.requestKey === requestKey && result.page === queuePage
  // Keep the last authorized detail mounted while a Realtime refresh or a
  // post-command read is pending. Unmounting it discards the operator's
  // unsent inputs; stale values must remain read-only until refreshed.
  const state: DetailState = detailIsCurrent
    ? result.state
    : result?.state.kind === 'loaded' ? result.state : { kind: 'loading' }

  useEffect(() => {
    let active = true
    void queryGateway.loadProductionOrder(orderId).then(
      (order) => {
        if (!active) return
        setResult({
          requestKey,
          page: queuePage,
          state: order === null ? { kind: 'missing' } : { kind: 'loaded', order },
        })
      },
      () => {
        if (active) setResult({ requestKey, page: queuePage, state: { kind: 'error' } })
      },
    )
    // Ignore responses from an obsolete selection, filter or refresh.
    return () => { active = false }
  }, [orderId, queryGateway, requestKey, queuePage])

  return (
    <section aria-label="Selected production order" className="kitchen-production__detail">
      <h3>Order detail</h3>
      {state.kind === 'loading' && <p role="status">Loading production order detail…</p>}
      {!detailIsCurrent && state.kind === 'loaded' && (
        <p role="status">Refreshing production order detail…</p>
      )}
      {state.kind === 'missing' && <p role="alert">Order is unavailable or no longer accessible.</p>}
      {state.kind === 'error' && (
        <>
          <p role="alert">Unable to load production order detail.</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)}>
            Retry order detail
          </button>
        </>
      )}
      {state.kind === 'loaded' && (
        <KitchenOrderCard order={state.order} canMutate={canMutate && detailIsCurrent}
          onCommand={onCommand} />
      )}
    </section>
  )
}

interface OrderCardProps {
  order: KitchenProductionOrder
  canMutate: boolean
  onCommand(operation: Operation): Promise<boolean>
}

function KitchenOrderCard({ order, canMutate, onCommand }: OrderCardProps) {
  const inProgress = order.status === 'IN_PROGRESS'
  return (
    <article className="kitchen-production__order" aria-label={`Production order ${order.orderNumber} for ${order.businessName}`}>
      <h3>Order #{order.orderNumber} — {order.businessName}</h3>
      <dl>
        <dt>Status</dt><dd>{order.status}</dd>
        <dt>Requested delivery</dt><dd>{new Date(order.requestedDeliveryAt).toLocaleString()}</dd>
      </dl>
      {order.customerNotes && <p>Customer notes: {order.customerNotes}</p>}
      {order.status === 'RECEIVED' && (
        <button type="button" disabled={!canMutate}
          onClick={() => void onCommand({ type: 'start', orderId: order.id })}>
          Start order #{order.orderNumber}
        </button>
      )}
      <ul aria-label={`Items for order ${order.orderNumber}`}>
        {order.items.map((item) => (
          <li key={item.id}>
            <KitchenItemCard
              item={item}
              canMutate={canMutate && inProgress}
              inProgress={inProgress}
              onCommand={onCommand}
            />
          </li>
        ))}
      </ul>
    </article>
  )
}

interface ItemCardProps {
  item: KitchenProductionItem
  canMutate: boolean
  inProgress: boolean
  onCommand(operation: Operation): Promise<boolean>
}

function KitchenItemCard({ item, canMutate, inProgress, onCommand }: ItemCardProps) {
  const [preparedInput, setPreparedInput] = useState('')
  const [unavailableInput, setUnavailableInput] = useState('')
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const mayRecord = canMutate && item.remainingThousandths > 0

  async function submit(event: FormEvent<HTMLFormElement>, type: 'prepared' | 'unavailable') {
    event.preventDefault()
    if (!mayRecord) {
      if (!canMutate) {
        setValidation('Production data is not up to date. No command was sent. Wait for a fresh queue before submitting again.')
      }
      return
    }
    const result = parseKitchenQuantityDelta(
      type === 'prepared' ? preparedInput : unavailableInput, item,
    )
    if (!result.ok) {
      setValidation(result.message)
      return
    }
    const trimmedReason = reason.trim()
    if (type === 'unavailable' && trimmedReason.length === 0) {
      setValidation('A reason is required for unavailable quantity.')
      return
    }
    setValidation(null)
    const saved = await onCommand(
      type === 'prepared'
        ? { type, itemId: item.id, thousandths: result.thousandths }
        : { type, itemId: item.id, thousandths: result.thousandths, reason: trimmedReason },
    )
    if (saved) {
      if (type === 'prepared') setPreparedInput('')
      else {
        setUnavailableInput('')
        setReason('')
      }
    }
  }

  return (
    <article className="kitchen-production__item" aria-label={`Production item: ${item.productName}`}>
      <h4>{item.productName}</h4>
      <dl>
        <dt>Unit</dt><dd>{item.unitCode}</dd>
        <dt>Requested</dt><dd>{formatKitchenQuantity(item.requestedThousandths)}</dd>
        <dt>Prepared</dt><dd>{formatKitchenQuantity(item.preparedThousandths)}</dd>
        <dt>Unavailable</dt><dd>{formatKitchenQuantity(item.unavailableThousandths)}</dd>
        <dt>Remaining</dt><dd>{formatKitchenQuantity(item.remainingThousandths)}</dd>
        <dt>Quantity step</dt><dd>{formatKitchenQuantity(item.quantityStepThousandths)}</dd>
      </dl>
      {inProgress && item.remainingThousandths === 0 && <p>Line fully resolved.</p>}
      {inProgress && item.remainingThousandths > 0 && (
        <>
          <form onSubmit={(event) => void submit(event, 'prepared')}>
            <label htmlFor={`prepared-${item.id}`}>Prepare more {item.productName}</label>
            <input id={`prepared-${item.id}`} type="text" inputMode="decimal"
              value={preparedInput} onChange={(event) => setPreparedInput(event.target.value)}
              disabled={!mayRecord} />
            <button type="submit" disabled={!mayRecord}>Record prepared</button>
          </form>
          <form onSubmit={(event) => void submit(event, 'unavailable')}>
            <label htmlFor={`unavailable-${item.id}`}>Unavailable amount for {item.productName}</label>
            <input id={`unavailable-${item.id}`} type="text" inputMode="decimal"
              value={unavailableInput} onChange={(event) => setUnavailableInput(event.target.value)}
              disabled={!mayRecord} />
            <label htmlFor={`reason-${item.id}`}>Reason for {item.productName}</label>
            <textarea id={`reason-${item.id}`} value={reason}
              onChange={(event) => setReason(event.target.value)} disabled={!mayRecord} />
            <button type="submit" disabled={!mayRecord}>Record unavailable</button>
          </form>
          {validation && <p role="alert">{validation}</p>}
        </>
      )}
    </article>
  )
}

/** M4-006: KITCHEN-only composition; authorization still lives in RLS/RPC. */
export function KitchenProductionBoard(props: KitchenProductionBoardProps) {
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL_ACTIVE')
  const [pending, setPending] = useState(false)
  const cursor = cursors[cursors.length - 1] ?? null
  return (
    <section className="kitchen-production" aria-labelledby="kitchen-production-heading">
      <h2 id="kitchen-production-heading">Kitchen production</h2>
      <p>Changes are recorded as increments. A failed or uncertain command must be checked before retrying.</p>
      <label htmlFor="production-status-filter">Production status filter</label>
      <select
        id="production-status-filter"
        value={statusFilter}
        disabled={pending}
        onChange={(event) => {
          setStatusFilter(event.target.value as StatusFilter)
          setCursors([null])
        }}
      >
        <option value="ALL_ACTIVE">All active</option>
        <option value="RECEIVED">Received</option>
        <option value="IN_PROGRESS">In progress</option>
      </select>
      <KitchenQueuePage
        key={`${statusFilter}:${cursor ?? 'first'}`}
        cursor={cursor}
        statusFilter={statusFilter}
        onBusyChange={setPending}
        canGoBack={cursors.length > 1}
        onBack={() => setCursors((current) => current.slice(0, -1))}
        onNext={(nextCursor) => setCursors((current) => [...current, nextCursor])}
        {...props}
      />
    </section>
  )
}
