const daySeconds = 86_400
const serviceDayStartsAtHour = 3

export function parseServiceTime(text: string | null): number | null {
  const match = text?.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/)
  if (!match || Number(match[1]) > 29) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)
}

export function formatServiceTime(seconds: number, withSeconds = false): string {
  const time = Math.max(0, Math.floor(seconds))
  const hh = String(Math.floor(time / 3600)).padStart(2, '0')
  const mm = String(Math.floor(time / 60) % 60).padStart(2, '0')
  return withSeconds ? `${hh}:${mm}:${String(time % 60).padStart(2, '0')}` : `${hh}:${mm}`
}

/** JST independent of browser timezone. The pre-03:00 cutoff is a display convention. */
export function serviceClockAt(instant: Date): { seconds: number; serviceDate: string } {
  const jst = new Date(instant.getTime() + 9 * 3_600_000)
  const hour = jst.getUTCHours()
  const seconds = hour * 3600 + jst.getUTCMinutes() * 60 + jst.getUTCSeconds()
  const previousDay = hour < serviceDayStartsAtHour
  const date = previousDay ? new Date(jst.getTime() - daySeconds * 1000) : jst
  return { seconds: seconds + (previousDay ? daySeconds : 0), serviceDate: date.toISOString().slice(0, 10) }
}

export type DayType = 'weekday' | 'weekend'

const dayTypes = {
  weekday: ['weekday', 'weekdays', '平日'],
  weekend: ['saturday', 'sunday', 'holiday', 'holidays', 'sunday-holiday', 'saturday-holiday', 'weekend', '土曜', '土曜日', '日曜', '休日', '日曜・休日', '土曜・休日', '土休日', '土日祝', '日祝'],
  everyday: ['everyday', 'daily', 'all', '毎日', '全日'],
}

export function serviceDateTypeApplies(serviceDateType: string, day: DayType): boolean {
  const type = serviceDateType.trim().toLowerCase()
  return dayTypes.everyday.includes(type) || dayTypes[day].includes(type)
}
