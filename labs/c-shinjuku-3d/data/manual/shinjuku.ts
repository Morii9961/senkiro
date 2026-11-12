/**
 * Hand-entered model of JR Shinjuku Station plus the Keio Line Shinjuku area.
 *
 * HOW THIS FILE WAS MADE
 *   The official floor maps listed in sources.ts were opened and read. What was
 *   written down here is facts only: names as printed, which floor an element
 *   is on, which side of a gate is paid, and what connects to what. No image
 *   was traced. Every coordinate below is invented ("schematic units") and
 *   every element says so through `geometryConfidence`.
 *
 * WHO ENTERED IT
 *   An AI coding agent, reading the maps on 2026-11-11. No human has re-checked
 *   the entries. `dataNature: 'manual-verified'` is used in the contract's
 *   sense of "entered by hand against an official page", with that caveat.
 *
 * ORIENTATION
 *   x grows south (towards Shibuya), z grows west. Platform 1 is the eastern
 *   island, platform 16 the western one — the order printed on the JR 1F map.
 */
import type {
  Area,
  Concourse,
  Entrance,
  FareZone,
  Gate,
  GateSide,
  GeometryConfidence,
  Level,
  Names,
  Operator,
  PassageArea,
  Passage,
  PlanPoint,
  PlanRect,
  Platform,
  PlatformTrack,
  Provenance,
  RailLine,
  Station,
  StationComplex,
  StationModel,
  StepFree,
  UnverifiedBlock,
  VerticalFacility,
  VerticalKind,
} from '../../src/domain/types';
import { RETRIEVED_AT } from './sources';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export const JR = 'sk:operator:jr-east';
export const KEIO = 'sk:operator:keio';
const ST_JR = 'sk:station:jr-east-shinjuku';
const ST_KEIO = 'sk:station:keio-shinjuku';
const PAID_JR: FareZone = 'paid:jr-east';
export const PAID_KEIO: FareZone = 'paid:keio';

export const S_SCHEMATIC = 'src:senkiro-lab-schematic';
const S_PAGE = 'src:jreast-estation-866';
const S_B1 = 'src:jreast-floormap-b1f';
const S_1F = 'src:jreast-floormap-1f';
const S_2F = 'src:jreast-floormap-2f';
const S_ALL = 'src:jreast-floormap-all';
const S_M773 = 'src:jre-media-773';
const S_M6147 = 'src:jre-media-6147';
const S_KEIO = 'src:keio-station-map';
const S_KEIO_PAGE = 'src:keio-shinjuku-page';
const S_KEIO_LAYER = 'src:keio-layer-map';
const S_TERMINAL = 'src:shinjuku-terminal-map';
const S_ODAKYU = 'src:odakyu-shinjuku-map';

/** Second reading session: the other operators' maps and the newer Keio drawing. */
export const D2 = '2026-11-12';
export const ODAKYU = 'sk:operator:odakyu';
export const METRO = 'sk:operator:tokyo-metro';
export const TOEI = 'sk:operator:toei';
export const BUSTA = 'sk:operator:busta-shinjuku';
/** Areas of other operators that JR and Keio gates open into (defined in extensions.ts). */
export const X = {
  odakyuB1Concourse: 'sk:area:odakyu-b1f-concourse',
  odakyu2fConcourse: 'sk:area:odakyu-2f-concourse',
  newLinePaidEast: 'sk:area:keio-new-line-b1f-paid-east',
} as const;

const JR_ASOF = '2026-08';
const KEIO_ASOF = '2026-03';

export function names(ja: string | null, en: string | null, zh: string | null = null): Names {
  // ja_kana is null everywhere: readings were not checked against a source.
  return { ja, ja_kana: null, en, zh };
}

export function prov(sourceIds: string[], note?: string, at: string = RETRIEVED_AT): Provenance {
  return { sourceIds, dataNature: 'manual-verified', lastVerifiedAt: at, ...(note ? { note } : {}) };
}

const synthetic: Provenance = {
  sourceIds: [S_SCHEMATIC],
  dataNature: 'synthetic',
  lastVerifiedAt: RETRIEVED_AT,
  note: 'Placeholder. Not verified against any operator source.',
};

export function rect(x0: number, x1: number, z0: number, z1: number): PlanRect {
  return { x0, x1, z0, z1 };
}
export function pt(x: number, z: number): PlanPoint {
  return { x, z };
}

export interface Common {
  stationId: string | null;
  asOf: string | null;
  geometryConfidence: GeometryConfidence;
}
export const jrCommon: Common = { stationId: ST_JR, asOf: JR_ASOF, geometryConfidence: 'schematic' };
/** Keio: the arrangement follows the 階層図, the sizes are invented. */
export const keioCommon: Common = { stationId: ST_KEIO, asOf: KEIO_ASOF, geometryConfidence: 'schematic' };

export const base = (id: string, n: Names, p: Provenance, c: Common, notes?: string) => ({
  id,
  externalIds: {},
  names: n,
  provenance: p,
  validFrom: null,
  validTo: null,
  stationId: c.stationId,
  existence: 'verified' as const,
  geometryConfidence: c.geometryConfidence,
  asOf: c.asOf,
  ...(notes ? { notes } : {}),
});

// ---------------------------------------------------------------------------
// operators, lines, stations
// ---------------------------------------------------------------------------

export const entity = (id: string, n: Names, p: Provenance) => ({
  id,
  externalIds: {},
  names: n,
  provenance: p,
  validFrom: null,
  validTo: null,
});

const operators: Operator[] = [
  { kind: 'operator', ...entity(JR, names('東日本旅客鉄道（JR東日本）', 'East Japan Railway Company (JR East)', 'JR东日本'), prov([S_PAGE])) },
  { kind: 'operator', ...entity(KEIO, names('京王電鉄', 'Keio Corporation', '京王电铁'), prov([S_KEIO_PAGE])) },
  { kind: 'operator', ...entity(ODAKYU, names('小田急電鉄', 'Odakyu Electric Railway', '小田急电铁'), prov([S_ODAKYU], undefined, D2)) },
  { kind: 'operator', ...entity(METRO, names('東京メトロ', 'Tokyo Metro', '东京地铁'), prov(['src:tokyo-metro-shinjuku-map'], undefined, D2)) },
  { kind: 'operator', ...entity(TOEI, names('東京都交通局（都営地下鉄）', 'Toei Subway', '都营地铁'), prov(['src:toei-shinjuku-map'], undefined, D2)) },
  { kind: 'operator', ...entity(BUSTA, names('バスタ新宿', 'Busta Shinjuku', 'Busta 新宿'), prov(['src:busta-floor-maps'], 'A bus terminal, not a railway operator; listed so that its floors have an owner.', D2)) },
];

export const COLOR_NOTE =
  'Approximation of the colour bar printed beside this line in the legend of the operator floor map. Not an official colour value.';

export function line(
  slug: string, operatorId: string, n: Names, color: string, p: Provenance, note = COLOR_NOTE, prefix: string | null = null,
): RailLine {
  return {
    kind: 'rail-line',
    ...entity(`sk:line:${slug}`, n, p),
    operatorId,
    displayColor: color,
    displayColorNote: note,
    stationNumberPrefix: prefix,
  };
}

const L = {
  saikyo: 'sk:line:jr-east-saikyo',
  shonan: 'sk:line:jr-east-shonan-shinjuku',
  nex: 'sk:line:jr-east-narita-express',
  tobu: 'sk:line:jr-east-tobu-through-limited-express',
  chuoRapid: 'sk:line:jr-east-chuo-rapid',
  chuoLtd: 'sk:line:jr-east-chuo-limited-express',
  chuoSobu: 'sk:line:jr-east-chuo-sobu-local',
  yamanote: 'sk:line:jr-east-yamanote',
  keio: 'sk:line:keio-keio',
};

const legendProv = prov([S_B1, S_1F], 'Name as printed in the platform legend of the JR floor maps.');
const codeProv = prov([S_B1, S_1F, S_TERMINAL],
  'Name as printed in the platform legend of the JR floor maps; line letters as printed in the legend of the 新宿ターミナルマップ.', D2);
const SERVICE_NOTE =
  'Printed in the platform legend as a train service rather than a line; shown in neutral grey. In the shared contract this would be a ServicePattern, not a RailLine.';

const railLines: RailLine[] = [
  line('jr-east-saikyo', JR, names('埼京線', 'Saikyo Line', '埼京线'), '#1f9d8b', codeProv, COLOR_NOTE, 'JA'),
  line('jr-east-shonan-shinjuku', JR, names('湘南新宿ライン', 'Shonan-Shinjuku Line', '湘南新宿线'), '#d6453d', legendProv),
  line('jr-east-narita-express', JR, names('成田エクスプレス', "Narita Express", '成田特快'), '#7d8590', legendProv, SERVICE_NOTE),
  line('jr-east-tobu-through-limited-express', JR, names('東武線直通（特急）', 'Tobu Line through limited express', '东武线直通特急'), '#7d8590', legendProv, SERVICE_NOTE),
  line('jr-east-chuo-rapid', JR, names('中央線（快速）', 'Chuo Line (Rapid)', '中央线（快速）'), '#e8651a', codeProv, COLOR_NOTE, 'JC'),
  line('jr-east-chuo-limited-express', JR, names('中央本線（特急）', 'Chuo Main Line (Limited Express)', '中央本线（特急）'), '#2f6fbd', legendProv),
  line('jr-east-chuo-sobu-local', JR, names('中央・総武線（各駅停車）', 'Chuo-Sobu Line (Local)', '中央·总武线（各站停车）'), '#d9b400', codeProv, COLOR_NOTE, 'JB'),
  line('jr-east-yamanote', JR, names('山手線', 'Yamanote Line', '山手线'), '#7fb62e', codeProv, COLOR_NOTE, 'JY'),
  line('keio-keio', KEIO, names('京王線', 'Keio Line', '京王线'), '#c2327d', prov([S_KEIO_PAGE, S_TERMINAL], 'Line letters as printed on the 新宿ターミナルマップ.', D2),
    'Chosen by this prototype for contrast. Not taken from a Keio source and not an official colour value.', 'KO'),
];

