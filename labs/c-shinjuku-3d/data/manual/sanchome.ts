/**
 * 新宿三丁目 — three stations of two operators that share one set of passages:
 * Tokyo Metro Marunouchi Line (M09) and Fukutoshin Line (F13), and the Toei
 * Shinjuku Line (S02). A different station from 新宿; it is in the model as
 * its own stations, reached from 新宿 on foot.
 *
 * Read on 2026-11-14 by the same AI coding agent as the other files, from the
 * 立体図 that Tokyo Metro and Toei each publish for the station, and from
 * Tokyo Metro's 出口案内 table (see sources.ts). The rules are the same: only
 * names, floors, fare-zone boundaries, platform numbers and what connects to
 * what were written down; every coordinate is invented; nobody has re-checked
 * the entries.
 *
 * Both drawings are oblique views without dimensions. What could not be told
 * apart on them is said so in the notes: stairs are aggregated, some gate
 * lines are unnamed, and the passage between the Marunouchi Line concourse
 * and the Toei concourse is entered as one piece.
 */
import type { Area, Entrance, FareZone, Gate, Level, Passage, RailLine, Station, VerticalFacility } from '../../src/domain/types';
import { EXT_IDS, level, pair, platform, station } from './extensions';
import { D2, METRO, TOEI, a, concourse, entrance, gate, line, link, names, passageArea, prov, pt, rect, svc, vertical, type Common } from './shinjuku';

const p2 = (ids: string[], note?: string) => prov(ids, note, D2);

const S_METRO_SC = 'src:tokyo-metro-shinjuku-sanchome-map';
const S_TOEI_SC = 'src:toei-shinjuku-sanchome-map';
const S_METRO_SJ = 'src:tokyo-metro-shinjuku-map';

const ST_METRO_SC = 'sk:station:tokyo-metro-shinjuku-sanchome';
const ST_TOEI_SC = 'sk:station:toei-shinjuku-sanchome';
const PAID_METRO: FareZone = 'paid:tokyo-metro';
const PAID_TOEI: FareZone = 'paid:toei';

const L_MARU = 'sk:line:tokyo-metro-marunouchi';
const L_FUKU = 'sk:line:tokyo-metro-fukutoshin';
const L_TS = 'sk:line:toei-shinjuku';

const metroCommon: Common = { stationId: ST_METRO_SC, asOf: '2024-06', geometryConfidence: 'schematic' };
const toeiCommon: Common = { stationId: ST_TOEI_SC, asOf: '2026-11', geometryConfidence: 'schematic' };
// the passage between the two operators' concourses: its exits carry Tokyo Metro's E numbers, so it is entered under the Tokyo Metro station
const sharedCommon: Common = { stationId: ST_METRO_SC, asOf: '2024-06', geometryConfidence: 'unknown' };
const metroProv = p2([S_METRO_SC]);
const bothProv = p2([S_METRO_SC, S_TOEI_SC]);
const toeiProv = p2([S_TOEI_SC, S_METRO_SC]);

const UNNAMED_GATE = 'The gate line is drawn on the 立体図 without a name; the label is descriptive.';
const OBLIQUE = 'The 立体図 is an oblique view; the position is schematic.';
const STAIRS_ONLY = 'Whether an escalator runs beside these stairs was not told apart on the drawing; entered as stairs.';
const TIME_LIMITED = 'Exits marked * on the drawing have restricted hours ("*利用に時間制限のある出入口").';
const EXIT_TABLE = "Nearby facilities as listed in Tokyo Metro's 出口案内 table (改定日 2023年3月).";

export const SC = {
  lB1: 'sk:level:tokyo-metro-shinjuku-sanchome-b1f',
  lB2: 'sk:level:tokyo-metro-shinjuku-sanchome-b2f',
  lB3: 'sk:level:tokyo-metro-shinjuku-sanchome-b3f',
  tB1: 'sk:level:toei-shinjuku-sanchome-b1f',
  tB2: 'sk:level:toei-shinjuku-sanchome-b2f',
  maruConc: 'sk:area:sanchome-marunouchi-b1f-concourse',
  maruPaidWest: 'sk:area:sanchome-marunouchi-b1f-paid-west',
  maruPaidMid: 'sk:area:sanchome-marunouchi-b1f-paid-mid',
  maruPaidEast: 'sk:area:sanchome-marunouchi-b1f-paid-east',
  maruPf: 'sk:platform:tokyo-metro-shinjuku-sanchome-1-2',
  fukuConc: 'sk:area:sanchome-fukutoshin-b2f-concourse',
  fukuPaidNorth: 'sk:area:sanchome-fukutoshin-b2f-paid-north',
  fukuPaidSouth: 'sk:area:sanchome-fukutoshin-b2f-paid-south',
  fukuPf: 'sk:platform:tokyo-metro-shinjuku-sanchome-3-4',
  linkB2: 'sk:area:sanchome-b2f-link-passage',
  toeiOut: 'sk:area:sanchome-toei-b1f-concourse',
  toeiPaid: 'sk:area:sanchome-toei-b1f-paid',
  toeiPf: 'sk:platform:toei-shinjuku-sanchome-1-2',
} as const;

