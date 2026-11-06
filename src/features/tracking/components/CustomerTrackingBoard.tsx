import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CustomerTrackingQueryGateway, CustomerTrackingPage } from '../application/customerTrackingQueryGateway'
import type { CustomerReceiptGateway } from '../application/customerReceiptGateway'
import type {
  CustomerShortageReasonsGateway, CustomerShortageReason,
} from '../application/customerShortageReasonsGateway'
import type { CustomerTrackedOrder, CustomerTrackedItem } from '../domain/customerTrackedOrder'
import { formatQuantityThousandths } from '../../../shared/domain/quantityThousandths'
import type { CustomerTrackingRealtimeGateway, CustomerTrackingConnectionStatus } from '../application/customerTrackingRealtimeGateway'
import { createCustomerTrackingSynchronizer, type CustomerTrackingSynchronizer } from '../application/customerTrackingSynchronization'
import './customerTrackingBoard.css'

interface CustomerTrackingBoardProps {
  queryGateway: CustomerTrackingQueryGateway
  shortageGateway: CustomerShortageReasonsGateway
  realtimeGateway: CustomerTrackingRealtimeGateway
  receiptGateway: CustomerReceiptGateway
  businessId: string
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly page: CustomerTrackingPage }

type DetailState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'ready'
      readonly order: CustomerTrackedOrder
      readonly reasons: readonly CustomerShortageReason[]
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAGE_SIZE = 25

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

