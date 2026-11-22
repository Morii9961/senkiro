#!/usr/bin/env node
/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Automated Integration, Performance &
 * Underground Virtual Train Demo Capture Script (Playwright + Chromium).
 *
 * Captures:
 *  1. Core metropolitan surface & night hubs (Overview, Shibuya, Shinjuku, Tokyo, Shinagawa, Ikebukuro)
 *  2. Underground cutaway hubs (Shibuya, Shinjuku, Tokyo/Otemachi)
 *  3. Underground Virtual Train Run Demonstration sequence (multi-frame progression + telemetry)
 *  4. Real FPS, Draw Calls, Triangles, active train counts, console/page error counts
 *
 * Usage:
 *   EVAL_URL=http://127.0.0.1:18473/ node scripts/eval-v2.mjs <label> [out-dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const stageLabel = process.argv[2] || 'v2-integration';
const outDir =
  process.argv[3] ||
  path.resolve(process.cwd(), 'eval-output', stageLabel);
const baseUrl = process.env.EVAL_URL || 'http://127.0.0.1:18473/';

fs.mkdirSync(outDir, { recursive: true });

async function samplePerformance(page) {
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
    return { fps, telemetryText, metrics, camera };
  });
}

async function main() {
  const browser = await chromium.launch({
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
  await page.waitForTimeout(2600);
  const initialLoadMs = Date.now() - t0;

  const views = [
    { id: 'tokyo23', label: '01-overview-day', underground: false, night: false },
    { id: 'shibuya', label: '02-shibuya-surface', underground: false, night: false },
    { id: 'shibuya', label: '03-shibuya-underground', underground: true, night: false },
    { id: 'shinjuku', label: '04-shinjuku-surface', underground: false, night: false },
    { id: 'shinjuku', label: '05-shinjuku-underground', underground: true, night: false },
    { id: 'tokyo', label: '06-tokyo-otemachi-underground', underground: true, night: false },
    { id: 'shinjuku', label: '07-shinjuku-night', underground: false, night: true },
  ];

  const report = {
    stage: stageLabel,
    timestamp: new Date().toISOString(),
    initialLoadMs,
    consoleErrors,
    pageErrors,
    shots: [],
    undergroundTrainDemo: [],
  };

  for (const v of views) {
    await page.getByTestId(`hub-btn-${v.id}`).click();
    await page.waitForTimeout(1400);

    const ugBtn = page.getByTestId('toggle-underground-view');
    const isOn = (await ugBtn.textContent())?.includes('ON');
    if (v.underground !== isOn) {
      await ugBtn.click();
      await page.waitForTimeout(600);
    }

    const dnBtn = page.getByTestId('toggle-3d-day-night');
    const isCurrentlyNight =
      (await dnBtn.textContent())?.includes('昼間') ||
      (await dnBtn.textContent())?.includes('Day');
    if (v.night !== isCurrentlyNight) {
      await dnBtn.click();
      await page.waitForTimeout(500);
    }

    const perf = await samplePerformance(page);
    const shotPath = path.join(outDir, `${v.label}.png`);
    await page.screenshot({ path: shotPath });
    report.shots.push({ label: v.label, path: shotPath, ...perf });
    console.log(
      `[${stageLabel}] ${v.label.padEnd(30)} FPS=${perf.fps} DC=${perf.metrics?.drawCalls ?? '?'} Tris=${perf.metrics?.triangles ?? '?'} Trains=${perf.metrics?.activeTrains ?? 0}`,
    );
  }

  // Optional v2.0 Underground Virtual Train Run Demo (triggers automatically when UI exposes demo button)
  const demoBtn = page.locator('[data-testid="start-underground-train-demo"]');
  if ((await demoBtn.count()) > 0) {
    // Switch back to daytime for crisp underground lighting contrast
    const dnBtn = page.getByTestId('toggle-3d-day-night');
    const isCurrentlyNight =
      (await dnBtn.textContent())?.includes('昼間') ||
      (await dnBtn.textContent())?.includes('Day');
    if (isCurrentlyNight) {
      await dnBtn.click();
      await page.waitForTimeout(400);
    }

    await demoBtn.first().click();
    for (let step = 1; step <= 4; step++) {
      await page.waitForTimeout(1500);
      const perf = await samplePerformance(page);
      const shotPath = path.join(outDir, `08-underground-train-demo-step${step}.png`);
      await page.screenshot({ path: shotPath });
      report.undergroundTrainDemo.push({ step, path: shotPath, ...perf });
      console.log(
        `[${stageLabel}] demo-step-${step} FPS=${perf.fps} Trains=${perf.metrics?.activeTrains ?? 0} UG=${perf.metrics?.undergroundTrains ?? 0} Mode=${perf.metrics?.cameraModeV2 ?? '?'}`,
      );
    }
  }

  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(report, null, 2));
  await browser.close();

  console.log(
    `\n[${stageLabel}] Complete. initialLoadMs=${initialLoadMs}ms ConsoleErrors=${consoleErrors.length} PageErrors=${pageErrors.length}`,
  );
  if (consoleErrors.length > 0) console.log('ConsoleErrors:', consoleErrors);
  if (pageErrors.length > 0) console.log('PageErrors:', pageErrors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
