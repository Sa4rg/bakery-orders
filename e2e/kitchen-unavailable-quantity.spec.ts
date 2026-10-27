import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import type { SupabaseBrowserClient } from '../src/lib/supabase/client.ts'
import {
  KitchenUnavailableQuantityCommandError,
  KitchenUnavailableQuantityValidationError,
} from '../src/features/production/application/kitchenProductionCommandGateway.ts'
import { createSupabaseKitchenProductionCommandGateway } from '../src/features/production/data/createSupabaseKitchenProductionCommandGateway.ts'
import { createSupabaseKitchenOrderQueryGateway } from '../src/features/production/data/createSupabaseKitchenOrderQueryGateway.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
  fixtureCredentials,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

type Actor = 'customerA' | 'kitchen' | 'manager'

/** Real JWT identities. Privileged setup is isolated to E2E global fixtures. */
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
    p_customer_notes: 'E2E M4-005 unavailable quantity',
    p_idempotency_key: randomUUID(),
    p_items: [{
      product_id: customerOrderingFixture.productId,
      requested_quantity: 3,
    }],
  })
  expect(error, 'Failed to create fixture Order').toBeNull()
  expect(data).toBeTruthy()
  return data!
}

test('KITCHEN records reasoned unavailable deltas, shares remaining with preparation and preserves audit', async () => {
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

    // Reject quantity reductions before preparation starts.
    await expect(command.recordUnavailableQuantity(item.id, 1000, 'Missing ingredients'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityCommandError)

    // Confirm backend permission checks with real CUSTOMER/MANAGER JWTs.
    const deniedCustomer = await customer.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id,
      p_quantity: 1,
      p_reason: 'Missing ingredients',
    })
    expect(deniedCustomer.error?.code).toBe('42501')
    const deniedManager = await manager.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id,
      p_quantity: 1,
      p_reason: 'Missing ingredients',
    })
    expect(deniedManager.error?.code).toBe('42501')

    await command.startOrder(orderId)

    // Local input validation: no provider call for these invalid inputs.
    await expect(command.recordUnavailableQuantity(item.id, 0, 'Shortage'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    await expect(command.recordUnavailableQuantity(item.id, 1000.5, 'Shortage'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    await expect(command.recordUnavailableQuantity(item.id, 1000, ' \t\r\n '))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)
    await expect(command.recordUnavailableQuantity('invalid-id', 1000, 'Shortage'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityValidationError)

    // PostgreSQL must independently reject bad reasons and quantities.
    const blankReason = await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id, p_quantity: 1, p_reason: ' \t\r\n ',
    })
    expect(blankReason.error?.code).toBe('22023')
    const nullReason = await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id, p_quantity: 1, p_reason: null as unknown as string,
    })
    expect(nullReason.error?.code).toBe('22023')
    const wrongStep = await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id, p_quantity: 0.5, p_reason: 'Shortage',
    })
    expect(wrongStep.error?.code).toBe('22023')
    const excessPrecision = await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id, p_quantity: 0.0005, p_reason: 'Shortage',
    })
    expect(excessPrecision.error?.code).toBe('22023')
    const overRemaining = await kitchen.rpc('record_unavailable_quantity', {
      p_order_item_id: item.id, p_quantity: 4, p_reason: 'Shortage',
    })
    expect(overRemaining.error?.code).toBe('22023')

    const beforeEvents = await kitchen.from('order_events')
      .select('id').eq('order_id', orderId).eq('event_type', 'QUANTITY_UNAVAILABLE')
    expect(beforeEvents.error).toBeNull()
    expect(beforeEvents.data).toEqual([])

    // Two successful incremental shortages, each with its own audit reason.
    await command.recordUnavailableQuantity(item.id, 1000, '  Ingredient shortage  ')
    const afterFirst = await query.loadProductionOrder(orderId)
    expect(afterFirst?.status).toBe('IN_PROGRESS')
    expect(afterFirst?.items[0]?.unavailableThousandths).toBe(1000)
    expect(afterFirst?.items[0]?.remainingThousandths).toBe(2000)

    await command.recordUnavailableQuantity(item.id, 1000, 'Supplier shortfall')
    const afterSecond = await query.loadProductionOrder(orderId)
    expect(afterSecond?.items[0]?.unavailableThousandths).toBe(2000)
    expect(afterSecond?.items[0]?.remainingThousandths).toBe(1000)

    const unavailableEvents = await kitchen.from('order_events')
      .select('order_id, order_item_id, actor_user_id, event_type, reason, occurred_at, previous_value, new_value, metadata')
      .eq('order_id', orderId)
      .eq('event_type', 'QUANTITY_UNAVAILABLE')
      .order('occurred_at', { ascending: true })
    expect(unavailableEvents.error).toBeNull()
    expect(unavailableEvents.data).toHaveLength(2)
    const [first, second] = unavailableEvents.data ?? []
    expect(first).toMatchObject({
      order_id: orderId,
      order_item_id: item.id,
      actor_user_id: kitchenId,
      event_type: 'QUANTITY_UNAVAILABLE',
      reason: 'Ingredient shortage',
      previous_value: { unavailable_quantity: 0 },
      new_value: { unavailable_quantity: 1 },
      metadata: { quantity_delta: 1 },
    })
    expect(second).toMatchObject({
      order_id: orderId,
      order_item_id: item.id,
      actor_user_id: kitchenId,
      event_type: 'QUANTITY_UNAVAILABLE',
      reason: 'Supplier shortfall',
      previous_value: { unavailable_quantity: 1 },
      new_value: { unavailable_quantity: 2 },
      metadata: { quantity_delta: 1 },
    })
    expect(first?.occurred_at).toBeTruthy()
    expect(second?.occurred_at).toBeTruthy()

    // Existing prepared command consumes the same remaining quantity.
    await command.recordPreparedQuantity(item.id, 1000)
    const afterPrepared = await query.loadProductionOrder(orderId)
    expect(afterPrepared?.status).toBe('IN_PROGRESS')
    expect(afterPrepared?.items[0]).toMatchObject({
      requestedThousandths: 3000,
      preparedThousandths: 1000,
      unavailableThousandths: 2000,
      remainingThousandths: 0,
      productName: item.productName,
      quantityStepThousandths: item.quantityStepThousandths,
    })

    const finalItem = await kitchen.from('order_items')
      .select('requested_quantity, prepared_quantity, unavailable_quantity, quantity_step_snapshot')
      .eq('id', item.id).single()
    expect(finalItem.error).toBeNull()
    expect(finalItem.data).toMatchObject({
      requested_quantity: 3,
      prepared_quantity: 1,
      unavailable_quantity: 2,
      quantity_step_snapshot: 1,
    })
    await expect(command.recordUnavailableQuantity(item.id, 1000, 'Too late'))
      .rejects.toBeInstanceOf(KitchenUnavailableQuantityCommandError)

    const finalEvents = await kitchen.from('order_events')
      .select('id').eq('order_id', orderId).eq('event_type', 'QUANTITY_UNAVAILABLE')
    expect(finalEvents.error).toBeNull()
    expect(finalEvents.data).toHaveLength(2)

    // The audit table is not directly readable by CUSTOMER, even for their own Order.
    const customerAudit = await customer.from('order_events')
      .select('id').eq('order_id', orderId).eq('event_type', 'QUANTITY_UNAVAILABLE')
    expect(customerAudit.error).toBeNull()
    expect(customerAudit.data).toEqual([])

    // MANAGER can audit reasons without acquiring KITCHEN mutation rights.
    const managerAudit = await manager.from('order_events')
      .select('reason').eq('order_id', orderId).eq('event_type', 'QUANTITY_UNAVAILABLE')
    expect(managerAudit.error).toBeNull()
    expect(managerAudit.data?.map(({ reason }) => reason).sort()).toEqual([
      'Ingredient shortage', 'Supplier shortfall',
    ])
  } finally {
    await Promise.allSettled([
      customer.auth.signOut({ scope: 'local' }),
      kitchen.auth.signOut({ scope: 'local' }),
      manager.auth.signOut({ scope: 'local' }),
    ])
  }
})
