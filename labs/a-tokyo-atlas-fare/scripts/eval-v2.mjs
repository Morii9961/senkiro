#!/usr/bin/env node
/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Automated Full-Stack Integration, Performance &
 * Underground Virtual Train Run Demonstration Script (Playwright + Chromium).
 *
 * Launches (or connects to) `vite preview` and captures real 1440×900 WebGL screenshots,
 * Three.js render telemetry (FPS, Draw Calls, Triangles, Active Trains, Rendered Cars),
 * DOM label bounding-box overlap verification, and a 5-step Underground Virtual Train
 * Run Demonstration sequence (chase -> side -> cab inside opaque tunnel -> advance -> surface exit).
 *
 * Usage:
 *   node scripts/eval-v2.mjs [stage-label] [out-dir]
 *   EVAL_PORT=18489 node scripts/eval-v2.mjs wave4-integration
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const stageLabel = process.argv[2] || 'v2-integration';
const outDir = process.argv[3] || path.resolve(process.cwd(), 'artifacts', 'eval-v2', stageLabel);
const evalPort = Number(process.env.EVAL_PORT || 18489);
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
  const child = spawn(
    isWin ? 'cmd.exe' : 'npx',
    isWin
      ? ['/c', `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`]
      : ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return child;
}

async function sampleTelemetry(page) {
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
    const telemetryText =
      document.querySelector('[data-testid="three-telemetry"]')?.textContent ?? '';
    const metrics = window.__SENKIRO_3D_METRICS__ ?? null;
    const camera = window.__SENKIRO_3D_CAMERA__ ?? null;

    // Check DOM label bounding-box overlap count
    const labelEls = Array.from(document.querySelectorAll('[data-testid^="map-label-"]'));
    const boxes = labelEls
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 1 && r.height > 1);
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
          overlaps++;
        }
      }
    }

    return {
      fps,
      telemetryText,
      metrics,
      camera,
      visibleLabelCount: boxes.length,
      labelOverlaps: overlaps,
    };
  });
}

async function ensureDaylight(page, wantNight) {
  const dnBtn = page.getByTestId('toggle-3d-day-night');
  const txt = (await dnBtn.textContent()) ?? '';
  const isCurrentlyNight = txt.includes('昼間') || txt.includes('Day');
  if (wantNight !== isCurrentlyNight) {
    await dnBtn.click();
    await page.waitForTimeout(450);
  }
}

