import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { createSupabaseAuthGateway } from './createSupabaseAuthGateway'

type QueryResult = { data: unknown; error: unknown }

function queryResult(result: QueryResult) {
  return Object.assign(Promise.resolve(result), {
    maybeSingle: vi.fn(async () => result),
  })
}

function createFakeClient(
  options: {
    signIn?: () => Promise<{ error: unknown }>
    signOut?: () => Promise<{ error: unknown }>
    profileResult?: QueryResult
    membershipsResult?: QueryResult
  } = {},
) {
  const unsubscribe = vi.fn()
  let authCallback: (event: string, session: unknown) => void = () => {}

  const auth = {
    signInWithPassword: vi.fn(options.signIn ?? (async () => ({ error: null }))),
    signOut: vi.fn(options.signOut ?? (async () => ({ error: null }))),
    onAuthStateChange: vi.fn(
      (callback: (event: string, session: unknown) => void) => {
        authCallback = callback

        return { data: { subscription: { unsubscribe } } }
      },
    ),
  }

  const from = vi.fn((table: string) => ({
    select: vi.fn(() =>
      table === 'profiles'
        ? queryResult(options.profileResult ?? { data: null, error: null })
        : queryResult(options.membershipsResult ?? { data: [], error: null }),
    ),
  }))

  return {
    client: { auth, from } as unknown as SupabaseBrowserClient,
    auth,
    from,
    unsubscribe,
    notify: (event: string, session: unknown) => authCallback(event, session),
  }
}

const credentials = { email: 'ana@example.test', password: 'Correct-Horse-1!' }

describe('createSupabaseAuthGateway', () => {
  describe('signInWithPassword', () => {
    it('forwards the credentials to Supabase Auth unchanged and reports success', async () => {
      const { client, auth } = createFakeClient()

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('success')
      expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials)
    })

    it.each([
      ['invalid_credentials', 400],
      ['email_not_confirmed', 400],
      ['user_banned', 403],
    ])('maps the %s auth error to the generic invalid outcome', async (code, status) => {
      const { client } = createFakeClient({
        signIn: async () => ({
          error: new AuthApiError('raw provider message', status, code),
        }),
      })

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('invalid_credentials')
    })

    it('maps network failures to unavailable', async () => {
      const { client } = createFakeClient({
        signIn: async () => ({
          error: new AuthRetryableFetchError('Failed to fetch', 0),
        }),
      })

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('unavailable')
    })

    it('maps server errors to unavailable', async () => {
      const { client } = createFakeClient({
        signIn: async () => ({
          error: new AuthApiError('boom', 500, 'unexpected_failure'),
        }),
      })

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('unavailable')
    })

    it('maps HTTP 429 rate limiting to unavailable', async () => {
      const { client } = createFakeClient({
        signIn: async () => ({
          error: new AuthApiError(
            'raw rate limit message',
            429,
            'over_request_rate_limit',
          ),
        }),
      })

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('unavailable')
    })

    it('maps a disabled email provider to unavailable', async () => {
      const { client } = createFakeClient({
        signIn: async () => ({
          error: new AuthApiError(
            'Email logins are disabled',
            422,
            'email_provider_disabled',
          ),
        }),
      })

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('unavailable')
    })

    it('maps a thrown exception to unavailable', async () => {
      const { client } = createFakeClient({
        signIn: async () => {
          throw new Error('unexpected')
        },
      })

      await expect(
        createSupabaseAuthGateway(client).signInWithPassword(credentials),
      ).resolves.toBe('unavailable')
    })
  })

  describe('signOutLocal', () => {
    it('signs out with the local scope only', async () => {
      const { client, auth } = createFakeClient()

      await expect(createSupabaseAuthGateway(client).signOutLocal()).resolves.toBe(
        true,
      )
      expect(auth.signOut).toHaveBeenCalledTimes(1)
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('reports failure when Supabase returns an error', async () => {
      const { client } = createFakeClient({
        signOut: async () => ({ error: new Error('nope') }),
      })

      await expect(createSupabaseAuthGateway(client).signOutLocal()).resolves.toBe(
        false,
      )
    })

    it('reports failure when Supabase throws', async () => {
      const { client } = createFakeClient({
        signOut: async () => {
          throw new Error('nope')
        },
      })

      await expect(createSupabaseAuthGateway(client).signOutLocal()).resolves.toBe(
        false,
      )
    })
  })

  describe('subscribeToSession', () => {
    it('maps Supabase sessions to a minimal snapshot without tokens', () => {
      const { client, notify } = createFakeClient()
      const listener = vi.fn()

      createSupabaseAuthGateway(client).subscribeToSession(listener)
      notify('INITIAL_SESSION', {
        access_token: 'secret-access-token',
        refresh_token: 'secret-refresh-token',
        user: { id: 'user-1', user_metadata: { role: 'MANAGER' } },
      })
      notify('SIGNED_OUT', null)

      expect(listener).toHaveBeenNthCalledWith(1, { userId: 'user-1' })
      expect(listener).toHaveBeenNthCalledWith(2, null)
      expect(JSON.stringify(listener.mock.calls)).not.toContain('secret-')
      expect(JSON.stringify(listener.mock.calls)).not.toContain('MANAGER')
    })

    it('returns a function that unsubscribes from Supabase', () => {
      const { client, unsubscribe } = createFakeClient()

      const stop = createSupabaseAuthGateway(client).subscribeToSession(vi.fn())
      stop()

      expect(unsubscribe).toHaveBeenCalledTimes(1)
    })
  })

  describe('authorization queries', () => {
    it('maps the caller Profile from public.profiles without filtering by a client-supplied id', async () => {
      const { client, from } = createFakeClient({
        profileResult: {
          data: {
            id: 'user-1',
            display_name: 'Ana Customer',
            role: 'CUSTOMER',
            active: true,
          },
          error: null,
        },
      })

      await expect(
        createSupabaseAuthGateway(client).fetchOwnProfile(),
      ).resolves.toEqual({
        id: 'user-1',
        displayName: 'Ana Customer',
        role: 'CUSTOMER',
        active: true,
      })
      expect(from).toHaveBeenCalledWith('profiles')
    })

    it('returns null when the caller has no visible Profile', async () => {
      const { client } = createFakeClient({
        profileResult: { data: null, error: null },
      })

      await expect(
        createSupabaseAuthGateway(client).fetchOwnProfile(),
      ).resolves.toBeNull()
    })

    it('throws when the Profile lookup fails', async () => {
      const { client } = createFakeClient({
        profileResult: { data: null, error: { message: 'boom' } },
      })

      await expect(
        createSupabaseAuthGateway(client).fetchOwnProfile(),
      ).rejects.toThrow()
    })

    it('maps memberships from public.business_memberships', async () => {
      const { client, from } = createFakeClient({
        membershipsResult: {
          data: [
            { id: 'm-1', business_id: 'b-1', active: true },
            { id: 'm-2', business_id: 'b-2', active: false },
          ],
          error: null,
        },
      })

      await expect(
        createSupabaseAuthGateway(client).fetchOwnMemberships(),
      ).resolves.toEqual([
        { id: 'm-1', businessId: 'b-1', active: true },
        { id: 'm-2', businessId: 'b-2', active: false },
      ])
      expect(from).toHaveBeenCalledWith('business_memberships')
    })

    it('throws when the membership lookup fails', async () => {
      const { client } = createFakeClient({
        membershipsResult: { data: null, error: { message: 'boom' } },
      })

      await expect(
        createSupabaseAuthGateway(client).fetchOwnMemberships(),
      ).rejects.toThrow()
    })
  })
})
