import type { Locator, Page } from '@playwright/test'
import { fixtureCredentials, type FixtureKey } from './fixtures.ts'

interface InputElementLike {
  dispatchEvent(event: Event): boolean
}

/**
 * Sets a secret input value without exposing it in Playwright step titles or
 * call logs (a plain fill(...) prints its argument on failure).
 *
 * The native value setter is used so React notices the change. The callback
 * runs in the browser; it is typed structurally because the Node tsconfig has
 * no DOM types.
 */
export async function fillSecret(locator: Locator, value: string) {
  await locator.evaluate((element: InputElementLike, secret: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    )

    descriptor?.set?.call(element, secret)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

/** Signs in through the real login form with a fixture identity. */
export async function signInThroughUi(page: Page, key: FixtureKey) {
  const { email, password } = fixtureCredentials(key)

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await fillSecret(page.getByLabel('Password'), password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
