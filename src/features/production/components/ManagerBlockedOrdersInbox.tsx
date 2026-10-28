import { useEffect, useState } from 'react'
import type { ManagerBlockedOrdersGateway, ManagerBlockedOrdersPage } from '../application/managerBlockedOrdersGateway'
import { formatKitchenQuantity } from '../domain/kitchenProductionInput'

export interface ManagerBlockedOrdersInboxProps { readonly gateway: ManagerBlockedOrdersGateway }

/** MANAGER-facing read-only view. No writes, cancellation commands or Realtime claims. */
export function ManagerBlockedOrdersInbox({ gateway }: ManagerBlockedOrdersInboxProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{
    loading: boolean; page: ManagerBlockedOrdersPage | null; error: string | null
  }>({ loading: true, page: null, error: null })

  useEffect(() => {
    let active = true
    // Invalidate the previous page immediately so stale data cannot be mistaken for fresh results.
    void (async () => {
      try {
        const page = await gateway.loadPage(pageIndex)
        if (active) setState({ loading: false, page, error: null })
      } catch {
        if (active) setState({ loading: false, page: null, error: 'Unable to load manager interventions.' })
      }
    })()
    return () => { active = false }
  }, [gateway, pageIndex, revision])

  function refresh() {
    setState({ loading: true, page: null, error: null })
    setRevision((current) => current + 1)
  }
  function navigate(next: number) {
    setState({ loading: true, page: null, error: null })
    setPageIndex(next)
  }

  return (
    <section aria-label="Manager production interventions">
      <h2>Production interventions</h2>
      <p>Read-only review of orders requiring an authorized MANAGER resolution. No automatic cancellation occurs.</p>
      <p>Orders are checked in pages. Results are not a global count; refresh to see recent changes.</p>
      <button type="button" disabled={state.loading} onClick={refresh}>Refresh interventions</button>
      <p>Page {pageIndex + 1}</p>
      {state.loading && <p role="status">Loading manager interventions…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {state.page && (
        <>
          {state.page.incidents.length === 0 && <p>No blocked orders on this page.</p>}
          <ol aria-label="Orders requiring manager intervention">
            {state.page.incidents.map((incident) => (
              <li key={incident.orderId}>
                <article aria-label={`Blocked order #${incident.orderNumber}`}>
                  <h3>Order #{incident.orderNumber}</h3>
                  <p>Manager intervention required: total unavailability. Status remains IN_PROGRESS.</p>
                  <p>Requested delivery: {new Date(incident.requestedDeliveryAt).toLocaleString()}</p>
                  <p>Unavailable quantity: {formatKitchenQuantity(incident.unavailableThousandths)}</p>
                  <p>Recent unavailability reasons (up to five per order, based on available audit events):</p>
                  {incident.reasons.length === 0 ? <p>No reasons returned on this page; consult full audit history.</p> : (
                    <ul>{incident.reasons.map((event, index) => <li key={`${event.occurredAt}-${index}`}>{event.reason}</li>)}</ul>
                  )}
                  <p>Arrange an authorized, reasoned and audited managerial resolution outside this read-only view.</p>
                </article>
              </li>
            ))}
          </ol>
          <nav aria-label="Manager intervention pages">
            <button type="button" disabled={pageIndex === 0} onClick={() => navigate(pageIndex - 1)}>Previous orders page</button>
            <button type="button" disabled={!state.page.hasNextPage} onClick={() => navigate(pageIndex + 1)}>Next orders page</button>
          </nav>
        </>
      )}
    </section>
  )
}
