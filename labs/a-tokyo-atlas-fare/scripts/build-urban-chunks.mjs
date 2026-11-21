#!/usr/bin/env node
/**
 * Reproducible Urban 3D Chunk Builder (`npm run data:urban`).
 *
 * Processes raw OpenStreetMap Tokyo 23-ward data in data/raw/urban/ (ODbL 1.0, gitignored)
 * into isolated, spatially-chunked, LOD-ready JSON assets under public/data/urban-chunks/:
 *   - manifest.json            (chunk index, stats, ODbL license notice, landmark anchors)
 *   - base-environment.json    (real OSM water/rivers/moats, parks, major roads, intersections)
 *   - chunk_{cx}_{cz}.json     (2km x 2km spatial tiles of real OSM buildings with footprints,
 *                               oriented bounding boxes for InstancedMesh LOD, height & basis)
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

/**
 * Computes centroid, oriented bounding box (using longest edge alignment), and footprint area.
 */
function analyzeBuildingFootprint(worldPts) {
  if (worldPts.length < 3) return null;
  // Drop closing duplicate vertex if identical
  const pts =
    worldPts.length > 3 &&
    Math.hypot(
      worldPts[0][0] - worldPts[worldPts.length - 1][0],
      worldPts[0][1] - worldPts[worldPts.length - 1][1],
    ) < 0.5
      ? worldPts.slice(0, -1)
      : worldPts;
  if (pts.length < 3) return null;

  // Shoelace area & centroid
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
  if (area < 36 || area > 120_000) return null;

  if (Math.abs(area2) > 1e-3) {
    cx /= 3 * area2;
    cz /= 3 * area2;
  } else {
    cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  }

  // Dominant orientation from longest polygon edge
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

  // Project onto dominant axes to obtain clean OBB width & depth
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
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

  // Simplify footprint vertices relative to centroid for compact JSON
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

  // Parse explicit height
  let height = null;
  let hb = 'i'; // 'o'=osm height, 'l'=osm levels, 'i'=inferred
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

  let typology = 'r'; // 'c'=commercial, 'o'=office/highrise, 'r'=residential, 's'=station/public
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
    // Deterministic schematic height inferred from typology & footprint area (honestly tagged hb='i')
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

/**
 * Streaming reader for huge Overpass JSON arrays (e.g., 337MB urban-buildings-23w-tall.json)
 * Extracts each top-level element inside `"elements": [...]` without loading the entire file into a single V8 string.
 */
async function streamOverpassElements(filePath, onElement) {
  if (!fs.existsSync(filePath)) return 0;
  const stat = fs.statSync(filePath);
  // Small files (< 60 MB): fast direct parse
  if (stat.size < 60 * 1024 * 1024) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const els = parsed.elements ?? [];
    for (const el of els) onElement(el);
    return els.length;
  }

  // Large files: stream line-by-line / brace-matched objects inside "elements"
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
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
        } else {
          if (ch === '"') {
            inString = true;
          } else if (ch === '{') {
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0) {
              try {
                const el = JSON.parse(buf);
                onElement(el);
                count++;
              } catch {
                // Skip malformed fragment if any
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

// Curated Tokyo Landmarks (real WGS84 coordinates, procedural multi-part silhouettes generated in BuildingGenerator!)
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

async function main() {
  console.log('Building spatial railway corridor clearance grid from atlas.json...');
  const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8'));
  const vertData = fs.existsSync(VERT_PATH)
    ? JSON.parse(fs.readFileSync(VERT_PATH, 'utf8'))
    : { records: [] };
  const vertBySeg = new Map(vertData.records.map((r) => [r.trackSegmentId, r.verticalClass]));

  // Grid cell = 20m for fast surface/elevated track clearance check
  const railGrid = new Set();
  const railCellKey = (x, z) => `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
  for (const seg of atlas.trackSegments) {
    const vc = vertBySeg.get(seg.id) ?? 'unknown';
    // Only keep buildings clear of surface/elevated tracks (underground subways run beneath buildings!)
    if (seg.lineClass === 'metro' && vc !== 'elevated') continue;
    const pts = seg.geometry.map(([lon, lat]) => lonLatToWorld(lon, lat));
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 12));
      for (let s = 0; s <= steps; s++) {
        const px = ax + ((bx - ax) * s) / steps;
        const pz = az + ((bz - az) * s) / steps;
        railGrid.add(railCellKey(px, pz));
      }
    }
  }

  function overlapsSurfaceRail(cx, cz) {
    return railGrid.has(railCellKey(cx, cz));
  }

  // ---- 1. Process Water Bodies & Major Parks ----
  console.log('Processing real OSM water bodies and parks...');
  const waterPolygons = [];
  const riverLines = [];
  const parkPolygons = [];

  await streamOverpassElements(path.join(RAW_URBAN, 'urban-water-parks.json'), (el) => {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return;
    const tags = el.tags ?? {};
    const worldPts = el.geometry.map((g) => lonLatToWorld(g.lon, g.lat));
    const isClosed =
      worldPts.length >= 4 &&
      Math.hypot(
        worldPts[0][0] - worldPts[worldPts.length - 1][0],
        worldPts[0][1] - worldPts[worldPts.length - 1][1],
      ) < 15;

    if (tags.natural === 'water' || tags.waterway === 'riverbank') {
      if (!isClosed) return;
      const simp = simplifyLine(worldPts, 14);
      if (simp.length < 4) return;
      // Filter tiny ponds < 35m extent
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of simp) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      if (maxX - minX < 35 && maxZ - minZ < 35) return;
      waterPolygons.push({
        name: tags.name ?? null,
        pts: simp.map(([x, z]) => [round0(x), round0(z)]),
      });
    } else if (tags.waterway === 'river') {
      const simp = simplifyLine(worldPts, 22);
      if (simp.length >= 2) {
        riverLines.push({
          name: tags.name ?? null,
          width: tags.name?.includes('荒川') ? 160 : tags.name?.includes('隅田川') ? 110 : 32,
          pts: simp.map(([x, z]) => [round0(x), round0(z)]),
        });
      }
    } else if (tags.leisure === 'park' || tags.landuse === 'forest') {
      if (!isClosed) return;
      const simp = simplifyLine(worldPts, 18);
      if (simp.length < 4) return;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of simp) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      if ((maxX - minX) * (maxZ - minZ) < 18_000) return;
      parkPolygons.push({
        name: tags.name ?? null,
        pts: simp.map(([x, z]) => [round0(x), round0(z)]),
      });
    }
  });

  // ---- 2. Process Major Roads & Compute Intersections ----
  console.log('Processing real OSM major roads and intersections...');
  const roads = [];
  const roadEndpointCounts = new Map(); // "rx,rz" -> { x, z, count, maxW }

  await streamOverpassElements(path.join(RAW_URBAN, 'urban-roads.json'), (el) => {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return;
    const tags = el.tags ?? {};
    const hw = tags.highway ?? '';
    if (!['motorway', 'trunk', 'primary', 'secondary'].includes(hw)) return;
    const worldPts = el.geometry.map((g) => lonLatToWorld(g.lon, g.lat));
    const simp = simplifyLine(worldPts, 16);
    if (simp.length < 2) return;
    const width =
      hw === 'motorway' ? 16 : hw === 'trunk' ? 18 : hw === 'primary' ? 13 : 9;
    const elevated = tags.bridge === 'yes' || tags.bridge === 'viaduct' || hw === 'motorway';
    const tunnel = tags.tunnel === 'yes';
    if (tunnel) return; // Skip underground road tunnels to keep subway view super clear!

    roads.push({
      hw,
      w: width,
      el: elevated ? 1 : 0,
      pts: simp.map(([x, z]) => [round0(x), round0(z)]),
    });

    // Track road intersections via quantized 25m buckets on start/end vertices
    for (const pt of [simp[0], simp[simp.length - 1]]) {
      const k = `${Math.round(pt[0] / 25)},${Math.round(pt[1] / 25)}`;
      const rec = roadEndpointCounts.get(k);
      if (rec) {
        rec.count++;
        rec.maxW = Math.max(rec.maxW, width);
      } else {
        roadEndpointCounts.set(k, { x: round0(pt[0]), z: round0(pt[1]), count: 1, maxW: width });
      }
    }
  });

  const intersections = [];
  for (const rec of roadEndpointCounts.values()) {
    if (rec.count >= 3) {
      intersections.push([rec.x, rec.z, Math.round(rec.maxW * 0.72)]);
    }
  }

  // Write base-environment.json
  const landmarksWorld = TOKYO_LANDMARKS.map((lm) => {
    const [x, z] = lonLatToWorld(lm.lon, lm.lat);
    return { ...lm, x: round1(x), z: round1(z) };
  });

  const baseEnvironment = {
    generatedAt: new Date().toISOString(),
    license: 'ODbL 1.0 (OpenStreetMap Contributors)',
    origin: { lon: ORIGIN_LON, lat: ORIGIN_LAT },
    waterPolygons,
    riverLines,
    parkPolygons,
    roads,
    intersections: intersections.slice(0, 1200),
    landmarks: landmarksWorld,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'base-environment.json'),
    JSON.stringify(baseEnvironment),
  );
  console.log(
    `Wrote base-environment.json: ${waterPolygons.length} water polys, ${riverLines.length} rivers, ${parkPolygons.length} parks, ${roads.length} major roads, ${Math.min(intersections.length, 1200)} intersections, ${landmarksWorld.length} landmarks.`,
  );

  // ---- 3. Stream & Spatially Chunk Real OSM Buildings (2km x 2km tiles!) ----
  // Define high-detail focus hub centers (Shibuya, Shinjuku, Tokyo/Marunouchi/Ginza, Ikebukuro, Shinagawa, Ueno/Akihabara, Roppongi)
  const focusCenters = [
    lonLatToWorld(139.7016, 35.6580), // Shibuya
    lonLatToWorld(139.7004, 35.6896), // Shinjuku
    lonLatToWorld(139.7662, 35.6826), // Tokyo / Otemachi
    lonLatToWorld(139.7109, 35.7295), // Ikebukuro
    lonLatToWorld(139.7390, 35.6285), // Shinagawa
    lonLatToWorld(139.7760, 35.7060), // Ueno / Akihabara
    lonLatToWorld(139.7292, 35.6605), // Roppongi
  ];

  function isNearFocusHub(x, z) {
    return focusCenters.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 1250);
  }

  function isNearLandmark(x, z) {
    return landmarksWorld.some((lm) => Math.hypot(x - lm.x, z - lm.z) < (lm.radius ?? 34) + 18);
  }

  const chunks = new Map(); // "cx_cz" -> Map<osmId, buildingRecord>
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

    // Limit to Tokyo 23 wards operational metropolitan extent (-15km..+14km E-W, -13km..+13km N-S)
    if (Math.abs(geom.cx) > 15_000 || Math.abs(geom.cz) > 13_500) return;

    const meta = classifyBuilding(el.tags, geom.area);
    const inHub = isCoreHubFile || isNearFocusHub(geom.cx, geom.cz);

    // Filter out tiny residential sheds in outer wards to keep metropolitan chunks fast & crisp
    if (!inHub && meta.h < 14 && geom.area < 280) return;

    // Avoid duplicating hero landmarks with generic OSM boxes right on top of them
    if (isNearLandmark(geom.cx, geom.cz) && meta.h > 40) return;

    // Railway corridor clearance guard (except actual station terminal buildings!)
    if (meta.t !== 's' && overlapsSurfaceRail(geom.cx, geom.cz)) {
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
      // Retain full simplified footprint polygon for core hub buildings & tall towers (>28m)!
      poly: inHub || meta.h >= 28 ? geom.poly : null,
      score: (inHub ? 1000 : 0) + meta.h * 4 + Math.sqrt(geom.area) * 1.5,
    });
    totalRawProcessed++;
  }

  console.log('Streaming core hub buildings (Shibuya, Shinjuku, Tokyo/Marunouchi/Ginza)...');
  await streamOverpassElements(
    path.join(RAW_URBAN, 'urban-buildings-core-hubs.json'),
    (el) => ingestBuildingElement(el, true),
  );

  console.log('Streaming 23-ward tall & secondary hub buildings (337MB stream)...');
  const tallCount = await streamOverpassElements(
    path.join(RAW_URBAN, 'urban-buildings-23w-tall.json'),
    (el) => ingestBuildingElement(el, false),
  );
  console.log(`Scanned ${tallCount} 23-ward raw elements; kept ${totalRawProcessed} buildings before per-chunk budget cap (${totalSkippedRailOverlap} skipped for surface rail clearance).`);

  // Cap each chunk cleanly (high budget in focus hub chunks, balanced budget in outer chunks)
  // so total browser memory & repo size stay super nimble!
  // Clean old chunks first
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.startsWith('chunk_') && f.endsWith('.json')) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }

  const chunkMetaList = [];
  let finalBuildingCount = 0;
  let finalFootprintCount = 0;

  for (const [key, list] of [...chunks.entries()].sort()) {
    const [chx, chz] = key.split('_').map(Number);
    const centerX = (chx + 0.5) * CHUNK_SIZE;
    const centerZ = (chz + 0.5) * CHUNK_SIZE;
    const hubChunk = focusCenters.some(([fx, fz]) => Math.hypot(centerX - fx, centerZ - fz) < 2400);
    const cap = hubChunk ? 620 : 210;

    list.sort((a, b) => b.score - a.score);
    const selected = list.slice(0, cap).map((b) => ({
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
    }));

    if (selected.length === 0) continue;
    const fileName = `chunk_${key}.json`;
    fs.writeFileSync(
      path.join(OUT_DIR, fileName),
      JSON.stringify({ key, cx: chx, cz: chz, hub: hubChunk, buildings: selected }),
    );
    finalBuildingCount += selected.length;
    finalFootprintCount += selected.filter((b) => b.p).length;

    chunkMetaList.push({
      key,
      cx: chx,
      cz: chz,
      file: fileName,
      hub: hubChunk,
      count: selected.length,
      centerX: round0(centerX),
      centerZ: round0(centerZ),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    license: 'ODbL 1.0 (OpenStreetMap Contributors)',
    licenseNotice:
      'Isolated ODbL 1.0 urban GIS chunks derived from OpenStreetMap. Never mixed into core data/processed/atlas.json. Building heights tagged hb="i" are schematic inferences, not official surveys.',
    chunkSizeMeters: CHUNK_SIZE,
    origin: { lon: ORIGIN_LON, lat: ORIGIN_LAT },
    totalChunks: chunkMetaList.length,
    totalBuildings: finalBuildingCount,
    totalDetailedFootprints: finalFootprintCount,
    chunks: chunkMetaList,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `\nUrban chunk build complete: ${chunkMetaList.length} chunks, ${finalBuildingCount} real OSM buildings (${finalFootprintCount} detailed footprints) written to public/data/urban-chunks/.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
