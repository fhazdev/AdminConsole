import { defineConfig, devices } from '@playwright/test';

/**
 * Two modes:
 *  - Local / CI PR runs: no E2E_BASE_URL, so Playwright starts the API and web
 *    dev servers itself against the docker-compose Postgres.
 *  - Post-deploy smoke: E2E_BASE_URL points at the deployed environment and
 *    nothing is started locally.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const isDeployedTarget = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // The suite mutates shared tenant state, so a retry must not race a sibling.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: isDeployedTarget
    ? undefined
    : [
        {
          command: 'npm run dev --workspace @admin-console/api',
          url: 'http://localhost:8080/readyz',
          reuseExistingServer: !process.env.CI,
          cwd: '../..',
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'npm run dev --workspace @admin-console/web',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          cwd: '../..',
          timeout: 60_000,
        },
      ],
});