const complex: StationComplex = {
  kind: 'station-complex',
  ...entity('sk:complex:shinjuku', names('新宿駅', 'Shinjuku Station', '新宿站'), prov([S_PAGE, S_KEIO_PAGE])),
  stationIds: [ST_JR, ST_KEIO, 'sk:station:odakyu-shinjuku', 'sk:station:keio-new-line-shinjuku', 'sk:station:toei-oedo-shinjuku', 'sk:station:tokyo-metro-shinjuku'],
  explicitlyExcluded: [
    { name: '西武新宿駅 (Seibu-Shinjuku)', reason: 'A different station of a different operator. Not part of this model and not drawn.' },
    { name: '新宿三丁目駅 (Shinjuku-sanchome)', reason: 'A different station. Not part of this model and not drawn.' },
    { name: '新宿西口駅 (Shinjuku-nishiguchi, Toei Oedo Line)', reason: 'A different station. It appears on the JR and Tokyo Metro 立体図 as a neighbour and is not modelled.' },
  ],
};

const stations: Station[] = [
  {
    kind: 'station',
    ...entity(ST_JR, names('新宿駅（JR東日本）', 'Shinjuku Station (JR East)', '新宿站（JR东日本）'), prov([S_PAGE])),
    operatorId: JR,
    complexId: complex.id,
    railLineIds: [L.saikyo, L.shonan, L.nex, L.tobu, L.chuoRapid, L.chuoLtd, L.chuoSobu, L.yamanote],
  },
  {
    kind: 'station',
    ...entity(ST_KEIO, names('京王線新宿駅', 'Keio Line Shinjuku Station', '京王线新宿站'), prov([S_KEIO_PAGE, S_KEIO])),
    operatorId: KEIO,
    complexId: complex.id,
    railLineIds: [L.keio],
  },
];

// ---------------------------------------------------------------------------
// levels
// ---------------------------------------------------------------------------

export const LV = {
  jrB1: 'sk:level:jr-east-shinjuku-b1f',
  jrKeioLink: 'sk:level:jr-east-shinjuku-b1f-keio-corridor',
  jr1: 'sk:level:jr-east-shinjuku-1f',
  jr2: 'sk:level:jr-east-shinjuku-2f',
  keioB1: 'sk:level:keio-shinjuku-b1f',
  keioB2: 'sk:level:keio-shinjuku-b2f',
};

export const ELEV_NOTE = 'Schematic. Floor heights were not measured; only the vertical order is taken from the sources.';

const levels: Level[] = [
  {
    kind: 'level',
    ...base(LV.jr2, names('2F', '2F', '2F'), prov([S_2F, S_ALL, S_M773]), jrCommon,
      'Two separate paid areas exist on this floor (南口コンコース; the 新南改札 side). The JR 2F map draws them as two blocks with 甲州街道 between them.'),
    operatorId: JR, label: '2F', ordinal: 1, elevation: 4, elevationNote: ELEV_NOTE,
  },
  {
    kind: 'level',
    ...base(LV.jr1, names('1F', '1F', '1F'), prov([S_1F, S_ALL, S_M6147]), jrCommon,
      'Platform level. The JR 1F map also places the street-level 東口 of ルミネエスト on this floor.'),
    operatorId: JR, label: '1F', ordinal: 0, elevation: 0, elevationNote: ELEV_NOTE,
  },
  {
    kind: 'level',
    ...base(LV.jrB1, names('B1F', 'B1F', 'B1F'), prov([S_B1, S_ALL, S_M773]), jrCommon),
    operatorId: JR, label: 'B1F', ordinal: -1, elevation: -4, elevationNote: ELEV_NOTE,
  },
  {
    kind: 'level',
    ...base(LV.jrKeioLink, names('B1F（京王線連絡通路）', 'B1F (corridor to the Keio Line)', 'B1F（通往京王线的通道）'), prov([S_B1, S_KEIO, S_ODAKYU], undefined, D2), jrCommon,
      'Not a separate floor in any source: JR prints this corridor on its B1F sheet, with two flights of steps along it. It is a level of its own here only so that it can be drawn below the Odakyu B1F concourse, which it has to cross on its way west. Which of the two is higher was not established.'),
    operatorId: JR, label: 'B1F', ordinal: -1, elevation: -5.4,
    elevationNote: 'Schematic. Drawn level with Keio B1F and below Odakyu B1F; the real heights are unknown.',
  },
  {
    kind: 'level',
    ...base(LV.keioB1, names('B1F（京王）', 'B1F (Keio)', 'B1F（京王）'), prov([S_KEIO, S_B1]), keioCommon,
      'Keio numbers its own floors. Whether Keio "B1F" and JR "B1F" share a floor height is NOT established: the JR B1F map draws two flights of steps in the corridor leading to 京王線連絡口. Both are given ordinal −1; the small drawn offset is a reminder, not a measurement.'),
    operatorId: KEIO, label: 'B1F', ordinal: -1, elevation: -5.4,
    elevationNote: 'Schematic and deliberately offset from JR B1F. Relative height unknown.',
  },
  {
    kind: 'level',
    ...base(LV.keioB2, names('B2F（京王）', 'B2F (Keio)', 'B2F（京王）'), prov([S_KEIO]), keioCommon),
    operatorId: KEIO, label: 'B2F', ordinal: -2, elevation: -8, elevationNote: ELEV_NOTE,
  },
];

// ---------------------------------------------------------------------------
// areas
// ---------------------------------------------------------------------------

export const A = {
  // JR B1F
  free: 'sk:area:jr-b1f-east-west-free-passage',
  eastUnpaid: 'sk:area:jr-b1f-east-unpaid',
  westUnpaid: 'sk:area:jr-b1f-west-unpaid',
  chuoWestUnpaid: 'sk:area:jr-b1f-central-west-unpaid',
  north: 'sk:area:jr-b1f-north-concourse',
  eastLink: 'sk:area:jr-b1f-east-link',
  westLink: 'sk:area:jr-b1f-west-link',
  central: 'sk:area:jr-b1f-central-passage',
  southPassage: 'sk:area:jr-b1f-passage-to-platform-5-6',
  keioLink: 'sk:area:jr-b1f-keio-connection-corridor',
  // JR 1F
  eastGround: 'sk:area:jr-1f-east-exit-street-level',
  southeastGround: 'sk:area:jr-1f-southeast-street-level',
  // JR 2F
  south: 'sk:area:jr-2f-south-concourse',
  southUnpaid: 'sk:area:jr-2f-south-exit-unpaid',
  southeastUnpaid: 'sk:area:jr-2f-southeast-unpaid',
  newSouth: 'sk:area:jr-2f-new-south-concourse',
  koshuUnpaid: 'sk:area:jr-2f-koshu-kaido-unpaid',
  newSouthUnpaid: 'sk:area:jr-2f-new-south-unpaid',
  mirainaUnpaid: 'sk:area:jr-2f-miraina-tower-unpaid',
  // Keio
  keioPaid: 'sk:area:keio-b1f-concourse',
  keioDeptUnpaid: 'sk:area:keio-b1f-department-store-side-unpaid',
  keioWestUnpaid: 'sk:area:keio-b1f-west-gate-unpaid',
  keioLuminePaid: 'sk:area:keio-b1f-lumine-gate-landing',
  keioLumineUnpaid: 'sk:area:keio-b1f-lumine-gate-unpaid',
  keioHirobaPaid: 'sk:area:keio-b1f-hiroba-gate-landing',
  keioRinjiPaid: 'sk:area:keio-b1f-temporary-gate-landing',
  keioMall: 'sk:area:keio-b1f-keio-mall',
  keioHead: 'sk:area:keio-b2f-platform-head',
  keioP12: 'sk:platform:keio-shinjuku-1-2',
  keioP3: 'sk:platform:keio-shinjuku-3',
};

export function concourse(
  id: string, levelId: string, fareZone: FareZone, n: Names, footprint: PlanRect[], anchor: PlanPoint,
  p: Provenance, c: Common = jrCommon, notes?: string,
): Concourse {
  return { kind: 'concourse', ...base(id, n, p, c, notes), levelId, fareZone, footprint, anchor };
}
export function passageArea(
  id: string, levelId: string, fareZone: FareZone, n: Names, footprint: PlanRect[], anchor: PlanPoint,
  p: Provenance, c: Common = jrCommon, notes?: string,
): PassageArea {
  return { kind: 'passage', ...base(id, n, p, c, notes), levelId, fareZone, footprint, anchor };
}

// --- JR platforms ----------------------------------------------------------

const HW = 1.3; // schematic half-width of a platform island
const ISLAND_Z = { '1-2': -14, '3-4': -10, '5-6': -6, '7-8': -2, '9-10': 2, '11-12': 6, '13-14': 10, '15-16': 14 } as const;
type Island = keyof typeof ISLAND_Z;
const PF = (island: Island) => `sk:platform:jr-east-shinjuku-${island}`;

