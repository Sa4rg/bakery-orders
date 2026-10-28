import { randomInt } from 'node:crypto'
import type { Database } from '../../src/lib/supabase/database.types.ts'
import type { LocalAdminClient } from './localSupabase.ts'

/**
 * Fictional, test-only identities for real Supabase Auth E2E tests.
 *
 * Node-only. Users are created through the Auth Admin API (never by writing
 * password data into auth.users). Only the exact identities and Businesses
 * listed here are ever created, reconciled, or removed.
 */

type AppRole = Database['public']['Enums']['app_role']

export type BusinessKey = 'A' | 'B'

export const fixtureBusinesses = {
  A: { id: '00000000-0000-4000-8000-000000000e01', name: 'E2E Fixture Bakery A' },
  B: { id: '00000000-0000-4000-8000-000000000e02', name: 'E2E Fixture Bakery B' },
} as const satisfies Record<BusinessKey, { id: string; name: string }>

/** Reserved catalog rows used only by the focused Manager administration E2E. */
export const managerCatalogFixture = {
  categoryName: 'E2E Manager Administration Category',
  productName: 'E2E Manager Administration Product',
} as const

/** Distinct reserved names for each repeat of the Manager mutation E2E. */
export function managerCatalogFixtureForRepeat(repeatIndex: number) {
  if (repeatIndex === 0) return managerCatalogFixture
  return {
    categoryName: `${managerCatalogFixture.categoryName} (repeat ${repeatIndex})`,
    productName: `${managerCatalogFixture.productName} (repeat ${repeatIndex})`,
  }
}

/** Reserved catalog rows used only by the Product availability E2E. */
export const productAvailabilityFixture = {
  categoryId: '00000000-0000-4000-8000-000000000e11',
  productId: '00000000-0000-4000-8000-000000000e12',
  categoryName: 'E2E Product Availability Category',
  productName: 'E2E Product Availability Product',
} as const

/** Each repeat gets a separate Product under the same reserved Category. */
export function productAvailabilityFixtureForRepeat(repeatIndex: number) {
  if (repeatIndex === 0) return productAvailabilityFixture
  if (!Number.isSafeInteger(repeatIndex) || repeatIndex < 0 || repeatIndex > 4095) {
    throw new Error('Invalid E2E repeat index for Product availability.')
  }
  return {
    ...productAvailabilityFixture,
    productId: `00000000-0000-4000-8000-${(0xe100 + repeatIndex).toString(16).padStart(12, '0')}`,
    productName: `${productAvailabilityFixture.productName} (repeat ${repeatIndex})`,
  }
}

/** Reserved catalog rows used only by the CUSTOMER ordering E2E. */
export const customerOrderingFixture = {
  categoryId:
    '00000000-0000-4000-8000-000000000e21',
  productId:
    '00000000-0000-4000-8000-000000000e22',
  categoryName:
    'E2E Customer Ordering Category',
  productName:
    'E2E Customer Ordering Product',
} as const

export type FixtureKey =
  | 'customerA'
  | 'customerB'
  | 'kitchen'
  | 'manager'
  | 'noProfile'
  | 'inactiveProfile'
  | 'customerWithoutActiveMembership'

export interface FixtureIdentity {
  email: string
  displayName: string
  /** null: an authenticated identity with no public.profiles row. */
  profile: { role: AppRole; active: boolean } | null
  membership: { business: BusinessKey; active: boolean } | null
}

export const fixtureIdentities: Record<FixtureKey, FixtureIdentity> = {
  customerA: {
    email: 'e2e.customer-a@bakery-e2e.test',
    displayName: 'E2E Customer A',
    profile: { role: 'CUSTOMER', active: true },
    membership: { business: 'A', active: true },
  },
  customerB: {
    email: 'e2e.customer-b@bakery-e2e.test',
    displayName: 'E2E Customer B',
    profile: { role: 'CUSTOMER', active: true },
    membership: { business: 'B', active: true },
  },
  kitchen: {
    email: 'e2e.kitchen@bakery-e2e.test',
    displayName: 'E2E Kitchen',
    profile: { role: 'KITCHEN', active: true },
    membership: null,
  },
  manager: {
    email: 'e2e.manager@bakery-e2e.test',
    displayName: 'E2E Manager',
    profile: { role: 'MANAGER', active: true },
    membership: null,
  },
  noProfile: {
    email: 'e2e.no-profile@bakery-e2e.test',
    displayName: 'E2E No Profile',
    profile: null,
    membership: null,
  },
  inactiveProfile: {
    email: 'e2e.inactive-profile@bakery-e2e.test',
    displayName: 'E2E Inactive Profile',
    profile: { role: 'CUSTOMER', active: false },
    membership: { business: 'A', active: true },
  },
  customerWithoutActiveMembership: {
    email: 'e2e.customer-no-membership@bakery-e2e.test',
    displayName: 'E2E Customer Without Membership',
    profile: { role: 'CUSTOMER', active: true },
    membership: { business: 'A', active: false },
  },
}