const levels: Level[] = [
  level(SC.lB1, METRO, 'B1F', -1, -4, metroProv, metroCommon, 'The Marunouchi Line concourse. Drawn level with the B1F passage of 丸ノ内線 新宿駅; relative heights are not from a source.'),
  level(SC.lB2, METRO, 'B2F', -2, -8, metroProv, metroCommon, 'The Marunouchi Line platform, the Fukutoshin Line concourse and the passage with exits E1–E4, all printed "B2F".'),
  level(SC.lB3, METRO, 'B3F', -3, -12, metroProv, metroCommon, 'The Fukutoshin Line platform.'),
  level(SC.tB1, TOEI, 'B1F', -1, -4, toeiProv, toeiCommon, 'The Toei Shinjuku Line concourse.'),
  level(SC.tB2, TOEI, 'B2F', -2, -8, toeiProv, toeiCommon, 'The Toei Shinjuku Line platform.'),
];

const areas: Area[] = [
  // --- Marunouchi Line (M09) ------------------------------------------------------------
  passageArea(SC.maruConc, SC.lB1, 'unpaid', names('新宿三丁目駅 丸ノ内線 改札外コンコース（B1F）', 'Shinjuku-sanchome: Marunouchi Line concourse (outside gates, B1F)', '新宿三丁目站 丸之内线站厅（检票口外，B1F）'),
    [rect(-27, -24.4, -66, -30)], pt(-25.7, -47), bothProv, metroCommon,
    `Unnamed on the drawings; the label is descriptive. The B1F floor above the platform, with the exits A1–A6 on one side and B2–B9 on the other and three groups of gates. Its west end is printed "新宿駅方面". ${OBLIQUE}`),
  concourse(SC.maruPaidWest, SC.lB1, PAID_METRO, names('丸ノ内線 改札内（新宿駅方面側・B1F）', 'Inside the gates at the west end (B1F)', '丸之内线检票口内（新宿站方向侧，B1F）'),
    [rect(-23.6, -21.4, -37, -33)], pt(-22.5, -35), metroProv, metroCommon, 'Descriptive label. The paid floor beside exits A5 and B6.'),
  concourse(SC.maruPaidMid, SC.lB1, PAID_METRO, names('丸ノ内線 改札内（中央・B1F）', 'Inside the middle gates (B1F)', '丸之内线检票口内（中央，B1F）'),
    [rect(-23.6, -21.4, -49, -45)], pt(-22.5, -47), metroProv, metroCommon, 'Descriptive label. The paid floor beside exits A4 and B4.'),
  concourse(SC.maruPaidEast, SC.lB1, PAID_METRO, names('丸ノ内線 改札内（池袋方面側・B1F）', 'Inside the gates at the east end (B1F)', '丸之内线检票口内（池袋方向侧，B1F）'),
    [rect(-23.6, -21.4, -61, -57)], pt(-22.5, -59), metroProv, metroCommon, 'Descriptive label. The paid floor beside exits A1 and B3.'),
  platform(SC.maruPf, SC.lB2, PAID_METRO, names('新宿三丁目駅 1・2番線ホーム', 'Shinjuku-sanchome platforms 1–2', '新宿三丁目站 1·2号站台'), rect(-23.5, -21.5, -62, -32), pt(-22.5, -47),
    [
      { number: '1', services: [svc(L_MARU, '荻窪方面（新宿）', 'for Ogikubo (next: Shinjuku)')], side: 'x+' },
      { number: '2', services: [svc(L_MARU, '池袋方面（新宿御苑前）', 'for Ikebukuro (next: Shinjuku-gyoemmae)')], side: 'x-' },
    ], bothProv, metroCommon,
    'An island platform. Printed: "荻窪方面 ① (新宿)" at the end towards 新宿 and "② 池袋方面 (新宿御苑前)" at the other end. Which side each track lies on was not legible; the sides follow the neighbouring 新宿 station, which the same two tracks run through.'),

  // --- Fukutoshin Line (F13) ------------------------------------------------------------
  passageArea(SC.fukuConc, SC.lB2, 'unpaid', names('新宿三丁目駅 副都心線 改札外コンコース（B2F）', 'Shinjuku-sanchome: Fukutoshin Line concourse (outside gates, B2F)', '新宿三丁目站 副都心线站厅（检票口外，B2F）'),
    [rect(-16, 12, -64.2, -61.6), rect(-27, -16, -66, -64.2), rect(6.5, 9, -61.6, -42)], pt(-2, -62.9), metroProv, metroCommon,
    `Unnamed on the drawing; the label is descriptive. The B2F floor above the Fukutoshin Line platform with exits E5–E8, and a long arm with exits E9 and E10 at its end. Its head runs under the east end of the Marunouchi Line concourse, where the lift between the two is drawn. ${OBLIQUE}`),
  concourse(SC.fukuPaidNorth, SC.lB2, PAID_METRO, names('副都心線 改札内（丸ノ内線側・B2F）', 'Inside the Fukutoshin Line gates on the Marunouchi Line side (B2F)', '副都心线检票口内（丸之内线侧，B2F）'),
    [rect(-14, -8, -67.1, -64.9)], pt(-11, -66), metroProv, metroCommon, 'Descriptive label. Toilets and the lift to the platform are drawn on this part.'),
  concourse(SC.fukuPaidSouth, SC.lB2, PAID_METRO, names('副都心線 改札内（E7出口側・B2F）', 'Inside the Fukutoshin Line gates on the exit E7 side (B2F)', '副都心线检票口内（E7出口侧，B2F）'),
    [rect(0, 5, -67.1, -64.9)], pt(2.5, -66), metroProv, metroCommon, 'Descriptive label.'),
  platform(SC.fukuPf, SC.lB3, PAID_METRO, names('新宿三丁目駅 3・4番線ホーム', 'Shinjuku-sanchome platforms 3–4', '新宿三丁目站 3·4号站台'), rect(-19, 9, -67, -65), pt(-5, -66),
    [
      { number: '3', services: [svc(L_FUKU, '渋谷方面（北参道）', 'for Shibuya (next: Kita-sando)')], side: 'z-' },
      { number: '4', services: [svc(L_FUKU, '和光市方面（東新宿）', 'for Wakoshi (next: Higashi-shinjuku)')], side: 'z+' },
    ], bothProv, metroCommon,
    'An island platform. On the Tokyo Metro drawing the arrow "③ 渋谷" leaves the nearer track line at the end with exits E6–E10 and "④ 和光市" stands at the other end of the farther track line; Toei prints "(北参道)" and "(東新宿)" as the next stations. The drawings have the Marunouchi Line platform meet the 和光市 end. "Nearer" is entered as east here, which is an assumption about the viewpoint.'),

  // --- the passage between the Marunouchi Line concourse and the Toei concourse ----------
  passageArea(SC.linkB2, SC.lB2, 'unpaid', names('連絡通路（B2F・出口 E1〜E4）', 'Connecting passage (B2F, exits E1–E4)', '连接通道（B2F，E1～E4出口）'),
    [rect(-27, -24.4, -81, -67)], pt(-25.7, -74), bothProv, sharedCommon,
    'Unnamed on the drawings; the label is descriptive. Both drawings print "B2F" on a passage outside the gates that leaves the east end of the Marunouchi Line concourse, carries the exits E1–E4 and reaches the Toei concourse. Entered as one passage with stairs at both ends: where exactly its floor changes could not be read, and the exits C2–C4 drawn along the way are entered at the Toei concourse.'),

  // --- Toei Shinjuku Line (S02) ---------------------------------------------------------
  passageArea(SC.toeiOut, SC.tB1, 'unpaid', names('新宿三丁目駅 都営新宿線 改札外コンコース（B1F）', 'Shinjuku-sanchome: Toei Shinjuku Line concourse (outside gates, B1F)', '新宿三丁目站 都营新宿线站厅（检票口外，B1F）'),
    [rect(-19.6, -17.2, -104, -72), rect(-17.2, -14.4, -76.4, -72), rect(-17.2, -14.4, -104, -97.6)], pt(-18.4, -88), toeiProv, toeiCommon,
    `Unnamed on the drawings; the label is descriptive. The B1F floor outside the gate lines at both ends of the paid concourse, with exits C1–C4 at the 新宿 end and C5–C8 at the 本八幡 end. ${OBLIQUE}`),
  concourse(SC.toeiPaid, SC.tB1, PAID_TOEI, names('都営新宿線 改札内コンコース（B1F）', 'Toei Shinjuku Line concourse (inside gates, B1F)', '都营新宿线站厅（付费区，B1F）'),
    [rect(-16.6, -14.4, -97, -77)], pt(-15.5, -87), toeiProv, toeiCommon, 'Descriptive label. Drawn as one paid floor above the platform between the two gate lines.'),
  platform(SC.toeiPf, SC.tB2, PAID_TOEI, names('新宿三丁目駅 1・2番線ホーム', 'Shinjuku-sanchome platforms 1–2', '新宿三丁目站 1·2号站台'), rect(-16.5, -14.5, -102, -74), pt(-15.5, -88),
    [
      { number: '1', services: [svc(L_TS, '新宿方面（新宿）', 'for Shinjuku (next: Shinjuku)')], side: 'x+' },
      { number: '2', services: [svc(L_TS, '本八幡方面（曙橋）', 'for Motoyawata (next: Akebonobashi)')], side: 'x-' },
    ], toeiProv, toeiCommon,
    'An island platform. Toei prints "① 新宿方面 (新宿)" at one end on the nearer track line and "② 本八幡方面 (曙橋)" at the other end on the farther one. Car numbers on the Toei table run from 1 (新宿 end) to 10 (本八幡 end). "Nearer" is entered as south here, which is an assumption about the viewpoint.'),
];

