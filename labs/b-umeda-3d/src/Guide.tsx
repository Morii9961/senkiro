import { nameIn, textIn } from './domain/language'
import type { Language, Place } from './domain/types'
import { exampleService } from './providers/service'
import records from '../data/sources.json'
import { floors, linesById, station } from './model'
import { LineBadge } from './ui/atoms/LineBadge'
export function areaText(n: Place, lang: Language) {
  if (n.zone === 'paid') return textIn(lang, '改札内', 'Inside gates', '闸机内')
  const labels = {
    railway: ['鉄道会社', 'railway', '铁路公司'],
    commercial: ['商業施設・地下街', 'commercial facility', '商业设施或地下街'],
    'public-road': ['公共道路', 'public road', '公共道路'],
    unknown: ['管理者未確認', 'manager unknown', '管理方未核实'],
  } as const
  const [ja, en, zh] = labels[n.manager ?? 'unknown']
  return textIn(lang, '改札外 · ', 'Outside gates · ', '闸机外 · ') + textIn(lang, ja, en, zh)
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
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  const data = exampleService.updates[0],
    source = records.find((s) => s.id === data.sourceId)!
  return (
    <div className="guide">
      <h2>{t('モデルの範囲', 'Model coverage', '模型覆盖范围')}</h2>
      <p>
        {t(
          '梅田地区の7駅とホワイティうめだ。建築部材と材質は断面を読み取るための表現です。座標・寸法は模式的です。通路の営業時間と設備の稼働状況は未確認です。',
          'Seven stations and Whity Umeda. Architectural finishes and structural bays illustrate the cutaway. Coordinates and dimensions are schematic. Passage hours and lift availability are unknown.', '涵盖梅田地区七座车站和 Whity 梅田地下街。建筑构件和材质用于辅助阅读剖面。坐标和尺寸为示意，通道开放时间和升降设备运行状态尚未核实。',
        )}
      </p>
      <details open>
        <summary>{t('施設と資料', 'Facilities and evidence', '设施与资料')}</summary>
        <label className="sr" htmlFor="facility">
          {t('施設', 'Facility', '设施')}
        </label>
        <select
          id="facility"
          value={place?.id ?? ''}
          onChange={(e) => e.target.value ? onSelect(e.target.value) : onClear()}
        >
          <option value="">{t('施設を選択', 'Select a facility', '选择设施')}</option>
          {station.places
            .filter((n) => n.kind !== 'Landing')
            .map((n) => (
              <option key={n.id} value={n.id}>
                {nameIn(n.names, lang)}
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
              · {ref.sourceDate ?? t('資料日不明', 'undated', '资料日期未知')}
              <br />
            </small>
          )
        })}
      </details>
      <details open>
        <summary>{t('運行情報', 'Platform service', '站台运营信息')}</summary>
        <p>{t('リアルタイム配信なし', 'Live feed unavailable', '暂无实时数据')}</p>
        <label>
          <input type="checkbox" checked={example} onChange={onExample} />
          {t('サンプルを表示', 'Show example overlay', '显示示例标记')}
        </label>
        {example && (
          <div className="fixture">
            <strong>
              {t('サンプルモード・架空データ', 'EXAMPLE MODE · SYNTHETIC', '示例模式 · 虚构数据')}
            </strong>
            {nameIn(station.places.find((p) => p.id === data.platformId)!.names, lang)}
            <br />
            {t('遅延', 'Delay', '延误')} +{data.delayMinutes} min ·{' '}
            {t('予定', 'Scheduled', '计划时间')} {data.scheduledAt?.slice(11, 16)} JST
            <br />
            {source.publisher} · {t('例示データ', 'Demo fixture', '示例数据')}
            <br />
            <time>{data.observedAt}</time>
          </div>
        )}
      </details>
      <details open>
        <summary>{t('周辺駅・地下街', 'District stations & arcades', '周边车站与地下街')}</summary>
        <p>
          {t(
            '駅ごとに改札を分け、資料で確認した通路を収録しています。',
            'Separate fare areas. The map includes the documented walking connections.', '各站付费区独立，地图收录了资料可核实的步行通道。',
          )}
        </p>
        {station.context.map((b) => (
          <div className="context-block" key={b.id}>
            <i aria-hidden="true" />
            {nameIn(b.names, lang)} ·{' '}
            {b.stationId
              ? t('鉄道駅', 'Station', '车站')
              : t('地下街', 'Shopping arcade', '地下街')}
          </div>
        ))}
      </details>
      <button onClick={showSources}>{t('参照資料', 'Sources', '参考资料')} ↗</button>
    </div>
  )
}
