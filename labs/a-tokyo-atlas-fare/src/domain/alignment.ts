/**
 * Cross-source station & operator alignment module (Pure TypeScript).
 * Aligns external records (e.g., MLIT KSJ N02, ODPT Toei GTFS, manual reference tables)
 * into stable internal `sk:` IDs without silently dropping or force-merging mismatches.
 */

import type { SkId, UnalignedRecord } from './types.js';

export interface ExternalStationCandidate {
  sourceId: string;
  externalId: string;
  rawName: string;
  operatorRaw: string;
  lineRaw: string;
  coordinates: [number, number]; // [lon, lat]
  stationCode?: string | null;
  enName?: string | null;
  kanaName?: string | null;
}

export interface CanonicalStationTarget {
  stationId: SkId<'station'>;
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  canonicalJaName: string;
  coordinates: [number, number]; // [lon, lat]
}

export interface AlignmentMatch {
  candidate: ExternalStationCandidate;
  stationId: SkId<'station'>;
  distanceMeters: number;
  ruleApplied: string;
}

export interface AlignmentResult {
  matched: AlignmentMatch[];
  unaligned: UnalignedRecord[];
}

/**
 * Operator raw name normalization map (official Japanese names & GTFS agency IDs -> sk:operator:*)
 */
const OPERATOR_ALIAS_MAP: Record<string, SkId<'operator'>> = {
  東日本旅客鉄道: 'sk:operator:jr-east',
  'JR東日本': 'sk:operator:jr-east',
  'JR-East': 'sk:operator:jr-east',
  東海旅客鉄道: 'sk:operator:jr-central',
  'JR東海': 'sk:operator:jr-central',
  'JR-Central': 'sk:operator:jr-central',
  東京地下鉄: 'sk:operator:tokyo-metro',
  東京メトロ: 'sk:operator:tokyo-metro',
  TokyoMetro: 'sk:operator:tokyo-metro',
  東京都: 'sk:operator:toei',
  東京都交通局: 'sk:operator:toei',
  toei: 'sk:operator:toei',
  Toei: 'sk:operator:toei',
  小田急電鉄: 'sk:operator:odakyu',
  京王電鉄: 'sk:operator:keio',
  西武鉄道: 'sk:operator:seibu',
  東急電鉄: 'sk:operator:tokyu',
  京浜急行電鉄: 'sk:operator:keikyu',
  東武鉄道: 'sk:operator:tobu',
  京成電鉄: 'sk:operator:keisei',
};

export function normalizeOperatorId(raw: string): SkId<'operator'> | null {
  const trimmed = raw.trim();
  return OPERATOR_ALIAS_MAP[trimmed] ?? null;
}

/**
 * Normalizes Japanese station names for cross-source comparison WITHOUT erasing
 * semantically distinct suffixes like 「三丁目」, 「西口」, 「西武」, 「京成」, 「新」.
 */
export function normalizeStationNameJa(raw: string): string {
  return raw
    .trim()
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    // Strip parenthetical sub-names such as 押上（スカイツリー前） or 押上〈スカイツリー前〉
    .replace(/[（(〈《][^）)〉》]*[）)〉》]/g, '')
    // Strip trailing 駅 if present
    .replace(/駅$/, '')
    // Normalize small katakana/hiragana variants used inconsistently across datasets
    .replace(/ヶ/g, 'ケ')
    .replace(/ヵ/g, 'カ')
    .replace(/ノ/g, 'の')
    .replace(/ッ/g, 'ツ')
    // Common official kanji variants in Tokyo
    .replace(/麹/g, '麴')
    .replace(/桧/g, '檜');
}

/**
 * Haversine distance in meters between two [lon, lat] points.
 */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Maps ODPT/GTFS Toei route names to internal railLine IDs.
 */
const LINE_ALIAS_MAP: Record<string, SkId<'line'>> = {
  浅草線: 'sk:line:toei-asakusa',
  '1号線浅草線': 'sk:line:toei-asakusa',
  三田線: 'sk:line:toei-mita',
  '6号線三田線': 'sk:line:toei-mita',
  新宿線: 'sk:line:toei-shinjuku',
  '10号線新宿線': 'sk:line:toei-shinjuku',
  大江戸線: 'sk:line:toei-oedo',
  '12号線大江戸線': 'sk:line:toei-oedo',
};

