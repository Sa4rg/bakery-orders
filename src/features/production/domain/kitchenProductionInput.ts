import type { KitchenProductionItem } from './kitchenProductionOrder'

export type KitchenQuantityInputResult =
  | { readonly ok: true; readonly thousandths: number }
  | { readonly ok: false; readonly message: string }

/** Parse an exact decimal token; never round an operator-entered quantity. */
export function parseKitchenQuantityDelta(
  input: string,
  item: KitchenProductionItem,
): KitchenQuantityInputResult {
  const trimmed = input.trim()
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(trimmed)
  if (!match) {
    return { ok: false, message: 'Enter a positive quantity with up to three decimal places.' }
  }

  const thousandths = Number(match[1]) * 1000
    + Number((match[2] ?? '').padEnd(3, '0'))

  if (!Number.isSafeInteger(thousandths) || thousandths <= 0) {
    return { ok: false, message: 'Enter a quantity greater than zero.' }
  }
  if (item.quantityStepThousandths <= 0
    || !Number.isSafeInteger(item.quantityStepThousandths)
    || thousandths % item.quantityStepThousandths !== 0) {
    return { ok: false, message: 'Quantity must be a multiple of the historical quantity step.' }
  }
  if (thousandths > item.remainingThousandths) {
    return { ok: false, message: 'Quantity cannot exceed the remaining amount.' }
  }
  return { ok: true, thousandths }
}

/** Display a count of thousandths without floating-point arithmetic. */
export function formatKitchenQuantity(thousandths: number): string {
  const whole = Math.floor(thousandths / 1000)
  const decimal = String(thousandths % 1000).padStart(3, '0').replace(/0+$/, '')
  return decimal ? `${whole}.${decimal}` : String(whole)
}
