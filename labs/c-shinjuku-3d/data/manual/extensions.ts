/**
 * The rest of the Shinjuku complex: Odakyu, the Keio New Line / Toei Shinjuku
 * Line station, the Toei Oedo Line station, the Tokyo Metro Marunouchi Line
 * station and Busta Shinjuku — plus the links between operators.
 *
 * Read on 2026-11-12 by the same AI coding agent as shinjuku.ts, from the
 * operators' own drawings (see sources.ts). The rules are the same: only
 * names, floors, fare-zone boundaries and what connects to what were written
 * down; every coordinate is invented; nobody has re-checked the entries.
 *
 * Where a drawing was too small to read, the entry says so instead of guessing:
 * stairs and escalators are aggregated, the Oedo Line platform has no track
 * side, and one gate ends in an "unverified" block.
 */
import type {
  Area, Entrance, FareZone, Gate, Level, Names, Passage, PlanPoint, PlanRect, Platform, PlatformTrack, Provenance,
  RailLine, Station, UnverifiedBlock, VerticalFacility, VerticalKind,
} from '../../src/domain/types';
import {
  A, AGG, AGG_ESC, BUSTA, D2, KEIO, LV, METRO, ODAKYU, PAID_KEIO, PUBLIC, TOEI, X,
  a, base, concourse, entity, entrance, gate, line, link, names, passageArea, prov, pt, rect, svc, unnamed, vertical,
  type Common,
} from './shinjuku';

const COMPLEX = 'sk:complex:shinjuku';
const p2 = (ids: string[], note?: string): Provenance => prov(ids, note, D2);

const S_OD = 'src:odakyu-shinjuku-map';
const S_NL = 'src:keio-new-line-map';
const S_NL_LAYER = 'src:keio-new-line-layer-map';
const S_NL_NOTICE = 'src:keio-new-line-works-notice';
const S_KEIO_LAYER = 'src:keio-layer-map';
const S_TOEI = 'src:toei-shinjuku-map';
const S_METRO = 'src:tokyo-metro-shinjuku-map';
const S_BUSTA = 'src:busta-floor-maps';
const S_TERMINAL = 'src:shinjuku-terminal-map';
const S_JR_B1 = 'src:jreast-floormap-b1f';
const S_JR_2F = 'src:jreast-floormap-2f';

const ELEV = 'Schematic. Floor heights were not measured; only the vertical order is taken from the source.';

function level(id: string, operatorId: string, label: string, ordinal: number, elevation: number, p: Provenance, c: Common, notes?: string): Level {
  return { kind: 'level', ...base(id, names(label, label, label), p, c, notes), operatorId, label, ordinal, elevation, elevationNote: ELEV };
}
function platform(
  id: string, levelId: string, fareZone: FareZone, n: Names, footprint: PlanRect, anchor: PlanPoint, tracks: PlatformTrack[],
  p: Provenance, c: Common, notes?: string,
): Platform {
  return { kind: 'platform', ...base(id, n, p, c, notes), levelId, fareZone, footprint: [footprint], anchor, tracks };
}
function station(id: string, operatorId: string, n: Names, p: Provenance, railLineIds: string[]): Station {
  return { kind: 'station', ...entity(id, n, p), operatorId, complexId: COMPLEX, railLineIds };
}
/** A staircase and an escalator bank side by side between the same two areas. */
function pair(
  slug: string, kinds: VerticalKind[], from: { levelId: string; areaId: string; at: PlanPoint }, to: { levelId: string; areaId: string; at: PlanPoint },
  p: Provenance, c: Common, notes: string, nonAdjacent = false,
): VerticalFacility[] {
  const alongZ = Math.abs(to.at.z - from.at.z) > Math.abs(to.at.x - from.at.x);
  return kinds.map((kind, i) => {
    const d = kinds.length === 1 ? 0 : i === 0 ? -0.55 : 0.55;
    const shift = (q: PlanPoint) => (alongZ ? pt(q.x + d, q.z) : pt(q.x, q.z + d));
    return vertical(`${slug.replace('KIND', kind)}`, kind, unnamed,
      [{ ...from, at: shift(from.at) }, { ...to, at: shift(to.at) }], p,
      { common: c, nonAdjacent, notes: `${notes} ${kind === 'stairs' ? AGG : AGG_ESC}` });
  });
}

const CONTRAST_NOTE = 'Chosen by this prototype for contrast. Not an official colour value.';

// ===========================================================================
// Odakyu Line Shinjuku — 小田急電鉄 新宿駅 駅平面図 / 駅立体図, 2026.7.25現在
// ===========================================================================

const ST_OD = 'sk:station:odakyu-shinjuku';
const PAID_OD: FareZone = 'paid:odakyu';
const odCommon: Common = { stationId: ST_OD, asOf: '2026-07', geometryConfidence: 'schematic' };
const odProv = p2([S_OD]);
const L_OD = 'sk:line:odakyu-odakyu';

const OD = {
  l2: 'sk:level:odakyu-shinjuku-2f',
  l1: 'sk:level:odakyu-shinjuku-1f',
  lB1: 'sk:level:odakyu-shinjuku-b1f',
  conc2: X.odakyu2fConcourse,
  south2: 'sk:area:odakyu-2f-south-gate-unpaid',
  head1: 'sk:area:odakyu-1f-west-ground-gate-inside',
  out1: 'sk:area:odakyu-1f-west-ground-gate-unpaid',
  concB1: X.odakyuB1Concourse,
  plazaB1: 'sk:area:odakyu-b1f-west-underground-gate-unpaid',
  p23: 'sk:platform:odakyu-shinjuku-2-3',
  p45: 'sk:platform:odakyu-shinjuku-4-5',
  p6: 'sk:platform:odakyu-shinjuku-6',
  p7: 'sk:platform:odakyu-shinjuku-7',
  p89: 'sk:platform:odakyu-shinjuku-8-9',
  p10: 'sk:platform:odakyu-shinjuku-10',
};

const OD_TOWARDS: [string, string] = ['小田原・片瀬江ノ島・唐木田方面', 'for Odawara, Katase-Enoshima, Karakida'];
const odSvc = (kindJa: string, kindEn: string) => svc(L_OD, `${kindJa}（${OD_TOWARDS[0]}）`, `${kindEn} (${OD_TOWARDS[1]})`);
const OD_LTD = odSvc('特急ロマンスカー', 'Romancecar limited express');
const OD_EXP = odSvc('快速急行・急行・準急', 'rapid express, express, semi express');
const OD_LOCAL = odSvc('各駅停車', 'local');
const OD_ALIGHT = svc(L_OD, '降車ホーム', 'alighting only');

// Three slabs side by side on each of the two platform floors. Neighbouring
// faces share one track, so the slabs are drawn one track-width apart.
const OD_Z = { east: [19, 20.7], mid: [21.4, 23.1], west: [23.8, 25] } as const;
const odMid = (k: keyof typeof OD_Z) => (OD_Z[k][0] + OD_Z[k][1]) / 2;

const odLevels: Level[] = [
  level(OD.l2, ODAKYU, '2F', 1, 4, odProv, odCommon),
  level(OD.l1, ODAKYU, '1F', 0, 0, odProv, odCommon, 'Ground-level platforms 2–6 and 西口地上改札口.'),
  level(OD.lB1, ODAKYU, 'B1F', -1, -4, odProv, odCommon,
    'Odakyu prints the underground platforms 7–10 and the concourse on one B1F sheet; a wide staircase and ramps are drawn between them, so the platforms are in fact lower. They are drawn on one plane here.'),
];

