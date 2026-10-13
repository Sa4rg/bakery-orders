import {
  render,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { CustomerOrderConfirmation } from './CustomerOrderConfirmation'

const orderId =
  '90000000-0000-4000-8000-000000000001'

describe('CustomerOrderConfirmation', () => {
  it('shows the persisted Order identity', () => {
    render(
      <CustomerOrderConfirmation
        orderId={orderId}
        onCreateAnotherOrder={() =>
          undefined
        }
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: 'Order confirmed',
      }),
    ).toBeVisible()

    expect(screen.getByText(orderId)).toBeVisible()
  })

  it('allows the CUSTOMER to start another independent order', async () => {
    const user = userEvent.setup()
    const onCreateAnotherOrder = vi.fn()

    render(
      <CustomerOrderConfirmation
        orderId={orderId}
        onCreateAnotherOrder={
          onCreateAnotherOrder
        }
      />,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Create another order',
      }),
    )

    expect(
      onCreateAnotherOrder,
    ).toHaveBeenCalledTimes(1)
  })
})