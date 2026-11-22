import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Compass,
  Info,
  Layers,
  Map as MapIcon,
  Moon,
  Route,
  ShieldCheck,
  Sun,
  TrainFront,
} from 'lucide-react';
import {
  calculateFareQuote,
  createFareEngineContext,
} from '../domain/fareEngine.js';
import type {
  FareQuote,
  FareQuoteRequest,
  OsmVerticalDataset,
  RealtimeServiceStatus,
  SkId,
  TrackVerticalAttribute,
} from '../domain/types.js';
import {
  StaticAtlasProvider,
  indexVerticalOverlay,
} from '../providers/atlasProvider.js';
import { OdptRealtimeProvider } from '../providers/realtimeProvider.js';
import { CoveragePanel } from './CoveragePanel.js';
import { DetailPanel } from './DetailPanel.js';
import { FarePanel } from './FarePanel.js';
import type { TrainFollowAngle } from '../domain/cameraModeStateMachine.js';
import type { TrainSimulationSnapshot } from '../three/uxContracts.js';
import { UI_TEXT, type Locale } from './i18n.js';
import { MapCanvas } from './MapCanvas.js';
import { StripMapView } from './StripMapView.js';
import { Tokyo3DCanvas } from './Tokyo3DCanvas.js';

type ViewMode = 'geo' | '3d' | 'strip';
type SidebarTab = 'explore' | 'detail' | 'fare' | 'coverage';

const atlasProvider = new StaticAtlasProvider();
const realtimeProvider = new OdptRealtimeProvider(null);

