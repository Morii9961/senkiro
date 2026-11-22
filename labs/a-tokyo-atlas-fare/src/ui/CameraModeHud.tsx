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
  RotateCcw,
  Scissors,
  Sun,
  TrainFront,
  Video,
} from 'lucide-react';
import {
  CAMERA_MODE_METADATA,
  type CameraModeAction,
  type CameraModeId,
  type CameraModeState,
  type CameraMoveSpeed,
  type TrainFollowAngle,
} from '../domain/cameraModeStateMachine.js';
import { SCHEMATIC_TIERS } from '../domain/elevationSolver.js';
import type { AtlasDataset, FareQuote, SkId } from '../domain/types.js';
import { TOKYO_HUB_PRESETS } from '../three/geoProjection.js';
import type {
  CameraOrientationInfo,
  UndergroundExplorerLocation,
} from '../three/types.js';
import type { TrainSimulationState } from '../three/uxContracts.js';
import { UI_TEXT, type Locale } from './i18n.js';

interface CameraModeHudProps {
  dataset: AtlasDataset;
  locale: Locale;
  modeState: CameraModeState;
  sceneNight: boolean;
  fareQuote: FareQuote | null;
  orientation: CameraOrientationInfo | null;
  explorerLoc: UndergroundExplorerLocation | null;
  followedTrain: TrainSimulationState | null;
  fallbackTrainId: string | null;
  onDispatch: (action: CameraModeAction) => void;
  onSelectHub: (hubId: string) => void;
  onJumpExplorerLine: (lineId: SkId<'line'>) => void;
  onToggleNight: () => void;
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

const FOLLOW_ANGLES: { id: TrainFollowAngle; labelJa: string; labelEn: string }[] = [
  { id: 'front', labelJa: '先頭 (車頭)', labelEn: 'Front' },
  { id: 'side', labelJa: '側面', labelEn: 'Side' },
  { id: 'rear', labelJa: '後方 (車尾)', labelEn: 'Rear' },
  { id: 'cab', labelJa: '運転台前望', labelEn: 'Cab' },
];

export const CameraModeHud: React.FC<CameraModeHudProps> = ({
  dataset,
  locale,
  modeState,
  sceneNight,
  fareQuote,
  orientation,
  explorerLoc,
  followedTrain,
  fallbackTrainId,
  onDispatch,
  onSelectHub,
  onJumpExplorerLine,
  onToggleNight,
}) => {
  const t = UI_TEXT[locale];
  const [helpOpen, setHelpOpen] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);

  const meta = CAMERA_MODE_METADATA[modeState.mode];
  const isUnderground =
    modeState.mode === 'underground_cutaway' ||
    modeState.mode === 'underground_explorer' ||
    (modeState.mode === 'train_follow' && Boolean(followedTrain?.isUnderground));

