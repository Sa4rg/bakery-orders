import { useState } from 'react'
import type {
  CatalogGateway,
  CatalogProduct,
} from '../../catalog/application/catalogGateway'
import { CustomerCatalog } from '../../catalog/components/CustomerCatalog'
import { useCart } from '../../cart/application/useCart'
import { CustomerCart } from '../../cart/components/CustomerCart'
import type { CartProduct } from '../../cart/domain/cart'
import type { CreateOrderGateway } from '../application/createOrderGateway'
import { useCreateOrderSubmission } from '../application/useCreateOrderSubmission'
import type { OrderReviewDraft } from '../domain/orderReviewDraftSchema'
import { CustomerOrderConfirmation } from './CustomerOrderConfirmation'
import { CustomerOrderReview } from './CustomerOrderReview'
import type { CustomerCancellationGateway } from '../application/customerCancellationGateway'

interface CustomerOrderBuilderProps {
  catalogGateway: CatalogGateway
  createOrderGateway: CreateOrderGateway
  businessId: string
  customerCancellationGateway: CustomerCancellationGateway
}

type OrderBuilderStep =
  | 'editing'
  | 'review'
  | 'confirmation'

const EMPTY_REVIEW_DRAFT: OrderReviewDraft = {
  requestedDeliveryAtLocal: '',
  customerNotes: '',
}

function toCartProduct(
  product: CatalogProduct,
): CartProduct {
  return {
    productId: product.id,
    productName: product.name,
    unitCode: product.unitCode,
    quantityStep: product.quantityStep,
  }
}

export function CustomerOrderBuilder({
  catalogGateway,
  createOrderGateway,
  businessId,
  customerCancellationGateway,
}: CustomerOrderBuilderProps) {
  const cart = useCart()

  const submission =
    useCreateOrderSubmission({
      gateway: createOrderGateway,
      businessId,
    })

  const [step, setStep] =
    useState<OrderBuilderStep>('editing')

  const [reviewDraft, setReviewDraft] =
    useState<OrderReviewDraft>(
      EMPTY_REVIEW_DRAFT,
    )

  const [
    confirmedOrderId,
    setConfirmedOrderId,
  ] = useState<string | null>(null)

  function handleAddProduct(
    product: CatalogProduct,
  ) {
    if (!product.available) {
      return
    }

    cart.addProduct(toCartProduct(product))
  }

  function handleReview() {
    if (cart.items.length === 0) {
      return
    }

    submission.clearError()
    setStep('review')
  }

  function handleBackToCart(
    draft: OrderReviewDraft,
  ) {
    setReviewDraft(draft)
    submission.clearError()
    setStep('editing')
  }

  async function handleSubmitOrder(
    draft: OrderReviewDraft,
  ) {
    setReviewDraft(draft)

    const orderId =
      await submission.submit(
        cart.items,
        draft,
      )

    if (orderId === null) {
      return
    }

    /*
     * Only destroy the editable client-side draft after
     * persistence has been confirmed by the trusted
     * application boundary.
     */
    cart.clear()
    setReviewDraft(EMPTY_REVIEW_DRAFT)
    setConfirmedOrderId(orderId)
    setStep('confirmation')
  }

  function handleCreateAnotherOrder() {
    setConfirmedOrderId(null)
    submission.clearError()
    setStep('editing')
  }

  if (
    step === 'confirmation' &&
    confirmedOrderId !== null
  ) {
    return (
      <CustomerOrderConfirmation
        orderId={confirmedOrderId}
        customerCancellationGateway={
          customerCancellationGateway
        }
        onCreateAnotherOrder={
          handleCreateAnotherOrder
        }
      />
    )
  }

  if (step === 'review') {
    return (
      <CustomerOrderReview
        items={cart.items}
        initialDraft={reviewDraft}
        submitting={
          submission.status ===
          'submitting'
        }
        submitFailed={
          submission.status === 'error'
        }
        onBack={handleBackToCart}
        onSubmit={handleSubmitOrder}
      />
    )
  }

  return (
    <>
      <CustomerCatalog
        gateway={catalogGateway}
        onAddProduct={handleAddProduct}
      />

      <CustomerCart
        items={cart.items}
        onIncrement={
          cart.incrementProduct
        }
        onDecrement={
          cart.decrementProduct
        }
        onChangeQuantity={
          cart.changeQuantity
        }
        onRemove={cart.removeProduct}
        onClear={cart.clear}
        onReview={handleReview}
      />
    </>
  )
}