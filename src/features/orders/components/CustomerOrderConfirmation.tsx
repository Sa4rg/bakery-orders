import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { CustomerCancellationGateway } from '../application/customerCancellationGateway'
import { useCustomerCancellation } from '../application/useCustomerCancellation'
import {
  cancelCustomerOrderFormSchema,
  type CancelCustomerOrderForm,
} from '../domain/cancelCustomerOrderSchema'

interface CustomerOrderConfirmationProps {
  orderId: string
  customerCancellationGateway:
    CustomerCancellationGateway
  onCreateAnotherOrder(): void
}

export function CustomerOrderConfirmation({
  orderId,
  customerCancellationGateway,
  onCreateAnotherOrder,
}: CustomerOrderConfirmationProps) {
  const cancellation =
    useCustomerCancellation({
      gateway:
        customerCancellationGateway,
    })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CancelCustomerOrderForm>({
    resolver: zodResolver(
      cancelCustomerOrderFormSchema,
    ),
    defaultValues: {
      reason: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  async function handleCancellation(
    form: CancelCustomerOrderForm,
  ) {
    cancellation.clearError()

    await cancellation.cancel({
      orderId,
      reason: form.reason,
    })
  }

  if (
    cancellation.status === 'cancelled'
  ) {
    return (
      <section
        aria-labelledby="order-cancelled-heading"
      >
        <h2 id="order-cancelled-heading">
          Order cancelled
        </h2>

        <p>
          Your order remains saved and is
          now cancelled.
        </p>

        <dl>
          <dt>Order ID</dt>
          <dd>
            <code>{orderId}</code>
          </dd>
        </dl>

        <button
          type="button"
          onClick={onCreateAnotherOrder}
        >
          Create another order
        </button>
      </section>
    )
  }

  const cancelling =
    cancellation.status ===
    'cancelling'

  return (
    <section
      aria-labelledby="order-confirmation-heading"
    >
      <h2 id="order-confirmation-heading">
        Order confirmed
      </h2>

      <p>
        Your order was saved successfully.
      </p>

      <dl>
        <dt>Order ID</dt>
        <dd>
          <code>{orderId}</code>
        </dd>
      </dl>

      <form
        onSubmit={handleSubmit(
          handleCancellation,
        )}
      >
        <div>
          <label htmlFor="cancellation-reason">
            Cancellation reason
          </label>

          <textarea
            id="cancellation-reason"
            {...register('reason')}
            aria-invalid={
              errors.reason !== undefined
            }
            aria-describedby={
              errors.reason
                ? 'cancellation-reason-error'
                : undefined
            }
          />

          {errors.reason && (
            <p
              id="cancellation-reason-error"
              role="alert"
            >
              {errors.reason.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={cancelling}
        >
          {cancelling
            ? 'Cancelling…'
            : 'Cancel order'}
        </button>
      </form>

      {cancellation.status ===
        'error' && (
        <p role="alert">
          Unable to cancel order. Please
          try again.
        </p>
      )}

      <button
        type="button"
        disabled={cancelling}
        onClick={onCreateAnotherOrder}
      >
        Create another order
      </button>
    </section>
  )
}