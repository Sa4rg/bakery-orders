import { createSupabaseBrowserClient } from '../lib/supabase/client'
import {
  readSupabaseConfig,
  type SupabaseConfigVariable,
} from '../lib/supabase/config'
import type { AuthGateway } from '../features/auth/application/authGateway'
import { createSupabaseAuthGateway } from '../features/auth/data/createSupabaseAuthGateway'

export type AppBootstrap =
  | { status: 'ready'; authGateway: AuthGateway }
  | { status: 'misconfigured'; variables: SupabaseConfigVariable[] }

/**
 * Composition root: validates the browser environment and wires the Supabase
 * client into the feature boundaries. Never throws for bad configuration.
 */
export function createAppBootstrap(env: Record<string, unknown>): AppBootstrap {
  const config = readSupabaseConfig(env)

  if (config.status === 'invalid') {
    return { status: 'misconfigured', variables: config.variables }
  }

  const client = createSupabaseBrowserClient(config)

  return { status: 'ready', authGateway: createSupabaseAuthGateway(client) }
}
