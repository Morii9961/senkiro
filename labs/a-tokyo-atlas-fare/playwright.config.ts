import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18473',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 18473 --strictPort',
    url: 'http://127.0.0.1:18473',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
