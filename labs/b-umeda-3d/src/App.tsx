import { nameIn } from './domain/language'
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Scene } from './Scene'
import { FloorPlan } from './FloorPlan'
import { planRoute } from './domain/graph'
import type { Language } from './domain/types'
import { floorLabels, floors, nodes, station, sites, inSite } from './model'
import { Guide } from './Guide'
import { exampleService } from './providers/service'
import { availableFeed, loadOfficialTimetable, type OfficialTimetable } from './providers/timetable'
import { createFacilityIndex, ownersOf } from './domain/index'
import { createSearchIndex } from './domain/searchIndex'
import { exits } from '../data/manual/exits'
import { services } from '../data/manual/services'
import { describePlatform } from './domain/describe/platform'
import { describeFacility } from './domain/describe/facilities'
import { describeTrain } from './domain/describe/train'
import type { DetailAction } from './domain/describe/types'
import { initialSelection, selectionReducer, targetFromOwner, type SelectionTarget } from './state/selection'
import { parseUrl, serializeUrl } from './state/url'
import { AppHeader } from './ui/controls/AppHeader'
import { FloorControls } from './ui/controls/FloorControls'
import { FloorChangeBanner } from './ui/controls/FloorChangeBanner'
import { DetailSheet, type SheetHeight } from './ui/panels/DetailSheet'
import { InfoDialog } from './ui/panels/InfoDialog'
import { RoutePanel, instruction, tours } from './ui/panels/RoutePanel'
import { SearchPanel } from './ui/panels/SearchPanel'
import { SimBanner, TrainPanel } from './ui/panels/TrainPanel'
import { vehicleSeries } from '../data/manual/vehicles'
import type { DayType } from './timetable/time'
import { startTrainClock, trainClockSeconds, type TrainSpeed } from './trains/clock'
import { buildTrainPlans, positionAt, type TrainPhase } from './trains/simulate'
import { deriveTrackPaths } from './trains/trackPaths'

