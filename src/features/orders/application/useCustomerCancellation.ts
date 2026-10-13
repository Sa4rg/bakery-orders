import {
  useRef,
  useState,
} from 'react'
import type { CancelCustomerOrderInput } from '../domain/cancelCustomerOrderSchema'
import type { CustomerCancellationGateway } from './customerCancellationGateway'

export type CustomerCancellationStatus =
  | 'idle'
  | 'cancelling'
  | 'error'
  | 'cancelled'

interface UseCustomerCancellationParams {
  gateway: CustomerCancellationGateway
}

export function useCustomerCancellation({
  gateway,
}: UseCustomerCancellationParams) {
  const pendingRef = useRef(false)

  const [status, setStatus] =
    useState<CustomerCancellationStatus>(
      'idle',
    )

  async function cancel(
    input: CancelCustomerOrderInput,
  ): Promise<boolean> {
    if (pendingRef.current) {
      return false
    }

    pendingRef.current = true
    setStatus('cancelling')

    try {
      await gateway.cancelOrder(input)
      setStatus('cancelled')
      return true
    } catch {
      setStatus('error')
      return false
    } finally {
      pendingRef.current = false
    }
  }

  function clearError() {
    setStatus((current) =>
      current === 'error'
        ? 'idle'
        : current,
    )
  }

  return {
    status,
    cancel,
    clearError,
  }
}