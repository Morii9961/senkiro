import type { RouteFailure, RoutePlan, Step } from '../../domain/graph'
import type { Language } from '../../domain/types'
import { floors, linesById, nodes, station } from '../../model'
import { areaText } from '../../Guide'
import { LineBadge } from '../atoms/LineBadge'

export const tours = [
  {
    ja: 'JR 大阪 → 地下鉄 梅田',
    en: 'JR Osaka → Metro Umeda',
    start: 'sk:concourse:jr-midosuji-in',
    end: 'sk:platform:metro-1',
  },
  {
    ja: '西口 → うめきた地下ホーム',
    en: 'West gate → Umekita platforms',
    start: 'sk:concourse:jr-west-outside',
    end: 'sk:platform:jr-21-22',
  },
  {
    ja: '西口からホームへ',
    en: 'West gate to the platforms',
    start: 'sk:concourse:jr-west-outside',
    end: 'sk:platform:jr-3-4',
  },
  {
    ja: '大阪 → 阪急 京都線',
    en: 'Osaka → Hankyu Kyoto Line',
    start: 'sk:concourse:jr-midosuji-in',
    end: 'sk:platform:hk-1',
  },
  {
    ja: '大阪 → ホワイティ → 東梅田',
    en: 'Osaka → Whity → Higashi-Umeda',
    start: 'sk:concourse:jr-midosuji-in',
    end: 'sk:platform:higashi-2',
  },
  {
    ja: '北新地 → 西梅田',
    en: 'Kitashinchi → Nishi-Umeda',
    start: 'sk:platform:kita-1-2',
    end: 'sk:platform:nishi-1-2',
  },
]
export function instruction(s: Step, lang: Language) {
  if (s.link.from === s.from.id) return s.link.names[lang]
  const action = {
    Gate: ['改札を通る', 'Cross gate'],
    Passage: ['進む', 'Walk'],
    Stairs: ['階段', 'Take stairs'],
    Escalator: ['エスカレーター', 'Take escalator'],
    Elevator: ['エレベーター', 'Take lift'],
  }[s.link.kind][lang === 'ja' ? 0 : 1]
  return action + ' → ' + s.to.names[lang]
}
const endpoints = station.places.filter((node) => node.kind !== 'Landing')
type Side = 'start' | 'end'
type Trip = Record<Side, string | null>

const stepIcons = { Gate: '◇', Passage: '→', Stairs: '▟', Escalator: '↗', Elevator: '↕' }

function RouteSlots({ lang, trip, onFind, onSwap }: {
  lang: Language; trip: Trip; onFind: () => void; onSwap: () => void
}) {
  return (
    <div className="route-slots">
      {(['start', 'end'] as const).map((side) => {
        const id = trip[side]
        const place = id ? nodes.get(id) : undefined
        const label = side === 'start' ? (lang === 'ja' ? '出発' : 'From') : (lang === 'ja' ? '到着' : 'To')
        return (
          <button key={side} type="button" className="route-slot" aria-label={label + (place ? ' · ' + place.names[lang] : '')}
            data-testid={side === 'start' ? 'route-from' : 'route-to'} onClick={onFind}>
            <small>{label}</small>
            <strong>{place?.names[lang] ?? (lang === 'ja' ? '地点を選ぶ' : 'Choose a place')}</strong>
            {place && <span className="route-slot-meta">
              {place.serviceLineIds?.map((id) => {
                const line = linesById.get(id)
                return line ? <LineBadge key={id} line={line} lang={lang} /> : null
              })}
              <span className="detail-chip">{floors.get(place.levelId)?.label}</span>
            </span>}
          </button>
        )
      })}
      <button className="route-swap" type="button" disabled={!trip.start || !trip.end} onClick={onSwap}
        aria-label={lang === 'ja' ? '出発地と到着地を交換' : 'Swap endpoints'}>⇅</button>
    </div>
  )
}

function RouteSummary({ lang, summary }: { lang: Language; summary: RoutePlan['summary'] }) {
  return (
    <div className="route-summary" data-testid="route-summary">
      <div className="stats">
        {[
          [summary.segments, lang === 'ja' ? '区間' : 'Segments'],
          [summary.levelChanges, lang === 'ja' ? '階層移動' : 'Level changes'],
          [summary.gates, lang === 'ja' ? '改札' : 'Gates'],
        ].map(([count, label]) => <div key={label}><b>{count}</b>{' '}<span>{label}</span></div>)}
      </div>
      <p>{lang === 'ja' ? '距離・所要時間：未測定' : 'Distance and duration: Unmeasured'}</p>
    </div>
  )
}

