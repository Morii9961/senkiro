#!/usr/bin/env node
/**
 * Automated 3D Stage Visual & Performance Evaluation Script (Playwright + Chromium).
 * Captures real screenshots & performance telemetry across all 5 core Tokyo hubs
 * (Shibuya, Shinjuku, Tokyo, Shinagawa, Ikebukuro) + Tokyo 23 overview + Underground Cutaway.
 *
 * Usage: node scripts/eval-stage.mjs <stage-name> [out-dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const stageName = process.argv[2] || 'baseline';
const outDir =
  process.argv[3] ||
  path.resolve(
    'C:/Users/Morii/.gemini/antigravity/brain/b0691ced-9f0b-4b87-b0dc-4a2e55391ba5/scratch/eval',
    stageName,
  );
const baseUrl = process.env.EVAL_URL || 'http://127.0.0.1:18473/';

fs.mkdirSync(outDir, { recursive: true });

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

  const hubs = [
    { id: 'tokyo23', label: 'overview', underground: false, night: false },
    { id: 'shibuya', label: 'shibuya-surface', underground: false, night: false },
    { id: 'shibuya', label: 'shibuya-underground', underground: true, night: false },
    { id: 'shinjuku', label: 'shinjuku-surface', underground: false, night: false },
    { id: 'shinjuku', label: 'shinjuku-underground', underground: true, night: false },
    { id: 'tokyo', label: 'tokyo-surface', underground: false, night: false },
    { id: 'tokyo', label: 'tokyo-underground', underground: true, night: false },
    { id: 'shinagawa', label: 'shinagawa-surface', underground: false, night: false },
    { id: 'ikebukuro', label: 'ikebukuro-surface', underground: false, night: false },
    { id: 'shinjuku', label: 'shinjuku-night', underground: false, night: true },
  ];

  const report = {
    stage: stageName,
    timestamp: new Date().toISOString(),
    initialLoadMs,
    consoleErrors,
    pageErrors,
    shots: [],
  };

  // Collapse underground HUD for clear screenshots when needed
  for (const h of hubs) {
    await page.getByTestId(`hub-btn-${h.id}`).click();
    await page.waitForTimeout(1600);

    // Ensure underground mode & night lighting match target
    const ugBtn = page.getByTestId('toggle-underground-view');
    const isOn = (await ugBtn.textContent())?.includes('ON');
    if (h.underground && !isOn) {
      await ugBtn.click();
      await page.waitForTimeout(700);
    } else if (!h.underground && isOn) {
      await ugBtn.click();
      await page.waitForTimeout(700);
    }

    const dnBtn = page.getByTestId('toggle-3d-day-night');
    const isCurrentlyNight = (await dnBtn.textContent())?.includes('昼間') || (await dnBtn.textContent())?.includes('Day');
    if (h.night !== isCurrentlyNight) {
      await dnBtn.click();
      await page.waitForTimeout(500);
    }

    // Measure live FPS & Three.js render info if exposed
    const metrics = await page.evaluate(async () => {
      const frames = [];
      let last = performance.now();
      await new Promise((resolve) => {
        let count = 0;
        const step = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          count++;
          if (count < 12) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      const avgMs = frames.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, frames.length - 1);
      const fps = Math.round((1000 / Math.max(1, avgMs)) * 10) / 10;
      const telemetryText =
        document.querySelector('[data-testid="three-telemetry"]')?.textContent ?? '';
      const debugMetrics = window.__SENKIRO_3D_METRICS__ ?? null;
      return { fps, telemetryText, debugMetrics };
    });

    const shotPath = path.join(outDir, `${h.label}.png`);
    await page.screenshot({ path: shotPath });
    report.shots.push({ label: h.label, path: shotPath, ...metrics });
    console.log(
      `[${stageName}] ${h.label.padEnd(22)} FPS=${metrics.fps} ${metrics.telemetryText}`,
    );
  }

  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(report, null, 2));
  await browser.close();

  console.log(`\nStage "${stageName}" eval complete. Console errors: ${consoleErrors.length}, Page errors: ${pageErrors.length}`);
  if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
