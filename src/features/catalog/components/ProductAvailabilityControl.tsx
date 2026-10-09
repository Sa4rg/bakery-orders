import { useState } from 'react'
import type { ProductAvailabilityGateway } from '../application/productAvailabilityGateway'

interface ProductAvailabilityControlProps {
  productId: string
  productName: string
  available: boolean
  gateway: ProductAvailabilityGateway
  onAvailabilityChanged(available: boolean): void
}

export function ProductAvailabilityControl({
  productId,
  productName,
  available,
  gateway,
  onAvailabilityChanged,
}: ProductAvailabilityControlProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function changeAvailability() {
    setFailed(false)
    setPending(true)

    try {
        const persistedAvailability = await gateway.setAvailability(
        productId,
        !available,
        )

        onAvailabilityChanged(persistedAvailability)
    } catch {
        setFailed(true)
    } finally {
        setPending(false)
    }
  }

  return (
    <div>
      <p>{available ? 'Available' : 'Unavailable'}</p>

      <button
        type="button"
        disabled={pending}
        onClick={() => void changeAvailability()}
      >
        {available
          ? `Mark ${productName} unavailable`
          : `Mark ${productName} available`}
      </button>
      {failed && (
        <p role="alert">
          Unable to change Product availability. Please try again.
        </p>
      )}
    </div>
  )
}