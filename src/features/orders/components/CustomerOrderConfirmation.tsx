interface CustomerOrderConfirmationProps {
  orderId: string
  onCreateAnotherOrder(): void
}

export function CustomerOrderConfirmation({
  orderId,
  onCreateAnotherOrder,
}: CustomerOrderConfirmationProps) {
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

      <button
        type="button"
        onClick={onCreateAnotherOrder}
      >
        Create another order
      </button>
    </section>
  )
}