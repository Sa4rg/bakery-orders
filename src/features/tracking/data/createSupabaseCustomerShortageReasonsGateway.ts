import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { validCustomerTrackingTimestamp } from '../domain/customerTrackedOrder'
import {
  CustomerShortageAccessError,
  CustomerShortageDataError,
  CustomerShortageQueryError,
  CustomerShortageValidationError,
  type CustomerShortageReasonsGateway,
} from '../application/customerShortageReasonsGateway'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The SECURITY DEFINER RPC performs active CUSTOMER and BusinessMembership
 * checks inside PostgreSQL. Never read order_events directly in the browser.
 */
export function createSupabaseCustomerShortageReasonsGateway(
  client: SupabaseBrowserClient,
): CustomerShortageReasonsGateway {
  return {
    async loadReasons(orderId) {
      if (typeof orderId !== 'string' || !UUID.test(orderId)) {
        throw new CustomerShortageValidationError()
      }
      try {
        const { data, error } = await client.rpc('get_customer_order_unavailability_reasons', {
          p_order_id: orderId,
        })
        if (error) {
          if (error.code === '42501') throw new CustomerShortageAccessError()
          throw new CustomerShortageQueryError()
        }
        if (!Array.isArray(data)) throw new CustomerShortageDataError()

        return data.map((row) => {
          if (
            typeof row !== 'object' || row === null
            || typeof row.order_item_id !== 'string' || !UUID.test(row.order_item_id)
            || typeof row.reason !== 'string' || !row.reason.trim()
            || !validCustomerTrackingTimestamp(row.occurred_at)
          ) {
            throw new CustomerShortageDataError()
          }
          return {
            orderItemId: row.order_item_id,
            reason: row.reason,
            occurredAt: row.occurred_at,
          }
        })
      } catch (error) {
        if (
          error instanceof CustomerShortageAccessError
          || error instanceof CustomerShortageDataError
          || error instanceof CustomerShortageQueryError
        ) throw error
        throw new CustomerShortageQueryError()
      }
    },
  }
}
