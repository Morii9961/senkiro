import { useState } from 'react'
import type { Language } from '../../domain/types'
import { timetableRegistry } from '../../providers/timetable'
import { formatServiceTime, serviceClockAt, serviceDateTypeApplies, type DayType } from '../../timetable/time'
import type { FeedMode } from '../../timetable/types'
import { LineBadge } from '../atoms/LineBadge'

interface Props {
  lang: Language
  feed: FeedMode
  onMode: (mode: 'off' | 'demo') => void
}

export function SimBanner({ lang }: { lang: Language }) {
  return <strong>{lang === 'ja' ? 'DEMO · 架空のダイヤ' : 'DEMO · Fictional timetable'}</strong>
}

export function TrainPanel({ lang, feed, onMode }: Props) {
  const [day, setDay] = useState<DayType>('weekday')
  const [speed, setSpeed] = useState('1')
  const [localTime, setLocalTime] = useState<number | null>(null)
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en
  const records = feed.kind === 'demo'
    ? feed.dataset.records.filter((record) => serviceDateTypeApplies(record.service_date_type, day))
    : []

  return (
    <section className="train-panel" aria-label={t('列車', 'Trains')}>
      <div className="train-modes" role="group" aria-label={t('表示モード', 'Train mode')}>
        <button type="button" aria-pressed={feed.kind === 'off'} onClick={() => onMode('off')}>
          {t('オフ', 'Off')}
        </button>
        <button type="button" disabled aria-describedby="timetable-unavailable">
          {t('時刻表シミュレーション', 'Timetable simulation')}
        </button>
        <button type="button" aria-pressed={feed.kind === 'demo'} onClick={() => onMode('demo')}>
          {t('デモ', 'Demo')}
        </button>
      </div>
      <p id="timetable-unavailable" className="train-note">
        {t('利用できる時刻表データがありません。', 'No timetable dataset is available.')}
      </p>
      <p className="train-note">{t('リアルタイム配信なし', 'Live feed unavailable')}</p>
      {feed.kind === 'demo' && <>
        <div className="train-clock">
          <div className="train-clock-banner"><SimBanner lang={lang} /></div>
          <div className="train-clock-controls">
            <output aria-label={t('シミュレーション時刻', 'Simulation time')}>
              {formatServiceTime(9 * 3600, true)} JST
            </output>
            <label>
              {t('日別', 'Service day')}
              <select value={day} onChange={(event) => setDay(event.currentTarget.value === 'weekday' ? 'weekday' : 'weekend')}>
                <option value="weekday">{t('平日', 'Weekdays')}</option>
                <option value="weekend">{t('土休日', 'Weekends & holidays')}</option>
              </select>
            </label>
            <label>
              {t('倍速', 'Speed')}
              <select value={speed} onChange={(event) => setSpeed(event.currentTarget.value)}>
                <option value="1">1×</option>
                <option value="10">10×</option>
                <option value="60">60×</option>
              </select>
            </label>
            <button type="button" onClick={() => setLocalTime(serviceClockAt(new Date()).seconds)}>
              {t('現在時刻', 'Current time')}
            </button>
          </div>
          {localTime !== null && (
            <p className="train-note">
              <output>{formatServiceTime(localTime % 86400, true)} JST</output> ·{' '}
              {t('本機時刻・列車位置ではありません', 'Device time only · no train position')}
            </p>
          )}
        </div>
        <ul className="train-schedule" aria-label={t('架空の発車予定', 'Fictional departures')}>
          {records.map((record) => {
            const line = timetableRegistry.lines.get(record.line_id)
            const platform = record.platform_id === null ? undefined : timetableRegistry.platforms.get(record.platform_id)
            return (
              <li key={record.trip_id} data-train-card="demo">
                <strong>{t('架空', 'Fictional')}</strong>
                {line && <LineBadge line={line} lang={lang} />}
                <span>{t('予定', 'Scheduled')} {record.departure_time_local ?? record.arrival_time_local}</span>
                <small>{platform?.names[lang] ?? t('番線未確認', 'Platform unverified')}</small>
              </li>
            )
          })}
        </ul>
      </>}
    </section>
  )
}