function StepGroup({ lang, span, path, step, highlight }: {
  lang: Language; span: RoutePlan['floorSpans'][number]; path: Step[]; step: number; highlight: (step: number) => void
}) {
  return (
    <section className="route-step-group" data-testid="route-step-group">
      <h3>{span.fromLabel === span.toLabel ? span.fromLabel : span.fromLabel + ' → ' + span.toLabel}</h3>
      <ol className="steps" start={span.stepIndexes[0] + 1}>
        {span.stepIndexes.map((index) => {
          const item = path[index]
          const free = item.link.stepFree
          const access = free === true ? (lang === 'ja' ? '段差なし確認済み' : 'Verified step-free')
            : free === false ? (lang === 'ja' ? '段差あり' : 'Not step-free')
              : (lang === 'ja' ? '段差未確認' : 'Step-free status unverified')
          return (
            <li key={item.link.id} data-step-link={item.link.id}>
              <button aria-current={step === index ? 'step' : undefined} onClick={() => highlight(index)}>
                <em aria-hidden="true">{stepIcons[item.link.kind]}</em>
                <span>
                  <strong>{instruction(item, lang)}</strong>
                  <small>{item.to.names[lang]}</small>
                  {step === index && <small>{areaText(item.to, lang)}</small>}
                </span>
                <span className="step-access" data-step-free={free === true ? 'yes' : free === false ? 'no' : 'unknown'}
                  aria-label={access} title={access}>{free === true ? '○' : free === false ? '×' : '？'}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function BlockedReason({ lang, failure }: { lang: Language; failure: RouteFailure }) {
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en
  if (failure.reason === 'no-path') {
    return <p className="route-failure" role="status" data-testid="route-failure">
      {t('この区間の通行経路は未確認です。', 'No verified route for these endpoints.')}
    </p>
  }
  const reason = {
    stairs: t('階段', 'Stairs'),
    'escalator-direction-unknown': t('エスカレーターの方向が未確認', 'Escalator direction unverified'),
    'unknown-step-free': t('段差なしの資料が未確認', 'Step-free passage unconfirmed'),
    unverified: t('接続が未確認', 'Unverified connection'),
  }[failure.blocker]
  const link = station.links.find((entry) => entry.id === failure.firstBlockingLinkId)
  return (
    <div className="route-failure" role="status" data-testid="route-failure"
      data-blocker={failure.blocker} data-link-id={failure.firstBlockingLinkId}>
      <p>{t('確認済みの段差なし経路がありません。', 'No verified step-free route for these endpoints.')}</p>
      <strong>{reason}{link ? ' · ' + link.names[lang] : ''}</strong>
    </div>
  )
}

interface Props {
  lang: Language
  tour: number
  trip: Trip
  step: number
  lift: boolean
  result: RoutePlan | RouteFailure | null
  pickTour: (index: number) => void
  endpoint: (which: Side, id: string) => void
  highlight: (step: number) => void
  onFind: () => void
  onClear: () => void
  onSwap: () => void
  onLiftChange: (on: boolean) => void
}

export function RoutePanel({
  lang, tour, trip, step, lift, result, pickTour, endpoint, highlight, onFind, onClear, onSwap, onLiftChange,
}: Props) {
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en
  const planned = result && 'steps' in result ? result : null
  const path = planned?.steps ?? []
  return (
    <>
      <div className="panel-top">
        <div className="route-title">
          <h2>{t('乗り換えをたどる', 'Explore a route')}</h2>
          {(trip.start || trip.end) && <button type="button" onClick={onClear}>{t('クリア', 'Clear route')}</button>}
        </div>
        <RouteSlots {...{ lang, trip, onFind, onSwap }} />
        <div className="route-fallback">
          <label htmlFor="tour">{t('案内ルート', 'Guided route')}</label>
          <select id="tour" value={tour} onChange={(event) => pickTour(+event.target.value)}>
            {tour < 0 && <option disabled value={-1}>{t('指定した経路', 'Custom route')}</option>}
            {tours.map((item, index) => <option key={index} value={index}>{item[lang]}</option>)}
          </select>
          {(['start', 'end'] as const).map((side) => {
            const id = trip[side]
            const current = id ? nodes.get(id) : undefined
            const label = side === 'start' ? t('出発', 'From') : t('到着', 'To')
            return <label key={side}>
              <span>{label}</span>
              <select aria-label={label} value={id ?? ''} onChange={(event) => endpoint(side, event.target.value)}>
                {!id && <option value="" disabled>{t('地点を選ぶ', 'Choose a place')}</option>}
                {(current?.kind === 'Landing' ? [current, ...endpoints] : endpoints).map((node) => (
                  <option key={node.id} value={node.id}>{node.names[lang]} · {floors.get(node.levelId)?.label}</option>
                ))}
              </select>
            </label>
          })}
        </div>
        <label className="lift-mode">
          <input type="checkbox" checked={lift} onChange={(event) => onLiftChange(event.target.checked)} />
          {t('確認済みの段差なし経路', 'Verified step-free links only')}
        </label>
        <p className="route-access-help">
          {t('確認済みの段差なし区間のみ使用。資料がない区間は対象外です。',
            'Uses only verified step-free links. Links without verification are excluded.')}
        </p>
      </div>
      {planned && (
        <>
          <RouteSummary lang={lang} summary={planned.summary} />
          {path.length === 0 ? (
            <p className="panel-top">{t('出発地と到着地が同じです。', 'You are already at the destination.')}</p>
          ) : (
            <>
              <div className="tour-actions">
                <button className="primary" onClick={() => highlight(step + 1 >= path.length ? 0 : step + 1)}>
                  {step === -1 ? t('経路案内を開始', 'Start walkthrough')
                    : step === path.length - 1 ? t('もう一度見る', 'Restart route')
                      : t('次の区間', 'Next segment')}{' '}<span>→</span>
                </button>
                {step >= 0 && <button onClick={() => highlight(step - 1)}>←</button>}
              </div>
              {planned.floorSpans.map((span) => (
                <StepGroup key={span.stepIndexes[0]} {...{ lang, span, path, step, highlight }} />
              ))}
            </>
          )}
        </>
      )}
      {result && 'reason' in result && <BlockedReason lang={lang} failure={result} />}
    </>
  )
}
