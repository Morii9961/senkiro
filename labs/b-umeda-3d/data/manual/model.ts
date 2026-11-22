import type {
  Entity,
  Level,
  Link,
  Manager,
  Model,
  Place,
  Point,
} from '../../src/domain/types.ts'
import { addDistrict } from './district.ts'
import { checked } from './sources.ts'

// Editorial coordinates in arbitrary units. Only adjacency, order and fare boundaries encode railway facts.
export function entity(
  kind: string,
  slug: string,
  ja: string,
  en: string,
  refs = ['jr-map'],
): Entity {
  return {
    id: 'sk:' + kind + ':' + slug,
    names: { ja, en, ja_kana: null, zh: null },
    externalIds: {},
    provenance: {
      sourceIds: refs.map((key) => 'sk:source:' + key),
      dataNature: 'manual-verified',
      lastVerifiedAt: refs.some(
        (id) => id === 'whity-district' || id === 'whity-plaza',
      )
        ? '2026-11-22'
        : checked,
    },
    geometry_confidence: 'schematic',
    validFrom: null,
    validTo: null,
  }
}
const jr = {
  ...entity('operator', 'jr-west', 'JR西日本', 'JR West'),
  kind: 'Operator' as const,
}
export const osaka = {
  ...entity('station', 'jr-osaka', '大阪', 'Osaka'),
  operatorId: jr.id,
  lineIds: [] as string[],
}
export const model: Model = {
  operators: [jr],
  stations: [osaka],
  lines: [],
  levels: [],
  places: [],
  links: [],
  context: [],
  complex: {
    ...entity('complex', 'osaka-umeda', '大阪・梅田', 'Osaka / Umeda', [
      'city-b',
      'district-def',
      'district-ghi',
    ]),
    stationIds: [osaka.id],
  },
  interchange: null,
}
export function level(
  slug: string,
  label: string,
  ordinal: number,
  stationId: string | null,
  refs = ['jr-map'],
) {
  const value: Level = {
    ...entity('level', slug, label, label, refs),
    label,
    ordinal,
    stationId,
  }
  model.levels.push(value)
  return value
}
export function place(
  kind: Place['kind'],
  slug: string,
  ja: string,
  en: string,
  floor: Level,
  point: Point,
  size: Point,
  zone: Place['zone'] = 'paid',
  manager: Manager | null = null,
  refs = ['jr-map'],
) {
  const value: Place = {
    ...entity(kind.toLowerCase(), slug, ja, en, refs),
    kind,
    levelId: floor.id,
    stationId: floor.stationId,
    point,
    size,
    zone,
    manager,
  }
  model.places.push(value)
  return value
}
export function link(
  kind: Link['kind'],
  slug: string,
  from: Place,
  to: Place,
  ja: string,
  en: string,
  refs = ['jr-map'],
  options: Partial<Pick<Link, 'stepFree' | 'declaredSpan' | 'direction'>> = {},
) {
  const value: Link = {
    ...entity(kind.toLowerCase(), slug, ja, en, refs),
    kind,
    from: from.id,
    to: to.id,
    declaredSpan: null,
    stepFree:
      kind === 'Stairs' || kind === 'Escalator'
        ? false
        : kind === 'Elevator'
          ? true
          : null,
    direction: kind === 'Escalator' ? 'unknown' : 'both',
    connection: 'verified',
    ...options,
  }
  model.links.push(value)
  return value
}
export const jr1 = level('jr-1f', '1F', 0, osaka.id),
  jr2 = level('jr-2f', '2F', 1, osaka.id)
