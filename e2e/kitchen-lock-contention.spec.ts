import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import { customerOrderingFixture, fixtureBusinesses, fixtureCredentials } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

/**
 * DB sessions are local, test-only PostgreSQL connections. Production RPCs
 * are executed as `authenticated` with fixture actor claims, not as postgres.
 * The existing kitchen-concurrency.spec.ts separately proves real JWT/HTTP
 * behavior; these tests prove actual transaction blocking deterministically.
 */

type Role = 'customerA' | 'kitchen'
type Outcome = { ok: true; code: null } | { ok: false; code: string | null }
type Command = { sql: string; args: (string | number)[] }
type Actors = {
  customer: SupabaseBrowserClient
  kitchen: SupabaseBrowserClient
  customerId: string
  kitchenId: string
}

let cachedLocalDatabaseUrl: string | undefined

function localDatabaseUrl(): string {
  if (cachedLocalDatabaseUrl) return cachedLocalDatabaseUrl

  const status = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (status.error || status.status !== 0) {
    throw new Error('Local Supabase must be running for M4-010 database contention tests.')
  }
  const entry = status.stdout.split(/\r?\n/)
    .map((line) => /^DB_URL=(.*)$/.exec(line.trim())?.[1])
    .find((value) => value !== undefined)
  if (!entry) throw new Error('Local Supabase status did not provide DB_URL.')
  const raw = entry.replace(/^"|"$/g, '')
  let url: URL
  try { url = new URL(raw) } catch {
    throw new Error('Local Supabase returned an invalid database URL.')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Refusing database contention tests against a non-loopback PostgreSQL endpoint.')
  }
  cachedLocalDatabaseUrl = raw
  return raw
}

async function signIn(role: Role): Promise<{ client: SupabaseBrowserClient; id: string }> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signInWithPassword(fixtureCredentials(role))
  expect(error, `Cannot sign in ${role}`).toBeNull()
  if (!data.user) throw new Error('Fixture sign-in did not provide a user.')
  return { client, id: data.user.id }
}

async function withActors(body: (actors: Actors) => Promise<void>): Promise<void> {
  const sessions: SupabaseBrowserClient[] = []
  try {
    const customer = await signIn('customerA')
    sessions.push(customer.client)
    const kitchen = await signIn('kitchen')
    sessions.push(kitchen.client)
    await body({
      customer: customer.client, kitchen: kitchen.client,
      customerId: customer.id, kitchenId: kitchen.id,
    })
  } finally {
    await Promise.allSettled(sessions.map((client) => client.auth.signOut({ scope: 'local' })))
  }
}

async function createOrder(actors: Actors, label: string): Promise<{ orderId: string; itemId: string }> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const { data: orderId, error } = await actors.customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: `M4-010 deterministic ${label}`,
    p_idempotency_key: randomUUID(),
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(error).toBeNull()
  if (!orderId) throw new Error('create_order returned no id')
  const loaded = await createSupabaseKitchenOrderQueryGateway(actors.kitchen).loadProductionOrder(orderId)
  expect(loaded?.items).toHaveLength(1)
  if (!loaded) throw new Error('KITCHEN did not load the test Order')
  return { orderId, itemId: loaded.items[0]!.id }
}

async function readState(actors: Actors, orderId: string, itemId: string) {
  const [order, item, events] = await Promise.all([
    actors.kitchen.from('orders').select('status, started_at, cancelled_at, ready_at').eq('id', orderId).single(),
    actors.kitchen.from('order_items').select('requested_quantity, prepared_quantity, unavailable_quantity').eq('id', itemId).single(),
    actors.kitchen.from('order_events').select('event_type, previous_value, new_value, metadata').eq('order_id', orderId),
  ])
  expect(order.error).toBeNull()
  expect(item.error).toBeNull()
  expect(events.error).toBeNull()
  if (!order.data || !item.data || !events.data) throw new Error('Missing persisted test data')
  return { order: order.data, item: item.data, events: events.data }
}

async function beginAs(client: Client, actorId: string) {
  await client.query('BEGIN')
  await client.query('SET LOCAL ROLE authenticated')
  await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actorId])
  await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)")
}

async function run(client: Client, command: Command): Promise<Outcome> {
  try {
    await client.query(command.sql, command.args)
    return { ok: true, code: null }
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error &&
      typeof error.code === 'string' ? error.code : null
    return { ok: false, code }
  }
}

