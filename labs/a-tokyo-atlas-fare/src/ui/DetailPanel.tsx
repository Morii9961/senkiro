import React, { useMemo, useState } from 'react';
import { Building, Layers, TrainFront, Video } from 'lucide-react';
import type { TrainFollowAngle } from '../domain/cameraModeStateMachine.js';
import type {
  AtlasDataset,
  SkId,
  SourceRecord,
  TrackVerticalAttribute,
} from '../domain/types.js';
import type { TrainSimulationState } from '../three/uxContracts.js';
import { UI_TEXT, type Locale } from './i18n.js';

interface DetailPanelProps {
  dataset: AtlasDataset;
  allSources: SourceRecord[];
  locale: Locale;
  selectedStationId: SkId<'station'> | null;
  selectedLineId: SkId<'line'> | null;
  selectedTrain: TrainSimulationState | null;
  lineTrains?: TrainSimulationState[];
  verticalMap: Map<string, TrackVerticalAttribute>;
  is3dActive: boolean;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onOpenStripMap: (lineId: SkId<'line'>) => void;
  onSetOrigin: (stationId: SkId<'station'>) => void;
  onSetDest: (stationId: SkId<'station'>) => void;
  onSetVia: (stationId: SkId<'station'>) => void;
  onFollowTrain?: (trainId: string, angle?: TrainFollowAngle) => void;
  onFocusLine3D?: (lineId: SkId<'line'>) => void;
}

const KNOWN_STATION_ATLAS_COMPLEXES = new Set<string>([
  'sk:complex:shinjuku',
  'sk:complex:shibuya',
  'sk:complex:tokyo-otemachi',
  'sk:complex:ikebukuro',
  'sk:complex:shinagawa',
]);

