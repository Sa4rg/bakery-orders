import type { ReactNode } from 'react'
import { useAuth } from '../application/useAuth'
import type {
  ActiveBusinessMembership,
  AuthProfile,
} from '../domain/access'
import { AccessNotice } from './AccessNotice'
import { LoginForm } from './LoginForm'

export interface AuthorizedSession {
  profile: AuthProfile
  memberships: ActiveBusinessMembership[]
  signOut(): Promise<boolean>
}

interface AuthGateProps {
  children(session: AuthorizedSession): ReactNode
}

/**
 * UX gate for the protected application. It is not an authorization boundary:
 * PostgreSQL grants and RLS decide what data a session may actually read.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { state, signIn, signOut } = useAuth()

  switch (state.status) {
    case 'loading':
      return <p role="status">Checking your session…</p>

    case 'signed_out':
      return <LoginForm onSignIn={signIn} />

    case 'access_error':
      return (
        <AccessNotice heading="Access check failed" isAlert onSignOut={signOut}>
          We could not verify your access. Please try again later.
        </AccessNotice>
      )

    case 'denied':
      return (
        <AccessNotice heading="Access denied" onSignOut={signOut}>
          Your account is not set up to use Bakery Orders. Contact the bakery to
          complete your access.
        </AccessNotice>
      )

    case 'authorized':
      return children({
        profile: state.profile,
        memberships: state.memberships,
        signOut,
      })
  }
}
