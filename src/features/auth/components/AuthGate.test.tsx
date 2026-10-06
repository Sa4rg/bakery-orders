import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../application/AuthProvider'
import {
  buildMembership,
  buildProfile,
  createFakeAuthGateway,
  customerUserId,
  type FakeAuthGateway,
  type FakeAuthGatewayOptions,
} from '../testing/fakeAuthGateway'
import { AuthGate } from './AuthGate'

// These tests prove frontend behavior only. Backend authorization is proven by
// the pgTAP RLS suite; mocked gateways never count as RLS evidence.

function renderGate(options: FakeAuthGatewayOptions = {}, strict = false) {
  const gateway = createFakeAuthGateway(options)

  const tree = (
    <AuthProvider gateway={gateway}>
      <AuthGate>
        {({ profile, memberships, signOut }) => (
          <section>
            <p>
              Protected content for {profile.displayName} ({profile.role})
            </p>
            <p>Active memberships: {memberships.length}</p>
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </section>
        )}
      </AuthGate>
    </AuthProvider>
  )

  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree)

  return { gateway, ...view }
}

function signInUser(gateway: FakeAuthGateway, userId = customerUserId) {
  act(() => gateway.emit({ userId }))
}

const protectedContent = /Protected content for/

describe('AuthGate', () => {
  describe('session restoration', () => {
    it('shows a loading state before the session is known and never flashes protected content', () => {
      renderGate()

      expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
      expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('shows the login form when no session is restored', async () => {
      const { gateway } = renderGate()

      act(() => gateway.emit(null))

      expect(await screen.findByLabelText('Email')).toBeVisible()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('restores an existing session into the protected content', async () => {
      const { gateway } = renderGate({
        profile: buildProfile(),
        memberships: [buildMembership()],
      })

      signInUser(gateway)

      expect(
        await screen.findByText(/Protected content for Ana Customer \(CUSTOMER\)/),
      ).toBeVisible()
    })

    it('keeps showing loading, not protected content, while access is being resolved', async () => {
      const { gateway } = renderGate({
        fetchProfile: () => new Promise(() => {}),
      })

      signInUser(gateway)

      await waitFor(() => expect(gateway.fetchOwnProfile).toHaveBeenCalled())
      expect(screen.getByRole('status')).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
      expect(screen.queryByText(/Access denied/)).not.toBeInTheDocument()
    })

    it('returns to the login form when the session ends', async () => {
      const { gateway } = renderGate({
        profile: buildProfile({ role: 'MANAGER' }),
      })

      signInUser(gateway)
      expect(await screen.findByText(protectedContent)).toBeVisible()

      act(() => gateway.emit(null))

      expect(await screen.findByLabelText('Email')).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })
  })

  describe('application authorization', () => {
    it('denies an authenticated identity without a Profile', async () => {
      const { gateway } = renderGate({ profile: null })

      signInUser(gateway)

      expect(
        await screen.findByRole('heading', { name: 'Access denied' }),
      ).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('denies an inactive Profile', async () => {
      const { gateway } = renderGate({
        profile: buildProfile({ role: 'MANAGER', active: false }),
      })

      signInUser(gateway)

      expect(
        await screen.findByRole('heading', { name: 'Access denied' }),
      ).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('denies an active CUSTOMER without any membership', async () => {
      const { gateway } = renderGate({
        profile: buildProfile(),
        memberships: [],
      })

      signInUser(gateway)

      expect(
        await screen.findByRole('heading', { name: 'Access denied' }),
      ).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('denies an active CUSTOMER whose only membership is inactive', async () => {
      const { gateway } = renderGate({
        profile: buildProfile(),
        memberships: [buildMembership({ active: false })],
      })

      signInUser(gateway)

      expect(
        await screen.findByRole('heading', { name: 'Access denied' }),
      ).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('admits an active CUSTOMER with an active membership', async () => {
      const { gateway } = renderGate({
        profile: buildProfile(),
        memberships: [
          buildMembership(),
          buildMembership({ id: 'm-2', businessId: 'b-2' }),
          buildMembership({ id: 'm-3', businessId: 'b-3', active: false }),
        ],
      })

      signInUser(gateway)

      expect(await screen.findByText(protectedContent)).toBeVisible()
      expect(screen.getByText('Active memberships: 2')).toBeVisible()
    })

    it.each(['KITCHEN', 'MANAGER'] as const)(
      'admits an active %s without a membership',
      async (role) => {
        const { gateway } = renderGate({ profile: buildProfile({ role }) })

        signInUser(gateway)

        expect(
          await screen.findByText(new RegExp(`\\(${role}\\)`)),
        ).toBeVisible()
        expect(screen.getByText('Active memberships: 0')).toBeVisible()
        expect(gateway.fetchOwnMemberships).not.toHaveBeenCalled()
      },
    )

    it('fails closed with a generic error when access cannot be verified', async () => {
      const { gateway } = renderGate({
        fetchProfile: async () => {
          throw new Error('relation "public.profiles" exploded')
        },
      })

      signInUser(gateway)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not verify your access. Please try again later.',
      )
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
      expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
    })

    it('lets a denied user sign out locally', async () => {
      const user = userEvent.setup()
      const { gateway } = renderGate({ profile: null })

      signInUser(gateway)
      await screen.findByRole('heading', { name: 'Access denied' })

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(gateway.signOutLocal).toHaveBeenCalledTimes(1)
      expect(await screen.findByLabelText('Email')).toBeVisible()
    })
  })

  describe('sign in', () => {
    it('submits credentials through the auth boundary and enters the protected content', async () => {
      const user = userEvent.setup()
      const { gateway } = renderGate({
        profile: buildProfile({ role: 'KITCHEN' }),
      })
      act(() => gateway.emit(null))

      await user.type(await screen.findByLabelText('Email'), 'kitchen@example.test')
      await user.type(screen.getByLabelText('Password'), 'Correct-Horse-1!')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() =>
        expect(gateway.signInWithPassword).toHaveBeenCalledWith({
          email: 'kitchen@example.test',
          password: 'Correct-Horse-1!',
        }),
      )
      expect(await screen.findByText(/\(KITCHEN\)/)).toBeVisible()
    })

    it('maps invalid credentials to a generic message', async () => {
      const user = userEvent.setup()
      const { gateway } = renderGate({ signInOutcome: 'invalid_credentials' })
      act(() => gateway.emit(null))

      await user.type(await screen.findByLabelText('Email'), 'nobody@example.test')
      await user.type(screen.getByLabelText('Password'), 'wrong-password')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to sign in with those credentials.',
      )
      expect(screen.getByLabelText('Email')).toBeVisible()
    })
  })

  describe('sign out', () => {
    it('uses the local sign-out intent and returns to the login form', async () => {
      const user = userEvent.setup()
      const { gateway } = renderGate({
        profile: buildProfile({ role: 'MANAGER' }),
      })
      signInUser(gateway)

      await user.click(await screen.findByRole('button', { name: 'Sign out' }))

      expect(gateway.signOutLocal).toHaveBeenCalledTimes(1)
      expect(await screen.findByLabelText('Email')).toBeVisible()
      expect(screen.queryByText(protectedContent)).not.toBeInTheDocument()
    })

    it('stays in the protected content and reports failure when sign-out fails', async () => {
      const user = userEvent.setup()
      const { gateway } = renderGate({
        profile: buildProfile({ role: 'MANAGER' }),
        signOutSucceeds: false,
      })
      signInUser(gateway)

      await user.click(await screen.findByRole('button', { name: 'Sign out' }))

      expect(gateway.signOutLocal).toHaveBeenCalledTimes(1)
      expect(screen.getByText(protectedContent)).toBeVisible()
    })
  })

  describe('auth subscription', () => {
    it('subscribes once and unsubscribes on unmount', () => {
      const { gateway, unmount } = renderGate()

      expect(gateway.subscribeToSession).toHaveBeenCalledTimes(1)
      expect(gateway.subscriptionCount()).toBe(1)

      unmount()

      expect(gateway.subscriptionCount()).toBe(0)
    })

    it('leaves exactly one active subscription under StrictMode', () => {
      const { gateway, unmount } = renderGate({}, true)

      expect(gateway.subscriptionCount()).toBe(1)

      unmount()

      expect(gateway.subscriptionCount()).toBe(0)
    })

    it('ignores session notifications after unmount', async () => {
      const { gateway, unmount } = renderGate({ profile: buildProfile() })

      unmount()
      act(() => gateway.emit({ userId: customerUserId }))

      expect(gateway.fetchOwnProfile).not.toHaveBeenCalled()
    })
  })
})
