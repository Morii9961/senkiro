/**
 * Cross-source station alignment with the 650 m spatial guard (contract §1 invariants 1–2).
 *
 * Aligns external records (MLIT KSJ N02, GTFS, manual reference tables…) onto canonical
 * `SkId`s without silently dropping or force-merging mismatches: every candidate ends up
 * either in `matched` with the rule that matched it, or in `unaligned` with an explicit
 * reason. Operator / line alias tables are data supplied by each regional pipeline; the
 * core ships none.
 */
import type { LonLat, SkId } from '@senkiro/contracts';
import { haversineMeters } from './geo/projection.ts';

/** Default spatial guard: large terminal footprints fit, neighbouring stations do not. */
export const DEFAULT_ALIGNMENT_GUARD_METERS = 650;

export interface ExternalStationCandidate {
  sourceId: string;
  externalId: string;
  rawName: string;
  operatorRaw: string;
  lineRaw: string;
  coordinates: LonLat | null;
  stationCode?: string | null;
  enName?: string | null;
  kanaName?: string | null;
}

export interface CanonicalStationTarget {
  stationId: SkId<'station'>;
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  canonicalJaName: string;
  coordinates: LonLat;
}

export type AlignmentRule =
  | 'operator+normalized-name+line+spatial'
  | 'operator+normalized-name+spatial';

export interface AlignmentMatch {
  candidate: ExternalStationCandidate;
  stationId: SkId<'station'>;
  distanceMeters: number;
  ruleApplied: AlignmentRule;
}

export type UnalignedReasonCode =
  | 'UNKNOWN_OPERATOR'
  | 'NO_NAME_MATCH'
  | 'NOT_ON_LINE'
  | 'MISSING_COORDINATES'
  | 'BEYOND_SPATIAL_GUARD';

/** A record that could not be aligned. Kept and published, never dropped. */
export interface UnalignedRecord {
  sourceId: string;
  externalId: string;
  rawName: string;
  operatorRaw: string;
  lineRaw: string;
  coordinates: LonLat | null;
  reasonCode: UnalignedReasonCode;
  reason: string;
}

export interface AlignmentResult {
  matched: AlignmentMatch[];
  unaligned: UnalignedRecord[];
}

export interface AlignmentOptions {
  /** Raw operator names / agency IDs → canonical operator IDs (regional data). */
  operatorAliases: Readonly<Record<string, SkId<'operator'>>>;
  /** Raw route names → canonical line IDs (regional data). Optional line pinning. */
  lineAliases?: Readonly<Record<string, SkId<'line'>>>;
  /** Default {@link DEFAULT_ALIGNMENT_GUARD_METERS}. */
  maxDistanceMeters?: number;
  /** Override the default Japanese name normaliser. */
  normalizeName?: (raw: string) => string;
}

/**
 * Character variants used inconsistently across Japanese datasets. Only orthographic
 * variants of the same name: semantically distinct parts (「三丁目」「西口」「西武」「京成」
 * 「新」…) are never touched, so 新宿 ≠ 新宿三丁目 ≠ 西武新宿.
 */
const JA_VARIANT_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/ヶ/g, 'ケ'],
  [/ヵ/g, 'カ'],
  [/ノ/g, 'の'],
  [/ッ/g, 'ツ'],
  [/麹/g, '麴'],
  [/桧/g, '檜'],
];

export function normalizeStationNameJa(raw: string): string {
  let name = raw
    .trim()
    .replace(/　/g, ' ')
    .replace(/\s+/g, '')
    // Parenthetical sub-names: 押上（スカイツリー前）, 押上〈スカイツリー前〉
    .replace(/[（(〈《][^）)〉》]*[）)〉》]/g, '')
    .replace(/駅$/, '');
  for (const [pattern, replacement] of JA_VARIANT_REPLACEMENTS) {
    name = name.replace(pattern, replacement);
  }
  return name;
}

