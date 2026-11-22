#!/usr/bin/env node
/**
 * Fetches real public OpenStreetMap urban geographic data for Tokyo 23 wards
 * into data/raw/urban/ (gitignored). Strictly ODbL 1.0 (isolated from core atlas.json).
 *
 * Datasets fetched (all keyless):
 *  1. urban-water-parks.json   — Rivers, moats, canals, Tokyo Bay water & major parks
 *  2. urban-roads.json         — Major road network (motorway/trunk/primary + hub secondary)
 *  3. urban-buildings-hubs.json — Real building footprints & heights in key hubs
 *                                 (Shibuya, Shinjuku, Tokyo/Marunouchi/Ginza, Ikebukuro, Shinagawa, Ueno/Akihabara, Roppongi/Oshiage)
 *  4. urban-tall-23wards.json  — Tall & notable real buildings across all of Tokyo 23 wards
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'urban');

fs.mkdirSync(OUT_DIR, { recursive: true });

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function runOverpass(name, query, outFile, timeoutMs = 95_000) {
  const dest = path.join(OUT_DIR, outFile);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 200) {
    const bytes = fs.statSync(dest).size;
    console.log(`[${name}] Using existing cached ${outFile} (${(bytes / (1024 * 1024)).toFixed(1)} MB)`);
    return { ok: true, cached: true, bytes };
  }

  for (const endpoint of ENDPOINTS) {
    console.log(`[${name}] Querying ${endpoint} ...`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'SENKIRO-Lab-UrbanBuilder/0.2 (open-source 3D railway visualization)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.log(`[${name}] HTTP ${res.status} from ${endpoint}`);
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      const text = await res.text();
      const parsed = JSON.parse(text);
      fs.writeFileSync(dest, JSON.stringify(parsed));
      console.log(
        `[${name}] Saved ${parsed.elements?.length ?? 0} elements to ${outFile} (${(text.length / 1024).toFixed(1)} KB)`,
      );
      return {
        ok: true,
        url: endpoint,
        elements: parsed.elements?.length ?? 0,
        bytes: text.length,
      };
    } catch (err) {
      clearTimeout(timer);
      console.log(`[${name}] Error from ${endpoint}: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  return { ok: false, error: `All Overpass endpoints failed for ${name}` };
}

async function main() {
  // 1. Water & Major Parks across Tokyo 23 wards
  const waterParksQuery = `[out:json][timeout:60];
(
  way["natural"="water"]["water"~"^(river|canal|moat|pond|basin|lagoon)$"](35.56,139.58,35.81,139.91);
  way["waterway"="riverbank"](35.56,139.58,35.81,139.91);
  way["waterway"="river"](35.56,139.58,35.81,139.91);
  way["leisure"="park"]["name"](35.62,139.65,35.75,139.84);
  way["landuse"="forest"]["name"](35.65,139.67,35.73,139.78);
);
out tags geom;`;

  // 2. Major Road Network across Tokyo 23 wards (motorway, trunk, primary)
  const roadsQuery = `[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|primary)$"](35.59,139.61,35.78,139.88);
);
out tags geom;`;

  // 3. Real Building Footprints in Core Focus Hubs (Shibuya, Shinjuku, Tokyo/Marunouchi/Ginza)
  const coreHubsBuildingsQuery = `[out:json][timeout:75];
(
  way["building"](35.6535,139.6950,35.6635,139.7075);
  way["building"](35.6845,139.6900,35.6955,139.7060);
  way["building"](35.6725,139.7585,35.6880,139.7745);
);
out tags geom;`;

  // 4. Real Building Footprints in Secondary Hubs + Tall Buildings across all Tokyo 23 wards
  const secondaryAndTallQuery = `[out:json][timeout:75];
(
  way["building"](35.7260,139.7075,35.7330,139.7185);
  way["building"](35.6250,139.7355,35.6320,139.7455);
  way["building"](35.6965,139.7700,35.7155,139.7805);
  way["building"]["height"](35.58,139.62,35.79,139.87);
  way["building"]["building:levels"~"^([8-9]|[1-9][0-9]+)$"](35.60,139.64,35.78,139.85);
);
out tags geom;`;

  // 5. Urban Landuse Districts, Railway Yards, Secondary/Tertiary Streets & Station Plazas (ODbL 1.0)
  const landuseStreetsQuery = `[out:json][timeout:75];
(
  way["highway"="secondary"](35.60,139.65,35.76,139.83);
  way["highway"="tertiary"](35.62,139.68,35.74,139.79);
  way["landuse"~"^(commercial|retail|residential|industrial|railway)$"](35.60,139.65,35.76,139.83);
  way["leisure"="park"](35.62,139.67,35.74,139.81);
  way["place"="square"](35.62,139.68,35.74,139.79);
  way["highway"="pedestrian"]["area"="yes"](35.62,139.68,35.74,139.79);
);
out tags geom;`;

  // 6. Expanded Real Building Footprints around Shinagawa & Ikebukuro Hubs
  const shinagawaIkebukuroQuery = `[out:json][timeout:75];
(
  way["building"](35.6210,139.7310,35.6350,139.7480);
  way["building"](35.7220,139.7020,35.7360,139.7210);
);
out tags geom;`;

  const water = await runOverpass('Water & Parks', waterParksQuery, 'urban-water-parks.json');
  await new Promise((r) => setTimeout(r, 1500));
  const roads = await runOverpass('Major Roads', roadsQuery, 'urban-roads.json');
  await new Promise((r) => setTimeout(r, 1500));
  const coreHubs = await runOverpass(
    'Core Hub Buildings (Shibuya/Shinjuku/Tokyo)',
    coreHubsBuildingsQuery,
    'urban-buildings-core-hubs.json',
  );
  await new Promise((r) => setTimeout(r, 1500));
  const secondaryTall = await runOverpass(
    'Secondary Hubs & 23-Ward Tall Buildings',
    secondaryAndTallQuery,
    'urban-buildings-23w-tall.json',
  );
  await new Promise((r) => setTimeout(r, 1500));
  const landuseStreets = await runOverpass(
    'Urban Landuse, Secondary/Tertiary Streets & Plazas',
    landuseStreetsQuery,
    'urban-landuse-streets.json',
  );
  await new Promise((r) => setTimeout(r, 1500));
  const shinagawaIkebukuro = await runOverpass(
    'Expanded Shinagawa & Ikebukuro Buildings',
    shinagawaIkebukuroQuery,
    'urban-buildings-shinagawa-ikebukuro.json',
  );

  const manifest = {
    retrievedAt: new Date().toISOString(),
    license: 'ODbL 1.0 (OpenStreetMap Contributors)',
    datasets: { water, roads, coreHubs, secondaryTall, landuseStreets, shinagawaIkebukuro },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'urban-fetch-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nUrban raw fetch complete:\n', JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
