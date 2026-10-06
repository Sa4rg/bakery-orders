import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AccessDecision } from '../domain/access'
import type { LoginCredentials } from '../domain/loginSchema'
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext'
import type { AuthGateway, SignInOutcome } from './authGateway'
import { resolveAccess } from './resolveAccess'

type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string }

interface Resolution {
  userId: string
  outcome: AccessDecision | { status: 'error' }
}

interface AuthProviderProps {
  gateway: AuthGateway
  children: ReactNode
}

function deriveState(
  session: SessionState,
  resolution: Resolution | null,
): AuthState {
  if (session.status === 'loading') {
    return { status: 'loading' }
  }

  if (session.status === 'signed_out') {
    return { status: 'signed_out' }
  }

  // A resolution for a different user is stale: never show it.
  if (resolution === null || resolution.userId !== session.userId) {
    return { status: 'loading' }
  }

  const { outcome } = resolution

  if (outcome.status === 'error') {
    return { status: 'access_error' }
  }

  if (outcome.status === 'denied') {
    return { status: 'denied', reason: outcome.reason }
  }

  return {
    status: 'authorized',
    profile: outcome.profile,
    memberships: outcome.memberships,
  }
}

/**
 * Owns the single auth-session subscription and resolves application access
 * from the database. A local session is never authorization evidence on its own.
 */
export function AuthProvider({ gateway, children }: AuthProviderProps) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' })
  const [resolution, setResolution] = useState<Resolution | null>(null)

  useEffect(() => {
    return gateway.subscribeToSession((snapshot) => {
      if (snapshot === null) {
        setResolution(null)
        setSession({ status: 'signed_out' })

        return
      }

      // Token refreshes re-notify the same user: keep identity stable so the
      // access resolution is not repeated or flashed.
      setSession((current) =>
        current.status === 'signed_in' && current.userId === snapshot.userId
          ? current
          : { status: 'signed_in', userId: snapshot.userId },
      )
    })
  }, [gateway])

  const userId = session.status === 'signed_in' ? session.userId : null

  useEffect(() => {
    if (userId === null) {
      return
    }

    let cancelled = false

    resolveAccess(gateway)
      .then(
        (outcome): Resolution => ({ userId, outcome }),
        (): Resolution => ({ userId, outcome: { status: 'error' } }),
      )
      .then((next) => {
        if (!cancelled) {
          setResolution(next)
        }
      })

    return () => {
      cancelled = true
    }
  }, [gateway, userId])

  const signIn = useCallback(
    async (credentials: LoginCredentials): Promise<SignInOutcome> => {
      try {
        return await gateway.signInWithPassword(credentials)
      } catch {
        return 'unavailable'
      }
    },
    [gateway],
  )

  const signOut = useCallback(async () => {
    try {
      const succeeded = await gateway.signOutLocal()

      if (succeeded) {
        setResolution(null)
        setSession({ status: 'signed_out' })
      }

      return succeeded
    } catch {
      return false
    }
  }, [gateway])

  const value = useMemo<AuthContextValue>(
    () => ({ state: deriveState(session, resolution), signIn, signOut }),
    [session, resolution, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
