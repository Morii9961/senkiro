import { useMemo, useState } from 'react'
import { nameIn, textIn } from '../../domain/language'
import type { Language } from '../../domain/types'
import { timetableRegistry, type OfficialTimetable } from '../../providers/timetable'
import { LineBadge } from '../atoms/LineBadge'

const pageSize = 40

export function OfficialDepartures({ dataset, lang, platformId }: {
  dataset: OfficialTimetable; lang: Language; platformId?: string
}) {
  const t = (ja: string, en: string, zh: string) => textIn(lang, ja, en, zh)
  const stations = useMemo(() => {
    const ids = new Set(dataset.records.map(({ station_id }) => station_id))
    return [...timetableRegistry.stations.values()].filter(({ id }) => ids.has(id))
  }, [dataset])
  const sources = useMemo(() => new Map(dataset.sources.map((source) => [source.id, source])), [dataset])
  const [station, setStation] = useState(stations[0]?.id ?? '')
  const [day, setDay] = useState('weekday')
  const [hour, setHour] = useState('')
  const [page, setPage] = useState(0)
  const departures = useMemo(() => dataset.records.filter((record) =>
    (platformId ? record.platform_id === platformId : record.station_id === station) &&
    (record.service_date_type === day || (day !== 'weekday' && record.service_date_type === 'weekend')),
  ), [dataset, day, platformId, station])
  const hours = [...new Set(departures.flatMap(({ departure_time_local }) =>
    departure_time_local ? [departure_time_local.split(':')[0]] : [],
  ))]
  const visibleHour = hours.includes(hour) ? hour : ''
  const filtered = visibleHour ? departures.filter(({ departure_time_local }) => departure_time_local?.startsWith(visibleHour + ':'))
    : departures
  const first = page * pageSize
  const last = Math.min(first + pageSize, filtered.length)

  return (
    <section className="official-departures" aria-label={t('公式時刻表', 'Official timetable', '官方时刻表')}>
      <p className="train-note">{dataset.label} · JST · {t('保存時点の発車予定', 'Archived scheduled departures', '归档计划发车时刻')}</p>
      <div className="official-timetable-filters">
        {!platformId && <label>
          {t('駅', 'Station', '车站')}
          <select value={station} onChange={(event) => { setStation(event.currentTarget.value); setPage(0) }}>
            {stations.map((item) => <option key={item.id} value={item.id}>{nameIn(item.names, lang)}</option>)}
          </select>
        </label>}
        <label>
          {t('日別', 'Service day', '运行日')}
          <select value={day} onChange={(event) => { setDay(event.currentTarget.value); setPage(0) }}>
            <option value="weekday">{t('平日', 'Weekday', '工作日')}</option>
            <option value="saturday">{t('土曜', 'Saturday', '周六')}</option>
            <option value="sunday">{t('日曜', 'Sunday', '周日')}</option>
          </select>
        </label>
        <label>
          {t('時間帯', 'Hour', '时段')}
          <select value={visibleHour} onChange={(event) => { setHour(event.currentTarget.value); setPage(0) }}>
            <option value="">{t('全時間帯', 'All hours', '全天')}</option>
            {hours.map((value) => <option key={value} value={value}>{value}:00</option>)}
          </select>
        </label>
      </div>
      <p className="train-note" aria-live="polite">
        {filtered.length ? `${first + 1}–${last} / ${filtered.length}` : t('発車データなし', 'No departures', '暂无发车记录')}
      </p>
      <ul className="train-schedule">
        {filtered.slice(first, last).map((record) => {
          const line = record.line_id && timetableRegistry.lines.get(record.line_id)
          const primary = sources.get(record.source_id)
          return (
            <li key={record.trip_id} data-train-card="official">
              <strong>{record.departure_time_local}</strong>
              {line ? <LineBadge line={line} lang={lang} /> : <small>{primary?.title}</small>}
              <span>{record.service_class} {record.destination_text}</span>
              <small>{record.platform_number ? t(`${record.platform_number} 番線`, `Track ${record.platform_number}`, `${record.platform_number} 番线`)
                : t('番線掲載なし', 'Track not provided', '原表未列番线')}</small>
              <small className="departure-sources">
                {[record.source_id, ...(record.related_source_ids ?? [])].map((id, index) => {
                  const source = sources.get(id)
                  if (!source?.url) return null
                  return <a key={id} href={source.url} target="_blank" rel="noreferrer" title={source.title}>
                    {index === 0 ? t('公式', 'Source', '官方来源') : t('併載', 'Also listed', '另见')}
                  </a>
                })}
                {record.source_date && <time dateTime={record.source_date}>{record.source_date}</time>}
              </small>
            </li>
          )
        })}
      </ul>
      {filtered.length > pageSize && (
        <div className="official-timetable-filters">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('前へ', 'Previous', '上一页')}</button>
          <button type="button" disabled={last >= filtered.length} onClick={() => setPage(page + 1)}>{t('次へ', 'Next', '下一页')}</button>
        </div>
      )}
    </section>
  )
}
