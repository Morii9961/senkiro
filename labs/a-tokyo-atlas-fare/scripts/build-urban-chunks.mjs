#!/usr/bin/env node
/**
 * Reproducible Urban 3D Chunk Builder (`npm run data:urban`) — Phase 2 (P1 + P2).
 *
 * Processes raw OpenStreetMap Tokyo 23-ward data in data/raw/urban/ (ODbL 1.0, gitignored)
 * into isolated, spatially-chunked, LOD-ready JSON assets under public/data/urban-chunks/:
 *   - manifest.json            (chunk index, real vs infill coverage diagnostics, ODbL notice)
 *   - base-environment.json    (real OSM water/rivers, parks, landuse districts, railway yards,
 *                               major/secondary/tertiary streets, intersections, station plazas,
 *                               surface railway ballast corridors & 13 hero landmark anchors)
 *   - chunk_{cx}_{cz}.json     (2km x 2km spatial tiles of real OSM buildings + strictly guarded,
 *                               road-aligned schematic street-block infill tagged hb="p")
 *
 * Strictly isolated from data/processed/atlas.json (CC BY / Public Data License).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_URBAN = path.join(ROOT, 'data', 'raw', 'urban');
const ATLAS_PATH = path.join(ROOT, 'data', 'processed', 'atlas.json');
const VERT_PATH = path.join(ROOT, 'data', 'processed', 'osm-vertical.json');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'urban-chunks');

fs.mkdirSync(OUT_DIR, { recursive: true });

// Must match src/three/geoProjection.ts exactly!
const ORIGIN_LON = 139.7671;
const ORIGIN_LAT = 35.6812;
const METERS_PER_DEG_LAT = 111_132.95;
const METERS_PER_DEG_LON = 111_319.49 * Math.cos((ORIGIN_LAT * Math.PI) / 180);
const CHUNK_SIZE = 2000;

function lonLatToWorld(lon, lat) {
  return [
    Math.round((lon - ORIGIN_LON) * METERS_PER_DEG_LON * 10) / 10,
    Math.round(-(lat - ORIGIN_LAT) * METERS_PER_DEG_LAT * 10) / 10,
  ];
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function round0(v) {
  return Math.round(v);
}

function hashDet(x, z, salt = 17) {
  const h = Math.sin(x * 0.0137 + z * 0.0271 + salt * 19.31) * 43758.5453123;
  return h - Math.floor(h);
}

function pointInPolygon(px, pz, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polyBounds(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Douglas-Peucker polyline/polygon simplification in meters.
 */
function simplifyLine(pts, tolM) {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let maxIdx = 0;
  const [ax, az] = pts[0];
  const [bx, bz] = pts[pts.length - 1];
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i];
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
    const projX = ax + t * dx;
    const projZ = az + t * dz;
    const d = Math.hypot(px - projX, pz - projZ);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tolM) {
    const left = simplifyLine(pts.slice(0, maxIdx + 1), tolM);
    const right = simplifyLine(pts.slice(maxIdx), tolM);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

function analyzeBuildingFootprint(worldPts) {
  if (worldPts.length < 3) return null;
  const pts =
    worldPts.length > 3 &&
    Math.hypot(
      worldPts[0][0] - worldPts[worldPts.length - 1][0],
      worldPts[0][1] - worldPts[worldPts.length - 1][1],
    ) < 0.5
      ? worldPts.slice(0, -1)
      : worldPts;
  if (pts.length < 3) return null;

  let area2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const cross = x1 * z2 - x2 * z1;
    area2 += cross;
    cx += (x1 + x2) * cross;
    cz += (z1 + z2) * cross;
  }
  const area = Math.abs(area2) * 0.5;
  if (area < 34 || area > 130_000) return null;

  if (Math.abs(area2) > 1e-3) {
    cx /= 3 * area2;
    cz /= 3 * area2;
  } else {
    cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  }

  let longestLen = 0;
  let angle = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len > longestLen) {
      longestLen = len;
      angle = Math.atan2(z2 - z1, x2 - x1);
    }
  }

  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [px, pz] of pts) {
    const dx = px - cx;
    const dz = pz - cz;
    const u = dx * cosA - dz * sinA;
    const v = dx * sinA + dz * cosA;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const w = Math.max(5, Math.min(260, maxU - minU));
  const d = Math.max(5, Math.min(260, maxV - minV));

  let simplified = simplifyLine([...pts, pts[0]], 1.8).slice(0, -1);
  if (simplified.length < 3 || simplified.length > 14) {
    simplified = pts.length <= 12 ? pts : pts.filter((_, i) => i % Math.ceil(pts.length / 10) === 0);
  }
  const relPoly = simplified.map(([px, pz]) => [round1(px - cx), round1(pz - cz)]);

  return {
    cx: round1(cx),
    cz: round1(cz),
    w: round1(w),
    d: round1(d),
    angle: Math.round(angle * 1000) / 1000,
    area: round0(area),
    poly: relPoly,
  };
}

