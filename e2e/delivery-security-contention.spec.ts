import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import { customerOrderingFixture, fixtureBusinesses } from './support/fixtures.ts'
import { createDispatchedReceiptFixture, receiptTestSignIn } from './support/receiptOrderFixture.ts'
import { contend } from './support/pgContention.ts'

async function createReadyOrder(customer: SupabaseBrowserClient, kitchen: SupabaseBrowserClient) {
  const delivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)
  const created = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_idempotency_key: randomUUID(),
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'M5-006 distinct-actor dispatch security',
    p_items: [{ product_id: customerOrderingFixture.productId, requested_quantity: 3 }],
  })
  expect(created.error).toBeNull()
  if (!created.data) throw new Error('M5-006 fixture Order was not created')
  const orderId = created.data
  const item = await kitchen.from('order_items').select('id').eq('order_id', orderId).single()
  expect(item.error).toBeNull()
  if (!item.data) throw new Error('M5-006 fixture OrderItem missing')
  const commands = createSupabaseKitchenProductionCommandGateway(kitchen)
  await commands.startOrder(orderId)
  await commands.recordPreparedQuantity(item.data.id, 3000)
  await commands.markOrderReady(orderId)
  return { orderId, itemId: item.data.id }
}

async function getActorId(client: SupabaseBrowserClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  expect(error).toBeNull()
  if (!data.user) throw new Error('Expected an authenticated E2E actor')
  return data.user.id
}

async function assertSingleTransition(
  kitchen: SupabaseBrowserClient,
  orderId: string,
  eventType: 'ORDER_DISPATCHED' | 'ORDER_DELIVERED',
  from: 'READY' | 'DISPATCHED',
  to: 'DISPATCHED' | 'DELIVERED',
  allowedActors: string[],
) {
  const order = await kitchen.from('orders')
    .select('status, updated_at, dispatched_at, dispatched_by_user_id, delivered_at, delivered_by_user_id')
    .eq('id', orderId).single()
  expect(order.error).toBeNull()
  expect(order.data?.status).toBe(to)
  const events = await kitchen.from('order_events')
    .select('actor_user_id, occurred_at, previous_value, new_value, event_type, order_item_id')
    .eq('order_id', orderId).eq('event_type', eventType)
  expect(events.error).toBeNull()
  expect(events.data).toHaveLength(1)
  const actor = to === 'DISPATCHED' ? order.data?.dispatched_by_user_id : order.data?.delivered_by_user_id
  const timestamp = to === 'DISPATCHED' ? order.data?.dispatched_at : order.data?.delivered_at
  expect(timestamp).toBeTruthy()
  expect(order.data?.updated_at).toBe(timestamp)
  expect(actor).toBeTruthy()
  expect(allowedActors).toContain(actor)
  expect(events.data?.[0]).toMatchObject({
    actor_user_id: actor,
    occurred_at: timestamp,
    previous_value: { status: from },
    new_value: { status: to },
    order_item_id: null,
  })
}

test('M5-006 two DISTINCT KITCHEN actors contend for dispatch: winner owns the only audit', async () => {
  test.setTimeout(60_000)
  const customer = await receiptTestSignIn('customerA')
  const kitchenA = await receiptTestSignIn('kitchen')
  const kitchenB = await receiptTestSignIn('kitchenSecond')
  try {
    const [actorA, actorB] = await Promise.all([getActorId(kitchenA), getActorId(kitchenB)])
    expect(actorA).not.toBe(actorB)
    const { orderId } = await createReadyOrder(customer, kitchenA)
    const command = { sql: 'SELECT public.dispatch_order($1::uuid)', args: [orderId] }

    // Two different authenticated actor identities in independent DB sessions.
    // contend() proves via pg_blocking_pids() that the second is actually blocked.
    const { first, second } = await contend({
      orderId, firstActorId: actorA, secondActorId: actorB,
      firstCommand: command, secondCommand: command, applicationName: 'm5_006_dispatch',
    })
    expect(first).toEqual({ ok: true, code: null })
    expect(second).toEqual({ ok: false, code: '22023' })
    await assertSingleTransition(kitchenA, orderId, 'ORDER_DISPATCHED', 'READY', 'DISPATCHED', [actorA])

    // Separate real JWT/PostgREST verification: the losing actor cannot replay.
    expect((await kitchenB.rpc('dispatch_order', { p_order_id: orderId })).error?.code).toBe('22023')
    await assertSingleTransition(kitchenA, orderId, 'ORDER_DISPATCHED', 'READY', 'DISPATCHED', [actorA])
  } finally {
    await Promise.allSettled([customer, kitchenA, kitchenB].map((c) => c.auth.signOut({ scope: 'local' })))
  }
})

