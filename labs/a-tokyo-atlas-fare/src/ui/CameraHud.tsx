import React, { useState } from 'react';
import {
  ArrowUpFromLine,
  Building2,
  Compass,
  Eye,
  HelpCircle,
  Layers,
  MapPin,
  Moon,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Square,
  Sun,
  TrainFront,
  Video,
} from 'lucide-react';
import type { SimulatedTrainState, TunnelCutawayStyle } from '../contracts/atlasV2.js';
import { SCHEMATIC_TIERS } from '../domain/elevationSolver.js';
import type { AtlasDataset, FareQuote, SkId } from '../domain/types.js';
import {
  CAMERA_MODE_METADATA,
  type CameraModeAction,
  type CameraModeId,
  type CameraModeState,
  type CameraMoveSpeed,
  type TrainFollowRig,
} from '../three/camera/cameraModeStateMachine.js';
import type { CameraOrientationInfo } from '../three/camera/collisionGuard.js';
import type { UndergroundExplorerLocation } from '../three/camera/controllerBridge.js';
import type { PlacedMapLabel } from '../three/camera/labelLayout.js';
import { TOKYO_HUB_PRESETS } from '../three/geoProjection.js';
import type { LineTraceStatus, SceneTelemetry } from '../three/types.js';
import { UI_TEXT, type Locale } from './i18n.js';

interface MapLabelsOverlayProps {
  labels: PlacedMapLabel[];
  onLabelClick: (label: PlacedMapLabel) => void;
}

export const MapLabelsOverlay: React.FC<MapLabelsOverlayProps> = ({
  labels,
  onLabelClick,
}) => {
  if (labels.length === 0) return null;

  return (
    <div
      className="map-labels-layer"
      data-testid="map-labels-overlay"
      aria-label="3D Map Spatial Labels"
    >
      {labels.map((lbl) => {
        const clickable = Boolean(
          lbl.entityKind === 'station' ||
            lbl.entityKind === 'line' ||
            lbl.entityKind === 'train',
        );
        return (
          <button
            key={lbl.id}
            type="button"
            data-testid={`map-label-${lbl.id}`}
            data-label-kind={lbl.kind}
            disabled={!clickable}
            onClick={() => clickable && onLabelClick(lbl)}
            className={`map-label-pill kind-${lbl.kind} ${lbl.highlighted ? 'highlighted' : ''}`}
            style={{
              transform: `translate3d(${lbl.boxX}px, ${lbl.boxY}px, 0)`,
              width: lbl.width,
              opacity: lbl.opacity,
              borderLeftColor: lbl.color ?? undefined,
            }}
            title={
              lbl.textSecondary
                ? `${lbl.textPrimary} (${lbl.textSecondary})`
                : lbl.textPrimary
            }
          >
            <div className="map-label-row">
              {lbl.color && (
                <span className="map-label-dot" style={{ background: lbl.color }} />
              )}
              <span className="map-label-primary">{lbl.textPrimary}</span>
              {lbl.badge && <span className="map-label-badge">{lbl.badge}</span>}
            </div>
            {lbl.textSecondary && (
              <div className="map-label-secondary">{lbl.textSecondary}</div>
            )}
          </button>
        );
      })}
    </div>
  );
};

interface CameraHudProps {
  dataset: AtlasDataset;
  locale: Locale;
  modeState: CameraModeState;
  sceneNight: boolean;
  fareQuote: FareQuote | null;
  selectedLineId: SkId<'line'> | null;
  orientation: CameraOrientationInfo | null;
  explorerLoc: UndergroundExplorerLocation | null;
  followedTrain: SimulatedTrainState | null;
  fallbackTrainId: string | null;
  telemetry: SceneTelemetry | null;
  traceStatus: LineTraceStatus;
  onDispatch: (action: CameraModeAction) => void;
  onSelectHub: (hubId: string) => void;
  onJumpExplorerLine: (lineId: SkId<'line'>) => void;
  onToggleNight: () => void;
  onStartOrToggleTrace: () => void;
  onStopTrace: () => void;
  onTraceProgress: (progress: number) => void;
  onFitLine: (lineId: SkId<'line'>) => void;
}

