import type { Language } from '../../domain/types'
import { floors, linesById, nodes, station } from '../../model'
import records from '../../../data/sources.json'
import { areaText } from '../../Guide'
import type { SelectionTarget } from '../../state/selection'
import { LineBadge } from '../atoms/LineBadge'

interface Props {
  lang: Language
  selection: SelectionTarget | null
  clear: () => void
  onRoute: (which: 'start' | 'end', id: string) => void
}

export function FeatureCard({ lang, selection, clear, onRoute }: Props) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const facility = station.links.find((e) => e.id === selection?.id)
  const place = selection ? nodes.get(selection.id) : null
  const selectedStation = selection?.kind === 'station'
    ? station.context.find((entry) => entry.id === selection.id) ??
      station.stations.find((entry) => entry.id === selection.id)
    : null
  const selected = facility ?? place ?? selectedStation
  const evidence = selected && (
    <details>
      <summary>{t('資料・精度', 'Source & precision')}</summary>
      {selected.provenance.sourceIds.map((id) => {
        const record = records.find((s) => s.id === id)!
        return (
          <p key={id}>
            <a href={record.url ?? undefined} target="_blank" rel="noreferrer">
              {record.title} ↗
            </a>
            <br />
            {record.sourceDate ?? t('資料日不明', 'Undated')}
          </p>
        )
      })}
      {t('位置・寸法は模式的です。', 'Position and dimensions are schematic.')}
    </details>
  )
  return (
    <>
      {facility && (
        <section className="place-card">
          <button
            className="dismiss"
            onClick={clear}
            aria-label={t('閉じる', 'Close')}
          >
            ×
          </button>
          <small>
            {floors.get(nodes.get(facility.from)!.levelId)?.label} →{' '}
            {floors.get(nodes.get(facility.to)!.levelId)?.label}
          </small>
          <strong data-testid="detail-title">{facility.names[lang]}</strong>
          <span>
            {facility.direction === 'unknown'
              ? t('運転方向未確認', 'Operating direction unverified')
              : [
                  nodes.get(facility.from)!.names[lang],
                  nodes.get(facility.to)!.names[lang],
                ].join(' ↔ ')}
          </span>
          {evidence}
        </section>
      )}
      {place && (
        <section className="place-card">
          <button
            className="dismiss"
            onClick={clear}
            aria-label={t('閉じる', 'Close')}
          >
            ×
          </button>
          <small>
            {floors.get(place.levelId)?.label} · {areaText(place, lang)}
          </small>
          <strong data-testid="detail-title">{place.names[lang]}</strong>
          <span>
            {place.serviceLineIds?.map((id) => {
              const line = linesById.get(id)
              return line && <LineBadge key={id} line={line} lang={lang} />
            })}
          </span>
          <div>
            {(['start', 'end'] as const).map((key, i) => (
              <button
                key={key}
                onClick={() => onRoute(key, place.id)}
              >
                {i
                  ? t('ここまで', 'Route here')
                  : t('ここから', 'Start here')}
              </button>
            ))}
          </div>
          {evidence}
        </section>
      )}
      {selectedStation && (
        <section className="place-card">
          <button className="dismiss" onClick={clear} aria-label={t('閉じる', 'Close')}>
            ×
          </button>
          <strong data-testid="detail-title">{selectedStation.names[lang]}</strong>
          {evidence}
        </section>
      )}
    </>
  )
}
