import type { Language, Place } from './domain/types'
import { exampleService } from './providers/service'
import records from '../data/sources.json'
import { floors, linesById, station } from './model'
import { LineBadge } from './ui/atoms/LineBadge'
export function areaText(n: Place, lang: Language) {
  if (n.zone === 'paid') return lang === 'ja' ? '改札内' : 'Inside gates'
  const labels = {
    railway: ['鉄道会社', 'railway'],
    commercial: ['商業施設・地下街', 'commercial facility'],
    'public-road': ['公共道路', 'public road'],
    unknown: ['管理者未確認', 'manager unknown'],
  }
  return (
    (lang === 'ja' ? '改札外 · ' : 'Outside gates · ') +
    labels[n.manager ?? 'unknown'][lang === 'ja' ? 0 : 1]
  )
}
export function Guide({
  lang,
  selection: place,
  onSelect,
  onClear,
  example,
  onExample,
  showSources,
}: {
  lang: Language
  selection: Place | null
  onSelect: (id: string) => void
  onClear: () => void
  example: boolean
  onExample: () => void
  showSources: () => void
}) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const data = exampleService.updates[0],
    source = records.find((s) => s.id === data.sourceId)!
  return (
    <div className="guide">
      <h2>{t('モデルの範囲', 'Model coverage')}</h2>
      <p>
        {t(
          '梅田地区の7駅とホワイティうめだ。建築部材と材質は断面を読み取るための表現です。座標・寸法は模式的です。通路の営業時間と設備の稼働状況は未確認です。',
          'Seven stations and Whity Umeda. Architectural finishes and structural bays illustrate the cutaway. Coordinates and dimensions are schematic. Passage hours and lift availability are unknown.',
        )}
      </p>
      <details open>
        <summary>{t('施設と資料', 'Facilities and evidence')}</summary>
        <label className="sr" htmlFor="facility">
          {t('施設', 'Facility')}
        </label>
        <select
          id="facility"
          value={place?.id ?? ''}
          onChange={(e) => e.target.value ? onSelect(e.target.value) : onClear()}
        >
          <option value="">{t('施設を選択', 'Select a facility')}</option>
          {station.places
            .filter((n) => n.kind !== 'Landing')
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.names[lang]}
              </option>
            ))}
        </select>
        {place && (
          <p>
            {floors.get(place.levelId)?.label} · {areaText(place, lang)}
            <br />
            {place.serviceLineIds?.map((id) => {
              const line = linesById.get(id)
              return line && <LineBadge key={id} line={line} lang={lang} />
            })}
          </p>
        )}
        {place?.provenance.sourceIds.map((id) => {
          const ref = records.find((s) => s.id === id)!
          return (
            <small key={id}>
              <a href={ref.url!} target="_blank" rel="noreferrer">
                {ref.title} ↗
              </a>{' '}
              · {ref.sourceDate ?? t('資料日不明', 'undated')}
              <br />
            </small>
          )
        })}
      </details>
      <details open>
        <summary>{t('運行情報', 'Platform service')}</summary>
        <p>{t('リアルタイム配信なし', 'Live feed unavailable')}</p>
        <label>
          <input type="checkbox" checked={example} onChange={onExample} />
          {t('サンプルを表示', 'Show example overlay')}
        </label>
        {example && (
          <div className="fixture">
            <strong>
              {t('サンプルモード・架空データ', 'EXAMPLE MODE · SYNTHETIC')}
            </strong>
            {station.places.find((p) => p.id === data.platformId)!.names[lang]}
            <br />
            {t('遅延', 'Delay')} +{data.delayMinutes} min ·{' '}
            {t('予定', 'Scheduled')} {data.scheduledAt?.slice(11, 16)} JST
            <br />
            {source.publisher} · {t('例示データ', 'Demo fixture')}
            <br />
            <time>{data.observedAt}</time>
          </div>
        )}
      </details>
      <details open>
        <summary>{t('周辺駅・地下街', 'District stations & arcades')}</summary>
        <p>
          {t(
            '駅ごとに改札を分け、資料で確認した通路を収録しています。',
            'Separate fare areas. The map includes the documented walking connections.',
          )}
        </p>
        {station.context.map((b) => (
          <div className="context-block" key={b.id}>
            <i aria-hidden="true" />
            {b.names[lang]} ·{' '}
            {b.stationId
              ? t('鉄道駅', 'Station')
              : t('地下街', 'Shopping arcade')}
          </div>
        ))}
      </details>
      <button onClick={showSources}>{t('参照資料', 'Sources')} ↗</button>
    </div>
  )
}
