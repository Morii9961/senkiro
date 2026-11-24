import React, { useEffect, useMemo, useState } from 'react';
import { Building, Layers, TrainFront, Video, X } from 'lucide-react';
import {
  ROLLING_STOCK_CATALOG,
  type SimulatedTrainState,
} from '../contracts/index.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import type { TrainFollowRig } from '../three/camera/cameraModeStateMachine.js';
import type { Locale } from './i18n.js';

function tr(locale: Locale, ja: string, zh: string, en: string): string {
  return locale === 'ja' ? ja : locale === 'zh' ? zh : en;
}

interface TrainInspectorProps {
  dataset: AtlasDataset;
  locale: Locale;
  selectedTrain: SimulatedTrainState | null;
  selectedStationId: SkId<'station'> | null;
  selectedLineId: SkId<'line'> | null;
  trains: readonly SimulatedTrainState[];
  followedTrainId: string | null;
  followAngle: TrainFollowRig;
  onFollowTrain: (trainId: string, angle?: TrainFollowRig) => void;
  onExitFollow: () => void;
  onCloseTrain: () => void;
  onCloseStation?: () => void;
  onCloseLine?: () => void;
  onFocusLine: (lineId: SkId<'line'>) => void;
  onEnterUndergroundExplorer: () => void;
}

const KNOWN_STATION_ATLAS_COMPLEXES = new Set<string>([
  'sk:complex:shinjuku',
  'sk:complex:shibuya',
  'sk:complex:tokyo-otemachi',
  'sk:complex:ikebukuro',
  'sk:complex:shinagawa',
]);

const RIG_OPTIONS: { id: TrainFollowRig; ja: string; zh: string; en: string }[] = [
  { id: 'cab', ja: '運転台', zh: '驾驶室', en: 'Cab' },
  { id: 'front', ja: '先頭', zh: '车头', en: 'Front' },
  { id: 'side', ja: '側面', zh: '侧面', en: 'Side' },
  { id: 'chase', ja: '後方', zh: '车尾', en: 'Rear' },
  { id: 'overhead_cutaway', ja: '俯瞰', zh: '俯瞰', en: 'Top' },
];

