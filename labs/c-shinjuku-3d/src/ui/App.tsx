import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_ROUTES } from '../domain/demo';
import { bindOverlay, worstStatus, type OverlayResult, type RunningStatus } from '../domain/overlay';
import { findRoute, type RouteMode, type RouteResult } from '../domain/route';
import { createExampleOverlayProvider } from '../providers/exampleOverlayProvider';
import { createOdptOverlayProvider } from '../providers/odptOverlayProvider';
import { loadStationData } from '../providers/stationDataProvider';
import { LANGS, makeT, type Lang, type StrKey } from './i18n';
import { makeNamer } from './naming';
import { HelpDialog, InfoPanel, Inspector, LayersPanel, OpsPanel, RoutePanel, type OpsMode, type RouteChoice } from './panels';
import { Plan2D } from './Plan2D';
import { Scene3D, type RenderStats, type SceneHandle } from './Scene3D';
import { buildLabels, type ViewOptions } from './scene/build';
import { PALETTES, type ThemeName } from './theme';

type Tab = 'route' | 'layers' | 'ops' | 'info';
type ViewMode = '3d' | '2d';

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

const examples = { example: createExampleOverlayProvider(), odpt: createOdptOverlayProvider() };
const DEMO_LABELS: StrKey[] = ['demo1', 'demo2', 'demo3'];

