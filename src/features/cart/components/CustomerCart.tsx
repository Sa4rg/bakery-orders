import {
  useId,
  useState,
} from 'react'
import {
  isValidRequestedQuantity,
  type CartItem,
} from '../domain/cart'

interface CustomerCartProps {
  items: CartItem[]
  onIncrement(productId: string): void
  onDecrement(productId: string): void
  onChangeQuantity(
    productId: string,
    requestedQuantity: number,
  ): void
  onRemove(productId: string): void
  onClear(): void
  onReview?(): void
}

interface CartQuantityInputProps {
  item: CartItem
  onChangeQuantity(
    productId: string,
    requestedQuantity: number,
  ): void
}

function CartQuantityInput({
  item,
  onChangeQuantity,
}: CartQuantityInputProps) {
  const errorId = useId()

  const [draftQuantity, setDraftQuantity] = useState(
    String(item.requestedQuantity),
  )
  const [invalid, setInvalid] = useState(false)

  function commitQuantity() {
    const trimmed = draftQuantity.trim()

    if (trimmed === '') {
      setInvalid(true)
      setDraftQuantity(
        String(item.requestedQuantity),
      )
      return
    }

    const requestedQuantity = Number(trimmed)

    if (
      !isValidRequestedQuantity(
        requestedQuantity,
        item.quantityStep,
      )
    ) {
      setInvalid(true)
      setDraftQuantity(
        String(item.requestedQuantity),
      )
      return
    }

    setInvalid(false)

    onChangeQuantity(
      item.productId,
      requestedQuantity,
    )
  }

  return (
    <>
      <input
        type="number"
        min={item.quantityStep}
        step={item.quantityStep}
        value={draftQuantity}
        aria-label={`Quantity for ${item.productName}`}
        aria-invalid={invalid}
        aria-describedby={
          invalid ? errorId : undefined
        }
        onChange={(event) =>
          setDraftQuantity(
            event.currentTarget.value,
          )
        }
        onBlur={commitQuantity}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />

      {invalid && (
        <p id={errorId} role="alert">
          Quantity must be a positive multiple of{' '}
          {item.quantityStep}.
        </p>
      )}
    </>
  )
}

export function CustomerCart({
  items,
  onIncrement,
  onDecrement,
  onChangeQuantity,
  onRemove,
  onClear,
  onReview,
}: CustomerCartProps) {
  return (
    <section aria-labelledby="cart-heading">
      <h2 id="cart-heading">Cart</h2>

      {items.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          <ul aria-label="Cart items">
            {items.map((item) => (
              <li key={item.productId}>
                <article>
                  <h3>{item.productName}</h3>

                  <p>
                    Unit: {item.unitCode} · step:{' '}
                    {item.quantityStep}
                  </p>

                  <div>
                    <button
                      type="button"
                      aria-label={`Decrease ${item.productName} quantity`}
                      onClick={() =>
                        onDecrement(
                          item.productId,
                        )
                      }
                    >
                      −
                    </button>

                    <CartQuantityInput
                    key={`${item.productId}:${item.requestedQuantity}`}
                    item={item}
                    onChangeQuantity={onChangeQuantity}
                    />

                    <button
                      type="button"
                      aria-label={`Increase ${item.productName} quantity`}
                      onClick={() =>
                        onIncrement(
                          item.productId,
                        )
                      }
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${item.productName} from cart`}
                    onClick={() =>
                      onRemove(item.productId)
                    }
                  >
                    Remove
                  </button>
                </article>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onClear}
          >
            Clear cart
          </button>
        </>
      )}

      {onReview !== undefined && (
        <button
          type="button"
          disabled={items.length === 0}
          onClick={onReview}
        >
          Review order
        </button>
      )}
    </section>
  )
}