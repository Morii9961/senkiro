import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Scene } from './Scene'
import { FloorPlan } from './FloorPlan'
import { planRoute } from './domain/graph'
import type { Language } from './domain/types'
import { floorLabels, floors, nodes, station, sites, inSite } from './model'
import { Guide } from './Guide'
import { exampleService } from './providers/service'
import { createFacilityIndex, ownersOf } from './domain/index'
import { createSearchIndex } from './domain/searchIndex'
import { exits } from '../data/manual/exits'
import { services } from '../data/manual/services'
import { describePlatform } from './domain/describe/platform'
import { describeFacility } from './domain/describe/facilities'
import type { DetailAction } from './domain/describe/types'
import { initialSelection, selectionReducer, targetFromOwner, type SelectionTarget } from './state/selection'
import { parseUrl, serializeUrl } from './state/url'
import { AppHeader } from './ui/controls/AppHeader'
import { FloorControls } from './ui/controls/FloorControls'
import { DetailControl } from './ui/controls/DetailControl'
import { DetailSheet, type SheetHeight } from './ui/panels/DetailSheet'
import { InfoDialog } from './ui/panels/InfoDialog'
import { RoutePanel, instruction, tours } from './ui/panels/RoutePanel'
import { SearchPanel } from './ui/panels/SearchPanel'

const facilityIndex = createFacilityIndex(station, { services, exits })
const searchIndex = createSearchIndex(station, sites)

function targetPlaces(target: SelectionTarget) {
  if (target.kind === 'station' || target.kind === 'line') {
    const owners = ownersOf(station, target)
    return station.places.filter((place) => owners.has(place.id))
  }
  const place = nodes.get(target.id)
  if (place) return [place]
  const link = station.links.find((candidate) => candidate.id === target.id)
  return link ? [nodes.get(link.from)!, nodes.get(link.to)!] : []
}

