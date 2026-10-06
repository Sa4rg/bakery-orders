import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import { generateFixturePassword } from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

// ADR-013: public signup and anonymous sign-in must be disabled. These tests
// use only the publishable client, never a privileged credential.

function createPublicClient() {
  const { url, publishableKey } = getLocalSupabasePublicConfig()

  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

test.describe('Supabase Auth enrollment configuration', () => {
  test('rejects public signup', async () => {
    const { data, error } = await createPublicClient().auth.signUp({
      email: `e2e.signup-probe.${randomUUID()}@bakery-e2e.test`,
      password: generateFixturePassword(),
    })

    expect(error?.code).toBe('signup_disabled')
    expect(data.session).toBeNull()
    expect(data.user).toBeNull()
  })

  test('rejects anonymous sign-in', async () => {
    const { data, error } = await createPublicClient().auth.signInAnonymously()

    expect(error?.code).toBe('anonymous_provider_disabled')
    expect(data.session).toBeNull()
    expect(data.user).toBeNull()
  })
})
