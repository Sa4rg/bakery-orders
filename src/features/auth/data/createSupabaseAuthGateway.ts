import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import type {
  AuthGateway,
  SessionSnapshot,
  SignInOutcome,
} from '../application/authGateway'
import type { AuthProfile, BusinessMembership } from '../domain/access'

/**
 * Failures that say nothing about the submitted credentials: transport
 * problems, rate limiting, server faults, or a disabled Email provider.
 */
function isServiceUnavailable(error: {
  status?: number
  code?: string
}): boolean {
  return (
    isAuthRetryableFetchError(error) ||
    error.code === 'email_provider_disabled' ||
    (typeof error.status === 'number' &&
      (error.status === 429 || error.status >= 500))
  )
}

/**
 * Supabase implementation of the auth boundary.
 *
 * Raw Supabase errors and tokens never leave this module: callers receive
 * only generic outcomes and minimal session snapshots.
 */
export function createSupabaseAuthGateway(
  client: SupabaseBrowserClient,
): AuthGateway {
  return {
    subscribeToSession(listener) {
      // The callback must stay synchronous and must not call Supabase APIs.
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const snapshot: SessionSnapshot = session
          ? { userId: session.user.id }
          : null

        listener(snapshot)
      })

      return () => data.subscription.unsubscribe()
    },

    async signInWithPassword(credentials): Promise<SignInOutcome> {
      try {
        const { error } = await client.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })

        if (error === null) {
          return 'success'
        }

        // Every client-side rejection collapses into one generic outcome so
        // the UI cannot reveal whether an account exists.
        return isServiceUnavailable(error)
          ? 'unavailable'
          : 'invalid_credentials'
      } catch {
        return 'unavailable'
      }
    },

    async signOutLocal() {
      try {
        const { error } = await client.auth.signOut({ scope: 'local' })

        return error === null
      } catch {
        return false
      }
    },

    async fetchOwnProfile(): Promise<AuthProfile | null> {
      // No id filter: RLS exposes only the caller's own Profile, and the
      // identity is never taken from UI state.
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, role, active')
        .maybeSingle()

      if (error) {
        throw new Error('Profile lookup failed.')
      }

      return data
        ? {
            id: data.id,
            displayName: data.display_name,
            role: data.role,
            active: data.active,
          }
        : null
    },

    async fetchOwnMemberships(): Promise<BusinessMembership[]> {
      const { data, error } = await client
        .from('business_memberships')
        .select('id, business_id, active')

      if (error) {
        throw new Error('Membership lookup failed.')
      }

      return data.map((row) => ({
        id: row.id,
        businessId: row.business_id,
        active: row.active,
      }))
    },
  }
}
