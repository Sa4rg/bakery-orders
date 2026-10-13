import { useState } from 'react'
import type {
  CatalogGateway,
  CatalogProduct,
} from '../../catalog/application/catalogGateway'
import { CustomerCatalog } from '../../catalog/components/CustomerCatalog'
import { useCart } from '../../cart/application/useCart'
import { CustomerCart } from '../../cart/components/CustomerCart'
import type { CartProduct } from '../../cart/domain/cart'
import type { OrderReviewDraft } from '../domain/orderReviewDraftSchema'
import { CustomerOrderReview } from './CustomerOrderReview'

interface CustomerOrderBuilderProps {
  catalogGateway: CatalogGateway
}

type OrderBuilderStep =
  | 'editing'
  | 'review'

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
}: CustomerOrderBuilderProps) {
  const cart = useCart()

  const [step, setStep] =
    useState<OrderBuilderStep>('editing')

  const [reviewDraft, setReviewDraft] =
    useState<OrderReviewDraft>({
      requestedDeliveryAtLocal: '',
      customerNotes: '',
    })

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

    setStep('review')
  }

  function handleBackToCart(
    draft: OrderReviewDraft,
  ) {
    setReviewDraft(draft)
    setStep('editing')
  }

  if (step === 'review') {
    return (
      <CustomerOrderReview
        items={cart.items}
        initialDraft={reviewDraft}
        onBack={handleBackToCart}
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
        onIncrement={cart.incrementProduct}
        onDecrement={cart.decrementProduct}
        onChangeQuantity={cart.changeQuantity}
        onRemove={cart.removeProduct}
        onClear={cart.clear}
        onReview={handleReview}
      />
    </>
  )
}