export function App() {
  const { model, graph, sources } = useMemo(loadStationData, []);

  const [lang, setLang] = useState<Lang>(() => stored('lang', ['ja', 'en', 'zh'] as const, navigator.language.startsWith('zh') ? 'zh' : navigator.language.startsWith('ja') ? 'ja' : 'en'));
  const [theme, setTheme] = useState<ThemeName>(() =>
    stored('theme', ['light', 'dark'] as const, window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => stored('view', ['3d', '2d'] as const, '3d'));
  const [tab, setTab] = useState<Tab>('route');
  const [panelOpen, setPanelOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [explode, setExplode] = useState(0.35);
  const [shell, setShell] = useState(0.3);
  const [ghostOthers, setGhostOthers] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showVerticals, setShowVerticals] = useState(true);
  const [showBlocks, setShowBlocks] = useState(true);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [mode, setMode] = useState<RouteMode>('default');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [opsMode, setOpsMode] = useState<OpsMode>('off');
  const [opsResult, setOpsResult] = useState<OverlayResult | null>(null);
  const [stats, setStats] = useState<RenderStats | null>(null);

  const sceneRef = useRef<SceneHandle>(null);
  const t = useMemo(() => makeT(lang), [lang]);
  const namer = useMemo(() => makeNamer(model, lang, t), [model, lang, t]);
  const palette = PALETTES[theme];

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    document.documentElement.dataset.theme = theme;
    remember('lang', lang);
    remember('theme', theme);
  }, [lang, theme]);

  // --- levels, top floor first --------------------------------------------------------
  const levels = useMemo(() => [...model.levels].sort((a, b) => b.elevation - a.elevation), [model]);

  // --- route --------------------------------------------------------------------------
  const choices = useMemo<RouteChoice[]>(() => {
    const out: RouteChoice[] = [];
    for (const e of model.entrances) out.push({ id: e.id, group: 'entrance', label: `${namer.name(e.id)} · ${namer.level(e.levelId)}` });
    for (const g of model.gates) {
      if (g.sides.some((s) => 'blockId' in s)) continue; // the far side is outside the verified model
      out.push({ id: g.id, group: 'gate', label: `${namer.name(g.id)} · ${namer.level(g.levelId)}${g.direction === 'exit-only' ? ` (${t('exitOnly')})` : ''}` });
    }
    for (const a of model.areas) if (a.kind === 'platform') out.push({ id: a.id, group: 'platform', label: `${namer.name(a.id)}` });
    return out;
  }, [model, namer, t]);

  const result = useMemo<RouteResult | null>(
    () => (fromId && toId && fromId !== toId ? findRoute(graph, fromId, toId, { mode }) : null),
    [graph, fromId, toId, mode],
  );
  const route = result?.found ? result : null;
  const zoneOf = useCallback((id: string) => model.areas.find((a) => a.id === id)?.fareZone, [model]);

  const runDemo = (id: string) => {
    const d = DEMO_ROUTES.find((x) => x.id === id);
    if (!d) return;
    setFromId(d.fromNodeId);
    setToId(d.toNodeId);
    setMode(d.mode);
    setActiveLevelId(null);
    setSelectedId(null);
    setTab('route');
  };
  const demos = DEMO_ROUTES.map((d, i) => ({
    id: d.id,
    label: t(DEMO_LABELS[i] ?? 'demo1'),
    active: d.fromNodeId === fromId && d.toNodeId === toId && d.mode === mode,
  }));

  // --- operations overlay ----------------------------------------------------------------
  useEffect(() => {
    if (opsMode === 'off') {
      setOpsResult(null);
      return;
    }
    let live = true;
    void examples[opsMode].getSnapshot().then((r) => live && setOpsResult(r));
    return () => {
      live = false;
    };
  }, [opsMode]);

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

  // --- view -------------------------------------------------------------------------------
  const view = useMemo<ViewOptions>(
    () => ({ explode, activeLevelId, ghostOthers, shellOpacity: shell, showVerticals, showBlocks, palette, route, selectedId, platformStatus }),
    [explode, activeLevelId, ghostOthers, shell, showVerticals, showBlocks, palette, route, selectedId, platformStatus],
  );
  const labels = useMemo(() => buildLabels(model, view, namer.name, { unverified: t('unverified') }), [model, view, namer, t]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);
  const canRoute = selectedId !== null && choices.some((c) => c.id === selectedId);

  const levelButtons = (compact: boolean) => (
    <div className={compact ? 'level-rail' : 'level-list'} role="group" aria-label={t('levels')}>
      <button type="button" aria-pressed={activeLevelId === null} onClick={() => setActiveLevelId(null)} data-testid={compact ? 'level-all' : undefined}>
        {t('allLevels')}
      </button>
      {levels.map((l) => (
        <button
          key={l.id}
          type="button"
          aria-pressed={activeLevelId === l.id}
          onClick={() => setActiveLevelId(l.id)}
          data-testid={compact ? `level-${l.label}-${l.operatorId.split(':').pop()}` : undefined}
        >
          {namer.level(l.id)}
        </button>
      ))}
    </div>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'route', label: t('tabRoute') },
    { id: 'layers', label: t('tabLayers') },
    { id: 'ops', label: t('tabOps') },
    { id: 'info', label: t('tabInfo') },
  ];

  return (
    <div className={`app ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      <a className="skip" href="#panel">
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
        </div>
      </header>

      <main className="stage" style={{ background: palette.background }}>
        {viewMode === '3d' ? (
          <Scene3D
            model={model}
            graph={graph}
            view={view}
            labels={labels}
            showLabels={showLabels}
            ariaLabel={t('canvasLabel')}
            handleRef={sceneRef}
            onSelect={select}
            onStats={setStats}
            continuous={params.get('perf') === '1'}
          />
        ) : (
          <Plan2D
            model={model}
            graph={graph}
            levelIds={activeLevelId ? [activeLevelId] : levels.map((l) => l.id)}
            palette={palette}
            route={route}
            selectedId={selectedId}
            showLabels={showLabels}
            showVerticals={showVerticals}
            showBlocks={showBlocks}
            platformStatus={platformStatus}
            namer={namer}
            t={t}
            handleRef={sceneRef}
            onSelect={select}
            onFocusLevel={setActiveLevelId}
          />
        )}

        {synthetic && (
          <div className="sample-banner" role="status" data-testid="sample-banner">
            {t('sampleBanner')}
          </div>
        )}

        <div className="hud hud-levels">{levelButtons(true)}</div>

        <div className="hud hud-view" role="group" aria-label={t('viewSwitch')}>
          <button type="button" onClick={() => sceneRef.current?.zoom(0.8)} aria-label={t('zoomIn')} title={t('zoomIn')}>
            ＋
          </button>
          <button type="button" onClick={() => sceneRef.current?.zoom(1.25)} aria-label={t('zoomOut')} title={t('zoomOut')}>
            －
          </button>
          <button type="button" onClick={() => sceneRef.current?.rotate(-0.26)} aria-label={t('rotateLeft')} title={t('rotateLeft')}>
            ↺
          </button>
          <button type="button" onClick={() => sceneRef.current?.rotate(0.26)} aria-label={t('rotateRight')} title={t('rotateRight')}>
            ↻
          </button>
          <button type="button" className="reset" onClick={() => sceneRef.current?.reset()} data-testid="reset-view">
            {t('resetView')}
          </button>
        </div>

        <div className="hud hud-compass" aria-hidden="true">
          <span>← {t('north')}</span>
          <span className="muted">{t('schematic')}</span>
        </div>

        {selectedId && (
          <Inspector
            t={t}
            lang={lang}
            model={model}
            sources={sources}
            namer={namer}
            elementId={selectedId}
            canRoute={canRoute}
            onClose={() => setSelectedId(null)}
            onFrom={(id) => {
              setFromId(id);
              setTab('route');
            }}
            onTo={(id) => {
              setToId(id);
              setTab('route');
            }}
          />
        )}
      </main>

      <aside id="panel" className="panel" aria-label={t('skipToPanel')}>
        <div className="panel-head">
          <div className="tabs" role="tablist">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`tab-${x.id}`}
                aria-selected={tab === x.id}
                aria-controls="tabpanel"
                className={tab === x.id ? 'on' : ''}
                onClick={() => {
                  setTab(x.id);
                  setPanelOpen(true);
                }}
                data-testid={`tab-${x.id}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} aria-label={panelOpen ? t('panelHide') : t('panelShow')}>
            {panelOpen ? '▾' : '▴'}
          </button>
        </div>
        <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel" hidden={!panelOpen}>
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
              onSelect={select}
            />
          )}
          {tab === 'layers' && (
            <LayersPanel
              t={t}
              palette={palette}
              is3d={viewMode === '3d'}
              explode={explode}
              shell={shell}
              ghostOthers={ghostOthers}
              showLabels={showLabels}
              showVerticals={showVerticals}
              showBlocks={showBlocks}
              onExplode={setExplode}
              onShell={setShell}
              onGhost={setGhostOthers}
              onLabels={setShowLabels}
              onVerticals={setShowVerticals}
              onBlocks={setShowBlocks}
              levelButtons={levelButtons(false)}
            />
          )}
          {tab === 'ops' && (
            <OpsPanel
              t={t}
              lang={lang}
              model={model}
              namer={namer}
              mode={opsMode}
              result={opsResult}
              bound={bound}
              providerLabels={{ example: examples.example.label[lang], odpt: examples.odpt.label[lang] }}
              onMode={setOpsMode}
              onSelect={select}
            />
          )}
          {tab === 'info' && <InfoPanel t={t} model={model} sources={sources} stats={stats} />}
        </div>
      </aside>

      {helpOpen && <HelpDialog t={t} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
