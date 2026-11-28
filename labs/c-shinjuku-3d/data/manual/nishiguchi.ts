/**
 * 新宿西口 — Toei Oedo Line (E01). A different station from the Oedo Line's
 * 新宿 (E27): the two are consecutive stops only by way of 都庁前, and they
 * are separate station entities here.
 *
 * Read on 2026-11-14 by the same AI coding agent as the other files, from the
 * 新宿西口駅構内立体図 that Toei publishes (see sources.ts). Only names,
 * floors, fare-zone boundaries, platform numbers and what connects to what
 * were written down; every coordinate is invented; nobody has re-checked the
 * entries. The drawing is an oblique view without dimensions; what could not
 * be told apart on it is said so in the notes.
 */
import type { Area, Entrance, FareZone, Gate, Level, Passage, Station, VerticalFacility } from '../../src/domain/types';
import { EXT_IDS, level, pair, platform, station } from './extensions';
import { D2, TOEI, a, concourse, entrance, gate, link, names, passageArea, prov, pt, rect, svc, vertical, type Common } from './shinjuku';

const p2 = (ids: string[], note?: string) => prov(ids, note, D2);

const S_NG = 'src:toei-shinjuku-nishiguchi-map';
const S_METRO_SJ = 'src:tokyo-metro-shinjuku-map';
const ST_NG = 'sk:station:toei-shinjuku-nishiguchi';
const PAID_TOEI: FareZone = 'paid:toei';
const L_OEDO = 'sk:line:toei-oedo';

const common: Common = { stationId: ST_NG, asOf: '2026-11', geometryConfidence: 'schematic' };
const ngProv = p2([S_NG]);

const UNNAMED_GATE = 'The gate line is drawn on the 立体図 without a name; the label is descriptive.';
const OBLIQUE = 'The 立体図 is an oblique view; the position is schematic.';
const TABLE = 'the のりかえ・出口案内 table under the Toei 立体図';
const TIME_LIMITED = 'Exits marked * on the drawing have restricted hours.';

export const NG = {
  lB1: 'sk:level:toei-shinjuku-nishiguchi-b1f',
  lB3: 'sk:level:toei-shinjuku-nishiguchi-b3f',
  lB4: 'sk:level:toei-shinjuku-nishiguchi-b4f',
  b1: 'sk:area:nishiguchi-b1f-passage',
  outSouth: 'sk:area:nishiguchi-b3f-unpaid-south',
  paid: 'sk:area:nishiguchi-b3f-paid',
  outNorth: 'sk:area:nishiguchi-b3f-unpaid-north',
  pf: 'sk:platform:toei-shinjuku-nishiguchi-1-2',
} as const;

const levels: Level[] = [
  level(NG.lB1, TOEI, 'B1F', -1, -4, ngProv, common, 'The passage with exits D2–D4. Drawn level with the B1F passage of 丸ノ内線 新宿駅, which it runs into; relative heights are not from a source.'),
  level(NG.lB3, TOEI, 'B3F', -3, -11, ngProv, common, 'The Oedo Line concourse.'),
  level(NG.lB4, TOEI, 'B4F', -4, -14, ngProv, common, 'The Oedo Line platform.'),
];

