import {
  expect,
  test,
  type Page,
} from '@playwright/test'
import { signInThroughUi } from './support/browserAuth.ts'
import {
  customerOrderingFixture,
  fixtureBusinesses,
} from './support/fixtures.ts'
import {
  createLocalAdminClient,
  resolveLocalSupabaseRuntime,
} from './support/localSupabase.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DELIVERY_DATE_TIME =
  '2030-01-15T10:30'

const ORDER_NOTES =
  'E2E customer ordering.'

async function createCustomerOrder(
  page: Page,
): Promise<string> {
  await signInThroughUi(
    page,
    'customerA',
  )

  await expect(
    page.getByRole('heading', {
      name: 'Catalog',
    }),
  ).toBeVisible()

  /*
   * Browse/search the real RLS-protected catalog rather
   * than addressing the Product through test-only APIs.
   */
  await page
    .getByRole('searchbox', {
      name: 'Search products',
    })
    .fill(
      customerOrderingFixture.productName,
    )

  await expect(
    page.getByRole('heading', {
      name:
        customerOrderingFixture.productName,
    }),
  ).toBeVisible()

  await page
    .getByRole('button', {
      name: `Add ${customerOrderingFixture.productName} to cart`,
    })
    .click()

  /*
   * Explicitly prove the editable Cart rather than merely
   * accepting the initial quantity.
   */
  await page
    .getByRole('button', {
      name: `Increase ${customerOrderingFixture.productName} quantity`,
    })
    .click()

  await expect(
    page.getByRole('spinbutton', {
      name: `Quantity for ${customerOrderingFixture.productName}`,
    }),
  ).toHaveValue('2')

  await page
    .getByRole('button', {
      name: 'Review order',
    })
    .click()

  await expect(
    page.getByRole('heading', {
      name: 'Review order',
    }),
  ).toBeVisible()

  await expect(
    page.getByRole('heading', {
      name:
        customerOrderingFixture.productName,
    }),
  ).toBeVisible()

  await page
    .getByLabel(
      'Requested delivery date and time',
    )
    .fill(DELIVERY_DATE_TIME)

  await page
    .getByRole('textbox', {
      name: 'Optional notes',
    })
    .fill(ORDER_NOTES)

  await page
    .getByRole('button', {
      name: 'Place order',
    })
    .click()

  await expect(
    page.getByRole('heading', {
      name: 'Order confirmed',
    }),
  ).toBeVisible()

  const orderIdLocator =
    page.getByText(UUID_PATTERN)

  await expect(
    orderIdLocator,
  ).toBeVisible()

  const orderId = (
    await orderIdLocator.textContent()
  )?.trim()

  if (
    orderId === undefined ||
    !UUID_PATTERN.test(orderId)
  ) {
    throw new Error(
      'The persisted Order confirmation did not expose a valid Order id.',
    )
  }

  return orderId
}

