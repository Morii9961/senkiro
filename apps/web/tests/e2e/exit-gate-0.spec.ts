/**
 * Exit Gate 0 (P0-W2): the production build in a real Chromium.
 *
 * Every test fails on any console error or uncaught page error. The WebGL renderer string
 * is recorded as a test annotation, so the report can say whether a hardware GPU or
 * SwiftShader drew the 3D view.
 */
import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';

interface Collected {
  errors: string[];
  requests: string[];
}

const collected = new WeakMap<Page, Collected>();

function watch(page: Page): Collected {
  const state: Collected = { errors: [], requests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      state.errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => state.errors.push(`pageerror: ${error.message}`));
  page.on('request', (request) => state.requests.push(request.url()));
  collected.set(page, state);
  return state;
}

test.beforeEach(({ page }) => {
  watch(page);
});

test.afterEach(({ page }) => {
  expect(collected.get(page)?.errors ?? []).toEqual([]);
});

/** The production CSS must define the ui-kit design tokens (regression guard). */
function canvasToken(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--sk-color-canvas').trim(),
  );
}

function search(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

async function openExplorer(page: Page) {
  const explorer = page.locator('[data-station-explorer]');
  await expect(explorer).toBeVisible({ timeout: 30_000 });
  return explorer;
}

async function recordRenderer(page: Page, testInfo: TestInfo) {
  const info = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) {
      return { webgl2: false, vendor: null, renderer: null };
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl2: true,
      vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
    };
  });
  const software = /swiftshader|llvmpipe|software/i.test(info.renderer ?? '');
  testInfo.annotations.push({
    type: 'webgl',
    description: `${info.webgl2 ? 'webgl2' : 'no webgl2'} · ${info.vendor ?? '?'} · ${info.renderer ?? '?'} · ${software ? 'software' : 'hardware'}`,
  });
  process.stdout.write(`[exit-gate-0] WebGL: ${JSON.stringify({ ...info, software })}
`);
  return info;
}

test.describe('trilingual shell and themes', () => {
  test('switches zh-CN → ja → en and dark → light, and a reload keeps both', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'zh-CN');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await canvasToken(page)).toBe('#181c22');

    await page.getByRole('button', { name: '显示设置' }).click();
    await page.getByRole('radio', { name: '日本語' }).click();
    await expect(html).toHaveAttribute('lang', 'ja');
    expect(search(page).get('lang')).toBe('ja');
    await expect(page.getByRole('navigation', { name: /./ }).first()).toBeVisible();

    await page.getByRole('radio', { name: 'English' }).click();
    await expect(html).toHaveAttribute('lang', 'en');
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(search(page).get('theme')).toBe('light');
    expect(await canvasToken(page)).toBe('#f4f1ea');

    await page.reload();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(page).toHaveTitle(/SENKIRO/);

    await page.getByRole('button', { name: /display|preferences/i }).click();
    await page.getByRole('radio', { name: '简体中文' }).click();
    await page.getByRole('radio', { name: '深色' }).click();
    await expect(html).toHaveAttribute('lang', 'zh-CN');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    // Defaults are omitted: the canonical home URL has no query again.
    await expect.poll(() => new URL(page.url()).search).toBe('');
  });
});

