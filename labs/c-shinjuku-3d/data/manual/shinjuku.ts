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

const JR = 'sk:operator:jr-east';
const KEIO = 'sk:operator:keio';
const ST_JR = 'sk:station:jr-east-shinjuku';
const ST_KEIO = 'sk:station:keio-shinjuku';
const PAID_JR: FareZone = 'paid:jr-east';
const PAID_KEIO: FareZone = 'paid:keio';

const S_SCHEMATIC = 'src:senkiro-lab-schematic';
const S_PAGE = 'src:jreast-estation-866';
const S_B1 = 'src:jreast-floormap-b1f';
const S_1F = 'src:jreast-floormap-1f';
const S_2F = 'src:jreast-floormap-2f';
const S_ALL = 'src:jreast-floormap-all';
const S_M773 = 'src:jre-media-773';
const S_M6147 = 'src:jre-media-6147';
const S_KEIO = 'src:keio-station-map';
const S_KEIO_PAGE = 'src:keio-shinjuku-page';

const JR_ASOF = '2026-08';
const KEIO_ASOF = '2025-03';

function names(ja: string | null, en: string | null, zh: string | null = null): Names {
  // ja_kana is null everywhere: readings were not checked against a source.
  return { ja, ja_kana: null, en, zh };
}

function prov(sourceIds: string[], note?: string): Provenance {
  return { sourceIds, dataNature: 'manual-verified', lastVerifiedAt: RETRIEVED_AT, ...(note ? { note } : {}) };
}

const synthetic: Provenance = {
  sourceIds: [S_SCHEMATIC],
  dataNature: 'synthetic',
  lastVerifiedAt: RETRIEVED_AT,
  note: 'Placeholder. Not verified against any operator source.',
};

function rect(x0: number, x1: number, z0: number, z1: number): PlanRect {
  return { x0, x1, z0, z1 };
}
function pt(x: number, z: number): PlanPoint {
  return { x, z };
}

interface Common {
  stationId: string | null;
  asOf: string | null;
  geometryConfidence: GeometryConfidence;
}
const jrCommon: Common = { stationId: ST_JR, asOf: JR_ASOF, geometryConfidence: 'schematic' };
/** Keio positions are placeholders: the relative layout was not transcribed. */
const keioCommon: Common = { stationId: ST_KEIO, asOf: KEIO_ASOF, geometryConfidence: 'unknown' };

