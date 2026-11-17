/**
 * The vehicle library and the rules that pick a vehicle for a trip.
 *
 * A vehicle is never chosen from the colour of a line. It comes from, in
 * this order:
 *   1. the trip's own `vehicle_series`, with the status its producer gave;
 *   2. a rule for the line, where a source says which type runs on it;
 *   3. otherwise the neutral generic train, marked `unknown`.
 * The number of cars comes from the trip's `formation_length`, or from a
 * sourced fact about the line at this station (a representative length where
 * the line runs several) — otherwise it is unknown, and the train is divided
 * into cars of the nominal length only as a drawing (the card says unknown).
 *
 * The 3D models are simplified shapes made for this prototype: body, bands,
 * door leaves and a flat, rounded or sloped cab, after the descriptions in
 * the sources (`Livery`). Proportions and door counts are schematic, and
 * every colour is an approximation, not an operator's colour value.
 */
import { lineEntry } from '../timetable/registry';
import type { TimetableRecord, VehicleAssignmentStatus } from '../timetable/types';

export type FrontShape = 'flat' | 'rounded' | 'slant';

/** A horizontal band along both sides of every car, between two heights of the car frame (floor 0.1, roof 0.6). */
export interface Band {
  u0: number;
  u1: number;
  color: string;
}

/**
 * How a type looks from outside, simplified: body colour, the bands along the sides, the door
 * leaves, the cab face and a dark band over the window row where the type has one. Colours are
 * approximations of what the sources describe in words; they are not operator colour values.
 */
export interface Livery {
  body: string;
  bands: Band[];
  doors?: string;
  /** Lower part of the cab face. */
  front: string;
  /** A band across the cab face below the windscreen, if the type has one. */
  frontBand?: string;
  /** A dark band over the whole window row (e.g. E259系). */
  windowBand?: string;
  roof?: string;
  sourceIds: string[];
  note: string;
}

export interface VehicleSpec {
  id: string;
  /** Series as the operator writes it, e.g. "E235系". Null for the generic train. */
  series: string | null;
  operatorId: string | null;
  names: { ja: string; en: string; zh: string };
  /** Spellings matched against `vehicle_series` (lower-cased, without 系 / "series"). */
  aliases: string[];
  body: string;
  roof: string;
  /** Where the accent colour — the display colour of the trip's line — is applied. */
  accent: 'doors-and-front' | 'belt' | 'body' | 'none';
  front: FrontShape;
  doorsPerSide: number;
  /** Exterior; without it the old scheme applies (body colour plus the line colour where `accent` says). */
  livery?: Livery;
  /** Length of one car in metres when it is not the usual 20 m (18 m 丸ノ内線, 16.5 m 大江戸線). */
  carLengthM?: number;
  /** Width and height relative to a standard car, for smaller cars (大江戸線 mini-metro, 都営新宿線 narrow body). */
  size?: { width: number; height: number };
  /**
   * Bilevel cars, counted from the −a end of the train (the north end in this model) starting at 0,
   * drawn only when the train has at least 10 cars.
   */
  bilevelCars?: number[];
  sourceIds: string[];
  /** What was and was not checked about this model. */
  note: string;
}

const SCHEMATIC = 'Shape, door count and the placement of the accent colour are simplified for this prototype.';

export const GENERIC_VEHICLE: VehicleSpec = {
  id: 'generic',
  series: null,
  operatorId: null,
  names: { ja: '汎用の列車（車種不明）', en: 'Generic train (type unknown)', zh: '通用占位列车（车型未知）' },
  aliases: [],
  body: '#d3d7dc',
  roof: '#7c838c',
  accent: 'belt',
  front: 'flat',
  doorsPerSide: 4,
  sourceIds: ['src:senkiro-lab-schematic'],
  note: 'A placeholder: it stands for a train whose type is not known and does not depict any real vehicle.',
};

