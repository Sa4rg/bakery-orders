import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CustomerCatalog as CustomerCatalogData } from '../../catalog/application/catalogGateway'
import { createFakeCatalogGateway } from '../../catalog/testing/fakeCatalogGateway'
import { CustomerOrderBuilder } from './CustomerOrderBuilder'

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
      id: 'sourdough',
      categoryId: 'bread',
      name: 'Country Sourdough',
      description: 'Naturally leavened loaf.',
      unitCode: 'UNIT',
      quantityStep: 1,
      available: true,
    },
    {
      id: 'pastry-mix',
      categoryId: 'pastries',
      name: 'Pastry Mix',
      description: null,
      unitCode: 'KG',
      quantityStep: 0.25,
      available: true,
    },
    {
      id: 'unavailable-croissant',
      categoryId: 'pastries',
      name: 'Unavailable Croissant',
      description: null,
      unitCode: 'UNIT',
      quantityStep: 1,
      available: false,
    },
  ],
}

function renderOrderBuilder() {
  const fake = createFakeCatalogGateway([catalog])

  return {
    ...render(
      <CustomerOrderBuilder
        catalogGateway={fake.gateway}
      />,
    ),
    fake,
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
})