/**
 * Exit Gate 0 browser acceptance (P0-W2). Runs the production build under `vite preview`
 * (COOP/COEP from vite.config.ts) on a dedicated port, in an installed Chromium.
 *
 * Browser lookup: `SENKIRO_CHROMIUM`, then Playwright's own Chromium, then a system Chrome or
 * Edge. Nothing is downloaded by this config.
 */
import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const port = Number(process.env.SENKIRO_E2E_PORT ?? 27410);

function installedChromium(): string | undefined {
  const candidates = [
    process.env.SENKIRO_CHROMIUM,
    chromium.executablePath(),
    `${process.env.ProgramFiles}/Google/Chrome/Application/chrome.exe`,
    `${process.env['ProgramFiles(x86)']}/Microsoft/Edge/Application/msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  return candidates.find((path) => path !== undefined && existsSync(path));
}

const executablePath = installedChromium();
if (executablePath === undefined) {
  throw new Error(
    'No Chromium found. Set SENKIRO_CHROMIUM or run `pnpm exec playwright install chromium`.',
  );
}

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath,
      // Use the GPU when there is one; otherwise let Chromium fall back to SwiftShader so
      // WebGL still exists. The spec records which renderer was actually used.
      args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
