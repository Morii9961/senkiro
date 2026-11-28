/**
 * Small Kansai `RegionalAtlasBundle` for Vitest and Playwright. TEST DATA ONLY.
 *
 * IDs, names and the anti-merge boundaries follow docs/02-phase1-atlas-spec.md §2 (frozen
 * registry). Coordinates of the four Kyoto Station operators, Kyoto-kawaramachi and
 * Gion-Shijo are the spec's published KSJ points; every other coordinate, every segment
 * geometry (straight lines) and the one operating distance are synthetic stand-ins, and
 * every record says so (`dataNature: 'synthetic'`). It is never part of the app bundle:
 * the E2E injects it through `window.__SENKIRO_ATLAS_PREVIEW__`.
 *
 * Runtime-import free (type imports only) so Playwright can load it without the workspace
 * TypeScript sources.
 */
import type {
  Interchange,
  LocalizedNames,
  Operator,
  Provenance,
  RailLine,
  SkId,
  SourceRecord,
  Station,
  StationComplex,
  ThroughService,
  TrackGraph,
  TrackSegment,
} from '@senkiro/contracts';
import type { RegionalAtlasBundle, RegionalAtlasBundleProvider } from '../../src/slots/slots.tsx';

export const FIXTURE_SOURCE_ID = 'sk:source:local:web-atlas-fixture';

const provenance: Provenance = {
  sourceIds: [FIXTURE_SOURCE_ID],
  dataNature: 'synthetic',
  lastVerifiedAt: null,
  note: 'SENKIRO web test fixture: IDs from the frozen spec registry; geometry synthetic.',
};

function names(ja: string, en: string, zh: string, kana: string | null = null): LocalizedNames {
  return { ja, ja_kana: kana, en, zh };
}

function base<T extends string>(id: T, localized: LocalizedNames) {
  return {
    id,
    externalIds: {},
    names: localized,
    provenance,
    validFrom: null,
    validTo: null,
  };
}

type OperatorSlug =
  | 'jr-west'
  | 'jr-central'
  | 'hankyu'
  | 'keihan'
  | 'kintetsu'
  | 'hanshin'
  | 'osaka-metro'
  | 'kyoto-subway';

const op = (slug: OperatorSlug): SkId<'operator'> => `sk:operator:jp:${slug}`;
const st = (slug: string): SkId<'station'> => `sk:station:kansai:${slug}`;
const ln = (slug: string): SkId<'line'> => `sk:line:kansai:${slug}`;
const cx = (slug: string): SkId<'complex'> => `sk:complex:kansai:${slug}`;

function operator(
  slug: OperatorSlug,
  category: Operator['category'],
  localized: LocalizedNames,
  brandColor: string,
): Operator {
  return {
    ...base(op(slug), localized),
    category,
    brandColor,
    coverageStatus: 'partial',
    coverageNotes: 'Test fixture: a handful of Kyoto-area records only.',
  };
}

const operators: Operator[] = [
  operator('jr-west', 'jr', names('JR西日本', 'JR West', 'JR西日本'), '#0072bc'),
  operator('jr-central', 'jr', names('JR東海', 'JR Central', 'JR东海'), '#f58220'),
  operator('hankyu', 'private', names('阪急電鉄', 'Hankyu Railway', '阪急电铁'), '#8b1c42'),
  operator(
    'keihan',
    'private',
    names('京阪電気鉄道', 'Keihan Electric Railway', '京阪电气铁道'),
    '#00523c',
  ),
  operator('kintetsu', 'private', names('近畿日本鉄道', 'Kintetsu Railway', '近铁电铁'), '#b81d24'),
  operator(
    'hanshin',
    'private',
    names('阪神電気鉄道', 'Hanshin Electric Railway', '阪神电气铁道'),
    '#1c3f94',
  ),
  operator('osaka-metro', 'metro', names('Osaka Metro', 'Osaka Metro', '大阪地铁'), '#0099d9'),
  operator(
    'kyoto-subway',
    'metro',
    names('京都市営地下鉄', 'Kyoto Municipal Subway', '京都市营地铁'),
    '#2b8c4b',
  ),
];

