import React, { useMemo } from 'react';
import type { AtlasDataset, SourceRecord } from '../domain/types.js';
import { UI_TEXT, type Locale } from './i18n.js';

interface CoveragePanelProps {
  dataset: AtlasDataset;
  allSources: SourceRecord[];
  locale: Locale;
}

export const CoveragePanel: React.FC<CoveragePanelProps> = ({
  dataset,
  allSources,
  locale,
}) => {
  const t = UI_TEXT[locale];
  const lineCountByOp = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of dataset.railLines) {
      map.set(l.operatorId, (map.get(l.operatorId) ?? 0) + 1);
    }
    return map;
  }, [dataset.railLines]);

  const stationCountByOp = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of dataset.stations) {
      map.set(s.operatorId, (map.get(s.operatorId) ?? 0) + 1);
    }
    return map;
  }, [dataset.stations]);

  const badgeForCoverage = (status: 'full' | 'partial' | 'none') => {
    if (status === 'full') return <span className="badge badge-ok">{t.coverageFull}</span>;
    if (status === 'partial') return <span className="badge badge-warn">{t.coveragePartial}</span>;
    return <span className="badge badge-danger">{t.coverageNone}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="coverage-panel">
      <div className="card">
        <div className="section-title">
          {locale === 'ja' ? '事業者別データカバレッジ（誠実開示）' : 'Operator Coverage Matrix'}
        </div>
        <table className="coverage-table">
          <thead>
            <tr>
              <th>事業者</th>
              <th>状態</th>
              <th>路線/駅</th>
              <th>性質</th>
            </tr>
          </thead>
          <tbody>
            {dataset.operators.map((op) => (
              <tr key={op.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <span className="line-dot" style={{ background: op.brandColor }} />
                    <span>{locale === 'ja' ? op.names.ja : op.names.en ?? op.names.ja}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{op.coverageNotes}</div>
                </td>
                <td>{badgeForCoverage(op.coverageStatus)}</td>
                <td className="mono">
                  {lineCountByOp.get(op.id) ?? 0} / {stationCountByOp.get(op.id) ?? 0}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{op.provenance.dataNature}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="section-title">
          {locale === 'ja' ? 'データ出典・ライセンス登録簿 (SourceRecords)' : 'Registered Sources & Licenses'}
        </div>
        {allSources.map((src) => (
          <div key={src.id} className="card-subtle" style={{ padding: '7px 9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 12 }}>{src.title}</strong>
              {src.shareAlike === true && (
                <span className="badge badge-danger">ODbL share-alike (隔離)</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {src.publisher} · {src.license}
            </div>
            <div className="mono" style={{ fontSize: 10 }}>
              commercial: {src.commercialUse} | redist: {src.redistribution} | shareAlike:{' '}
              {String(src.shareAlike)}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{src.notes}</div>
          </div>
        ))}
      </div>

      <div className="card" data-testid="unaligned-records-card">
        <div className="section-title">
          <span>
            {locale === 'ja'
              ? `未照合レコード（静黙破棄せず明示保持: ${dataset.unalignedRecords.length}件）`
              : `Unaligned Cross-Source Records (${dataset.unalignedRecords.length})`}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          {locale === 'ja'
            ? 'ODPT 都営 GTFS に含まれる都電荒川線・日暮里舎人ライナー等の駅は、地下鉄4線スコープ外のため強制統合せず未照合として記録しています。'
            : 'Stops from ODPT Toei GTFS outside the 4-line Toei Subway scope (e.g., Sakura Tram, Nippori-Toneri Liner) are preserved here instead of being silently dropped or force-merged.'}
        </div>
        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
          <table className="coverage-table">
            <thead>
              <tr>
                <th>駅名</th>
                <th>路線</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {dataset.unalignedRecords.slice(0, 20).map((u) => (
                <tr key={u.externalId}>
                  <td>{u.rawName}</td>
                  <td>{u.lineRaw}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{u.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
