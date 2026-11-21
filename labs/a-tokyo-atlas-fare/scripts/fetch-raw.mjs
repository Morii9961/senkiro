#!/usr/bin/env node
/**
 * Fetches verified public open railway datasets into data/raw/ (gitignored).
 * Requires NO API keys:
 *  1. MLIT KSJ N02 Railway Data (Public Data License 1.0 / CC BY 4.0 compatible)
 *  2. ODPT Public Toei Train GTFS (CC BY 4.0, keyless public endpoint)
 *  3. OpenStreetMap Overpass API railway vertical tags (ODbL 1.0, isolated for verticalClass only)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');

fs.mkdirSync(RAW_DIR, { recursive: true });

async function downloadFile(url, destPath, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SENKIRO-Lab-DataBuilder/0.1 (open-source research prototype)',
      },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, url };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return { ok: true, status: res.status, url, bytes: buf.length };
  } catch (err) {
    return { ok: false, status: 0, url, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchKsjN02() {
  const candidates = [
    'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-24/N02-24_GML.zip',
    'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-23/N02-23_GML.zip',
    'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-22/N02-22_GML.zip',
  ];
  const dest = path.join(RAW_DIR, 'ksj-n02.zip');
  for (const url of candidates) {
    console.log(`[KSJ N02] Trying ${url} ...`);
    const result = await downloadFile(url, dest, 120_000);
    if (result.ok) {
      console.log(`[KSJ N02] Downloaded ${result.bytes} bytes from ${url}`);
      return result;
    }
    console.log(`[KSJ N02] Failed (${result.status}): ${url}`);
  }
  return { ok: false, error: 'All KSJ N02 URLs failed' };
}

async function fetchOdptToeiGtfs() {
  const url = 'https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip';
  const dest = path.join(RAW_DIR, 'odpt-toei-train-gtfs.zip');
  console.log(`[ODPT Toei GTFS] Downloading ${url} ...`);
  const result = await downloadFile(url, dest, 60_000);
  if (result.ok) {
    console.log(`[ODPT Toei GTFS] Downloaded ${result.bytes} bytes`);
  } else {
    console.log(`[ODPT Toei GTFS] Failed (${result.status}): ${result.error ?? ''}`);
  }
  return result;
}

async function fetchOsmVertical() {
  // Query railway ways in Tokyo 23 wards + Omiya + Yokohama/Atami corridor with geometry & vertical tags
  // Kept compact by filtering to main passenger railway types and returning center + tags
  const query = `[out:json][timeout:60];
(
  way["railway"~"^(rail|subway|monorail|light_rail)$"]["service"!~"^(yard|siding|spur|crossover)$"](35.52,139.55,35.93,139.92);
  way["railway"="rail"]["usage"="main"]["service"!~"^(yard|siding|spur|crossover)$"](35.08,138.89,35.55,139.65);
);
out tags center;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  const dest = path.join(RAW_DIR, 'osm-rail-vertical.json');

  for (const endpoint of endpoints) {
    console.log(`[OSM Overpass] Querying ${endpoint} ...`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'SENKIRO-Lab-DataBuilder/0.1 (open-source research prototype)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.log(`[OSM Overpass] HTTP ${res.status} from ${endpoint}`);
        continue;
      }
      const text = await res.text();
      const parsed = JSON.parse(text);
      fs.writeFileSync(dest, JSON.stringify(parsed));
      console.log(
        `[OSM Overpass] Saved ${parsed.elements?.length ?? 0} railway way elements (${text.length} bytes)`,
      );
      return {
        ok: true,
        url: endpoint,
        elementCount: parsed.elements?.length ?? 0,
        bytes: text.length,
      };
    } catch (err) {
      clearTimeout(timer);
      console.log(`[OSM Overpass] Error from ${endpoint}: ${String(err)}`);
    }
  }
  return { ok: false, error: 'All Overpass endpoints failed' };
}

async function main() {
  const retrievedAt = new Date().toISOString();
  const ksj = await fetchKsjN02();
  const toei = await fetchOdptToeiGtfs();
  const osm = await fetchOsmVertical();

  const manifest = {
    retrievedAt,
    ksj,
    toei,
    osm,
  };
  fs.writeFileSync(
    path.join(RAW_DIR, 'fetch-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log('\nFetch manifest written to data/raw/fetch-manifest.json');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
