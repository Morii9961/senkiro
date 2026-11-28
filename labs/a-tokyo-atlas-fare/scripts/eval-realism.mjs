#!/usr/bin/env node
/**
 * SENKIRO Tokyo Atlas 3D — Acceptance Scenes (A–H) & Performance Benchmark Script.
 *
 * Captures fixed-camera 1440x900 WebGL screenshots across Scenes A–H and records
 * FPS, avg/P95/P99 frame times, 1% low FPS, draw calls, triangles, loaded chunks,
 * real vs infill building counts, and JS heap usage.
 *
 * Usage:
 *   node scripts/eval-realism.mjs [baseline|after|label] [out-dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const stageLabel = process.argv[2] || 'baseline';
const outDir =
  process.argv[3] ||
  path.resolve(process.cwd(), '..', '..', 'artifacts', 'realism-upgrade', stageLabel);
const evalPort = Number(process.env.EVAL_PORT || 18499);
const baseUrl = process.env.EVAL_URL || `http://127.0.0.1:${evalPort}/`;

fs.mkdirSync(outDir, { recursive: true });

async function waitForHttp(url, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function startPreviewServer(port) {
  const isWin = process.platform === 'win32';
  return spawn(
    isWin ? 'cmd.exe' : 'npx',
    isWin
      ? ['/c', `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`]
      : ['vite', 'preview', '--host 127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

async function sampleTelemetry(page, sampleFrames = 45) {
  return page.evaluate(async (nFrames) => {
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let count = 0;
      const step = () => {
        const now = performance.now();
        if (count > 0) frames.push(now - last);
        last = now;
        count++;
        if (count <= nFrames) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    const sorted = [...frames].sort((a, b) => a - b);
    const sum = frames.reduce((a, b) => a + b, 0);
    const avgMs = sum / Math.max(1, frames.length);
    const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? avgMs;
    const p99Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? avgMs;
    const avgFps = Math.round((1000 / Math.max(0.1, avgMs)) * 10) / 10;
    const onePercentLowFps = Math.round((1000 / Math.max(0.1, p99Ms)) * 10) / 10;

    const metrics = window.__SENKIRO_3D_METRICS__ ?? null;
    const camera = window.__SENKIRO_3D_CAMERA__ ?? null;
    const mem = performance.memory
      ? Math.round((performance.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
      : null;

    return {
      avgFps,
      onePercentLowFps,
      avgFrameMs: Math.round(avgMs * 100) / 100,
      p95FrameMs: Math.round(p95Ms * 100) / 100,
      p99FrameMs: Math.round(p99Ms * 100) / 100,
      jsHeapMb: mem,
      metrics,
      camera,
    };
  }, sampleFrames);
}

async function setSceneView(page, { lon, lat, dist, polar, az, hour, targetY = 0, waitMs = 1500 }) {
  await page.evaluate(
    ({ lon, lat, dist, polar, az, hour, targetY }) => {
      const ctrl = window.__SENKIRO_3D_CTRL__;
      if (!ctrl) throw new Error('__SENKIRO_3D_CTRL__ not mounted');
      if (hour !== undefined) ctrl.setTimeOfDay(hour);
      ctrl.setCameraView(lon, lat, dist, polar, az, targetY);
    },
    { lon, lat, dist, polar, az, hour, targetY },
  );
  await page.waitForTimeout(waitMs);
}

async function capture(page, shots, label, cfg) {
  const perf = await sampleTelemetry(page);
  const shotPath = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: shotPath });
  const m = perf.metrics ?? {};
  const row = {
    label,
    ...cfg,
    ...perf,
    path: shotPath,
  };
  shots.push(row);
  console.log(
    `[${stageLabel}] ${label.padEnd(32)} FPS=${String(perf.avgFps).padEnd(5)} 1%Low=${String(perf.onePercentLowFps).padEnd(5)} P95=${String(perf.p95FrameMs).padEnd(5)}ms DC=${String(m.drawCalls ?? '?').padEnd(4)} Tris=${String(m.triangles ?? '?').padEnd(8)} Chunks=${m.loadedChunks ?? '?'} Bldgs=${m.renderedBuildings ?? '?'}`,
  );
}

async function main() {
  let serverProc = null;
  const alreadyRunning = await waitForHttp(baseUrl, 1200);
  if (!alreadyRunning && !process.env.EVAL_URL) {
    serverProc = startPreviewServer(evalPort);
    const ready = await waitForHttp(baseUrl, 20_000);
    if (!ready) {
      serverProc.kill();
      throw new Error(`Failed to start vite preview on ${baseUrl}`);
    }
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-webgl'],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const webglRenderer = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return 'unknown';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    const t0 = Date.now();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await page.waitForFunction(() => Boolean(window.__SENKIRO_3D_CTRL__));
    await page.waitForTimeout(2600);
    const initialLoadMs = Date.now() - t0;

    // Hide label clutter or collapse sidebar if needed for clean architectural evaluation
    const toggleSidebar = page.getByTestId('toggle-sidebar-btn');
    if ((await toggleSidebar.count()) > 0 && (await toggleSidebar.isVisible())) {
      await toggleSidebar.click();
      await page.waitForTimeout(300);
    }

    const shots = [];

    // Scene A: Tokyo Station & Marunouchi
    await setSceneView(page, { lon: 139.7655, lat: 35.6812, dist: 720, polar: 58, az: 28, hour: 13.0, waitMs: 1800 });
    await capture(page, shots, 'A1-tokyo-marunouchi-day', { scene: 'A', hour: 13.0 });

    await setSceneView(page, { lon: 139.7655, lat: 35.6812, dist: 720, polar: 58, az: 28, hour: 21.5, waitMs: 1100 });
    await capture(page, shots, 'A2-tokyo-marunouchi-night', { scene: 'A', hour: 21.5 });

    // Scene B: Nishi-Shinjuku Skyscrapers (Golden Hour + Blue Hour)
    await setSceneView(page, { lon: 139.6935, lat: 35.6895, dist: 850, polar: 62, az: -35, hour: 17.25, waitMs: 1800 });
    await capture(page, shots, 'B1-shinjuku-golden-hour', { scene: 'B', hour: 17.25 });

    await setSceneView(page, { lon: 139.6935, lat: 35.6895, dist: 850, polar: 62, az: -35, hour: 18.42, waitMs: 1100 });
    await capture(page, shots, 'B2-shinjuku-blue-hour', { scene: 'B', hour: 18.42 });

    // Scene C: Shinagawa & Tokyo Bay Waterfront
    await setSceneView(page, { lon: 139.7480, lat: 35.6260, dist: 1900, polar: 54, az: 128, hour: 13.5, waitMs: 1800 });
    await capture(page, shots, 'C1-shinagawa-bay-day', { scene: 'C', hour: 13.5 });

    await setSceneView(page, { lon: 139.7480, lat: 35.6260, dist: 1900, polar: 54, az: 128, hour: 17.25, waitMs: 1000 });
    await capture(page, shots, 'C2-shinagawa-bay-golden', { scene: 'C', hour: 17.25 });

    // Scene D: Setagaya / Suginami Low-Rise Residential
    await setSceneView(page, { lon: 139.6540, lat: 35.6620, dist: 680, polar: 56, az: -20, hour: 13.5, waitMs: 1800 });
    await capture(page, shots, 'D1-setagaya-residential-day', { scene: 'D', hour: 13.5 });

    // Scene E: Imperial Palace & Large Greenspace
    await setSceneView(page, { lon: 139.7530, lat: 35.6852, dist: 1350, polar: 52, az: -18, hour: 13.5, waitMs: 1800 });
    await capture(page, shots, 'E1-imperial-palace-day', { scene: 'E', hour: 13.5 });

    // Scene F: Tokyo 23 Wards & Outer Panorama
    await setSceneView(page, { lon: 139.7400, lat: 35.6815, dist: 8200, polar: 50, az: -16, hour: 14.0, waitMs: 2200 });
    await capture(page, shots, 'F1-tokyo23-panorama-day', { scene: 'F', hour: 14.0 });

    // Scene G: Full Time-of-Day Sequence (Marunouchi -> Tokyo Bay skyline)
    const todHours = [
      { id: 'G1-tod-morning-0645', hour: 6.75 },
      { id: 'G2-tod-noon-1300', hour: 13.0 },
      { id: 'G3-tod-golden-1715', hour: 17.25 },
      { id: 'G4-tod-sunset-1748', hour: 17.8 },
      { id: 'G5-tod-bluehour-1825', hour: 18.42 },
      { id: 'G6-tod-night-2130', hour: 21.5 },
    ];
    for (const step of todHours) {
      await setSceneView(page, {
        lon: 139.7560,
        lat: 35.6760,
        dist: 1350,
        polar: 64,
        az: 42,
        hour: step.hour,
        waitMs: 1100,
      });
      await capture(page, shots, step.id, { scene: 'G', hour: step.hour });
    }

    // Scene N: Nocturnal Panorama & Street-Level Acceptance Shots (22:30 JST, before train-follow mode)
    await setSceneView(page, { lon: 139.7480, lat: 35.6760, dist: 7600, polar: 56, az: -15, hour: 22.5, waitMs: 2200 });
    await capture(page, shots, 'N1-tokyo-panorama-night-2230', { scene: 'N', hour: 22.5 });

    await setSceneView(page, { lon: 139.7610, lat: 35.6730, dist: 1450, polar: 58, az: -32, hour: 22.5, waitMs: 1600 });
    await capture(page, shots, 'N2-ginza-marunouchi-night-2230', { scene: 'N', hour: 22.5 });

    await setSceneView(page, { lon: 139.7662, lat: 35.6808, dist: 560, polar: 56, az: 32, hour: 22.5, waitMs: 1400 });
    await capture(page, shots, 'N3-tokyo-station-night-2230', { scene: 'N', hour: 22.5 });

    // Scene U: Urban Fabric, Anti-Striping, Haneda/Ota, Port Architecture, Shinagawa & Edge-Fade Checks
    await setSceneView(page, { lon: 139.7920, lat: 35.6520, dist: 3400, polar: 52, az: -28, hour: 14.5, waitMs: 1800 });
    await capture(page, shots, 'U1-toyosu-koto-fabric-day', { scene: 'U', hour: 14.5 });

    await setSceneView(page, { lon: 139.7240, lat: 35.7360, dist: 4600, polar: 56, az: 24, hour: 14.5, waitMs: 1800 });
    await capture(page, shots, 'U2-ikebukuro-north-organic-day', { scene: 'U', hour: 14.5 });

    await setSceneView(page, { lon: 139.7420, lat: 35.5650, dist: 5800, polar: 54, az: 16, hour: 14.5, waitMs: 1800 });
    await capture(page, shots, 'U3-haneda-ota-corridor-day', { scene: 'U', hour: 14.5 });

    await setSceneView(page, { lon: 139.7680, lat: 35.6160, dist: 5200, polar: 54, az: 118, hour: 14.5, waitMs: 1800 });
    await capture(page, shots, 'U4-tokyobay-ports-day', { scene: 'U', hour: 14.5 });

    await setSceneView(page, { lon: 139.7395, lat: 35.6305, dist: 1550, polar: 56, az: 92, hour: 14.5, waitMs: 1500 });
    await capture(page, shots, 'U5-shinagawa-railyard-day', { scene: 'U', hour: 14.5 });

    await setSceneView(page, { lon: 139.8450, lat: 35.7350, dist: 6800, polar: 56, az: -125, hour: 14.5, waitMs: 1800 });
    await capture(page, shots, 'U6-northeast-23ward-fade-day', { scene: 'U', hour: 14.5 });

    await setSceneView(page, { lon: 139.8550, lat: 35.5350, dist: 14500, polar: 62, az: 148, hour: 14.5, waitMs: 1600 });
    await capture(page, shots, 'U7-tokyobay-horizon-dissolve-day', { scene: 'U', hour: 14.5 });

    // Scene H: Railway dynamic verification (Cutaway + Train Follow)
    await setSceneView(page, { lon: 139.7016, lat: 35.6580, dist: 650, polar: 60, az: -36, hour: 13.5, waitMs: 1200 });
    await page.evaluate(() => window.__SENKIRO_3D_CTRL__.setUnderground(true));
    await page.waitForTimeout(1000);
    await capture(page, shots, 'H1-shibuya-cutaway-rail', { scene: 'H', mode: 'cutaway' });

    await page.evaluate(() => window.__SENKIRO_3D_CTRL__.setUnderground(false));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__SENKIRO_3D_CTRL__.startTrainFollow());
    await page.waitForTimeout(1400);
    await capture(page, shots, 'H2-train-follow', { scene: 'H', mode: 'train_follow' });

    const report = {
      stage: stageLabel,
      timestamp: new Date().toISOString(),
      webglRenderer,
      initialLoadMs,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      consoleErrors,
      pageErrors,
      shots,
    };

    fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(report, null, 2));
    console.log(
      `\n[${stageLabel}] Complete. initialLoadMs=${initialLoadMs}ms ConsoleErrors=${consoleErrors.length} PageErrors=${pageErrors.length}`,
    );
    if (consoleErrors.length > 0) console.log('ConsoleErrors:', consoleErrors);
    if (pageErrors.length > 0) console.log('PageErrors:', pageErrors);
  } finally {
    if (browser) await browser.close();
    if (serverProc && serverProc.pid) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${serverProc.pid} /T /F`, { stdio: 'ignore' });
        } else {
          serverProc.kill('SIGTERM');
        }
      } catch {
        // already exited
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
