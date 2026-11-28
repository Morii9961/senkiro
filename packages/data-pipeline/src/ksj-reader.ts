import path from 'node:path';
import type { LonLat, SkId, TrackSegment } from '@senkiro/contracts';
import { haversineMeters, normalizeStationNameJa } from '@senkiro/domain-core';
import { openZipFile } from './zip-reader.ts';

/** `[minLon, minLat, maxLon, maxLat]` */
export type GeoBBox = readonly [number, number, number, number];

/** Default Kansai bounding box (spec §M1): excludes distant same-name stations such as Hyogo Bantan 竹田 or Shikoku 三条. */
export const KANSAI_BBOX: GeoBBox = [134.6, 34.2, 136.35, 35.35];

export const DEFAULT_LOCAL_RAW_DIR = 'E:/SENKIRO/.local-raw-backup/a-tokyo-atlas-fare/raw';

export function resolveRawDir(overrideDir?: string): string {
  const fromEnv = process.env.SENKIRO_RAW_DIR;
  if (overrideDir !== undefined && overrideDir.trim().length > 0) {
    return overrideDir;
  }
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return DEFAULT_LOCAL_RAW_DIR;
}

export function resolveKsjZipPath(overrideDir?: string): string {
  return path.join(resolveRawDir(overrideDir), 'ksj-n02.zip');
}

export interface KsjStationFeature {
  operatorName: string;
  lineName: string;
  stationName: string;
  stationCode: string;
  groupCode: string;
  geometryPoints: LonLat[];
  midpoint: LonLat;
}

export interface KsjRailroadSectionFeature {
  operatorName: string;
  lineName: string;
  railwayType: string;
  serviceCategory: string;
  geometryPoints: LonLat[];
}

export interface KsjArchiveData {
  stations: KsjStationFeature[];
  sections: KsjRailroadSectionFeature[];
}

interface RawGeoJsonFeature {
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
}

interface RawGeoJsonCollection {
  features?: RawGeoJsonFeature[];
}

function asLonLatArray(rawCoords: unknown): LonLat[] {
  if (!Array.isArray(rawCoords)) {
    return [];
  }
  if (
    rawCoords.length >= 2 &&
    typeof rawCoords[0] === 'number' &&
    typeof rawCoords[1] === 'number'
  ) {
    return [[rawCoords[0], rawCoords[1]]];
  }
  const out: LonLat[] = [];
  for (const item of rawCoords) {
    if (
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number'
    ) {
      out.push([item[0], item[1]]);
    }
  }
  return out;
}

function extractFeaturePoints(geometry: RawGeoJsonFeature['geometry']): LonLat[] {
  if (geometry === undefined) {
    return [];
  }
  if (geometry.type === 'Point') {
    return asLonLatArray(geometry.coordinates);
  }
  if (geometry.type === 'LineString') {
    return asLonLatArray(geometry.coordinates);
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    const first = geometry.coordinates[0];
    return asLonLatArray(first);
  }
  return [];
}

function midpointOf(pts: readonly LonLat[]): LonLat {
  const first = pts[0];
  if (first === undefined) {
    return [0, 0];
  }
  const mid = pts[Math.floor(pts.length / 2)];
  return mid ?? first;
}

function pointInBBox(pt: LonLat, bbox: GeoBBox): boolean {
  return pt[0] >= bbox[0] && pt[0] <= bbox[2] && pt[1] >= bbox[1] && pt[1] <= bbox[3];
}

function padBBox(bbox: GeoBBox, padDeg: number): GeoBBox {
  return [bbox[0] - padDeg, bbox[1] - padDeg, bbox[2] + padDeg, bbox[3] + padDeg];
}

function propString(props: Record<string, unknown> | undefined, key: string): string {
  const val = props?.[key];
  return typeof val === 'string' ? val : String(val ?? '');
}

export interface ReadKsjOptions {
  bbox?: GeoBBox;
  operators?: ReadonlySet<string>;
}

/**
 * Stream-read `UTF-8/N02-24_Station.geojson` and `UTF-8/N02-24_RailroadSection.geojson`
 * from `ksj-n02.zip` without modifying the archive on disk.
 */
