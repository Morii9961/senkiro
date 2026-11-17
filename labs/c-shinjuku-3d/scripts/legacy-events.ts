/**
 * LOCAL ONLY. Reader for timetable_events.csv, a Shinjuku timetable the project owner handed over on
 * 2026-11-17 (built 2026-11-14 by another tool, with validation_report.json and coverage_report.json).
 * Copies live in data/raw/private-saved/ (git-ignored).
 *
 * The file has two layers. "src-toei-gtfs-2026" is Toei's official GTFS: identical, call by call, to
 * the committed Toei timetable, so it is not used. "src-legacy-yahoo-2026-11" (status
 * pending_verification) holds departure tables of the other operators taken from Yahoo!路線情報,
 * with a track for nearly every train. Checked here against the tracks this prototype has from
 * official pages, the legacy tracks agree wherever a train can be matched unambiguously (JR 908 of
 * 908, Keio 699 of 699 on 2026-11-17). They are used only to fill what is missing:
 *  - the track of JR trains whose official line timetable gives none (中央線快速, 埼京線);
 *  - the track of Odakyu trains (the Odakyu CSV has only platform groups);
 *  - the trains of 西武新宿 and 丸ノ内線 新宿 (M08), for which there is nothing else.
 * Vehicle claims in the file are not used: the vehicle library keeps its own sourced rules.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '../src/timetable/adapter';
import { serviceTimeOf } from '../src/timetable/odpt';

export const LEGACY_SOURCE_ID = 'local:legacy-timetable-events';

export interface LegacyRow {
  station_id: string;
  line_id: string;
  /** Track number as the file gives it, or '' (e.g. the ambiguous 「2・3」 it nulled). */
  track: string;
  day: 'weekday' | 'saturday-holiday' | string;
  /** HH:MM, past 24 after midnight. */
  departure: string | null;
  destination: string;
  service_class: string;
  remarks: string;
}

const LINES: Record<string, string> = {
  'jr-yamanote': 'jr-east:yamanote',
  'jr-chuo-rapid': 'jr-east:chuo-rapid',
  'jr-chuo-sobu-local': 'jr-east:chuo-sobu-local',
  'jr-saikyo-kawagoe': 'jr-east:saikyo',
  'jr-shonan-shinjuku': 'jr-east:shonan-shinjuku',
  'jr-chuo-limited-express': 'jr-east:chuo-limited-express',
  'jr-narita-express': 'jr-east:narita-express',
  'keio-main': 'keio:keio',
  'keio-new': 'keio:keio-new',
  'odakyu-odawara': 'odakyu:odawara',
  'seibu-shinjuku': 'seibu:shinjuku',
  'tokyo-metro-marunouchi': 'tokyo-metro:marunouchi',
};

export function legacyFile(root: string): string {
  return resolve(root, 'data/raw/private-saved/timetable_events.csv');
}

/** The legacy layer, without the rows the file itself flags as duplicates. Empty when the file is absent. */
export function loadLegacyRows(root: string): LegacyRow[] {
  const file = legacyFile(root);
  if (!existsSync(file)) return [];
  const [header, ...body] = parseCsv(readFileSync(file, 'utf8'));
  const col = (name: string) => header!.indexOf(name);
  const c = Object.fromEntries(['station_id', 'line_id', 'platform_id', 'service_date_type', 'departure_time_local', 'destination_text', 'service_class', 'source_id', 'duplicate_flag', 'remarks'].map((n) => [n, col(n)]));
  const out: LegacyRow[] = [];
  for (const cells of body) {
    const get = (n: string) => (cells[c[n]!] ?? '').trim().normalize('NFKC');
    if (!get('source_id').startsWith('src-legacy') || get('duplicate_flag') === 'true') continue;
    const day = get('service_date_type');
    out.push({
      station_id: get('station_id'),
      line_id: LINES[get('line_id')] ?? get('line_id'),
      track: get('platform_id').split(':').pop() ?? '',
      day: day === 'weekday' ? 'weekday' : day === 'saturday_holiday' ? 'saturday-holiday' : day,
      departure: serviceTimeOf(get('departure_time_local').slice(0, 5) || undefined),
      destination: get('destination_text'),
      service_class: get('service_class'),
      remarks: get('remarks'),
    });
  }
  return out;
}

/**
 * The track of one departure: the legacy rows of this line and day leaving in the same minute; when there
 * are several, the one with the same destination. null unless exactly one row is left and its track is
 * one of `allowed` (the tracks the station model lists for the line).
 */
export function legacyTrack(rows: LegacyRow[], q: { line_id: string; day: string; departure: string | null; destination: string | null; allowed: readonly string[] }): string | null {
  if (!q.departure) return null;
  let c = rows.filter((r) => r.line_id === q.line_id && r.day === q.day && r.departure === q.departure && r.track);
  const dest = q.destination?.normalize('NFKC');
  if (c.length > 1 && dest) c = c.filter((r) => r.destination === dest);
  if (c.length !== 1) return null;
  return q.allowed.includes(c[0]!.track) ? c[0]!.track : null;
}

export const LEGACY_REMARK = 'Track from timetable_events.csv (Yahoo!路線情報 layer, unverified; agrees with every official track it could be matched with).';
