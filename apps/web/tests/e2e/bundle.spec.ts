/**
 * P0-W2 follow-up #8: `chunkSizeWarningLimit` cannot tell a big lazy chunk from a shell
 * regression, so this checks the production build directly. The entry chunk and every
 * chunk it statically pulls in (its `modulepreload` links) must not contain three.js or
 * MapLibre, and must stay inside a gzip budget. Positive controls prove the markers do
 * match the lazy chunks where those engines really live.
 *
 * Runs in `test:e2e`, right after `vite build`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

/** Entry script plus statically imported chunks, as Vite lists them in index.html. */
function staticChunks(): string[] {
  const entry = [...html.matchAll(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"/g)].map(
    (match) => match[1] ?? '',
  );
  const preloads = [
    ...html.matchAll(/<link rel="modulepreload"[^>]*href="\/(assets\/[^"]+\.js)"/g),
  ].map((match) => match[1] ?? '');
  return [...entry, ...preloads].filter(Boolean);
}

function read(asset: string): string {
  return readFileSync(join(dist, asset), 'utf8');
}

function lazyChunk(prefix: string): string {
  const name = readdirSync(join(dist, 'assets')).find(
    (file) => file.startsWith(`${prefix}-`) && file.endsWith('.js'),
  );
  if (name === undefined) {
    throw new Error(`no ${prefix} chunk in dist/assets`);
  }
  return read(`assets/${name}`);
}

/** String literals that survive minification in each engine. */
const THREE_MARKER = /THREE\.WebGLRenderer/;
const MAPLIBRE_MARKER = /maplibregl-canvas|maplibre-gl/;
/** pmtiles library code, not the word "PMTiles" (UI copy mentions it). */
const PMTILES_MARKER = /Wrong magic number for PMTiles/;

/** Shell entry budget (gzip). P0-W2 measured ~150 kB; Atlas UI adds ~12 kB. */
const ENTRY_GZIP_BUDGET = 200 * 1024;

test.describe('production bundle', () => {
  test('the entry chunk statically includes neither three.js nor MapLibre', () => {
    const chunks = staticChunks();
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const code = read(chunk);
      expect(THREE_MARKER.test(code), `${chunk} contains three.js`).toBe(false);
      expect(MAPLIBRE_MARKER.test(code), `${chunk} contains MapLibre`).toBe(false);
      expect(PMTILES_MARKER.test(code), `${chunk} contains pmtiles`).toBe(false);
    }
  });

  test('the entry chunk stays inside its gzip budget', () => {
    const total = staticChunks().reduce((sum, chunk) => sum + gzipSync(read(chunk)).length, 0);
    process.stdout.write(`[bundle] entry + static chunks: ${(total / 1024).toFixed(1)} kB gzip\n`);
    expect(total).toBeLessThan(ENTRY_GZIP_BUDGET);
  });

  test('positive controls: the markers match the lazy engine chunks', () => {
    expect(THREE_MARKER.test(lazyChunk('station-explorer'))).toBe(true);
    const atlas = lazyChunk('AtlasMapView');
    expect(MAPLIBRE_MARKER.test(atlas)).toBe(true);
    expect(PMTILES_MARKER.test(atlas)).toBe(true);
  });
});