export const DetailPanel: React.FC<DetailPanelProps> = ({
  dataset,
  allSources,
  locale,
  selectedStationId,
  selectedLineId,
  selectedTrain,
  lineTrains = [],
  verticalMap,
  is3dActive,
  onSelectStation,
  onSelectLine,
  onOpenStripMap,
  onSetOrigin,
  onSetDest,
  onSetVia,
  onFollowTrain,
  onFocusLine3D,
}) => {
  const t = UI_TEXT[locale];
  const [atlasPreviewOpen, setAtlasPreviewOpen] = useState(false);

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
    () => new Map(allSources.map((s) => [s.id, s])),
    [allSources],
  );

  const station = selectedStationId ? stationById.get(selectedStationId) ?? null : null;
  const line = selectedLineId ? lineById.get(selectedLineId) ?? null : null;

  if (!station && !line && !selectedTrain) {
    return (
      <div className="card-subtle" data-testid="detail-empty">
        <div style={{ fontWeight: 600 }}>
          {locale === 'ja'
            ? '駅・路線・模擬列車を選択してください'
            : 'Select a Station, Line, or Simulated Train'}
        </div>
        <div className="muted">
          {locale === 'ja'
            ? '地図または3D空間上の駅・路線・列車をクリックすると、詳細（換乗・直通運転・カバレッジ・出典・Station Atlas入口）が表示されます。'
            : 'Click any station, line, or simulated train on the map to view complex transfers, through-services, data coverage, provenance, and Station Atlas entry.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="detail-panel">
      {/* 1. VIRTUAL TRAIN DETAIL CARD */}
      {selectedTrain && (() => {
        const trainLine = lineById.get(selectedTrain.lineId);
        const trainOp = operatorById.get(selectedTrain.operatorId);
        return (
          <div className="card" data-testid="train-detail-card">
            <div className="banner banner-warning" data-testid="train-synthetic-banner" style={{ padding: '5px 8px', fontSize: 11 }}>
              <TrainFront size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>
                  {locale === 'ja'
                    ? '模擬運行 · SYNTHETIC SIMULATION'
                    : 'SIMULATED SERVICE · SYNTHETIC'}
                </strong>{' '}
                {locale === 'ja'
                  ? '（アルゴリズム検証用の仮想列車であり、実際のリアルタイム運行位置・列車番号ではありません）'
                  : '(Virtual spline simulation — NOT a real-time train position or official consist)'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedTrain.label}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {trainOp?.names.ja ?? selectedTrain.operatorId} · {selectedTrain.tier}
                </div>
              </div>
              <span className="badge badge-warn">{selectedTrain.status}</span>
            </div>

            <div className="detail-kv-grid">
              <span className="muted">{locale === 'ja' ? '車種 (模擬)' : 'Rolling Stock'}</span>
              <span>{locale === 'ja' ? selectedTrain.rollingStockJa : selectedTrain.rollingStockEn}</span>

              <span className="muted">{locale === 'ja' ? '所属路線' : 'Rail Line'}</span>
              <span>
                {trainLine ? (
                  <button
                    type="button"
                    className="line-pill"
                    onClick={() => onSelectLine(trainLine.id)}
                  >
                    <span className="line-dot" style={{ background: trainLine.color }} />
                    <span>{locale === 'ja' ? trainLine.names.ja : trainLine.names.en ?? trainLine.names.ja}</span>
                  </button>
                ) : (
                  selectedTrain.lineId
                )}
              </span>

              <span className="muted">{locale === 'ja' ? '模擬方向' : 'Direction'}</span>
              <span>{locale === 'ja' ? selectedTrain.directionJa : selectedTrain.directionEn}</span>

              <span className="muted">{locale === 'ja' ? '模擬状態' : 'Sim State'}</span>
              <span className="mono">
                {selectedTrain.status} · {selectedTrain.speedKmh} km/h ·{' '}
                {locale === 'ja' ? `最寄: ${selectedTrain.nearestStationJa ?? '—'}` : `Near: ${selectedTrain.nearestStationEn ?? '—'}`}
              </span>
            </div>

            {onFollowTrain && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '5px 10px', fontSize: 12 }}
                  data-testid="detail-follow-train-btn"
                  onClick={() => onFollowTrain(selectedTrain.id, 'side')}
                >
                  <Video size={13} />
                  <span>{locale === 'ja' ? '3Dで列車を追従' : 'Follow Train in 3D'}</span>
                </button>
                {(['front', 'side', 'rear', 'cab'] as TrainFollowAngle[]).map((ang) => (
                  <button
                    key={ang}
                    type="button"
                    className="btn-secondary"
                    data-testid={`detail-follow-angle-${ang}`}
                    onClick={() => onFollowTrain(selectedTrain.id, ang)}
                  >
                    {ang === 'front'
                      ? locale === 'ja'
                        ? '車頭'
                        : 'Front'
                      : ang === 'side'
                        ? locale === 'ja'
                          ? '側面'
                          : 'Side'
                        : ang === 'rear'
                          ? locale === 'ja'
                            ? '車尾'
                            : 'Rear'
                          : locale === 'ja'
                            ? '運転台'
                            : 'Cab'}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 2. STATION DETAIL CARD */}
      {station && (() => {
        const op = operatorById.get(station.operatorId);
        const complex = station.stationComplexId
          ? complexById.get(station.stationComplexId) ?? null
          : null;
        const complexSiblings = (complex?.stationIds ?? [])
          .map((id) => stationById.get(id))
          .filter((s): s is NonNullable<typeof s> => Boolean(s));
        const interchanges = dataset.interchanges.filter(
          (ic) => ic.fromStationId === station.id || ic.toStationId === station.id,
        );
        const throughHere = dataset.throughServices.filter(
          (ts) => ts.boundaryStationId === station.id,
        );
        const hasLabC =
          station.stationComplexId === 'sk:complex:shinjuku' ||
          KNOWN_STATION_ATLAS_COMPLEXES.has(station.stationComplexId ?? '');

        // Gather verified vertical classes for segments connected to this station
        const connectedSegs = dataset.trackSegments.filter(
          (seg) => seg.fromStationId === station.id || seg.toStationId === station.id,
        );
        const connectedVerticals = new Set<string>();
        for (const seg of connectedSegs) {
          const v = verticalMap.get(seg.id)?.verticalClass;
          if (v) connectedVerticals.add(v);
        }

        return (
          <div className="card" data-testid="station-detail-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {station.names.ja ?? t.unknown}
                  {station.stationCode && (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {station.stationCode}
                    </span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {station.names.en ?? t.unknown}
                  {station.names.ja_kana ? ` · ${station.names.ja_kana}` : ''}
                </div>
              </div>
              <span className="badge">{op?.names.ja ?? station.operatorId}</span>
            </div>

            <div className="mono muted" style={{ fontSize: 11 }}>
              ID: {station.id}
              {station.externalIds.ksj ? ` · KSJ: ${station.externalIds.ksj.split(',')[0]}` : ''}
              {station.externalIds.odptGtfs ? ` · ODPT GTFS: ${station.externalIds.odptGtfs}` : ''}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '5px 10px', fontSize: 12 }}
                data-testid="btn-set-origin"
                onClick={() => onSetOrigin(station.id)}
              >
                {t.setOrigin}
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '5px 10px', fontSize: 12, background: '#dc2626' }}
                data-testid="btn-set-dest"
                onClick={() => onSetDest(station.id)}
              >
                {t.setDest}
              </button>
              <button
                type="button"
                className="btn-secondary"
                data-testid="btn-set-via"
                onClick={() => onSetVia(station.id)}
              >
                {t.setVia}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${station.inFareSlice ? 'badge-ok' : 'badge-warn'}`}>
                {station.inFareSlice ? 'JR 運賃スライス内' : 'JR 運賃スライス外'}
              </span>
              <span className="badge">
                {station.inTokyoSuburbanArea ? '東京近郊区間内' : '近郊区間外 / 非JR'}
              </span>
            </div>

            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>
                {locale === 'ja' ? '所属路線 (RailLines)' : 'Belonging Rail Lines'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {station.railLineIds.map((lid) => {
                  const l = lineById.get(lid);
                  if (!l) return null;
                  return (
                    <button
                      key={lid}
                      type="button"
                      className="line-pill"
                      onClick={() => onSelectLine(lid)}
                    >
                      <span className="line-dot" style={{ background: l.color }} />
                      <span>{locale === 'ja' ? l.names.ja : l.names.en ?? l.names.ja}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {complex && (
              <div className="card-subtle">
                <div className="section-title">
                  {locale === 'ja' ? '所属 StationComplex' : 'Station Complex'}
                </div>
                <div style={{ fontWeight: 600 }}>
                  {locale === 'ja' ? complex.names.ja : complex.names.en ?? complex.names.ja}
                </div>
                <div className="mono muted" style={{ fontSize: 11 }}>
                  {complex.id} ({complexSiblings.length} stations)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {complexSiblings.map((sib) => (
                    <button
                      key={sib.id}
                      type="button"
                      className="btn-secondary"
                      onClick={() => onSelectStation(sib.id)}
                    >
                      {operatorById.get(sib.operatorId)?.names.ja} {sib.names.ja}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>
                {locale === 'ja' ? '乗換関係 (Interchanges)' : 'Interchanges'}
              </div>
              {interchanges.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {locale === 'ja' ? '登録済み他社乗換なし' : 'No cross-station interchanges recorded'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {interchanges.map((ic) => {
                    const otherId =
                      ic.fromStationId === station.id ? ic.toStationId : ic.fromStationId;
                    const other = stationById.get(otherId);
                    const gateLabel =
                      ic.gateType === 'in_gate'
                        ? t.inGate
                        : ic.gateType === 'out_of_gate'
                          ? t.outOfGate
                          : t.gateUnknown;
                    const gateClass =
                      ic.gateType === 'in_gate'
                        ? 'badge-ok'
                        : ic.gateType === 'out_of_gate'
                          ? 'badge-warn'
                          : '';
                    return (
                      <div key={ic.id} className="card-subtle" style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>
                            {operatorById.get(other?.operatorId ?? 'sk:operator:jr-east')?.names.ja}{' '}
                            {other?.names.ja ?? otherId}
                          </strong>
                          <span className={`badge ${gateClass}`}>{gateLabel}</span>
                        </div>
                        {ic.walkingMinutes !== null && (
                          <div className="mono muted" style={{ fontSize: 10.5 }}>
                            Walk: ~{ic.walkingMinutes} min
                          </div>
                        )}
                        {ic.notes && <div className="muted" style={{ fontSize: 11 }}>{ic.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {throughHere.length > 0 && (
              <div className="card-subtle">
                <div className="section-title">
                  {locale === 'ja' ? '直通運転境界 (ThroughService)' : 'Through Service Boundary'}
                </div>
                {throughHere.map((ts) => (
                  <div key={ts.id} style={{ fontSize: 12 }}>
                    <strong>{locale === 'ja' ? ts.names.ja : ts.names.en ?? ts.names.ja}</strong>
                    <div className="muted">{ts.serviceDescription}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Station Atlas Portal Entry */}
            <div className="card-subtle" data-testid="station-atlas-entry-card">
              <div className="section-title">
                <span>SENKIRO Station Atlas</span>
                <span className={`badge ${hasLabC ? 'badge-ok' : ''}`}>
                  {station.stationComplexId === 'sk:complex:shinjuku'
                    ? locale === 'ja'
                      ? 'Lab C 連携候補'
                      : 'Lab C Linked'
                    : locale === 'ja'
                      ? '構内構造ビュー'
                      : 'Complex View'}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {locale === 'ja'
                  ? '駅構内の改札・コンコース・昇降設備の精密3D案内は独立モジュール Station Atlas（Lab C: 新宿先行実装）と連携します。'
                  : 'Detailed indoor gates, concourses & escalators belong to the dedicated SENKIRO Station Atlas module (Lab C: Shinjuku prototype).'}
              </div>
              <button
                type="button"
                className="btn-secondary"
                data-testid="station-atlas-entry-btn"
                onClick={() => setAtlasPreviewOpen((v) => !v)}
              >
                <Building size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                {atlasPreviewOpen
                  ? locale === 'ja'
                    ? 'Station Atlas 概要を閉じる'
                    : 'Close Station Atlas Overview'
                  : locale === 'ja'
                    ? 'Station Atlas 構内・階層入口を開く'
                    : 'Open Station Atlas Entry'}
              </button>

              {atlasPreviewOpen && (
                <div
                  className="card"
                  style={{ padding: '7px 9px', fontSize: 11 }}
                  data-testid="station-atlas-preview"
                >
                  <div>
                    <strong>{complex?.names.ja ?? station.names.ja}</strong>{' '}
                    <span className="mono muted">({station.stationComplexId ?? station.id})</span>
                  </div>
                  <div className="muted">
                    {locale === 'ja' ? '接続路線数' : 'Lines'}: {station.railLineIds.length} ·{' '}
                    {locale === 'ja' ? '乗換関係' : 'Interchanges'}: {interchanges.length} ·{' '}
                    {locale === 'ja' ? '縦断構造' : 'Vertical'}:{' '}
                    {connectedVerticals.size > 0
                      ? Array.from(connectedVerticals)
                          .map((v) =>
                            locale === 'ja'
                              ? v === 'elevated'
                                ? '高架'
                                : v === 'at_grade'
                                  ? '地上'
                                  : v === 'underground'
                                    ? '地下'
                                    : '未知'
                              : v,
                          )
                          .join(' / ')
                      : t.unknown}
                  </div>
                  <div className="muted">
                    {station.stationComplexId === 'sk:complex:shinjuku'
                      ? locale === 'ja'
                        ? '原型 C（labs/c-shinjuku-3d）に新宿駅複合体の詳細構内3Dモデルが存在します。'
                        : 'Detailed 3D indoor model exists in sibling prototype labs/c-shinjuku-3d.'
                      : locale === 'ja'
                        ? '当駅の詳細構内平面・改札・エレベーター階層データは現在未収録です（誠実開示）。'
                        : 'Detailed indoor gates/escalators for this station are not yet recorded in this dataset.'}
                  </div>
                </div>
              )}
            </div>

            <div className="card-subtle" style={{ fontSize: 11 }}>
              <div className="section-title">Provenance / 出典・核実</div>
              <div>
                DataNature: <span className="mono">{station.provenance.dataNature}</span> ·
                Last verified: <span className="mono">{station.provenance.lastVerifiedAt}</span>
              </div>
              {station.provenance.sourceIds.map((sid) => {
                const src = sourceById.get(sid);
                return (
                  <div key={sid} className="muted">
                    • {src ? `${src.title} (${src.license})` : sid}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 3. LINE DETAIL CARD */}
      {line && (() => {
        const op = operatorById.get(line.operatorId);
        const lineSegs = dataset.trackSegments.filter((seg) =>
          seg.railLineIds.includes(line.id),
        );
        const lineThrough = dataset.throughServices.filter(
          (ts) => ts.fromRailLineId === line.id || ts.toRailLineId === line.id,
        );
        const lineServices = dataset.servicePatterns.filter((sp) =>
          sp.railLineIds.includes(line.id),
        );
        const vertCounts = { elevated: 0, at_grade: 0, underground: 0, unknown: 0 };
        for (const seg of lineSegs) {
          const vc = verticalMap.get(seg.id)?.verticalClass ?? 'unknown';
          vertCounts[vc]++;
        }
        const coverageLabel =
          line.coverageStatus === 'full'
            ? t.coverageFull
            : line.coverageStatus === 'partial'
              ? t.coveragePartial
              : t.coverageNone;
        const coverageBadgeClass =
          line.coverageStatus === 'full'
            ? 'badge-ok'
            : line.coverageStatus === 'partial'
              ? 'badge-warn'
              : 'badge-danger';
        const firstLineTrain = lineTrains[0] ?? null;

        return (
          <div className="card" data-testid="line-detail-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="line-dot" style={{ background: line.color, width: 12, height: 12 }} />
                <strong>{locale === 'ja' ? line.names.ja : line.names.en ?? line.names.ja}</strong>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onOpenStripMap(line.id)}
              >
                Strip Map
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {op?.names.ja} · {line.lineClass} · {line.stationIds.length} stations ·{' '}
              {lineSegs.length} segments
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {is3dActive && onFocusLine3D && (
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="detail-focus-line-3d"
                  onClick={() => onFocusLine3D(line.id)}
                >
                  <Layers size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  {locale === 'ja' ? '3D全体フォーカス' : 'Fit Line in 3D'}
                </button>
              )}
              {is3dActive && firstLineTrain && onFollowTrain && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '4px 9px', fontSize: 11.5 }}
                  data-testid="detail-follow-line-train"
                  onClick={() => onFollowTrain(firstLineTrain.id, 'side')}
                >
                  <Video size={12} />
                  <span>{locale === 'ja' ? 'この路線の模擬列車を追従' : 'Follow Simulated Train'}</span>
                </button>
              )}
            </div>

            {verticalMap.size > 0 && (
              <div className="mono" style={{ fontSize: 11 }}>
                OSM 縦断(模式): 高架 {vertCounts.elevated} / 地上 {vertCounts.at_grade} / 地下{' '}
                {vertCounts.underground} / 未知 {vertCounts.unknown}
              </div>
            )}

            <div className="card-subtle">
              <div className="section-title">
                {locale === 'ja' ? '直通運転（ThroughService）' : 'Through Services'}
              </div>
              {lineThrough.length > 0 ? (
                lineThrough.map((ts) => (
                  <div key={ts.id} style={{ fontSize: 12 }}>
                    <strong>{locale === 'ja' ? ts.names.ja : ts.names.en ?? ts.names.ja}</strong>
                    <div className="muted">{ts.serviceDescription}</div>
                  </div>
                ))
              ) : (
                <div className="muted" style={{ fontSize: 11 }}>
                  {locale === 'ja'
                    ? '本路線に該当する核実済み直通運転データなし（未収録または直通なし）'
                    : 'No verified through-service records recorded for this line.'}
                </div>
              )}
            </div>

            {lineServices.length > 0 && (
              <div className="card-subtle">
                <div className="section-title">運行系統（ServicePattern · 軌道所有とは別グラフ）</div>
                {lineServices.map((sp) => (
                  <div key={sp.id} style={{ fontSize: 12 }}>
                    <strong>{sp.names.ja}</strong> ({sp.serviceCategory})
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>
                {locale === 'ja' ? '駅順・区間営業キロ' : 'Station Sequence & Operating Km'}
              </div>
              <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {line.stationIds.map((sid, idx) => {
                  const st = stationById.get(sid);
                  if (!st) return null;
                  const nextSid = line.stationIds[idx + 1];
                  const seg = nextSid
                    ? lineSegs.find(
                        (s) =>
                          (s.fromStationId === sid && s.toStationId === nextSid) ||
                          (s.fromStationId === nextSid && s.toStationId === sid),
                      )
                    : null;
                  return (
                    <div key={sid} style={{ fontSize: 12 }}>
                      <button
                        type="button"
                        onClick={() => onSelectStation(sid)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '2px 0',
                          fontWeight: 600,
                        }}
                      >
                        {idx + 1}. {st.names.ja}
                        {st.stationCode ? ` (${st.stationCode})` : ''}
                      </button>
                      {seg && (
                        <span className="mono muted" style={{ marginLeft: 8, fontSize: 11 }}>
                          → {seg.operatingKm !== null ? `${seg.operatingKm} km` : t.unknown}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Line Data Coverage & Provenance */}
            <div className="card-subtle" style={{ fontSize: 11 }} data-testid="line-coverage-provenance">
              <div className="section-title">
                <span>{locale === 'ja' ? 'データカバレッジ・出典' : 'Coverage & Provenance'}</span>
                <span className={`badge ${coverageBadgeClass}`}>{coverageLabel}</span>
              </div>
              <div>
                DataNature: <span className="mono">{line.provenance.dataNature}</span> ·
                Last verified: <span className="mono">{line.provenance.lastVerifiedAt}</span>
              </div>
              {line.provenance.sourceIds.map((sid) => {
                const src = sourceById.get(sid);
                return (
                  <div key={sid} className="muted">
                    • {src ? `${src.title} (${src.license})` : sid}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
