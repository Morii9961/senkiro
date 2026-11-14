// Business-day ("営業日") time handling. All times are Asia/Tokyo wall-clock.
//
// Japanese timetables write after-midnight trains of the same operating day
// either as 24:xx/25:xx (legacy CSV) or as 00:xx (ODPT). Internally every time
// is kept as the ORIGINAL string plus seconds since 00:00 of the business day,
// so 00:30 belonging to the previous business day becomes 24:30 = 88200 s.
// Precision is whatever the source gives (minutes here); no seconds are invented.

/** Hour below which an ODPT "00:xx".."03:xx" time is read as 24:xx..27:xx. */
export const BUSINESS_DAY_ROLLOVER_HOUR = 4;

export function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]); const se = m[3] === undefined ? null : Number(m[3]);
  if (mi > 59 || (se !== null && se > 59) || h > 47) return null;
  return { h, mi, se, precision: se === null ? 'minute' : 'second' };
}

/**
 * Seconds since business-day midnight. `rollover` = true lifts 00:00–03:59 to
 * 24:00–27:59 (ODPT convention). Legacy times already ≥ 24 are kept as-is.
 */
export function toBusinessSeconds(s, { rollover = true } = {}) {
  const t = parseHm(s);
  if (!t) return null;
  let h = t.h;
  if (rollover && h < BUSINESS_DAY_ROLLOVER_HOUR) h += 24;
  return h * 3600 + t.mi * 60 + (t.se ?? 0);
}

/** Business-day seconds → "HH:MM" (or HH:MM:SS) with hours ≥ 24 kept. */
export function formatBusiness(sec, precision = 'minute') {
  if (sec === null || sec === undefined) return null;
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return precision === 'second' ? `${hm}:${String(s).padStart(2, '0')}` : hm;
}