export function normalizeLineHint(raw: string): SkId<'line'> | null {
  return LINE_ALIAS_MAP[raw.trim()] ?? null;
}

/**
 * Aligns external station candidates against canonical internal stations.
 * Strict guardrails:
 *  - Operator must match
 *  - Normalized Japanese station name must match EXACTLY (prevents 新宿 vs 新宿三丁目 vs 西武新宿 merges)
 *  - Spatial distance must be <= maxDistanceMeters (default 650m to accommodate large station footprints)
 *  - If line hint is known, target station must belong to that line
 *  - Anything failing these checks is returned in `unaligned` with an explicit reason (never dropped!)
 */
export function alignExternalStations(
  candidates: ExternalStationCandidate[],
  targets: CanonicalStationTarget[],
  maxDistanceMeters = 650,
): AlignmentResult {
  const matched: AlignmentMatch[] = [];
  const unaligned: UnalignedRecord[] = [];

  for (const candidate of candidates) {
    const opId = normalizeOperatorId(candidate.operatorRaw);
    if (!opId) {
      unaligned.push({
        sourceId: candidate.sourceId,
        externalId: candidate.externalId,
        rawName: candidate.rawName,
        operatorRaw: candidate.operatorRaw,
        lineRaw: candidate.lineRaw,
        coordinates: candidate.coordinates,
        reason: `Unrecognized operator: "${candidate.operatorRaw}"`,
      });
      continue;
    }

    const lineHint = normalizeLineHint(candidate.lineRaw);
    const normName = normalizeStationNameJa(candidate.rawName);

    const sameOpTargets = targets.filter((t) => t.operatorId === opId);
    const nameMatched = sameOpTargets.filter(
      (t) => normalizeStationNameJa(t.canonicalJaName) === normName,
    );

    if (nameMatched.length === 0) {
      unaligned.push({
        sourceId: candidate.sourceId,
        externalId: candidate.externalId,
        rawName: candidate.rawName,
        operatorRaw: candidate.operatorRaw,
        lineRaw: candidate.lineRaw,
        coordinates: candidate.coordinates,
        reason: `No canonical station name match for "${candidate.rawName}" under ${opId} (line: ${candidate.lineRaw})`,
      });
      continue;
    }

    const lineFiltered = lineHint
      ? nameMatched.filter((t) => t.railLineIds.includes(lineHint))
      : nameMatched;

    if (lineHint && lineFiltered.length === 0) {
      unaligned.push({
        sourceId: candidate.sourceId,
        externalId: candidate.externalId,
        rawName: candidate.rawName,
        operatorRaw: candidate.operatorRaw,
        lineRaw: candidate.lineRaw,
        coordinates: candidate.coordinates,
        reason: `Station "${candidate.rawName}" exists for ${opId}, but not on line ${lineHint}`,
      });
      continue;
    }

    const pool = lineFiltered.length > 0 ? lineFiltered : nameMatched;
    let best: { target: CanonicalStationTarget; dist: number } | null = null;
    for (const target of pool) {
      const dist = haversineMeters(candidate.coordinates, target.coordinates);
      if (!best || dist < best.dist) {
        best = { target, dist };
      }
    }

    if (!best || best.dist > maxDistanceMeters) {
      unaligned.push({
        sourceId: candidate.sourceId,
        externalId: candidate.externalId,
        rawName: candidate.rawName,
        operatorRaw: candidate.operatorRaw,
        lineRaw: candidate.lineRaw,
        coordinates: candidate.coordinates,
        reason: `Nearest name-matched station exceeds spatial guard (${Math.round(best?.dist ?? -1)}m > ${maxDistanceMeters}m)`,
      });
      continue;
    }

    matched.push({
      candidate,
      stationId: best.target.stationId,
      distanceMeters: Math.round(best.dist),
      ruleApplied: lineHint
        ? 'operator+normalized-name+line+spatial'
        : 'operator+normalized-name+spatial',
    });
  }

  return { matched, unaligned };
}
