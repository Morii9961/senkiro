import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Scene } from './Scene'
import { FloorPlan } from './FloorPlan'
import { route, cost, type Step } from './domain/graph'
import type { Language } from './domain/types'
import { floorLabels, floors, nodes, station } from './model'
import records from '../data/sources.json'
import { Guide, areaText } from './Guide'
import { exampleService } from './providers/service'
import './style.css'

const tours = [
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
]
function instruction(s: Step, lang: Language) {
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
function App() {
  const [lang, language] = useState<Language>('ja'),
    [dark, theme] = useState(false),
    [plan, setPlan] = useState(false)
  const [floor, selectFloor] = useState<number | null>(null),
    [spread, setSpread] = useState(false),
    [reset, setReset] = useState(0)
  const [zoom, setZoom] = useState({ tick: 0, factor: 1 }),
    [planZoom, setPlanZoom] = useState(1)
  const [trip, setTrip] = useState({ start: tours[0].start, end: tours[0].end })
  const [drawer, setDrawer] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const tour = tours.findIndex(
    (x) => x.start === trip.start && x.end === trip.end,
  )
  const [step, selectStep] = useState(-1),
    [lift, setLift] = useState(false)
  const [example, setExample] = useState(false)
  const [panel, setPanel] = useState<'route' | 'layers'>('route'),
    [dialog, setDialog] = useState<'help' | 'sources' | null>(null)
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const steps = route(station, trip.start, trip.end, lift),
    path = steps ?? [],
    stats = cost(path)
  const floorNow = floor ?? 0,
    shownFloor = floorLabels.find((f) => f[0] === floorNow)?.[1]
  function togglePlan(next: boolean) {
    setPlan(next)
    setPicked(null)
    if (!next && path[step]) selectFloor(null)
    if (next && floor === null)
      selectFloor(path[step] ? floors.get(path[step].to.levelId)!.ordinal : 0)
    setPlanZoom(1)
  }
  function changeZoom(factor: number) {
    if (plan) setPlanZoom((v) => Math.max(0.5, Math.min(3, v * factor)))
    else setZoom((v) => ({ tick: v.tick + 1, factor }))
  }
  function highlight(i: number) {
    selectStep(i)
    setPicked(null)
    if (path[i])
      selectFloor(plan ? floors.get(path[i].to.levelId)!.ordinal : null)
  }
  function pickTour(i: number) {
    setTrip({ start: tours[i].start, end: tours[i].end })
    setPicked(null)
    selectStep(-1)
    selectFloor(plan ? 0 : null)
  }
  function endpoint(which: 'start' | 'end', id: string) {
    setTrip({ ...trip, [which]: id })
    selectStep(-1)
    setPicked(null)
    selectFloor(plan ? floors.get(nodes.get(id)!.levelId)!.ordinal : null)
  }
  function inspect(id: string) {
    setPicked(id)
  }
  function resetView() {
    selectStep(-1)
    setPicked(null)
    setReset((v) => v + 1)
    setPlanZoom(1)
  }
  const facility = station.links.find((e) => e.id === picked)
  const place = picked ? nodes.get(picked) : null
  const selected = facility ?? place
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
    <main className={dark ? 'app dark' : 'app'}>
      <header>
        <div className="signature">
          <i aria-hidden="true">≋</i> SENKIRO <span>Lab</span>
        </div>
        <span className="head-divider" />{' '}
        <h1 className="header-title">Umeda Station 3D</h1>
        <div className="header-actions">
          <button
            className="map-menu"
            aria-expanded={drawer}
            onClick={() => setDrawer(!drawer)}
          >
            {t('経路・施設', 'Routes & places')}
          </button>
          <button
            onClick={() => setDialog('help')}
            aria-label={t('操作説明', 'Controls')}
          >
            ?
          </button>
          <button
            aria-label={t('配色を切り替える', 'Toggle theme')}
            onClick={() => theme(!dark)}
          >
            {dark ? '☀' : '◐'}
          </button>
          <button
            onClick={() => {
              language(lang === 'ja' ? 'en' : 'ja')
              document.documentElement.lang = lang === 'ja' ? 'en' : 'ja'
            }}
          >
            {lang === 'ja' ? 'EN' : '日本語'}
          </button>
        </div>
      </header>
      <div className={'workspace' + (drawer ? ' with-drawer' : '')}>
        <section className="viewer">
          <div className="viewer-bar">
            <strong>
              <i className="status-dot" />
              {t('大阪・梅田', 'Osaka / Umeda')}
            </strong>
            <div className="seg">
              <button aria-pressed={!plan} onClick={() => togglePlan(false)}>
                3D
              </button>
              <button aria-pressed={plan} onClick={() => togglePlan(true)}>
                2D
              </button>
            </div>
          </div>
          <div className="stage">
            {plan ? (
              <FloorPlan
                floor={floorNow}
                lang={lang}
                steps={step >= 0 || drawer ? path : []}
                active={step}
                zoom={planZoom}
                example={example}
              />
            ) : (
              <Scene
                {...{ lang, dark, floor, spread, step, reset, zoom, example }}
                route={step >= 0 || drawer ? path : []}
                onInspect={inspect}
                onReset={resetView}
                onFallback={() => togglePlan(true)}
              />
            )}
            {example && (
              <div className="sample-tag">
                {t('サンプルモード', 'EXAMPLE MODE')} ·{' '}
                {t('梅田 1番線', 'Umeda platform 1')} +
                {exampleService.updates[0].delayMinutes} min · SENKIRO Lab ·{' '}
                {exampleService.updates[0].observedAt}
              </div>
            )}
            {facility && (
              <section className="place-card">
                <button
                  className="dismiss"
                  onClick={() => setPicked(null)}
                  aria-label={t('閉じる', 'Close')}
                >
                  ×
                </button>
                <small>
                  {floors.get(nodes.get(facility.from)!.levelId)?.label} →{' '}
                  {floors.get(nodes.get(facility.to)!.levelId)?.label}
                </small>
                <strong>{facility.names[lang]}</strong>
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
                  onClick={() => setPicked(null)}
                  aria-label={t('閉じる', 'Close')}
                >
                  ×
                </button>
                <small>
                  {floors.get(place.levelId)?.label} · {areaText(place, lang)}
                </small>
                <strong>{place.names[lang]}</strong>
                <span>
                  {place.serviceLineIds
                    ?.map(
                      (id) =>
                        station.lines.find((l) => l.id === id)?.names[lang],
                    )
                    .join(' / ')}
                </span>
                <div>
                  {(['start', 'end'] as const).map((key, i) => (
                    <button
                      key={key}
                      onClick={() => {
                        endpoint(key, place.id)
                        setDrawer(true)
                        setPanel('route')
                      }}
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
            {step >= 0 && path[step] && (
              <div className="walk-hud">
                <button
                  aria-label={t('前の区間', 'Previous segment')}
                  onClick={() => highlight(step - 1)}
                >
                  ‹
                </button>
                <span>
                  <b>
                    {step + 1} / {path.length}
                  </b>{' '}
                  {instruction(path[step], lang)}
                </span>
                <button
                  aria-label={t('案内を進める', 'Advance walkthrough')}
                  disabled={step === path.length - 1}
                  onClick={() => highlight(step + 1)}
                >
                  ›
                </button>
                <button
                  onClick={() => {
                    selectStep(-1)
                    selectFloor(plan ? 0 : null)
                    setReset((r) => r + 1)
                  }}
                >
                  {t('全経路', 'Overview')}
                </button>
              </div>
            )}
            <div className="view-tag">
              {plan ? 'PLAN' : 'AXON'} <b>/</b>{' '}
              {step >= 0 && path[step] && !plan
                ? [
                    ...new Set(
                      [path[step].from, path[step].to].map(
                        (n) => floors.get(n.levelId)!.label,
                      ),
                    ),
                  ].join(' → ')
                : floor === null
                  ? t('全階', 'ALL LEVELS')
                  : shownFloor}
            </div>
            <details className="surround">
              <summary>
                {t('周辺区画 · 接続未確認', 'Surroundings · unverified')}
              </summary>
              <small>
                {t('位置・接続とも未確認', 'Locations and links unverified')}
              </small>
              {station.context.map((b) => (
                <div className="context-block" key={b.id}>
                  <i aria-hidden="true" />
                  {b.names[lang]}
                </div>
              ))}
            </details>
            <div className="zoom">
              <button
                onClick={() => changeZoom(1.2)}
                aria-label={t('拡大', 'Zoom in')}
              >
                ＋
              </button>
              <button
                onClick={() => changeZoom(1 / 1.2)}
                aria-label={t('縮小', 'Zoom out')}
              >
                −
              </button>
              <button
                aria-label={t('視点をリセット', 'Reset view')}
                title={t('視点をリセット', 'Reset view')}
                onClick={resetView}
              >
                ⟲
              </button>
            </div>
          </div>
          <div className="floors">
            <span>{t('階層', 'Floor')}</span>
            {!plan && (
              <button
                aria-pressed={floor === null}
                onClick={() => {
                  selectFloor(null)
                  selectStep(-1)
                  setPicked(null)
                }}
              >
                {t('全階', 'All')}
              </button>
            )}
            {floorLabels.map(([n, label]) => (
              <button
                aria-pressed={floor === n}
                key={n}
                onClick={() => {
                  selectFloor(n)
                  selectStep(-1)
                  setPicked(null)
                  setPlanZoom(1)
                }}
              >
                {label}
              </button>
            ))}
            {!plan && (
              <button
                className="spread"
                aria-pressed={spread}
                onClick={() => setSpread(!spread)}
              >
                {t('階層分解', 'Explode')}
              </button>
            )}
          </div>
          <div className="legend">
            <span>
              <i className="key platform-key" />
              {t('ホーム', 'Platform')}
            </span>
            <span>
              <i className="key hall-key" />
              {t('改札外', 'Outside gates')}
            </span>
            <span>
              <i className="key path-key" />
              {t('経路', 'Route')}
            </span>
            <small>{t('模式図・縮尺なし', 'Schematic · not to scale')}</small>
          </div>
        </section>
        <aside hidden={!drawer}>
          <nav>
            <button
              aria-pressed={panel === 'route'}
              onClick={() => setPanel('route')}
            >
              {t('経路案内', 'Itinerary')}
            </button>
            <button
              aria-pressed={panel === 'layers'}
              onClick={() => setPanel('layers')}
            >
              {t('モデル情報', 'Model guide')}
            </button>
          </nav>
          {panel === 'route' ? (
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
                        value={trip[key]}
                        onChange={(e) => endpoint(key, e.target.value)}
                      >
                        {endpoints.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.names[lang]} · {floors.get(n.levelId)?.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button
                    onClick={() => {
                      setTrip({ start: trip.end, end: trip.start })
                      selectStep(-1)
                      setPicked(null)
                    }}
                  >
                    {t('出発地と到着地を交換', 'Swap endpoints')} ⇅
                  </button>
                </div>
                <label className="lift-mode">
                  <input
                    type="checkbox"
                    checked={lift}
                    onChange={(e) => {
                      setLift(e.target.checked)
                      selectStep(-1)
                    }}
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
                    lift
                      ? '確認済みの段差なし経路がありません。'
                      : 'この区間の経路は未確認です。',
                    lift
                      ? 'No verified step-free route for these endpoints.'
                      : 'No verified route for these endpoints.',
                  )}
                </p>
              )}
            </>
          ) : (
            <Guide
              lang={lang}
              example={example}
              onExample={() => setExample(!example)}
              showSources={() => setDialog('sources')}
            />
          )}
        </aside>
      </div>

      {dialog && (
        <dialog
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onCancel={() => setDialog(null)}
        >
          <div className="dialog-head">
            <h2>
              {dialog === 'sources'
                ? t('参照資料', 'Sources')
                : t('操作説明', 'Controls')}
            </h2>
            <button
              autoFocus
              onClick={() => setDialog(null)}
              aria-label={t('閉じる', 'Close')}
            >
              ×
            </button>
          </div>
          {dialog === 'sources' ? (
            <>
              <p>{t('資料確認日', 'Sources checked')} · 2026-11-21</p>
              {records
                .filter((r) =>
                  [
                    'sk:source:jr-map',
                    'sk:source:metro-access',
                    'sk:source:city-b',
                  ].includes(r.id),
                )
                .map((r) => (
                  <p key={r.id}>
                    <a href={r.url!} target="_blank" rel="noreferrer">
                      {r.publisher} · {r.title} ↗
                    </a>
                    <br />
                    {r.sourceDate ??
                      t('資料日不明', 'Publication date unknown')}
                  </p>
                ))}
            </>
          ) : (
            <p>
              {t(
                'ホームや設備をクリックして詳細を表示。左ドラッグで回転、右または中ドラッグで平行移動、ホイールで拡大・縮小。タッチは１本で回転、２本で移動・拡縮。図をフォーカスして矢印で移動、＋／−で拡縮、Rで視点を戻せます。',
                'Click a platform or facility for details. Drag to orbit. Right or middle drag to pan. Scroll to zoom. On touch, use one finger to rotate or two to pan and pinch. Focus the canvas for arrow-key pan, + / − zoom and R to reset.',
              )}
            </p>
          )}
        </dialog>
      )}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