export function normalizeOperatorId(
  raw: string,
  aliases: Readonly<Record<string, SkId<'operator'>>>,
): SkId<'operator'> | null {
  return aliases[raw.trim()] ?? null;
}

export function normalizeLineHint(
  raw: string,
  aliases: Readonly<Record<string, SkId<'line'>>> | undefined,
): SkId<'line'> | null {
  return aliases?.[raw.trim()] ?? null;
}

/**
 * Strict guardrails, in order: operator must resolve and match; normalised Japanese name
 * must match exactly; when the line hint resolves, the target must be on that line; the
 * nearest remaining target must lie within `maxDistanceMeters`.
 */
export function alignExternalStations(
  candidates: readonly ExternalStationCandidate[],
  targets: readonly CanonicalStationTarget[],
  options: AlignmentOptions,
): AlignmentResult {
  const maxDistance = options.maxDistanceMeters ?? DEFAULT_ALIGNMENT_GUARD_METERS;
  const normalize = options.normalizeName ?? normalizeStationNameJa;
  const matched: AlignmentMatch[] = [];
  const unaligned: UnalignedRecord[] = [];

  const reject = (
    candidate: ExternalStationCandidate,
    reasonCode: UnalignedReasonCode,
    reason: string,
  ): void => {
    unaligned.push({
      sourceId: candidate.sourceId,
      externalId: candidate.externalId,
      rawName: candidate.rawName,
      operatorRaw: candidate.operatorRaw,
      lineRaw: candidate.lineRaw,
      coordinates: candidate.coordinates,
      reasonCode,
      reason,
    });
  };

  for (const candidate of candidates) {
    const operatorId = normalizeOperatorId(candidate.operatorRaw, options.operatorAliases);
    if (operatorId === null) {
      reject(candidate, 'UNKNOWN_OPERATOR', `Unrecognized operator: "${candidate.operatorRaw}"`);
      continue;
    }
    const lineHint = normalizeLineHint(candidate.lineRaw, options.lineAliases);
    const name = normalize(candidate.rawName);
    const nameMatched = targets.filter(
      (t) => t.operatorId === operatorId && normalize(t.canonicalJaName) === name,
    );
    if (nameMatched.length === 0) {
      reject(
        candidate,
        'NO_NAME_MATCH',
        `No canonical station name match for "${candidate.rawName}" under ${operatorId} (line: ${candidate.lineRaw})`,
      );
      continue;
    }
    const pool =
      lineHint === null ? nameMatched : nameMatched.filter((t) => t.railLineIds.includes(lineHint));
    if (pool.length === 0) {
      reject(
        candidate,
        'NOT_ON_LINE',
        `Station "${candidate.rawName}" exists for ${operatorId}, but not on line ${lineHint}`,
      );
      continue;
    }
    if (candidate.coordinates === null) {
      reject(
        candidate,
        'MISSING_COORDINATES',
        `Candidate "${candidate.rawName}" has no coordinates; the spatial guard cannot be checked`,
      );
      continue;
    }
    const coords = candidate.coordinates;
    let best: { target: CanonicalStationTarget; distance: number } | null = null;
    for (const target of pool) {
      const distance = haversineMeters(coords, target.coordinates);
      if (best === null || distance < best.distance) {
        best = { target, distance };
      }
    }
    if (best === null || best.distance > maxDistance) {
      reject(
        candidate,
        'BEYOND_SPATIAL_GUARD',
        `Nearest name-matched station exceeds spatial guard (${Math.round(best?.distance ?? -1)}m > ${maxDistance}m)`,
      );
      continue;
    }
    matched.push({
      candidate,
      stationId: best.target.stationId,
      distanceMeters: Math.round(best.distance),
      ruleApplied:
        lineHint === null
          ? 'operator+normalized-name+spatial'
          : 'operator+normalized-name+line+spatial',
    });
  }

  return { matched, unaligned };
}