const odAreas: Area[] = [
  // 2F
  concourse(OD.conc2, OD.l2, PAID_OD, names('南口 改札内コンコース（2F）', 'South concourse (inside gates, 2F)', '南口站厅（付费区，2F）'),
    [rect(11, 18.4, 16.6, 25)], pt(15, 21), odProv, odCommon,
    'Unnamed on the map: the paid area over the ground-level platforms, between 南口改札口 and 南口JR線連絡口. The label is descriptive.'),
  concourse(OD.south2, OD.l2, 'unpaid', names('南口改札外（2F）', 'Outside South Gate (2F)', '南口检票口外（2F）'),
    [rect(19, 22, 17, 25)], pt(20.5, 21), odProv, odCommon,
    'Odakyu prints "京王線・都営新宿線・都営大江戸線（新宿駅）" and "JR線・バスタ新宿" as the two directions on this side.'),
  // 1F
  concourse(OD.head1, OD.l1, PAID_OD, names('西口地上改札内（1F）', 'Inside West Ground Gate (1F)', '西口地面检票口内（1F）'),
    [rect(-8, -4, 19, 25)], pt(-6, 22), odProv, odCommon,
    'Unnamed on the map: the head of the ground-level platforms, where all three join in front of 西口地上改札口.'),
  concourse(OD.out1, OD.l1, 'unpaid', names('西口地上改札外（1F）', 'Outside West Ground Gate (1F)', '西口地面检票口外（1F）'),
    [rect(-12, -9, 19, 25)], pt(-10.5, 22), odProv, odCommon),
  platform(OD.p23, OD.l1, PAID_OD, names('2・3番ホーム', 'Platforms 2–3', '2·3号站台'), rect(-4, 30, ...OD_Z.east), pt(6, odMid('east')),
    [{ number: '2', services: [OD_LTD], side: 'z-' }, { number: '3', services: [OD_LTD], side: 'z+' }], odProv, odCommon,
    'Legend of the Odakyu map: "②③ 特急ロマンスカー". Face 3 shares its track with face 4.'),
  platform(OD.p45, OD.l1, PAID_OD, names('4・5番ホーム', 'Platforms 4–5', '4·5号站台'), rect(-4, 30, ...OD_Z.mid), pt(6, odMid('mid')),
    [{ number: '4', services: [OD_EXP], side: 'z-' }, { number: '5', services: [OD_EXP], side: 'z+' }], odProv, odCommon,
    'Legend of the Odakyu map: "④⑤ 快速急行、急行、準急". Odakyu notes that platform doors are installed on 4, 5, 8 and 9.'),
  platform(OD.p6, OD.l1, PAID_OD, names('6番ホーム（降車ホーム）', 'Platform 6 (alighting only)', '6号站台（下车专用）'), rect(-4, 26, ...OD_Z.west), pt(6, odMid('west')),
    [{ number: '6', services: [OD_ALIGHT], side: 'z-' }], odProv, odCommon,
    'Legend of the Odakyu map: "⑥⑦⑩ 降車ホーム". It shares its track with face 5.'),
  // B1F
  concourse(OD.concB1, OD.lB1, PAID_OD, names('西口地下改札内コンコース（B1F）', 'West underground concourse (inside gates, B1F)', '西口地下站厅（付费区，B1F）'),
    [rect(-8, 3, 18.4, 25), rect(1.2, 3, 17.5, 18.4)], pt(-3, 22), odProv, odCommon,
    'Unnamed on the map: the paid area between 西口地下改札口, 中央地下連絡口 and the head of platforms 7–10. The JR–Keio corridor crosses this spot at another height and is not part of it.'),
  concourse(OD.plazaB1, OD.lB1, 'unpaid', names('西口地下改札外（B1F）', 'Outside West Underground Gate (B1F)', '西口地下检票口外（B1F）'),
    [rect(-13, -9, 17.5, 25)], pt(-11, 22), odProv, odCommon,
    'Odakyu prints four directions here: "京王線", "丸ノ内線・都営大江戸線（新宿西口駅）", "JR線" (twice) and the bus / taxi symbols.'),
  platform(OD.p7, OD.lB1, PAID_OD, names('7番ホーム（降車ホーム）', 'Platform 7 (alighting only)', '7号站台（下车专用）'), rect(3, 30, ...OD_Z.east), pt(12, odMid('east')),
    [{ number: '7', services: [OD_ALIGHT], side: 'z+' }], odProv, odCommon, 'It shares its track with face 8.'),
  platform(OD.p89, OD.lB1, PAID_OD, names('8・9番ホーム', 'Platforms 8–9', '8·9号站台'), rect(3, 34, ...OD_Z.mid), pt(12, odMid('mid')),
    [{ number: '8', services: [OD_LOCAL], side: 'z-' }, { number: '9', services: [OD_LOCAL], side: 'z+' }], odProv, odCommon,
    'Legend of the Odakyu map: "⑧⑨ 各駅停車".'),
  platform(OD.p10, OD.lB1, PAID_OD, names('10番ホーム（降車ホーム）', 'Platform 10 (alighting only)', '10号站台（下车专用）'), rect(3, 34, ...OD_Z.west), pt(12, odMid('west')),
    [{ number: '10', services: [OD_ALIGHT], side: 'z-' }], odProv, odCommon, 'It shares its track with face 9.'),
];

const OD_GREEN = 'On the "車いすでご利用可能な経路" (green dotted line) of the Odakyu map.';
const OD_RAMP = `${OD_GREEN} The map draws ramps on that route and a wide staircase beside them.`;

const odPassages: Passage[] = [
  link('odakyu-1f-gate-hall-to-platform-2-3', OD.head1, OD.p23, odProv, true, { common: odCommon, notes: OD_GREEN }),
  link('odakyu-1f-gate-hall-to-platform-4-5', OD.head1, OD.p45, odProv, true, { common: odCommon, notes: OD_GREEN }),
  link('odakyu-1f-gate-hall-to-platform-6', OD.head1, OD.p6, odProv, true, { common: odCommon, notes: OD_GREEN }),
  link('odakyu-b1f-concourse-to-platform-7', OD.concB1, OD.p7, odProv, true, { common: odCommon, hasSteps: false, notes: OD_RAMP }),
  link('odakyu-b1f-concourse-to-platform-8-9', OD.concB1, OD.p89, odProv, true, { common: odCommon, hasSteps: false, notes: OD_RAMP }),
  link('odakyu-b1f-concourse-to-platform-10', OD.concB1, OD.p10, odProv, true, { common: odCommon, hasSteps: false, notes: OD_RAMP }),
];

const odGates: Gate[] = [
  gate('odakyu-south-gate', OD.l2, names('南口改札口', 'South Gate', '南口检票口'), pt(18.7, 21), [a(OD.conc2), a(OD.south2)], odProv,
    { common: odCommon, stepFree: true, notes: OD_GREEN }),
  gate('odakyu-west-ground-gate', OD.l1, names('西口地上改札口', 'West Ground Gate', '西口地面检票口'), pt(-8.5, 22), [a(OD.head1), a(OD.out1)], odProv,
    { common: odCommon, stepFree: true, notes: OD_GREEN }),
  gate('odakyu-west-underground-gate', OD.lB1, names('西口地下改札口', 'West Underground Gate', '西口地下检票口'), pt(-8.5, 22), [a(OD.concB1), a(OD.plazaB1)], odProv,
    { common: odCommon, stepFree: true, notes: OD_GREEN }),
];

const odEntrances: Entrance[] = [
  entrance('odakyu-south-exit', OD.l2, OD.south2, names('南口', 'South Exit', '南口'), pt(22, 21),
    '京王線・都営新宿線・都営大江戸線（新宿駅）／JR線・バスタ新宿', 'Keio Line, Toei Shinjuku Line, Toei Oedo Line (Shinjuku Sta.); JR lines, Busta Shinjuku', odProv,
    { common: odCommon, notes: 'The label follows the gate name 南口改札口.' }),
  entrance('odakyu-west-exit-street', OD.l1, OD.out1, names('西口（地上）', 'West Exit (street level)', '西口（地面）'), pt(-12, 22),
    null, null, odProv, { common: odCommon, notes: 'The label follows the gate name 西口地上改札口. No direction text is printed on this side; a 特急券うりば is.' }),
  entrance('odakyu-west-exit-underground', OD.lB1, OD.plazaB1, names('西口（地下）', 'West Exit (underground)', '西口（地下）'), pt(-13, 22),
    '京王線／丸ノ内線・都営大江戸線（新宿西口駅）／JR線／バス・タクシーのりば', 'Keio Line; Marunouchi Line, Toei Oedo Line (Shinjuku-nishiguchi Sta.); JR lines; buses and taxis', odProv,
    { common: odCommon, notes: 'The label follows the gate name 西口地下改札口.' }),
];

