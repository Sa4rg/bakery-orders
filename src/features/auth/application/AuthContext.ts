import { createContext } from 'react'
import type {
  AccessDenialReason,
  ActiveBusinessMembership,
  AuthProfile,
} from '../domain/access'
import type { LoginCredentials } from '../domain/loginSchema'
import type { SignInOutcome } from './authGateway'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  /** A session exists but access could not be verified; fails closed. */
  | { status: 'access_error' }
  | { status: 'denied'; reason: AccessDenialReason }
  | {
      status: 'authorized'
      profile: AuthProfile
      memberships: ActiveBusinessMembership[]
    }

export interface AuthContextValue {
  state: AuthState
  signIn(credentials: LoginCredentials): Promise<SignInOutcome>
  /** Ends the local session only. Resolves false when sign-out failed. */
  signOut(): Promise<boolean>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
