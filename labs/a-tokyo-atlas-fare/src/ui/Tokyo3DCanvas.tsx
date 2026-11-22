import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpFromLine,
  EyeOff,
  Layers,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Square,
  Sun,
} from 'lucide-react';
import {
  SCHEMATIC_TIERS,
  type SchematicTierId,
} from '../domain/elevationSolver.js';
import type {
  AtlasDataset,
  FareQuote,
  OsmVerticalDataset,
  SkId,
} from '../domain/types.js';
import { TOKYO_HUB_PRESETS } from '../three/geoProjection.js';
import { Metropolitan3DScene } from '../three/Metropolitan3DScene.js';
import type {
  LineTraceStatus,
  SceneTelemetry,
  UndergroundViewSettings,
} from '../three/types.js';
import { UI_TEXT, type Locale } from './i18n.js';

interface Tokyo3DCanvasProps {
  dataset: AtlasDataset;
  osmVertical: OsmVerticalDataset | null;
  theme: 'light' | 'dark';
  locale: Locale;
  visibleOperatorIds: Set<SkId<'operator'>>;
  selectedLineId: SkId<'line'> | null;
  selectedStationId: SkId<'station'> | null;
  fareSliceOnly: boolean;
  fareQuote: FareQuote | null;
  initialViewport: { lon: number; lat: number; zoom: number } | null;
  onViewportChange: (lon: number, lat: number, zoom: number) => void;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
}

const DEFAULT_VISIBLE_TIERS: Record<SchematicTierId, boolean> = {
  'L+2': true,
  'L+1': true,
  L0: true,
  'L-1': true,
  'L-2': true,
  'L-3': true,
  'L-4': true,
};