export function readKsjN02Archive(zipPath: string, options: ReadKsjOptions = {}): KsjArchiveData {
  const archive = openZipFile(zipPath);
  const stationJson = JSON.parse(
    archive.readText('UTF-8/N02-24_Station.geojson'),
  ) as RawGeoJsonCollection;
  const sectionJson = JSON.parse(
    archive.readText('UTF-8/N02-24_RailroadSection.geojson'),
  ) as RawGeoJsonCollection;

  const bbox = options.bbox;
  const sectionBbox = bbox === undefined ? undefined : padBBox(bbox, 0.08);
  const operators = options.operators;

  const stations: KsjStationFeature[] = [];
  for (const raw of stationJson.features ?? []) {
    const operatorName = propString(raw.properties, 'N02_004');
    if (operators !== undefined && !operators.has(operatorName)) {
      continue;
    }
    const pts = extractFeaturePoints(raw.geometry);
    if (pts.length === 0) {
      continue;
    }
    const mid = midpointOf(pts);
    if (bbox !== undefined && !pointInBBox(mid, bbox)) {
      continue;
    }
    stations.push({
      operatorName,
      lineName: propString(raw.properties, 'N02_003'),
      stationName: propString(raw.properties, 'N02_005'),
      stationCode: propString(raw.properties, 'N02_005c'),
      groupCode: propString(raw.properties, 'N02_005g'),
      geometryPoints: pts,
      midpoint: mid,
    });
  }

  const sections: KsjRailroadSectionFeature[] = [];
  for (const raw of sectionJson.features ?? []) {
    const operatorName = propString(raw.properties, 'N02_004');
    if (operators !== undefined && !operators.has(operatorName)) {
      continue;
    }
    const pts = extractFeaturePoints(raw.geometry);
    if (pts.length < 2) {
      continue;
    }
    if (sectionBbox !== undefined && !pts.some((pt) => pointInBBox(pt, sectionBbox))) {
      continue;
    }
    sections.push({
      operatorName,
      lineName: propString(raw.properties, 'N02_003'),
      railwayType: propString(raw.properties, 'N02_001'),
      serviceCategory: propString(raw.properties, 'N02_002'),
      geometryPoints: pts,
    });
  }

  return { stations, sections };
}

export interface ExtractedKsjStationNode {
  key: string;
  operatorName: string;
  lineName: string;
  stationName: string;
  normalizedName: string;
  stationCodes: string[];
  groupCodes: string[];
  coordinates: LonLat;
  endpointKeys: string[];
}

export interface ExtractedKsjSegmentEdge {
  operatorName: string;
  lineName: string;
  fromKey: string;
  toKey: string;
  geometry: LonLat[];
}

export interface ExtractedKsjLineTopology {
  stations: ExtractedKsjStationNode[];
  segments: ExtractedKsjSegmentEdge[];
}

function roundCoord(pt: LonLat): LonLat {
  return [Math.round(pt[0] * 1e5) / 1e5, Math.round(pt[1] * 1e5) / 1e5];
}

function coordKey(pt: LonLat): string {
  return `${Math.round(pt[0] * 1e5)},${Math.round(pt[1] * 1e5)}`;
}

function simplifyPolyline(coords: readonly LonLat[], minMeters = 45): LonLat[] {
  const first = coords[0];
  const lastRaw = coords[coords.length - 1];
  if (first === undefined || lastRaw === undefined) {
    return [];
  }
  if (coords.length <= 2) {
    return coords.map(roundCoord);
  }
  const out: LonLat[] = [roundCoord(first)];
  let lastKept = first;
  for (let i = 1; i < coords.length - 1; i++) {
    const pt = coords[i];
    if (pt !== undefined && haversineMeters(lastKept, pt) >= minMeters) {
      out.push(roundCoord(pt));
      lastKept = pt;
    }
  }
  const roundedEnd = roundCoord(lastRaw);
  const prevOut = out[out.length - 1];
  if (prevOut === undefined || prevOut[0] !== roundedEnd[0] || prevOut[1] !== roundedEnd[1]) {
    out.push(roundedEnd);
  }
  return out;
}

function polylineLengthMeters(pts: readonly LonLat[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a !== undefined && b !== undefined) {
      total += haversineMeters(a, b);
    }
  }
  return total;
}

/**
 * Reconstruct clean adjacent-station segments for a single KSJ `(operatorName, lineName)` pair
 * by matching `Station` platform endpoints to `RailroadSection` vertices and walking through
 * intermediate non-station track junctions.
 */
