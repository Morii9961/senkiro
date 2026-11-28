import { nameIn, textIn } from '../../domain/language'
import type { Language } from '../../domain/types'
import { officialTimetables, platformTimetables } from '../../providers/officialTimetables'
import { station } from '../../model'

export function TimetableLinks({ lang, platform }: {
  lang: Language
  platform?: { id: string; stationId: string | null }
}) {
  const sites = platform
    ? [{ name: null, links: platformTimetables(platform.stationId, platform.id) }]
    : station.stations.map(({ id, names }) => ({ name: nameIn(names, lang), links: officialTimetables[id] ?? [] }))
  return (
    <details className="official-timetables">
      <summary>{platform ? textIn(lang, '公式時刻表', 'Official timetables', '官方时刻表')
        : textIn(lang, '公式時刻表へのリンク', 'Official timetable links', '官方时刻表链接')}</summary>
      <ul>
        {sites.filter(({ links }) => links.length).map(({ name, links }) => (
          <li key={name ?? links[0].url}>
            {name && <strong>{name}</strong>}
            {links.map(({ label, url }) => (
              <a key={url} href={url} target="_blank" rel="noopener">{nameIn(label, lang)} ↗</a>
            ))}
          </li>
        ))}
      </ul>
    </details>
  )
}
