import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the production build (`vite preview`).
 * `npm test` goes through scripts/run-e2e.mjs, which makes sure a build and a
 * browser exist before it starts Playwright.
 *
 * SENKIRO_PW_CHANNEL   use an installed browser instead of Playwright's Chromium (msedge | chrome)
 * SENKIRO_PW_GPU=1     let the browser use the machine's GPU; default is software WebGL (SwiftShader),
 *                      which is slower but behaves the same on every machine
 */
const channel = process.env.SENKIRO_PW_CHANNEL || undefined;
const gpu = process.env.SENKIRO_PW_GPU === '1';
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    channel,
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
    colorScheme: 'light',
    launchOptions: {
      args: gpu ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
