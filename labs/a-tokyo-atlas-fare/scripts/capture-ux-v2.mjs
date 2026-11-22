#!/usr/bin/env node
/**
 * Real Browser WebGL Screenshot & UX Audit Script for SENKIRO Atlas v2 (camera_experience_ux).
 * Captures all 5 camera modes, hierarchical labels, detail cards, and simulation controls.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const outDir =
  process.argv[2] ||
  path.resolve('labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots');
const baseUrl = process.env.EVAL_URL || 'http://127.0.0.1:18485/';

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

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('view-mode-3d').click();
  await page.waitForSelector('canvas[data-testid="three-3d-canvas"]');
  await page.waitForTimeout(2600);

  // 1. City Overview (Tokyo 23 Wards + District Labels + Simulation Bar)
  await page.getByTestId('reset-3d-camera').click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(outDir, '01-city-overview.png') });

  // 2. Street-Level (Shinjuku viaduct & towers + Compass + Collision-safe low altitude)
  await page.getByTestId('hub-btn-shinjuku').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('mode-btn-street_level').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '02-street-level.png') });

  // 3. Underground Cutaway (Shibuya multi-level cutaway + single-line highlight + depth labels)
  await page.getByTestId('mode-btn-city_overview').click();
  await page.waitForTimeout(600);
  await page.getByTestId('hub-btn-shibuya').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('line-chip-sk:line:metro-fukutoshin').click();
  await page.getByTestId('mode-btn-underground_cutaway').click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(outDir, '03-underground-cutaway.png') });

  // 4. Underground Explorer (Inside Fukutoshin / Shibuya deep concrete tunnel!)
  await page.getByTestId('mode-btn-underground_explorer').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '04-underground-explorer.png') });

  // Return to Surface + Clear line highlight
  await page.getByTestId('explorer-return-surface-btn').click();
  await page.waitForTimeout(1000);

  // 5. Train Follow + Virtual Train Detail Card + Fixed Camera Rigs
  await page.getByTestId('sim-train-select').selectOption('sim:train:jr-east-yamanote-1');
  await page.waitForTimeout(400);
  await page.getByTestId('detail-follow-train-btn').click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(outDir, '05-train-follow.png') });

  // 6. Station Detail + Station Atlas Entry (Shinjuku)
  await page.getByTestId('exit-train-follow-btn').click();
  await page.waitForTimeout(600);
  await page.getByTestId('tab-explore').click();
  await page.getByTestId('station-search-input').fill('新宿');
  await page.getByTestId('search-result-sk:station:jr-east-shinjuku').click();
  await page.getByTestId('station-atlas-entry-btn').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '06-station-detail-atlas.png') });

  fs.writeFileSync(
    path.join(outDir, 'capture-report.json'),
    JSON.stringify({ consoleErrors, pageErrors, capturedAt: new Date().toISOString() }, null, 2),
  );

  await browser.close();
  console.log(`Captured 6 UX v2 screenshots to ${outDir}. Errors: ${consoleErrors.length + pageErrors.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
