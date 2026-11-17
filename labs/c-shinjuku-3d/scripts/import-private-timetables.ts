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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, recordsToCsv } from '../src/timetable/adapter';
import { serviceTimeOf } from '../src/timetable/odpt';
import type { TimetableRecord, TimetableSource } from '../src/timetable/types';

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

function keio(): { records: TimetableRecord[]; skipped: number } {
  const records: TimetableRecord[] = [];
  let skipped = 0;
  const seq = new Map<string, number>();
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
    const notes = [
      r.note || null,
      starts ? '当駅始発' : null,
      truthy(r.reserved_seat) ? '座席指定' : null,
      r.type_source && r.type_source !== 'page' ? `type: ${r.type_source}` : null,
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
  return { records, skipped };
}

function odakyu(): TimetableRecord[] {
  const seq = new Map<string, number>();
  return rows('odakyu_shinjuku_departures.csv').map((r) => {
    const day = dayOf(r.day_type!);
    const n = (seq.get(day) ?? 0) + 1;
    seq.set(day, n);
    const romancecar = truthy(r.romancecar);
    return {
      station_id: 'odakyu:shinjuku',
      operator_id: 'odakyu',
      line_id: 'odakyu:odawara',
      platform_id: r.platform ? `odakyu:shinjuku:${r.platform}` : null,
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
          r.platform ? null : `No track for this train (the table gives only: ${r.platform_hint || 'nothing'}); not drawn.`,
          romancecar ? 'ロマンスカー' : null,
          truthy(r.coupled_split) ? '併結・分割あり' : null,
          r.kaisei || null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    } satisfies TimetableRecord;
  });
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const k = keio();
  const o = odakyu();
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
      notes: `CSV odakyu_shinjuku_departures.csv (retrieved 2026-11-17 by the project owner): departure times checked minute by minute against Odakyu's PDF timetable (according to the CSV), types and destinations from 駅探, 2026年3月14日 / 16日 改正. No track per train: only a platform group, so no Odakyu train is drawn. Converted ${today}. Values not checked against the sources by this prototype.`,
    },
  ];
  writeFileSync(resolve(outDir, 'keio-shinjuku.csv'), recordsToCsv(k.records));
  writeFileSync(resolve(outDir, 'odakyu-shinjuku.csv'), recordsToCsv(o));
  writeFileSync(resolve(outDir, 'private-sources.json'), JSON.stringify({ generatedAt: today, sources }, null, 2) + '\n');
  const count = (rs: TimetableRecord[]) => {
    const m = new Map<string, number>();
    for (const r of rs) m.set(`${r.line_id} ${r.service_date_type}${r.platform_id ? ` @${r.platform_id.split(':').pop()}` : ' (no track)'}`, (m.get(`${r.line_id} ${r.service_date_type}${r.platform_id ? ` @${r.platform_id.split(':').pop()}` : ' (no track)'}`) ?? 0) + 1);
    return [...m].sort();
  };
  for (const [key, n] of count([...k.records, ...o])) console.log(`${String(n).padStart(5)}  ${key}`);
  console.log(`wrote ${k.records.length} Keio and ${o.length} Odakyu records (local only); ${k.skipped} Toei-direction duplicates left out`);
}

main();
