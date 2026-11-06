import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { fixtureBusinesses, readFixturePassword } from './support/fixtures.ts'
import { createDispatchedReceiptFixture, receiptTestSignIn } from './support/receiptOrderFixture.ts'
import { beginAs, localDatabaseUrl, waitForPgLock } from './support/pgContention.ts'
import { createLocalAdminClient, getLocalSupabasePublicConfig,
  resolveLocalSupabaseRuntime, type LocalAdminClient } from './support/localSupabase.ts'

async function createTemporaryCustomer(admin: LocalAdminClient): Promise<{
  id: string
  client: SupabaseBrowserClient
}> {
  // Dedicated, unique Auth identity; concurrent repeatEach tests cannot revoke
  // one another's fixture membership. All privileged work stays in Node/local.
  const email = `m5-006-race-${randomUUID()}@bakery-e2e.test`
  const password = readFixturePassword()
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  expect(created.error).toBeNull()
  if (!created.data.user) throw new Error('Unable to provision temporary E2E customer')
  const id = created.data.user.id
  const profile = await admin.from('profiles').insert({
    id, display_name: 'M5-006 Temporary Customer', role: 'CUSTOMER', active: true,
  })
  expect(profile.error).toBeNull()
  const membership = await admin.from('business_memberships').insert({
    user_id: id, business_id: fixtureBusinesses.A.id, active: true,
  })
  expect(membership.error).toBeNull()
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const login = await client.auth.signInWithPassword({ email, password })
  expect(login.error).toBeNull()
  return { id, client }
}

async function cleanupTemporaryCustomer(admin: LocalAdminClient, id: string) {
  const membership = await admin.from('business_memberships').delete().eq('user_id', id)
  expect(membership.error).toBeNull()
  const profile = await admin.from('profiles').delete().eq('id', id)
  expect(profile.error).toBeNull()
  const user = await admin.auth.admin.deleteUser(id)
  expect(user.error).toBeNull()
}

async function cleanupExactOrder(admin: LocalAdminClient, orderId: string) {
  // Only the new test's Order is deleted. Remove child audit/items first, as
  // the production schema intentionally has restrictive foreign keys.
  expect((await admin.from('order_events').delete().eq('order_id', orderId)).error).toBeNull()
  expect((await admin.from('order_items').delete().eq('order_id', orderId)).error).toBeNull()
  expect((await admin.from('orders').delete().eq('id', orderId)).error).toBeNull()
}

async function pid(client: Client) {
  const result = await client.query<{ pid: number }>('SELECT pg_catalog.pg_backend_pid() AS pid')
  if (!result.rows[0]) throw new Error('Missing PostgreSQL backend PID')
  return result.rows[0].pid
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string' ? error.code : null
}

test('M5-006 revocation wins membership lock: pending receipt is rejected with zero events', async () => {
  test.setTimeout(90_000)
  const admin = createLocalAdminClient(resolveLocalSupabaseRuntime())
  const kitchen = await receiptTestSignIn('kitchen')
  const owner = await receiptTestSignIn('customerA')
  const temp = await createTemporaryCustomer(admin)
  const revokeTx = new Client({ connectionString: localDatabaseUrl() })
  const receiptTx = new Client({ connectionString: localDatabaseUrl() })
  let orderId: string | undefined
  let receiptAttempt: Promise<string | null> | undefined
  try {
    orderId = (await createDispatchedReceiptFixture(owner, kitchen, false)).orderId
    await Promise.all([revokeTx.connect(), receiptTx.connect()])
    await revokeTx.query('BEGIN')
    const revoked = await revokeTx.query(
      'UPDATE public.business_memberships SET active = false WHERE user_id = $1::uuid AND business_id = $2::uuid',
      [temp.id, fixtureBusinesses.A.id],
    )
    expect(revoked.rowCount).toBe(1)
    await beginAs(receiptTx, temp.id)
    const revokerPid = await pid(revokeTx)
    const receiverPid = await pid(receiptTx)
    receiptAttempt = receiptTx.query('SELECT public.confirm_order_receipt($1::uuid)', [orderId])
      .then(() => null, errorCode)
    await waitForPgLock(revokeTx, receiverPid, revokerPid)
    await revokeTx.query('COMMIT')
    expect(await receiptAttempt).toBe('42501')
    await receiptTx.query('ROLLBACK')
    expect((await temp.client.rpc('confirm_order_receipt', { p_order_id: orderId })).error?.code)
      .toBe('42501')
    const order = await kitchen.from('orders').select('status, delivered_at').eq('id', orderId).single()
    const events = await kitchen.from('order_events').select('id')
      .eq('order_id', orderId).eq('event_type', 'ORDER_DELIVERED')
    expect(order.error).toBeNull()
    expect(order.data).toMatchObject({ status: 'DISPATCHED', delivered_at: null })
    expect(events.error).toBeNull()
    expect(events.data).toEqual([])
  } finally {
    await revokeTx.query('ROLLBACK').catch(() => undefined)
    await receiptTx.query('ROLLBACK').catch(() => undefined)
    await receiptAttempt?.catch(() => undefined)
    await Promise.allSettled([revokeTx.end(), receiptTx.end()])
    if (orderId) await cleanupExactOrder(admin, orderId)
    await temp.client.auth.signOut({ scope: 'local' })
    await cleanupTemporaryCustomer(admin, temp.id)
    await Promise.allSettled([owner, kitchen].map((c) => c.auth.signOut({ scope: 'local' })))
  }
})