const facilityIndex = createFacilityIndex(station, { services, exits })
const searchIndex = createSearchIndex(station, sites)
const trackPaths = deriveTrackPaths(station)

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
  const [following, setFollowing] = useState<string | null>(null)
  const clear = () => {
    dispatchSelection({ type: 'clear' })
    setFollowing(null)
  }
  const [lang, language] = useState<Language>(initial.lang),
    [dark, theme] = useState(initial.theme === 'dark'),
    [plan, setPlan] = useState(initial.mode === '2d')
  const [floor, selectFloor] = useState<number | null>(initial.floor),
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
    initial.step >= 0 || initial.stepFreeOnly || initial.from !== null || initial.to !== null || !!initial.routeDraft ||
      initial.feed === 'timetable-sim',
  )
  const tour = tours.findIndex(
    (x) => x.start === trip.start && x.end === trip.end,
  )
  const [routeStep, selectStep] = useState(initial.step),
    [lift, setLift] = useState(initial.stepFreeOnly)
  const [feedKind, setFeedKind] = useState(initial.feed)
  const [officialTimetable, setOfficialTimetable] = useState<OfficialTimetable | null>()
  const feed = useMemo(() => availableFeed(feedKind, officialTimetable), [feedKind, officialTimetable])
  const [trainClock, setTrainClock] = useState(startTrainClock)
  const [trainDay, setTrainDay] = useState<DayType>('weekday')
  const [sheetHeight, setSheetHeight] = useState<SheetHeight>('half')
  const example = feed.kind === 'demo'
  const trainPlans = useMemo(() => feed.kind === 'demo'
    ? buildTrainPlans(feed.dataset.records, trackPaths, vehicleSeries, { day: trainDay, serviceDate: null, feedKind: 'demo' })
    : [], [feed, trainDay])
  const selectedTrain = selection?.kind === 'train' ? trainPlans.find(({ id }) => id === selection.id) : undefined
  const [trainStage, setTrainStage] = useState<{ id: string; phase: TrainPhase } | null>(null)
  useEffect(() => {
    if (selection?.kind !== 'train') return
    if (!selectedTrain) {
      clear()
      return
    }
    const refresh = () => {
      const state = positionAt(selectedTrain, trainClockSeconds(trainClock))
      if (state) setTrainStage((old) => old?.id === selectedTrain.id && old.phase === state.phase
        ? old : { id: selectedTrain.id, phase: state.phase })
      else clear()
    }
    refresh()
    const timer = window.setInterval(refresh, 200)
    return () => window.clearInterval(timer)
  }, [selection, selectedTrain, trainClock])
  const [panel, setPanel] = useState<'search' | 'route' | 'layers' | 'trains'>(initial.feed === 'timetable-sim' ? 'trains' : 'route'),
    [dialog, setDialog] = useState<'help' | 'sources' | null>(null)
  const wantsTimetable = panel === 'trains' || selection?.kind === 'platform'
  useEffect(() => {
    if (!wantsTimetable || officialTimetable !== undefined) return
    const request = new AbortController()
    void loadOfficialTimetable(request.signal).then((dataset) => {
      if (!request.signal.aborted) setOfficialTimetable(dataset)
    }).catch(() => {
      if (!request.signal.aborted) setOfficialTimetable(null)
    })
    return () => request.abort()
  }, [officialTimetable, wantsTimetable])
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  function changeTrainMode(mode: 'off' | 'demo' | 'timetable-sim') {
    if (mode === feedKind) return
    if (mode !== 'demo' && selection?.kind === 'train') clear()
    if (mode === 'demo') setTrainClock(startTrainClock())
    setFeedKind(mode)
  }
  function changeTrainSpeed(speed: TrainSpeed) {
    const now = performance.now()
    setTrainClock((clock) => ({ startedAt: now, seconds: trainClockSeconds(clock, now), speed }))
  }
  const result = useMemo(
    () => trip.start && trip.end ? planRoute(station, trip.start, trip.end, { stepFreeOnly: lift }) : null,
    [trip.start, trip.end, lift],
  )
  const path = result && 'steps' in result ? result.steps : []
  const routeDraft = !trip.start || !trip.end
  const step = path[routeStep] ? routeStep : -1
  const currentStep = path[step]
  const fromLevel = currentStep && floors.get(currentStep.from.levelId)
  const toLevel = currentStep && floors.get(currentStep.to.levelId)

  useEffect(() => {
    document.documentElement.lang = lang
    const url = new URL(window.location.href)
    url.search = serializeUrl({
      site: siteId,
      floor,
      mode: plan ? '2d' : '3d',
      detail: initial.detail,
      selection: selection?.kind === 'train' ? null : selection,
      from: !routeDraft && trip.start === tours[0].start && nodes.get(trip.end!)?.kind !== 'Entrance'
        ? null : trip.start,
      to: !routeDraft && trip.end === tours[0].end ? null : trip.end,
      routeDraft: routeDraft ? true : undefined,
      stepFreeOnly: lift,
      step,
      lang,
      theme: dark ? 'dark' : 'light',
      feed: feedKind,
    }, url.searchParams).toString()
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [dark, feedKind, floor, initial.detail, lang, lift, plan, routeDraft, selection, siteId, step, trip.start, trip.end])
  const selectionPlaces = useMemo(() => selectedTrain ? [nodes.get(selectedTrain.track.platformId)!]
    : selection ? targetPlaces(selection) : [], [selectedTrain, selection])
  const selectionFloors = new Set(selectionPlaces.map((place) => floors.get(place.levelId)!.ordinal))
  const routeFloors = new Set(step >= 0 || drawer
    ? path.flatMap(({ from, to }) => [floors.get(from.levelId)!.ordinal, floors.get(to.levelId)!.ordinal])
    : [])
  const planAnchor = selectionPlaces[0] ?? currentStep?.to ?? (site ? nodes.get(site.anchorId) : null)
  const floorNow = floor ?? (planAnchor ? floors.get(planAnchor.levelId)!.ordinal : 0),
    shownFloor = floorLabels.find((f) => f[0] === floorNow)?.[1]
  function togglePlan(next: boolean) {
    if (next === plan) return
    setEye(null)
    setPlan(next)
    if (next) setFollowing(null)
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
    if (kind === 'follow') {
      if (target.kind === 'train' && !plan && !eye) {
        setFollowing((old) => old === target.id ? null : target.id)
      }
      return
    }
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
    const train = trainPlans.find((candidate) => candidate.id === id)
    if (train && positionAt(train, trainClockSeconds(trainClock))) {
      if (selection?.id !== id) {
        setSheetHeight('half')
        setFollowing(null)
      }
      dispatchSelection({ type: 'select', target: { kind: 'train', id } })
      return
    }
    const target = targetFromOwner(id)
    if (!target) return
    setFollowing(null)
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
      if (event.key === 'Escape' && !dialog) clear()
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
    if (selection.kind === 'train') {
      if (!selectedTrain) return null
      const spec = describeTrain(facilityIndex, selectedTrain,
        trainStage?.id === selectedTrain.id ? trainStage.phase : null, lang, following === selectedTrain.id)
      return plan ? { ...spec, actions: [] } : spec
    }
    return selection.kind === 'platform'
      ? describePlatform(facilityIndex, selection.id, {
        lang,
        example: example ? exampleService.updates[0] : null,
        demoRecords: trainPlans.filter(({ track }) => track.platformId === selection.id).map(({ record }) => record),
      })
      : describeFacility(station, facilityIndex, selection, lang)
  }, [example, following, lang, plan, selectedTrain, selection, trainPlans, trainStage])
  useEffect(() => {
    if (selection) panelElement.current?.scrollTo(0, 0)
  }, [selection])
  const differentFloor = floor !== null && selectionFloors.size > 0 && !selectionFloors.has(floor)
  return (
    <main className={dark ? 'app dark' : 'app'}>
      <AppHeader
        {...{ lang, dark, drawer, plan }}
        onDrawer={() => setDrawer(!drawer)}
        onHelp={() => setDialog('help')}
        onTheme={() => theme(!dark)}
        onLanguage={language}
        onPlan={togglePlan}
      />
      <div className={'workspace' + (drawer || objectDetail ? ' with-drawer' : '') +
        (objectDetail ? ' with-detail' : '')} data-sheet-height={objectDetail ? sheetHeight : undefined}>
        <section className="viewer">
          <div className="stage">
            {plan ? (
              <FloorPlan
                siteId={siteId}
                floor={floorNow}
                lang={lang}
                steps={step >= 0 || drawer ? path : []}
                active={step}
                zoom={planZoom}
                reset={reset}
                example={example}
                selection={selection}
                onInspect={inspect}
                onClear={clear}
              />
            ) : (
              <Scene
                {...{
                  lang,
                  dark,
                  floor,
                  step,
                  reset,
                  zoom,
                  example,
                  siteId,
                  eye,
                  selection,
                  hovered,
                  trainClock,
                  trainPlans,
                  following,
                }}
                spread={false}
                shell
                route={path}
                showRoute={step >= 0 || drawer}
                onInspect={inspect}
                onStopFollowing={() => setFollowing(null)}
                onClear={clear}
                onHover={(target) => dispatchSelection({ type: 'hover', target })}
                onReset={resetView}
                onFallback={() => togglePlan(true)}
              />
            )}
            {example && (
              <div className="sample-tag sim-banner" data-testid="sim-banner">
                <SimBanner lang={lang} /> · {t('サンプルモード', 'EXAMPLE MODE', '示例模式')} ·{' '}
                {t('梅田 1番線', 'Umeda platform 1', '梅田 1 号站台')} +
                {exampleService.updates[0].delayMinutes} min · SENKIRO Lab ·{' '}
                {exampleService.updates[0].observedAt}
              </div>
            )}
            {differentFloor && (
              <div className="eye-hint">
                {t('対象は別の階にあります。', 'This feature is on another floor.', '此设施位于其他楼层。')}{' '}
                <button onClick={() => {
                  if (selectedTrain) selectFloor(floors.get(nodes.get(selectedTrain.track.platformId)!.levelId)!.ordinal)
                  else inspect(selection!.id)
                }}>{t('移動', 'Go to floor', '前往该层')}</button>
              </div>
            )}
            {eye && (
              <div className="eye-hint">
                {nameIn(nodes.get(eye)!.names, lang)} ·{' '}
                {t('ドラッグで見回す', 'Drag to look around', '拖动环顾')}
                <br />
                {t('内装はイメージです。', 'Illustrative interior finishes.', '内装为示意。')}
              </div>
            )}
            {!plan && fromLevel && toLevel && fromLevel.ordinal !== toLevel.ordinal && (
              <FloorChangeBanner key={currentStep.link.id + ':' + currentStep.from.id} lang={lang}
                down={toLevel.ordinal < fromLevel.ordinal} label={toLevel.label} />
            )}
            {step >= 0 && path[step] && (
              <div className="walk-hud">
                <button
                  aria-label={t('前の区間', 'Previous segment', '上一段')}
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
                  aria-label={t('案内を進める', 'Advance walkthrough', '继续导览')}
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
                  {t('全経路', 'Overview', '全程')}
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
                : !plan && floor === null
                  ? t('全階', 'ALL LEVELS', '全部楼层')
                  : shownFloor}
            </div>
            <details className="surround">
              <summary>
                {site
                  ? nameIn(site.names, lang)
                  : t('駅・地下街を選択', 'Stations & arcades', '选择车站或地下街')}
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
                    {nameIn(s?.names, lang) ?? t('大阪・梅田 全域', 'Entire district', '大阪·梅田全区')}
                    <span>{s ? (s.stationId ? '▤' : '◇') : '⌖'}</span>
                  </button>
                ))}
              </div>
            </details>
            <div className="stage-tools">
              <FloorControls
                {...{ lang, plan, siteFloors, selectionFloors, routeFloors }}
                floor={plan ? floorNow : floor}
                onFloor={(next) => {
                  setEye(null)
                  selectFloor(next)
                  selectStep(-1)
                  if (next !== null) setPlanZoom(1)
                }}
              />
              <div className="zoom">
                <button onClick={() => changeZoom(1.2)} aria-label={t('拡大', 'Zoom in', '放大')}>＋</button>
                <button onClick={() => changeZoom(1 / 1.2)} aria-label={t('縮小', 'Zoom out', '缩小')}>−</button>
                <button
                  aria-label={t('視点をリセット', 'Reset view', '重置视角')}
                  title={t('視点をリセット', 'Reset view', '重置视角')}
                  onClick={resetView}
                >
                  ⟲
                </button>
              </div>
            </div>
          </div>
        </section>
        <aside ref={panelElement} hidden={!drawer && !objectDetail}>
          {objectDetail && <DetailSheet spec={objectDetail} lang={lang} height={sheetHeight}
            officialTimetable={example ? null : officialTimetable}
            onHeight={setSheetHeight} onClose={clear} onSelect={(target) => inspect(target.id)} onAction={detailAction} />}
          {drawer && (
            <>
              <nav>
                <button aria-pressed={panel === 'search'} onClick={() => setPanel('search')}>
                  {t('探す', 'Search', '搜索')}
                </button>
                <button
                  aria-pressed={panel === 'route'}
                  onClick={() => setPanel('route')}
                >
                  {t('経路案内', 'Itinerary', '路线导览')}
                </button>
                <button
                  aria-pressed={panel === 'layers'}
                  onClick={() => setPanel('layers')}
                >
                  {t('モデル情報', 'Model guide', '模型信息')}
                </button>
                <button aria-pressed={panel === 'trains'} onClick={() => setPanel('trains')}>
                  {t('列車', 'Trains', '列车')}
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
              ) : panel === 'trains' ? (
                <TrainPanel lang={lang} feed={feed} clock={trainClock} day={trainDay}
                  timetable={officialTimetable}
                  onMode={changeTrainMode} onDay={setTrainDay} onSpeed={changeTrainSpeed} />
              ) : (
                <Guide
                  lang={lang}
                  selection={place ?? null}
                  onSelect={inspect}
                  onClear={clear}
                  example={example}
                  onExample={() => changeTrainMode(example ? 'off' : 'demo')}
                  showSources={() => setDialog('sources')}
                />
              )}
            </>
          )}
        </aside>
      </div>

      {dialog && <InfoDialog lang={lang} dialog={dialog} close={() => setDialog(null)} />}
      <div className="selection-announcement" data-selection-announcement="" aria-live="polite" aria-atomic="true">
        {objectDetail ? t(objectDetail.title + 'を選択', 'Selected ' + objectDetail.title, '已选择 ' + objectDetail.title) : ''}
      </div>
    </main>
  )
}