export const Tokyo3DCanvas: React.FC<Tokyo3DCanvasProps> = ({
  dataset,
  osmVertical,
  theme,
  locale,
  visibleOperatorIds,
  selectedLineId,
  selectedStationId,
  fareSliceOnly,
  fareQuote,
  initialViewport,
  onViewportChange,
  onSelectStation,
  onSelectLine,
}) => {
  const t = UI_TEXT[locale];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Metropolitan3DScene | null>(null);

  // Latest callbacks stored in refs so Three.js scene doesn't recreate on callback identity change
  const cbRef = useRef({ onSelectStation, onSelectLine, onViewportChange });
  cbRef.current = { onSelectStation, onSelectLine, onViewportChange };

  const [underground, setUnderground] = useState<UndergroundViewSettings>({
    enabled: false,
    groundOpacity: 0.94,
    cutawayRadius: 850,
    verticalExaggeration: 1.4,
    pinCutaway: false,
    hideBuildings: false,
    clipEnabled: false,
    clipY: 20,
    visibleTiers: { ...DEFAULT_VISIBLE_TIERS },
  });

  const [telemetry, setTelemetry] = useState<SceneTelemetry | null>(null);
  const [traceStatus, setTraceStatus] = useState<LineTraceStatus>({
    active: false,
    playing: false,
    lineId: null,
    progress: 0,
    currentStationName: null,
    currentTier: null,
    currentY: null,
  });
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [sceneNight, setSceneNight] = useState(theme === 'dark');

  // Sync 3D lighting when global light/dark theme switches
  useEffect(() => {
    setSceneNight(theme === 'dark');
  }, [theme]);

  const selectedLine = useMemo(
    () => dataset.railLines.find((l) => l.id === selectedLineId) ?? null,
    [dataset.railLines, selectedLineId],
  );

  // Initialize Three.js Metropolitan3DScene once (re-init only if osmVertical arrives after mount)
  useEffect(() => {
    if (!mountRef.current) return;
    const ctrl = new Metropolitan3DScene(
      mountRef.current,
      dataset,
      osmVertical,
      sceneNight,
      {
        onSelectStation: (sid) => cbRef.current.onSelectStation(sid),
        onSelectLine: (lid) => cbRef.current.onSelectLine(lid),
        onTelemetry: (stats) => setTelemetry(stats),
        onTraceUpdate: (st) => setTraceStatus(st),
        onCameraMoved: (lon, lat, zoom) => cbRef.current.onViewportChange(lon, lat, zoom),
      },
      initialViewport ?? undefined,
    );
    sceneRef.current = ctrl;

    return () => {
      ctrl.dispose();
      sceneRef.current = null;
    };
  }, [dataset, osmVertical]);

  // Sync Day / Night 3D lighting without recreating scene
  useEffect(() => {
    sceneRef.current?.setTheme(sceneNight);
  }, [sceneNight]);

  // Sync filters, selection & Underground View settings
  useEffect(() => {
    sceneRef.current?.applyFilters({
      visibleOperatorIds,
      selectedLineId,
      selectedStationId,
      fareSliceOnly,
      underground,
    });
  }, [visibleOperatorIds, selectedLineId, selectedStationId, fareSliceOnly, underground]);

  // Sync JR Fare dual-path highlight
  useEffect(() => {
    sceneRef.current?.setFareQuote(fareQuote);
  }, [fareQuote]);

  // Auto-focus selected station when changed from search/sidebar
  const prevStationRef = useRef<SkId<'station'> | null>(null);
  useEffect(() => {
    if (selectedStationId && selectedStationId !== prevStationRef.current) {
      sceneRef.current?.flyToStation(selectedStationId);
    }
    prevStationRef.current = selectedStationId;
  }, [selectedStationId]);

  const handleToggleUnderground = () => {
    setUnderground((prev) => ({
      ...prev,
      enabled: !prev.enabled,
      groundOpacity: !prev.enabled ? 0.94 : 1.0,
      verticalExaggeration: !prev.enabled ? Math.max(1.3, prev.verticalExaggeration) : 1.0,
    }));
  };

  const handleReturnToSurface = () => {
    setUnderground((prev) => ({
      ...prev,
      enabled: false,
      groundOpacity: 1.0,
      hideBuildings: false,
      clipEnabled: false,
      pinCutaway: false,
      verticalExaggeration: 1.0,
      visibleTiers: { ...DEFAULT_VISIBLE_TIERS },
    }));
  };

  const handleToggleTier = (tierId: SchematicTierId) => {
    setUnderground((prev) => ({
      ...prev,
      visibleTiers: {
        ...prev.visibleTiers,
        [tierId]: !prev.visibleTiers[tierId],
      },
    }));
  };

  const handleHubClick = (presetId: string) => {
    const preset = TOKYO_HUB_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    sceneRef.current?.flyToHubPreset(preset);
    if (preset.recommendUnderground) {
      setUnderground((prev) => ({
        ...prev,
        enabled: true,
        groundOpacity: 0.94,
        verticalExaggeration: Math.max(1.3, prev.verticalExaggeration),
      }));
    }
  };

  const handleStartOrToggleTrace = () => {
    if (!selectedLineId || !sceneRef.current) return;
    if (traceStatus.active && traceStatus.lineId === selectedLineId) {
      sceneRef.current.setLineTracePlaying(!traceStatus.playing);
    } else {
      // Enable radial underground cutaway automatically when tracing a metro line!
      const isMetro = selectedLine?.lineClass === 'metro';
      if (isMetro && !underground.enabled) {
        setUnderground((prev) => ({
          ...prev,
          enabled: true,
          groundOpacity: 0.94,
          pinCutaway: false,
          verticalExaggeration: 1.4,
        }));
      }
      sceneRef.current.startLineTrace(selectedLineId, true);
    }
  };

  return (
    <div className="canvas-pane" data-testid="tokyo-3d-pane">
      <div
        ref={mountRef}
        className="map-container"
        aria-label={
          locale === 'ja'
            ? '東京大都市3D鉄道・地下トンネルインタラクティブ空間'
            : 'Tokyo Metropolitan 3D Railway & Underground Tunnel Scene'
        }
      />

      {/* Top Honesty Banner + Hub Focus Shortcuts */}
      <div className="map-overlay-top" style={{ right: 12 }}>
        <div className="banner banner-warning" data-testid="vertical-3d-banner">
          <span>
            <strong>
              {locale === 'ja'
                ? '3D 都市鉄道アトラス（模式相対高度）:'
                : '3D Metropolitan Atlas (Schematic Tiers):'}
            </strong>{' '}
            {t.vertical3dBanner}
          </span>
        </div>

        <div className="hub-bar" role="group" aria-label="Hub Focus Shortcuts">
          {TOKYO_HUB_PRESETS.map((hub) => (
            <button
              key={hub.id}
              type="button"
              className="hub-chip"
              data-testid={`hub-btn-${hub.id}`}
              onClick={() => handleHubClick(hub.id)}
            >
              {locale === 'ja' ? hub.labelJa : hub.labelEn}
            </button>
          ))}
          <button
            type="button"
            className="hub-chip"
            data-testid="toggle-3d-day-night"
            title={locale === 'ja' ? '昼 / 夜間照明切替' : 'Toggle Day / Night Lighting'}
            onClick={() => setSceneNight((n) => !n)}
          >
            {sceneNight ? <Sun size={12} /> : <Moon size={12} />}
            <span>
              {sceneNight
                ? locale === 'ja'
                  ? '昼間'
                  : 'Day'
                : locale === 'ja'
                  ? '夜間'
                  : 'Night'}
            </span>
          </button>
          <button
            type="button"
            className="hub-chip"
            data-testid="reset-3d-camera"
            title={locale === 'ja' ? '視点リセット' : 'Reset Camera'}
            onClick={() => handleHubClick('tokyo23')}
          >
            <RotateCcw size={12} />
            <span>{locale === 'ja' ? 'リセット' : 'Reset'}</span>
          </button>
          {underground.enabled && (
            <button
              type="button"
              className="hub-chip"
              style={{
                background: 'var(--accent)',
                color: '#ffffff',
                borderColor: 'var(--accent)',
              }}
              data-testid="return-to-surface-btn"
              onClick={handleReturnToSurface}
            >
              <ArrowUpFromLine size={12} />
              <span>{locale === 'ja' ? '地上ビューへ戻る' : 'Return to Surface'}</span>
            </button>
          )}
        </div>

        {fareQuote && fareQuote.pathsDiffer && (
          <div className="banner banner-ok" data-testid="path-diff-banner">
            <span>
              <strong>{t.pathsDifferBadge}:</strong> {fareQuote.pathDiffSummary}
            </span>
          </div>
        )}
      </div>

      {/* Underground View & Depth Tier Floating HUD (Bottom-Left) */}
      <div className="underground-hud" data-testid="underground-control-panel">
        <div className="underground-hud-header">
          <button
            type="button"
            className={`btn-underground ${underground.enabled ? 'active' : ''}`}
            data-testid="toggle-underground-view"
            onClick={handleToggleUnderground}
          >
            {underground.enabled ? <Layers size={14} /> : <EyeOff size={14} />}
            <span>
              {locale === 'ja'
                ? underground.enabled
                  ? '地下カットアウェイ ON'
                  : '地下エクスプローラー'
                : underground.enabled
                  ? 'Underground Cutaway ON'
                  : 'Underground Explorer'}
            </span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '3px 7px', fontSize: 11 }}
            onClick={() => setHudCollapsed((c) => !c)}
          >
            {hudCollapsed ? '＋' : '－'}
          </button>
        </div>

        {!hudCollapsed && (
          <div className="underground-hud-body">
            {underground.enabled && (
              <>
                <label className="hud-slider-row">
                  <span>
                    {locale === 'ja' ? '開削半径' : 'Cutaway Radius'}:{' '}
                    <strong className="mono">{underground.cutawayRadius}m</strong>
                  </span>
                  <input
                    type="range"
                    min={350}
                    max={2400}
                    step={50}
                    data-testid="cutaway-radius-slider"
                    value={underground.cutawayRadius}
                    onChange={(e) =>
                      setUnderground((prev) => ({
                        ...prev,
                        cutawayRadius: Number(e.target.value),
                      }))
                    }
                  />
                </label>

                <label className="hud-slider-row">
                  <span>
                    {locale === 'ja' ? '縦方向誇張 (視認用)' : 'Vertical Exaggeration'}:{' '}
                    <strong className="mono">{underground.verticalExaggeration.toFixed(1)}×</strong>
                  </span>
                  <input
                    type="range"
                    min={1.0}
                    max={2.5}
                    step={0.1}
                    data-testid="vertical-exaggeration-slider"
                    value={underground.verticalExaggeration}
                    onChange={(e) =>
                      setUnderground((prev) => ({
                        ...prev,
                        verticalExaggeration: Number(e.target.value),
                      }))
                    }
                  />
                </label>

                <label className="hud-slider-row">
                  <span>
                    {locale === 'ja' ? '外周地表の不透明度' : 'Outer Ground Opacity'}:{' '}
                    <strong className="mono">{Math.round(underground.groundOpacity * 100)}%</strong>
                  </span>
                  <input
                    type="range"
                    min={0.12}
                    max={1}
                    step={0.04}
                    data-testid="ground-opacity-slider"
                    value={underground.groundOpacity}
                    onChange={(e) =>
                      setUnderground((prev) => ({
                        ...prev,
                        groundOpacity: Number(e.target.value),
                      }))
                    }
                  />
                </label>

                <label className="hud-check-row">
                  <input
                    type="checkbox"
                    data-testid="pin-cutaway-checkbox"
                    checked={underground.pinCutaway}
                    onChange={(e) =>
                      setUnderground((prev) => ({ ...prev, pinCutaway: e.target.checked }))
                    }
                  />
                  <span>
                    {locale === 'ja' ? '開削位置を固定 (カメラ追従OFF)' : 'Pin Cutaway Location'}
                  </span>
                </label>
              </>
            )}

            <label className="hud-check-row">
              <input
                type="checkbox"
                data-testid="hide-buildings-checkbox"
                checked={underground.hideBuildings}
                onChange={(e) =>
                  setUnderground((prev) => ({ ...prev, hideBuildings: e.target.checked }))
                }
              />
              <span>{locale === 'ja' ? '地上建物を非表示' : 'Hide Ground Buildings'}</span>
            </label>

            <label className="hud-check-row">
              <input
                type="checkbox"
                data-testid="clip-plane-checkbox"
                checked={underground.clipEnabled}
                onChange={(e) =>
                  setUnderground((prev) => ({ ...prev, clipEnabled: e.target.checked }))
                }
              />
              <Scissors size={12} />
              <span>
                {locale === 'ja' ? '水平断面スライス' : 'Depth Slice Plane'}{' '}
                {underground.clipEnabled && <strong className="mono">y ≤ {underground.clipY}</strong>}
              </span>
            </label>

            {underground.clipEnabled && (
              <input
                type="range"
                min={-42}
                max={35}
                step={1}
                data-testid="clip-plane-slider"
                value={underground.clipY}
                onChange={(e) =>
                  setUnderground((prev) => ({ ...prev, clipY: Number(e.target.value) }))
                }
              />
            )}

            <div className="tier-grid" role="group" aria-label="Elevation Tier Filters">
              {SCHEMATIC_TIERS.map((tier) => {
                const active = underground.visibleTiers[tier.id];
                return (
                  <button
                    key={tier.id}
                    type="button"
                    data-testid={`tier-toggle-${tier.id}`}
                    className={`tier-pill ${active ? 'active' : ''}`}
                    onClick={() => handleToggleTier(tier.id)}
                  >
                    {locale === 'ja' ? tier.labelJa : tier.labelEn}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Line Trace Fly-Through Control Bar (appears when any line is selected!) */}
      {selectedLine && (
        <div className="trace-hud" data-testid="line-trace-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className="line-dot" style={{ background: selectedLine.color }} />
            <strong style={{ fontSize: 12 }}>
              {locale === 'ja' ? selectedLine.names.ja : selectedLine.names.en ?? selectedLine.names.ja}
            </strong>
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '3px 9px', fontSize: 11 }}
              data-testid="line-trace-play-btn"
              onClick={handleStartOrToggleTrace}
            >
              {traceStatus.active && traceStatus.playing && traceStatus.lineId === selectedLine.id ? (
                <>
                  <Pause size={12} />
                  <span>{locale === 'ja' ? '一時停止' : 'Pause'}</span>
                </>
              ) : (
                <>
                  <Play size={12} />
                  <span>{locale === 'ja' ? '沿線カメラ追跡' : 'Trace Line'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => sceneRef.current?.flyToLine(selectedLine.id)}
            >
              {locale === 'ja' ? '全景フォーカス' : 'Fit Line'}
            </button>
            {traceStatus.active && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '3px 7px', fontSize: 11 }}
                onClick={() => sceneRef.current?.stopLineTrace()}
              >
                <Square size={11} />
              </button>
            )}
          </div>
          {traceStatus.active && traceStatus.lineId === selectedLine.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                style={{ flex: 1 }}
                data-testid="line-trace-scrubber"
                value={traceStatus.progress}
                onChange={(e) => sceneRef.current?.setLineTraceProgress(Number(e.target.value))}
              />
              <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {traceStatus.currentStationName ?? ''} · {traceStatus.currentTier} (y=
                {traceStatus.currentY})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bottom-Right Live Streaming / LOD / GPU Telemetry */}
      {telemetry && (
        <div className="telemetry-chip mono" data-testid="three-telemetry">
          {telemetry.fps > 0 ? `${telemetry.fps} FPS · ` : ''}
          DC:{telemetry.drawCalls} · Tris:{Math.round(telemetry.triangles / 1000)}k
          {telemetry.railwayLod ? ` · Rail:${telemetry.railwayLod}` : ''} · Chunks{' '}
          {telemetry.loadedChunks}/{telemetry.totalChunks} (L0:{telemetry.lod0Chunks}/L1:
          {telemetry.lod1Chunks}) · Bldgs {telemetry.renderedBuildings.toLocaleString()}
          {typeof telemetry.infillBuildings === 'number' && telemetry.infillBuildings > 0
            ? ` (OSM ${(telemetry.realOsmBuildings ?? 0).toLocaleString()} + Infill ${telemetry.infillBuildings.toLocaleString()})`
            : ''}
        </div>
      )}
    </div>
  );
};
