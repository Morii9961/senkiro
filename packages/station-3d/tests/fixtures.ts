/**
 * A tiny synthetic hub for engine tests. Every name and coordinate is a structural
 * placeholder (dataNature `synthetic`), not a fact about any real station.
 */
import type {
  FareZone,
  LocalizedNames,
  PlanRect,
  Provenance,
  SkId,
  StationHubDataset,
  StationLevel,
  StationLink,
  StationLinkKind,
  StationPlace,
  StationPlaceKind,
} from '@senkiro/contracts';

export const COMPLEX: SkId<'complex'> = 'sk:complex:test:hub';
const SOURCE = 'sk:source:test:fixture';

const provenance = (): Provenance => ({
  sourceIds: [SOURCE],
  dataNature: 'synthetic',
  lastVerifiedAt: null,
});
const names = (en: string | null): LocalizedNames => ({ ja: null, ja_kana: null, en, zh: null });

export const lv = (slug: string): SkId<'level'> => `sk:level:test:${slug}`;
export const pl = (slug: string): SkId<'place'> => `sk:place:test:${slug}`;
export const lk = (slug: string): SkId<'link'> => `sk:link:test:${slug}`;

function level(slug: string, ordinal: number, operator: 'a' | 'b' | null): StationLevel {
  return {
    id: lv(slug),
    externalIds: {},
    names: names(slug.toUpperCase()),
    provenance: provenance(),
    validFrom: null,
    validTo: null,
    complexId: COMPLEX,
    stationId: operator === null ? null : `sk:station:test:${operator}`,
    operatorId: operator === null ? null : `sk:operator:test:${operator}`,
    label: ordinal >= 0 ? `${ordinal + 1}F` : `B${-ordinal}F`,
    ordinal,
    elevation: ordinal * 4,
    elevationNote: 'synthetic',
  };
}

export function place(
  slug: string,
  levelSlug: string,
  kind: StationPlaceKind,
  fareZone: FareZone,
  rect: PlanRect,
  name: string | null = slug,
): StationPlace {
  return {
    id: pl(slug),
    externalIds: {},
    names: names(name),
    provenance: provenance(),
    validFrom: null,
    validTo: null,
    complexId: COMPLEX,
    levelId: lv(levelSlug),
    stationId: null,
    kind,
    fareZone,
    manager: null,
    footprint: [rect],
    anchor: { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 },
    existence: 'verified',
    geometryConfidence: 'schematic',
    asOf: null,
  };
}

export function link(
  slug: string,
  kind: StationLinkKind,
  from: string,
  to: string,
  extra: Partial<StationLink> = {},
): StationLink {
  const vertical = kind === 'stairs' || kind === 'escalator' || kind === 'elevator';
  return {
    id: lk(slug),
    externalIds: {},
    names: names(null),
    provenance: provenance(),
    validFrom: null,
    validTo: null,
    complexId: COMPLEX,
    kind,
    fromPlaceId: pl(from),
    toPlaceId: pl(to),
    direction: 'both',
    connection: 'verified',
    stepFree: kind === 'elevator' ? true : !vertical,
    hasSteps: kind === 'stairs' ? true : vertical ? null : false,
    ...extra,
  };
}

const r = (x0: number, z0: number, x1: number, z1: number): PlanRect => ({ x0, z0, x1, z1 });

/**
 * Floors: 0 (street + operator A hall), −1 (A platform, B hall), −2 (B platform).
 *
 *   entrance ─ hall(unpaid) ─gate─ a-hall(paid:a) ─stairs/esc/lift─ a-plat(paid:a, −1)
 *   hall ─gate─ b-out?  no: B is reached from the unpaid street-level hall by lift/stairs to
 *   b-free(unpaid, −1) ─gate─ b-hall(paid:b) ─stairs─ b-plat(paid:b, −2)
 *   a-plat ─transfer gate (inferred!)─ b-hall
 */