function classifyBuilding(tags, area) {
  const b = (tags.building ?? '').toLowerCase();
  const use = (tags['building:use'] ?? tags.amenity ?? tags.shop ?? '').toLowerCase();
  const name = tags.name ?? '';

  let height = null;
  let hb = 'i';
  if (tags.height) {
    const m = String(tags.height).match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const parsed = Number(m[1]);
      if (parsed >= 3 && parsed <= 650) {
        height = parsed;
        hb = 'o';
      }
    }
  }
  if (height === null && tags['building:levels']) {
    const m = String(tags['building:levels']).match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const levels = Number(m[1]);
      if (levels >= 1 && levels <= 120) {
        height = levels * 3.6;
        hb = 'l';
      }
    }
  }

  let typology = 'r';
  if (
    b === 'train_station' ||
    b === 'transportation' ||
    b === 'civic' ||
    b === 'public' ||
    b === 'government' ||
    b === 'university' ||
    b === 'hospital' ||
    name.includes('駅') ||
    name.includes('都庁')
  ) {
    typology = 's';
  } else if (
    b === 'office' ||
    use.includes('office') ||
    (height !== null && height >= 48)
  ) {
    typology = 'o';
  } else if (
    b === 'commercial' ||
    b === 'retail' ||
    b === 'hotel' ||
    b === 'department_store' ||
    use.includes('shop') ||
    use.includes('retail') ||
    area >= 900
  ) {
    typology = 'c';
  } else {
    typology = 'r';
  }

  if (height === null) {
    if (typology === 's') height = 18 + Math.min(24, Math.sqrt(area) * 0.4);
    else if (typology === 'o') height = 34 + Math.min(60, Math.sqrt(area) * 0.7);
    else if (typology === 'c') height = 18 + Math.min(36, Math.sqrt(area) * 0.55);
    else height = 9 + Math.min(18, Math.sqrt(area) * 0.35);
    hb = 'i';
  }

  return {
    h: round1(Math.max(5, Math.min(340, height))),
    hb,
    t: typology,
  };
}

async function streamOverpassElements(filePath, onElement) {
  if (!fs.existsSync(filePath)) return 0;
  const stat = fs.statSync(filePath);
  if (stat.size < 60 * 1024 * 1024) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const els = parsed.elements ?? [];
    for (const el of els) onElement(el);
    return els.length;
  }

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
    let inElements = false;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let buf = '';
    let count = 0;

    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (!inElements) {
          buf += ch;
          if (buf.length > 64) buf = buf.slice(-64);
          if (buf.endsWith('"elements": [') || buf.endsWith('"elements":[')) {
            inElements = true;
            buf = '';
          }
          continue;
        }
        if (depth === 0) {
          if (ch === '{') {
            depth = 1;
            buf = '{';
            inString = false;
            escaped = false;
          } else if (ch === ']') {
            inElements = false;
          }
          continue;
        }
        buf += ch;
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
        } else {
          if (ch === '"') inString = true;
          else if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              try {
                const el = JSON.parse(buf);
                onElement(el);
                count++;
              } catch {
                // ignore
              }
              buf = '';
            }
          }
        }
      }
    });

    stream.on('end', () => resolve(count));
    stream.on('error', reject);
  });
}

