import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildMembership,
  buildProfile,
  createFakeAuthGateway,
  customerUserId,
} from '../features/auth/testing/fakeAuthGateway'
import App from './App'

describe('App', () => {
  it('renders the application heading', () => {
    render(
      <App
        bootstrap={{ status: 'ready', authGateway: createFakeAuthGateway() }}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Bakery Orders' }),
    ).toBeInTheDocument()
  })

  it('renders a safe configuration error when browser configuration is missing', () => {
    render(
      <App
        bootstrap={{
          status: 'misconfigured',
          variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Bakery Orders' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The application is not configured.',
    )
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeVisible()
    expect(screen.getByText('VITE_SUPABASE_PUBLISHABLE_KEY')).toBeVisible()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('shows the login form when signed out', async () => {
    const gateway = createFakeAuthGateway()
    render(<App bootstrap={{ status: 'ready', authGateway: gateway }} />)

    act(() => gateway.emit(null))

    expect(await screen.findByLabelText('Email')).toBeVisible()
  })

  it('communicates that the foundation is ready inside the protected shell', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ displayName: 'Mia Manager', role: 'MANAGER' }),
    })
    render(<App bootstrap={{ status: 'ready', authGateway: gateway }} />)

    act(() => gateway.emit({ userId: customerUserId }))

    expect(await screen.findByText('Application foundation ready.')).toBeVisible()
    expect(screen.getByText('Mia Manager')).toBeVisible()
    expect(screen.getByText('MANAGER')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  it('does not expose session tokens or secrets in the protected shell', async () => {
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'CUSTOMER' }),
      memberships: [buildMembership()],
    })
    const { container } = render(
      <App bootstrap={{ status: 'ready', authGateway: gateway }} />,
    )

    act(() => gateway.emit({ userId: customerUserId }))
    await screen.findByText('Application foundation ready.')

    expect(container.textContent).not.toMatch(/token|secret|sb_/i)
  })

  it('signs out locally from the protected shell and returns to the login form', async () => {
    const user = userEvent.setup()
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'KITCHEN' }),
    })
    render(<App bootstrap={{ status: 'ready', authGateway: gateway }} />)

    act(() => gateway.emit({ userId: customerUserId }))
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(gateway.signOutLocal).toHaveBeenCalledTimes(1)
    expect(await screen.findByLabelText('Email')).toBeVisible()
  })

  it('reports a failed sign-out without leaving the protected shell', async () => {
    const user = userEvent.setup()
    const gateway = createFakeAuthGateway({
      profile: buildProfile({ role: 'KITCHEN' }),
      signOutSucceeds: false,
    })
    render(<App bootstrap={{ status: 'ready', authGateway: gateway }} />)

    act(() => gateway.emit({ userId: customerUserId }))
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to sign out. Please try again.',
    )
    expect(screen.getByText('Application foundation ready.')).toBeVisible()
  })
})
