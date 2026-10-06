import { expect, test, type Page } from '@playwright/test'
import { fillSecret, signInThroughUi } from './support/browserAuth.ts'
import {
  fixtureCredentials,
  fixtureIdentities,
  type FixtureKey,
} from './support/fixtures.ts'

// Every test receives a fresh BrowserContext (empty storage), so no test can
// pass because another test left a valid Supabase session behind.

const signInHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Sign in' })

const protectedShell = (page: Page) =>
  page.getByRole('region', { name: 'Your session' })

async function expectProtectedShell(
  page: Page,
  key: FixtureKey,
  role: 'CUSTOMER' | 'KITCHEN' | 'MANAGER',
) {
  const shell = protectedShell(page)

  await expect(shell).toBeVisible()
  await expect(shell.getByText('Application foundation ready.')).toBeVisible()
  await expect(shell.getByText(fixtureIdentities[key].displayName)).toBeVisible()
  await expect(shell.getByText(role, { exact: true })).toBeVisible()
}

test.describe('real Supabase authentication', () => {
  test('shows the sign-in form to a signed-out visitor', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Bakery Orders' }),
    ).toBeVisible()
    await expect(signInHeading(page)).toBeVisible()
    await expect(protectedShell(page)).toHaveCount(0)
  })

  test('signs in an authorized CUSTOMER, restores the session on reload, and signs out locally', async ({
    page,
  }) => {
    await signInThroughUi(page, 'customerA')
    await expectProtectedShell(page, 'customerA', 'CUSTOMER')

    await page.reload()

    await expectProtectedShell(page, 'customerA', 'CUSTOMER')
    await expect(signInHeading(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(signInHeading(page)).toBeVisible()
    await expect(protectedShell(page)).toHaveCount(0)

    await page.reload()

    await expect(signInHeading(page)).toBeVisible()
    await expect(protectedShell(page)).toHaveCount(0)
  })

  const staffRoles = [
    ['kitchen', 'KITCHEN'],
    ['manager', 'MANAGER'],
  ] as const

  for (const [key, role] of staffRoles) {
    test(`signs in ${role} without requiring a customer membership`, async ({
      page,
    }) => {
      await signInThroughUi(page, key)

      await expectProtectedShell(page, key, role)
    })
  }

  const deniedStates = [
    ['noProfile', 'an authenticated identity without a Profile'],
    ['inactiveProfile', 'an inactive Profile'],
    ['customerWithoutActiveMembership', 'a CUSTOMER without an active membership'],
  ] as const

  for (const [key, description] of deniedStates) {
    test(`denies ${description}`, async ({ page }) => {
      await signInThroughUi(page, key)

      await expect(
        page.getByRole('heading', { name: 'Access denied' }),
      ).toBeVisible()
      await expect(protectedShell(page)).toHaveCount(0)
      await expect(
        page.getByText('Application foundation ready.'),
      ).toHaveCount(0)
    })
  }

  test('shows the same generic error for a wrong password and an unknown account', async ({
    page,
  }) => {
    const genericError = 'Unable to sign in with those credentials.'
    const wrongPassword = 'Wr0ng!Passw0rd#E2E'
    const { email } = fixtureCredentials('customerA')

    await page.goto('/')
    await page.getByLabel('Email').fill(email)
    await fillSecret(page.getByLabel('Password'), wrongPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page.getByRole('alert')).toHaveText(genericError)

    await page.getByLabel('Email').fill('e2e.unknown-account@bakery-e2e.test')
    await fillSecret(page.getByLabel('Password'), wrongPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page.getByRole('alert')).toHaveText(genericError)
    await expect(page.getByText(/invalid login credentials/i)).toHaveCount(0)
    await expect(protectedShell(page)).toHaveCount(0)
  })
})
