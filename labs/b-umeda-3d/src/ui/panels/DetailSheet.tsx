import records from '../../../data/sources.json'
import type { DetailAction, DetailSpec } from '../../domain/describe/types'
import type { Language } from '../../domain/types'
import type { SelectionTarget } from '../../state/selection'
import { FieldRow } from '../atoms/FieldRow'
import { LineBadge } from '../atoms/LineBadge'
import { UnknownValue } from '../atoms/UnknownValue'

export type SheetHeight = 'collapsed' | 'half' | 'expanded'

interface Props {
  spec: DetailSpec
  lang: Language
  height: SheetHeight
  onHeight: (height: SheetHeight) => void
  onClose: () => void
  onSelect: (target: SelectionTarget) => void
  onAction: (kind: DetailAction, target: SelectionTarget) => void
}

const icons: Record<SelectionTarget['kind'], string> = {
  platform: '▰', station: '▤', gate: '◇', entrance: '↗', vertical: '↕',
  passage: '→', concourse: '□', line: '─', train: '▣',
}

export function DetailSheet({ spec, lang, height, onHeight, onClose, onSelect, onAction }: Props) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
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
            <button className="detail-size" aria-label={t('詳細を縮小', 'Collapse details')}
              onClick={() => onHeight(height === 'expanded' ? 'half' : 'collapsed')}>−</button>
          )}
          {expand && (
            <button className="detail-size" aria-label={t('詳細を拡大', 'Expand details')}
              onClick={() => onHeight(height === 'collapsed' ? 'half' : 'expanded')}>＋</button>
          )}
          <button aria-label={t('閉じる', 'Close')} onClick={onClose}>×</button>
        </div>
      </div>
      <div className="detail-content">
        <div className="detail-chips">
          {chips.lines.length ? chips.lines.map((line) =>
            <LineBadge key={line.id} line={line} lang={lang} />) : <UnknownValue lang={lang} />}
          {chips.floor && <span>{chips.floor}</span>}
          {chips.area && <span>{chips.area}</span>}
        </div>
        <dl className="detail-facts">
          {facts.map((fact) => <FieldRow key={fact.key} fact={fact} lang={lang} />)}
        </dl>
        {service && (
          <div className="detail-service" data-testid="platform-service">
            <h3>{t('運行情報', 'Service')}</h3>
            {service.kind === 'unavailable' ? (
              <p>{t('リアルタイム配信なし', 'Live feed unavailable')}</p>
            ) : (
              <div className="fixture">
                <strong>{t('サンプル・架空', 'EXAMPLE · SYNTHETIC')}</strong>
                <p>+{service.update.delayMinutes} min · <time>{service.update.observedAt}</time></p>
                <small>{t('SENKIRO Lab の例示データ', 'SENKIRO Lab demo fixture')}</small>
              </div>
            )}
          </div>
        )}
        <div className="detail-actions">
          {actions.map(({ kind, label }) => (
            <button key={kind} className={kind === 'start' || kind === 'end' ? 'primary' : undefined}
              onClick={() => onAction(kind, target)}>{label}</button>
          ))}
        </div>
        {relations.map(({ key, title, items, derived }) => (
          <div className="detail-relations" key={key} data-testid={key}>
            <h3>{title} {derived && <small>{t('派生・示意', 'Derived · schematic')}</small>}</h3>
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
          <summary>{t('資料・精度', 'Source & precision')}</summary>
          <p>{provenance.nature} · {provenance.confidence}</p>
          {provenance.sourceIds.map((id) => {
            const source = records.find((entry) => entry.id === id)
            if (!source) return null
            return (
              <p key={id}>
                {source.url
                  ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
                  : source.title}
                <br />{source.sourceDate ?? t('資料日不明', 'Undated')}
              </p>
            )
          })}
          {provenance.missing.length > 0 && (
            <p>{t('未確認の項目', 'Unverified fields')} · {provenance.missing.join(' / ')}</p>
          )}
        </details>
      </div>
    </section>
  )
}
