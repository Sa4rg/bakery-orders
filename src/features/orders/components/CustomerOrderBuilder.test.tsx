import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CustomerCatalog as CustomerCatalogData } from '../../catalog/application/catalogGateway'
import type { CreateOrderGateway } from '../application/createOrderGateway'
import { createFakeCatalogGateway } from '../../catalog/testing/fakeCatalogGateway'
import { CustomerOrderBuilder } from './CustomerOrderBuilder'

const sourdoughId =
  '30000000-0000-4000-8000-000000000001'

const pastryId =
  '40000000-0000-4000-8000-000000000001'

const unavailableCroissantId =
  '50000000-0000-4000-8000-000000000001'

const businessId =
  '10000000-0000-4000-8000-000000000001'

const persistedOrderId =
  '90000000-0000-4000-8000-000000000001'

const catalog: CustomerCatalogData = {
  categories: [
    {
      id: 'bread',
      name: 'Bread',
      description: null,
      displayOrder: 0,
    },
    {
      id: 'pastries',
      name: 'Pastries',
      description: null,
      displayOrder: 1,
    },
  ],
  products: [
    {
      id: sourdoughId,
      categoryId: 'bread',
      name: 'Country Sourdough',
      description: 'Naturally leavened loaf.',
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
    {
      id: pastryId,
      categoryId: 'pastries',
      name: 'Pastry Mix',
      description: null,
      unitCode: 'KG',
      quantityStep: 0.25,
      available: true,
    },
    {
      id: unavailableCroissantId,
      categoryId: 'pastries',
      name: 'Unavailable Croissant',
      description: null,
      unitCode: 'UNIT',
      quantityStep: 1,
      available: false,
    },
  ],
}

function renderOrderBuilder(
  createOrder = vi
    .fn<CreateOrderGateway['createOrder']>()
    .mockResolvedValue(
      persistedOrderId,
    ),
) {
  const fake =
    createFakeCatalogGateway([
      catalog,
    ])

  return {
    ...render(
      <CustomerOrderBuilder
        catalogGateway={fake.gateway}
        createOrderGateway={{
          createOrder,
        }}
        businessId={businessId}
      />,
    ),
    fake,
    createOrder,
  }
}

describe('CustomerOrderBuilder', () => {
  it('starts with an empty Cart and adds available Products from the catalog', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    expect(
      await screen.findByRole('heading', {
        name: 'Country Sourdough',
      }),
    ).toBeVisible()

    expect(
      screen.getByText('Your cart is empty.'),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', {
        name: 'Add Country Sourdough to cart',
      }),
    )

    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity for Country Sourdough',
      }),
    ).toHaveValue(1)
  })

  it('adds the same Product again by increasing its quantity instead of duplicating it', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Country Sourdough',
    })

    const addButton = screen.getByRole('button', {
      name: 'Add Country Sourdough to cart',
    })

    await user.click(addButton)
    await user.click(addButton)

    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity for Country Sourdough',
      }),
    ).toHaveValue(2)

    expect(
      screen.getAllByRole('button', {
        name: 'Remove Country Sourdough from cart',
      }),
    ).toHaveLength(1)
  })

  it('increments and decrements using the Product quantity step', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Pastry Mix',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Pastry Mix to cart',
      }),
    )

    const getQuantity = () =>
      screen.getByRole('spinbutton', {
        name: 'Quantity for Pastry Mix',
      })

    expect(getQuantity()).toHaveValue(0.25)

    await user.click(
      screen.getByRole('button', {
        name: 'Increase Pastry Mix quantity',
      }),
    )

    expect(getQuantity()).toHaveValue(0.5)

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease Pastry Mix quantity',
      }),
    )

    expect(getQuantity()).toHaveValue(0.25)

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease Pastry Mix quantity',
      }),
    )

    expect(getQuantity()).toHaveValue(0.25)
  })

  it('accepts a valid direct quantity change and rejects one that does not respect quantityStep', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Pastry Mix',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Pastry Mix to cart',
      }),
    )

    const getQuantity = () =>
      screen.getByRole('spinbutton', {
        name: 'Quantity for Pastry Mix',
      })

    await user.clear(getQuantity())
    await user.type(getQuantity(), '0.75')
    await user.tab()

    expect(getQuantity()).toHaveValue(0.75)
    expect(screen.queryByRole('alert')).toBeNull()

    await user.clear(getQuantity())
    await user.type(getQuantity(), '0.6')
    await user.tab()

    expect(getQuantity()).toHaveValue(0.75)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Quantity must be a positive multiple of 0.25.',
    )
  })

  it('does not allow an unavailable Product to be added', async () => {
    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Unavailable Croissant',
    })

    expect(
      screen.getByRole('button', {
        name: 'Add Unavailable Croissant to cart',
      }),
    ).toBeDisabled()

    expect(
      screen.queryByRole('spinbutton', {
        name: 'Quantity for Unavailable Croissant',
      }),
    ).toBeNull()
  })

  it('removes individual Products and clears the whole Cart', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Country Sourdough',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Country Sourdough to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Add Pastry Mix to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Remove Country Sourdough from cart',
      }),
    )

    expect(
      screen.queryByRole('spinbutton', {
        name: 'Quantity for Country Sourdough',
      }),
    ).toBeNull()

    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity for Pastry Mix',
      }),
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', {
        name: 'Clear cart',
      }),
    )

    expect(
      screen.getByText('Your cart is empty.'),
    ).toBeVisible()
  })

  it('does not allow an empty Cart to enter Review Order', async () => {
    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Country Sourdough',
    })

    expect(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    ).toBeDisabled()
  })

  it('moves from the editable Cart to the Review Order screen', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Pastry Mix',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Pastry Mix to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    )

    expect(
      screen.getByRole('heading', {
        name: 'Review order',
      }),
    ).toBeVisible()

    expect(
      screen.getByRole('heading', {
        name: 'Pastry Mix',
      }),
    ).toBeVisible()

    expect(screen.getByText('0.25 KG')).toBeVisible()

    expect(
      screen.queryByRole('heading', {
        name: 'Catalog',
      }),
    ).toBeNull()
  })

  it('returns to editing without losing Cart quantities', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Pastry Mix',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Pastry Mix to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Increase Pastry Mix quantity',
      }),
    )

    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity for Pastry Mix',
      }),
    ).toHaveValue(0.5)

    await user.click(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Back to cart',
      }),
    )

    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity for Pastry Mix',
      }),
    ).toHaveValue(0.5)
  })

  it('preserves delivery details when returning to the Cart and reviewing again', async () => {
    const user = userEvent.setup()

    renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Country Sourdough',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Country Sourdough to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    )

    fireEvent.change(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
      {
        target: {
          value: '2026-10-18T08:15',
        },
      },
    )

    await user.type(
      screen.getByRole('textbox', {
        name: 'Optional notes',
      }),
      'Use side entrance.',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Back to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    )

    expect(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
    ).toHaveValue('2026-10-18T08:15')

    expect(
      screen.getByRole('textbox', {
        name: 'Optional notes',
      }),
    ).toHaveValue('Use side entrance.')
  })

  it('persists the reviewed Order and shows confirmation only after success', async () => {
    const user = userEvent.setup()

    const { createOrder } =
      renderOrderBuilder()

    await screen.findByRole('heading', {
      name: 'Country Sourdough',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Country Sourdough to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    )

    fireEvent.change(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
      {
        target: {
          value: '2026-10-18T08:15',
        },
      },
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Place order',
      }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Order confirmed',
      }),
    ).toBeVisible()

    expect(
      screen.getByText(persistedOrderId),
    ).toBeVisible()

    expect(createOrder).toHaveBeenCalledTimes(1)

    expect(
      createOrder.mock.calls[0]?.[0],
    ).toMatchObject({
      businessId,
      customerNotes: null,
      items: [
        {
          productId: sourdoughId,
          requestedQuantity: 1,
        },
      ],
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Create another order',
      }),
    )

    expect(
      screen.getByText(
        'Your cart is empty.',
      ),
    ).toBeVisible()
  })

  it('preserves the reviewed Cart and exposes only a generic error when persistence fails', async () => {
    const user = userEvent.setup()

    const createOrder =
      vi.fn<CreateOrderGateway['createOrder']>()

    createOrder.mockRejectedValue(
      new Error(
        'sensitive provider error',
      ),
    )

    renderOrderBuilder(createOrder)

    await screen.findByRole('heading', {
      name: 'Pastry Mix',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Add Pastry Mix to cart',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Review order',
      }),
    )

    fireEvent.change(
      screen.getByLabelText(
        'Requested delivery date and time',
      ),
      {
        target: {
          value: '2026-10-18T08:15',
        },
      },
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Place order',
      }),
    )

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      'Unable to place order. Please try again.',
    )

    expect(
      screen.queryByText(
        /sensitive provider error/i,
      ),
    ).toBeNull()

    expect(
      screen.queryByRole('heading', {
        name: 'Order confirmed',
      }),
    ).toBeNull()

    await user.click(
      screen.getByRole('button', {
        name: 'Back to cart',
      }),
    )

    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity for Pastry Mix',
      }),
    ).toHaveValue(0.25)
  })
})