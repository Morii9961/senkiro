/**
 * SENKIRO Atlas in a real Chromium (P1-S2). The test-only Kansai fixture is injected
 * through `window.__SENKIRO_ATLAS_PREVIEW__` before the page loads, so the production
 * build draws it with MapLibre GL JS v5 (inline-geometry mode: the fixture has no tiles).
 * Every test fails on any console error or uncaught page error.
 */
import { expect, type Page, test } from '@playwright/test';
import { KANSAI_FIXTURE_BUNDLE } from '../fixtures/atlas-bundle.ts';

interface Collected {
  errors: string[];
  requests: string[];
}

const collected = new WeakMap<Page, Collected>();

test.beforeEach(({ page }) => {
  const state: Collected = { errors: [], requests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      state.errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => state.errors.push(`pageerror: ${error.message}`));
  page.on('request', (request) => state.requests.push(request.url()));
  collected.set(page, state);
});

test.afterEach(({ page }) => {
  expect(collected.get(page)?.errors ?? []).toEqual([]);
});

async function injectFixture(page: Page) {
  await page.addInitScript((bundle) => {
    Reflect.set(globalThis, '__SENKIRO_ATLAS_PREVIEW__', { kansai: bundle });
  }, KANSAI_FIXTURE_BUNDLE);
}

function search(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

const mapStatus = (page: Page) => page.locator('[data-map-status]');

test.describe('Atlas map engine', () => {
  test('never loads the MapLibre chunk without a data source', async ({ page }) => {
    await page.goto('/');
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'unconnected');
    await page.waitForLoadState('networkidle');
    const requests = collected.get(page)?.requests ?? [];
    expect(requests.filter((url) => /\/AtlasMapView-/.test(url))).toEqual([]);
    await expect(page.locator('[data-atlas-map]')).toHaveCount(0);
  });

  test('draws the injected bundle offline with MapLibre and labels it as preview', async ({
    page,
  }, testInfo) => {
    await injectFixture(page);
    await page.goto('/?lang=en');
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'ready', { timeout: 30_000 });
    await expect(mapStatus(page)).toContainText('geometry inside the data bundle');
    await expect(mapStatus(page)).toContainText('Preview fixture');
    const map = page.locator('[data-atlas-map]');
    await expect(map).toHaveAttribute('data-atlas-source', 'geojson');
    await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible();
    // Only same-origin requests: no basemap, glyph or sprite server.
    const origin = new URL(page.url()).origin;
    const foreign = (collected.get(page)?.requests ?? []).filter(
      (url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'),
    );
    expect(foreign).toEqual([]);
    // The MapLibre engine came from its own lazy chunk.
    expect((collected.get(page)?.requests ?? []).some((url) => /\/AtlasMapView-/.test(url))).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('atlas-kansai-en.png') });
  });

  test('search → complex entry flies the map and keeps the URL as the source of truth', async ({
    page,
  }, testInfo) => {
    await injectFixture(page);
    await page.goto('/');
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'ready', { timeout: 30_000 });
    await page.getByRole('link', { name: /SENKIRO Atlas/ }).click();
    const panel = page.locator('[data-atlas-panel="ready"]');
    await panel.getByRole('searchbox').fill('京都');
    const complex = panel.locator('[data-result-group="complex"] [data-result-kind="complex"]');
    await expect(complex).toHaveCount(1);
    await expect(
      panel.locator('[data-result-id="sk:station:kansai:hankyu-kyoto-kawaramachi"]'),
    ).toContainText('四条河原町');
    await complex.click();
    await expect.poll(() => search(page).get('complex')).toBe('sk:complex:kansai:kyoto');
    await expect(page.locator('[data-atlas-entry="complex"]')).toContainText('阪急 京都河原町駅');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: testInfo.outputPath('atlas-kyoto-complex.png') });
    await page.reload();
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'ready', { timeout: 30_000 });
    expect(search(page).get('complex')).toBe('sk:complex:kansai:kyoto');
  });

  test('switching language, theme and region restyles the live map without errors', async ({
    page,
  }) => {
    await injectFixture(page);
    await page.goto('/?theme=light&lang=ja');
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'ready', { timeout: 30_000 });
    await page.getByRole('button', { name: '表示設定' }).click();
    await page.getByRole('radio', { name: '简体中文' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByRole('radio', { name: '深色' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'ready');
    await page.getByRole('radio', { name: '关东预览区' }).click();
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'unavailable');
    await expect(page.locator('[data-atlas-map]')).toHaveAttribute('data-atlas-region', 'kanto');
    await page.getByRole('radio', { name: '京阪神核心圈' }).click();
    await expect(mapStatus(page)).toHaveAttribute('data-map-status', 'ready');
  });
});