export function extractLineTopologyFromKsj(
  stations: readonly KsjStationFeature[],
  sections: readonly KsjRailroadSectionFeature[],
): ExtractedKsjLineTopology {
  const groupedStations: ExtractedKsjStationNode[] = [];
  const nodeKeyToStation = new Map<string, ExtractedKsjStationNode>();

  for (const feat of stations) {
    const normalized = normalizeStationNameJa(feat.stationName);
    let target = groupedStations.find(
      (s) =>
        s.stationCodes.includes(feat.stationCode) ||
        (s.normalizedName === normalized && haversineMeters(s.coordinates, feat.midpoint) < 500),
    );
    if (target === undefined) {
      const stationKey = `${feat.operatorName}::${feat.lineName}::${feat.stationCode || normalized}`;
      target = {
        key: stationKey,
        operatorName: feat.operatorName,
        lineName: feat.lineName,
        stationName: feat.stationName,
        normalizedName: normalized,
        stationCodes: [],
        groupCodes: [],
        coordinates: roundCoord(feat.midpoint),
        endpointKeys: [],
      };
      groupedStations.push(target);
    }
    if (feat.stationCode.length > 0 && !target.stationCodes.includes(feat.stationCode)) {
      target.stationCodes.push(feat.stationCode);
    }
    if (feat.groupCode.length > 0 && !target.groupCodes.includes(feat.groupCode)) {
      target.groupCodes.push(feat.groupCode);
    }
    for (const pt of feat.geometryPoints) {
      const k = coordKey(pt);
      if (!target.endpointKeys.includes(k)) {
        target.endpointKeys.push(k);
      }
      nodeKeyToStation.set(k, target);
    }
  }

  interface AdjEdge {
    to: string;
    coords: LonLat[];
    lengthM: number;
  }
  const adj = new Map<string, AdjEdge[]>();
  const coordByNodeKey = new Map<string, LonLat>();

  const addDirected = (from: string, to: string, coords: LonLat[], lengthM: number): void => {
    const list = adj.get(from);
    if (list === undefined) {
      adj.set(from, [{ to, coords, lengthM }]);
    } else {
      list.push({ to, coords, lengthM });
    }
  };

  for (const sec of sections) {
    const pts = sec.geometryPoints;
    const firstPt = pts[0];
    const lastPt = pts[pts.length - 1];
    if (firstPt === undefined || lastPt === undefined) {
      continue;
    }
    const startKey = coordKey(firstPt);
    const endKey = coordKey(lastPt);
    coordByNodeKey.set(startKey, firstPt);
    coordByNodeKey.set(endKey, lastPt);

    const stA = nodeKeyToStation.get(startKey);
    const stB = nodeKeyToStation.get(endKey);
    if (stA !== undefined && stB !== undefined && stA.key === stB.key) {
      continue;
    }

    const len = polylineLengthMeters(pts);
    addDirected(startKey, endKey, [...pts], len);
    addDirected(endKey, startKey, [...pts].reverse(), len);
  }

  // Fallback snap: if any station has zero directly matched adj edges, link nearest section node within 300m
  for (const st of groupedStations) {
    const hasEdge = st.endpointKeys.some((k) => (adj.get(k)?.length ?? 0) > 0);
    if (hasEdge) {
      continue;
    }
    let bestKey: string | null = null;
    let bestDist = 300;
    for (const [k, coord] of coordByNodeKey.entries()) {
      const owner = nodeKeyToStation.get(k);
      if (owner !== undefined && owner.key !== st.key) {
        continue;
      }
      const dist = haversineMeters(st.coordinates, coord);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = k;
      }
    }
    if (bestKey !== null) {
      st.endpointKeys.push(bestKey);
      nodeKeyToStation.set(bestKey, st);
    }
  }

  const bestPairGeometry = new Map<
    string,
    { fromKey: string; toKey: string; coords: LonLat[]; lengthM: number }
  >();

  const recordPair = (
    a: ExtractedKsjStationNode,
    b: ExtractedKsjStationNode,
    coords: LonLat[],
    lengthM: number,
  ): void => {
    const ordered = a.key < b.key ? [a, b] : [b, a];
    const firstSt = ordered[0];
    const secondSt = ordered[1];
    if (firstSt === undefined || secondSt === undefined) {
      return;
    }
    const pairKey = `${firstSt.key}__${secondSt.key}`;
    const existing = bestPairGeometry.get(pairKey);
    if (existing === undefined || lengthM < existing.lengthM) {
      const orientedCoords = a.key < b.key ? coords : [...coords].reverse();
      bestPairGeometry.set(pairKey, {
        fromKey: firstSt.key,
        toKey: secondSt.key,
        coords: orientedCoords,
        lengthM,
      });
    }
  };

  for (const startStation of groupedStations) {
    for (const seedNodeKey of startStation.endpointKeys) {
      const initialEdges = adj.get(seedNodeKey) ?? [];
      for (const firstEdge of initialEdges) {
        const directTarget = nodeKeyToStation.get(firstEdge.to);
        if (directTarget !== undefined) {
          if (directTarget.key !== startStation.key) {
            recordPair(startStation, directTarget, firstEdge.coords, firstEdge.lengthM);
          }
          continue;
        }

        // Dijkstra through non-station intermediate nodes to reach next adjacent stations
        const distMap = new Map<string, number>([[firstEdge.to, firstEdge.lengthM]]);
        const prevMap = new Map<string, { prevNode: string; coords: LonLat[] }>([
          [firstEdge.to, { prevNode: seedNodeKey, coords: firstEdge.coords }],
        ]);
        const visited = new Set<string>([seedNodeKey]);
        const queue: Array<{ dist: number; node: string }> = [
          { dist: firstEdge.lengthM, node: firstEdge.to },
        ];

        while (queue.length > 0) {
          queue.sort((a, b) => a.dist - b.dist);
          const cur = queue.shift();
          if (cur === undefined || visited.has(cur.node)) {
            continue;
          }
          visited.add(cur.node);

          const reachedStation = nodeKeyToStation.get(cur.node);
          if (reachedStation !== undefined) {
            if (reachedStation.key !== startStation.key) {
              const chain: LonLat[][] = [];
              let cursor = cur.node;
              while (cursor !== seedNodeKey) {
                const step = prevMap.get(cursor);
                if (step === undefined) {
                  break;
                }
                chain.push(step.coords);
                cursor = step.prevNode;
              }
              chain.reverse();
              const merged: LonLat[] = [];
              for (const part of chain) {
                for (const pt of part) {
                  const last = merged[merged.length - 1];
                  if (last === undefined || last[0] !== pt[0] || last[1] !== pt[1]) {
                    merged.push(pt);
                  }
                }
              }
              recordPair(startStation, reachedStation, merged, cur.dist);
            }
            continue;
          }

          if (cur.dist > 45_000) {
            continue;
          }

          for (const nextEdge of adj.get(cur.node) ?? []) {
            if (visited.has(nextEdge.to)) {
              continue;
            }
            const nextDist = cur.dist + nextEdge.lengthM;
            if (nextDist < (distMap.get(nextEdge.to) ?? Number.POSITIVE_INFINITY)) {
              distMap.set(nextEdge.to, nextDist);
              prevMap.set(nextEdge.to, { prevNode: cur.node, coords: nextEdge.coords });
              queue.push({ dist: nextDist, node: nextEdge.to });
            }
          }
        }
      }
    }
  }

  const lineMetaStation = groupedStations[0];
  const operatorName = lineMetaStation?.operatorName ?? '';
  const lineName = lineMetaStation?.lineName ?? '';
  const segments: ExtractedKsjSegmentEdge[] = [];
  for (const entry of [...bestPairGeometry.values()].sort((a, b) =>
    `${a.fromKey}--${a.toKey}`.localeCompare(`${b.fromKey}--${b.toKey}`),
  )) {
    segments.push({
      operatorName,
      lineName,
      fromKey: entry.fromKey,
      toKey: entry.toKey,
      geometry: simplifyPolyline(entry.coords, 45),
    });
  }

  return { stations: groupedStations, segments };
}

