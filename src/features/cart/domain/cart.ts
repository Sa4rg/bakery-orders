const QUANTITY_SCALE = 1000
const SCALE_TOLERANCE = 1e-9

export interface CartProduct {
  productId: string
  productName: string
  unitCode: string
  quantityStep: number
}

export interface CartItem extends CartProduct {
  requestedQuantity: number
}

function toScaledQuantity(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null
  }

  const scaled = value * QUANTITY_SCALE
  const rounded = Math.round(scaled)

  if (!Number.isSafeInteger(rounded)) {
    return null
  }

  if (Math.abs(scaled - rounded) > SCALE_TOLERANCE) {
    return null
  }

  return rounded
}

function fromScaledQuantity(value: number): number {
  return value / QUANTITY_SCALE
}

function addQuantities(left: number, right: number): number | null {
  const scaledLeft = toScaledQuantity(left)
  const scaledRight = toScaledQuantity(right)

  if (scaledLeft === null || scaledRight === null) {
    return null
  }

  return fromScaledQuantity(scaledLeft + scaledRight)
}

export function isValidRequestedQuantity(
  requestedQuantity: number,
  quantityStep: number,
): boolean {
  const scaledQuantity = toScaledQuantity(requestedQuantity)
  const scaledStep = toScaledQuantity(quantityStep)

  if (
    scaledQuantity === null ||
    scaledStep === null ||
    scaledQuantity <= 0 ||
    scaledStep <= 0
  ) {
    return false
  }

  return scaledQuantity % scaledStep === 0
}

export function addCartItem(
  items: CartItem[],
  product: CartProduct,
  requestedQuantity: number,
): CartItem[] {
  if (
    !isValidRequestedQuantity(
      requestedQuantity,
      product.quantityStep,
    )
  ) {
    return items
  }

  const existingItem = items.find(
    (item) => item.productId === product.productId,
  )

  if (existingItem === undefined) {
    return [
      ...items,
      {
        ...product,
        requestedQuantity,
      },
    ]
  }

  const nextQuantity = addQuantities(
    existingItem.requestedQuantity,
    requestedQuantity,
  )

  if (
    nextQuantity === null ||
    !isValidRequestedQuantity(
      nextQuantity,
      existingItem.quantityStep,
    )
  ) {
    return items
  }

  return items.map((item) =>
    item.productId === product.productId
      ? {
          ...item,
          requestedQuantity: nextQuantity,
        }
      : item,
  )
}

export function incrementCartItem(
  items: CartItem[],
  productId: string,
): CartItem[] {
  const item = items.find(
    (candidate) => candidate.productId === productId,
  )

  if (item === undefined) {
    return items
  }

  const nextQuantity = addQuantities(
    item.requestedQuantity,
    item.quantityStep,
  )

  if (
    nextQuantity === null ||
    !isValidRequestedQuantity(
      nextQuantity,
      item.quantityStep,
    )
  ) {
    return items
  }

  return items.map((candidate) =>
    candidate.productId === productId
      ? {
          ...candidate,
          requestedQuantity: nextQuantity,
        }
      : candidate,
  )
}

export function decrementCartItem(
  items: CartItem[],
  productId: string,
): CartItem[] {
  const item = items.find(
    (candidate) => candidate.productId === productId,
  )

  if (item === undefined) {
    return items
  }

  const scaledQuantity = toScaledQuantity(
    item.requestedQuantity,
  )
  const scaledStep = toScaledQuantity(item.quantityStep)

  if (
    scaledQuantity === null ||
    scaledStep === null ||
    scaledQuantity <= scaledStep
  ) {
    return items
  }

  const nextQuantity = fromScaledQuantity(
    scaledQuantity - scaledStep,
  )

  return items.map((candidate) =>
    candidate.productId === productId
      ? {
          ...candidate,
          requestedQuantity: nextQuantity,
        }
      : candidate,
  )
}

export function changeCartItemQuantity(
  items: CartItem[],
  productId: string,
  requestedQuantity: number,
): CartItem[] {
  const item = items.find(
    (candidate) => candidate.productId === productId,
  )

  if (
    item === undefined ||
    !isValidRequestedQuantity(
      requestedQuantity,
      item.quantityStep,
    )
  ) {
    return items
  }

  return items.map((candidate) =>
    candidate.productId === productId
      ? {
          ...candidate,
          requestedQuantity,
        }
      : candidate,
  )
}

export function removeCartItem(
  items: CartItem[],
  productId: string,
): CartItem[] {
  return items.filter(
    (item) => item.productId !== productId,
  )
}

export function clearCart(): CartItem[] {
  return []
}