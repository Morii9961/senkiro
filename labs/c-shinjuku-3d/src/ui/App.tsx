import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_ROUTES } from '../domain/demo';
import { floorSequence, floorsOf, ordinalByLevel } from '../domain/floors';
import { bindOverlay, worstStatus, type OverlayResult, type RunningStatus } from '../domain/overlay';
import { findRoute, type RouteMode, type RouteResult } from '../domain/route';
import { createExampleOverlayProvider } from '../providers/exampleOverlayProvider';
import { createOdptOverlayProvider } from '../providers/odptOverlayProvider';
import { loadStationData } from '../providers/stationDataProvider';
import { Icon } from './atoms';
import { FloorPicker } from './FloorPicker';
import { LANGS, makeT, type Lang, type StrKey } from './i18n';
import { makeNamer, pickName } from './naming';
import { FacilityCard, hasCard } from './panels/FacilityCard';
import { OpsPanel, type OpsMode } from './panels/OpsPanel';
import { DisplayPanel, HelpDialog, InfoPanel } from './panels/OtherPanels';
import { RoutePanel, legGlyph, legText, type RouteChoice } from './panels/RoutePanel';
import { Plan2D } from './Plan2D';
import type { RenderStats, SceneHandle } from './Scene3D';
import { buildLabels, routePoints, type LabelChip, type ViewOptions } from './scene/build';
import { trackRange } from './scene/labels';
import { SCENE_THEMES } from './sceneTheme';
import { loadTimetableData } from '../providers/timetableProvider';
import { parseServiceTime, serviceClockAt, type CalendarDayType } from '../timetable/time';
import { demoClock, nowClock, rebase, type SimClock } from '../trains/clock';
import { buildTrainPlans, type TrainPlan } from '../trains/simulate';
import { NO_FILTER, TrainBar, TrainCard, TrainSection, trainPasses, type TrainFilter } from './trains/TrainUi';
import { levelY } from './scene/prims';
import type { ThemeName } from './theme';
import { webgl2Available } from './webgl';

// three.js is most of the bundle. It is loaded on demand so that the page
// frame, the panels and the 2D plans do not wait for it.
const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })));

/** If the 3D view cannot start (chunk failed to load, WebGL context lost for good), fall back to 2D. */
class SceneBoundary extends Component<{ onFail(): void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Tab = 'route' | 'display' | 'ops' | 'info';
type ViewMode = '3d' | '2d';
/** Which floors are shown: all of them, those the route passes, or one. */
type FloorMode = 'all' | 'route' | number;

const params = new URLSearchParams(window.location.search);

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const fromUrl = params.get(key);
  if (fromUrl && (allowed as readonly string[]).includes(fromUrl)) return fromUrl as T;
  try {
    const v = window.localStorage.getItem(`senkiro-lab-c:${key}`);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    /* storage may be unavailable; the fallback is fine */
  }
  return fallback;
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(`senkiro-lab-c:${key}`, value);
  } catch {
    /* ignore */
  }
}

const DEMO_LABELS: StrKey[] = ['demo1', 'demo2', 'demo3'];

