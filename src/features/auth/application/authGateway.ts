import type { LoginCredentials } from '../domain/loginSchema'
import type { AuthProfile, BusinessMembership } from '../domain/access'

/** Minimal session information the UI needs. Tokens never leave the data layer. */
export type SessionSnapshot = { userId: string } | null

export type SignInOutcome = 'success' | 'invalid_credentials' | 'unavailable'

/**
 * Boundary between the auth feature and Supabase. The data layer implements it;
 * React code and tests depend only on this contract.
 */
export interface AuthGateway {
  /** Notifies the initial restored session and every later change. */
  subscribeToSession(listener: (session: SessionSnapshot) => void): () => void
  signInWithPassword(credentials: LoginCredentials): Promise<SignInOutcome>
  /** Ends only the current browser session. Resolves false on failure. */
  signOutLocal(): Promise<boolean>
  /** Reads the caller's Profile; RLS exposes only the caller's own row. */
  fetchOwnProfile(): Promise<AuthProfile | null>
  /** Reads the caller's memberships; RLS exposes only the caller's own rows. */
  fetchOwnMemberships(): Promise<BusinessMembership[]>
}
