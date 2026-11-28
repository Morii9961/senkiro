/**
 * Synthetic "Testville" network. Every value is invented for tests (`dataNature:
 * 'synthetic'`); it depicts no real railway. Layout (lon ≈ 10.00–10.06, lat ≈ 50.00–50.03):
 *
 *            B3
 *            |              (metro B crosses trunk A between A2 and A3, no junction)
 *   A1 — A2 —+— A3 — A4 — Q1   (Q1: local line)
 *   |     \        /
 *   S1     L1 ————         (alpha detour line A2 — L1 — A4)
 *   |      B1
 *   S4 (shinkansen S1 — S4, in-gate interchanges A1↔S1 and A4↔S4)
 */
import {
  type Interchange,
  type LineClass,
  type LonLat,
  makeLocalizedNames,
  type Operator,
  type Provenance,
  type RailLine,
  type SkId,
  type SourceRecord,
  type Station,
  type StationComplex,
  type TrackGraph,
  type TrackSegment,
} from '@senkiro/contracts';

export const SYNTHETIC_SOURCE_ID = 'sk:source:jp:testville-synthetic';

export const synthetic: Provenance = {
  sourceIds: [SYNTHETIC_SOURCE_ID],
  dataNature: 'synthetic',
  lastVerifiedAt: null,
};

export const ALPHA: SkId<'operator'> = 'sk:operator:jp:alpha-rail';
export const BETA: SkId<'operator'> = 'sk:operator:jp:beta-metro';

export const line = (slug: string): SkId<'line'> => `sk:line:testville:${slug}`;
export const st = (slug: string): SkId<'station'> => `sk:station:testville:${slug}`;
export const seg = (slug: string): SkId<'segment'> => `sk:segment:testville:${slug}`;
export const cx = (slug: string): SkId<'complex'> => `sk:complex:testville:${slug}`;

const base = <T extends string>(id: T, name: string) => ({
  id,
  externalIds: {},
  names: makeLocalizedNames({ en: name }),
  provenance: synthetic,
  validFrom: null,
  validTo: null,
});

function operator(id: SkId<'operator'>, category: Operator['category']): Operator {
  return {
    ...base(id, id),
    category,
    brandColor: '#000000',
    coverageStatus: 'full',
    coverageNotes: 'synthetic',
  };
}

interface StationSpec {
  slug: string;
  op: SkId<'operator'>;
  lines: string[];
  at: LonLat;
  tags?: string[];
  complex?: string;
}

function station(spec: StationSpec): Station {
  return {
    ...base(st(spec.slug), spec.slug.toUpperCase()),
    operatorId: spec.op,
    railLineIds: spec.lines.map(line),
    stationComplexId: spec.complex === undefined ? null : cx(spec.complex),
    stationCode: null,
    coordinates: spec.at,
    municipalityCode: null,
    wardOrCity: null,
    fareZoneTags: spec.tags ?? [],
  };
}

interface SegmentSpec {
  from: string;
  to: string;
  line: string;
  op: SkId<'operator'>;
  km: number | null;
  lineClass: LineClass;
  tags?: string[];
  geometry?: LonLat[];
}

export const STATION_SPECS: StationSpec[] = [
  {
    slug: 'a1',
    op: ALPHA,
    lines: ['alpha-main'],
    at: [10.0, 50.01],
    tags: ['zone:inner'],
    complex: 'one',
  },
  {
    slug: 'a2',
    op: ALPHA,
    lines: ['alpha-main', 'alpha-loop'],
    at: [10.01, 50.01],
    tags: ['zone:inner'],
  },
  { slug: 'a3', op: ALPHA, lines: ['alpha-main'], at: [10.03, 50.01], tags: ['zone:inner'] },
  {
    slug: 'a4',
    op: ALPHA,
    lines: ['alpha-main', 'alpha-loop', 'alpha-local'],
    at: [10.04, 50.01],
    tags: ['zone:inner'],
    complex: 'four',
  },
  { slug: 'q1', op: ALPHA, lines: ['alpha-local'], at: [10.06, 50.01] },
  { slug: 'l1', op: ALPHA, lines: ['alpha-loop'], at: [10.025, 50.0], tags: ['zone:inner'] },
  { slug: 's1', op: ALPHA, lines: ['alpha-shinkansen'], at: [10.0005, 50.0098], complex: 'one' },
  { slug: 's4', op: ALPHA, lines: ['alpha-shinkansen'], at: [10.0395, 50.0098], complex: 'four' },
  { slug: 'b1', op: BETA, lines: ['beta-metro'], at: [10.02, 49.99] },
  { slug: 'b2', op: BETA, lines: ['beta-metro'], at: [10.02, 50.0] },
  { slug: 'b3', op: BETA, lines: ['beta-metro'], at: [10.02, 50.03] },
];