function station(
  slug: string,
  operatorSlug: OperatorSlug,
  localized: LocalizedNames,
  coordinates: [number, number],
  lines: string[],
  complex: string | null,
  code: string | null,
): Station {
  return {
    ...base(st(slug), localized),
    operatorId: op(operatorSlug),
    railLineIds: lines.map(ln),
    stationComplexId: complex === null ? null : cx(complex),
    stationCode: code,
    coordinates,
    municipalityCode: null,
    wardOrCity: null,
    fareZoneTags: [],
  };
}

const stations: Station[] = [
  station(
    'jr-west-kyoto',
    'jr-west',
    names('京都駅（JR西日本）', 'Kyoto Station (JR West)', '京都站（JR西日本）', 'きょうと'),
    [135.76104, 34.98568],
    ['jr-west-kyoto'],
    'kyoto',
    null,
  ),
  station(
    'jr-central-kyoto',
    'jr-central',
    names(
      '京都駅（東海道新幹線）',
      'Kyoto Station (Tokaido Shinkansen)',
      '京都站（东海道新干线）',
      'きょうと',
    ),
    [135.75684, 34.98459],
    ['jr-central-tokaido-shinkansen'],
    'kyoto',
    null,
  ),
  station(
    'kintetsu-kyoto',
    'kintetsu',
    names('京都駅（近鉄）', 'Kyoto Station (Kintetsu)', '京都站（近铁）', 'きょうと'),
    [135.75684, 34.98459],
    ['kintetsu-kyoto'],
    'kyoto',
    'B01',
  ),
  station(
    'kyoto-subway-kyoto',
    'kyoto-subway',
    names(
      '京都駅（京都市営地下鉄）',
      'Kyoto Station (Subway)',
      '京都站（京都市营地铁）',
      'きょうと',
    ),
    [135.75992, 34.98621],
    ['kyoto-subway-karasuma'],
    'kyoto',
    'K11',
  ),
  station(
    'hankyu-kyoto-kawaramachi',
    'hankyu',
    names('京都河原町', 'Kyoto-kawaramachi', '京都河原町', 'きょうとかわらまち'),
    [135.76905, 35.00378],
    ['hankyu-kyoto'],
    'shijo-kawaramachi',
    'HK-86',
  ),
  station(
    'keihan-gion-shijo',
    'keihan',
    names('祇園四条', 'Gion-Shijo', '祇园四条', 'ぎおんしじょう'),
    [135.77175, 35.00275],
    ['keihan-main'],
    'shijo-kawaramachi',
    'KH40',
  ),
  // Synthetic coordinates from here on.
  station(
    'hankyu-karasuma',
    'hankyu',
    names('烏丸', 'Karasuma', '乌丸', 'からすま'),
    [135.7597, 35.0037],
    ['hankyu-kyoto'],
    'shijo-karasuma',
    'HK-85',
  ),
  station(
    'kyoto-subway-shijo',
    'kyoto-subway',
    names('四条', 'Shijo', '四条', 'しじょう'),
    [135.7595, 35.0033],
    ['kyoto-subway-karasuma'],
    'shijo-karasuma',
    'K09',
  ),
  station(
    'kyoto-subway-takeda',
    'kyoto-subway',
    names('竹田', 'Takeda', '竹田', 'たけだ'),
    [135.7597, 34.9583],
    ['kyoto-subway-karasuma'],
    null,
    'K15',
  ),
  station(
    'jr-central-shinosaka',
    'jr-central',
    names('新大阪（東海道新幹線）', 'Shin-Osaka (Tokaido Shinkansen)', '新大阪（东海道新干线）'),
    [135.5003, 34.7334],
    ['jr-central-tokaido-shinkansen'],
    null,
    null,
  ),
];

function line(
  slug: string,
  operatorSlug: OperatorSlug,
  localized: LocalizedNames,
  color: string,
  prefix: string | null,
  lineClass: RailLine['lineClass'],
  stationSlugs: string[],
): RailLine {
  return {
    ...base(ln(slug), localized),
    operatorId: op(operatorSlug),
    color,
    stationCodePrefix: prefix,
    lineClass,
    stationIds: stationSlugs.map(st),
    coverageStatus: 'partial',
  };
}