const base = (id: string, n: Names, p: Provenance, c: Common, notes?: string) => ({
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

const entity = (id: string, n: Names, p: Provenance) => ({
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
  // Referenced only by unverified blocks.
  { kind: 'operator', ...entity('sk:operator:odakyu', names('小田急電鉄', 'Odakyu Electric Railway', '小田急电铁'), prov([S_B1], 'Name as printed on the JR B1F map ("小田急線のりば").')) },
  { kind: 'operator', ...entity('sk:operator:tokyo-metro', names('東京メトロ', 'Tokyo Metro', '东京地铁'), prov([S_B1], 'Name as printed on the JR B1F map ("東京メトロ丸ノ内線へ").')) },
  { kind: 'operator', ...entity('sk:operator:toei', names('東京都交通局（都営地下鉄）', 'Toei Subway', '都营地铁'), prov([S_B1], 'Name as printed on the JR B1F map ("都営新宿線・大江戸線へ").')) },
];

const COLOR_NOTE =
  'Approximation of the colour bar printed beside this line in the legend of the operator floor map. Not an official colour value.';

function line(slug: string, operatorId: string, n: Names, color: string, p: Provenance, note = COLOR_NOTE): RailLine {
  return {
    kind: 'rail-line',
    ...entity(`sk:line:${slug}`, n, p),
    operatorId,
    displayColor: color,
    displayColorNote: note,
    stationNumberPrefix: null,
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
const SERVICE_NOTE =
  'Printed in the platform legend as a train service rather than a line; shown in neutral grey. In the shared contract this would be a ServicePattern, not a RailLine.';

const railLines: RailLine[] = [
  line('jr-east-saikyo', JR, names('埼京線', 'Saikyo Line', '埼京线'), '#1f9d8b', legendProv),
  line('jr-east-shonan-shinjuku', JR, names('湘南新宿ライン', 'Shonan-Shinjuku Line', '湘南新宿线'), '#d6453d', legendProv),
  line('jr-east-narita-express', JR, names('成田エクスプレス', "Narita Express", '成田特快'), '#7d8590', legendProv, SERVICE_NOTE),
  line('jr-east-tobu-through-limited-express', JR, names('東武線直通（特急）', 'Tobu Line through limited express', '东武线直通特急'), '#7d8590', legendProv, SERVICE_NOTE),
  line('jr-east-chuo-rapid', JR, names('中央線（快速）', 'Chuo Line (Rapid)', '中央线（快速）'), '#e8651a', legendProv),
  line('jr-east-chuo-limited-express', JR, names('中央本線（特急）', 'Chuo Main Line (Limited Express)', '中央本线（特急）'), '#2f6fbd', legendProv),
  line('jr-east-chuo-sobu-local', JR, names('中央・総武線（各駅停車）', 'Chuo-Sobu Line (Local)', '中央·总武线（各站停车）'), '#d9b400', legendProv),
  line('jr-east-yamanote', JR, names('山手線', 'Yamanote Line', '山手线'), '#7fb62e', legendProv),
  line('keio-keio', KEIO, names('京王線', 'Keio Line', '京王线'), '#c2327d', prov([S_KEIO_PAGE]),
    'Chosen by this prototype for contrast. Not taken from a Keio source and not an official colour value.'),
];

const complex: StationComplex = {
  kind: 'station-complex',
  ...entity('sk:complex:shinjuku', names('新宿駅', 'Shinjuku Station', '新宿站'), prov([S_PAGE, S_KEIO_PAGE])),
  stationIds: [ST_JR, ST_KEIO],
  explicitlyExcluded: [
    { name: '西武新宿駅 (Seibu-Shinjuku)', reason: 'A different station of a different operator. Not part of this model and not drawn.' },
    { name: '新宿三丁目駅 (Shinjuku-sanchome)', reason: 'A different station. Not part of this model and not drawn.' },
    { name: '新宿西口駅 (Shinjuku-nishiguchi, Toei Oedo Line)', reason: 'A different station; it appears on the JR 立体図 only as a neighbouring label.' },
    { name: '京王新線新宿駅 (Keio New Line Shinjuku)', reason: 'Keio lists it separately from 京王線新宿駅, with its own floor map. Drawn only inside an "unverified" block.' },
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

const LV = {
  jrB1: 'sk:level:jr-east-shinjuku-b1f',
  jr1: 'sk:level:jr-east-shinjuku-1f',
  jr2: 'sk:level:jr-east-shinjuku-2f',
  keioB1: 'sk:level:keio-shinjuku-b1f',
  keioB2: 'sk:level:keio-shinjuku-b2f',
};

const ELEV_NOTE = 'Schematic. Floor heights were not measured; only the vertical order is taken from the sources.';

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
    ...base(LV.keioB1, names('B1F（京王）', 'B1F (Keio)', 'B1F（京王）'), prov([S_KEIO, S_B1]), keioCommon,
      'Keio numbers its own floors. Whether Keio "B1F" and JR "B1F" share a floor height is NOT established: the JR B1F map draws two flights of steps in the corridor leading to 京王線連絡口. Both are given ordinal −1; the small drawn offset is a reminder, not a measurement.'),
    operatorId: KEIO, label: 'B1F', ordinal: -1, elevation: -4.7,
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

const A = {
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
  keioPlatform: 'sk:area:keio-b2f-platforms-1-3',
};

function concourse(
  id: string, levelId: string, fareZone: FareZone, n: Names, footprint: PlanRect[], anchor: PlanPoint,
  p: Provenance, c: Common = jrCommon, notes?: string,
): Concourse {
  return { kind: 'concourse', ...base(id, n, p, c, notes), levelId, fareZone, footprint, anchor };
}
function passageArea(
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

const svc = (railLineId: string, towardsJa: string, towardsEn: string) => ({ railLineId, towardsJa, towardsEn });

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
    tracks: TRACKS[island],
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
    [rect(-6, -0.8, 17.5, 20.5)], pt(-3.4, 19), prov([S_B1]), jrCommon,
    'Only the ticket office next to the gate is drawn on the JR B1F map.'),
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
  passageArea(A.keioLink, LV.jrB1, PAID_JR, names('京王線連絡通路（JR改札内）', 'Corridor to the Keio Line (inside JR gates)', '通往京王线的通道（JR付费区）'),
    [rect(-0.4, 1, 17, 23)], pt(0.3, 21.5), prov([S_B1, S_KEIO]), jrCommon,
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

const keioAreas: Area[] = [
  concourse(A.keioPaid, LV.keioB1, PAID_KEIO, names('京王線 改札内コンコース（B1F）', 'Keio Line concourse (inside gates, B1F)', '京王线站厅（付费区，B1F）'),
    [rect(0, 10, 24, 30)], pt(5, 27), prov([S_KEIO]), keioCommon),
  concourse(A.keioDeptUnpaid, LV.keioB1, 'unpaid', names('京王百貨店口前（改札外）', 'Outside Keio Department Store Gate', '京王百货店口外'),
    [rect(-8, -1.2, 21.5, 30)], pt(-4.6, 26), prov([S_KEIO, S_B1]), keioCommon,
    'JR and Keio maps agree on this side: JR prints "京王線のりば" and "都営新宿線・大江戸線へ" outside JR中央西改札（京王口）; Keio prints "京王新線・都営新宿線・大江戸線" along the same corridor.'),
  concourse(A.keioWestUnpaid, LV.keioB1, 'unpaid', names('京王西口前（改札外）', 'Outside Keio West Gate', '京王西口外'),
    [rect(0, 10, 31, 34)], pt(5, 32.5), prov([S_KEIO]), keioCommon,
    'Keio prints "JR線・小田急線 東口方面", "丸ノ内線 西口方面" and "都庁方面" on this side.'),
  concourse(A.keioLuminePaid, LV.keioB1, PAID_KEIO, names('ルミネ口 改札内（B1F）', 'Lumine Gate landing (inside gates, B1F)', 'Lumine口内侧（B1F）'),
    [rect(20, 24, 25, 29)], pt(22, 27), prov([S_KEIO]), keioCommon,
    'A separate B1F landing at the other end of the platforms; reached from the main concourse only by going down to the platforms.'),
  concourse(A.keioLumineUnpaid, LV.keioB1, 'unpaid', names('ルミネ口前（改札外）', 'Outside Lumine Gate', 'Lumine口外'),
    [rect(25, 28, 25, 29)], pt(26.5, 27), prov([S_KEIO]), keioCommon),
  {
    kind: 'platform',
    ...base(A.keioPlatform, names('京王線 1〜3番線ホーム（B2F）', 'Keio Line Platforms 1–3 (B2F)', '京王线1～3号站台（B2F）'), prov([S_KEIO, S_KEIO_PAGE]), keioCommon,
      'Deliberately coarse: the Keio map shows several platform slabs (one labelled 降車専用ホーム) around tracks 1–3. They are merged into one node here; which slab serves which track was not transcribed. Trains from 1–3 do not stop at 初台 / 幡ヶ谷 (printed on the Keio map).'),
    levelId: LV.keioB2,
    fareZone: PAID_KEIO,
    footprint: [rect(2, 24, 24.5, 29.5)],
    anchor: pt(13, 27),
    tracks: ['1', '2', '3'].map((number) => ({
      number,
      services: [svc(L.keio, '京王八王子・高尾山口・橋本', 'for Keio-hachioji, Takaosanguchi, Hashimoto')],
    })),
  },
];

const areas: Area[] = [...jrAreas, ...jrPlatforms, ...keioAreas];

// ---------------------------------------------------------------------------
// passages (same-level, same-zone links between areas)
// ---------------------------------------------------------------------------

function link(
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
];

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

const BLK = {
  odakyu: 'sk:block:odakyu-shinjuku',
  marunouchi: 'sk:block:tokyo-metro-marunouchi-shinjuku',
  shinsen: 'sk:block:toei-shinjuku-keio-new-line-shinjuku',
  oedo: 'sk:block:toei-oedo-shinjuku',
  busta: 'sk:block:busta-shinjuku',
  keioRinji: 'sk:block:keio-temporary-gate-outside',
};

function gate(
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
const a = (areaId: string): GateSide => ({ areaId });
const b = (blockId: string): GateSide => ({ blockId });

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
  gate('jr-central-west-gate-keio-side', LV.jrB1, names('JR中央西改札（京王口）', 'JR Central West Gate (Keio side)', 'JR中央西检票口（京王口）'), pt(-0.8, 22.3),
    [a(A.keioLink), a(A.keioDeptUnpaid)], prov([S_B1, S_KEIO]),
    { stepFree: false, notes: 'A second JR gate line at the Keio end of the corridor, printed as "JR中央西改札（京王口）" by JR and "JR中央西改札" by Keio. Reached from the JR side only via the corridor with steps.',
      aliases: [{ name: 'JR中央西改札', usedBy: 'Keio station map' }] }),
  gate('jr-keio-transfer-gate', LV.jrB1, names('京王線連絡口', 'Keio Line transfer gate', '京王线换乘口'), pt(0.5, 23.5),
    [a(A.keioLink), a(A.keioPaid)], prov([S_B1, S_KEIO]),
    { transfer: true, stepFree: false,
      notes: 'Transfer gate between the JR paid area and the Keio paid area. JR calls it "京王線連絡口", Keio calls it "JR連絡口".',
      aliases: [{ name: 'JR連絡口', usedBy: 'Keio station map' }] }),
  gate('jr-odakyu-transfer-gate-b1f', LV.jrB1, names('小田急線のりば（連絡口）', 'Odakyu Line transfer gate (B1F)', '小田急线换乘口（B1F）'), pt(1.6, 17.25),
    [a(A.central), b(BLK.odakyu)], prov([S_B1, S_ALL]),
    { transfer: true, notes: 'Printed "小田急線のりば" on the JR B1F map and "小田急線連絡口" on the 立体図. The Odakyu side is NOT verified, so no route leaves through this gate.' }),
  gate('jr-south-gate', LV.jr2, names('南改札', 'South Gate', '南检票口'), pt(19.25, 10), [a(A.south), a(A.southUnpaid)],
    prov([S_2F, S_M773, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-southeast-gate', LV.jr2, names('東南改札', 'Southeast Gate', '东南检票口'), pt(14.5, -16.25), [a(A.south), a(A.southeastUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: true, hours: '7:00〜24:00', notes: `${RED} Opening note printed on the map: "(7:00〜24:00)".` }),
  gate('jr-odakyu-transfer-gate-2f', LV.jr2, names('小田急線のりかえ口', 'Odakyu Line transfer gate (2F)', '小田急线换乘口（2F）'), pt(17, 16.25),
    [a(A.south), b(BLK.odakyu)], prov([S_2F]),
    { transfer: true, notes: 'Printed "小田急線のりかえ口" on the JR 2F map. The Odakyu side is NOT verified, so no route leaves through this gate.' }),
  gate('jr-new-south-gate', LV.jr2, names('新南改札', 'New South Gate', '新南检票口'), pt(31.25, -1), [a(A.newSouth), a(A.newSouthUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-koshu-kaido-gate', LV.jr2, names('甲州街道改札', 'Koshu-kaido Gate', '甲州街道检票口'), pt(26.75, -1), [a(A.newSouth), a(A.koshuUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: true, notes: RED }),
  gate('jr-miraina-tower-gate', LV.jr2, names('ミライナタワー改札', 'Miraina Tower Gate', 'Miraina Tower 检票口'), pt(29, -16.25), [a(A.newSouth), a(A.mirainaUnpaid)],
    prov([S_2F, S_ALL]), { stepFree: null, notes: 'The red barrier-free line on the 2F map stops at elevator Ⓑ beside this gate; whether the gate line itself is on it could not be read with confidence.' }),
  // Keio
  gate('keio-west-gate', LV.keioB1, names('京王西口', 'Keio West Gate', '京王西口'), pt(5, 30.5), [a(A.keioPaid), a(A.keioWestUnpaid)],
    prov([S_KEIO]), { common: keioCommon, stepFree: true, notes: 'On the wheelchair route (red dotted line) of the Keio map.' }),
  gate('keio-department-store-gate', LV.keioB1, names('京王百貨店口', 'Keio Department Store Gate', '京王百货店口'), pt(-0.6, 27), [a(A.keioPaid), a(A.keioDeptUnpaid)],
    prov([S_KEIO]), { common: keioCommon, stepFree: true, notes: 'On the wheelchair route (red dotted line) of the Keio map.' }),
  gate('keio-hiroba-gate', LV.keioB1, names('広場口', 'Hiroba Gate', '广场口'), pt(8.5, 30.5), [a(A.keioPaid), a(A.keioWestUnpaid)],
    prov([S_KEIO]), { common: keioCommon, exitOnly: true, hours: '出場専用（初電〜22:00）',
      notes: 'Exit only. Read as opening onto the same side as 京王西口; the exact spot outside was not transcribed.' }),
  gate('keio-temporary-gate', LV.keioB1, names('臨時口', 'Temporary Gate', '临时口'), pt(10.25, 28), [a(A.keioPaid), b(BLK.keioRinji)],
    prov([S_KEIO]), { common: keioCommon, exitOnly: true, hours: '出場専用（平日 7:10〜9:00 のみ）',
      notes: 'Exit only, weekday mornings only. Where it leads was not established, so it has no routing edge.' }),
  gate('keio-lumine-gate', LV.keioB1, names('ルミネ口', 'Lumine Gate', 'Lumine口'), pt(24.5, 27), [a(A.keioLuminePaid), a(A.keioLumineUnpaid)],
    prov([S_KEIO]), { common: keioCommon, hours: '6:30〜22:00', notes: 'Staffed by intercom according to the Keio map.' }),
];

// ---------------------------------------------------------------------------
// entrances (where the verified model ends)
// ---------------------------------------------------------------------------

function entrance(
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
  entrance('jr-central-west-outside', LV.jrB1, A.chuoWestUnpaid, names(null, 'Outside Central West Gate', '中央西检票口外'), pt(-6, 19),
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
  entrance('keio-department-store-side', LV.keioB1, A.keioDeptUnpaid, names(null, 'Keio Department Store side', '京王百货店侧'), pt(-8, 26),
    '京王百貨店／京王新線・都営新宿線・大江戸線', 'Keio Department Store; Keio New Line, Toei Shinjuku Line, Oedo Line', prov([S_KEIO]), { common: keioCommon }),
  entrance('keio-west-side', LV.keioB1, A.keioWestUnpaid, names(null, 'Keio West Gate side', '京王西口侧'), pt(5, 34),
    '都庁方面／丸ノ内線 西口方面', 'towards the Metropolitan Government Building; Marunouchi Line, West Exit', prov([S_KEIO]), { common: keioCommon }),
  entrance('keio-lumine-side', LV.keioB1, A.keioLumineUnpaid, names(null, 'Lumine Gate side', 'Lumine口侧'), pt(28, 27),
    'ルミネ方面／南口方面', 'towards Lumine; towards the South Exit', prov([S_KEIO]), { common: keioCommon }),
];

// ---------------------------------------------------------------------------
// vertical facilities
// ---------------------------------------------------------------------------

function vertical(
  slug: string, kind: VerticalKind, n: Names,
  stops: { levelId: string; areaId: string; at: PlanPoint }[], p: Provenance,
  opts: { label?: string; aggregated?: boolean; hours?: string; notes?: string; direction?: string; common?: Common } = {},
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
  };
}

const unnamed = names(null, null);
const AGG = 'Stands for every staircase of this pair drawn on the floor map; how many there are was not counted.';
const AGG_ESC = 'Stands for every escalator of this pair drawn on the floor map; count and running direction were not recorded.';

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
  // Keio: concourse ↔ platforms
  vertical('keio-stairs-concourse-to-platforms', 'stairs', unnamed,
    [
      { levelId: LV.keioB1, areaId: A.keioPaid, at: pt(6, 25.6) },
      { levelId: LV.keioB2, areaId: A.keioPlatform, at: pt(3.4, 25.6) },
    ],
    prov([S_KEIO]), { common: keioCommon, notes: AGG }),
  vertical('keio-escalator-concourse-to-platforms', 'escalator', unnamed,
    [
      { levelId: LV.keioB1, areaId: A.keioPaid, at: pt(6, 28.4) },
      { levelId: LV.keioB2, areaId: A.keioPlatform, at: pt(3.4, 28.4) },
    ],
    prov([S_KEIO]),
    { common: keioCommon, notes: AGG_ESC,
      direction: 'The Keio map prints time-dependent directions for some escalators (e.g. "平日10:00まで昇り／10:00から降り"). Not modelled.' }),
  vertical('keio-elevator-concourse-to-platforms', 'elevator', names('エレベーター（改札内 B1F ⇔ ホーム B2F）', 'Elevator (concourse B1F ⇔ platforms B2F)', '电梯（站厅 B1F ⇔ 站台 B2F）'),
    [
      { levelId: LV.keioB1, areaId: A.keioPaid, at: pt(8, 27) },
      { levelId: LV.keioB2, areaId: A.keioPlatform, at: pt(8, 27) },
    ],
    prov([S_KEIO, S_KEIO_PAGE]),
    { common: keioCommon, aggregated: true,
      notes: 'The Keio map marks several lifts "ホーム(B2F)へ" on its wheelchair route. They are merged into one entry; which lift serves which platform slab was not transcribed.' }),
  vertical('keio-stairs-lumine-landing-to-platforms', 'stairs', unnamed,
    [
      { levelId: LV.keioB1, areaId: A.keioLuminePaid, at: pt(21, 26) },
      { levelId: LV.keioB2, areaId: A.keioPlatform, at: pt(18.5, 26) },
    ],
    prov([S_KEIO]), { common: keioCommon, notes: AGG }),
  vertical('keio-escalator-lumine-landing-to-platforms', 'escalator', unnamed,
    [
      { levelId: LV.keioB1, areaId: A.keioLuminePaid, at: pt(21, 28) },
      { levelId: LV.keioB2, areaId: A.keioPlatform, at: pt(18.5, 28) },
    ],
    prov([S_KEIO]),
    { common: keioCommon, notes: AGG_ESC, direction: 'Keio map: "※17:00まで昇り 17:00から降り". Not modelled.' }),
];

const verticals: VerticalFacility[] = [...stairPairs, ...jrLifts, ...otherVerticals];

// ---------------------------------------------------------------------------
// unverified blocks — drawn as abstract boxes, never routable
// ---------------------------------------------------------------------------

function block(id: string, operatorId: string | null, n: Names, box: PlanRect, elevation: number, height: number, notes: string): UnverifiedBlock {
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

const unverifiedBlocks: UnverifiedBlock[] = [
  block(BLK.odakyu, 'sk:operator:odakyu', names('小田急線 新宿駅', 'Odakyu Line Shinjuku', '小田急线新宿站'),
    rect(3, 22, 18.2, 21.2), -4, 8,
    'NOT VERIFIED. JR maps show two JR-side transfer gates towards Odakyu (B1F and 2F); nothing on the Odakyu side was read. JR 立体図: "小田急電鉄・東京メトロは改良工事中のため、一部変更となる場合があります".'),
  block(BLK.marunouchi, 'sk:operator:tokyo-metro', names('東京メトロ丸ノ内線 新宿駅', 'Tokyo Metro Marunouchi Line Shinjuku', '东京地铁丸之内线新宿站'),
    rect(-27, -21.5, -12, 12), -8, 2.4,
    'NOT VERIFIED. Position, depth and extent are placeholders. JR maps only print direction labels towards it.'),
  block(BLK.shinsen, 'sk:operator:toei', names('都営新宿線・京王新線 新宿駅', 'Toei Shinjuku Line / Keio New Line Shinjuku', '都营新宿线·京王新线新宿站'),
    rect(27, 38, 31, 36), -11, 2.4,
    'NOT VERIFIED. Keio lists 京王新線新宿駅 separately from 京王線新宿駅. Position and depth are placeholders.'),
  block(BLK.oedo, 'sk:operator:toei', names('都営大江戸線 新宿駅', 'Toei Oedo Line Shinjuku', '都营大江户线新宿站'),
    rect(40, 48, 22, 29), -13, 2.4,
    'NOT VERIFIED. Position and depth are placeholders. (新宿西口駅 on the same line is a different station and is not drawn.)'),
  block(BLK.busta, null, names('バスタ新宿', 'Busta Shinjuku', 'Busta 新宿（巴士总站）'),
    rect(32.5, 41, 8, 16), 7, 3.2,
    'NOT VERIFIED. The JR 2F map prints "3Fタクシーのりば" and "4F高速バス・空港バスのりば" beside lifts and escalators outside 新南改札; the facility itself was not read.'),
  block(BLK.keioRinji, KEIO, names('臨時口の出場先', 'Outside Keio Temporary Gate', '临时口出口侧'),
    rect(10.6, 12.6, 26.8, 29.2), -4.7, 1.2,
    'NOT VERIFIED. Where the exit-only 臨時口 leads was not established.'),
];

// ---------------------------------------------------------------------------
// connections that sources hint at but that are NOT in the model
// ---------------------------------------------------------------------------

const unconfirmedConnections: StationModel['unconfirmedConnections'] = [
  { id: 'uc-odakyu-transfer', description: 'JR 中央通路 (B1F) ⇄ 小田急線, and JR 南口コンコース (2F) ⇄ 小田急線, through the two JR-side transfer gates.',
    reason: 'Only the JR side of each gate was read. Odakyu was not chosen as the connected operator and is under reconstruction.' },
  { id: 'uc-2f-south-to-new-south-street', description: '南口 (outside 南改札) ⇄ 甲州街道改札 across 甲州街道 at street level.',
    reason: 'A public road crossing, not drawn as a walkway on the JR 2F map. The two 2F paid areas are joined in this model only through the platforms.' },
  { id: 'uc-new-south-unpaid-ring', description: 'The unpaid areas outside 新南改札, 甲州街道改札 and ミライナタワー改札 joining each other.',
    reason: 'The JR 2F map colours a continuous unpaid zone around that block, but walkways were not traced; left unconnected rather than guessed.' },
  { id: 'uc-southeast-to-south', description: '東南改札外 ⇄ 南口 (outside 南改札) on 2F.',
    reason: 'Separated by ルミネ2 on the JR 2F map; no direct unpaid walkway was read.' },
  { id: 'uc-central-west-outside', description: '中央西改札外 ⇄ 西口 地下 / 京王線 / 小田急線.',
    reason: 'The JR B1F map draws only a ticket office outside 中央西改札. The west-side underground plaza is outside the JR drawing and under reconstruction.' },
  { id: 'uc-platform-13-16-south-zone', description: 'A zone at the south end of platforms 13–16 that the JR 1F map tints differently and labels "B1F 中央東改札・中央西改札", and "小田急線連絡口" drawn near platforms 14 / 16 on the 立体図.',
    reason: 'Could not be read with confidence; not modelled.' },
  { id: 'uc-keio-new-line', description: '京王線 3番線ホーム ⇄ 京王新線・都営新宿線 4・5番線ホーム.',
    reason: 'Printed as text on the Keio map ("③ホーム京王八王子寄りの階段を昇ると…つながります"). 京王新線新宿駅 is outside the modelled scope.' },
  { id: 'uc-keio-jr-level-offset', description: 'Height relation between JR B1F and Keio B1F.',
    reason: 'Steps are drawn in the connecting corridor, but neither the direction nor the height was established.' },
  { id: 'uc-busta', description: '新南改札外 ⇄ バスタ新宿 3F / 4F.',
    reason: 'Lifts and escalators are drawn on the JR 2F map; バスタ新宿 itself is outside the modelled scope.' },
];

// ---------------------------------------------------------------------------

export const stationModelInput: Omit<StationModel, 'generatedAt'> = {
  schemaVersion: 1,
  unitNote:
    'All plan coordinates and elevations are unit-less schematic units invented for legibility. They are not metres and must not be used to derive distances or walking times.',
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
  unverifiedBlocks,
  unconfirmedConnections,
};

/** Stable ids that the UI and tests refer to by name. */
export const IDS = { A, G, E, LV, PF, L, BLK } as const;
