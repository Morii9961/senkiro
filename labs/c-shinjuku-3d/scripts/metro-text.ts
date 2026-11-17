/**
 * LOCAL ONLY. Reader for Tokyo Metro station timetables saved by hand as text (the pages at
 * transfer.tokyometro.jp are drawn by script, so the project owner copies their text into a .txt file).
 * The pages say 「当サイトの情報を転載、コピー、改変等の行為は禁止いたします」: the files stay in the
 * git-ignored data/raw/private-saved/metro/ and nothing from them is committed.
 *
 * A file holds one station, one direction and one kind of day:
 *   URL: https://transfer.tokyometro.jp/website/timetable?numbering=M08&direction=1&schedule=weekday
 *   05:16 荻窪 行き
 *   07:23 急行 和光市 行き      (a train type before the destination, where the page shows one)
 */
import type { TimetableRecord } from '../src/timetable/types';
import { serviceTimeOf } from '../src/timetable/odpt';

export const METRO_SOURCE_ID = 'local:tokyometro-station-timetable';

/** station numbering → station, line and the track of each direction (as the station drawings sign them). */
export const METRO_STATIONS: Record<string, { station: string; line: string; tracks: Record<string, string>; note: string }> = {
  M08: { station: 'tokyo-metro:shinjuku:M08', line: 'tokyo-metro:marunouchi', tracks: { '1': '1', '0': '2' }, note: 'direction 1 = 荻窪方面 (track 1), 0 = 池袋方面 (track 2)' },
  M09: { station: 'tokyo-metro:shinjuku-sanchome:M09', line: 'tokyo-metro:marunouchi', tracks: { '1': '1', '0': '2' }, note: 'direction 1 = 荻窪方面 (track 1), 0 = 池袋方面 (track 2)' },
  F13: { station: 'tokyo-metro:shinjuku-sanchome:F13', line: 'tokyo-metro:fukutoshin', tracks: { '1': '4', '0': '3' }, note: 'direction 1 = 和光市方面 (track 4), 0 = 渋谷方面 (track 3)' },
};

export interface MetroTimetable {
  numbering: string;
  direction: string;
  day: 'weekday' | 'saturday-holiday';
  url: string;
  entries: { time: string; type: string | null; destination: string }[];
}

export function parseMetroText(text: string): MetroTimetable | null {
  const url = /https:\/\/transfer\.tokyometro\.jp\/website\/timetable\?[^\s]+/.exec(text)?.[0];
  if (!url) return null;
  const q = new URL(url).searchParams;
  const numbering = q.get('numbering');
  const direction = q.get('direction');
  const schedule = q.get('schedule');
  if (!numbering || direction == null || !schedule) return null;
  const entries: MetroTimetable['entries'] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().normalize('NFKC');
    const m = /^(\d{1,2}):(\d{2})\s+(.+?)\s*行き$/.exec(line);
    if (!m) continue;
    const words = m[3]!.split(/\s+/);
    const destination = words.pop()!;
    entries.push({ time: `${m[1]!.padStart(2, '0')}:${m[2]}`, type: words.length ? words.join(' ') : null, destination });
  }
  return { numbering, direction, day: schedule === 'weekday' ? 'weekday' : 'saturday-holiday', url, entries };
}

export function metroRecords(t: MetroTimetable): TimetableRecord[] {
  const st = METRO_STATIONS[t.numbering];
  if (!st) return [];
  const track = st.tracks[t.direction] ?? null;
  return t.entries.map((e, i) => ({
    station_id: st.station,
    operator_id: 'tokyo-metro',
    line_id: st.line,
    platform_id: track ? `${st.station}:${track}` : null,
    direction_id: null,
    service_date_type: t.day,
    trip_id: `metro-tt:${t.numbering}:${t.direction}:${t.day}:${String(i + 1).padStart(4, '0')}`,
    train_number: null,
    arrival_time_local: null,
    departure_time_local: serviceTimeOf(e.time),
    destination_text: e.destination,
    service_class: e.type ?? '各駅停車',
    vehicle_series: null,
    formation_length: null,
    vehicle_assignment_status: 'unknown',
    source_id: METRO_SOURCE_ID,
    valid_from: null,
    valid_until: null,
    remarks: e.type ? null : 'Type not printed on the page (各駅停車 is the only type of this line at this station).',
  }));
}
