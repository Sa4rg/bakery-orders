import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { describe, expect, it } from 'vitest'
import {
  CreateOrderError,
  CreateOrderValidationError,
} from '../application/createOrderGateway'
import { createSupabaseCreateOrderGateway } from './createSupabaseCreateOrderGateway'

const businessId = '10000000-0000-4000-8000-000000000001'
const productId = '20000000-0000-4000-8000-000000000001'
const idempotencyKey = '30000000-0000-4000-8000-000000000001'
const orderId = '40000000-0000-4000-8000-000000000001'

interface RpcCall {
  functionName: string
  args: unknown
}

interface RpcResult {
  data: string | null
  error: { message: string } | null
}

function createFakeSupabaseClient(
  result: RpcResult = {
    data: orderId,
    error: null,
  },
) {
  const calls: RpcCall[] = []

  const client = {
    rpc(functionName: string, args: unknown) {
      calls.push({ functionName, args })
      return Promise.resolve(result)
    },
  }

  return {
    client: client as unknown as SupabaseBrowserClient,
    calls,
  }
}

describe('createSupabaseCreateOrderGateway', () => {
  it('maps only the approved application fields to create_order', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseCreateOrderGateway(client)

    const persistedOrderId = await gateway.createOrder({
      businessId,
      requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
      customerNotes: 'Leave at reception.',
      idempotencyKey,
      items: [
        {
          productId,
          requestedQuantity: 1.5,
        },
      ],
    })

    expect(persistedOrderId).toBe(orderId)

    expect(calls).toEqual([
      {
        functionName: 'create_order',
        args: {
          p_business_id: businessId,
          p_requested_delivery_at: '2026-10-15T10:30:00.000Z',
          p_customer_notes: 'Leave at reception.',
          p_idempotency_key: idempotencyKey,
          p_items: [
            {
              product_id: productId,
              requested_quantity: 1.5,
            },
          ],
        },
      },
    ])

    expect(JSON.stringify(calls[0]?.args)).not.toMatch(
      /status|created_by|actor|prepared|unavailable|snapshot|occurred_at/i,
    )
  })

  it('supports nullable customer notes', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseCreateOrderGateway(client)

    await gateway.createOrder({
      businessId,
      requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
      customerNotes: null,
      idempotencyKey,
      items: [
        {
          productId,
          requestedQuantity: 1,
        },
      ],
    })

    expect(calls[0]?.args).toMatchObject({
      p_customer_notes: null,
    })
  })

  it('rejects invalid application input before calling Supabase', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseCreateOrderGateway(client)

    await expect(
      gateway.createOrder({
        businessId: 'not-a-uuid',
        requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
        customerNotes: null,
        idempotencyKey,
        items: [
          {
            productId,
            requestedQuantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(CreateOrderValidationError)

    expect(calls).toHaveLength(0)
  })

  it('rejects mass-assignment fields before calling Supabase', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseCreateOrderGateway(client)

    const unsafeInput = {
      businessId,
      requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
      customerNotes: null,
      idempotencyKey,
      status: 'DELIVERED',
      items: [
        {
          productId,
          requestedQuantity: 1,
          preparedQuantity: 1,
          actorUserId: '50000000-0000-4000-8000-000000000001',
        },
      ],
    }

    await expect(
      gateway.createOrder(
        unsafeInput as Parameters<typeof gateway.createOrder>[0],
      ),
    ).rejects.toBeInstanceOf(CreateOrderValidationError)

    expect(calls).toHaveLength(0)
  })

  it('converts provider failures into a safe application error', async () => {
    const { client } = createFakeSupabaseClient({
      data: null,
      error: {
        message:
          'PostgREST SQLSTATE 42501: Order creation is not allowed.',
      },
    })

    const gateway = createSupabaseCreateOrderGateway(client)

    const failure = await gateway
      .createOrder({
        businessId,
        requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
        customerNotes: null,
        idempotencyKey,
        items: [
          {
            productId,
            requestedQuantity: 1,
          },
        ],
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CreateOrderError)
    expect(failure).toMatchObject({
      message: 'Unable to create order.',
    })

    expect(String(failure)).not.toContain('PostgREST')
    expect(String(failure)).not.toContain('42501')
    expect(String(failure)).not.toContain(
      'Order creation is not allowed.',
    )
  })

  it('treats a missing persisted Order id as a safe failure', async () => {
    const { client } = createFakeSupabaseClient({
      data: null,
      error: null,
    })

    const gateway = createSupabaseCreateOrderGateway(client)

    await expect(
      gateway.createOrder({
        businessId,
        requestedDeliveryAt: '2026-10-15T10:30:00.000Z',
        customerNotes: null,
        idempotencyKey,
        items: [
          {
            productId,
            requestedQuantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(CreateOrderError)
  })
})