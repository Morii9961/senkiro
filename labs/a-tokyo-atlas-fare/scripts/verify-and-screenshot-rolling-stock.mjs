/**
 * Self-contained Rolling Stock 3D Studio E2E Verification & Real Screenshot Capture Script
 *
 * Starts Vite preview server on an available dynamic port (avoiding port 18473 collisions across
 * parallel Git worktrees), launches headless Chromium with WebGL enabled, verifies all acceptance
 * criteria, and captures 8 real running screenshots into `public/assets/rolling-stock/screenshots/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const screenshotDir = path.join(
  projectRoot,
  'public',
  'assets',
  'rolling-stock',
  'screenshots',
);

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const distDir = path.join(projectRoot, 'dist');

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };

  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });

    // Serve dist/ directly via Playwright CDP request interception (works 100% offline in sandbox!)
    await context.route('http://senkiro.local/**', async (route) => {
      const url = new URL(route.request().url());
      const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = path.join(distDir, decodeURIComponent(reqPath));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const body = fs.readFileSync(filePath);
        await route.fulfill({
          status: 200,
          contentType: mimeTypes[ext] || 'application/octet-stream',
          body,
        });
      } else {
        await route.fulfill({ status: 404, body: 'Not Found' });
      }
    });

    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('http://senkiro.local/rolling-stock-preview.html', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.getByTestId('rolling-stock-3d-canvas').waitFor({ state: 'visible' });

    await page.waitForFunction(() => {
      const t = window.__SENKIRO_ROLLING_STOCK_TELEMETRY__;
      return Boolean(t && t.renderedTriangles > 15000 && t.drawCalls > 10);
    });

    const initialTelemetry = await page.evaluate(
      () => window.__SENKIRO_ROLLING_STOCK_TELEMETRY__,
    );
    console.log(
      `[RollingStock E2E] Initial 3-Series Lineup Telemetry: DC=${initialTelemetry.drawCalls}, Tris=${initialTelemetry.renderedTriangles}`,
    );

    // Screenshot 1: 3-Series Front Cab Lineup
    await page.getByTestId('cam-preset-lineup_front').click();
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(screenshotDir, '01-three-series-front-lineup.png'),
    });
    console.log('[RollingStock E2E] Captured 01-three-series-front-lineup.png');

    // Screenshot 2: 3-Series Side Proportions & Livery Lineup
    await page.getByTestId('cam-preset-lineup_side').click();
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(screenshotDir, '02-three-series-side-proportions.png'),
    });
    console.log('[RollingStock E2E] Captured 02-three-series-side-proportions.png');

    // Screenshot 3: Far-Distance Distinctness Verification (150m+)
    await page.getByTestId('cam-preset-lineup_far').click();
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(screenshotDir, '03-three-series-far-distance.png'),
    });
    console.log('[RollingStock E2E] Captured 03-three-series-far-distance.png');

    // Screenshot 4: JR East E235-0 (Yamanote Line) Close-Up with Doors Open
    await page.getByTestId('mode-single-focus').click();
    await page.getByTestId('select-series-jr-east-e235-0').click();
    await page.getByTestId('toggle-both-doors').click();
    await page.waitForFunction(() => {
      const t = window.__SENKIRO_ROLLING_STOCK_TELEMETRY__;
      return Boolean(t && t.leftDoorProgress >= 0.99 && t.rightDoorProgress >= 0.99);
    });
    await page.getByTestId('cam-preset-cab_closeup').click();
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(screenshotDir, '04-e235-yamanote-closeup-doors-open.png'),
    });
    console.log('[RollingStock E2E] Captured 04-e235-yamanote-closeup-doors-open.png');

    // Close doors back
    await page.getByTestId('toggle-both-doors').click();
    await page.waitForFunction(() => {
      const t = window.__SENKIRO_ROLLING_STOCK_TELEMETRY__;
      return Boolean(t && t.leftDoorProgress <= 0.01 && t.rightDoorProgress <= 0.01);
    });

    // Screenshot 5: Tokyo Metro 1000 Series (Ginza Line — 16m, 3 doors, Lemon Yellow + Maroon Roof, Third-Rail Shoes)
    await page.getByTestId('select-series-tokyo-metro-1000').click();
    await page.getByTestId('car-count-btn-6').click();
    await page.getByTestId('cam-preset-cab_closeup').click();
    await page.waitForTimeout(450);
    const specCardText1000 = await page.getByTestId('spec-credibility-card').innerText();
    assert(specCardText1000.includes('1000系'), 'Spec card should display 1000 Series');
    assert(
      specCardText1000.includes('16.00m × 2.550m'),
      'Spec card should show 16.00m × 2.550m dimensions',
    );
    await page.screenshot({
      path: path.join(screenshotDir, '05-metro1000-ginza-closeup-third-rail.png'),
    });
    console.log('[RollingStock E2E] Captured 05-metro1000-ginza-closeup-third-rail.png');

    // Screenshot 6: Tokyo Metro 17000 Series (Yurakucho & Fukutoshin Lines — Aero Sloped Front & Round Headlights on S-Curve)
    await page.getByTestId('select-series-tokyo-metro-17000').click();
    await page.getByTestId('car-count-btn-6').click();
    await page.getByTestId('track-kind-s_curve').click();
    await page.getByTestId('cam-preset-cab_closeup').click();
    await page.waitForTimeout(450);
    const specCardText17000 = await page.getByTestId('spec-credibility-card').innerText();
    assert(specCardText17000.includes('17000系'), 'Spec card should display 17000 Series');
    assert(
      specCardText17000.includes('20.00m × 2.800m'),
      'Spec card should show 20.00m × 2.800m dimensions',
    );
    await page.screenshot({
      path: path.join(screenshotDir, '06-metro17000-yurakucho-fukutoshin-curve.png'),
    });
    console.log('[RollingStock E2E] Captured 06-metro17000-yurakucho-fukutoshin-curve.png');

    // Screenshot 7: Night Mode + Travel Direction Reversed (Tail Car activates White Headlights, Front Car Red Taillights + Cabin Glow)
    await page.getByTestId('studio-theme-toggle').click();
    await page.getByTestId('toggle-travel-direction').click();
    await page.getByTestId('cam-preset-rear_tail').click();
    await page.waitForTimeout(450);

    const nightState = await page.evaluate(() => window.__SENKIRO_ROLLING_STOCK_TELEMETRY__);
    assert(nightState.travelDirection === 'reverse', 'Travel direction should be reverse');
    assert(nightState.interiorLightsOn === true, 'Interior lights should be ON in night mode');

    await page.screenshot({
      path: path.join(screenshotDir, '07-night-mode-direction-reversed-lights.png'),
    });
    console.log('[RollingStock E2E] Captured 07-night-mode-direction-reversed-lights.png');

    // Restore Day Mode & Forward Direction
    await page.getByTestId('studio-theme-toggle').click();
    await page.getByTestId('toggle-travel-direction').click();

    // Verify 3-Tier LOD Switching (High -> Medium -> Low)
    await page.getByTestId('lod-btn-high').click();
    await page.waitForTimeout(200);
    const trisHigh = await page.evaluate(
      () => window.__SENKIRO_ROLLING_STOCK_TELEMETRY__.renderedTriangles,
    );

    await page.getByTestId('lod-btn-medium').click();
    await page.waitForTimeout(200);
    const trisMed = await page.evaluate(
      () => window.__SENKIRO_ROLLING_STOCK_TELEMETRY__.renderedTriangles,
    );

    await page.getByTestId('lod-btn-low').click();
    await page.waitForTimeout(200);
    const trisLow = await page.evaluate(
      () => window.__SENKIRO_ROLLING_STOCK_TELEMETRY__.renderedTriangles,
    );

    console.log(
      `[RollingStock E2E] 6-Car 17000 Series LOD Triangles: LOD0(High)=${trisHigh}, LOD1(Medium)=${trisMed}, LOD2(Low)=${trisLow}`,
    );
    assert(trisHigh > trisMed && trisMed > trisLow, 'LOD triangle counts must strictly decrease');

    // Restore High LOD, Verify GLB Binary Asset Cache & Capture Multi-Car S-Curve Overview
    await page.getByTestId('lod-btn-high').click();
    await page.getByTestId('verify-glb-btn').click();
    await page.waitForTimeout(300);
    const glbText = await page.getByTestId('glb-inspection-panel').innerText();
    assert(glbText.includes('glTF 2.0 Binary (glTF)'), 'GLB binary inspection must succeed');

    await page.getByTestId('cam-preset-curve_overview').click();
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(screenshotDir, '08-multi-car-curve-consist-overview.png'),
    });
    console.log('[RollingStock E2E] Captured 08-multi-car-curve-consist-overview.png');

    assert(consoleErrors.length === 0, `Console errors found: ${consoleErrors.join('; ')}`);
    assert(pageErrors.length === 0, `Page errors found: ${pageErrors.join('; ')}`);

    console.log('[RollingStock E2E] ALL E2E CHECKS & 8 SCREENSHOTS PASSED WITH ZERO ERRORS!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