export const svc = (railLineId: string, towardsJa: string, towardsEn: string) => ({ railLineId, towardsJa, towardsEn });

/** Track legend exactly as printed on the JR B1F / 1F / 2F maps (2026年8月現在). */
const TRACKS: Record<Island, PlatformTrack[]> = {
  '1-2': [
    { number: '1', services: [
      svc(L.saikyo, '渋谷・大崎・りんかい線・相鉄線方面／一部 池袋・大宮・川越方面', 'for Shibuya, Osaki, Rinkai Line, Sotetsu Line / some for Ikebukuro, Omiya, Kawagoe'),
      svc(L.shonan, '横浜・大船・小田原・逗子方面', 'for Yokohama, Ofuna, Odawara, Zushi'),
    ] },
    { number: '2', services: [
      svc(L.saikyo, '渋谷・大崎・りんかい線・相鉄線方面／池袋・大宮・川越方面', 'for Shibuya, Osaki, Rinkai Line, Sotetsu Line / for Ikebukuro, Omiya, Kawagoe'),
      svc(L.shonan, '横浜・大船・小田原・逗子方面', 'for Yokohama, Ofuna, Odawara, Zushi'),
    ] },
  ],
  '3-4': [
    { number: '3', services: [svc(L.saikyo, '池袋・大宮・川越方面／渋谷・大崎・相鉄線方面', 'for Ikebukuro, Omiya, Kawagoe / for Shibuya, Osaki, Sotetsu Line')] },
    { number: '4', services: [
      svc(L.saikyo, '池袋・大宮・川越方面', 'for Ikebukuro, Omiya, Kawagoe'),
      svc(L.shonan, '大宮・宇都宮・高崎方面', 'for Omiya, Utsunomiya, Takasaki'),
    ] },
  ],
  '5-6': [
    { number: '5', services: [svc(L.nex, '（特急）', '(limited express)'), svc(L.tobu, '（特急）', '(limited express)')] },
    { number: '6', services: [svc(L.nex, '（特急）', '(limited express)'), svc(L.tobu, '（特急）', '(limited express)')] },
  ],
  '7-8': [
    { number: '7', services: [svc(L.chuoRapid, '御茶ノ水・東京方面', 'for Ochanomizu, Tokyo')] },
    { number: '8', services: [svc(L.chuoRapid, '御茶ノ水・東京方面', 'for Ochanomizu, Tokyo')] },
  ],
  '9-10': [
    { number: '9', services: [svc(L.chuoLtd, '甲府・松本方面', 'for Kofu, Matsumoto')] },
    { number: '10', services: [svc(L.chuoLtd, '甲府・松本方面', 'for Kofu, Matsumoto')] },
  ],
  '11-12': [
    { number: '11', services: [svc(L.chuoRapid, '中野・立川・高尾方面', 'for Nakano, Tachikawa, Takao')] },
    { number: '12', services: [svc(L.chuoRapid, '中野・立川・高尾方面', 'for Nakano, Tachikawa, Takao')] },
  ],
  '13-14': [
    { number: '13', services: [svc(L.chuoSobu, '水道橋・秋葉原・千葉方面', 'for Suidobashi, Akihabara, Chiba')] },
    { number: '14', services: [svc(L.yamanote, '原宿・渋谷・品川方面', 'for Harajuku, Shibuya, Shinagawa')] },
  ],
  '15-16': [
    { number: '15', services: [svc(L.yamanote, '池袋・田端・上野方面', 'for Ikebukuro, Tabata, Ueno')] },
    { number: '16', services: [svc(L.chuoSobu, '東中野・中野・三鷹方面', 'for Higashi-Nakano, Nakano, Mitaka')] },
  ],
};

/** Schematic north / south ends of each island. Only the *relative* reach follows the 1F map. */
const ISLAND_X: Record<Island, [number, number]> = {
  '1-2': [-4, 38], '3-4': [-3, 38], '5-6': [22, 46],
  '7-8': [-18, 30], '9-10': [-19, 30], '11-12': [-20, 30], '13-14': [-22, 30], '15-16': [-23, 30],
};

function jrPlatform(island: Island): Platform {
  const [a, b] = island.split('-');
  const z = ISLAND_Z[island];
  const [x0, x1] = ISLAND_X[island];
  return {
    kind: 'platform',
    ...base(PF(island), names(`${a}・${b}番線ホーム`, `Platforms ${a}–${b}`, `${a}·${b}号站台`), prov([S_1F, S_B1, S_M6147]), jrCommon,
      island === '5-6'
        ? 'Set apart to the south. The JR 立体図 notes: "⑤・⑥番線への乗り換えは約10分ほどかかります". This model does not output walking times.'
        : undefined),
    levelId: LV.jr1,
    fareZone: PAID_JR,
    footprint: [rect(x0, x1, z - HW, z + HW)],
    anchor: pt(island === '5-6' ? 30 : 6, z),
    // Tracks are numbered from east to west on the JR 1F map, so on every island
    // the lower number is on the east (low-z) edge.
    tracks: TRACKS[island].map((t, i) => ({ ...t, side: i === 0 ? ('z-' as const) : ('z+' as const) })),
  };
}

const jrPlatforms = (Object.keys(ISLAND_Z) as Island[]).map(jrPlatform);

// --- JR concourses -----------------------------------------------------------

const jrAreas: Area[] = [
  // B1F, unpaid
  passageArea(A.free, LV.jrB1, 'unpaid', names('東西自由通路', 'East–West Free Passage', '东西自由通道'),
    [rect(-18.5, -15, -17, 18)], pt(-16.75, 0), prov([S_B1, S_M773]), jrCommon,
    'JREメディア: "新宿駅東口と西口を結ぶ東西自由通路". No ticket is needed to walk through.'),
  concourse(A.eastUnpaid, LV.jrB1, 'unpaid', names('東口 地下（改札外・ルミネエスト新宿 B1）', 'East Exit basement (outside the gates)', '东口地下（检票口外）'),
    [rect(-18.5, 0, -23, -17)], pt(-9, -20), prov([S_B1])),
  concourse(A.westUnpaid, LV.jrB1, 'unpaid', names('西口 地下（東西自由通路 西端・改札外）', 'West Exit basement (west end of the free passage)', '西口地下（自由通道西端）'),
    [rect(-18.5, -15, 18, 22)], pt(-16.75, 20), prov([S_B1, S_M773]), jrCommon,
    'The JR B1F map ends here with the labels "京王線へ", "西口バスのりば（地上行きエレベーターあり）", "丸ノ内線(B2)行きエレベーターあり". What lies beyond is not drawn on the JR map.'),
  concourse(A.chuoWestUnpaid, LV.jrB1, 'unpaid', names('中央西改札外', 'Outside Central West Gate', '中央西检票口外'),
    [rect(-9, -0.8, 17.5, 18.2)], pt(-3.4, 17.85), prov([S_B1]), jrCommon,
    'Only the ticket office next to the gate is drawn on the JR B1F map. Drawn as a thin strip along the Odakyu concourse, which lies directly west of it.'),
  // B1F, paid
  concourse(A.north, LV.jrB1, PAID_JR, names('北側コンコース（東改札・西改札内）', 'North concourse (inside East / West Gates)', '北侧站厅（东·西检票口内）'),
    [rect(-14.5, -10.5, -15, 16)], pt(-12.5, 0), prov([S_B1, S_1F]), jrCommon,
    'The JR maps give this area no name of its own; the 1F map calls its stair zone "B1F 東改札・西改札". The label is descriptive.'),
  passageArea(A.eastLink, LV.jrB1, PAID_JR, names(null, 'East link (paid)', '东侧连接通道（付费区）'),
    [rect(-10.5, -2, -15, -12.5)], pt(-6.25, -13.75), prov([S_B1]), jrCommon,
    'Unnamed on the map: the paid corridor joining the north concourse to the 中央東改札 end of the central passage.'),
  passageArea(A.westLink, LV.jrB1, PAID_JR, names(null, 'West link (paid)', '西侧连接通道（付费区）'),
    [rect(-10.5, -2, 15, 17)], pt(-6.25, 16), prov([S_B1]), jrCommon,
    'Unnamed on the map: the paid corridor joining the north concourse to the 中央西改札 end of the central passage.'),
  concourse(A.central, LV.jrB1, PAID_JR, names('中央通路', 'Central Passage', '中央通道'),
    [rect(-2, 2, -16.5, 17), rect(2, 7, -16.5, -8.5)], pt(0, 0), prov([S_B1, S_ALL, S_1F]), jrCommon,
    'Named "中央通路" on the JR 立体図. The stairs to platforms 1–4 leave from its east end.'),
  passageArea(A.southPassage, LV.jrB1, PAID_JR, names('5・6番線連絡通路', 'Passage to Platforms 5–6', '通往5·6号站台的通道'),
    [rect(5, 7, -8.5, -2.5), rect(7, 22.5, -5.5, -2.5)], pt(14, -4), prov([S_B1]), jrCommon,
    'Unnamed on the map: the long paid corridor from the east end of the central passage past elevator Ⓖ to the "5, 6番線へ" escalator. The label is descriptive.'),
  passageArea(A.keioLink, LV.jrKeioLink, PAID_JR, names('京王線連絡通路（JR改札内）', 'Corridor to the Keio Line (inside JR gates)', '通往京王线的通道（JR付费区）'),
    [rect(-0.4, 1, 17, 25.6), rect(-0.4, 4, 25.6, 27)], pt(0.3, 26.3), prov([S_B1, S_KEIO]), jrCommon,
    'Labelled "京王線へ" on the JR B1F map, which draws two flights of steps along it; Keio labels the same link "JR線連絡通路". Not step-free.'),
  // 1F street level
  concourse(A.eastGround, LV.jr1, 'unpaid', names('東口（地上・ルミネエスト新宿 1F）', 'East Exit (street level)', '东口（地面）'),
    [rect(-18, -11, -23, -19)], pt(-14.5, -21), prov([S_1F, S_B1])),
  concourse(A.southeastGround, LV.jr1, 'unpaid', names('東南改札下（地上）', 'Street level below Southeast Gate', '东南检票口下方（地面）'),
    [rect(13, 17, -23, -18.5)], pt(15, -21), prov([S_2F, S_1F]), jrCommon,
    'The JR 2F map labels the stairs, escalators and elevator outside 東南改札 "地上へ"; the 1F map draws their lower end.'),
  // 2F
  concourse(A.south, LV.jr2, PAID_JR, names('南口コンコース', 'South Concourse', '南口站厅'),
    [rect(12, 19, -4.5, 16), rect(13, 16, -16, -4.5)], pt(15.5, 6), prov([S_2F, S_ALL, S_M6147])),
  concourse(A.southUnpaid, LV.jr2, 'unpaid', names('南口（改札外・甲州街道側）', 'South Exit (outside the gates, Koshu-kaido side)', '南口（检票口外·甲州街道侧）'),
    [rect(19.5, 22, 3, 17)], pt(20.75, 10), prov([S_2F, S_M773, S_ALL])),
  concourse(A.southeastUnpaid, LV.jr2, 'unpaid', names('東南改札外', 'Outside Southeast Gate', '东南检票口外'),
    [rect(12.5, 17, -19.5, -16.5)], pt(14.75, -18), prov([S_2F])),
  concourse(A.newSouth, LV.jr2, PAID_JR, names('新南改札・甲州街道改札・ミライナタワー改札 内コンコース', 'New South concourse (inside New South / Koshu-kaido / Miraina Tower Gates)', '新南站厅（新南·甲州街道·Miraina Tower 检票口内）'),
    [rect(27, 31, -16, 15)], pt(29, 0), prov([S_2F, S_1F]), jrCommon,
    'Unnamed on the map; the 1F map calls its stair zone "2F 甲州街道改札・新南改札・ミライナタワー改札". Separate from 南口コンコース: no paid link between the two is drawn on 2F.'),
  concourse(A.koshuUnpaid, LV.jr2, 'unpaid', names('甲州街道改札外', 'Outside Koshu-kaido Gate', '甲州街道检票口外'),
    [rect(24, 26.5, -4, 2)], pt(25.25, -1), prov([S_2F])),
  concourse(A.newSouthUnpaid, LV.jr2, 'unpaid', names('新南改札外', 'Outside New South Gate', '新南检票口外'),
    [rect(31.5, 35.5, -6, 6)], pt(33.5, 0), prov([S_2F, S_ALL]), jrCommon,
    'The JR maps label "Suicaのペンギン広場" and lifts / escalators to バスタ新宿 on this side.'),
  concourse(A.mirainaUnpaid, LV.jr2, 'unpaid', names('ミライナタワー改札外', 'Outside Miraina Tower Gate', 'Miraina Tower 检票口外'),
    [rect(26.5, 31.5, -19.5, -16.5)], pt(29, -18), prov([S_2F])),
];

