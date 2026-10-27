import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import type {
  KitchenOrderQueryGateway,
} from '../src/features/production/application/kitchenOrderQueryGateway.ts'
import type {
  KitchenProductionRealtimeGateway,
} from '../src/features/production/application/kitchenProductionRealtimeGateway.ts'
import {
  createKitchenQueueSynchronizer,
  type KitchenQueueSyncState,
} from '../src/features/production/application/kitchenQueueSynchronization.ts'
import {
  createSupabaseKitchenOrderQueryGateway,
} from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import {
  createSupabaseKitchenProductionRealtimeGateway,
} from '../src/features/production/data/createSupabaseKitchenProductionRealtimeGateway.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
  fixtureCredentials,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'customerB' | 'kitchen'

/** Public client + real JWT. Never use a privileged key for assertions. */
async function signedInClient(actor: Actor): Promise<SupabaseBrowserClient> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(actor))
  expect(error, `Unable to sign in as ${actor}`).toBeNull()
  return client
}

async function createFixtureOrder(customer: SupabaseBrowserClient): Promise<string> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)

  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'E2E Kitchen Realtime synchronization',
    p_idempotency_key: randomUUID(),
    p_items: [{
      product_id: customerOrderingFixture.productId,
      requested_quantity: 2,
    }],
  })
  expect(error, 'Unable to create Realtime fixture Order').toBeNull()
  expect(data).toBeTruthy()
  return data!
}