test.describe('Umeda (7-station hub)', () => {
  test('mounts the explorer, syncs level / selection / step-free with the URL', async ({
    page,
  }, testInfo) => {
    await page.goto('/?hub=umeda&lang=en');
    await expect(page.getByRole('dialog', { name: 'Umeda' })).toBeVisible();
    const explorer = await openExplorer(page);
    const webgl = await recordRenderer(page, testInfo);
    await expect(explorer).toHaveAttribute('data-view', webgl.webgl2 ? '3d' : '2d');
    if (webgl.webgl2) {
      await expect(explorer.locator('[data-station-viewport] canvas')).toBeVisible();
    }

    // Level → URL.
    await explorer.getByRole('button', { name: 'B1F', exact: true }).click();
    await expect.poll(() => search(page).get('level')).toBe('B1F');
    await expect(explorer).toHaveAttribute('data-active-level', 'B1F');

    // 2D plan: pick a facility → URL.
    await explorer.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(explorer).toHaveAttribute('data-view', '2d');
    const plan = explorer.locator('[data-station-plan-2d]');
    await expect(plan).toHaveAttribute('data-floor', '-1');
    const place = plan.locator('[data-place-id]').first();
    const placeId = await place.getAttribute('data-place-id');
    expect(placeId).not.toBeNull();
    // Facilities are keyboard targets; a pointer click can land on an overlapping link line.
    await place.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => search(page).get('selection')).toBe(placeId);
    await expect(explorer.locator('[data-selected-name]')).not.toBeEmpty();

    // Step-free routing → URL.
    await explorer.getByRole('checkbox', { name: 'Step-free' }).check();
    await expect.poll(() => search(page).get('stepFree')).toBe('true');
    const [from, to] = [explorer.locator('select').nth(0), explorer.locator('select').nth(1)];
    const values = await from
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
      );
    expect(values.length).toBeGreaterThan(10);
    const result = explorer.locator('[data-station-route-mode]');
    let reachable = false;
    for (let i = 1; i < Math.min(values.length, 25) && !reachable; i++) {
      await from.selectOption(values[0] as string);
      await to.selectOption(values[i] as string);
      await expect(result).toHaveAttribute('data-station-route-mode', 'step_free');
      reachable = (await result.getAttribute('data-reachable')) === 'true';
    }
    expect(reachable).toBe(true);
    await expect(result.locator('li').first()).toBeVisible();

    // Reload restores the in-station view from the URL.
    await page.reload();
    const restored = await openExplorer(page);
    await expect(restored).toHaveAttribute('data-active-level', 'B1F');
    await expect(restored.getByRole('checkbox', { name: 'Step-free' })).toBeChecked();
    // The view mode is local UI state (3D by default); the selection comes back from the URL.
    await restored.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(restored.locator('[data-station-plan-2d]')).toHaveAttribute('data-floor', '-1');
    await expect(restored.locator(`[data-place-id="${placeId}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(restored.locator('[data-selected-name]')).not.toBeEmpty();
  });
});

test.describe('Shinjuku (10-station hub)', () => {
  test('switches to the Kanto region and renders the hub and its plan', async ({ page }) => {
    await page.goto('/?hub=shinjuku');
    await expect(page.getByRole('dialog', { name: '新宿' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '关东预览区' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const explorer = await openExplorer(page);
    await expect(explorer).toHaveAttribute('aria-label', /新宿/);
    await explorer.getByRole('button', { name: '平面图', exact: true }).click();
    const plan = explorer.locator('[data-station-plan-2d]');
    await expect(plan).toBeVisible();
    await expect(plan.locator('[data-place-id]').first()).toBeVisible();
    await expect(explorer.locator('[data-compass="known"]')).toBeVisible();
  });
});

test.describe('Kyoto honest placeholder', () => {
  test('shows Phase 1 under construction and loads no model or dataset', async ({ page }) => {
    await page.goto('/?hub=kyoto');
    const dialog = page.getByRole('dialog', { name: '京都' });
    await expect(dialog).toContainText('Phase 1 建设中');
    await expect(page.locator('[data-station-explorer]')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    const requests = collected.get(page)?.requests ?? [];
    expect(requests.filter((url) => /\/(station-explorer|umeda|shinjuku)-/.test(url))).toEqual([]);
  });
});

async function probe(page: Page) {
  const ready = page.locator('[data-local-db-probe="ready"]');
  await expect(ready).toBeVisible({ timeout: 30_000 });
  return ready;
}

async function probeRows(page: Page): Promise<number> {
  return Number(await (await probe(page)).getAttribute('data-probe-rows'));
}

test.describe('isomorphic SQLite in the browser', () => {
  test('OPFS sahpool persists a write across a reload, then clears it', async ({ page }) => {
    await page.goto('/?module=profile&lang=en');
    const ready = await probe(page);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await expect(ready).toHaveAttribute('data-persistence-mode', 'opfs-sahpool');
    await expect(ready).toHaveAttribute('data-tables-ready', '6');
    const before = await probeRows(page);

    await ready.getByRole('button', { name: 'Write a self-check row' }).click();
    await expect(ready).toHaveAttribute('data-probe-rows', String(before + 1));

    await page.reload();
    const reopened = await probe(page);
    await expect(reopened).toHaveAttribute('data-persistence-mode', 'opfs-sahpool');
    await expect(reopened).toHaveAttribute('data-probe-rows', String(before + 1));

    await reopened.getByRole('button', { name: 'Export JSON' }).click();
    const exported = reopened.locator('[data-probe-export-bytes]');
    await expect(exported).toBeVisible();
    expect(Number(await exported.getAttribute('data-probe-export-bytes'))).toBeGreaterThan(100);

    await reopened.getByRole('button', { name: 'Clear self-check rows' }).click();
    await expect(reopened).toHaveAttribute('data-probe-rows', '0');
    await page.reload();
    await expect(await probe(page)).toHaveAttribute('data-probe-rows', '0');

    // The Journey module shares the same database.
    await page.goto('/?module=journey&lang=en');
    await expect(await probe(page)).toHaveAttribute('data-persistence-mode', 'opfs-sahpool');
  });

  test('falls back to memory without createSyncAccessHandle and does not crash', async ({
    browser,
  }) => {
    const page = await isolatedPageWithoutSyncAccessHandles(browser);
    try {
      await page.goto('/?module=profile&lang=en');
      const ready = await probe(page);
      await expect(ready).toHaveAttribute('data-persistence-mode', 'memory-fallback');
      await expect(ready).toHaveAttribute('data-tables-ready', '6');
      await ready.getByRole('button', { name: 'Write a self-check row' }).click();
      await expect(ready).toHaveAttribute('data-probe-rows', '1');
      await page.reload();
      // Memory only: the row is gone after a reload, honestly reported as such.
      await expect(await probe(page)).toHaveAttribute('data-probe-rows', '0');
      expect(collected.get(page)?.errors ?? []).toEqual([]);
    } finally {
      await page.context().close();
    }
  });
});

/** A fresh context whose SQLite Worker sees no `createSyncAccessHandle`. */
async function isolatedPageWithoutSyncAccessHandles(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  // Init scripts do not reach dedicated workers, so patch the Worker module itself.
  await context.route(/\/assets\/sqlite\.worker-[^/]+\.js$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: `delete globalThis.FileSystemFileHandle?.prototype.createSyncAccessHandle;\n${body}`,
    });
  });
  const page = await context.newPage();
  watch(page);
  return page;
}

test.describe('narrow layout (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/', '/?hub=umeda', '/?hub=shinjuku&lang=ja', '/?module=profile&lang=en']) {
    test(`has no horizontal overflow at ${path}`, async ({ page }) => {
      await page.goto(path);
      if (path.includes('hub=')) {
        await openExplorer(page);
      }
      if (path.includes('profile')) {
        await probe(page);
      }
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.inner);
    });
  }
});
