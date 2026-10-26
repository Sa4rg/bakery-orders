import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import {
  KitchenPreparedQuantityCommandError,
  KitchenPreparedQuantityValidationError,
} from '../src/features/orders/application/kitchenProductionCommandGateway.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/orders/data/createSupabaseKitchenProductionCommandGateway.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/orders/data/createSupabaseKitchenOrderQueryGateway.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
  fixtureCredentials,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'kitchen' | 'manager'

/** JWT-authenticated clients only. Privileged fixture provisioning stays in global setup. */
async function signedInClient(actor: Actor): Promise<{ client: SupabaseBrowserClient; userId: string }> {
  const { url, publishableKey } = getLocalSupabasePublicConfig()
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signInWithPassword(fixtureCredentials(actor))
  expect(error, `Unable to sign in as ${actor}`).toBeNull()
  if (!data.user?.id) {
    throw new Error(`Sign-in returned no user for ${actor}`)
  }
  return { client, userId: data.user.id }
}

async function createFixtureOrder(customer: SupabaseBrowserClient): Promise<string> {
  const delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  delivery.setUTCHours(10, 0, 0, 0)

  const { data, error } = await customer.rpc('create_order', {
    p_business_id: fixtureBusinesses.A.id,
    p_requested_delivery_at: delivery.toISOString(),
    p_customer_notes: 'E2E M4-004 prepared quantity',
    p_idempotency_key: randomUUID(),
    p_items: [{
      product_id: customerOrderingFixture.productId,
      requested_quantity: 3,
    }],
  })
  expect(error, 'Failed to create the fixture Order').toBeNull()
  expect(data).toBeTruthy()
  return data!
}