export const SEGMENT_SPECS: SegmentSpec[] = [
  {
    from: 'a1',
    to: 'a2',
    line: 'alpha-main',
    op: ALPHA,
    km: 1.2,
    lineClass: 'trunk',
    tags: ['zone:inner'],
  },
  {
    from: 'a2',
    to: 'a3',
    line: 'alpha-main',
    op: ALPHA,
    km: 2.1,
    lineClass: 'trunk',
    tags: ['zone:inner'],
  },
  {
    from: 'a3',
    to: 'a4',
    line: 'alpha-main',
    op: ALPHA,
    km: 0.9,
    lineClass: 'trunk',
    tags: ['zone:inner'],
  },
  { from: 'a4', to: 'q1', line: 'alpha-local', op: ALPHA, km: 1.5, lineClass: 'local_line' },
  {
    from: 'a2',
    to: 'l1',
    line: 'alpha-loop',
    op: ALPHA,
    km: 1.8,
    lineClass: 'trunk',
    tags: ['zone:inner'],
  },
  {
    from: 'l1',
    to: 'a4',
    line: 'alpha-loop',
    op: ALPHA,
    km: 1.7,
    lineClass: 'trunk',
    tags: ['zone:inner'],
  },
  { from: 's1', to: 's4', line: 'alpha-shinkansen', op: ALPHA, km: 3.6, lineClass: 'shinkansen' },
  { from: 'b1', to: 'b2', line: 'beta-metro', op: BETA, km: 1.1, lineClass: 'metro' },
  {
    from: 'b2',
    to: 'b3',
    line: 'beta-metro',
    op: BETA,
    km: null,
    lineClass: 'metro',
    geometry: [
      [10.02, 50.0],
      [10.02, 50.03],
    ],
  },
];

export const segIdOf = (from: string, to: string): SkId<'segment'> => seg(`${from}-${to}`);

function segment(spec: SegmentSpec, stations: Map<string, Station>): TrackSegment {
  const from = stations.get(spec.from);
  const to = stations.get(spec.to);
  if (from === undefined || to === undefined) {
    throw new Error(`fixture: unknown station in ${spec.from}-${spec.to}`);
  }
  return {
    ...base(segIdOf(spec.from, spec.to), `${spec.from}-${spec.to}`),
    fromStationId: from.id,
    toStationId: to.id,
    railLineIds: [line(spec.line)],
    operatorId: spec.op,
    geometry: spec.geometry ?? [from.coordinates, to.coordinates],
    operatingKm: spec.km,
    distanceNature: 'synthetic',
    lineClass: spec.lineClass,
    isShinkansen: spec.lineClass === 'shinkansen',
    parallelConventionalLineId: spec.lineClass === 'shinkansen' ? line('alpha-main') : null,
    fareZoneTags: spec.tags ?? [],
  };
}

function railLine(
  slug: string,
  op: SkId<'operator'>,
  lineClass: LineClass,
  stations: string[],
): RailLine {
  return {
    ...base(line(slug), slug),
    operatorId: op,
    color: '#336699',
    stationCodePrefix: null,
    lineClass,
    stationIds: stations.map(st),
    coverageStatus: 'full',
  };
}

function interchange(slug: string, a: string, b: string, complex: string): Interchange {
  return {
    ...base(`sk:interchange:testville:${slug}` as const, slug),
    fromStationId: st(a),
    toStationId: st(b),
    stationComplexId: cx(complex),
    gateType: 'in_gate',
    walkingMinutes: null,
    stepFree: null,
    notes: null,
  };
}

function complex(slug: string, stations: string[], at: LonLat): StationComplex {
  return {
    ...base(cx(slug), slug),
    stationIds: stations.map(st),
    coordinates: at,
    wardOrCity: null,
    explicitlyExcluded: [],
  };
}

export const SYNTHETIC_SOURCE: SourceRecord = {
  id: SYNTHETIC_SOURCE_ID,
  title: 'Testville synthetic network',
  publisher: 'SENKIRO tests',
  url: null,
  retrievedAt: '2026-11-28',
  sourceDate: null,
  license: 'CC0-1.0',
  licenseUrl: null,
  commercialUse: 'yes',
  redistribution: 'yes',
  shareAlike: false,
  attributionText: 'synthetic',
  notes: 'Invented test data; depicts no real railway.',
};

export function buildTestville(): TrackGraph {
  const stations = STATION_SPECS.map(station);
  const bySlug = new Map(STATION_SPECS.map((spec, i) => [spec.slug, stations[i] as Station]));
  return {
    operators: [operator(ALPHA, 'jr'), operator(BETA, 'metro')],
    lines: [
      railLine('alpha-main', ALPHA, 'trunk', ['a1', 'a2', 'a3', 'a4']),
      railLine('alpha-loop', ALPHA, 'trunk', ['a2', 'l1', 'a4']),
      railLine('alpha-local', ALPHA, 'local_line', ['a4', 'q1']),
      railLine('alpha-shinkansen', ALPHA, 'shinkansen', ['s1', 's4']),
      railLine('beta-metro', BETA, 'metro', ['b1', 'b2', 'b3']),
    ],
    segments: SEGMENT_SPECS.map((spec) => segment(spec, bySlug)),
    stations,
    complexes: [
      complex('one', ['a1', 's1'], [10.0, 50.01]),
      complex('four', ['a4', 's4'], [10.04, 50.01]),
    ],
    interchanges: [interchange('one', 'a1', 's1', 'one'), interchange('four', 'a4', 's4', 'four')],
    sources: [SYNTHETIC_SOURCE],
  };
}
