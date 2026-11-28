import records from '../../../data/sources.json'
import type { DetailAction, DetailSpec } from '../../domain/describe/types'
import type { Language } from '../../domain/types'
import type { SelectionTarget } from '../../state/selection'
import { FieldRow } from '../atoms/FieldRow'
import { LineBadge } from '../atoms/LineBadge'
import { TimetableLinks } from '../atoms/TimetableLinks'
import { timetableText } from '../../timetable/display'
import { nodes } from '../../model'
import { UnknownValue } from '../atoms/UnknownValue'
import type { OfficialTimetable } from '../../providers/timetable'
import { OfficialDepartures } from './OfficialDepartures'

export type SheetHeight = 'collapsed' | 'half' | 'expanded'

interface Props {
  spec: DetailSpec
  lang: Language
  height: SheetHeight
  onHeight: (height: SheetHeight) => void
  onClose: () => void
  onSelect: (target: SelectionTarget) => void
  onAction: (kind: DetailAction, target: SelectionTarget) => void
  officialTimetable?: OfficialTimetable | null
}

const icons: Record<SelectionTarget['kind'], string> = {
  platform: '▰', station: '▤', gate: '◇', entrance: '↗', vertical: '↕',
  passage: '→', concourse: '□', line: '─', train: '▣',
}

export function DetailSheet({ spec, lang, height, onHeight, onClose, onSelect, onAction, officialTimetable }: Props) {
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  const platform = spec.target.kind === 'platform' ? nodes.get(spec.target.id) : null
  const { target, title, subtitle, chips, facts, service, relations, actions, provenance } = spec
  const expand = height !== 'expanded'
  return (
    <section className="detail-sheet" data-testid="detail-sheet"
      data-target={target.kind + ':' + target.id} aria-labelledby="detail-title">
      <div className="detail-heading">
        <span className="detail-icon" aria-hidden="true">{icons[target.kind]}</span>
        <div className="detail-names">
          <h2 id="detail-title" data-testid="detail-title">{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="detail-window-actions">
          {height !== 'collapsed' && (
            <button className="detail-size" aria-label={t('詳細を縮小', 'Collapse details', '收起详情')}
              onClick={() => onHeight(height === 'expanded' ? 'half' : 'collapsed')}>−</button>
          )}
          {expand && (
            <button className="detail-size" aria-label={t('詳細を拡大', 'Expand details', '展开详情')}
              onClick={() => onHeight(height === 'collapsed' ? 'half' : 'expanded')}>＋</button>
          )}
          <button aria-label={t('閉じる', 'Close', '关闭')} onClick={onClose}>×</button>
        </div>
      </div>
      <div className="detail-content">
        <div className="detail-chips">
          {chips.lines.length ? chips.lines.map((line) =>
            <LineBadge key={line.id} line={line} lang={lang} />) : <UnknownValue lang={lang} />}
          {chips.floor && <span>{chips.floor}</span>}
          {chips.area && <span>{chips.area}</span>}
          {chips.vehicle && <span data-vehicle-status={chips.vehicle.status}>{chips.vehicle.label}</span>}
        </div>
        <dl className="detail-facts">
          {facts.map((fact) => <FieldRow key={fact.key} fact={fact} lang={lang} />)}
        </dl>
        {service && (
          <div className="detail-service" data-testid="platform-service">
            <h3>{t('運行情報', 'Service', '运营信息')}</h3>
            {platform && <TimetableLinks lang={lang} platform={platform} />}
            {platform && officialTimetable && officialTimetable.records.some(({ platform_id }) => platform_id === platform.id) && (
              <details>
                <summary>{t('公式の発車時刻', 'Official departures', '官方发车时刻')}</summary>
                <OfficialDepartures key={platform.id} dataset={officialTimetable} lang={lang} platformId={platform.id} />
              </details>
            )}
            {service.kind === 'unavailable' ? (
              <p>{t('リアルタイム配信なし', 'Live feed unavailable', '暂无实时数据')}</p>
            ) : service.kind === 'demo-timetable' ? (
              <div className="fixture">
                <strong>{t('DEMO · 架空のダイヤ', 'DEMO · Fictional timetable', '演示 · 虚构时刻表')}</strong>
                {service.records.map((record) => (
                  <p key={record.trip_id}>
                    {timetableText(record.service_class, lang)} {timetableText(record.destination_text, lang)} ·{' '}
                    {t('予定到着', 'Scheduled arrival', '计划到达')} {record.arrival_time_local ?? <UnknownValue lang={lang} />} ·{' '}
                    {t('予定発車', 'Scheduled departure', '计划出发')} {record.departure_time_local ?? <UnknownValue lang={lang} />}
                  </p>
                ))}
              </div>
            ) : (
              <div className="fixture">
                <strong>{t('サンプル・架空', 'EXAMPLE · SYNTHETIC', '示例 · 虚构数据')}</strong>
                <p>+{service.update.delayMinutes} min · <time>{service.update.observedAt}</time></p>
                <small>{t('SENKIRO Lab の例示データ', 'SENKIRO Lab demo fixture', 'SENKIRO Lab 示例数据')}</small>
              </div>
            )}
          </div>
        )}
        <div className="detail-actions">
          {actions.map(({ kind, label, pressed }) => (
            <button key={kind} className={kind === 'start' || kind === 'end' ? 'primary' : undefined}
              aria-pressed={pressed} onClick={() => onAction(kind, target)}>{label}</button>
          ))}
        </div>
        {relations.map(({ key, title, items, derived }) => (
          <div className="detail-relations" key={key} data-testid={key}>
            <h3>{title} {derived && <small>{t('派生・示意', 'Derived · schematic', '推导 · 示意')}</small>}</h3>
            {items.length ? (
              <ul>
                {items.map(({ target, label, badge }) => (
                  <li key={target.id}>
                    <button data-target={target.kind + ':' + target.id} onClick={() => onSelect(target)}>
                      <span>{label}</span>{badge && <small>{badge}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <UnknownValue lang={lang} />}
          </div>
        ))}
        <details className="detail-provenance">
          <summary>{t('資料・精度', 'Source & precision', '来源与精度')}</summary>
          <p>{provenance.nature} · {provenance.confidence}</p>
          {provenance.sourceIds.map((id) => {
            const source = records.find((entry) => entry.id === id)
            if (!source) return null
            return (
              <p key={id}>
                {source.url
                  ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
                  : source.title}
                <br />{source.sourceDate ?? t('資料日不明', 'Undated', '资料日期未知')}
              </p>
            )
          })}
          {provenance.missing.length > 0 && (
            <p>{t('未確認の項目', 'Unverified fields', '未核实字段')} · {provenance.missing.join(' / ')}</p>
          )}
        </details>
      </div>
    </section>
  )
}
