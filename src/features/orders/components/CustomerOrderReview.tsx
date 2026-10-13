import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { CartItem } from '../../cart/domain/cart'
import {
  orderReviewDraftSchema,
  type OrderReviewDraft,
} from '../domain/orderReviewDraftSchema'

interface CustomerOrderReviewProps {
  items: CartItem[]
  initialDraft: OrderReviewDraft
  onBack(draft: OrderReviewDraft): void
}

export function CustomerOrderReview({
  items,
  initialDraft,
  onBack,
}: CustomerOrderReviewProps) {
  const {
    register,
    getValues,
    formState: { errors },
  } = useForm<OrderReviewDraft>({
    resolver: zodResolver(
      orderReviewDraftSchema,
    ),
    defaultValues: initialDraft,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  return (
    <section aria-labelledby="review-order-heading">
      <h2 id="review-order-heading">
        Review order
      </h2>

      <p>
        Check your products, quantities and delivery
        information before placing the order.
      </p>

      <ul aria-label="Order review items">
        {items.map((item) => (
          <li key={item.productId}>
            <article>
              <h3>{item.productName}</h3>
              <p>
                {item.requestedQuantity}{' '}
                {item.unitCode}
              </p>
            </article>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(event) =>
          event.preventDefault()
        }
      >
        <div>
          <label htmlFor="requested-delivery-at">
            Requested delivery date and time
          </label>

          <input
            id="requested-delivery-at"
            type="datetime-local"
            step={60}
            aria-invalid={
              errors.requestedDeliveryAtLocal
                ? true
                : undefined
            }
            aria-describedby={
              errors.requestedDeliveryAtLocal
                ? 'requested-delivery-error'
                : undefined
            }
            {...register(
              'requestedDeliveryAtLocal',
            )}
          />

          {errors.requestedDeliveryAtLocal && (
            <p
              id="requested-delivery-error"
              role="alert"
            >
              {
                errors
                  .requestedDeliveryAtLocal
                  .message
              }
            </p>
          )}
        </div>

        <div>
          <label htmlFor="customer-notes">
            Optional notes
          </label>

          <textarea
            id="customer-notes"
            {...register('customerNotes')}
          />
        </div>

        <button
          type="button"
          onClick={() =>
            onBack(getValues())
          }
        >
          Back to cart
        </button>
      </form>
    </section>
  )
}