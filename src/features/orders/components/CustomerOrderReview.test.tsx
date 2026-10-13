import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CartItem } from '../../cart/domain/cart'
import { CustomerOrderReview } from './CustomerOrderReview'

const items: CartItem[] = [
  {
    productId:
      '10000000-0000-4000-8000-000000000001',
    productName: 'Country Sourdough',
    unitCode: 'UNIT',
    quantityStep: 1,
    requestedQuantity: 2,
  },
  {
    productId:
      '20000000-0000-4000-8000-000000000001',
    productName: 'Pastry Mix',
    unitCode: 'KG',
    quantityStep: 0.25,
    requestedQuantity: 0.5,
  },
]

const initialDraft = {
  requestedDeliveryAtLocal:
    '2026-10-16T09:30',
  customerNotes: 'Leave at reception.',
}

describe('CustomerOrderReview', () => {
  it('shows the complete Cart summary', () => {
    render(
      <CustomerOrderReview
        items={items}
        initialDraft={initialDraft}
        onBack={() => undefined}
        submitting={false}
        submitFailed={false}
        onSubmit={() => undefined}
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: 'Review order',
      }),
    ).toBeVisible()

    expect(
      screen.getByRole('heading', {
        name: 'Country Sourdough',
      }),
    ).toBeVisible()

    expect(
      screen.getByRole('heading', {
        name: 'Pastry Mix',
      }),
    ).toBeVisible()

    expect(screen.getByText('2 UNIT')).toBeVisible()
    expect(screen.getByText('0.5 KG')).toBeVisible()
  })

  it('shows the current requested delivery date/time and notes', () => {
    render(
      <CustomerOrderReview
        items={items}
        initialDraft={initialDraft}
        onBack={() => undefined}
        submitting={false}
        submitFailed={false}
        onSubmit={() => undefined}
      />,
    )

    expect(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
    ).toHaveValue('2026-10-16T09:30')

    expect(
      screen.getByRole('textbox', {
        name: 'Optional notes',
      }),
    ).toHaveValue('Leave at reception.')
  })

  it('shows an accessible validation error for a missing delivery date/time', async () => {
    render(
      <CustomerOrderReview
        items={items}
        initialDraft={{
          requestedDeliveryAtLocal: '',
          customerNotes: '',
        }}
        onBack={() => undefined}
        submitting={false}
        submitFailed={false}
        onSubmit={() => undefined}
      />,
    )

    fireEvent.blur(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
    )

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      'Choose a valid delivery date and time.',
    )
  })

  it('returns the current draft when the CUSTOMER goes back to editing', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()

    render(
      <CustomerOrderReview
        items={items}
        initialDraft={{
          requestedDeliveryAtLocal: '',
          customerNotes: '',
        }}
        onBack={onBack}
        submitting={false}
        submitFailed={false}
        onSubmit={() => undefined}
      />,
    )

    fireEvent.change(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
      {
        target: {
          value: '2026-10-17T11:45',
        },
      },
    )

    await user.type(
      screen.getByRole('textbox', {
        name: 'Optional notes',
      }),
      'Ring the bell.',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Back to cart',
      }),
    )

    expect(onBack).toHaveBeenCalledWith({
      requestedDeliveryAtLocal:
        '2026-10-17T11:45',
      customerNotes: 'Ring the bell.',
    })
  })

  it('submits a valid Review draft', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CustomerOrderReview
        items={items}
        initialDraft={initialDraft}
        submitting={false}
        submitFailed={false}
        onBack={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Place order',
      }),
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)

    expect(
      onSubmit.mock.calls[0]?.[0],
    ).toEqual(initialDraft)
  })

  it('does not submit when delivery information is invalid', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CustomerOrderReview
        items={items}
        initialDraft={{
          requestedDeliveryAtLocal: '',
          customerNotes: '',
        }}
        submitting={false}
        submitFailed={false}
        onBack={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Place order',
      }),
    )

    expect(onSubmit).not.toHaveBeenCalled()

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      'Choose a valid delivery date and time.',
    )
  })

  it('locks navigation and submission while persistence is pending', () => {
    render(
      <CustomerOrderReview
        items={items}
        initialDraft={initialDraft}
        submitting
        submitFailed={false}
        onBack={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'Placing order…',
      }),
    ).toBeDisabled()

    expect(
      screen.getByRole('button', {
        name: 'Back to cart',
      }),
    ).toBeDisabled()
  })

  it('shows a generic safe submission failure', () => {
    render(
      <CustomerOrderReview
        items={items}
        initialDraft={initialDraft}
        submitting={false}
        submitFailed
        onBack={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent(
      'Unable to place order. Please try again.',
    )
  })
})