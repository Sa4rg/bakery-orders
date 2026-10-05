import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/shared/testing/setup.ts'],
    // Playwright specs under e2e/ are executed by Playwright, not Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