test('M5-006 receipt wins membership lock: concurrent revocation waits, audit stays unique', async () => {
  test.setTimeout(90_000)
  const admin = createLocalAdminClient(resolveLocalSupabaseRuntime())
  const kitchen = await receiptTestSignIn('kitchen')
  const owner = await receiptTestSignIn('customerA')
  const temp = await createTemporaryCustomer(admin)
  const receiptTx = new Client({ connectionString: localDatabaseUrl() })
  const revokeTx = new Client({ connectionString: localDatabaseUrl() })
  // Read pg_stat_activity from a separate privileged session: receiptTx
  // runs under SET LOCAL ROLE authenticated and cannot inspect other sessions.
  const observer = new Client({ connectionString: localDatabaseUrl() })
  let orderId: string | undefined
  let revokeAttempt: Promise<number | null> | undefined
  try {
    orderId = (await createDispatchedReceiptFixture(owner, kitchen, true)).orderId
    await Promise.all([receiptTx.connect(), revokeTx.connect(), observer.connect()])
    await beginAs(receiptTx, temp.id)
    await receiptTx.query('SELECT public.confirm_order_receipt($1::uuid)', [orderId])
    // Receipt has succeeded but remains uncommitted; it holds membership SHARE.
    await revokeTx.query('BEGIN')
    const receiverPid = await pid(receiptTx)
    const revokerPid = await pid(revokeTx)
    revokeAttempt = revokeTx.query(
      'UPDATE public.business_memberships SET active=false WHERE user_id=$1::uuid AND business_id=$2::uuid',
      [temp.id, fixtureBusinesses.A.id],
    ).then((result) => result.rowCount, () => null)
    await waitForPgLock(observer, revokerPid, receiverPid)
    await receiptTx.query('COMMIT')
    expect(await revokeAttempt).toBe(1)
    await revokeTx.query('COMMIT')

    const order = await kitchen.from('orders')
      .select('status, delivered_at, delivered_by_user_id').eq('id', orderId).single()
    const events = await kitchen.from('order_events')
      .select('actor_user_id,occurred_at,previous_value,new_value')
      .eq('order_id', orderId).eq('event_type', 'ORDER_DELIVERED')
    expect(order.error).toBeNull()
    expect(order.data?.status).toBe('DELIVERED')
    expect(order.data?.delivered_by_user_id).toBe(temp.id)
    expect(order.data?.delivered_at).toBeTruthy()
    expect(events.error).toBeNull()
    expect(events.data).toHaveLength(1)
    expect(events.data?.[0]).toMatchObject({
      actor_user_id: temp.id, occurred_at: order.data?.delivered_at,
      previous_value: { status: 'DISPATCHED' }, new_value: { status: 'DELIVERED' },
    })
    expect((await temp.client.rpc('confirm_order_receipt', { p_order_id: orderId })).error?.code)
      .toBe('42501')
  } finally {
    await receiptTx.query('ROLLBACK').catch(() => undefined)
    await revokeTx.query('ROLLBACK').catch(() => undefined)
    await revokeAttempt?.catch(() => undefined)
    await Promise.allSettled([receiptTx.end(), revokeTx.end(), observer.end()])
    if (orderId) await cleanupExactOrder(admin, orderId)
    await temp.client.auth.signOut({ scope: 'local' })
    await cleanupTemporaryCustomer(admin, temp.id)
    await Promise.allSettled([owner, kitchen].map((c) => c.auth.signOut({ scope: 'local' })))
  }
})