export const west = place(
  'Concourse',
  'jr-west-inside',
  '西口 改札内',
  'West gate hall',
  jr1,
  [-20, 0],
  [7, 29],
)
export const westOutside = place(
  'Concourse',
  'jr-west-outside',
  '西口 改札外',
  'West gate exterior',
  jr1,
  [-26, 0],
  [5, 9],
  'unpaid',
  'railway',
)
link('Gate', 'jr-west', west, westOutside, '西口', 'West gate')
export const platforms: Place[] = []
export function addPlatform(pair: string, z: number, westLift: string) {
  const island = place(
    'Platform',
    'jr-' + pair,
    '大阪 ' + pair.replace('-', '・') + '番のりば',
    'Osaka platforms ' + pair.replace('-', ' / '),
    jr2,
    [0, z],
    [49, 2.8],
  )
  const landing = place(
    'Landing',
    'jr-west-' + westLift.toLowerCase(),
    '西口側 乗降場',
    'West lift landing',
    jr1,
    [-20, z],
    [1, 1],
  )
  const top = place(
    'Landing',
    'jr-upper-' + westLift.toLowerCase(),
    'ホーム側 乗降場',
    'Platform lift landing',
    jr2,
    [-20, z],
    [1, 1],
  )
  link(
    'Passage',
    'west-' + pair,
    west,
    landing,
    '西口 改札内通路',
    'West paid passage',
  )
  link(
    'Elevator',
    'west-' + pair,
    landing,
    top,
    'エレベーター ' + westLift,
    'Lift ' + westLift,
    ['jr-map'],
    { declaredSpan: [jr1.id, jr2.id] },
  )
  link(
    'Passage',
    'platform-' + pair,
    top,
    island,
    'ホーム通路',
    'Platform passage',
  )
  platforms.push(island)
  return island
}
export const firstPlatform = addPlatform('3-4', 7.5, 'W')

osaka.provenance.sourceIds.push('sk:source:osaka-roof')
const jr3 = level('jr-3f', '3F', 2, osaka.id)
const mezz = level('jr-mezz', '中2F', 0.5, osaka.id)
const jrB1 = level('jr-b1', 'B1F', -1, osaka.id),
  jrB2 = level('jr-b2', 'B2F', -2, osaka.id)
const bridge = place(
  'Concourse',
  'jr-bridge',
  '連絡橋口 改札内',
  'Bridge gate hall',
  jr3,
  [1, 0],
  [4.4, 29],
)
const bridgeOut = place(
  'Concourse',
  'jr-bridge-out',
  '南北連絡橋',
  'North–south bridge',
  jr3,
  [-3.6, 0],
  [3.2, 30],
  'unpaid',
  'unknown',
)
link('Gate', 'jr-bridge', bridge, bridgeOut, '連絡橋口', 'Bridge gate')
const east = place(
  'Concourse',
  'jr-midosuji-in',
  '御堂筋口 改札内',
  'Midosuji gate · inside',
  jr1,
  [16, 0],
  [6, 29],
)
const street = place(
  'Concourse',
  'jr-midosuji-out',
  '御堂筋コンコース',
  'Midosuji concourse',
  jr1,
  [22, 0],
  [5, 26],
  'unpaid',
  'railway',
)
link(
  'Gate',
  'jr-midosuji',
  east,
  street,
  '御堂筋口を通る',
  'Cross Midosuji gate',
  ['jr-map', 'city-b'],
  { stepFree: true },
)
const entrance = place(
  'Entrance',
  'midosuji-south',
  '御堂筋南口',
  'Midosuji South entrance',
  jr1,
  [22, 15],
  [4, 3],
  'unpaid',
  'railway',
)
link(
  'Passage',
  'south-entry',
  street,
  entrance,
  '御堂筋南口への通路',
  'South entrance passage',
)
const loop = addPlatform('1-2', 12.5, 'V')
const p56 = addPlatform('5-6', 2.5, 'X'),
  p78 = addPlatform('7-8', -2.5, 'Y')
const p910 = addPlatform('9-10', -7.5, 'Z'),
  p11 = addPlatform('11', -12.5, 'AA')
