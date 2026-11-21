import { expect, test } from '@playwright/test';

test.describe('SENKIRO Lab · Tokyo Atlas & Fare Interactive E2E', () => {
  test('1. Search (JA/EN/Kana), verify MapLibre renders non-blank railway canvas, and inspect Station Detail', async ({
    page,
  }) => {
    const mapErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('[MapLibre]')) mapErrors.push(msg.text());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /SENKIRO Lab/ })).toBeVisible();

    // Verify MapLibre WebGL canvas actually rendered multiple distinct pixel colors (railway lines + stations)
    await page.waitForSelector('canvas.maplibregl-canvas');
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const canvas = document.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement | null;
            if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;
            const gl =
              (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
              (canvas.getContext('webgl') as WebGLRenderingContext | null);
            if (!gl) return 0;
            const w = canvas.width;
            const h = canvas.height;
            const pixels = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const colors = new Set<string>();
            for (let i = 0; i < pixels.length; i += 400) {
              colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
              if (colors.size >= 8) break;
            }
            return colors.size;
          }),
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(5);
    expect(mapErrors).toEqual([]);

    const searchInput = page.getByTestId('station-search-input');
    // Search in English
    await searchInput.fill('Shinjuku');
    await expect(page.getByTestId('search-results-list')).toBeVisible();
    await expect(page.getByTestId('search-result-sk:station:jr-east-shinjuku')).toBeVisible();
    await expect(page.getByTestId('search-result-sk:station:seibu-seibu-shinjuku')).toBeVisible();

    // Search in Kana
    await searchInput.fill('せいぶしんじゅく');
    await expect(page.getByTestId('search-result-sk:station:seibu-seibu-shinjuku')).toBeVisible();

    // Click JR Shinjuku to inspect detail card
    await searchInput.fill('新宿');
    await page.getByTestId('search-result-sk:station:jr-east-shinjuku').click();

    const detail = page.getByTestId('station-detail-card');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('sk:complex:shinjuku');
    await expect(detail).toContainText('Provenance');
    await expect(detail).toContainText('改札外乗換');
  });

  test('2. Filter by Operator and JR Fare Slice + Honest Realtime Slot', async ({ page }) => {
    await page.goto('/');

    // Honest keyless realtime degradation
    const rtSlot = page.getByTestId('realtime-status-slot');
    await expect(rtSlot).toContainText('unavailable');
    await expect(rtSlot).toContainText('無実時データ');

    // Toggle JR Fare Slice Only
    await page.getByTestId('filter-fare-slice-only').check();
    await expect(page.getByTestId('line-chip-sk:line:jr-east-yamanote')).toBeVisible();
    await expect(page.getByTestId('line-chip-sk:line:metro-ginza')).toHaveCount(0);

    // Uncheck fare slice filter and toggle Tokyo Metro operator off
    await page.getByTestId('filter-fare-slice-only').uncheck();
    await expect(page.getByTestId('line-chip-sk:line:metro-ginza')).toBeVisible();
    await page.getByTestId('filter-op-sk:operator:tokyo-metro').uncheck();
    await expect(page.getByTestId('line-chip-sk:line:metro-ginza')).toHaveCount(0);
  });

  test('3. Coverage Panel displays full/partial/none coverage, ODbL isolation, and unaligned records', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('tab-coverage').click();

    const panel = page.getByTestId('coverage-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('国土数値情報');
    await expect(panel).toContainText('ODbL share-alike (隔離)');
    await expect(panel).toContainText('未収録');

    const unalignedCard = page.getByTestId('unaligned-records-card');
    await expect(unalignedCard).toBeVisible();
    await expect(unalignedCard).toContainText('44');
  });

  test('4. Select Origin & Destination from Atlas, calculate JR Fare, verify Explanation Tree & Dual-Path Diff Highlight', async ({
    page,
  }) => {
    await page.goto('/');

    // Pick Tokyo as Origin via Station Detail
    const searchInput = page.getByTestId('station-search-input');
    await searchInput.fill('東京');
    await page.getByTestId('search-result-sk:station:jr-east-tokyo').click();
    await page.getByTestId('btn-set-origin').click();

    // Pick Ueno as Destination via Station Detail
    await page.getByTestId('tab-explore').click();
    await searchInput.fill('上野');
    await page.getByTestId('search-result-sk:station:jr-east-ueno').click();
    await page.getByTestId('btn-set-dest').click();

    // Now in Fare tab: verify prominent synthetic disclaimer & switch to Yamanote loop detour to trigger Actual != Billed
    await expect(page.getByTestId('synthetic-tariff-banner')).toContainText('示例数据');
    await page.getByTestId('fare-route-pref-select').selectOption('yamanote_loop_detour');
    await page.getByTestId('fare-calculate-btn').click();

    await expect(page.getByTestId('fare-status-badge')).toHaveText('OK');
    await expect(page.getByTestId('fare-total-amount')).toContainText('SYNTHETIC');
    await expect(page.getByTestId('fare-explanation-tree')).toContainText('JR-ART157-SUBURBAN');
    await expect(page.getByTestId('fare-explanation-tree')).toContainText(
      'https://www.jreast.co.jp/kippu/1103.html',
    );
    // Map overlay diff banner appears when actual riding path differs from billed path
    await expect(page.getByTestId('path-diff-banner')).toBeVisible();
  });

  test('5. Rule Versioning (2026-03-14 Tokaido Shinkansen split) and Honest Rejections (Local Line & Non-JR)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('tab-fare').click();

    // Post-2026-03-14 Tokyo->Atami Shinkansen is REJECTED for same-line (separate line)
    await page.getByTestId('preset-shinkansen-2026-split').click();
    await expect(page.getByTestId('fare-status-badge')).toHaveText('OK');
    await expect(page.getByTestId('fare-explanation-tree')).toContainText('JR-ART16-2-V2026');
    await expect(page.getByTestId('fare-explanation-tree')).toContainText('別線扱い');

    // Local line (Hachiko Line) refuses exact yen amount with UNSUPPORTED
    await page.getByTestId('preset-local-line-reject').click();
    await expect(page.getByTestId('fare-status-badge')).toHaveText('UNSUPPORTED');
    await expect(page.getByTestId('fare-total-amount')).toHaveCount(0);
    await expect(page.getByTestId('fare-rejected-reason')).toContainText('UNSUPPORTED');

    // Non-JR station returns NOT_APPLICABLE with no yen amount
    await page.getByTestId('preset-non-jr-reject').click();
    await expect(page.getByTestId('fare-status-badge')).toHaveText('NOT_APPLICABLE');
    await expect(page.getByTestId('fare-total-amount')).toHaveCount(0);
  });

  test('6. Switch to 3D Stereoscopic View, verify schematic honesty banner, and select a RailLine (Should #21)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();

    const banner3d = page.getByTestId('vertical-3d-banner');
    await expect(banner3d).toBeVisible();
    await expect(banner3d).toContainText('縦断位置は模式表示であり、実際の高さ・深度ではありません');

    // Select a line in 3D view and inspect its detail
    await page.getByTestId('line-chip-sk:line:jr-east-yamanote').click();
    await page.getByTestId('tab-detail').click();
    await expect(page.getByTestId('line-detail-card')).toContainText('山手線');
    await expect(page.getByTestId('line-detail-card')).toContainText('OSM 縦断(模式)');
  });

  test('7. Strip Map View, Dark Mode, and EN/JA Bilingual Toggle (Should #18 & #19)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByTestId('locale-toggle').click();
    await expect(page.getByTestId('tab-fare')).toContainText('JR Fare');

    await page.getByTestId('view-mode-strip').click();
    await expect(page.getByTestId('strip-map-view')).toBeVisible();
    await expect(page.getByTestId('strip-map-view')).toContainText('Yamanote');
  });
});
