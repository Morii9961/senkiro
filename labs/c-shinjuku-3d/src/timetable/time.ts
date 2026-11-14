/**
 * Timetable times. A service day runs from early morning until after
 * midnight, so "24:35" and "25:10" are valid and mean 00:35 / 01:10 of the
 * next calendar day. Everything is Japan Standard Time (UTC+9, no DST).
 */

const TIME_RE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;

/** Hours past this are not a timetable time (a service day does not run for 30 hours). */
export const MAX_SERVICE_HOUR = 29;

/**
 * The hour at which the service day changes. Before it, the clock still
 * belongs to the previous service day (01:10 is "25:10" of yesterday).
 * A choice of this prototype: no train of these stations runs between 02:00
 * and 04:00, so the exact hour does not matter.
 */
export const SERVICE_DAY_STARTS_AT_HOUR = 3;

/** "HH:MM[:SS]" → seconds since 00:00 of the service day, or null if it is not a time. */
export function parseServiceTime(text: string | null | undefined): number | null {
  if (text == null) return null;
  const m = TIME_RE.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > MAX_SERVICE_HOUR) return null;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** Seconds since the start of the service day → "HH:MM" (or "HH:MM:SS"), hours kept past 24. */
export function formatServiceTime(seconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${String(s % 60).padStart(2, '0')}` : `${hh}:${mm}`;
}

/** The same time as a wall clock shows it: "25:10" → "01:10". */
export function formatClockTime(seconds: number, withSeconds = false): string {
  return formatServiceTime(((seconds % 86400) + 86400) % 86400, withSeconds);
}

export type CalendarDayType = 'weekday' | 'saturday' | 'sunday';

export interface ServiceClock {
  /** Seconds since 00:00 of the service day (may exceed 86400). */
  seconds: number;
  /** Calendar date (JST) the service day started on, YYYY-MM-DD. */
  serviceDate: string;
  /**
   * Day of the week of the service date. Public holidays are NOT detected —
   * that needs a holiday calendar this prototype does not carry — so the
   * interface lets the reader choose the timetable to show.
   */
  dayType: CalendarDayType;
}

/** The service clock for an instant, in Japan Standard Time. */
export function serviceClockAt(instant: Date): ServiceClock {
  // Shift to JST and read the UTC fields: independent of the machine's time zone.
  const jst = new Date(instant.getTime() + 9 * 3600_000);
  let seconds = jst.getUTCHours() * 3600 + jst.getUTCMinutes() * 60 + jst.getUTCSeconds() + jst.getUTCMilliseconds() / 1000;
  let day = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  if (jst.getUTCHours() < SERVICE_DAY_STARTS_AT_HOUR) {
    seconds += 86400;
    day = new Date(day.getTime() - 86400_000);
  }
  const dow = day.getUTCDay();
  return {
    seconds,
    serviceDate: day.toISOString().slice(0, 10),
    dayType: dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday',
  };
}

/**
 * Does a record's `service_date_type` apply on this kind of day? The producer
 * may write "weekday", "saturday", "holiday", "sunday", "saturday-holiday",
 * "weekend", "everyday"/"daily"/"all" or the Japanese 平日 / 土曜 / 休日 / 土休日.
 * Sundays use the holiday timetable, as Japanese operators publish it.
 */
export function serviceDateTypeApplies(serviceDateType: string, day: CalendarDayType): boolean {
  const t = serviceDateType.trim().toLowerCase();
  if (['everyday', 'daily', 'all', '毎日', '全日'].includes(t)) return true;
  const weekday = ['weekday', 'weekdays', '平日'].includes(t);
  const sat = ['saturday', '土曜', '土曜日'].includes(t);
  const hol = ['holiday', 'holidays', 'sunday', 'sunday-holiday', '休日', '日曜', '日曜・休日', '日祝'].includes(t);
  const satHol = ['saturday-holiday', 'saturdayholiday', 'weekend', '土休日', '土曜・休日', '土日祝'].includes(t);
  if (day === 'weekday') return weekday;
  if (day === 'saturday') return sat || satHol;
  return hol || satHol;
}
