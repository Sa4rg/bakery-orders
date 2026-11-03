import { useEffect, useState, type FormEvent } from 'react'
import type { CustomerTrackingQueryGateway, CustomerTrackingPage } from '../application/customerTrackingQueryGateway'
import type {
  CustomerShortageReasonsGateway, CustomerShortageReason,
} from '../application/customerShortageReasonsGateway'
import type { CustomerTrackedOrder, CustomerTrackedItem } from '../domain/customerTrackedOrder'
import { formatQuantityThousandths } from '../../../shared/domain/quantityThousandths'
import './customerTrackingBoard.css'

interface CustomerTrackingBoardProps {
  queryGateway: CustomerTrackingQueryGateway
  shortageGateway: CustomerShortageReasonsGateway
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
  orderId, queryGateway, shortageGateway, onBack,
}: {
  orderId: string
  queryGateway: CustomerTrackingQueryGateway
  shortageGateway: CustomerShortageReasonsGateway
  onBack(): void
}) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<DetailState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    void (async () => {
      const order = await queryGateway.loadOrder(orderId)
      if (!active) return
      if (order === null) {
        setState({ kind: 'missing' })
        return
      }
      const hasShortages = order.items.some((item) => item.unavailableThousandths > 0)
      const reasons = hasShortages ? await shortageGateway.loadReasons(orderId) : []
      if (!active) return
      const itemIds = new Set(order.items.map((item) => item.id))
      if (reasons.some((reason) => !itemIds.has(reason.orderItemId))) {
        throw new Error('Projected shortage reason does not belong to an OrderItem.')
      }
      setState({ kind: 'ready', order, reasons })
    })().catch(() => {
      if (active) setState({ kind: 'error' })
    })
    return () => { active = false }
  }, [orderId, queryGateway, shortageGateway, revision])

  return (
    <section aria-label="Selected customer order" className="customer-tracking__detail">
      <button type="button" onClick={onBack}>Back to active orders</button>
      <button type="button" onClick={() => {
        setState({ kind: 'loading' })
        setRevision((value) => value + 1)
      }}>
        Refresh order details
      </button>
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

/** M5-002: manual, persisted CUSTOMER tracking. Realtime is introduced in M5-003. */
export function CustomerTrackingBoard({ queryGateway, shortageGateway }: CustomerTrackingBoardProps) {
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null])
  const [revision, setRevision] = useState(0)
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [orderInput, setOrderInput] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const cursor = cursors[cursors.length - 1] ?? null

  useEffect(() => {
    let active = true
    void queryGateway.loadActiveOrders({ cursor, pageSize: PAGE_SIZE }).then(
      (page) => { if (active) setPageState({ kind: 'ready', page }) },
      () => { if (active) setPageState({ kind: 'error' }) },
    )
    return () => { active = false }
  }, [queryGateway, cursor, revision])

  function refresh() {
    setPageState({ kind: 'loading' })
    setCursors([null])
    setRevision((value) => value + 1)
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
      <p>Tracking is based on saved orders. Refresh to check for changes.</p>
      {selectedId !== null ? (
        <CustomerTrackingDetail
          key={selectedId}
          orderId={selectedId}
          queryGateway={queryGateway}
          shortageGateway={shortageGateway}
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
