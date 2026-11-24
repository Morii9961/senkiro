import React, { useMemo } from 'react';
import type {
  AtlasDataset,
  SkId,
  SourceRecord,
  TrackVerticalAttribute,
} from '../domain/types.js';
import { pickLocale, UI_TEXT, type Locale } from './i18n.js';

interface DetailPanelProps {
  dataset: AtlasDataset;
  allSources: SourceRecord[];
  locale: Locale;
  selectedStationId: SkId<'station'> | null;
  selectedLineId: SkId<'line'> | null;
  verticalMap: Map<string, TrackVerticalAttribute>;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onOpenStripMap: (lineId: SkId<'line'>) => void;
  onSetOrigin: (stationId: SkId<'station'>) => void;
  onSetDest: (stationId: SkId<'station'>) => void;
  onSetVia: (stationId: SkId<'station'>) => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  dataset,
  allSources,
  locale,
  selectedStationId,
  selectedLineId,
  verticalMap,
  onSelectStation,
  onSelectLine,
  onOpenStripMap,
  onSetOrigin,
  onSetDest,
  onSetVia,
}) => {
  const t = UI_TEXT[locale];
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

  if (!station && !line) {
    return (
      <div className="card-subtle" data-testid="detail-empty">
        <div style={{ fontWeight: 600 }}>
          {pickLocale(
            locale,
            '駅または路線を選択してください',
            '请选择车站或线路',
            'Select a Station or Rail Line',
          )}
        </div>
        <div className="muted">
          {pickLocale(
            locale,
            '地図上の駅・路線をクリックするか、探索タブから検索すると詳細（複合体・改札内外乗換・直通運転・出典）が表示されます。',
            '点击地图上的车站或线路，或在“探索・搜索”标签页中搜索，即可查看详情（换乘复合体、站内/出站换乘、直通运转与数据来源）。',
            'Click any station or line on the map, or pick one from Explore search, to view complex membership, interchanges, through-services, and provenance.',
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="detail-panel">
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

        return (
          <div className="card" data-testid="station-detail-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {pickLocale(
                    locale,
                    station.names.ja,
                    station.names.zh ?? station.names.ja,
                    station.names.ja,
                  ) ?? t.unknown}
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
              <span className="badge">
                {pickLocale(
                  locale,
                  op?.names.ja,
                  op?.names.zh ?? op?.names.ja,
                  op?.names.ja,
                ) ?? station.operatorId}
              </span>
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
                {station.inFareSlice
                  ? pickLocale(locale, 'JR 運賃スライス内', 'JR 票价区间内', 'JR 運賃スライス内')
                  : pickLocale(locale, 'JR 運賃スライス外', 'JR 票价区间外', 'JR 運賃スライス外')}
              </span>
              <span className="badge">
                {station.inTokyoSuburbanArea
                  ? pickLocale(locale, '東京近郊区間内', '东京近郊区间内', '東京近郊区間内')
                  : pickLocale(locale, '近郊区間外 / 非JR', '近郊区间外 / 非 JR', '近郊区間外 / 非JR')}
              </span>
            </div>

            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>
                {pickLocale(locale, '所属路線 (RailLines)', '所属线路 (RailLines)', 'Belonging Rail Lines')}
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
                      <span>
                        {pickLocale(
                          locale,
                          l.names.ja,
                          l.names.zh ?? l.names.ja,
                          l.names.en ?? l.names.ja,
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {complex && (
              <div className="card-subtle">
                <div className="section-title">
                  {pickLocale(locale, '所属 StationComplex', '所属枢纽复合体 (StationComplex)', 'Station Complex')}
                </div>
                <div style={{ fontWeight: 600 }}>
                  {pickLocale(
                    locale,
                    complex.names.ja,
                    complex.names.zh ?? complex.names.ja,
                    complex.names.en ?? complex.names.ja,
                  )}
                </div>
                <div className="mono muted" style={{ fontSize: 11 }}>
                  {complex.id} ({complexSiblings.length}{' '}
                  {pickLocale(locale, 'stations', '座车站', 'stations')})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {complexSiblings.map((sib) => (
                    <button
                      key={sib.id}
                      type="button"
                      className="btn-secondary"
                      onClick={() => onSelectStation(sib.id)}
                    >
                      {pickLocale(
                        locale,
                        operatorById.get(sib.operatorId)?.names.ja,
                        operatorById.get(sib.operatorId)?.names.zh ??
                          operatorById.get(sib.operatorId)?.names.ja,
                        operatorById.get(sib.operatorId)?.names.ja,
                      )}{' '}
                      {pickLocale(locale, sib.names.ja, sib.names.zh ?? sib.names.ja, sib.names.ja)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>
                {pickLocale(locale, '乗換関係 (Interchanges)', '换乘关系 (Interchanges)', 'Interchanges')}
              </div>
              {interchanges.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {pickLocale(
                    locale,
                    '登録済み他社乗換なし',
                    '暂无已登记的跨站换乘记录',
                    'No cross-station interchanges recorded',
                  )}
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
                    const otherOp = operatorById.get(other?.operatorId ?? 'sk:operator:jr-east');
                    return (
                      <div key={ic.id} className="card-subtle" style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>
                            {pickLocale(
                              locale,
                              otherOp?.names.ja,
                              otherOp?.names.zh ?? otherOp?.names.ja,
                              otherOp?.names.ja,
                            )}{' '}
                            {pickLocale(
                              locale,
                              other?.names.ja,
                              other?.names.zh ?? other?.names.ja,
                              other?.names.ja,
                            ) ?? otherId}
                          </strong>
                          <span className={`badge ${gateClass}`}>{gateLabel}</span>
                        </div>
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
                  {pickLocale(
                    locale,
                    '直通運転境界 (ThroughService)',
                    '直通运转边界 (ThroughService)',
                    'Through Service Boundary',
                  )}
                </div>
                {throughHere.map((ts) => (
                  <div key={ts.id} style={{ fontSize: 12 }}>
                    <strong>
                      {pickLocale(
                        locale,
                        ts.names.ja,
                        ts.names.zh ?? ts.names.ja,
                        ts.names.en ?? ts.names.ja,
                      )}
                    </strong>
                    <div className="muted">{ts.serviceDescription}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="card-subtle" style={{ fontSize: 11 }}>
              <div className="section-title">
                {pickLocale(
                  locale,
                  'Provenance / 出典・核実',
                  '数据来源与核验 (Provenance)',
                  'Provenance / 出典・核実',
                )}
              </div>
              <div>
                {pickLocale(locale, 'DataNature', '数据性质', 'DataNature')}:{' '}
                <span className="mono">{station.provenance.dataNature}</span> ·{' '}
                {pickLocale(locale, 'Last verified', '最近核验', 'Last verified')}:{' '}
                <span className="mono">{station.provenance.lastVerifiedAt}</span>
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

        return (
          <div className="card" data-testid="line-detail-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="line-dot" style={{ background: line.color, width: 12, height: 12 }} />
                <strong>
                  {pickLocale(
                    locale,
                    line.names.ja,
                    line.names.zh ?? line.names.ja,
                    line.names.en ?? line.names.ja,
                  )}
                </strong>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onOpenStripMap(line.id)}
              >
                {pickLocale(locale, 'Strip Map', '线路图', 'Strip Map')}
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {pickLocale(locale, op?.names.ja, op?.names.zh ?? op?.names.ja, op?.names.ja)} ·{' '}
              {line.lineClass} · {line.stationIds.length}{' '}
              {pickLocale(locale, 'stations', '座车站', 'stations')} · {lineSegs.length}{' '}
              {pickLocale(locale, 'segments', '个区间', 'segments')}
            </div>

            {verticalMap.size > 0 && (
              <div className="mono" style={{ fontSize: 11 }}>
                {pickLocale(
                  locale,
                  `OSM 縦断(模式): 高架 ${vertCounts.elevated} / 地上 ${vertCounts.at_grade} / 地下 ${vertCounts.underground} / 未知 ${vertCounts.unknown}`,
                  `OSM 纵断(示意): 高架 ${vertCounts.elevated} / 地面 ${vertCounts.at_grade} / 地下 ${vertCounts.underground} / 未知 ${vertCounts.unknown}`,
                  `OSM 縦断(模式): 高架 ${vertCounts.elevated} / 地上 ${vertCounts.at_grade} / 地下 ${vertCounts.underground} / 未知 ${vertCounts.unknown}`,
                )}
              </div>
            )}

            {lineThrough.length > 0 && (
              <div className="card-subtle">
                <div className="section-title">
                  {pickLocale(
                    locale,
                    '直通運転（ThroughService）',
                    '直通运转（ThroughService）',
                    '直通運転（ThroughService）',
                  )}
                </div>
                {lineThrough.map((ts) => (
                  <div key={ts.id} style={{ fontSize: 12 }}>
                    <strong>
                      {pickLocale(locale, ts.names.ja, ts.names.zh ?? ts.names.ja, ts.names.ja)}
                    </strong>
                    <div className="muted">{ts.serviceDescription}</div>
                  </div>
                ))}
              </div>
            )}

            {lineServices.length > 0 && (
              <div className="card-subtle">
                <div className="section-title">
                  {pickLocale(
                    locale,
                    '運行系統（ServicePattern · 軌道所有とは別グラフ）',
                    '运行系统（ServicePattern · 独立于轨道所有权图谱）',
                    '運行系統（ServicePattern · 軌道所有とは別グラフ）',
                  )}
                </div>
                {lineServices.map((sp) => (
                  <div key={sp.id} style={{ fontSize: 12 }}>
                    <strong>
                      {pickLocale(locale, sp.names.ja, sp.names.zh ?? sp.names.ja, sp.names.ja)}
                    </strong>{' '}
                    ({sp.serviceCategory})
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>
                {pickLocale(
                  locale,
                  '駅順・区間営業キロ',
                  '车站顺序・区间营业里程',
                  '駅順・区間営業キロ',
                )}
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
                        {idx + 1}.{' '}
                        {pickLocale(locale, st.names.ja, st.names.zh ?? st.names.ja, st.names.ja)}
                        {st.stationCode ? ` (${st.stationCode})` : ''}
                      </button>
                      {seg && (
                        <span className="mono muted" style={{ marginLeft: 8, fontSize: 11 }}>
                          →{' '}
                          {seg.operatingKm !== null
                            ? `${seg.operatingKm} km`
                            : pickLocale(locale, '未知', '未知', '未知')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