// The UI does not yet exist (M4-006); this E2E tests its real application
// boundaries with two authenticated Supabase clients and actual WAL events.
test('KITCHEN receives persisted changes, refetches, enforces RLS and recovers missed changes', async () => {
  test.setTimeout(120_000)

  const customer = await signedInClient('customerA')
  const kitchen = await signedInClient('kitchen')
  const unrelatedCustomer = await signedInClient('customerB')

  const realQuery = createSupabaseKitchenOrderQueryGateway(kitchen)
  const realRealtime = createSupabaseKitchenProductionRealtimeGateway(kitchen)
  const states: KitchenQueueSyncState[] = []
  let reads = 0
  let invalidations = 0
  let stopSynchronization: (() => void) | null = null
  let kitchenItemProbe: ReturnType<typeof kitchen.channel> | null = null
  let unrelatedObserver: ReturnType<typeof unrelatedCustomer.channel> | null = null
  const kitchenItemOrderIds = new Set<string>()
  const unauthorizedOrderIds = new Set<string>()

  const queryGateway: KitchenOrderQueryGateway = {
    async loadProductionQueue(filters) {
      reads += 1
      return realQuery.loadProductionQueue(filters)
    },
    loadProductionOrder: (id) => realQuery.loadProductionOrder(id),
  }
  const realtimeGateway: KitchenProductionRealtimeGateway = {
    subscribe(listener) {
      return realRealtime.subscribe({
        onConnectionStatusChange: (status) => listener.onConnectionStatusChange(status),
        onInvalidation() {
          invalidations += 1
          listener.onInvalidation()
        },
      })
    },
  }
  const synchronizer = createKitchenQueueSynchronizer({
    queryGateway,
    realtimeGateway,
    filters: { statuses: ['RECEIVED'], pageSize: 100 },
    debounceMs: 50,
  })

  try {
    // Observe real order_items INSERT separately: the application adapter
    // intentionally hides payloads, so its tests cannot identify their table.
    let kitchenItemProbeJoined = false
    let kitchenItemProbePgReady = false
    let kitchenItemProbeStatus = 'connecting'
    let kitchenItemProbeSystem = 'pending'
    kitchenItemProbe = kitchen
      .channel(`e2e-kitchen-item-probe-${randomUUID()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_items',
      }, (payload) => {
        const id = payload.new.order_id
        if (typeof id === 'string') kitchenItemOrderIds.add(id)
      })
      .on('system', {}, (payload) => {
        if (payload.extension !== 'postgres_changes') return
        kitchenItemProbeSystem = `${payload.status}: ${payload.message ?? ''}`
        kitchenItemProbePgReady = payload.status === 'ok'
      })
      .subscribe((status, error) => {
        kitchenItemProbeStatus = error ? `${status}: ${error.message}` : status
        kitchenItemProbeJoined = status === 'SUBSCRIBED'
        if (status !== 'SUBSCRIBED') kitchenItemProbePgReady = false
      })

    // CUSTOMER B has SELECT only for its own Business, never Business A.
    // Track both tables; this is a bounded observational check in addition
    // to the authoritative PostgREST/RLS assertions below.
    let unrelatedObserverJoined = false
    let unrelatedObserverPgReady = false
    let unrelatedObserverStatus = 'connecting'
    let unrelatedObserverSystem = 'pending'
    unrelatedObserver = unrelatedCustomer
      .channel(`e2e-unrelated-customer-${randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
      }, (payload) => {
        const row = payload.new
        if (row && 'id' in row && typeof row.id === 'string') {
          unauthorizedOrderIds.add(row.id)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_items',
      }, (payload) => {
        const id = payload.new.order_id
        if (typeof id === 'string') unauthorizedOrderIds.add(id)
      })
      .on('system', {}, (payload) => {
        if (payload.extension !== 'postgres_changes') return
        unrelatedObserverSystem = `${payload.status}: ${payload.message ?? ''}`
        unrelatedObserverPgReady = payload.status === 'ok'
      })
      .subscribe((status, error) => {
        unrelatedObserverStatus = error ? `${status}: ${error.message}` : status
        unrelatedObserverJoined = status === 'SUBSCRIBED'
        if (status !== 'SUBSCRIBED') unrelatedObserverPgReady = false
      })

    stopSynchronization = synchronizer.start((state) => states.push(state))

    // SUBSCRIBED confirms the channel join, not that Postgres Changes is
    // listening. Wait for its system acknowledgment before issuing a write.
    // Returning all statuses from poll makes a future failure diagnosable.
    await expect.poll(() => ({
      kitchenJoined: kitchenItemProbeJoined,
      kitchenPostgresReady: kitchenItemProbePgReady,
      kitchenStatus: kitchenItemProbeStatus,
      kitchenSystem: kitchenItemProbeSystem,
      unrelatedJoined: unrelatedObserverJoined,
      unrelatedPostgresReady: unrelatedObserverPgReady,
      unrelatedStatus: unrelatedObserverStatus,
      unrelatedSystem: unrelatedObserverSystem,
    }), { timeout: 30_000 }).toMatchObject({
      kitchenJoined: true,
      kitchenPostgresReady: true,
      unrelatedJoined: true,
      unrelatedPostgresReady: true,
    })
    // Also wait for the initial authoritative read. Otherwise an initial
    // SELECT racing the INSERT could look like a successful invalidation.
    await expect.poll(() => states.at(-1), { timeout: 30_000 }).toMatchObject({
      connection: 'connected', stale: false, loading: false,
    })
    expect(states.at(-1)?.page).not.toBeNull()
    const beforeCreationReads = reads

    // Trusted CUSTOMER command: inserts an Order and an OrderItem atomically.
    const firstOrderId = await createFixtureOrder(customer)

    // Distinguish an absent Realtime event from missing persisted/RLS-visible data.
    const persistedItems = await kitchen.from('order_items')
      .select('id').eq('order_id', firstOrderId)
    expect(persistedItems.error).toBeNull()
    expect(persistedItems.data).toHaveLength(1)

    await expect.poll(() => ({
      itemEventObserved: kitchenItemOrderIds.has(firstOrderId),
      channelStatus: kitchenItemProbeStatus,
      postgresStatus: kitchenItemProbeSystem,
    }), { timeout: 30_000 }).toMatchObject({ itemEventObserved: true })
    await expect.poll(() => invalidations, { timeout: 30_000 }).toBeGreaterThan(0)
    await expect.poll(() => {
      const latest = states.at(-1)
      return reads > beforeCreationReads
        && latest?.stale === false
        && latest.page?.orders.some((order) => order.id === firstOrderId) === true
    }, { timeout: 30_000 }).toBe(true)

    const first = states.at(-1)!.page!.orders.find((order) => order.id === firstOrderId)!
    expect(first.businessId).toBe(fixtureBusinesses.A.id)
    expect(first.businessName).toBe(fixtureBusinesses.A.name)
    expect(first.status).toBe('RECEIVED')
    expect(first.items).toHaveLength(1)
    expect(first.items[0]?.productName).toBe(customerOrderingFixture.productName)
    expect(first.items[0]?.requestedThousandths).toBe(2000)
    expect(first.items[0]?.remainingThousandths).toBe(2000)

    // The forbidden actor cannot read the Order or its Items via PostgREST.
    const deniedOrder = await unrelatedCustomer.from('orders')
      .select('id').eq('id', firstOrderId)
    expect(deniedOrder.error).toBeNull()
    expect(deniedOrder.data).toEqual([])
    const deniedItems = await unrelatedCustomer.from('order_items')
      .select('id').eq('order_id', firstOrderId)
    expect(deniedItems.error).toBeNull()
    expect(deniedItems.data).toEqual([])
    await expect(
      createSupabaseKitchenOrderQueryGateway(unrelatedCustomer).loadProductionQueue(),
    ).rejects.toThrow('Kitchen production access is not authorized.')

    // Trusted UPDATE: the Order must leave the active RECEIVED queue.
    const readsBeforeCancellation = reads
    const invalidationsBeforeCancellation = invalidations
    const cancellation = await customer.rpc('cancel_customer_order', {
      p_order_id: firstOrderId,
      p_reason: 'E2E verified customer cancellation',
    })
    expect(cancellation.error).toBeNull()

    await expect.poll(() => invalidations, { timeout: 30_000 })
      .toBeGreaterThan(invalidationsBeforeCancellation)
    await expect.poll(() => {
      const latest = states.at(-1)
      return reads > readsBeforeCancellation
        && latest?.stale === false
        && latest.page?.orders.every((order) => order.id !== firstOrderId) === true
    }, { timeout: 30_000 }).toBe(true)

    // Pause the subscription entirely. An Order created in that gap cannot
    // be received via its events; a new SUBSCRIBED must refetch PostgreSQL.
    stopSynchronization()
    stopSynchronization = null
    await expect.poll(() => kitchen.getChannels().length, { timeout: 10_000 })
      .toBe(1) // the item probe; the synchronizer channel was removed
    const emittedStatesBeforeGap = states.length
    const secondOrderId = await createFixtureOrder(customer)
    expect(states).toHaveLength(emittedStatesBeforeGap)

    const readsBeforeRestart = reads
    stopSynchronization = synchronizer.start((state) => states.push(state))
    await expect.poll(() => {
      const latest = states.at(-1)
      return reads > readsBeforeRestart
        && latest?.connection === 'connected'
        && latest.stale === false
        && latest.page?.orders.some((order) => order.id === secondOrderId) === true
    }, { timeout: 30_000 }).toBe(true)

    // No Business A data may have reached CUSTOMER B's live subscription.
    expect(unauthorizedOrderIds.has(firstOrderId)).toBe(false)
    expect(unauthorizedOrderIds.has(secondOrderId)).toBe(false)

    // Cleanup disables future notifications and removes the application channel.
    stopSynchronization()
    stopSynchronization = null
    await expect.poll(() => kitchen.getChannels().length, { timeout: 10_000 })
      .toBe(1)
  } finally {
    stopSynchronization?.()
    if (kitchenItemProbe) await kitchen.removeChannel(kitchenItemProbe)
    if (unrelatedObserver) await unrelatedCustomer.removeChannel(unrelatedObserver)
    await Promise.allSettled([
      customer.auth.signOut({ scope: 'local' }),
      kitchen.auth.signOut({ scope: 'local' }),
      unrelatedCustomer.auth.signOut({ scope: 'local' }),
    ])
  }
})