const gates: Gate[] = [
  gate('sanchome-marunouchi-gates-west', SC.lB1, names('丸ノ内線 改札（新宿駅方面側）', 'Marunouchi Line gates (west end)', '丸之内线检票口（新宿站方向侧）'), pt(-24, -35), [a(SC.maruPaidWest), a(SC.maruConc)], metroProv,
    { common: metroCommon, stepFree: true, notes: `${UNNAMED_GATE} The barrier-free route (red line) of the Tokyo Metro drawing passes through it to a lift.` }),
  gate('sanchome-marunouchi-gates-mid', SC.lB1, names('丸ノ内線 改札（中央）', 'Marunouchi Line gates (middle)', '丸之内线检票口（中央）'), pt(-24, -47), [a(SC.maruPaidMid), a(SC.maruConc)], metroProv,
    { common: metroCommon, notes: UNNAMED_GATE }),
  gate('sanchome-marunouchi-gates-east', SC.lB1, names('丸ノ内線 改札（池袋方面側）', 'Marunouchi Line gates (east end)', '丸之内线检票口（池袋方向侧）'), pt(-24, -59), [a(SC.maruPaidEast), a(SC.maruConc)], metroProv,
    { common: metroCommon, notes: UNNAMED_GATE }),
  gate('sanchome-fukutoshin-gates-north', SC.lB2, names('副都心線 改札（丸ノ内線側）', 'Fukutoshin Line gates (Marunouchi Line side)', '副都心线检票口（丸之内线侧）'), pt(-11, -64.55), [a(SC.fukuPaidNorth), a(SC.fukuConc)], metroProv,
    { common: metroCommon, stepFree: true, notes: `${UNNAMED_GATE} The barrier-free route (red line) passes through it to the lift.` }),
  gate('sanchome-fukutoshin-gates-south', SC.lB2, names('副都心線 改札（E7出口側）', 'Fukutoshin Line gates (exit E7 side)', '副都心线检票口（E7出口侧）'), pt(2.5, -64.55), [a(SC.fukuPaidSouth), a(SC.fukuConc)], metroProv,
    { common: metroCommon, notes: UNNAMED_GATE }),
  gate('sanchome-toei-gates-west', SC.tB1, names('都営新宿線 改札（新宿方面側）', 'Toei Shinjuku Line gates (Shinjuku end)', '都营新宿线检票口（新宿方向侧）'), pt(-15.5, -76.7), [a(SC.toeiPaid), a(SC.toeiOut)], toeiProv,
    { common: toeiCommon, notes: UNNAMED_GATE }),
  gate('sanchome-toei-gates-east', SC.tB1, names('都営新宿線 改札（本八幡方面側）', 'Toei Shinjuku Line gates (Motoyawata end)', '都营新宿线检票口（本八幡方向侧）'), pt(-15.5, -97.3), [a(SC.toeiPaid), a(SC.toeiOut)], toeiProv,
    { common: toeiCommon, stepFree: true, notes: `${UNNAMED_GATE} Toei marks the lift route from exit C6 through it to the platform lift.` }),
];

