import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProductAvailabilityGateway } from '../application/productAvailabilityGateway'
import { ProductAvailabilityControl } from './ProductAvailabilityControl'

const productId = '83000000-0000-4000-8000-000000000001'

function createGateway() {
  const setAvailability = vi.fn(
    async (_productId: string, available: boolean) => available,
  )

  const gateway: ProductAvailabilityGateway = {
    setAvailability,
  }

  return { gateway, setAvailability }
}

describe('ProductAvailabilityControl', () => {
  it('persists the opposite availability and reports the persisted result', async () => {
    const user = userEvent.setup()
    const { gateway, setAvailability } = createGateway()
    const onAvailabilityChanged = vi.fn()

    render(
      <ProductAvailabilityControl
        productId={productId}
        productName="Sourdough"
        available
        gateway={gateway}
        onAvailabilityChanged={onAvailabilityChanged}
      />,
    )

    expect(screen.getByText('Available')).toBeVisible()

    await user.click(
      screen.getByRole('button', {
        name: 'Mark Sourdough unavailable',
      }),
    )

    expect(setAvailability).toHaveBeenCalledWith(productId, false)
    expect(onAvailabilityChanged).toHaveBeenCalledWith(false)
  })

  it('prevents duplicate availability commands while persistence is pending', async () => {
    const user = userEvent.setup()
    let resolve: ((value: boolean) => void) | undefined

    const setAvailability = vi.fn(
        () =>
        new Promise<boolean>((done) => {
            resolve = done
        }),
    )

    const gateway: ProductAvailabilityGateway = {
        setAvailability,
    }

    const onAvailabilityChanged = vi.fn()

    render(
        <ProductAvailabilityControl
        productId={productId}
        productName="Sourdough"
        available
        gateway={gateway}
        onAvailabilityChanged={onAvailabilityChanged}
        />,
    )

    const button = screen.getByRole('button', {
        name: 'Mark Sourdough unavailable',
    })

    await user.click(button)

    expect(button).toBeDisabled()
    expect(setAvailability).toHaveBeenCalledTimes(1)

    await user.click(button)

    expect(setAvailability).toHaveBeenCalledTimes(1)

    await act(async () => {
        resolve?.(false)
    })

    await waitFor(() => {
        expect(onAvailabilityChanged).toHaveBeenCalledWith(false)
    })
  })

  it('shows a safe error without exposing provider details', async () => {
    const user = userEvent.setup()

    const gateway: ProductAvailabilityGateway = {
        setAvailability: vi.fn(async () => {
        throw new Error('PostgREST private SQL detail')
        }),
    }

    render(
        <ProductAvailabilityControl
        productId={productId}
        productName="Sourdough"
        available
        gateway={gateway}
        onAvailabilityChanged={vi.fn()}
        />,
    )

    await user.click(
        screen.getByRole('button', {
        name: 'Mark Sourdough unavailable',
        }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to change Product availability. Please try again.',
    )

    expect(screen.queryByText(/PostgREST|SQL detail/i)).toBeNull()
  })
})