import { defineConfig, devices } from '@playwright/test'

const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: remoteBaseURL ?? 'http://127.0.0.1:4173/',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  ...(remoteBaseURL ? {} : {
    webServer: {
      command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  }),
})
