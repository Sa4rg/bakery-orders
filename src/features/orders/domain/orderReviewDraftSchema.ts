import { z } from 'zod'

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)

  if (match === null) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])

  if (
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return false
  }

  const candidate = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
    ),
  )

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day &&
    candidate.getUTCHours() === hour &&
    candidate.getUTCMinutes() === minute
  )
}

export const orderReviewDraftSchema = z
  .object({
    requestedDeliveryAtLocal: z
      .string()
      .refine(isValidLocalDateTime, {
        message:
          'Choose a valid delivery date and time.',
      }),
    customerNotes: z.string(),
  })
  .strict()

export type OrderReviewDraft = z.infer<
  typeof orderReviewDraftSchema
>