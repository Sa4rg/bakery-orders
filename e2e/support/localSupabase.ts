import { spawnSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/supabase/database.types.ts'

/**
 * Node-only discovery of the LOCAL Supabase stack for E2E tests.
 *
 * Values come exclusively from `supabase status -o env`. They are never read
 * from VITE_* variables (a developer's .env.local may point at a hosted
 * project) and are never printed or written to disk.
 *
 * The privileged credential exists only in LocalSupabaseRuntime, which is
 * produced for global setup alone. Everything else receives public values.
 */

export interface LocalSupabasePublicConfig {
  url: string
  publishableKey: string
}

export interface LocalSupabaseRuntime extends LocalSupabasePublicConfig {
  adminKey: string
}

export type LocalAdminClient = SupabaseClient<Database>

// Public values cached by the Playwright main process so workers do not each
// spawn the Supabase CLI. The privileged key is never cached here.
const PUBLIC_URL_ENV = 'E2E_SUPABASE_URL'
const PUBLIC_KEY_ENV = 'E2E_SUPABASE_PUBLISHABLE_KEY'

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function assertLocalSupabaseUrl(rawUrl: string): void {
  let hostname: string
  let protocol: string

  try {
    ;({ hostname, protocol } = new URL(rawUrl))
  } catch {
    throw new Error('Refusing to continue: the Supabase URL is not a valid URL.')
  }

  if (protocol !== 'http:' || !LOOPBACK_HOSTNAMES.has(hostname)) {
    throw new Error(
      'Refusing to continue: E2E fixtures may only target a local Supabase stack (http on a loopback address).',
    )
  }
}

function readStatusEnvironment(): Record<string, string> {
  const result = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    // pnpm is a .cmd shim on Windows. Arguments are constant, never user input.
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (result.error || result.status !== 0) {
    throw new Error(
      'Local Supabase is not running. Start it with "pnpm supabase:start" before running E2E tests.',
    )
  }

  const values: Record<string, string> = {}

  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?\s*$/.exec(line.trim())

    if (match?.[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = match[2]
    }
  }

  return values
}

function requireValue(value: string | undefined, label: string): string {
  if (value === undefined || value === '') {
    throw new Error(
      `Local Supabase status did not provide ${label}. Is the stack fully started?`,
    )
  }

  return value
}

function resolvePublicConfigFromStatus(
  status: Record<string, string>,
): LocalSupabasePublicConfig {
  const url = requireValue(status.API_URL, 'the API URL')

  assertLocalSupabaseUrl(url)

  return {
    url,
    publishableKey: requireValue(
      status.PUBLISHABLE_KEY ?? status.ANON_KEY,
      'a publishable key',
    ),
  }
}

/**
 * Resolves the runtime including the privileged credential. Fails before
 * returning anything when the URL is not a local loopback target.
 */
export function resolveLocalSupabaseRuntime(): LocalSupabaseRuntime {
  const status = readStatusEnvironment()
  const publicConfig = resolvePublicConfigFromStatus(status)

  return {
    ...publicConfig,
    adminKey: requireValue(
      status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
      'an admin key',
    ),
  }
}

/**
 * Public local configuration for the dev server and for public-client tests.
 * Never exposes the privileged credential.
 */
export function getLocalSupabasePublicConfig(): LocalSupabasePublicConfig {
  const cachedUrl = process.env[PUBLIC_URL_ENV]
  const cachedKey = process.env[PUBLIC_KEY_ENV]

  if (cachedUrl && cachedKey) {
    assertLocalSupabaseUrl(cachedUrl)

    return { url: cachedUrl, publishableKey: cachedKey }
  }

  const { url, publishableKey } = resolvePublicConfigFromStatus(
    readStatusEnvironment(),
  )

  process.env[PUBLIC_URL_ENV] = url
  process.env[PUBLIC_KEY_ENV] = publishableKey

  return { url, publishableKey }
}

/** Privileged client. Node-only; never import this from browser code. */
export function createLocalAdminClient(
  runtime: LocalSupabaseRuntime,
): LocalAdminClient {
  assertLocalSupabaseUrl(runtime.url)

  return createClient<Database>(runtime.url, runtime.adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
