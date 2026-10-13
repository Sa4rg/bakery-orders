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
import type { CustomerCancellationGateway } from '../application/customerCancellationGateway'
import { CustomerOrderConfirmation } from './CustomerOrderConfirmation'

const orderId =
  '90000000-0000-4000-8000-000000000001'

function renderConfirmation(
  cancelOrder = vi
    .fn<
      CustomerCancellationGateway['cancelOrder']
    >()
    .mockResolvedValue(undefined),
) {
  const onCreateAnotherOrder = vi.fn()

  render(
    <CustomerOrderConfirmation
      orderId={orderId}
      customerCancellationGateway={{
        cancelOrder,
      }}
      onCreateAnotherOrder={
        onCreateAnotherOrder
      }
    />,
  )

  return {
    cancelOrder,
    onCreateAnotherOrder,
  }
}

describe(
  'CustomerOrderConfirmation',
  () => {
    it('shows the persisted Order identity', () => {
      renderConfirmation()

      expect(
        screen.getByRole('heading', {
          name: 'Order confirmed',
        }),
      ).toBeVisible()

      expect(
        screen.getByText(orderId),
      ).toBeVisible()
    })

    it('requires a non-empty cancellation reason', async () => {
      const user = userEvent.setup()

      const { cancelOrder } =
        renderConfirmation()

      await user.click(
        screen.getByRole('button', {
          name: 'Cancel order',
        }),
      )

      expect(
        await screen.findByRole('alert'),
      ).toHaveTextContent(
        'Enter a cancellation reason.',
      )

      expect(
        cancelOrder,
      ).not.toHaveBeenCalled()
    })

    it('cancels the persisted Order using only Order id and reason', async () => {
      const user = userEvent.setup()

      const { cancelOrder } =
        renderConfirmation()

      await user.type(
        screen.getByRole('textbox', {
          name: 'Cancellation reason',
        }),
        '  Customer requirements changed.  ',
      )

      await user.click(
        screen.getByRole('button', {
          name: 'Cancel order',
        }),
      )

      expect(
        await screen.findByRole('heading', {
          name: 'Order cancelled',
        }),
      ).toBeVisible()

      expect(
        cancelOrder,
      ).toHaveBeenCalledTimes(1)

      expect(
        cancelOrder,
      ).toHaveBeenCalledWith({
        orderId,
        reason:
          'Customer requirements changed.',
      })

      expect(
        screen.getByText(orderId),
      ).toBeVisible()

      expect(
        screen.queryByRole('button', {
          name: 'Cancel order',
        }),
      ).toBeNull()
    })

    it('shows a generic safe error when cancellation fails', async () => {
      const user = userEvent.setup()

      const cancelOrder =
        vi.fn<
          CustomerCancellationGateway['cancelOrder']
        >()

      cancelOrder.mockRejectedValue(
        new Error(
          'SQLSTATE 42501 sensitive provider details',
        ),
      )

      renderConfirmation(cancelOrder)

      await user.type(
        screen.getByRole('textbox', {
          name: 'Cancellation reason',
        }),
        'Changed quantities',
      )

      await user.click(
        screen.getByRole('button', {
          name: 'Cancel order',
        }),
      )

      expect(
        await screen.findByRole('alert'),
      ).toHaveTextContent(
        'Unable to cancel order. Please try again.',
      )

      expect(
        screen.queryByText(
          /42501|SQLSTATE|provider/i,
        ),
      ).toBeNull()

      expect(
        screen.getByRole('heading', {
          name: 'Order confirmed',
        }),
      ).toBeVisible()

      expect(
        screen.queryByRole('heading', {
          name: 'Order cancelled',
        }),
      ).toBeNull()
    })

    it('allows the CUSTOMER to start another independent order', async () => {
      const user = userEvent.setup()

      const {
        onCreateAnotherOrder,
      } = renderConfirmation()

      await user.click(
        screen.getByRole('button', {
          name: 'Create another order',
        }),
      )

      expect(
        onCreateAnotherOrder,
      ).toHaveBeenCalledTimes(1)
    })
  },
)