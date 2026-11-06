import { expect, test } from '@playwright/test'
import { createSupabaseCustomerReceiptGateway } from '../src/features/tracking/data/createSupabaseCustomerReceiptGateway.ts'
import { createDispatchedReceiptFixture, receiptTestSignIn } from './support/receiptOrderFixture.ts'

for (const partial of [false, true]) {
  test(`M5-005 real JWT ${partial ? 'PARTIAL' : 'COMPLETE'} receipt is trusted and audited exactly once`, async () => {
    const customer = await receiptTestSignIn('customerA')
    const otherBusiness = await receiptTestSignIn('customerB')
    const kitchen = await receiptTestSignIn('kitchen')
    const manager = await receiptTestSignIn('manager')
    try {
      const { orderId, itemId } = await createDispatchedReceiptFixture(customer, kitchen, partial)
      // Authorization is established by the DB, not by a frontend role check.
      for (const actor of [otherBusiness, kitchen, manager]) {
        const rejected = await actor.rpc('confirm_order_receipt', { p_order_id: orderId })
        expect(rejected.error?.code).toBe('42501')
      }
      expect((await customer.rpc('confirm_order_receipt', {
        p_order_id: 'c5200000-0000-4000-8000-000000000099',
      })).error?.code).toBe('42501')

      await createSupabaseCustomerReceiptGateway(customer).confirmReceipt(orderId)
      const retry = await customer.rpc('confirm_order_receipt', { p_order_id: orderId })
      expect(retry.error?.code).toBe('22023')

      const saved = await kitchen.from('orders')
        .select('status, delivered_at, delivered_by_user_id, updated_at, dispatched_at, dispatched_by_user_id')
        .eq('id', orderId).single()
      expect(saved.error).toBeNull()
      expect(saved.data?.status).toBe('DELIVERED')
      expect(saved.data?.delivered_at).toBeTruthy()
      expect(saved.data?.updated_at).toBe(saved.data?.delivered_at)
      expect(saved.data?.dispatched_at).toBeTruthy()
      const actor = await customer.auth.getUser()
      expect(actor.error).toBeNull()
      expect(saved.data?.delivered_by_user_id).toBe(actor.data.user?.id)

      const audit = await kitchen.from('order_events')
        .select('event_type, actor_user_id, occurred_at, order_item_id, previous_value, new_value, metadata')
        .eq('order_id', orderId).eq('event_type', 'ORDER_DELIVERED')
      expect(audit.error).toBeNull()
      expect(audit.data).toHaveLength(1)
      expect(audit.data?.[0]).toMatchObject({
        event_type: 'ORDER_DELIVERED', actor_user_id: actor.data.user?.id,
        occurred_at: saved.data?.delivered_at, order_item_id: null,
        previous_value: { status: 'DISPATCHED' },
        new_value: { status: 'DELIVERED' }, metadata: {},
      })
      const orderItem = await kitchen.from('order_items')
        .select('requested_quantity, prepared_quantity, unavailable_quantity').eq('id', itemId).single()
      expect(orderItem.error).toBeNull()
      expect(orderItem.data).toMatchObject({ requested_quantity: 3,
        prepared_quantity: partial ? 1 : 3, unavailable_quantity: partial ? 2 : 0 })
      const unauthorizedAudit = await customer.from('order_events').select('event_type').eq('order_id', orderId)
      expect(unauthorizedAudit.error).toBeNull()
      expect(unauthorizedAudit.data).toEqual([])
      const ownTracking = await customer.from('orders').select('status').eq('id', orderId).single()
      expect(ownTracking.data?.status).toBe('DELIVERED')
      const foreignTracking = await otherBusiness.from('orders').select('id').eq('id', orderId)
      expect(foreignTracking.data).toEqual([])
    } finally {
      await Promise.allSettled([customer, otherBusiness, kitchen, manager]
        .map((client) => client.auth.signOut({ scope: 'local' })))
    }
  })
}

test('M5-005 concurrent CUSTOMER confirmations serialize into one delivery audit event', async () => {
  const customerA = await receiptTestSignIn('customerA')
  const customerB = await receiptTestSignIn('customerA')
  const kitchen = await receiptTestSignIn('kitchen')
  try {
    const { orderId } = await createDispatchedReceiptFixture(customerA, kitchen, true)
    const attempts = await Promise.all([
      customerA.rpc('confirm_order_receipt', { p_order_id: orderId }),
      customerB.rpc('confirm_order_receipt', { p_order_id: orderId }),
    ])
    expect(attempts.filter((attempt) => attempt.error === null)).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.error?.code === '22023')).toHaveLength(1)
    const order = await kitchen.from('orders')
      .select('status, delivered_at, delivered_by_user_id').eq('id', orderId).single()
    expect(order.data?.status).toBe('DELIVERED')
    const events = await kitchen.from('order_events')
      .select('occurred_at, actor_user_id').eq('order_id', orderId).eq('event_type', 'ORDER_DELIVERED')
    expect(events.data).toHaveLength(1)
    expect(events.data?.[0]?.occurred_at).toBe(order.data?.delivered_at)
    expect(events.data?.[0]?.actor_user_id).toBe(order.data?.delivered_by_user_id)
  } finally {
    await Promise.allSettled([customerA, customerB, kitchen]
      .map((client) => client.auth.signOut({ scope: 'local' })))
  }
})
