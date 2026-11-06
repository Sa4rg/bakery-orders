import { spawnSync } from 'node:child_process'
import { expect } from '@playwright/test'
import { Client } from 'pg'

/**
 * Reusable, local-only PostgreSQL transaction-contending helpers.
 *
 * The first transaction remains uncommitted while the observer proves
 * that the second backend is blocked by its PID. Production RPCs run
 * under authenticated claims, never under the database owner role.
 *
 * IMPORTANT: for tests against real PostgREST/JWT, use separate
 * Supabase clients. This SQL helper proves lock contention, not HTTP auth.
 */

export type Outcome = { ok: true; code: null } | { ok: false; code: string | null }
export type Command = { sql: string; args: (string | number)[] }
let cachedLocalDatabaseUrl: string | undefined

export function localDatabaseUrl(): string {
  if (cachedLocalDatabaseUrl) return cachedLocalDatabaseUrl

  const status = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (status.error || status.status !== 0) {
    throw new Error('Local Supabase must be running for database contention tests.')
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

export async function beginAs(client: Client, actorId: string) {
  await client.query('BEGIN')
  await client.query('SET LOCAL ROLE authenticated')
  await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actorId])
  await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)")
}

export async function run(client: Client, command: Command): Promise<Outcome> {
  try {
    await client.query(command.sql, command.args)
    return { ok: true, code: null }
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error &&
      typeof error.code === 'string' ? error.code : null
    return { ok: false, code }
  }
}

/** Verify observed PostgreSQL row-lock contention, without sleeps or chance scheduling. */
export async function waitForPgLock(observer: Client, waitingPid: number, blockerPid: number): Promise<void> {
  await expect.poll(async () => {
    const result = await observer.query<{ wait_event_type: string | null; blockers: number[] }>(
      `SELECT wait_event_type, pg_catalog.pg_blocking_pids(pid) AS blockers
       FROM pg_catalog.pg_stat_activity WHERE pid = $1::integer`,
      [waitingPid],
    )
    const activity = result.rows[0]
    return activity?.wait_event_type === 'Lock' && activity.blockers.includes(blockerPid)
  }, { timeout: 15_000, intervals: [50, 100, 200, 400] }).toBe(true)
}

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
export async function contend(args: {
  orderId: string
  firstActorId: string
  secondActorId: string
  firstCommand: Command
  secondCommand: Command
  preserveLockOnFailure?: boolean
  applicationName?: string
}): Promise<{ first: Outcome; second: Outcome }> {
  const connectionString = localDatabaseUrl()
  const name = args.applicationName ?? 'm4_010'
  const firstDb = new Client({ connectionString, application_name: `${name}_first` })
  const secondDb = new Client({ connectionString, application_name: `${name}_second` })
  const observer = new Client({ connectionString, application_name: `${name}_observer` })
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
    await waitForPgLock(observer, secondPid, firstPid)

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