// 13 Curated Tokyo Landmarks spanning ALL 5 focus hubs + major metropolitan anchors
const TOKYO_LANDMARKS = [
  {
    id: 'lm-tokyo-tower',
    nameJa: '東京タワー',
    nameEn: 'Tokyo Tower',
    kind: 'lattice_tower_orange',
    lon: 139.7454,
    lat: 35.6586,
    height: 332.9,
    radius: 28,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-tokyo-skytree',
    nameJa: '東京スカイツリー',
    nameEn: 'Tokyo Skytree',
    kind: 'skytree_tower',
    lon: 139.8107,
    lat: 35.7101,
    height: 634,
    radius: 34,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-tmbg',
    nameJa: '東京都庁第一本庁舎',
    nameEn: 'Tokyo Metropolitan Government Building',
    kind: 'twin_stepped_tower',
    lon: 139.6917,
    lat: 35.6896,
    height: 243,
    width: 96,
    depth: 48,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-shinjuku-park-tower',
    nameJa: '新宿パークタワー',
    nameEn: 'Shinjuku Park Tower',
    kind: 'triple_stepped_tower',
    lon: 139.6908,
    lat: 35.6855,
    height: 235,
    width: 88,
    depth: 46,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-cocoon-tower',
    nameJa: 'モード学園コクーンタワー',
    nameEn: 'Mode Gakuen Cocoon Tower',
    kind: 'cocoon_ellipsoid',
    lon: 139.6970,
    lat: 35.6915,
    height: 204,
    radius: 24,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-shibuya-scramble-sq',
    nameJa: '渋谷スクランブルスクエア',
    nameEn: 'Shibuya Scramble Square',
    kind: 'glass_stepped_hub',
    lon: 139.7023,
    lat: 35.6584,
    height: 229.7,
    width: 62,
    depth: 48,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-shibuya-hikarie',
    nameJa: '渋谷ヒカリエ',
    nameEn: 'Shibuya Hikarie',
    kind: 'tiered_cultural_tower',
    lon: 139.7035,
    lat: 35.6590,
    height: 182.5,
    width: 58,
    depth: 44,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-shibuya-stream',
    nameJa: '渋谷ストリーム',
    nameEn: 'Shibuya Stream',
    kind: 'stepped_stream_tower',
    lon: 139.7030,
    lat: 35.6572,
    height: 180,
    width: 54,
    depth: 42,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-tokyo-station-marunouchi',
    nameJa: '東京駅丸の内駅舎',
    nameEn: 'Tokyo Station Marunouchi Building',
    kind: 'heritage_brick_station',
    lon: 139.7661,
    lat: 35.6812,
    height: 28,
    width: 34,
    depth: 320,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-marunouchi-bldg',
    nameJa: '丸の内ビルディング',
    nameEn: 'Marunouchi Building',
    kind: 'marunouchi_tower',
    lon: 139.7638,
    lat: 35.6812,
    height: 180,
    width: 68,
    depth: 62,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-shinagawa-intercity',
    nameJa: '品川インターシティ',
    nameEn: 'Shinagawa Intercity A/B/C',
    kind: 'intercity_trio',
    lon: 139.7406,
    lat: 35.6268,
    height: 144,
    width: 60,
    depth: 220,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-roppongi-hills',
    nameJa: '六本木ヒルズ森タワー',
    nameEn: 'Roppongi Hills Mori Tower',
    kind: 'octagonal_crown_tower',
    lon: 139.7292,
    lat: 35.6605,
    height: 238,
    width: 66,
    depth: 66,
    heightBasis: 'manual-verified-landmark',
  },
  {
    id: 'lm-sunshine-60',
    nameJa: 'サンシャイン60',
    nameEn: 'Sunshine 60',
    kind: 'slab_skyscraper',
    lon: 139.7183,
    lat: 35.7295,
    height: 239.7,
    width: 64,
    depth: 38,
    heightBasis: 'manual-verified-landmark',
  },
];

// Bay backdrop polygon (matches CityTerrainLayer) so infill never spawns on Tokyo Bay water
const TOKYO_BAY_POLY = [
  [1500, 4200],
  [18000, 2200],
  [25000, 24000],
  [-6000, 24000],
  [-2000, 11500],
];

