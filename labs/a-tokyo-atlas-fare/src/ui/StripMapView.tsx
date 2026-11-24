import React, { useMemo } from 'react';
import type { AtlasDataset, SkId } from '../domain/types.js';
import { pickLocale, UI_TEXT, type Locale } from './i18n.js';

interface StripMapViewProps {
  dataset: AtlasDataset;
  locale: Locale;
  selectedLineId: SkId<'line'> | null;
  selectedStationId: SkId<'station'> | null;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSetOrigin: (stationId: SkId<'station'>) => void;
  onSetDest: (stationId: SkId<'station'>) => void;
}

export const StripMapView: React.FC<StripMapViewProps> = ({
  dataset,
  locale,
  selectedLineId,
  selectedStationId,
  onSelectLine,
  onSelectStation,
  onSetOrigin,
  onSetDest,
}) => {
  const t = UI_TEXT[locale];
  const activeLine = useMemo(() => {
    return (
      dataset.railLines.find((l) => l.id === selectedLineId) ??
      dataset.railLines.find((l) => l.id === 'sk:line:jr-east-yamanote') ??
      dataset.railLines[0]
    );
  }, [dataset.railLines, selectedLineId]);

  const stationById = useMemo(
    () => new Map(dataset.stations.map((s) => [s.id, s])),
    [dataset.stations],
  );
  const operatorById = useMemo(
    () => new Map(dataset.operators.map((o) => [o.id, o])),
    [dataset.operators],
  );

  const segBetween = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!activeLine) return map;
    for (const seg of dataset.trackSegments) {
      if (!seg.railLineIds.includes(activeLine.id)) continue;
      map.set(`${seg.fromStationId}::${seg.toStationId}`, seg.operatingKm);
      map.set(`${seg.toStationId}::${seg.fromStationId}`, seg.operatingKm);
    }
    return map;
  }, [dataset.trackSegments, activeLine]);

  const throughServices = useMemo(() => {
    if (!activeLine) return [];
    return dataset.throughServices.filter(
      (ts) => ts.fromRailLineId === activeLine.id || ts.toRailLineId === activeLine.id,
    );
  }, [dataset.throughServices, activeLine]);

  if (!activeLine) return null;
  const op = operatorById.get(activeLine.operatorId);

  return (
    <div className="strip-container" data-testid="strip-map-view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label className="form-label" style={{ minWidth: 280 }}>
          <span>
            {pickLocale(
              locale,
              '表示路線を選択（Strip Map）',
              '选择显示线路 (Strip Map)',
              'Select Rail Line (Strip Map)',
            )}
          </span>
          <select
            className="input-field"
            value={activeLine.id}
            onChange={(e) => onSelectLine(e.target.value as SkId<'line'>)}
          >
            {dataset.railLines.map((l) => (
              <option key={l.id} value={l.id}>
                {pickLocale(locale, l.names.ja, l.names.zh ?? l.names.ja, l.names.ja)} (
                {pickLocale(
                  locale,
                  operatorById.get(l.operatorId)?.names.ja,
                  operatorById.get(l.operatorId)?.names.zh ??
                    operatorById.get(l.operatorId)?.names.ja,
                  operatorById.get(l.operatorId)?.names.ja,
                )}
                )
              </option>
            ))}
          </select>
        </label>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="line-dot" style={{ background: activeLine.color, width: 14, height: 14 }} />
            <strong style={{ fontSize: 16 }}>
              {pickLocale(
                locale,
                activeLine.names.ja,
                activeLine.names.zh ?? activeLine.names.ja,
                activeLine.names.en ?? activeLine.names.ja,
              )}
            </strong>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {pickLocale(locale, op?.names.ja, op?.names.zh ?? op?.names.ja, op?.names.ja)} ·{' '}
            {activeLine.lineClass} ·{' '}
            {activeLine.inFareSlice
              ? pickLocale(locale, 'JR 運賃スライス内', 'JR 票价区间内', 'JR 運賃スライス内')
              : pickLocale(locale, '地図表示のみ', '仅地图展示', '地図表示のみ')}
          </div>
        </div>
      </div>

      {throughServices.length > 0 && (
        <div className="card-subtle" style={{ marginTop: 12, maxWidth: 760 }}>
          <div className="section-title">
            {pickLocale(
              locale,
              '直通運転（ThroughService · 路線所有とは別モデル）',
              '直通运转（ThroughService · 独立于线路所有权建模）',
              'Through Services (Modeled Separately from Track Ownership)',
            )}
          </div>
          {throughServices.map((ts) => (
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

      <div className="strip-track" role="list">
        {activeLine.stationIds.map((sid, idx) => {
          const st = stationById.get(sid);
          if (!st) return null;
          const nextSid = activeLine.stationIds[idx + 1];
          const kmToNext = nextSid ? segBetween.get(`${sid}::${nextSid}`) ?? null : null;
          const isSelected = sid === selectedStationId;
          const tsHere = throughServices.filter((ts) => ts.boundaryStationId === sid);

          return (
            <div key={sid} role="listitem">
              <div
                className="strip-node"
                style={{
                  background: isSelected ? 'var(--accent-soft)' : 'transparent',
                  borderRadius: 6,
                  padding: '0 8px',
                }}
              >
                <div className="mono muted" style={{ fontSize: 11 }}>
                  {st.stationCode ?? `#${idx + 1}`}
                </div>
                <div className="strip-rail-col" style={{ color: activeLine.color }}>
                  <div
                    className="strip-rail-bar"
                    style={{ background: idx === 0 ? 'transparent' : activeLine.color }}
                  />
                  <div className="strip-dot" />
                  <div
                    className="strip-rail-bar"
                    style={{
                      background:
                        idx === activeLine.stationIds.length - 1
                          ? 'transparent'
                          : activeLine.color,
                    }}
                  />
                </div>
                <div style={{ padding: '6px 8px' }}>
                  <button
                    type="button"
                    onClick={() => onSelectStation(sid)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {pickLocale(locale, st.names.ja, st.names.zh ?? st.names.ja, st.names.ja)}
                    {st.names.en && (
                      <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                        {st.names.en}
                      </span>
                    )}
                  </button>
                  {tsHere.length > 0 && (
                    <div style={{ marginTop: 2 }}>
                      {tsHere.map((ts) => (
                        <span key={ts.id} className="badge badge-ok" style={{ marginRight: 4 }}>
                          {pickLocale(
                            locale,
                            '直通境界 / Through Boundary',
                            '直通边界',
                            '直通境界 / Through Boundary',
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSetOrigin(sid)}
                  >
                    {t.setOrigin}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSetDest(sid)}
                  >
                    {t.setDest}
                  </button>
                </div>
              </div>
              {nextSid && (
                <div
                  style={{
                    marginLeft: 95,
                    borderLeft: `6px solid ${activeLine.color}`,
                    padding: '2px 0 2px 16px',
                    fontSize: 11,
                  }}
                  className="mono muted"
                >
                  {kmToNext !== null
                    ? pickLocale(
                        locale,
                        `営業キロ ${kmToNext} km`,
                        `营业里程 ${kmToNext} km`,
                        `営業キロ ${kmToNext} km`,
                      )
                    : pickLocale(
                        locale,
                        '営業キロ: 未知 / Unverified',
                        '营业里程: 未知 / 未核实',
                        '営業キロ: 未知 / Unverified',
                      )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
