import type {
  CatalogGateway,
  CatalogProduct,
} from '../../catalog/application/catalogGateway'
import { CustomerCatalog } from '../../catalog/components/CustomerCatalog'
import { useCart } from '../../cart/application/useCart'
import { CustomerCart } from '../../cart/components/CustomerCart'
import type { CartProduct } from '../../cart/domain/cart'

interface CustomerOrderBuilderProps {
  catalogGateway: CatalogGateway
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
}: CustomerOrderBuilderProps) {
  const cart = useCart()

  function handleAddProduct(
    product: CatalogProduct,
  ) {
    if (!product.available) {
      return
    }

    cart.addProduct(toCartProduct(product))
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
      />
    </>
  )
}