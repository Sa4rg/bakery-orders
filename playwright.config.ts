import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabasePublicConfig } from './e2e/support/localSupabase.ts'

const host = '127.0.0.1'
const port = 4173
const baseURL = `http://${host}:${port}`
const isCI = Boolean(process.env.CI)

// Public values only (URL + publishable key) from the running LOCAL stack.
// Fails with a clear message, without keys, when Supabase is not running.
const supabase = getLocalSupabasePublicConfig()

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // Traces record typed input values, which would include the runtime-generated
    // fixture password. Screenshots and video stay at Playwright's default (off).
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm exec vite --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    // Browser-visible configuration only. The privileged Supabase credential
    // is never resolved here and must never be added to this block.
    env: {
      VITE_SUPABASE_URL: supabase.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    },
  },
})
