import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { SignInOutcome } from '../application/authGateway'
import { loginSchema, type LoginCredentials } from '../domain/loginSchema'

interface LoginFormProps {
  onSignIn(credentials: LoginCredentials): Promise<SignInOutcome>
}

const failureMessages = {
  invalid_credentials: 'Unable to sign in with those credentials.',
  unavailable: 'Sign-in is temporarily unavailable. Please try again.',
} as const

type SignInFailure = keyof typeof failureMessages

export function LoginForm({ onSignIn }: LoginFormProps) {
  const [failure, setFailure] = useState<SignInFailure | null>(null)

  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const submit = handleSubmit(async (credentials) => {
    setFailure(null)

    const outcome = await onSignIn(credentials)

    if (outcome !== 'success') {
      setFailure(outcome)
      resetField('password')
    }
  })

  return (
    <section aria-labelledby="login-heading">
      <h2 id="login-heading">Sign in</h2>

      <form onSubmit={submit} noValidate>
        <div>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            {...register('email')}
          />
          {errors.email && <p id="login-email-error">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <p id="login-password-error">{errors.password.message}</p>
          )}
        </div>

        {failure && <p role="alert">{failureMessages[failure]}</p>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}