export const TrainInspector: React.FC<TrainInspectorProps> = ({
  dataset,
  locale,
  selectedTrain,
  selectedStationId,
  selectedLineId,
  trains,
  followedTrainId,
  followAngle,
  onFollowTrain,
  onExitFollow,
  onCloseTrain,
  onCloseStation,
  onCloseLine,
  onFocusLine,
  onEnterUndergroundExplorer,
}) => {
  const [atlasExpanded, setAtlasExpanded] = useState(false);

  useEffect(() => {
    setAtlasExpanded(false);
  }, [selectedStationId]);

  const stationById = useMemo(
    () => new Map(dataset.stations.map((s) => [s.id, s])),
    [dataset.stations],
  );
  const lineById = useMemo(
    () => new Map(dataset.railLines.map((l) => [l.id, l])),
    [dataset.railLines],
  );
  const operatorById = useMemo(
    () => new Map(dataset.operators.map((o) => [o.id, o])),
    [dataset.operators],
  );
  const complexById = useMemo(
    () => new Map(dataset.stationComplexes.map((c) => [c.id, c])),
    [dataset.stationComplexes],
  );
  const sourceById = useMemo(
    () => new Map(dataset.sources.map((s) => [s.id, s])),
    [dataset.sources],
  );

  const station = selectedStationId ? stationById.get(selectedStationId) ?? null : null;
  const line = selectedLineId ? lineById.get(selectedLineId) ?? null : null;

  if (!selectedTrain && !station && !line) {
    return null;
  }

  const lineTrains = line ? trains.filter((trItem) => trItem.lineId === line.id) : [];

  return (
    <aside
      className="train-inspector-drawer"
      data-testid="train-inspector-drawer"
      aria-label={tr(locale, '3D選択エンティティ詳細', '3D 选中对象详情', '3D Selected Entity Details')}
    >
      {/* 1. Virtual Simulated Train Inspector */}
      {selectedTrain && (() => {
        const spec =
          ROLLING_STOCK_CATALOG[selectedTrain.modelId] ??
          ROLLING_STOCK_CATALOG['private-commuter-generic'];
        const tLine = lineById.get(selectedTrain.lineId);
        const tOp = operatorById.get(selectedTrain.operatorId);
        const fromSt = stationById.get(selectedTrain.fromStationId);
        const nextSt = stationById.get(selectedTrain.nextStationId);
        const destSt = stationById.get(selectedTrain.destinationStationId);
        const isFollowingThis = followedTrainId === selectedTrain.trainId;

        return (
          <div className="ux-inspector-card" data-testid="train-detail-card">
            <div className="ux-inspector-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span className="line-dot" style={{ background: selectedTrain.lineColor }} />
                <strong>{locale === 'en' ? spec.nameEn : spec.nameJa}</strong>
                <span className="mono badge">{selectedTrain.runNumber}</span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '2px 5px' }}
                onClick={onCloseTrain}
                aria-label={tr(locale, '列車詳細を閉じる', '关闭列车详情', 'Close train inspector')}
              >
                <X size={11} />
              </button>
            </div>

            <div
              className="banner banner-warning"
              data-testid="train-synthetic-banner"
              style={{ padding: '4px 7px', fontSize: 10.5 }}
            >
              <TrainFront size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>
                  {tr(locale, '模擬運行 · SYNTHETIC', '模拟运行 · SYNTHETIC', 'SIMULATED · SYNTHETIC')}
                </strong>{' '}
                {tr(
                  locale,
                  '実車時刻・実時在線ではありません',
                  '非真实列车时刻与实时在途数据',
                  'Virtual simulation — NOT live telemetry',
                )}
              </span>
            </div>

            <div className="ux-kv-grid">
              <span className="muted">{tr(locale, '路線', '线路', 'Line')}</span>
              <span>
                {locale === 'en'
                  ? tLine?.names.en ?? selectedTrain.lineId
                  : tLine?.names.ja ?? selectedTrain.lineId}{' '}
                <span className="muted">
                  ({(locale === 'en' ? tOp?.names.en : tOp?.names.ja) ?? tOp?.names.ja ?? selectedTrain.operatorId})
                </span>
              </span>

              <span className="muted">{tr(locale, '編成仕様', '编组规格', 'Consist')}</span>
              <span className="mono">
                {selectedTrain.carCount} {tr(locale, '両', '节', 'cars')} · {spec.gaugeMm}mm · {spec.electrification}
              </span>

              <span className="muted">{tr(locale, '模擬方向', '运行方向', 'Direction')}</span>
              <span>
                {(locale === 'en' ? destSt?.names.en ?? destSt?.names.ja : destSt?.names.ja) ??
                  selectedTrain.destinationStationId}{' '}
                {tr(locale, '方面', '方向', 'Bound')} (
                {selectedTrain.direction === 1 ? 'Outer/Fwd' : 'Inner/Rev'})
              </span>

              <span className="muted">{tr(locale, '区間', '当前区间', 'Segment')}</span>
              <span>
                {(locale === 'en' ? fromSt?.names.en ?? fromSt?.names.ja : fromSt?.names.ja) ??
                  selectedTrain.fromStationId}{' '}
                →{' '}
                {(locale === 'en' ? nextSt?.names.en ?? nextSt?.names.ja : nextSt?.names.ja) ??
                  selectedTrain.nextStationId}
              </span>

              <span className="muted">{tr(locale, '状態 / 層', '状态 / 层级', 'State / Tier')}</span>
              <span className="mono">
                {selectedTrain.phase} · {selectedTrain.doorState} doors ·{' '}
                {Math.round(selectedTrain.speedKmh)} km/h · {selectedTrain.tier}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!isFollowingThis ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 1, padding: '5px 8px', fontSize: 11.5 }}
                  data-testid="detail-follow-train-btn"
                  onClick={() => onFollowTrain(selectedTrain.trainId)}
                >
                  <Video size={12} />
                  <span>{tr(locale, 'この模擬列車を追従', '跟随此模拟列车', 'Follow Train')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, padding: '5px 8px', fontSize: 11.5 }}
                  data-testid="detail-exit-follow-btn"
                  onClick={onExitFollow}
                >
                  {tr(locale, '追従を終了', '退出跟随', 'Exit Follow')}
                </button>
              )}
            </div>

            <div className="tier-grid" role="group" aria-label="Inspector Camera Angles">
              {RIG_OPTIONS.map((ang) => (
                <button
                  key={ang.id}
                  type="button"
                  className={`tier-pill ${isFollowingThis && followAngle === ang.id ? 'active' : ''}`}
                  data-testid={`inspector-rig-${ang.id}`}
                  onClick={() => onFollowTrain(selectedTrain.trainId, ang.id)}
                >
                  {tr(locale, ang.ja, ang.zh, ang.en)}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 2. Contextual 3D Station Card (with Station Atlas Entry) */}
      {station && (() => {
        const stOp = operatorById.get(station.operatorId);
        const stLines = station.railLineIds
          .map((lid) => lineById.get(lid))
          .filter((l): l is NonNullable<typeof l> => Boolean(l));
        const complex = station.stationComplexId
          ? complexById.get(station.stationComplexId)
          : undefined;
        const complexInterchanges = complex
          ? dataset.interchanges.filter((e) => e.stationComplexId === complex.id)
          : [];
        const hasStationAtlas = Boolean(complex && KNOWN_STATION_ATLAS_COMPLEXES.has(complex.id));
        const srcTitles = station.provenance.sourceIds
          .map((sid) => sourceById.get(sid)?.title ?? sid)
          .slice(0, 2);

        return (
          <div className="ux-inspector-card" data-testid="inspector-station-card">
            <div className="ux-inspector-head">
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
                <strong>
                  {locale === 'en' ? station.names.en ?? station.names.ja : station.names.ja}
                </strong>
                {station.stationCode && (
                  <span className="mono badge">{station.stationCode}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span className="badge">
                  {(locale === 'en' ? stOp?.names.en : stOp?.names.ja) ?? stOp?.names.ja ?? station.operatorId}
                </span>
                {onCloseStation && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '2px 5px' }}
                    data-testid="close-station-inspector"
                    aria-label={tr(locale, '駅詳細を閉じる', '关闭车站卡片', 'Close station card')}
                    onClick={onCloseStation}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {stLines.map((l) => (
                <span key={l.id} className="ux-line-tag">
                  <span className="line-dot" style={{ background: l.color }} />
                  {locale === 'en' ? l.names.en?.split(' (')[0] : l.names.ja?.split('（')[0]}
                </span>
              ))}
            </div>

            {complexInterchanges.length > 0 && (
              <div className="muted" style={{ fontSize: 10.5 }}>
                {tr(locale, '乗換接続:', '换乘连接:', 'Transfers:')}{' '}
                {complexInterchanges.slice(0, 3).map((ic) => {
                  const gateTxt =
                    ic.gateType === 'in_gate'
                      ? tr(locale, '改札内', '站内换乘', 'In-gate')
                      : ic.gateType === 'out_of_gate'
                        ? tr(locale, '改札外', '出站换乘', 'Out-gate')
                        : tr(locale, '未知', '未知', 'Unknown');
                  const toSt = stationById.get(ic.toStationId);
                  const toName =
                    (locale === 'en' ? toSt?.names.en ?? toSt?.names.ja : toSt?.names.ja) ??
                    ic.toStationId;
                  return `${toName} (${gateTxt})`;
                }).join(' · ')}
              </div>
            )}

            <div className="muted mono" style={{ fontSize: 10 }}>
              {station.provenance.dataNature} · {srcTitles.join(' / ')}
            </div>

            {complex && (
              <div className="card-subtle" style={{ padding: '6px 8px' }} data-testid="inspector-station-atlas">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>
                    <Building size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {tr(locale, '駅構内アトラス', '车站立体图谱', 'Station Atlas')}{' '}
                    {hasStationAtlas ? '' : tr(locale, '（模式）', '（示意）', '(Schematic)')}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '2px 7px', fontSize: 10.5 }}
                    data-testid="station-atlas-toggle-btn"
                    onClick={() => setAtlasExpanded((v) => !v)}
                  >
                    {atlasExpanded
                      ? tr(locale, '閉じる', '收起', 'Close')
                      : tr(locale, '開く', '展开', 'Open')}
                  </button>
                </div>
                {atlasExpanded && (
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                    <div>
                      <strong>{locale === 'en' ? complex.names.en ?? complex.names.ja : complex.names.ja}</strong> (
                      {complex.stationIds.length}{' '}
                      {tr(locale, '駅連動', '个联动车站', 'member stations')})
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: 5, width: '100%', padding: '3px 6px', fontSize: 10.5 }}
                      onClick={onEnterUndergroundExplorer}
                    >
                      {tr(locale, '地下トンネル立体構造を見る', '查看地下隧道立体结构', 'Inspect Tunnel Layers')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 3. Contextual 3D Line Card */}
      {line && (() => {
        const lOp = operatorById.get(line.operatorId);
        const lineThrough = dataset.throughServices.filter(
          (ts) => ts.fromRailLineId === line.id || ts.toRailLineId === line.id,
        );
        const firstTrain = lineTrains[0] ?? null;

        return (
          <div className="ux-inspector-card" data-testid="inspector-line-card">
            <div className="ux-inspector-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span className="line-dot" style={{ background: line.color }} />
                <strong>{locale === 'en' ? line.names.en ?? line.names.ja : line.names.ja}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span className="badge">
                  {(locale === 'en' ? lOp?.names.en : lOp?.names.ja) ?? lOp?.names.ja ?? line.operatorId}
                </span>
                {onCloseLine && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '2px 5px' }}
                    data-testid="close-line-inspector"
                    aria-label={tr(locale, '路線詳細を閉じる', '关闭线路卡片', 'Close line card')}
                    onClick={onCloseLine}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="muted" style={{ fontSize: 10.5 }}>
              {line.stationIds.length} {tr(locale, '駅', '站', 'stations')} ·{' '}
              {tr(locale, '収録:', '收录:', 'Coverage:')}{' '}
              <span className="mono">{line.coverageStatus}</span> ·{' '}
              <span className="mono">{line.provenance.dataNature}</span>
            </div>

            <div className="muted" style={{ fontSize: 10.5 }}>
              {lineThrough.length > 0
                ? `${tr(locale, '直通運転:', '直通运行:', 'Through:')} ${lineThrough
                    .map((ts) => (locale === 'en' ? ts.names.en ?? ts.names.ja : ts.names.ja))
                    .join(', ')}`
                : tr(
                    locale,
                    '直通運転: 未収録または設定なし',
                    '直通运行: 暂无收录或未配置',
                    'Through-service: None recorded / unverified',
                  )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: 11 }}
                data-testid="inspector-fit-line-btn"
                onClick={() => onFocusLine(line.id)}
              >
                <Layers size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {tr(locale, '路線全景', '全线聚焦', 'Fit Line')}
              </button>
              {firstTrain && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                  data-testid="inspector-follow-line-train-btn"
                  onClick={() => onFollowTrain(firstTrain.trainId, 'side')}
                >
                  <Video size={11} />
                  <span>{tr(locale, '模擬列車追従', '跟随模拟列车', 'Follow Train')}</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </aside>
  );
};
