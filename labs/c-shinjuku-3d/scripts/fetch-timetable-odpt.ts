/**
 * Builds data/timetable/toei-odpt.csv from the Toei train timetables that the
 * Public Transportation Open Data Center publishes on its key-less public API
 * (api-public.odpt.org) under CC BY 4.0.
 *
 *   npx tsx scripts/fetch-timetable-odpt.ts            fetch, convert, write
 *   npx tsx scripts/fetch-timetable-odpt.ts --offline  convert the copy saved in data/raw/odpt-public/
 *
 * The downloaded JSON is kept in data/raw/odpt-public/ (git-ignored) so that a
 * conversion can be repeated and compared; only the converted calls at the
 * four Toei stations of this model are committed.
 *
 * Licence: 東京都交通局 列車時刻表 / 駅情報, CC BY 4.0, credit
 * 「東京都交通局・公共交通オープンデータ協議会」. The CSV is a modified
 * extract (calls at four stations, times rewritten past midnight as 24:xx,
 * tracks added from the station's direction signs); this is said in the
 * source notes and in data/timetable/README.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordsToCsv } from '../src/timetable/adapter';
import { recordsFromOdptTrainTimetables, type OdptStationMapping, type OdptTrainTimetable } from '../src/timetable/odpt';
import { parseServiceTime } from '../src/timetable/time';
import type { TimetableSource } from '../src/timetable/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = resolve(root, 'data/raw/odpt-public');
const outCsv = resolve(root, 'data/timetable/toei-odpt.csv');
const outSources = resolve(root, 'data/timetable/toei-odpt.sources.json');
const API = 'https://api-public.odpt.org/api/v4/';
/** The public API returns at most this many objects per request. */
const API_LIMIT = 1000;

export const TOEI_SOURCE_ID = 'src:odpt-toei-train-timetable';

const S = 'odpt.Station:Toei.';
/**
 * Calls taken from the timetable, and how each gets its track. The track
 * numbers and their directions are the ones the station model records from
 * the Toei / Keio station drawings (src/trains/trackRuns.ts); the rule below
 * only matches the train's next (or previous) station against them.
 */
const STATIONS: OdptStationMapping[] = [
  {
    odptStation: `${S}Shinjuku.Shinjuku`, station_id: 'toei:shinjuku:S01', operator_id: 'toei', line_id: 'toei:shinjuku',
    rules: [
      // westbound: the Toei timetable ends here; the train runs on into the Keio New Line from track 4 (京王線方面)
      { prev: `${S}Shinjuku.ShinjukuSanchome`, track: '4' },
      { prev: `${S}Shinjuku.Ichigaya`, track: '4' },
      // eastbound: leaves from track 5 (本八幡方面); express trains run non-stop to 市ヶ谷
      { next: `${S}Shinjuku.ShinjukuSanchome`, track: '5' },
      { next: `${S}Shinjuku.Ichigaya`, track: '5' },
    ],
    noTrackForTerminatingTrains: true,
    note: 'Keio New Line Shinjuku, tracks 4 (京王線方面) and 5 (本八幡方面). Trains that end or start their run at Shinjuku are not placed: where they turn is not in the timetable.',
  },
  {
    odptStation: `${S}Shinjuku.ShinjukuSanchome`, station_id: 'toei:shinjuku-sanchome:S02', operator_id: 'toei', line_id: 'toei:shinjuku',
    rules: [
      { next: `${S}Shinjuku.Shinjuku`, track: '1' },
      { next: `${S}Shinjuku.Akebonobashi`, track: '2' },
    ],
    note: 'Track 1 新宿方面 (next: 新宿), track 2 本八幡方面 (next: 曙橋).',
  },
  {
    odptStation: `${S}Oedo.Shinjuku`, station_id: 'toei:shinjuku:E27', operator_id: 'toei', line_id: 'toei:oedo',
    rules: [
      { next: `${S}Oedo.Yoyogi`, track: '6' },
      { next: `${S}Oedo.Tochomae`, track: '7' },
    ],
    note: 'Track 6 六本木方面 (next: 代々木), track 7 光が丘方面 (next: 都庁前).',
  },
  {
    odptStation: `${S}Oedo.ShinjukuNishiguchi`, station_id: 'toei:shinjuku-nishiguchi:E01', operator_id: 'toei', line_id: 'toei:oedo',
    rules: [
      { next: `${S}Oedo.Tochomae`, track: '1' },
      { next: `${S}Oedo.HigashiShinjuku`, track: '2' },
    ],
    note: 'Track 1 都庁前方面 (next: 都庁前), track 2 飯田橋方面 (next: 東新宿).',
  },
];

/**
 * Keio stations that Toei Shinjuku Line trains run through to. The public API
 * has no Keio station data, so their names are written here (station names
 * only; nothing else about Keio is taken from anywhere).
 */
const KEIO_STATION_NAMES: Record<string, string> = {
  'odpt.Station:Keio.KeioNew.Sasazuka': '笹塚',
  'odpt.Station:Keio.Sagamihara.Hashimoto': '橋本',
  'odpt.Station:Keio.Sagamihara.KeioTamaCenter': '京王多摩センター',
  'odpt.Station:Keio.Sagamihara.Wakabadai': '若葉台',
  'odpt.Station:Keio.Takao.Takao': '高尾',
  'odpt.Station:Keio.Takao.Takaosanguchi': '高尾山口',
  'odpt.Station:Keio.Keio.Takahatafudo': '高幡不動',
  'odpt.Station:Keio.Keio.KeioHachioji': '京王八王子',
};