const prepared = (itemId: string, delta: number): Command => ({
  sql: 'SELECT public.record_prepared_quantity($1::uuid, $2::numeric)', args: [itemId, delta],
})
const unavailable = (itemId: string, delta: number): Command => ({
  sql: 'SELECT public.record_unavailable_quantity($1::uuid, $2::numeric, $3::text)',
  args: [itemId, delta, 'M4-010 deterministic shortage'],
})
const start = (orderId: string): Command => ({
  sql: 'SELECT public.start_order($1::uuid)', args: [orderId],
})
const cancel = (orderId: string): Command => ({
  sql: 'SELECT public.cancel_customer_order($1::uuid, $2::text)',
  args: [orderId, 'M4-010 deterministic cancellation'],
})
const ready = (orderId: string): Command => ({
  sql: 'SELECT public.mark_order_ready($1::uuid)', args: [orderId],
})

/**
 * Enforce a particular serialization: first SQL transaction has executed but
 * NOT committed. The second trusted RPC is observed blocked by its backend PID
 * (pg_blocking_pids), then the first commits and the second resumes.
 * No sleep, artificial timeout, or second invocation of a command is used.
 *
 * `preserveLockOnFailure` is reserved for READY-first: the expected rejection
 * aborts its statement, so we acquire the Order lock BEFORE a SAVEPOINT and
 * roll back only the failed statement, retaining that pre-savepoint lock.
 */
async function contend(args: {
  orderId: string
  firstActorId: string
  secondActorId: string
  firstCommand: Command
  secondCommand: Command
  preserveLockOnFailure?: boolean
}): Promise<{ first: Outcome; second: Outcome }> {
  const connectionString = localDatabaseUrl()
  const firstDb = new Client({ connectionString, application_name: 'm4_010_first' })
  const secondDb = new Client({ connectionString, application_name: 'm4_010_second' })
  const observer = new Client({ connectionString, application_name: 'm4_010_observer' })
  const clients = [firstDb, secondDb, observer]
  let firstCommitted = false
  let secondPending: Promise<Outcome> | undefined

  try {
    await Promise.all(clients.map((client) => client.connect()))
    await beginAs(firstDb, args.firstActorId)
    await beginAs(secondDb, args.secondActorId)
    const firstPidResult = await firstDb.query<{ pid: number }>('SELECT pg_catalog.pg_backend_pid() AS pid')
    const secondPidResult = await secondDb.query<{ pid: number }>('SELECT pg_catalog.pg_backend_pid() AS pid')
    const firstPid = firstPidResult.rows[0]!.pid
    const secondPid = secondPidResult.rows[0]!.pid

    if (args.preserveLockOnFailure) {
      // SELECT ... FOR UPDATE requires UPDATE privileges, intentionally denied
      // to `authenticated`. Acquire only the test's pre-savepoint lock as the
      // local database owner; restore the actor role BEFORE running READY.
      await firstDb.query('SET LOCAL ROLE postgres')
      const locked = await firstDb.query('SELECT id FROM public.orders WHERE id = $1::uuid FOR UPDATE', [args.orderId])
      expect(locked.rowCount).toBe(1)
      await firstDb.query('SET LOCAL ROLE authenticated')
      await firstDb.query('SAVEPOINT before_command')
    }

    const first = await run(firstDb, args.firstCommand)
    if (!first.ok && args.preserveLockOnFailure) {
      await firstDb.query('ROLLBACK TO SAVEPOINT before_command')
    } else if (!first.ok) {
      throw new Error(`Unexpected failure of the first trusted command: ${first.code ?? 'unknown SQLSTATE'}`)
    }

    // Fire the second query but do not await it while the first owns the lock.
    secondPending = run(secondDb, args.secondCommand)
    await expect.poll(async () => {
      const result = await observer.query<{ wait_event_type: string | null; blockers: number[] }>(
        `SELECT wait_event_type, pg_catalog.pg_blocking_pids(pid) AS blockers
         FROM pg_catalog.pg_stat_activity WHERE pid = $1::integer`,
        [secondPid],
      )
      const activity = result.rows[0]
      return activity?.wait_event_type === 'Lock' && activity.blockers.includes(firstPid)
    }, { timeout: 15_000, intervals: [50, 100, 200, 400] }).toBe(true)

    await firstDb.query('COMMIT')
    firstCommitted = true
    const second = await secondPending
    await secondDb.query(second.ok ? 'COMMIT' : 'ROLLBACK')
    secondPending = undefined
    return { first, second }
  } finally {
    if (!firstCommitted) await firstDb.query('ROLLBACK').catch(() => undefined)
    // Release blocking transactions before closing connections.
    await secondDb.query('ROLLBACK').catch(() => undefined)
    if (secondPending) await secondPending.catch(() => undefined)
    await Promise.allSettled(clients.map((client) => client.end()))
  }
}

