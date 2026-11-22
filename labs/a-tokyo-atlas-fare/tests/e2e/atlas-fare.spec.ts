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

    // Select a line in 3D view and inspect detail (coverage & provenance + follow line train)
    await page.getByTestId('line-chip-sk:line:jr-east-yamanote').click();
    await page.getByTestId('tab-detail').click();
    await expect(page.getByTestId('line-detail-card')).toContainText('山手線');
    await expect(page.getByTestId('line-detail-card')).toContainText('OSM 縦断(模式)');
    await expect(page.getByTestId('line-coverage-provenance')).toBeVisible();
    await expect(page.getByTestId('detail-follow-line-train')).toBeVisible();

    // Inspect Station Detail + Station Atlas Entry
    await page.getByTestId('tab-explore').click();
    await page.getByTestId('station-search-input').fill('新宿');
    await page.getByTestId('search-result-sk:station:jr-east-shinjuku').click();
    await expect(page.getByTestId('station-atlas-entry-card')).toBeVisible();
    await page.getByTestId('station-atlas-entry-btn').click();
    await expect(page.getByTestId('station-atlas-preview')).toContainText('labs/c-shinjuku-3d');

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

  test('8. Underground Cutaway Mode: Local Aperture, Tier Filter, Single-Line Highlight & Hub Focus', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');

    // Explicit mode switch to Underground Cutaway
    await page.getByTestId('mode-btn-underground_cutaway').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/地下剖切|Underground Cutaway/);
    await expect(page.getByTestId('mode-context-panel')).toBeVisible();
    await expect(page.getByTestId('cutaway-radius-slider')).toBeVisible();
    await expect(page.getByTestId('vertical-exaggeration-slider')).toBeVisible();
    await expect(page.getByTestId('ground-opacity-slider')).toBeVisible();
    await expect(page.getByTestId('return-to-surface-btn')).toBeVisible();

    // Adjust cutaway parameters & toggle Hide Buildings, Clip Plane & L-3 tier
    await page.getByTestId('cutaway-radius-slider').fill('1100');
    await page.getByTestId('vertical-exaggeration-slider').fill('1.8');
    await page.getByTestId('pin-cutaway-checkbox').check();
    await page.getByTestId('hide-buildings-checkbox').check();
    await page.getByTestId('clip-plane-checkbox').check();
    await expect(page.getByTestId('clip-plane-slider')).toBeVisible();
    await page.getByTestId('tier-toggle-L-3').click();

    // Focus Shibuya / Shinjuku / Tokyo hubs cleanly while remaining in Cutaway
    await page.getByTestId('hub-btn-shibuya').click();
    await page.getByTestId('hub-btn-shinjuku').click();
    await page.getByTestId('hub-btn-tokyo').click();

    // Return to Surface cleanly
    await page.getByTestId('return-to-surface-btn').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/都市俯瞰|City Overview/);
    expect(pageErrors).toEqual([]);
  });

  test('9. Virtual Train Simulation Bar, Train Detail Card & Train Follow Fixed Camera Rigs', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');

    // Simulation Control Bar is visible with prominent synthetic badge
    const simBar = page.getByTestId('simulation-control-bar');
    await expect(simBar).toBeVisible();
    await expect(page.getByTestId('sim-synthetic-badge')).toContainText(/模擬運行|SIMULATED/);

    // Control speed, count, pause/play, visibility toggle
    await page.getByTestId('sim-speed-select').selectOption('2');
    await page.getByTestId('sim-count-select').selectOption('8');
    await page.getByTestId('sim-play-pause').click();
    await page.getByTestId('sim-play-pause').click();

    // Select a simulated train -> opens Virtual Train Detail Card with honesty badge
    await page.getByTestId('sim-train-select').selectOption('sim:train:metro-ginza-1');
    await expect(page.getByTestId('train-detail-card')).toBeVisible();
    await expect(page.getByTestId('train-synthetic-banner')).toContainText(/模擬運行|SIMULATED/);

    // Follow Train -> switches to Train Follow mode and cycles fixed camera angles!
    await page.getByTestId('detail-follow-train-btn').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/列車追従|Train Follow/);
    await expect(page.getByTestId('train-follow-hud-card')).toBeVisible();

    await page.getByTestId('follow-angle-front').click();
    await page.getByTestId('follow-angle-rear').click();
    await page.getByTestId('follow-angle-cab').click();
    await page.getByTestId('follow-angle-side').click();

    // Toggle hide/show simulated trains cleanly exits follow & restores
    await page.getByTestId('sim-exit-follow-btn').click();
    await expect(page.getByTestId('active-mode-badge')).not.toContainText(/列車追従|Train Follow/);
    await page.getByTestId('sim-toggle-visible').click();
    await expect(page.getByTestId('sim-toggle-visible')).toContainText(/非表示|Hidden/);
    await page.getByTestId('sim-toggle-visible').click();
    await page.getByTestId('sim-reset-btn').click();

    expect(pageErrors).toEqual([]);
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

  test('11. True Subterranean Underground Explorer: Tunnel Entry, Location Readout, Hop & One-Click Return to Surface', async ({
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

    // Focus Shibuya then enter Underground Explorer (camera physically enters tunnel space!)
    await page.getByTestId('hub-btn-shibuya').click();
    await page.waitForTimeout(900);
    await page.getByTestId('mode-btn-underground_explorer').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/地下トンネル漫遊|Underground Explorer/);
    await expect(page.getByTestId('explorer-location-card')).toBeVisible({ timeout: 8000 });

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __SENKIRO_3D_CAMERA__?: { mode: string; pos: number[] } })
                .__SENKIRO_3D_CAMERA__?.pos[1] ?? 99,
          ),
        { timeout: 6000 },
      )
      .toBeLessThan(-5);
    await page.waitForTimeout(800);

    const camInside = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { mode: string; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(camInside?.mode).toBe('underground_explorer');

    // Move along tunnel interior via W key (hold across SwiftShader frames)
    await page.keyboard.down('KeyW');
    try {
      await expect
        .poll(
          async () => {
            const camMoved = await page.evaluate(
              () =>
                (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } })
                  .__SENKIRO_3D_CAMERA__,
            );
            return Math.hypot(
              camMoved!.pos[0]! - camInside!.pos[0]!,
              camMoved!.pos[2]! - camInside!.pos[2]!,
            );
          },
          { timeout: 6000 },
        )
        .toBeGreaterThan(6);
    } finally {
      await page.keyboard.up('KeyW');
    }

    // Hop to a nearby crossing underground tunnel if present
    const hopBtns = page.locator('[data-testid^="explorer-hop-"]');
    if ((await hopBtns.count()) > 0) {
      await hopBtns.first().click();
      await expect(page.getByTestId('explorer-location-card')).toBeVisible();
    }

    // One-click Return to Surface lifts camera safely above ground
    await page.getByTestId('explorer-return-surface-btn').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/都市俯瞰|City Overview/);

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } })
                .__SENKIRO_3D_CAMERA__?.pos[1] ?? -99,
          ),
        { timeout: 6000 },
      )
      .toBeGreaterThan(10);

    // Toggle Day/Night architectural lighting smoothly
    const dnBtn = page.getByTestId('toggle-3d-day-night');
    await dnBtn.click();
    await expect(dnBtn).toContainText(/昼間|Day/);
    await dnBtn.click();
    await expect(dnBtn).toContainText(/夜間|Night/);

    expect(errors).toEqual([]);
  });

  test('12. Desktop Human-Centered Controls: Left-Drag Pan, Middle-Drag Orbit, Street-Level Compass, Free Look & Reset', async ({
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

    // 1. Left-drag pans map along ground plane (consistent with 2D MapLibre!)
    const beforePan = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { target: number[]; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(beforePan).toBeTruthy();

    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(cx + 150, cy + 95, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(450);

    const afterPan = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { target: number[]; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    const panMoved = Math.hypot(
      afterPan!.target[0]! - beforePan!.target[0]!,
      afterPan!.target[2]! - beforePan!.target[2]!,
    );
    expect(panMoved).toBeGreaterThan(20);

    // 2. Middle-drag orbits / rotates view freely around focus
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 120, cy - 35, { steps: 6 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(350);

    const afterOrbit = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    const orbitMoved = Math.hypot(
      afterOrbit!.pos[0]! - afterPan!.pos[0]!,
      afterOrbit!.pos[2]! - afterPan!.pos[2]!,
    );
    expect(orbitMoved).toBeGreaterThan(10);

    // 3. Switch to Street-Level mode -> lowers altitude & shows compass + landmark orientation
    await page.getByTestId('mode-btn-street_level').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/街路レベル|Street-Level/);
    await expect(page.getByTestId('street-compass-card')).toBeVisible();

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } })
                .__SENKIRO_3D_CAMERA__?.pos[1] ?? 999,
          ),
        { timeout: 6000 },
      )
      .toBeLessThan(120);

    const camStreet = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(camStreet!.pos[1]!).toBeGreaterThanOrEqual(4);

    // 4. Toggle explicit Free Look & fly with WASD + E
    await page.getByTestId('toggle-free-look').click();
    await expect(page.getByTestId('toggle-free-look')).toContainText('ON');

    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(300);

    const afterFly = await page.evaluate(
      () =>
        (window as unknown as { __SENKIRO_3D_CAMERA__?: { freeLook: boolean; pos: number[] } })
          .__SENKIRO_3D_CAMERA__,
    );
    expect(afterFly?.freeLook).toBe(true);
    expect(
      Math.hypot(
        afterFly!.pos[0]! - camStreet!.pos[0]!,
        afterFly!.pos[1]! - camStreet!.pos[1]!,
        afterFly!.pos[2]! - camStreet!.pos[2]!,
      ),
    ).toBeGreaterThan(10);

    // 5. Reset Overview returns cleanly to city_overview
    await page.getByTestId('reset-3d-camera').click();
    await expect(page.getByTestId('active-mode-badge')).toContainText(/都市俯瞰|City Overview/);
    expect(pageErrors).toEqual([]);
  });

  test('13. Hierarchical Spatial Label System: Tiered Visibility & Zero DOM Bounding-Box Overlap', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await expect(page.getByTestId('map-labels-overlay')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(900);

    const verifyNoOverlap = async () => {
      const boxes = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-testid^="map-label-"]'));
        return els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-testid'),
            kind: el.getAttribute('data-label-kind'),
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
          };
        });
      });
      expect(boxes.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const separated =
            a.right + 4 <= b.left ||
            b.right + 4 <= a.left ||
            a.bottom + 4 <= b.top ||
            b.bottom + 4 <= a.top;
          expect(separated).toBe(true);
        }
      }
      return boxes;
    };

    // Overview labels
    await page.getByTestId('reset-3d-camera').click();
    await page.waitForTimeout(900);
    await verifyNoOverlap();

    // Underground Cutaway labels (includes underground stations / tunnels / crossings)
    await page.getByTestId('hub-btn-shibuya').click();
    await page.waitForTimeout(800);
    await page.getByTestId('mode-btn-underground_cutaway').click();
    await page.waitForTimeout(700);
    await verifyNoOverlap();
  });
});
