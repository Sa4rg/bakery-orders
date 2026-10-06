import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../src/lib/supabase/database.types.ts'
import {
  fixtureBusinesses,
  fixtureCredentials,
  type FixtureKey,
} from './support/fixtures.ts'
import { getLocalSupabasePublicConfig } from './support/localSupabase.ts'

// These tests use only the public (publishable) client, exactly what a browser
// could use. They prove that a real Auth JWT reaches PostgreSQL RLS; the pgTAP
// suite remains the authoritative test of the policies themselves.

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

async function createSignedInClient(key: FixtureKey) {
  const client = createPublicClient()
  const { error } = await client.auth.signInWithPassword(fixtureCredentials(key))

  expect(error).toBeNull()

  return client
}

test.describe('real JWT and RLS integration', () => {
  test('CUSTOMER A can read only Business A', async () => {
    const client = await createSignedInClient('customerA')

    // No filter: the complete result visible to this identity is inspected.
    const { data, error } = await client.from('businesses').select('id, name')

    expect(error).toBeNull()
    expect(data).toEqual([
      { id: fixtureBusinesses.A.id, name: fixtureBusinesses.A.name },
    ])
  })

  test('CUSTOMER B can read only Business B', async () => {
    const client = await createSignedInClient('customerB')

    const { data, error } = await client.from('businesses').select('id, name')

    expect(error).toBeNull()
    expect(data).toEqual([
      { id: fixtureBusinesses.B.id, name: fixtureBusinesses.B.name },
    ])
  })

  test('CUSTOMER A cannot see the other Business even when asking for it by id', async () => {
    const client = await createSignedInClient('customerA')

    const { data, error } = await client
      .from('businesses')
      .select('id')
      .eq('id', fixtureBusinesses.B.id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('CUSTOMER A reads only their own Profile and membership rows', async () => {
    const client = await createSignedInClient('customerA')

    const profiles = await client.from('profiles').select('id, role')
    const memberships = await client
      .from('business_memberships')
      .select('business_id, active')

    expect(profiles.error).toBeNull()
    expect(profiles.data).toHaveLength(1)
    expect(profiles.data?.[0]?.role).toBe('CUSTOMER')
    expect(memberships.error).toBeNull()
    expect(memberships.data).toEqual([
      { business_id: fixtureBusinesses.A.id, active: true },
    ])
  })

  test('an unauthenticated client cannot read businesses', async () => {
    const client = createPublicClient()

    const { data, error } = await client.from('businesses').select('id')

    expect(data).toBeNull()
    // 42501 = insufficient_privilege: the anon role holds no grant.
    expect(error?.code).toBe('42501')
  })
})