const areas = [loop, firstPlatform, p56, p78, p910, p11]
const bridgeLifts = ['H', 'G', 'F', 'E', 'D', 'C']
const eastLifts = [null, 'O', 'N', 'M', 'L', 'K']
function liftAtPlatform(p: Place, hall: Place, letter: string, floor: Level) {
  const topFloor = jr2,
    x = hall.point[0],
    z = p.point[1],
    slug = letter.toLowerCase()
  const landing = place(
    'Landing',
    'hall-' + slug,
    '乗降場 ' + letter,
    'Lift landing ' + letter,
    floor,
    [x, z],
    [1, 1],
  )
  const atPlatform = place(
    'Landing',
    'island-' + slug,
    'ホーム乗降場 ' + letter,
    'Platform landing ' + letter,
    topFloor,
    [x, z],
    [1, 1],
  )
  link(
    'Passage',
    'hall-' + slug,
    hall,
    landing,
    '改札内通路',
    'Paid concourse passage',
    letter === 'O' ? ['jr-map', 'jr-access'] : ['jr-map'],
    letter === 'O' ? { stepFree: true } : {},
  )
  const stop =
    letter === 'O'
      ? place(
          'Landing',
          'jr-o-mezz',
          '中2階 EV O',
          'Lift O · mezzanine',
          mezz,
          [x, z],
          [1, 1],
        )
      : landing
  if (stop !== landing)
    link('Elevator', 'jr-o-lower', landing, stop, 'エレベーター O', 'Lift O')
  link(
    'Elevator',
    'jr-' + slug,
    stop,
    atPlatform,
    'エレベーター ' + letter,
    'Lift ' + letter,
    ['jr-map'],
    floor === jr1 && stop === landing ? { declaredSpan: [jr1.id, jr2.id] } : {},
  )
  link(
    'Passage',
    'island-' + slug,
    atPlatform,
    p,
    'ホーム通路',
    'Platform passage',
  )
}
areas.forEach((p, i) => {
  liftAtPlatform(p, bridge, bridgeLifts[i], jr3)
  if (eastLifts[i]) liftAtPlatform(p, east, eastLifts[i]!, jr1)
})
// Facility 83 is a stair; 84 is an escalator. No operating direction is assumed.
for (const [kind, n, z] of [
  ['Stairs', '83', 8.1],
  ['Escalator', '84', 6.9],
] as const) {
  const foot = place(
    'Landing',
    'foot-' + n,
    '西口側 ' + n,
    'West landing ' + n,
    jr1,
    [-18, z],
    [1, 1],
  )
  const head = place(
    'Landing',
    'head-' + n,
    'ホーム側 ' + n,
    'Platform landing ' + n,
    jr2,
    [-14, z],
    [1, 1],
  )
  link('Passage', 'foot-' + n, west, foot, '西口側通路', 'West passage')
  link(
    kind,
    'jr-' + n,
    foot,
    head,
    kind === 'Stairs' ? '西口側階段' : '西口側エスカレーター',
    kind === 'Stairs' ? 'West stairs' : 'West escalator',
    ['jr-map'],
    { declaredSpan: [jr1.id, jr2.id] },
  )
  link(
    'Passage',
    'head-' + n,
    head,
    firstPlatform,
    'ホーム通路',
    'Platform passage',
  )
}
// JR sheets 2–4. The three mezzanine corridors have distinct landings.
const centralIn = place(
  'Concourse',
  'jr-central-in',
  '中央口 改札内',
  'Central gate · inside',
  jr1,
  [-5, 0],
  [4, 24],
)
const centralOut = place(
  'Concourse',
  'jr-central-out',
  '中央コンコース',
  'Central concourse',
  jr1,
  [-0.6, 0],
  [4, 29],
  'unpaid',
  'railway',
)
link('Gate', 'jr-central', centralIn, centralOut, '中央口', 'Central gate')
const southExit = place(
  'Entrance',
  'jr-central-south',
  '中央南口',
  'Central South entrance',
  jr1,
  [-0.6, 17],
  [5, 4],
  'unpaid',
  'railway',
)
const northExit = place(
  'Entrance',
  'jr-midosuji-north',
  '御堂筋北口',
  'Midosuji North entrance',
  jr1,
  [22, -16],
  [5, 4],
  'unpaid',
  'railway',
)
link(
  'Passage',
  'central-south',
  centralOut,
  southExit,
  '中央南口への通路',
  'Central South passage',
)
link(
  'Passage',
  'midosuji-north',
  street,
  northExit,
  '御堂筋北口への通路',
  'Midosuji North passage',
)
link(
  'Passage',
  'south-forecourt',
  southExit,
  entrance,
  '南側 改札外通路',
  'Southern exterior passage',
)
const sakuraIn = place(
  'Concourse',
  'jr-sakura-in',
  '桜橋口 改札内',
  'Sakurabashi gate · inside',
  jr1,
  [-13, 10],
  [4, 6],
)
const sakuraOut = place(
  'Concourse',
  'jr-sakura-out',
  '桜橋口 改札外',
  'Sakurabashi gate · outside',
  jr1,
  [-13, 16],
  [4, 4],
  'unpaid',
  'railway',
)
link('Gate', 'jr-sakura', sakuraIn, sakuraOut, '桜橋口', 'Sakurabashi gate')
link(
  'Passage',
  'sakura-south',
  sakuraOut,
  southExit,
  '南側 改札外通路',
  'Southern exterior passage',
)
const centralMezz = place(
  'Concourse',
  'jr-central-mezz',
  '中央口 中2階通路',
  'Central mezzanine passage',
  mezz,
  [-7.2, 0],
  [3, 28],
)
const sakuraMezz = place(
  'Concourse',
  'jr-sakura-mezz',
  '桜橋口 中2階通路',
  'Sakurabashi mezzanine passage',
  mezz,
  [-13, 0],
  [3, 28],
)
const eastMezz = place(
  'Concourse',
  'jr-east-mezz',
  '1・2番のりば連絡通路',
  'Passage to platforms 1 / 2',
  mezz,
  [14, 10],
  [6, 7],
)
const oStop = model.places.find((p) => p.id === 'sk:landing:jr-o-mezz')!
const pStop = place(
  'Landing',
  'jr-p-mezz',
  '中2階 EV P',
  'Lift P · mezzanine',
  mezz,
  [12, 12.5],
  [1, 1],
)
const pUpper = place(
  'Landing',
  'jr-p-upper',
  'ホーム EV P',
  'Lift P · platform',
  jr2,
  [12, 12.5],
  [1, 1],
)
link(
  'Passage',
  'mezz-o',
  oStop,
  eastMezz,
  '中2階 連絡通路',
  'Mezzanine connecting passage',
  ['jr-map'],
  { stepFree: true },
)
link(
  'Passage',
  'mezz-p',
  eastMezz,
  pStop,
  'エレベーター P への通路',
  'Passage to lift P',
  ['jr-map'],
  { stepFree: true },
)
link('Elevator', 'jr-p', pStop, pUpper, 'エレベーター P', 'Lift P')
link(
  'Passage',
  'p-platform',
  pUpper,
  loop,
  'ホーム通路',
  'Platform passage',
  ['jr-map'],
  { stepFree: true },
)
function stairs(
  number: string,
  from: Place,
  to: Place,
  foot: Point,
  head: Point,
) {
  const floorOf = (n: Place) => model.levels.find((l) => l.id === n.levelId)!
  const low = place(
    'Landing',
    'jr-stair-' + number + '-foot',
    '階段下',
    'Stair foot',
    floorOf(from),
    foot,
    [1, 1],
  )
  const high = place(
    'Landing',
    'jr-stair-' + number + '-head',
    '階段上',
    'Stair head',
    floorOf(to),
    head,
    [1, 1],
  )
  link(
    'Passage',
    'jr-stair-' + number + '-approach',
    from,
    low,
    '階段への通路',
    'Approach the stairs',
  )
  link(
    'Stairs',
    'jr-' + number,
    low,
    high,
    '階段（図 ' + number + '）',
    'Stairs (map ' + number + ')',
  )
  link(
    'Passage',
    'jr-stair-' + number + '-arrival',
    high,
    to,
    '階段からの通路',
    'Leave the stairs',
  )
}
stairs('53', centralIn, centralMezz, [-5, 4], [-7.2, 0])
stairs('51', sakuraIn, sakuraMezz, [-13, 12], [-13, 7.5])
for (const [i, number] of ['29', '27', '24', '22', '20', '17'].entries()) {
  const z = areas[i].point[1]
  stairs(number, sakuraMezz, areas[i], [-13, z], [-9, z])
}
for (const [i, number] of ['31', '28', '25', '23', '21'].entries()) {
  const z = areas[i].point[1]
  stairs(number, centralMezz, areas[i], [-7.2, z], [-3.4, z])
}
const uk = place(
  'Concourse',
  'umekita-in',
  'うめきた地下口 改札内',
  'Umekita underground hall',
  jrB1,
  [-34, -14],
  [20, 9],
)
const ukOut = place(
  'Concourse',
  'umekita-out',
  'うめきた地下口 改札外',
  'Umekita gate exterior',
  jrB1,
  [-31, -22],
  [10, 5],
  'unpaid',
  'railway',
)
link(
  'Gate',
  'jr-umekita',
  uk,
  ukOut,
  'うめきた地下口',
  'Umekita underground gate',
)
const ab1 = place(
  'Landing',
  'ab-1f',
  '西口側 EV',
  'West-side lift',
  jr1,
  [-20, -14],
  [1, 1],
)
const ab2 = place(
  'Landing',
  'ab-b2',
  '連絡通路 西口側',
  'Passage · west end',
  jrB2,
  [-20, -14],
  [1, 1],
)
const ac2 = place(
  'Concourse',
  'ac-b2',
  '改札内連絡通路',
  'Paid connecting passage',
  jrB2,
  [-27, -14],
  [8, 3],
)
const ac1 = place(
  'Landing',
  'ac-b1',
  '地下口側 EV',
  'Umekita-side lift',
  jrB1,
  [-27, -14],
  [1, 1],
)
link('Passage', 'west-ab', west, ab1, '西口側通路', 'West hall passage')
link(
  'Elevator',
  'jr-ab',
  ab1,
  ab2,
  '西口側エレベーター AB',
  'West lift AB',
  ['jr-map'],
  { declaredSpan: [jr1.id, jrB2.id] },
)
link(
  'Passage',
  'ab-ac',
  ab2,
  ac2,
  '改札内連絡通路を進む',
  'Follow the paid connecting passage',
)
link(
  'Elevator',
  'jr-ac',
  ac2,
  ac1,
  '地下口側エレベーター AC',
  'Umekita lift AC',
)
link('Passage', 'ac-hall', ac1, uk, 'うめきた改札内通路', 'Umekita paid hall')
for (const [tracks, letter, x] of [
  ['21-22', 'AD', -36],
  ['23-24', 'AE', -43],
] as const) {
  const p = place(
    'Platform',
    'jr-' + tracks,
    'うめきた ' + tracks.replace('-', '・') + '番',
    'Umekita platforms ' + tracks.replace('-', ' / '),
    jrB2,
    [x, -14],
    [3.4, 24],
  )
  const lift = place(
    'Landing',
    'uk-' + letter.toLowerCase(),
    '地下ホーム行 EV ' + letter,
    'Platform lift ' + letter,
    jrB1,
    [x, -14],
    [1, 1],
  )
  link(
    'Passage',
    'uk-' + tracks,
    uk,
    lift,
    '地下ホームへの通路',
    'Passage to underground platforms',
  )
  link(
    'Elevator',
    'jr-' + letter.toLowerCase(),
    lift,
    p,
    'エレベーター ' + letter,
    'Lift ' + letter,
  )
}

