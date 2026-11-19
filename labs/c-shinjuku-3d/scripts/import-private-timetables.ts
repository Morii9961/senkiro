/**
 * LOCAL ONLY. Converts the Shinjuku departure tables of Keio and Odakyu, handed over by the project
 * owner as CSV files on 2026-11-17, into timetable records in data/raw/timetable/ (git-ignored).
 *
 *   npx tsx scripts/import-private-timetables.ts
 *
 * Reads data/raw/private-saved/keio_shinjuku_departures.csv and odakyu_shinjuku_departures.csv.
 * Their own columns say where each value comes from: Keio from Keio's station timetable pages
 * (served by NAVITIME, transfer-train.navitime.biz), with a track per train; Odakyu from Odakyu's
 * PDF station timetable and 駅探, with only a group of platforms ("3・4・5番（地上）または8・9番（地下）").
 * Neither site allows redistribution, so nothing here is committed.
 *
 * What is done with them:
 *  - 京王線 (1・2・3番線): every departure, on its track.
 *  - 京王新線 westbound (4番線): every departure; at 4番線 these are the same trains as the Toei
 *    timetable's arrivals, and the simulation draws each pair as one train (mergeComplementaryPlans).
 *  - 都営新宿線 eastbound (5番線): already in the committed Toei timetable; only the trains that start
 *    at Shinjuku are taken, because the Toei data has no track for them.
 *  - Odakyu: every departure, with no track — the CSV does not say which platform a train uses.
 * Times before 03:00 are written 24:xx. Arrivals are not in a departure table.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, recordsToCsv } from '../src/timetable/adapter';
import { serviceTimeOf } from '../src/timetable/odpt';
import type { TimetableRecord, TimetableSource } from '../src/timetable/types';
import { LEGACY_REMARK, LEGACY_SOURCE_ID, legacyTrack, loadLegacyRows, type LegacyRow } from './legacy-events';
import { METRO_SOURCE_ID, metroRecords, parseMetroText } from './metro-text';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inDir = resolve(root, 'data/raw/private-saved');
const outDir = resolve(root, 'data/raw/timetable');

const KEIO_SOURCE = 'local:keio-station-timetable';
const ODAKYU_SOURCE = 'local:odakyu-station-timetable';

type Row = Record<string, string>;
function rows(file: string): Row[] {
  const path = resolve(inDir, file);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const [header, ...body] = parseCsv(readFileSync(path, 'utf8'));
  // NFKC: the Keio file writes 塚 as the compatibility ideograph U+FA10
  return body.map((cells) => Object.fromEntries(header!.map((h, i) => [h.trim(), (cells[i] ?? '').trim().normalize('NFKC')])));
}

const dayOf = (s: string): string => (s === '平日' ? 'weekday' : s === '土休日' ? 'saturday-holiday' : s);
const truthy = (s: string | undefined) => s === 'True' || s === 'true' || s === '1';

/** 京王ライナー / Mt.TAKAO号 checked against Keio's 座席指定列車 pages (keio_liner_shinjuku_verified.csv): day|time → row. */
function keioLinerChecked(): Map<string, Row> {
  const m = new Map<string, Row>();
  if (!existsSync(resolve(inDir, 'keio_liner_shinjuku_verified.csv'))) return m;
  for (const r of rows('keio_liner_shinjuku_verified.csv')) m.set(`${dayOf(r['日別']!)}|${r['時刻']}`, r);
  return m;
}

