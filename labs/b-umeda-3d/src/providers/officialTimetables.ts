import type { LocalName } from '../domain/types'

interface TimetableLink {
  label: LocalName & { en: string; zh: string }
  url: string
  platforms?: string[]
}

const timetable = (ja: string, en: string, zh: string, url: string, ...platforms: string[]): TimetableLink =>
  ({ label: { ja, en, zh }, url, platforms: platforms.length ? platforms : undefined })

export const officialTimetables: Record<string, TimetableLink[]> = {
  'sk:station:jr-osaka': [
    timetable('JR 大阪駅', 'JR Osaka Station', 'JR 大阪站',
      'https://eki.jr-odekake.net/top?id=0610130'),
    timetable('JR神戸線', 'JR Kobe Line', 'JR 神户线',
      'https://timetable.jr-odekake.net/station-timetable/2796012001', 'jr-3-4', 'jr-5-6'),
  ],
  'sk:station:metro-umeda': [
    timetable('なかもず方面', 'Toward Nakamozu', '往中百舌鸟',
      'https://kensaku.osakametro.co.jp/timetable/ja/subway/dia/station/29089/1019/1/', 'metro-1'),
    timetable('箕面萱野方面', 'Toward Minoh-kayano', '往箕面萱野',
      'https://kensaku.osakametro.co.jp/timetable/ja/subway/dia/station/29089/1019/2/', 'metro-2'),
  ],
  'sk:station:metro-higashiumeda': [
    timetable('八尾南方面', 'Toward Yaominami', '往八尾南',
      'https://kensaku.osakametro.co.jp/timetable/ja/subway/dia/station/26137/1020/1/', 'higashi-1'),
    timetable('大日方面', 'Toward Dainichi', '往大日',
      'https://kensaku.osakametro.co.jp/timetable/ja/subway/dia/station/26137/1020/2/', 'higashi-2'),
  ],
  'sk:station:metro-nishiumeda': [
    timetable('住之江公園方面', 'Toward Suminoekoen', '往住之江公园',
      'https://kensaku.osakametro.co.jp/timetable/ja/subway/dia/station/26102/1021/1/'),
  ],
  'sk:station:hankyu-osaka-umeda': [
    timetable('阪急 大阪梅田駅', 'Hankyu Osaka-umeda', '阪急大阪梅田站',
      'https://www.hankyu.co.jp/station/umeda.html'),
  ],
  'sk:station:hanshin-osaka-umeda': [
    timetable('阪神 大阪梅田駅', 'Hanshin Osaka-Umeda', '阪神大阪梅田站',
      'https://www.hanshin.co.jp/station/umeda.html'),
  ],
  'sk:station:jr-kitashinchi': [
    timetable('JR 北新地駅', 'JR Kitashinchi', 'JR 北新地站',
      'https://eki.jr-odekake.net/top?id=0612303'),
  ],
}

export function platformTimetables(stationId: string | null, platformId: string) {
  return (officialTimetables[stationId ?? ''] ?? []).filter(({ platforms }) =>
    !platforms || platforms.some((id) => 'sk:platform:' + id === platformId),
  )
}