function CustomerOrderItemDetail({
  item, reasons,
}: {
  item: CustomerTrackedItem
  reasons: readonly CustomerShortageReason[]
}) {
  const itemReasons = reasons.filter((entry) => entry.orderItemId === item.id)
  return (
    <li>
      <article aria-label={`Tracked item: ${item.productName}`} className="customer-tracking__item">
        <h4>{item.productName}</h4>
        <dl>
          <dt>Unit</dt><dd>{item.unitCode}</dd>
          <dt>Requested</dt><dd>{formatQuantityThousandths(item.requestedThousandths)}</dd>
          <dt>Prepared</dt><dd>{formatQuantityThousandths(item.preparedThousandths)}</dd>
          <dt>Unavailable</dt><dd>{formatQuantityThousandths(item.unavailableThousandths)}</dd>
          <dt>Remaining</dt><dd>{formatQuantityThousandths(item.remainingThousandths)}</dd>
        </dl>
        {item.unavailableThousandths > 0 && (
          <section aria-label={`Shortage reasons for ${item.productName}`}>
            <h5>Unavailable quantity reasons</h5>
            {itemReasons.length === 0 ? (
              <p role="status">No historical shortage reason was returned for this item.</p>
            ) : (
              <ul>
                {itemReasons.map((entry, index) => (
                  <li key={`${entry.occurredAt}:${index}`}>
                    <span>{entry.reason}</span>{' '}
                    <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </article>
    </li>
  )
}

function CustomerTrackingDetail({
  orderId, realtimeRevision, queryGateway, shortageGateway, receiptGateway,
  onReceiptAttempt, onBack,
}: {
  orderId: string
  realtimeRevision: number
  queryGateway: CustomerTrackingQueryGateway
  shortageGateway: CustomerShortageReasonsGateway
  receiptGateway: CustomerReceiptGateway
  onReceiptAttempt(): void
  onBack(): void
}) {
  const [revision, setRevision] = useState(0)
  const [response, setResponse] = useState<{ key: string; state: DetailState } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [receiptBusy, setReceiptBusy] = useState(false)
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null)
  const receiptInFlight = useRef(false)
  const receiptNeedsVerification = useRef(false)
  const activeRef = useRef(true)
  const requestKey = `${orderId}:${revision}:${realtimeRevision}`
  const state: DetailState = response?.key === requestKey ? response.state : { kind: 'loading' }

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => {
    let active = true
    const verified = (order: CustomerTrackedOrder | null) => {
      if (!receiptNeedsVerification.current) return
      receiptNeedsVerification.current = false
      receiptInFlight.current = false
      setReceiptBusy(false)
      setReceiptFeedback(order?.status === 'DELIVERED'
        ? 'Receipt confirmed and saved.'
        : 'Receipt is not confirmed. Review the saved Order before deciding whether to try again.')
    }
    void (async () => {
      const order = await queryGateway.loadOrder(orderId)
      if (!active) return
      if (order === null) {
        setResponse({ key: requestKey, state: { kind: 'missing' } })
        verified(null)
        return
      }
      const hasShortages = order.items.some((item) => item.unavailableThousandths > 0)
      const reasons = hasShortages ? await shortageGateway.loadReasons(orderId) : []
      if (!active) return
      const itemIds = new Set(order.items.map((item) => item.id))
      if (reasons.some((reason) => !itemIds.has(reason.orderItemId))) {
        throw new Error('Projected shortage reason does not belong to an OrderItem.')
      }
      setResponse({ key: requestKey, state: { kind: 'ready', order, reasons } })
      verified(order)
    })().catch(() => {
      if (!active) return
      setResponse({ key: requestKey, state: { kind: 'error' } })
      if (receiptNeedsVerification.current) {
        receiptNeedsVerification.current = false
        receiptInFlight.current = false
        setReceiptBusy(false)
        setReceiptFeedback('Unable to verify receipt. Refresh the Order to check its saved status.')
      }
    })
    return () => { active = false }
  }, [orderId, queryGateway, shortageGateway, requestKey])

  async function confirmReceipt() {
    if (receiptInFlight.current || state.kind !== 'ready' || state.order.status !== 'DISPATCHED') return
    receiptInFlight.current = true
    setReceiptBusy(true)
    setConfirmOpen(false)
    setReceiptFeedback(null)
    try {
      await receiptGateway.confirmReceipt(orderId)
    } catch {
      // A transport error does NOT prove the SQL transaction was rolled back.
      // Never automatically repeat the trusted command.
    } finally {
      if (activeRef.current) {
        receiptNeedsVerification.current = true
        setRevision((value) => value + 1)
        onReceiptAttempt()
      }
    }
  }

  return (
    <section aria-label="Selected customer order" className="customer-tracking__detail">
      <button type="button" onClick={onBack}>Back to active orders</button>
      <button type="button" onClick={() => {
        setRevision((value) => value + 1)
      }}>
        Refresh order details
      </button>
      {receiptBusy && <p role="status">Checking persisted receipt status…</p>}
      {receiptFeedback && <p role={receiptFeedback.startsWith('Receipt confirmed') ? 'status' : 'alert'}>{receiptFeedback}</p>}
      {state.kind === 'loading' && <p role="status">Loading tracked order…</p>}
      {state.kind === 'error' && <p role="alert">Unable to load tracked order. Retry the read.</p>}
      {state.kind === 'missing' && <p role="status">Order not found or access denied.</p>}
      {state.kind === 'ready' && (
        <article aria-label={`Tracked order #${state.order.orderNumber}`}>
          <h3>Order #{state.order.orderNumber}</h3>
          <dl>
            <dt>Status</dt><dd>{state.order.status}</dd>
            <dt>Requested delivery</dt><dd>{formatTimestamp(state.order.requestedDeliveryAt)}</dd>
            <dt>Created</dt><dd>{formatTimestamp(state.order.createdAt)}</dd>
          </dl>
          {state.order.customerNotes && <p>Customer notes: {state.order.customerNotes}</p>}
          {state.order.status === 'DISPATCHED' && (
            <section aria-label={`Receipt confirmation for order #${state.order.orderNumber}`}>
              {!confirmOpen && (
                <button type="button" disabled={receiptBusy} onClick={() => setConfirmOpen(true)}>
                  Confirm receipt for order #{state.order.orderNumber}
                </button>
              )}
              {confirmOpen && !receiptBusy && (
                <>
                  <p>Confirm that your establishment physically received this dispatched Order.</p>
                  <button type="button" onClick={() => void confirmReceipt()}>
                    Yes, received order #{state.order.orderNumber}
                  </button>
                  <button type="button" onClick={() => setConfirmOpen(false)}>
                    Cancel receipt confirmation
                  </button>
                </>
              )}
            </section>
          )}
          {state.order.status === 'DELIVERED' && (
            <p role="status">This Order has been confirmed delivered.</p>
          )}
          <ul aria-label={`Tracked items for order #${state.order.orderNumber}`}>
            {state.order.items.map((item) => (
              <CustomerOrderItemDetail key={item.id} item={item} reasons={state.reasons} />
            ))}
          </ul>
          {!state.order.items.some((item) => item.unavailableThousandths > 0) && (
            <p>No unavailable quantities recorded.</p>
          )}
        </article>
      )}
    </section>
  )
}

/** M5-003: authorized query refetch after Realtime invalidations. */
export function CustomerTrackingBoard({
  queryGateway, shortageGateway, realtimeGateway, receiptGateway, businessId,
}: CustomerTrackingBoardProps) {
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null])
  const [revision, setRevision] = useState(0)
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [orderInput, setOrderInput] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [connection, setConnection] = useState<CustomerTrackingConnectionStatus>('connecting')
  const synchronizerRef = useRef<CustomerTrackingSynchronizer | null>(null)

  const cursor = cursors[cursors.length - 1] ?? null

  // A distinct subscription is installed for each selected Order. The Orders
  // stream is Business-scoped, while item changes are Order-scoped and RLS-checked.
  useEffect(() => {
    const synchronizer = createCustomerTrackingSynchronizer({
      realtimeGateway, businessId, ...(selectedId ? { orderId: selectedId } : {}),
    })
    synchronizerRef.current = synchronizer
    let lastRevision = 0
    const stop = synchronizer.start((next) => {
      setConnection(next.connection)
      if (next.revision > lastRevision) {
        lastRevision = next.revision
        setPageState({ kind: 'loading' })
        setCursors([null])
        setRevision((value) => value + 1)
      }
    })
    return () => {
      if (synchronizerRef.current === synchronizer) synchronizerRef.current = null
      stop()
    }
  }, [realtimeGateway, businessId, selectedId])

  useEffect(() => {
    let active = true
    void queryGateway.loadActiveOrders({ cursor, pageSize: PAGE_SIZE }).then(
      (page) => { if (active) setPageState({ kind: 'ready', page }) },
      () => { if (active) setPageState({ kind: 'error' }) },
    )
    return () => { active = false }
  }, [queryGateway, cursor, revision])

  function refresh() {
    synchronizerRef.current?.refresh()
  }

  function openOrderFromId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const candidate = orderInput.trim()
    if (!UUID.test(candidate)) {
      setLookupError('Enter a valid Order ID.')
      return
    }
    setLookupError(null)
    setSelectedId(candidate)
  }

  return (
    <section className="customer-tracking" aria-labelledby="customer-tracking-heading">
      <h2 id="customer-tracking-heading">My active orders</h2>
      <p role="status" aria-live="polite">
        Realtime: {connection}. {connection === 'connected'
          ? 'Changes trigger a fresh authorized read.'
          : 'Tracking may be outdated. You can refresh manually.'}
      </p>
      {selectedId !== null ? (
        <CustomerTrackingDetail
          key={selectedId}
          orderId={selectedId}
          realtimeRevision={revision}
          queryGateway={queryGateway}
          shortageGateway={shortageGateway}
          receiptGateway={receiptGateway}
          onReceiptAttempt={() => synchronizerRef.current?.refresh()}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <>
          <button type="button" onClick={refresh}>Refresh tracking</button>
          <form onSubmit={openOrderFromId}>
            <label htmlFor="customer-tracking-order-id">Find order by ID</label>
            <input id="customer-tracking-order-id" value={orderInput}
              onChange={(event) => setOrderInput(event.target.value)} />
            <button type="submit">Open tracked order</button>
          </form>
          {lookupError && <p role="alert">{lookupError}</p>}
          {pageState.kind === 'loading' && <p role="status">Loading active orders…</p>}
          {pageState.kind === 'error' && <p role="alert">Unable to load active orders. Retry the read.</p>}
          {pageState.kind === 'ready' && (
            <>
              {pageState.page.orders.length === 0 ? (
                <p>No active orders for your establishment.</p>
              ) : (
                <ol aria-label="Customer active orders" className="customer-tracking__orders">
                  {pageState.page.orders.map((order) => (
                    <li key={order.id}>
                      <article aria-label={`Active order #${order.orderNumber}`}>
                        <h3>Order #{order.orderNumber}</h3>
                        <p>Status: {order.status}</p>
                        <p>Requested delivery: {formatTimestamp(order.requestedDeliveryAt)}</p>
                        <button type="button" onClick={() => setSelectedId(order.id)}>
                          View tracking for order #{order.orderNumber}
                        </button>
                      </article>
                    </li>
                  ))}
                </ol>
              )}
              <nav aria-label="Customer tracking pages">
                <button type="button" disabled={cursors.length <= 1}
                  onClick={() => {
                    setPageState({ kind: 'loading' })
                    setCursors((current) => current.slice(0, -1))
                  }}>
                  Previous page
                </button>
                <button type="button" disabled={pageState.page.nextCursor === null}
                  onClick={() => {
                    if (pageState.page.nextCursor) {
                      const nextCursor = pageState.page.nextCursor
                      setPageState({ kind: 'loading' })
                      setCursors((current) => [...current, nextCursor])
                    }
                  }}>
                  Next page
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  )
}
