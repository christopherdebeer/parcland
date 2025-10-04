import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Supports both local development and Vercel preview deployments.
 *
 * Environment Variables:
 * - VERCEL_PREVIEW_URL: Vercel preview URL (e.g., https://parcland-git-branch-project.vercel.app)
 * - VERCEL_AUTOMATION_BYPASS_SECRET: Secret for bypassing Vercel deployment protection
 *
 * Usage:
 * - Local: npm run test:e2e
 * - Vercel: VERCEL_PREVIEW_URL=https://... npm run test:e2e:vercel
 *
 * See https://playwright.dev/docs/test-configuration
 */

// Determine base URL: Vercel preview or local dev server
const isVercelPreview = !!process.env.VERCEL_PREVIEW_URL;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const baseURL = isVercelPreview
  ? process.env.VERCEL_PREVIEW_URL
  : 'http://localhost:5173';

// Add deployment protection bypass parameters if testing on Vercel
const bypassParams = isVercelPreview && vercelBypassSecret
  ? `?x-vercel-protection-bypass=${vercelBypassSecret}&x-vercel-set-bypass-cookie=samesitenone`
  : '';

export default defineConfig({
  testDir: './tests/e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: 'html',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: baseURL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Store bypass params for use in tests */
    extraHTTPHeaders: isVercelPreview && vercelBypassSecret ? {
      // Note: Headers don't work reliably for Vercel protection bypass
      // Tests should append query params instead
    } : {},
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Run your local dev server before starting the tests (only for local mode) */
  webServer: isVercelPreview ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});

// Export bypass params for use in test files
export { bypassParams };
