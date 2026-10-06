import {
  decideAccess,
  requiresBusinessMembership,
  type AccessDecision,
} from '../domain/access'
import type { AuthGateway } from './authGateway'

/**
 * Resolves application access for the current session.
 *
 * Rejects when a lookup fails so callers fail closed instead of guessing.
 */
export async function resolveAccess(
  gateway: Pick<AuthGateway, 'fetchOwnProfile' | 'fetchOwnMemberships'>,
): Promise<AccessDecision> {
  const profile = await gateway.fetchOwnProfile()

  if (profile === null || !profile.active) {
    return decideAccess(profile, [])
  }

  const memberships = requiresBusinessMembership(profile)
    ? await gateway.fetchOwnMemberships()
    : []

  return decideAccess(profile, memberships)
}
