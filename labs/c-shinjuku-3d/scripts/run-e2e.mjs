// Runs the Playwright suite. Before starting it makes sure that
//   1. a production build exists (the tests run against `vite preview`), and
//   2. a Chromium-family browser can be launched: Playwright's own build if it
//      is installed, otherwise an installed Edge / Chrome, otherwise it tries
//      `playwright install chromium` once.
// Extra arguments are passed straight to `playwright test`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...env } }).status ?? 1;

if (!existsSync(resolve(root, 'dist', 'index.html'))) {
  console.log('[e2e] no build found — running `npm run build` first');
  const code = run('npm', ['run', 'build']);
  if (code !== 0) process.exit(code);
}

async function canLaunch(options) {
  try {
    const browser = await chromium.launch(options);
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

const env = {};
if (process.env.SENKIRO_PW_CHANNEL) {
  console.log(`[e2e] using browser channel "${process.env.SENKIRO_PW_CHANNEL}" (SENKIRO_PW_CHANNEL)`);
} else if (!(await canLaunch({}))) {
  let channel = null;
  for (const candidate of ['msedge', 'chrome']) {
    if (await canLaunch({ channel: candidate })) {
      channel = candidate;
      break;
    }
  }
  if (channel) {
    console.log(`[e2e] Playwright's Chromium is not installed — using the installed "${channel}" instead`);
    env.SENKIRO_PW_CHANNEL = channel;
  } else {
    console.log('[e2e] no browser found — running `npx playwright install chromium`');
    const code = run('npx', ['playwright', 'install', 'chromium']);
    if (code !== 0) {
      console.error('[e2e] could not install a browser. Install one with `npx playwright install chromium`, or set SENKIRO_PW_CHANNEL=msedge|chrome.');
      process.exit(code);
    }
  }
}

process.exit(run('npx', ['playwright', 'test', ...process.argv.slice(2)], env));