const areas: Area[] = [
  passageArea(NG.b1, NG.lB1, 'unpaid', names('新宿西口駅 改札外通路（B1F）', 'Shinjuku-nishiguchi: passage outside the gates (B1F)', '新宿西口站 检票口外通道（B1F）'),
    [rect(-60, -27, 24.2, 26.6)], pt(-44, 25.4), p2([S_NG, S_METRO_SJ]), common,
    `Unnamed on the drawing; the label is descriptive. The floor printed "B1F" above the Oedo Line station, with exits D2, D3 and D4; at one end it runs into the B1F passage of the Marunouchi Line beside exits B14 and B15. ${OBLIQUE}`),
  concourse(NG.outSouth, NG.lB3, 'unpaid', names('新宿西口駅 改札外（都庁前方面側・B3F）', 'Shinjuku-nishiguchi: outside the gates at the Tochomae end (B3F)', '新宿西口站 检票口外（都厅前方向侧，B3F）'),
    [rect(-37.4, -34, 21.4, 23.6), rect(-37.4, -35.4, 23.6, 25.4)], pt(-35.7, 22.5), ngProv, common,
    'Descriptive label. Ticket machines are drawn here; the flight marked D1 and a lift come down to it from B1F.'),
  concourse(NG.paid, NG.lB3, PAID_TOEI, names('新宿西口駅 改札内コンコース（B3F）', 'Shinjuku-nishiguchi: concourse inside the gates (B3F)', '新宿西口站 站厅（付费区，B3F）'),
    [rect(-57.5, -38, 21.4, 23.6)], pt(-47.8, 22.5), ngProv, common, 'Descriptive label. Drawn as one paid floor above the platform between the two gate lines, with the toilets on it.'),
  concourse(NG.outNorth, NG.lB3, 'unpaid', names('新宿西口駅 改札外（飯田橋方面側・B3F）', 'Shinjuku-nishiguchi: outside the gates at the Iidabashi end (B3F)', '新宿西口站 检票口外（饭田桥方向侧，B3F）'),
    [rect(-62, -58.1, 21.4, 23.6)], pt(-60, 22.5), ngProv, common, 'Descriptive label. Ticket machines are drawn here and the stairs of exit D5 leave from it.'),
  platform(NG.pf, NG.lB4, PAID_TOEI, names('新宿西口駅 1・2番線ホーム', 'Shinjuku-nishiguchi platforms 1–2', '新宿西口站 1·2号站台'), rect(-62, -34, 21.5, 23.5), pt(-48, 22.5),
    [
      { number: '1', services: [svc(L_OEDO, '都庁前方面（都庁前）', 'for Tochomae (next: Tochomae)')], side: 'z-' },
      { number: '2', services: [svc(L_OEDO, '飯田橋方面（東新宿）', 'for Iidabashi (next: Higashi-shinjuku)')], side: 'z+' },
    ], ngProv, common,
    'An island platform. Toei prints "都庁前方面 ① (都庁前)" at one end on the nearer track line and "飯田橋方面 ② (東新宿)" at the other end on the farther one. Car numbers on the Toei table run from 1 (都庁前 end) to 8 (飯田橋・両国 end). The 都庁前 end is the one beside the Marunouchi Line passage, entered as south; "nearer" is entered as east, which is an assumption about the viewpoint.'),
];

const gates: Gate[] = [
  gate('nishiguchi-gates-south', NG.lB3, names('新宿西口駅 改札（都庁前方面側）', 'Shinjuku-nishiguchi gates (Tochomae end)', '新宿西口站 检票口（都厅前方向侧）'), pt(-37.7, 22.5), [a(NG.paid), a(NG.outSouth)], ngProv,
    { common, stepFree: true, notes: `${UNNAMED_GATE} Toei marks the lift route from exit D2 through it to the platform lift.` }),
  gate('nishiguchi-gates-north', NG.lB3, names('新宿西口駅 改札（飯田橋方面側）', 'Shinjuku-nishiguchi gates (Iidabashi end)', '新宿西口站 检票口（饭田桥方向侧）'), pt(-57.8, 22.5), [a(NG.paid), a(NG.outNorth)], ngProv,
    { common, notes: UNNAMED_GATE }),
];

const entrances: Entrance[] = [
  entrance('nishiguchi-exit-d2', NG.lB1, NG.b1, names('出口 D2', 'Exit D2', 'D2出口'), pt(-36, 26.6), null, null, ngProv,
    { common, stepFree: true, notes: 'Drawn with stairs and a lift to street level ("地上へ"). The facilities printed for it in the 出口案内 box were too small to read.' }),
  entrance('nishiguchi-exit-d3-d4', NG.lB1, NG.b1, names('出口 D3・D4', 'Exits D3 / D4', 'D3·D4出口'), pt(-50, 26.6), null, null, ngProv,
    { common, notes: 'One entry for the two. Which floor the stairs of D3 start from was not legible; entered on B1F with D4. The facilities printed for them were too small to read.' }),
  entrance('nishiguchi-exit-d5', NG.lB3, NG.outNorth, names('出口 D5', 'Exit D5', 'D5出口'), pt(-62, 22.5), null, null, ngProv,
    { common, notes: 'A long staircase is drawn from the 飯田橋 end of the station up to D5. Which floor it starts from was not legible; entered at the B3F floor outside the gates there. The facilities printed for it were too small to read.' }),
];

