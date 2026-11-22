import React, { useMemo, useState } from 'react';
import { Building, Layers, TrainFront, Video, X } from 'lucide-react';
import {
  ROLLING_STOCK_CATALOG,
  type SimulatedTrainState,
} from '../contracts/index.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import type { TrainFollowRig } from '../three/camera/cameraModeStateMachine.js';
import type { Locale } from './i18n.js';

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

const RIG_OPTIONS: { id: TrainFollowRig; ja: string; en: string }[] = [
  { id: 'cab', ja: '運転台', en: 'Cab' },
  { id: 'front', ja: '先頭', en: 'Front' },
  { id: 'side', ja: '側面', en: 'Side' },
  { id: 'chase', ja: '後方', en: 'Rear' },
  { id: 'overhead_cutaway', ja: '俯瞰', en: 'Top' },
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
  onFocusLine,
  onEnterUndergroundExplorer,
}) => {
  const [atlasExpanded, setAtlasExpanded] = useState(false);

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

  const lineTrains = line ? trains.filter((tr) => tr.lineId === line.id) : [];

  return (
    <aside
      className="train-inspector-drawer"
      data-testid="train-inspector-drawer"
      aria-label={locale === 'ja' ? '3D選択エンティティ詳細' : '3D Selected Entity Details'}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="line-dot" style={{ background: selectedTrain.lineColor }} />
                <strong>
                  {locale === 'ja' ? spec.nameJa : spec.nameEn}
                </strong>
                <span className="mono badge">{selectedTrain.runNumber}</span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '2px 5px' }}
                onClick={onCloseTrain}
                aria-label="Close train inspector"
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
                  {locale === 'ja'
                    ? '模擬運行 · SYNTHETIC'
                    : 'SIMULATED · SYNTHETIC'}
                </strong>{' '}
                {locale === 'ja'
                  ? '実車時刻・実時在線ではありません'
                  : 'Virtual simulation — NOT live telemetry'}
              </span>
            </div>

            <div className="ux-kv-grid">
              <span className="muted">{locale === 'ja' ? '路線' : 'Line'}</span>
              <span>
                {locale === 'ja'
                  ? tLine?.names.ja ?? selectedTrain.lineId
                  : tLine?.names.en ?? selectedTrain.lineId}{' '}
                <span className="muted">({tOp?.names.ja ?? selectedTrain.operatorId})</span>
              </span>

              <span className="muted">{locale === 'ja' ? '編成仕様' : 'Consist'}</span>
              <span className="mono">
                {selectedTrain.carCount} cars · {spec.gaugeMm}mm · {spec.electrification}
              </span>

              <span className="muted">{locale === 'ja' ? '模擬方向' : 'Direction'}</span>
              <span>
                {(locale === 'ja' ? destSt?.names.ja : destSt?.names.en ?? destSt?.names.ja) ??
                  selectedTrain.destinationStationId}{' '}
                {locale === 'ja' ? '方面' : 'Bound'} (
                {selectedTrain.direction === 1 ? 'Outer/Fwd' : 'Inner/Rev'})
              </span>

              <span className="muted">{locale === 'ja' ? '区間' : 'Segment'}</span>
              <span>
                {(locale === 'ja' ? fromSt?.names.ja : fromSt?.names.en ?? fromSt?.names.ja) ??
                  selectedTrain.fromStationId}{' '}
                →{' '}
                {(locale === 'ja' ? nextSt?.names.ja : nextSt?.names.en ?? nextSt?.names.ja) ??
                  selectedTrain.nextStationId}
              </span>

              <span className="muted">{locale === 'ja' ? '状態 / 層' : 'State / Tier'}</span>
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
                  <span>{locale === 'ja' ? 'この模擬列車を追従' : 'Follow Train'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, padding: '5px 8px', fontSize: 11.5 }}
                  data-testid="detail-exit-follow-btn"
                  onClick={onExitFollow}
                >
                  {locale === 'ja' ? '追従を終了' : 'Exit Follow'}
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
                  {locale === 'ja' ? ang.ja : ang.en}
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
              <div>
                <strong>
                  {locale === 'ja' ? station.names.ja : station.names.en ?? station.names.ja}
                </strong>
                {station.stationCode && (
                  <span className="mono badge" style={{ marginLeft: 6 }}>
                    {station.stationCode}
                  </span>
                )}
              </div>
              <span className="badge">{stOp?.names.ja ?? station.operatorId}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {stLines.map((l) => (
                <span key={l.id} className="ux-line-tag">
                  <span className="line-dot" style={{ background: l.color }} />
                  {locale === 'ja' ? l.names.ja?.split('（')[0] : l.names.en?.split(' (')[0]}
                </span>
              ))}
            </div>

            {complexInterchanges.length > 0 && (
              <div className="muted" style={{ fontSize: 10.5 }}>
                {locale === 'ja' ? '乗換接続:' : 'Transfers:'}{' '}
                {complexInterchanges.slice(0, 3).map((ic) => {
                  const gateTxt =
                    ic.gateType === 'in_gate'
                      ? locale === 'ja'
                        ? '改札内'
                        : 'In-gate'
                      : ic.gateType === 'out_of_gate'
                        ? locale === 'ja'
                          ? '改札外'
                          : 'Out-gate'
                        : 'Unknown';
                  const toSt = stationById.get(ic.toStationId);
                  return `${toSt?.names.ja ?? ic.toStationId} (${gateTxt})`;
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
                    Station Atlas {hasStationAtlas ? '' : '(Schematic)'}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '2px 7px', fontSize: 10.5 }}
                    data-testid="station-atlas-toggle-btn"
                    onClick={() => setAtlasExpanded((v) => !v)}
                  >
                    {atlasExpanded ? (locale === 'ja' ? '閉じる' : 'Close') : 'Open'}
                  </button>
                </div>
                {atlasExpanded && (
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                    <div>
                      <strong>{complex.names.ja}</strong> ({complex.stationIds.length}{' '}
                      {locale === 'ja' ? '駅連動' : 'member stations'})
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: 5, width: '100%', padding: '3px 6px', fontSize: 10.5 }}
                      onClick={onEnterUndergroundExplorer}
                    >
                      {locale === 'ja' ? '地下トンネル立体構造を見る' : 'Inspect Tunnel Layers'}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="line-dot" style={{ background: line.color }} />
                <strong>{locale === 'ja' ? line.names.ja : line.names.en ?? line.names.ja}</strong>
              </div>
              <span className="badge">{lOp?.names.ja ?? line.operatorId}</span>
            </div>

            <div className="muted" style={{ fontSize: 10.5 }}>
              {line.stationIds.length} {locale === 'ja' ? '駅' : 'stations'} · Coverage:{' '}
              <span className="mono">{line.coverageStatus}</span> ·{' '}
              <span className="mono">{line.provenance.dataNature}</span>
            </div>

            <div className="muted" style={{ fontSize: 10.5 }}>
              {lineThrough.length > 0
                ? `${locale === 'ja' ? '直通運転:' : 'Through:'} ${lineThrough
                    .map((ts) => (locale === 'ja' ? ts.names.ja : ts.names.en ?? ts.names.ja))
                    .join(', ')}`
                : locale === 'ja'
                  ? '直通運転: 未収録または設定なし'
                  : 'Through-service: None recorded / unverified'}
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
                {locale === 'ja' ? '路線全景' : 'Fit Line'}
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
                  <span>{locale === 'ja' ? '模擬列車追従' : 'Follow Train'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </aside>
  );
};
