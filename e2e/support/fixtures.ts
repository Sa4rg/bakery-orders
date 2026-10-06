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

/** Removes only the exact fixture identities and Businesses. Idempotent. */
export async function removeFixtures(admin: LocalAdminClient): Promise<void> {
  const userIds = await findFixtureUserIds(admin)

  if (userIds.length > 0) {
    // FKs are ON DELETE RESTRICT: memberships, then profiles, then Auth users.
    const memberships = await admin
      .from('business_memberships')
      .delete()
      .in('user_id', userIds)

    if (memberships.error) {
      fail('remove fixture memberships')
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
): Promise<void> {
  await removeFixtures(admin)

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
