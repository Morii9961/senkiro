#!/usr/bin/env node
/**
 * Reproducible data build pipeline (`npm run data:build`).
 * Transforms verified open raw sources in data/raw/ + data/manual/reference-metadata.json into:
 *   1. data/processed/atlas.json         (CC BY 4.0 / Public Data License 1.0 + manual-verified; NO ODbL!)
 *   2. data/sources.json                 (All SourceRecords including basemap, rules, synthetic tariff, OSM)
 *   3. data/processed/osm-vertical.json  (ISOLATED ODbL 1.0 share-alike vertical layer for 3D view)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const MANUAL_PATH = path.join(ROOT, 'data', 'manual', 'reference-metadata.json');
const PROCESSED_DIR = path.join(ROOT, 'data', 'processed');

fs.mkdirSync(PROCESSED_DIR, { recursive: true });

// ---- Utilities ----

function haversineMeters(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2)));
}

function normalizeStationNameJa(raw) {
  return String(raw)
    .trim()
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[（(〈《][^）)〉》]*[）)〉》]/g, '')
    .replace(/駅$/, '')
    .replace(/ヶ/g, 'ケ')
    .replace(/ヵ/g, 'カ')
    .replace(/ノ/g, 'の')
    .replace(/ッ/g, 'ツ')
    .replace(/麹/g, '麴')
    .replace(/桧/g, '檜');
}

function slugifyAscii(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function roundCoord(c) {
  return [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
}

function midpointOfFeature(feature) {
  const geom = feature.geometry;
  if (geom.type === 'Point') return geom.coordinates;
  if (geom.type === 'LineString') {
    const pts = geom.coordinates;
    const mid = pts[Math.floor(pts.length / 2)];
    return mid;
  }
  return geom.coordinates[0][0];
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = vals[i] ?? '';
    }
    return obj;
  });
}

// Simplify polyline if it has many dense points (keep start, end, and points > minMeters apart)
function simplifyCoords(coords, minMeters = 45) {
  if (coords.length <= 2) return coords.map(roundCoord);
  const out = [roundCoord(coords[0])];
  let last = coords[0];
  for (let i = 1; i < coords.length - 1; i++) {
    if (haversineMeters(last, coords[i]) >= minMeters) {
      out.push(roundCoord(coords[i]));
      last = coords[i];
    }
  }
  out.push(roundCoord(coords[coords.length - 1]));
  return out;
}

// ---- Spatial Track Graph Builder from KSJ N02-24 RailroadSection ----

function coordKey(pt) {
  // ~15m snapping tolerance for KSJ track endpoints
  return `${Math.round(pt[0] * 5000)},${Math.round(pt[1] * 5000)}`;
}

function buildSectionGraph(sectionFeatures) {
  const nodes = new Map(); // key -> { coord, edges: [{ to, coords, dist }] }
  const ensureNode = (coord) => {
    const key = coordKey(coord);
    if (!nodes.has(key)) {
      nodes.set(key, { key, coord, edges: [] });
    }
    return key;
  };

  for (const f of sectionFeatures) {
    if (f.geometry.type !== 'LineString') continue;
    const pts = f.geometry.coordinates;
    if (pts.length < 2) continue;
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversineMeters(pts[i - 1], pts[i]);
    }
    const kStart = ensureNode(pts[0]);
    const kEnd = ensureNode(pts[pts.length - 1]);
    if (kStart === kEnd) continue;
    nodes.get(kStart).edges.push({ to: kEnd, coords: pts, dist });
    nodes.get(kEnd).edges.push({ to: kStart, coords: [...pts].reverse(), dist });
  }
  return nodes;
}

function findNearestNodeKey(graph, coord, maxDistMeters = 1200) {
  let bestKey = null;
  let bestDist = maxDistMeters;
  for (const [key, node] of graph.entries()) {
    const d = haversineMeters(coord, node.coord);
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }
  return bestKey;
}

function traceTrackGeometry(graph, fromCoord, toCoord) {
  const straightDist = haversineMeters(fromCoord, toCoord);
  if (graph.size === 0) return [roundCoord(fromCoord), roundCoord(toCoord)];
  const startKey = findNearestNodeKey(graph, fromCoord, 1400);
  const endKey = findNearestNodeKey(graph, toCoord, 1400);
  if (!startKey || !endKey || startKey === endKey) {
    return [roundCoord(fromCoord), roundCoord(toCoord)];
  }

  // Dijkstra with bounded distance (<= 2.3x straight distance + 1500m)
  const maxAllowed = Math.max(straightDist * 2.35 + 1500, 3500);
  const distMap = new Map([[startKey, 0]]);
  const prev = new Map();
  const visited = new Set();
  const pq = [[0, startKey]];

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endKey) break;
    if (d > maxAllowed) continue;

    const node = graph.get(u);
    if (!node) continue;
    for (const edge of node.edges) {
      if (visited.has(edge.to)) continue;
      const nd = d + edge.dist;
      if (nd <= maxAllowed && nd < (distMap.get(edge.to) ?? Infinity)) {
        distMap.set(edge.to, nd);
        prev.set(edge.to, { from: u, coords: edge.coords });
        pq.push([nd, edge.to]);
      }
    }
  }

  if (!prev.has(endKey)) {
    return [roundCoord(fromCoord), roundCoord(toCoord)];
  }

  const segments = [];
  let cur = endKey;
  while (cur !== startKey) {
    const step = prev.get(cur);
    segments.push(step.coords);
    cur = step.from;
  }
  segments.reverse();

  const merged = [fromCoord];
  for (const seg of segments) {
    for (const pt of seg) {
      const prevPt = merged[merged.length - 1];
      if (haversineMeters(prevPt, pt) > 5) {
        merged.push(pt);
      }
    }
  }
  if (haversineMeters(merged[merged.length - 1], toCoord) > 5) {
    merged.push(toCoord);
  }
  return simplifyCoords(merged, 40);
}

// ---- Main Build ----

function main() {
  const ksjZipPath = path.join(RAW_DIR, 'ksj-n02.zip');
  const toeiZipPath = path.join(RAW_DIR, 'odpt-toei-train-gtfs.zip');
  const osmPath = path.join(RAW_DIR, 'osm-rail-vertical.json');

  if (!fs.existsSync(ksjZipPath) || !fs.existsSync(toeiZipPath)) {
    console.error('Missing raw data files in data/raw/. Run `npm run data:fetch` first.');
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
  const generatedAt = new Date().toISOString();
  const lastVerifiedAt = meta.lastVerifiedAt;

  console.log('Loading MLIT KSJ N02-24 GeoJSON...');
  const ksjZip = new AdmZip(ksjZipPath);
  const ksjStations = JSON.parse(ksjZip.readAsText('UTF-8/N02-24_Station.geojson')).features;
  const ksjSections = JSON.parse(ksjZip.readAsText('UTF-8/N02-24_RailroadSection.geojson')).features;

  console.log('Loading ODPT Toei Train GTFS...');
  const toeiZip = new AdmZip(toeiZipPath);
  const gtfsRoutes = parseCsv(toeiZip.readAsText('routes.txt'));
  const gtfsStops = parseCsv(toeiZip.readAsText('stops.txt'));
  const gtfsTranslations = parseCsv(toeiZip.readAsText('translations.txt'));
  const gtfsTrips = parseCsv(toeiZip.readAsText('trips.txt'));
  const gtfsStopTimes = parseCsv(toeiZip.readAsText('stop_times.txt'));

  // Build Toei GTFS translations lookup (ja -> { en, kana })
  const toeiStopTranslations = new Map();
  for (const row of gtfsTranslations) {
    if (row.table_name === 'stops' && row.field_name === 'stop_name') {
      const key = row.field_value;
      if (!toeiStopTranslations.has(key)) toeiStopTranslations.set(key, {});
      if (row.language === 'en') toeiStopTranslations.get(key).en = row.translation;
      if (row.language === 'ja-Hrkt') toeiStopTranslations.get(key).kana = row.translation;
    }
  }

  // Build Toei GTFS stop order per route_id by picking the longest trip per route
  const gtfsStopById = new Map(gtfsStops.map((s) => [s.stop_id, s]));
  const tripsByRoute = new Map();
  for (const t of gtfsTrips) {
    if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
    tripsByRoute.get(t.route_id).push(t.trip_id);
  }
  const stopTimesByTrip = new Map();
  for (const st of gtfsStopTimes) {
    if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
    stopTimesByTrip.get(st.trip_id).push(st);
  }

  const gtfsRouteOrderedStops = new Map();
  for (const route of gtfsRoutes) {
    const tripIds = tripsByRoute.get(route.route_id) ?? [];
    let bestSeq = [];
    for (const tid of tripIds) {
      const seq = stopTimesByTrip.get(tid) ?? [];
      if (seq.length > bestSeq.length) bestSeq = seq;
    }
    bestSeq.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const orderedStops = [];
    const seen = new Set();
    for (const st of bestSeq) {
      const stop = gtfsStopById.get(st.stop_id);
      if (!stop) continue;
      // For Oedo loop, allow unique stops in sequence order without duplicating
      if (seen.has(stop.stop_id)) continue;
      seen.add(stop.stop_id);
      orderedStops.push(stop);
    }
    gtfsRouteOrderedStops.set(route.route_id, orderedStops);
  }

  // Index KSJ sections & stations by (operatorKsjName, lineKsjName)
  const ksjSectionsByKey = new Map();
  for (const f of ksjSections) {
    const key = `${f.properties.N02_004}::${f.properties.N02_003}`;
    if (!ksjSectionsByKey.has(key)) ksjSectionsByKey.set(key, []);
    ksjSectionsByKey.get(key).push(f);
  }

  const ksjStationsByKey = new Map();
  for (const f of ksjStations) {
    const key = `${f.properties.N02_004}::${f.properties.N02_003}`;
    if (!ksjStationsByKey.has(key)) ksjStationsByKey.set(key, []);
    ksjStationsByKey.get(key).push(f);
  }

  const opKsjNameById = new Map(meta.operators.map((o) => [o.id, o.ksjName]));
  const sectionGraphCache = new Map();
  const getSectionGraph = (opKsj, lineKsj) => {
    const key = `${opKsj}::${lineKsj}`;
    if (!sectionGraphCache.has(key)) {
      const feats = ksjSectionsByKey.get(key) ?? [];
      // Filter sections roughly inside Kanto + Shizuoka east bbox for speed
      const filtered = feats.filter((f) => {
        const pt = f.geometry.coordinates[0];
        return pt[0] >= 138.8 && pt[0] <= 140.2 && pt[1] >= 35.0 && pt[1] <= 36.1;
      });
      sectionGraphCache.set(key, buildSectionGraph(filtered));
    }
    return sectionGraphCache.get(key);
  };

  // Deduplicate KSJ stations by name within an (operator, line), with same-operator junction fallback
  function lookupKsjStation(opKsj, lineKsj, stationName, bboxFilter = null) {
    const filterFn = (f) => {
      if (normalizeStationNameJa(f.properties.N02_005) !== normalizeStationNameJa(stationName)) {
        return false;
      }
      if (!bboxFilter) return true;
      const pt = midpointOfFeature(f);
      return (
        pt[0] >= bboxFilter.minLon &&
        pt[0] <= bboxFilter.maxLon &&
        pt[1] >= bboxFilter.minLat &&
        pt[1] <= bboxFilter.maxLat
      );
    };
    const key = `${opKsj}::${lineKsj}`;
    let feats = (ksjStationsByKey.get(key) ?? []).filter(filterFn);
    if (feats.length === 0) {
      // Official JR junction stations (e.g., Tokyo on Chuo Line uses Tohoku Line track in MLIT registry)
      feats = ksjStations.filter(
        (f) => f.properties.N02_004 === opKsj && filterFn(f),
      );
    }
    if (feats.length === 0) return null;
    let sumLon = 0;
    let sumLat = 0;
    const codes = new Set();
    for (const f of feats) {
      const pt = midpointOfFeature(f);
      sumLon += pt[0];
      sumLat += pt[1];
      if (f.properties.N02_005c) codes.add(f.properties.N02_005c);
    }
    return {
      jaName: feats[0].properties.N02_005,
      coordinates: roundCoord([sumLon / feats.length, sumLat / feats.length]),
      ksjIds: [...codes],
      ksjGroupId: feats[0].properties.N02_005g ?? null,
    };
  }

  // ---- Build Operators ----
  const operators = meta.operators.map((op) => ({
    id: op.id,
    externalIds: { ksj: op.ksjName },
    names: op.names,
    provenance: {
      sourceIds:
        op.id === 'sk:operator:toei'
          ? ['src-ksj-n02-2024', 'src-odpt-toei-gtfs']
          : ['src-ksj-n02-2024', 'src-manual-verified-tokyo-ref'],
      dataNature: op.coverageStatus === 'none' ? 'manual-verified' : 'derived',
      lastVerifiedAt,
    },
    validFrom: '2024-04-01',
    validTo: null,
    category: op.category,
    brandColor: op.brandColor,
    coverageStatus: op.coverageStatus,
    coverageNotes: op.coverageNotes,
  }));

  // Station registry: keyed by `${operatorId}::${normalizedName}` so same operator's multi-line hubs share ONE Station node!
  const stationsByKey = new Map();
  const stationSlugUsed = new Set();

  function getOrCreateStation({
    operatorId,
    jaName,
    coordinates,
    ksjIds,
    ksjGroupId,
    railLineId,
    stationCode,
    inFareSlice,
    inTokyoSuburbanArea,
    enOverride = null,
    kanaOverride = null,
    extraSourceIds = [],
  }) {
    const norm = normalizeStationNameJa(jaName);
    const key = `${operatorId}::${norm}`;
    if (stationsByKey.has(key)) {
      const existing = stationsByKey.get(key);
      if (!existing.railLineIds.includes(railLineId)) {
        existing.railLineIds.push(railLineId);
      }
      if (!existing.stationCode && stationCode) {
        existing.stationCode = stationCode;
      }
      if (inFareSlice) existing.inFareSlice = true;
      if (inTokyoSuburbanArea) existing.inTokyoSuburbanArea = true;
      if (ksjIds?.length) {
        const cur = existing.externalIds.ksj ? existing.externalIds.ksj.split(',') : [];
        for (const id of ksjIds) {
          if (!cur.includes(id)) cur.push(id);
        }
        existing.externalIds.ksj = cur.join(',');
      }
      for (const sid of extraSourceIds) {
        if (!existing.provenance.sourceIds.includes(sid)) {
          existing.provenance.sourceIds.push(sid);
        }
      }
      return existing;
    }

    const opSlug = operatorId.replace('sk:operator:', '');
    const refNames = meta.stationNamesRef[jaName] ?? meta.stationNamesRef[norm] ?? null;
    const enName = enOverride ?? refNames?.en ?? null;
    const kanaName = kanaOverride ?? refNames?.kana ?? null;

    let baseSlug = enName
      ? `${opSlug}-${slugifyAscii(enName)}`
      : `${opSlug}-${ksjIds?.[0] ?? Buffer.from(jaName).toString('hex').slice(0, 8)}`;
    let slug = baseSlug;
    let suffix = 2;
    while (stationSlugUsed.has(slug)) {
      slug = `${baseSlug}-${suffix++}`;
    }
    stationSlugUsed.add(slug);

    const sourceIds = ['src-ksj-n02-2024'];
    if (refNames || stationCode) sourceIds.push('src-manual-verified-tokyo-ref');
    for (const sid of extraSourceIds) {
      if (!sourceIds.includes(sid)) sourceIds.push(sid);
    }

    const station = {
      id: `sk:station:${slug}`,
      externalIds: {
        ...(ksjIds?.length ? { ksj: ksjIds.join(',') } : {}),
        ...(ksjGroupId ? { ksjGroup: ksjGroupId } : {}),
      },
      names: {
        ja: jaName,
        ja_kana: kanaName,
        en: enName,
      },
      provenance: {
        sourceIds,
        dataNature: 'derived',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId,
      railLineIds: [railLineId],
      stationComplexId: null,
      stationCode: stationCode ?? null,
      coordinates,
      wardOrCity: null,
      inFareSlice: Boolean(inFareSlice),
      inTokyoSuburbanArea: Boolean(inTokyoSuburbanArea),
    };
    stationsByKey.set(key, station);
    return station;
  }

  const railLines = [];
  const trackSegments = [];
  const segmentByPairKey = new Map(); // To share TrackSegment when multiple RailLines share identical physical track (e.g. Chuo & Tohoku Tokyo-Kanda)

  function addTrackSegment({
    fromStation,
    toStation,
    railLineId,
    operatorId,
    geometry,
    operatingKm,
    distanceNature,
    lineClass,
    isShinkansen,
    parallelConventionalLineId,
    inTokyoSuburbanArea,
    sourceIds,
  }) {
    // Same operator, same track class, same shinkansen flag, same endpoints -> share physical TrackSegment
    // EXCEPT distinct parallel corridors (like Nippori-Akabane via Oku vs Oji don't share endpoints because intermediate stops differ!)
    const ordered = [fromStation.id, toStation.id].sort();
    const pairKey = `${operatorId}|${isShinkansen ? 'shink' : 'conv'}|${lineClass}|${ordered[0]}|${ordered[1]}`;

    if (segmentByPairKey.has(pairKey)) {
      const existing = segmentByPairKey.get(pairKey);
      if (!existing.railLineIds.includes(railLineId)) {
        existing.railLineIds.push(railLineId);
      }
      return existing;
    }

    const fromSlug = fromStation.id.replace('sk:station:', '');
    const toSlug = toStation.id.replace('sk:station:', '');
    const lineSlug = railLineId.replace('sk:line:', '');
    const segId = `sk:segment:${lineSlug}--${fromSlug}--${toSlug}`;

    const seg = {
      id: segId,
      externalIds: { ksjLine: railLineId },
      names: {
        ja: `${fromStation.names.ja} — ${toStation.names.ja}`,
        ja_kana: null,
        en:
          fromStation.names.en && toStation.names.en
            ? `${fromStation.names.en} – ${toStation.names.en}`
            : null,
      },
      provenance: {
        sourceIds,
        dataNature: distanceNature === 'manual-verified' ? 'derived' : 'derived',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      fromStationId: fromStation.id,
      toStationId: toStation.id,
      railLineIds: [railLineId],
      operatorId,
      geometry,
      operatingKm,
      distanceNature,
      lineClass,
      isShinkansen,
      parallelConventionalLineId,
      inTokyoSuburbanArea,
    };
    segmentByPairKey.set(pairKey, seg);
    trackSegments.push(seg);
    return seg;
  }

  // ---- 1. Build JR Fare Slice Lines (Verified operating km + KSJ real geometry) ----
  console.log('Building JR Fare Slice lines...');
  const kantoBbox = { minLon: 138.85, maxLon: 140.05, minLat: 35.05, maxLat: 36.0 };

  for (const lineDef of meta.jrFareSliceLines) {
    const opKsj = opKsjNameById.get(lineDef.operatorId);
    const graph = getSectionGraph(opKsj, lineDef.ksjLine);
    const lineStationIds = [];
    const resolvedStops = [];

    for (const stop of lineDef.stops) {
      const ksjHit = lookupKsjStation(opKsj, lineDef.ksjLine, stop.name, kantoBbox);
      if (!ksjHit) {
        throw new Error(`KSJ station not found for JR slice: ${opKsj} / ${lineDef.ksjLine} / ${stop.name}`);
      }
      const st = getOrCreateStation({
        operatorId: lineDef.operatorId,
        jaName: stop.name,
        coordinates: ksjHit.coordinates,
        ksjIds: ksjHit.ksjIds,
        ksjGroupId: ksjHit.ksjGroupId,
        railLineId: lineDef.id,
        stationCode: stop.code,
        inFareSlice: lineDef.inFareSlice,
        inTokyoSuburbanArea: lineDef.inTokyoSuburbanArea,
        extraSourceIds:
          lineDef.operatorId === 'sk:operator:jr-central'
            ? ['src-jr-central-rules']
            : ['src-jr-east-ryokaku-2026'],
      });
      lineStationIds.push(st.id);
      resolvedStops.push({ station: st, cumKm: stop.cumKm });
    }

    for (let i = 0; i < resolvedStops.length - 1; i++) {
      const a = resolvedStops[i];
      const b = resolvedStops[i + 1];
      const operatingKm =
        a.cumKm !== null && b.cumKm !== null
          ? Math.round((b.cumKm - a.cumKm) * 10) / 10
          : null;
      const geom = traceTrackGeometry(graph, a.station.coordinates, b.station.coordinates);
      addTrackSegment({
        fromStation: a.station,
        toStation: b.station,
        railLineId: lineDef.id,
        operatorId: lineDef.operatorId,
        geometry: geom,
        operatingKm,
        distanceNature: operatingKm !== null ? 'manual-verified' : 'unknown',
        lineClass: lineDef.lineClass,
        isShinkansen: lineDef.isShinkansen,
        parallelConventionalLineId: lineDef.parallelConventionalLineId,
        inTokyoSuburbanArea: lineDef.inTokyoSuburbanArea,
        sourceIds: [
          'src-ksj-n02-2024',
          ...(operatingKm !== null
            ? [
                lineDef.operatorId === 'sk:operator:jr-central'
                  ? 'src-jr-central-rules'
                  : 'src-jr-east-ryokaku-2026',
              ]
            : []),
        ],
      });
    }

    railLines.push({
      id: lineDef.id,
      externalIds: { ksj: `${opKsj}::${lineDef.ksjLine}` },
      names: lineDef.names,
      provenance: {
        sourceIds: [
          'src-ksj-n02-2024',
          lineDef.operatorId === 'sk:operator:jr-central'
            ? 'src-jr-central-rules'
            : 'src-jr-east-ryokaku-2026',
        ],
        dataNature: 'derived',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId: lineDef.operatorId,
      color: lineDef.color,
      stationCodePrefix: lineDef.stationCodePrefix,
      lineClass: lineDef.lineClass,
      inFareSlice: lineDef.inFareSlice,
      inTokyoSuburbanArea: lineDef.inTokyoSuburbanArea,
      stationIds: lineStationIds,
      coverageStatus: lineDef.coverageStatus,
    });
  }

  // ---- 2. Build Tokyo 23-Ward Metro, Toei, and Private Lines from KSJ N02-24 ----
  console.log('Building Tokyo 23-ward Metro, Toei, and Private lines...');
  const tokyo23Bbox = { minLon: 139.56, maxLon: 139.92, minLat: 35.53, maxLat: 35.82 };

  for (const lineDef of meta.tokyo23Lines) {
    const opKsj = opKsjNameById.get(lineDef.operatorId);
    const key = `${opKsj}::${lineDef.ksjLine}`;
    const rawFeats = ksjStationsByKey.get(key) ?? [];

    // Deduplicate stations inside Tokyo 23 wards bbox
    const dedup = new Map();
    for (const f of rawFeats) {
      const pt = midpointOfFeature(f);
      if (
        pt[0] < tokyo23Bbox.minLon ||
        pt[0] > tokyo23Bbox.maxLon ||
        pt[1] < tokyo23Bbox.minLat ||
        pt[1] > tokyo23Bbox.maxLat
      ) {
        continue;
      }
      const name = f.properties.N02_005;
      const norm = normalizeStationNameJa(name);
      if (!dedup.has(norm)) {
        dedup.set(norm, { jaName: name, pts: [], ksjIds: new Set(), ksjGroupId: f.properties.N02_005g ?? null });
      }
      const entry = dedup.get(norm);
      entry.pts.push(pt);
      if (f.properties.N02_005c) entry.ksjIds.add(f.properties.N02_005c);
    }

    const candidates = [...dedup.values()].map((e) => {
      const lon = e.pts.reduce((s, p) => s + p[0], 0) / e.pts.length;
      const lat = e.pts.reduce((s, p) => s + p[1], 0) / e.pts.length;
      return {
        jaName: e.jaName,
        norm: normalizeStationNameJa(e.jaName),
        coordinates: roundCoord([lon, lat]),
        ksjIds: [...e.ksjIds],
        ksjGroupId: e.ksjGroupId,
      };
    });

    if (candidates.length < 2) {
      console.warn(`Skipping ${lineDef.id}: only ${candidates.length} stations in bbox`);
      continue;
    }

    // Order stations continuously:
    // - For Toei lines: use official ODPT GTFS stop order!
    // - For other lines: order greedily along nearest neighbor starting from the most extreme terminal
    let ordered = [];
    if (lineDef.gtfsRouteId && gtfsRouteOrderedStops.has(lineDef.gtfsRouteId)) {
      const gtfsOrdered = gtfsRouteOrderedStops.get(lineDef.gtfsRouteId);
      const byNorm = new Map(candidates.map((c) => [c.norm, c]));
      for (const gs of gtfsOrdered) {
        const match = byNorm.get(normalizeStationNameJa(gs.stop_name));
        if (match && !ordered.includes(match)) {
          ordered.push(match);
        }
      }
      // Append any remaining KSJ stations if not matched
      for (const c of candidates) {
        if (!ordered.includes(c)) ordered.push(c);
      }
    } else {
      // Find terminal endpoint using sum of distances to two nearest neighbors (endpoints have smallest degree / largest avg neighbor dist)
      // Pick the station with maximum distance to centroid as starting terminal
      const cx = candidates.reduce((s, c) => s + c.coordinates[0], 0) / candidates.length;
      const cy = candidates.reduce((s, c) => s + c.coordinates[1], 0) / candidates.length;
      let startIdx = 0;
      let maxD = -1;
      for (let i = 0; i < candidates.length; i++) {
        const d = haversineMeters([cx, cy], candidates[i].coordinates);
        if (d > maxD) {
          maxD = d;
          startIdx = i;
        }
      }
      const remaining = new Set(candidates.map((_, i) => i));
      let curIdx = startIdx;
      ordered.push(candidates[curIdx]);
      remaining.delete(curIdx);
      while (remaining.size > 0) {
        let nearestIdx = -1;
        let nearestDist = Infinity;
        for (const idx of remaining) {
          const d = haversineMeters(candidates[curIdx].coordinates, candidates[idx].coordinates);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = idx;
          }
        }
        ordered.push(candidates[nearestIdx]);
        remaining.delete(nearestIdx);
        curIdx = nearestIdx;
      }
    }

    const graph = getSectionGraph(opKsj, lineDef.ksjLine);
    const lineStationIds = [];
    const resolvedStations = [];

    for (const c of ordered) {
      const st = getOrCreateStation({
        operatorId: lineDef.operatorId,
        jaName: c.jaName,
        coordinates: c.coordinates,
        ksjIds: c.ksjIds,
        ksjGroupId: c.ksjGroupId,
        railLineId: lineDef.id,
        stationCode: null,
        inFareSlice: false,
        inTokyoSuburbanArea: false,
      });
      lineStationIds.push(st.id);
      resolvedStations.push(st);
    }

    for (let i = 0; i < resolvedStations.length - 1; i++) {
      const a = resolvedStations[i];
      const b = resolvedStations[i + 1];
      const geom = traceTrackGeometry(graph, a.coordinates, b.coordinates);
      addTrackSegment({
        fromStation: a,
        toStation: b,
        railLineId: lineDef.id,
        operatorId: lineDef.operatorId,
        geometry: geom,
        operatingKm: null,
        distanceNature: 'unknown',
        lineClass: lineDef.lineClass,
        isShinkansen: false,
        parallelConventionalLineId: null,
        inTokyoSuburbanArea: false,
        sourceIds: ['src-ksj-n02-2024'],
      });
    }

    railLines.push({
      id: lineDef.id,
      externalIds: {
        ksj: `${opKsj}::${lineDef.ksjLine}`,
        ...(lineDef.gtfsRouteId ? { odptGtfsRoute: lineDef.gtfsRouteId } : {}),
      },
      names: {
        ja: lineDef.ja,
        ja_kana: lineDef.kana,
        en: lineDef.en,
      },
      provenance: {
        sourceIds: lineDef.gtfsRouteId
          ? ['src-ksj-n02-2024', 'src-odpt-toei-gtfs']
          : ['src-ksj-n02-2024', 'src-manual-verified-tokyo-ref'],
        dataNature: 'derived',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId: lineDef.operatorId,
      color: lineDef.color,
      stationCodePrefix: lineDef.prefix,
      lineClass: lineDef.lineClass,
      inFareSlice: false,
      inTokyoSuburbanArea: false,
      stationIds: lineStationIds,
      coverageStatus: lineDef.coverageStatus,
    });
  }

  // ---- 3. Cross-Source Alignment: ODPT Toei GTFS stops -> Canonical KSJ Toei Stations ----
  console.log('Running cross-source alignment (ODPT Toei GTFS <-> KSJ N02-24)...');
  const stations = [...stationsByKey.values()];
  const stationById = new Map(stations.map((s) => [s.id, s]));

  // Map GTFS stop_id -> route_long_name
  const stopToRouteName = new Map();
  for (const route of gtfsRoutes) {
    const stopsForRoute = gtfsRouteOrderedStops.get(route.route_id) ?? [];
    for (const st of stopsForRoute) {
      if (!stopToRouteName.has(st.stop_id)) {
        stopToRouteName.set(st.stop_id, route.route_long_name);
      }
    }
  }

  const toeiLineMap = {
    浅草線: 'sk:line:toei-asakusa',
    三田線: 'sk:line:toei-mita',
    新宿線: 'sk:line:toei-shinjuku',
    大江戸線: 'sk:line:toei-oedo',
  };

  const unalignedRecords = [];
  let alignedToeiCount = 0;

  for (const gs of gtfsStops) {
    const routeName = stopToRouteName.get(gs.stop_id) ?? 'unknown';
    const lineHint = toeiLineMap[routeName] ?? null;
    const gCoord = [Number(gs.stop_lon), Number(gs.stop_lat)];
    const norm = normalizeStationNameJa(gs.stop_name);

    if (!lineHint) {
      unalignedRecords.push({
        sourceId: 'src-odpt-toei-gtfs',
        externalId: `gtfs:${gs.stop_id}`,
        rawName: gs.stop_name,
        operatorRaw: '東京都交通局',
        lineRaw: routeName,
        coordinates: gCoord,
        reason: `Route "${routeName}" is outside the 4-line Toei Subway scope (explicitly retained as unaligned, not silently dropped)`,
      });
      continue;
    }

    const candidates = stations.filter(
      (s) =>
        s.operatorId === 'sk:operator:toei' &&
        normalizeStationNameJa(s.names.ja ?? '') === norm &&
        s.railLineIds.includes(lineHint),
    );
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = haversineMeters(gCoord, c.coordinates);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (!best || bestDist > 650) {
      unalignedRecords.push({
        sourceId: 'src-odpt-toei-gtfs',
        externalId: `gtfs:${gs.stop_id}`,
        rawName: gs.stop_name,
        operatorRaw: '東京都交通局',
        lineRaw: routeName,
        coordinates: gCoord,
        reason: best
          ? `Spatial guard exceeded (${Math.round(bestDist)}m > 650m)`
          : `No canonical Toei station match for "${gs.stop_name}" on ${lineHint}`,
      });
      continue;
    }

    // Enrich aligned Toei station with official ODPT GTFS metadata
    best.externalIds.odptGtfs = best.externalIds.odptGtfs
      ? `${best.externalIds.odptGtfs},${gs.stop_id}`
      : gs.stop_id;
    if (gs.stop_code && !best.stationCode) {
      best.stationCode = gs.stop_code;
    }
    const trans = toeiStopTranslations.get(gs.stop_name);
    if (trans?.en && !best.names.en) best.names.en = trans.en;
    if (trans?.kana && !best.names.ja_kana) best.names.ja_kana = trans.kana;
    if (!best.provenance.sourceIds.includes('src-odpt-toei-gtfs')) {
      best.provenance.sourceIds.push('src-odpt-toei-gtfs');
    }
    alignedToeiCount++;
  }
  console.log(`Aligned ${alignedToeiCount} ODPT Toei GTFS stops; ${unalignedRecords.length} unaligned records preserved.`);

  // ---- 4. StationComplex & Interchange Construction ----
  console.log('Building StationComplexes and Interchanges...');
  const stationComplexes = [];
  const interchanges = [];
  const assignedComplexByStationId = new Map();

  const findStationByOpAndName = (opId, name) =>
    stationsByKey.get(`${opId}::${normalizeStationNameJa(name)}`) ?? null;

  // 4a. Apply explicit verified complex rules first (guards against false merges like 新宿 vs 新宿三丁目 vs 西武新宿!)
  for (const rule of meta.explicitComplexRules) {
    const members = [];
    for (const m of rule.memberMatch) {
      const st = findStationByOpAndName(m.operatorId, m.stationName);
      if (st) members.push(st);
    }
    if (members.length === 0) continue;

    const avgLon = members.reduce((s, m) => s + m.coordinates[0], 0) / members.length;
    const avgLat = members.reduce((s, m) => s + m.coordinates[1], 0) / members.length;

    const complex = {
      id: rule.id,
      externalIds: {},
      names: rule.names,
      provenance: {
        sourceIds: ['src-ksj-n02-2024', 'src-manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      stationIds: members.map((m) => m.id),
      coordinates: roundCoord([avgLon, avgLat]),
      wardOrCity: null,
    };
    stationComplexes.push(complex);
    for (const m of members) {
      m.stationComplexId = complex.id;
      assignedComplexByStationId.set(m.id, complex.id);
    }

    for (const ic of rule.interchanges) {
      const fromSt = findStationByOpAndName(ic.fromOp, ic.fromName);
      const toSt = findStationByOpAndName(ic.toOp, ic.toName);
      if (!fromSt || !toSt) continue;
      interchanges.push({
        id: `sk:interchange:${fromSt.id.replace('sk:station:', '')}--${toSt.id.replace('sk:station:', '')}`,
        externalIds: {},
        names: {
          ja: `${fromSt.names.ja} ↔ ${toSt.names.ja}`,
          ja_kana: null,
          en:
            fromSt.names.en && toSt.names.en
              ? `${fromSt.names.en} ↔ ${toSt.names.en}`
              : null,
        },
        provenance: {
          sourceIds: ['src-manual-verified-tokyo-ref'],
          dataNature: 'manual-verified',
          lastVerifiedAt,
        },
        validFrom: '2024-04-01',
        validTo: null,
        fromStationId: fromSt.id,
        toStationId: toSt.id,
        stationComplexId: complex.id,
        gateType: ic.gateType,
        walkingMinutes: ic.walkingMinutes,
        notes: ic.notes,
      });
    }
  }

  // 4b. Auto-group remaining multi-operator hubs sharing exact normalized name within 350m
  // Gate type is explicitly marked 'unknown' (honesty rule: never fabricate in_gate vs out_of_gate!)
  const unassigned = stations.filter((s) => !assignedComplexByStationId.has(s.id));
  const visitedForComplex = new Set();
  for (const st of unassigned) {
    if (visitedForComplex.has(st.id)) continue;
    const norm = normalizeStationNameJa(st.names.ja ?? '');
    const cluster = [st];
    visitedForComplex.add(st.id);

    for (const other of unassigned) {
      if (visitedForComplex.has(other.id)) continue;
      if (
        normalizeStationNameJa(other.names.ja ?? '') === norm &&
        haversineMeters(st.coordinates, other.coordinates) <= 350
      ) {
        cluster.push(other);
        visitedForComplex.add(other.id);
      }
    }

    const baseSlug = st.names.en
      ? slugifyAscii(st.names.en)
      : st.id.replace('sk:station:', '');
    let complexId = `sk:complex:${baseSlug}`;
    if (stationComplexes.some((c) => c.id === complexId)) {
      complexId = `sk:complex:${st.id.replace('sk:station:', '')}`;
    }

    const avgLon = cluster.reduce((s, m) => s + m.coordinates[0], 0) / cluster.length;
    const avgLat = cluster.reduce((s, m) => s + m.coordinates[1], 0) / cluster.length;

    const complex = {
      id: complexId,
      externalIds: {},
      names: {
        ja: `${st.names.ja}駅`,
        ja_kana: st.names.ja_kana,
        en: st.names.en ? `${st.names.en} Station` : null,
      },
      provenance: {
        sourceIds: ['src-ksj-n02-2024'],
        dataNature: 'derived',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      stationIds: cluster.map((m) => m.id),
      coordinates: roundCoord([avgLon, avgLat]),
      wardOrCity: null,
    };
    stationComplexes.push(complex);
    for (const m of cluster) {
      m.stationComplexId = complex.id;
      assignedComplexByStationId.set(m.id, complex.id);
    }

    if (cluster.length > 1) {
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          interchanges.push({
            id: `sk:interchange:${cluster[i].id.replace('sk:station:', '')}--${cluster[j].id.replace('sk:station:', '')}`,
            externalIds: {},
            names: {
              ja: `${cluster[i].names.ja} ↔ ${cluster[j].names.ja}`,
              ja_kana: null,
              en:
                cluster[i].names.en && cluster[j].names.en
                  ? `${cluster[i].names.en} ↔ ${cluster[j].names.en}`
                  : null,
            },
            provenance: {
              sourceIds: ['src-ksj-n02-2024'],
              dataNature: 'derived',
              lastVerifiedAt,
            },
            validFrom: '2024-04-01',
            validTo: null,
            fromStationId: cluster[i].id,
            toStationId: cluster[j].id,
            stationComplexId: complex.id,
            gateType: 'unknown',
            walkingMinutes: null,
            notes: '空間近接（≤350m）と同一駅名から自動検出。改札内外区分は未検証（unknown）。',
          });
        }
      }
    }
  }

  // ---- 5. ThroughServices & ServicePatterns (Separate Operating Service Graph!) ----
  const throughServices = meta.throughServices.map((ts) => {
    const boundary = findStationByOpAndName(ts.boundaryOperatorId, ts.boundaryStationName);
    if (!boundary) {
      throw new Error(`Boundary station missing for throughService ${ts.id}: ${ts.boundaryStationName}`);
    }
    return {
      id: ts.id,
      externalIds: {},
      names: ts.names,
      provenance: {
        sourceIds: ['src-manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      boundaryStationId: boundary.id,
      fromRailLineId: ts.fromRailLineId,
      toRailLineId: ts.toRailLineId,
      operatorIds: ts.operatorIds,
      serviceDescription: ts.serviceDescription,
      notes: ts.notes,
    };
  });

  const getLineStops = (lineId) => railLines.find((l) => l.id === lineId)?.stationIds ?? [];

  const servicePatterns = [
    {
      id: 'sk:service:yamanote-loop',
      externalIds: {},
      names: {
        ja: '山手線 環状運転系統（東海道線・東北線・山手線直通）',
        ja_kana: 'やまのてせんかんじょううんてん',
        en: 'Yamanote Loop Service (across Tokaido + Tohoku + Yamanote tracks)',
      },
      provenance: {
        sourceIds: ['src-ksj-n02-2024', 'src-manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId: 'sk:operator:jr-east',
      railLineIds: ['sk:line:jr-east-yamanote', 'sk:line:jr-east-tokaido', 'sk:line:jr-east-tohoku'],
      serviceCategory: '環状運転 / Loop Local',
      stopStationIds: getLineStops('sk:line:jr-east-yamanote'),
      throughServiceId: null,
    },
    {
      id: 'sk:service:ueno-tokyo-line',
      externalIds: {},
      names: {
        ja: '上野東京ライン（東北本線・東海道本線直通）',
        ja_kana: 'うえのとうきょうらいん',
        en: 'Ueno-Tokyo Line (Tohoku ↔ Tokaido Through Service)',
      },
      provenance: {
        sourceIds: ['src-manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId: 'sk:operator:jr-east',
      railLineIds: ['sk:line:jr-east-tohoku', 'sk:line:jr-east-tohoku-oku', 'sk:line:jr-east-tokaido'],
      serviceCategory: '中距離直通 / Regional Through',
      stopStationIds: ['大宮', '浦和', '赤羽', '尾久', '上野', '東京', '新橋', '品川', '川崎', '横浜', '大船', '小田原', '熱海']
        .map((n) => findStationByOpAndName('sk:operator:jr-east', n)?.id)
        .filter(Boolean),
      throughServiceId: null,
    },
    {
      id: 'sk:service:chiyoda-three-company',
      externalIds: {},
      names: {
        ja: '千代田線・JR常磐緩行・小田急線 3社相互直通',
        ja_kana: 'ちよだせんさんしゃちょくつう',
        en: 'Chiyoda / Joban Local / Odakyu 3-Operator Through Service',
      },
      provenance: {
        sourceIds: ['src-manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId: 'sk:operator:tokyo-metro',
      railLineIds: ['sk:line:odakyu-odawara', 'sk:line:metro-chiyoda', 'sk:line:jr-east-joban'],
      serviceCategory: '三社相互直通 / 3-Operator Through',
      stopStationIds: getLineStops('sk:line:metro-chiyoda'),
      throughServiceId: 'sk:through:chiyoda-joban',
    },
    {
      id: 'sk:service:asakusa-keikyu-keisei',
      externalIds: {},
      names: {
        ja: '都営浅草線・京急線・京成線 相互直通系統',
        ja_kana: 'あさくさせん・けいきゅう・けいせいちょくつう',
        en: 'Toei Asakusa / Keikyu / Keisei Through Service',
      },
      provenance: {
        sourceIds: ['src-odpt-toei-gtfs', 'src-manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt,
      },
      validFrom: '2024-04-01',
      validTo: null,
      operatorId: 'sk:operator:toei',
      railLineIds: ['sk:line:keikyu-main', 'sk:line:toei-asakusa', 'sk:line:keisei-oshiage'],
      serviceCategory: '空港直通 / Airport Through',
      stopStationIds: getLineStops('sk:line:toei-asakusa'),
      throughServiceId: 'sk:through:asakusa-keikyu',
    },
  ];

  // ---- 6. Write Core Atlas Dataset (ZERO ODbL!) & Sources Registry ----
  const coreSources = meta.sources.filter((s) => !s.shareAlike);
  const atlasDataset = {
    generatedAt,
    sources: coreSources,
    operators,
    railLines,
    stations,
    stationComplexes,
    trackSegments,
    interchanges,
    servicePatterns,
    throughServices,
    unalignedRecords,
  };

  fs.writeFileSync(
    path.join(PROCESSED_DIR, 'atlas.json'),
    JSON.stringify(atlasDataset, null, 2),
  );
  fs.writeFileSync(
    path.join(ROOT, 'data', 'sources.json'),
    JSON.stringify(meta.sources, null, 2),
  );

  console.log(
    `Core atlas.json written: ${operators.length} operators, ${railLines.length} lines, ${stations.length} stations, ${stationComplexes.length} complexes, ${trackSegments.length} segments, ${interchanges.length} interchanges, ${throughServices.length} throughServices.`,
  );

  // ---- 7. Build ISOLATED ODbL Vertical Layer (data/processed/osm-vertical.json) ----
  console.log('Building isolated ODbL vertical layer (osm-vertical.json)...');
  const osmSource = meta.sources.find((s) => s.id === 'src-osm-overpass-vertical');
  const osmRaw = fs.existsSync(osmPath)
    ? JSON.parse(fs.readFileSync(osmPath, 'utf8')).elements ?? []
    : [];

  // Build spatial grid (0.01 deg ~ 1 km cells) over OSM ways
  const grid = new Map();
  const cellKey = (lon, lat) => `${Math.floor(lon * 100)},${Math.floor(lat * 100)}`;
  for (const el of osmRaw) {
    if (!el.center || !el.tags) continue;
    const ck = cellKey(el.center.lon, el.center.lat);
    if (!grid.has(ck)) grid.set(ck, []);
    grid.get(ck).push(el);
  }

  const TUNNEL_POSITIVE = new Set(['yes', 'building_passage', 'avalanche_protector']);
  const BRIDGE_POSITIVE = new Set(['yes', 'viaduct', 'cantilever', 'movable', 'trestle', 'aqueduct']);

  const verticalRecords = [];
  const counts = { elevated: 0, at_grade: 0, underground: 0, unknown: 0 };

  for (const seg of trackSegments) {
    const geom = seg.geometry;
    // Sample up to 3 points along segment (start-ish, mid, end-ish)
    const samplePts = [];
    if (geom.length >= 3) {
      samplePts.push(geom[Math.floor(geom.length * 0.25)]);
      samplePts.push(geom[Math.floor(geom.length * 0.5)]);
      samplePts.push(geom[Math.floor(geom.length * 0.75)]);
    } else if (geom.length === 2) {
      samplePts.push([
        (geom[0][0] + geom[1][0]) / 2,
        (geom[0][1] + geom[1][1]) / 2,
      ]);
    }

    const matchedWays = new Map();
    const wantSubway = seg.lineClass === 'metro';

    for (const pt of samplePts) {
      const gx = Math.floor(pt[0] * 100);
      const gy = Math.floor(pt[1] * 100);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${gx + dx},${gy + dy}`);
          if (!bucket) continue;
          for (const el of bucket) {
            const d = haversineMeters(pt, [el.center.lon, el.center.lat]);
            if (d > 140) continue;
            // Filter loosely by railway type to avoid matching surface JR tracks to deep subways right underneath
            const rw = el.tags.railway;
            if (wantSubway && rw !== 'subway' && !TUNNEL_POSITIVE.has(el.tags.tunnel ?? '')) {
              continue;
            }
            if (!wantSubway && rw === 'subway') {
              continue;
            }
            matchedWays.set(el.id, el);
          }
        }
      }
    }

    const ways = [...matchedWays.values()];
    const tunnelVals = [];
    const bridgeVals = [];
    const layerVals = [];
    let tunnelHits = 0;
    let bridgeHits = 0;
    let explicitSurfaceHits = 0;

    for (const w of ways) {
      const t = w.tags.tunnel;
      const b = w.tags.bridge;
      const l = w.tags.layer;
      if (t) {
        tunnelVals.push(t);
        if (TUNNEL_POSITIVE.has(t)) tunnelHits++;
      }
      if (b) {
        bridgeVals.push(b);
        if (BRIDGE_POSITIVE.has(b)) bridgeHits++;
      }
      if (l !== undefined && /^-?\d+$/.test(String(l).trim())) {
        layerVals.push(Number.parseInt(String(l).trim(), 10));
      }
      // Explicit surface indicator: railway way present with neither tunnel nor bridge, or embankment/cutting
      if (
        !TUNNEL_POSITIVE.has(t ?? '') &&
        !BRIDGE_POSITIVE.has(b ?? '') &&
        (t === 'no' || b === 'no' || w.tags.embankment === 'yes' || w.tags.cutting === 'yes' || (w.tags.railway === 'rail' && l === undefined))
      ) {
        explicitSurfaceHits++;
      }
    }

    // Strict non-guessing classification:
    // NEVER infer underground/elevated purely from `layer`!
    let verticalClass = 'unknown';
    if (tunnelHits > 0 && tunnelHits >= bridgeHits && tunnelHits >= explicitSurfaceHits) {
      verticalClass = 'underground';
    } else if (bridgeHits > 0 && bridgeHits > tunnelHits && bridgeHits >= explicitSurfaceHits) {
      verticalClass = 'elevated';
    } else if (explicitSurfaceHits > 0 && tunnelHits === 0 && bridgeHits === 0) {
      verticalClass = 'at_grade';
    } else {
      verticalClass = 'unknown';
    }

    let verticalOrder = null;
    if (layerVals.length > 0) {
      layerVals.sort((a, b) => a - b);
      verticalOrder = layerVals[Math.floor(layerVals.length / 2)];
    }

    counts[verticalClass]++;
    verticalRecords.push({
      trackSegmentId: seg.id,
      verticalClass,
      verticalOrder,
      elevationM: null, // ALWAYS null unless backed by a manual-verified official elevation source
      osmEvidence: {
        wayCount: ways.length,
        tunnelValues: [...new Set(tunnelVals)],
        bridgeValues: [...new Set(bridgeVals)],
        layerValues: [...new Set(layerVals)],
      },
      provenance: {
        sourceIds: ['src-osm-overpass-vertical'],
        dataNature: 'derived',
        lastVerifiedAt,
      },
    });
  }

  const osmVerticalDataset = {
    generatedAt,
    licenseNotice:
      'Isolated ODbL 1.0 (share-alike) dataset derived exclusively from OpenStreetMap railway tags. Kept separate from data/processed/atlas.json (CC BY / Public Data License). Vertical displacements in 3D view are schematic only and do NOT represent true height or depth.',
    source: osmSource,
    records: verticalRecords,
  };

  fs.writeFileSync(
    path.join(PROCESSED_DIR, 'osm-vertical.json'),
    JSON.stringify(osmVerticalDataset, null, 2),
  );
  console.log('Isolated osm-vertical.json written. Distribution:', counts);
}

main();
