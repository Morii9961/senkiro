/**
 * LOCAL ONLY. Reads JR East's station timetable site for the JR lines at
 * Shinjuku and writes data/raw/timetable/jreast-shinjuku.csv — a folder that
 * git ignores. Nothing this script reads or writes is committed or deployed.
 *
 * Why local only: the terms of use of jreast.co.jp (section 2, see
 * src:jreast-site-rules) refuse any reproduction, electronic processing or
 * redistribution of the site's content. The project owner decided on
 * 2026-11-16 to read the timetables for private use on this machine only.
 *
 *   npx tsx scripts/fetch-timetable-jreast.ts                 priority lines
 *   npx tsx scripts/fetch-timetable-jreast.ts --offline       only pages already in the cache
 *
 * Polite by construction: one page per second at most, a plain client name,
 * and every page kept in data/raw/jreast-cache/ so that nothing is read twice.
 *
 * Which pages: the Shinjuku departure timetables of 成田エクスプレス,
 * 中央本線 (limited expresses), 湘南新宿ライン (both ways; it also carries the
 * 東武線直通特急), plus the departure timetables of the stations before
 * Shinjuku for trains that end their run at Shinjuku (東京: 成田エクスプレス,
 * 立川 / 八王子: 中央本線 上り, 池袋 / 渋谷: 湘南新宿ライン). Every train's
 * stop list is read for its Shinjuku times, track and train number.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordsToCsv } from '../src/timetable/adapter';
import { parseServiceTime } from '../src/timetable/time';
import type { TimetableRecord, TimetableSource } from '../src/timetable/types';
import { parseLineList, parseStationTimetable, parseTrainPage, type TrainColumn } from './jreast/parse';
import { serviceTimeOf } from '../src/timetable/odpt';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = resolve(root, 'data/raw/jreast-cache');
const outDir = resolve(root, 'data/raw/timetable');
const BASE = 'https://timetables.jreast.co.jp/';
const SHINJUKU = '0866';
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = 'SENKIRO-Lab-local-timetable-reader/0.1 (private use, 1 request per second)';
export const JREAST_SOURCE_ID = 'local:jreast-station-timetables';

const offline = process.argv.includes('--offline');
let lastFetch = 0;
let fetched = 0;
let cached = 0;

async function page(path: string): Promise<string | null> {
  const file = resolve(cacheDir, path.replace(/[?#].*$/, ''));
  if (existsSync(file)) {
    cached++;
    return readFileSync(file, 'utf8');
  }
  if (offline) return null;
  const wait = lastFetch + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();
  const res = await fetch(BASE + path, { headers: { 'user-agent': USER_AGENT } });
  fetched++;
  if (!res.ok) {
    console.warn(`HTTP ${res.status} for ${path}`);
    return null;
  }
  const html = await res.text();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  if (fetched % 50 === 0) console.log(`… ${fetched} pages read`);
  return html;
}

/** Resolves a link written in a page against that page's path. */
function join(from: string, href: string): string {
  return new URL(href, BASE + from).pathname.replace(/^\//, '');
}

type DayType = 'weekday' | 'saturday-holiday';

interface Wanted {
  station: string;
  label: string;
  line: RegExp;
  direction: RegExp;
}

const WANTED: Wanted[] = [
  { station: SHINJUKU, label: '新宿 成田エクスプレス', line: /^成田エクスプレス$/, direction: /成田空港/ },
  { station: SHINJUKU, label: '新宿 中央本線 下り', line: /^中央本線$/, direction: /下り/ },
  { station: SHINJUKU, label: '新宿 湘南新宿ライン 北行', line: /^湘南新宿ライン$/, direction: /北行/ },
  { station: SHINJUKU, label: '新宿 湘南新宿ライン 南行', line: /^湘南新宿ライン$/, direction: /南行/ },
];
/** Stations before Shinjuku, found by name in the stop lists: their timetables show the trains that end at Shinjuku. */
const UPSTREAM: { name: string; label: string; line: RegExp; direction: RegExp }[] = [
  { name: '東京', label: '東京 成田エクスプレス 新宿方面', line: /^成田エクスプレス$/, direction: /新宿/ },
  { name: '立川', label: '立川 中央本線 上り', line: /^中央本線$/, direction: /上り/ },
  { name: '八王子', label: '八王子 中央本線 上り', line: /^中央本線$/, direction: /上り/ },
  { name: '池袋', label: '池袋 湘南新宿ライン 南行', line: /^湘南新宿ライン$/, direction: /南行/ },
  { name: '渋谷', label: '渋谷 湘南新宿ライン 北行', line: /^湘南新宿ライン$/, direction: /北行/ },
];

/** Neighbours of JR Shinjuku that tell the direction of a call: south = 代々木 / 渋谷 side, north = 大久保 / 新大久保 / 池袋 side. */
const SOUTH = new Set(['代々木', '渋谷', '四ツ谷', '御茶ノ水', '神田', '東京', '品川', '大崎', '恵比寿', '原宿', '武蔵小杉', '横浜', '大船']);
const NORTH = new Set(['大久保', '新大久保', '池袋', '中野', '三鷹', '吉祥寺', '荻窪', '国分寺', '立川', '八王子', '高尾', '赤羽', '浦和', '大宮', '新宿三丁目']);

function lineOf(col: TrainColumn, pageLine: string): string | null {
  const name = col.name ?? '';
  if (/成田エクスプレス/.test(name)) return 'jr-east:narita-express';
  if (/あずさ|かいじ|富士回遊|はちおうじ|おうめ/.test(name)) return 'jr-east:chuo-limited-express';
  if (/日光|きぬがわ/.test(name)) return 'jr-east:tobu-through-limited-express';
  if (pageLine === '湘南新宿ライン' && /^(普通|快速|特別快速)$/.test(col.type ?? '')) return 'jr-east:shonan-shinjuku';
  // any other named train on these tracks (特急「湘南」, 踊り子 …): kept, on a line id the registry does not know
  if (col.type && /特急/.test(col.type)) return 'jr-east:other-limited-express';
  return null;
}

function directionOf(col: TrainColumn, i: number): 'southbound' | 'northbound' | null {
  const next = col.calls[i + 1]?.station;
  const prev = col.calls[i - 1]?.station;
  if (next && SOUTH.has(next)) return 'southbound';
  if (next && NORTH.has(next)) return 'northbound';
  if (!next && prev && NORTH.has(prev)) return 'southbound';
  if (!next && prev && SOUTH.has(prev)) return 'northbound';
  return null;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const listPath = `timetable/list${SHINJUKU}.html`;
  const listHtml = await page(listPath);
  if (!listHtml) throw new Error('could not read the Shinjuku line list');
  const edition = /\.\.\/(\d{4})\/timetable\//.exec(listHtml)?.[1] ?? 'unknown';

  /** Station timetable pages to read: path → day type and the line it is for. */
  const timetables: { path: string; day: DayType; line: string; label: string }[] = [];
  const addFromList = (html: string, from: string, w: { label: string; line: RegExp; direction: RegExp }) => {
    const rows = parseLineList(html).filter((r) => w.line.test(r.line) && w.direction.test(r.direction));
    if (rows.length === 0) console.warn(`no timetable for ${w.label}`);
    for (const r of rows) {
      if (r.weekday) timetables.push({ path: join(from, r.weekday), day: 'weekday', line: r.line, label: w.label });
      if (r.holiday) timetables.push({ path: join(from, r.holiday), day: 'saturday-holiday', line: r.line, label: w.label });
    }
  };
  for (const w of WANTED) addFromList(listHtml, listPath, w);

  const trainPages = new Map<string, { days: Set<DayType>; line: string }>();
  const readTimetables = async (list: typeof timetables) => {
    for (const t of list) {
      const html = await page(t.path);
      if (!html) continue;
      for (const e of parseStationTimetable(html).entries) {
        if (!e.href) continue;
        const p = join(t.path, e.href);
        const entry = trainPages.get(p) ?? { days: new Set<DayType>(), line: t.line };
        entry.days.add(t.day);
        trainPages.set(p, entry);
      }
    }
  };
  await readTimetables(timetables);

  // station codes from the stop lists already read, to find the upstream stations' line lists
  const codes = new Map<string, string>();
  const parsed = new Map<string, TrainColumn[]>();
  const readTrains = async () => {
    for (const p of trainPages.keys()) {
      if (parsed.has(p)) continue;
      const html = await page(p);
      if (!html) continue;
      const cols = parseTrainPage(html);
      parsed.set(p, cols);
      for (const c of cols) for (const call of c.calls) if (call.code) codes.set(call.station, call.code);
    }
  };
  await readTrains();

  const upstream: typeof timetables = [];
  for (const u of UPSTREAM) {
    const code = codes.get(u.name);
    if (!code) {
      console.warn(`no station code for ${u.name}; trains ending at Shinjuku from there are missing`);
      continue;
    }
    const path = `timetable/list${code}.html`;
    const html = await page(path);
    if (!html) continue;
    const before = timetables.length;
    addFromList(html, path, u);
    upstream.push(...timetables.slice(before));
  }
  await readTimetables(upstream);
  await readTrains();

  // one record per train column that calls at 新宿, per kind of day
  const records: TimetableRecord[] = [];
  const seen = new Set<string>();
  const skipped = new Map<string, number>();
  for (const [p, info] of trainPages) {
    for (const col of parsed.get(p) ?? []) {
      const i = col.calls.findIndex((c) => c.station === '新宿');
      if (i < 0) continue;
      const line = lineOf(col, info.line);
      if (!line) {
        skipped.set(`${col.type ?? '?'} on ${info.line}`, (skipped.get(`${col.type ?? '?'} on ${info.line}`) ?? 0) + 1);
        continue;
      }
      const call = col.calls[i]!;
      const last = col.calls.at(-1)!;
      for (const day of info.days) {
        const key = `${day}|${col.number}|${call.arr}|${call.dep}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const remarks = [col.name ?? null, col.days.length ? `運転日: ${col.days.join(' / ')}` : null, call.platform ? null : 'No track in the stop list; not drawn.']
          .filter(Boolean)
          .join(' · ');
        records.push({
          station_id: 'jr-east:shinjuku',
          operator_id: 'jr-east',
          line_id: line,
          platform_id: call.platform ? `jr-east:shinjuku:${call.platform}` : null,
          direction_id: directionOf(col, i),
          service_date_type: day,
          trip_id: `jreast:${p.replace(/^.*train\//, '').replace(/\.html$/, '')}:${col.number ?? '?'}`,
          train_number: col.number,
          arrival_time_local: serviceTimeOf(call.arr ?? undefined),
          departure_time_local: serviceTimeOf(call.dep ?? undefined),
          destination_text: last.station === '新宿' ? '新宿' : last.station,
          service_class: col.type,
          vehicle_series: null,
          formation_length: null,
          vehicle_assignment_status: 'unknown',
          source_id: JREAST_SOURCE_ID,
          valid_from: null,
          valid_until: null,
          remarks: remarks || null,
        });
      }
    }
  }

  const time = (r: TimetableRecord) => parseServiceTime(r.departure_time_local ?? r.arrival_time_local) ?? 0;
  records.sort((a, b) => a.line_id.localeCompare(b.line_id) || a.service_date_type.localeCompare(b.service_date_type) || time(a) - time(b) || a.trip_id.localeCompare(b.trip_id));

  const retrievedAt = new Date().toISOString().slice(0, 10);
  const source: TimetableSource = {
    id: JREAST_SOURCE_ID,
    title: `JR東日本 駅の時刻表（新宿駅ほか, ${edition} 版）— ローカル専用`,
    publisher: 'East Japan Railway Company (timetables.jreast.co.jp)',
    url: `${BASE}timetable/list${SHINJUKU}.html`,
    retrievedAt,
    license: 'Not licensed for redistribution (jreast.co.jp terms of use, section 2). Local private use only; not in the repository.',
    notes: `Read by scripts/fetch-timetable-jreast.ts, ${fetched + cached} pages (${fetched} from the network this run). Tables: ${[...new Set([...timetables, ...upstream].map((t) => t.label))].join(', ')}. Times, tracks, train numbers, types and names as printed in each train's stop list; times before 03:00 written as 24:xx; direction from the next / previous stop.`,
  };
  writeFileSync(resolve(outDir, 'jreast-shinjuku.csv'), recordsToCsv(records));
  writeFileSync(resolve(outDir, 'jreast-shinjuku.sources.json'), JSON.stringify({ generatedAt: retrievedAt, sources: [source] }, null, 2) + '\n');

  const summary = new Map<string, number>();
  for (const r of records) {
    const k = `${r.line_id} ${r.service_date_type}${r.platform_id ? '' : ' (no track)'}${r.direction_id ? '' : ' (no direction)'}`;
    summary.set(k, (summary.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...summary].sort()) console.log(`${String(n).padStart(5)}  ${k}`);
  for (const [k, n] of skipped) console.log(`skipped ${n}: ${k}`);
  console.log(`wrote ${records.length} records (local only) — ${fetched} pages fetched, ${cached} from cache`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