const OD_LETTERS = 'The Odakyu map marks stairs with letters that match between floors';
const odLift = (n: number, slabUp: string, slabDown: string, z: number): VerticalFacility =>
  vertical(`odakyu-elevator-${n}`, 'elevator', names(`エレベーター ${n}`, `Elevator ${n}`, `电梯 ${n}`),
    [{ levelId: OD.l2, areaId: OD.conc2, at: pt(14, z) }, { levelId: OD.l1, areaId: slabUp, at: pt(14, z) }, { levelId: OD.lB1, areaId: slabDown, at: pt(14, z) }],
    odProv, { common: odCommon, label: String(n), notes: `Numbered ${n} on all three floors of the Odakyu map. ${OD_GREEN}` });

const odVerticals: VerticalFacility[] = [
  odLift(1, OD.p6, OD.p10, odMid('west')),
  odLift(2, OD.p45, OD.p89, odMid('mid')),
  odLift(3, OD.p23, OD.p7, odMid('east')),
  // 2F ⇄ ground-level platforms
  ...pair('odakyu-KIND-2f-to-platform-6', ['stairs'], { levelId: OD.l2, areaId: OD.conc2, at: pt(12.4, odMid('west')) }, { levelId: OD.l1, areaId: OD.p6, at: pt(9.8, odMid('west')) }, odProv, odCommon, `${OD_LETTERS} (C).`),
  ...pair('odakyu-KIND-2f-to-platform-4-5', ['stairs'], { levelId: OD.l2, areaId: OD.conc2, at: pt(12.4, odMid('mid')) }, { levelId: OD.l1, areaId: OD.p45, at: pt(9.8, odMid('mid')) }, odProv, odCommon, `${OD_LETTERS} (I, K).`),
  ...pair('odakyu-KIND-2f-to-platform-2-3', ['stairs', 'escalator'], { levelId: OD.l2, areaId: OD.conc2, at: pt(12.4, odMid('east')) }, { levelId: OD.l1, areaId: OD.p23, at: pt(9.8, odMid('east')) }, odProv, odCommon, `${OD_LETTERS} (P, Q); P is drawn with an escalator.`),
  // ground-level platforms ⇄ underground platforms
  ...pair('odakyu-KIND-platform-6-to-platform-10', ['stairs'], { levelId: OD.l1, areaId: OD.p6, at: pt(21, odMid('west')) }, { levelId: OD.lB1, areaId: OD.p10, at: pt(23.6, odMid('west')) }, odProv, odCommon, `${OD_LETTERS} (A, B).`),
  ...pair('odakyu-KIND-platform-4-5-to-platform-8-9', ['stairs'], { levelId: OD.l1, areaId: OD.p45, at: pt(21, odMid('mid')) }, { levelId: OD.lB1, areaId: OD.p89, at: pt(23.6, odMid('mid')) }, odProv, odCommon, `${OD_LETTERS} (G, H, J).`),
  ...pair('odakyu-KIND-platform-2-3-to-platform-7', ['stairs'], { levelId: OD.l1, areaId: OD.p23, at: pt(21, odMid('east')) }, { levelId: OD.lB1, areaId: OD.p7, at: pt(23.6, odMid('east')) }, odProv, odCommon, `${OD_LETTERS} (N, O, R).`),
  // ground-level platforms ⇄ underground concourse
  ...pair('odakyu-KIND-platform-6-to-b1f-concourse', ['stairs'], { levelId: OD.l1, areaId: OD.p6, at: pt(0.6, odMid('west')) }, { levelId: OD.lB1, areaId: OD.concB1, at: pt(-2, odMid('west')) }, odProv, odCommon, `${OD_LETTERS} (E, F).`),
  ...pair('odakyu-KIND-platform-4-5-to-b1f-concourse', ['stairs'], { levelId: OD.l1, areaId: OD.p45, at: pt(0.6, odMid('mid')) }, { levelId: OD.lB1, areaId: OD.concB1, at: pt(-2, odMid('mid')) }, odProv, odCommon, `${OD_LETTERS} (L).`),
  ...pair('odakyu-KIND-platform-2-3-to-b1f-concourse', ['stairs'], { levelId: OD.l1, areaId: OD.p23, at: pt(0.6, odMid('east')) }, { levelId: OD.lB1, areaId: OD.concB1, at: pt(-2, odMid('east')) }, odProv, odCommon, `${OD_LETTERS} (S).`),
  // outside the west gates
  vertical('odakyu-elevator-4', 'elevator', names('エレベーター 4', 'Elevator 4', '电梯 4'),
    [{ levelId: OD.l1, areaId: OD.out1, at: pt(-11, 20) }, { levelId: OD.lB1, areaId: OD.plazaB1, at: pt(-11, 20) }],
    odProv, { common: odCommon, label: '4', notes: `Numbered 4, outside the gates on 1F and B1F. ${OD_GREEN}` }),
  ...pair('odakyu-KIND-west-exit-street-to-underground', ['stairs'], { levelId: OD.l1, areaId: OD.out1, at: pt(-10, 23.6) }, { levelId: OD.lB1, areaId: OD.plazaB1, at: pt(-12.2, 23.6) }, odProv, odCommon, `${OD_LETTERS} (U).`),
];

// ===========================================================================
// Keio New Line / Toei Shinjuku Line — 京王新線新宿駅 階層図・構内マップ, 2026年3月末現在
// (Toei: "この駅は京王電鉄の管理駅です")
// ===========================================================================

const ST_NL = 'sk:station:keio-new-line-shinjuku';
const nlCommon: Common = { stationId: ST_NL, asOf: '2026-03', geometryConfidence: 'schematic' };
const nlProv = p2([S_NL_LAYER, S_NL]);
const nlToeiProv = p2([S_NL_LAYER, S_NL, S_TOEI]);
const L_NL = 'sk:line:keio-new';
const L_TS = 'sk:line:toei-shinjuku';
const L_OEDO = 'sk:line:toei-oedo';

const NL = {
  lB1: 'sk:level:keio-new-line-shinjuku-b1f',
  lB4: 'sk:level:keio-new-line-shinjuku-b4f',
  lB5: 'sk:level:keio-new-line-shinjuku-b5f',
  conc: 'sk:area:keio-new-line-b1f-concourse',
  paidEast: X.newLinePaidEast,
  paidWest: 'sk:area:keio-new-line-b1f-paid-west',
  b4West: 'sk:area:keio-new-line-b4f-west',
  b4Mid: 'sk:area:keio-new-line-b4f-central',
  b4East: 'sk:area:keio-new-line-b4f-east',
  pf: 'sk:platform:keio-new-line-shinjuku-4-5',
};
const OEDO_GATE_B_INSIDE = 'sk:area:toei-oedo-b1f-gate-b-inside';

const nlLevels: Level[] = [
  level(NL.lB1, KEIO, 'B1F', -1, -5.4, nlProv, nlCommon, 'Drawn level with Keio Line B1F, which the 京王モール passage joins it to. Relative heights are not from a source.'),
  level(NL.lB4, KEIO, 'B4F', -4, -14, nlProv, nlCommon, 'Three separate paid mezzanines on the Keio drawing.'),
  level(NL.lB5, KEIO, 'B5F', -5, -17, nlProv, nlCommon),
];

const NL_GREEN = 'On the wheelchair route (green dotted line) of the Keio 階層図.';