const entrances: Entrance[] = [
  // Marunouchi Line concourse
  entrance('sanchome-exit-a5', SC.lB1, SC.maruConc, names('出口 A5', 'Exit A5', 'A5出口'), pt(-24.4, -33), 'ビックロ', 'Bicqlo', bothProv, { common: metroCommon, notes: EXIT_TABLE }),
  entrance('sanchome-exit-a6-b6-b7', SC.lB1, SC.maruConc, names('出口 A6・B6・B7（新宿駅方面）', 'Exits A6 / B6 / B7 (towards Shinjuku Station)', 'A6·B6·B7出口（新宿站方向）'), pt(-25.7, -30),
    '新宿駅方面', 'towards Shinjuku Station', p2([S_TOEI_SC, S_METRO_SC]),
    { common: metroCommon, notes: `Drawn at the west end of the concourse on the Toei drawing, beyond the west gates; one entry for the three. A B9 beside them is marked 閉鎖中 there, while Tokyo Metro's table still lists B9 (新宿区役所). ${TIME_LIMITED}` }),
  entrance('sanchome-exit-a2-a4', SC.lB1, SC.maruConc, names('出口 A2・A4', 'Exits A2 / A4', 'A2·A4出口'), pt(-24.4, -47), '新宿マルイ 本館', 'Shinjuku Marui Main Building', bothProv,
    { common: metroCommon, notes: `${EXIT_TABLE} ${TIME_LIMITED} Both are marked *.` }),
  entrance('sanchome-exit-b3-b4-b5', SC.lB1, SC.maruConc, names('出口 B3・B4・B5（伊勢丹方面）', 'Exits B3 / B4 / B5 (towards Isetan)', 'B3·B4·B5出口（伊势丹方向）'), pt(-27, -50), '伊勢丹', 'Isetan', bothProv,
    { common: metroCommon, stepFree: true, notes: `${EXIT_TABLE} B4 has a lift to street level ("地上行エレベーターあり"); B5 is marked *. One entry for the three.` }),
  entrance('sanchome-exit-a1', SC.lB1, SC.maruConc, names('出口 A1', 'Exit A1', 'A1出口'), pt(-24.4, -61), '新宿御苑（新宿門）・新宿マルイ アネックス', 'Shinjuku Gyoen (Shinjuku Gate), Shinjuku Marui Annex', bothProv,
    { common: metroCommon, notes: EXIT_TABLE }),
  entrance('sanchome-exit-b2', SC.lB1, SC.maruConc, names('出口 B2', 'Exit B2', 'B2出口'), pt(-27, -62), '新宿末廣亭・映画街', 'Shinjuku Suehirotei, cinema district', bothProv, { common: metroCommon, notes: EXIT_TABLE }),
  // the B2F passage
  entrance('sanchome-exit-e1', SC.lB2, SC.linkB2, names('出口 E1', 'Exit E1', 'E1出口'), pt(-27, -78), '新宿文化センター・新宿ゴールデン街・東京医科大学', 'Shinjuku Bunka Center, Golden Gai, Tokyo Medical University', bothProv,
    { common: sharedCommon, stepFree: true, notes: `${EXIT_TABLE} Listed with a lift to street level.` }),
  entrance('sanchome-exit-e2', SC.lB2, SC.linkB2, names('出口 E2', 'Exit E2', 'E2出口'), pt(-27, -73), '花園神社・新宿マルイ メン', 'Hanazono Shrine, Shinjuku Marui Men', bothProv, { common: sharedCommon, notes: EXIT_TABLE }),
  entrance('sanchome-exit-e3-e4', SC.lB2, SC.linkB2, names('出口 E3・E4', 'Exits E3 / E4', 'E3·E4出口'), pt(-24.4, -70), 'キュープラザ新宿三丁目', 'Q Plaza Shinjuku-sanchome', bothProv,
    { common: sharedCommon, notes: `${EXIT_TABLE} ${TIME_LIMITED} Both are marked *.` }),
  // Fukutoshin Line concourse
  entrance('sanchome-exit-e5', SC.lB2, SC.fukuConc, names('出口 E5', 'Exit E5', 'E5出口'), pt(-4, -61.6), '新宿御苑（新宿門）・新宿高等学校', 'Shinjuku Gyoen (Shinjuku Gate), Shinjuku High School', metroProv,
    { common: metroCommon, stepFree: true, notes: `${EXIT_TABLE} Listed with a lift to street level.` }),
  entrance('sanchome-exit-e6-e7', SC.lB2, SC.fukuConc, names('出口 E6・E7', 'Exits E6 / E7', 'E6·E7出口'), pt(12, -63.6), 'ウインズ新宿', 'WINS Shinjuku', metroProv,
    { common: metroCommon, notes: `${EXIT_TABLE} E7 is drawn but is not in the table.` }),
  entrance('sanchome-exit-e8', SC.lB2, SC.fukuConc, names('出口 E8', 'Exit E8', 'E8出口'), pt(12, -62.2), '高島屋タイムズスクエア', 'Takashimaya Times Square', metroProv,
    { common: metroCommon, stepFree: true, notes: `${EXIT_TABLE} Listed with a lift to street level.` }),
  entrance('sanchome-exit-e9', SC.lB2, SC.fukuConc, names('出口 E9', 'Exit E9', 'E9出口'), pt(6.5, -52), 'ウインズ新宿・大塚家具', 'WINS Shinjuku, Otsuka Kagu', metroProv,
    { common: metroCommon, stepFree: true, notes: `${EXIT_TABLE} Listed with a lift to street level.` }),
  entrance('sanchome-exit-e10', SC.lB2, SC.fukuConc, names('出口 E10（JR新宿駅 新南改札・ミライナタワー改札方面）', 'Exit E10 (towards JR Shinjuku New South / Miraina Tower gates)', 'E10出口（JR新宿站新南检票口·Miraina Tower检票口方向）'), pt(7.7, -42),
    'JR新宿ミライナタワー・新宿駅（JR線）甲州街道改札・ミライナタワー改札・新南改札・バスタ新宿', 'JR Shinjuku Miraina Tower; JR Shinjuku Koshu-kaido, Miraina Tower and New South gates; Busta Shinjuku', metroProv,
    { common: metroCommon, stepFree: true, notes: `${EXIT_TABLE} Listed with a lift to street level. The way from the exit to the JR gates is outdoors and is on no drawing that was read, so no walking link to JR is entered from here.` }),
  // Toei concourse
  entrance('sanchome-exit-c1-c4', SC.tB1, SC.toeiOut, names('出口 C1〜C4', 'Exits C1–C4', 'C1～C4出口'), pt(-14.4, -73), 'マルイアネックス・新宿3丁目交差点・新宿末廣亭', 'Marui Annex, Shinjuku 3-chome crossing, Shinjuku Suehirotei', toeiProv,
    { common: toeiCommon, notes: `One entry for the four, drawn around the 新宿 end of the concourse and along the passage towards the Marunouchi Line. Facilities as listed in the 出口案内（都営） box of the Toei drawing. ${TIME_LIMITED} C1, C2 and C3 are marked *.` }),
  entrance('sanchome-exit-c5', SC.tB1, SC.toeiOut, names('出口 C5', 'Exit C5', 'C5出口'), pt(-14.4, -101), '新宿御苑', 'Shinjuku Gyoen', toeiProv, { common: toeiCommon, notes: 'Facility as listed on the Toei drawing.' }),
  entrance('sanchome-exit-c6', SC.tB1, SC.toeiOut, names('出口 C6', 'Exit C6', 'C6出口'), pt(-19.6, -98), '御苑大通り', 'Gyoen-odori avenue', toeiProv,
    { common: toeiCommon, stepFree: true, notes: 'Toei marks C6 with EV and draws a lift to street level ("地上へ").' }),
  entrance('sanchome-exit-c7-c8', SC.tB1, SC.toeiOut, names('出口 C7・C8', 'Exits C7 / C8', 'C7·C8出口'), pt(-19.6, -103), '新宿文化センター・東京医科大学', 'Shinjuku Bunka Center, Tokyo Medical University', toeiProv,
    { common: toeiCommon, notes: `Facilities as listed on the Toei drawing and in Tokyo Metro's table. ${TIME_LIMITED} C8 is marked *.` }),
];

