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
 *   npx tsx scripts/fetch-timetable-jreast.ts --digital --interval=20000
 *                         only the line timetables (デジタル時刻表) of the JR lines at Shinjuku, one page
 *                         per 20 s, into data/raw/jreast-saved/; then the records are rebuilt from the cache
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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, recordsToCsv } from '../src/timetable/adapter';
import { parseServiceTime } from '../src/timetable/time';
import type { TimetableRecord, TimetableSource } from '../src/timetable/types';
import { dateLimited, halfWidth, parseDigitalTimetable, parseLineList, parseStationTimetable, parseTrainPage, type DigitalColumn, type TrainColumn } from './jreast/parse';
import { serviceTimeOf } from '../src/timetable/odpt';
import { LEGACY_REMARK, legacyTrack, loadLegacyRows } from './legacy-events';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = resolve(root, 'data/raw/jreast-cache');
const outDir = resolve(root, 'data/raw/timetable');
/** Line timetables (デジタル時刻表) saved by hand from a browser, as .html files: read when present. */
const savedDir = resolve(root, 'data/raw/jreast-saved');
const BASE = 'https://timetables.jreast.co.jp/';
const SHINJUKU = '0866';
/** At least this long between two requests; `--interval=<ms>` slows it down further (never below 1.1 s). */
const MIN_INTERVAL_MS = Math.max(1100, Number(/--interval=(\d+)/.exec(process.argv.join(' '))?.[1] ?? 0));
const USER_AGENT = 'SENKIRO-Lab-local-timetable-reader/0.1 (private use, 1 request per second)';
export const JREAST_SOURCE_ID = 'local:jreast-station-timetables';