const nlAreas: Area[] = [
  passageArea(NL.conc, NL.lB1, 'unpaid', names('京王新線通路（改札外・B1F）', 'Keio New Line concourse (outside gates, B1F)', '京王新线通道（检票口外，B1F）'),
    [rect(31, 34, 26, 62)], pt(32.5, 38), p2([S_NL_LAYER, S_NL, S_TERMINAL, S_TOEI]), nlCommon,
    'The long unpaid passage under 甲州街道; "京王新線通路" is the name the 新宿ターミナルマップ gives it.'),
  concourse(NL.paidEast, NL.lB1, PAID_KEIO, names('京王新線口 改札内（B1F）', 'Inside Keio New Line Gate (B1F)', '京王新线口内侧（B1F）'),
    [rect(34.8, 38, 26, 40)], pt(36.4, 37.5), nlProv, nlCommon,
    'Stairs marked "京王線③ホームへ" leave from here; it is one paid area with the Keio Line platforms.'),
  concourse(NL.paidWest, NL.lB1, PAID_KEIO, names('新都心口 改札内（B1F）', 'Inside Shintoshin Gate (B1F)', '新都心口内侧（B1F）'),
    [rect(34.8, 38, 52, 58)], pt(36.4, 55), nlProv, nlCommon),
  concourse(NL.b4West, NL.lB4, PAID_KEIO, names(null, 'B4F mezzanine (west)', 'B4F 中间层（西）'), [rect(35, 38, 52, 58)], pt(36.5, 55.6), nlProv, nlCommon,
    'Unnamed. Reached from 新都心口 by Ⓐ Ⓑ, and joined to the platform by Ⓕ.'),
  concourse(NL.b4Mid, NL.lB4, PAID_KEIO, names(null, 'B4F mezzanine (central)', 'B4F 中间层（中央）'), [rect(35, 39, 32, 44)], pt(37, 38), nlProv, nlCommon,
    'Unnamed. Reached from 京王新線口 by Ⓒ Ⓓ, joined to the platform by Ⓖ Ⓗ Ⓙ Ⓚ, and marked "都営大江戸線へ".'),
  concourse(NL.b4East, NL.lB4, PAID_KEIO, names(null, 'B4F mezzanine (east)', 'B4F 中间层（东）'), [rect(35, 38, 26, 30)], pt(36.5, 28), nlProv, nlCommon,
    'Unnamed. Reached from the east end of the B1F paid area by Ⓔ, and joined to the platform by Ⓛ.'),
  platform(NL.pf, NL.lB5, PAID_KEIO, names('4・5番線ホーム', 'Platforms 4–5', '4·5号站台'), rect(35.2, 37.2, 24, 60), pt(36.2, 40),
    [
      { number: '4', services: [svc(L_NL, '京王八王子・高尾山口・橋本', 'for Keio-hachioji, Takaosanguchi, Hashimoto')], side: 'x+' },
      { number: '5', services: [svc(L_TS, '本八幡方面', 'for Motoyawata')], side: 'x-' },
    ], nlToeiProv, nlCommon,
    'Keio prints "④ 京王八王子・高尾山口・橋本" and "⑤ 都営新宿線 本八幡"; Toei prints "④ 京王線 橋本・高尾山口方面（初台）" and "⑤ 本八幡方面（新宿三丁目）". Track 5 is drawn on the north side on the Keio 階層図.'),
];

const nlGates: Gate[] = [
  gate('keio-new-line-gate', NL.lB1, names('京王新線口', 'Keio New Line Gate', '京王新线口'), pt(34.4, 37), [a(NL.conc), a(NL.paidEast)], nlProv,
    { common: nlCommon, stepFree: true, notes: NL_GREEN }),
  gate('keio-shintoshin-gate', NL.lB1, names('新都心口', 'Shintoshin Gate', '新都心口'), pt(34.4, 55), [a(NL.conc), a(NL.paidWest)], nlToeiProv,
    { common: nlCommon, hours: '6:45〜22:00', notes: 'Staffed by intercom according to the Keio map.' }),
  gate('toei-oedo-gate-b', NL.lB1, names('大江戸線改札B', 'Oedo Line Gate B', '大江户线检票口B'), pt(34.4, 46), [a(NL.conc), a(OEDO_GATE_B_INSIDE)], p2([S_NL_LAYER, S_NL_NOTICE, S_TOEI]),
    { common: { stationId: 'sk:station:toei-oedo-shinjuku', asOf: '2026-03', geometryConfidence: 'unknown' },
      notes: 'Named on the Keio drawings beside the B1F passage, west of 京王新線口. The Toei 立体図 draws a gate line at the same place with flights leading down from it.' }),
];

const nlEntrances: Entrance[] = [
  entrance('new-line-exit-3', NL.lB1, NL.conc, names('出口 3', 'Exit 3', '3号出口'), pt(31, 27.5),
    '甲州街道・西新宿一丁目／（JR線・小田急線・ルミネ）南口方面', 'Koshu-kaido, Nishi-Shinjuku 1; South Exit side (JR, Odakyu, Lumine)', p2([S_TOEI, S_NL_LAYER]), { common: nlCommon }),
  entrance('new-line-exit-4', NL.lB1, NL.conc, names('出口 4', 'Exit 4', '4号出口'), pt(34, 42),
    '甲州街道・JR東京総合病院', 'Koshu-kaido, JR Tokyo General Hospital', p2([S_TOEI]), { common: nlCommon, notes: 'Toei: 6:00〜23:00.' }),
  entrance('new-line-exit-5', NL.lB1, NL.conc, names('出口 5', 'Exit 5', '5号出口'), pt(31, 48),
    'ヤマダ電機（直結）・新宿郵便局・工学院大学', 'Yamada Denki (direct), Shinjuku Post Office, Kogakuin University', p2([S_TOEI, S_NL_LAYER]),
    { common: nlCommon, stepFree: true, notes: 'Marked with a lift on both drawings ("地上(1F)へ"). Toei: 6:00〜23:00.' }),
  entrance('new-line-exit-6', NL.lB1, NL.conc, names('出口 6', 'Exit 6', '6号出口'), pt(34, 60.5),
    '全労済会館', 'Zenrosai Kaikan', p2([S_TOEI]), { common: nlCommon, notes: 'Toei: 6:00〜23:00.' }),
  entrance('new-line-exit-7-8', NL.lB1, NL.conc, names('出口 7・8', 'Exits 7 / 8', '7·8号出口'), pt(32.5, 62),
    '都庁方面（京王プラザホテル・東京都庁・工学院大学）', 'towards the Metropolitan Government Building (Keio Plaza Hotel, Kogakuin University)', p2([S_TOEI, S_NL_LAYER]),
    { common: nlCommon, notes: 'Toei: 7 and 8 (地下歩道連絡口), both 6:00〜23:00. Keio prints "都庁方面" at this end.' }),
];

const NL_LETTER = 'Lettered on the Keio 階層図';
const nlVerticals: VerticalFacility[] = [
  ...pair('keio-new-line-KIND-shintoshin-gate-to-b4f', ['stairs', 'escalator'], { levelId: NL.lB1, areaId: NL.paidWest, at: pt(36.5, 57) }, { levelId: NL.lB4, areaId: NL.b4West, at: pt(36.5, 54.6) }, nlProv, nlCommon, `${NL_LETTER} (Ⓐ Ⓑ).`, true),
  ...pair('keio-new-line-KIND-b4f-west-to-platform', ['stairs', 'escalator'], { levelId: NL.lB4, areaId: NL.b4West, at: pt(36.3, 53) }, { levelId: NL.lB5, areaId: NL.pf, at: pt(36.2, 50.4) }, p2([S_NL_LAYER, S_NL, S_NL_NOTICE]), nlCommon,
    `${NL_LETTER} (Ⓕ). A Keio works notice read on 2026-11-12 marks the escalator here "エスカレーター更新工事中 ※階段は通行可能"; the same notice says one staircase of platforms 4·5 is narrowed from 2026-09-04.`),
  ...pair('keio-new-line-KIND-new-line-gate-to-b4f', ['stairs', 'escalator'], { levelId: NL.lB1, areaId: NL.paidEast, at: pt(36.5, 39.3) }, { levelId: NL.lB4, areaId: NL.b4Mid, at: pt(36.5, 42) }, nlProv, nlCommon, `${NL_LETTER} (Ⓒ Ⓓ).`, true),
  ...pair('keio-new-line-KIND-b4f-central-to-platform', ['stairs', 'escalator'], { levelId: NL.lB4, areaId: NL.b4Mid, at: pt(36.3, 43.4) }, { levelId: NL.lB5, areaId: NL.pf, at: pt(36.2, 46) }, nlProv, nlCommon, `${NL_LETTER} (Ⓖ Ⓗ Ⓙ Ⓚ).`),
  ...pair('keio-new-line-KIND-b1f-east-to-b4f', ['stairs', 'escalator'], { levelId: NL.lB1, areaId: NL.paidEast, at: pt(36.5, 29.4) }, { levelId: NL.lB4, areaId: NL.b4East, at: pt(36.5, 27.2) }, nlProv, nlCommon, `${NL_LETTER} (Ⓔ).`, true),
  ...pair('keio-new-line-KIND-b4f-east-to-platform', ['stairs', 'escalator'], { levelId: NL.lB4, areaId: NL.b4East, at: pt(36.3, 26.4) }, { levelId: NL.lB5, areaId: NL.pf, at: pt(36.2, 24.6) }, nlProv, nlCommon, `${NL_LETTER} (Ⓛ).`),
  vertical('keio-new-line-elevator', 'elevator', names('エレベーター（改札口 B1F ⇔ B4F ⇔ ホーム B5F）', 'Elevator (gate B1F ⇔ B4F ⇔ platform B5F)', '电梯（检票口 B1F ⇔ B4F ⇔ 站台 B5F）'),
    [{ levelId: NL.lB1, areaId: NL.paidEast, at: pt(36.2, 36) }, { levelId: NL.lB4, areaId: NL.b4Mid, at: pt(36.2, 36) }, { levelId: NL.lB5, areaId: NL.pf, at: pt(36.2, 36) }],
    nlToeiProv, { common: nlCommon, nonAdjacent: true,
      notes: `Keio labels its stops "改札口(B1F)", "大江戸線連絡口(B4F)" and "ホーム(B5F)". ${NL_GREEN} Toei lists one lift for the Shinjuku Line.` }),
];