const TOEI_TABLE = 'the のりかえ・出口案内 table under the Toei 立体図';

const verticals: VerticalFacility[] = [
  // Marunouchi Line: each gate group has stairs down to the platform
  ...pair('sanchome-marunouchi-KIND-west-gates-to-platform', ['stairs'], { levelId: SC.lB1, areaId: SC.maruPaidWest, at: pt(-22.5, -36.2) }, { levelId: SC.lB2, areaId: SC.maruPf, at: pt(-22.5, -38.8) }, metroProv, metroCommon,
    `Drawn below the west gates. ${STAIRS_ONLY}`),
  ...pair('sanchome-marunouchi-KIND-mid-gates-to-platform', ['stairs'], { levelId: SC.lB1, areaId: SC.maruPaidMid, at: pt(-22.5, -48.2) }, { levelId: SC.lB2, areaId: SC.maruPf, at: pt(-22.5, -50.8) }, metroProv, metroCommon,
    `Drawn below the middle gates. ${STAIRS_ONLY}`),
  ...pair('sanchome-marunouchi-KIND-east-gates-to-platform', ['stairs'], { levelId: SC.lB1, areaId: SC.maruPaidEast, at: pt(-22.5, -57.8) }, { levelId: SC.lB2, areaId: SC.maruPf, at: pt(-22.5, -55.2) }, metroProv, metroCommon,
    `Drawn below the east gates. ${STAIRS_ONLY}`),
  vertical('sanchome-marunouchi-elevator-west', 'elevator', names('エレベーター（丸ノ内線 改札内 B1F ⇔ ホーム B2F）', 'Elevator (Marunouchi Line concourse B1F ⇔ platform B2F)', '电梯（丸之内线站厅 B1F ⇔ 站台 B2F）'),
    [{ levelId: SC.lB1, areaId: SC.maruPaidWest, at: pt(-22.5, -34) }, { levelId: SC.lB2, areaId: SC.maruPf, at: pt(-22.5, -34) }],
    metroProv, { common: metroCommon, notes: 'A lift shaft is drawn beside the west gates down to the platform, on the barrier-free route (red line). Its exact place among the gate groups was not legible.' }),
  // Marunouchi ⇄ Fukutoshin, inside the gates: platform to platform
  ...pair('sanchome-KIND-marunouchi-platform-to-fukutoshin-platform', ['stairs'], { levelId: SC.lB2, areaId: SC.maruPf, at: pt(-22.5, -61) }, { levelId: SC.lB3, areaId: SC.fukuPf, at: pt(-18, -66) }, metroProv, metroCommon,
    `Stairs in the colour of "改札内の階段" are drawn from the 池袋 end of the Marunouchi Line platform down to the 和光市 end of the Fukutoshin Line platform: a transfer inside the gates. ${STAIRS_ONLY}`),
  // Marunouchi ⇄ Fukutoshin, outside the gates
  ...pair('sanchome-KIND-marunouchi-concourse-to-fukutoshin-concourse', ['stairs'], { levelId: SC.lB1, areaId: SC.maruConc, at: pt(-24.8, -63) }, { levelId: SC.lB2, areaId: SC.fukuConc, at: pt(-15.4, -62.9) }, metroProv, metroCommon,
    `A long flight in the colour of "改札外の階段" is drawn from the Marunouchi Line concourse beside exit A1 down to the Fukutoshin Line concourse. ${STAIRS_ONLY}`),
  vertical('sanchome-elevator-marunouchi-concourse-to-fukutoshin-concourse', 'elevator', names('エレベーター（丸ノ内線 B1F ⇔ 副都心線 B2F）', 'Elevator (Marunouchi Line B1F ⇔ Fukutoshin Line B2F)', '电梯（丸之内线 B1F ⇔ 副都心线 B2F）'),
    [{ levelId: SC.lB1, areaId: SC.maruConc, at: pt(-25, -65.2) }, { levelId: SC.lB2, areaId: SC.fukuConc, at: pt(-25, -65.2) }],
    metroProv, { common: { ...metroCommon, geometryConfidence: 'unknown' }, notes: 'A lift shaft is drawn beside exit A1 from the Marunouchi Line concourse down to the level of the Fukutoshin Line concourse, with the barrier-free route (red line) continuing to the Fukutoshin Line gates. Whether it stands inside or outside the gates was not legible; entered outside.' }),
  // Fukutoshin Line
  ...pair('sanchome-fukutoshin-KIND-north-gates-to-platform', ['stairs'], { levelId: SC.lB2, areaId: SC.fukuPaidNorth, at: pt(-9, -66) }, { levelId: SC.lB3, areaId: SC.fukuPf, at: pt(-6.4, -66) }, metroProv, metroCommon,
    `Drawn below the gates on the Marunouchi Line side. ${STAIRS_ONLY}`),
  ...pair('sanchome-fukutoshin-KIND-south-gates-to-platform', ['stairs'], { levelId: SC.lB2, areaId: SC.fukuPaidSouth, at: pt(4, -66) }, { levelId: SC.lB3, areaId: SC.fukuPf, at: pt(6.6, -66) }, metroProv, metroCommon,
    `Drawn below the gates on the exit E7 side. ${STAIRS_ONLY}`),
  vertical('sanchome-fukutoshin-elevator', 'elevator', names('エレベーター（副都心線 改札内 B2F ⇔ ホーム B3F）', 'Elevator (Fukutoshin Line concourse B2F ⇔ platform B3F)', '电梯（副都心线站厅 B2F ⇔ 站台 B3F）'),
    [{ levelId: SC.lB2, areaId: SC.fukuPaidNorth, at: pt(-12.6, -66) }, { levelId: SC.lB3, areaId: SC.fukuPf, at: pt(-12.6, -66) }],
    metroProv, { common: metroCommon, notes: 'The shaft drawn from the paid concourse beside the toilets down to the platform, on the barrier-free route (red line).' }),
  // the B2F passage
  ...pair('sanchome-KIND-marunouchi-concourse-to-b2f-passage', ['stairs'], { levelId: SC.lB1, areaId: SC.maruConc, at: pt(-26.4, -64.8) }, { levelId: SC.lB2, areaId: SC.linkB2, at: pt(-26.4, -67.8) }, bothProv, sharedCommon,
    `Stairs are drawn leaving the east end of the Marunouchi Line concourse, by exits B2 and C2, towards the passage printed "B2F". ${STAIRS_ONLY}`),
  ...pair('sanchome-KIND-b2f-passage-to-toei-concourse', ['stairs'], { levelId: SC.lB2, areaId: SC.linkB2, at: pt(-24.8, -76) }, { levelId: SC.tB1, areaId: SC.toeiOut, at: pt(-19.2, -76) }, bothProv, sharedCommon,
    `The passage reaches the Toei concourse, printed "B1F", by the exits C3 and C4 and E3 and E4. That stairs join the two floors here is read from the two floor labels; the flight itself was not told apart. ${STAIRS_ONLY}`),
  // Toei Shinjuku Line
  ...pair('sanchome-toei-KIND-car-2', ['stairs', 'escalator'], { levelId: SC.tB1, areaId: SC.toeiPaid, at: pt(-15.5, -77.8) }, { levelId: SC.tB2, areaId: SC.toeiPf, at: pt(-15.5, -80.4) }, toeiProv, toeiCommon,
    `${TOEI_TABLE} shows an escalator and stairs at car 2.`),
  ...pair('sanchome-toei-KIND-car-6', ['stairs', 'escalator'], { levelId: SC.tB1, areaId: SC.toeiPaid, at: pt(-15.5, -87.6) }, { levelId: SC.tB2, areaId: SC.toeiPf, at: pt(-15.5, -90.2) }, toeiProv, toeiCommon,
    `${TOEI_TABLE} shows an escalator and stairs at car 6.`),
  ...pair('sanchome-toei-KIND-car-8', ['stairs', 'escalator'], { levelId: SC.tB1, areaId: SC.toeiPaid, at: pt(-15.5, -93.6) }, { levelId: SC.tB2, areaId: SC.toeiPf, at: pt(-15.5, -96.2) }, toeiProv, toeiCommon,
    `${TOEI_TABLE} shows an escalator and stairs at car 8. Toei lists 12 escalators for the station.`),
  vertical('sanchome-toei-elevator', 'elevator', names('エレベーター（都営新宿線 改札内 B1F ⇔ ホーム B2F）', 'Elevator (Toei Shinjuku Line concourse B1F ⇔ platform B2F)', '电梯（都营新宿线站厅 B1F ⇔ 站台 B2F）'),
    [{ levelId: SC.tB1, areaId: SC.toeiPaid, at: pt(-15.5, -84.4) }, { levelId: SC.tB2, areaId: SC.toeiPf, at: pt(-15.5, -84.4) }],
    toeiProv, { common: toeiCommon, notes: `${TOEI_TABLE} shows a lift at car 4. Toei lists two lifts for the station; the other is at exit C6.` }),
];

