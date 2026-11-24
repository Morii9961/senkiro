import React, { useState } from 'react';
import {
  ArrowUpFromLine,
  Building2,
  Compass,
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
  Sunrise,
  Sunset,
  TrainFront,
  Video,
  X,
} from 'lucide-react';
import type { SimulatedTrainState, TunnelCutawayStyle } from '../contracts/atlasV2.js';
import { SCHEMATIC_TIERS, type SchematicTierId } from '../domain/elevationSolver.js';
import type { AtlasDataset, FareQuote, SkId } from '../domain/types.js';
import {
  CAMERA_MODE_METADATA,
  type CameraModeAction,
  type CameraModeId,
  type CameraModeState,
  type TrainFollowRig,
} from '../three/camera/cameraModeStateMachine.js';
import type { CameraOrientationInfo } from '../three/camera/collisionGuard.js';
import type { UndergroundExplorerLocation } from '../three/camera/controllerBridge.js';
import type { PlacedMapLabel } from '../three/camera/labelLayout.js';
import { TOKYO_HUB_PRESETS } from '../three/geoProjection.js';
import type { LineTraceStatus, SceneTelemetry } from '../three/types.js';
import { UI_TEXT, type Locale } from './i18n.js';

function tr(locale: Locale, ja: string, zh: string, en: string): string {
  return locale === 'ja' ? ja : locale === 'zh' ? zh : en;
}

function formatHourHHMM(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTimePeriodInfo(hour: number, locale: Locale): {
  icon: React.ReactNode;
  label: string;
} {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5.0 && h < 8.5) {
    return { icon: <Sunrise size={12} />, label: tr(locale, '朝焼け', '清晨', 'Dawn') };
  }
  if (h >= 8.5 && h < 16.5) {
    return { icon: <Sun size={12} />, label: tr(locale, '日中', '日间', 'Day') };
  }
  if (h >= 16.5 && h < 18.5) {
    return { icon: <Sunset size={12} />, label: tr(locale, '夕暮れ', '日落', 'Sunset') };
  }
  return { icon: <Moon size={12} />, label: tr(locale, '夜間', '夜间', 'Night') };
}

const MODE_ZH_FALLBACK: Record<
  CameraModeId,
  { labelZh: string; shortZh: string; descriptionZh: string }
> = {
  city_overview: {
    labelZh: '城市俯瞰',
    shortZh: '城市俯瞰',
    descriptionZh: '3D 都市鸟瞰：左键拖拽旋转 · 中/右键平移 · 双击聚焦',
  },
  street_level: {
    labelZh: '街景视角',
    shortZh: '街景',
    descriptionZh: '近景城市观察：建筑碰撞保护与方向罗盘，观察街道与高架',
  },
  underground_cutaway: {
    labelZh: '地下剖切',
    shortZh: '地下剖切',
    descriptionZh: '局部开挖分析：分层筛选 · 单线高亮 · 地下深度可视化',
  },
  underground_explorer: {
    labelZh: '地下隧道漫游',
    shortZh: '隧道漫游',
    descriptionZh: '隧道内部视角：W/S 或滚轮沿轨道前进 · 拖拽环顾',
  },
  train_follow: {
    labelZh: '模拟列车跟随',
    shortZh: '列车跟随',
    descriptionZh: '跟随虚拟模拟列车（驾驶室/车头/侧面/车尾/俯瞰 · 非实时）',
  },
};

const HUB_ZH_FALLBACK: Record<string, string> = {
  shibuya: '涩谷（银座线3F＋地面＋地下多层）',
  shinjuku: '新宿（地面干线枢纽＋大江户线深层）',
  tokyo: '东京·大手町（高架＋地下交汇）',
  shinagawa: '品川（干线·新干线·京急）',
  ikebukuro: '池袋（JR·私铁·副都心深层）',
  tokyo23: '东京都心23区 全景',
};