function keio(): { records: TimetableRecord[]; skipped: number; linerChecked: number } {
  const records: TimetableRecord[] = [];
  let skipped = 0;
  let linerChecked = 0;
  const seq = new Map<string, number>();
  const liner = keioLinerChecked();
  for (const r of rows('keio_shinjuku_departures.csv')) {
    const day = dayOf(r.day_type!);
    const starts = truthy(r.origin_here);
    let station: string, operator: string, line: string, direction: string | null;
    if (r.line_param === '1') [station, operator, line, direction] = ['keio:shinjuku', 'keio', 'keio:keio', null];
    else if (r.line_param === '2') [station, operator, line, direction] = ['keio:shinjuku-newline', 'keio', 'keio:keio-new', 'westbound'];
    else if (r.line_param === '8') {
      // the same trains as the committed Toei departures, except those that start here
      if (!starts) {
        skipped++;
        continue;
      }
      [station, operator, line, direction] = ['toei:shinjuku:S01', 'toei', 'toei:shinjuku', 'eastbound'];
    } else throw new Error(`unknown Keio line_param ${r.line_param}`);
    const k = `${r.line_param}|${day}`;
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    // a seat-reserved train in the checked list: its type, number, destination and track agree, so the type is no longer an inference
    const checked = r.line_param === '1' ? liner.get(`${day}|${r.time}`) : undefined;
    const agrees = checked && checked['種別'] === r.type && checked['去向'] === r.destination && checked['番線'] === r.platform;
    if (agrees) linerChecked++;
    const notes = [
      r.note || null,
      starts ? '当駅始発' : null,
      truthy(r.reserved_seat) ? '座席指定' : null,
      agrees ? `${checked!['種別']} ${checked!['号数']} (type confirmed on ${checked!['公式種別確認URL']})` : r.type_source && r.type_source !== 'page' ? `type: ${r.type_source}` : null,
      r.kaisei ? `${r.kaisei}` : null,
    ].filter(Boolean);
    records.push({
      station_id: station,
      operator_id: operator,
      line_id: line,
      platform_id: r.platform ? `${station}:${r.platform}` : null,
      direction_id: direction,
      service_date_type: day,
      trip_id: `keio-tt:${r.line_param}:${day}:${String(n).padStart(4, '0')}`,
      train_number: null,
      arrival_time_local: null,
      departure_time_local: serviceTimeOf(r.time),
      destination_text: r.destination || null,
      service_class: r.type || null,
      vehicle_series: null,
      formation_length: null,
      vehicle_assignment_status: 'unknown',
      source_id: KEIO_SOURCE,
      valid_from: null,
      valid_until: null,
      remarks: notes.join(' · ') || null,
    });
  }
  return { records, skipped, linerChecked };
}

const ODAKYU_TRACKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];

/** Destinations written the same way: ヶ / ケ, and 「A + B」 / 「B・A」 for coupled trains. */
const destKey = (s: string) => s.replace(/ヶ/g, 'ケ').split(/[+・]/).map((x) => x.trim()).filter(Boolean).sort().join('・');

/**
 * The second Odakyu table the project owner handed over (odakyu_shinjuku_down_{weekday,holiday}.csv, read from the
 * same PDF by another tool). Where its destination differs from the first table, the first is kept — it agrees with
 * the legacy timetable — and the difference is written into the remarks.
 */
function odakyuSecondOpinion(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [f, day] of [['odakyu_shinjuku_down_weekday.csv', 'weekday'], ['odakyu_shinjuku_down_holiday.csv', 'saturday-holiday']] as const) {
    if (!existsSync(resolve(inDir, f))) continue;
    for (const r of rows(f)) m.set(`${day}|${serviceTimeOf(r['时刻'])}`, r['终点站'] ?? '');
  }
  return m;
}

/**
 * The trains whose two readings differed, checked by the project owner against Odakyu's own timetable pages
 * (odakyu_shinjuku_trains_verified.csv: day, time, type, name and number, destination, split, the page read): day|time → row.
 */
function odakyuChecked(): Map<string, Row> {
  const m = new Map<string, Row>();
  if (!existsSync(resolve(inDir, 'odakyu_shinjuku_trains_verified.csv'))) return m;
  for (const r of rows('odakyu_shinjuku_trains_verified.csv')) m.set(`${dayOf(r['日别']!)}|${serviceTimeOf(r['新宿发车时刻'])}`, r);
  return m;
}

let odakyuConfirmed = 0;
let odakyuNaviTracks = 0;

/**
 * Tracks of the Romancecars the timetables place only on 「2・3番ホーム」, looked up by the project owner on NAVITIME's
 * station timetable of 新宿 (odakyu_shinjuku_romancecar_platforms.csv): day|time → { track, destination, name, url }.
 * Only a single track number of the Odakyu platforms is used.
 */
