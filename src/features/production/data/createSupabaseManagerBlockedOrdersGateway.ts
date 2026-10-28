import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { deriveKitchenBlockedCondition } from '../domain/kitchenBlockedCondition'
import { toQuantityThousandths } from '../domain/kitchenProductionOrder'
import {
  ManagerBlockedOrdersAccessError, ManagerBlockedOrdersQueryError, ManagerBlockedOrdersValidationError,
  type ManagerBlockedOrdersGateway, type ManagerBlockedOrder,
} from '../application/managerBlockedOrdersGateway'

const PAGE_SIZE = 25
const MAX_REASON_EVENTS = 500
const selectColumns = `id, order_number, status, requested_delivery_at,
  items:order_items (id, requested_quantity, prepared_quantity, unavailable_quantity)` as const

/** No names lookup: the KITCHEN business-names RPC must remain KITCHEN-only. */
export function createSupabaseManagerBlockedOrdersGateway(client: SupabaseBrowserClient): ManagerBlockedOrdersGateway {
  return {
    async loadPage(pageIndex) {
      if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 100_000) {
        throw new ManagerBlockedOrdersValidationError()
      }
      // Profiles RLS only exposes the actor's own row. Check MANAGER even on an empty page.
      let profile
      try {
        profile = await client.from('profiles').select('role, active').single()
      } catch {
        throw new ManagerBlockedOrdersAccessError()
      }
      if (profile.error || !profile.data?.active || profile.data.role !== 'MANAGER') {
        throw new ManagerBlockedOrdersAccessError()
      }
      try {
        const from = pageIndex * PAGE_SIZE
        const { data, error } = await client.from('orders').select(selectColumns)
          .eq('status', 'IN_PROGRESS')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + PAGE_SIZE)
        if (error || !Array.isArray(data)) throw new ManagerBlockedOrdersQueryError()

        const incidents: ManagerBlockedOrder[] = []
        for (const row of data.slice(0, PAGE_SIZE)) {
          if (row.status !== 'IN_PROGRESS' || !Array.isArray(row.items)) throw new ManagerBlockedOrdersQueryError()
          if (!Number.isSafeInteger(row.order_number) || row.order_number <= 0
            || !Number.isFinite(Date.parse(row.requested_delivery_at))) throw new ManagerBlockedOrdersQueryError()
          const items = row.items.map((item) => {
            const requestedThousandths = toQuantityThousandths(item.requested_quantity)
            const preparedThousandths = toQuantityThousandths(item.prepared_quantity)
            const unavailableThousandths = toQuantityThousandths(item.unavailable_quantity)
            return { requestedThousandths, preparedThousandths, unavailableThousandths,
              remainingThousandths: requestedThousandths - preparedThousandths - unavailableThousandths }
          })
          const blocked = deriveKitchenBlockedCondition({ status: row.status, items })
          if (blocked.blocked) incidents.push({ orderId: row.id, orderNumber: row.order_number,
            requestedDeliveryAt: row.requested_delivery_at,
            unavailableThousandths: blocked.fulfillment.totals.unavailableThousandths, reasons: [] })
        }

        if (incidents.length > 0) {
          const ids = incidents.map((incident) => incident.orderId)
          const { data: events, error: eventError } = await client.from('order_events')
            .select('order_id, reason, occurred_at').in('order_id', ids)
            .eq('event_type', 'QUANTITY_UNAVAILABLE')
            .order('occurred_at', { ascending: false }).limit(MAX_REASON_EVENTS)
          if (eventError || !Array.isArray(events)) throw new ManagerBlockedOrdersQueryError()
          for (const incident of incidents) {
            const reasons = events.filter((event) => event.order_id === incident.orderId
              && typeof event.reason === 'string' && event.reason.trim().length > 0)
              .slice(0, 5).map((event) => ({ reason: event.reason!, occurredAt: event.occurred_at }))
            // Type narrowing only; all output is new read-only data.
            const index = incidents.indexOf(incident)
            incidents[index] = { ...incident, reasons }
          }
        }
        return { incidents, hasNextPage: data.length > PAGE_SIZE }
      } catch {
        // Deliberately sanitize provider errors at this read-only trust boundary.
        throw new ManagerBlockedOrdersQueryError()
      }
    },
  }
}
