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
  RailLine, ServiceKind, ServicePoint, Station, UnverifiedBlock, VerticalFacility, VerticalKind,
} from '../../src/domain/types';
import {
  A, AGG, AGG_ESC, BUSTA, D2, KEIO, LV, METRO, ODAKYU, PAID_KEIO, PUBLIC, SEIBU, TOEI, X,
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
const S_BUSTA_SERVICE = 'src:busta-service-page';
const S_JR_B1 = 'src:jreast-floormap-b1f';
const S_JR_2F = 'src:jreast-floormap-2f';

const ELEV = 'Schematic. Floor heights were not measured; only the vertical order is taken from the source.';

export function level(id: string, operatorId: string, label: string, ordinal: number, elevation: number, p: Provenance, c: Common, notes?: string): Level {
  return { kind: 'level', ...base(id, names(label, label, label), p, c, notes), operatorId, label, ordinal, elevation, elevationNote: ELEV };
}
export function platform(
  id: string, levelId: string, fareZone: FareZone, n: Names, footprint: PlanRect, anchor: PlanPoint, tracks: PlatformTrack[],
  p: Provenance, c: Common, notes?: string,
): Platform {
  return { kind: 'platform', ...base(id, n, p, c, notes), levelId, fareZone, footprint: [footprint], anchor, tracks };
}
export function station(id: string, operatorId: string, n: Names, p: Provenance, railLineIds: string[]): Station {
  return { kind: 'station', ...entity(id, n, p), operatorId, complexId: COMPLEX, railLineIds };
}
/** A staircase and an escalator bank side by side between the same two areas. */
export function pair(
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
    { common: metroCommon, notes: '新宿西口 is a different station (Oedo Line E 01); it is modelled as its own station, and its B1F passage is linked to this one.' }),
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
export const BU = {
  l3: 'sk:level:busta-shinjuku-3f',
  l4: 'sk:level:busta-shinjuku-4f',
  // 3F
  taxi3: 'sk:area:busta-3f-taxi',
  west3: 'sk:area:busta-3f-west-walkway',
  island3: 'sk:area:busta-3f-bus-drop-off-centre',
  deck3: 'sk:area:busta-3f-deck',
  tic3: 'sk:area:busta-3f-tourist-information',
  east3: 'sk:area:busta-3f-east-walkway',
  // 4F
  areaA: 'sk:area:busta-4f-area-a',
  areaB: 'sk:area:busta-4f-area-b',
  areaC: 'sk:area:busta-4f-area-c',
  areaD: 'sk:area:busta-4f-area-d',
  road3: 'sk:area:busta-3f-roadway',
  road4: 'sk:area:busta-4f-roadway',
  hall4: 'sk:area:busta-4f-hall',
  south4: 'sk:area:busta-4f-south-walkway',
};

const bustaLevels: Level[] = [
  level(BU.l3, BUSTA, '3F', 2, 8, bustaProv, bustaCommon, 'Above the JR 2F concourse of 新南改札 / 甲州街道改札 / ミライナタワー改札. The Busta site calls it 高速バスおりばフロア.'),
  level(BU.l4, BUSTA, '4F', 3, 12, bustaProv, bustaCommon, 'The Busta site calls it 高速バスのりばフロア.'),
];

// Both floors are a ring of walkways round a roadway. The walkways are ordinary areas. The roadway is one
// area per floor in the zone "roadway": it is drawn, nothing connects to it, and no route crosses it
// (the one marked pedestrian crossing on 3F is a passage between two walkways). The bus bays and the
// planted islands inside the roadway are not drawn separately.
// North is 甲州街道 (x = 24), east is ミライナタワー (z = -19.5).
const NO_NAME = 'Unnamed on the floor map; the name here only says where it is.';
const boardingArea = (id: string, letter: string, bays: string, footprint: PlanRect[], anchor: PlanPoint, where: string): Area =>
  concourse(id, BU.l4, 'unpaid',
    names(`高速バスのりば ${letter}エリア（${bays}）`, `Expressway bus boarding, Area ${letter} (${bays.replace('〜', '–')})`, `高速巴士乘车处 ${letter}区（${bays.replace('〜', '～')}）`),
    footprint, anchor, bustaProv, bustaCommon,
    `The 4F map prints "${letter} エリア ${bays.replace('〜', '▸')}" ${where}. The walkway beside the bays is the area; the bays stand on the roadway.`);

const bustaAreas: Area[] = [
  // ---- 3F ----
  concourse(BU.taxi3, BU.l3, 'unpaid', names('タクシー乗車場・降車場', 'Taxi stand and taxi drop-off', '出租车乘车处·下车处'),
    [rect(24, 25.6, -15.4, 14)], pt(24.8, 0), bustaProv, bustaCommon,
    'The walkway along the north (甲州街道) side of 3F: the map prints タクシー乗車場 on its western part and タクシー降車場 further east.'),
  concourse(BU.west3, BU.l3, 'unpaid', names('3F 西側通路', '3F west walkway', '3F 西侧通道'),
    [rect(25.6, 32.6, 11.6, 14)], pt(29, 12.8), bustaProv, bustaCommon,
    `${NO_NAME} The strip drawn along the west edge of 3F, from the north-west lift down to 東京都観光案内所.`),
  concourse(BU.island3, BU.l3, 'unpaid', names('高速バス降車場（中央）', 'Expressway bus drop-off (centre island)', '高速巴士下车处（中央）'),
    [rect(28, 30, -9, 8.6)], pt(29, 0), bustaProv, bustaCommon,
    'The island in the middle of the roadway that the map labels 高速バス降車場. "（中央）" is added here to tell it from the second 高速バス降車場 beside the deck.'),
  concourse(BU.deck3, BU.l3, 'unpaid', names('歩行者デッキ・高速バス降車場', 'Pedestrian deck and expressway bus drop-off', '步行平台·高速巴士下车处'),
    [rect(32.6, 35.5, -16.5, 8), rect(32.6, 33.6, 8, 14)], pt(34, -2), bustaProv, bustaCommon,
    'The south side of 3F: the map prints 高速バス降車場 along the roadway and 歩行者デッキ behind it, with a dashed line between the two. Toilets and a 授乳室 are drawn at its west end.'),
  concourse(BU.tic3, BU.l3, 'unpaid', names('東京都観光案内所', 'Tokyo Tourist Information Center', '东京都观光咨询处'),
    [rect(33.6, 35.5, 8, 14)], pt(34.6, 11), bustaProv, bustaCommon,
    'Drawn in the south-west corner of 3F, opening onto the deck. Only the Japanese name is on the map; the other two are this model\'s renderings.'),
  concourse(BU.east3, BU.l3, 'unpaid', names('3F 東側通路（ミライナタワー側）', '3F east walkway (Miraina Tower side)', '3F 东侧通道（Miraina Tower 侧）'),
    [rect(24, 31.4, -19.5, -15.4)], pt(28, -17.4), bustaProv, bustaCommon,
    `${NO_NAME} The strip along the east edge of 3F with a lift and escalators; the map prints "▶ ミライナタワー" at its edge. The roadway leaves the building south of it, so it does not reach the deck on this floor.`),
  concourse(BU.road3, BU.l3, 'roadway', names('車路（バス・タクシー）', 'Roadway (buses and taxis)', '车道（巴士·出租车）'),
    [rect(25.6, 28, -15.4, 11.6), rect(28, 30, 8.6, 11.6), rect(28, 30, -15.4, -9), rect(30, 32.6, -15.4, 11.6), rect(31.4, 32.6, -19.5, -15.4)], pt(26.8, -2), bustaProv, bustaCommon,
    `${NO_NAME} The grey roadway of the 3F map, with lanes marked タクシー, バス専用 and 高速バス専用; it leaves the building at the south-east. Not a place to walk: nothing in the model connects to it.`),
  // ---- 4F ----
  concourse(BU.road4, BU.l4, 'roadway', names('車路（高速バス）', 'Roadway (expressway buses)', '车道（高速巴士）'),
    [rect(25.4, 31.6, -10.6, 11.6), rect(31.6, 32.6, 7, 11.6), rect(32.6, 33.4, -10.6, 11.6)], pt(28.4, 0.5), bustaProv, bustaCommon,
    `${NO_NAME} The grey roadway of the 4F map that the bays A1–D12 stand on, with a planted island and parking bays in the middle. Not a place to walk: nothing in the model connects to it.`),
  boardingArea(BU.areaA, 'A', 'A1〜A3', [rect(31.6, 32.6, -10.6, 7)], pt(32.1, 0.8), 'on the tongue of walkway that runs west from the hall, labelled 高速バス乗車場'),
  boardingArea(BU.areaB, 'B', 'B4〜B6', [rect(25.4, 33.4, -12.6, -10.6)], pt(28.5, -11.6), 'on the east side, in front of the waiting rooms'),
  boardingArea(BU.areaC, 'C', 'C7〜C9', [rect(24, 25.4, -12.6, 14)], pt(24.7, 0.4), 'on the north side, labelled 高速バス乗車場 (甲州街道)'),
  boardingArea(BU.areaD, 'D', 'D10〜D12', [rect(25.4, 33.4, 11.6, 14)], pt(29.4, 12.8), 'on the west side'),
  concourse(BU.hall4, BU.l4, 'unpaid', names('4F 待合室・発券カウンター', '4F waiting room and ticket counters', '4F 候车室·售票柜台'),
    [rect(24, 33.4, -19.5, -12.6)], pt(28.6, -16), bustaProv, bustaCommon,
    'The east side of 4F. Read from the map by matching its pictograms to the legend on the page: three 待合室 blocks behind Area B; a counter strip with 有人発券窓口 between two 自動発券機; 土産品; an インフォメーションカウンター, an ATM, a コンビニエンスストア and コインロッカー towards the south; toilets, a 授乳室 and a 女子更衣室 in the north-east corner. One area stands for all of them: none is a separate room in this model.'),
  concourse(BU.south4, BU.l4, 'unpaid', names('4F 南側通路', '4F south walkway', '4F 南侧通道'),
    [rect(33.4, 35.5, -19.5, 14)], pt(34.4, -2), bustaProv, bustaCommon,
    `${NO_NAME} The walkway along the south edge of 4F, where the lifts and escalators from the 2F 歩行者広場 arrive ("2F直結"); toilets, a 授乳室 and コインロッカー are drawn on it.`),
];

const FLAT = 'Drawn as one continuous floor on the map; whether there is a step or a door on the way was not read.';
const bustaLink = (slug: string, from: string, to: string, notes: string): Passage =>
  link(`busta-${slug}`, from, to, bustaProv, null, { common: bustaCommon, notes: `${notes} ${FLAT}` });

const bustaPassages: Passage[] = [
  // 4F ring
  bustaLink('4f-hall-to-area-b', BU.hall4, BU.areaB, 'Area B is the walkway in front of the waiting rooms.'),
  bustaLink('4f-area-b-to-area-a', BU.areaB, BU.areaA, 'The tongue of Area A leaves the east side at its south end.'),
  bustaLink('4f-area-b-to-area-c', BU.areaB, BU.areaC, 'The north-east corner, where the north walkway meets the east side.'),
  bustaLink('4f-hall-to-area-c', BU.hall4, BU.areaC, 'The north-east corner, beside the lift and the toilets.'),
  bustaLink('4f-area-c-to-area-d', BU.areaC, BU.areaD, 'The north-west corner, beside the lift and the escalator.'),
  bustaLink('4f-area-d-to-south-walkway', BU.areaD, BU.south4, 'The south-west corner.'),
  bustaLink('4f-hall-to-south-walkway', BU.hall4, BU.south4, 'The south-east corner, past the インフォメーションカウンター.'),
  // 3F
  bustaLink('3f-taxi-to-west-walkway', BU.taxi3, BU.west3, 'The north-west corner, beside the lift and the escalator.'),
  bustaLink('3f-taxi-to-east-walkway', BU.taxi3, BU.east3, 'The north-east corner: the walkway is read as continuing past the head of the roadway loop to the lift.'),
  bustaLink('3f-west-walkway-to-deck', BU.west3, BU.deck3, 'The south-west corner, beside the toilets.'),
  bustaLink('3f-deck-to-tourist-information', BU.deck3, BU.tic3, '東京都観光案内所 opens onto the deck.'),
  link('busta-3f-west-walkway-to-bus-drop-off-centre', BU.west3, BU.island3, bustaProv, null,
    { common: bustaCommon, notes: 'The pedestrian crossing (white stripes) drawn across the roadway at the west end of the island. A crossing of the bus and taxi roadway, not a corridor.' }),
];

const BAY_NOTE = 'Which services leave from this bay is not on the floor map: the terminal announces the bay for each departure.';
const bay = (code: string, areaId: string, at: PlanPoint): Entrance =>
  entrance(`busta-4f-bay-${code.toLowerCase()}`, BU.l4, areaId, names(`${code} のりば`, `Bay ${code}`, `${code} 乘车位`), at,
    '高速バス', 'expressway buses', bustaProv, { common: bustaCommon, stepFree: null, notes: BAY_NOTE });

const bustaEntrances: Entrance[] = [
  bay('A1', BU.areaA, pt(31.6, 5.6)), bay('A2', BU.areaA, pt(31.6, 0.8)), bay('A3', BU.areaA, pt(31.6, -3.8)),
  bay('B4', BU.areaB, pt(30.6, -10.6)), bay('B5', BU.areaB, pt(28.4, -10.6)), bay('B6', BU.areaB, pt(26.4, -10.6)),
  bay('C7', BU.areaC, pt(25.4, -4.3)), bay('C8', BU.areaC, pt(25.4, 0.3)), bay('C9', BU.areaC, pt(25.4, 4.9)),
  bay('D10', BU.areaD, pt(26.5, 11.6)), bay('D11', BU.areaD, pt(28.9, 11.6)), bay('D12', BU.areaD, pt(31.3, 11.6)),
  entrance('busta-4f-miraina-tower-side', BU.l4, BU.hall4, names('ミライナタワー方面（4F）', 'Towards Miraina Tower (4F)', '往 Miraina Tower（4F）'), pt(29.6, -19.5),
    'ミライナタワー', 'Miraina Tower', bustaProv, { common: bustaCommon, stepFree: null, notes: 'Printed as "▶ ミライナタワー" at the east edge of the 4F map. What lies beyond the edge is not drawn.' }),
  entrance('busta-3f-taxi', BU.l3, BU.taxi3, names('タクシー乗車場', 'Taxi stand', '出租车乘车处'), pt(25.6, 3),
    'タクシー', 'taxis', bustaProv, { common: bustaCommon, stepFree: null }),
  entrance('busta-3f-taxi-drop-off', BU.l3, BU.taxi3, names('タクシー降車場', 'Taxi drop-off', '出租车下车处'), pt(25.6, -4.8),
    'タクシー', 'taxis', bustaProv, { common: bustaCommon, stepFree: null }),
  entrance('busta-3f-bus-drop-off-centre', BU.l3, BU.island3, names('高速バス降車場（中央）', 'Expressway bus drop-off (centre island)', '高速巴士下车处（中央）'), pt(30, 1.4),
    '高速バス（到着）', 'arriving expressway buses', bustaProv, { common: bustaCommon, stepFree: null, notes: 'Where arriving buses set passengers down, on the island. "（中央）" is added here.' }),
  entrance('busta-3f-bus-drop-off-deck', BU.l3, BU.deck3, names('高速バス降車場（歩行者デッキ側）', 'Expressway bus drop-off (deck side)', '高速巴士下车处（步行平台侧）'), pt(32.6, 1),
    '高速バス（到着）', 'arriving expressway buses', bustaProv, { common: bustaCommon, stepFree: null, notes: 'Where arriving buses set passengers down, along the deck. "（歩行者デッキ側）" is added here.' }),
  entrance('busta-3f-miraina-tower-side', BU.l3, BU.east3, names('ミライナタワー方面（3F）', 'Towards Miraina Tower (3F)', '往 Miraina Tower（3F）'), pt(28.6, -19.5),
    'ミライナタワー', 'Miraina Tower', bustaProv, { common: bustaCommon, stepFree: null, notes: 'Printed as "▶ ミライナタワー" at the east edge of the 3F map. What lies beyond the edge is not drawn.' }),
];

const BUSTA_2F = 'Drawn on the Busta 2F map with the callout "4F 高速バス / 3F タクシー", and at the same place on the 3F and 4F maps.';
type BustaStops = [a2: string, a3: string, a4: string];
const bustaLift = (slug: string, areas: BustaStops, at: PlanPoint, where: string, whereEn: string): VerticalFacility =>
  vertical(`busta-elevator-${slug}`, 'elevator', names(`エレベーター（${where} 2F ⇔ 3F ⇔ 4F）`, `Elevator (${whereEn}, 2F ⇔ 3F ⇔ 4F)`, `电梯（${where} 2F ⇔ 3F ⇔ 4F）`),
    [{ levelId: LV.jr2, areaId: areas[0], at }, { levelId: BU.l3, areaId: areas[1], at }, { levelId: BU.l4, areaId: areas[2], at }],
    p2([S_BUSTA, S_JR_2F]), { common: bustaCommon, notes: BUSTA_2F });
const BUSTA_LEVELS = [LV.jr2, BU.l3, BU.l4];
const bustaEsc = (slug: string, stops: [string, PlanPoint][], notes: string): VerticalFacility =>
  vertical(`busta-escalator-${slug}`, 'escalator', unnamed,
    stops.map(([areaId, at], i) => ({ levelId: BUSTA_LEVELS[i]!, areaId, at })),
    p2([S_BUSTA, S_JR_2F]), { common: bustaCommon, aggregated: true, notes: `${notes} ${AGG_ESC}` });

const bustaVerticals: VerticalFacility[] = [
  vertical('busta-escalator-new-south-direct-4f', 'escalator', names('4F直結エスカレーター', 'Escalator direct to 4F', '直达4F的自动扶梯'),
    [{ levelId: LV.jr2, areaId: A.newSouthUnpaid, at: pt(33, -5.4) }, { levelId: BU.l4, areaId: BU.south4, at: pt(33.9, -11.8) }],
    p2([S_BUSTA, S_JR_2F]), { common: bustaCommon, nonAdjacent: true, notes: 'Printed "4F直結" outside 新南改札 on the Busta 2F map and "2F直結" on the 4F map. It does not stop on 3F.' }),
  bustaEsc('new-south', [[A.newSouthUnpaid, pt(33.6, 1.6)], [BU.deck3, pt(34.2, -1.2)], [BU.south4, pt(34.2, -5.6)]],
    'The escalators west of the 4F直結 one: 2F 歩行者広場 → 3F 歩行者デッキ → 4F south walkway. The 2F callout names both floors.'),
  bustaEsc('south-east', [[A.newSouthUnpaid, pt(34.6, -17.8)], [BU.deck3, pt(34.8, -13.8)], [BU.south4, pt(33.9, -15.8)]],
    'The escalators at the south-east corner, beside the wide stairs towards タカシマヤ タイムズスクエア. The 2F callout names both floors.'),
  bustaEsc('koshu-kaido', [[A.koshuUnpaid, pt(24.8, 10.6)], [BU.taxi3, pt(24.6, 6.4)], [BU.areaC, pt(24.6, 9)]],
    'The escalators at the north-west corner, on the 甲州街道 side.'),
  bustaEsc('miraina-tower', [[A.mirainaUnpaid, pt(24.8, -18.6)], [BU.east3, pt(27.6, -18.2)], [BU.hall4, pt(30.2, -18.4)]],
    'The escalators on the east (ミライナタワー) side: one at the north-east corner on 2F, two on 3F, one on 4F.'),
  vertical('busta-stairs-south-east', 'stairs', unnamed,
    [{ levelId: LV.jr2, areaId: A.newSouthUnpaid, at: pt(35, -18.8) }, { levelId: BU.l3, areaId: BU.deck3, at: pt(35.1, -15.6) }],
    p2([S_BUSTA]), { common: bustaCommon, notes: 'The wide flight drawn at the south-east corner of the 3F deck and, on the 2F map, beside the escalator towards タカシマヤ タイムズスクエア.' }),
  bustaLift('koshu-kaido', [A.koshuUnpaid, BU.taxi3, BU.areaC], pt(24.8, 12.6), '甲州街道側・北西', 'Koshu-kaido side, north-west'),
  bustaLift('miraina-tower', [A.mirainaUnpaid, BU.east3, BU.hall4], pt(25.4, -17.6), 'ミライナタワー側・北東', 'Miraina Tower side, north-east'),
  bustaLift('new-south', [A.newSouthUnpaid, BU.deck3, BU.south4], pt(34.6, 5.2), '新南改札側・西', 'New South Gate side, west'),
  bustaLift('new-south-east', [A.newSouthUnpaid, BU.deck3, BU.south4], pt(34.6, -8.6), '新南改札側・東', 'New South Gate side, east'),
];

// ===========================================================================
// links between operators
// ===========================================================================

const TM_DATE = 'The sheet is dated 2020年7月現在, older than the operator drawings.';

// --- 西口地下広場: a public space that belongs to no operator ---------------------------
const pubCommon: Common = { stationId: null, asOf: '2020-07', geometryConfidence: 'unknown' };
const pubProv = p2([S_TERMINAL]);
const PUB = {
  lB1: 'sk:level:public-b1f',
  plaza: 'sk:area:west-exit-underground-plaza',
  subnade: 'sk:area:subnade-underground-mall',
};
const publicLevels: Level[] = [
  level(PUB.lB1, PUBLIC, 'B1F', -1, -4, pubProv, pubCommon, 'Drawn level with the JR and Odakyu B1F. Relative heights are not from a source.'),
];
const publicAreas: Area[] = [
  concourse(PUB.plaza, PUB.lB1, 'unpaid', names('西口地下広場', 'West Exit underground plaza (West Concourse)', '西口地下广场'),
    [rect(-24.4, -4.6, 25, 31), rect(-18.5, -15, 22, 25)], pt(-14, 28), pubProv, pubCommon,
    `Named "西口地下広場 West Concourse" on the underground sheet of the 新宿ターミナルマップ, which draws it as one walkable space between JR 西改札, the Odakyu 西口地下改札, 京王西口 and the Marunouchi Line passage. ${TM_DATE} The west exit is being rebuilt.`),
];
publicAreas.push(
  passageArea(PUB.subnade, PUB.lB1, 'unpaid', names('サブナード（地下街）', 'Subnade (underground mall)', 'Subnade 地下街'),
    [rect(-30, -27, -16, -14), rect(-32, -30, -16, -4), rect(-36, -32, -6, -4)], pt(-31, -10), pubProv, pubCommon,
    `Named "サブナード Subnade" on the underground sheet of the 新宿ターミナルマップ: a passage leaves メトロ通路 near exits B10 / B11, meets the mall, and the mall ends at 新宿プリンスホテル with the stairs numbered 1 and 2. Entered as one passage; the shops and the stairs 3–22 are left out. ${TM_DATE}`),
);
const publicEntrances: Entrance[] = [
  entrance('west-plaza-street-stairs', PUB.lB1, PUB.plaza, names('地上への階段（1〜18）', 'Stairs to street level (1–18)', '通往地面的楼梯（1～18）'), pt(-14, 31),
    '西口バスのりば・タクシーのりば', 'West Exit bus stops and taxi stand', pubProv,
    { common: pubCommon, notes: `One entry for the numbered stairs drawn around the plaza; the street-level sheet prints 西口バスのりば above them. ${TM_DATE}` }),
];

const crossCommon: Common = { stationId: null, asOf: '2026-08', geometryConfidence: 'unknown' };
const S_OD_IC = 'src:odakyu-shinjuku-ic-gate-notice';
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
  drawn('marunouchi-concourse-to-subnade', ME.conc, PUB.subnade, [S_METRO],
    'A passage with the stairs numbered 17–22 leaves メトロ通路 beside exits B10 / B11 and runs north into サブナード; Tokyo Metro prints "西武新宿線へ・サブナード方面" at B10 / B11.'),
  link('jr-central-west-outside-to-odakyu-west-underground', A.chuoWestUnpaid, OD.plazaB1, p2([S_OD_IC, S_OD, S_JR_B1]), null,
    { common: crossCommon, notes: 'The map of the Odakyu notice of 2026-07-30 draws an arrow from the space outside 西口地下改札口 down to "JR中央西改札（6：00～終電）", without passing another gate. The Odakyu floor plan prints "JR線" at the same corner, and the JR B1F map draws the unpaid side of 中央西改札 (ticket office) running that way. Until 2026-11-17 this link was marked as inferred from signage. Steps on the way were not read; the wheelchair route of the Odakyu plan does not use it.' }),
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
// Seibu-Shinjuku — 西武新宿駅 駅構内のご案内 (SS01.png), 2025.6.26
// A separate station north of the others; the 新宿ターミナルマップ counts the
// Seibu Line among the lines of the terminal and draws サブナード leading to it.
// ===========================================================================

const ST_SEIBU = 'sk:station:seibu-shinjuku';
const PAID_SEIBU: FareZone = 'paid:seibu';
const S_SEIBU = 'src:seibu-shinjuku-map';
const seibuCommon: Common = { stationId: ST_SEIBU, asOf: '2025-06', geometryConfidence: 'schematic' };
const seibuProv = p2([S_SEIBU]);
const L_SEIBU = 'sk:line:seibu-shinjuku';
const SEIBU_TOWARDS = svc(L_SEIBU, '所沢・本川越・拝島方面', 'for Tokorozawa, Hon-Kawagoe, Haijima');
const SEIBU_PINK = 'On the wheelchair route (pink dotted line) of the Seibu drawing.';

const SB = {
  l2: 'sk:level:seibu-shinjuku-2f',
  l1: 'sk:level:seibu-shinjuku-1f',
  conc: 'sk:area:seibu-2f-concourse',
  out2: 'sk:area:seibu-2f-front-gate-unpaid',
  front1: 'sk:area:seibu-1f-front',
  northIn: 'sk:area:seibu-1f-north-gate-inside',
  northOut: 'sk:area:seibu-1f-north-gate-unpaid',
  p1: 'sk:platform:seibu-shinjuku-1',
  p23: 'sk:platform:seibu-shinjuku-2-3',
};

const seibuLevels: Level[] = [
  level(SB.l2, SEIBU, '2F', 1, 4, seibuProv, seibuCommon, 'Platforms 1–3 and the concourse of 正面口.'),
  level(SB.l1, SEIBU, '1F', 0, 0, seibuProv, seibuCommon, 'Street level in front of 正面口, and 北口.'),
];

const seibuAreas: Area[] = [
  concourse(SB.conc, SB.l2, PAID_SEIBU, names('正面口 改札内コンコース（2F）', 'Concourse inside Front Gate (2F)', '正面口站厅（付费区，2F）'),
    [rect(-50, -46.8, -8, -2)], pt(-48.4, -5), seibuProv, seibuCommon, 'Unnamed on the drawing; the label is descriptive. The head of the three tracks.'),
  concourse(SB.out2, SB.l2, 'unpaid', names('正面口 改札外コンコース（2F）', 'Outside Front Gate (2F)', '正面口检票口外（2F）'),
    [rect(-46, -41, -8, -2)], pt(-43.5, -5), seibuProv, seibuCommon, 'お客さまご案内カウンター and the ticket machines are drawn on this side.'),
  concourse(SB.front1, SB.l1, 'unpaid', names('正面口 1F（駅前）', 'Front Entrance, street level (1F)', '正面口 1F（站前）'),
    [rect(-42, -36.6, -9, -1)], pt(-39, -5), p2([S_SEIBU, S_TERMINAL]), seibuCommon,
    'The 1F floor below the concourse, open to the street; the 新宿ターミナルマップ calls the place in front of it 西武新宿駅前.'),
  concourse(SB.northIn, SB.l1, PAID_SEIBU, names('北口 改札内（1F）', 'Inside North Gate (1F)', '北口检票口内（1F）'),
    [rect(-82, -79, -8, -2.4)], pt(-80.5, -5), seibuProv, seibuCommon, 'The landing at the foot of the stairs from the north end of the platforms; toilets are drawn beside it.'),
  concourse(SB.northOut, SB.l1, 'unpaid', names('北口 改札外（1F）', 'Outside North Gate (1F)', '北口检票口外（1F）'),
    [rect(-86, -82.8, -8, -2.4)], pt(-84.4, -5), seibuProv, seibuCommon),
  platform(SB.p1, SB.l2, PAID_SEIBU, names('1番ホーム', 'Platform 1', '1号站台'), rect(-78, -50, -7.6, -6), pt(-62, -6.8),
    [{ number: '1', services: [SEIBU_TOWARDS], side: 'z+' }], seibuProv, seibuCommon,
    'The nearer of the two platform slabs on the drawing, with track 1 on its far side. Printed: "①②③ 所沢・本川越・拝島方面のりば".'),
  platform(SB.p23, SB.l2, PAID_SEIBU, names('2・3番ホーム', 'Platforms 2–3', '2·3号站台'), rect(-78, -50, -4.6, -3), pt(-62, -3.8),
    [{ number: '2', services: [SEIBU_TOWARDS], side: 'z-' }, { number: '3', services: [SEIBU_TOWARDS], side: 'z+' }], seibuProv, seibuCommon,
    'The farther slab: track 2 on its near side, track 3 on its far side. The drawing has no compass; "far" is entered as west here, which is an assumption about its viewpoint.'),
];

const seibuPassages: Passage[] = [
  link('seibu-2f-concourse-to-platform-1', SB.conc, SB.p1, seibuProv, true, { common: seibuCommon, notes: SEIBU_PINK }),
  link('seibu-2f-concourse-to-platform-2-3', SB.conc, SB.p23, seibuProv, true, { common: seibuCommon, notes: SEIBU_PINK }),
];

const seibuGates: Gate[] = [
  gate('seibu-front-gate', SB.l2, names('正面口', 'Front Gate', '正面口'), pt(-46.4, -5), [a(SB.conc), a(SB.out2)], seibuProv,
    { common: seibuCommon, stepFree: true, notes: SEIBU_PINK }),
  gate('seibu-north-gate', SB.l1, names('北口', 'North Gate', '北口'), pt(-82.4, -5), [a(SB.northIn), a(SB.northOut)], seibuProv,
    { common: seibuCommon, hours: '7:00〜終電', notes: 'Printed: "7:00〜終電 この改札口でのお問合せはインターホンをご利用ください".' }),
];

const seibuEntrances: Entrance[] = [
  entrance('seibu-front-entrance', SB.l1, SB.front1, names('正面口（地上）', 'Front Entrance (street level)', '正面口（地面）'), pt(-36.6, -3),
    '西武新宿駅前', 'Seibu-Shinjuku station square', p2([S_SEIBU, S_TERMINAL]), { common: seibuCommon, stepFree: true, notes: `The label follows the gate name 正面口. ${SEIBU_PINK}` }),
  entrance('seibu-north-exit', SB.l1, SB.northOut, names('北口（地上）', 'North Exit (street level)', '北口（地面）'), pt(-86, -5),
    null, null, seibuProv, { common: seibuCommon, notes: 'The label follows the gate name 北口. No direction text is printed.' }),
];

const seibuVerticals: VerticalFacility[] = [
  ...pair('seibu-KIND-front-1f-to-2f', ['stairs', 'escalator'], { levelId: SB.l1, areaId: SB.front1, at: pt(-39.6, -4.4) }, { levelId: SB.l2, areaId: SB.out2, at: pt(-42.6, -4.4) }, seibuProv, seibuCommon,
    'Wide stairs and an escalator are drawn between the street-level floor and the 2F concourse.'),
  vertical('seibu-elevator-front', 'elevator', names('エレベーター（1F ⇔ 2F 正面口）', 'Elevator (1F ⇔ 2F, Front Gate)', '电梯（1F ⇔ 2F 正面口）'),
    [{ levelId: SB.l1, areaId: SB.front1, at: pt(-41.5, -7.6) }, { levelId: SB.l2, areaId: SB.out2, at: pt(-41.5, -7.6) }],
    seibuProv, { common: seibuCommon, notes: `Drawn at the end of the 2F concourse away from the gates. ${SEIBU_PINK}` }),
  ...pair('seibu-KIND-platform-1-to-north-gate', ['stairs'], { levelId: SB.l2, areaId: SB.p1, at: pt(-77, -6.8) }, { levelId: SB.l1, areaId: SB.northIn, at: pt(-79.8, -6.8) }, seibuProv, seibuCommon,
    'Stairs are drawn from the north end of the platforms down to 北口.'),
  ...pair('seibu-KIND-platform-2-3-to-north-gate', ['stairs'], { levelId: SB.l2, areaId: SB.p23, at: pt(-77, -3.8) }, { levelId: SB.l1, areaId: SB.northIn, at: pt(-79.8, -3.8) }, seibuProv, seibuCommon,
    'Stairs are drawn from the north end of the platforms down to 北口.'),
  // サブナード ⇄ the street in front of the station
  ...pair('subnade-KIND-to-seibu-front', ['stairs'], { levelId: PUB.lB1, areaId: PUB.subnade, at: pt(-35.2, -5) }, { levelId: SB.l1, areaId: SB.front1, at: pt(-37.6, -5) }, p2([S_TERMINAL, S_SEIBU]),
    { stationId: null, asOf: '2020-07', geometryConfidence: 'unknown' },
    `The stairs numbered 1 and 2 at the north end of サブナード; the street-level sheet prints the same numbers at 西武新宿駅前, in front of the station. Where exactly they surface was not read, and a lift (S) drawn beside them is left out. ${TM_DATE}`),
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
  line('seibu-shinjuku', SEIBU, names('西武新宿線', 'Seibu Shinjuku Line', '西武新宿线'), '#00a8b5', p2([S_SEIBU], 'Line letters as printed on the Seibu drawing (SS 01).'),
    'The fill of the station-number mark on the Seibu station page. Used as a display colour only; not an official colour value.', 'SS'),
];

const stations: Station[] = [
  station(ST_OD, ODAKYU, names('小田急線 新宿駅', 'Odakyu Line Shinjuku Station', '小田急线新宿站'), p2([S_OD]), [L_OD]),
  station(ST_NL, KEIO, names('京王新線・都営新宿線 新宿駅', 'Keio New Line / Toei Shinjuku Line Shinjuku Station', '京王新线·都营新宿线新宿站'),
    p2([S_NL, S_TOEI], 'Toei: "この駅は京王電鉄の管理駅です".'), [L_NL, L_TS]),
  station(ST_OEDO, TOEI, names('都営大江戸線 新宿駅', 'Toei Oedo Line Shinjuku Station', '都营大江户线新宿站'), p2([S_TOEI]), [L_OEDO]),
  station(ST_SEIBU, SEIBU, names('西武新宿駅', 'Seibu-Shinjuku Station', '西武新宿站'),
    p2([S_SEIBU, S_TERMINAL], 'A separate station north of the others, reached on foot through サブナード. Included because the 新宿ターミナルマップ lists the Seibu Line among the lines of the terminal.'), [L_SEIBU]),
  station(ST_METRO, METRO, names('東京メトロ丸ノ内線 新宿駅', 'Tokyo Metro Marunouchi Line Shinjuku Station', '东京地铁丸之内线新宿站'), p2([S_METRO]), [L_MARU]),
];

// Passenger services of the 4F hall, read again from the 4F floor map on 2026-11-15. The page puts a
// clickable icon over each service (an HTML image map, so the icon positions are exact pixels of the
// 751×677 drawing). The drawing's hall — from the north wall (y 52 px) to the walkway south of the A
// bays (y 400 px), and from the front of the waiting area (x 577 px) to the east wall (x 727 px) — is
// mapped linearly onto the schematic hall rectangle (x 24–33.4, z -12.6 to -19.5): the relative place
// of each service in the hall is kept; sizes and coordinates are schematic like everything else.
// Not drawn: the three light-teal blocks in the hall (the drawing does not say what they are, and the
// 待合室 is the hall itself — see src:busta-service-page), lockers, toilets, shops and the ATM.
const HALL_MAP = 'Place converted from the 4F floor map: relative position in the hall kept, size and coordinates schematic.';
const service = (slug: string, kind: ServiceKind, n: Names, box: PlanRect, iconOnly: boolean, notes: string, extra: string[] = []): ServicePoint => ({
  kind: 'service',
  ...base(`sk:service:busta-4f-${slug}`, n, p2([S_BUSTA, ...extra]), bustaCommon, `${notes} ${HALL_MAP}`),
  serviceKind: kind,
  levelId: BU.l4,
  areaId: BU.hall4,
  box,
  iconOnly,
});
const services: ServicePoint[] = [
  service('ticket-counter', 'ticket-counter', names('有人発券窓口', 'Ticket counter (staffed)', '有人售票窗口'), rect(27.35, 30, -15.91, -15.13), false,
    'The orange band along the east side of the hall that carries the 有人発券窓口 icon (icon at 617–643 × 211–236 px; band at about 632–649 × 176–274 px).'),
  service('ticket-machines-north', 'ticket-machines', names('自動発券機（北側）', 'Ticket machines (north)', '自动售票机（北侧）'), rect(25.97, 27.35, -15.91, -15.31), false,
    'The pink band beside the northern 自動発券機 icon (icon at 617–643 × 136–162 px; band at about 636–649 × 125–176 px). The service page speaks of "北側の自動発券機".', [S_BUSTA_SERVICE]),
  service('ticket-machines-south', 'ticket-machines', names('自動発券機（南側）', 'Ticket machines (south)', '自动售票机（南侧）'), rect(30, 31.16, -15.91, -15.31), false,
    'The pink band beside the southern 自動発券機 icon (icon at 617–643 × 283–309 px; band at about 636–649 × 271–317 px). "（南側）" is added here to tell it from the northern one.'),
  service('information', 'information', names('インフォメーションカウンター', 'Information counter', '问讯处'), rect(32.21, 32.81, -13.61, -13.01), true,
    'Only an icon on the drawing (580–605 × 354–380 px), south of the light-teal blocks; the service page puts it inside the 待合室.', [S_BUSTA_SERVICE]),
  service('waiting-room', 'waiting-room', names('待合室', 'Waiting room', '候车室'), rect(28.73, 29.33, -13.54, -12.94), true,
    'Only an icon on the drawing (578–604 × 225–251 px). The service page puts the information counter and the ATM inside the 待合室, so the waiting room is the hall round them; the marker stands where the icon is.', [S_BUSTA_SERVICE]),
];

// Every gate now leads somewhere that was read from a drawing; nothing is left as an abstract block.
const unverifiedBlocks: UnverifiedBlock[] = [];

export const extensions = {
  railLines,
  stations,
  levels: [...odLevels, ...nlLevels, ...oedoLevels, ...metroLevels, ...bustaLevels, ...publicLevels, ...seibuLevels],
  areas: [...odAreas, ...nlAreas, ...oedoAreas, ...metroAreas, ...bustaAreas, ...publicAreas, ...seibuAreas],
  passages: [...odPassages, ...bustaPassages, ...crossPassages, ...seibuPassages],
  gates: [...odGates, ...nlGates, ...oedoGates, ...metroGates, ...seibuGates],
  entrances: [...odEntrances, ...nlEntrances, ...oedoEntrances, ...metroEntrances, ...bustaEntrances, ...publicEntrances, ...seibuEntrances],
  verticals: [...odVerticals, ...nlVerticals, ...oedoVerticals, ...metroVerticals, ...bustaVerticals, ...seibuVerticals],
  unverifiedBlocks,
  services,
};

export const EXT_IDS = { OD, NL, OE, ME, BU, PUB, SB } as const;
