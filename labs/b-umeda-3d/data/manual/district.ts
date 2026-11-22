import type { Level, Manager, Place, Point } from '../../src/domain/types.ts'
import type * as Authoring from './model.ts'

type Writer = Pick<
  typeof Authoring,
  'model' | 'entity' | 'place' | 'level' | 'link'
>
type Boundary = {
  street: Place
  upper: Place
  ground: Level
  lower: Level
  conc: Level
  subway: string
  jr: string
}

// Coordinates are independent editorial footprints. Transfer segments follow city route letters A–G.
export function addDistrict(
  { model, entity, level, place, link }: Writer,
  base: Boundary,
) {
  const abc = ['city-b'],
    def = ['district-def'],
    g = ['district-ghi']
  const hk = ['hankyu-current', 'hankyu'],
    hs = ['hanshin-map', 'hanshin']
  const east = ['higashi', 'higashi-map', 'district-south'],
    west = ['nishi', 'district-south'],
    kita = ['kitashinchi', 'district-south']
  const whity = ['whity-floor', 'whity-city', 'district-def', 'whity-district']
  function operator(slug: string, ja: string, en: string, refs: string[]) {
    const v = {
      ...entity('operator', slug, ja, en, refs),
      kind: 'Operator' as const,
    }
    model.operators.push(v)
    return v.id
  }
  function station(
    slug: string,
    ja: string,
    en: string,
    operatorId: string,
    services: string[][],
    refs: string[],
  ) {
    const lineIds = services.map(([code, j, e]) => {
      const service = { ...entity('line', code, j, e, refs), operatorId }
      model.lines.push(service)
      return service.id
    })
    const value = {
      ...entity('station', slug, ja, en, refs),
      operatorId,
      lineIds,
    }
    model.stations.push(value)
    model.complex.stationIds.push(value.id)
    return value
  }
  function site(
    slug: string,
    ja: string,
    en: string,
    anchor: Place,
    refs: string[],
  ) {
    model.context.push({
      ...entity('context', slug, ja, en, refs),
      kind: anchor.stationId ? 'Station' : 'ShoppingArcade',
      stationId: anchor.stationId,
      anchorId: anchor.id,
    })
  }
  const out = (
    id: string,
    ja: string,
    en: string,
    l: Level,
    p: Point,
    size: Point,
    refs: string[],
    manager: Manager = 'unknown',
  ) => place('Concourse', id, ja, en, l, p, size, 'unpaid', manager, refs)
  const inside = (
    id: string,
    ja: string,
    en: string,
    l: Level,
    p: Point,
    size: Point,
    refs: string[],
  ) => place('Concourse', id, ja, en, l, p, size, 'paid', null, refs)
  function walk(
    a: Place,
    b: Place,
    refs: string[],
    accessible: boolean | null = null,
  ) {
    return link(
      'Passage',
      b.id.split(':')[2] + '-via-' + a.id.split(':')[2],
      a,
      b,
      '通路 → ' + b.names.ja,
      'Walk to ' + b.names.en,
      refs,
      { stepFree: accessible },
    )
  }
  function gate(
    id: string,
    a: Place,
    b: Place,
    ja: string,
    en: string,
    refs: string[],
  ) {
    link('Gate', id, a, b, ja, en, refs, { stepFree: true })
  }
  function elevator(
    id: string,
    a: Place,
    b: Place,
    ja: string,
    en: string,
    refs: string[],
  ) {
    link('Elevator', id, a, b, ja, en, refs, {
      declaredSpan: [a.levelId, b.levelId],
    })
  }
  function platform(
    id: string,
    label: string,
    name: string,
    en: string,
    l: Level,
    p: Point,
    size: Point,
    refs: string[],
    line: string,
    sides: (-1 | 1)[],
    end?: -1 | 1,
  ) {
    const n = place('Platform', id, name, en, l, p, size, 'paid', null, refs)
    n.serviceLineIds = [line]
    n.boarding = { label, trackSides: sides, terminalEnd: end }
    return n
  }
  // Walk a terminal's head concourse, then turn along the boarding face. The path never cuts diagonally across tracks.
  function finger(hall: Place, p: Place, at: Point, l: Level, refs: string[]) {
    const head = place(
      'Landing',
      p.id.split(':')[2] + '-head',
      'ホーム端',
      'Platform head',
      l,
      at,
      [1, 1],
      'paid',
      null,
      refs,
    )
    walk(hall, head, refs)
    walk(head, p, refs)
  }
  const hankyu = station(
    'hankyu-osaka-umeda',
    '大阪梅田（阪急）',
    'Hankyu Osaka-umeda',
    operator('hankyu', '阪急電鉄', 'Hankyu Railway', hk),
    [
      ['hk-kyoto', '京都線', 'Kyoto Line'],
      ['hk-takarazuka', '宝塚線', 'Takarazuka Line'],
      ['hk-kobe', '神戸線', 'Kobe Line'],
    ],
    hk,
  )
  const hk3 = level('hk-3f', '3F', 2, hankyu.id, hk),
    hk2 = level('hk-2f', '2F', 1, hankyu.id, hk)
  const crossing = out(
    'hankyu-crossing',
    '阪急方面 横断歩道',
    'Crosswalk toward Hankyu',
    base.ground,
    [32, -10],
    [3, 2],
    abc,
  )
  const front = out(
    'hankyu-front',
    '阪急百貨店付近通路',
    'Passage by Hankyu department store',
    base.ground,
    [45, -10],
    [8, 3],
    abc,
  )
  const liftFoot = out(
    'hankyu-lift-ground',
    '阪急側 地上 EV④',
    'Hankyu surface lift ④',
    base.ground,
    [49, -12],
    [3, 3],
    abc,
  )
  const hkOut = out(
    'hk-gate-out',
    '3階改札口 改札外',
    'Third-floor gate · outside',
    hk3,
    [49, -12],
    [27, 4],
    hk,
    'railway',
  )
  const hkIn = inside(
    'hk-headhall',
    '3階改札口 改札内',
    'Hankyu terminal concourse',
    hk3,
    [49, -16],
    [29, 4],
    hk,
  )
  walk(base.street, crossing, abc, true)
  walk(crossing, front, abc, true)
  walk(front, liftFoot, abc, true)
  elevator(
    'hk-04',
    liftFoot,
    hkOut,
    '3階改札方面 EV④',
    'Lift ④ to third-floor gate',
    abc,
  )
  gate('hk-3f', hkOut, hkIn, '阪急 3階改札口', 'Hankyu third-floor gate', hk)
  const hkPlatforms: Place[] = []
  for (let i = 0; i < 9; i++) {
    const x = 61.4 - i * 3.1,
      num = String(i + 1)
    const p = platform(
      'hk-' + num,
      num,
      '阪急 ' + num + '号線',
      'Hankyu track ' + num,
      hk3,
      [x, -33],
      [1.9, 31],
      hk,
      hankyu.lineIds[Math.floor(i / 3)],
      [-1],
      1,
    )
    hkPlatforms.push(p)
    finger(hkIn, p, [x, -16], hk3, hk)
  }
  const outer = inside(
    'hk-outer',
    '9号線外側 ホーム端',
    'Outer platform edge at track 9',
    hk3,
    [33.5, -33],
    [1.9, 31],
    hk,
  )
  hkIn.size = [32, 4]
  hkIn.point = [47.45, -16]
  finger(hkIn, outer, [33.5, -16], hk3, hk)
  const hk2out = out(
    'hk-central-out',
    '2階中央改札口 改札外',
    'Second-floor central gate · outside',
    hk2,
    [49, -26],
    [24, 3],
    hk,
    'railway',
  )
  const hk2in = inside(
    'hk-central-in',
    '2階中央改札口 改札内',
    'Second-floor central gate hall',
    hk2,
    [49, -30],
    [27, 4],
    hk,
  )
  gate(
    'hk-2f',
    hk2out,
    hk2in,
    '阪急 2階中央改札口',
    'Hankyu second-floor central gate',
    hk,
  )
  const hkBottom = place(
    'Landing',
    'hk-central-lift',
    '1号線方面 EV',
    'Lift to track 1',
    hk2,
    [61.4, -33],
    [1, 1],
    'paid',
    null,
    hk,
  )
  walk(hk2in, hkBottom, ['hankyu-current', 'hankyu-lift'], true)
  elevator(
    'hk-track-one',
    hkBottom,
    hkPlatforms[0],
    '1号線エレベーター',
    'Lift to track 1',
    ['hankyu-current', 'hankyu-lift'],
  )
  site('hankyu', '阪急 大阪梅田', 'Hankyu Osaka-umeda', hkIn, hk)

  // C branches on the surface after lift ⑥; it does not join the paid Midosuji hall.
  const cFoot = out(
    'city-eight-ground',
    '南改札方面 地上 EV⑧',
    'Surface lift ⑧',
    base.ground,
    [34, 19],
    [3, 3],
    abc,
  )
  const south = out(
    'metro-south-out',
    '御堂筋線 南改札前',
    'Midosuji south gate exterior',
    base.conc,
    [34, 19],
    [5, 5],
    abc,
  )
  walk(base.upper, cFoot, abc, true)
  elevator(
    'city-eight',
    cFoot,
    south,
    '南改札前へ EV⑧',
    'Lift ⑧ to south gate exterior',
    abc,
  )

  const hanshin = station(
    'hanshin-osaka-umeda',
    '大阪梅田（阪神）',
    'Hanshin Osaka-Umeda',
    operator('hanshin', '阪神電気鉄道', 'Hanshin Electric Railway', hs),
    [['hs-main', '阪神本線', 'Hanshin Main Line']],
    hs,
  )
  const hsB2 = level('hs-b2', 'B2F', -2, hanshin.id, hs),
    hsB1 = level('hs-b1', 'B1F', -1, hanshin.id, hs)
  const hsUpper = out(
    'hs-east-lift',
    '東口方面 EV⑫',
    'Lift ⑫ to Hanshin',
    base.lower,
    [23, 31],
    [3, 3],
    def,
  )
  const hsOut = out(
    'hs-east-out',
    '東口 改札外',
    'Hanshin east gate · outside',
    hsB2,
    [23, 31],
    [4, 8],
    hs,
    'railway',
  )
  const hsIn = inside(
    'hs-east-in',
    '東口 改札内',
    'Hanshin terminal concourse',
    hsB2,
    [19, 31],
    [4, 12],
    hs,
  )
  walk(south, hsUpper, def, true)
  elevator(
    'city-twelve',
    hsUpper,
    hsOut,
    '東口へ EV⑫',
    'Lift ⑫ to Hanshin east gate',
    def,
  )
  gate('hs-east', hsOut, hsIn, '阪神 東口', 'Hanshin east gate', hs)
  const hsPairs: Place[] = []
  for (const [i, num] of ['1・2', '3・4'].entries()) {
    const z = 28 + i * 6
    const p = platform(
      'hs-' + (i ? '3-4' : '1-2'),
      num,
      '阪神 ' + num + '番のりば',
      'Hanshin platforms ' + num,
      hsB2,
      [2, z],
      [30, 2.9],
      hs,
      hanshin.lineIds[0],
      [-1, 1],
      1,
    )
    hsPairs.push(p)
    finger(hsIn, p, [19, z], hsB2, hs)
  }
  const hsWest = out(
    'hs-west-out',
    '西口 改札外',
    'Hanshin west gate · outside',
    hsB1,
    [-10, 29],
    [4, 6],
    hs,
    'railway',
  )
  const hsWestIn = inside(
    'hs-west-in',
    '西口・百貨店口 改札内',
    'Hanshin west concourse',
    hsB1,
    [-5, 31],
    [6, 9],
    hs,
  )
  gate('hs-west', hsWest, hsWestIn, '阪神 西口', 'Hanshin west gate', hs)
  for (const [i, p] of hsPairs.entries()) {
    const [x, z] = [-5, p.point[1]]
    const up = place(
      'Landing',
      'hs-ev-up-' + i,
      '西側 EV',
      'West concourse lift',
      hsB1,
      [x, z],
      [1, 1],
      'paid',
      null,
      hs,
    )
    const down = place(
      'Landing',
      'hs-ev-down-' + i,
      'ホーム EV',
      'Platform lift',
      hsB2,
      [x, z],
      [1, 1],
      'paid',
      null,
      hs,
    )
    walk(hsWestIn, up, hs, true)
    elevator(
      'hs-west-' + i,
      up,
      down,
      'ホームエレベーター',
      'Platform lift',
      hs,
    )
    walk(down, p, hs, true)
  }
  site('hanshin', '阪神 大阪梅田', 'Hanshin Osaka-Umeda', hsIn, hs)

  const mall = out(
    'whity-main',
    'ホワイティうめだ',
    'Whity Umeda',
    base.lower,
    [48, 23],
    [9, 4.1],
    whity,
    'commercial',
  )
  const plaza = out(
    'whity-izumi',
    '泉の広場',
    'Izumi-no-Hiroba',
    base.lower,
    [70, 23],
    [8, 7],
    ['whity-plaza', ...whity],
    'commercial',
  )
  walk(south, mall, def, true)
  const eastMall = out(
    'whity-east',
    'イーストモール',
    'East Mall',
    base.lower,
    [59.5, 23],
    [14, 4.1],
    whity,
    'commercial',
  )
  const northMall = out(
    'whity-north',
    'ノースモール方面',
    'North Mall passage',
    base.lower,
    [48, 14.7],
    [3.8, 12.5],
    whity,
    'commercial',
  )
  const beyond = out(
    'whity-nomoka',
    'NOMOKA方面',
    'Passage toward NOMOKA',
    base.lower,
    [70, 15.9],
    [3.6, 7.2],
    whity,
    'commercial',
  )
  walk(mall, northMall, whity)
  walk(mall, eastMall, whity)
  walk(eastMall, plaza, whity)
  walk(plaza, beyond, whity)
  site('whity', 'ホワイティうめだ', 'Whity Umeda', mall, whity)
  const higashi = station(
    'metro-higashiumeda',
    '東梅田',
    'Higashi-Umeda',
    base.subway,
    [['tanimachi', '谷町線', 'Tanimachi Line']],
    east,
  )
  const east1 = level('higashi-b1', 'B1F', -1, higashi.id, east),
    east2 = level('higashi-b2', 'B2F', -2, higashi.id, east)
  for (const [i, side] of ['中西', '南'].entries()) {
    const x = 47 + 5 * i,
      z = i ? 46 : 37,
      num = i ? '1' : '2'
    const outside = out(
      'higashi-out-' + num,
      side + '改札前',
      'Higashi-Umeda ' + (i ? 'south' : 'central west') + ' exterior',
      east1,
      [x, z - 4],
      [4, 4],
      east,
      'railway',
    )
    const hall = inside(
      'higashi-in-' + num,
      side + '改札内',
      'Higashi-Umeda ' + (i ? 'south' : 'central west') + ' hall',
      east1,
      [x, z],
      [3.4, 4],
      east,
    )
    walk(mall, outside, def, true)
    gate(
      'higashi-' + num,
      outside,
      hall,
      side + '改札',
      'Higashi-Umeda ' + (i ? 'south' : 'central west') + ' gate',
      east,
    )
    const p = platform(
      'higashi-' + num,
      num,
      '東梅田 ' + num + '番線',
      'Higashi-Umeda platform ' + num,
      east2,
      [x, 41],
      [2.9, 22],
      east,
      higashi.lineIds[0],
      [i ? -1 : 1],
    )
    const stop = place(
      'Landing',
      'higashi-stop-' + num,
      'ホーム EV',
      'Platform lift',
      east2,
      [x, z],
      [1, 1],
      'paid',
      null,
      east,
    )
    elevator(
      'higashi-' + num,
      hall,
      stop,
      'ホームエレベーター',
      'Platform lift',
      east,
    )
    walk(stop, p, east, true)
    if (!i) site('higashi', '東梅田', 'Higashi-Umeda', p, east)
  }
  const diamor = out(
    'diamor',
    'ディアモール大阪 経由',
    'Via Diamor Osaka',
    base.lower,
    [18, 48],
    [4, 9],
    def,
    'commercial',
  )
  walk(south, diamor, def, true)
  const kitaStation = station(
    'jr-kitashinchi',
    '北新地',
    'Kitashinchi',
    base.jr,
    [['jr-tozai', 'JR東西線', 'JR Tozai Line']],
    kita,
  )
  const nishi = station(
    'metro-nishiumeda',
    '西梅田',
    'Nishi-Umeda',
    base.subway,
    [['yotsubashi', '四つ橋線', 'Yotsubashi Line']],
    west,
  )
  let kitaWest: Place | undefined
  for (const isKita of [true, false]) {
    const slug = isKita ? 'kita' : 'nishi',
      refs = isKita ? kita : west
    const st = isKita ? kitaStation : nishi
    const l1 = level(slug + '-b1', 'B1F', -1, st.id, refs),
      l2 = level(slug + '-b2', 'B2F', -2, st.id, refs)
    const pt: Point = isKita ? [-7, 62] : [-18, 54]
    const nm = isKita ? '西改札口' : '南改札',
      eng = isKita ? 'Kitashinchi west gate' : 'Nishi-Umeda south gate'
    const outside = out(
      slug + '-exterior',
      nm + '前',
      eng + ' · outside',
      l1,
      pt,
      [4, 4],
      refs,
      'railway',
    )
    const x = pt[0],
      z = pt[1],
      hp: Point = isKita ? [x + 4, z] : [x, z - 4]
    const hall = inside(
      slug + '-hall',
      nm + '内',
      eng + ' · inside',
      l1,
      hp,
      isKita ? [8, 3.5] : [3.5, 7],
      refs,
    )
    gate(slug + '-gate', outside, hall, nm, eng, refs)
    const p = platform(
      slug + '-1-2',
      '1・2',
      st.names.ja + ' 1・2番線',
      st.names.en + ' platforms 1 / 2',
      l2,
      isKita ? [6, z] : [x, 44],
      isKita ? [29, 3.6] : [3.6, 24],
      refs,
      st.lineIds[0],
      [-1, 1],
    )
    const stop = place(
      'Landing',
      slug + '-platform-ev',
      'ホーム EV',
      'Platform lift',
      l2,
      hp,
      [1, 1],
      'paid',
      null,
      refs,
    )
    elevator(
      slug + '-platform',
      hall,
      stop,
      'ホームエレベーター',
      'Platform lift',
      refs,
    )
    walk(stop, p, refs, true)
    if (isKita) {
      walk(diamor, outside, def, true)
      kitaWest = outside
    } else walk(kitaWest!, outside, g, true)
    site(isKita ? 'kitashinchi' : 'nishi', st.names.ja, st.names.en, p, refs)
  }
  model.complex.provenance.sourceIds.push(
    'sk:source:district-def',
    'sk:source:district-ghi',
  )
}
