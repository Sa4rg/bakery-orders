import {
  useRef,
  useState,
} from 'react'
import type { CartItem } from '../../cart/domain/cart'
import type { OrderReviewDraft } from '../domain/orderReviewDraftSchema'
import type { CreateOrderGateway } from './createOrderGateway'
import {
  prepareCreateOrderAttempt,
  type OrderSubmissionAttempt,
} from './prepareCreateOrderAttempt'

export type CreateOrderSubmissionStatus =
  | 'idle'
  | 'submitting'
  | 'error'

interface UseCreateOrderSubmissionParams {
  gateway: CreateOrderGateway
  businessId: string
  createIdempotencyKey?: () => string
}

export function useCreateOrderSubmission({
  gateway,
  businessId,
  createIdempotencyKey,
}: UseCreateOrderSubmissionParams) {
  const attemptRef =
    useRef<OrderSubmissionAttempt | null>(null)

  const pendingRef = useRef(false)

  const [status, setStatus] =
    useState<CreateOrderSubmissionStatus>(
      'idle',
    )

  async function submit(
    items: CartItem[],
    reviewDraft: OrderReviewDraft,
  ): Promise<string | null> {
    if (pendingRef.current) {
      return null
    }

    pendingRef.current = true
    setStatus('submitting')

    try {
      const prepared =
        prepareCreateOrderAttempt({
          currentAttempt:
            attemptRef.current,
          businessId,
          items,
          reviewDraft,
          createIdempotencyKey,
        })

      /*
       * Store the attempt BEFORE awaiting the provider.
       *
       * If PostgreSQL commits successfully but the browser
       * loses the response, the next retry must reuse the
       * same idempotency key.
       */
      attemptRef.current =
        prepared.attempt

      const orderId =
        await gateway.createOrder(
          prepared.input,
        )

      /*
       * Persistence succeeded. This logical attempt is now
       * complete and a future intentional order may use a
       * fresh key.
       */
      attemptRef.current = null

      setStatus('idle')

      return orderId
    } catch {
      /*
       * Keep attemptRef intact so a retry of the same
       * logical payload reuses its idempotency key.
       */
      setStatus('error')

      return null
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
    submit,
    clearError,
  }
}