/** Set by --offline, or after the first network failure: the site is then left alone and only the cache is used. */
let offline = process.argv.includes('--offline');
/** `--only-upstream=東京,…`: read only these upstream stations' tables and the stop lists they link to; every other stop list only from the cache. */
const onlyUpstream = /--only-upstream=(\S+)/.exec(process.argv.join(' '))?.[1]?.split(',') ?? null;
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
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { 'user-agent': USER_AGENT } });
  } catch (e) {
    // the site refused or dropped the connection: stop asking it, finish from the cache
    console.warn(`network failure on ${path} (${(e as Error).cause ?? e}); no further requests this run`);
    offline = true;
    return null;
  }
  fetched++;
  if (!res.ok) {
    console.warn(`HTTP ${res.status} for ${path}; no further requests this run`);
    offline = true;
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
// 錦糸町: the first stop of 新宿わかしお / 新宿さざなみ, which leave over the 中央線 towards 御茶ノ水 (southwards out of 新宿)
const SOUTH = new Set(['代々木', '渋谷', '四ツ谷', '御茶ノ水', '神田', '東京', '品川', '大崎', '恵比寿', '原宿', '武蔵小杉', '横浜', '大船', '錦糸町']);
const NORTH = new Set(['大久保', '新大久保', '池袋', '中野', '三鷹', '吉祥寺', '荻窪', '国分寺', '立川', '八王子', '高尾', '赤羽', '浦和', '大宮', '新宿三丁目', '東中野', '高田馬場', '目白', '板橋', '十条', '武蔵浦和', '大月', '甲府']);

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

/**
 * Where the train goes: the end of its whole route in the page title; when its own column ends where it
 * is coupled to another train (「東京－成田空港は2001Mに併結」), the end of the coupled run.
 */
function destinationOf(col: TrainColumn, page: TrainColumn[]): string | null {
  let end = col.route?.at(-1) ?? col.calls.at(-1)?.station ?? null;
  for (const note of col.coupling) {
    const m = /^(.+?)－(.+?)は/.exec(note);
    if (m && m[1] === end) return m[2]!;
  }
  // a train that runs on under another number from where its column ends (2209M 新宿→東京, then 2009M 東京→成田空港)
  let cur = col;
  for (let hop = 0; hop < 3 && col.route == null; hop++) {
    const next = page.find((c) => c !== cur && c.calls[0]?.station === end && c.calls[0]?.arr == null && c.name === cur.name);
    if (!next) break;
    end = next.calls.at(-1)?.station ?? end;
    cur = next;
  }
  return end;
}

/** The line of a train in a line timetable, from the page title and the train name. */
function lineOfDigital(col: DigitalColumn, title: string): string | null {
  const name = col.name ?? '';
  if (/成田エクスプレス/.test(name)) return 'jr-east:narita-express';
  if (/あずさ|かいじ|富士回遊|はちおうじ|おうめ/.test(name)) return 'jr-east:chuo-limited-express';
  if (/日光|きぬがわ/.test(name)) return 'jr-east:tobu-through-limited-express';
  if (/特急/.test(name)) return 'jr-east:other-limited-express';
  if (/^山手線/.test(title)) return 'jr-east:yamanote';
  if (/^中央・総武線|^中央線・総武線/.test(title)) return 'jr-east:chuo-sobu-local';
  if (/^中央線快速|^中央線（快速）|^中央本線/.test(title)) return 'jr-east:chuo-rapid';
  if (/^埼京線/.test(title)) return 'jr-east:saikyo';
  if (/^湘南新宿ライン/.test(title)) return 'jr-east:shonan-shinjuku';
  return null;
}

/**
 * Lines with a single track per direction at JR Shinjuku, from the station model (track services and
 * their direction signs): a line timetable without a track row can still be placed for these.
 */
const SINGLE_TRACK: Record<string, { southbound: string; northbound: string }> = {
  'jr-east:yamanote': { southbound: '14', northbound: '15' },
  'jr-east:chuo-sobu-local': { southbound: '13', northbound: '16' },
};

function directionOfCalls(calls: { station: string }[], i: number): 'southbound' | 'northbound' | null {
  const next = calls[i + 1]?.station;
  const prev = calls[i - 1]?.station;
  if (next && SOUTH.has(next)) return 'southbound';
  if (next && NORTH.has(next)) return 'northbound';
  if (prev && NORTH.has(prev)) return 'southbound';
  if (prev && SOUTH.has(prev)) return 'northbound';
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

  if (process.argv.includes('--digital')) {
    // the line timetables linked from the Shinjuku list, plus the two reverse directions that end at Shinjuku
    const codes = new Set([...listHtml.matchAll(/timetable-v\/(\w+)\.html/g)].map((m) => m[1]!));
    for (const c of ['223u1', '223u2', '023u1', '023u2']) codes.add(c);
    mkdirSync(savedDir, { recursive: true });
    for (const code of [...codes].sort()) {
      const target = resolve(savedDir, `${code}.html`);
      if (existsSync(target)) continue;
      const html = await page(`${edition}/timetable-v/${code}.html`);
      if (html && /paper_table/.test(html)) writeFileSync(target, html);
      else if (html) console.warn(`${code}: no line timetable on the page; not saved`);
      if (offline) break;
    }
    console.log(`line timetables in data/raw/jreast-saved/: ${readdirSync(savedDir).filter((f) => /\.html?$/i.test(f)).length}`);
    offline = true; // build the records from what is now on disk; no stop lists are requested in this mode
  }

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
  const upstreamPages = new Set<string>();
  const readTrains = async () => {
    for (const p of trainPages.keys()) {
      if (parsed.has(p)) continue;
      if (onlyUpstream && !upstreamPages.has(p) && !existsSync(resolve(cacheDir, p))) continue;
      const html = await page(p);
      if (!html) continue;
      const cols = parseTrainPage(html);
      parsed.set(p, cols);
      for (const c of cols) for (const call of c.calls) if (call.code) codes.set(call.station, call.code);
    }
  };
  await readTrains();

  const upstream: typeof timetables = [];
  for (const u of UPSTREAM.filter((x) => !onlyUpstream || onlyUpstream.includes(x.name))) {
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
  {
    const before = new Set(trainPages.keys());
    await readTimetables(upstream);
    for (const p of trainPages.keys()) if (!before.has(p)) upstreamPages.add(p);
    // stop lists linked from both a Shinjuku and an upstream table also count as upstream ones
    for (const t of upstream) {
      const html = await page(t.path);
      if (!html) continue;
      for (const e of parseStationTimetable(html).entries) if (e.href) upstreamPages.add(join(t.path, e.href));
    }
  }
  await readTrains();

  // one record per train column that calls at 新宿, per kind of day
  const records: TimetableRecord[] = [];
  const seen = new Set<string>();
  const skipped = new Map<string, number>();
  for (const [p, info] of trainPages) {
    for (const col of parsed.get(p) ?? []) {
      const i = col.calls.findIndex((c) => c.station === '新宿');
      if (i < 0) continue;
      if (dateLimited(col.days.join(' '))) {
        skipped.set('date-limited (runs only on listed dates)', (skipped.get('date-limited (runs only on listed dates)') ?? 0) + 1);
        continue;
      }
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
          // the end of the train's whole route (a Narita Express section ends its own column at 東京, where it is coupled for 成田空港)
          destination_text: destinationOf(col, parsed.get(p) ?? []),
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

  // line timetables saved by hand: one per line, direction and kind of day, with the Shinjuku times and track of every train
  const savedFiles = existsSync(savedDir) ? readdirSync(savedDir).filter((f) => /\.html?$/i.test(f)).sort() : [];
  const byTrain = new Map(records.map((r) => [`${r.service_date_type}|${r.train_number}`, r]));
  let fromSaved = 0;
  let filled = 0;
  const savedTitles: string[] = [];
  for (const f of savedFiles) {
    const page = parseDigitalTimetable(readFileSync(resolve(savedDir, f), 'utf8'));
    if (!page.day || page.columns.length === 0) {
      console.warn(`${f}: not a line timetable page (no table or no day heading); skipped`);
      continue;
    }
    savedTitles.push(`${page.title} (${page.day === 'weekday' ? '平日' : '土曜・休日'})`);
    const day = page.day === 'weekday' ? 'weekday' : 'saturday-holiday';
    for (const col of page.columns) {
      const i = col.calls.findIndex((c) => c.station === '新宿');
      if (i < 0 || !col.number) continue;
      const line = lineOfDigital(col, page.title);
      if (!line) continue;
      if (dateLimited(col.operatingDay)) {
        skipped.set('date-limited (runs only on listed dates)', (skipped.get('date-limited (runs only on listed dates)') ?? 0) + 1);
        continue;
      }
      const call = col.calls[i]!;
      const direction = directionOfCalls(col.calls, i);
      let platform: string | null = col.platforms['新宿'] ?? null;
      let platformRemark: string | null = null;
      const single = SINGLE_TRACK[line];
      if (!platform && direction && single) {
        platform = single[direction];
        platformRemark = 'Track from the only platform of this line and direction (station drawing).';
      }
      const key = `${day}|${col.number}`;
      const known = byTrain.get(key);
      if (known) {
        // a stop list read earlier wins; the line timetable only fills what it lacks
        let changed = false;
        if (!known.arrival_time_local && call.arr) {
          known.arrival_time_local = serviceTimeOf(call.arr);
          changed = true;
        }
        if (!known.departure_time_local && call.dep) {
          known.departure_time_local = serviceTimeOf(call.dep);
          changed = true;
        }
        if (!known.platform_id && platform) {
          known.platform_id = `jr-east:shinjuku:${platform}`;
          changed = true;
        }
        if (changed) filled++;
        continue;
      }
      let end = col.end ? col.end : (col.calls.at(-1)?.station ?? null);
      // 山手線 is a loop: its line timetables are cut at 品川 / 五反田, which is where a column ends, not where the
      // train is bound. Such trains are signed by direction (外回り 池袋・上野方面 / 内回り 渋谷・品川方面).
      if (line === 'jr-east:yamanote' && (end === '品川' || end === '五反田') && direction) end = direction === 'northbound' ? '池袋・上野方面' : '渋谷・品川方面';
      const rec: TimetableRecord = {
        station_id: 'jr-east:shinjuku',
        operator_id: 'jr-east',
        line_id: line,
        platform_id: platform ? `jr-east:shinjuku:${platform}` : null,
        direction_id: direction,
        service_date_type: day,
        trip_id: `jreast-v:${f.replace(/\.html?$/i, '')}:${col.number}`,
        train_number: col.number,
        arrival_time_local: serviceTimeOf(call.arr ?? undefined),
        departure_time_local: serviceTimeOf(call.dep ?? undefined),
        destination_text: end,
        service_class: col.name ? (/^特急/.test(col.name) ? '特急' : col.name) : null,
        vehicle_series: null,
        formation_length: null,
        vehicle_assignment_status: 'unknown',
        source_id: JREAST_SOURCE_ID,
        valid_from: null,
        valid_until: null,
        remarks: [col.name, col.operatingDay ? `運転日: ${col.operatingDay}` : null, col.article, platform ? platformRemark : 'No track in the line timetable; not drawn.'].filter(Boolean).join(' · ') || null,
      };
      records.push(rec);
      byTrain.set(key, rec);
      fromSaved++;
    }
  }
  if (savedFiles.length) console.log(`saved line timetables: ${savedFiles.length} files, ${fromSaved} trains added, ${filled} completed`);

  // stop lists saved as pages (data/raw/jreast-saved/trains/*.html): the official track of a train the line timetables leave
  // without one, and its direction where the line timetable lists no other stop near 新宿 (e.g. 新宿わかしお, whose first stop is 錦糸町)
  const savedTrainsDir = resolve(savedDir, 'trains');
  let savedFilled = 0;
  let savedDirected = 0;
  if (existsSync(savedTrainsDir)) {
    const byNumber = new Map<string, { arr: string | null; dep: string | null; platform: string | null; direction: 'southbound' | 'northbound' | null }[]>();
    for (const f of readdirSync(savedTrainsDir).filter((x) => /\.html?$/i.test(x))) {
      for (const col of parseTrainPage(readFileSync(resolve(savedTrainsDir, f), 'utf8'))) {
        const i = col.calls.findIndex((c) => c.station === '新宿');
        const call = col.calls[i];
        if (!call || !col.number) continue;
        const list = byNumber.get(col.number) ?? [];
        list.push({ arr: serviceTimeOf(call.arr ?? undefined), dep: serviceTimeOf(call.dep ?? undefined), platform: call.platform ?? null, direction: directionOfCalls(col.calls, i) });
        byNumber.set(col.number, list);
      }
    }
    for (const r of records) {
      if (!r.train_number || (r.platform_id && r.direction_id)) continue;
      const hit = (byNumber.get(r.train_number) ?? []).find((c) => (r.arrival_time_local ? c.arr === r.arrival_time_local : true) && (r.departure_time_local ? c.dep === r.departure_time_local : true));
      if (!hit) continue;
      if (!r.platform_id && hit.platform) {
        r.platform_id = `jr-east:shinjuku:${hit.platform}`;
        r.remarks = [r.remarks?.replace(/ ?· ?No track in the line timetable; not drawn\.?/, ''), 'Track from the train\'s stop list (saved page).'].filter(Boolean).join(' · ');
        savedFilled++;
      }
      if (!r.direction_id && hit.direction) {
        r.direction_id = hit.direction;
        savedDirected++;
      }
    }
    console.log(`saved stop lists: ${savedFilled} tracks filled, ${savedDirected} directions filled`);
  }

  // Narita Express trains from the airport: their Shinjuku arrival track, from the stop lists the project owner collected
  // (jr_east_nex_timetables.csv, one row per train, with the stop-list URL of each)
  const nexFile = resolve(root, 'data/raw/private-saved/jr_east_nex_timetables.csv');
  if (existsSync(nexFile)) {
    const [header, ...body] = parseCsv(readFileSync(nexFile, 'utf8'));
    const col = (name: string) => header!.findIndex((h) => h.trim() === name);
    const [cNum, cArr, cPf, cUrl] = ['列车编号_新宿方向', '新宿_着', '新宿_番线', '来源URL'].map(col);
    let nexFilled = 0;
    for (const cells of body) {
      const nums = (cells[cNum!] ?? '').split('/').map((x) => x.trim()).filter(Boolean);
      const arr = serviceTimeOf((cells[cArr!] ?? '').trim() || undefined);
      const pf = halfWidth((cells[cPf!] ?? '').trim());
      if (!nums.length || !arr || !/^\d+$/.test(pf)) continue;
      for (const r of records) {
        if (r.platform_id || r.line_id !== 'jr-east:narita-express' || !r.train_number || !nums.includes(r.train_number) || r.arrival_time_local !== arr) continue;
        r.platform_id = `jr-east:shinjuku:${pf}`;
        r.remarks = [r.remarks?.replace(/ ?· ?No track in the line timetable; not drawn\.?/, ''), `Track from the stop list (${(cells[cUrl!] ?? '').trim()}), collected by the project owner.`].filter(Boolean).join(' · ');
        nexFilled++;
      }
    }
    console.log(`Narita Express stop lists: ${nexFilled} tracks filled`);
  }

  // 埼京線 trains whose run under one number ends at 新宿: their arrival track, from the stop lists the project owner collected
  // (one row per train seen in the 池袋 / 渋谷 departure tables, with the stop-list URL of each). saikyo_terminating_shinjuku.csv
  // holds the trains marked as ending at 新宿; saikyo_shinjuku_26_trains.csv the morning ones that go on under another number
  // (e.g. 4600K → 121M → 3121 to 海老名), whose continuation already has its departure track in the line timetables.
  const saikyoFiles = ['saikyo_terminating_shinjuku.csv', 'saikyo_shinjuku_26_trains.csv'].map((f) => resolve(root, 'data/raw/private-saved', f)).filter((f) => existsSync(f));
  if (saikyoFiles.length) {
    let saikyoFilled = 0;
    let saikyoUnmatched = 0;
    for (const saikyoFile of saikyoFiles) {
      const [header, ...body] = parseCsv(readFileSync(saikyoFile, 'utf8').replace(/^\uFEFF/, ''));
      const col = (name: string) => header!.findIndex((h) => h.trim() === name);
      const [cDay, cNum, cArr, cPf, cUrl] = ['日历类型', '列车番号', '新宿_着时刻', '新宿_番线', '详情页URL'].map(col);
      for (const cells of body) {
        const nums = (cells[cNum!] ?? '').split('/').map((x) => halfWidth(x.trim())).filter(Boolean);
        const day = (cells[cDay!] ?? '').trim() === '平日' ? 'weekday' : 'saturday-holiday';
        const arr = serviceTimeOf((cells[cArr!] ?? '').trim() || undefined);
        const pf = halfWidth((cells[cPf!] ?? '').trim());
        if (!nums.length || !arr || !/^\d+$/.test(pf)) continue;
        let hit = false;
        for (const r of records) {
          if (r.line_id !== 'jr-east:saikyo' || r.service_date_type !== day || !r.train_number || !nums.includes(r.train_number) || r.arrival_time_local !== arr) continue;
          hit = true;
          if (r.platform_id) continue;
          r.platform_id = `jr-east:shinjuku:${pf}`;
          r.remarks = [
            r.remarks?.replace(/ ?· ?No track in the line timetable; not drawn\.?/, ''),
            `Track from the stop list (${(cells[cUrl!] ?? '').trim()}), collected by the project owner.`,
            nums.length > 1 ? `Numbers on the stop list: ${nums.join(' / ')}.` : null,
          ].filter(Boolean).join(' · ');
          saikyoFilled++;
        }
        if (!hit) saikyoUnmatched++;
      }
    }
    console.log(`埼京線 stop lists (${saikyoFiles.length} files): ${saikyoFilled} tracks filled, ${saikyoUnmatched} rows matched no train`);
  }

  // seasonal limited expresses (新宿わかしお / 新宿さざなみ): their Shinjuku track, from the stop lists the project owner collected
  // (shinjuku_seasonal_limited_express_2611.csv, one row per train with the stop-list URL; the four tracks were also read on
  // the stop-list pages themselves on 2026-11-19 and agree)
  const seasonalFile = resolve(root, 'data/raw/private-saved/shinjuku_seasonal_limited_express_2611.csv');
  if (existsSync(seasonalFile)) {
    const [header, ...body] = parseCsv(readFileSync(seasonalFile, 'utf8').replace(/^\uFEFF/, ''));
    const col = (name: string) => header!.findIndex((h) => h.trim() === name);
    const [cName, cNum, cDay, cDep, cArr, cPf, cUrl] = ['列车名', '列车番号', '日历类型', '新宿_发车时刻', '新宿_着时刻', '新宿_番线', '详情页URL'].map(col);
    let seasonalFilled = 0;
    let seasonalAgreed = 0;
    for (const cells of body) {
      const num = halfWidth((cells[cNum!] ?? '').trim());
      const day = (cells[cDay!] ?? '').trim() === '平日' ? 'weekday' : 'saturday-holiday';
      const dep = serviceTimeOf((cells[cDep!] ?? '').trim() || undefined);
      const arr = serviceTimeOf((cells[cArr!] ?? '').trim() || undefined);
      const pf = halfWidth((cells[cPf!] ?? '').trim());
      if (!num || !/^\d+$/.test(pf) || (!dep && !arr)) continue;
      for (const r of records) {
        if (r.train_number !== num || r.service_date_type !== day) continue;
        if ((dep && r.departure_time_local !== dep) || (arr && r.arrival_time_local !== arr)) continue;
        const what = `the stop list of ${(cells[cName!] ?? '').trim() || num} (${(cells[cUrl!] ?? '').trim()}), collected by the project owner`;
        if (r.platform_id === `jr-east:shinjuku:${pf}`) {
          // already read on a saved copy of the same page: the two agree
          r.remarks = [r.remarks, `Same track in ${what}.`].filter(Boolean).join(' · ');
          seasonalAgreed++;
        } else if (!r.platform_id) {
          r.platform_id = `jr-east:shinjuku:${pf}`;
          r.remarks = [r.remarks?.replace(/ ?· ?No track in the line timetable; not drawn\.?/, ''), `Track from ${what}.`].filter(Boolean).join(' · ');
          seasonalFilled++;
        } else console.warn(`${num}: track ${r.platform_id} here, ${pf} in ${what}`);
      }
    }
    console.log(`seasonal limited expresses' stop lists: ${seasonalFilled} tracks filled, ${seasonalAgreed} agree with saved pages`);
  }

  // tracks the official line timetables do not give, from the legacy timetable the project owner handed over (when present)
  const legacy = loadLegacyRows(root);
  let legacyFilled = 0;
  if (legacy.length) {
    const TRACKS: Record<string, string[]> = {
      'jr-east:chuo-rapid': ['7', '8', '11', '12'],
      'jr-east:saikyo': ['1', '2', '3', '4'],
      'jr-east:shonan-shinjuku': ['1', '2', '3', '4', '5', '6'],
      'jr-east:narita-express': ['5', '6'],
      'jr-east:chuo-limited-express': ['7', '8', '9', '10'],
    };
    for (const r of records) {
      if (r.platform_id || !TRACKS[r.line_id]) continue;
      const track = legacyTrack(legacy, { line_id: r.line_id, day: r.service_date_type, departure: r.departure_time_local, destination: r.destination_text, allowed: TRACKS[r.line_id]! });
      if (!track) continue;
      r.platform_id = `jr-east:shinjuku:${track}`;
      r.remarks = [r.remarks?.replace(/ ?· ?No track in the line timetable; not drawn\./, ''), LEGACY_REMARK].filter(Boolean).join(' · ');
      legacyFilled++;
    }
    console.log(`legacy timetable: ${legacyFilled} tracks filled`);
  }

  const time = (r: TimetableRecord) => parseServiceTime(r.departure_time_local ?? r.arrival_time_local) ?? 0;
  records.sort((a, b) => a.line_id.localeCompare(b.line_id) || a.service_date_type.localeCompare(b.service_date_type) || time(a) - time(b) || a.trip_id.localeCompare(b.trip_id));

  const retrievedAt = new Date().toISOString().slice(0, 10);
  const missing = [...trainPages.keys()].filter((p) => !parsed.has(p)).length;
  const upstreamMissing = UPSTREAM.filter((u) => !upstream.some((t) => t.label === u.label)).map((u) => u.label);
  const source: TimetableSource = {
    id: JREAST_SOURCE_ID,
    title: `JR東日本 駅の時刻表（新宿駅ほか, ${edition} 版）— ローカル専用${savedTitles.length ? `・保存した路線時刻表 ${savedTitles.length} 枚` : ''}${missing || (upstreamMissing.length && !savedTitles.length) ? `・一部のみ（未取得: 停車駅一覧 ${missing} 本${upstreamMissing.length && !savedTitles.length ? `、${upstreamMissing.join('・')}` : ''}）` : ''}`,
    publisher: 'East Japan Railway Company (timetables.jreast.co.jp)',
    url: `${BASE}timetable/list${SHINJUKU}.html`,
    retrievedAt,
    license: 'Not licensed for redistribution (jreast.co.jp terms of use, section 2). Local private use only; not in the repository.',
    notes: `Read by scripts/fetch-timetable-jreast.ts, ${fetched + cached} pages (${fetched} from the network this run). Tables: ${[...new Set([...timetables, ...upstream].map((t) => t.label))].join(', ')}. Line timetables saved by hand: ${savedTitles.join(', ') || 'none'}. Times, tracks, train numbers, types and names as printed in each train's stop list; times before 03:00 written as 24:xx; direction from the next / previous stop.`,
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
  if (missing || upstreamMissing.length) console.log(`incomplete: ${missing} stop lists not read; upstream tables not read: ${upstreamMissing.join(', ') || 'none'}`);
  console.log(`wrote ${records.length} records (local only) — ${fetched} pages fetched, ${cached} from cache`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