export const VEHICLES: readonly VehicleSpec[] = [
  {
    id: 'jr-east:E235',
    series: 'E235系',
    operatorId: 'jr-east',
    names: { ja: 'E235系', en: 'E235 series', zh: 'E235 系' },
    aliases: ['e235', 'e235-0', 'e235-1000'],
    body: '#e3e6ea',
    roof: '#6f767f',
    accent: 'doors-and-front',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e235'],
    note: `JR East lists 山手線 among the lines of the E235系 (debut March 2016, 120 km/h). ${SCHEMATIC} The number of cars is not stated on that page.`,
  },
  {
    id: 'jr-east:E233',
    series: 'E233系',
    operatorId: 'jr-east',
    names: { ja: 'E233系', en: 'E233 series', zh: 'E233 系' },
    aliases: ['e233', 'e233-0', 'e233-7000', 'e233-3000'],
    body: '#e1e4e8',
    roof: '#6f767f',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e233'],
    note: `JR East lists 中央線快速, 埼京線 and 湘南新宿ライン among the lines of the E233系. ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:E231',
    series: 'E231系',
    operatorId: 'jr-east',
    names: { ja: 'E231系', en: 'E231 series', zh: 'E231 系' },
    aliases: ['e231', 'e231-0', 'e231-500', 'e231-1000'],
    body: '#dfe2e6',
    roof: '#6f767f',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e231'],
    note: `JR East lists 中央線・総武線各駅停車 and 湘南新宿ライン among the lines of the E231系. ${SCHEMATIC}`,
  },
  {
    id: 'tokyo-metro:2000',
    series: '2000系',
    operatorId: 'tokyo-metro',
    names: { ja: '2000系', en: '2000 series', zh: '2000 系' },
    aliases: ['2000', 'metro2000', 'tokyometro2000'],
    body: '#d8dbdf',
    roof: '#8d9299',
    accent: 'body',
    front: 'flat',
    doorsPerSide: 3,
    sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: `Tokyo Metro's train for the Marunouchi Line since 2019, reported as red; the body takes the line's display colour here. ${SCHEMATIC}`,
  },
  {
    id: 'toei:10-300',
    series: '10-300形',
    operatorId: 'toei',
    names: { ja: '10-300形', en: 'Type 10-300', zh: '10-300 形' },
    aliases: ['10-300', 'toei10-300'],
    body: '#dde0e4',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:tetsudoch-toei-shinjuku-10cars'],
    note: `The Toei trainsets of the Shinjuku Line, all 10 cars long since 2022. ${SCHEMATIC}`,
  },
  {
    id: 'toei:12-600',
    series: '12-600形',
    operatorId: 'toei',
    names: { ja: '12-600形', en: 'Type 12-600', zh: '12-600 形' },
    aliases: ['12-600','12-000','toei12-600','toei12-000'],
    body: '#dcdfe3',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 3,
    sourceIds: ['src:toei-oedo-12-600'],
    note: `The newer of the two types of the Oedo Line; the 12-000形 is drawn with this model too. ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:E353',
    series: 'E353系',
    operatorId: 'jr-east',
    names: { ja: 'E353系', en: 'E353 series', zh: 'E353 系' },
    aliases: ['e353'],
    body: '#eceef0',
    roof: '#727982',
    accent: 'belt',
    front: 'slant',
    doorsPerSide: 2,
    sourceIds: ['src:trafficnews-e353-azusa-kaiji'],
    note: `The limited express train of the Chuo Line (あずさ・かいじ) since March 2019. ${SCHEMATIC}`,
  },
  {
    id: 'odakyu:3000',
    series: '3000形',
    operatorId: 'odakyu',
    names: { ja: '3000形', en: 'Type 3000', zh: '3000 形' },
    aliases: ['3000','odakyu3000'],
    body: '#dadde1',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:trafficnews-odakyu-5000-8car'],
    note: `Reported as the most numerous commuter type of Odakyu, in 6-, 8- and 10-car sets. ${SCHEMATIC}`,
  },
  {
    id: 'keio:9000',
    series: '9000系',
    operatorId: 'keio',
    names: { ja: '9000系', en: '9000 series', zh: '9000 系' },
    aliases: ['9000','keio9000'],
    body: '#dadde1',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:tsukinzukan-keio'],
    note: `A Keio commuter type with 10-car and 8-car sets. ${SCHEMATIC}`,
  },
  {
    id: 'seibu:30000',
    series: '30000系',
    operatorId: 'seibu',
    names: { ja: '30000系', en: '30000 series', zh: '30000 系' },
    aliases: ['30000','seibu30000'],
    body: '#e2e5e9',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:tsukinzukan-seibu'],
    note: `A Seibu commuter type (スマイルトレイン) with 10-, 8- and 2-car sets. ${SCHEMATIC}`,
  },
  {
    id: 'tokyo-metro:10000',
    series: '10000系',
    operatorId: 'tokyo-metro',
    names: { ja: '10000系', en: '10000 series', zh: '10000 系' },
    aliases: ['10000','metro10000','tokyometro10000'],
    body: '#d9dce0',
    roof: '#7a8189',
    accent: 'belt',
    front: 'flat',
    doorsPerSide: 4,
    sourceIds: ['src:response-metro-17000'],
    note: `Described in 2020 as the main fleet of the Yurakucho and Fukutoshin lines, in 10-car sets. ${SCHEMATIC}`,
  },
];


const B = (u0: number, u1: number, color: string): Band => ({ u0, u1, color });
const BELOW = [0.3, 0.355] as const;
const ABOVE = [0.545, 0.6] as const;
const LIVERY_NOTE = 'Colours are approximations of the description, not colour values.';

