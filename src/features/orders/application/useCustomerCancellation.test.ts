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
import type { CustomerCancellationGateway } from './customerCancellationGateway'
import { useCustomerCancellation } from './useCustomerCancellation'

const input = {
  orderId:
    '90000000-0000-4000-8000-000000000001',
  reason: 'Customer requirements changed.',
}

describe('useCustomerCancellation', () => {
  it('reports successful cancellation', async () => {
    const cancelOrder =
      vi.fn<
        CustomerCancellationGateway['cancelOrder']
      >()

    cancelOrder.mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useCustomerCancellation({
        gateway: { cancelOrder },
      }),
    )

    let succeeded = false

    await act(async () => {
      succeeded =
        await result.current.cancel(input)
    })

    expect(succeeded).toBe(true)
    expect(cancelOrder).toHaveBeenCalledWith(
      input,
    )
    expect(result.current.status).toBe(
      'cancelled',
    )
  })

  it('exposes only a safe failure state', async () => {
    const cancelOrder =
      vi.fn<
        CustomerCancellationGateway['cancelOrder']
      >()

    cancelOrder.mockRejectedValue(
      new Error(
        'sensitive database provider details',
      ),
    )

    const { result } = renderHook(() =>
      useCustomerCancellation({
        gateway: { cancelOrder },
      }),
    )

    let succeeded = true

    await act(async () => {
      succeeded =
        await result.current.cancel(input)
    })

    expect(succeeded).toBe(false)
    expect(result.current.status).toBe(
      'error',
    )
  })

  it('blocks a concurrent second cancellation request', async () => {
    let resolveCancellation:
      | (() => void)
      | undefined

    const pending =
      new Promise<void>((resolve) => {
        resolveCancellation = resolve
      })

    const cancelOrder =
      vi.fn<
        CustomerCancellationGateway['cancelOrder']
      >()

    cancelOrder.mockReturnValue(pending)

    const { result } = renderHook(() =>
      useCustomerCancellation({
        gateway: { cancelOrder },
      }),
    )

    let first:
      | Promise<boolean>
      | undefined

    act(() => {
      first =
        result.current.cancel(input)
    })

    expect(result.current.status).toBe(
      'cancelling',
    )

    let second = true

    await act(async () => {
      second =
        await result.current.cancel(input)
    })

    expect(second).toBe(false)
    expect(cancelOrder).toHaveBeenCalledTimes(
      1,
    )

    await act(async () => {
      resolveCancellation?.()
      await first
    })

    expect(result.current.status).toBe(
      'cancelled',
    )
  })
})