export interface TokaidoSanyoSplitConfig {
  maibaraStationId: SkId<'station'>;
  kyotoStationId: SkId<'station'>;
  osakaStationId: SkId<'station'>;
  kobeStationId: SkId<'station'>;
  himejiStationId: SkId<'station'>;
  biwakoLineId: SkId<'line'>;
  kyotoLineId: SkId<'line'>;
  kobeLineId: SkId<'line'>;
}

function reachableWithoutBoundaries(
  startId: SkId<'station'>,
  stopAt: ReadonlySet<SkId<'station'>>,
  adj: ReadonlyMap<SkId<'station'>, ReadonlyArray<{ to: SkId<'station'>; segId: SkId<'segment'> }>>,
): Set<SkId<'segment'>> {
  const visitedStations = new Set<SkId<'station'>>([startId]);
  const visitedSegments = new Set<SkId<'segment'>>();
  const queue: SkId<'station'>[] = [startId];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) {
      continue;
    }
    if (cur !== startId && stopAt.has(cur)) {
      continue;
    }
    for (const edge of adj.get(cur) ?? []) {
      visitedSegments.add(edge.segId);
      if (!visitedStations.has(edge.to)) {
        visitedStations.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return visitedSegments;
}

function shortestPathSegments(
  startId: SkId<'station'>,
  endId: SkId<'station'>,
  adj: ReadonlyMap<SkId<'station'>, ReadonlyArray<{ to: SkId<'station'>; segId: SkId<'segment'> }>>,
): Set<SkId<'segment'>> {
  const prev = new Map<SkId<'station'>, { from: SkId<'station'>; segId: SkId<'segment'> }>();
  const visited = new Set<SkId<'station'>>([startId]);
  const queue: SkId<'station'>[] = [startId];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) {
      continue;
    }
    if (cur === endId) {
      break;
    }
    for (const edge of adj.get(cur) ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        prev.set(edge.to, { from: cur, segId: edge.segId });
        queue.push(edge.to);
      }
    }
  }

  const segIds = new Set<SkId<'segment'>>();
  let cursor: SkId<'station'> = endId;
  while (cursor !== startId) {
    const step = prev.get(cursor);
    if (step === undefined) {
      return new Set();
    }
    segIds.add(step.segId);
    cursor = step.from;
  }
  return segIds;
}

