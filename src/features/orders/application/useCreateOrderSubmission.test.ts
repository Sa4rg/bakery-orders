import {
  act,
  renderHook,
} from '@testing-library/react'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { CartItem } from '../../cart/domain/cart'
import type { CreateOrderGateway } from './createOrderGateway'
import { useCreateOrderSubmission } from './useCreateOrderSubmission'

const businessId =
  '10000000-0000-4000-8000-000000000001'

const firstIdempotencyKey =
  '20000000-0000-4000-8000-000000000001'

const secondIdempotencyKey =
  '20000000-0000-4000-8000-000000000002'

const persistedOrderId =
  '90000000-0000-4000-8000-000000000001'

const items: CartItem[] = [
  {
    productId:
      '30000000-0000-4000-8000-000000000001',
    productName: 'Country Sourdough',
    unitCode: 'UNIT',
    quantityStep: 1,
    requestedQuantity: 2,
  },
]

const reviewDraft = {
  requestedDeliveryAtLocal:
    '2026-10-18T08:15',
  customerNotes: '',
}

describe('useCreateOrderSubmission', () => {
  it('submits through CreateOrderGateway and returns the persisted Order id', async () => {
    const createOrder =
      vi.fn<CreateOrderGateway['createOrder']>()

    createOrder.mockResolvedValue(
      persistedOrderId,
    )

    const { result } = renderHook(() =>
      useCreateOrderSubmission({
        gateway: { createOrder },
        businessId,
        createIdempotencyKey: () =>
          firstIdempotencyKey,
      }),
    )

    let orderId: string | null = null

    await act(async () => {
      orderId = await result.current.submit(
        items,
        reviewDraft,
      )
    })

    expect(orderId).toBe(persistedOrderId)
    expect(createOrder).toHaveBeenCalledTimes(1)

    expect(
      createOrder.mock.calls[0]?.[0],
    ).toMatchObject({
      businessId,
      idempotencyKey:
        firstIdempotencyKey,
      customerNotes: null,
      items: [
        {
          productId:
            '30000000-0000-4000-8000-000000000001',
          requestedQuantity: 2,
        },
      ],
    })

    expect(result.current.status).toBe('idle')
  })

  it('exposes only a safe application failure state', async () => {
    const createOrder =
      vi.fn<CreateOrderGateway['createOrder']>()

    createOrder.mockRejectedValue(
      new Error(
        'provider details that must never reach the UI',
      ),
    )

    const { result } = renderHook(() =>
      useCreateOrderSubmission({
        gateway: { createOrder },
        businessId,
        createIdempotencyKey: () =>
          firstIdempotencyKey,
      }),
    )

    let orderId: string | null = null

    await act(async () => {
      orderId = await result.current.submit(
        items,
        reviewDraft,
      )
    })

    expect(orderId).toBeNull()
    expect(result.current.status).toBe('error')
  })

  it('reuses the same idempotency key when a failed logical submission is retried', async () => {
    const createOrder =
      vi.fn<CreateOrderGateway['createOrder']>()

    createOrder
      .mockRejectedValueOnce(
        new Error('network failure'),
      )
      .mockResolvedValueOnce(
        persistedOrderId,
      )

    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(
        firstIdempotencyKey,
      )
      .mockReturnValueOnce(
        secondIdempotencyKey,
      )

    const { result } = renderHook(() =>
      useCreateOrderSubmission({
        gateway: { createOrder },
        businessId,
        createIdempotencyKey,
      }),
    )

    await act(async () => {
      await result.current.submit(
        items,
        reviewDraft,
      )
    })

    expect(result.current.status).toBe('error')

    await act(async () => {
      await result.current.submit(
        items,
        reviewDraft,
      )
    })

    expect(createOrder).toHaveBeenCalledTimes(2)

    expect(
      createOrder.mock.calls[0]?.[0]
        .idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(
      createOrder.mock.calls[1]?.[0]
        .idempotencyKey,
    ).toBe(firstIdempotencyKey)

    expect(
      createIdempotencyKey,
    ).toHaveBeenCalledTimes(1)
  })

  it('blocks a concurrent second submission while the first request is pending', async () => {
    let resolveOrder:
      | ((orderId: string) => void)
      | undefined

    const pendingOrder = new Promise<string>(
      (resolve) => {
        resolveOrder = resolve
      },
    )

    const createOrder =
      vi.fn<CreateOrderGateway['createOrder']>()

    createOrder.mockReturnValue(pendingOrder)

    const { result } = renderHook(() =>
      useCreateOrderSubmission({
        gateway: { createOrder },
        businessId,
        createIdempotencyKey: () =>
          firstIdempotencyKey,
      }),
    )

    let firstSubmission:
      | Promise<string | null>
      | undefined

    act(() => {
      firstSubmission =
        result.current.submit(
          items,
          reviewDraft,
        )
    })

    expect(result.current.status).toBe(
      'submitting',
    )

    let secondResult:
      | string
      | null
      | undefined

    await act(async () => {
      secondResult =
        await result.current.submit(
          items,
          reviewDraft,
        )
    })

    expect(secondResult).toBeNull()
    expect(createOrder).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveOrder?.(persistedOrderId)
      await firstSubmission
    })

    expect(result.current.status).toBe('idle')
  })
})