const passages: Passage[] = [
  link('marunouchi-shinjuku-concourse-to-sanchome-concourse', EXT_IDS.ME.conc, SC.maruConc, p2([S_METRO_SJ, S_METRO_SC, S_TOEI_SC]), null,
    { inferred: true, common: { stationId: null, asOf: '2025-11', geometryConfidence: 'unknown' },
      notes: 'INFERRED from signage text only: the 新宿 drawing prints "新宿三丁目方面" at the east end of its B1F passage (exits A6 / B6), and the 新宿三丁目 drawings print "新宿駅方面" at the west end of the Marunouchi Line concourse, where exits with the same numbers A6 and B6 are drawn. Neither drawing shows the passage between the two in one piece; its length and any steps on the way are unknown.' }),
];

const railLines: RailLine[] = [
  line('tokyo-metro-fukutoshin', METRO, names('副都心線', 'Fukutoshin Line', '副都心线'), '#a8662b', p2([S_METRO_SC], 'Line letter as printed on the Tokyo Metro 立体図 (F 13).'),
    'Approximation of the brown used for this line on the Tokyo Metro 立体図. Not an official colour value.', 'F'),
];

const stations: Station[] = [
  station(ST_METRO_SC, METRO, names('東京メトロ 新宿三丁目駅（丸ノ内線・副都心線）', 'Tokyo Metro Shinjuku-sanchome Station (Marunouchi and Fukutoshin lines)', '东京地铁新宿三丁目站（丸之内线·副都心线）'),
    p2([S_METRO_SC], 'M 09 and F 13 on the Tokyo Metro drawing. A different station from 新宿 (M 08), one stop to the east on the Marunouchi Line.'), [L_MARU, L_FUKU]),
  station(ST_TOEI_SC, TOEI, names('都営新宿線 新宿三丁目駅', 'Toei Shinjuku Line Shinjuku-sanchome Station', '都营新宿线新宿三丁目站'),
    p2([S_TOEI_SC], 'S 02 on the Toei drawing. A different station from 新宿 (S 01).'), [L_TS]),
];

export const sanchome = { railLines, stations, levels, areas, passages, gates, entrances, verticals };
