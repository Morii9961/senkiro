/**
 * Pure lookups and search over one {@link RegionalAtlasBundle} (no React, no MapLibre).
 *
 * Anti-merge rule (spec §2.3): a station complex is only ever the stations listed in its
 * own `stationIds`. Search never matches a complex through its `explicitlyExcluded` names,
 * and every station result carries the complex it really belongs to (or none), so "京都"
 * shows the Kyoto Station complex and Hankyu Kyoto-kawaramachi as separate, labelled
 * results instead of one merged hit.
 */
import {
  type Interchange,
  type Locale,
  type LocalizedNames,
  type Operator,
  type RailLine,
  resolveLocalizedName,
  type SkId,
  type Station,
  type StationComplex,
  type ThroughService,
  type TrackSegment,
} from '@senkiro/contracts';
import type { RegionalAtlasBundle } from '../../slots/slots.tsx';

export interface AtlasIndex {
  bundle: RegionalAtlasBundle;
  operators: ReadonlyMap<string, Operator>;
  lines: ReadonlyMap<string, RailLine>;
  stations: ReadonlyMap<string, Station>;
  complexes: ReadonlyMap<string, StationComplex>;
  throughServices: ReadonlyMap<string, ThroughService>;
  /** Lines serving each station (station `railLineIds` plus lines listing the station). */
  linesByStation: ReadonlyMap<string, readonly RailLine[]>;
  segmentsByLine: ReadonlyMap<string, readonly TrackSegment[]>;
  interchangesByComplex: ReadonlyMap<string, readonly Interchange[]>;
  /** Through services whose boundary is the station, or that start/end on the line. */
  throughByStation: ReadonlyMap<string, readonly ThroughService[]>;
  throughByLine: ReadonlyMap<string, readonly ThroughService[]>;
  /** Operators in display order (data order). */
  operatorList: readonly Operator[];
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else if (!list.includes(value)) {
    list.push(value);
  }
}

export function buildAtlasIndex(bundle: RegionalAtlasBundle): AtlasIndex {
  const graph = bundle.trackGraph;
  const lines = byId(graph.lines);
  const linesByStation = new Map<string, RailLine[]>();
  for (const station of graph.stations) {
    for (const lineId of station.railLineIds) {
      const line = lines.get(lineId);
      if (line !== undefined) {
        push(linesByStation, station.id, line);
      }
    }
  }
  for (const line of graph.lines) {
    for (const stationId of line.stationIds) {
      push(linesByStation, stationId, line);
    }
  }
  const segmentsByLine = new Map<string, TrackSegment[]>();
  for (const segment of graph.segments) {
    for (const lineId of segment.railLineIds) {
      push(segmentsByLine, lineId, segment);
    }
  }
  const interchangesByComplex = new Map<string, Interchange[]>();
  for (const interchange of graph.interchanges) {
    push(interchangesByComplex, interchange.stationComplexId, interchange);
  }
  const throughByStation = new Map<string, ThroughService[]>();
  const throughByLine = new Map<string, ThroughService[]>();
  for (const through of bundle.throughServices) {
    push(throughByStation, through.boundaryStationId, through);
    push(throughByLine, through.fromRailLineId, through);
    push(throughByLine, through.toRailLineId, through);
  }
  return {
    bundle,
    operators: byId(graph.operators),
    lines,
    stations: byId(graph.stations),
    complexes: byId(graph.complexes),
    throughServices: byId([...bundle.throughServices]),
    linesByStation,
    segmentsByLine,
    interchangesByComplex,
    throughByStation,
    throughByLine,
    operatorList: graph.operators,
  };
}

/** Localised entity name, or `null` when no name is known in any language. */
export function nameOf(names: LocalizedNames, lang: Locale): string | null {
  const resolved = resolveLocalizedName(names, lang);
  return resolved.resolvedLocale === 'unknown' ? null : resolved.text;
}

/** Distinct operators of a complex's member stations, in member order. */
export function complexOperators(index: AtlasIndex, complex: StationComplex): Operator[] {
  const out: Operator[] = [];
  for (const stationId of complex.stationIds) {
    const operatorId = index.stations.get(stationId)?.operatorId;
    const operator = operatorId === undefined ? undefined : index.operators.get(operatorId);
    if (operator !== undefined && !out.includes(operator)) {
      out.push(operator);
    }
  }
  return out;
}