export function App() {
  const [initial] = useState(() => parseUrl(new URLSearchParams(window.location.search)))
  const [{ selection, hovered }, dispatchSelection] = useReducer(selectionReducer, {
    ...initialSelection,
    selection: initial.selection,
  })
  const clear = () => dispatchSelection({ type: 'clear' })
  const [lang, language] = useState<Language>(initial.lang),
    [dark, theme] = useState(initial.theme === 'dark'),
    [plan, setPlan] = useState(initial.mode === '2d')
  const [floor, selectFloor] = useState<number | null>(() => {
      if (initial.floor !== null || initial.mode === '3d') return initial.floor
      const site = sites.find((entry) => entry.id === initial.site)
      return site ? floors.get(nodes.get(site.anchorId)!.levelId)!.ordinal : 0
    }),
    [spread, setSpread] = useState(false),
    [reset, setReset] = useState(0)
  const [zoom, setZoom] = useState({ tick: 0, factor: 1 }),
    [planZoom, setPlanZoom] = useState(1)
  const [siteId, setSiteId] = useState(initial.site)
  const [eye, setEye] = useState<string | null>(null)
  function interior() {
    if (eye) {
      setEye(null)
      return
    }
    const target =
      (selection?.kind === 'platform'
        ? nodes.get(selection.id)
        : undefined) ??
      (siteId === 'sk:context:whity'
        ? nodes.get('sk:concourse:whity-east')
        : station.places.find(
            (p) => p.kind === 'Platform' && inSite(p, siteId),
          ))
    if (!target) return
    showPassenger(target.id)
  }
  function showPassenger(id: string) {
    selectStep(-1)
    clear()
    selectFloor(null)
    setPlan(false)
    setEye(id)
  }
  const [shell, setShell] = useState(true)
  const site = sites.find((s) => s.id === siteId)
  const siteFloors = floorLabels.filter(
    ([n]) =>
      !siteId ||
      station.places.some(
        (p) => inSite(p, siteId) && floors.get(p.levelId)!.ordinal === n,
      ),
  )
  function visit(id: string | null) {
    setEye(null)
    setSiteId(id)
    clear()
    selectStep(-1)
    setPlanZoom(1)
    const at = sites.find((s) => s.id === id)
    selectFloor(
      plan && at
        ? floors.get(nodes.get(at.anchorId)!.levelId)!.ordinal
        : plan
          ? 0
          : null,
    )
    setReset((r) => r + 1)
  }
  const [trip, setTrip] = useState<{ start: string | null; end: string | null }>(() => {
    const pendingExit = initial.from === null && initial.to !== null && nodes.get(initial.to)?.kind === 'Entrance'
    return {
      start: initial.from ?? (initial.routeDraft || pendingExit ? null : tours[0].start),
      end: initial.to ?? (initial.routeDraft ? null : tours[0].end),
    }
  })
  const exitOrigin = useRef<string | null>(null)
  const panelElement = useRef<HTMLElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [drawer, setDrawer] = useState(
    initial.step >= 0 || initial.stepFreeOnly || initial.from !== null || initial.to !== null || !!initial.routeDraft,
  )
  const tour = tours.findIndex(
    (x) => x.start === trip.start && x.end === trip.end,
  )
  const [routeStep, selectStep] = useState(initial.step),
    [lift, setLift] = useState(initial.stepFreeOnly)
  const [feed, setFeed] = useState(initial.feed)
  const [detail, setDetail] = useState(initial.detail)
  const [sheetHeight, setSheetHeight] = useState<SheetHeight>('half')
  const example = feed === 'demo'
  const [panel, setPanel] = useState<'search' | 'route' | 'layers'>('route'),
    [dialog, setDialog] = useState<'help' | 'sources' | null>(null)
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const result = useMemo(
    () => trip.start && trip.end ? planRoute(station, trip.start, trip.end, { stepFreeOnly: lift }) : null,
    [trip.start, trip.end, lift],
  )
  const path = result && 'steps' in result ? result.steps : []
  const routeDraft = !trip.start || !trip.end
  const step = path[routeStep] ? routeStep : -1

  useEffect(() => {
    document.documentElement.lang = lang
    const url = new URL(window.location.href)
    url.search = serializeUrl({
      site: siteId,
      floor,
      mode: plan ? '2d' : '3d',
      detail,
      selection,
      from: !routeDraft && trip.start === tours[0].start && nodes.get(trip.end!)?.kind !== 'Entrance'
        ? null : trip.start,
      to: !routeDraft && trip.end === tours[0].end ? null : trip.end,
      routeDraft: routeDraft ? true : undefined,
      stepFreeOnly: lift,
      step,
      lang,
      theme: dark ? 'dark' : 'light',
      feed,
    }, url.searchParams).toString()
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [dark, detail, feed, floor, lang, lift, plan, routeDraft, selection, siteId, step, trip.start, trip.end])
  const floorNow = floor ?? 0,
    shownFloor = floorLabels.find((f) => f[0] === floorNow)?.[1]
  function togglePlan(next: boolean) {
    setEye(null)
    setPlan(next)
    clear()
    if (!next && path[step]) selectFloor(null)
    if (next && floor === null)
      selectFloor(
        path[step]
          ? floors.get(path[step].to.levelId)!.ordinal
          : site
            ? floors.get(nodes.get(site.anchorId)!.levelId)!.ordinal
            : 0,
      )
    setPlanZoom(1)
  }
  function changeZoom(factor: number) {
    if (plan) setPlanZoom((v) => Math.max(0.5, Math.min(3, v * factor)))
    else setZoom((v) => ({ tick: v.tick + 1, factor }))
  }
  function highlight(i: number) {
    setEye(null)
    setSiteId(null)
    selectStep(i)
    clear()
    if (path[i])
      selectFloor(plan ? floors.get(path[i].to.levelId)!.ordinal : null)
  }
  function pickTour(i: number) {
    setEye(null)
    setSiteId(null)
    setTrip({ start: tours[i].start, end: tours[i].end })
    clear()
    selectStep(-1)
    selectFloor(plan ? 0 : null)
  }
  function endpoint(which: 'start' | 'end', id: string) {
    setEye(null)
    setSiteId(null)
    setTrip((previous) => ({ ...previous, [which]: id }))
    selectStep(-1)
    clear()
    selectFloor(plan ? floors.get(nodes.get(id)!.levelId)!.ordinal : null)
  }
  function openRoute(which: 'start' | 'end', id: string) {
    endpoint(which, id)
    setDrawer(true)
    setPanel('route')
  }
  function detailAction(kind: DetailAction, target: SelectionTarget) {
    const link = facilityIndex.link(target.id)
    const targetSite = target.kind === 'station'
      ? sites.find((entry) => entry.id === target.id || entry.stationId === target.id)
      : undefined
    if (kind === 'start' || kind === 'end') {
      if (target.kind === 'entrance' && kind === 'end') {
        openRoute('end', target.id)
        setTrip({ start: exitOrigin.current, end: target.id })
      } else {
        openRoute(kind, link ? (kind === 'start' ? link.from : link.to) : target.id)
      }
    } else if (kind === 'through' && link) {
      setEye(null)
      setSiteId(null)
      setTrip({ start: link.from, end: link.to })
      selectStep(0)
      selectFloor(plan ? facilityIndex.levelOf(link.to)!.ordinal : null)
      setDrawer(true)
      setPanel('route')
      clear()
    } else if (kind === 'site' && targetSite) {
      visit(targetSite.id)
      dispatchSelection({ type: 'select', target })
    } else if (kind === 'passenger') {
      if (targetSite) {
        const position = targetSite.id === 'sk:context:whity'
          ? 'sk:concourse:whity-east'
          : station.places.find((place) => place.kind === 'Platform' && inSite(place, targetSite.id))?.id
        if (position) {
          setSiteId(targetSite.id)
          showPassenger(position)
        }
      } else interior()
    } else if (kind === 'floor') {
      const level = facilityIndex.levelOf(target.id)
      if (!level) return
      setEye(null)
      selectFloor(level.ordinal)
      selectStep(-1)
      setPlanZoom(1)
    }
  }
  function inspect(id: string) {
    const target = targetFromOwner(id)
    if (!target) return
    if (target.kind === 'entrance' && selection?.id !== id) {
      exitOrigin.current = selection?.kind === 'platform' ? selection.id
        : selection?.kind === 'gate' ? facilityIndex.gateView(selection.id).outsideSide.id
          : null
    }
    const places = targetPlaces(target)
    const sitePlaces = places.filter((place) => inSite(place, siteId))
    if (siteId && sitePlaces.length === 0) setSiteId(null)
    const visiblePlaces = sitePlaces.length > 0 ? sitePlaces : places
    if (floor !== null && !visiblePlaces.some((place) => floors.get(place.levelId)?.ordinal === floor)) {
      selectFloor(visiblePlaces[0] ? floors.get(visiblePlaces[0].levelId)!.ordinal : null)
    }
    const current = path[step]
    if (current && !visiblePlaces.some((place) =>
      place.levelId === current.from.levelId || place.levelId === current.to.levelId
    )) selectStep(-1)
    setEye(null)
    if (selection?.id !== id) setSheetHeight('half')
    dispatchSelection({ type: 'select', target })
    const viewed = searchIndex.get(id)?.target.id
    if (viewed) setRecent((previous) =>
      previous[0] === viewed ? previous : [viewed, ...previous.filter((key) => key !== viewed)].slice(0, 5),
    )
  }
  function resetView() {
    setEye(null)
    selectStep(-1)
    clear()
    setReset((v) => v + 1)
    setPlanZoom(1)
  }
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (event.key === 'Escape' && !dialog) dispatchSelection({ type: 'clear' })
      if (event.key !== '/' || dialog || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true]')) return
      event.preventDefault()
      setDrawer(true)
      setPanel('search')
      searchInput.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog])
  const place = selection ? nodes.get(selection.id) : null
  const objectDetail = useMemo(() => {
    if (!selection) return null
    return selection.kind === 'platform'
      ? describePlatform(facilityIndex, selection.id, { lang, example: example ? exampleService.updates[0] : null })
      : describeFacility(station, facilityIndex, selection, lang)
  }, [example, lang, selection])
  useEffect(() => {
    if (selection) panelElement.current?.scrollTo(0, 0)
  }, [selection])
  const selectionPlaces = useMemo(() => selection ? targetPlaces(selection) : [], [selection])
  const differentFloor = floor !== null && selectionPlaces.length > 0 &&
    !selectionPlaces.some((entry) => floors.get(entry.levelId)?.ordinal === floor)
  return (
    <main className={dark ? 'app dark' : 'app'}>
      <AppHeader
        {...{ lang, dark, drawer }}
        onDrawer={() => setDrawer(!drawer)}
        onHelp={() => setDialog('help')}
        onTheme={() => theme(!dark)}
        onLanguage={() => language(lang === 'ja' ? 'en' : 'ja')}
      />
      <div className={'workspace' + (drawer || objectDetail ? ' with-drawer' : '') +
        (objectDetail ? ' with-detail' : '')} data-sheet-height={objectDetail ? sheetHeight : undefined}>
        <section className="viewer">
          <div className="viewer-bar">
            <strong>
              <i className="status-dot" />
              {site?.names[lang] ?? t('大阪・梅田', 'Osaka / Umeda')}
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
                siteId={siteId}
                floor={floorNow}
                lang={lang}
                steps={step >= 0 || drawer ? path : []}
                active={step}
                zoom={planZoom}
                example={example}
              />
            ) : (
              <Scene
                {...{
                  lang,
                  dark,
                  floor,
                  spread,
                  step,
                  reset,
                  zoom,
                  example,
                  detail,
                  siteId,
                  shell,
                  eye,
                  selection,
                  hovered,
                }}
                route={path}
                showRoute={step >= 0 || drawer}
                onInspect={inspect}
                onClear={clear}
                onHover={(target) => dispatchSelection({ type: 'hover', target })}
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
            {!plan && differentFloor && (
              <div className="eye-hint">
                {t('対象は別の階にあります。', 'This feature is on another floor.')}{' '}
                <button onClick={() => inspect(selection!.id)}>{t('移動', 'Go to floor')}</button>
              </div>
            )}
            {eye && (
              <div className="eye-hint">
                {nodes.get(eye)!.names[lang]} ·{' '}
                {t('ドラッグで見回す', 'Drag to look around')}
                <br />
                {t('内装はイメージです。', 'Illustrative interior finishes.')}
              </div>
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
              {plan ? 'PLAN' : eye ? 'INTERIOR' : 'AXON'} <b>/</b>{' '}
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
                {site
                  ? site.names[lang]
                  : t('駅・地下街を選択', 'Stations & arcades')}
              </summary>
              <div className="site-list">
                {[null, ...sites].map((s) => (
                  <button
                    key={s?.id ?? 'all'}
                    aria-pressed={siteId === (s?.id ?? null)}
                    onClick={(e) => {
                      visit(s?.id ?? null)
                      e.currentTarget.closest('details')!.open = false
                    }}
                  >
                    {s?.names[lang] ?? t('大阪・梅田 全域', 'Entire district')}
                    <span>{s ? (s.stationId ? '▤' : '◇') : '⌖'}</span>
                  </button>
                ))}
              </div>
            </details>
            {!plan && <DetailControl lang={lang} value={detail} onChange={setDetail} />}
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
          <FloorControls
            {...{ lang, plan, floor, siteFloors, eye, shell, spread, interior }}
            onFloor={(next) => {
              setEye(null)
              selectFloor(next)
              selectStep(-1)
              if (next !== null) setPlanZoom(1)
            }}
            onShell={() => setShell(!shell)}
            onSpread={() => setSpread(!spread)}
          />
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
            <small>
              {t('内装・寸法は模式表現', 'Schematic layout and finishes')}
            </small>
          </div>
        </section>
        <aside ref={panelElement} hidden={!drawer && !objectDetail}>
          {objectDetail && <DetailSheet spec={objectDetail} lang={lang} height={sheetHeight}
            onHeight={setSheetHeight} onClose={clear} onSelect={(target) => inspect(target.id)} onAction={detailAction} />}
          {drawer && (
            <>
              <nav>
                <button aria-pressed={panel === 'search'} onClick={() => setPanel('search')}>
                  {t('探す', 'Search')}
                </button>
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
              {panel === 'search' ? (
                <SearchPanel lang={lang} input={searchInput}
                  search={(query) => searchIndex.find(query, { floor, site: siteId })}
                  recent={recent.flatMap((id) => searchIndex.get(id) ?? [])}
                  presets={tours} onSelect={inspect} onEndpoint={openRoute}
                  onPreset={(index) => { pickTour(index); setPanel('route') }}
                />
              ) : panel === 'route' ? (
                <RoutePanel
                  {...{ lang, tour, trip, step, lift, result, pickTour, endpoint, highlight }}
                  onFind={() => { clear(); setPanel('search') }}
                  onClear={() => {
                    setTrip({ start: null, end: null })
                    selectStep(-1)
                    clear()
                  }}
                  onSwap={() => {
                    setTrip({ start: trip.end, end: trip.start })
                    selectStep(-1)
                    clear()
                  }}
                  onLiftChange={(on) => {
                    setLift(on)
                    selectStep(-1)
                  }}
                />
              ) : (
                <Guide
                  lang={lang}
                  selection={place ?? null}
                  onSelect={inspect}
                  onClear={clear}
                  example={example}
                  onExample={() => setFeed(example ? 'off' : 'demo')}
                  showSources={() => setDialog('sources')}
                />
              )}
            </>
          )}
        </aside>
      </div>

      {dialog && <InfoDialog lang={lang} dialog={dialog} close={() => setDialog(null)} />}
    </main>
  )
}