// ===========================================================================
// Toei Oedo Line Shinjuku — 都営 新宿駅構内立体図
// ===========================================================================

const ST_OEDO = 'sk:station:toei-oedo-shinjuku';
const PAID_TOEI: FareZone = 'paid:toei';
const oedoCommon: Common = { stationId: ST_OEDO, asOf: '2026-11', geometryConfidence: 'unknown' };
const oedoProv = p2([S_TOEI]);
const OEDO_SMALL = 'Read from the Toei 立体図, which is published small; positions are schematic.';
const OEDO_TABLE = 'the のりかえ・出口案内 table under the Toei 立体図';

const OE = {
  lB1: 'sk:level:toei-oedo-shinjuku-b1f',
  lB3: 'sk:level:toei-oedo-shinjuku-b3f',
  lB4: 'sk:level:toei-oedo-shinjuku-b4f',
  lB7: 'sk:level:toei-oedo-shinjuku-b7f',
  gateBIn: OEDO_GATE_B_INSIDE,
  link: 'sk:area:toei-oedo-b4f-transfer-passage',
  conc: 'sk:area:toei-oedo-b3f-concourse',
  out: 'sk:area:toei-oedo-b3f-unpaid',
  pf: 'sk:platform:toei-oedo-shinjuku-6-7',
};

const oedoLevels: Level[] = [
  level(OE.lB1, TOEI, 'B1F', -1, -5.4, p2([S_TOEI, S_NL_LAYER]), oedoCommon, 'Only the landing inside 大江戸線改札B, level with the new-line passage.'),
  level(OE.lB3, TOEI, 'B3F', -3, -11, oedoProv, oedoCommon, 'The part of the Oedo concourse with the gate towards exit A1. See uc-oedo-floors about the floor label.'),
  level(OE.lB4, TOEI, 'B4F', -4, -14, oedoProv, oedoCommon, 'The Oedo side of the mezzanine it shares with the Shinjuku Line station.'),
  level(OE.lB7, TOEI, 'B7F', -7, -21, oedoProv, oedoCommon),
];

const oedoAreas: Area[] = [
  concourse(OE.gateBIn, OE.lB1, PAID_TOEI, names('大江戸線改札B 改札内（B1F）', 'Inside Oedo Line Gate B (B1F)', '大江户线检票口B内侧（B1F）'),
    [rect(34.8, 37.4, 44.8, 47.2)], pt(36, 46), p2([S_TOEI, S_NL_LAYER]), oedoCommon,
    `The small paid landing drawn behind the gate line; the label is descriptive. ${OEDO_SMALL}`),
  concourse(OE.link, OE.lB4, PAID_TOEI, names('大江戸線 コンコース（B4F・新宿線のりかえ側）', 'Oedo Line concourse (B4F, Shinjuku Line transfer side)', '大江户线站厅（B4F，新宿线换乘侧）'),
    [rect(39.8, 46, 35.4, 39.4), rect(39.8, 42.2, 39.4, 47.2)], pt(42.5, 37.4), p2([S_TOEI, S_NL_LAYER]), oedoCommon,
    `Unnamed on the drawing; the label is descriptive. The slab marked B4F beside the Shinjuku Line mezzanine, with an arm that the flights from 大江戸線改札B come down to. ${OEDO_SMALL}`),
  concourse(OE.conc, OE.lB3, PAID_TOEI, names('大江戸線 改札内コンコース（A1出口側）', 'Oedo Line concourse (inside gates, exit A1 side)', '大江户线站厅（付费区，A1出口侧）'),
    [rect(47, 58, 35.4, 39.4)], pt(52.5, 38.6), oedoProv, oedoCommon,
    `The label is descriptive. The station office, the toilets and the lift to the platform are drawn on this part. ${OEDO_SMALL}`),
  concourse(OE.out, OE.lB3, 'unpaid', names('大江戸線 改札外（A1出口側）', 'Outside the Oedo Line gates (exit A1 side)', '大江户线检票口外（A1出口侧）'),
    [rect(58.8, 62, 35.4, 39.4)], pt(60.4, 37.4), oedoProv, oedoCommon, `The label is descriptive. Ticket machines, a lift and an escalator marked "地上へ" are drawn here. ${OEDO_SMALL}`),
  platform(OE.pf, OE.lB7, PAID_TOEI, names('6・7番線ホーム', 'Platforms 6–7', '6·7号站台'), rect(43, 62, 36.4, 38.4), pt(53, 37.4),
    [
      { number: '6', services: [svc(L_OEDO, '六本木方面（代々木）', 'for Roppongi (next: Yoyogi)')], side: 'z-' },
      { number: '7', services: [svc(L_OEDO, '光が丘方面（都庁前）', 'for Hikarigaoka (next: Tochomae)')], side: 'z+' },
    ], oedoProv, oedoCommon,
    'An island platform with a track line drawn along each side. The arrow "⑥ 六本木方面（代々木）" leaves the far track line at the south-east end and "⑦ 光が丘方面（都庁前）" leaves the near one at the north-west end; with the compass on the drawing that puts track 6 on the north-east side. Car numbers on the Toei table run from 8 (光が丘 end) to 1 (六本木 end).'),
];

const oedoGates: Gate[] = [
  gate('toei-oedo-transfer-gate', NL.lB4, names('大江戸線連絡口', 'Oedo Line transfer gate', '大江户线换乘口'), pt(39.4, 38), [a(NL.b4Mid), a(OE.link)], p2([S_NL_LAYER, S_NL, S_TOEI]),
    { common: { stationId: null, asOf: '2026-03', geometryConfidence: 'unknown' }, transfer: true,
      notes: 'Keio prints "大江戸線連絡口(B4F)" and "都営大江戸線へ" on its B4F mezzanine. Not on either operator\'s wheelchair route as far as could be read.' }),
  gate('toei-oedo-gate-a1-side', OE.lB3, names('大江戸線 改札（A1出口側）', 'Oedo Line gate (exit A1 side)', '大江户线检票口（A1出口侧）'), pt(58.4, 37.4), [a(OE.conc), a(OE.out)], oedoProv,
    { common: oedoCommon, stepFree: true,
      notes: 'The gate line is drawn on the Toei 立体図 without a name; the label is descriptive. Toei marks the lift route from exit A1 through it to the platform.' }),
];

const oedoEntrances: Entrance[] = [
  entrance('toei-oedo-exit-a1', OE.lB3, OE.out, names('出口 A1', 'Exit A1', 'A1出口'), pt(62, 37.4),
    '新宿マインズタワー・ホテルサンルートプラザ新宿・JR東京総合病院・バスタ新宿', 'Shinjuku Maynds Tower, Hotel Sunroute Plaza Shinjuku, JR Tokyo General Hospital, Busta Shinjuku', oedoProv,
    { common: oedoCommon, stepFree: true, notes: 'Toei marks A1 with EV and ES.' }),
];

