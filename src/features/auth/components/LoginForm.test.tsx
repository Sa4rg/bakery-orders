import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SignInOutcome } from '../application/authGateway'
import type { LoginCredentials } from '../domain/loginSchema'
import { LoginForm } from './LoginForm'

type OnSignIn = (credentials: LoginCredentials) => Promise<SignInOutcome>

function renderForm(onSignIn = vi.fn<OnSignIn>()) {
  render(<LoginForm onSignIn={onSignIn} />)

  return {
    onSignIn,
    email: screen.getByLabelText('Email'),
    password: screen.getByLabelText('Password'),
    submit: screen.getByRole('button', { name: 'Sign in' }),
  }
}

describe('LoginForm', () => {
  it('renders labelled email and password fields', () => {
    const { email, password } = renderForm()

    expect(email).toHaveAttribute('type', 'email')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
  })

  it('shows validation errors and does not submit an empty form', async () => {
    const user = userEvent.setup()
    const { onSignIn, submit } = renderForm()

    await user.click(submit)

    expect(await screen.findByText('Enter your email address.')).toBeVisible()
    expect(screen.getByText('Enter your password.')).toBeVisible()
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('rejects a malformed email and links the error to the field', async () => {
    const user = userEvent.setup()
    const { onSignIn, email, password, submit } = renderForm()

    await user.type(email, 'not-an-email')
    await user.type(password, 'secret')
    await user.click(submit)

    expect(await screen.findByText('Enter a valid email address.')).toBeVisible()
    expect(email).toHaveAccessibleDescription('Enter a valid email address.')
    expect(email).toBeInvalid()
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('requires a password', async () => {
    const user = userEvent.setup()
    const { onSignIn, email, submit } = renderForm()

    await user.type(email, 'ana@example.test')
    await user.click(submit)

    expect(await screen.findByText('Enter your password.')).toBeVisible()
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('submits trimmed email and the untouched password', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn<OnSignIn>(async () => 'success')
    const { email, password, submit } = renderForm(onSignIn)

    await user.type(email, '  ana@example.test ')
    await user.type(password, 'Correct-Horse-1!')
    await user.click(submit)

    await waitFor(() => expect(onSignIn).toHaveBeenCalledTimes(1))
    expect(onSignIn).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'Correct-Horse-1!',
    })
  })

  it('disables submission while signing in', async () => {
    const user = userEvent.setup()
    let finish: (outcome: SignInOutcome) => void = () => {}
    const onSignIn = vi.fn<OnSignIn>(
      () => new Promise((resolve) => (finish = resolve)),
    )
    const { email, password, submit } = renderForm(onSignIn)

    await user.type(email, 'ana@example.test')
    await user.type(password, 'secret')
    await user.click(submit)

    const busy = await screen.findByRole('button', { name: 'Signing in…' })
    expect(busy).toBeDisabled()

    finish('success')
  })

  it('shows one generic message for invalid credentials and clears the password', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn<OnSignIn>(async () => 'invalid_credentials')
    const { email, password, submit } = renderForm(onSignIn)

    await user.type(email, 'ana@example.test')
    await user.type(password, 'wrong-password')
    await user.click(submit)

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Unable to sign in with those credentials.')
    expect(password).toHaveValue('')
    expect(email).toHaveValue('ana@example.test')
    expect(screen.queryByText(/wrong-password/)).not.toBeInTheDocument()
  })

  it('shows a distinct availability message when sign-in is unavailable', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn<OnSignIn>(async () => 'unavailable')
    const { email, password, submit } = renderForm(onSignIn)

    await user.type(email, 'ana@example.test')
    await user.type(password, 'secret')
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in is temporarily unavailable. Please try again.',
    )
  })
})
