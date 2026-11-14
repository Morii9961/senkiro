// Developer helper: capture screenshots of the running prototype for visual review.
// Output goes to test-results/shots/ (git-ignored) — screenshots are never committed.
//
//   node scripts/shots.mjs <name> [query] [WxH] [steps]
//   steps: comma-separated  click:<testid> | select:<testid>=<value> | wait:<ms> | key:<Key>
//          | drag:<dx>x<dy> | wheel:<deltaY> | wheelat:<fx>x<fy>:<deltaY> | set:<testid>=<value> | hover:<testid>
//
// Needs a server: BASE_URL (default http://localhost:5183).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const [name = 'shot', query = '', size = '1440x900', steps = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const base = process.env.BASE_URL ?? 'http://localhost:5183';
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'shots');
mkdirSync(outDir, { recursive: true });

const mobile = w < 700;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForSelector('canvas, [data-testid="plan-2d"]');
await page.waitForTimeout(900);

for (const step of steps.split(',').filter(Boolean)) {
  const [op, arg = ''] = [step.slice(0, step.indexOf(':')), step.slice(step.indexOf(':') + 1)];
  if (op === 'click') await page.getByTestId(arg).first().click();
  else if (op === 'hover') await page.getByTestId(arg).first().hover();
  else if (op === 'select') {
    const [id, value] = arg.split('=');
    await page.getByTestId(id).selectOption(value);
  } else if (op === 'set') {
    const [id, value] = arg.split('=');
    await page.getByTestId(id).fill(value);
  } else if (op === 'wait') await page.waitForTimeout(Number(arg));
  else if (op === 'key') await page.keyboard.press(arg);
  else if (op === 'drag') {
    const [dx, dy] = arg.split('x').map(Number);
    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    await page.mouse.up();
  } else if (op === 'wheel') {
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, Number(arg));
  } else if (op === 'wheelat') {
    // wheelat:<fx>x<fy>:<deltaY> — wheel at a fractional position of the canvas
    const [pos, delta] = arg.split(':');
    const [fx, fy] = pos.split('x').map(Number);
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.mouse.wheel(0, Number(delta));
  } else throw new Error(`unknown step ${step}`);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(500);
const file = resolve(outDir, `${name}.png`);
await page.screenshot({ path: file });
const stats = await page.evaluate(() => window.__SENKIRO_STATS__ ?? null);
const trains = await page.evaluate(() => window.__SENKIRO_TRAINS__ ?? null);
console.log(JSON.stringify({ file, stats, trains: trains && { shown: trains.shown, instances: trains.instances, moving: trains.moving }, errors }));
await browser.close();