// The inter-operator section joins only on the outside of ordinary ticket gates.
const city = ['city-b'],
  metro = ['metro-access', 'metro-map', 'city-metro']
const subway = {
  ...entity('operator', 'osaka-metro', 'Osaka Metro', 'Osaka Metro', metro),
  kind: 'Operator' as const,
}
model.operators.push(subway)
const line = {
  ...entity('line', 'midosuji', '御堂筋線', 'Midosuji Line', metro),
  operatorId: subway.id,
}
model.lines.push(line)
const umeda = {
  ...entity('station', 'metro-umeda', '梅田', 'Umeda', metro),
  externalIds: { stationCode: 'M16' },
  operatorId: subway.id,
  lineIds: [line.id],
}
model.stations.push(umeda)
model.complex.stationIds.push(umeda.id)
model.interchange = {
  ...entity(
    'interchange',
    'osaka-metro-umeda',
    '改札外乗り換え',
    'Out-of-gate interchange',
    city,
  ),
  stationIds: [osaka.id, umeda.id],
  outsideGates: true,
}
const ground = level('outside-1f', '1F', 0, null, city),
  lower = level('outside-b1', 'B1F', -1, null, city)
const conc = level('metro-b1', 'B1F', -1, umeda.id, metro),
  platformFloor = level('metro-b2', 'B2F', -2, umeda.id, metro)
