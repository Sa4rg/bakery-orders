import { vi, type Mock } from 'vitest'
import type {
  AuthGateway,
  SessionSnapshot,
  SignInOutcome,
} from '../application/authGateway'
import type { AuthProfile, BusinessMembership } from '../domain/access'

export const customerUserId = '30000000-0000-4000-8000-000000000001'

export function buildProfile(overrides: Partial<AuthProfile> = {}): AuthProfile {
  return {
    id: customerUserId,
    displayName: 'Ana Customer',
    role: 'CUSTOMER',
    active: true,
    ...overrides,
  }
}

export function buildMembership(
  overrides: Partial<BusinessMembership> = {},
): BusinessMembership {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    businessId: '20000000-0000-4000-8000-000000000001',
    active: true,
    ...overrides,
  }
}

export interface FakeAuthGatewayOptions {
  profile?: AuthProfile | null
  memberships?: BusinessMembership[]
  signInOutcome?: SignInOutcome
  signOutSucceeds?: boolean
  fetchProfile?: () => Promise<AuthProfile | null>
}

export interface FakeAuthGateway extends AuthGateway {
  /** Simulates a Supabase auth-state notification (initial session included). */
  emit(session: SessionSnapshot): void
  subscriptionCount(): number
  subscribeToSession: Mock<AuthGateway['subscribeToSession']>
  signInWithPassword: Mock<AuthGateway['signInWithPassword']>
  signOutLocal: Mock<AuthGateway['signOutLocal']>
  fetchOwnProfile: Mock<AuthGateway['fetchOwnProfile']>
  fetchOwnMemberships: Mock<AuthGateway['fetchOwnMemberships']>
}

export function createFakeAuthGateway(
  options: FakeAuthGatewayOptions = {},
): FakeAuthGateway {
  const listeners = new Set<(session: SessionSnapshot) => void>()
  const profile = 'profile' in options ? options.profile : buildProfile()

  function emit(session: SessionSnapshot) {
    for (const listener of [...listeners]) {
      listener(session)
    }
  }

  const subscribeToSession = vi.fn<AuthGateway['subscribeToSession']>(
    (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  )

  const signInWithPassword = vi.fn<AuthGateway['signInWithPassword']>(
    async () => {
      const outcome = options.signInOutcome ?? 'success'

      if (outcome === 'success') {
        emit({ userId: customerUserId })
      }

      return outcome
    },
  )

  const signOutLocal = vi.fn<AuthGateway['signOutLocal']>(async () => {
    const succeeds = options.signOutSucceeds ?? true

    if (succeeds) {
      emit(null)
    }

    return succeeds
  })

  const fetchOwnProfile = vi.fn<AuthGateway['fetchOwnProfile']>(
    options.fetchProfile ?? (async () => profile ?? null),
  )

  const fetchOwnMemberships = vi.fn<AuthGateway['fetchOwnMemberships']>(
    async () => options.memberships ?? [],
  )

  return {
    emit,
    subscriptionCount: () => listeners.size,
    subscribeToSession,
    signInWithPassword,
    signOutLocal,
    fetchOwnProfile,
    fetchOwnMemberships,
  }
}