const TIER_ZH_FALLBACK: Record<SchematicTierId, string> = {
  'L+2': '高架2层 (+20)',
  'L+1': '高架1层 (+10)',
  L0: '地面 (0)',
  'L-1': '地下1层 (-10)',
  'L-2': '地下2层 (-20)',
  'L-3': '地下3层 (-30)',
  'L-4': '地下4层 (-40)',
};

const TIME_PRESETS: {
  id: string;
  hour: number;
  labelJa: string;
  labelZh: string;
  labelEn: string;
}[] = [
  { id: 'morning', hour: 7.5, labelJa: '朝 07:30', labelZh: '清晨 07:30', labelEn: 'Morning 07:30' },
  { id: 'noon', hour: 13.0, labelJa: '正午 13:00', labelZh: '正午 13:00', labelEn: 'Noon 13:00' },
  { id: 'sunset', hour: 17.25, labelJa: '夕暮れ 17:15', labelZh: '日落 17:15', labelEn: 'Sunset 17:15' },
  { id: 'night', hour: 21.5, labelJa: '夜間 21:30', labelZh: '夜晚 21:30', labelEn: 'Night 21:30' },
];

interface MapLabelsOverlayProps {
  labels: PlacedMapLabel[];
  onLabelClick: (label: PlacedMapLabel) => void;
  onLineBadgeClick?: (lineId: string) => void;
}