async function main() {
  console.log('Building spatial railway corridor clearance grid & station plazas from atlas.json...');
  const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8'));
  const vertData = fs.existsSync(VERT_PATH)
    ? JSON.parse(fs.readFileSync(VERT_PATH, 'utf8'))
    : { records: [] };
  const vertBySeg = new Map(vertData.records.map((r) => [r.trackSegmentId, r.verticalClass]));

  // Grid cell = 16m for fast clearance checks across surface rails, roads, water, parks & buildings
  const CELL = 16;
  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const railGrid = new Set();
  const blockedInfillGrid = new Set();

  function markDisc(set, x, z, radiusM) {
    const rCells = Math.ceil(radiusM / CELL);
    const gx0 = Math.floor(x / CELL);
    const gz0 = Math.floor(z / CELL);
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dz = -rCells; dz <= rCells; dz++) {
        set.add(`${gx0 + dx},${gz0 + dz}`);
      }
    }
  }

  function markPolyline(set, pts, halfWidthM) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 12));
      for (let s = 0; s <= steps; s++) {
        const px = ax + ((bx - ax) * s) / steps;
        const pz = az + ((bz - az) * s) / steps;
        markDisc(set, px, pz, halfWidthM);
      }
    }
  }

  const railCorridors = [];
  for (const seg of atlas.trackSegments) {
    const vc = vertBySeg.get(seg.id) ?? 'unknown';
    // Keep buildings clear of surface/elevated tracks (subways run underground)
    if (seg.lineClass === 'metro' && vc !== 'elevated') continue;
    if (vc === 'underground') continue;

    const pts = seg.geometry.map(([lon, lat]) => lonLatToWorld(lon, lat));
    markPolyline(railGrid, pts, 14);
    markPolyline(blockedInfillGrid, pts, 22);

    const simp = simplifyLine(pts, 14);
    if (simp.length >= 2) {
      const w = seg.lineClass === 'shinkansen' ? 22 : seg.railLineIds.length >= 2 ? 26 : 16;
      railCorridors.push({
        width: w,
        pts: simp.map(([x, z]) => [round0(x), round0(z)]),
      });
    }
  }

  // Station forecourt plazas around major interchange stations
  const stationLineCounts = new Map();
  for (const l of atlas.railLines) {
    for (const sid of l.stationIds) {
      stationLineCounts.set(sid, (stationLineCounts.get(sid) ?? 0) + 1);
    }
  }
  const stationPlazas = [];
  for (const st of atlas.stations) {
    const lc = stationLineCounts.get(st.id) ?? 0;
    const [wx, wz] = lonLatToWorld(st.coordinates[0], st.coordinates[1]);
    if (Math.abs(wx) > 15_000 || Math.abs(wz) > 13_500) continue;
    if (lc >= 2 || ['東京', '新宿', '渋谷', '品川', '池袋', '上野', '秋葉原', '大手町'].includes(st.names.ja)) {
      const rad = lc >= 4 ? 115 : lc >= 3 ? 82 : 52;
      stationPlazas.push({
        x: round0(wx),
        z: round0(wz),
        rx: rad,
        rz: Math.round(rad * 0.78),
        a: 0,
      });
      markDisc(blockedInfillGrid, wx, wz, rad * 0.65);
    }
  }

  // ---- 1. Process Water Bodies, Parks, Urban Landuse & Plazas ----
  console.log('Processing real OSM water bodies, parks, urban landuse blocks & plazas...');
  const waterPolygons = [];
  const riverLines = [];
  const parkPolygons = [];
  const landuseBlocks = [];
  const plazaPolygons = [];
  const seenWayIds = new Set();

  // Keep bboxes for fast point-in-water/park exclusion check during schematic infill
  const exclusionPolys = [];

  function ingestEnvElement(el) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return;
    if (seenWayIds.has(el.id)) return;
    const tags = el.tags ?? {};
    const worldPts = el.geometry.map((g) => lonLatToWorld(g.lon, g.lat));
    const isClosed =
      worldPts.length >= 4 &&
      Math.hypot(
        worldPts[0][0] - worldPts[worldPts.length - 1][0],
        worldPts[0][1] - worldPts[worldPts.length - 1][1],
      ) < 18;

    if (tags.natural === 'water' || tags.waterway === 'riverbank') {
      if (!isClosed) return;
      const simp = simplifyLine(worldPts, 14);
      if (simp.length < 4) return;
      const b = polyBounds(simp);
      if (b.maxX - b.minX < 35 && b.maxZ - b.minZ < 35) return;
      seenWayIds.add(el.id);
      const pts = simp.map(([x, z]) => [round0(x), round0(z)]);
      waterPolygons.push({ name: tags.name ?? null, pts });
      exclusionPolys.push({ pts, b });
    } else if (tags.waterway === 'river') {
      const simp = simplifyLine(worldPts, 22);
      if (simp.length >= 2) {
        seenWayIds.add(el.id);
        const width = tags.name?.includes('荒川') ? 160 : tags.name?.includes('隅田川') ? 110 : 32;
        const pts = simp.map(([x, z]) => [round0(x), round0(z)]);
        riverLines.push({ name: tags.name ?? null, width, pts });
        markPolyline(blockedInfillGrid, pts, width * 0.48 + 18);
      }
    } else if (tags.leisure === 'park' || tags.landuse === 'forest') {
      if (!isClosed) return;
      const simp = simplifyLine(worldPts, 14);
      if (simp.length < 4) return;
      const b = polyBounds(simp);
      if ((b.maxX - b.minX) * (b.maxZ - b.minZ) < 4_500) return;
      seenWayIds.add(el.id);
      const pts = simp.map(([x, z]) => [round0(x), round0(z)]);
      parkPolygons.push({ name: tags.name ?? null, pts });
      exclusionPolys.push({ pts, b });
    } else if (tags.place === 'square' || (tags.highway === 'pedestrian' && tags.area === 'yes')) {
      if (!isClosed) return;
      const simp = simplifyLine(worldPts, 8);
      if (simp.length < 4) return;
      const b = polyBounds(simp);
      if ((b.maxX - b.minX) * (b.maxZ - b.minZ) < 600) return;
      seenWayIds.add(el.id);
      const pts = simp.map(([x, z]) => [round0(x), round0(z)]);
      plazaPolygons.push({ pts });
      exclusionPolys.push({ pts, b });
    } else if (['commercial', 'retail', 'residential', 'industrial', 'railway'].includes(tags.landuse ?? '')) {
      if (!isClosed) return;
      const simp = simplifyLine(worldPts, 16);
      if (simp.length < 4) return;
      const b = polyBounds(simp);
      const bboxArea = (b.maxX - b.minX) * (b.maxZ - b.minZ);
      if (bboxArea < 5_000 || bboxArea > 25_000_000) return;
      seenWayIds.add(el.id);
      const kind =
        tags.landuse === 'retail' || tags.landuse === 'commercial'
          ? 'commercial'
          : tags.landuse === 'railway'
            ? 'railway'
            : tags.landuse === 'industrial'
              ? 'industrial'
              : 'residential';
      const pts = simp.map(([x, z]) => [round0(x), round0(z)]);
      landuseBlocks.push({ kind, pts });
      if (kind === 'railway') {
        exclusionPolys.push({ pts, b });
      }
    }
  }

  await streamOverpassElements(path.join(RAW_URBAN, 'urban-water-parks.json'), ingestEnvElement);
  await streamOverpassElements(path.join(RAW_URBAN, 'urban-landuse-streets.json'), ingestEnvElement);

  // ---- 2. Process Major + Secondary + Tertiary Roads & Intersections ----
  console.log('Processing real OSM road network (motorway/trunk/primary/secondary/tertiary)...');
  const roads = [];
  const seenRoadIds = new Set();
  const roadEndpointCounts = new Map();

  function ingestRoadElement(el) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return;
    if (seenRoadIds.has(el.id)) return;
    const tags = el.tags ?? {};
    const hw = tags.highway ?? '';
    if (!['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(hw)) return;
    const tunnel = tags.tunnel === 'yes';
    if (tunnel) return;

    const worldPts = el.geometry.map((g) => lonLatToWorld(g.lon, g.lat));
    const tol = hw === 'tertiary' ? 14 : 15;
    const simp = simplifyLine(worldPts, tol);
    if (simp.length < 2) return;

    const width =
      hw === 'motorway'
        ? 16
        : hw === 'trunk'
          ? 18
          : hw === 'primary'
            ? 13
            : hw === 'secondary'
              ? 10
              : 7.5;
    const elevated = tags.bridge === 'yes' || tags.bridge === 'viaduct' || hw === 'motorway';
    seenRoadIds.add(el.id);

    const pts = simp.map(([x, z]) => [round0(x), round0(z)]);
    roads.push({ hw, w: width, el: elevated ? 1 : 0, pts });

    // Mark surface roads in infill exclusion grid & track surface road intersections only!
    if (!elevated) {
      markPolyline(blockedInfillGrid, pts, width * 0.5 + 8);
      if (hw !== 'tertiary') {
        for (const pt of [pts[0], pts[pts.length - 1]]) {
          const k = `${Math.round(pt[0] / 25)},${Math.round(pt[1] / 25)}`;
          const rec = roadEndpointCounts.get(k);
          if (rec) {
            rec.count++;
            rec.maxW = Math.max(rec.maxW, width);
          } else {
            roadEndpointCounts.set(k, { x: pt[0], z: pt[1], count: 1, maxW: width });
          }
        }
      }
    }
  }

  await streamOverpassElements(path.join(RAW_URBAN, 'urban-roads.json'), ingestRoadElement);
  await streamOverpassElements(path.join(RAW_URBAN, 'urban-landuse-streets.json'), ingestRoadElement);

  const intersections = [];
  for (const rec of roadEndpointCounts.values()) {
    if (rec.count >= 3) {
      intersections.push([rec.x, rec.z, Math.min(10, Math.round(rec.maxW * 0.56))]);
    }
  }

  const landmarksWorld = TOKYO_LANDMARKS.map((lm) => {
    const [x, z] = lonLatToWorld(lm.lon, lm.lat);
    markDisc(blockedInfillGrid, x, z, (lm.radius ?? Math.max(lm.width ?? 60, lm.depth ?? 60) * 0.55) + 18);
    return { ...lm, x: round1(x), z: round1(z) };
  });

  const baseEnvironment = {
    generatedAt: new Date().toISOString(),
    license: 'ODbL 1.0 (OpenStreetMap Contributors)',
    origin: { lon: ORIGIN_LON, lat: ORIGIN_LAT },
    waterPolygons,
    riverLines,
    parkPolygons,
    landuseBlocks,
    plazaPolygons,
    stationPlazas,
    railCorridors,
    roads,
    intersections: intersections.slice(0, 1800),
    landmarks: landmarksWorld,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'base-environment.json'), JSON.stringify(baseEnvironment));
  console.log(
    `Wrote base-environment.json: ${waterPolygons.length} water, ${riverLines.length} rivers, ${parkPolygons.length} parks, ${landuseBlocks.length} landuse blocks, ${plazaPolygons.length} OSM plazas, ${stationPlazas.length} station plazas, ${railCorridors.length} rail yards, ${roads.length} roads, ${landmarksWorld.length} landmarks.`,
  );

  // ---- 3. Stream & Spatially Chunk Real OSM Buildings (2km x 2km tiles!) ----
  const focusCenters = [
    lonLatToWorld(139.7016, 35.6580), // Shibuya
    lonLatToWorld(139.7004, 35.6896), // Shinjuku
    lonLatToWorld(139.7662, 35.6826), // Tokyo / Otemachi
    lonLatToWorld(139.7109, 35.7295), // Ikebukuro
    lonLatToWorld(139.7390, 35.6285), // Shinagawa
    lonLatToWorld(139.7760, 35.7060), // Ueno / Akihabara
    lonLatToWorld(139.7292, 35.6605), // Roppongi
  ];

  function isNearFocusHub(x, z, rad = 1650) {
    return focusCenters.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < rad);
  }

  function isNearLandmark(x, z) {
    return landmarksWorld.some((lm) => {
      const lmRad = lm.radius ?? Math.max(lm.width ?? 45, lm.depth ?? 45) * 0.55;
      return Math.hypot(x - lm.x, z - lm.z) < lmRad + 16;
    });
  }

  const chunks = new Map();
  const seenIds = new Set();
  let totalRawProcessed = 0;
  let totalSkippedRailOverlap = 0;

  function ingestBuildingElement(el, isCoreHubFile) {
    if (el.type !== 'way' || !el.tags?.building || !Array.isArray(el.geometry) || el.geometry.length < 3) {
      return;
    }
    if (seenIds.has(el.id)) return;

    const worldPts = el.geometry.map((g) => lonLatToWorld(g.lon, g.lat));
    const geom = analyzeBuildingFootprint(worldPts);
    if (!geom) return;

    if (Math.abs(geom.cx) > 15_000 || Math.abs(geom.cz) > 13_500) return;

    const meta = classifyBuilding(el.tags, geom.area);
    const inHub = isCoreHubFile || isNearFocusHub(geom.cx, geom.cz, 1650);

    // Keep far more real OSM buildings across inner 23 wards (only drop tiny sheds far out)
    if (!inHub && meta.h < 10 && geom.area < 190) return;

    if (isNearLandmark(geom.cx, geom.cz) && meta.h > 35) return;

    if (meta.t !== 's' && railGrid.has(cellKey(geom.cx, geom.cz))) {
      totalSkippedRailOverlap++;
      return;
    }

    seenIds.add(el.id);
    const chx = Math.floor(geom.cx / CHUNK_SIZE);
    const chz = Math.floor(geom.cz / CHUNK_SIZE);
    const key = `${chx}_${chz}`;
    if (!chunks.has(key)) chunks.set(key, []);

    chunks.get(key).push({
      id: el.id,
      cx: geom.cx,
      cz: geom.cz,
      w: geom.w,
      d: geom.d,
      a: geom.angle,
      h: meta.h,
      hb: meta.hb,
      t: meta.t,
      area: geom.area,
      poly: inHub || meta.h >= 24 ? geom.poly : null,
      score: (inHub ? 1000 : 0) + meta.h * 4 + Math.sqrt(geom.area) * 1.5,
    });
    totalRawProcessed++;
  }

  console.log('Streaming core hub buildings (Shibuya, Shinjuku, Tokyo)...');
  await streamOverpassElements(
    path.join(RAW_URBAN, 'urban-buildings-core-hubs.json'),
    (el) => ingestBuildingElement(el, true),
  );

  console.log('Streaming expanded Shinagawa & Ikebukuro buildings...');
  await streamOverpassElements(
    path.join(RAW_URBAN, 'urban-buildings-shinagawa-ikebukuro.json'),
    (el) => ingestBuildingElement(el, true),
  );

  console.log('Streaming 23-ward tall & metropolitan buildings...');
  const tallCount = await streamOverpassElements(
    path.join(RAW_URBAN, 'urban-buildings-23w-tall.json'),
    (el) => ingestBuildingElement(el, false),
  );
  console.log(
    `Scanned ${tallCount} 23-ward raw elements; kept ${totalRawProcessed} real OSM buildings before per-chunk budget cap (${totalSkippedRailOverlap} skipped for surface rail clearance).`,
  );

  // Select real OSM buildings per chunk first and mark their footprints in blockedInfillGrid
  const selectedByChunk = new Map();
  for (const [key, list] of [...chunks.entries()].sort()) {
    const [chx, chz] = key.split('_').map(Number);
    const centerX = (chx + 0.5) * CHUNK_SIZE;
    const centerZ = (chz + 0.5) * CHUNK_SIZE;
    const hubChunk = focusCenters.some(([fx, fz]) => Math.hypot(centerX - fx, centerZ - fz) < 2500);
    const cap = hubChunk ? 820 : 340;

    list.sort((a, b) => b.score - a.score);
    const selected = list.slice(0, cap).map((b) => {
      markDisc(blockedInfillGrid, b.cx, b.cz, Math.max(b.w, b.d) * 0.45 + 6);
      return {
        id: b.id,
        cx: b.cx,
        cz: b.cz,
        w: b.w,
        d: b.d,
        a: b.a,
        h: b.h,
        hb: b.hb,
        t: b.t,
        ...(b.poly ? { p: b.poly } : {}),
      };
    });
    if (selected.length > 0) {
      selectedByChunk.set(key, { chx, chz, hubChunk, real: selected, infill: [] });
    }
  }

  // ---- 4. Strictly Guarded Schematic Street-Block Infill (hb="p", P1) ----
  console.log('Generating road- & landuse-aligned schematic street-block infill (strictly clear of roads/water/parks/rail)...');

  function isExcludedPoint(px, pz) {
    if (Math.abs(px) > 13_000 || Math.abs(pz) > 11_500) return true;
    // Imperial Palace & East Gardens protected green enclosure (west of Tokyo Station)
    if (px >= -1920 && px <= -320 && pz >= -1380 && pz <= 160) return true;
    if (blockedInfillGrid.has(cellKey(px, pz))) return true;
    if (pointInPolygon(px, pz, TOKYO_BAY_POLY)) return true;
    for (const ex of exclusionPolys) {
      if (px >= ex.b.minX - 6 && px <= ex.b.maxX + 6 && pz >= ex.b.minZ - 6 && pz <= ex.b.maxZ + 6) {
        if (pointInPolygon(px, pz, ex.pts)) return true;
      }
    }
    return false;
  }

  function tryPlaceInfill(cx, cz, w, d, angle, h, t, nextIdRef) {
    const chx = Math.floor(cx / CHUNK_SIZE);
    const chz = Math.floor(cz / CHUNK_SIZE);
    const key = `${chx}_${chz}`;
    let entry = selectedByChunk.get(key);
    if (!entry) {
      const centerX = (chx + 0.5) * CHUNK_SIZE;
      const centerZ = (chz + 0.5) * CHUNK_SIZE;
      const hubChunk = focusCenters.some(([fx, fz]) => Math.hypot(centerX - fx, centerZ - fz) < 2500);
      entry = { chx, chz, hubChunk, real: [], infill: [] };
      selectedByChunk.set(key, entry);
    }

    // Cap total density cleanly so chunks remain crisp & fast
    const maxTotal = entry.hubChunk ? 940 : 460;
    const maxInfill = entry.hubChunk ? 260 : 280;
    if (entry.real.length + entry.infill.length >= maxTotal || entry.infill.length >= maxInfill) {
      return false;
    }

    // Check center + 4 corners against roads/water/parks/rail/real-buildings!
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const hw = w * 0.5 + 3;
    const hd = d * 0.5 + 3;
    const ptsToCheck = [
      [cx, cz],
      [cx + hw * cosA - hd * sinA, cz + hw * sinA + hd * cosA],
      [cx - hw * cosA - hd * sinA, cz - hw * sinA + hd * cosA],
      [cx + hw * cosA + hd * sinA, cz + hw * sinA - hd * cosA],
      [cx - hw * cosA + hd * sinA, cz - hw * sinA - hd * cosA],
    ];
    for (const [px, pz] of ptsToCheck) {
      if (isExcludedPoint(px, pz)) return false;
    }

    // Reserve cells so subsequent infill never collides
    markDisc(blockedInfillGrid, cx, cz, Math.max(w, d) * 0.52 + 5);
    entry.infill.push({
      id: nextIdRef.val++,
      cx: round1(cx),
      cz: round1(cz),
      w: round1(w),
      d: round1(d),
      a: Math.round(angle * 1000) / 1000,
      h: round1(h),
      hb: 'p',
      t,
    });
    return true;
  }

  const nextInfillId = { val: 9_000_000_001 };

  // Pass 4a: Street-aligned block frontage along real OSM primary/secondary/tertiary streets!
  for (const r of roads) {
    if (r.el === 1 || r.hw === 'motorway') continue;
    const isCommercialAvenue = r.hw === 'trunk' || r.hw === 'primary' || r.hw === 'secondary';
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 24) continue;

      const angle = Math.atan2(dz, dx);
      const nx = -dz / segLen;
      const nz = dx / segLen;
      const step = isCommercialAvenue ? 32 : 28;

      for (let dist = 16; dist < segLen - 12; dist += step) {
        const px = ax + (dx * dist) / segLen;
        const pz = az + (dz * dist) / segLen;
        if (Math.abs(px) > 12_500 || Math.abs(pz) > 11_000) continue;

        for (const side of [-1, 1]) {
          // Row 1: Street frontage
          const rnd1 = hashDet(px, pz, side * 13 + 7);
          const w1 = (isCommercialAvenue ? 18 : 14) + rnd1 * 12;
          const d1 = (isCommercialAvenue ? 14 : 11) + hashDet(px, pz, side * 29) * 8;
          const off1 = r.w * 0.5 + d1 * 0.5 + 10;
          const nearCore = Math.hypot(px, pz) < 6800;
          const h1 = isCommercialAvenue
            ? (nearCore ? 18 : 13) + hashDet(px, pz, side * 41) * (nearCore ? 20 : 12)
            : 9 + hashDet(px, pz, side * 53) * 10;
          const t1 = isCommercialAvenue && (nearCore || rnd1 > 0.4) ? 'c' : 'r';

          tryPlaceInfill(
            px + nx * side * off1,
            pz + nz * side * off1,
            w1,
            d1,
            angle,
            h1,
            t1,
            nextInfillId,
          );

          // Row 2: Inner residential block behind frontage
          const rnd2 = hashDet(px, pz, side * 71 + 3);
          const w2 = 13 + rnd2 * 11;
          const d2 = 11 + hashDet(px, pz, side * 83) * 8;
          const off2 = off1 + d1 * 0.5 + d2 * 0.5 + 10;
          const h2 = 8.5 + hashDet(px, pz, side * 97) * 9.5;
          tryPlaceInfill(
            px + nx * side * off2,
            pz + nz * side * off2,
            w2,
            d2,
            angle,
            h2,
            'r',
            nextInfillId,
          );
        }
      }
    }
  }

  // Pass 4b: Fill interior of real OSM urban landuse polygons (commercial/residential/industrial)
  for (let bi = 0; bi < landuseBlocks.length; bi++) {
    const blk = landuseBlocks[bi];
    if (blk.kind === 'railway') continue;
    const b = polyBounds(blk.pts);
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    if (spanX < 40 || spanZ < 40) continue;

    // Align interior parcels to the longest edge of the landuse block
    let blockAngle = 0;
    let bestEdge = 0;
    for (let i = 0; i < blk.pts.length - 1; i++) {
      const len = Math.hypot(blk.pts[i + 1][0] - blk.pts[i][0], blk.pts[i + 1][1] - blk.pts[i][1]);
      if (len > bestEdge) {
        bestEdge = len;
        blockAngle = Math.atan2(blk.pts[i + 1][1] - blk.pts[i][1], blk.pts[i + 1][0] - blk.pts[i][0]);
      }
    }

    const spacing = blk.kind === 'commercial' ? 36 : 30;
    for (let x = b.minX + 18; x < b.maxX - 18; x += spacing) {
      for (let z = b.minZ + 18; z < b.maxZ - 18; z += spacing) {
        if (!pointInPolygon(x, z, blk.pts)) continue;
        const r1 = hashDet(x, z, bi + 5);
        const r2 = hashDet(x, z, bi + 19);
        const w = (blk.kind === 'industrial' ? 20 : 13) + r1 * 11;
        const d = (blk.kind === 'industrial' ? 16 : 11) + r2 * 9;
        const h =
          blk.kind === 'commercial'
            ? 15 + hashDet(x, z, 101) * 18
            : blk.kind === 'industrial'
              ? 10 + hashDet(x, z, 107) * 10
              : 8 + hashDet(x, z, 113) * 9;
        const t = blk.kind === 'commercial' ? 'c' : 'r';
        tryPlaceInfill(x, z, w, d, blockAngle, h, t, nextInfillId);
      }
    }
  }

  // ---- 5. Write Clean Spatial Chunks & Coverage Manifest ----
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.startsWith('chunk_') && f.endsWith('.json')) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }

  const chunkMetaList = [];
  let finalBuildingCount = 0;
  let finalFootprintCount = 0;
  let osmExplicitHeight = 0;
  let osmLevels = 0;
  let osmInferred = 0;
  let schematicInfill = 0;

  for (const [key, entry] of [...selectedByChunk.entries()].sort()) {
    const combined = [...entry.real, ...entry.infill];
    if (combined.length === 0) continue;

    for (const b of combined) {
      if (b.hb === 'o') osmExplicitHeight++;
      else if (b.hb === 'l') osmLevels++;
      else if (b.hb === 'i') osmInferred++;
      else if (b.hb === 'p') schematicInfill++;
    }

    const fileName = `chunk_${key}.json`;
    fs.writeFileSync(
      path.join(OUT_DIR, fileName),
      JSON.stringify({ key, cx: entry.chx, cz: entry.chz, hub: entry.hubChunk, buildings: combined }),
    );
    finalBuildingCount += combined.length;
    finalFootprintCount += combined.filter((b) => b.p).length;

    const centerX = (entry.chx + 0.5) * CHUNK_SIZE;
    const centerZ = (entry.chz + 0.5) * CHUNK_SIZE;
    chunkMetaList.push({
      key,
      cx: entry.chx,
      cz: entry.chz,
      file: fileName,
      hub: entry.hubChunk,
      count: combined.length,
      realCount: entry.real.length,
      infillCount: entry.infill.length,
      centerX: round0(centerX),
      centerZ: round0(centerZ),
    });
  }

  const totalRealOsm = osmExplicitHeight + osmLevels + osmInferred;
  const manifest = {
    generatedAt: new Date().toISOString(),
    license: 'ODbL 1.0 (OpenStreetMap Contributors)',
    licenseNotice:
      'Isolated ODbL 1.0 urban GIS chunks derived from OpenStreetMap. Never mixed into core data/processed/atlas.json. Heights tagged hb="i" are OSM footprint-inferred; blocks tagged hb="p" are road/landuse-aligned schematic street-block infill (not official building surveys).',
    chunkSizeMeters: CHUNK_SIZE,
    origin: { lon: ORIGIN_LON, lat: ORIGIN_LAT },
    totalChunks: chunkMetaList.length,
    totalBuildings: finalBuildingCount,
    totalDetailedFootprints: finalFootprintCount,
    coverage: {
      osmExplicitHeight,
      osmLevels,
      osmInferred,
      schematicInfill,
      totalRealOsm,
      landuseBlocks: landuseBlocks.length,
      roadSegments: roads.length,
      parks: parkPolygons.length,
      waterBodies: waterPolygons.length + riverLines.length,
    },
    chunks: chunkMetaList,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `\nUrban chunk build complete: ${chunkMetaList.length} chunks, ${finalBuildingCount} total buildings (${totalRealOsm} real OSM [height=${osmExplicitHeight}, levels=${osmLevels}, inferred=${osmInferred}] + ${schematicInfill} schematic street-block infill; ${finalFootprintCount} detailed polygons).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
