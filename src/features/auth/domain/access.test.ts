import { describe, expect, it } from 'vitest'
import {
  decideAccess,
  requiresBusinessMembership,
  type AuthProfile,
  type BusinessMembership,
} from './access'

function profile(overrides: Partial<AuthProfile> = {}): AuthProfile {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    displayName: 'Test User',
    role: 'CUSTOMER',
    active: true,
    ...overrides,
  }
}

function membership(
  overrides: Partial<BusinessMembership> = {},
): BusinessMembership {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    businessId: '20000000-0000-4000-8000-000000000001',
    active: true,
    ...overrides,
  }
}

describe('requiresBusinessMembership', () => {
  it('is required only for CUSTOMER profiles', () => {
    expect(requiresBusinessMembership(profile({ role: 'CUSTOMER' }))).toBe(true)
    expect(requiresBusinessMembership(profile({ role: 'KITCHEN' }))).toBe(false)
    expect(requiresBusinessMembership(profile({ role: 'MANAGER' }))).toBe(false)
  })
})

describe('decideAccess', () => {
  it('denies an identity without a Profile', () => {
    expect(decideAccess(null, [])).toEqual({
      status: 'denied',
      reason: 'missing_profile',
    })
  })

  it('denies an inactive Profile even with an active membership', () => {
    expect(decideAccess(profile({ active: false }), [membership()])).toEqual({
      status: 'denied',
      reason: 'inactive_profile',
    })
  })

  it('denies an inactive KITCHEN Profile', () => {
    expect(
      decideAccess(profile({ role: 'KITCHEN', active: false }), []),
    ).toEqual({ status: 'denied', reason: 'inactive_profile' })
  })

  it('denies an active CUSTOMER without memberships', () => {
    expect(decideAccess(profile(), [])).toEqual({
      status: 'denied',
      reason: 'no_active_membership',
    })
  })

  it('denies an active CUSTOMER whose memberships are all inactive', () => {
    expect(decideAccess(profile(), [membership({ active: false })])).toEqual({
      status: 'denied',
      reason: 'no_active_membership',
    })
  })

  it('grants an active CUSTOMER with an active membership', () => {
    const active = membership()

    expect(decideAccess(profile(), [active])).toEqual({
      status: 'granted',
      profile: profile(),
      memberships: [{ id: active.id, businessId: active.businessId }],
    })
  })

  it('keeps every active membership and drops inactive ones', () => {
    const decision = decideAccess(profile(), [
      membership({ id: 'm-1', businessId: 'b-1' }),
      membership({ id: 'm-2', businessId: 'b-2', active: false }),
      membership({ id: 'm-3', businessId: 'b-3' }),
    ])

    expect(decision).toEqual({
      status: 'granted',
      profile: profile(),
      memberships: [
        { id: 'm-1', businessId: 'b-1' },
        { id: 'm-3', businessId: 'b-3' },
      ],
    })
  })

  it.each(['KITCHEN', 'MANAGER'] as const)(
    'grants an active %s without any membership',
    (role) => {
      expect(decideAccess(profile({ role }), [])).toEqual({
        status: 'granted',
        profile: profile({ role }),
        memberships: [],
      })
    },
  )
})
