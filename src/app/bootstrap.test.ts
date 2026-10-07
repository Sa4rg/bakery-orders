import { describe, expect, it } from 'vitest'
import { createAppBootstrap } from './bootstrap'

describe('createAppBootstrap', () => {
  it('reports a configuration error instead of crashing when the environment is empty', () => {
    expect(createAppBootstrap({})).toEqual({
      status: 'misconfigured',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })

  it('rejects a secret key supplied through the browser environment', () => {
    const bootstrap = createAppBootstrap({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_should_never_reach_the_browser',
    })

    expect(bootstrap).toEqual({
      status: 'misconfigured',
      variables: ['VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })

  it('creates feature gateways from the valid browser configuration', () => {
    const bootstrap = createAppBootstrap({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value',
    })

    expect(bootstrap.status).toBe('ready')
    if (bootstrap.status === 'ready') {
      expect(typeof bootstrap.authGateway.signInWithPassword).toBe('function')
      expect(typeof bootstrap.authGateway.signOutLocal).toBe('function')
      expect(typeof bootstrap.catalogGateway.loadCatalog).toBe('function')
      expect(typeof bootstrap.managerCatalogGateway.loadManagerCatalog).toBe(
        'function',
      )
    }
  })
})
