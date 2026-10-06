import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type SupabaseBrowserClient = SupabaseClient<Database>

export interface SupabaseBrowserClientConfig {
  url: string
  publishableKey: string
}

/**
 * Creates the typed browser client.
 *
 * `detectSessionInUrl` is disabled because this application has no OAuth or
 * magic-link flow; sessions must never be parsed from the URL.
 */
export function createSupabaseBrowserClient({
  url,
  publishableKey,
}: SupabaseBrowserClientConfig): SupabaseBrowserClient {
  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
}