// --- Keio areas ------------------------------------------------------------
//
// Laid out after the 京王線新宿駅階層図 (2026年3月末現在): the platforms run
// north–south, the concourse sits over their north end with 京王西口 on its
// north side, 京王百貨店口 on its west side and the two JR-side gates on its
// east side; ルミネ口 is a separate landing over the south end.

const keioProv = prov([S_KEIO, S_KEIO_LAYER], undefined, D2);
const keioSvc = svc(L.keio, '京王八王子・高尾山口・橋本', 'for Keio-hachioji, Takaosanguchi, Hashimoto');

function keioPlatform(id: string, n: Names, footprint: PlanRect, anchor: PlanPoint, tracks: PlatformTrack[], notes: string): Platform {
  return {
    kind: 'platform',
    ...base(id, n, prov([S_KEIO_LAYER, S_KEIO, S_KEIO_PAGE], undefined, D2), keioCommon, notes),
    levelId: LV.keioB2, fareZone: PAID_KEIO, footprint: [footprint], anchor, tracks,
  };
}

const keioAreas: Area[] = [
  concourse(A.keioPaid, LV.keioB1, PAID_KEIO, names('京王線 改札内コンコース（B1F）', 'Keio Line concourse (inside gates, B1F)', '京王线站厅（付费区，B1F）'),
    [rect(0, 10, 28, 34)], pt(5, 31), keioProv, keioCommon),
  concourse(A.keioDeptUnpaid, LV.keioB1, 'unpaid', names('京王百貨店口前・京王のれん街（改札外）', 'Outside Keio Department Store Gate / Keio Noren-gai', '京王百货店口外·京王暖帘街'),
    [rect(4.8, 11, 26.4, 27.4), rect(11, 13, 26.4, 38), rect(-1, 11, 35, 38)], pt(5, 36.5), prov([S_KEIO, S_KEIO_LAYER, S_B1], undefined, D2), keioCommon,
    'One unpaid area wrapping the west, south and east sides of the concourse: 京王百貨店口 opens onto its west side, JR中央西改札 and 臨時口 onto the strip the Keio drawing labels 京王のれん街 on the east side. That the three sides join was read from the unpaid tone of the drawing.'),
  concourse(A.keioWestUnpaid, LV.keioB1, 'unpaid', names('京王西口前（改札外）', 'Outside Keio West Gate', '京王西口外'),
    [rect(-4, -1, 27.6, 38)], pt(-2.5, 31), keioProv, keioCommon,
    'Keio prints "丸ノ内線へ 西口方面", "JR線・小田急線へ 東口方面" and "都庁方面" on this side.'),
  concourse(A.keioHirobaPaid, LV.keioB1, PAID_KEIO, names('広場口 改札内（B1F）', 'Hiroba Gate landing (inside gates, B1F)', '广场口内侧（B1F）'),
    [rect(-3.4, -1.6, 25.6, 26.9)], pt(-2.5, 26.25), prov([S_KEIO_LAYER], undefined, D2), keioCommon,
    'Marked Ⓔ on the Keio drawing: a small landing reached by stairs from the platform level, not from the main concourse.'),
  concourse(A.keioRinjiPaid, LV.keioB1, PAID_KEIO, names('臨時口 改札内（B1F）', 'Temporary Gate landing (inside gates, B1F)', '临时口内侧（B1F）'),
    [rect(7, 8.6, 25.2, 26)], pt(7.8, 25.6), prov([S_KEIO_LAYER], undefined, D2), keioCommon,
    'Marked Ⓓ on the Keio drawing: a small landing reached by stairs from the platform level.'),
  concourse(A.keioLuminePaid, LV.keioB1, PAID_KEIO, names('ルミネ口 改札内（B1F）', 'Lumine Gate landing (inside gates, B1F)', 'Lumine口内侧（B1F）'),
    [rect(22, 26, 29, 34.6)], pt(24, 31.5), keioProv, keioCommon,
    'Marked Ⓒ: a separate B1F landing over the south end of the platforms, with stairs and escalators to both boarding platforms.'),
  concourse(A.keioLumineUnpaid, LV.keioB1, 'unpaid', names('ルミネ口前（改札外）', 'Outside Lumine Gate', 'Lumine口外'),
    [rect(27, 31, 29, 33)], pt(29, 31), keioProv, keioCommon,
    'Keio prints "新線新宿駅へ", "ルミネへ" and "南口方面" here.'),
  passageArea(A.keioMall, LV.keioB1, 'unpaid', names('京王モール', 'Keio Mall', '京王 Mall'),
    [rect(13, 31, 36, 38)], pt(22, 37), prov([S_KEIO_LAYER, 'src:keio-new-line-layer-map'], undefined, D2), keioCommon,
    'The underground passage the Keio drawings label 京王モール, running from 京王百貨店口 towards "京王新線・都営新宿線・大江戸線". The wheelchair route of the Keio drawings runs along it.'),
  passageArea(A.keioHead, LV.keioB2, PAID_KEIO, names(null, 'Platform head (B2F)', '站台端部（B2F）'),
    [rect(0, 2, 29, 34.6)], pt(1, 31.8), prov([S_KEIO_LAYER], undefined, D2), keioCommon,
    'Unnamed: the north end of the platform level, where the two boarding platforms join beyond the buffer stops.'),
  keioPlatform(A.keioP12, names('1・2番線ホーム', 'Platforms 1–2', '1·2号站台'), rect(2, 30, 29, 30.6), pt(12, 29.8),
    [{ number: '1', services: [keioSvc], side: 'z-' }, { number: '2', services: [keioSvc], side: 'z+' }],
    'The east island of the Keio drawing. Trains from 1–3 do not stop at 初台 / 幡ヶ谷 (printed on the Keio map).'),
  keioPlatform(A.keioP3, names('3番線ホーム', 'Platform 3', '3号站台'), rect(2, 30, 33, 34.6), pt(12, 33.8),
    [{ number: '3', services: [keioSvc], side: 'z-' }],
    'The west platform. The 降車専用ホーム drawn between tracks 2 and 3 is for alighting only and is not modelled. Keio: "③ホーム京王八王子寄りの階段を昇ると京王新線・都営新宿線④⑤ホームにつながります".'),
];

const areas: Area[] = [...jrAreas, ...jrPlatforms, ...keioAreas];

