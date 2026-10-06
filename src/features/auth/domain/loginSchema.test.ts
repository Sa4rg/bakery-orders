import { describe, expect, it } from 'vitest'
import { loginSchema } from './loginSchema'

function messages(input: { email: string; password: string }) {
  const result = loginSchema.safeParse(input)

  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))
}

describe('loginSchema', () => {
  it('accepts a valid email and a password', () => {
    expect(
      loginSchema.parse({ email: 'ana@example.test', password: 'x' }),
    ).toEqual({ email: 'ana@example.test', password: 'x' })
  })

  it('trims the email address', () => {
    expect(
      loginSchema.parse({ email: '  ana@example.test ', password: 'x' }).email,
    ).toBe('ana@example.test')
  })

  it('requires an email address', () => {
    expect(messages({ email: '   ', password: 'x' })).toEqual([
      { field: 'email', message: 'Enter your email address.' },
    ])
  })

  it('rejects a malformed email address', () => {
    expect(messages({ email: 'not-an-email', password: 'x' })).toEqual([
      { field: 'email', message: 'Enter a valid email address.' },
    ])
  })

  it('requires a password', () => {
    expect(messages({ email: 'ana@example.test', password: '' })).toEqual([
      { field: 'password', message: 'Enter your password.' },
    ])
  })

  it('does not alter or trim the password', () => {
    expect(
      loginSchema.parse({ email: 'ana@example.test', password: '  spaced  ' })
        .password,
    ).toBe('  spaced  ')
  })
})
