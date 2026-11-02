import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CustomerTrackingAccessError, CustomerTrackingQueryError, CustomerTrackingValidationError,
  type CustomerTrackingQueryGateway,
} from '../application/customerTrackingQueryGateway'
import {
  ACTIVE_CUSTOMER_STATUSES, customerTrackingAfterExpression,
  encodeCustomerTrackingCursor, normalizeCustomerTrackingQuery,
} from '../domain/customerTrackingPagination'
import {
  CustomerTrackingDataError, mapCustomerTrackedOrder,
} from '../domain/customerTrackedOrder'

// Explicitly projected. No contact data, audit internals, or KITCHEN-only business-name RPC.
const columns = `id, order_number, business_id, status, requested_delivery_at, created_at, customer_notes,
  items:order_items (id, product_name_snapshot, unit_code_snapshot, quantity_step_snapshot,
    requested_quantity, prepared_quantity, unavailable_quantity)` as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeFailure(error: unknown): Error {
  if (error instanceof CustomerTrackingValidationError || error instanceof CustomerTrackingAccessError
    || error instanceof CustomerTrackingDataError) return error
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42501') {
    return new CustomerTrackingAccessError()
  }
  return new CustomerTrackingQueryError()
}

async function authorizeCustomer(client: SupabaseBrowserClient): Promise<void> {
  const profile = await client.from('profiles').select('role, active').maybeSingle()
  if (profile.error) throw profile.error
  if (!profile.data?.active || profile.data.role !== 'CUSTOMER') throw new CustomerTrackingAccessError()
  // Active memberships are required even for an empty result. RLS makes these own memberships only.
  const memberships = await client.from('business_memberships')
    .select('business_id').eq('active', true)
  if (memberships.error) throw memberships.error
  if (!Array.isArray(memberships.data) || memberships.data.length === 0) {
    throw new CustomerTrackingAccessError()
  }
}

/** Every read is RLS-authorized; client-side role checks only fail closed earlier. */
export function createSupabaseCustomerTrackingQueryGateway(client: SupabaseBrowserClient): CustomerTrackingQueryGateway {
  return {
    async loadActiveOrders(filters) {
      const query = normalizeCustomerTrackingQuery(filters)
      try {
        await authorizeCustomer(client)
        let builder = client.from('orders').select(columns)
          .in('status', [...ACTIVE_CUSTOMER_STATUSES])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(query.pageSize + 1)
        if (query.after !== null) builder = builder.or(customerTrackingAfterExpression(query.after))
        const { data, error } = await builder
        if (error) throw error
        if (!Array.isArray(data)) throw new CustomerTrackingDataError()
        const slice = data.slice(0, query.pageSize)
        return {
          orders: slice.map(mapCustomerTrackedOrder),
          nextCursor: data.length > query.pageSize
            ? encodeCustomerTrackingCursor(slice[slice.length - 1]!) : null,
        }
      } catch (error) { throw safeFailure(error) }
    },
    async loadOrder(orderId) {
      if (typeof orderId !== 'string' || !UUID.test(orderId)) throw new CustomerTrackingValidationError()
      try {
        await authorizeCustomer(client)
        const { data, error } = await client.from('orders').select(columns).eq('id', orderId).maybeSingle()
        if (error) throw error
        return data === null ? null : mapCustomerTrackedOrder(data)
      } catch (error) { throw safeFailure(error) }
    },
  }
}