async function capture(page, reportList, label, meta = {}) {
  const perf = await sampleTelemetry(page);
  const shotPath = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: shotPath });
  const entry = { label, path: shotPath, ...meta, ...perf };
  reportList.push(entry);
  const m = perf.metrics ?? {};
  console.log(
    `[${stageLabel}] ${label.padEnd(36)} FPS=${String(perf.fps).padEnd(5)} DC=${String(m.drawCalls ?? '?').padEnd(4)} Tris=${String(m.triangles ?? '?').padEnd(8)} Trains=${m.activeTrains ?? 0}(UG:${m.undergroundTrains ?? 0}) Cars=${m.rollingStockCars ?? 0} Labels=${perf.visibleLabelCount}(ov:${perf.labelOverlaps}) CamY=${perf.camera?.pos?.[1] ?? '?'}`,
  );
  return entry;
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

    const t0 = Date.now();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('view-mode-3d').click();
    await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
    await page.waitForTimeout(2800);
    const initialLoadMs = Date.now() - t0;

    const report = {
      stage: stageLabel,
      timestamp: new Date().toISOString(),
      initialLoadMs,
      consoleErrors,
      pageErrors,
      shots: [],
      undergroundTrainDemo: [],
    };

    // 1. Tokyo 23-ward City Overview (Day)
    await ensureDaylight(page, false);
    await page.getByTestId('mode-btn-city_overview').click();
    await page.getByTestId('hub-btn-tokyo23').click();
    await page.waitForTimeout(1600);
    await capture(page, report.shots, '01-city-overview-day');

    // 2. Shibuya Surface Hub
    await page.getByTestId('hub-btn-shibuya').click();
    await page.waitForTimeout(1400);
    // Ensure surface mode (hub-btn-shibuya may activate cutaway automatically)
    const retBtn = page.getByTestId('return-to-surface-btn');
    if ((await retBtn.count()) > 0 && (await retBtn.isVisible())) {
      await retBtn.click();
      await page.waitForTimeout(600);
    }
    await capture(page, report.shots, '02-shibuya-surface');

    // 3. Shibuya Underground Cutaway (Dual-Surface Tunnels + Station Caverns + Live Subway Trains)
    await page.getByTestId('mode-btn-underground_cutaway').click();
    await page.waitForTimeout(1200);
    await capture(page, report.shots, '03-shibuya-underground-cutaway');

    // 4. Tokyo & Otemachi Underground Cutaway (Section Cutaway Roof Open)
    await page.getByTestId('hub-btn-tokyo').click();
    await page.waitForTimeout(1300);
    const styleSel = page.getByTestId('tunnel-cutaway-style-select');
    if ((await styleSel.count()) > 0) {
      await styleSel.selectOption('section_cutaway');
      await page.waitForTimeout(700);
    }
    await capture(page, report.shots, '04-tokyo-otemachi-section-cutaway');
    if ((await styleSel.count()) > 0) {
      await styleSel.selectOption('translucent_shell');
      await page.waitForTimeout(300);
    }

    // 5. Underground Explorer (Inside Dual-Surface Concrete Tunnel + PointLight Pool)
    await page.getByTestId('hub-btn-shibuya').click();
    await page.waitForTimeout(900);
    await page.getByTestId('mode-btn-underground_explorer').click();
    await page.waitForTimeout(1500);
    await capture(page, report.shots, '05-underground-explorer-interior');

    // Return cleanly to surface
    await page.getByTestId('explorer-return-surface-btn').click();
    await page.waitForTimeout(900);

    // 6. Shinjuku Street-Level View (Day)
    await page.getByTestId('hub-btn-shinjuku').click();
    await page.waitForTimeout(1100);
    await page.getByTestId('mode-btn-street_level').click();
    await page.waitForTimeout(1200);
    await capture(page, report.shots, '06-shinjuku-street-level');

    // 7. Shinjuku Night View (Overview / Hub angle with lit train cabins & skyscrapers)
    await page.getByTestId('mode-btn-city_overview').click();
    await page.waitForTimeout(700);
    await page.getByTestId('hub-btn-shinjuku').click();
    await page.waitForTimeout(1000);
    await ensureDaylight(page, true);
    await page.waitForTimeout(700);
    await capture(page, report.shots, '07-shinjuku-night');

    // =========================================================================
    // 8-12. COMPLETE UNDERGROUND VIRTUAL TRAIN RUN DEMONSTRATION (5 STEPS)
    // =========================================================================
    await ensureDaylight(page, false);
    await page.getByTestId('sim-speed-select').selectOption('2');
    await page.waitForTimeout(400);

    // Pick a genuine underground subway train from SimulationPanel's train picker
    const trainSelect = page.getByTestId('sim-train-select');
    const chosenTrain = await trainSelect.evaluate((sel) => {
      const opts = Array.from(sel.options);
      // Prefer Marunouchi, Fukutoshin, Oedo, Hanzomon, Ginza, Chiyoda underground trains
      const preferred =
        opts.find((o) => /丸ノ内|Marunouchi|副都心|Fukutoshin|大江戸|Oedo|半蔵門|Hanzomon|銀座|Ginza|千代田|Chiyoda/i.test(o.text)) ||
        opts.find((o) => /UG|地下|L-/i.test(o.text)) ||
        opts[0];
      return preferred ? { value: preferred.value, label: preferred.text } : null;
    });

    if (chosenTrain && chosenTrain.value) {
      await trainSelect.selectOption(chosenTrain.value);
      await page.waitForTimeout(400);
      await page.getByTestId('sim-follow-btn').click();
      await page.waitForTimeout(1400);
      await capture(page, report.undergroundTrainDemo, '08-ug-train-demo-1-side', {
        train: chosenTrain,
        rig: 'side',
      });

      // Switch to Chase rig (observe trailing multi-car consist inside tunnel cutaway)
      const chaseRigBtn = page.getByTestId('follow-angle-chase');
      if ((await chaseRigBtn.count()) > 0) {
        await chaseRigBtn.click();
      }
      await page.waitForTimeout(1800);
      await capture(page, report.undergroundTrainDemo, '09-ug-train-demo-2-chase', {
        train: chosenTrain,
        rig: 'chase',
      });

      // Switch to Cab Ride POV (rigidly mounted +0.75m ahead of front nose inside lit concrete tunnel!)
      const cabRigBtn = page.getByTestId('follow-angle-cab');
      if ((await cabRigBtn.count()) > 0) {
        await cabRigBtn.click();
      }
      await page.waitForTimeout(1600);
      await capture(page, report.undergroundTrainDemo, '10-ug-train-demo-3-cab-t0', {
        train: chosenTrain,
        rig: 'cab',
      });

      // Advance 2.5s in Cab Ride POV to verify real continuous tunnel travel
      await page.waitForTimeout(2500);
      await capture(page, report.undergroundTrainDemo, '11-ug-train-demo-4-cab-t1', {
        train: chosenTrain,
        rig: 'cab',
      });

      // Exit Follow & Return cleanly to Central Tokyo Surface Overview
      await page.getByTestId('sim-exit-follow-btn').click();
      await page.waitForTimeout(400);
      await page.getByTestId('hub-btn-tokyo23').click();
      await page.getByTestId('mode-btn-city_overview').click();
      await page.waitForTimeout(1100);
      await capture(page, report.undergroundTrainDemo, '12-ug-train-demo-5-surface-exit', {
        train: chosenTrain,
        rig: 'surface_exit',
      });
    }

    fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(report, null, 2));
    console.log(
      `\n[${stageLabel}] Complete. initialLoadMs=${initialLoadMs}ms ConsoleErrors=${consoleErrors.length} PageErrors=${pageErrors.length} OutDir=${outDir}`,
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
