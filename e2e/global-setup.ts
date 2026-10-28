import type { FullConfig } from '@playwright/test'
import {
  clearFixturePassword,
  generateFixturePassword,
  provisionFixtures,
  productAvailabilityFixtureForRepeat,
  publishFixturePassword,
  removeFixtures,
} from './support/fixtures.ts'
import {
  createLocalAdminClient,
  resolveLocalSupabaseRuntime,
} from './support/localSupabase.ts'

/**
 * Provisions fictional Auth users and application data in the LOCAL Supabase
 * stack. The privileged client lives only in this closure (Node, in memory)
 * and is dropped when the run ends.
 */
export default async function globalSetup(config: FullConfig) {
  // Throws before any privileged call when the target is not a local stack.
  const admin = createLocalAdminClient(resolveLocalSupabaseRuntime())
  const password = generateFixturePassword()

  try {
    // Playwright runs global setup once, but repeatEach instances may execute
    // concurrently in separate workers against the same PostgreSQL database.
    // The CLI --repeat-each option is applied to test scheduling, but the
    // global setup may see the project's configured repeatEach (usually 1).
    // Provision both fixture variants for our --repeat-each=2 stress run.
    const repeatEach = Math.max(2, ...config.projects.map(({ repeatEach }) => repeatEach))
    await provisionFixtures(admin, password, repeatEach)

    // Fail at setup, not later at an ambiguous UI locator, if repeat fixture
    // provisioning regresses. Admin access stays inside Node-only setup.
    const repeatProductId = productAvailabilityFixtureForRepeat(1).productId
    const { data: repeatProduct, error: repeatProductError } = await admin
      .from('products')
      .select('id, active, available')
      .eq('id', repeatProductId)
      .maybeSingle()

    if (repeatProductError || !repeatProduct?.active || !repeatProduct.available) {
      throw new Error('E2E repeat Product was not provisioned as active and available.')
    }
  } catch (error) {
    await removeFixtures(admin).catch(() => undefined)
    throw error
  }

  publishFixturePassword(password)

  // Returned function is Playwright's global teardown.
  return async () => {
    clearFixturePassword()
    await removeFixtures(admin)
  }
}