const MODE_ORDER: CameraModeId[] = [
  'city_overview',
  'street_level',
  'underground_cutaway',
  'underground_explorer',
  'train_follow',
];

const MODE_ICONS: Record<CameraModeId, React.ReactNode> = {
  city_overview: <Compass size={13} />,
  street_level: <Building2 size={13} />,
  underground_cutaway: <Layers size={13} />,
  underground_explorer: <Navigation size={13} />,
  train_follow: <TrainFront size={13} />,
};

const FOLLOW_RIGS: { id: TrainFollowRig; labelJa: string; labelEn: string }[] = [
  { id: 'cab', labelJa: '運転台前望', labelEn: 'Cab' },
  { id: 'front', labelJa: '先頭側面', labelEn: 'Front' },
  { id: 'side', labelJa: '側面', labelEn: 'Side' },
  { id: 'chase', labelJa: '後方追尾', labelEn: 'Rear' },
  { id: 'overhead_cutaway', labelJa: '俯瞰開削', labelEn: 'Overhead' },
];

export const CameraHud: React.FC<CameraHudProps> = ({
  dataset,
  locale,
  modeState,
  sceneNight,
  fareQuote,
  selectedLineId,
  orientation,
  explorerLoc,
  followedTrain,
  fallbackTrainId,
  telemetry,
  traceStatus,
  onDispatch,
  onSelectHub,
  onJumpExplorerLine,
  onToggleNight,
  onStartOrToggleTrace,
  onStopTrace,
  onTraceProgress,
  onFitLine,
}) => {
  const t = UI_TEXT[locale];
  const [helpOpen, setHelpOpen] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);

  const meta = CAMERA_MODE_METADATA[modeState.mode];
  const isUndergroundMode =
    modeState.mode === 'underground_cutaway' ||
    modeState.mode === 'underground_explorer' ||
    (modeState.mode === 'train_follow' && Boolean(followedTrain?.isUnderground));
  const selectedLine = dataset.railLines.find((l) => l.id === selectedLineId) ?? null;

  return (
    <>
      {/* 1. Top Precision HUD: 5-Mode State Machine Switcher, Free Look, Hubs, Reset, Return to Surface */}
      <div className="map-overlay-top" style={{ right: 12 }}>
        <div className="ux-top-bar">
          <div className="ux-mode-group" role="group" aria-label="Camera Viewing Modes">
            <span
              className={`ux-active-mode-badge mode-${modeState.mode}`}
              data-testid="active-mode-badge"
              title={locale === 'ja' ? meta.descriptionJa : meta.descriptionEn}
            >
              {MODE_ICONS[modeState.mode]}
              <span>{locale === 'ja' ? meta.labelJa : meta.labelEn}</span>
            </span>

            <div className="ux-mode-pills">
              {MODE_ORDER.map((mId) => {
                const mMeta = CAMERA_MODE_METADATA[mId];
                const active = modeState.mode === mId;
                const disabled =
                  mId === 'train_follow' && !fallbackTrainId && !modeState.followedTrainId;
                return (
                  <button
                    key={mId}
                    type="button"
                    disabled={disabled}
                    data-testid={`mode-btn-${mId}`}
                    className={`ux-mode-pill ${active ? 'active' : ''}`}
                    title={locale === 'ja' ? mMeta.descriptionJa : mMeta.descriptionEn}
                    onClick={() =>
                      onDispatch({
                        type: 'SELECT_MODE',
                        mode: mId,
                        trainId:
                          mId === 'train_follow'
                            ? modeState.followedTrainId ?? fallbackTrainId
                            : undefined,
                      })
                    }
                  >
                    {MODE_ICONS[mId]}
                    <span>{locale === 'ja' ? mMeta.shortJa : mMeta.shortEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ux-global-actions">
            {modeState.mode !== 'train_follow' && (
              <button
                type="button"
                className={`hub-chip ${modeState.freeLookEnabled ? 'active-sky' : ''}`}
                data-testid="toggle-camera-mode"
                title={
                  locale === 'ja'
                    ? '自由観察モード切替 (WASD移動 + E/Q昇降 + ドラッグ視点 · キー F)'
                    : 'Toggle Free Look Mode (WASD Move + E/Q Up/Down + Drag Look · Key F)'
                }
                onClick={() => onDispatch({ type: 'TOGGLE_FREE_LOOK' })}
              >
                <Eye size={12} />
                <span>
                  {modeState.freeLookEnabled
                    ? locale === 'ja'
                      ? '自由観察 ON'
                      : 'Free Look ON'
                    : locale === 'ja'
                      ? '自由観察'
                      : 'Free Look'}
                </span>
              </button>
            )}

            {modeState.freeLookEnabled && (
              <select
                className="hub-chip"
                data-testid="free-speed-select"
                aria-label={locale === 'ja' ? '移動速度' : 'Flight Speed'}
                value={modeState.moveSpeed}
                onChange={(e) =>
                  onDispatch({
                    type: 'SET_MOVE_SPEED',
                    speed: e.target.value as CameraMoveSpeed,
                  })
                }
              >
                <option value="slow">{locale === 'ja' ? '速度: 低速' : 'Speed: Slow'}</option>
                <option value="normal">{locale === 'ja' ? '速度: 標準' : 'Speed: Normal'}</option>
                <option value="fast">{locale === 'ja' ? '速度: 高速' : 'Speed: Fast'}</option>
              </select>
            )}

            <button
              type="button"
              className="hub-chip"
              data-testid="toggle-3d-day-night"
              onClick={onToggleNight}
            >
              {sceneNight ? <Sun size={12} /> : <Moon size={12} />}
              <span>
                {sceneNight ? (locale === 'ja' ? '昼間' : 'Day') : locale === 'ja' ? '夜間' : 'Night'}
              </span>
            </button>

            {isUndergroundMode && (
              <button
                type="button"
                className="hub-chip active-accent"
                data-testid="return-to-surface-btn"
                onClick={() => onDispatch({ type: 'RETURN_TO_SURFACE' })}
              >
                <ArrowUpFromLine size={12} />
                <span>{locale === 'ja' ? '地上へ戻る' : 'Return to Surface'}</span>
              </button>
            )}

            <button
              type="button"
              className="hub-chip"
              data-testid="reset-3d-camera"
              title={locale === 'ja' ? '全覧リセット (R)' : 'Reset Camera (R)'}
              onClick={() => onDispatch({ type: 'RESET_OVERVIEW' })}
            >
              <RotateCcw size={12} />
              <span>{locale === 'ja' ? 'リセット' : 'Reset'}</span>
            </button>

            <button
              type="button"
              className={`hub-chip ${helpOpen ? 'active-sky' : ''}`}
              data-testid="toggle-controls-help"
              aria-label="Controls Help"
              onClick={() => setHelpOpen((o) => !o)}
            >
              <HelpCircle size={12} />
            </button>
          </div>
        </div>

        {/* Sub-row: Hub Quick Chips + Honest Schematic Disclaimer */}
        <div className="ux-sub-row">
          <div className="hub-bar" role="group" aria-label="Hub Focus Shortcuts">
            {TOKYO_HUB_PRESETS.map((hub) => (
              <button
                key={hub.id}
                type="button"
                className="hub-chip hub-chip-mini"
                data-testid={`hub-btn-${hub.id}`}
                onClick={() => onSelectHub(hub.id)}
              >
                {locale === 'ja' ? hub.labelJa : hub.labelEn}
              </button>
            ))}
          </div>

          <div className="banner banner-warning ux-compact-banner" data-testid="vertical-3d-banner">
            <span>
              <strong>
                {locale === 'ja' ? '3D 都市鉄道アトラス（模式高度）:' : '3D Schematic Atlas:'}
              </strong>{' '}
              {t.vertical3dBanner}
            </span>
          </div>
        </div>

        {fareQuote && fareQuote.pathsDiffer && (
          <div className="banner banner-ok ux-compact-banner" data-testid="path-diff-banner">
            <span>
              <strong>{t.pathsDifferBadge}:</strong> {fareQuote.pathDiffSummary}
            </span>
          </div>
        )}

        {helpOpen && (
          <div className="ux-help-popover" data-testid="controls-help-popover">
            <div className="ux-help-title">
              {locale === 'ja' ? 'デスクトップ操作ガイド' : 'Desktop Controls Guide'}
            </div>
            <div className="ux-help-grid">
              <span>{locale === 'ja' ? '左クリック' : 'Left Click'}</span>
              <span>{locale === 'ja' ? '駅 / 路線 / 模擬列車を選択' : 'Select Station / Line / Train'}</span>
              <span>{locale === 'ja' ? '左ドラッグ' : 'Left Drag'}</span>
              <span>
                {locale === 'ja'
                  ? '3D回転（自由観察・地下漫遊時は視点方向）'
                  : 'Orbit Rotate (Free Look direction in Explorer/Free)'}
              </span>
              <span>{locale === 'ja' ? '中/右ドラッグ' : 'Middle / Right Drag'}</span>
              <span>{locale === 'ja' ? '地図水平パン移動' : 'Horizontal Ground Pan'}</span>
              <span>{locale === 'ja' ? 'ホイール' : 'Scroll Wheel'}</span>
              <span>
                {locale === 'ja'
                  ? 'ズーム（地下漫遊時はトンネル前進/後退）'
                  : 'Zoom (Advance/Retreat along bore in Explorer)'}
              </span>
              <span>{locale === 'ja' ? 'ダブルクリック' : 'Double Click'}</span>
              <span>{locale === 'ja' ? 'クリック対象へスムーズフォーカス' : 'Smoothly focus target'}</span>
              <span>WASD / Q / E</span>
              <span>
                {locale === 'ja'
                  ? '飛行/トンネル巡航（F: 自由観察 · R: 全覧 · Esc: 戻る）'
                  : 'Flight / Tunnel Cruise (F: Free Look · R: Reset · Esc: Exit)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Top-Left Contextual Line Trace Bar */}
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
              onClick={onStartOrToggleTrace}
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
              onClick={() => onFitLine(selectedLine.id)}
            >
              {locale === 'ja' ? '全景フォーカス' : 'Fit Line'}
            </button>
            {traceStatus.active && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '3px 7px', fontSize: 11 }}
                onClick={onStopTrace}
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
                onChange={(e) => onTraceProgress(Number(e.target.value))}
              />
              <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {traceStatus.currentStationName ?? ''} · {traceStatus.currentTier} (y=
                {traceStatus.currentY})
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Bottom-Left Mode-Context & Underground Control Panel */}
      <div className="underground-hud" data-testid="underground-control-panel">
        <div className="underground-hud-header">
          <button
            type="button"
            className={`btn-underground ${modeState.mode === 'underground_cutaway' ? 'active' : ''}`}
            data-testid="toggle-underground-view"
            onClick={() =>
              onDispatch({
                type: 'SELECT_MODE',
                mode:
                  modeState.mode === 'underground_cutaway'
                    ? 'city_overview'
                    : 'underground_cutaway',
              })
            }
          >
            <Layers size={14} />
            <span>
              {modeState.mode === 'underground_cutaway'
                ? locale === 'ja'
                  ? '地下カットアウェイ ON'
                  : 'Underground Cutaway ON'
                : locale === 'ja'
                  ? '地下カットアウェイ'
                  : 'Underground Cutaway'}
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
            {/* Street-Level Orientation & Speed */}
            {modeState.mode === 'street_level' && (
              <>
                {orientation && (
                  <div className="card-subtle" style={{ padding: '6px 8px' }} data-testid="street-compass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong className="mono">
                        {orientation.cardinal} {orientation.headingDeg}°
                      </strong>
                      <span className="badge">ALT {orientation.altitudeM}m</span>
                    </div>
                    {orientation.nearestAnchor && (
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                        <MapPin size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                        {locale === 'ja'
                          ? `${orientation.nearestAnchor.nameJa} から ${orientation.nearestAnchor.distanceM}m`
                          : `${orientation.nearestAnchor.distanceM}m from ${orientation.nearestAnchor.nameEn}`}
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="exit-street-level-btn"
                  onClick={() => onDispatch({ type: 'SELECT_MODE', mode: 'city_overview' })}
                >
                  {locale === 'ja' ? '都市俯瞰へ戻る' : 'Back to City Overview'}
                </button>
              </>
            )}

            {/* Underground Cutaway Controls */}
            {modeState.mode === 'underground_cutaway' && (
              <>
                <label className="hud-slider-row">
                  <span>
                    {locale === 'ja' ? '開削半径' : 'Cutaway Radius'}:{' '}
                    <strong className="mono">{modeState.cutaway.cutawayRadius}m</strong>
                  </span>
                  <input
                    type="range"
                    min={350}
                    max={2400}
                    step={50}
                    data-testid="cutaway-radius-slider"
                    value={modeState.cutaway.cutawayRadius}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { cutawayRadius: Number(e.target.value) },
                      })
                    }
                  />
                </label>

                <label className="hud-slider-row">
                  <span>
                    {locale === 'ja' ? '縦方向誇張 (視認用)' : 'Vertical Exaggeration'}:{' '}
                    <strong className="mono">{modeState.cutaway.verticalExaggeration.toFixed(1)}×</strong>
                  </span>
                  <input
                    type="range"
                    min={1.0}
                    max={2.5}
                    step={0.1}
                    data-testid="vertical-exaggeration-slider"
                    value={modeState.cutaway.verticalExaggeration}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { verticalExaggeration: Number(e.target.value) },
                      })
                    }
                  />
                </label>

                <label className="hud-slider-row">
                  <span>
                    {locale === 'ja' ? '外周地表不透明度' : 'Outer Ground Opacity'}:{' '}
                    <strong className="mono">{Math.round(modeState.cutaway.groundOpacity * 100)}%</strong>
                  </span>
                  <input
                    type="range"
                    min={0.12}
                    max={1}
                    step={0.04}
                    data-testid="ground-opacity-slider"
                    value={modeState.cutaway.groundOpacity}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { groundOpacity: Number(e.target.value) },
                      })
                    }
                  />
                </label>

                <label className="hud-slider-row">
                  <span>{locale === 'ja' ? 'トンネル表示様式' : 'Tunnel Style'}</span>
                  <select
                    className="input-field"
                    style={{ padding: '2px 6px' }}
                    data-testid="tunnel-cutaway-style-select"
                    value={modeState.cutaway.tunnelCutawayStyle}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { tunnelCutawayStyle: e.target.value as TunnelCutawayStyle },
                      })
                    }
                  >
                    <option value="translucent_shell">Translucent Concrete</option>
                    <option value="section_cutaway">Section Cutaway</option>
                    <option value="solid_shell">Solid Concrete</option>
                    <option value="interior_view">Interior Bore</option>
                  </select>
                </label>

                <label className="hud-check-row">
                  <input
                    type="checkbox"
                    data-testid="pin-cutaway-checkbox"
                    checked={modeState.cutaway.pinCutaway}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { pinCutaway: e.target.checked },
                      })
                    }
                  />
                  <span>{locale === 'ja' ? '開削位置を固定' : 'Pin Cutaway Location'}</span>
                </label>
              </>
            )}

            {/* Underground Explorer Corridor Locator */}
            {modeState.mode === 'underground_explorer' && (
              <>
                {explorerLoc ? (
                  <div className="card-subtle" style={{ padding: '7px 8px' }} data-testid="explorer-location-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="line-dot" style={{ background: explorerLoc.lineColor }} />
                        <strong>{locale === 'ja' ? explorerLoc.lineNameJa : explorerLoc.lineNameEn}</strong>
                      </div>
                      <span className="badge">{explorerLoc.tier}</span>
                    </div>
                    <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                      {locale === 'ja' ? '最寄駅' : 'Nearest'}:{' '}
                      <strong>
                        {locale === 'ja'
                          ? explorerLoc.nearestStationJa ?? '区間内'
                          : explorerLoc.nearestStationEn ?? 'In Tunnel'}
                      </strong>{' '}
                      ({explorerLoc.distanceToNearestM}m) · y={explorerLoc.trackY}
                    </div>
                    {explorerLoc.nearbyLineIds.length > 0 && (
                      <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {explorerLoc.nearbyLineIds.map((lid) => {
                          const lineObj = dataset.railLines.find((l) => l.id === lid);
                          if (!lineObj) return null;
                          return (
                            <button
                              key={lid}
                              type="button"
                              className="tier-pill active"
                              data-testid={`explorer-hop-${lid}`}
                              onClick={() => onJumpExplorerLine(lid)}
                            >
                              {locale === 'ja'
                                ? lineObj.names.ja?.split('（')[0]
                                : lineObj.names.en?.split(' (')[0]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 11 }}>
                    {locale === 'ja' ? '地下トンネル空間へ進入中...' : 'Entering tunnel corridor...'}
                  </div>
                )}

                <button
                  type="button"
                  className="btn-primary"
                  data-testid="explorer-return-surface-btn"
                  style={{ padding: '5px 8px', fontSize: 11.5 }}
                  onClick={() => onDispatch({ type: 'RETURN_TO_SURFACE' })}
                >
                  <ArrowUpFromLine size={12} />
                  <span>{locale === 'ja' ? 'ワンクリックで地上へ戻る' : 'Return to Surface'}</span>
                </button>
              </>
            )}

            {/* Train Follow Fixed Rigs */}
            {modeState.mode === 'train_follow' && (
              <>
                <div className="section-title" style={{ fontSize: 10.5 }}>
                  <Video size={11} />
                  <span>{locale === 'ja' ? '追従カメラアングル' : 'Follow Camera Rig'}</span>
                </div>
                <div className="tier-grid" role="group" aria-label="Train Camera Angles">
                  {FOLLOW_RIGS.map((ang) => (
                    <button
                      key={ang.id}
                      type="button"
                      data-testid={`follow-angle-${ang.id}`}
                      className={`tier-pill ${modeState.followAngle === ang.id ? 'active' : ''}`}
                      onClick={() => onDispatch({ type: 'SET_FOLLOW_ANGLE', angle: ang.id })}
                    >
                      {locale === 'ja' ? ang.labelJa : ang.labelEn}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="exit-train-follow-btn"
                  onClick={() => onDispatch({ type: 'EXIT_TRAIN_FOLLOW' })}
                >
                  {locale === 'ja' ? '列車追従を終了' : 'Exit Train Follow'}
                </button>
              </>
            )}

            {/* Persistent Structural Slice & Depth Tiers (preserves existing cutaway E2E flows) */}
            {modeState.mode !== 'underground_explorer' && modeState.mode !== 'train_follow' && (
              <>
                <label className="hud-check-row">
                  <input
                    type="checkbox"
                    data-testid="hide-buildings-checkbox"
                    checked={modeState.cutaway.hideBuildings}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { hideBuildings: e.target.checked },
                      })
                    }
                  />
                  <span>{locale === 'ja' ? '地上建物を非表示' : 'Hide Ground Buildings'}</span>
                </label>

                <label className="hud-check-row">
                  <input
                    type="checkbox"
                    data-testid="clip-plane-checkbox"
                    checked={modeState.cutaway.clipEnabled}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { clipEnabled: e.target.checked },
                      })
                    }
                  />
                  <Scissors size={12} />
                  <span>
                    {locale === 'ja' ? '水平断面スライス' : 'Depth Slice Plane'}{' '}
                    {modeState.cutaway.clipEnabled && (
                      <strong className="mono">y ≤ {modeState.cutaway.clipY}</strong>
                    )}
                  </span>
                </label>

                {modeState.cutaway.clipEnabled && (
                  <input
                    type="range"
                    min={-42}
                    max={35}
                    step={1}
                    data-testid="clip-plane-slider"
                    value={modeState.cutaway.clipY}
                    onChange={(e) =>
                      onDispatch({
                        type: 'UPDATE_CUTAWAY',
                        patch: { clipY: Number(e.target.value) },
                      })
                    }
                  />
                )}

                <div className="tier-grid" role="group" aria-label="Elevation Tier Filters">
                  {SCHEMATIC_TIERS.map((tier) => {
                    const active = modeState.cutaway.visibleTiers[tier.id];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        data-testid={`tier-toggle-${tier.id}`}
                        className={`tier-pill ${active ? 'active' : ''}`}
                        onClick={() => onDispatch({ type: 'TOGGLE_TIER', tierId: tier.id })}
                      >
                        {locale === 'ja' ? tier.labelJa : tier.labelEn}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 4. Bottom-Right Live Control Hint & Telemetry */}
      <div className="ux-bottom-right-stack">
        <div className="telemetry-chip" style={{ position: 'static', fontSize: 10.5 }} data-testid="camera-control-hint">
          {modeState.mode === 'underground_explorer'
            ? locale === 'ja'
              ? '地下漫遊: W/S・ホイール前進後退 · ドラッグ視点 · R全覧'
              : 'Explorer: W/S & Wheel Tunnel Cruise · Drag Look · Esc Exit'
            : modeState.mode === 'train_follow'
              ? locale === 'ja'
                ? '列車追従: 左ドラッグ周囲確認 · ホイール距離 · Esc終了'
                : 'Follow: Drag Peek · Wheel Distance · Esc Exit'
              : modeState.freeLookEnabled
                ? locale === 'ja'
                  ? '自由観察: WASD移動 · E/Q昇降 · ドラッグ視点 · F終了'
                  : 'Free Look: WASD Move · E/Q Up/Down · Drag Look · F Exit'
                : locale === 'ja'
                  ? '左クリック選択 · 左ドラッグ回転 · 中/右パン · Wクリック焦点'
                  : 'Click Select · Left Orbit · Mid/Right Pan · Dbl-Click Focus'}
        </div>
        {telemetry && (
          <div className="telemetry-chip mono" style={{ position: 'static' }} data-testid="three-telemetry">
            {telemetry.fps > 0 ? `${telemetry.fps} FPS · ` : ''}
            DC:{telemetry.drawCalls} · Tris:{Math.round(telemetry.triangles / 1000)}k
            {telemetry.railwayLod ? ` · Rail:${telemetry.railwayLod}` : ''} · Chunks{' '}
            {telemetry.loadedChunks}/{telemetry.totalChunks} (L0:{telemetry.lod0Chunks}/L1:
            {telemetry.lod1Chunks}) · Buildings {telemetry.renderedBuildings.toLocaleString()}
            {telemetry.activeTrains ? ` · Sim:${telemetry.activeTrains}` : ''}
          </div>
        )}
      </div>
    </>
  );
};