test(
  'CUSTOMER completes the real ordering flow and the Order remains persisted after reload',
  async ({ page }) => {
    const orderId =
      await createCustomerOrder(page)

    /*
     * React confirmation state is intentionally temporary in
     * M3. Reload proves Auth/session restoration; persistence
     * itself is verified independently from PostgreSQL.
     */
    await page.reload()

    await expect(
      page.getByRole('heading', {
        name: 'Catalog',
      }),
    ).toBeVisible()

    await expect(
      page.getByRole('button', {
        name: 'Sign out',
      }),
    ).toBeVisible()

    const admin =
      createLocalAdminClient(
        resolveLocalSupabaseRuntime(),
      )

    const orderResult = await admin
      .from('orders')
      .select(
      'id, business_id, created_by_user_id, status, customer_notes, cancelled_at',
      )
      .eq('id', orderId)
      .single()

    if (
      orderResult.error ||
      orderResult.data === null
    ) {
      throw new Error(
        'The E2E Order could not be read after reload.',
      )
    }

    expect(orderResult.data.id).toBe(
      orderId,
    )

    expect(
      orderResult.data.business_id,
    ).toBe(
      fixtureBusinesses.A.id,
    )

    expect(
      orderResult.data.status,
    ).toBe('RECEIVED')

    expect(
      orderResult.data.customer_notes,
    ).toBe(ORDER_NOTES)

    expect(
      orderResult.data.cancelled_at,
    ).toBeNull()

    const itemResult = await admin
      .from('order_items')
      .select(
        'product_id, product_name_snapshot, unit_code_snapshot, quantity_step_snapshot, requested_quantity',
      )
      .eq('order_id', orderId)
      .single()

    if (
      itemResult.error ||
      itemResult.data === null
    ) {
      throw new Error(
        'The E2E Order item could not be read.',
      )
    }

    expect(
      itemResult.data.product_id,
    ).toBe(
      customerOrderingFixture.productId,
    )

    expect(
      itemResult.data.product_name_snapshot,
    ).toBe(
      customerOrderingFixture.productName,
    )

    expect(
      itemResult.data.unit_code_snapshot,
    ).toBe('UNIT')

    expect(
      itemResult.data.quantity_step_snapshot,
    ).toBe(1)

    expect(
      itemResult.data.requested_quantity,
    ).toBe(2)

    const createdEventResult =
      await admin
        .from('order_events')
        .select(
          'event_type, actor_user_id',
        )
        .eq('order_id', orderId)
        .eq(
          'event_type',
          'ORDER_CREATED',
        )
        .single()

    if (
      createdEventResult.error ||
      createdEventResult.data === null
    ) {
      throw new Error(
        'The E2E ORDER_CREATED event could not be read.',
      )
    }

    expect(
      createdEventResult.data.event_type,
    ).toBe('ORDER_CREATED')

    expect(
      createdEventResult.data.actor_user_id,
    ).toBe(
      orderResult.data.created_by_user_id,
    )
  },
)

test(
  'CUSTOMER cancels the just-created RECEIVED Order and the cancellation is persisted and audited',
  async ({ page }) => {
    const orderId =
      await createCustomerOrder(page)

    const cancellationReason =
      'E2E customer changed requirements.'

    await page
      .getByRole('textbox', {
        name: 'Cancellation reason',
      })
      .fill(
        `  ${cancellationReason}  `,
      )

    await page
      .getByRole('button', {
        name: 'Cancel order',
      })
      .click()

    await expect(
      page.getByRole('heading', {
        name: 'Order cancelled',
      }),
    ).toBeVisible()

    await expect(
      page.getByText(orderId),
    ).toBeVisible()

    const admin =
      createLocalAdminClient(
        resolveLocalSupabaseRuntime(),
      )

    const orderResult = await admin
      .from('orders')
      .select(
      'id, created_by_user_id, status, cancelled_at, cancelled_by_user_id, cancellation_reason',
      )
      .eq('id', orderId)
      .single()

    if (
      orderResult.error ||
      orderResult.data === null
    ) {
      throw new Error(
        'The cancelled E2E Order could not be read.',
      )
    }

    expect(
      orderResult.data.status,
    ).toBe('CANCELLED')

    expect(
      orderResult.data.cancellation_reason,
    ).toBe(cancellationReason)

    expect(
      orderResult.data.cancelled_at,
    ).not.toBeNull()

    expect(
      orderResult.data.cancelled_by_user_id,
    ).toBe(
      orderResult.data.created_by_user_id,
    )

    const eventResult = await admin
      .from('order_events')
      .select(
        'event_type, actor_user_id, reason, previous_value, new_value, occurred_at',
      )
      .eq('order_id', orderId)
      .eq(
        'event_type',
        'ORDER_CANCELLED',
      )
      .single()

    if (
      eventResult.error ||
      eventResult.data === null
    ) {
      throw new Error(
        'The E2E ORDER_CANCELLED event could not be read.',
      )
    }

    expect(
      eventResult.data.event_type,
    ).toBe('ORDER_CANCELLED')

    expect(
      eventResult.data.actor_user_id,
    ).toBe(
      orderResult.data.cancelled_by_user_id,
    )

    expect(
      eventResult.data.reason,
    ).toBe(cancellationReason)

    expect(
      eventResult.data.previous_value,
    ).toEqual({
      status: 'RECEIVED',
    })

    expect(
      eventResult.data.new_value,
    ).toEqual({
      status: 'CANCELLED',
    })

    expect(
      eventResult.data.occurred_at,
    ).toBe(
      orderResult.data.cancelled_at,
    )
  },
)