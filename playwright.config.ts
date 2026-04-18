import { defineConfig, devices } from '@playwright/test'

/**
 * ArchiVox Playwright configuration.
 *
 * The webServer block auto-starts the Next.js dev server on port 3001 so that
 * `npm run test:e2e` works without a separate terminal. Port 3001 is used to
 * avoid collision with other local dev servers on 3000.
 *
 * Run:
 *   npx playwright test                  # all tests, chromium
 *   npx playwright test e2e/motion-test  # motion-test suite only
 *   npx playwright test --headed         # visible browser
 *
 * Override base URL (e.g. preview deployment):
 *   BASE_URL=https://my-preview.vercel.app npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev --workspace @archivox/web -- -p 3002',
        url: 'http://localhost:3002',
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
