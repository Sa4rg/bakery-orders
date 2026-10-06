import { describe, expect, it } from 'vitest'
import { readSupabaseConfig } from './config'

const validUrl = 'http://127.0.0.1:54321'
const validKey = 'sb_publishable_test_value'

describe('readSupabaseConfig', () => {
  it('accepts a URL and a publishable key', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: validUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: validKey,
      }),
    ).toEqual({ status: 'valid', url: validUrl, publishableKey: validKey })
  })

  it('reports both variables when the environment is empty', () => {
    expect(readSupabaseConfig({})).toEqual({
      status: 'invalid',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })

  it('reports blank values as missing', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: '   ',
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
      }),
    ).toEqual({
      status: 'invalid',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })

  it('rejects a URL that is not http(s)', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'not a url',
        VITE_SUPABASE_PUBLISHABLE_KEY: validKey,
      }),
    ).toEqual({ status: 'invalid', variables: ['VITE_SUPABASE_URL'] })

    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'ftp://example.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: validKey,
      }),
    ).toEqual({ status: 'invalid', variables: ['VITE_SUPABASE_URL'] })
  })

  it('rejects a secret key supplied as the browser key', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: validUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_should_never_reach_the_browser',
    })

    expect(result).toEqual({
      status: 'invalid',
      variables: ['VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })

  it('never echoes configuration values in an invalid result', () => {
    const secret = 'sb_secret_should_never_reach_the_browser'
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'not a url',
      VITE_SUPABASE_PUBLISHABLE_KEY: secret,
    })

    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain('not a url')
  })

  it('ignores non-string values', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 42,
        VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
      }),
    ).toEqual({
      status: 'invalid',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })
})