test('M5-006 two DISTINCT CUSTOMER members contend for receipt: winner owns the only audit', async () => {
  test.setTimeout(60_000)
  const customerA = await receiptTestSignIn('customerA')
  const colleague = await receiptTestSignIn('customerAColleague')
  const kitchen = await receiptTestSignIn('kitchen')
  try {
    const [actorA, actorB] = await Promise.all([getActorId(customerA), getActorId(colleague)])
    expect(actorA).not.toBe(actorB)
    const { orderId } = await createDispatchedReceiptFixture(customerA, kitchen, true)
    const command = { sql: 'SELECT public.confirm_order_receipt($1::uuid)', args: [orderId] }
    const { first, second } = await contend({
      orderId, firstActorId: actorA, secondActorId: actorB,
      firstCommand: command, secondCommand: command, applicationName: 'm5_006_receipt',
    })
    expect(first).toEqual({ ok: true, code: null })
    expect(second).toEqual({ ok: false, code: '22023' })
    await assertSingleTransition(kitchen, orderId, 'ORDER_DELIVERED', 'DISPATCHED', 'DELIVERED', [actorA])

    const dispatch = await kitchen.from('order_events').select('actor_user_id,occurred_at')
      .eq('order_id', orderId).eq('event_type', 'ORDER_DISPATCHED')
    const order = await kitchen.from('orders')
      .select('dispatched_at,dispatched_by_user_id').eq('id', orderId).single()
    expect(dispatch.error).toBeNull()
    expect(dispatch.data).toHaveLength(1)
    expect(dispatch.data?.[0]?.actor_user_id).toBe(order.data?.dispatched_by_user_id)
    expect(dispatch.data?.[0]?.occurred_at).toBe(order.data?.dispatched_at)

    expect((await colleague.rpc('confirm_order_receipt', { p_order_id: orderId })).error?.code)
      .toBe('22023')
    await assertSingleTransition(kitchen, orderId, 'ORDER_DELIVERED', 'DISPATCHED', 'DELIVERED', [actorA])
  } finally {
    await Promise.allSettled([customerA, colleague, kitchen].map((c) => c.auth.signOut({ scope: 'local' })))
  }
})

test('M5-006 CUSTOMER cannot write Order lifecycle or forge audit via real HTTP JWT', async () => {
  const customer = await receiptTestSignIn('customerA')
  const kitchen = await receiptTestSignIn('kitchen')
  try {
    const { orderId } = await createReadyOrder(customer, kitchen)
    const direct = await customer.from('orders').update({ status: 'DELIVERED' }).eq('id', orderId)
    // Lack of UPDATE privilege can surface as an error or zero affected rows;
    // always inspect authoritative persisted state, never only response.error.
    if (direct.error) expect(direct.error.code).toBeTruthy()
    const order = await kitchen.from('orders').select('status,delivered_at').eq('id', orderId).single()
    expect(order.error).toBeNull()
    expect(order.data).toMatchObject({ status: 'READY', delivered_at: null })
    const forged = await customer.from('order_events').insert({
      order_id: orderId,
      actor_user_id: await getActorId(customer),
      event_type: 'ORDER_DELIVERED',
      previous_value: { status: 'DISPATCHED' },
      new_value: { status: 'DELIVERED' },
      metadata: {},
    })
    expect(forged.error).not.toBeNull()
    const history = await kitchen.from('order_events').select('id')
      .eq('order_id', orderId).in('event_type', ['ORDER_DISPATCHED', 'ORDER_DELIVERED'])
    expect(history.error).toBeNull()
    expect(history.data).toEqual([])
  } finally {
    await Promise.allSettled([customer, kitchen].map((c) => c.auth.signOut({ scope: 'local' })))
  }
})