function odakyuRomancecarTracks(): Map<string, { track: string; destination: string; name: string; url: string }> {
  const m = new Map<string, { track: string; destination: string; name: string; url: string }>();
  if (!existsSync(resolve(inDir, 'odakyu_shinjuku_romancecar_platforms.csv'))) return m;
  for (const r of rows('odakyu_shinjuku_romancecar_platforms.csv')) {
    const track = (r['新宿番线'] ?? '').trim().normalize('NFKC');
    if (!ODAKYU_TRACKS.includes(track)) continue;
    m.set(`${dayOf(r['日别']!)}|${serviceTimeOf(r['新宿发车时刻'])}`, { track, destination: r['终点站'] ?? '', name: r['列车名号数'] ?? '', url: r['来源URL'] ?? '' });
  }
  return m;
}

/** The remark on a train whose two readings differ: confirmed when the checked list agrees with the destination kept. */
function odakyuDestinationRemark(destination: string, other: string, checked: Row | undefined): string {
  if (checked && checked['终点站'] && destKey(checked['终点站']) === destKey(destination)) {
    odakyuConfirmed++;
    const what = [checked['列车名号数'], checked['分割併結']].filter(Boolean).join('; ');
    return `Destination confirmed on ${checked['来源URL']} (checked by the project owner, 2026-11-18${what ? `: ${what}` : ''})`;
  }
  const checkedNote = checked?.['终点站'] ? `; the project owner's check of Odakyu's pages gives 「${checked['终点站']}」` : '';
  return `UNCONFIRMED: another reading of the same PDF gives the destination 「${other}」${checkedNote}`;
}