const oedoVerticals: VerticalFacility[] = [
  ...pair('toei-oedo-KIND-gate-b-to-b4f', ['stairs', 'escalator'], { levelId: OE.lB1, areaId: OE.gateBIn, at: pt(36.9, 46) }, { levelId: OE.lB4, areaId: OE.link, at: pt(40.6, 46) }, oedoProv, oedoCommon,
    'Stairs and escalators are drawn leading down from the gate line of 大江戸線改札B, with two intermediate landings that are left out here.', true),
  ...pair('toei-oedo-KIND-transfer-passage-to-concourse', ['stairs'], { levelId: OE.lB4, areaId: OE.link, at: pt(45.2, 38.6) }, { levelId: OE.lB3, areaId: OE.conc, at: pt(47.8, 38.6) }, oedoProv, oedoCommon,
    `Whether this short flight is stairs, an escalator or both was not legible; entered as stairs. ${OEDO_SMALL}`),
  ...pair('toei-oedo-KIND-b4f-to-platform-north-end', ['stairs', 'escalator'], { levelId: OE.lB4, areaId: OE.link, at: pt(41, 37.4) }, { levelId: OE.lB7, areaId: OE.pf, at: pt(44.2, 37.4) }, oedoProv, oedoCommon,
    `Drawn at the 光が丘 end of the platform, by way of an intermediate landing; ${OEDO_TABLE} shows an escalator and stairs at car 8.`, true),
  ...pair('toei-oedo-KIND-b4f-to-platform', ['escalator'], { levelId: OE.lB4, areaId: OE.link, at: pt(44.6, 36.9) }, { levelId: OE.lB7, areaId: OE.pf, at: pt(49, 36.9) }, oedoProv, oedoCommon,
    `One of the two long escalator banks drawn between the concourse and the platform; ${OEDO_TABLE} shows an escalator at car 3, with the Shinjuku Line as a transfer. Toei lists 16 escalators for the Oedo Line here.`, true),
  ...pair('toei-oedo-KIND-concourse-to-platform', ['escalator'], { levelId: OE.lB3, areaId: OE.conc, at: pt(51, 37.9) }, { levelId: OE.lB7, areaId: OE.pf, at: pt(55.5, 37.9) }, oedoProv, oedoCommon,
    `The other long escalator bank; ${OEDO_TABLE} shows an escalator and a lift at car 1, towards exit A1.`, true),
  vertical('toei-oedo-elevator-concourse-to-platform', 'elevator', names('エレベーター（改札内 B3F ⇔ ホーム B7F）', 'Elevator (concourse B3F ⇔ platform B7F)', '电梯（站厅 B3F ⇔ 站台 B7F）'),
    [{ levelId: OE.lB3, areaId: OE.conc, at: pt(57, 37.4) }, { levelId: OE.lB7, areaId: OE.pf, at: pt(57, 37.4) }],
    oedoProv, { common: oedoCommon, nonAdjacent: true, notes: 'Drawn as a shaft from the concourse beside the gate down to the platform. Toei lists two lifts for the Oedo Line; the other is at exit A1.' }),
];

// ===========================================================================
// Tokyo Metro Marunouchi Line Shinjuku — 新宿駅構内立体図 [2025.11現在]
// ===========================================================================

const ST_METRO = 'sk:station:tokyo-metro-shinjuku';
const PAID_METRO: FareZone = 'paid:tokyo-metro';
const metroCommon: Common = { stationId: ST_METRO, asOf: '2025-11', geometryConfidence: 'schematic' };
const metroProv = p2([S_METRO]);
const L_MARU = 'sk:line:tokyo-metro-marunouchi';
const METRO_UNNAMED = 'The gate line is drawn on the 立体図 without a name; the label is descriptive.';

const ME = {
  lB1: 'sk:level:tokyo-metro-shinjuku-b1f',
  lB2: 'sk:level:tokyo-metro-shinjuku-b2f',
  conc: 'sk:area:tokyo-metro-b1f-concourse',
  paidEast: 'sk:area:tokyo-metro-b1f-paid-east',
  paidWest: 'sk:area:tokyo-metro-b1f-paid-west',
  pf: 'sk:platform:tokyo-metro-shinjuku-1-2',
};

const metroLevels: Level[] = [
  level(ME.lB1, METRO, 'B1F', -1, -4, metroProv, metroCommon),
  level(ME.lB2, METRO, 'B2F', -2, -8, metroProv, metroCommon),
];

const metroAreas: Area[] = [
  passageArea(ME.conc, ME.lB1, 'unpaid', names('丸ノ内線 改札外通路（B1F）', 'Marunouchi Line concourse (outside gates, B1F)', '丸之内线通道（检票口外，B1F）'),
    [rect(-27, -24.4, -22, 26)], pt(-25.7, 0), p2([S_METRO, S_TERMINAL]), metroCommon,
    'The long B1F passage with exits A6–A18 and B6–B18; the 新宿ターミナルマップ calls it メトロ通路. Several exits are marked 閉鎖中 on the 2025.11 drawing (A11, A13, A14, A15, B9, B13, B14, B15).'),
  concourse(ME.paidEast, ME.lB1, PAID_METRO, names('丸ノ内線 改札内（東側・B1F）', 'Inside the east gates (B1F)', '丸之内线东侧检票口内（B1F）'),
    [rect(-23.6, -21.4, -12, -6)], pt(-22.5, -9), metroProv, metroCommon, 'Descriptive label.'),
  concourse(ME.paidWest, ME.lB1, PAID_METRO, names('丸ノ内線 改札内（西側・B1F）', 'Inside the west gates (B1F)', '丸之内线西侧检票口内（B1F）'),
    [rect(-23.6, -21.4, 6, 12)], pt(-22.5, 9), metroProv, metroCommon, 'Descriptive label.'),
  platform(ME.pf, ME.lB2, PAID_METRO, names('1・2番線ホーム', 'Platforms 1–2', '1·2号站台'), rect(-23.5, -21.5, -14, 14), pt(-22.5, 0),
    [
      { number: '1', services: [svc(L_MARU, '荻窪方面', 'for Ogikubo')], side: 'x+' },
      { number: '2', services: [svc(L_MARU, '池袋方面', 'for Ikebukuro')], side: 'x-' },
    ], metroProv, metroCommon,
    'An island platform on the 立体図, with "② 池袋" on the side of the B-numbered exits (north) and "① 荻窪" on the side of the A-numbered exits.'),
];

const metroGates: Gate[] = [
  gate('tokyo-metro-east-gates', ME.lB1, names('丸ノ内線 改札（東側）', 'Marunouchi Line gates (east)', '丸之内线检票口（东侧）'), pt(-24, -9), [a(ME.paidEast), a(ME.conc)], metroProv,
    { common: metroCommon, stepFree: true, notes: `${METRO_UNNAMED} The barrier-free route (red line) of the 立体図 passes through it to the lift.` }),
  gate('tokyo-metro-west-gates', ME.lB1, names('丸ノ内線 改札（西側）', 'Marunouchi Line gates (west)', '丸之内线检票口（西侧）'), pt(-24, 9), [a(ME.paidWest), a(ME.conc)], metroProv,
    { common: metroCommon, notes: METRO_UNNAMED }),
];

const metroEntrances: Entrance[] = [
  entrance('tokyo-metro-exit-a9', ME.lB1, ME.conc, names('出口 A9', 'Exit A9', 'A9出口'), pt(-24.4, -19), 'JR線', 'JR lines', metroProv, { common: metroCommon }),
  entrance('tokyo-metro-exit-a12', ME.lB1, ME.conc, names('出口 A12', 'Exit A12', 'A12出口'), pt(-24.4, -2),
    '都営新宿線・JR線・小田急線・京王線', 'Toei Shinjuku Line, JR lines, Odakyu Line, Keio Line', metroProv, { common: metroCommon }),
  entrance('tokyo-metro-exit-b10-b11', ME.lB1, ME.conc, names('出口 B10・B11', 'Exits B10 / B11', 'B10·B11出口'), pt(-27, -15),
    '西武新宿線へ・サブナード方面', 'to the Seibu Shinjuku Line; towards Subnade', metroProv, { common: metroCommon }),
  entrance('tokyo-metro-east-end', ME.lB1, ME.conc, names('出口 A6・B6（東端）', 'Exits A6 / B6 (east end)', 'A6·B6出口（东端）'), pt(-25.7, -22),
    '新宿三丁目方面', 'towards Shinjuku-sanchome', metroProv, { common: metroCommon }),
  entrance('tokyo-metro-west-end', ME.lB1, ME.conc, names('出口 B16〜B18・D1〜D5（西端）', 'Exits B16–B18, D1–D5 (west end)', 'B16～B18·D1～D5出口（西端）'), pt(-25.7, 26),
    '小田急ハルク方面／都営大江戸線 新宿西口駅', 'towards Odakyu HALC; Toei Oedo Line Shinjuku-nishiguchi Station', metroProv,
    { common: metroCommon, notes: '新宿西口駅 is a different station and is not modelled.' }),
];