/** Union of every station's and segment's geometry for a line, as `[west, south, east, north]`. */
export function lineBounds(
  index: AtlasIndex,
  lineId: string,
): [number, number, number, number] | null {
  const points: [number, number][] = [];
  for (const segment of index.segmentsByLine.get(lineId) ?? []) {
    points.push(...segment.geometry);
  }
  for (const stationId of index.lines.get(lineId)?.stationIds ?? []) {
    const station = index.stations.get(stationId);
    if (station !== undefined) {
      points.push(station.coordinates);
    }
  }
  if (points.length === 0) {
    return null;
  }
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

// ── Search ────────────────────────────────────────────────────────────────────────────

const KATAKANA = /[ァ-ヶ]/g;
const IGNORED = /[\s　・·･.\-‐‑–—_/()（）「」『』[\]【】,，、。'"]/g;

/**
 * Search key normalisation: NFKC (full-width ASCII, half-width kana), lower case,
 * katakana → hiragana, and separators removed. "Kyoto-Kawaramachi", "kyoto kawaramachi",
 * "キョウト" and "きょうと" therefore compare equal to their stored counterparts.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(KATAKANA, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(IGNORED, '');
}

export type AtlasResultKind = 'complex' | 'station' | 'line';

interface AtlasSearchResultBase {
  /** The stored text that matched (a name, reading or station code). */
  matched: string;
  /** 0 = exact, 1 = prefix, 2 = contained. */
  rank: 0 | 1 | 2;
  operatorIds: readonly string[];
}

export type AtlasSearchResult = AtlasSearchResultBase &
  (
    | { kind: 'complex'; id: SkId<'complex'> }
    | { kind: 'station'; id: SkId<'station'> }
    | { kind: 'line'; id: SkId<'line'> }
  );

export interface AtlasSearchResults {
  complexes: AtlasSearchResult[];
  stations: AtlasSearchResult[];
  lines: AtlasSearchResult[];
  /** Matches left out because every operator involved is hidden by the filter. */
  hiddenByFilter: number;
}

function namesOf(names: LocalizedNames): string[] {
  return [names.ja, names.ja_kana, names.en, names.zh].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
}

function bestMatch(
  query: string,
  candidates: readonly string[],
): { matched: string; rank: 0 | 1 | 2 } | null {
  let best: { matched: string; rank: 0 | 1 | 2 } | null = null;
  for (const candidate of candidates) {
    const key = normalizeSearchText(candidate);
    if (key === '') {
      continue;
    }
    const rank = key === query ? 0 : key.startsWith(query) ? 1 : key.includes(query) ? 2 : null;
    if (rank !== null && (best === null || rank < best.rank)) {
      best = { matched: candidate, rank };
    }
  }
  return best;
}

export interface AtlasSearchOptions {
  /** Operators hidden by the filter; results whose operators are all hidden are dropped. */
  hiddenOperatorIds?: ReadonlySet<string>;
  /** Per-group limit (default 8). */
  limit?: number;
}

/**
 * Trilingual search over complexes, stations and lines: names in ja / kana / en / zh and
 * station codes ("HK-86", "hk86", "K11"). Complexes match on their own names only; their
 * member stations are separate results that name the complex they belong to.
 */
export function searchAtlas(
  index: AtlasIndex,
  rawQuery: string,
  options: AtlasSearchOptions = {},
): AtlasSearchResults {
  const query = normalizeSearchText(rawQuery);
  const results: AtlasSearchResults = { complexes: [], stations: [], lines: [], hiddenByFilter: 0 };
  if (query === '') {
    return results;
  }
  const hidden = options.hiddenOperatorIds ?? new Set<string>();
  const limit = options.limit ?? 8;
  const visible = (operatorIds: readonly string[]) =>
    operatorIds.length === 0 || operatorIds.some((id) => !hidden.has(id));
  const add = (group: AtlasSearchResult[], result: AtlasSearchResult) => {
    if (visible(result.operatorIds)) {
      group.push(result);
    } else {
      results.hiddenByFilter += 1;
    }
  };

  for (const complex of index.complexes.values()) {
    // Own names only — never `explicitlyExcluded`, never member station names.
    const match = bestMatch(query, namesOf(complex.names));
    if (match !== null) {
      add(results.complexes, {
        kind: 'complex',
        id: complex.id,
        ...match,
        operatorIds: complexOperators(index, complex).map((operator) => operator.id),
      });
    }
  }
  for (const station of index.stations.values()) {
    const candidates = namesOf(station.names);
    if (station.stationCode !== null) {
      candidates.push(station.stationCode);
    }
    const match = bestMatch(query, candidates);
    if (match !== null) {
      add(results.stations, {
        kind: 'station',
        id: station.id,
        ...match,
        operatorIds: [station.operatorId],
      });
    }
  }
  for (const line of index.lines.values()) {
    const candidates = namesOf(line.names);
    if (line.stationCodePrefix !== null) {
      candidates.push(line.stationCodePrefix);
    }
    const match = bestMatch(query, candidates);
    if (match !== null) {
      add(results.lines, { kind: 'line', id: line.id, ...match, operatorIds: [line.operatorId] });
    }
  }

  const order = (a: AtlasSearchResult, b: AtlasSearchResult) =>
    a.rank - b.rank || a.matched.length - b.matched.length || a.id.localeCompare(b.id);
  results.complexes = results.complexes.sort(order).slice(0, limit);
  results.stations = results.stations.sort(order).slice(0, limit);
  results.lines = results.lines.sort(order).slice(0, limit);
  return results;
}

/**
 * Splits `text` around the first occurrence of the query (compared after normalisation)
 * so the UI can wrap it in `<mark>`. Returns `null` when the match is not a plain substring
 * of the displayed text (e.g. it matched the kana reading or a code).
 */
export function highlightRange(text: string, rawQuery: string): [number, number] | null {
  const query = normalizeSearchText(rawQuery);
  if (query === '') {
    return null;
  }
  // Walk the display text, mapping each normalised character back to its source index.
  const map: number[] = [];
  let normalized = '';
  for (let i = 0; i < text.length; i += 1) {
    const piece = normalizeSearchText(text[i] ?? '');
    for (let j = 0; j < piece.length; j += 1) {
      map.push(i);
    }
    normalized += piece;
  }
  const at = normalized.indexOf(query);
  if (at === -1) {
    return null;
  }
  const start = map[at] ?? 0;
  const end = (map[at + query.length - 1] ?? start) + 1;
  return [start, end];
}
