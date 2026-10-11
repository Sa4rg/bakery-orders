import { describe, expect, it } from 'vitest'
import {
  addCartItem,
  changeCartItemQuantity,
  clearCart,
  decrementCartItem,
  incrementCartItem,
  isValidRequestedQuantity,
  removeCartItem,
  type CartProduct,
} from './cart'

const bread: CartProduct = {
  productId: '10000000-0000-4000-8000-000000000001',
  productName: 'Country Sourdough',
  unitCode: 'UNIT',
  quantityStep: 1,
}

const pastry: CartProduct = {
  productId: '20000000-0000-4000-8000-000000000001',
  productName: 'Pastry Mix',
  unitCode: 'KG',
  quantityStep: 0.25,
}

describe('cart domain', () => {
  it('accepts only positive quantities aligned with the Product quantity step', () => {
    expect(isValidRequestedQuantity(1, 1)).toBe(true)
    expect(isValidRequestedQuantity(2, 1)).toBe(true)

    expect(isValidRequestedQuantity(0.25, 0.25)).toBe(true)
    expect(isValidRequestedQuantity(0.5, 0.25)).toBe(true)
    expect(isValidRequestedQuantity(1.5, 0.25)).toBe(true)

    expect(isValidRequestedQuantity(0, 1)).toBe(false)
    expect(isValidRequestedQuantity(-1, 1)).toBe(false)
    expect(isValidRequestedQuantity(0.3, 0.25)).toBe(false)
    expect(isValidRequestedQuantity(0.2501, 0.25)).toBe(false)
    expect(
      isValidRequestedQuantity(Number.POSITIVE_INFINITY, 0.25),
    ).toBe(false)
  })

  it('adds a Product with its requested quantity', () => {
    const cart = addCartItem([], bread, 2)

    expect(cart).toEqual([
      {
        ...bread,
        requestedQuantity: 2,
      },
    ])
  })

  it('supports multiple different Products', () => {
    const withBread = addCartItem([], bread, 2)
    const cart = addCartItem(withBread, pastry, 0.5)

    expect(cart).toEqual([
      {
        ...bread,
        requestedQuantity: 2,
      },
      {
        ...pastry,
        requestedQuantity: 0.5,
      },
    ])
  })

  it('increments an existing Product instead of duplicating the line', () => {
    const first = addCartItem([], pastry, 0.5)
    const cart = addCartItem(first, pastry, 0.25)

    expect(cart).toHaveLength(1)
    expect(cart[0]).toEqual({
      ...pastry,
      requestedQuantity: 0.75,
    })
  })

  it('increments and decrements using the Product quantity step', () => {
    const initial = addCartItem([], pastry, 0.5)

    const incremented = incrementCartItem(
      initial,
      pastry.productId,
    )

    expect(incremented[0]?.requestedQuantity).toBe(0.75)

    const decremented = decrementCartItem(
      incremented,
      pastry.productId,
    )

    expect(decremented[0]?.requestedQuantity).toBe(0.5)
  })

  it('does not decrement below one quantity step', () => {
    const initial = addCartItem([], pastry, 0.25)

    const cart = decrementCartItem(
      initial,
      pastry.productId,
    )

    expect(cart[0]?.requestedQuantity).toBe(0.25)
  })

  it('changes quantity only when the new quantity is valid for the Product step', () => {
    const initial = addCartItem([], pastry, 0.5)

    const validChange = changeCartItemQuantity(
      initial,
      pastry.productId,
      1.25,
    )

    expect(validChange[0]?.requestedQuantity).toBe(1.25)

    const invalidChange = changeCartItemQuantity(
      validChange,
      pastry.productId,
      1.1,
    )

    expect(invalidChange[0]?.requestedQuantity).toBe(1.25)
  })

  it('removes one selected Product without changing the others', () => {
    const withBread = addCartItem([], bread, 2)
    const initial = addCartItem(withBread, pastry, 0.5)

    const cart = removeCartItem(initial, bread.productId)

    expect(cart).toEqual([
      {
        ...pastry,
        requestedQuantity: 0.5,
      },
    ])
  })

  it('clears every Cart item', () => {
    expect(clearCart()).toEqual([])
  })

  it('avoids floating-point drift when repeated decimal steps are added', () => {
    const decimalProduct: CartProduct = {
      productId: '30000000-0000-4000-8000-000000000001',
      productName: 'Decimal Product',
      unitCode: 'KG',
      quantityStep: 0.1,
    }

    let cart = addCartItem([], decimalProduct, 0.1)
    cart = addCartItem(cart, decimalProduct, 0.1)
    cart = addCartItem(cart, decimalProduct, 0.1)

    expect(cart[0]?.requestedQuantity).toBe(0.3)
  })
})