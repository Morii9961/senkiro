import React, { useMemo } from 'react';
import type { AtlasDataset, SourceRecord } from '../domain/types.js';
import { pickLocale, UI_TEXT, type Locale } from './i18n.js';

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
          {pickLocale(
            locale,
            '事業者別データカバレッジ（誠実開示）',
            '各运营商数据覆盖范围（如实披露）',
            'Operator Coverage Matrix',
          )}
        </div>
        <table className="coverage-table">
          <thead>
            <tr>
              <th>{pickLocale(locale, '事業者', '运营商', '事業者')}</th>
              <th>{pickLocale(locale, '状態', '状态', '状態')}</th>
              <th>{pickLocale(locale, '路線/駅', '线路/车站', '路線/駅')}</th>
              <th>{pickLocale(locale, '性質', '性质', '性質')}</th>
            </tr>
          </thead>
          <tbody>
            {dataset.operators.map((op) => (
              <tr key={op.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <span className="line-dot" style={{ background: op.brandColor }} />
                    <span>
                      {pickLocale(
                        locale,
                        op.names.ja,
                        op.names.zh ?? op.names.ja,
                        op.names.en ?? op.names.ja,
                      )}
                    </span>
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
          {pickLocale(
            locale,
            'データ出典・ライセンス登録簿 (SourceRecords)',
            '数据来源与许可证登记表 (SourceRecords)',
            'Registered Sources & Licenses',
          )}
        </div>
        {allSources.map((src) => (
          <div key={src.id} className="card-subtle" style={{ padding: '7px 9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 12 }}>{src.title}</strong>
              {src.shareAlike === true && (
                <span className="badge badge-danger">
                  {pickLocale(
                    locale,
                    'ODbL share-alike (隔離)',
                    'ODbL 相同方式共享 (隔离)',
                    'ODbL share-alike (隔離)',
                  )}
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {src.publisher} · {src.license}
            </div>
            <div className="mono" style={{ fontSize: 10 }}>
              {pickLocale(locale, 'commercial:', '商用:', 'commercial:')} {src.commercialUse} |{' '}
              {pickLocale(locale, 'redist:', '再分发:', 'redist:')} {src.redistribution} |{' '}
              {pickLocale(locale, 'shareAlike:', '相同方式共享:', 'shareAlike:')}{' '}
              {String(src.shareAlike)}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{src.notes}</div>
          </div>
        ))}
      </div>

      <div className="card" data-testid="unaligned-records-card">
        <div className="section-title">
          <span>
            {pickLocale(
              locale,
              `未照合レコード（静黙破棄せず明示保持: ${dataset.unalignedRecords.length}件）`,
              `未对齐记录（不静默丢弃・明确保留: ${dataset.unalignedRecords.length} 条）`,
              `Unaligned Cross-Source Records (${dataset.unalignedRecords.length})`,
            )}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          {pickLocale(
            locale,
            'ODPT 都営 GTFS に含まれる都電荒川線・日暮里舎人ライナー等の駅は、地下鉄4線スコープ外のため強制統合せず未照合として記録しています。',
            'ODPT 都营 GTFS 中包含的都电荒川线、日暮里舍人线等车站不属于都营地铁 4 线范围，因此不强行合并，而是作为未对齐记录保留于此。',
            'Stops from ODPT Toei GTFS outside the 4-line Toei Subway scope (e.g., Sakura Tram, Nippori-Toneri Liner) are preserved here instead of being silently dropped or force-merged.',
          )}
        </div>
        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
          <table className="coverage-table">
            <thead>
              <tr>
                <th>{pickLocale(locale, '駅名', '站名', '駅名')}</th>
                <th>{pickLocale(locale, '路線', '线路', '路線')}</th>
                <th>{pickLocale(locale, '理由', '原因', '理由')}</th>
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
