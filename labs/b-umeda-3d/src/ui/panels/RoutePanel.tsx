import type { Step } from '../../domain/graph'
import type { Language } from '../../domain/types'
import { floors, nodes, station } from '../../model'
import { areaText } from '../../Guide'

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
const endpoints = station.places.filter((n) => n.kind !== 'Landing')

interface Props {
  lang: Language
  tour: number
  trip: { start: string; end: string }
  step: number
  lift: boolean
  needsStart: boolean
  steps: Step[] | null
  stats: { segments: number; changes: number; gates: number }
  pickTour: (index: number) => void
  endpoint: (which: 'start' | 'end', id: string) => void
  highlight: (step: number) => void
  onSwap: () => void
  onLiftChange: (on: boolean) => void
}

export function RoutePanel({
  lang, tour, trip, step, lift, needsStart, steps, stats, pickTour, endpoint, highlight, onSwap, onLiftChange,
}: Props) {
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const path = steps ?? []
  return (
    <>
      <div className="panel-top">
        <h2>{t('乗り換えをたどる', 'Explore a route')}</h2>
        <label className="sr" htmlFor="tour">
          {t('案内ルート', 'Guided route')}
        </label>
        <select
          id="tour"
          value={tour}
          onChange={(e) => pickTour(+e.target.value)}
        >
          {tour < 0 && (
            <option disabled value={-1}>
              {t('指定した経路', 'Custom route')}
            </option>
          )}
          {tours.map((v, i) => (
            <option key={i} value={i}>
              {v[lang]}
            </option>
          ))}
        </select>
        <div className="endpoints">
          {(['start', 'end'] as const).map((key, i) => (
            <label key={key}>
              <small>{i ? t('到着', 'To') : t('出発', 'From')}</small>
              <select
                aria-label={i ? t('到着', 'To') : t('出発', 'From')}
                value={needsStart && key === 'start' ? '' : trip[key]}
                onChange={(e) => endpoint(key, e.target.value)}
              >
                {needsStart && key === 'start' && (
                  <option value="" disabled>{t('出発地を選択', 'Choose a departure')}</option>
                )}
                {(nodes.get(trip[key])?.kind === 'Landing' ? [nodes.get(trip[key])!, ...endpoints] : endpoints).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.names[lang]} · {floors.get(n.levelId)?.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button onClick={onSwap} disabled={needsStart}>
            {t('出発地と到着地を交換', 'Swap endpoints')} ⇅
          </button>
        </div>
        <label className="lift-mode">
          <input
            type="checkbox"
            checked={lift}
            onChange={(e) => onLiftChange(e.target.checked)}
          />
          {t('確認済みの段差なし経路', 'Verified step-free links only')}
        </label>
      </div>
      {steps?.length === 0 ? (
        <p className="panel-top">
          {t(
            '出発地と到着地が同じです。',
            'You are already at the destination.',
          )}
        </p>
      ) : steps ? (
        <>
          <div className="stats">
            {[
              [stats.segments, t('区間', 'Segments')],
              [stats.changes, t('階層移動', 'Level changes')],
              [stats.gates, t('改札', 'Gates')],
            ].map(([v, k]) => (
              <div key={k}>
                <b>{v}</b>
                <span>{k}</span>
              </div>
            ))}
          </div>
          <div className="tour-actions">
            <button
              className="primary"
              onClick={() =>
                highlight(step + 1 >= path.length ? 0 : step + 1)
              }
            >
              {step === -1
                ? t('経路案内を開始', 'Start walkthrough')
                : step === path.length - 1
                  ? t('もう一度見る', 'Restart route')
                  : t('次の区間', 'Next segment')}{' '}
              <span>→</span>
            </button>
            {step >= 0 && (
              <button onClick={() => highlight(Math.max(-1, step - 1))}>
                ←
              </button>
            )}
          </div>
          <ol className="steps">
            {path.map((s, i) => (
              <li key={s.link.id}>
                <button
                  aria-current={step === i ? 'step' : undefined}
                  onClick={() => highlight(i)}
                >
                  <em>{String(i + 1).padStart(2, '0')}</em>
                  <span>
                    <strong>{instruction(s, lang)}</strong>
                    <small>{s.to.names[lang]}</small>
                    {step === i && (
                      <small>{areaText(s.to, lang)}</small>
                    )}
                  </span>
                  <code>
                    {floors.get(s.from.levelId)!.label}
                    {floors.get(s.from.levelId)!.ordinal !==
                      floors.get(s.to.levelId)!.ordinal &&
                      ' → ' + floors.get(s.to.levelId)!.label}
                  </code>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="panel-top">
          {t(
            needsStart
              ? '出発地を選択'
              : lift
              ? '確認済みの段差なし経路がありません。'
              : 'この区間の経路は未確認です。',
            needsStart
              ? 'Choose a departure'
              : lift
              ? 'No verified step-free route for these endpoints.'
              : 'No verified route for these endpoints.',
          )}
        </p>
      )}
    </>
  )
}