/** Exteriors per type (2026-11-16, Wikipedia pages of each type; see src:wikipedia-ja-train-pages). */
const LIVERIES: Record<string, Pick<VehicleSpec, 'livery' | 'front' | 'carLengthM' | 'size' | 'bilevelCars'>> = {
  'jr-east:E235': {
    front: 'flat',
    livery: { body: '#dfe3e7', bands: [B(ABOVE[0], ABOVE[1], '#8dc21f')], doors: '#8dc21f', front: '#8dc21f', roof: '#6f767f', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'The line colour 黄緑6号 is painted on the side doors and the panel above them, and on the cab face with a gradient; the face is flat and has no through door.' },
  },
  'jr-east:E233': {
    front: 'flat',
    bilevelCars: [3, 4],
    livery: { body: '#dfe2e6', bands: [B(BELOW[0], BELOW[1], '#ec5a24'), B(ABOVE[0], ABOVE[1], '#ec5a24')], front: '#25292e', frontBand: '#ec5a24', roof: '#6f767f', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Stainless body with orange-vermilion bands (the Chuo Line colour, read from a summary of the page). Since 2025 the 12-car trains carry two bilevel green cars, the 4th and 5th from the Tokyo end (summary of the page, not checked word for word); Tokyo is the north end of the platforms here.' },
  },
  'jr-east:E233-7000': {
    front: 'flat',
    livery: { body: '#dfe2e6', bands: [B(BELOW[0], BELOW[1], '#00a984'), B(ABOVE[0], ABOVE[1], '#00a984')], front: '#25292e', frontBand: '#00a984', roof: '#6f767f', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'The E233系 carries a band in the colour of its line; for the 埼京線 that is green. The exact stripe of the 7000番台 was not read from the page (only its sign colour), so the line colour is used.' },
  },
  'jr-east:E231': {
    front: 'flat',
    livery: { body: '#dfe2e6', bands: [B(BELOW[0], BELOW[1], '#f8c400'), B(ABOVE[0], ABOVE[1], '#f8c400')], front: '#2a2e33', frontBand: '#f8c400', roof: '#6f767f', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'The 500番台 of the 中央・総武緩行線 carries canary-yellow bands (summary of the page).' },
  },
  'jr-east:E231-1000': {
    front: 'flat',
    livery: { body: '#dfe2e6', bands: [B(0.3, 0.328, '#f08a1d'), B(0.328, 0.356, '#21894b')], front: '#2a2e33', frontBand: '#f08a1d', roof: '#6f767f', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'The 近郊形 1000番台 carries the 湘南 colours, yellow-orange and green (summary of the page). Its two bilevel green cars are not drawn: which end they sit at was not established.' },
  },
  'jr-east:E353': {
    front: 'slant',
    livery: { body: '#f1f2f4', bands: [B(0.32, 0.34, '#6b4f9e')], windowBand: '#5d6168', front: '#1f2226', roof: '#8b9097', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Alpine white with a thin あずさバイオレット stripe; the face is stream black and the window surround castle grey. The nose is drawn as a simple slope.' },
  },
  'jr-east:E259': {
    front: 'slant',
    livery: { body: '#f4f5f6', bands: [], windowBand: '#1e2226', front: '#f4f5f6', frontBand: '#1e2226', roof: '#c4161c', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'White, with a black band from the bottom of the windows to the roof edge and a red roof.' },
  },
  'tokyo-metro:2000': {
    front: 'rounded',
    carLengthM: 18,
    livery: { body: '#e50037', bands: [B(0.535, 0.552, '#ffffff')], front: '#e50037', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Glowing scarlet all over, with a sine-wave motif on the upper body (drawn as a thin white line); 18 m cars.' },
  },
  'tokyo-metro:10000': {
    front: 'rounded',
    livery: { body: '#c9cdd2', bands: [B(0.292, 0.302, '#ffffff'), B(0.302, 0.352, '#8f6434'), B(0.352, 0.362, '#c9a24b')], front: '#c9cdd2', frontBand: '#8f6434', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Brown (the 副都心線 colour) with thin gold and white lines; curved 3D front glass.' },
  },
  'toei:10-300': {
    front: 'flat',
    size: { width: 0.94, height: 1 },
    livery: { body: '#d5d9dd', bands: [B(0.3, 0.352, '#7cc142'), B(0.352, 0.364, '#213b7a')], front: '#c9cdd2', frontBand: '#7cc142', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Stainless, with a thick leaf-green band and a thin dark-blue one; a narrow body (2,770 mm) for the 新宿線 loading gauge.' },
  },
  'toei:12-600': {
    front: 'flat',
    carLengthM: 16.5,
    size: { width: 0.84, height: 0.86 },
    livery: { body: '#c9cdd2', bands: [B(0.3, 0.33, '#d1007a'), B(0.55, 0.575, '#7b1e3a')], front: '#c9cdd2', frontBand: '#d1007a', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Unpainted aluminium with magenta and wine-red lines; mini-metro cars (16.5 m long, 2,490 mm wide, 3,140 mm high), drawn smaller.' },
  },
  'odakyu:3000': {
    front: 'flat',
    livery: { body: '#cdd1d5', bands: [B(BELOW[0], BELOW[1], '#1c4fa0')], front: '#c3c8ce', frontBand: '#1c4fa0', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Dull-finished stainless with a silver front and a blue band below the windscreen. The page does not state the colour of the side band; the blue of the front is used.' },
  },
  'keio:9000': {
    front: 'flat',
    livery: { body: '#d6dade', bands: [B(0.15, 0.19, '#e4005a'), B(0.19, 0.23, '#1d47a2')], front: '#efe9d6', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Stainless with 京王レッド and 京王ブルー bands along the lower body; the front is painted ivory.' },
  },
  'odakyu:70000': {
    front: 'rounded',
    livery: { body: '#c8473f', bands: [B(BELOW[0], BELOW[1], '#ee6d2b')], front: '#c8473f', windowBand: '#2a1f22', roof: '#6b1f2e', sourceIds: ['src:wikipedia-ja-train-pages', 'src:trafficnews-gse-hakone'],
      note: 'Rose vermilion (ローズバーミリオン) body, rouge-bordeaux (ルージュボルドー) roof and a vermilion-orange (バーミリオンオレンジ) band below the windows; a large curved front window over the observation seats, drawn as a rounded cab.' },
  },
  'odakyu:60000': {
    front: 'slant',
    livery: { body: '#1f4aa8', bands: [B(BELOW[0], BELOW[1], '#ee6d2b')], front: '#1f4aa8', windowBand: '#162038', roof: '#c9ced4', sourceIds: ['src:trafficnews-mse-blue'],
      note: 'フェルメール・ブルー all over, with a vermilion-orange band below the side windows; a streamlined nose, drawn as a slope. The roof colour was not read from a source.' },
  },
  'odakyu:30000': {
    front: 'flat',
    livery: { body: '#c9ccd0', bands: [B(0.1, 0.3, '#4a4f57'), B(BELOW[0], BELOW[1], '#ee6d2b')], front: '#c9ccd0', frontBand: '#4a4f57', windowBand: '#2a2d32', roof: '#9aa0a7', sourceIds: ['src:trafficnews-exe-alpha'],
      note: 'EXEα: moonlight silver (ムーンライトシルバー) and deep grey metallic (ディープグレイメタリック), with a vermilion-orange band. Where each colour sits on the body was not read; the grey is drawn on the lower body. The front shape was not read from a source.' },
  },
  'keio:5000': {
    front: 'rounded',
    livery: { body: '#d6dade', bands: [B(0.15, 0.19, '#e4005a'), B(0.19, 0.23, '#1d47a2')], front: '#d6dade', frontBand: '#e4005a', windowBand: '#1b1d20', roof: '#7a8189', sourceIds: ['src:trafficnews-keio-5000'],
      note: 'Stainless (sustina) with 京王レッド and 京王ブルー, as on the older types; a longer leading car with a "petit streamlined" front, the windscreen framed in black and the skirt painted 京王レッド.' },
  },
  'seibu:10000': {
    front: 'flat',
    livery: { body: '#b9bec4', bands: [B(BELOW[0], BELOW[1], '#d0202e')], front: '#b9bec4', frontBand: '#d0202e', roof: '#8a9097', sourceIds: ['src:tetsudoch-seibu-10000-colour'],
      note: 'A grey body with a red band (ニューレッドアロー). One set runs in the ivory-and-red レッドアロークラシック colours from 4 October 2026 until spring 2027; it is not drawn separately. The front shape was not read from a source.' },
  },
  'seibu:40000': {
    front: 'flat',
    livery: { body: '#c9cdd2', bands: [], front: '#c9cdd2', roof: '#7a8189', sourceIds: ['src:response-seibu-40000'],
      note: 'COLOURS NOT FOUND: no source read gave the exterior colours of the 40000系, so it is drawn plain. A through door in the front (stated).' },
  },
  'tobu:100': {
    front: 'slant',
    livery: { body: '#eef0ee', bands: [B(0.3, 0.33, '#f08a4b'), B(0.33, 0.355, '#a0193f')], front: '#eef0ee', windowBand: '#1b1d20', roof: '#c9ced4', sourceIds: ['src:tobu-spacia-100'],
      note: 'The colours it was introduced in (1990): a white body with sunny-coral-orange and purple-ruby-red lines and the window row in black. The sets have been repainted since; which set carries which colours was not read, so the original scheme is drawn. The nose shape was not read from a source.' },
  },
  'jr-east:253-1000': {
    front: 'flat',
    livery: { body: '#1b2e6b', bands: [B(BELOW[0], BELOW[1], '#f2c230')], front: '#1b2e6b', roof: '#8a9097', sourceIds: ['src:jreast-253-repaint'],
      note: 'The 2026 colours for 20 years of JR–Tobu through running: deep blue (群青色, from the 透塀 of 日光東照宮) with a yellow band (ニッコウキスゲ, the gold of the shrine). The first set ran in them from 13 June 2026, the second was planned for autumn 2026; the older red scheme is not drawn. The front shape was not read from a source.' },
  },
  'jr-east:E257': {
    front: 'flat',
    livery: { body: '#eef1f4', bands: [B(BELOW[0], BELOW[1], '#1f5fa8')], front: '#eef1f4', frontBand: '#1f5fa8', roof: '#8a9097', sourceIds: ['src:trafficnews-e257-odoriko'],
      note: 'The 2000番台 of 踊り子 / 湘南 is based on ペニンシュラブルー (the sky and sea of Izu). Only the blue is from the source; the body is drawn light, and the front shape was not read.' },
  },
  'seibu:30000': {
    front: 'rounded',
    livery: { body: '#c9cdd2', bands: [B(0.12, 0.18, '#2f7fd0'), B(0.18, 0.24, '#5bbf5c')], front: '#f3f4f5', frontBand: '#2f7fd0', roof: '#7a8189', sourceIds: ['src:wikipedia-ja-train-pages'],
      note: 'Unpainted aluminium sides with a blue-to-green gradient band along the lower body (drawn as two bands); a white, egg-shaped front with one large window.' },
  },
};

const MORE_VEHICLES: VehicleSpec[] = [
  {
    id: 'jr-east:E233-7000', series: 'E233系7000番台', operatorId: 'jr-east',
    names: { ja: 'E233系7000番台', en: 'E233-7000 series', zh: 'E233 系 7000 番台' },
    aliases: ['e233-7000'], body: '#dfe2e6', roof: '#6f767f', accent: 'belt', front: 'flat', doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e233', 'src:wikipedia-ja-train-pages'],
    note: `The 埼京線 sets of the E233系. ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:E231-1000', series: 'E231系1000番台', operatorId: 'jr-east',
    names: { ja: 'E231系1000番台', en: 'E231-1000 series', zh: 'E231 系 1000 番台' },
    aliases: ['e231-1000'], body: '#dfe2e6', roof: '#6f767f', accent: 'belt', front: 'flat', doorsPerSide: 4,
    sourceIds: ['src:jreast-train-e231', 'src:wikipedia-ja-train-pages'],
    note: `The 近郊形 sets of the E231系 (湘南新宿ライン, 10 cars plus a 5-car set). ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:E259', series: 'E259系', operatorId: 'jr-east',
    names: { ja: 'E259系', en: 'E259 series', zh: 'E259 系' },
    aliases: ['e259'], body: '#f4f5f6', roof: '#c4161c', accent: 'none', front: 'slant', doorsPerSide: 1,
    sourceIds: ['src:wikipedia-ja-train-pages'],
    note: `The 成田エクスプレス train: 6-car sets, run as 6 + 6 = 12 cars between Tokyo and Narita Airport. ${SCHEMATIC}`,
  },
  {
    id: 'odakyu:70000', series: '70000形', operatorId: 'odakyu',
    names: { ja: '70000形 GSE', en: '70000 series GSE', zh: '70000 形 GSE' },
    aliases: ['70000', 'gse'], body: '#c8473f', roof: '#6b1f2e', accent: 'none', front: 'rounded', doorsPerSide: 1,
    sourceIds: ['src:wikipedia-ja-train-pages', 'src:trafficnews-gse-hakone'],
    note: `The newest 特急ロマンスカー: two 7-car sets, used mainly on 箱根 services (はこね, スーパーはこね) and also on the commuter limited expresses (2018 report). ${SCHEMATIC}`,
  },
  {
    id: 'odakyu:60000', series: '60000形', operatorId: 'odakyu',
    names: { ja: '60000形 MSE', en: '60000 series MSE', zh: '60000 形 MSE' },
    aliases: ['60000', 'mse'], body: '#1f4aa8', roof: '#c9ced4', accent: 'none', front: 'slant', doorsPerSide: 1,
    sourceIds: ['src:trafficnews-mse-blue', 'src:tabimag-fujisan'],
    note: `The blue 特急ロマンスカー; the 6-car set is the type of 特急「ふじさん」 to 御殿場 on the JR 御殿場線. ${SCHEMATIC}`,
  },
  {
    id: 'odakyu:30000', series: '30000形', operatorId: 'odakyu',
    names: { ja: '30000形 EXEα', en: '30000 series EXEα', zh: '30000 形 EXEα' },
    aliases: ['30000', 'exe', 'exeα', 'exe-alpha'], body: '#c9ccd0', roof: '#9aa0a7', accent: 'none', front: 'flat', doorsPerSide: 1,
    sourceIds: ['src:trafficnews-exe-alpha'],
    note: `The everyday 特急ロマンスカー, 6 + 4 cars, renewed as EXEα from 2017. ${SCHEMATIC}`,
  },
  {
    id: 'keio:5000', series: '5000系', operatorId: 'keio',
    names: { ja: '5000系', en: '5000 series', zh: '5000 系' },
    aliases: ['5000'], body: '#d6dade', roof: '#7a8189', accent: 'none', front: 'rounded', doorsPerSide: 4,
    sourceIds: ['src:trafficnews-keio-5000'],
    note: `Keio's train for the reserved-seat 京王ライナー (2017), with seats that turn between long benches and pairs. ${SCHEMATIC}`,
  },
  {
    id: 'seibu:10000', series: '10000系', operatorId: 'seibu',
    names: { ja: '10000系 ニューレッドアロー', en: '10000 series New Red Arrow', zh: '10000 系 New Red Arrow' },
    aliases: ['10000', 'ニューレッドアロー', 'nra'], body: '#b9bec4', roof: '#8a9097', accent: 'none', front: 'flat', doorsPerSide: 1,
    sourceIds: ['src:seibu-10000-2026', 'src:tetsudoch-seibu-10000-colour', 'src:tsukinzukan-seibu'],
    note: `The 7-car limited express of 特急「小江戸」; it leaves regular service when the new トキイロ starts in spring 2027. ${SCHEMATIC}`,
  },
  {
    id: 'seibu:40000', series: '40000系', operatorId: 'seibu',
    names: { ja: '40000系', en: '40000 series', zh: '40000 系' },
    aliases: ['40000'], body: '#c9cdd2', roof: '#7a8189', accent: 'none', front: 'flat', doorsPerSide: 4,
    sourceIds: ['src:response-seibu-40000'],
    note: `Seibu's commuter train with seats that turn; two 10-car sets run 拝島ライナー between 西武新宿 and 拝島. ${SCHEMATIC}`,
  },
  {
    id: 'tobu:100', series: '100系', operatorId: 'tobu',
    names: { ja: '東武100系 スペーシア', en: 'Tobu 100 series Spacia', zh: '东武 100 系 Spacia' },
    aliases: ['100', 'スペーシア'], body: '#eef0ee', roof: '#c9ced4', accent: 'none', front: 'slant', doorsPerSide: 1,
    sourceIds: ['src:tobu-spacia-100'],
    note: `Tobu's 6-car limited express; it runs the JR through train 「スペーシア日光」 between JR 新宿 and 東武日光. ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:253-1000', series: '253系1000番台', operatorId: 'jr-east',
    names: { ja: '253系1000番台', en: '253-1000 series', zh: '253 系 1000 番台' },
    aliases: ['253', '253-1000'], body: '#1b2e6b', roof: '#8a9097', accent: 'none', front: 'flat', doorsPerSide: 1,
    sourceIds: ['src:jreast-253-repaint'],
    note: `JR East's two 6-car sets for 特急「きぬがわ」 to 鬼怒川温泉 over the Tobu lines. ${SCHEMATIC}`,
  },
  {
    id: 'jr-east:E257', series: 'E257系', operatorId: 'jr-east',
    names: { ja: 'E257系', en: 'E257 series', zh: 'E257 系' },
    aliases: ['e257', 'e257-2000', 'e257-2500'], body: '#eef1f4', roof: '#8a9097', accent: 'none', front: 'flat', doorsPerSide: 1,
    sourceIds: ['src:trafficnews-e257-odoriko'],
    note: `The limited express of 踊り子 and 湘南 (2000番台 9 cars, 2500番台 5 cars, rebuilt from 中央線 and 房総 sets). ${SCHEMATIC}`,
  },
];

for (const v of MORE_VEHICLES) (VEHICLES as VehicleSpec[]).push(v);
for (const v of VEHICLES as VehicleSpec[]) {
  const l = LIVERIES[v.id];
  if (l) Object.assign(v, l);
}

function normaliseSeries(s: string): string {
  return s.toLowerCase().replace(/系|series|形/g, '').replace(/\s+/g, '').trim();
}

/**
 * The library's model for a series name. Series numbers repeat between
 * companies (a 2000系 exists at Tokyo Metro and at Seibu), so with an operator
 * given only that operator's vehicles are considered.
 */
export function vehicleBySeries(series: string, operatorId?: string | null): VehicleSpec | null {
  const key = normaliseSeries(series);
  const short = key.replace(/-\d+$/, '');
  const pool = operatorId ? VEHICLES.filter((v) => v.operatorId === operatorId) : VEHICLES;
  return pool.find((v) => v.aliases.includes(key)) ?? pool.find((v) => v.aliases.includes(short)) ?? null;
}

/**
 * Rules by service: a named train or train type of a line whose vehicle a source names. Checked before
 * the line rules. `match` reads the record's train type (service_class) and remarks, where the import
 * scripts keep the train name.
 */
export interface ServiceVehicleRule {
  line_id: string;
  /** Tested against `${service_class} ${remarks}`. */
  match: RegExp;
  /** A second pattern that must NOT match, e.g. to tell 「きぬがわ」 from 「スペーシアきぬがわ」. */
  unless?: RegExp;
  vehicleId: string;
  status: Exclude<VehicleAssignmentStatus, 'unknown'>;
  /** Cars of this service where a source states them; otherwise the line's figure applies. */
  cars?: number;
  sourceIds: string[];
  note: string;
}

export const SERVICE_VEHICLE_RULES: readonly ServiceVehicleRule[] = [
  {
    line_id: 'odakyu:odawara', match: /ふじさん/, vehicleId: 'odakyu:60000', status: 'verified', cars: 6, sourceIds: ['src:tabimag-fujisan'],
    note: '特急「ふじさん」 (新宿–御殿場, 3 return trips a day) runs with the 6-car 60000形 MSE.',
  },
  {
    line_id: 'odakyu:odawara', match: /はこね/, vehicleId: 'odakyu:70000', status: 'representative', cars: 7, sourceIds: ['src:trafficnews-gse-hakone'],
    note: 'The 70000形 GSE runs mainly on the 箱根 services (2018 report); EXEα and MSE also run them, and which train gets which type is not in the timetable.',
  },
  {
    line_id: 'odakyu:odawara', match: /ロマンスカー|特急/, vehicleId: 'odakyu:30000', status: 'representative', sourceIds: ['src:trafficnews-exe-alpha'],
    note: 'A 特急ロマンスカー other than ふじさん and はこね: drawn as the 30000形 EXEα, the everyday Romancecar; GSE and MSE also run these services.',
  },
  {
    line_id: 'keio:keio', match: /京王ライナー/, vehicleId: 'keio:5000', status: 'verified', cars: 10, sourceIds: ['src:trafficnews-keio-5000'],
    note: 'The reserved-seat 京王ライナー is run with the 5000系 built for it.',
  },
  {
    line_id: 'seibu:shinjuku', match: /^特急/, vehicleId: 'seibu:10000', status: 'verified', cars: 7, sourceIds: ['src:seibu-10000-2026', 'src:tsukinzukan-seibu'],
    note: '特急「小江戸」 runs with the 10000系 ニューレッドアロー (7 cars) until the トキイロ replaces it in spring 2027.',
  },
  {
    line_id: 'seibu:shinjuku', match: /ライナー/, vehicleId: 'seibu:40000', status: 'verified', cars: 10, sourceIds: ['src:response-seibu-40000'],
    note: '拝島ライナー runs with the 40000系 (two 10-car sets).',
  },
  {
    line_id: 'jr-east:tobu-through-limited-express', match: /スペーシア/, vehicleId: 'tobu:100', status: 'verified', cars: 6, sourceIds: ['src:tobu-spacia-100'],
    note: 'Tobu states that its 100系 Spacia runs the JR through train 「スペーシア日光」.',
  },
  {
    line_id: 'jr-east:tobu-through-limited-express', match: /きぬがわ/, unless: /スペーシア/, vehicleId: 'jr-east:253-1000', status: 'verified', cars: 6, sourceIds: ['src:jreast-253-repaint'],
    note: '特急「きぬがわ」 runs with JR East\'s two 6-car 253系1000番台 sets.',
  },
  {
    line_id: 'jr-east:other-limited-express', match: /湘南|踊り子/, vehicleId: 'jr-east:E257', status: 'representative', sourceIds: ['src:trafficnews-e257-odoriko'],
    note: '特急「湘南」「踊り子」 are run mostly with E257系 2000 / 2500番台 (other types also run 踊り子).',
  },
];

export interface LineVehicleRule {
  line_id: string;
  vehicleId: string;
  /** verified: the source ties this line to this one type. representative: one of the types the source lists for it. */
  status: Exclude<VehicleAssignmentStatus, 'unknown'>;
  sourceIds: string[];
  note: string;
}

/**
 * Rules per line. Only lines whose type was read from a source are listed;
 * the others fall through to the generic train. Where several types share a
 * line the rule names one of them as `representative` and its note says so;
 * a trip that names its own type always wins.
 */
export const LINE_VEHICLE_RULES: readonly LineVehicleRule[] = [
  {
    line_id: 'jr-east:yamanote', vehicleId: 'jr-east:E235', status: 'verified', sourceIds: ['src:jreast-train-e235', 'src:trafficnews-yamanote-e235'],
    note: 'JR East lists 山手線 under the E235系, and announced in January 2020 that the whole Yamanote Line fleet had been replaced by it (50 sets, 550 cars).',
  },
  {
    line_id: 'jr-east:chuo-rapid', vehicleId: 'jr-east:E233', status: 'representative', sourceIds: ['src:jreast-train-e233', 'src:tetsudoch-chuo-green-car'],
    note: 'JR East lists 中央線快速 under the E233系, which carries the green cars introduced in March 2025. Whether every trip uses it was not checked.',
  },
  {
    line_id: 'jr-east:saikyo', vehicleId: 'jr-east:E233-7000', status: 'representative', sourceIds: ['src:jreast-train-e233', 'src:wadattsu-saikyo-cars'],
    note: 'JR East lists 埼京線 under the E233系. Trains of other companies run through on this line; the type of a given trip was not checked.',
  },
  {
    line_id: 'jr-east:chuo-sobu-local', vehicleId: 'jr-east:E231', status: 'representative', sourceIds: ['src:jreast-train-e231', 'src:trafficnews-chuosobu-e231-500'],
    note: 'JR East lists 中央線・総武線各駅停車 under the E231系; the 500番台 sets came from the Yamanote Line. E235系 sets were reported on trial runs here in 2026.',
  },
  {
    line_id: 'tokyo-metro:marunouchi', vehicleId: 'tokyo-metro:2000', status: 'representative', sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: 'Tokyo Metro planned for every Marunouchi Line trainset to be a 2000系 in fiscal 2023; that the last 02系 has gone was not confirmed.',
  },
  {
    line_id: 'toei:shinjuku', vehicleId: 'toei:10-300', status: 'representative', sourceIds: ['src:tetsudoch-toei-shinjuku-10cars'],
    note: 'The Toei-owned trains of the line. Keio trains run through as well; the type of a given trip was not checked.',
  },
  {
    line_id: 'jr-east:shonan-shinjuku', vehicleId: 'jr-east:E231-1000', status: 'representative', sourceIds: ['src:jreast-train-e231','src:jreast-train-e233'],
    note: 'JR East lists 湘南新宿ライン under both the E231系 and the E233系; the type and the length (10 or 15 cars) of a given trip were not checked.',
  },
  {
    line_id: 'jr-east:chuo-limited-express', vehicleId: 'jr-east:E353', status: 'verified', sourceIds: ['src:trafficnews-e353-azusa-kaiji'],
    note: 'The regular あずさ・かいじ trains have all been E353系 since March 2019. Seasonal extra trains may differ. 9 or 12 cars depending on the train, so no length is assumed.',
  },
  {
    line_id: 'toei:oedo', vehicleId: 'toei:12-600', status: 'representative', sourceIds: ['src:toei-oedo-12-600'],
    note: 'The Oedo Line is run by the 12-000形 and the 12-600形; which of the two a trip uses was not checked.',
  },
  {
    line_id: 'odakyu:odawara', vehicleId: 'odakyu:3000', status: 'representative', sourceIds: ['src:trafficnews-odakyu-5000-8car'],
    note: 'The 3000形 is reported as the most numerous Odakyu commuter type. The 4000形, 5000形 and other types and the Romancecar limited expresses run from 新宿 as well; sets are 6, 8 or 10 cars, so no length is assumed.',
  },
  {
    line_id: 'keio:keio', vehicleId: 'keio:9000', status: 'representative', sourceIds: ['src:tsukinzukan-keio'],
    note: 'One of the Keio commuter types. The 5000系, 8000系 and others run as well; sets are 8 or 10 cars, so no length is assumed.',
  },
  {
    line_id: 'keio:keio-new', vehicleId: 'keio:9000', status: 'representative', sourceIds: ['src:tsukinzukan-keio','src:tetsudoch-toei-shinjuku-10cars'],
    note: 'The 10-car 9000系 is the Keio type that can run through to the Toei Shinjuku Line; Toei 10-300形 trains use these platforms too.',
  },
  {
    line_id: 'seibu:shinjuku', vehicleId: 'seibu:30000', status: 'representative', sourceIds: ['src:tsukinzukan-seibu'],
    note: 'One of the Seibu commuter types. The 2000系, 40000系 and the limited express 小江戸 (10000系) run as well; sets are 8 or 10 cars, so no length is assumed.',
  },
  {
    line_id: 'tokyo-metro:fukutoshin', vehicleId: 'tokyo-metro:10000', status: 'representative', sourceIds: ['src:response-metro-17000'],
    note: 'Described as the main fleet of the line in 2020. The 17000系 and the trains of five other companies run through as well; trains are 8 or 10 cars.',
  },
  {
    line_id: 'jr-east:narita-express', vehicleId: 'jr-east:E259', status: 'verified', sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'The E259系 is the 成田エクスプレス train.',
  },
];

export interface FormationFact {
  station_id: string;
  line_id: string;
  cars: number;
  /** The line runs several lengths and this one is drawn as representative. */
  representative?: boolean;
  sourceIds: string[];
  note: string;
}

/** Car counts that a source states for a line at a station. */
export const FORMATION_FACTS: readonly FormationFact[] = [
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:yamanote', cars: 11, sourceIds: ['src:trafficnews-yamanote-e235'],
    note: '50 trainsets and 550 cars in all: 11 cars per train.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:chuo-rapid', cars: 12, sourceIds: ['src:tetsudoch-chuo-green-car'],
    note: '10-car E233系 sets plus two green cars since March 2025. 10-car trains were still reported in the mix around the start of the service; a trip that says otherwise in the timetable wins.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:saikyo', cars: 10, sourceIds: ['src:wadattsu-saikyo-cars'],
    note: 'Every train on the line is 10 cars, the through trains of りんかい線 and 相鉄 included.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:chuo-sobu-local', cars: 10, sourceIds: ['src:trafficnews-chuosobu-e231-500'],
    note: 'The E231系500番台 sets of the line are 10 cars. That every other set is 10 cars as well was not read from a source.',
  },
  {
    station_id: 'tokyo-metro:shinjuku:M08', line_id: 'tokyo-metro:marunouchi', cars: 6, sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: 'Tokyo Metro speaks of 53 six-car trainsets for the line.',
  },
  {
    station_id: 'tokyo-metro:shinjuku-sanchome:M09', line_id: 'tokyo-metro:marunouchi', cars: 6, sourceIds: ['src:tokyometro-marunouchi-2000'],
    note: 'Tokyo Metro speaks of 53 six-car trainsets for the line.',
  },
  {
    station_id: 'toei:shinjuku-sanchome:S02', line_id: 'toei:shinjuku', cars: 10, sourceIds: ['src:tetsudoch-toei-shinjuku-10cars', 'src:toei-shinjuku-sanchome-map'],
    note: 'The Toei Shinjuku Line has been all 10-car since August 2022; the car table under the Toei 立体図 of this station numbers the cars 1 to 10.',
  },
  {
    station_id: 'toei:shinjuku:S01', line_id: 'toei:shinjuku', cars: 10, sourceIds: ['src:tetsudoch-toei-shinjuku-10cars'],
    note: 'The Toei Shinjuku Line has been all 10-car since August 2022.',
  },
  {
    station_id: 'toei:shinjuku-nishiguchi:E01', line_id: 'toei:oedo', cars: 8, sourceIds: ['src:toei-shinjuku-nishiguchi-map', 'src:toei-oedo-12-600'],
    note: 'The のりかえ・出口案内 table under the Toei 立体図 of this station numbers the cars from 1 to 8.',
  },
  {
    station_id: 'toei:shinjuku:E27', line_id: 'toei:oedo', cars: 8, sourceIds: ['src:toei-shinjuku-map'],
    note: 'The のりかえ・出口案内 table under the Toei 立体図 numbers the cars of the Oedo Line from 1 to 8.',
  },
  // representative lengths: the line runs several lengths; the one drawn is named below, and a trip that says otherwise wins
  {
    station_id: 'odakyu:shinjuku', line_id: 'odakyu:odawara', cars: 10, representative: true, sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'The 3000形 comes in 6-, 8- and 10-car sets (6 + 4 and similar couplings run too). 10 cars are drawn as the representative length.',
  },
  {
    station_id: 'keio:shinjuku', line_id: 'keio:keio', cars: 10, representative: true, sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'Of the 28 sets of the 9000系, 20 are 10-car and 8 are 8-car. 10 cars are drawn as the representative length.',
  },
  {
    station_id: 'keio:shinjuku-newline', line_id: 'keio:keio-new', cars: 10, representative: true, sourceIds: ['src:wikipedia-ja-train-pages', 'src:tetsudoch-toei-shinjuku-10cars'],
    note: 'The 10-car 9000系 sets are the ones that run through to the 都営新宿線, which has been all 10-car since 2022.',
  },
  {
    station_id: 'seibu:seibu-shinjuku', line_id: 'seibu:shinjuku', cars: 8, representative: true, sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'Of the 30 sets of the 30000系, 18 are 8-car, 6 are 10-car and 6 are 2-car (run coupled). 8 cars are drawn as the most common set; 10-car trains run as well.',
  },
  {
    station_id: 'tokyo-metro:shinjuku-sanchome:F13', line_id: 'tokyo-metro:fukutoshin', cars: 10, representative: true, sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'The 10000系 is a 10-car train; some sets can be shortened to 8 cars, and 8-car trains run local services.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:shonan-shinjuku', cars: 10, representative: true, sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'The E231系1000番台 runs as a 10-car set, with a 5-car set added for 15 cars (summary of the page). 10 cars are drawn.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:chuo-limited-express', cars: 9, representative: true, sourceIds: ['src:wikipedia-ja-train-pages', 'src:trafficnews-e353-azusa-kaiji'],
    note: 'The E353系 is a 9-car basic set with a 3-car set added for 12 cars. 9 cars are drawn.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:narita-express', cars: 6, representative: true, sourceIds: ['src:wikipedia-ja-train-pages'],
    note: 'The E259系 is a 6-car set; two sets run coupled as 12 cars. 6 cars are drawn.',
  },
  {
    station_id: 'jr-east:shinjuku', line_id: 'jr-east:tobu-through-limited-express', cars: 6, sourceIds: ['src:wikipedia-ja-nikko-train'],
    note: 'Both trains of the through service (東武100系 and JR 253系1000番台) are 6-car sets. Which type runs a given trip is not established, so the generic train is drawn.',
  },
];

export interface ResolvedVehicle {
  spec: VehicleSpec;
  status: VehicleAssignmentStatus;
  /** How the vehicle was chosen. */
  basis: 'trip' | 'trip-series-not-in-library' | 'service-rule' | 'line-rule' | 'none';
  /** Series text to show: the trip's own, else the library's, else null. */
  seriesLabel: string | null;
  cars: number | null;
  carsBasis: 'trip' | 'line-fact' | null;
  sourceIds: string[];
  note: string;
}

export function resolveVehicle(
  r: Pick<TimetableRecord, 'station_id' | 'operator_id' | 'line_id' | 'vehicle_series' | 'formation_length' | 'vehicle_assignment_status' | 'source_id'> &
    Partial<Pick<TimetableRecord, 'service_class' | 'remarks'>>,
): ResolvedVehicle {
  const lineId = lineEntry(r.line_id)?.line_id ?? r.line_id;
  const fact = FORMATION_FACTS.find((f) => f.station_id === r.station_id && f.line_id === lineId) ?? null;
  const cars = r.formation_length ?? fact?.cars ?? null;
  const carsBasis = r.formation_length != null ? 'trip' : fact ? 'line-fact' : null;
  const carSources = r.formation_length != null ? [] : (fact?.sourceIds ?? []);

  if (r.vehicle_series && r.vehicle_assignment_status !== 'unknown') {
    const spec = vehicleBySeries(r.vehicle_series, r.operator_id);
    if (spec) {
      return { spec, status: r.vehicle_assignment_status, basis: 'trip', seriesLabel: r.vehicle_series, cars, carsBasis, sourceIds: [r.source_id, ...spec.sourceIds, ...carSources], note: spec.note };
    }
    return {
      spec: GENERIC_VEHICLE, status: r.vehicle_assignment_status, basis: 'trip-series-not-in-library', seriesLabel: r.vehicle_series, cars, carsBasis,
      sourceIds: [r.source_id, ...carSources], note: 'The timetable names this type, but the library has no model of it yet; the generic train is drawn.',
    };
  }

  const text = `${r.service_class ?? ''} ${r.remarks ?? ''}`;
  const service = SERVICE_VEHICLE_RULES.find((x) => x.line_id === lineId && x.match.test(text) && !(x.unless && x.unless.test(text)));
  const serviceSpec = service ? VEHICLES.find((v) => v.id === service.vehicleId) : null;
  if (service && serviceSpec) {
    const svcCars = r.formation_length ?? service.cars ?? cars;
    const svcBasis = r.formation_length != null ? 'trip' : service.cars != null ? 'line-fact' : carsBasis;
    return { spec: serviceSpec, status: service.status, basis: 'service-rule', seriesLabel: serviceSpec.series, cars: svcCars, carsBasis: svcBasis, sourceIds: [...service.sourceIds, ...(service.cars != null ? [] : carSources)], note: service.note };
  }

  const rule = LINE_VEHICLE_RULES.find((x) => x.line_id === lineId);
  const spec = rule ? VEHICLES.find((v) => v.id === rule.vehicleId) : null;
  if (rule && spec) {
    return { spec, status: rule.status, basis: 'line-rule', seriesLabel: spec.series, cars, carsBasis, sourceIds: [...rule.sourceIds, ...carSources], note: rule.note };
  }
  return { spec: GENERIC_VEHICLE, status: 'unknown', basis: 'none', seriesLabel: null, cars, carsBasis, sourceIds: [...GENERIC_VEHICLE.sourceIds, ...carSources], note: GENERIC_VEHICLE.note };
}