// The runtime password travels only through this process's environment: global
// setup sets it before workers start. It is never written to disk or logged.
const PASSWORD_ENV = 'E2E_FIXTURE_PASSWORD'

export function readFixturePassword(): string {
  const password = process.env[PASSWORD_ENV]

  if (!password) {
    throw new Error(
      'The E2E fixture password is missing. Run the suite through "pnpm e2e" so global setup provisions the fixtures.',
    )
  }

  return password
}

export function fixtureCredentials(key: FixtureKey) {
  return { email: fixtureIdentities[key].email, password: readFixturePassword() }
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*-_=+'

function pick(alphabet: string): string {
  return alphabet.charAt(randomInt(alphabet.length))
}

/**
 * Random 24-character password satisfying the local Auth policy (>= 12
 * characters with lowercase, uppercase, digit, and symbol).
 */
export function generateFixturePassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const characters = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]

  while (characters.length < 24) {
    characters.push(pick(all))
  }

  // Fisher-Yates shuffle so the guaranteed classes are not positional.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    const current = characters[index] as string

    characters[index] = characters[swapIndex] as string
    characters[swapIndex] = current
  }

  return characters.join('')
}

export function publishFixturePassword(password: string): void {
  process.env[PASSWORD_ENV] = password
}

export function clearFixturePassword(): void {
  delete process.env[PASSWORD_ENV]
}

function fail(step: string): never {
  // Context only: provider messages are deliberately not forwarded.
  throw new Error(`E2E fixture setup failed while trying to ${step}.`)
}

async function findFixtureUserIds(admin: LocalAdminClient): Promise<string[]> {
  const fixtureEmails = new Set(
    Object.values(fixtureIdentities).map(({ email }) => email),
  )
  const ids: string[] = []
  const perPage = 200

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })

    if (error) {
      fail('list Auth users')
    }

    for (const user of data.users) {
      if (user.email && fixtureEmails.has(user.email.toLowerCase())) {
        ids.push(user.id)
      }
    }

    if (data.users.length < perPage) {
      return ids
    }
  }
}

async function removeFixtureOrders(
  admin: LocalAdminClient,
): Promise<void> {
  const businessIds = Object.values(
    fixtureBusinesses,
  ).map(({ id }) => id)

  const ordersResult = await admin
    .from('orders')
    .select('id')
    .in('business_id', businessIds)

  if (ordersResult.error) {
    fail('find fixture Orders')
  }

  const orderIds = ordersResult.data.map(
    ({ id }) => id,
  )

  if (orderIds.length === 0) {
    return
  }

  /*
   * Operational tables intentionally use restrictive historical
   * relationships. E2E teardown is trusted test infrastructure,
   * so remove exact fixture-owned data explicitly from children
   * to parent rather than weakening database integrity.
   */
  const events = await admin
    .from('order_events')
    .delete()
    .in('order_id', orderIds)

  if (events.error) {
    fail('remove fixture Order events')
  }

  const items = await admin
    .from('order_items')
    .delete()
    .in('order_id', orderIds)

  if (items.error) {
    fail('remove fixture Order items')
  }

  const orders = await admin
    .from('orders')
    .delete()
    .in('id', orderIds)

  if (orders.error) {
    fail('remove fixture Orders')
  }
}

/** Removes only the exact reserved E2E rows. Idempotent. */
export async function removeFixtures(admin: LocalAdminClient): Promise<void> {
  await removeFixtureOrders(admin)

  const orderingProduct = await admin
    .from('products')
    .delete()
    .eq(
      'id',
      customerOrderingFixture.productId,
    )

  if (orderingProduct.error) {
    fail('remove the Customer ordering E2E Product')
  }

  const orderingCategory = await admin
    .from('categories')
    .delete()
    .eq(
      'id',
      customerOrderingFixture.categoryId,
    )

  if (orderingCategory.error) {
    fail(
      'remove the Customer ordering E2E Category',
    )
  }
  const availabilityProduct = await admin
    .from('products')
    .delete()
    .eq('id', productAvailabilityFixture.productId)

  if (availabilityProduct.error) {
    fail('remove the Product availability E2E Product')
  }

  // Only the E2E-reserved repeat suffix is matched. This also removes
  // leftovers when a previous test process was interrupted before teardown.
  const repeatedAvailabilityProducts = await admin
    .from('products')
    .delete()
    .like('name', `${productAvailabilityFixture.productName} (repeat %)`)

  if (repeatedAvailabilityProducts.error) {
    fail('remove repeated Product availability E2E Products')
  }

  const availabilityCategory = await admin
    .from('categories')
    .delete()
    .eq('id', productAvailabilityFixture.categoryId)

  if (availabilityCategory.error) {
    fail('remove the Product availability E2E Category')
  }
  // The reserved Manager E2E prefix covers the base Product and its
  // per-repeat variants. Delete Products before their respective Categories.
  const catalogProduct = await admin
    .from('products')
    .delete()
    .like('name', `${managerCatalogFixture.productName}%`)

  if (catalogProduct.error) {
    fail('remove the Manager catalog E2E Product')
  }

  const catalogCategory = await admin
    .from('categories')
    .delete()
    .like('name', `${managerCatalogFixture.categoryName}%`)

  if (catalogCategory.error) {
    fail('remove the Manager catalog E2E Category')
  }

  const userIds = await findFixtureUserIds(admin)

  if (userIds.length > 0) {
    // Fixture Profiles may be referenced by memberships and Product availability
    // audit metadata. Clear those test-only references before deleting Profiles.
    const memberships = await admin
      .from('business_memberships')
      .delete()
      .in('user_id', userIds)

    if (memberships.error) {
      fail('remove fixture memberships')
    }

    const productAvailabilityAudit = await admin
      .from('products')
      .update({
        availability_updated_at: null,
        availability_updated_by: null,
      })
      .in('availability_updated_by', userIds)

    if (productAvailabilityAudit.error) {
      fail('clear fixture Product availability audit references')
    }

    const profiles = await admin.from('profiles').delete().in('id', userIds)

    if (profiles.error) {
      fail('remove fixture profiles')
    }

    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id)

      if (error) {
        fail('remove a fixture Auth user')
      }
    }
  }

  const businesses = await admin
    .from('businesses')
    .delete()
    .in('id', Object.values(fixtureBusinesses).map(({ id }) => id))

  if (businesses.error) {
    fail('remove fixture businesses')
  }
}

