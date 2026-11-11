import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

interface Stats {
  triangles: number;
  calls: number;
  lines: number;
  geometries: number;
  frames: number;
  cameraDistance: number;
  labelsShown: number;
}

const stats = (page: Page) => page.evaluate(() => (window as unknown as { __SENKIRO_STATS__?: Stats }).__SENKIRO_STATS__ ?? null);

/** Opens the app and fails the test on any console error or uncaught exception. */
async function open(page: Page, query = 'lang=ja&theme=light') {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?${query}`);
  return errors;
}

async function waitForScene(page: Page): Promise<Stats> {
  await expect(page.locator('[data-testid="scene-3d"] canvas')).toBeVisible();
  await expect.poll(async () => (await stats(page))?.calls ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
  return (await stats(page))!;
}

test.describe('loading', () => {
  test('the canvas exists, something is drawn, and the console stays clean', async ({ page }) => {
    const errors = await open(page);
    const s = await waitForScene(page);

    expect(s.triangles).toBeGreaterThan(1000);
    expect(s.calls).toBeLessThanOrEqual(8);
    await expect(page).toHaveTitle('SENKIRO Lab · Shinjuku Station 3D');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SENKIRO Lab · Shinjuku Station 3D');
    // the "this is a schematic" notice is always on screen
    await expect(page.getByTestId('honesty')).toBeVisible();
    await expect(page.getByTestId('honesty')).toContainText('模式図');
    expect(errors).toEqual([]);
  });

  test('labels thin out with distance and come back when zooming in', async ({ page }) => {
    const errors = await open(page);
    const far = await waitForScene(page);
    const canvas = page.locator('[data-testid="scene-3d"] canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -1400);
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(far.cameraDistance * 0.8);
    await expect.poll(async () => (await stats(page))!.labelsShown).toBeGreaterThan(far.labelsShown);
    expect(errors).toEqual([]);
  });
});

test.describe('demo route', () => {
  test('East Exit → Yamanote platform: steps, floors and counts — and no invented metres or minutes', async ({ page }) => {
    const errors = await open(page);
    const before = await waitForScene(page);
    await page.getByTestId('demo-1').click();

    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('cost-segments')).toHaveText('4');
    await expect(page.getByTestId('cost-levels')).toHaveText('2');
    await expect(page.getByTestId('cost-gates')).toHaveText('1');
    // floors in order: street level, down to the basement concourse, up to the platform
    await expect(page.getByTestId('route-levels').locator('.chip')).toHaveText(['1F', 'B1F', '1F']);
    await expect(page.getByTestId('route-legs')).toContainText('中央東改札');
    await expect(page.getByTestId('route-unknowns')).toContainText('不明');
    const summary = await page.getByTestId('route-result').innerText();
    expect(summary).not.toMatch(/\d+\s*(m|メートル|分|min)\b/);

    // the highlight is extra geometry in the 3D view
    await expect.poll(async () => (await stats(page))!.triangles).toBeGreaterThan(before.triangles);
    expect(errors).toEqual([]);
  });

  test('elevator-only mode reproduces a lift-only chain and can be switched back', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('demo-2').click();
    await expect(page.getByTestId('cost-levels')).toHaveText('5');
    await expect(page.getByTestId('cost-gates')).toHaveText('1');
    const legs = page.getByTestId('route-legs').locator('li.leg-vertical');
    await expect(legs).toHaveCount(4);
    for (const text of await legs.allInnerTexts()) expect(text).toContain('エレベーター');

    await page.getByText('標準', { exact: true }).click();
    await expect(page.getByTestId('cost-levels')).not.toHaveText('5');
    expect(errors).toEqual([]);
  });

  test('a route can be picked by hand and cleared', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('route-from').selectOption('sk:entrance:jr-south-exit');
    await page.getByTestId('route-to').selectOption('sk:area:keio-b2f-platforms-1-3');
    await expect(page.getByTestId('cost-gates')).toHaveText('2');
    await expect(page.getByTestId('route-levels').locator('.chip')).toHaveCount(5);
    await page.getByText('経路を消す').click();
    await expect(page.getByTestId('route-legs')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('views', () => {
  test('2D plan ⇄ 3D, and single level ⇄ all levels', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('demo-3').click();

    await page.getByTestId('view-2d').click();
    await expect(page.getByTestId('plan-2d')).toBeVisible();
    await expect(page.locator('[data-testid="scene-3d"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="plan-"][data-testid$="-jr-east"], [data-testid^="plan-"][data-testid$="-keio"]')).toHaveCount(5);
    // the unverified blocks are marked as such on the plans
    await expect(page.getByTestId('plan-B1F-jr-east')).toContainText('未確認');

    await page.getByTestId('level-B1F-jr-east').click();
    await expect(page.getByTestId('level-B1F-jr-east')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.plan-card')).toHaveCount(1);
    await expect(page.getByTestId('plan-B1F-jr-east')).toContainText('京王線連絡口');

    await page.getByTestId('level-all').click();
    await expect(page.locator('.plan-card')).toHaveCount(5);

    await page.getByTestId('view-3d').click();
    await waitForScene(page);
    await expect(page.getByTestId('plan-2d')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('"reset view" brings the camera back after rotating and zooming', async ({ page }) => {
    const errors = await open(page);
    const home = await waitForScene(page);
    const canvas = page.locator('[data-testid="scene-3d"] canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const picture = await canvas.screenshot();

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 220, cy + 40, { steps: 6 });
    await page.mouse.up();
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -1000);
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(home.cameraDistance * 0.9);
    expect(Buffer.compare(picture, await canvas.screenshot())).not.toBe(0);

    await page.getByTestId('reset-view').click();
    await expect.poll(async () => Math.abs((await stats(page))!.cameraDistance - home.cameraDistance)).toBeLessThan(0.01);
    expect(errors).toEqual([]);
  });

  test('labels do not block the camera: scrolling over one still zooms, clicking one selects its element', async ({ page }) => {
    const errors = await open(page);
    const home = await waitForScene(page);
    const label = page.locator('.label-platform').first();
    await expect(label).toBeVisible();
    const box = (await label.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(home.cameraDistance * 0.95);

    const again = (await label.boundingBox())!;
    await page.mouse.click(again.x + again.width / 2, again.y + again.height / 2);
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('inspector')).toContainText('sk:platform:');
    expect(errors).toEqual([]);
  });

  test('without WebGL the app falls back to the 2D plans and says so', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const errors = await open(page);
    await expect(page.getByTestId('no-3d')).toBeVisible();
    await expect(page.locator('.plan-card')).toHaveCount(5);
    await expect(page.getByTestId('view-3d')).toBeDisabled();
    await expect(page.locator('canvas')).toHaveCount(0);
    // routing does not depend on the 3D view
    await page.getByTestId('demo-1').click();
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('the canvas takes keyboard focus and the arrow keys turn the model', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    const app = page.getByRole('application');
    await app.focus();
    const before = (await stats(page))!.frames;
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('+');
    await expect.poll(async () => (await stats(page))!.frames).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  test('language and dark mode', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('lang').selectOption('en');
    await expect(page.getByTestId('honesty')).toContainText('schematic');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByTestId('theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await waitForScene(page);
    expect(errors).toEqual([]);
  });
});

test.describe('honesty about data', () => {
  test('operations overlay: example mode is labelled as synthetic; the real feed reports "unavailable" instead of faking it', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('tab-ops').click();
    await expect(page.getByTestId('sample-banner')).toHaveCount(0);

    await page.getByTestId('ops-example').check();
    await expect(page.getByTestId('sample-banner')).toBeVisible();
    await expect(page.getByTestId('sample-banner')).toContainText('サンプル');
    await expect(page.getByTestId('ops-sample-box')).toBeVisible();
    // source and timestamp are shown with the data
    await expect(page.locator('#tabpanel')).toContainText('src:senkiro-lab-schematic');
    await expect(page.locator('#tabpanel time')).toHaveAttribute('datetime', /2000-01-01/);
    await expect(page.locator('#tabpanel')).toContainText('synthetic');

    await page.getByTestId('ops-odpt').check();
    await expect(page.getByTestId('ops-unavailable')).toBeVisible();
    await expect(page.getByTestId('sample-banner')).toHaveCount(0);
    await expect(page.locator('#tabpanel table')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('sources, unconfirmed connections and the element inspector are reachable', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('tab-info').click();
    expect(await page.getByTestId('sources').locator('li').count()).toBeGreaterThanOrEqual(10);
    expect(await page.getByTestId('unconfirmed').locator('li').count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId('stats')).toContainText(/\d/);

    // pick an element through the route list and read its provenance
    await page.getByTestId('tab-route').click();
    await page.getByTestId('demo-1').click();
    await page.getByTestId('route-legs').locator('li').nth(2).locator('button').click();
    const inspector = page.getByTestId('inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('sk:gate:jr-central-east-gate');
    await expect(inspector).toContainText('src:jreast-floormap-b1f');
    await expect(inspector).toContainText('manual-verified');
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the layout holds on a narrow screen: scene, bottom sheet, help with touch gestures', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // nothing overflows sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByTestId('demo-1').tap();
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);

    const canvas = page.locator('[data-testid="scene-3d"] canvas');
    const open0 = (await canvas.boundingBox())!.height;
    await page.locator('.panel-toggle').tap();
    await expect(page.locator('#tabpanel')).toBeHidden();
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(open0 + 100);

    await page.getByTestId('help').tap();
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await expect(page.getByTestId('help-dialog')).toContainText('タッチ');
    await page.getByTestId('help-dialog').getByRole('button').tap();
    await expect(page.getByTestId('help-dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('performance', () => {
  test('@perf frame rate, triangles and draw calls while orbiting (written to test-results/perf.json)', async ({ page }, testInfo) => {
    const errors = await open(page, 'lang=ja&theme=light&perf=1');
    await waitForScene(page);
    await page.getByTestId('demo-3').click();
    await page.waitForTimeout(500);

    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });

    // orbit continuously for the whole sample so every frame is a real redraw with moving labels
    const seconds = 4;
    const sample = await page.evaluate(async (ms) => {
      const w = window as unknown as { __SENKIRO_STATS__: Stats };
      const app = document.querySelector<HTMLElement>('[role="application"]')!;
      const turn = window.setInterval(() => app.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })), 50);
      const frameTimes: number[] = [];
      let last = performance.now();
      let running = true;
      const tick = (now: number) => {
        frameTimes.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const f0 = w.__SENKIRO_STATS__.frames;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, ms));
      running = false;
      window.clearInterval(turn);
      const elapsed = performance.now() - t0;
      const frames = w.__SENKIRO_STATS__.frames - f0;
      frameTimes.sort((a, b) => a - b);
      return {
        fps: (frames * 1000) / elapsed,
        p95FrameMs: frameTimes[Math.floor(frameTimes.length * 0.95)] ?? 0,
        stats: w.__SENKIRO_STATS__,
        canvas: (() => {
          const c = document.querySelector('canvas')!;
          return { width: c.width, height: c.height, dpr: window.devicePixelRatio };
        })(),
      };
    }, seconds * 1000);

    const result = {
      measuredAt: new Date().toISOString(),
      browser: `${testInfo.project.use.channel ?? 'playwright-chromium'} ${page.context().browser()?.version() ?? ''}`.trim(),
      headless: true,
      webglRenderer: renderer,
      viewport: page.viewportSize(),
      canvasPixels: sample.canvas,
      scene: 'all levels, demo route 3 highlighted, labels on, orbiting by keyboard',
      seconds,
      fps: Math.round(sample.fps * 10) / 10,
      p95FrameMs: Math.round(sample.p95FrameMs * 10) / 10,
      triangles: sample.stats.triangles,
      drawCalls: sample.stats.calls,
      lineSegments: sample.stats.lines,
      geometries: sample.stats.geometries,
    };
    const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-results', 'perf.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`[perf] ${JSON.stringify(result)}`);

    expect(result.triangles).toBeLessThan(20_000);
    expect(result.drawCalls).toBeLessThanOrEqual(8);
    // a floor, not a target: software WebGL on a loaded CI machine must still be usable
    expect(result.fps).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });
});