  return (
    <>
      {/* Top Precision Bar: 5-Mode State Machine Switcher + Hub Jump + Global Actions */}
      <div className="map-overlay-top" style={{ right: 12 }}>
        <div className="ux-top-bar">
          {/* Active Mode Indicator + 5-Mode Segmented Switcher */}
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
                const disabled = mId === 'train_follow' && !fallbackTrainId && !modeState.followedTrainId;
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
                        trainId: mId === 'train_follow' ? modeState.followedTrainId ?? fallbackTrainId : undefined,
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

          {/* Right Global Controls: Free Look, Hub Selector, Day/Night, Return to Surface, Reset, Help */}
          <div className="ux-global-actions">
            {modeState.mode !== 'train_follow' && (
              <button
                type="button"
                className={`hub-chip ${modeState.freeLookEnabled ? 'active-sky' : ''}`}
                data-testid="toggle-free-look"
                title={
                  locale === 'ja'
                    ? '自由観察モード切替 (WASD/QE飛行 + ドラッグ視点 · ショートカット F)'
                    : 'Toggle Free Look Mode (WASD/QE + Drag Look · Shortcut F)'
                }
                onClick={() => onDispatch({ type: 'TOGGLE_FREE_LOOK' })}
              >
                <Eye size={12} />
                <span>
                  {locale === 'ja'
                    ? modeState.freeLookEnabled
                      ? '自由観察 ON'
                      : '自由観察'
                    : modeState.freeLookEnabled
                      ? 'Free Look ON'
                      : 'Free Look'}
                </span>
              </button>
            )}

            <select
              className="hub-chip"
              data-testid="hub-jump-select"
              aria-label={locale === 'ja' ? '主要ターミナルへ移動' : 'Jump to Hub'}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onSelectHub(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>
                {locale === 'ja' ? '拠点ジャンプ...' : 'Jump to Hub...'}
              </option>
              {TOKYO_HUB_PRESETS.map((h) => (
                <option key={h.id} value={h.id}>
                  {locale === 'ja' ? h.labelJa : h.labelEn}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="hub-chip"
              data-testid="toggle-3d-day-night"
              onClick={onToggleNight}
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

            {isUnderground && (
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
              title={locale === 'ja' ? '全覧ビューへリセット (R)' : 'Reset to Overview (R)'}
              onClick={() => onDispatch({ type: 'RESET_OVERVIEW' })}
            >
              <RotateCcw size={12} />
              <span>{locale === 'ja' ? '全覧リセット' : 'Reset'}</span>
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

        {/* Concise Honesty Banner + Compact Hub Quick Chips */}
        <div className="ux-sub-row">
          <div className="banner banner-warning ux-compact-banner" data-testid="vertical-3d-banner">
            <span>
              <strong>
                {locale === 'ja'
                  ? '3D 模式縦断:'
                  : 'Schematic 3D Tiers:'}
              </strong>{' '}
              {t.vertical3dBanner}
            </span>
          </div>

          <div className="hub-bar" role="group" aria-label="Quick Hub Focus">
            {TOKYO_HUB_PRESETS.slice(0, 5).map((hub) => (
              <button
                key={hub.id}
                type="button"
                className="hub-chip hub-chip-mini"
                data-testid={`hub-btn-${hub.id}`}
                onClick={() => onSelectHub(hub.id)}
              >
                {locale === 'ja' ? hub.labelJa.split('（')[0] : hub.labelEn.split(' (')[0]}
              </button>
            ))}
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
                  ? '地図平面移動（自由観察/漫遊時は視点回転）'
                  : 'Map Pan (Look around in Free Look / Explorer)'}
              </span>
              <span>{locale === 'ja' ? '中/右ドラッグ' : 'Middle / Right Drag'}</span>
              <span>{locale === 'ja' ? '3D回転・自由見回し' : 'Orbit Rotation / Free Look'}</span>
              <span>{locale === 'ja' ? 'ホイール' : 'Scroll Wheel'}</span>
              <span>
                {locale === 'ja'
                  ? 'ズーム（地下漫遊時はトンネル前進/後退）'
                  : 'Zoom (Advance/Retreat along tunnel in Explorer)'}
              </span>
              <span>{locale === 'ja' ? 'ダブルクリック' : 'Double Click'}</span>
              <span>{locale === 'ja' ? '対象へスムーズフォーカス' : 'Smoothly focus target'}</span>
              <span>WASD / Q / E</span>
              <span>
                {locale === 'ja'
                  ? '自由観察移動 / トンネル漫遊（F: 自由観察 · R: 全覧 · Esc: 戻る）'
                  : 'Move / Tunnel Cruise (F: Free Look · R: Reset · Esc: Exit)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-Left Mode-Specific Context Drawer */}
      {modeState.mode !== 'city_overview' && (
        <div className="underground-hud ux-context-panel" data-testid="mode-context-panel">
          <div className="underground-hud-header">
            <div className="ux-context-title">
              {MODE_ICONS[modeState.mode]}
              <span>{locale === 'ja' ? meta.labelJa : meta.labelEn}</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '2px 7px', fontSize: 11 }}
              onClick={() => setContextCollapsed((c) => !c)}
            >
              {contextCollapsed ? '＋' : '－'}
            </button>
          </div>

          {!contextCollapsed && (
            <div className="underground-hud-body">
              {/* Street-Level Orientation & Collision Status */}
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
                        <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                          <MapPin size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                          {locale === 'ja'
                            ? `${orientation.nearestAnchor.nameJa} から ${orientation.nearestAnchor.distanceM}m`
                            : `${orientation.nearestAnchor.distanceM}m from ${orientation.nearestAnchor.nameEn}`}
                        </div>
                      )}
                    </div>
                  )}
                  <label className="hud-slider-row">
                    <span>{locale === 'ja' ? '街路移動速度' : 'Movement Speed'}</span>
                    <select
                      className="input-field"
                      style={{ padding: '3px 6px' }}
                      value={modeState.moveSpeed}
                      onChange={(e) =>
                        onDispatch({
                          type: 'SET_MOVE_SPEED',
                          speed: e.target.value as CameraMoveSpeed,
                        })
                      }
                    >
                      <option value="slow">{locale === 'ja' ? '低速 (歩行)' : 'Slow (Walk)'}</option>
                      <option value="normal">{locale === 'ja' ? '標準' : 'Normal'}</option>
                      <option value="fast">{locale === 'ja' ? '高速' : 'Fast'}</option>
                    </select>
                  </label>
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

              {/* Underground Cutaway Analytical Controls */}
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
                      {locale === 'ja' ? '外周地表の不透明度' : 'Outer Ground Opacity'}:{' '}
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
                      {locale === 'ja' ? '水平断面スライス' : 'Depth Slice'}{' '}
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

              {/* True Subterranean Underground Explorer Controls */}
              {modeState.mode === 'underground_explorer' && (
                <>
                  {explorerLoc ? (
                    <div
                      className="card-subtle"
                      style={{ padding: '7px 8px' }}
                      data-testid="explorer-location-card"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="line-dot" style={{ background: explorerLoc.lineColor }} />
                          <strong>
                            {locale === 'ja' ? explorerLoc.lineNameJa : explorerLoc.lineNameEn}
                          </strong>
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
                        ({explorerLoc.distanceToNearestM}m) · y={explorerLoc.trackY} (模式)
                      </div>
                      {explorerLoc.nextStationJa && (
                        <div className="muted" style={{ fontSize: 10.5 }}>
                          {locale === 'ja' ? '次駅方向' : 'Next'}: {explorerLoc.nextStationJa} · {explorerLoc.headingDeg}°
                        </div>
                      )}
                      {explorerLoc.nearbyLineIds.length > 0 && (
                        <div style={{ marginTop: 5 }}>
                          <div className="muted" style={{ fontSize: 10, marginBottom: 3 }}>
                            {locale === 'ja' ? '近接トンネルへ乗換移動:' : 'Hop to nearby tunnel:'}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
                                  <span
                                    className="line-dot"
                                    style={{ background: lineObj.color, width: 7, height: 7, display: 'inline-block', marginRight: 4 }}
                                  />
                                  {locale === 'ja'
                                    ? lineObj.names.ja?.split('（')[0]
                                    : lineObj.names.en?.split(' (')[0]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 11 }}>
                      {locale === 'ja' ? '地下トンネル空間へ移動中...' : 'Entering underground tunnel...'}
                    </div>
                  )}

                  <label className="hud-slider-row">
                    <span>{locale === 'ja' ? 'トンネル巡航速度' : 'Tunnel Cruise Speed'}</span>
                    <select
                      className="input-field"
                      style={{ padding: '3px 6px' }}
                      value={modeState.moveSpeed}
                      onChange={(e) =>
                        onDispatch({
                          type: 'SET_MOVE_SPEED',
                          speed: e.target.value as CameraMoveSpeed,
                        })
                      }
                    >
                      <option value="slow">{locale === 'ja' ? '低速' : 'Slow'}</option>
                      <option value="normal">{locale === 'ja' ? '標準' : 'Normal'}</option>
                      <option value="fast">{locale === 'ja' ? '高速' : 'Fast'}</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="btn-primary"
                    data-testid="explorer-return-surface-btn"
                    style={{ padding: '6px 10px', fontSize: 12 }}
                    onClick={() => onDispatch({ type: 'RETURN_TO_SURFACE' })}
                  >
                    <ArrowUpFromLine size={13} />
                    <span>{locale === 'ja' ? 'ワンクリックで地上へ戻る' : 'Return to Surface'}</span>
                  </button>
                </>
              )}

              {/* Train Follow Fixed Camera Rigs & Exit */}
              {modeState.mode === 'train_follow' && (
                <>
                  {followedTrain && (
                    <div className="card-subtle" style={{ padding: '6px 8px' }} data-testid="train-follow-hud-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span className="sim-badge">
                          {locale === 'ja' ? '模擬運行' : 'SIMULATED'}
                        </span>
                        <span className="badge">{followedTrain.tier}</span>
                      </div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{followedTrain.label}</div>
                      <div className="muted" style={{ fontSize: 10.5 }}>
                        {locale === 'ja' ? followedTrain.directionJa : followedTrain.directionEn}
                      </div>
                      <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {followedTrain.status} · {followedTrain.speedKmh} km/h (sim)
                      </div>
                    </div>
                  )}

                  <div className="section-title" style={{ fontSize: 10.5 }}>
                    <Video size={11} />
                    <span>{locale === 'ja' ? '固定カメラアングル' : 'Fixed Camera Rig'}</span>
                  </div>
                  <div className="tier-grid" role="group" aria-label="Train Camera Angles">
                    {FOLLOW_ANGLES.map((ang) => (
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
            </div>
          )}
        </div>
      )}
    </>
  );
};