export function fixtureHub(): StationHubDataset {
  const places: StationPlace[] = [
    place('entrance', 'a-1f', 'entrance', 'unpaid', r(-2, -2, 0, 2)),
    place('hall', 'a-1f', 'concourse', 'unpaid', r(0, -4, 10, 4)),
    place('a-hall', 'a-1f', 'concourse', 'paid:a', r(11, -4, 20, 4)),
    place('a-land-1f', 'a-1f', 'landing', 'paid:a', r(18, -1, 19, 0), null),
    place('a-land-b1', 'a-b1', 'landing', 'paid:a', r(18, -1, 19, 0), null),
    place('a-plat', 'a-b1', 'platform', 'paid:a', r(11, -2, 30, 2)),
    place('b-free', 'b-b1', 'concourse', 'unpaid', r(0, 10, 10, 16)),
    place('b-hall', 'b-b1', 'concourse', 'paid:b', r(11, 10, 20, 16)),
    place('b-plat', 'b-b2', 'platform', 'paid:b', r(11, 10, 30, 13)),
  ];
  const links: StationLink[] = [
    link('entrance-hall', 'passage', 'entrance', 'hall'),
    link('a-gate', 'gate', 'hall', 'a-hall', { gateKind: 'ticket', position: { x: 10.5, z: 0 } }),
    link('a-stairs', 'stairs', 'a-hall', 'a-plat'),
    link('a-esc', 'escalator', 'a-hall', 'a-plat'),
    link('a-hall-land', 'passage', 'a-hall', 'a-land-1f', { stepFree: null, hasSteps: null }),
    link('a-lift', 'elevator', 'a-land-1f', 'a-land-b1'),
    link('a-land-plat', 'passage', 'a-land-b1', 'a-plat', { stepFree: null, hasSteps: null }),
    link('hall-b-stairs', 'stairs', 'hall', 'b-free'),
    link('b-gate', 'gate', 'b-free', 'b-hall', { gateKind: 'ticket' }),
    link('b-stairs', 'stairs', 'b-hall', 'b-plat'),
    link('a-b-transfer', 'gate', 'a-plat', 'b-hall', {
      gateKind: 'transfer',
      connection: 'inferred',
    }),
  ];
  return {
    complex: {
      id: COMPLEX,
      externalIds: {},
      names: names('Test hub'),
      provenance: provenance(),
      validFrom: null,
      validTo: null,
      stationIds: ['sk:station:test:a', 'sk:station:test:b'],
      coordinates: [0, 0],
      wardOrCity: null,
      explicitlyExcluded: [],
    },
    operators: (['a', 'b'] as const).map((o) => ({
      id: `sk:operator:test:${o}` as const,
      externalIds: {},
      names: names(`Operator ${o}`),
      provenance: provenance(),
      validFrom: null,
      validTo: null,
      category: 'private' as const,
      brandColor: '#888888',
      coverageStatus: 'partial' as const,
      coverageNotes: 'synthetic',
    })),
    lines: [],
    stations: (['a', 'b'] as const).map((o) => ({
      id: `sk:station:test:${o}` as const,
      externalIds: {},
      names: names(`Station ${o}`),
      provenance: provenance(),
      validFrom: null,
      validTo: null,
      operatorId: `sk:operator:test:${o}` as const,
      railLineIds: [],
      stationComplexId: COMPLEX,
      stationCode: null,
      coordinates: [0, 0] as [number, number],
      municipalityCode: null,
      wardOrCity: null,
      fareZoneTags: [],
    })),
    levels: [
      level('a-1f', 0, 'a'),
      level('a-b1', -1, 'a'),
      level('b-b1', -1, 'b'),
      level('b-b2', -2, 'b'),
    ],
    places,
    links,
    sources: [
      {
        id: SOURCE,
        title: 'Synthetic test fixture',
        publisher: 'SENKIRO tests',
        url: null,
        retrievedAt: '2026-11-28',
        sourceDate: null,
        license: 'AGPL-3.0-only',
        licenseUrl: null,
        commercialUse: 'yes',
        redistribution: 'yes',
        shareAlike: false,
        attributionText: 'synthetic',
        notes: 'Not a real station.',
      },
    ],
    disclaimer: names('Synthetic fixture'),
  };
}