test('KITCHEN records exact prepared deltas, audits each operation and rejects forbidden writes', async () => {
  test.setTimeout(90_000)

  const { client: customer } = await signedInClient('customerA')
  const { client: kitchen, userId: kitchenId } = await signedInClient('kitchen')
  const { client: manager } = await signedInClient('manager')

  try {
    const orderId = await createFixtureOrder(customer)
    const command = createSupabaseKitchenProductionCommandGateway(kitchen)
    const query = createSupabaseKitchenOrderQueryGateway(kitchen)

    const initial = await query.loadProductionOrder(orderId)
    expect(initial?.status).toBe('RECEIVED')
    expect(initial?.items).toHaveLength(1)
    const item = initial!.items[0]!
    expect(item.requestedThousandths).toBe(3000)
    expect(item.quantityStepThousandths).toBe(1000)
    expect(item.preparedThousandths).toBe(0)
    expect(item.unavailableThousandths).toBe(0)

    // The command must reject preparation before start_order, not start the Order itself.
    await expect(command.recordPreparedQuantity(item.id, 1000))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityCommandError)

    // A real authenticated actor with the wrong role must be rejected by SQL.
    const deniedCustomer = await customer.rpc('record_prepared_quantity', {
      p_order_item_id: item.id,
      p_quantity: 1,
    })
    expect(deniedCustomer.error?.code).toBe('42501')

    const deniedManager = await manager.rpc('record_prepared_quantity', {
      p_order_item_id: item.id,
      p_quantity: 1,
    })
    expect(deniedManager.error?.code).toBe('42501')

    await command.startOrder(orderId)


    // Zero, fractional thousandths and item ID failures stop at the adapter boundary.
    await expect(command.recordPreparedQuantity(item.id, 0))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityValidationError)
    await expect(command.recordPreparedQuantity(item.id, 1000.5))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityValidationError)
    await expect(command.recordPreparedQuantity('invalid-id', 1000))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityValidationError)

    // Step alignment and excess quantities are trusted SQL invariants.
    const wrongStep = await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: item.id,
      p_quantity: 0.5,
    })
    expect(wrongStep.error?.code).toBe('22023')
    const excessive = await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: item.id,
      p_quantity: 4,
    })
    expect(excessive.error?.code).toBe('22023')
    const excessPrecision = await kitchen.rpc('record_prepared_quantity', {
      p_order_item_id: item.id,
      p_quantity: 0.0005,
    })
    expect(excessPrecision.error?.code).toBe('22023')

    // Each successful call records a distinct DELTA, never a replacement total.
    await command.recordPreparedQuantity(item.id, 1000)
    const afterFirst = await query.loadProductionOrder(orderId)
    expect(afterFirst?.status).toBe('IN_PROGRESS')
    expect(afterFirst?.items[0]?.preparedThousandths).toBe(1000)
    expect(afterFirst?.items[0]?.remainingThousandths).toBe(2000)

    await command.recordPreparedQuantity(item.id, 2000)
    const afterSecond = await query.loadProductionOrder(orderId)
    expect(afterSecond?.status).toBe('IN_PROGRESS')
    expect(afterSecond?.items[0]?.requestedThousandths).toBe(3000)
    expect(afterSecond?.items[0]?.preparedThousandths).toBe(3000)
    expect(afterSecond?.items[0]?.unavailableThousandths).toBe(0)
    expect(afterSecond?.items[0]?.remainingThousandths).toBe(0)
    expect(afterSecond?.items[0]?.productName).toBe(item.productName)
    expect(afterSecond?.items[0]?.quantityStepThousandths).toBe(item.quantityStepThousandths)

    const itemsResult = await kitchen.from('order_items')
      .select('requested_quantity, prepared_quantity, unavailable_quantity, quantity_step_snapshot, updated_at')
      .eq('id', item.id).single()
    expect(itemsResult.error).toBeNull()
    expect(itemsResult.data).toMatchObject({
      requested_quantity: 3,
      prepared_quantity: 3,
      unavailable_quantity: 0,
      quantity_step_snapshot: 1,
    })

    const eventsResult = await kitchen.from('order_events')
      .select('order_id, order_item_id, actor_user_id, event_type, occurred_at, previous_value, new_value, metadata, reason')
      .eq('order_id', orderId)
      .eq('event_type', 'QUANTITY_PREPARED')
      .order('occurred_at', { ascending: true })
    expect(eventsResult.error).toBeNull()
    expect(eventsResult.data).toHaveLength(2)
    const [first, second] = eventsResult.data ?? []

    expect(first).toMatchObject({
      order_id: orderId,
      order_item_id: item.id,
      actor_user_id: kitchenId,
      event_type: 'QUANTITY_PREPARED',
      reason: null,
      previous_value: { prepared_quantity: 0 },
      new_value: { prepared_quantity: 1 },
      metadata: { quantity_delta: 1 },
    })
    expect(second).toMatchObject({
      order_id: orderId,
      order_item_id: item.id,
      actor_user_id: kitchenId,
      event_type: 'QUANTITY_PREPARED',
      reason: null,
      previous_value: { prepared_quantity: 1 },
      new_value: { prepared_quantity: 3 },
      metadata: { quantity_delta: 2 },
    })
    expect(first?.occurred_at).toBeTruthy()
    expect(second?.occurred_at).toBe(itemsResult.data?.updated_at)

    // A repeated call after remaining is zero is rejected; no phantom audit event.
    await expect(command.recordPreparedQuantity(item.id, 1000))
      .rejects.toBeInstanceOf(KitchenPreparedQuantityCommandError)

    const finalItem = await kitchen.from('order_items')
      .select('prepared_quantity').eq('id', item.id).single()
    expect(finalItem.error).toBeNull()
    expect(finalItem.data?.prepared_quantity).toBe(3)
    const finalEvents = await kitchen.from('order_events')
      .select('id').eq('order_id', orderId).eq('event_type', 'QUANTITY_PREPARED')
    expect(finalEvents.error).toBeNull()
    expect(finalEvents.data).toHaveLength(2)
  } finally {
    await Promise.allSettled([
      customer.auth.signOut({ scope: 'local' }),
      kitchen.auth.signOut({ scope: 'local' }),
      manager.auth.signOut({ scope: 'local' }),
    ])
  }
})
