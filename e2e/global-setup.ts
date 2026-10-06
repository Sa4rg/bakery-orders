import {
  clearFixturePassword,
  generateFixturePassword,
  provisionFixtures,
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
export default async function globalSetup() {
  // Throws before any privileged call when the target is not a local stack.
  const admin = createLocalAdminClient(resolveLocalSupabaseRuntime())
  const password = generateFixturePassword()

  try {
    await provisionFixtures(admin, password)
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