const verticals: VerticalFacility[] = [
  ...pair('nishiguchi-KIND-d1-b1f-to-b3f', ['stairs', 'escalator'], { levelId: NG.lB1, areaId: NG.b1, at: pt(-29.6, 25.4) }, { levelId: NG.lB3, areaId: NG.outSouth, at: pt(-34.6, 22.5) }, ngProv, common,
    `Stairs and an escalator are drawn from the B1F passage, beside exit B14 of the Marunouchi Line, down to the floor outside the gates; the upper end is labelled "D1*". ${TIME_LIMITED}`, true),
  vertical('nishiguchi-elevator-b1f-to-b3f', 'elevator', names('エレベーター（B1F ⇔ 改札外 B3F）', 'Elevator (B1F ⇔ outside the gates, B3F)', '电梯（B1F ⇔ 检票口外 B3F）'),
    [{ levelId: NG.lB1, areaId: NG.b1, at: pt(-36.4, 24.8) }, { levelId: NG.lB3, areaId: NG.outSouth, at: pt(-36.4, 24.8) }],
    ngProv, { common, nonAdjacent: true, notes: 'A lift shaft is drawn below exit D2 from the B1F passage down to the concourse floor, on the lift route Toei marks. Toei lists four lifts for the station.' }),
  ...pair('nishiguchi-KIND-car-2', ['stairs', 'escalator'], { levelId: NG.lB3, areaId: NG.paid, at: pt(-38.8, 22.5) }, { levelId: NG.lB4, areaId: NG.pf, at: pt(-41.4, 22.5) }, ngProv, common,
    `${TABLE} shows an escalator and stairs at car 2; the Marunouchi Line, JR, Keio and Odakyu are bracketed over cars 2–5 as transfers.`),
  ...pair('nishiguchi-KIND-car-5', ['stairs', 'escalator'], { levelId: NG.lB3, areaId: NG.paid, at: pt(-47.6, 22.5) }, { levelId: NG.lB4, areaId: NG.pf, at: pt(-45, 22.5) }, ngProv, common,
    `${TABLE} shows an escalator, stairs and a lift at car 5.`),
  vertical('nishiguchi-elevator-concourse-to-platform', 'elevator', names('エレベーター（改札内 B3F ⇔ ホーム B4F）', 'Elevator (concourse B3F ⇔ platform B4F)', '电梯（站厅 B3F ⇔ 站台 B4F）'),
    [{ levelId: NG.lB3, areaId: NG.paid, at: pt(-49.8, 22.5) }, { levelId: NG.lB4, areaId: NG.pf, at: pt(-49.8, 22.5) }],
    ngProv, { common, notes: `${TABLE} shows a lift at car 5, beside an escalator and stairs; the shaft is drawn from the paid concourse down to the platform.` }),
  ...pair('nishiguchi-KIND-car-7', ['stairs', 'escalator'], { levelId: NG.lB3, areaId: NG.paid, at: pt(-57, 22.5) }, { levelId: NG.lB4, areaId: NG.pf, at: pt(-54.4, 22.5) }, ngProv, common,
    `${TABLE} shows an escalator and stairs at car 7, with the Seibu Shinjuku Line as a transfer. Toei lists 18 escalators for the station.`),
];

const passages: Passage[] = [
  link('marunouchi-concourse-to-nishiguchi-b1f-passage', EXT_IDS.ME.conc, NG.b1, p2([S_NG, S_METRO_SJ]), null,
    { common: { stationId: null, asOf: '2026-11', geometryConfidence: 'unknown' },
      notes: 'The Toei drawing shows the B1F passage of 新宿西口駅 and the B1F passage of the Marunouchi Line as one continuous floor, meeting beside exits B14 and B15; the Tokyo Metro drawing of 新宿 prints exits D1–D5 at the west end of its passage. Toei lists the Marunouchi Line, JR, Keio, Odakyu and Seibu Shinjuku lines as transfers at this station. Whether there are steps on the way was not read.' }),
];

const stations: Station[] = [
  station(ST_NG, TOEI, names('都営大江戸線 新宿西口駅', 'Toei Oedo Line Shinjuku-nishiguchi Station', '都营大江户线新宿西口站'),
    p2([S_NG], 'E 01 on the Toei drawing. A different station from the Oedo Line 新宿駅 (E 27).'), [L_OEDO]),
];

export const nishiguchi = { stations, levels, areas, passages, gates, entrances, verticals };
