import type { Database } from '../../../lib/supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']

/** Application Profile resolved from public.profiles (never from Auth metadata). */
export interface AuthProfile {
  id: string
  displayName: string
  role: AppRole
  active: boolean
}

export interface BusinessMembership {
  id: string
  businessId: string
  active: boolean
}

export interface ActiveBusinessMembership {
  id: string
  businessId: string
}

export type AccessDenialReason =
  | 'missing_profile'
  | 'inactive_profile'
  | 'no_active_membership'

export type AccessDecision =
  | {
      status: 'granted'
      profile: AuthProfile
      memberships: ActiveBusinessMembership[]
    }
  | { status: 'denied'; reason: AccessDenialReason }

export function requiresBusinessMembership(profile: AuthProfile): boolean {
  return profile.role === 'CUSTOMER'
}

/**
 * Pure frontend access decision. It improves UX only: PostgreSQL grants and
 * RLS remain the authorization boundary.
 */
export function decideAccess(
  profile: AuthProfile | null,
  memberships: readonly BusinessMembership[],
): AccessDecision {
  if (profile === null) {
    return { status: 'denied', reason: 'missing_profile' }
  }

  if (!profile.active) {
    return { status: 'denied', reason: 'inactive_profile' }
  }

  const activeMemberships = memberships
    .filter((membership) => membership.active)
    .map(({ id, businessId }) => ({ id, businessId }))

  if (requiresBusinessMembership(profile) && activeMemberships.length === 0) {
    return { status: 'denied', reason: 'no_active_membership' }
  }

  return { status: 'granted', profile, memberships: activeMemberships }
}