export const MapLabelsOverlay: React.FC<MapLabelsOverlayProps> = ({
  labels,
  onLabelClick,
  onLineBadgeClick,
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
        const hasLineBadges = Boolean(lbl.lineBadges && lbl.lineBadges.length > 0);
        const tooltipLines = hasLineBadges
          ? lbl.lineBadges!
              .map((b) => (b.isSubway && b.tier ? `${b.label} (${b.tier})` : b.label))
              .join(' · ')
          : lbl.textSecondary ?? '';
        return (
          <div
            key={lbl.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            data-testid={`map-label-${lbl.id}`}
            data-label-kind={lbl.kind}
            onClick={() => clickable && onLabelClick(lbl)}
            onKeyDown={(e) => {
              if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onLabelClick(lbl);
              }
            }}
            className={`map-label-pill kind-${lbl.kind} ${hasLineBadges ? 'has-line-badges' : ''} ${lbl.highlighted ? 'highlighted' : ''} ${!clickable ? 'non-clickable' : ''}`}
            style={{
              transform: `translate3d(${lbl.boxX}px, ${lbl.boxY}px, 0)`,
              width: hasLineBadges ? undefined : lbl.width,
              maxWidth: lbl.width,
              opacity: lbl.opacity,
              borderLeftColor: lbl.color ?? undefined,
            }}
            title={
              tooltipLines ? `${lbl.textPrimary} — ${tooltipLines}` : lbl.textPrimary
            }
          >
            <div className="map-label-row">
              {lbl.color && !hasLineBadges && (
                <span className="map-label-dot" style={{ background: lbl.color }} />
              )}
              <span className="map-label-primary">{lbl.textPrimary}</span>
              {lbl.badge && <span className="map-label-badge">{lbl.badge}</span>}
              {hasLineBadges && lbl.lineBadges!.length <= 3 && !lbl.textSecondary && (
                <span className="map-line-badge-strip inline">
                  {lbl.lineBadges!.map((lb) => (
                    <span
                      key={lb.lineId}
                      className={`map-line-icon ${lb.isSubway ? 'subway' : 'surface'}`}
                      style={
                        lb.isSubway
                          ? { borderColor: lb.color, color: lb.color }
                          : { backgroundColor: lb.color }
                      }
                      title={`${lb.label}${lb.tier && lb.isSubway ? ` (${lb.tier})` : ''}`}
                      onClick={(e) => {
                        if (!onLineBadgeClick) return;
                        e.stopPropagation();
                        onLineBadgeClick(lb.lineId);
                      }}
                    >
                      {lb.code}
                    </span>
                  ))}
                </span>
              )}
            </div>
            {hasLineBadges && (lbl.lineBadges!.length > 3 || Boolean(lbl.textSecondary)) && (
              <div className="map-line-badge-strip">
                {lbl.lineBadges!.map((lb) => (
                  <span
                    key={lb.lineId}
                    className={`map-line-icon ${lb.isSubway ? 'subway' : 'surface'}`}
                    style={
                      lb.isSubway
                        ? { borderColor: lb.color, color: lb.color }
                        : { backgroundColor: lb.color }
                    }
                    title={`${lb.label}${lb.tier && lb.isSubway ? ` (${lb.tier})` : ''}`}
                    onClick={(e) => {
                      if (!onLineBadgeClick) return;
                      e.stopPropagation();
                      onLineBadgeClick(lb.lineId);
                    }}
                  >
                    {lb.code}
                  </span>
                ))}
              </div>
            )}
            {lbl.textSecondary && (
              <div className="map-label-secondary">{lbl.textSecondary}</div>
            )}
          </div>
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
  timeOfDayHour: number;
  autoTimePlay: boolean;
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
  onChangeTimeOfDay: (hour: number) => void;
  onToggleAutoTimePlay: () => void;
  onStartOrToggleTrace: () => void;
  onStopTrace: () => void;
  onTraceProgress: (progress: number) => void;
  onFitLine: (lineId: SkId<'line'>) => void;
  onCloseLine?: () => void;
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

const FOLLOW_RIGS: { id: TrainFollowRig; labelJa: string; labelZh: string; labelEn: string }[] = [
  { id: 'cab', labelJa: '運転台前望', labelZh: '驾驶室前望', labelEn: 'Cab' },
  { id: 'front', labelJa: '先頭側面', labelZh: '车头侧面', labelEn: 'Front' },
  { id: 'side', labelJa: '側面', labelZh: '侧面', labelEn: 'Side' },
  { id: 'chase', labelJa: '後方追尾', labelZh: '车尾追随', labelEn: 'Rear' },
  { id: 'overhead_cutaway', labelJa: '俯瞰開削', labelZh: '俯瞰剖切', labelEn: 'Overhead' },
];

export const CameraHud: React.FC<CameraHudProps> = ({
  dataset,
  locale,
  modeState,
  sceneNight,
  timeOfDayHour,
  autoTimePlay,
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
  onChangeTimeOfDay,
  onToggleAutoTimePlay,
  onStartOrToggleTrace,
  onStopTrace,
  onTraceProgress,
  onFitLine,
  onCloseLine,
}) => {
  const t = UI_TEXT[locale];
  const [helpOpen, setHelpOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);

  const meta = CAMERA_MODE_METADATA[modeState.mode] as (typeof CAMERA_MODE_METADATA)[CameraModeId] & {
    labelZh?: string;
    shortZh?: string;
    descriptionZh?: string;
  };
  const isUndergroundMode =
    modeState.mode === 'underground_cutaway' ||
    modeState.mode === 'underground_explorer' ||
    (modeState.mode === 'train_follow' && Boolean(followedTrain?.isUnderground));
  const selectedLine = dataset.railLines.find((l) => l.id === selectedLineId) ?? null;
  const timeInfo = getTimePeriodInfo(timeOfDayHour, locale);
  const formattedTime = formatHourHHMM(timeOfDayHour);

  return (
    <>
      {/* 1. Top Precision HUD: 5-Mode Switcher, Time-of-Day, Day/Night, Hubs, Reset, Return to Surface */}
      <div className="map-overlay-top" style={{ right: 12 }}>
        <div className="ux-top-bar">
          <div className="ux-mode-group" role="group" aria-label="Camera Viewing Modes">
            <span
              className={`ux-active-mode-badge mode-${modeState.mode}`}
              data-testid="active-mode-badge"
              title={tr(
                locale,
                meta.descriptionJa,
                meta.descriptionZh ?? MODE_ZH_FALLBACK[modeState.mode].descriptionZh,
                meta.descriptionEn,
              )}
            >
              {MODE_ICONS[modeState.mode]}
              <span>
                {tr(
                  locale,
                  meta.labelJa,
                  meta.labelZh ?? MODE_ZH_FALLBACK[modeState.mode].labelZh,
                  meta.labelEn,
                )}
              </span>
            </span>

            <div className="ux-mode-pills">
              {MODE_ORDER.map((mId) => {
                const mMeta = CAMERA_MODE_METADATA[mId] as (typeof CAMERA_MODE_METADATA)[CameraModeId] & {
                  shortZh?: string;
                  descriptionZh?: string;
                };
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
                    title={tr(
                      locale,
                      mMeta.descriptionJa,
                      mMeta.descriptionZh ?? MODE_ZH_FALLBACK[mId].descriptionZh,
                      mMeta.descriptionEn,
                    )}
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
                    <span>
                      {tr(
                        locale,
                        mMeta.shortJa,
                        mMeta.shortZh ?? MODE_ZH_FALLBACK[mId].shortZh,
                        mMeta.shortEn,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ux-global-actions">
            {/* Compact Interactive Time-of-Day Pill */}
            <div className="tod-control-anchor" data-testid="time-of-day-control">
              <button
                type="button"
                className={`hub-chip tod-pill-btn ${timeOpen || autoTimePlay ? 'active-sky' : ''}`}
                data-testid="time-of-day-toggle"
                aria-expanded={timeOpen}
                title={tr(
                  locale,
                  '時間帯・太陽光影コントロール',
                  '时间与光影控制（拖动调整日照角度）',
                  'Time-of-Day & Solar Lighting Controls',
                )}
                onClick={() => {
                  setTimeOpen((o) => !o);
                  setHelpOpen(false);
                }}
              >
                {timeInfo.icon}
                <span className="mono">{formattedTime}</span>
                {autoTimePlay && <span className="tod-live-dot" aria-hidden="true" />}
              </button>
            </div>

            <button
              type="button"
              className="hub-chip"
              data-testid="toggle-3d-day-night"
              onClick={onToggleNight}
            >
              {sceneNight ? <Sun size={12} /> : <Moon size={12} />}
              <span>
                {sceneNight
                  ? tr(locale, '昼間', '白天', 'Day')
                  : tr(locale, '夜間', '夜晚', 'Night')}
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
                <span>{tr(locale, '地上へ戻る', '返回地面', 'Return to Surface')}</span>
              </button>
            )}

            <button
              type="button"
              className="hub-chip"
              data-testid="reset-3d-camera"
              title={tr(locale, '全覧リセット (R)', '重置全景视角 (R)', 'Reset Camera (R)')}
              onClick={() => onDispatch({ type: 'RESET_OVERVIEW' })}
            >
              <RotateCcw size={12} />
              <span>{tr(locale, 'リセット', '重置', 'Reset')}</span>
            </button>

            <button
              type="button"
              className={`hub-chip ${helpOpen ? 'active-sky' : ''}`}
              data-testid="toggle-controls-help"
              aria-label={tr(locale, '操作ガイド', '操作指南', 'Controls Help')}
              onClick={() => {
                setHelpOpen((o) => !o);
                setTimeOpen(false);
              }}
            >
              <HelpCircle size={12} />
            </button>
          </div>
        </div>

        {/* Sub-row: Hub Quick Chips + Honest Schematic Disclaimer */}
        <div className="ux-sub-row">
          <div className="hub-bar" role="group" aria-label="Hub Focus Shortcuts">
            {TOKYO_HUB_PRESETS.map((hub) => {
              const h = hub as typeof hub & { labelZh?: string };
              return (
                <button
                  key={hub.id}
                  type="button"
                  className="hub-chip hub-chip-mini"
                  data-testid={`hub-btn-${hub.id}`}
                  onClick={() => onSelectHub(hub.id)}
                >
                  {tr(locale, hub.labelJa, h.labelZh ?? HUB_ZH_FALLBACK[hub.id] ?? hub.labelJa, hub.labelEn)}
                </button>
              );
            })}
          </div>

          <div className="banner banner-warning ux-compact-banner" data-testid="vertical-3d-banner">
            <span>
              <strong>
                {tr(
                  locale,
                  '3D 都市鉄道アトラス（模式高度）:',
                  '3D 都市铁路图谱（示意高度）:',
                  '3D Schematic Atlas:',
                )}
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

        {/* Interactive Time-of-Day & Solar Lighting Popover */}
        {timeOpen && (
          <div className="tod-popover" data-testid="time-of-day-popover">
            <div className="tod-popover-head">
              <div className="tod-title-group">
                {timeInfo.icon}
                <strong>
                  {tr(locale, '東京時刻・光影', '东京时间 · 光影', 'Tokyo Solar Time')}
                </strong>
                <span className="mono badge" data-testid="time-of-day-readout">
                  {formattedTime} · {timeInfo.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <button
                  type="button"
                  className={`btn-secondary tod-play-btn ${autoTimePlay ? 'playing' : ''}`}
                  data-testid="time-lapse-play-btn"
                  onClick={onToggleAutoTimePlay}
                >
                  {autoTimePlay ? <Pause size={11} /> : <Play size={11} />}
                  <span>
                    {autoTimePlay
                      ? tr(locale, '停止', '暂停', 'Pause')
                      : tr(locale, '時間推移', '昼夜演示', 'Time-lapse')}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '2px 5px' }}
                  aria-label={tr(locale, '閉じる', '关闭', 'Close')}
                  onClick={() => setTimeOpen(false)}
                >
                  <X size={11} />
                </button>
              </div>
            </div>

            <div className="tod-slider-wrap">
              <input
                type="range"
                min={0}
                max={23.95}
                step={0.05}
                className="tod-slider"
                data-testid="time-of-day-slider"
                aria-label={tr(locale, '時刻スライダー', '时间滑块', 'Time of Day Slider')}
                value={timeOfDayHour}
                onChange={(e) => onChangeTimeOfDay(Number(e.target.value))}
              />
              <div className="tod-scale-marks mono">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </div>

            <div className="tod-presets" role="group" aria-label="Time of Day Presets">
              {TIME_PRESETS.map((preset) => {
                const active = Math.abs(timeOfDayHour - preset.hour) < 0.45;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`time-preset-${preset.id}`}
                    className={`tod-preset-chip ${active ? 'active' : ''}`}
                    onClick={() => onChangeTimeOfDay(preset.hour)}
                  >
                    {tr(locale, preset.labelJa, preset.labelZh, preset.labelEn)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {helpOpen && (
          <div className="ux-help-popover" data-testid="controls-help-popover">
            <div className="ux-help-title">
              {tr(locale, 'デスクトップ操作ガイド', '桌面操作指南', 'Desktop Controls Guide')}
            </div>
            <div className="ux-help-grid">
              <span>{tr(locale, '左クリック', '左键单击', 'Left Click')}</span>
              <span>
                {tr(
                  locale,
                  '駅 / 路線 / 模擬列車を選択（空白クリックで解除）',
                  '选中车站 / 线路 / 模拟列车（点击空白处取消）',
                  'Select Station / Line / Train (Click empty space to clear)',
                )}
              </span>
              <span>{tr(locale, '左ドラッグ', '左键拖拽', 'Left Drag')}</span>
              <span>
                {tr(
                  locale,
                  '3D回転（地下漫遊時はトンネル内視点回転）',
                  '3D 环绕旋转（地下漫游时控制视线方向）',
                  'Orbit Rotate (Look around in Tunnel Explorer)',
                )}
              </span>
              <span>{tr(locale, '中/右ドラッグ', '中键 / 右键拖拽', 'Middle / Right Drag')}</span>
              <span>{tr(locale, '地図水平パン移動', '地图水平平移', 'Horizontal Ground Pan')}</span>
              <span>{tr(locale, 'ホイール', '鼠标滚轮', 'Scroll Wheel')}</span>
              <span>
                {tr(
                  locale,
                  'ズーム（地下漫遊時はトンネル前進/後退）',
                  '缩放视野（地下漫游时沿隧道前进/后退）',
                  'Zoom (Advance/Retreat along bore in Explorer)',
                )}
              </span>
              <span>{tr(locale, 'ダブルクリック', '双击', 'Double Click')}</span>
              <span>{tr(locale, 'クリック対象へスムーズフォーカス', '平滑聚焦到点击目标', 'Smoothly focus target')}</span>
              <span>WASD / Q / E</span>
              <span>
                {tr(
                  locale,
                  '水平移動・トンネル巡航（R: 全覧リセット · Esc: 戻る/選択解除）',
                  '平移与隧道巡航（R: 重置全景 · Esc: 退出/取消选中）',
                  'Pan / Tunnel Cruise (R: Reset Overview · Esc: Exit / Clear)',
                )}
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
              {locale === 'en'
                ? selectedLine.names.en ?? selectedLine.names.ja
                : selectedLine.names.ja}
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
                  <span>{tr(locale, '一時停止', '暂停', 'Pause')}</span>
                </>
              ) : (
                <>
                  <Play size={12} />
                  <span>{tr(locale, '沿線カメラ追跡', '沿线镜头追踪', 'Trace Line')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => onFitLine(selectedLine.id)}
            >
              {tr(locale, '全景フォーカス', '全线聚焦', 'Fit Line')}
            </button>
            {traceStatus.active && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '3px 7px', fontSize: 11 }}
                aria-label={tr(locale, '追跡停止', '停止追踪', 'Stop Trace')}
                onClick={onStopTrace}
              >
                <Square size={11} />
              </button>
            )}
            {onCloseLine && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '2px 5px', marginLeft: 'auto' }}
                data-testid="close-line-trace-bar"
                aria-label={tr(locale, '路線選択を閉じる', '关闭线路条', 'Dismiss line bar')}
                title={tr(locale, '閉じる', '关闭', 'Close')}
                onClick={() => {
                  onStopTrace();
                  onCloseLine();
                }}
              >
                <X size={11} />
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
                ? tr(locale, '地下カットアウェイ ON', '地下剖切 ON', 'Underground Cutaway ON')
                : tr(locale, '地下カットアウェイ', '地下剖切', 'Underground Cutaway')}
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
            {/* Street-Level Orientation */}
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
                        {tr(
                          locale,
                          `${orientation.nearestAnchor.nameJa} から ${orientation.nearestAnchor.distanceM}m`,
                          `距离 ${orientation.nearestAnchor.nameJa} ${orientation.nearestAnchor.distanceM}m`,
                          `${orientation.nearestAnchor.distanceM}m from ${orientation.nearestAnchor.nameEn}`,
                        )}
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
                  {tr(locale, '都市俯瞰へ戻る', '返回城市俯瞰', 'Back to City Overview')}
                </button>
              </>
            )}

            {/* Underground Cutaway Controls */}
            {modeState.mode === 'underground_cutaway' && (
              <>
                <label className="hud-slider-row">
                  <span>
                    {tr(locale, '開削半径', '剖切半径', 'Cutaway Radius')}:{' '}
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
                    {tr(locale, '縦方向誇張 (視認用)', '纵向夸大（便于观察）', 'Vertical Exaggeration')}:{' '}
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
                    {tr(locale, '外周地表不透明度', '外围地表不透明度', 'Outer Ground Opacity')}:{' '}
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
                  <span>{tr(locale, 'トンネル表示様式', '隧道显示样式', 'Tunnel Style')}</span>
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
                    <option value="translucent_shell">
                      {tr(locale, '半透明コンクリート', '半透明混凝土', 'Translucent Concrete')}
                    </option>
                    <option value="section_cutaway">
                      {tr(locale, '断面カットアウェイ', '剖面开挖', 'Section Cutaway')}
                    </option>
                    <option value="solid_shell">
                      {tr(locale, 'ソリッドコンクリート', '实体混凝土', 'Solid Concrete')}
                    </option>
                    <option value="interior_view">
                      {tr(locale, 'トンネル内壁', '隧道内壁视角', 'Interior Bore')}
                    </option>
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
                  <span>{tr(locale, '開削位置を固定', '锁定剖切位置', 'Pin Cutaway Location')}</span>
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
                        <strong>
                          {locale === 'en' ? explorerLoc.lineNameEn : explorerLoc.lineNameJa}
                        </strong>
                      </div>
                      <span className="badge">{explorerLoc.tier}</span>
                    </div>
                    <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                      {tr(locale, '最寄駅', '最近车站', 'Nearest')}:{' '}
                      <strong>
                        {locale === 'en'
                          ? explorerLoc.nearestStationEn ?? 'In Tunnel'
                          : explorerLoc.nearestStationJa ?? tr(locale, '区間内', '区间隧道内', 'In Tunnel')}
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
                              {locale === 'en'
                                ? lineObj.names.en?.split(' (')[0]
                                : lineObj.names.ja?.split('（')[0]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 11 }}>
                    {tr(locale, '地下トンネル空間へ進入中...', '正在进入地下隧道空间...', 'Entering tunnel corridor...')}
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
                  <span>{tr(locale, 'ワンクリックで地上へ戻る', '一键返回地面', 'Return to Surface')}</span>
                </button>
              </>
            )}

            {/* Train Follow Fixed Rigs */}
            {modeState.mode === 'train_follow' && (
              <>
                <div className="section-title" style={{ fontSize: 10.5 }}>
                  <Video size={11} />
                  <span>{tr(locale, '追従カメラアングル', '跟随镜头机位', 'Follow Camera Rig')}</span>
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
                      {tr(locale, ang.labelJa, ang.labelZh, ang.labelEn)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="exit-train-follow-btn"
                  onClick={() => onDispatch({ type: 'EXIT_TRAIN_FOLLOW' })}
                >
                  {tr(locale, '列車追従を終了', '退出列车跟随', 'Exit Train Follow')}
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
                  <span>{tr(locale, '地上建物を非表示', '隐藏地面建筑', 'Hide Ground Buildings')}</span>
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
                    {tr(locale, '水平断面スライス', '水平深度剖切面', 'Depth Slice Plane')}{' '}
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
                    const tierMeta = tier as typeof tier & { labelZh?: string };
                    const active = modeState.cutaway.visibleTiers[tier.id];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        data-testid={`tier-toggle-${tier.id}`}
                        className={`tier-pill ${active ? 'active' : ''}`}
                        onClick={() => onDispatch({ type: 'TOGGLE_TIER', tierId: tier.id })}
                      >
                        {tr(
                          locale,
                          tier.labelJa,
                          tierMeta.labelZh ?? TIER_ZH_FALLBACK[tier.id] ?? tier.labelJa,
                          tier.labelEn,
                        )}
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
            ? tr(
                locale,
                '地下漫遊: W/S・ホイール前進後退 · ドラッグ視点 · R全覧',
                '地下漫游: W/S 或滚轮沿隧道前进 · 拖拽环顾 · Esc 退出',
                'Explorer: W/S & Wheel Tunnel Cruise · Drag Look · Esc Exit',
              )
            : modeState.mode === 'train_follow'
              ? tr(
                  locale,
                  '列車追従: 左ドラッグ周囲確認 · ホイール距離 · Esc終了',
                  '列车跟随: 左键拖拽环顾 · 滚轮调距 · Esc 退出',
                  'Follow: Drag Peek · Wheel Distance · Esc Exit',
                )
              : tr(
                  locale,
                  '左クリック選択 · 左ドラッグ回転 · 中/右パン · Wクリック焦点',
                  '左键点选 · 左拖旋转 · 中/右拖平移 · 双击聚焦',
                  'Click Select · Left Orbit · Mid/Right Pan · Dbl-Click Focus',
                )}
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