// ---------------------------------------------------------------------------
// passages (same-level, same-zone links between areas)
// ---------------------------------------------------------------------------

export function link(
  slug: string, fromAreaId: string, toAreaId: string, p: Provenance, stepFree: StepFree,
  opts: { hasSteps?: boolean | null; inferred?: boolean; notes?: string; common?: Common } = {},
): Passage {
  return {
    kind: 'passage-link',
    ...base(`sk:passage:${slug}`, names(null, null), p, opts.common ?? jrCommon, opts.notes),
    fromAreaId,
    toAreaId,
    connection: opts.inferred ? 'inferred' : 'verified',
    stepFree,
    hasSteps: opts.hasSteps ?? null,
  };
}

const RED = 'On the "バリアフリー移動経路" (red line) of the JR floor map.';

const passages: Passage[] = [
  link('jr-b1f-free-passage-east-end', A.free, A.eastUnpaid, prov([S_B1]), null),
  link('jr-b1f-free-passage-west-end', A.free, A.westUnpaid, prov([S_B1]), null),
  link('jr-b1f-north-to-east-link', A.north, A.eastLink, prov([S_B1]), true, { notes: RED }),
  link('jr-b1f-east-link-to-central', A.eastLink, A.central, prov([S_B1]), true, { notes: RED }),
  link('jr-b1f-north-to-west-link', A.north, A.westLink, prov([S_B1]), true, { notes: RED }),
  link('jr-b1f-west-link-to-central', A.westLink, A.central, prov([S_B1]), true, { notes: RED }),
  link('jr-b1f-central-to-passage-5-6', A.central, A.southPassage, prov([S_B1]), true,
    { notes: `${RED} The red line runs as far as elevator Ⓖ.` }),
  link('jr-b1f-central-to-keio-corridor', A.central, A.keioLink, prov([S_B1, S_KEIO]), false,
    { hasSteps: true, notes: 'Two flights of steps are drawn in this corridor. JR B1F map: "バリアフリー経路を利用して小田急線・京王線へのお乗換えを利用されるお客さまは南口をご利用ください".' }),
  link('jr-west-exit-to-keio-west-gate', A.westUnpaid, A.keioWestUnpaid, prov([S_B1, S_KEIO]), null,
    { inferred: true, common: { stationId: null, asOf: JR_ASOF, geometryConfidence: 'unknown' },
      notes: 'INFERRED from signage text only: JR prints "京王線へ" at the west end of the free passage, Keio prints "JR線・小田急線 東口方面" outside 京王西口. Neither map draws the walkway between them, and the area is under reconstruction.' }),
  link('keio-b2f-head-to-platform-1-2', A.keioHead, A.keioP12, prov([S_KEIO_LAYER], undefined, D2), null, { common: keioCommon }),
  link('keio-b2f-head-to-platform-3', A.keioHead, A.keioP3, prov([S_KEIO_LAYER], undefined, D2), null, { common: keioCommon }),
  link('keio-b1f-west-gate-outside-to-department-store-side', A.keioWestUnpaid, A.keioDeptUnpaid, prov([S_KEIO_LAYER], undefined, D2), null,
    { inferred: true, common: keioCommon,
      notes: 'INFERRED: the unpaid tone of the Keio drawing is continuous along the west side between 京王西口 and 京王百貨店口, but no walkway is labelled there.' }),
  link('keio-b1f-department-store-side-to-keio-mall', A.keioDeptUnpaid, A.keioMall, prov([S_KEIO_LAYER], undefined, D2), true,
    { common: keioCommon, notes: 'On the wheelchair route (green dotted line) of the Keio 階層図.' }),
];

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

export function gate(
  slug: string, levelId: string, n: Names, position: PlanPoint, sides: [GateSide, GateSide], p: Provenance,
  opts: {
    transfer?: boolean; exitOnly?: boolean; hours?: string; stepFree?: StepFree; notes?: string; common?: Common;
    aliases?: { name: string; usedBy: string }[];
  } = {},
): Gate {
  return {
    kind: 'gate',
    ...base(`sk:gate:${slug}`, n, p, opts.common ?? jrCommon, opts.notes),
    levelId,
    gateKind: opts.transfer ? 'transfer' : 'ticket',
    position,
    sides,
    direction: opts.exitOnly ? 'exit-only' : 'both',
    hoursNote: opts.hours ?? null,
    stepFree: opts.stepFree ?? null,
    aliases: opts.aliases ?? [],
  };
}
export const a = (areaId: string): GateSide => ({ areaId });
export const b = (blockId: string): GateSide => ({ blockId });

const G = {
  east: 'sk:gate:jr-east-gate',
  west: 'sk:gate:jr-west-gate',
  chuoEast: 'sk:gate:jr-central-east-gate',
  chuoWest: 'sk:gate:jr-central-west-gate',
  chuoWestKeio: 'sk:gate:jr-central-west-gate-keio-side',
  keioTransfer: 'sk:gate:jr-keio-transfer-gate',
  odakyuB1: 'sk:gate:jr-odakyu-transfer-gate-b1f',
  south: 'sk:gate:jr-south-gate',
  southeast: 'sk:gate:jr-southeast-gate',
  odakyu2F: 'sk:gate:jr-odakyu-transfer-gate-2f',
  newSouth: 'sk:gate:jr-new-south-gate',
  koshu: 'sk:gate:jr-koshu-kaido-gate',
  miraina: 'sk:gate:jr-miraina-tower-gate',
  keioWest: 'sk:gate:keio-west-gate',
  keioDept: 'sk:gate:keio-department-store-gate',
  keioHiroba: 'sk:gate:keio-hiroba-gate',
  keioRinji: 'sk:gate:keio-temporary-gate',
  keioLumine: 'sk:gate:keio-lumine-gate',
};