export const App: React.FC = () => {
  const dataset = useMemo(() => atlasProvider.getAtlasDataset(), []);
  const allSources = useMemo(() => atlasProvider.getAllSources(), []);
  const fareCtx = useMemo(() => createFareEngineContext(dataset), [dataset]);

  const [locale, setLocale] = useState<Locale>('ja');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [viewMode, setViewMode] = useState<ViewMode>('geo');
  const [activeTab, setActiveTab] = useState<SidebarTab>('explore');

  // Filter & exploration state
  const [searchQuery, setSearchQuery] = useState('');
  const [fareSliceOnly, setFareSliceOnly] = useState(false);
  const [visibleOperatorIds, setVisibleOperatorIds] = useState<Set<SkId<'operator'>>>(
    () => new Set(dataset.operators.filter((o) => o.coverageStatus !== 'none').map((o) => o.id)),
  );
  const [selectedStationId, setSelectedStationId] = useState<SkId<'station'> | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<SkId<'line'> | null>(null);
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [simSnapshot, setSimSnapshot] = useState<TrainSimulationSnapshot | null>(null);
  const [followTrainSignal, setFollowTrainSignal] = useState<{
    trainId: string;
    angle?: TrainFollowAngle;
    nonce: number;
  } | null>(null);
  const [focusLineSignal, setFocusLineSignal] = useState<{
    lineId: SkId<'line'>;
    nonce: number;
  } | null>(null);
  const [focusCoords, setFocusCoords] = useState<[number, number] | null>(null);

  // Shared 2D <-> 3D viewport state so switching preserves map region seamlessly!
  const [sharedViewport, setSharedViewport] = useState<{
    lon: number;
    lat: number;
    zoom: number;
  }>({ lon: 139.745, lat: 35.685, zoom: 11.4 });

  // Lazy-loaded isolated ODbL vertical layer
  const [osmVerticalData, setOsmVerticalData] = useState<OsmVerticalDataset | null>(null);
  const [verticalMap, setVerticalMap] = useState<Map<string, TrackVerticalAttribute>>(
    () => new Map(),
  );
  const [verticalLoading, setVerticalLoading] = useState(false);

  // Keyless realtime status slot (honest degradation)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeServiceStatus | null>(null);

  // JR Fare Engine state (linked bidirectionally to map!)
  const [fareRequest, setFareRequest] = useState<FareQuoteRequest>({
    originStationId: 'sk:station:jr-east-tokyo',
    destinationStationId: 'sk:station:jr-east-ueno',
    viaStationIds: [],
    routePreference: 'yamanote_loop_detour',
    travelDate: '2026-06-01',
    ticketType: 'ordinary_paper',
    requireStopover: false,
    surchargeType: 'none',
  });
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);

  const t = UI_TEXT[locale];

  // Apply theme attribute to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Fetch keyless realtime status once
  useEffect(() => {
    void realtimeProvider.getOperatorStatus('sk:operator:jr-east').then(setRealtimeStatus);
  }, []);

  // Lazy-load isolated ODbL vertical dataset ONLY when user opens 3D view
  useEffect(() => {
    if (viewMode !== '3d' || verticalMap.size > 0) return;
    setVerticalLoading(true);
    void atlasProvider
      .loadOsmVerticalOverlay()
      .then((overlay) => {
        setOsmVerticalData(overlay);
        setVerticalMap(indexVerticalOverlay(overlay));
      })
      .finally(() => setVerticalLoading(false));
  }, [viewMode, verticalMap.size]);

  const handleViewportChange = useCallback((lon: number, lat: number, zoom: number) => {
    setSharedViewport({ lon, lat, zoom });
  }, []);

  // Keyboard Escape clears active line/station highlight in 2D/Strip view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewMode !== '3d') {
        setSelectedLineId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode]);

  const operatorById = useMemo(
    () => new Map(dataset.operators.map((o) => [o.id, o])),
    [dataset.operators],
  );
  const stationById = useMemo(
    () => new Map(dataset.stations.map((s) => [s.id, s])),
    [dataset.stations],
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return dataset.stations
      .filter((s) => {
        if (!visibleOperatorIds.has(s.operatorId)) return false;
        const ja = (s.names.ja ?? '').toLowerCase();
        const en = (s.names.en ?? '').toLowerCase();
        const kana = (s.names.ja_kana ?? '').toLowerCase();
        const code = (s.stationCode ?? '').toLowerCase();
        return ja.includes(q) || en.includes(q) || kana.includes(q) || code.includes(q);
      })
      .slice(0, 25);
  }, [dataset.stations, searchQuery, visibleOperatorIds]);

  const handleSelectStation = useCallback(
    (stationId: SkId<'station'>) => {
      setSelectedStationId(stationId);
      const st = stationById.get(stationId);
      if (st) {
        setFocusCoords(st.coordinates);
        if (st.railLineIds[0]) {
          setSelectedLineId(st.railLineIds[0]);
        }
      }
      setActiveTab('detail');
    },
    [stationById],
  );

  const handleSelectLine = useCallback((lineId: SkId<'line'>) => {
    setSelectedLineId(lineId);
    setActiveTab('detail');
  }, []);

  const handleSelectTrain = useCallback((trainId: string) => {
    setSelectedTrainId(trainId);
    setActiveTab('detail');
  }, []);

  const handleFollowTrain = useCallback((trainId: string, angle?: TrainFollowAngle) => {
    setSelectedTrainId(trainId);
    setViewMode('3d');
    setFollowTrainSignal({ trainId, angle, nonce: Date.now() + Math.random() });
  }, []);

  const selectedTrain = useMemo(() => {
    if (!selectedTrainId || !simSnapshot) return null;
    return simSnapshot.trains.find((tr) => tr.id === selectedTrainId) ?? null;
  }, [selectedTrainId, simSnapshot]);

  const selectedLineTrains = useMemo(() => {
    if (!selectedLineId || !simSnapshot) return [];
    return simSnapshot.trains.filter((tr) => tr.lineId === selectedLineId);
  }, [selectedLineId, simSnapshot]);

  const handleCalculateFare = useCallback(
    (overrideReq?: FareQuoteRequest) => {
      const targetReq = overrideReq ?? fareRequest;
      const result = calculateFareQuote(targetReq, fareCtx);
      setFareQuote(result);
    },
    [fareRequest, fareCtx],
  );

  const handleSetOrigin = useCallback(
    (stationId: SkId<'station'>) => {
      const next: FareQuoteRequest = {
        ...fareRequest,
        originStationId: stationId,
        routePreference: 'shortest',
        preferShinkansen: false,
      };
      setFareRequest(next);
      setActiveTab('fare');
    },
    [fareRequest],
  );

  const handleSetDest = useCallback(
    (stationId: SkId<'station'>) => {
      const next: FareQuoteRequest = {
        ...fareRequest,
        destinationStationId: stationId,
        routePreference: 'shortest',
        preferShinkansen: false,
      };
      setFareRequest(next);
      setActiveTab('fare');
      const result = calculateFareQuote(next, fareCtx);
      setFareQuote(result);
    },
    [fareRequest, fareCtx],
  );

  const handleSetVia = useCallback(
    (stationId: SkId<'station'>) => {
      const next: FareQuoteRequest = {
        ...fareRequest,
        viaStationIds: [stationId],
      };
      setFareRequest(next);
      setActiveTab('fare');
    },
    [fareRequest],
  );

  const toggleOperator = (opId: SkId<'operator'>) => {
    setVisibleOperatorIds((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand-title">{t.appTitle}</h1>
          <span className="brand-sub">{t.subtitle}</span>
        </div>

        <div className="topbar-controls">
          <div className="segmented" role="group" aria-label="View Mode">
            <button
              type="button"
              data-testid="view-mode-geo"
              className={viewMode === 'geo' ? 'active' : ''}
              onClick={() => setViewMode('geo')}
            >
              <MapIcon size={14} />
              <span>{t.viewGeo}</span>
            </button>
            <button
              type="button"
              data-testid="view-mode-3d"
              className={viewMode === '3d' ? 'active' : ''}
              onClick={() => setViewMode('3d')}
            >
              <Layers size={14} />
              <span>{t.view3d}</span>
            </button>
            <button
              type="button"
              data-testid="view-mode-strip"
              className={viewMode === 'strip' ? 'active' : ''}
              onClick={() => setViewMode('strip')}
            >
              <TrainFront size={14} />
              <span>{t.viewStrip}</span>
            </button>
          </div>

          <button
            type="button"
            className="icon-btn"
            data-testid="locale-toggle"
            aria-label="Toggle Language"
            onClick={() => setLocale((l) => (l === 'ja' ? 'en' : 'ja'))}
          >
            {locale === 'ja' ? 'EN' : '日本語'}
          </button>

          <button
            type="button"
            className="icon-btn"
            data-testid="theme-toggle"
            aria-label="Toggle Dark Mode"
            onClick={() => setTheme((cur) => (cur === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            <span>{theme === 'light' ? t.darkMode : t.lightMode}</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar" aria-label="Control Sidebar">
          <nav className="sidebar-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'explore'}
              data-testid="tab-explore"
              className={`sidebar-tab ${activeTab === 'explore' ? 'active' : ''}`}
              onClick={() => setActiveTab('explore')}
            >
              <Compass size={14} />
              <span>{t.tabExplore}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'detail'}
              data-testid="tab-detail"
              className={`sidebar-tab ${activeTab === 'detail' ? 'active' : ''}`}
              onClick={() => setActiveTab('detail')}
            >
              <Info size={14} />
              <span>{t.tabDetail}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'fare'}
              data-testid="tab-fare"
              className={`sidebar-tab ${activeTab === 'fare' ? 'active' : ''}`}
              onClick={() => setActiveTab('fare')}
            >
              <Route size={14} />
              <span>{t.tabFare}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'coverage'}
              data-testid="tab-coverage"
              className={`sidebar-tab ${activeTab === 'coverage' ? 'active' : ''}`}
              onClick={() => setActiveTab('coverage')}
            >
              <ShieldCheck size={14} />
              <span>{t.tabCoverage}</span>
            </button>
          </nav>

          <div className="sidebar-body">
            {activeTab === 'explore' && (
              <>
                {/* Search */}
                <div className="card">
                  <label className="form-label">
                    <span>{locale === 'ja' ? '駅名検索' : 'Station Search'}</span>
                    <input
                      type="search"
                      className="input-field"
                      data-testid="station-search-input"
                      placeholder={t.searchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </label>
                  {searchQuery.trim().length > 0 && (
                    <div className="search-results" data-testid="search-results-list">
                      {searchResults.length === 0 ? (
                        <div className="muted" style={{ padding: 10 }}>
                          {locale === 'ja' ? '該当駅なし' : 'No matching stations'}
                        </div>
                      ) : (
                        searchResults.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            className="search-item"
                            data-testid={`search-result-${st.id}`}
                            onClick={() => handleSelectStation(st.id)}
                          >
                            <div>
                              <strong>{st.names.ja}</strong>
                              {st.names.en && (
                                <span className="muted" style={{ marginLeft: 6 }}>
                                  {st.names.en}
                                </span>
                              )}
                              {st.names.ja_kana && (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  {st.names.ja_kana}
                                </div>
                              )}
                            </div>
                            <span className="badge">
                              {operatorById.get(st.operatorId)?.names.ja}
                              {st.stationCode ? ` · ${st.stationCode}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Filter Controls */}
                <div className="card">
                  <div className="section-title">
                    <span>{t.operators}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setVisibleOperatorIds(
                            new Set(
                              dataset.operators
                                .filter((o) => o.coverageStatus !== 'none')
                                .map((o) => o.id),
                            ),
                          )
                        }
                      >
                        {t.selectAll}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setVisibleOperatorIds(new Set())}
                      >
                        {t.clearAll}
                      </button>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      data-testid="filter-fare-slice-only"
                      checked={fareSliceOnly}
                      onChange={(e) => setFareSliceOnly(e.target.checked)}
                    />
                    <span style={{ fontWeight: 600 }}>{t.fareSliceOnly}</span>
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {dataset.operators
                      .filter((op) => op.coverageStatus !== 'none')
                      .map((op) => (
                        <label
                          key={op.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="checkbox"
                            data-testid={`filter-op-${op.id}`}
                            checked={visibleOperatorIds.has(op.id)}
                            onChange={() => toggleOperator(op.id)}
                          />
                          <span className="line-dot" style={{ background: op.brandColor }} />
                          <span>{locale === 'ja' ? op.names.ja : op.names.en ?? op.names.ja}</span>
                        </label>
                      ))}
                  </div>
                </div>

                {/* Line Selector (useful in both 2D & 3D views) */}
                <div className="card">
                  <div className="section-title">
                    <span>{locale === 'ja' ? '路線ハイライト選択' : 'Highlight Rail Line'}</span>
                    {selectedLineId && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setSelectedLineId(null)}
                      >
                        解除
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 165, overflowY: 'auto' }}>
                    {dataset.railLines
                      .filter((l) => visibleOperatorIds.has(l.operatorId))
                      .filter((l) => !fareSliceOnly || l.inFareSlice)
                      .map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          data-testid={`line-chip-${l.id}`}
                          className="line-pill"
                          style={{
                            borderColor: selectedLineId === l.id ? 'var(--accent)' : undefined,
                            background: selectedLineId === l.id ? 'var(--accent-soft)' : undefined,
                          }}
                          onClick={() => setSelectedLineId(l.id)}
                        >
                          <span className="line-dot" style={{ background: l.color }} />
                          <span>{l.names.ja}</span>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Realtime Operations Status Slot (Should #20) */}
                <div className="card-subtle" data-testid="realtime-status-slot">
                  <div className="section-title">{t.realtimeTitle}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge">
                      {realtimeStatus?.status ?? 'unavailable'}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {realtimeStatus?.summary ?? '無実時データ / No real-time data'}
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'detail' && (
              <DetailPanel
                dataset={dataset}
                allSources={allSources}
                locale={locale}
                selectedStationId={selectedStationId}
                selectedLineId={selectedLineId}
                selectedTrain={selectedTrain}
                lineTrains={selectedLineTrains}
                verticalMap={verticalMap}
                is3dActive={viewMode === '3d'}
                onSelectStation={handleSelectStation}
                onSelectLine={handleSelectLine}
                onOpenStripMap={(lid) => {
                  setSelectedLineId(lid);
                  setViewMode('strip');
                }}
                onSetOrigin={handleSetOrigin}
                onSetDest={handleSetDest}
                onSetVia={handleSetVia}
                onFollowTrain={handleFollowTrain}
                onFocusLine3D={(lid) =>
                  setFocusLineSignal({ lineId: lid, nonce: Date.now() + Math.random() })
                }
              />
            )}

            {activeTab === 'fare' && (
              <FarePanel
                dataset={dataset}
                locale={locale}
                request={fareRequest}
                quote={fareQuote}
                onChangeRequest={setFareRequest}
                onCalculate={handleCalculateFare}
              />
            )}

            {activeTab === 'coverage' && (
              <CoveragePanel
                dataset={dataset}
                allSources={allSources}
                locale={locale}
              />
            )}
          </div>
        </aside>

        {viewMode === 'strip' ? (
          <div className="canvas-pane">
            <StripMapView
              dataset={dataset}
              locale={locale}
              selectedLineId={selectedLineId}
              selectedStationId={selectedStationId}
              onSelectLine={setSelectedLineId}
              onSelectStation={handleSelectStation}
              onSetOrigin={handleSetOrigin}
              onSetDest={handleSetDest}
            />
          </div>
        ) : viewMode === '3d' ? (
          <Tokyo3DCanvas
            dataset={dataset}
            osmVertical={osmVerticalData}
            theme={theme}
            locale={locale}
            visibleOperatorIds={visibleOperatorIds}
            selectedLineId={selectedLineId}
            selectedStationId={selectedStationId}
            selectedTrainId={selectedTrainId}
            fareSliceOnly={fareSliceOnly}
            fareQuote={fareQuote}
            initialViewport={sharedViewport}
            followTrainSignal={followTrainSignal}
            focusLineSignal={focusLineSignal}
            onViewportChange={handleViewportChange}
            onSelectStation={handleSelectStation}
            onSelectLine={handleSelectLine}
            onSelectTrain={handleSelectTrain}
            onSimulationSnapshot={setSimSnapshot}
          />
        ) : (
          <MapCanvas
            dataset={dataset}
            viewMode="geo"
            theme={theme}
            locale={locale}
            visibleOperatorIds={visibleOperatorIds}
            selectedLineId={selectedLineId}
            selectedStationId={selectedStationId}
            fareSliceOnly={fareSliceOnly}
            fareQuote={fareQuote}
            originStationId={fareRequest.originStationId}
            destStationId={fareRequest.destinationStationId}
            viaStationId={fareRequest.viaStationIds?.[0] ?? null}
            verticalMap={verticalMap}
            verticalLoading={verticalLoading}
            focusCoords={focusCoords}
            initialViewport={sharedViewport}
            onViewportChange={handleViewportChange}
            onSelectStation={handleSelectStation}
            onSelectLine={handleSelectLine}
          />
        )}
      </main>
    </div>
  );
};