/**
 * Deterministic nickname split for JR West `東海道線` and `山陽線` (spec §2.2):
 * - 米原 — 京都 → `biwakoLineId` (`jr-west-biwako`)
 * - 京都 — 大阪 → `kyotoLineId` (`jr-west-kyoto`)
 * - 大阪 — 神戸 — 姫路 → `kobeLineId` (`jr-west-kobe`)
 * Preserves the raw KSJ line provenance in `externalIds.ksj`.
 */
export function splitJrWestTokaidoSanyoLine(
  tokaidoSegments: readonly TrackSegment[],
  sanyoSegments: readonly TrackSegment[],
  config: TokaidoSanyoSplitConfig,
): TrackSegment[] {
  const buildAdj = (segs: readonly TrackSegment[]) => {
    const adj = new Map<SkId<'station'>, Array<{ to: SkId<'station'>; segId: SkId<'segment'> }>>();
    const push = (from: SkId<'station'>, to: SkId<'station'>, segId: SkId<'segment'>): void => {
      const list = adj.get(from);
      if (list === undefined) {
        adj.set(from, [{ to, segId }]);
      } else {
        list.push({ to, segId });
      }
    };
    for (const seg of segs) {
      push(seg.fromStationId, seg.toStationId, seg.id);
      push(seg.toStationId, seg.fromStationId, seg.id);
    }
    return adj;
  };

  const tokaidoAdj = buildAdj(tokaidoSegments);
  const biwakoIds = reachableWithoutBoundaries(
    config.maibaraStationId,
    new Set([config.kyotoStationId]),
    tokaidoAdj,
  );
  const kyotoIds = shortestPathSegments(config.kyotoStationId, config.osakaStationId, tokaidoAdj);
  const tokaidoKobeIds = reachableWithoutBoundaries(
    config.kobeStationId,
    new Set([config.osakaStationId]),
    tokaidoAdj,
  );

  const sanyoAdj = buildAdj(sanyoSegments);
  const sanyoKobeIds = shortestPathSegments(config.kobeStationId, config.himejiStationId, sanyoAdj);

  const out: TrackSegment[] = [];
  for (const seg of tokaidoSegments) {
    let lineId: SkId<'line'> | null = null;
    if (biwakoIds.has(seg.id)) {
      lineId = config.biwakoLineId;
    } else if (kyotoIds.has(seg.id)) {
      lineId = config.kyotoLineId;
    } else if (tokaidoKobeIds.has(seg.id)) {
      lineId = config.kobeLineId;
    }
    if (lineId === null) {
      continue;
    }
    out.push({
      ...seg,
      railLineIds: [lineId],
      externalIds: {
        ...seg.externalIds,
        ksj: seg.externalIds.ksj ?? '西日本旅客鉄道::東海道線',
      },
    });
  }

  for (const seg of sanyoSegments) {
    if (!sanyoKobeIds.has(seg.id)) {
      continue;
    }
    out.push({
      ...seg,
      railLineIds: [config.kobeLineId],
      externalIds: {
        ...seg.externalIds,
        ksj: seg.externalIds.ksj ?? '西日本旅客鉄道::山陽線',
      },
    });
  }

  return out;
}