const metroVerticals: VerticalFacility[] = [
  ...pair('tokyo-metro-KIND-east-gates-to-platform', ['stairs', 'escalator'], { levelId: ME.lB1, areaId: ME.paidEast, at: pt(-22.5, -7) }, { levelId: ME.lB2, areaId: ME.pf, at: pt(-22.5, -4.4) }, metroProv, metroCommon, 'Drawn below the east gates on the 立体図.'),
  ...pair('tokyo-metro-KIND-west-gates-to-platform', ['stairs'], { levelId: ME.lB1, areaId: ME.paidWest, at: pt(-22.5, 7) }, { levelId: ME.lB2, areaId: ME.pf, at: pt(-22.5, 4.4) }, metroProv, metroCommon, 'Drawn below the west gates on the 立体図.'),
  vertical('tokyo-metro-elevator-east', 'elevator', names('エレベーター（改札内 B1F ⇔ ホーム B2F）', 'Elevator (concourse B1F ⇔ platform B2F)', '电梯（站厅 B1F ⇔ 站台 B2F）'),
    [{ levelId: ME.lB1, areaId: ME.paidEast, at: pt(-22.5, -11) }, { levelId: ME.lB2, areaId: ME.pf, at: pt(-22.5, -11) }],
    metroProv, { common: metroCommon, notes: 'The shaft drawn beside the east gates, on the barrier-free route (red line).' }),
];

// ===========================================================================
// Busta Shinjuku — フロアマップ 2F / 3F / 4F
// ===========================================================================

const bustaCommon: Common = { stationId: null, asOf: '2026-11', geometryConfidence: 'schematic' };
const bustaProv = p2([S_BUSTA]);
const BU = {
  l3: 'sk:level:busta-shinjuku-3f',
  l4: 'sk:level:busta-shinjuku-4f',
  f3: 'sk:area:busta-3f',
  f4: 'sk:area:busta-4f',
};

const bustaLevels: Level[] = [
  level(BU.l3, BUSTA, '3F', 2, 8, bustaProv, bustaCommon, 'Above the JR 2F concourse of 新南改札 / 甲州街道改札 / ミライナタワー改札.'),
  level(BU.l4, BUSTA, '4F', 3, 12, bustaProv, bustaCommon),
];

const bustaAreas: Area[] = [
  concourse(BU.f3, BU.l3, 'unpaid', names('バスタ新宿 3F（タクシーのりば・高速バス降車場）', 'Busta Shinjuku 3F (taxi stand, expressway bus drop-off)', 'Busta 新宿 3F（出租车乘车处·高速巴士下车处）'),
    [rect(25, 35.5, -19.5, 12)], pt(30, -4), bustaProv, bustaCommon,
    'One area for the whole floor. The Busta map also labels 東京都観光案内所 and a 歩行者デッキ on this floor.'),
  concourse(BU.f4, BU.l4, 'unpaid', names('バスタ新宿 4F（高速バスのりば A〜D）', 'Busta Shinjuku 4F (expressway bus boarding, areas A–D)', 'Busta 新宿 4F（高速巴士乘车处 A～D）'),
    [rect(25, 35.5, -19.5, 12)], pt(30, -4), bustaProv, bustaCommon,
    'One area for the whole floor. The Busta map divides the boarding bays into A (A1–A3), B (B4–B6), C (C7–C9) and D (D10–D12).'),
];

const bustaEntrances: Entrance[] = [
  entrance('busta-4f-bus-boarding', BU.l4, BU.f4, names('高速バスのりば（A〜Dエリア）', 'Expressway bus boarding (areas A–D)', '高速巴士乘车处（A～D区）'), pt(28, 2),
    '高速バス・空港バス', 'expressway and airport buses', bustaProv, { common: bustaCommon, stepFree: true }),
  entrance('busta-3f-taxi', BU.l3, BU.f3, names('タクシーのりば', 'Taxi stand', '出租车乘车处'), pt(28, -8),
    'タクシー乗車場・高速バス降車場', 'taxi stand; expressway bus drop-off', bustaProv, { common: bustaCommon, stepFree: true }),
];

const BUSTA_2F = 'Drawn on the Busta 2F map with the callout "4F 高速バス / 3F タクシー".';
const bustaLift = (slug: string, areaId: string, at: PlanPoint, where: string): VerticalFacility =>
  vertical(`busta-elevator-${slug}`, 'elevator', names(`エレベーター（${where} 2F ⇔ 3F ⇔ 4F）`, `Elevator (${slug} side, 2F ⇔ 3F ⇔ 4F)`, `电梯（${where} 2F ⇔ 3F ⇔ 4F）`),
    [{ levelId: LV.jr2, areaId, at }, { levelId: BU.l3, areaId: BU.f3, at }, { levelId: BU.l4, areaId: BU.f4, at }],
    p2([S_BUSTA, S_JR_2F]), { common: bustaCommon, notes: BUSTA_2F });

const bustaVerticals: VerticalFacility[] = [
  vertical('busta-escalator-new-south-direct-4f', 'escalator', names('4F直結エスカレーター', 'Escalator direct to 4F', '直达4F的自动扶梯'),
    [{ levelId: LV.jr2, areaId: A.newSouthUnpaid, at: pt(33, -3.4) }, { levelId: BU.l4, areaId: BU.f4, at: pt(33, -0.6) }],
    p2([S_BUSTA, S_JR_2F]), { common: bustaCommon, nonAdjacent: true, notes: 'Printed "4F直結" outside 新南改札 on the Busta 2F map and "2F直結" on the 4F map. It does not stop on 3F.' }),
  vertical('busta-escalator-new-south', 'escalator', unnamed,
    [{ levelId: LV.jr2, areaId: A.newSouthUnpaid, at: pt(33.4, 4.8) }, { levelId: BU.l3, areaId: BU.f3, at: pt(33.4, 7.2) }, { levelId: BU.l4, areaId: BU.f4, at: pt(33.4, 9.6) }],
    p2([S_BUSTA, S_JR_2F]), { common: bustaCommon, notes: `${BUSTA_2F} ${AGG_ESC}` }),
  bustaLift('new-south', A.newSouthUnpaid, pt(34.4, 2.4), '新南改札側'),
  bustaLift('koshu-kaido', A.koshuUnpaid, pt(25.8, 1), '甲州街道側'),
  bustaLift('miraina-tower', A.mirainaUnpaid, pt(30.4, -17.6), 'ミライナタワー側'),
];

// ===========================================================================
// links between operators
// ===========================================================================

const TM_DATE = 'The sheet is dated 2020年7月現在, older than the operator drawings.';

// --- 西口地下広場: a public space that belongs to no operator ---------------------------
const pubCommon: Common = { stationId: null, asOf: '2020-07', geometryConfidence: 'unknown' };
const pubProv = p2([S_TERMINAL]);
const PUB = {
  lB1: 'sk:level:public-west-plaza-b1f',
  plaza: 'sk:area:west-exit-underground-plaza',
};
const publicLevels: Level[] = [
  level(PUB.lB1, PUBLIC, 'B1F', -1, -4, pubProv, pubCommon, 'Drawn level with the JR and Odakyu B1F. Relative heights are not from a source.'),
];
const publicAreas: Area[] = [
  concourse(PUB.plaza, PUB.lB1, 'unpaid', names('西口地下広場', 'West Exit underground plaza (West Concourse)', '西口地下广场'),
    [rect(-24.4, -4.6, 25, 31), rect(-18.5, -15, 22, 25)], pt(-14, 28), pubProv, pubCommon,
    `Named "西口地下広場 West Concourse" on the underground sheet of the 新宿ターミナルマップ, which draws it as one walkable space between JR 西改札, the Odakyu 西口地下改札, 京王西口 and the Marunouchi Line passage. ${TM_DATE} The west exit is being rebuilt.`),
];
const publicEntrances: Entrance[] = [
  entrance('west-plaza-street-stairs', PUB.lB1, PUB.plaza, names('地上への階段（1〜18）', 'Stairs to street level (1–18)', '通往地面的楼梯（1～18）'), pt(-14, 31),
    '西口バスのりば・タクシーのりば', 'West Exit bus stops and taxi stand', pubProv,
    { common: pubCommon, notes: `One entry for the numbered stairs drawn around the plaza; the street-level sheet prints 西口バスのりば above them. ${TM_DATE}` }),
];

