import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  'public',
  'assets',
  'rolling-stock',
  'screenshots',
);

test.describe('SENKIRO Atlas v2 — Japanese Rolling Stock 3D Asset Studio E2E & Visual Verification', () => {
  test('renders all 3 series, verifies distinct visual hallmarks, animates doors/lights/direction/curve, switches 3-tier LOD, validates GLB & captures real screenshots', async ({
    page,
    context,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const distDir = path.resolve(process.cwd(), 'dist');
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.glb': 'model/gltf-binary',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };

    await context.route('http://senkiro.local/**', async (route) => {
      const url = new URL(route.request().url());
      const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = path.join(distDir, decodeURIComponent(reqPath));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const body = fs.readFileSync(filePath);
        await route.fulfill({
          status: 200,
          contentType: mimeTypes[ext] ?? 'application/octet-stream',
          body,
        });
      } else {
        await route.fulfill({ status: 404, body: 'Not Found' });
      }
    });

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('http://senkiro.local/rolling-stock-preview.html', {
      waitUntil: 'networkidle',
    });

    const canvas = page.getByTestId('rolling-stock-3d-canvas');
    await expect(canvas).toBeVisible();

    // Wait for initial WebGL render & telemetry
    await page.waitForFunction(() => {
      const t = (
        window as unknown as {
          __SENKIRO_ROLLING_STOCK_TELEMETRY__?: { renderedTriangles: number; drawCalls: number };
        }
      ).__SENKIRO_ROLLING_STOCK_TELEMETRY__;
      return Boolean(t && t.renderedTriangles > 15000 && t.drawCalls > 10);
    });

    // 1. Capture 3-Series Front Lineup Comparison
    await page.getByTestId('cam-preset-lineup_front').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-three-series-front-lineup.png'),
    });

    // 2. Capture 3-Series Side Profile & Dimension Comparison
    await page.getByTestId('cam-preset-lineup_side').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-three-series-side-proportions.png'),
    });

    // 3. Capture Far-Distance Recognition Verification (150m+)
    await page.getByTestId('cam-preset-lineup_far').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-three-series-far-distance.png'),
    });

    // 4. Switch to Single Focus: JR East E235-0 (Yamanote Line) with Doors Open
    await page.getByTestId('mode-single-focus').click();
    await page.getByTestId('select-series-jr-east-e235-0').click();
    await page.getByTestId('toggle-both-doors').click();
    await page.waitForFunction(() => {
      const t = (
        window as unknown as {
          __SENKIRO_ROLLING_STOCK_TELEMETRY__?: {
            leftDoorProgress: number;
            rightDoorProgress: number;
          };
        }
      ).__SENKIRO_ROLLING_STOCK_TELEMETRY__;
      return Boolean(t && t.leftDoorProgress >= 0.99 && t.rightDoorProgress >= 0.99);
    });
    await page.getByTestId('cam-preset-cab_closeup').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-e235-yamanote-closeup-doors-open.png'),
    });

    // Close doors back
    await page.getByTestId('toggle-both-doors').click();

    // 5. Inspect Tokyo Metro 1000 Series (Ginza Line — 16m, 3 doors, Lemon Yellow + Maroon Roof, Third-Rail Shoes)
    await page.getByTestId('select-series-tokyo-metro-1000').click();
    await page.getByTestId('car-count-btn-6').click();
    await page.getByTestId('cam-preset-cab_closeup').click();
    await page.waitForTimeout(350);
    await expect(page.getByTestId('spec-credibility-card')).toContainText('1000系');
    await expect(page.getByTestId('spec-credibility-card')).toContainText('16.00m × 2.550m');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05-metro1000-ginza-closeup-third-rail.png'),
    });

    // 6. Inspect Tokyo Metro 17000 Series (Yurakucho & Fukutoshin — Aerodynamic Round Headlights & S-Curve Articulation)
    await page.getByTestId('select-series-tokyo-metro-17000').click();
    await page.getByTestId('car-count-btn-6').click();
    await page.getByTestId('track-kind-s_curve').click();
    await page.getByTestId('cam-preset-cab_closeup').click();
    await page.waitForTimeout(350);
    await expect(page.getByTestId('spec-credibility-card')).toContainText('17000系');
    await expect(page.getByTestId('spec-credibility-card')).toContainText('20.00m × 2.800m');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06-metro17000-yurakucho-fukutoshin-curve.png'),
    });

    // 7. Verify Travel Direction Reversal & Night Mode Headlights/Taillights/Cabin Glow
    await page.getByTestId('studio-theme-toggle').click();
    await page.getByTestId('toggle-travel-direction').click();
    await page.getByTestId('cam-preset-rear_tail').click();
    await page.waitForTimeout(350);

    const dirState = await page.evaluate(() => {
      return (
        window as unknown as {
          __SENKIRO_ROLLING_STOCK_TELEMETRY__?: {
            travelDirection: string;
            interiorLightsOn: boolean;
          };
        }
      ).__SENKIRO_ROLLING_STOCK_TELEMETRY__;
    });
    expect(dirState?.travelDirection).toBe('reverse');
    expect(dirState?.interiorLightsOn).toBe(true);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07-night-mode-direction-reversed-lights.png'),
    });

    // Switch back to Day Mode & Forward Direction
    await page.getByTestId('studio-theme-toggle').click();
    await page.getByTestId('toggle-travel-direction').click();

    // 8. Verify 3-Tier LOD Switching (High -> Medium -> Low -> Auto) & Polygon Reduction
    await page.getByTestId('lod-btn-high').click();
    const trisHigh = await page.evaluate(
      () =>
        (
          window as unknown as {
            __SENKIRO_ROLLING_STOCK_TELEMETRY__?: { renderedTriangles: number };
          }
        ).__SENKIRO_ROLLING_STOCK_TELEMETRY__?.renderedTriangles ?? 0,
    );

    await page.getByTestId('lod-btn-medium').click();
    const trisMed = await page.evaluate(
      () =>
        (
          window as unknown as {
            __SENKIRO_ROLLING_STOCK_TELEMETRY__?: { renderedTriangles: number };
          }
        ).__SENKIRO_ROLLING_STOCK_TELEMETRY__?.renderedTriangles ?? 0,
    );

    await page.getByTestId('lod-btn-low').click();
    const trisLow = await page.evaluate(
      () =>
        (
          window as unknown as {
            __SENKIRO_ROLLING_STOCK_TELEMETRY__?: { renderedTriangles: number };
          }
        ).__SENKIRO_ROLLING_STOCK_TELEMETRY__?.renderedTriangles ?? 0,
    );

    expect(trisHigh).toBeGreaterThan(trisMed);
    expect(trisMed).toBeGreaterThan(trisLow);
    expect(trisLow).toBeGreaterThan(100);

    // Restore High LOD & Verify GLB Binary Asset Cache
    await page.getByTestId('lod-btn-high').click();
    await page.getByTestId('verify-glb-btn').click();
    await expect(page.getByTestId('glb-inspection-panel')).toContainText('glTF 2.0 Binary (glTF)');

    await page.getByTestId('cam-preset-curve_overview').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '08-multi-car-curve-consist-overview.png'),
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