function expectFirstWins(result: { first: Outcome; second: Outcome }) {
  expect(result.first).toEqual({ ok: true, code: null })
  expect(result.second).toEqual({ ok: false, code: '22023' })
}

const count = (events: { event_type: string }[], event: string) =>
  events.filter((row) => row.event_type === event).length

test.describe('M4-010 — deterministic PostgreSQL row-lock contention', () => {
  test.setTimeout(60_000) // Includes local DB connection setup and lock observation.

  test('A: prepared/prepared serializes and records exactly one increment', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'A')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: prepared(itemId, 2), secondCommand: prepared(itemId, 2),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.item).toMatchObject({ requested_quantity: 3, prepared_quantity: 2, unavailable_quantity: 0 })
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(1)
      expect(state.order.status).toBe('IN_PROGRESS')
    })
  })

  test('B: prepared/unavailable serializes against shared remaining', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'B')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: prepared(itemId, 2), secondCommand: unavailable(itemId, 2),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.item).toMatchObject({ requested_quantity: 3, prepared_quantity: 2, unavailable_quantity: 0 })
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(1)
      expect(count(state.events, 'QUANTITY_UNAVAILABLE')).toBe(0)
    })
  })

  test('C1: final quantity commits before READY; READY succeeds after waiting', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'C1')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expect((await actors.kitchen.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 })).error).toBeNull()
      const result = await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: prepared(itemId, 1), secondCommand: ready(orderId),
      })
      expect(result.first.ok).toBe(true)
      expect(result.second.ok).toBe(true)
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('READY')
      expect(state.order.ready_at).toBeTruthy()
      expect(state.item.prepared_quantity).toBe(3)
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(2)
      expect(count(state.events, 'ORDER_READY')).toBe(1)
    })
  })

  test('C2: READY observes unresolved quantities, rejects; quantity can proceed', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'C2')
      expect((await actors.kitchen.rpc('start_order', { p_order_id: orderId })).error).toBeNull()
      expect((await actors.kitchen.rpc('record_prepared_quantity', { p_order_item_id: itemId, p_quantity: 2 })).error).toBeNull()
      const result = await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: ready(orderId), secondCommand: prepared(itemId, 1),
        preserveLockOnFailure: true,
      })
      expect(result.first).toEqual({ ok: false, code: '22023' })
      expect(result.second.ok).toBe(true)
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('IN_PROGRESS')
      expect(state.order.ready_at).toBeNull()
      expect(state.item.prepared_quantity).toBe(3)
      expect(count(state.events, 'QUANTITY_PREPARED')).toBe(2)
      expect(count(state.events, 'ORDER_READY')).toBe(0)
    })
  })

  test('D1: start commits before customer cancellation, which is rejected', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'D1')
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.customerId,
        firstCommand: start(orderId), secondCommand: cancel(orderId),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('IN_PROGRESS')
      expect(state.order.started_at).toBeTruthy()
      expect(state.order.cancelled_at).toBeNull()
      expect(count(state.events, 'PREPARATION_STARTED')).toBe(1)
      expect(count(state.events, 'ORDER_CANCELLED')).toBe(0)
    })
  })

  test('D2: customer cancellation commits before start, which is rejected', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'D2')
      expectFirstWins(await contend({
        orderId, firstActorId: actors.customerId, secondActorId: actors.kitchenId,
        firstCommand: cancel(orderId), secondCommand: start(orderId),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('CANCELLED')
      expect(state.order.cancelled_at).toBeTruthy()
      expect(state.order.started_at).toBeNull()
      expect(count(state.events, 'ORDER_CANCELLED')).toBe(1)
      expect(count(state.events, 'PREPARATION_STARTED')).toBe(0)
    })
  })

  test('E: double-start is serialized and audited once', async () => {
    await withActors(async (actors) => {
      const { orderId, itemId } = await createOrder(actors, 'E')
      expectFirstWins(await contend({
        orderId, firstActorId: actors.kitchenId, secondActorId: actors.kitchenId,
        firstCommand: start(orderId), secondCommand: start(orderId),
      }))
      const state = await readState(actors, orderId, itemId)
      expect(state.order.status).toBe('IN_PROGRESS')
      expect(count(state.events, 'PREPARATION_STARTED')).toBe(1)
    })
  })
})