const cross = place(
  'Entrance',
  'surface-crossing',
  'バスターミナル側 横断歩道',
  'Bus terminal crosswalk',
  ground,
  [28, 3],
  [5, 3],
  'unpaid',
  'unknown',
  city,
)
const upper = place(
  'Landing',
  'civic-lift-1f',
  '地上エレベーター',
  'Surface lift landing',
  ground,
  [35, 3],
  [2, 2],
  'unpaid',
  'unknown',
  city,
)
const lowerStop = place(
  'Landing',
  'civic-lift-b1',
  '地下通路',
  'Underground passage',
  lower,
  [35, 3],
  [2, 2],
  'unpaid',
  'unknown',
  city,
)
const metroOut = place(
  'Concourse',
  'metro-gate-out',
  '中北東改札口 改札外',
  'North-central east gate · outside',
  conc,
  [33, 8],
  [7, 5],
  'unpaid',
  'unknown',
  metro,
)
const metroIn = place(
  'Concourse',
  'metro-gate-in',
  '中北東改札口 改札内',
  'North-central east gate · inside',
  conc,
  [26, 8],
  [5, 5],
  'paid',
  null,
  metro,
)
const metroLift = place(
  'Landing',
  'metro-lift-b1',
  'スロープ・ホーム行 EV',
  'Ramp to platform lift',
  conc,
  [26, 14],
  [1, 1],
  'paid',
  null,
  metro,
)
const dest = place(
  'Platform',
  'metro-1',
  '御堂筋線 梅田 1番線',
  'Midosuji Line · Umeda platform 1',
  platformFloor,
  [26, 14],
  [4.6, 24],
  'paid',
  null,
  metro,
)
link(
  'Passage',
  'city-approach',
  street,
  cross,
  '横断歩道へ進む',
  'Approach the bus terminal crossing',
  city,
  { stepFree: true },
)
link(
  'Passage',
  'city-crossing',
  cross,
  upper,
  '横断歩道を渡る',
  'Cross to the surface lift',
  city,
  { stepFree: true },
)
link(
  'Elevator',
  'city-six',
  upper,
  lowerStop,
  '地上から地下１階へ',
  'Take the street lift to B1F',
  city,
)
link(
  'Passage',
  'city-to-metro',
  lowerStop,
  metroOut,
  '中北東改札口へ進む',
  'Follow the passage to the Metro gate',
  city,
  { stepFree: true },
)
link(
  'Gate',
  'metro-northeast',
  metroOut,
  metroIn,
  '中北東改札口を通る',
  'Cross the north-central east gate',
  metro,
  { stepFree: true },
)
link(
  'Passage',
  'metro-ramp',
  metroIn,
  metroLift,
  'スロープを進む',
  'Follow the ramp to the lift',
  metro,
  { stepFree: true },
)
link(
  'Elevator',
  'metro-platform',
  metroLift,
  dest,
  '1番線ホームへ下りる',
  'Descend to platform 1',
  metro,
)
addDistrict(
  { model, entity, level, place, link },
  { street, upper, ground, lower, conc, subway: subway.id, jr: jr.id },
)
// Representative, explicitly non-exhaustive services for the depicted boarding faces.
for (const [slug, ja, en, tracks] of [
  ['loop', '大阪環状線', 'Osaka Loop Line', ['1-2']],
  ['kobe', 'JR神戸線', 'JR Kobe Line', ['3-4', '5-6']],
  ['kyoto', 'JR京都線', 'JR Kyoto Line', ['7-8', '9-10']],
  ['east', 'おおさか東線', 'Osaka Higashi Line', ['21-22', '23-24']],
] as const) {
  const service = {
    ...entity('line', slug, ja, en, ['jr-index']),
    operatorId: jr.id,
  }
  model.lines.push(service)
  osaka.lineIds.push(service.id)
  for (const tracksId of tracks) {
    const platform = model.places.find(
      (p) => p.id === 'sk:platform:jr-' + tracksId,
    )!
    platform.serviceLineIds = [service.id]
    platform.provenance.sourceIds.push('sk:source:jr-index')
  }
}
dest.serviceLineIds = [line.id]

// The red accessible paths on JR sheets 2, 6 and 7 support these specific demo segments.
const accessibleJR = new Set([
  'sk:gate:jr-west',
  'sk:passage:west-3-4',
  'sk:passage:platform-3-4',
  'sk:passage:west-ab',
  'sk:passage:ab-ac',
  'sk:passage:ac-hall',
  'sk:passage:uk-21-22',
  'sk:passage:uk-23-24',
])
for (const edge of model.links.filter((e) => accessibleJR.has(e.id))) {
  edge.stepFree = true
  edge.provenance.sourceIds.push('sk:source:jr-access')
}