function odakyu(legacy: LegacyRow[]): TimetableRecord[] {
  const seq = new Map<string, number>();
  const second = odakyuSecondOpinion();
  const checked = odakyuChecked();
  const navi = odakyuRomancecarTracks();
  return rows('odakyu_shinjuku_departures.csv').map((r) => {
    const day = dayOf(r.day_type!);
    const n = (seq.get(day) ?? 0) + 1;
    seq.set(day, n);
    const romancecar = truthy(r.romancecar);
    // NAVITIME's track for a Romancecar of the same day, time and destination; otherwise the legacy track
    const naviHit = r.platform ? undefined : navi.get(`${day}|${serviceTimeOf(r.time)}`);
    const naviTr = naviHit && r.destination && destKey(naviHit.destination) === destKey(r.destination) ? naviHit : undefined;
    if (naviTr) odakyuNaviTracks++;
    const legacyTr = r.platform || naviTr ? null : legacyTrack(legacy, { line_id: 'odakyu:odawara', day, departure: serviceTimeOf(r.time), destination: r.destination || null, allowed: ODAKYU_TRACKS });
    const track = r.platform || naviTr?.track || legacyTr;
    return {
      station_id: 'odakyu:shinjuku',
      operator_id: 'odakyu',
      line_id: 'odakyu:odawara',
      platform_id: track ? `odakyu:shinjuku:${track}` : null,
      direction_id: null,
      service_date_type: day,
      trip_id: `odakyu-tt:${day}:${String(n).padStart(4, '0')}`,
      train_number: null,
      arrival_time_local: null,
      departure_time_local: serviceTimeOf(r.time),
      destination_text: r.destination || null,
      service_class: r.type || null,
      vehicle_series: null,
      formation_length: null,
      vehicle_assignment_status: 'unknown',
      source_id: ODAKYU_SOURCE,
      valid_from: null,
      valid_until: null,
      remarks:
        [
          r.platform
            ? null
            : naviTr
              ? `Track from NAVITIME's timetable of 新宿 (${naviTr.url}), looked up by the project owner on 2026-11-19${naviTr.name ? `; ${naviTr.name}` : ''}.`
              : legacyTr
                ? LEGACY_REMARK
                : `No track for this train (the table gives only: ${r.platform_hint || 'nothing'}); not drawn.`,
          romancecar ? 'ロマンスカー' : null,
          truthy(r.coupled_split) ? '併結・分割あり' : null,
          (() => {
            const other = second.get(`${day}|${serviceTimeOf(r.time)}`);
            return other && r.destination && destKey(other) !== destKey(r.destination) ? odakyuDestinationRemark(r.destination, other, checked.get(`${day}|${serviceTimeOf(r.time)}`)) : null;
          })(),
          r.kaisei || null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    } satisfies TimetableRecord;
  });
}

const SEIBU_SOURCE = 'local:seibu-station-timetable';

/**
 * 西武新宿 from Seibu's own station timetable (seibu.ekitan.com, saved as seibu_shinjuku_{weekday,holiday}.csv by the
 * project owner): time, type, destination of every departure. It agrees train by train with the legacy layer, which
 * also gives a track; Seibu's pages give none, so the track is taken from the legacy row of the same time and
 * destination. Empty when the files are absent (the legacy rows are used instead).
 */
function seibu(legacy: LegacyRow[]): TimetableRecord[] {
  const out: TimetableRecord[] = [];
  for (const f of ['seibu_shinjuku_weekday.csv', 'seibu_shinjuku_holiday.csv']) {
    if (!existsSync(resolve(inDir, f))) continue;
    let n = 0;
    for (const r of rows(f)) {
      const day = dayOf(r['日別']!);
      const dep = serviceTimeOf(r['時刻']);
      const track = legacyTrack(legacy, { line_id: 'seibu:shinjuku', day, departure: dep, destination: r['去向'] || null, allowed: ['1', '2', '3'] });
      out.push({
        station_id: 'seibu:seibu-shinjuku',
        operator_id: 'seibu',
        line_id: 'seibu:shinjuku',
        platform_id: track ? `seibu:seibu-shinjuku:${track}` : null,
        direction_id: null,
        service_date_type: day,
        trip_id: `seibu-tt:${day}:${String(++n).padStart(4, '0')}`,
        train_number: null,
        arrival_time_local: null,
        departure_time_local: dep,
        destination_text: r['去向'] || null,
        service_class: r['種別'] || null,
        vehicle_series: null,
        formation_length: null,
        vehicle_assignment_status: 'unknown',
        source_id: SEIBU_SOURCE,
        valid_from: null,
        valid_until: null,
        remarks: [r['始発'] === '○' ? '当駅始発' : null, track ? LEGACY_REMARK : 'No track (Seibu\'s timetable gives none, and no legacy row matches); not drawn.'].filter(Boolean).join(' · ') || null,
      });
    }
  }
  return out;
}

/** Tokyo Metro station timetables saved by hand as text (data/raw/private-saved/metro/*.txt). */
function metro(): { records: TimetableRecord[]; covered: Set<string>; files: string[] } {
  const dir = resolve(inDir, 'metro');
  const records: TimetableRecord[] = [];
  const covered = new Set<string>();
  const files: string[] = [];
  if (!existsSync(dir)) return { records, covered, files };
  for (const f of readdirSync(dir).filter((x) => /\.txt$/i.test(x)).sort()) {
    const t = parseMetroText(readFileSync(resolve(dir, f), 'utf8'));
    if (!t) {
      console.warn(`${f}: no timetable URL in the text; skipped`);
      continue;
    }
    const rs = metroRecords(t);
    if (!rs.length) continue;
    files.push(f);
    records.push(...rs);
    for (const r of rs) if (r.platform_id) covered.add(`${r.station_id}|${r.platform_id.split(':').pop()}|${r.service_date_type}`);
  }
  return { records, covered, files };
}

/** 西武新宿 and 丸ノ内線 新宿: the legacy timetable, except where an official Tokyo Metro table covers the same station, track and day. */
function fromLegacy(legacy: LegacyRow[], covered: Set<string>, seibuOfficial: boolean): TimetableRecord[] {
  const spec: Record<string, { station: string; operator: string; tracks: string[] }> = {
    'seibu:shinjuku': { station: 'seibu:seibu-shinjuku', operator: 'seibu', tracks: ['1', '2', '3'] },
    'tokyo-metro:marunouchi': { station: 'tokyo-metro:shinjuku:M08', operator: 'tokyo-metro', tracks: ['1', '2'] },
  };
  const seq = new Map<string, number>();
  const out: TimetableRecord[] = [];
  for (const r of legacy) {
    const sp = spec[r.line_id];
    if (!sp || r.station_id !== sp.station || !r.departure) continue;
    if (covered.has(`${sp.station}|${r.track}|${r.day}`)) continue;
    if (seibuOfficial && r.line_id === 'seibu:shinjuku') continue;
    const k = `${r.line_id}|${r.day}`;
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    const track = sp.tracks.includes(r.track) ? r.track : null;
    out.push({
      station_id: sp.station,
      operator_id: sp.operator,
      line_id: r.line_id,
      platform_id: track ? `${sp.station}:${track}` : null,
      direction_id: null,
      service_date_type: r.day,
      trip_id: `legacy:${r.line_id}:${r.day}:${String(n).padStart(4, '0')}`,
      train_number: null,
      arrival_time_local: null,
      departure_time_local: r.departure,
      destination_text: r.destination || null,
      service_class: r.service_class || null,
      vehicle_series: null,
      formation_length: null,
      vehicle_assignment_status: 'unknown',
      source_id: LEGACY_SOURCE_ID,
      valid_from: null,
      valid_until: null,
      remarks: [track ? null : 'No track in the legacy table; not drawn.', r.remarks || null].filter(Boolean).join(' · ') || null,
    });
  }
  return out;
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const legacy = loadLegacyRows(root);
  const k = keio();
  const o = odakyu(legacy);
  const m = metro();
  const sb = seibu(legacy);
  const l = fromLegacy(legacy, m.covered, sb.length > 0);
  const today = new Date().toISOString().slice(0, 10);
  const sources: TimetableSource[] = [
    {
      id: KEIO_SOURCE,
      title: '京王電鉄 新宿駅・新線新宿駅 時刻表（京王の駅時刻表ページ、NAVITIME 提供）— ローカル専用',
      publisher: '京王電鉄 (transfer-train.navitime.biz/keio); CSV handed over by the project owner',
      url: 'https://www.keio.co.jp/train/station/ko01_shinjuku/',
      retrievedAt: '2026-11-17',
      license: 'Not licensed for redistribution. Local private use only; not in the repository.',
      notes: `CSV keio_shinjuku_departures.csv (retrieved 2026-11-17 by the project owner): departure, type, destination and track of every train, 2026年8月16日 / 17日 改正. Converted ${today} by scripts/import-private-timetables.ts. ${k.skipped} eastbound Toei Shinjuku Line departures were left out as duplicates of the committed Toei timetable. 43 types were inferred by the CSV's maker from an image and a booking link (京王ライナー). Values not checked against the pages by this prototype.`,
    },
    {
      id: ODAKYU_SOURCE,
      title: '小田急電鉄 新宿駅 時刻表（小田急の PDF 時刻表と駅探）— ローカル専用',
      publisher: '小田急電鉄 (www.odakyu.jp/station/pdf/shinjuku.pdf) and 駅探; CSV handed over by the project owner',
      url: 'https://www.odakyu.jp/station/shinjuku/',
      retrievedAt: '2026-11-17',
      license: 'Not licensed for redistribution. Local private use only; not in the repository.',
      notes: `CSV odakyu_shinjuku_departures.csv (retrieved 2026-11-17 by the project owner): departure times checked minute by minute against Odakyu's PDF timetable (according to the CSV), types and destinations from 駅探, 2026年3月14日 / 16日 改正. No track per train in this CSV, only a platform group: tracks come from the legacy timetable, and for the ${odakyuNaviTracks} Romancecars it leaves on 「2・3」 from NAVITIME's timetable of 新宿 (https://www.navitime.co.jp/diagram/timetable?node=00004254&displayLine=00000059&updown=1, odakyu_shinjuku_romancecar_platforms.csv, looked up by the project owner 2026-11-19). Converted ${today}. Values not checked against the sources by this prototype. ${odakyuConfirmed ? `The ${odakyuConfirmed} trains whose destination differed in a second reading of the PDF were checked by the project owner on Odakyu's own pages (www.odakyu.jp/station/shinjuku/timetable/down/ and www.odakyu.jp/romancecar/timetable/, odakyu_shinjuku_trains_verified.csv, 2026-11-18): the destination kept is right for all of them.` : ''}`,
    },
  ];
  writeFileSync(resolve(outDir, 'keio-shinjuku.csv'), recordsToCsv(k.records));
  writeFileSync(resolve(outDir, 'odakyu-shinjuku.csv'), recordsToCsv(o));
  writeFileSync(resolve(outDir, 'legacy-seibu-metro.csv'), recordsToCsv(l));
  writeFileSync(resolve(outDir, 'tokyometro.csv'), recordsToCsv(m.records));
  writeFileSync(resolve(outDir, 'seibu-shinjuku.csv'), recordsToCsv(sb));
  if (sb.length)
    sources.push({
      id: SEIBU_SOURCE,
      title: '西武鉄道 西武新宿駅 時刻表（seibu.ekitan.com）— ローカル専用',
      publisher: '西武鉄道 (seibu.ekitan.com); CSV handed over by the project owner',
      url: 'https://seibu.ekitan.com/norikae/timetable/station/238-0/d1?dw=0',
      retrievedAt: '2026-11-18',
      license: 'Not licensed for redistribution. Local private use only; not in the repository.',
      notes: `Seibu's own station timetable of 西武新宿 (weekday dw=0, Saturday / holiday dw=1): time, type and destination of all ${sb.length} departures. Identical, train by train, to the legacy layer (day, time, destination; the legacy wording of the types is shorter: 特急 / ライナー for 特急小江戸 / 拝島ライナー). Seibu gives no track; the track is the legacy one.`,
    });
  if (m.files.length)
    sources.push({
      id: METRO_SOURCE_ID,
      title: '東京メトロ 駅時刻表（transfer.tokyometro.jp、NAVITIME 提供）— ローカル専用',
      publisher: '東京地下鉄; text copied from the pages by the project owner',
      url: 'https://www.tokyometro.jp/station/shinjuku/timetable/index.html',
      retrievedAt: '2026-11-18',
      license: 'The pages forbid reproduction (「当サイトの情報を転載、コピー、改変等の行為は禁止いたします」). Local private use only; not in the repository.',
      notes: `Files: ${m.files.join(', ')}. One station, direction and kind of day each; departure time and destination of every train. The track is the one the station drawing signs for the direction. Where a file covers a station, track and day, the legacy rows for it are not used. M08 both directions, weekday and Saturday / holiday: all 1,144 trains identical in both (day, track, time, destination). M08 荻窪方面 weekday saved 2026-11-17, the other 11 files 2026-11-18. 当駅始発 marks are kept as a remark.`,
    });
  if (legacy.length)
    sources.push({
      id: LEGACY_SOURCE_ID,
      title: 'timetable_events.csv（新宿駅 全列車時刻、Yahoo!路線情報 由来の層）— ローカル専用・未確認',
      publisher: 'CSV handed over by the project owner (built 2026-11-14 by another tool; layer src-legacy-yahoo-2026-11)',
      url: null,
      retrievedAt: '2026-11-17',
      license: 'Not licensed for redistribution. Local private use only; not in the repository.',
      notes:
        'Departure tables with a track per train, status pending_verification in the file itself. Used only where nothing better exists: the trains of 西武新宿 and 丸ノ内線 新宿, and the tracks of Odakyu trains and of JR 中央線快速 / 埼京線 trains. Where this prototype has official tracks, the legacy tracks agree on every unambiguous match (JR 908, Keio 699; 2026-11-17). The file\'s Toei GTFS layer is identical to the committed Toei timetable and is not used. Vehicle claims in the file are not used.',
    });
  writeFileSync(resolve(outDir, 'private-sources.json'), JSON.stringify({ generatedAt: today, sources }, null, 2) + '\n');
  const count = (rs: TimetableRecord[]) => {
    const m = new Map<string, number>();
    for (const r of rs) m.set(`${r.line_id} ${r.service_date_type}${r.platform_id ? ` @${r.platform_id.split(':').pop()}` : ' (no track)'}`, (m.get(`${r.line_id} ${r.service_date_type}${r.platform_id ? ` @${r.platform_id.split(':').pop()}` : ' (no track)'}`) ?? 0) + 1);
    return [...m].sort();
  };
  for (const [key, n] of count([...k.records, ...o, ...l, ...m.records, ...sb])) console.log(`${String(n).padStart(5)}  ${key}`);
  console.log(`京王ライナー / Mt.TAKAO号 confirmed: ${k.linerChecked}; 西武新宿 official: ${sb.length}`);
  console.log(`小田急 destinations confirmed: ${odakyuConfirmed}; still UNCONFIRMED: ${o.filter((r) => r.remarks?.includes('UNCONFIRMED')).length}`);
  console.log(`小田急 Romancecar tracks from NAVITIME: ${odakyuNaviTracks}; Odakyu trains without a track: ${o.filter((r) => !r.platform_id).length}`);
  console.log(`wrote ${k.records.length} Keio and ${o.length} Odakyu records (local only); ${k.skipped} Toei-direction duplicates left out`);
}

main();
