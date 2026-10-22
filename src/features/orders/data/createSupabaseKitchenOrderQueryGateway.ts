import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  encodeKitchenQueueCursor,
  kitchenQueueAfterExpression,
  normalizeKitchenQueueQuery,
} from '../domain/kitchenQueuePagination'
import {
  KitchenOrderAccessError,
  KitchenOrderQueryError,
  KitchenOrderQueryValidationError,
  type KitchenOrderQueryGateway,
} from '../application/kitchenOrderQueryGateway'
import {
  KitchenProductionDataError,
  mapKitchenProductionOrder,
  type KitchenStoredOrder,
  type KitchenProductionOrder,
} from '../domain/kitchenProductionOrder'

// Explicit column projection: never embed businesses or select administrative
// and personal fields. Business names come through the trusted M4-001B RPC.
const productionOrderColumns = `
  id,
  order_number,
  business_id,
  status,
  requested_delivery_at,
  created_at,
  customer_notes,
  items:order_items (
    id,
    product_id,
    product_name_snapshot,
    unit_code_snapshot,
    quantity_step_snapshot,
    requested_quantity,
    prepared_quantity,
    unavailable_quantity
  )
` as const

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function mapProviderFailure(error: unknown): Error {
  if (
    error instanceof KitchenOrderQueryValidationError
    || error instanceof KitchenProductionDataError
    || error instanceof KitchenOrderAccessError
  ) {
    return error
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42501') {
    return new KitchenOrderAccessError()
  }

  return new KitchenOrderQueryError()
}

async function lookupBusinessNames(
  client: SupabaseBrowserClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const { data, error } = await client.rpc('get_kitchen_order_business_names', {
    p_business_ids: [...ids],
  })

  if (error) {
    throw error
  }

  if (!Array.isArray(data)) {
    throw new KitchenProductionDataError()
  }

  const names = new Map<string, string>()

  for (const business of data) {
    if (
      typeof business.id !== 'string'
      || typeof business.name !== 'string'
      || business.name.trim() === ''
      || names.has(business.id)
      || !ids.includes(business.id)
    ) {
      throw new KitchenProductionDataError()
    }
    names.set(business.id, business.name)
  }

  if (names.size !== ids.length) {
    throw new KitchenProductionDataError()
  }

  return names
}

async function assertKitchenAccess(client: SupabaseBrowserClient): Promise<void> {
  // M4-001B checks the active KITCHEN profile before we request any Orders.
  // This also denies empty queues for CUSTOMER/MANAGER (RLS alone would not).
  await lookupBusinessNames(client, [])
}

async function resolveOrders(
  client: SupabaseBrowserClient,
  rows: readonly KitchenStoredOrder[],
): Promise<readonly KitchenProductionOrder[]> {
  if (rows.length === 0) {
    return []
  }

  const businessIds = [...new Set(rows.map((order) => order.business_id))]
  const names = await lookupBusinessNames(client, businessIds)

  return rows.map((row) => {
    const businessName = names.get(row.business_id)
    if (businessName === undefined) {
      throw new KitchenProductionDataError()
    }
    return mapKitchenProductionOrder(row, businessName)
  })
}

/**
 * M4-001: authoritative Orders/Items read, narrow Business projection,
 * caller-defined status filters, and stable keyset pagination.
 */
export function createSupabaseKitchenOrderQueryGateway(
  client: SupabaseBrowserClient,
): KitchenOrderQueryGateway {
  return {
    async loadProductionQueue(filters) {
      // Invalid filters/cursors must fail before network access.
      const query = normalizeKitchenQueueQuery(filters)

      try {
        await assertKitchenAccess(client)

        let request = client
          .from('orders')
          .select(productionOrderColumns)
          .in('status', [...query.statuses])
          .order('requested_delivery_at', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })

        if (query.after !== null) {
          request = request.or(kitchenQueueAfterExpression(query.after))
        }

        // Fetch one extra parent Order to determine whether a next page exists.
        // Child OrderItems are not subject to the parent page limit.
        const { data, error } = await request.limit(query.pageSize + 1)

        if (error || !Array.isArray(data)) {
          throw error ?? new KitchenProductionDataError()
        }
        if (
          data.length > query.pageSize + 1
          || data.some((row) => !query.statuses.includes(row.status))
        ) {
          throw new KitchenProductionDataError()
        }

        const hasNextPage = data.length > query.pageSize
        const pageRows = data.slice(0, query.pageSize)
        const nextCursor = hasNextPage
          ? encodeKitchenQueueCursor(pageRows[pageRows.length - 1]!, query.statuses)
          : null
        const orders = await resolveOrders(client, pageRows)
        return { orders, nextCursor }
      } catch (error) {
        throw mapProviderFailure(error)
      }
    },

    async loadProductionOrder(orderId) {
      if (!uuidPattern.test(orderId)) {
        throw new KitchenOrderQueryValidationError()
      }

      try {
        await assertKitchenAccess(client)

        const { data, error } = await client
          .from('orders')
          .select(productionOrderColumns)
          .eq('id', orderId)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        const [order] = await resolveOrders(client, [data])
        if (!order) {
          throw new KitchenProductionDataError()
        }
        return order
      } catch (error) {
        throw mapProviderFailure(error)
      }
    },
  }
}