type Json = Record<string, unknown>;

async function getJson(path: string): Promise<Json[]> {
  const res = await fetch(API + path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error(`${path}: not an array`);
  if (body.length >= API_LIMIT) throw new Error(`${path}: ${body.length} objects — the API limit; the answer may be cut off`);
  return body as Json[];
}

const QUERIES = {
  'trains-shinjuku-line': 'odpt:TrainTimetable?odpt:operator=odpt.Operator:Toei&odpt:railway=odpt.Railway:Toei.Shinjuku',
  'trains-oedo-line': 'odpt:TrainTimetable?odpt:operator=odpt.Operator:Toei&odpt:railway=odpt.Railway:Toei.Oedo',
  stations: 'odpt:Station?odpt:operator=odpt.Operator:Toei',
  'train-types': 'odpt:TrainType?odpt:operator=odpt.Operator:Toei',
} as const;
type QueryName = keyof typeof QUERIES;

async function main() {
  const offline = process.argv.includes('--offline');
  mkdirSync(rawDir, { recursive: true });
  const data = {} as Record<QueryName, Json[]>;
  let retrievedAt: string;
  if (offline) {
    const saved = JSON.parse(readFileSync(resolve(rawDir, 'toei.json'), 'utf8')) as { retrievedAt: string; data: Record<QueryName, Json[]> };
    Object.assign(data, saved.data);
    retrievedAt = saved.retrievedAt;
  } else {
    for (const [name, q] of Object.entries(QUERIES) as [QueryName, string][]) data[name] = await getJson(q);
    retrievedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(resolve(rawDir, 'toei.json'), JSON.stringify({ retrievedAt, api: API, queries: QUERIES, data }));
  }

  const stationNames = new Map<string, string>(Object.entries(KEIO_STATION_NAMES));
  for (const s of data.stations) if (typeof s['owl:sameAs'] === 'string' && typeof s['dc:title'] === 'string') stationNames.set(s['owl:sameAs'], s['dc:title']);
  const trainTypeNames = new Map<string, string>();
  for (const t of data['train-types']) if (typeof t['owl:sameAs'] === 'string' && typeof t['dc:title'] === 'string') trainTypeNames.set(t['owl:sameAs'], t['dc:title']);

  const trains = [...data['trains-shinjuku-line'], ...data['trains-oedo-line']] as OdptTrainTimetable[];
  const { records, notes } = recordsFromOdptTrainTimetables(trains, { source_id: TOEI_SOURCE_ID, stations: STATIONS, stationNames, trainTypeNames });
  for (const n of notes) console.warn(`note: ${n}`);
  if (records.some((r) => r.destination_text?.startsWith('odpt.Station:'))) throw new Error('a destination has no name; add it to KEIO_STATION_NAMES');

  const time = (r: (typeof records)[number]) => parseServiceTime(r.departure_time_local ?? r.arrival_time_local) ?? 0;
  records.sort((a, b) => a.station_id.localeCompare(b.station_id) || a.service_date_type.localeCompare(b.service_date_type) || time(a) - time(b) || a.trip_id.localeCompare(b.trip_id));

  const issued = [...new Set(trains.map((t) => t['dct:issued']).filter(Boolean))].sort();
  const source: TimetableSource = {
    id: TOEI_SOURCE_ID,
    title: '東京都交通局 列車時刻表（公共交通オープンデータセンター）',
    publisher: '東京都交通局・公共交通オープンデータ協議会',
    url: 'https://ckan.odpt.org/dataset/r_train_timetable-toei',
    retrievedAt,
    license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.ja)',
    notes:
      `Modified extract made by SENKIRO Lab with scripts/fetch-timetable-odpt.ts from ${API}odpt:TrainTimetable (都営新宿線, 都営大江戸線; dct:issued ${issued.join(', ')}). ` +
      'Kept: the calls at 新宿 S01, 新宿三丁目 S02, 新宿 E27 and 新宿西口 E01. Changed: times before 03:00 written as 24:xx; the track added from the next / previous station and the station direction signs; destination names from 東京都交通局 駅情報 (CC BY 4.0) and, for Keio stations, written by this prototype. Not in the data: vehicle type and number of cars.',
  };
  writeFileSync(outCsv, recordsToCsv(records));
  writeFileSync(outSources, JSON.stringify({ generatedAt: retrievedAt, sources: [source] }, null, 2) + '\n');

  const summary = new Map<string, number>();
  for (const r of records) summary.set(`${r.station_id} ${r.service_date_type}${r.platform_id ? '' : ' (no track)'}`, (summary.get(`${r.station_id} ${r.service_date_type}${r.platform_id ? '' : ' (no track)'}`) ?? 0) + 1);
  for (const [k, n] of [...summary].sort()) console.log(`${String(n).padStart(5)}  ${k}`);
  console.log(`wrote ${records.length} records to ${outCsv}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