const lines: RailLine[] = [
  line(
    'jr-west-kyoto',
    'jr-west',
    names('JR京都線', 'JR Kyoto Line', 'JR京都线'),
    '#0071bb',
    'A',
    'trunk',
    ['jr-west-kyoto'],
  ),
  line(
    'jr-central-tokaido-shinkansen',
    'jr-central',
    names('東海道新幹線', 'Tokaido Shinkansen', '东海道新干线', 'とうかいどうしんかんせん'),
    '#f58220',
    null,
    'shinkansen',
    ['jr-central-kyoto', 'jr-central-shinosaka'],
  ),
  line(
    'hankyu-kyoto',
    'hankyu',
    names('阪急京都本線', 'Hankyu Kyoto Main Line', '阪急京都本线'),
    '#00834c',
    'HK',
    'private',
    ['hankyu-karasuma', 'hankyu-kyoto-kawaramachi'],
  ),
  line(
    'keihan-main',
    'keihan',
    names('京阪本線', 'Keihan Main Line', '京阪本线'),
    '#00523c',
    'KH',
    'private',
    ['keihan-gion-shijo'],
  ),
  line(
    'kintetsu-kyoto',
    'kintetsu',
    names('近鉄京都線', 'Kintetsu Kyoto Line', '近铁京都线'),
    '#b81d24',
    'B',
    'private',
    ['kintetsu-kyoto'],
  ),
  line(
    'kyoto-subway-karasuma',
    'kyoto-subway',
    names('烏丸線', 'Karasuma Line', '乌丸线', 'からすません'),
    '#2b8c4b',
    'K',
    'metro',
    ['kyoto-subway-shijo', 'kyoto-subway-kyoto', 'kyoto-subway-takeda'],
  ),
];

const coordinatesOf = (slug: string): [number, number] => {
  const found = stations.find((candidate) => candidate.id === st(slug));
  if (found === undefined) {
    throw new Error(`fixture station ${slug} missing`);
  }
  return found.coordinates;
};

function segment(
  slug: string,
  from: string,
  to: string,
  lineSlug: string,
  operatorSlug: OperatorSlug,
  lineClass: RailLine['lineClass'],
  operatingKm: number | null,
): TrackSegment {
  return {
    ...base(
      `sk:segment:kansai:${slug}`,
      names(`${from} – ${to}`, `${from} – ${to}`, `${from} – ${to}`),
    ),
    fromStationId: st(from),
    toStationId: st(to),
    railLineIds: [ln(lineSlug)],
    operatorId: op(operatorSlug),
    geometry: [coordinatesOf(from), coordinatesOf(to)],
    operatingKm,
    distanceNature: 'synthetic',
    lineClass,
    isShinkansen: lineClass === 'shinkansen',
    parallelConventionalLineId: null,
    fareZoneTags: [],
  };
}

const segments: TrackSegment[] = [
  segment(
    'hankyu-karasuma-kawaramachi',
    'hankyu-karasuma',
    'hankyu-kyoto-kawaramachi',
    'hankyu-kyoto',
    'hankyu',
    'private',
    null,
  ),
  segment(
    'karasuma-shijo-kyoto',
    'kyoto-subway-shijo',
    'kyoto-subway-kyoto',
    'kyoto-subway-karasuma',
    'kyoto-subway',
    'metro',
    null,
  ),
  segment(
    'karasuma-kyoto-takeda',
    'kyoto-subway-kyoto',
    'kyoto-subway-takeda',
    'kyoto-subway-karasuma',
    'kyoto-subway',
    'metro',
    null,
  ),
  // The one synthetic distance, so the line entry can show a summed value.
  segment(
    'tokaido-shinkansen-kyoto-shinosaka',
    'jr-central-kyoto',
    'jr-central-shinosaka',
    'jr-central-tokaido-shinkansen',
    'jr-central',
    'shinkansen',
    39,
  ),
];