export function App() {
  const { model, graph, sources } = useMemo(loadStationData, []);
  const providers = useMemo(() => ({ example: createExampleOverlayProvider(), odpt: createOdptOverlayProvider(model) }), [model]);

  const [lang, setLang] = useState<Lang>(() => stored('lang', ['ja', 'en', 'zh'] as const, navigator.language.startsWith('zh') ? 'zh' : navigator.language.startsWith('ja') ? 'ja' : 'en'));
  const [theme, setTheme] = useState<ThemeName>(() =>
    stored('theme', ['light', 'dark'] as const, window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const [wantedView, setViewMode] = useState<ViewMode>(() => stored('view', ['3d', '2d'] as const, '3d'));
  const [no3d, setNo3d] = useState(() => !webgl2Available());
  const viewMode: ViewMode = no3d ? '2d' : wantedView;
  const [tab, setTab] = useState<Tab>('route');
  const [helpOpen, setHelpOpen] = useState(false);
  const [panelOpen, setPanelOpenState] = useState(() => stored('panel', ['open', 'closed'] as const, 'open') === 'open');
  const setPanelOpen = (open: boolean) => {
    setPanelOpenState(open);
    remember('panel', open ? 'open' : 'closed');
  };

  const [floorMode, setFloorMode] = useState<FloorMode>('all');
  const [explode, setExplode] = useState(0.3);
  const [shell, setShell] = useState(0.1);
  const [ghostOthers, setGhostOthers] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showVerticals, setShowVerticals] = useState(true);
  const [showBlocks, setShowBlocks] = useState(true);
  const [animate, setAnimate] = useState(() => params.get('motion') !== 'off' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [mode, setMode] = useState<RouteMode>('default');
  const [focusLeg, setFocusLeg] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [opsMode, setOpsMode] = useState<OpsMode>('off');
  const [opsResult, setOpsResult] = useState<OverlayResult | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsTick, setOpsTick] = useState(0);
  const [stats, setStats] = useState<RenderStats | null>(null);

  // --- train simulation: a timetable (or, until one is handed over, the demo fixture) and a clock ---
  const timetable = useMemo(loadTimetableData, []);
  const [trainsOn, setTrainsOn] = useState(() => params.get('trains') !== 'off');
  const [dayType, setDayType] = useState<CalendarDayType>(() => serviceClockAt(new Date()).dayType);
  const [clock, setClockState] = useState<SimClock>(() => {
    const at = parseServiceTime(params.get('simtime'));
    return at == null ? nowClock() : demoClock(at, params.get('simplay') === '1', Number(params.get('simrate')) || 1);
  });
  const clockRef = useRef(clock);
  const setClock = useCallback((c: SimClock) => {
    clockRef.current = c;
    setClockState(c);
  }, []);
  const [trainFilter, setTrainFilter] = useState<TrainFilter>(NO_FILTER);
  const [hiddenTrains, setHiddenTrains] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const trainPlans = useMemo(() => buildTrainPlans(model, timetable.records, { dayType }), [model, timetable, dayType]);
  const lineColor = useMemo(() => new Map(model.railLines.map((l) => [l.id, l.displayColor])), [model]);
  const trainShown = useCallback((p: TrainPlan) => !hiddenTrains.has(p.id) && trainPasses(p, trainFilter), [hiddenTrains, trainFilter]);
  const selectedPlan = selectedTrain ? (trainPlans.plans.find((p) => p.id === selectedTrain) ?? null) : null;

  const sceneRef = useRef<SceneHandle>(null);
  const t = useMemo(() => makeT(lang), [lang]);
  const namer = useMemo(() => makeNamer(model, lang, t), [model, lang, t]);
  // the model has a theme of its own; the interface theme only chooses which one
  const sceneTheme = SCENE_THEMES[theme];
  const palette = sceneTheme.palette;

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    document.documentElement.dataset.theme = theme;
    remember('lang', lang);
    remember('theme', theme);
  }, [lang, theme]);

  // Escape closes whatever floats on top: the help dialog, then the card, then the step focus.
  useEffect(() => {
    if (!helpOpen && selectedId === null && selectedTrain === null && focusLeg === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (helpOpen) setHelpOpen(false);
      else if (selectedTrain !== null) setSelectedTrain(null);
      else if (selectedId !== null) setSelectedId(null);
      else setFocusLeg(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, selectedId, focusLeg]);

  // --- floors ---------------------------------------------------------------------------
  const floors = useMemo(() => floorsOf(model), [model]);
  const ordinals = useMemo(() => ordinalByLevel(model), [model]);

  // --- route ----------------------------------------------------------------------------
  const choices = useMemo<RouteChoice[]>(() => {
    const out: RouteChoice[] = [];
    const sep = lang === 'en' ? ', ' : '・';
    for (const a of model.areas) {
      if (a.kind !== 'platform') continue;
      const lines = namer.linesOf(a).map((l) => pickName(l.names, lang) ?? '');
      out.push({ id: a.id, group: 'platform', label: `${t('platformTitle', { n: trackRange(a.tracks.map((x) => x.number)) })}　${lines.join(sep)}` });
    }
    for (const g of model.gates) {
      if (g.sides.some((s) => 'blockId' in s)) continue; // the far side is outside the verified model
      out.push({ id: g.id, group: 'gate', label: `${namer.name(g.id)}（${namer.level(g.levelId)}）${g.direction === 'exit-only' ? ` ${t('exitOnly')}` : ''}` });
    }
    for (const e of model.entrances) out.push({ id: e.id, group: 'entrance', label: `${namer.name(e.id)}（${namer.level(e.levelId)}）` });
    return out;
  }, [model, namer, t, lang]);

  const result = useMemo<RouteResult | null>(
    () => (fromId && toId && fromId !== toId ? findRoute(graph, fromId, toId, { mode }) : null),
    [graph, fromId, toId, mode],
  );
  const route = result?.found ? result : null;
  const zoneOf = useCallback((id: string) => model.areas.find((a) => a.id === id)?.fareZone, [model]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const routePts = useMemo(() => (route ? routePoints(route, nodeById, model) : []), [route, nodeById, model]);

  // a new route starts unfocused; a route that disappears takes the "route floors" mode with it
  useEffect(() => {
    setFocusLeg(null);
    if (!route) setFloorMode((m) => (m === 'route' ? 'all' : m));
  }, [route]);

  const runDemo = (id: string) => {
    const d = DEMO_ROUTES.find((x) => x.id === id);
    if (!d) return;
    setFromId(d.fromNodeId);
    setToId(d.toNodeId);
    setMode(d.mode);
    setFloorMode('all');
    setSelectedId(null);
    setTab('route');
  };
  const demos = DEMO_ROUTES.map((d, i) => ({
    id: d.id,
    label: t(DEMO_LABELS[i] ?? 'demo1'),
    active: d.fromNodeId === fromId && d.toNodeId === toId && d.mode === mode,
  }));

  // --- operations overlay -----------------------------------------------------------------
  useEffect(() => {
    if (opsMode === 'off') {
      setOpsResult(null);
      setOpsLoading(false);
      return;
    }
    let live = true;
    setOpsLoading(true);
    void providers[opsMode].getSnapshot().then((r) => {
      if (!live) return;
      setOpsResult(r);
      setOpsLoading(false);
    });
    return () => {
      live = false;
    };
  }, [opsMode, opsTick, providers]);

  const bound = useMemo(() => (opsResult?.status === 'ok' ? bindOverlay(model, opsResult.snapshot) : null), [model, opsResult]);
  const platformStatus = useMemo(() => {
    if (!bound) return null;
    const byPlatform = new Map<string, RunningStatus>();
    for (const area of model.areas) {
      if (area.kind !== 'platform') continue;
      const statuses = bound.tracks.filter((tr) => tr.platformId === area.id).flatMap((tr) => tr.statuses);
      if (statuses.length > 0) byPlatform.set(area.id, worstStatus(statuses));
    }
    return byPlatform;
  }, [bound, model]);
  const synthetic = bound?.snapshot.isSynthetic ?? false;

  // --- what is shown --------------------------------------------------------------------------
  const focusOrdinals = useMemo<ReadonlySet<number> | null>(() => {
    if (route && focusLeg !== null) {
      const leg = route.legs[focusLeg];
      if (leg) return new Set(floorSequence(leg.levelIds, ordinals));
    }
    if (floorMode === 'route') return route ? new Set(floorSequence(route.levelSequence, ordinals)) : null;
    if (typeof floorMode === 'number') return new Set([floorMode]);
    return null;
  }, [route, focusLeg, floorMode, ordinals]);

  /** The one floor the 2D plan shows. */
  const planOrdinal = useMemo(() => {
    if (route && focusLeg !== null) {
      const leg = route.legs[focusLeg];
      const o = leg ? ordinals.get(leg.levelIds[0]!) : undefined;
      if (o !== undefined) return o;
    }
    if (typeof floorMode === 'number') return floorMode;
    if (route) return ordinals.get(route.levelSequence[0]!) ?? 0;
    return floors.some((f) => f.ordinal === 0) ? 0 : (floors[0]?.ordinal ?? 0);
  }, [route, focusLeg, floorMode, ordinals, floors]);

  const view = useMemo<ViewOptions>(
    () => ({ explode, focusOrdinals, ghostOthers, shellOpacity: shell, showVerticals, showBlocks, palette, route, focusLeg, selectedId, platformStatus }),
    [explode, focusOrdinals, ghostOthers, shell, showVerticals, showBlocks, palette, route, focusLeg, selectedId, platformStatus],
  );
  const lineChip = useCallback(
    (railLineId: string): LabelChip | null => {
      const line = model.railLines.find((l) => l.id === railLineId);
      return line ? { text: pickName(line.names, lang) ?? '', color: line.displayColor } : null;
    },
    [model, lang],
  );
  const labels = useMemo(
    () => buildLabels(model, view, namer.name, lineChip, { unverified: t('unverified'), start: t('from'), goal: t('to') }, routePts),
    [model, view, namer, lineChip, t, routePts],
  );

  // Only things a passenger asks about open a card; halls and corridors do not.
  const select = useCallback(
    (id: string | null) => {
      setSelectedTrain(null);
      setSelectedId(id !== null && hasCard(model, id) ? id : null);
    },
    [model],
  );
  const selectTrain = useCallback((planId: string) => {
    setSelectedId(null);
    setSelectedTrain(planId);
  }, []);
  const sceneTrains = useMemo(
    () => (trainsOn ? { plans: trainPlans.plans, clock: clockRef, lineColor, shown: trainShown, selectedId: selectedTrain, onSelect: selectTrain } : null),
    [trainsOn, trainPlans, lineColor, trainShown, selectedTrain, selectTrain],
  );
  const focusTrain = (p: TrainPlan) => {
    const level = model.levels.find((l) => l.id === p.line.levelId);
    if (!level) return;
    const y = levelY(level, explode);
    const [a0, a1] = [p.stopAt - p.length / 2, p.stopAt + p.length / 2];
    const c = p.line.centre;
    sceneRef.current?.focusBox(p.line.axis === 'x' ? { min: [a0, y, c - 2], max: [a1, y + 1, c + 2] } : { min: [c - 2, y, a0], max: [c + 2, y + 1, a1] });
  };
  const canRoute = selectedId !== null && choices.some((c) => c.id === selectedId);

  const pickFloor = (m: FloorMode) => {
    setFocusLeg(null);
    setFloorMode(m);
  };
  const stepTo = (index: number | null) => {
    setFocusLeg(index);
    setSelectedId(null);
  };

  const is3d = viewMode === '3d';
  const floorActive = (ordinal: number) => (is3d ? focusLeg === null && floorMode === ordinal : planOrdinal === ordinal);
  const routeOrdinals = useMemo(() => new Set(route ? floorSequence(route.levelSequence, ordinals) : []), [route, ordinals]);
  /** What the folded floor button of the 3D view says. */
  const floorCurrent = useMemo(() => {
    const label = (o: number) => floors.find((f) => f.ordinal === o)?.label ?? '';
    if (route && focusLeg !== null && focusOrdinals) {
      return { mode: 'step', text: [...focusOrdinals].sort((a, b) => b - a).map(label).join(' · ') };
    }
    if (floorMode === 'route' && route) return { mode: 'route', text: t('routeLevels') };
    if (typeof floorMode === 'number') return { mode: 'floor', text: label(floorMode) };
    return { mode: 'all', text: t('allLevels') };
  }, [route, focusLeg, focusOrdinals, floorMode, floors, t]);
  const fareZones = useMemo(() => {
    const zones = [...new Set(model.areas.filter((a) => a.kind !== 'platform').map((a) => a.fareZone))];
    return zones.map((zone) => {
      if (zone === 'unpaid') return { zone, label: t('legendUnpaid') };
      const op = model.operators.find((o) => o.id === `sk:operator:${zone.replace('paid:', '')}`);
      return { zone, label: `${t('paid')}（${op ? (pickName(op.names, lang) ?? '') : ''}）` };
    });
  }, [model, t, lang]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'route', label: t('tabRoute') },
    { id: 'ops', label: t('tabOps') },
    { id: 'display', label: t('tabDisplay') },
    { id: 'info', label: t('tabInfo') },
  ];
  const leg = route && focusLeg !== null ? route.legs[focusLeg] : undefined;

  return (
    <div className={`app ${panelOpen ? '' : 'panel-closed'}`}>
      <a className="skip" href="#panel" onClick={() => setPanelOpen(true)}>
        {t('skipToPanel')}
      </a>

      <header className="topbar">
        <div className="brand">
          <h1>{t('appTitle')}</h1>
          <p>{t('appSubtitle')}</p>
        </div>
        <p className="honesty" data-testid="honesty">
          <span className="honesty-mark" aria-hidden="true" />
          {t('honestyShort')}
        </p>
        <div className="top-actions">
          <div className="segmented small" role="group" aria-label={t('viewSwitch')}>
            {(['3d', '2d'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={viewMode === m}
                className={viewMode === m ? 'on' : ''}
                disabled={m === '3d' && no3d}
                onClick={() => {
                  setViewMode(m);
                  remember('view', m);
                }}
                data-testid={`view-${m}`}
              >
                {m === '3d' ? t('view3d') : t('view2d')}
              </button>
            ))}
          </div>
          <label className="select-inline">
            <span className="sr-only">{t('language')}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} data-testid="lang">
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`${t('theme')}: ${theme === 'dark' ? t('themeLight') : t('themeDark')}`} title={t('theme')} data-testid="theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="icon-btn" onClick={() => setHelpOpen(true)} aria-label={t('help')} title={t('help')} data-testid="help">
            ?
          </button>
          <button
            type="button"
            className={`icon-btn panel-toggle ${panelOpen ? 'on' : ''}`}
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
            aria-controls="panel"
            aria-label={panelOpen ? t('panelHide') : t('panelShow')}
            title={panelOpen ? t('panelHide') : t('panelShow')}
            data-testid="panel-toggle"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="1.5" />
              <path d="M15 4v16" />
              {panelOpen && <path d="M15 4h4.5a1.5 1.5 0 011.5 1.5v13a1.5 1.5 0 01-1.5 1.5H15z" fill="currentColor" stroke="none" />}
            </svg>
          </button>
        </div>
      </header>

      <main className="stage" style={{ background: palette.background }}>
        {is3d ? (
          <SceneBoundary onFail={() => setNo3d(true)}>
            <Suspense
              fallback={
                <p className="scene-loading" role="status" data-testid="scene-loading">
                  {t('sceneLoading')}
                </p>
              }
            >
              <Scene3D
                model={model}
                graph={graph}
                view={view}
                sceneTheme={sceneTheme}
                routePts={routePts}
                labels={labels}
                trains={sceneTrains}
                showLabels={showLabels}
                ariaLabel={t('canvasLabel')}
                handleRef={sceneRef}
                onSelect={select}
                onStats={setStats}
                continuous={params.get('perf') === '1'}
                animate={animate}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          <Plan2D
            model={model}
            ordinal={planOrdinal}
            palette={palette}
            route={route}
            routePts={routePts}
            focusLeg={focusLeg}
            selectedId={selectedId}
            showLabels={showLabels}
            showVerticals={showVerticals}
            showBlocks={showBlocks}
            platformStatus={platformStatus}
            namer={namer}
            lang={lang}
            t={t}
            handleRef={sceneRef}
            onSelect={select}
          />
        )}

        {no3d && (
          <p className="stage-notice" role="status" data-testid="no-3d">
            {t('no3d')}
          </p>
        )}

        {synthetic && (
          <div className="sample-banner" role="status" data-testid="sample-banner">
            {t('sampleBanner')}
          </div>
        )}

        <FloorPicker
          t={t}
          collapsible={is3d}
          showAll={is3d}
          showRoute={is3d && route !== null}
          allActive={focusLeg === null && floorMode === 'all'}
          routeActive={focusLeg === null && floorMode === 'route'}
          current={floorCurrent.text}
          currentMode={floorCurrent.mode}
          floors={floors.map((f) => ({ ordinal: f.ordinal, label: f.label, onRoute: routeOrdinals.has(f.ordinal), active: floorActive(f.ordinal) }))}
          onAll={() => pickFloor('all')}
          onRoute={() => pickFloor('route')}
          onFloor={pickFloor}
        />

        <div className="hud hud-view" role="group" aria-label={t('viewControls')}>
          <button type="button" onClick={() => sceneRef.current?.zoom(0.8)} aria-label={t('zoomIn')} title={t('zoomIn')}>
            ＋
          </button>
          <button type="button" onClick={() => sceneRef.current?.zoom(1.25)} aria-label={t('zoomOut')} title={t('zoomOut')}>
            －
          </button>
          {is3d && (
            <>
              <button type="button" onClick={() => sceneRef.current?.rotate(-0.26)} aria-label={t('rotateLeft')} title={t('rotateLeft')}>
                ↺
              </button>
              <button type="button" onClick={() => sceneRef.current?.rotate(0.26)} aria-label={t('rotateRight')} title={t('rotateRight')}>
                ↻
              </button>
            </>
          )}
          <button type="button" className="reset" onClick={() => sceneRef.current?.reset()} data-testid="reset-view">
            {t('resetView')}
          </button>
        </div>

        <div className="hud hud-compass" aria-hidden="true">
          <span>← {t('north')}</span>
          <span className="muted">{t('schematic')}</span>
        </div>

        {route && (
          <div className="hud step-nav" data-testid="step-nav">
            <button type="button" onClick={() => stepTo(focusLeg === null ? 0 : Math.max(0, focusLeg - 1))} disabled={focusLeg === 0} aria-label={t('stepPrev')} title={t('stepPrev')}>
              ‹
            </button>
            <div className="step-body" aria-live="polite">
              {leg ? (
                <>
                  <span className="step-count">
                    {focusLeg! + 1} / {route.legs.length}
                  </span>
                  <span className="step-icon">
                    <Icon glyph={legGlyph(leg, zoneOf)} size={16} />
                  </span>
                  <span className="step-text" data-testid="step-text">
                    {legText(leg, t, namer, zoneOf)}
                  </span>
                </>
              ) : (
                <span className="step-text muted">{t('stepWhole', { n: route.legs.length })}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => stepTo(focusLeg === null ? 0 : Math.min(route.legs.length - 1, focusLeg + 1))}
              disabled={focusLeg === route.legs.length - 1}
              aria-label={t('stepNext')}
              title={t('stepNext')}
              data-testid="step-next"
            >
              ›
            </button>
            {focusLeg !== null && (
              <button type="button" className="step-all" onClick={() => stepTo(null)} data-testid="step-all">
                {t('stepAll')}
              </button>
            )}
          </div>
        )}

        {is3d && (
          <TrainBar
            t={t}
            clock={clock}
            clockRef={clockRef}
            demoData={timetable.dataset.kind === 'demo-fixture'}
            trainsOn={trainsOn}
            dayType={dayType}
            onClock={setClock}
            onToggle={(on) => {
              setTrainsOn(on);
              if (!on) setSelectedTrain(null);
            }}
            onDayType={setDayType}
          />
        )}

        {is3d && trainsOn && selectedPlan && (
          <TrainCard
            t={t}
            lang={lang}
            model={model}
            plan={selectedPlan}
            data={timetable}
            clock={clock}
            clockRef={clockRef}
            onClose={() => setSelectedTrain(null)}
            onFocus={() => focusTrain(selectedPlan)}
            onHide={() => {
              setHiddenTrains(new Set([...hiddenTrains, selectedPlan.id]));
              setSelectedTrain(null);
            }}
            onPause={() => setClock({ ...rebase(clock), playing: clock.mode === 'now' ? false : !clock.playing })}
          />
        )}

        {selectedId && (
          <FacilityCard
            t={t}
            lang={lang}
            model={model}
            namer={namer}
            elementId={selectedId}
            canRoute={canRoute}
            bound={bound}
            onClose={() => setSelectedId(null)}
            onFrom={(id) => {
              setFromId(id);
              setTab('route');
              setPanelOpen(true);
            }}
            onTo={(id) => {
              setToId(id);
              setTab('route');
              setPanelOpen(true);
            }}
          />
        )}
      </main>

      <aside id="panel" className="panel" aria-label={t('skipToPanel')} hidden={!panelOpen}>
        <div className="tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls="tabpanel" className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)} data-testid={`tab-${x.id}`}>
              {x.label}
            </button>
          ))}
        </div>
        <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
          {tab === 'route' && (
            <RoutePanel
              t={t}
              namer={namer}
              choices={choices}
              fromId={fromId}
              toId={toId}
              mode={mode}
              result={result}
              demos={demos}
              focusLeg={focusLeg}
              zoneOf={zoneOf}
              onFrom={setFromId}
              onTo={setToId}
              onMode={setMode}
              onSwap={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              onDemo={runDemo}
              onClear={() => {
                setFromId('');
                setToId('');
              }}
              onFocusLeg={stepTo}
            />
          )}
          {tab === 'display' && (
            <DisplayPanel
              t={t}
              palette={palette}
              is3d={is3d}
              explode={explode}
              shell={shell}
              ghostOthers={ghostOthers}
              showLabels={showLabels}
              showVerticals={showVerticals}
              showBlocks={showBlocks}
              hasBlocks={model.unverifiedBlocks.length > 0}
              animate={animate}
              fareZones={fareZones}
              onExplode={setExplode}
              onShell={setShell}
              onGhost={setGhostOthers}
              onLabels={setShowLabels}
              onVerticals={setShowVerticals}
              onBlocks={setShowBlocks}
              onAnimate={setAnimate}
            />
          )}
          {tab === 'ops' && (
            <OpsPanel
              t={t}
              lang={lang}
              model={model}
              mode={opsMode}
              loading={opsLoading}
              result={opsResult}
              bound={bound}
              providerLabels={{ example: providers.example.label[lang], odpt: providers.odpt.label[lang] }}
              onMode={setOpsMode}
              onRefresh={() => setOpsTick((n) => n + 1)}
              onSelect={select}
              trains={
                <TrainSection
                  t={t}
                  lang={lang}
                  model={model}
                  data={timetable}
                  plans={trainPlans.plans}
                  unplaced={trainPlans.unplaced.length}
                  filter={trainFilter}
                  hiddenCount={hiddenTrains.size}
                  clockRef={clockRef}
                  shown={trainShown}
                  selectedId={selectedTrain}
                  onSelect={selectTrain}
                  onFilter={setTrainFilter}
                  onUnhide={() => setHiddenTrains(new Set())}
                />
              }
            />
          )}
          {tab === 'info' && <InfoPanel t={t} model={model} sources={sources} stats={stats} />}
        </div>
      </aside>

      {helpOpen && <HelpDialog t={t} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
