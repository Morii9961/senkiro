import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Box,
  Camera,
  CheckCircle2,
  DoorOpen,
  Download,
  Eye,
  FileCheck,
  Lightbulb,
  Moon,
  Pause,
  Play,
  ShieldCheck,
  Sun,
  TrainFront,
} from 'lucide-react';
import {
  getRollingStockSpec,
  LIST_ROLLING_STOCK_SPECS,
  ROLLING_STOCK_SOURCES,
} from '../../domain/rollingStock/specs.js';
import type {
  RollingStockLodLevel,
  RollingStockSeriesId,
  TravelDirection,
} from '../../domain/rollingStock/types.js';
import {
  inspectGlbBinary,
  RollingStockAssetCache,
  type GlbHeaderInspection,
} from '../../three/rollingStock/glbExporterAndCache.js';
import {
  RollingStockPreviewScene,
  type PreviewCameraPreset,
  type PreviewSceneTelemetry,
  type PreviewShowcaseMode,
  type PreviewTrackKind,
} from '../../three/rollingStock/RollingStockPreviewScene.js';

type Locale = 'ja' | 'en';

export const RollingStockStudio: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RollingStockPreviewScene | null>(null);

  const [locale, setLocale] = useState<Locale>('ja');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showcaseMode, setShowcaseMode] = useState<PreviewShowcaseMode>('all_comparison');
  const [activeSeriesId, setActiveSeriesId] = useState<RollingStockSeriesId>('jr-east-e235-0');
  const [carCount, setCarCount] = useState<number>(4);
  const [trackKind, setTrackKind] = useState<PreviewTrackKind>('s_curve');
  const [lodMode, setLodMode] = useState<RollingStockLodLevel | 'auto'>('high');
  const [travelDirection, setTravelDirection] = useState<TravelDirection>('forward');
  const [leftDoorOpen, setLeftDoorOpen] = useState(false);
  const [rightDoorOpen, setRightDoorOpen] = useState(false);
  const [headlightsOn, setHeadlightsOn] = useState(true);
  const [taillightsOn, setTaillightsOn] = useState(true);
  const [interiorLightsOn, setInteriorLightsOn] = useState(false);
  const [running, setRunning] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(55);
  const [telemetry, setTelemetry] = useState<PreviewSceneTelemetry | null>(null);
  const [glbInspection, setGlbInspection] = useState<GlbHeaderInspection | null>(null);
  const [preloadedGlbStatus, setPreloadedGlbStatus] = useState<string | null>(null);

  const activeSpec = useMemo(() => getRollingStockSpec(activeSeriesId), [activeSeriesId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!mountRef.current) return;
    const ctrl = new RollingStockPreviewScene(mountRef.current, {
      isNight: theme === 'dark',
      onTelemetry: (t) => setTelemetry(t),
    });
    sceneRef.current = ctrl;
    // Perform initial in-memory GLB binary inspection on mount
    try {
      const glbBytes = ctrl.exportActiveConsistGlb();
      setGlbInspection(inspectGlbBinary(glbBytes));
    } catch {
      // ignore
    }

    return () => {
      ctrl.dispose();
      sceneRef.current = null;
    };
  }, []);

  const handleToggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setInteriorLightsOn(next === 'dark');
    sceneRef.current?.setNightMode(next === 'dark');
  };

  const handleSwitchShowcaseMode = (mode: PreviewShowcaseMode) => {
    setShowcaseMode(mode);
    sceneRef.current?.setShowcaseMode(mode);
  };

  const handleSelectSeries = (seriesId: RollingStockSeriesId) => {
    setActiveSeriesId(seriesId);
    sceneRef.current?.setActiveSeries(seriesId);
    if (sceneRef.current) {
      const glbBytes = sceneRef.current.exportActiveConsistGlb();
      setGlbInspection(inspectGlbBinary(glbBytes));
    }
  };

  const handleChangeCarCount = (nextCount: number) => {
    setCarCount(nextCount);
    sceneRef.current?.setCarCount(nextCount);
  };

  const handleChangeTrackKind = (kind: PreviewTrackKind) => {
    setTrackKind(kind);
    sceneRef.current?.setTrackKind(kind);
  };

  const handleToggleRunning = () => {
    const next = !running;
    setRunning(next);
    sceneRef.current?.setRunning(next);
  };

  const handleToggleLeftDoors = () => {
    const next = !leftDoorOpen;
    setLeftDoorOpen(next);
    sceneRef.current?.setDoorState('left', next);
  };

  const handleToggleRightDoors = () => {
    const next = !rightDoorOpen;
    setRightDoorOpen(next);
    sceneRef.current?.setDoorState('right', next);
  };

  const handleToggleBothDoors = () => {
    const next = !(leftDoorOpen && rightDoorOpen);
    setLeftDoorOpen(next);
    setRightDoorOpen(next);
    sceneRef.current?.setDoorState('both', next);
  };

  const handleToggleDirection = () => {
    const next: TravelDirection = travelDirection === 'forward' ? 'reverse' : 'forward';
    setTravelDirection(next);
    sceneRef.current?.setTravelDirection(next);
  };

  const handleChangeLod = (mode: RollingStockLodLevel | 'auto') => {
    setLodMode(mode);
    sceneRef.current?.setLodMode(mode);
  };

  const handleVerifyOrDownloadGlb = async (downloadFile: boolean) => {
    if (!sceneRef.current) return;
    const glbBytes = sceneRef.current.exportActiveConsistGlb();
    const info = inspectGlbBinary(glbBytes);
    setGlbInspection(info);

    // Also test loading the pre-built static GLB file via RollingStockAssetCache
    try {
      const cache = RollingStockAssetCache.getInstance();
      await cache.preloadSeriesGlbAssets(activeSeriesId);
      const stats = cache.getCacheStats();
      setPreloadedGlbStatus(
        `OK (${stats.cachedAssetCount} GLB files cached, ${(stats.totalCachedBytes / 1024).toFixed(1)} KB)`,
      );
    } catch {
      setPreloadedGlbStatus(`In-memory GLB verified (${(info.totalByteLength / 1024).toFixed(1)} KB)`);
    }

    if (downloadFile) {
      const slice = glbBytes.buffer.slice(
        glbBytes.byteOffset,
        glbBytes.byteOffset + glbBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([slice], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeSeriesId}-${lodMode}.glb`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="app-shell" data-testid="rolling-stock-studio-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrainFront size={18} />
            <span>
              {locale === 'ja'
                ? 'SENKIRO Lab · 日本鉄道車両 3Dアセット＆アニメーションシステム v2'
                : 'SENKIRO Lab · High-Fidelity Japanese Rolling Stock 3D Asset Studio v2'}
            </span>
          </h1>
          <span className="brand-sub">
            {locale === 'ja'
              ? 'JR東日本 E235系（山手線）・東京メトロ 1000系（銀座線）・東京メトロ 17000系（有楽町・副都心線）'
              : 'JR East E235-0 (Yamanote) · Tokyo Metro 1000 (Ginza) · Tokyo Metro 17000 (Yurakucho/Fukutoshin)'}
          </span>
        </div>

        <div className="topbar-controls">
          <div className="segmented" role="group" aria-label="Showcase Mode">
            <button
              type="button"
              data-testid="mode-all-comparison"
              className={showcaseMode === 'all_comparison' ? 'active' : ''}
              onClick={() => handleSwitchShowcaseMode('all_comparison')}
            >
              <Eye size={14} />
              <span>{locale === 'ja' ? '3車種 並列比較' : '3-Series Lineup'}</span>
            </button>
            <button
              type="button"
              data-testid="mode-single-focus"
              className={showcaseMode === 'single_focus' ? 'active' : ''}
              onClick={() => handleSwitchShowcaseMode('single_focus')}
            >
              <TrainFront size={14} />
              <span>{locale === 'ja' ? '単一編成・曲線走行検証' : 'Single Consist & Curve Run'}</span>
            </button>
          </div>

          <button
            type="button"
            className="icon-btn"
            data-testid="studio-locale-toggle"
            onClick={() => setLocale((l) => (l === 'ja' ? 'en' : 'ja'))}
          >
            {locale === 'ja' ? 'EN' : '日本語'}
          </button>

          <button
            type="button"
            className="icon-btn"
            data-testid="studio-theme-toggle"
            onClick={handleToggleTheme}
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            <span>{theme === 'light' ? (locale === 'ja' ? '夜間' : 'Night') : locale === 'ja' ? '昼間' : 'Day'}</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar" style={{ width: 410 }} aria-label="Rolling Stock Control Panel">
          <div className="sidebar-body">
            {/* 1. Rolling Stock Series Selector */}
            <div className="card">
              <div className="section-title">
                <span>{locale === 'ja' ? '1. 車両シリーズ選択' : '1. Rolling Stock Series'}</span>
                <span className="badge">1 unit = 1.0 m</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {LIST_ROLLING_STOCK_SPECS.map((spec) => {
                  const selected = spec.seriesId === activeSeriesId;
                  return (
                    <button
                      key={spec.seriesId}
                      type="button"
                      data-testid={`select-series-${spec.seriesId}`}
                      className="search-item"
                      style={{
                        border: selected
                          ? `2px solid ${spec.palette.primaryStripeHex}`
                          : '1px solid var(--border)',
                        background: selected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                        padding: '8px 10px',
                      }}
                      onClick={() => handleSelectSeries(spec.seriesId)}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="line-dot"
                            style={{ background: spec.palette.primaryStripeHex }}
                          />
                          {spec.palette.secondaryStripeHex && (
                            <span
                              className="line-dot"
                              style={{ background: spec.palette.secondaryStripeHex }}
                            />
                          )}
                          <strong>
                            {locale === 'ja' ? spec.names.ja : spec.names.en ?? spec.names.ja}
                          </strong>
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                          {spec.dimensions.couplerLengthM.toFixed(1)}m ×{' '}
                          {spec.dimensions.bodyWidthM.toFixed(2)}m ×{' '}
                          {spec.dimensions.roofHeightM.toFixed(2)}m · {spec.dimensions.doorsPerSide}
                          {locale === 'ja' ? '扉' : ' doors'} ·{' '}
                          {spec.dimensions.trackGaugeM === 1.435 ? '1,435mm' : '1,067mm'}
                        </div>
                      </div>
                      <span className="badge">
                        {spec.electrification === 'third_rail_600v_dc'
                          ? locale === 'ja'
                            ? '第三軌条'
                            : '3rd Rail'
                          : locale === 'ja'
                            ? '架空線'
                            : 'Catenary'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Door & Light & Direction Animation Interface */}
            <div className="card">
              <div className="section-title">
                <span>
                  {locale === 'ja'
                    ? '2. 扉・前照灯/尾灯・進行方向アニメーション'
                    : '2. Doors, Lights & Travel Direction'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  data-testid="toggle-left-doors"
                  className={leftDoorOpen ? 'btn-primary' : 'btn-secondary'}
                  onClick={handleToggleLeftDoors}
                >
                  <DoorOpen size={13} />
                  <span>{locale === 'ja' ? '左扉 開閉' : 'Left Doors'}</span>
                </button>
                <button
                  type="button"
                  data-testid="toggle-right-doors"
                  className={rightDoorOpen ? 'btn-primary' : 'btn-secondary'}
                  onClick={handleToggleRightDoors}
                >
                  <DoorOpen size={13} />
                  <span>{locale === 'ja' ? '右扉 開閉' : 'Right Doors'}</span>
                </button>
                <button
                  type="button"
                  data-testid="toggle-both-doors"
                  className={leftDoorOpen && rightDoorOpen ? 'btn-primary' : 'btn-secondary'}
                  onClick={handleToggleBothDoors}
                >
                  <DoorOpen size={13} />
                  <span>{locale === 'ja' ? '両側扉' : 'Both Doors'}</span>
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  marginTop: 6,
                }}
                className="mono muted"
                data-testid="door-progress-readout"
              >
                <span>
                  {locale === 'ja' ? '左扉開度' : 'Left Open'}:{' '}
                  {Math.round((telemetry?.leftDoorProgress ?? 0) * 100)}%
                </span>
                <span>
                  {locale === 'ja' ? '右扉開度' : 'Right Open'}:{' '}
                  {Math.round((telemetry?.rightDoorProgress ?? 0) * 100)}%
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  data-testid="toggle-travel-direction"
                  className="btn-secondary"
                  onClick={handleToggleDirection}
                >
                  <ArrowLeftRight size={13} />
                  <span>
                    {locale === 'ja' ? '方向: ' : 'Dir: '}
                    <strong>
                      {travelDirection === 'forward'
                        ? locale === 'ja'
                          ? '前進 (+X)'
                          : 'Forward'
                        : locale === 'ja'
                          ? '後退 (-X)'
                          : 'Reverse'}
                    </strong>
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="toggle-headlights"
                  className={headlightsOn ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => {
                    const next = !headlightsOn;
                    setHeadlightsOn(next);
                    sceneRef.current?.setLights({ headlights: next });
                  }}
                >
                  <Lightbulb size={13} />
                  <span>
                    {locale === 'ja'
                      ? `前照灯: ${headlightsOn ? 'ON' : 'OFF'}`
                      : `Headlight: ${headlightsOn ? 'ON' : 'OFF'}`}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="toggle-taillights"
                  className={taillightsOn ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => {
                    const next = !taillightsOn;
                    setTaillightsOn(next);
                    sceneRef.current?.setLights({ taillights: next });
                  }}
                >
                  <Lightbulb size={13} />
                  <span>
                    {locale === 'ja'
                      ? `尾灯(赤): ${taillightsOn ? 'ON' : 'OFF'}`
                      : `Taillight: ${taillightsOn ? 'ON' : 'OFF'}`}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="toggle-cabin-lights"
                  className={interiorLightsOn ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => {
                    const next = !interiorLightsOn;
                    setInteriorLightsOn(next);
                    sceneRef.current?.setLights({ interiorLights: next });
                  }}
                >
                  <Lightbulb size={13} />
                  <span>
                    {locale === 'ja'
                      ? `室内灯: ${interiorLightsOn ? 'ON' : 'OFF'}`
                      : `Cabin Glow: ${interiorLightsOn ? 'ON' : 'OFF'}`}
                  </span>
                </button>
              </div>
            </div>

            {/* 3. 3-Tier LOD Control & Polygon Budget */}
            <div className="card">
              <div className="section-title">
                <span>{locale === 'ja' ? '3. 3段階 LOD 切替＆ポリゴン予算' : '3. 3-Tier LOD & Polygon Budget'}</span>
                <span className="badge mono" data-testid="active-lod-badge">
                  LOD: {telemetry?.activeLod?.toUpperCase() ?? lodMode.toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                {(['high', 'medium', 'low', 'auto'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    data-testid={`lod-btn-${tier}`}
                    className={lodMode === tier ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '5px 4px', fontSize: 11.5 }}
                    onClick={() => handleChangeLod(tier)}
                  >
                    {tier === 'high'
                      ? 'LOD0 (High)'
                      : tier === 'medium'
                        ? 'LOD1 (Mid)'
                        : tier === 'low'
                          ? 'LOD2 (Low)'
                          : 'Auto'}
                  </button>
                ))}
              </div>

              {telemetry && (
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    marginTop: 8,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 4,
                  }}
                  data-testid="lod-triangle-breakdown"
                >
                  <div className="card-subtle" style={{ padding: 6 }}>
                    <div className="muted">LOD0 (High)</div>
                    <strong>{telemetry.lodTrianglesByTier.high.toLocaleString()} tris</strong>
                  </div>
                  <div className="card-subtle" style={{ padding: 6 }}>
                    <div className="muted">LOD1 (Mid)</div>
                    <strong>{telemetry.lodTrianglesByTier.medium.toLocaleString()} tris</strong>
                  </div>
                  <div className="card-subtle" style={{ padding: 6 }}>
                    <div className="muted">LOD2 (Low)</div>
                    <strong>{telemetry.lodTrianglesByTier.low.toLocaleString()} tris</strong>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Multi-Car Consist & Curve Running Simulation */}
            <div className="card">
              <div className="section-title">
                <span>
                  {locale === 'ja'
                    ? '4. 編成両数・曲線軌道＆台車追従'
                    : '4. Consist Formation & Curve Articulation'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12 }}>
                  {locale === 'ja' ? '編成両数:' : 'Cars:'}
                </span>
                {[2, 3, 4, 6, 8, 10, 11].map((n) => (
                  <button
                    key={n}
                    type="button"
                    data-testid={`car-count-btn-${n}`}
                    className={carCount === n ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '3px 8px', fontSize: 11.5 }}
                    onClick={() => {
                      if (showcaseMode !== 'single_focus') {
                        handleSwitchShowcaseMode('single_focus');
                      }
                      handleChangeCarCount(n);
                    }}
                  >
                    {n}
                    {locale === 'ja' ? '両' : 'c'}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 5,
                  marginTop: 8,
                }}
              >
                {(['straight', 's_curve', 'oval_loop'] as const).map((tk) => (
                  <button
                    key={tk}
                    type="button"
                    data-testid={`track-kind-${tk}`}
                    className={trackKind === tk ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: 11.5 }}
                    onClick={() => {
                      if (showcaseMode !== 'single_focus') {
                        handleSwitchShowcaseMode('single_focus');
                      }
                      handleChangeTrackKind(tk);
                    }}
                  >
                    {tk === 'straight'
                      ? locale === 'ja'
                        ? '直線軌道'
                        : 'Straight'
                      : tk === 's_curve'
                        ? locale === 'ja'
                          ? 'S字曲線＋勾配'
                          : 'S-Curve + Ramp'
                        : locale === 'ja'
                          ? '環状オーバル'
                          : 'Oval Loop'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  data-testid="toggle-curve-run"
                  className={running ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => {
                    if (showcaseMode !== 'single_focus') {
                      handleSwitchShowcaseMode('single_focus');
                    }
                    handleToggleRunning();
                  }}
                >
                  {running ? <Pause size={13} /> : <Play size={13} />}
                  <span>
                    {running
                      ? locale === 'ja'
                        ? '曲線走行 停止'
                        : 'Pause Run'
                      : locale === 'ja'
                        ? '曲線走行 開始'
                        : 'Start Curve Run'}
                  </span>
                </button>

                <label style={{ flex: 1, fontSize: 11.5 }}>
                  <span>
                    {locale === 'ja' ? '速度' : 'Speed'}: <strong className="mono">{speedKmh} km/h</strong>
                  </span>
                  <input
                    type="range"
                    min={15}
                    max={120}
                    step={5}
                    style={{ width: '100%' }}
                    value={speedKmh}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSpeedKmh(val);
                      sceneRef.current?.setSpeedKmh(val);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* 5. glTF 2.0 (.glb) Binary Verification & Export */}
            <div className="card">
              <div className="section-title">
                <span>{locale === 'ja' ? '5. glTF 2.0 (.glb) 資産検証' : '5. glTF 2.0 (.glb) Asset Verification'}</span>
                <Box size={14} />
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  data-testid="verify-glb-btn"
                  onClick={() => void handleVerifyOrDownloadGlb(false)}
                >
                  <FileCheck size={13} />
                  <span>{locale === 'ja' ? 'GLB バイナリ検証' : 'Verify GLB Binary'}</span>
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  data-testid="download-glb-btn"
                  onClick={() => void handleVerifyOrDownloadGlb(true)}
                >
                  <Download size={13} />
                  <span>{locale === 'ja' ? '.glb エクスポート' : 'Export .glb'}</span>
                </button>
              </div>

              {glbInspection && (
                <div
                  className="card-subtle mono"
                  style={{ fontSize: 11, marginTop: 8, padding: 8 }}
                  data-testid="glb-inspection-panel"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ok)' }}>
                    <CheckCircle2 size={13} />
                    <strong>
                      glTF {glbInspection.version}.0 Binary ({glbInspection.magicText}) ·{' '}
                      {(glbInspection.totalByteLength / 1024).toFixed(1)} KB
                    </strong>
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Nodes: {glbInspection.nodeCount} · Meshes: {glbInspection.meshCount} · Materials:{' '}
                    {glbInspection.materialCount} · Accessors: {glbInspection.accessorCount}
                  </div>
                  {preloadedGlbStatus && (
                    <div style={{ marginTop: 3, color: 'var(--accent)' }}>
                      Cache: {preloadedGlbStatus}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. Active Series Official Specifications & Asset Credibility (Requirement #5) */}
            <div className="card" data-testid="spec-credibility-card">
              <div className="section-title">
                <span>
                  {locale === 'ja'
                    ? '6. 車両主要諸元・出典・ライセンス・簡略化記録'
                    : '6. Specifications, Sources & Credibility'}
                </span>
                <ShieldCheck size={14} />
              </div>

              <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                <div>
                  <strong>{activeSpec.names.ja}</strong>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {activeSpec.names.en} · {activeSpec.credibility.manufacturerAndDesigner}
                  </div>
                </div>

                <table className="spec-table" style={{ width: '100%', fontSize: 11.5, marginTop: 8 }}>
                  <tbody>
                    <tr>
                      <td className="muted">{locale === 'ja' ? '車体寸法 (長×幅×高)' : 'Dimensions (L×W×H)'}</td>
                      <td className="mono">
                        {activeSpec.dimensions.couplerLengthM.toFixed(2)}m ×{' '}
                        {activeSpec.dimensions.bodyWidthM.toFixed(3)}m ×{' '}
                        {activeSpec.dimensions.roofHeightM.toFixed(3)}m
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">{locale === 'ja' ? '軌間 / 台車中心間距離' : 'Gauge / Bogie Span'}</td>
                      <td className="mono">
                        {(activeSpec.dimensions.trackGaugeM * 1000).toFixed(0)}mm /{' '}
                        {activeSpec.dimensions.bogieCenterDistanceM.toFixed(2)}m ({activeSpec.bogieModel})
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">{locale === 'ja' ? '電化・集電方式' : 'Electrification'}</td>
                      <td>
                        {activeSpec.electrification === 'third_rail_600v_dc'
                          ? 'DC 600V 第三軌条集電（屋根パンタ無し・台車集電靴）'
                          : `DC 1,500V 架空電車線（${activeSpec.pantographModel}）`}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">{locale === 'ja' ? '片側客用扉 / 最高速度' : 'Doors / Max Speed'}</td>
                      <td>
                        {activeSpec.dimensions.doorsPerSide}扉 ({activeSpec.dimensions.doorWidthM}m幅) /{' '}
                        {activeSpec.maxOperatingSpeedKmh} km/h
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">{locale === 'ja' ? 'アセットライセンス' : 'Asset License'}</td>
                      <td>{activeSpec.credibility.assetLicense}</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ marginTop: 8 }}>
                  <strong style={{ fontSize: 11.5 }}>
                    {locale === 'ja' ? '外観再現のポイント:' : 'Accuracy Highlights:'}
                  </strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11 }}>
                    {activeSpec.credibility.accuracyHighlights.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: 8 }}>
                  <strong style={{ fontSize: 11.5 }}>
                    {locale === 'ja' ? '既知の簡略化と商標配慮:' : 'Known Simplifications & Trademarks:'}
                  </strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11 }} className="muted">
                    {activeSpec.credibility.knownSimplifications.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                    <li>{activeSpec.credibility.copyrightComplianceNotes}</li>
                  </ul>
                </div>

                <div style={{ marginTop: 8, fontSize: 10.5 }} className="muted">
                  <strong>{locale === 'ja' ? '参照公式資料:' : 'Official Sources:'}</strong>{' '}
                  {ROLLING_STOCK_SOURCES.filter((s) =>
                    activeSpec.credibility.sourceIds.includes(s.id),
                  )
                    .map((s) => `${s.title} (${s.publisher})`)
                    .join(' / ')}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* 3D Interactive Viewport */}
        <div className="canvas-pane">
          <div
            ref={mountRef}
            className="map-container"
            aria-label="3D Japanese Rolling Stock Interactive Viewport"
          />

          {/* Top Camera Preset Bar */}
          <div className="map-overlay-top" style={{ right: 12 }}>
            <div className="hub-bar" role="group" aria-label="Camera Inspection Presets">
              <span
                className="hub-chip"
                style={{ background: 'var(--bg-elevated)', fontWeight: 700 }}
              >
                <Camera size={12} />
                <span>{locale === 'ja' ? '検査カメラ:' : 'Camera:'}</span>
              </span>
              {(
                [
                  { id: 'lineup_front', ja: '3車種 前面比較', en: '3-Cab Front Lineup', mode: 'all_comparison' },
                  { id: 'lineup_side', ja: '3車種 側面・寸法比較', en: '3-Train Side Lineup', mode: 'all_comparison' },
                  { id: 'lineup_far', ja: '遠距離 視認性検証 (150m+)', en: 'Far Distance Test', mode: 'all_comparison' },
                  { id: 'cab_closeup', ja: '先頭車 運転台・前照灯アップ', en: 'Lead Cab Close-Up', mode: 'single_focus' },
                  { id: 'door_side', ja: '側面 客用扉・台車アップ', en: 'Side Doors & Bogie', mode: 'single_focus' },
                  { id: 'roof_panto', ja: '屋根・空調・パンタ・連結幌', en: 'Roof & Pantograph', mode: 'single_focus' },
                  { id: 'rear_tail', ja: '後尾車 尾灯アップ', en: 'Rear Tail Lights', mode: 'single_focus' },
                  { id: 'curve_overview', ja: '曲線編成 全景', en: 'Curve Consist Overview', mode: 'single_focus' },
                ] as {
                  id: PreviewCameraPreset;
                  ja: string;
                  en: string;
                  mode: PreviewShowcaseMode;
                }[]
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="hub-chip"
                  data-testid={`cam-preset-${preset.id}`}
                  onClick={() => {
                    if (showcaseMode !== preset.mode) {
                      handleSwitchShowcaseMode(preset.mode);
                    }
                    sceneRef.current?.applyCameraPreset(preset.id);
                  }}
                >
                  {locale === 'ja' ? preset.ja : preset.en}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom-Right Live 3D Telemetry Chip */}
          {telemetry && (
            <div
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                zIndex: 4,
                pointerEvents: 'none',
              }}
            >
              <div
                className="telemetry-chip mono"
                style={{ position: 'static' }}
                data-testid="rolling-stock-telemetry"
              >
                {telemetry.fps} FPS · DC:{telemetry.drawCalls} · Rendered Tris:
                {telemetry.renderedTriangles.toLocaleString()} · Series:{telemetry.activeSeriesId} ·
                LOD:{telemetry.activeLod.toUpperCase()} · {telemetry.carCount} Cars (
                {telemetry.totalConsistLengthM.toFixed(0)}m) · Dir:{telemetry.travelDirection}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