const complexes: StationComplex[] = [
  {
    ...base(cx('kyoto'), names('京都駅', 'Kyoto Station', '京都站', 'きょうとえき')),
    stationIds: ['jr-west-kyoto', 'jr-central-kyoto', 'kintetsu-kyoto', 'kyoto-subway-kyoto'].map(
      st,
    ),
    coordinates: [135.75876, 34.98562],
    wardOrCity: '京都市下京区',
    explicitlyExcluded: [
      {
        name: '阪急 京都河原町駅',
        stationId: st('hankyu-kyoto-kawaramachi'),
        reason: '四条河原町 (about 2.3 km north-east of JR Kyoto)',
      },
      {
        name: '京阪 祇園四条駅',
        stationId: st('keihan-gion-shijo'),
        reason: 'East bank of the Kamo river (about 2.4 km north-east)',
      },
      {
        name: '阪急 烏丸駅',
        stationId: st('hankyu-karasuma'),
        reason: 'Shijo-Karasuma group, two subway stops north',
      },
      {
        name: '京阪 七条駅',
        stationId: st('keihan-shichijo'),
        reason: 'About 1.1 km east, on the east bank of the Kamo river',
      },
    ],
  },
  {
    ...base(
      cx('shijo-kawaramachi'),
      names('四条河原町', 'Shijo-Kawaramachi', '四条河原町', 'しじょうかわらまち'),
    ),
    stationIds: [st('hankyu-kyoto-kawaramachi'), st('keihan-gion-shijo')],
    coordinates: [135.7704, 35.0033],
    wardOrCity: null,
    explicitlyExcluded: [
      { name: 'JR 京都駅', stationId: st('jr-west-kyoto'), reason: 'Kyoto Station complex' },
    ],
  },
  {
    ...base(
      cx('shijo-karasuma'),
      names('四条烏丸', 'Shijo-Karasuma', '四条乌丸', 'しじょうからすま'),
    ),
    stationIds: [st('hankyu-karasuma'), st('kyoto-subway-shijo')],
    coordinates: [135.7596, 35.0035],
    wardOrCity: null,
    explicitlyExcluded: [],
  },
];

function interchange(
  slug: string,
  from: string,
  to: string,
  complex: string,
  gateType: Interchange['gateType'],
): Interchange {
  return {
    ...base(`sk:interchange:kansai:${slug}`, names(slug, slug, slug)),
    fromStationId: st(from),
    toStationId: st(to),
    stationComplexId: cx(complex),
    gateType,
    walkingMinutes: null,
    stepFree: null,
    notes: null,
  };
}

const interchanges: Interchange[] = [
  interchange('kyoto-jr-west-jr-central', 'jr-west-kyoto', 'jr-central-kyoto', 'kyoto', 'in_gate'),
  interchange(
    'kyoto-jr-west-subway',
    'jr-west-kyoto',
    'kyoto-subway-kyoto',
    'kyoto',
    'out_of_gate',
  ),
  interchange('kyoto-jr-west-kintetsu', 'jr-west-kyoto', 'kintetsu-kyoto', 'kyoto', 'unknown'),
  interchange(
    'shijo-kawaramachi-hankyu-keihan',
    'hankyu-kyoto-kawaramachi',
    'keihan-gion-shijo',
    'shijo-kawaramachi',
    'out_of_gate',
  ),
];

const sources: SourceRecord[] = [
  {
    id: FIXTURE_SOURCE_ID,
    title: 'SENKIRO web Atlas test fixture',
    publisher: 'SENKIRO',
    url: null,
    retrievedAt: '2026-11-28',
    sourceDate: null,
    license: 'AGPL-3.0-only (test data)',
    licenseUrl: null,
    commercialUse: 'unknown',
    redistribution: 'yes',
    shareAlike: false,
    attributionText: 'SENKIRO test fixture (synthetic)',
    notes: 'Not railway data. Built for UI tests from the frozen Phase 1 ID registry.',
  },
];

const throughServices: ThroughService[] = [
  {
    ...base(
      'sk:through:kansai:kintetsu-kyoto-kyoto-subway-karasuma',
      names(
        '近鉄京都線・烏丸線 直通',
        'Kintetsu Kyoto – Karasuma through service',
        '近铁京都线・乌丸线直通',
      ),
    ),
    boundaryStationId: st('kyoto-subway-takeda'),
    fromRailLineId: ln('kintetsu-kyoto'),
    toRailLineId: ln('kyoto-subway-karasuma'),
    operatorIds: [op('kintetsu'), op('kyoto-subway')],
    serviceDescription: 'Kintetsu Kyoto Line ⇄ Karasuma Line',
    notes: null,
  },
];

export const trackGraph: TrackGraph = {
  operators,
  lines,
  segments,
  stations,
  complexes,
  interchanges,
  sources,
};

export const KANSAI_FIXTURE_BUNDLE: RegionalAtlasBundle = {
  region: 'kansai',
  trackGraph,
  throughServices,
  pmtilesUrl: '',
};

/** Publishes the fixture for Kansai only, so Kanto shows the honest "unavailable" state. */
export const KANSAI_FIXTURE_PROVIDER: RegionalAtlasBundleProvider = {
  regions: ['kansai'],
  load: () => Promise.resolve(KANSAI_FIXTURE_BUNDLE),
};
