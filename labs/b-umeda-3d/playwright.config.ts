import { defineConfig } from '@playwright/test'
import { installedBrowser } from './scripts/browser.mjs'
const port = Number(process.env.SENKIRO_E2E_PORT ?? 5193)
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:' + port,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: installedBrowser(),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command:
      'npm run preview -- --host 127.0.0.1 --port ' + port + ' --strictPort',
    url: 'http://127.0.0.1:' + port,
    reuseExistingServer: false,
  },
})
