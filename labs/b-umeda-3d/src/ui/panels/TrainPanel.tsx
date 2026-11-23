import { useEffect, useState } from 'react'
import { describeVehicle } from '../../domain/describe/train'
import type { Language } from '../../domain/types'
import { timetableRegistry } from '../../providers/timetable'
import { formatServiceTime, serviceClockAt, serviceDateTypeApplies, type DayType } from '../../timetable/time'
import type { FeedMode } from '../../timetable/types'
import { trainClockSeconds, type TrainClock, type TrainSpeed } from '../../trains/clock'
import { LineBadge } from '../atoms/LineBadge'

interface Props {
  lang: Language
  feed: FeedMode
  clock: TrainClock
  day: DayType
  onMode: (mode: 'off' | 'demo') => void
  onDay: (day: DayType) => void
  onSpeed: (speed: TrainSpeed) => void
}

export function SimBanner({ lang }: { lang: Language }) {
  return <strong>{lang === 'ja' ? 'DEMO · 架空のダイヤ' : 'DEMO · Fictional timetable'}</strong>
}

export function TrainPanel({ lang, feed, clock, day, onMode, onDay, onSpeed }: Props) {
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
        <ClockBar {...{ lang, clock, day, onDay, onSpeed }} />
        <ul className="train-schedule" aria-label={t('架空の発車予定', 'Fictional departures')}>
          {records.map((record) => {
            const line = timetableRegistry.lines.get(record.line_id)
            const platform = record.platform_id === null ? undefined : timetableRegistry.platforms.get(record.platform_id)
            const vehicle = describeVehicle(record, record.vehicle_assignment_status, lang)
            return (
              <li key={record.trip_id} data-train-card="demo">
                <strong>{t('架空', 'Fictional')}</strong>
                {line && <LineBadge line={line} lang={lang} />}
                {(record.service_class || record.destination_text) && (
                  <span>{record.service_class} {record.destination_text}</span>
                )}
                <span>{t('予定', 'Scheduled')} {record.departure_time_local ?? record.arrival_time_local}</span>
                <small>{platform?.names[lang] ?? t('番線未確認', 'Platform unverified')}</small>
                <small data-vehicle-status={vehicle.status}>{vehicle.label}</small>
              </li>
            )
          })}
        </ul>
      </>}
    </section>
  )
}

function ClockBar({ lang, clock, day, onDay, onSpeed }: Pick<Props, 'lang' | 'clock' | 'day' | 'onDay' | 'onSpeed'>) {
  const [seconds, setSeconds] = useState(() => Math.floor(trainClockSeconds(clock)))
  const [localTime, setLocalTime] = useState<number | null>(null)
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en
  useEffect(() => {
    const tick = () => setSeconds(Math.floor(trainClockSeconds(clock)))
    tick()
    const timer = window.setInterval(tick, 200)
    return () => window.clearInterval(timer)
  }, [clock])
  return (
    <div className="train-clock">
      <div className="train-clock-banner"><SimBanner lang={lang} /></div>
      <div className="train-clock-controls">
        <output aria-live="off" aria-label={t('シミュレーション時刻', 'Simulation time')}>
          {formatServiceTime(seconds, true)} JST
        </output>
        <label>
          {t('日別', 'Service day')}
          <select value={day} onChange={(event) => onDay(event.currentTarget.value === 'weekday' ? 'weekday' : 'weekend')}>
            <option value="weekday">{t('平日', 'Weekdays')}</option>
            <option value="weekend">{t('土休日', 'Weekends & holidays')}</option>
          </select>
        </label>
        <label>
          {t('倍速', 'Speed')}
          <select value={clock.speed} onChange={(event) => {
            const speed = Number(event.currentTarget.value)
            if (speed === 1 || speed === 10 || speed === 60) onSpeed(speed)
          }}>
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
  )
}
