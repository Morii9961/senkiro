import { nameIn, textIn } from '../../domain/language'
import { useEffect, useState } from 'react'
import { describeVehicle } from '../../domain/describe/train'
import type { Language } from '../../domain/types'
import { timetableRegistry, type OfficialTimetable } from '../../providers/timetable'
import { formatServiceTime, serviceClockAt, serviceDateTypeApplies, type DayType } from '../../timetable/time'
import type { FeedMode } from '../../timetable/types'
import { timetableText } from '../../timetable/display'
import { trainClockSeconds, type TrainClock, type TrainSpeed } from '../../trains/clock'
import { LineBadge } from '../atoms/LineBadge'
import { TimetableLinks } from '../atoms/TimetableLinks'
import { OfficialDepartures } from './OfficialDepartures'

interface Props {
  lang: Language
  feed: FeedMode
  clock: TrainClock
  day: DayType
  timetable: OfficialTimetable | null | undefined
  onMode: (mode: 'off' | 'demo' | 'timetable-sim') => void
  onDay: (day: DayType) => void
  onSpeed: (speed: TrainSpeed) => void
}

export function SimBanner({ lang }: { lang: Language }) {
  return <strong>{textIn(lang, 'DEMO · 架空のダイヤ', 'DEMO · Fictional timetable', '演示 · 虚构时刻表')}</strong>
}

export function TrainPanel({ lang, feed, clock, day, timetable, onMode, onDay, onSpeed }: Props) {
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  const records = feed.kind === 'demo'
    ? feed.dataset.records.filter((record) => serviceDateTypeApplies(record.service_date_type, day))
    : []

  return (
    <section className="train-panel" aria-label={t('列車', 'Trains', '列车')}>
      <TimetableLinks lang={lang} />
      <div className="train-modes" role="group" aria-label={t('表示モード', 'Train mode', '列车模式')}>
        <button type="button" aria-pressed={feed.kind === 'off'} onClick={() => onMode('off')}>
          {t('オフ', 'Off', '关闭')}
        </button>
        <button type="button" disabled={!timetable} aria-pressed={feed.kind === 'timetable-sim'}
          aria-describedby={!timetable ? 'timetable-unavailable' : undefined}
          onClick={() => onMode('timetable-sim')}>
          {t('公式時刻表', 'Official timetable', '官方时刻表')}
        </button>
        <button type="button" aria-pressed={feed.kind === 'demo'} onClick={() => onMode('demo')}>
          {t('デモ', 'Demo', '演示')}
        </button>
      </div>
      {!timetable && <p id="timetable-unavailable" className="train-note">
        {timetable === undefined
          ? t('時刻表を確認中…', 'Checking for a timetable…', '正在检查时刻表…')
          : t('利用できる時刻表データがありません。', 'No timetable dataset is available.', '暂无导入的时刻表。')}
      </p>}
      <p className="train-note">{t('リアルタイム配信なし', 'Live feed unavailable', '暂无实时数据')}</p>
      {feed.kind === 'timetable-sim' && <OfficialDepartures dataset={feed.dataset} lang={lang} />}
      {feed.kind === 'demo' && <>
        <ClockBar {...{ lang, clock, day, onDay, onSpeed }} />
        <ul className="train-schedule" aria-label={t('架空の発車予定', 'Fictional departures', '虚构发车时刻')}>
          {records.map((record) => {
            const line = record.line_id && timetableRegistry.lines.get(record.line_id)
            const platform = record.platform_id === null ? undefined : timetableRegistry.platforms.get(record.platform_id)
            const vehicle = describeVehicle(record, record.vehicle_assignment_status, lang)
            return (
              <li key={record.trip_id} data-train-card="demo">
                <strong>{t('架空', 'Fictional', '虚构')}</strong>
                {line && <LineBadge line={line} lang={lang} />}
                {(record.service_class || record.destination_text) && (
                  <span>{timetableText(record.service_class, lang)} {timetableText(record.destination_text, lang)}</span>
                )}
                <span>{t('予定', 'Scheduled', '计划时间')} {record.departure_time_local ?? record.arrival_time_local}</span>
                <small>{nameIn(platform?.names, lang) ?? t('番線未確認', 'Platform unverified', '站台未核实')}</small>
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
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
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
        <output aria-live="off" aria-label={t('シミュレーション時刻', 'Simulation time', '模拟时钟')}>
          {formatServiceTime(seconds, true)} JST
        </output>
        <label>
          {t('日別', 'Service day', '运行日')}
          <select value={day} onChange={(event) => onDay(event.currentTarget.value === 'weekday' ? 'weekday' : 'weekend')}>
            <option value="weekday">{t('平日', 'Weekdays', '工作日')}</option>
            <option value="weekend">{t('土休日', 'Weekends & holidays', '周末及节假日')}</option>
          </select>
        </label>
        <label>
          {t('倍速', 'Speed', '倍速')}
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
          {t('現在時刻', 'Current time', '当前时间')}
        </button>
      </div>
      {localTime !== null && (
        <p className="train-note">
          <output>{formatServiceTime(localTime % 86400, true)} JST</output> ·{' '}
          {t('本機時刻・列車位置ではありません', 'Device time only · no train position', '仅显示设备时间')}
        </p>
      )}
    </div>
  )
}
