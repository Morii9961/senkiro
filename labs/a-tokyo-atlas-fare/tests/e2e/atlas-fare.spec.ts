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

    // Focus Shibuya hub -> activates GPU Radial Cutaway Explorer
    await page.getByTestId('hub-btn-shibuya').click();
    await expect(page.getByTestId('toggle-underground-view')).toContainText('ON');
    await expect(page.getByTestId('cutaway-radius-slider')).toBeVisible();
    await expect(page.getByTestId('vertical-exaggeration-slider')).toBeVisible();
    await expect(page.getByTestId('return-to-surface-btn')).toBeVisible();

    // Adjust cutaway radius, vertical exaggeration & pin cutaway location
    await page.getByTestId('cutaway-radius-slider').fill('1100');
    await page.getByTestId('vertical-exaggeration-slider').fill('1.8');
    await page.getByTestId('pin-cutaway-checkbox').check();

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

    // 2. Switch seamlessly to Free Explore Mode & test WASD + E flight!
    await page.getByTestId('toggle-camera-mode').click();
    await expect(page.getByTestId('toggle-camera-mode')).toContainText('ON');
    await expect(page.getByTestId('free-speed-select')).toBeVisible();
    await page.getByTestId('free-speed-select').selectOption('fast');

    const beforeFly = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { mode: string; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(beforeFly?.mode).toBe('free');

    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(550);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(350);

    const afterFly = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { mode: string; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    const flyMoved = Math.hypot(
      afterFly!.pos[0]! - beforeFly!.pos[0]!,
      afterFly!.pos[1]! - beforeFly!.pos[1]!,
      afterFly!.pos[2]! - beforeFly!.pos[2]!,
    );
    expect(flyMoved).toBeGreaterThan(30);

    // 3. Return seamlessly to Map Browse Mode
    await page.getByTestId('toggle-camera-mode').click();
    await expect(page.getByTestId('free-speed-select')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('13. Atlas v2 Underground Railway Geometry: Tunnel Interiors, Station Caverns, Shield Bores, Roof Cutaway & Spatial API', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await page.waitForTimeout(1200);

    // 1. Verify surface mode completely culls invisible underground chunks & exposes Underground Query API
    const apiCheck = await page.evaluate(() => {
      const bridge = (
        window as unknown as {
          __SENKIRO_UNDERGROUND__?: {
            api: {
              getEnterableSegments: () => Array<{ segmentId: string; isPilotCorridor: boolean }>;
              getCuratedViewpoints: () => Array<{ id: string; depthReliability: string }>;
              sampleTrackFrame: (segId: string, d: number, lane?: 0 | 1) => { position: { x: number; y: number; z: number } } | null;
              getClearanceConstraint: (segId: string) => { safeCorridorLocal: { maxUpM: number; minUpM: number } } | null;
              getPortalCutoutHints: () => unknown[];
              getTelemetry: () => {
                totalTunnelChunks: number;
                visibleTunnelChunks: number;
                detailedInteriorChunks: number;
                activePointLights: number;
                roofCutawayActive: boolean;
                lineOverlayVisible: boolean;
                interiorModeActive: boolean;
              };
            };
          };
        }
      ).__SENKIRO_UNDERGROUND__;
      if (!bridge) return null;
      const segs = bridge.api.getEnterableSegments();
      const vps = bridge.api.getCuratedViewpoints();
      const pilot = segs.find((s) => s.isPilotCorridor);
      const frame = pilot ? bridge.api.sampleTrackFrame(pilot.segmentId, 120, 0) : null;
      const clearance = pilot ? bridge.api.getClearanceConstraint(pilot.segmentId) : null;
      return {
        segCount: segs.length,
        vpCount: vps.length,
        allSchematic: vps.every((v) => v.depthReliability === 'schematic'),
        hasFrame: Boolean(frame && Number.isFinite(frame.position.y)),
        hasClearance: Boolean(clearance && clearance.safeCorridorLocal.maxUpM > clearance.safeCorridorLocal.minUpM),
        portalHints: bridge.api.getPortalCutoutHints().length,
        surfaceTelemetry: bridge.api.getTelemetry(),
      };
    });

    expect(apiCheck).not.toBeNull();
    expect(apiCheck!.segCount).toBeGreaterThan(150);
    expect(apiCheck!.vpCount).toBeGreaterThanOrEqual(4);
    expect(apiCheck!.allSchematic).toBe(true);
    expect(apiCheck!.hasFrame).toBe(true);
    expect(apiCheck!.hasClearance).toBe(true);
    expect(apiCheck!.portalHints).toBeGreaterThan(5);
    expect(apiCheck!.surfaceTelemetry.visibleTunnelChunks).toBe(0);
    expect(apiCheck!.surfaceTelemetry.lineOverlayVisible).toBe(false);

    // 2. Enter Ginza Box Tunnel Interior via curated viewpoint selector
    await page.getByTestId('tunnel-viewpoint-select').selectOption('ginza-box-interior');
    await page.waitForTimeout(700);
    const boxTelemetry = await page.evaluate(
      () =>
        (
          window as unknown as {
            __SENKIRO_UNDERGROUND__?: { api: { getTelemetry: () => Record<string, unknown> } };
          }
        ).__SENKIRO_UNDERGROUND__?.api.getTelemetry(),
    );
    expect(boxTelemetry?.interiorModeActive).toBe(true);
    expect(Number(boxTelemetry?.visibleTunnelChunks)).toBeGreaterThan(0);
    expect(Number(boxTelemetry?.detailedInteriorChunks)).toBeGreaterThan(0);
    expect(Number(boxTelemetry?.activePointLights)).toBeGreaterThan(0);

    // 3. Enter Omotesando Station Cavern & Fukutoshin Circular Shield Tunnel
    await page.getByTestId('tunnel-viewpoint-select').selectOption('ginza-omotesando-station');
    await page.waitForTimeout(500);
    await page.getByTestId('tunnel-viewpoint-select').selectOption('fukutoshin-shield-interior');
    await page.waitForTimeout(500);

    // 4. Toggle Tunnel Roof Cutaway & Independent Line Color Info Overlay
    await page.getByTestId('tunnel-roof-cutaway-checkbox').check();
    await page.getByTestId('line-color-overlay-checkbox').check();
    await page.waitForTimeout(350);
    const cutTelemetry = await page.evaluate(
      () =>
        (
          window as unknown as {
            __SENKIRO_UNDERGROUND__?: { api: { getTelemetry: () => Record<string, unknown> } };
          }
        ).__SENKIRO_UNDERGROUND__?.api.getTelemetry(),
    );
    expect(cutTelemetry?.roofCutawayActive).toBe(true);
    expect(cutTelemetry?.lineOverlayVisible).toBe(true);

    // 5. Return to Surface View restores clean surface culling
    await page.getByTestId('return-to-surface-btn').click();
    await page.waitForTimeout(500);
    const afterSurface = await page.evaluate(
      () =>
        (
          window as unknown as {
            __SENKIRO_UNDERGROUND__?: { api: { getTelemetry: () => Record<string, unknown> } };
          }
        ).__SENKIRO_UNDERGROUND__?.api.getTelemetry(),
    );
    expect(afterSurface?.interiorModeActive).toBe(false);
    expect(afterSurface?.visibleTunnelChunks).toBe(0);
    expect(pageErrors).toEqual([]);
  });
});
