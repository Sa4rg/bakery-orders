import { useState } from 'react'
import {
  addCartItem,
  changeCartItemQuantity,
  clearCart,
  decrementCartItem,
  incrementCartItem,
  removeCartItem,
  type CartItem,
  type CartProduct,
} from '../domain/cart'

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([])

  function addProduct(product: CartProduct) {
    setItems((current) =>
      addCartItem(
        current,
        product,
        product.quantityStep,
      ),
    )
  }

  function incrementProduct(productId: string) {
    setItems((current) =>
      incrementCartItem(current, productId),
    )
  }

  function decrementProduct(productId: string) {
    setItems((current) =>
      decrementCartItem(current, productId),
    )
  }

  function changeQuantity(
    productId: string,
    requestedQuantity: number,
  ) {
    setItems((current) =>
      changeCartItemQuantity(
        current,
        productId,
        requestedQuantity,
      ),
    )
  }

  function removeProduct(productId: string) {
    setItems((current) =>
      removeCartItem(current, productId),
    )
  }

  function clear() {
    setItems(clearCart())
  }

  return {
    items,
    addProduct,
    incrementProduct,
    decrementProduct,
    changeQuantity,
    removeProduct,
    clear,
  }
}