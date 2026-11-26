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

  test('6. Switch to 3D Metropolitan City Atlas (Three.js), verify WebGL rendering, chunk streaming, honesty banner & line selection', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const mergeErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('mergeGeometries')) {
        mergeErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();

    const banner3d = page.getByTestId('vertical-3d-banner');
    await expect(banner3d).toBeVisible();
    await expect(banner3d).toContainText('縦断位置は模式表示であり、実際の高さ・深度ではありません');

    // Verify Three.js WebGL canvas renders real 3D geometry (non-blank pixels!)
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const canvas = document.querySelector(
              'canvas[data-testid="three-3d-canvas"]',
            ) as HTMLCanvasElement | null;
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
        { timeout: 12_000 },
      )
      .toBeGreaterThanOrEqual(5);

    // Verify urban GIS chunks streamed & rendered
    const telemetry = page.getByTestId('three-telemetry');
    await expect(telemetry).toBeVisible({ timeout: 12_000 });
    await expect(telemetry).toContainText(/Buildings [1-9]/);

    // Select a line in 3D view and inspect detail + line trace bar
    await page.getByTestId('line-chip-sk:line:jr-east-yamanote').click();
    await expect(page.getByTestId('line-trace-bar')).toBeVisible();
    await page.getByTestId('tab-detail').click();
    await expect(page.getByTestId('line-detail-card')).toContainText('山手線');
    await expect(page.getByTestId('line-detail-card')).toContainText('OSM 縦断(模式)');
    expect(pageErrors).toEqual([]);
    expect(mergeErrors).toEqual([]);
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

  test('8. 3D Underground View, Focus Hubs (Shibuya / Shinjuku / Tokyo), Depth Slice & Tier Filters', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await expect(page.getByTestId('underground-control-panel')).toBeVisible();

    // Focus Shibuya hub (automatically activates Underground View)
    await page.getByTestId('hub-btn-shibuya').click();
    await expect(page.getByTestId('toggle-underground-view')).toContainText('ON');
    await expect(page.getByTestId('ground-opacity-slider')).toBeVisible();

    // Toggle Hide Buildings, Clip Plane & L-3 tier
    await page.getByTestId('hide-buildings-checkbox').check();
    await page.getByTestId('clip-plane-checkbox').check();
    await expect(page.getByTestId('clip-plane-slider')).toBeVisible();
    await page.getByTestId('tier-toggle-L-3').click();

    // Focus Shinjuku and Tokyo hubs smoothly
    await page.getByTestId('hub-btn-shinjuku').click();
    await page.getByTestId('hub-btn-tokyo').click();
    expect(pageErrors).toEqual([]);
  });

  test('9. 3D Line Trace Camera Fly-Through along Ginza Line', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.getByTestId('line-chip-sk:line:metro-ginza').click();

    const traceBar = page.getByTestId('line-trace-bar');
    await expect(traceBar).toBeVisible();
    await page.getByTestId('line-trace-play-btn').click();
    await expect(page.getByTestId('line-trace-scrubber')).toBeVisible();
    await expect(traceBar).toContainText(/L[\+\-0]/);
  });

  test('10. Seamless 2D <-> 3D Switch Preserves Selected Line, Operator Filters & Active JR Fare Route', async ({
    page,
  }) => {
    await page.goto('/');
    // Trigger JR Fare detour preset in 2D first
    await page.getByTestId('tab-fare').click();
    await page.getByTestId('preset-suburban-detour').click();
    await expect(page.getByTestId('path-diff-banner')).toBeVisible();

    // Switch to 3D and verify active JR Fare dual-path state is preserved!
    await page.getByTestId('view-mode-3d').click();
    await expect(page.getByTestId('tokyo-3d-pane')).toBeVisible();
    await expect(page.getByTestId('path-diff-banner')).toBeVisible();
    await expect(page.getByTestId('fare-status-badge')).toHaveText('OK');

    // Switch back to 2D and verify MapLibre restores cleanly with fare state intact
    await page.getByTestId('view-mode-geo').click();
    await expect(page.getByTestId('map-canvas-pane')).toBeVisible();
    await expect(page.getByTestId('path-diff-banner')).toBeVisible();
  });

  test('11. Phase 2 GPU Radial Cutaway Explorer, Vertical Exaggeration, Return to Surface & Day/Night Lighting', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');

    // Focus Shibuya hub -> activates Global Ghost-Surface Underground View
    await page.getByTestId('hub-btn-shibuya').click();
    await expect(page.getByTestId('toggle-underground-view')).toContainText('ON');
    await expect(page.getByTestId('ground-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('vertical-exaggeration-slider')).toBeVisible();
    await expect(page.getByTestId('return-to-surface-btn')).toBeVisible();

    // Adjust surface ghost opacity & vertical exaggeration
    await page.getByTestId('ground-opacity-slider').fill('0.24');
    await page.getByTestId('vertical-exaggeration-slider').fill('1.8');

    // One-click Return to Surface View restores surface state cleanly
    await page.getByTestId('return-to-surface-btn').click();
    await expect(page.getByTestId('toggle-underground-view')).not.toContainText('ON');
    await expect(page.getByTestId('return-to-surface-btn')).toHaveCount(0);

    // Toggle Day/Night architectural lighting smoothly
    const dnBtn = page.getByTestId('toggle-3d-day-night');
    await dnBtn.click();
    await expect(dnBtn).toContainText(/昼間|Day/);
    await dnBtn.click();
    await expect(dnBtn).toContainText(/夜間|Night/);

    expect(errors).toEqual([]);
  });

  test('12. Phase 2 Spatial Navigation: Middle-Mouse Ground Pan, Double-Click Focus & Free Explore WASD Flight', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await page.waitForTimeout(1000);

    const canvas = page.locator('canvas[data-testid="three-3d-canvas"]');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;

    // 1. Verify Middle-Mouse hold + drag pans camera freely along ground plane!
    const beforePan = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { target: number[]; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(beforePan).toBeTruthy();

    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 140, cy + 90, { steps: 6 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(450);

    const afterPan = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { target: number[]; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(afterPan).toBeTruthy();
    const panMoved = Math.hypot(
      afterPan!.target[0]! - beforePan!.target[0]!,
      afterPan!.target[2]! - beforePan!.target[2]!,
    );
    expect(panMoved).toBeGreaterThan(20);

    // 2. Verify Free Look button was removed, sidebar can collapse/reopen, Chinese locale & Time-of-Day work!
    await expect(page.getByTestId('toggle-camera-mode')).toHaveCount(0);

    // Collapsible left control sidebar
    await page.getByTestId('toggle-sidebar-btn').click();
    await expect(page.getByTestId('reopen-sidebar-btn')).toBeVisible();
    await page.getByTestId('reopen-sidebar-btn').click();
    await expect(page.getByTestId('tab-explore')).toBeVisible();

    // Simplified Chinese localization switcher
    await page.getByTestId('locale-zh').click();
    await expect(page.getByTestId('tab-fare')).toContainText('票价');

    // Interactive Time-of-Day lighting control
    await page.getByTestId('time-of-day-toggle').click();
    await expect(page.getByTestId('time-of-day-popover')).toBeVisible();
    await page.getByTestId('time-of-day-toggle').click();
    expect(pageErrors).toEqual([]);
  });

  test('13. Atlas v2.0 Virtual Train Simulation, Rolling Stock Rendering, Honesty Badge & Underground Train Follow', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');

    // Simulation dock & synthetic honesty badge must be immediately visible
    await expect(page.getByTestId('simulation-control-bar')).toBeVisible();
    await expect(page.getByTestId('sim-synthetic-badge')).toContainText(/模擬運行|SIMULATED/i);

    // Wait for live simulation & rolling stock telemetry to report active trains + cars
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const m = (
              window as unknown as {
                __SENKIRO_3D_METRICS__?: { activeTrains?: number; rollingStockCars?: number };
              }
            ).__SENKIRO_3D_METRICS__;
            return {
              trains: m?.activeTrains ?? 0,
              cars: m?.rollingStockCars ?? 0,
            };
          }),
        { timeout: 12_000 },
      )
      .toEqual(expect.objectContaining({ trains: expect.any(Number), cars: expect.any(Number) }));

    const counts = await page.evaluate(() => {
      const m = (
        window as unknown as {
          __SENKIRO_3D_METRICS__?: {
            activeTrains?: number;
            undergroundTrains?: number;
            rollingStockCars?: number;
          };
        }
      ).__SENKIRO_3D_METRICS__;
      return m ?? {};
    });
    expect(counts.activeTrains ?? 0).toBeGreaterThan(10);
    expect(counts.undergroundTrains ?? 0).toBeGreaterThan(0);
    expect(counts.rollingStockCars ?? 0).toBeGreaterThan(40);

    // Set 2x speed, pick a subway train, follow it, verify TrainInspector & synthetic disclosure
    await page.getByTestId('sim-speed-select').selectOption('2');
    const trainSelect = page.getByTestId('sim-train-select');
    const chosenVal = await trainSelect.evaluate((el) => {
      const sel = el as HTMLSelectElement;
      const opts = Array.from(sel.options);
      const ug =
        opts.find((o) => /丸ノ内|Marunouchi|副都心|Fukutoshin|大江戸|Oedo|銀座|Ginza/i.test(o.text)) ??
        opts[0];
      return ug?.value ?? '';
    });
    expect(chosenVal.length).toBeGreaterThan(0);
    await trainSelect.selectOption(chosenVal);
    await page.getByTestId('sim-follow-btn').click();

    await expect(page.getByTestId('train-detail-card')).toBeVisible();
    await expect(page.getByTestId('train-synthetic-banner')).toBeVisible();

    // Switch follow angle to Side -> Cab and verify continuous motion
    await page.getByTestId('follow-angle-side').click();
    await page.waitForTimeout(800);
    await page.getByTestId('follow-angle-cab').click();
    await page.waitForTimeout(900);

    const posBefore = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } }).__SENKIRO_3D_CAMERA__
          ?.pos ?? [0, 0, 0],
    );
    await page.waitForTimeout(1400);
    const posAfter = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } }).__SENKIRO_3D_CAMERA__
          ?.pos ?? [0, 0, 0],
    );
    const moved = Math.hypot(
      posAfter[0]! - posBefore[0]!,
      posAfter[1]! - posBefore[1]!,
      posAfter[2]! - posBefore[2]!,
    );
    expect(moved).toBeGreaterThan(1);

    // Exit follow cleanly
    await page.getByTestId('sim-exit-follow-btn').click();
    expect(errors).toEqual([]);
  });

  test('14. Atlas v2.0 Underground Explorer Interior Entry, Zero Label Overlap & Safe Return to Surface', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await page.waitForTimeout(1200);

    // Verify hierarchical screen-space map labels have zero bounding-box overlaps
    const overviewOverlaps = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('[data-testid^="map-label-"]'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 1 && r.height > 1);
      let ov = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
            ov++;
          }
        }
      }
      return ov;
    });
    expect(overviewOverlaps).toBe(0);

    // Enter Underground Explorer inside dual-surface tunnel
    await page.getByTestId('mode-btn-underground_explorer').click();
    await expect(page.getByTestId('explorer-location-card')).toBeVisible();
    await page.waitForTimeout(900);

    const ugCamY = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } }).__SENKIRO_3D_CAMERA__
          ?.pos[1] ?? 999,
    );
    expect(ugCamY).toBeLessThan(-5);

    // One-click safe Return to Surface
    await page.getByTestId('explorer-return-surface-btn').click();
    await page.waitForTimeout(900);
    const surfCamY = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } }).__SENKIRO_3D_CAMERA__
          ?.pos[1] ?? -999,
    );
    expect(surfCamY).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });
});
