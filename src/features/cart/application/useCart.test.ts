import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CartProduct } from '../domain/cart'
import { useCart } from './useCart'

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

describe('useCart', () => {
  it('starts with an empty Cart', () => {
    const { result } = renderHook(() => useCart())

    expect(result.current.items).toEqual([])
  })

  it('adds one Product step and increments when added again', () => {
    const { result } = renderHook(() => useCart())

    act(() => {
      result.current.addProduct(pastry)
    })

    expect(result.current.items).toEqual([
      {
        ...pastry,
        requestedQuantity: 0.25,
      },
    ])

    act(() => {
      result.current.addProduct(pastry)
    })

    expect(result.current.items[0]?.requestedQuantity).toBe(
      0.5,
    )
  })

  it('supports increment, decrement and direct quantity changes', () => {
    const { result } = renderHook(() => useCart())

    act(() => {
      result.current.addProduct(pastry)
      result.current.addProduct(bread)
    })

    act(() => {
      result.current.incrementProduct(pastry.productId)
    })

    expect(result.current.items[0]?.requestedQuantity).toBe(
      0.5,
    )

    act(() => {
      result.current.decrementProduct(pastry.productId)
    })

    expect(result.current.items[0]?.requestedQuantity).toBe(
      0.25,
    )

    act(() => {
      result.current.changeQuantity(
        pastry.productId,
        1.25,
      )
    })

    expect(result.current.items[0]?.requestedQuantity).toBe(
      1.25,
    )

    act(() => {
      result.current.changeQuantity(
        pastry.productId,
        1.1,
      )
    })

    expect(result.current.items[0]?.requestedQuantity).toBe(
      1.25,
    )
  })

  it('removes individual items and clears the entire Cart', () => {
    const { result } = renderHook(() => useCart())

    act(() => {
      result.current.addProduct(bread)
      result.current.addProduct(pastry)
    })

    expect(result.current.items).toHaveLength(2)

    act(() => {
      result.current.removeProduct(bread.productId)
    })

    expect(result.current.items).toEqual([
      {
        ...pastry,
        requestedQuantity: 0.25,
      },
    ])

    act(() => {
      result.current.clear()
    })

    expect(result.current.items).toEqual([])
  })
})