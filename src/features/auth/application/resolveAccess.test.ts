import { describe, expect, it } from 'vitest'
import {
  buildMembership,
  buildProfile,
  createFakeAuthGateway,
} from '../testing/fakeAuthGateway'
import { resolveAccess } from './resolveAccess'

describe('resolveAccess', () => {
  it('denies when no Profile exists and skips the membership lookup', async () => {
    const gateway = createFakeAuthGateway({ profile: null })

    await expect(resolveAccess(gateway)).resolves.toEqual({
      status: 'denied',
      reason: 'missing_profile',
    })
    expect(gateway.fetchOwnMemberships).not.toHaveBeenCalled()
  })

  it('denies an inactive Profile and skips the membership lookup', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ active: false }),
      memberships: [buildMembership()],
    })

    await expect(resolveAccess(gateway)).resolves.toEqual({
      status: 'denied',
      reason: 'inactive_profile',
    })
    expect(gateway.fetchOwnMemberships).not.toHaveBeenCalled()
  })

  it('looks up memberships for an active CUSTOMER and grants with an active one', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile(),
      memberships: [buildMembership()],
    })

    const decision = await resolveAccess(gateway)

    expect(gateway.fetchOwnMemberships).toHaveBeenCalledTimes(1)
    expect(decision.status).toBe('granted')
  })

  it('denies an active CUSTOMER without an active membership', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile(),
      memberships: [buildMembership({ active: false })],
    })

    await expect(resolveAccess(gateway)).resolves.toEqual({
      status: 'denied',
      reason: 'no_active_membership',
    })
  })

  it.each(['KITCHEN', 'MANAGER'] as const)(
    'grants an active %s without querying memberships',
    async (role) => {
      const gateway = createFakeAuthGateway({
        profile: buildProfile({ role }),
      })

      const decision = await resolveAccess(gateway)

      expect(decision.status).toBe('granted')
      expect(gateway.fetchOwnMemberships).not.toHaveBeenCalled()
    },
  )

  it('propagates a Profile lookup failure instead of granting access', async () => {
    const gateway = createFakeAuthGateway({
      fetchProfile: async () => {
        throw new Error('network down')
      },
    })

    await expect(resolveAccess(gateway)).rejects.toThrow()
  })
})
