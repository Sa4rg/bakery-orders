/**
 * Browser-side Supabase configuration contract.
 *
 * Only the project URL and the publishable key are read. Every `VITE_*` value
 * is embedded in the public bundle, so privileged keys must never be supplied
 * here. Invalid results name the offending variables but never echo values.
 */

export type SupabaseConfigVariable =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'

export type SupabaseConfigResult =
  | { status: 'valid'; url: string; publishableKey: string }
  | { status: 'invalid'; variables: SupabaseConfigVariable[] }

const SECRET_KEY_PREFIX = 'sb_secret_'

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)

    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function readSupabaseConfig(
  env: Record<string, unknown>,
): SupabaseConfigResult {
  const url = readString(env.VITE_SUPABASE_URL)
  const publishableKey = readString(env.VITE_SUPABASE_PUBLISHABLE_KEY)

  const variables: SupabaseConfigVariable[] = []

  if (url === null || !isHttpUrl(url)) {
    variables.push('VITE_SUPABASE_URL')
  }

  if (publishableKey === null || publishableKey.startsWith(SECRET_KEY_PREFIX)) {
    variables.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  }

  if (variables.length > 0 || url === null || publishableKey === null) {
    return { status: 'invalid', variables }
  }

  return { status: 'valid', url, publishableKey }
}
