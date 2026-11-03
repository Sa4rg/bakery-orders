/** Exact representation of PostgreSQL numeric(12,3) as integer thousandths. */
export class QuantityPrecisionError extends Error {
  constructor() {
    super('Invalid decimal quantity.')
    this.name = 'QuantityPrecisionError'
  }
}

export function parseQuantityThousandths(value: number | string): number {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new QuantityPrecisionError()
  }
  const parts = /^(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(String(value))
  if (!parts) throw new QuantityPrecisionError()
  const result = Number(parts[1]) * 1000 + Number((parts[2] ?? '').padEnd(3, '0'))
  if (!Number.isSafeInteger(result)) throw new QuantityPrecisionError()
  return result
}

/** Display exact integer thousandths without converting through binary floats. */
export function formatQuantityThousandths(thousandths: number): string {
  const whole = Math.floor(thousandths / 1000)
  const decimal = String(thousandths % 1000).padStart(3, '0').replace(/0+$/, '')
  return decimal ? `${whole}.${decimal}` : String(whole)
}
