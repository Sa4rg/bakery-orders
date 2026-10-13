import type { CartItem } from '../../cart/domain/cart'
import {
  createOrderInputSchema,
  type CreateOrderInput,
} from '../domain/createOrderSchema'
import {
  orderReviewDraftSchema,
  type OrderReviewDraft,
} from '../domain/orderReviewDraftSchema'
import { CreateOrderValidationError } from './createOrderGateway'

interface BuildCreateOrderInputParams {
  businessId: string
  idempotencyKey: string
  items: CartItem[]
  reviewDraft: OrderReviewDraft
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateTime(date: Date): string {
  return [
    date.getFullYear(),
    '-',
    padTwoDigits(date.getMonth() + 1),
    '-',
    padTwoDigits(date.getDate()),
    'T',
    padTwoDigits(date.getHours()),
    ':',
    padTwoDigits(date.getMinutes()),
  ].join('')
}

function toAbsoluteIso(
  requestedDeliveryAtLocal: string,
): string | null {
  const date = new Date(requestedDeliveryAtLocal)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  /*
   * datetime-local represents wall-clock time in the browser's local
   * timezone. Round-tripping protects us from values the runtime would
   * silently normalize, including nonexistent local times around DST.
   */
  if (
    formatLocalDateTime(date) !==
    requestedDeliveryAtLocal
  ) {
    return null
  }

  return date.toISOString()
}

export function buildCreateOrderInput({
  businessId,
  idempotencyKey,
  items,
  reviewDraft,
}: BuildCreateOrderInputParams): CreateOrderInput {
  const parsedReview =
    orderReviewDraftSchema.safeParse(reviewDraft)

  if (!parsedReview.success) {
    throw new CreateOrderValidationError()
  }

  const requestedDeliveryAt = toAbsoluteIso(
    parsedReview.data.requestedDeliveryAtLocal,
  )

  if (requestedDeliveryAt === null) {
    throw new CreateOrderValidationError()
  }

  const candidate = {
    businessId,
    requestedDeliveryAt,
    customerNotes:
      parsedReview.data.customerNotes === ''
        ? null
        : parsedReview.data.customerNotes,
    idempotencyKey,
    items: items.map((item) => ({
      productId: item.productId,
      requestedQuantity:
        item.requestedQuantity,
    })),
  }

  const parsed =
    createOrderInputSchema.safeParse(candidate)

  if (!parsed.success) {
    throw new CreateOrderValidationError()
  }

  return parsed.data
}