const gates: Gate[] = [
  gate('jr-east-gate', LV.jrB1, names('東改札', 'East Gate', '东检票口'), pt(-14.75, -10), [a(A.north), a(A.free)],
    prov([S_B1, S_M773, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-west-gate', LV.jrB1, names('西改札', 'West Gate', '西检票口'), pt(-14.75, 9), [a(A.north), a(A.free)],
    prov([S_B1, S_M773, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-central-east-gate', LV.jrB1, names('中央東改札', 'Central East Gate', '中央东检票口'), pt(-0.6, -16.75), [a(A.central), a(A.eastUnpaid)],
    prov([S_B1, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-central-west-gate', LV.jrB1, names('中央西改札', 'Central West Gate', '中央西检票口'), pt(-1.4, 17.25), [a(A.central), a(A.chuoWestUnpaid)],
    prov([S_B1, S_ALL]), { stepFree: true, hours: '6:00〜終電', notes: `${RED} Opening note printed on the map: "(6:00〜終電)".` }),
  gate('jr-central-west-gate-keio-side', LV.jrKeioLink, names('JR中央西改札（京王口）', 'JR Central West Gate (Keio side)', 'JR中央西检票口（京王口）'), pt(4.4, 26.9),
    [a(A.keioLink), a(A.keioDeptUnpaid)], prov([S_B1, S_KEIO, S_KEIO_LAYER], undefined, D2),
    { stepFree: false, notes: 'A second JR gate line at the Keio end of the corridor, printed as "JR中央西改札（京王口）" by JR and "JR中央西改札" by Keio. Reached from the JR side only via the corridor with steps.',
      aliases: [{ name: 'JR中央西改札', usedBy: 'Keio station map' }] }),
  gate('jr-keio-transfer-gate', LV.jrKeioLink, names('京王線連絡口', 'Keio Line transfer gate', '京王线换乘口'), pt(2, 27.5),
    [a(A.keioLink), a(A.keioPaid)], prov([S_B1, S_KEIO, S_KEIO_LAYER], undefined, D2),
    { transfer: true, stepFree: false,
      notes: 'Transfer gate between the JR paid area and the Keio paid area. JR calls it "京王線連絡口", Keio calls it "JR連絡口".',
      aliases: [{ name: 'JR連絡口', usedBy: 'Keio station map' }] }),
  gate('jr-odakyu-transfer-gate-b1f', LV.jrB1, names('小田急線連絡口（中央地下連絡口）', 'Odakyu Line transfer gate (B1F)', '小田急线换乘口（B1F）'), pt(1.6, 17.25),
    [a(A.central), a(X.odakyuB1Concourse)], prov([S_B1, S_ALL, S_ODAKYU], undefined, D2),
    { transfer: true,
      notes: 'One gate line with three names: "小田急線のりば" on the JR B1F map, "小田急線連絡口" on the JR 立体図, "中央地下連絡口" on the Odakyu map. Odakyu notes that from March 2027 (planned) it becomes an IC-card-only gate. Neither operator draws its barrier-free route through it.',
      aliases: [{ name: '中央地下連絡口', usedBy: 'Odakyu station map' }, { name: '小田急線のりば', usedBy: 'JR B1F map' }] }),
  gate('jr-south-gate', LV.jr2, names('南改札', 'South Gate', '南检票口'), pt(19.25, 10), [a(A.south), a(A.southUnpaid)],
    prov([S_2F, S_M773, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-southeast-gate', LV.jr2, names('東南改札', 'Southeast Gate', '东南检票口'), pt(14.5, -16.25), [a(A.south), a(A.southeastUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: true, hours: '7:00〜24:00', notes: `${RED} Opening note printed on the map: "(7:00〜24:00)".` }),
  gate('jr-odakyu-transfer-gate-2f', LV.jr2, names('小田急線のりかえ口（南口JR線連絡口）', 'Odakyu Line transfer gate (2F)', '小田急线换乘口（2F）'), pt(17, 16.3),
    [a(A.south), a(X.odakyu2fConcourse)], prov([S_2F, S_ODAKYU], undefined, D2),
    { transfer: true,
      notes: 'Printed "小田急線のりかえ口" on the JR 2F map and "南口JR線連絡口" on the Odakyu map.',
      aliases: [{ name: '南口JR線連絡口', usedBy: 'Odakyu station map' }] }),
  gate('jr-new-south-gate', LV.jr2, names('新南改札', 'New South Gate', '新南检票口'), pt(31.25, -1), [a(A.newSouth), a(A.newSouthUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-koshu-kaido-gate', LV.jr2, names('甲州街道改札', 'Koshu-kaido Gate', '甲州街道检票口'), pt(26.75, -1), [a(A.newSouth), a(A.koshuUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-miraina-tower-gate', LV.jr2, names('ミライナタワー改札', 'Miraina Tower Gate', 'Miraina Tower 检票口'), pt(29, -16.25), [a(A.newSouth), a(A.mirainaUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: null, notes: 'The red barrier-free line on the 2F map stops at elevator Ⓑ beside this gate; whether the gate line itself is on it could not be read with confidence.' }),
  // Keio
  gate('keio-west-gate', LV.keioB1, names('京王西口', 'Keio West Gate', '京王西口'), pt(-0.5, 31), [a(A.keioPaid), a(A.keioWestUnpaid)],
    keioProv, { common: keioCommon, stepFree: true, notes: 'On the wheelchair route of the Keio drawings.' }),
  gate('keio-department-store-gate', LV.keioB1, names('京王百貨店口', 'Keio Department Store Gate', '京王百货店口'), pt(5, 34.5), [a(A.keioPaid), a(A.keioDeptUnpaid)],
    keioProv, { common: keioCommon, stepFree: true, notes: 'On the wheelchair route of the Keio drawings.' }),
  gate('keio-hiroba-gate', LV.keioB1, names('広場口', 'Hiroba Gate', '广场口'), pt(-2.5, 27.25), [a(A.keioHirobaPaid), a(A.keioWestUnpaid)],
    keioProv, { common: keioCommon, exitOnly: true, hours: '出場専用（初電〜22:00）',
      notes: 'Exit only. Reached by stairs Ⓔ from the platform level.' }),
  gate('keio-temporary-gate', LV.keioB1, names('臨時口', 'Temporary Gate', '临时口'), pt(7.8, 26.2), [a(A.keioRinjiPaid), a(A.keioDeptUnpaid)],
    keioProv, { common: keioCommon, exitOnly: true, hours: '出場専用（平日 7:10〜9:00 のみ）',
      notes: 'Exit only, weekday mornings only. Reached by stairs Ⓓ from the platform level; it opens onto the 京王のれん街 side.' }),
  gate('keio-lumine-gate', LV.keioB1, names('ルミネ口', 'Lumine Gate', 'Lumine口'), pt(26.5, 31), [a(A.keioLuminePaid), a(A.keioLumineUnpaid)],
    keioProv, { common: keioCommon, hours: '6:30〜22:00', notes: 'Staffed by intercom according to the Keio map.' }),
];

// ---------------------------------------------------------------------------
// entrances (where the verified model ends)
// ---------------------------------------------------------------------------

export function entrance(
  slug: string, levelId: string, areaId: string, n: Names, position: PlanPoint, leadsToJa: string | null,
  leadsToEn: string | null, p: Provenance, opts: { stepFree?: StepFree; notes?: string; common?: Common } = {},
): Entrance {
  return {
    kind: 'entrance',
    ...base(`sk:entrance:${slug}`, n, p, opts.common ?? jrCommon, opts.notes),
    levelId, areaId, position, leadsToJa, leadsToEn, stepFree: opts.stepFree ?? null,
  };
}

const E = {
  east: 'sk:entrance:jr-east-exit',
  eastPromenade: 'sk:entrance:jr-east-basement-passage',
  west: 'sk:entrance:jr-west-exit-basement',
  chuoWest: 'sk:entrance:jr-central-west-outside',
  south: 'sk:entrance:jr-south-exit',
  southeast: 'sk:entrance:jr-southeast-street',
  koshu: 'sk:entrance:jr-koshu-kaido-outside',
  newSouth: 'sk:entrance:jr-new-south-outside',
  miraina: 'sk:entrance:jr-miraina-tower-outside',
  keioDept: 'sk:entrance:keio-department-store-side',
  keioWest: 'sk:entrance:keio-west-side',
  keioLumine: 'sk:entrance:keio-lumine-side',
};

const entrances: Entrance[] = [
  entrance('jr-east-exit', LV.jr1, A.eastGround, names('東口', 'East Exit', '东口'), pt(-16, -23),
    'アルタ・歌舞伎町方面（地上）', 'street level, towards Alta / Kabukicho', prov([S_1F, S_B1, S_M773])),
  entrance('jr-east-basement-passage', LV.jrB1, A.eastUnpaid, names(null, 'Basement passage (east)', '东侧地下通道'), pt(-18.5, -21),
    'アルタ・歌舞伎町方面へ／東京メトロ丸ノ内線へ', 'towards Alta / Kabukicho; to the Tokyo Metro Marunouchi Line', prov([S_B1]),
    { notes: 'Unnamed on the map; only the two direction labels are printed.' }),
  entrance('jr-west-exit-basement', LV.jrB1, A.westUnpaid, names('西口', 'West Exit (basement)', '西口（地下）'), pt(-16.75, 22),
    '京王線へ／西口バスのりば／丸ノ内線', 'to the Keio Line; West Exit bus stops; Marunouchi Line', prov([S_B1, S_M773]),
    { notes: 'JR prints "西口バスのりば（地上行きエレベーターあり）" and "丸ノ内線(B2)行きエレベーターあり" here. Those lifts are outside the modelled area.' }),
  entrance('jr-central-west-outside', LV.jrB1, A.chuoWestUnpaid, names(null, 'Outside Central West Gate', '中央西检票口外'), pt(-9, 17.85),
    null, null, prov([S_B1]),
    { notes: 'The JR B1F map does not draw what lies beyond the ticket office here. Destination unknown.' }),
  entrance('jr-south-exit', LV.jr2, A.southUnpaid, names('南口', 'South Exit', '南口'), pt(22, 10),
    '甲州街道／小田急線へ／ルミネ2', 'Koshu-kaido; to the Odakyu Line; Lumine 2', prov([S_2F, S_M773, S_ALL])),
  entrance('jr-southeast-street', LV.jr1, A.southeastGround, names(null, 'Street level (Southeast Gate side)', '地面出入口（东南检票口侧）'), pt(15, -23),
    '地上へ', 'to street level', prov([S_2F, S_1F]),
    { stepFree: true, notes: 'The map prints only "地上へ". An elevator is drawn between 2F and street level.' }),
  entrance('jr-koshu-kaido-outside', LV.jr2, A.koshuUnpaid, names(null, 'Outside Koshu-kaido Gate', '甲州街道检票口外'), pt(24, -1),
    '甲州街道', 'Koshu-kaido', prov([S_2F, S_ALL])),
  entrance('jr-new-south-outside', LV.jr2, A.newSouthUnpaid, names(null, 'Outside New South Gate', '新南检票口外'), pt(35.5, 0),
    'Suicaのペンギン広場／バスタ新宿へ', 'Suica Penguin Square; to Busta Shinjuku', prov([S_2F, S_ALL])),
  entrance('jr-miraina-tower-outside', LV.jr2, A.mirainaUnpaid, names(null, 'Outside Miraina Tower Gate', 'Miraina Tower 检票口外'), pt(29, -19.5),
    'JR新宿ミライナタワー／NEWoMan', 'JR Shinjuku Miraina Tower; NEWoMan', prov([S_2F, S_ALL])),
  entrance('keio-department-store-side', LV.keioB1, A.keioDeptUnpaid, names(null, 'Keio Department Store side', '京王百货店侧'), pt(5, 38),
    '京王百貨店', 'Keio Department Store', keioProv, { common: keioCommon }),
  entrance('keio-west-side', LV.keioB1, A.keioWestUnpaid, names(null, 'Keio West Gate side', '京王西口侧'), pt(-4, 31),
    '都庁方面／丸ノ内線 西口方面／JR線・小田急線 東口方面', 'towards the Metropolitan Government Building; Marunouchi Line, West Exit; JR and Odakyu lines, East Exit', keioProv, { common: keioCommon }),
  entrance('keio-lumine-side', LV.keioB1, A.keioLumineUnpaid, names(null, 'Lumine Gate side', 'Lumine口侧'), pt(29, 29),
    'ルミネ方面／南口方面', 'towards Lumine; towards the South Exit', keioProv, { common: keioCommon }),
];

// ---------------------------------------------------------------------------
// vertical facilities
// ---------------------------------------------------------------------------

export function vertical(
  slug: string, kind: VerticalKind, n: Names,
  stops: { levelId: string; areaId: string; at: PlanPoint }[], p: Provenance,
  opts: { label?: string; aggregated?: boolean; hours?: string; notes?: string; direction?: string; common?: Common; nonAdjacent?: boolean } = {},
): VerticalFacility {
  return {
    kind: 'vertical',
    ...base(`sk:vertical:${slug}`, n, p, opts.common ?? jrCommon, opts.notes),
    verticalKind: kind,
    operatorLabel: opts.label ?? null,
    stops: stops.map((s) => ({ levelId: s.levelId, areaId: s.areaId, position: s.at })),
    directionNote: opts.direction ?? (kind === 'escalator' ? 'Running direction is not recorded on the floor map.' : null),
    hoursNote: opts.hours ?? null,
    aggregated: opts.aggregated ?? kind !== 'elevator',
    ...(opts.nonAdjacent
      ? { declaredNonAdjacent: { reason: 'Drawn by the operator as one run between these floors, with no stop on the floors in between.' } }
      : {}),
  };
}

export const unnamed = names(null, null);
export const AGG = 'Stands for every staircase of this pair drawn on the floor map; how many there are was not counted.';
export const AGG_ESC = 'Stands for every escalator of this pair drawn on the floor map; count and running direction were not recorded.';

type Zone = 'north' | 'central' | 'south' | 'newSouth';
const ZONE_AREA: Record<Zone, { areaId: string; levelId: string; slug: string }> = {
  north: { areaId: A.north, levelId: LV.jrB1, slug: 'b1f-north' },
  central: { areaId: A.central, levelId: LV.jrB1, slug: 'b1f-central' },
  south: { areaId: A.south, levelId: LV.jr2, slug: '2f-south' },
  newSouth: { areaId: A.newSouth, levelId: LV.jr2, slug: '2f-new-south' },
};

/**
 * Which kinds of stairs / escalators each (island, concourse) pair has,
 * read symbol by symbol from the JR 1F map and cross-checked on B1F / 2F.
 * 's' = stairs symbol seen, 'e' = escalator symbol seen.
 */
const PAIRS: Record<Zone, Partial<Record<Island, string>>> = {
  north: { '7-8': 'se', '9-10': 'se', '11-12': 's', '13-14': 'se', '15-16': 'se' },
  central: { '1-2': 's', '3-4': 's', '7-8': 'se', '9-10': 'se', '11-12': 'se', '13-14': 'se', '15-16': 'se' },
  south: { '1-2': 'se', '3-4': 'se', '7-8': 'se', '9-10': 'se', '11-12': 'se', '13-14': 'se', '15-16': 'se' },
  newSouth: { '1-2': 'se', '3-4': 'se', '5-6': 'se', '7-8': 'e', '9-10': 'e', '11-12': 'e', '13-14': 'e', '15-16': 'e' },
};

/** Schematic plan position of the concourse end and the platform end of a stair pair. */
function stairEnds(zone: Zone, island: Island, dz: number): [PlanPoint, PlanPoint] {
  const z = ISLAND_Z[island] + dz;
  switch (zone) {
    case 'north':
      return [pt(-11.2, z), pt(-8.6, z)];
    case 'central':
      return island === '1-2' ? [pt(4, z), pt(8.5, z)] : island === '3-4' ? [pt(5, z), pt(8.5, z)] : [pt(1.4, z), pt(4, z)];
    case 'south':
      return island === '1-2' || island === '3-4' ? [pt(13.4, z), pt(10.6, z)] : [pt(15.2, z), pt(10.6, z)];
    case 'newSouth':
      return island === '1-2' || island === '3-4' || island === '5-6' ? [pt(30, z), pt(33.5, z)] : [pt(27.6, z), pt(25, z)];
  }
}

const stairPairs: VerticalFacility[] = [];
for (const zone of Object.keys(PAIRS) as Zone[]) {
  const z = ZONE_AREA[zone];
  const srcs = zone === 'north' || zone === 'central' ? [S_1F, S_B1] : [S_1F, S_2F];
  for (const island of Object.keys(PAIRS[zone]) as Island[]) {
    const kinds = PAIRS[zone][island] ?? '';
    for (const k of kinds) {
      const kind: VerticalKind = k === 's' ? 'stairs' : 'escalator';
      const [concEnd, pfEnd] = stairEnds(zone, island, kind === 'stairs' ? -0.65 : 0.65);
      stairPairs.push(
        vertical(`jr-${kind}-${z.slug}-to-platform-${island}`, kind, unnamed,
          [
            { levelId: z.levelId, areaId: z.areaId, at: concEnd },
            { levelId: LV.jr1, areaId: PF(island), at: pfEnd },
          ],
          prov(srcs), { notes: kind === 'stairs' ? AGG : AGG_ESC }),
      );
    }
  }
}

/** JR elevators with the letter printed beside them on the floor maps. */
function jrLift(letter: string, stops: { levelId: string; areaId: string }[], at: PlanPoint, srcs: string[], notes?: string): VerticalFacility {
  return vertical(`jr-elevator-${letter.toLowerCase()}`, 'elevator',
    names(`エレベーター ${letter}`, `Elevator ${letter}`, `电梯 ${letter}`),
    stops.map((s) => ({ ...s, at })), prov(srcs), { label: letter, notes });
}
const onPf = (island: Island) => ({ levelId: LV.jr1, areaId: PF(island) });
const onNorth = { levelId: LV.jrB1, areaId: A.north };
const onSouth = { levelId: LV.jr2, areaId: A.south };
const onNewSouth = { levelId: LV.jr2, areaId: A.newSouth };

const jrLifts: VerticalFacility[] = [
  jrLift('A', [onPf('1-2'), onSouth], pt(14.5, -14), [S_1F, S_2F]),
  jrLift('B', [onPf('1-2'), onNewSouth], pt(28.5, -14), [S_1F, S_2F]),
  jrLift('C', [onPf('3-4'), onSouth], pt(14.5, -10), [S_1F, S_2F]),
  jrLift('D', [onPf('3-4'), onNewSouth], pt(28.5, -10), [S_1F, S_2F]),
  jrLift('E', [onPf('5-6'), onNewSouth], pt(28.5, -6), [S_1F, S_2F]),
  jrLift('F', [{ levelId: LV.jrB1, areaId: A.central }, onPf('7-8')], pt(-1.2, -1.4), [S_1F, S_B1]),
  jrLift('G', [{ levelId: LV.jrB1, areaId: A.southPassage }, onPf('7-8'), onSouth], pt(13, -3), [S_1F, S_B1, S_2F],
    'The only JR elevator drawn on all three floors. JR B1F map: "2F南口コンコースへはⒼエレベーターをご利用ください" and "1〜6番線をご利用のお客さまはⒼエレベーターで2Fを経由してください".'),
  jrLift('H', [onNorth, onPf('9-10')], pt(-13, 2), [S_1F, S_B1]),
  jrLift('I', [onPf('9-10'), onSouth], pt(13, 2), [S_1F, S_2F]),
  jrLift('J', [onNorth, onPf('11-12')], pt(-13, 6), [S_1F, S_B1]),
  jrLift('K', [onPf('11-12'), onSouth], pt(13, 6), [S_1F, S_2F]),
  jrLift('L', [onNorth, onPf('13-14')], pt(-13, 10), [S_1F, S_B1]),
  jrLift('M', [onPf('13-14'), onSouth], pt(13, 10), [S_1F, S_2F]),
  jrLift('N', [onNorth, onPf('15-16')], pt(-13, 14), [S_1F, S_B1]),
  jrLift('O', [onPf('15-16'), onSouth], pt(13, 14), [S_1F, S_2F]),
];

const otherVerticals: VerticalFacility[] = [
  vertical('jr-escalator-b1f-passage-to-platform-5-6', 'escalator', unnamed,
    [
      { levelId: LV.jrB1, areaId: A.southPassage, at: pt(22, -5) },
      { levelId: LV.jr1, areaId: PF('5-6'), at: pt(24.5, -5.4) },
    ],
    prov([S_B1, S_1F]),
    { notes: 'Labelled "5, 6番線へ" on the B1F map with an escalator symbol only; no staircase symbol was seen there.' }),
  // East Exit: basement ↔ street
  vertical('jr-stairs-east-exit', 'stairs', unnamed,
    [
      { levelId: LV.jrB1, areaId: A.eastUnpaid, at: pt(-13, -20) },
      { levelId: LV.jr1, areaId: A.eastGround, at: pt(-15.5, -20) },
    ],
    prov([S_B1, S_1F]), { notes: `Labelled "出口へ" on the B1F map. ${AGG}` }),
  vertical('jr-elevator-east-exit', 'elevator', names('エレベーター（東口 1F ⇔ 改札階 B1F）', 'Elevator (East Exit 1F ⇔ gate floor B1F)', '电梯（东口 1F ⇔ 检票层 B1F）'),
    [
      { levelId: LV.jrB1, areaId: A.eastUnpaid, at: pt(-12, -21.5) },
      { levelId: LV.jr1, areaId: A.eastGround, at: pt(-12, -21.5) },
    ],
    prov([S_B1, S_1F]),
    { hours: '4:00〜25:30', notes: 'Printed on the B1F map: "アルタ・歌舞伎町方面(1F)⇔改札階(B1F) ※4:00〜25:30 ※丸ノ内線行きエレベーターは地上にあり". It carries no letter.' }),
  // Southeast Gate: 2F ↔ street
  vertical('jr-stairs-southeast', 'stairs', unnamed,
    [
      { levelId: LV.jr2, areaId: A.southeastUnpaid, at: pt(13.6, -19) },
      { levelId: LV.jr1, areaId: A.southeastGround, at: pt(13.6, -21.5) },
    ],
    prov([S_2F, S_1F]), { notes: `Labelled "地上へ". ${AGG}` }),
  vertical('jr-escalator-southeast', 'escalator', unnamed,
    [
      { levelId: LV.jr2, areaId: A.southeastUnpaid, at: pt(14.6, -19) },
      { levelId: LV.jr1, areaId: A.southeastGround, at: pt(14.6, -21.5) },
    ],
    prov([S_2F, S_1F]), { notes: `Labelled "地上へ". ${AGG_ESC}` }),
  vertical('jr-elevator-southeast', 'elevator', names('エレベーター（東南改札外 2F ⇔ 地上）', 'Elevator (outside Southeast Gate 2F ⇔ street)', '电梯（东南检票口外 2F ⇔ 地面）'),
    [
      { levelId: LV.jr2, areaId: A.southeastUnpaid, at: pt(16, -19) },
      { levelId: LV.jr1, areaId: A.southeastGround, at: pt(16, -19) },
    ],
    prov([S_2F, S_1F]), { notes: 'Drawn between the two staircases labelled "地上へ". It carries no letter.' }),
  // Keio: concourse ↔ the two boarding platforms
  ...(['1-2', '3'] as const).flatMap((pf): VerticalFacility[] => {
    const areaId = pf === '3' ? A.keioP3 : A.keioP12;
    const z = pf === '3' ? 33.3 : 29.4;
    return [
      vertical(`keio-stairs-concourse-to-platform-${pf}`, 'stairs', unnamed,
        [{ levelId: LV.keioB1, areaId: A.keioPaid, at: pt(6, z) }, { levelId: LV.keioB2, areaId, at: pt(8.5, z) }],
        keioProv, { common: keioCommon, notes: AGG }),
      vertical(`keio-escalator-concourse-to-platform-${pf}`, 'escalator', unnamed,
        [{ levelId: LV.keioB1, areaId: A.keioPaid, at: pt(6, z + 0.6) }, { levelId: LV.keioB2, areaId, at: pt(8.5, z + 0.6) }],
        keioProv, { common: keioCommon, notes: AGG_ESC,
          direction: 'The Keio map prints time-dependent directions for some escalators (e.g. "平日10:00まで昇り／10:00から降り"). Not modelled.' }),
      vertical(`keio-elevator-concourse-to-platform-${pf}`, 'elevator',
        names('エレベーター（改札内 B1F ⇔ ホーム B2F）', 'Elevator (concourse B1F ⇔ platform B2F)', '电梯（站厅 B1F ⇔ 站台 B2F）'),
        [{ levelId: LV.keioB1, areaId: A.keioPaid, at: pt(3.2, z + 0.3) }, { levelId: LV.keioB2, areaId, at: pt(3.2, z + 0.3) }],
        prov([S_KEIO_LAYER, S_KEIO_PAGE], undefined, D2),
        { common: keioCommon, notes: 'The Keio 階層図 draws a lift marked "改札口(B1F)へ" at the north end of each boarding platform.' }),
      vertical(`keio-stairs-lumine-landing-to-platform-${pf}`, 'stairs', unnamed,
        [{ levelId: LV.keioB1, areaId: A.keioLuminePaid, at: pt(23, z + 0.1) }, { levelId: LV.keioB2, areaId, at: pt(20.5, z + 0.1) }],
        keioProv, { common: keioCommon, notes: AGG }),
      vertical(`keio-escalator-lumine-landing-to-platform-${pf}`, 'escalator', unnamed,
        [{ levelId: LV.keioB1, areaId: A.keioLuminePaid, at: pt(23, z + 0.9) }, { levelId: LV.keioB2, areaId, at: pt(20.5, z + 0.9) }],
        keioProv, { common: keioCommon, notes: AGG_ESC, direction: 'Keio map: "※17:00まで昇り 17:00から降り". Not modelled.' }),
    ];
  }),
  vertical('keio-stairs-temporary-gate-landing-to-platform-1-2', 'stairs', unnamed,
    [{ levelId: LV.keioB1, areaId: A.keioRinjiPaid, at: pt(7.8, 25.6) }, { levelId: LV.keioB2, areaId: A.keioP12, at: pt(7.8, 29.3) }],
    prov([S_KEIO_LAYER], undefined, D2), { common: keioCommon, notes: 'Marked Ⓓ "臨時口へ" on the platform level.' }),
  vertical('keio-stairs-hiroba-gate-landing-to-platform-head', 'stairs', unnamed,
    [{ levelId: LV.keioB1, areaId: A.keioHirobaPaid, at: pt(-2.5, 26.3) }, { levelId: LV.keioB2, areaId: A.keioHead, at: pt(0.6, 29.5) }],
    prov([S_KEIO_LAYER], undefined, D2), { common: keioCommon, notes: 'Marked Ⓔ "広場口へ" on the platform level.' }),
  vertical('keio-stairs-platform-3-to-new-line', 'stairs', unnamed,
    [{ levelId: LV.keioB2, areaId: A.keioP3, at: pt(29.5, 33.8) }, { levelId: 'sk:level:keio-new-line-shinjuku-b1f', areaId: X.newLinePaidEast, at: pt(35.3, 33.8) }],
    prov([S_KEIO_LAYER, S_KEIO, 'src:keio-new-line-layer-map'], undefined, D2),
    { common: keioCommon, notes: 'Keio: "③ホーム京王八王子寄りの階段を昇ると京王新線・都営新宿線④⑤ホームにつながります"; the new-line drawing marks the upper end "京王線③ホームへ". Inside the Keio paid area, no gate.' }),
];

const verticals: VerticalFacility[] = [...stairPairs, ...jrLifts, ...otherVerticals];

// ---------------------------------------------------------------------------
// unverified blocks — drawn as abstract boxes, never routable
// ---------------------------------------------------------------------------

export function block(id: string, operatorId: string | null, n: Names, box: PlanRect, elevation: number, height: number, notes: string): UnverifiedBlock {
  return {
    kind: 'unverified-block',
    id,
    externalIds: {},
    names: n,
    provenance: synthetic,
    validFrom: null,
    validTo: null,
    stationId: null,
    existence: 'unverified',
    geometryConfidence: 'unknown',
    asOf: null,
    notes,
    operatorId,
    box,
    elevation,
    height,
  };
}

// ---------------------------------------------------------------------------
// connections that sources hint at but that are NOT in the model
// ---------------------------------------------------------------------------

const unconfirmedConnections: StationModel['unconfirmedConnections'] = [
  { id: 'uc-2f-south-to-new-south-street', description: '南口 (outside 南改札) ⇄ 甲州街道改札 across 甲州街道 at street level.',
    reason: 'A public road crossing, not drawn as a walkway on the JR 2F map. The two JR 2F paid areas are joined in this model only through the platforms.' },
  { id: 'uc-southeast-to-south', description: '東南改札外 ⇄ 南口 (outside 南改札) on 2F.',
    reason: 'Separated by ルミネ2 on the JR 2F map; no direct unpaid walkway was read.' },
  { id: 'uc-platform-13-16-south-zone', description: 'A zone at the south end of platforms 13–16 that the JR 1F map tints differently and labels "B1F 中央東改札・中央西改札", and "小田急線連絡口" drawn near platforms 14 / 16 on the 立体図.',
    reason: 'Could not be read with confidence; not modelled.' },
  { id: 'uc-jr-keio-corridor-height', description: 'Height relations between JR B1F, the JR–Keio corridor, Odakyu B1F and Keio B1F.',
    reason: 'The corridor has steps and has to cross the Odakyu concourse, but no source gives the heights or says which passes over which. The corridor is drawn lower so the two do not collide.' },
  { id: 'uc-keio-alighting-platform', description: '京王線 降車専用ホーム (between tracks 2 and 3) and its stairs to the concourse.',
    reason: 'Alighting only; left out. Its stairs carry time-dependent directions on the Keio drawing.' },
  { id: 'uc-odakyu-platform-1', description: 'Odakyu ground-level platform 1 and anything east of track 2.',
    reason: 'The Odakyu map of 2026.7.25 shows platforms 2–6 on 1F and 7–10 on B1F only; the station is being rebuilt.' },
  { id: 'uc-oedo-gate-b', description: 'What lies inside 大江戸線改札B on the B1F new-line concourse.',
    reason: 'Keio prints the gate; the way from it down to the Oedo Line could not be followed on the Toei 立体図 at the size it is published.' },
  { id: 'uc-oedo-track-sides', description: 'Which edge of the Oedo Line platform tracks 6 and 7 run along.',
    reason: 'The Toei 立体図 labels the two directions at the platform ends only. No tracks are drawn beside that platform.' },
  { id: 'uc-metro-temporary-lift', description: 'The lift marked （仮設） near exit A12 of the Marunouchi Line station, and the lifts from its B1F concourse to street level.',
    reason: 'Whether the temporary lift lands inside or outside the gates was not legible; street-level lifts are outside the modelled area.' },
  { id: 'uc-metro-oedo-nishiguchi', description: 'The west end of the Marunouchi Line concourse ⇄ 都営大江戸線 新宿西口駅.',
    reason: 'A different station; drawn on the Tokyo Metro 立体図 but explicitly excluded from this model.' },
  { id: 'uc-busta-ground', description: 'バスタ新宿 3F / 4F ⇄ サザンテラス, タカシマヤ タイムズスクエア, and the street.',
    reason: 'Only the lifts and escalators that the Busta 2F drawing ties to the outside of the JR gates are modelled.' },
];

// ---------------------------------------------------------------------------

/** JR East and the Keio Line. The other operators are added in extensions.ts and joined in index.ts. */
export const baseModel = {
  operators,
  railLines,
  complex,
  stations,
  levels,
  areas,
  passages,
  gates,
  entrances,
  verticals,
  unconfirmedConnections,
};

/** Stable ids that the UI and tests refer to by name. */
export const IDS = { A, G, E, LV, PF, L } as const;
