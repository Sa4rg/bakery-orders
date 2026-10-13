import type { CartItem } from '../../cart/domain/cart'
import type { CreateOrderInput } from '../domain/createOrderSchema'
import type { OrderReviewDraft } from '../domain/orderReviewDraftSchema'
import {
  buildCreateOrderInput,
} from './buildCreateOrderInput'

export interface OrderSubmissionAttempt {
  idempotencyKey: string
  fingerprint: string
}

interface PrepareCreateOrderAttemptParams {
  currentAttempt: OrderSubmissionAttempt | null
  businessId: string
  items: CartItem[]
  reviewDraft: OrderReviewDraft
  createIdempotencyKey?: () => string
}

interface PreparedCreateOrderAttempt {
  attempt: OrderSubmissionAttempt
  input: CreateOrderInput
}

function defaultCreateIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}

function buildFingerprint(
  input: CreateOrderInput,
): string {
  const canonicalItems = input.items
    .map((item) => ({
      productId: item.productId,
      requestedQuantity:
        item.requestedQuantity,
    }))
    .sort((left, right) =>
      left.productId.localeCompare(
        right.productId,
      ),
    )

  return JSON.stringify({
    businessId: input.businessId,
    requestedDeliveryAt:
      input.requestedDeliveryAt,
    customerNotes: input.customerNotes,
    items: canonicalItems,
  })
}

function createNewAttempt(
  params: Omit<
    PrepareCreateOrderAttemptParams,
    'currentAttempt'
  >,
): PreparedCreateOrderAttempt {
  const createIdempotencyKey =
    params.createIdempotencyKey ??
    defaultCreateIdempotencyKey

  const idempotencyKey =
    createIdempotencyKey()

  const input = buildCreateOrderInput({
    businessId: params.businessId,
    idempotencyKey,
    items: params.items,
    reviewDraft: params.reviewDraft,
  })

  return {
    attempt: {
      idempotencyKey,
      fingerprint: buildFingerprint(input),
    },
    input,
  }
}

export function prepareCreateOrderAttempt({
  currentAttempt,
  businessId,
  items,
  reviewDraft,
  createIdempotencyKey,
}: PrepareCreateOrderAttemptParams): PreparedCreateOrderAttempt {
  if (currentAttempt !== null) {
    const input = buildCreateOrderInput({
      businessId,
      idempotencyKey:
        currentAttempt.idempotencyKey,
      items,
      reviewDraft,
    })

    const fingerprint =
      buildFingerprint(input)

    if (
      fingerprint ===
      currentAttempt.fingerprint
    ) {
      return {
        attempt: currentAttempt,
        input,
      }
    }
  }

  return createNewAttempt({
    businessId,
    items,
    reviewDraft,
    createIdempotencyKey,
  })
}