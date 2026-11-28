/**
 * Turns responses of the ODPT API (v4, "Challenge" endpoint) into the
 * operations overlay of this prototype. Pure functions — no network here.
 *
 * WHAT IS USED
 *   odpt:Train             per-train delay in seconds, by railway
 *   odpt:StationTimetable  departures of the Shinjuku stations
 * Both are published by JR East under the 公共交通オープンデータチャレンジ限定
 * ライセンス. They are fetched at run time for local testing only, are never
 * written to disk and never committed.
 *
 * WHAT IS DERIVED, NOT REPORTED
 *   JR East publishes no line-level status ("odpt:TrainInformation") in this
 *   catalogue. The status shown per line is computed here from the delays of
 *   the trains currently running on it and is labelled as such.
 *
 * NOT VERIFIED AGAINST LIVE RESPONSES
 *   This was written from the ODPT API specification and the catalogue pages;
 *   no developer key was available, so it has never seen a real response.
 *   Fields are read defensively and anything that cannot be matched is counted
 *   in `unmatched` instead of being guessed. Train positions are not used.
 */
import type { LineStatus, OperationSnapshot, TrackDeparture } from '../domain/overlay';
import type { StationModel } from '../domain/types';

export const ODPT_TRAIN_SOURCE_ID = 'src:odpt-jreast-train';

/**
 * ODPT railway id → RailLine id of the model. The ODPT ids follow the naming
 * used by the ODPT vocabulary; they could not be confirmed with a key, so a
 * railway that does not appear in a response simply yields "unknown".
 */
export const ODPT_RAILWAYS: Record<string, string> = {
  'odpt.Railway:JR-East.Yamanote': 'sk:line:jr-east-yamanote',
  'odpt.Railway:JR-East.ChuoRapid': 'sk:line:jr-east-chuo-rapid',
  'odpt.Railway:JR-East.ChuoSobuLocal': 'sk:line:jr-east-chuo-sobu-local',
  'odpt.Railway:JR-East.SaikyoKawagoe': 'sk:line:jr-east-saikyo',
  'odpt.Railway:JR-East.ShonanShinjuku': 'sk:line:jr-east-shonan-shinjuku',
};

/** A train counts as late from this delay on. A choice of this prototype, not an operator threshold. */
export const LATE_SECONDS = 300;

export interface OdptPayload {
  fetchedAt: string;
  trains: unknown;
  stationTimetables: unknown;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const lastPart = (id: string | null): string | null => (id ? (id.split(/[.:]/).pop() ?? null) : null);

export function odptLineStatuses(trains: unknown): { statuses: LineStatus[]; unmatched: number } | null {
  if (!Array.isArray(trains)) return null;
  const byLine = new Map<string, { delays: number[]; date: string | null }>();
  let unmatched = 0;
  for (const tr of trains) {
    if (!isObj(tr)) continue;
    const line = ODPT_RAILWAYS[str(tr['odpt:railway']) ?? ''];
    if (!line) {
      unmatched += 1;
      continue;
    }
    const entry = byLine.get(line) ?? { delays: [], date: null };
    const delay = tr['odpt:delay'];
    entry.delays.push(typeof delay === 'number' && Number.isFinite(delay) ? delay : 0);
    const date = str(tr['dc:date']);
    if (date && (!entry.date || date > entry.date)) entry.date = date;
    byLine.set(line, entry);
  }
  const statuses: LineStatus[] = [];
  for (const [railLineId, { delays, date }] of byLine) {
    const late = delays.filter((d) => d >= LATE_SECONDS);
    const worst = Math.max(0, ...delays);
    statuses.push({
      railLineId,
      status: late.length > 0 ? 'delayed' : 'normal',
      delayMinutes: late.length > 0 ? Math.round(worst / 60) : null,
      messageJa: `走行中 ${delays.length} 本のうち ${late.length} 本が 5 分以上の遅れ（列車ごとの遅延から本プロトタイプが集計）`,
      messageEn: `${late.length} of ${delays.length} running trains are 5+ min late (aggregated by this prototype from per-train delays)`,
      observedAt: date,
    });
  }
  return { statuses, unmatched };
}

function calendarOf(now: Date): 'Weekday' | 'SaturdayHoliday' {
  // Japan time; public holidays are not known here and are treated as weekdays.
  const day = new Date(now.getTime() + 9 * 3600_000).getUTCDay();
  return day === 0 || day === 6 ? 'SaturdayHoliday' : 'Weekday';
}

function hhmmJst(now: Date): string {
  const d = new Date(now.getTime() + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function odptDepartures(model: StationModel, timetables: unknown, now: Date, perTrack = 2): { departures: TrackDeparture[]; unmatched: number } | null {
  if (!Array.isArray(timetables)) return null;
  const calendar = calendarOf(now);
  const after = hhmmJst(now);
  const departures: TrackDeparture[] = [];
  let unmatched = 0;
  const taken = new Map<string, number>();

  for (const tt of timetables) {
    if (!isObj(tt)) continue;
    const railLineId = ODPT_RAILWAYS[str(tt['odpt:railway']) ?? ''];
    const cal = lastPart(str(tt['odpt:calendar']));
    if (cal && cal !== calendar) continue;
    const rows = tt['odpt:stationTimetableObject'];
    if (!railLineId || !Array.isArray(rows)) {
      unmatched += 1;
      continue;
    }
    for (const row of rows) {
      if (!isObj(row)) continue;
      const time = str(row['odpt:departureTime']);
      if (!time || time < after) continue;
      // A departure is tied to a track only when the feed names the platform.
      const platformNumber = row['odpt:platformNumber'];
      const number = typeof platformNumber === 'number' ? String(platformNumber) : str(platformNumber);
      const platform = number
        ? model.areas.find((a) => a.kind === 'platform' && a.tracks.some((t) => t.number === number && t.services.some((s) => s.railLineId === railLineId)))
        : undefined;
      if (!platform || !number) {
        unmatched += 1;
        continue;
      }
      const key = `${platform.id}#${number}`;
      const n = taken.get(key) ?? 0;
      if (n >= perTrack) continue;
      taken.set(key, n + 1);
      const dest = Array.isArray(row['odpt:destinationStation']) ? lastPart(str((row['odpt:destinationStation'] as unknown[])[0])) : null;
      departures.push({
        platformId: platform.id,
        trackNumber: number,
        railLineId,
        scheduledTime: time,
        estimatedTime: null,
        // ODPT gives station ids, not display names; the id's last part is shown as is.
        destinationJa: dest,
        destinationEn: dest,
        trainTypeJa: null,
      });
    }
  }
  return { departures, unmatched };
}

export function mapOdpt(model: StationModel, payload: OdptPayload, now = new Date()): OperationSnapshot | null {
  const lines = odptLineStatuses(payload.trains);
  if (!lines) return null;
  const deps = odptDepartures(model, payload.stationTimetables, now) ?? { departures: [], unmatched: 0 };
  return {
    sourceId: ODPT_TRAIN_SOURCE_ID,
    sourceTitle: 'ODPT · JR東日本 列車ロケーション情報 / 駅時刻表（チャレンジ限定ライセンス）',
    dataNature: 'official',
    isSynthetic: false,
    fetchedAt: payload.fetchedAt,
    lineStatuses: lines.statuses,
    departures: deps.departures,
    disclaimer:
      'Line status is aggregated by this prototype from per-train delays; JR East publishes no line-level status in this catalogue. Local testing only.',
  };
}