const crossCommon: Common = { stationId: null, asOf: '2026-08', geometryConfidence: 'unknown' };
const inferred = (slug: string, from: string, to: string, srcs: string[], notes: string, stepFree: boolean | null = null): Passage =>
  link(slug, from, to, p2(srcs), stepFree, { inferred: true, common: crossCommon, notes: `INFERRED from signage text only: ${notes}` });
/** A link between operators that the 新宿ターミナルマップ draws as walkable. */
const drawn = (slug: string, from: string, to: string, srcs: string[], notes: string, stepFree: boolean | null = null): Passage =>
  link(slug, from, to, p2([S_TERMINAL, ...srcs]), stepFree, { common: pubCommon, notes: `${notes} ${TM_DATE}` });

const crossPassages: Passage[] = [
  drawn('jr-west-exit-to-west-plaza', A.westUnpaid, PUB.plaza, [S_JR_B1],
    'JR 西改札 opens onto 西口地下広場 on the underground sheet; JR prints "京王線へ／西口バスのりば／丸ノ内線" at the west end of its free passage.'),
  drawn('odakyu-west-underground-to-west-plaza', OD.plazaB1, PUB.plaza, [S_OD],
    'The space in front of the Odakyu 西口地下改札 runs into 西口地下広場; Odakyu prints "京王線", "丸ノ内線" and "JR線" there.'),
  drawn('keio-west-gate-to-west-plaza', A.keioWestUnpaid, PUB.plaza, [S_KEIO_LAYER],
    '京王西口 is drawn at the south edge of 西口地下広場; Keio prints "丸ノ内線 西口方面" and "JR線・小田急線へ 東口方面" outside it. The two are drawn at different heights here only because the Keio floor is.'),
  drawn('marunouchi-concourse-to-west-plaza', ME.conc, PUB.plaza, [S_METRO],
    'メトロ通路 with the Marunouchi Line gates runs along the north side of 西口地下広場 (exits A10–A13); Tokyo Metro prints "JR線・小田急線・京王線" at exit A12.'),
  drawn('jr-east-basement-to-marunouchi-concourse', A.eastUnpaid, ME.conc, [S_JR_B1, S_METRO],
    '東口地下通路 in front of JR 東改札 and 中央東改札 runs north into メトロ通路 at exit A9; JR prints "東京メトロ丸ノ内線へ" there and Tokyo Metro prints "JR線" at A9.'),
  drawn('jr-south-exit-to-odakyu-south-exit', A.southUnpaid, OD.south2, [S_JR_2F, S_JR_B1, S_OD],
    'The street-level sheet draws JR 南改札 and the Odakyu 南口改札 side by side on the pavement it calls 南口 (South Concourse). JR directs barrier-free transfers to the Odakyu and Keio lines to 南口.', true),
  drawn('jr-south-exit-to-koshu-kaido-gate-crossing', A.southUnpaid, A.koshuUnpaid, [S_JR_2F],
    'Outdoors: the pedestrian crossing over 甲州街道 drawn on the street-level sheet between 南口 and the side of 甲州街道改札 and バスタ新宿. A public road crossing, not a station passage.'),
  inferred('jr-central-west-outside-to-odakyu-west-underground', A.chuoWestUnpaid, OD.plazaB1, [S_JR_B1, S_OD],
    'Odakyu prints a second "JR線" arrow beside its B1F gate line, on the side where JR draws 中央西改札. JR draws only a ticket office outside that gate, and the 新宿ターミナルマップ does not settle it.'),
  link('keio-mall-to-new-line-concourse', A.keioMall, NL.conc, p2([S_NL_LAYER, S_KEIO_LAYER]), true,
    { common: nlCommon, notes: `京王モール runs into the new-line passage on the Keio 階層図. ${NL_GREEN}` }),
  link('keio-lumine-gate-outside-to-new-line-concourse', A.keioLumineUnpaid, NL.conc, p2([S_NL_LAYER, S_KEIO_LAYER]), null,
    { common: nlCommon, notes: 'Keio prints "新線新宿駅へ" outside ルミネ口, and the new-line 階層図 draws ルミネ口 on its B1F sheet beside the passage. Whether there are steps on the way was not read.' }),
  link('jr-2f-koshu-kaido-outside-to-miraina-outside', A.koshuUnpaid, A.mirainaUnpaid, p2([S_BUSTA]), null,
    { common: bustaCommon, notes: 'The Busta 2F map draws one continuous walkable area around the JR block, from 甲州街道改札 round the north-east corner to ミライナタワー改札.' }),
  link('jr-2f-miraina-outside-to-new-south-outside', A.mirainaUnpaid, A.newSouthUnpaid, p2([S_BUSTA]), null,
    { common: bustaCommon, notes: 'The Busta 2F map draws the walkable area continuing from ミライナタワー改札 to the 歩行者広場 outside 新南改札.' }),
];

// ===========================================================================

const railLines: RailLine[] = [
  line('odakyu-odakyu', ODAKYU, names('小田急線', 'Odakyu Line', '小田急线'), '#2f78c8', p2([S_OD, S_TERMINAL]), CONTRAST_NOTE),
  line('keio-new', KEIO, names('京王新線', 'Keio New Line', '京王新线'), '#c2327d', p2([S_NL, S_TERMINAL], 'Line letters as printed on the 新宿ターミナルマップ.'), CONTRAST_NOTE, 'KO'),
  line('toei-shinjuku', TOEI, names('都営新宿線', 'Toei Shinjuku Line', '都营新宿线'), '#8cb82b', p2([S_TOEI, S_TERMINAL], 'Line letter as printed on the Toei 立体図 (S 01).'),
    'Approximation of the green used for this line on the Toei 立体図. Not an official colour value.', 'S'),
  line('toei-oedo', TOEI, names('都営大江戸線', 'Toei Oedo Line', '都营大江户线'), '#c5215e', p2([S_TOEI, S_TERMINAL], 'Line letter as printed on the Toei 立体図 (E 27).'),
    'Approximation of the magenta used for this line on the Toei 立体図. Not an official colour value.', 'E'),
  line('tokyo-metro-marunouchi', METRO, names('丸ノ内線', 'Marunouchi Line', '丸之内线'), '#e2392f', p2([S_METRO], 'Line letter as printed on the Tokyo Metro 立体図 (M 08).'),
    'Approximation of the red used for this line on the Tokyo Metro 立体図. Not an official colour value.', 'M'),
];

const stations: Station[] = [
  station(ST_OD, ODAKYU, names('小田急線 新宿駅', 'Odakyu Line Shinjuku Station', '小田急线新宿站'), p2([S_OD]), [L_OD]),
  station(ST_NL, KEIO, names('京王新線・都営新宿線 新宿駅', 'Keio New Line / Toei Shinjuku Line Shinjuku Station', '京王新线·都营新宿线新宿站'),
    p2([S_NL, S_TOEI], 'Toei: "この駅は京王電鉄の管理駅です".'), [L_NL, L_TS]),
  station(ST_OEDO, TOEI, names('都営大江戸線 新宿駅', 'Toei Oedo Line Shinjuku Station', '都营大江户线新宿站'), p2([S_TOEI]), [L_OEDO]),
  station(ST_METRO, METRO, names('東京メトロ丸ノ内線 新宿駅', 'Tokyo Metro Marunouchi Line Shinjuku Station', '东京地铁丸之内线新宿站'), p2([S_METRO]), [L_MARU]),
];

// Every gate now leads somewhere that was read from a drawing; nothing is left as an abstract block.
const unverifiedBlocks: UnverifiedBlock[] = [];

export const extensions = {
  railLines,
  stations,
  levels: [...odLevels, ...nlLevels, ...oedoLevels, ...metroLevels, ...bustaLevels, ...publicLevels],
  areas: [...odAreas, ...nlAreas, ...oedoAreas, ...metroAreas, ...bustaAreas, ...publicAreas],
  passages: [...odPassages, ...crossPassages],
  gates: [...odGates, ...nlGates, ...oedoGates, ...metroGates],
  entrances: [...odEntrances, ...nlEntrances, ...oedoEntrances, ...metroEntrances, ...bustaEntrances, ...publicEntrances],
  verticals: [...odVerticals, ...nlVerticals, ...oedoVerticals, ...metroVerticals, ...bustaVerticals],
  unverifiedBlocks,
};

export const EXT_IDS = { OD, NL, OE, ME, BU, PUB } as const;