/** Reconciles the fixture set from scratch. Safe to repeat. */
export async function provisionFixtures(
  admin: LocalAdminClient,
  password: string,
  repeatEach: number = 1,
): Promise<void> {
  await removeFixtures(admin)

  const orderingCategory = await admin
    .from('categories')
    .insert({
      id: customerOrderingFixture.categoryId,
      name: customerOrderingFixture.categoryName,
      description:
        'Reserved CUSTOMER ordering E2E data.',
      active: true,
      display_order: 102,
    })

  if (orderingCategory.error) {
    fail(
      'create the Customer ordering E2E Category',
    )
  }

  const orderingProduct = await admin
    .from('products')
    .insert({
      id: customerOrderingFixture.productId,
      category_id:
        customerOrderingFixture.categoryId,
      name: customerOrderingFixture.productName,
      description:
        'Reserved CUSTOMER ordering E2E data.',
      unit_code: 'UNIT',
      quantity_step: 1,
      active: true,
      available: true,
    })

  if (orderingProduct.error) {
    fail(
      'create the Customer ordering E2E Product',
    )
  }

  const availabilityCategory = await admin.from('categories').insert({
    id: productAvailabilityFixture.categoryId,
    name: productAvailabilityFixture.categoryName,
    description: 'Reserved Product availability E2E data.',
    active: true,
    display_order: 101,
  })

  if (availabilityCategory.error) {
    fail('create the Product availability E2E Category')
  }

  const availabilityProduct = await admin.from('products').insert({
    id: productAvailabilityFixture.productId,
    category_id: productAvailabilityFixture.categoryId,
    name: productAvailabilityFixture.productName,
    description: 'Reserved Product availability E2E data.',
    unit_code: 'UNIT',
    quantity_step: 1,
    active: true,
    available: true,
  })

  if (availabilityProduct.error) {
    fail('create the Product availability E2E Product')
  }

  for (let repeatIndex = 1; repeatIndex < repeatEach; repeatIndex += 1) {
    const variant = productAvailabilityFixtureForRepeat(repeatIndex)
    const added = await admin.from('products').insert({
      id: variant.productId,
      category_id: variant.categoryId,
      name: variant.productName,
      description: 'Reserved Product availability E2E repeat data.',
      unit_code: 'UNIT',
      quantity_step: 1,
      active: true,
      available: true,
    })
    if (added.error) {
      fail('create repeated Product availability E2E Product')
    }
  }

  const businesses = await admin
    .from('businesses')
    .insert(Object.values(fixtureBusinesses).map(({ id, name }) => ({ id, name })))

  if (businesses.error) {
    fail('create fixture businesses')
  }

  for (const identity of Object.values(fixtureIdentities)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: identity.email,
      password,
      email_confirm: true,
    })

    if (error || !data.user) {
      fail('create a fixture Auth user')
    }

    const userId = data.user.id

    if (identity.profile) {
      const profile = await admin.from('profiles').insert({
        id: userId,
        display_name: identity.displayName,
        role: identity.profile.role,
        active: identity.profile.active,
      })

      if (profile.error) {
        fail('create a fixture profile')
      }
    }

    if (identity.membership) {
      const membership = await admin.from('business_memberships').insert({
        user_id: userId,
        business_id: fixtureBusinesses[identity.membership.business].id,
        active: identity.membership.active,
      })

      if (membership.error) {
        fail('create a fixture membership')
      }
    }
  }
}
