#!/usr/bin/env node
/**
 * SENKIRO Atlas v2 — Underground Railway Geometry & Tunnel System Visual & Performance Verification.
 *
 * Launches a local preview server + Headless Chrome (WebGL SwiftShader), enters curated tunnel
 * interiors, station caverns, circular shield bores, open portals, and roof-cutaway views,
 * records real GPU/FPS/chunk telemetry, and saves high-res screenshots for visual inspection.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const outDir =
  process.argv[2] ||
  path.resolve(
    'C:/Users/Morii/.gemini/antigravity/brain/7a7215d7-b894-4026-9adf-e0ad34f0ee14/underground_shots',
  );
const port = Number(process.env.EVAL_PORT || 18479);
const baseUrl = `http://127.0.0.1:${port}/`;

fs.mkdirSync(outDir, { recursive: true });

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

async function sampleMetrics(page) {
  return page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let count = 0;
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        count++;
        if (count < 10) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const avgMs = frames.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, frames.length - 1);
    const fps = Math.round((1000 / Math.max(1, avgMs)) * 10) / 10;
    const metrics = window.__SENKIRO_3D_METRICS__ ?? null;
    const cam = window.__SENKIRO_3D_CAMERA__ ?? null;
    const ug = window.__SENKIRO_UNDERGROUND__?.api.getTelemetry() ?? null;
    return { fps, metrics, cam, ug };
  });
}

async function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const viteBin = path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stderr.on('data', (d) => process.stderr.write(d));

  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await page.waitForTimeout(2400);

    const shots = [];

    // 0. Surface baseline (verify underground chunks are 100% culled!)
    const surfMetrics = await sampleMetrics(page);
    shots.push({ label: '00-surface-baseline', ...surfMetrics });
    console.log(
      `[00-surface-baseline] FPS=${surfMetrics.fps} DC=${surfMetrics.metrics?.drawCalls} Tris=${Math.round((surfMetrics.metrics?.triangles ?? 0) / 1000)}k ugVis=${surfMetrics.ug?.visibleTunnelChunks}`,
    );

    // 1. Shibuya Underground Cutaway Overview (neutral solid concrete outer shells, zero translucent colored tubes)
    await page.getByTestId('hub-btn-shibuya').click();
    await page.waitForTimeout(1500);
    const ugBtn = page.getByTestId('toggle-underground-view');
    if (!(await ugBtn.textContent())?.includes('ON')) {
      await ugBtn.click();
      await page.waitForTimeout(700);
    }
    const m1 = await sampleMetrics(page);
    const p1 = path.join(outDir, '01-shibuya-cutaway-overview.png');
    await page.screenshot({ path: p1 });
    shots.push({ label: '01-shibuya-cutaway-overview', path: p1, ...m1 });
    console.log(
      `[01-shibuya-cutaway]  FPS=${m1.fps} DC=${m1.metrics?.drawCalls} Tris=${Math.round((m1.metrics?.triangles ?? 0) / 1000)}k visChunks=${m1.ug?.visibleTunnelChunks} caverns=${m1.ug?.visibleStationCaverns}`,
    );

    // 2. Ginza Line Box Tunnel Interior (Shibuya -> Omotesando)
    await page.getByTestId('tunnel-viewpoint-select').selectOption('ginza-box-interior');
    await page.waitForTimeout(1000);
    const m2 = await sampleMetrics(page);
    const p2 = path.join(outDir, '02-ginza-box-interior.png');
    await page.screenshot({ path: p2 });
    shots.push({ label: '02-ginza-box-interior', path: p2, ...m2 });
    console.log(
      `[02-ginza-box-int]    FPS=${m2.fps} DC=${m2.metrics?.drawCalls} Tris=${Math.round((m2.metrics?.triangles ?? 0) / 1000)}k det=${m2.ug?.detailedInteriorChunks} lights=${m2.ug?.activePointLights}`,
    );

    // 3. Omotesando Underground Station Cavern (Ginza Line widened platforms)
    await page.getByTestId('tunnel-viewpoint-select').selectOption('ginza-omotesando-station');
    await page.waitForTimeout(1000);
    const m3 = await sampleMetrics(page);
    const p3 = path.join(outDir, '03-ginza-omotesando-station.png');
    await page.screenshot({ path: p3 });
    shots.push({ label: '03-ginza-omotesando-station', path: p3, ...m3 });
    console.log(
      `[03-omotesando-stn]   FPS=${m3.fps} DC=${m3.metrics?.drawCalls} Tris=${Math.round((m3.metrics?.triangles ?? 0) / 1000)}k caverns=${m3.ug?.visibleStationCaverns} lights=${m3.ug?.activePointLights}`,
    );

    // 4. Fukutoshin Circular Shield Tunnel Interior (L-3 -30m, rigid catenary + precast rings)
    await page.getByTestId('tunnel-viewpoint-select').selectOption('fukutoshin-shield-interior');
    await page.waitForTimeout(1000);
    const m4 = await sampleMetrics(page);
    const p4 = path.join(outDir, '04-fukutoshin-shield-interior.png');
    await page.screenshot({ path: p4 });
    shots.push({ label: '04-fukutoshin-shield-interior', path: p4, ...m4 });
    console.log(
      `[04-fukutoshin-shld]  FPS=${m4.fps} DC=${m4.metrics?.drawCalls} Tris=${Math.round((m4.metrics?.triangles ?? 0) / 1000)}k det=${m4.ug?.detailedInteriorChunks} lights=${m4.ug?.activePointLights}`,
    );

    // 5. Ginza Line Shibuya Portal Entry (Viaduct/Surface -> Open Concrete Portal -> Tunnel)
    await page.getByTestId('tunnel-viewpoint-select').selectOption('ginza-shibuya-portal');
    await page.waitForTimeout(1000);
    const m5 = await sampleMetrics(page);
    const p5 = path.join(outDir, '05-ginza-shibuya-portal.png');
    await page.screenshot({ path: p5 });
    shots.push({ label: '05-ginza-shibuya-portal', path: p5, ...m5 });
    console.log(
      `[05-shibuya-portal]   FPS=${m5.fps} DC=${m5.metrics?.drawCalls} Tris=${Math.round((m5.metrics?.triangles ?? 0) / 1000)}k portals=${m5.ug?.portalCount}`,
    );

    // 6. Roof Cutaway + Independent Line Color Info Overlay (elevated oblique look into open Omotesando station & Ginza tunnel)
    await page.getByTestId('tunnel-roof-cutaway-checkbox').check();
    await page.getByTestId('line-color-overlay-checkbox').check();
    await page.evaluate(() => {
      const api = window.__SENKIRO_UNDERGROUND__?.api;
      const vp = api?.getCuratedViewpoints().find((v) => v.id === 'ginza-omotesando-station');
      if (vp) {
        window.__SENKIRO_UNDERGROUND__.setCameraPose(
          [vp.position.x + 18, vp.position.y + 22, vp.position.z + 24],
          [vp.lookAt.x, vp.lookAt.y - 1.5, vp.lookAt.z],
          0.35,
        );
      }
    });
    await page.waitForTimeout(1000);
    const m6 = await sampleMetrics(page);
    const p6 = path.join(outDir, '06-roof-cutaway-line-overlay.png');
    await page.screenshot({ path: p6 });
    shots.push({ label: '06-roof-cutaway-line-overlay', path: p6, ...m6 });
    console.log(
      `[06-roof-cutaway]     FPS=${m6.fps} DC=${m6.metrics?.drawCalls} Tris=${Math.round((m6.metrics?.triangles ?? 0) / 1000)}k roofCut=${m6.ug?.roofCutawayActive} overlay=${m6.ug?.lineOverlayVisible}`,
    );

    // 7. Marunouchi Box Tunnel Interior (Tokyo -> Otemachi, neutral realistic mode restored)
    await page.getByTestId('tunnel-roof-cutaway-checkbox').uncheck();
    await page.getByTestId('line-color-overlay-checkbox').uncheck();
    await page.getByTestId('tunnel-viewpoint-select').selectOption('marunouchi-tokyo-otemachi');
    await page.waitForTimeout(1000);
    const m7 = await sampleMetrics(page);
    const p7 = path.join(outDir, '07-marunouchi-tokyo-otemachi.png');
    await page.screenshot({ path: p7 });
    shots.push({ label: '07-marunouchi-tokyo-otemachi', path: p7, ...m7 });
    console.log(
      `[07-marunouchi-int]   FPS=${m7.fps} DC=${m7.metrics?.drawCalls} Tris=${Math.round((m7.metrics?.triangles ?? 0) / 1000)}k det=${m7.ug?.detailedInteriorChunks} lights=${m7.ug?.activePointLights}`,
    );

    const summary = {
      timestamp: new Date().toISOString(),
      consoleErrors,
      pageErrors,
      shots,
    };
    fs.writeFileSync(path.join(outDir, 'underground-metrics.json'), JSON.stringify(summary, null, 2));
    console.log(
      `\nUnderground visual eval complete! Console errors: ${consoleErrors.length}, Page errors: ${pageErrors.length}`,
    );
    if (consoleErrors.length) console.log('Console errors:', consoleErrors);
    if (pageErrors.length) console.log('Page errors:', pageErrors);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
