import React, { useMemo } from 'react';
import type {
  AtlasDataset,
  FareQuote,
  FareQuoteRequest,
  SkId,
  SurchargeType,
  TicketType,
} from '../domain/types.js';
import { UI_TEXT, type Locale } from './i18n.js';

interface FarePanelProps {
  dataset: AtlasDataset;
  locale: Locale;
  request: FareQuoteRequest;
  quote: FareQuote | null;
  onChangeRequest: (next: FareQuoteRequest) => void;
  onCalculate: (req?: FareQuoteRequest) => void;
}

interface PresetScenario {
  id: string;
  labelJa: string;
  labelEn: string;
  req: FareQuoteRequest;
}

const PRESETS: PresetScenario[] = [
  {
    id: 'suburban-detour',
    labelJa: '東京→上野（山手線大回り・近郊区間）',
    labelEn: 'Tokyo→Ueno (Suburban Detour)',
    req: {
      originStationId: 'sk:station:jr-east-tokyo',
      destinationStationId: 'sk:station:jr-east-ueno',
      routePreference: 'yamanote_loop_detour',
      travelDate: '2026-06-01',
      ticketType: 'ordinary_paper',
      requireStopover: false,
      surchargeType: 'none',
    },
  },
  {
    id: 'art69-mishima',
    labelJa: '東京→三島（西大井経由・第69条＆近郊外）',
    labelEn: 'Tokyo→Mishima (Art.69 Yokosuka)',
    req: {
      originStationId: 'sk:station:jr-east-tokyo',
      destinationStationId: 'sk:station:jr-central-mishima',
      routePreference: 'yokosuka_bypass',
      travelDate: '2026-06-01',
      ticketType: 'ordinary_paper',
      requireStopover: false,
      surchargeType: 'none',
    },
  },
  {
    id: 'shinkansen-2026-split',
    labelJa: '東京→熱海 新幹線（2026/3/14改定・別線化）',
    labelEn: 'Tokyo→Atami Shinkansen (2026 Separate)',
    req: {
      originStationId: 'sk:station:jr-east-tokyo',
      destinationStationId: 'sk:station:jr-east-atami',
      preferShinkansen: true,
      routePreference: 'shinkansen',
      travelDate: '2026-06-01',
      ticketType: 'ordinary_paper',
      requireStopover: false,
      surchargeType: 'limited_express_reserved',
    },
  },
  {
    id: 'shinkansen-2025-same',
    labelJa: '東京→熱海 新幹線（2026/3/13以前・同一視）',
    labelEn: 'Tokyo→Atami Shinkansen (Pre-2026 Same)',
    req: {
      originStationId: 'sk:station:jr-east-tokyo',
      destinationStationId: 'sk:station:jr-east-atami',
      preferShinkansen: true,
      routePreference: 'shinkansen',
      travelDate: '2026-03-13',
      ticketType: 'ordinary_paper',
      requireStopover: false,
      surchargeType: 'limited_express_non_reserved',
    },
  },
  {
    id: 'local-line-reject',
    labelJa: '東京→拝島（八高線・地方交通線拒算）',
    labelEn: 'Tokyo→Haijima (Local Line Reject)',
    req: {
      originStationId: 'sk:station:jr-east-tokyo',
      destinationStationId: 'sk:station:jr-east-haijima',
      routePreference: 'shortest',
      travelDate: '2026-06-01',
      ticketType: 'ordinary_paper',
      requireStopover: false,
      surchargeType: 'none',
    },
  },
  {
    id: 'non-jr-reject',
    labelJa: '非JR（大手町メトロ→新宿JR・対象外）',
    labelEn: 'Non-JR (Metro Otemachi → Shinjuku)',
    req: {
      originStationId: 'sk:station:tokyo-metro-otemachi',
      destinationStationId: 'sk:station:jr-east-shinjuku',
      routePreference: 'shortest',
      travelDate: '2026-06-01',
      ticketType: 'ordinary_paper',
      requireStopover: false,
      surchargeType: 'none',
    },
  },
];

export const FarePanel: React.FC<FarePanelProps> = ({
  dataset,
  locale,
  request,
  quote,
  onChangeRequest,
  onCalculate,
}) => {
  const t = UI_TEXT[locale];
  const operatorById = useMemo(
    () => new Map(dataset.operators.map((o) => [o.id, o])),
    [dataset.operators],
  );

  // Sort stations so JR Fare Slice stations appear first, followed by other stations for honest rejection testing
  const sortedStations = useMemo(() => {
    return [...dataset.stations].sort((a, b) => {
      if (a.inFareSlice !== b.inFareSlice) return a.inFareSlice ? -1 : 1;
      const opCmp = a.operatorId.localeCompare(b.operatorId);
      if (opCmp !== 0) return opCmp;
      return (a.names.ja ?? '').localeCompare(b.names.ja ?? '', 'ja');
    });
  }, [dataset.stations]);

  const statusBadgeClass = (status: FareQuote['status']) => {
    if (status === 'OK') return 'badge-ok';
    if (status === 'STALE_RULE' || status === 'ERROR') return 'badge-danger';
    return 'badge-warn';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="fare-panel">
      {/* Mandatory prominent synthetic tariff disclaimer */}
      <div className="banner banner-warning" data-testid="synthetic-tariff-banner" role="note">
        <span>⚠ {t.syntheticBanner}</span>
      </div>

      {/* Quick Verification Presets */}
      <div>
        <div className="section-title" style={{ marginBottom: 4 }}>
          {locale === 'ja' ? '規則検証プリセット' : 'Rule Verification Presets'}
        </div>
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset-chip"
              data-testid={`preset-${p.id}`}
              onClick={() => {
                onChangeRequest(p.req);
                onCalculate(p.req);
              }}
            >
              {locale === 'ja' ? p.labelJa : p.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="card form-grid">
        <label className="form-label">
          <span>{t.origin}</span>
          <select
            className="input-field"
            data-testid="fare-origin-select"
            value={request.originStationId}
            onChange={(e) =>
              onChangeRequest({
                ...request,
                originStationId: e.target.value as SkId<'station'>,
              })
            }
          >
            {sortedStations.map((s) => (
              <option key={s.id} value={s.id}>
                [{operatorById.get(s.operatorId)?.names.ja}] {s.names.ja}
                {s.names.en ? ` (${s.names.en})` : ''}
                {!s.inFareSlice ? ' · スライス外' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="form-label">
          <span>{t.destination}</span>
          <select
            className="input-field"
            data-testid="fare-dest-select"
            value={request.destinationStationId}
            onChange={(e) =>
              onChangeRequest({
                ...request,
                destinationStationId: e.target.value as SkId<'station'>,
              })
            }
          >
            {sortedStations.map((s) => (
              <option key={s.id} value={s.id}>
                [{operatorById.get(s.operatorId)?.names.ja}] {s.names.ja}
                {s.names.en ? ` (${s.names.en})` : ''}
                {!s.inFareSlice ? ' · スライス外' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="form-label">
          <span>{t.via}</span>
          <select
            className="input-field"
            data-testid="fare-via-select"
            value={request.viaStationIds?.[0] ?? ''}
            onChange={(e) =>
              onChangeRequest({
                ...request,
                viaStationIds: e.target.value ? [e.target.value as SkId<'station'>] : [],
              })
            }
          >
            <option value="">{locale === 'ja' ? '指定なし' : 'None'}</option>
            {sortedStations
              .filter((s) => s.inFareSlice)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  [{operatorById.get(s.operatorId)?.names.ja}] {s.names.ja}
                </option>
              ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="form-label">
            <span>{t.travelDate}</span>
            <input
              type="date"
              className="input-field"
              data-testid="fare-date-input"
              value={request.travelDate}
              onChange={(e) =>
                onChangeRequest({ ...request, travelDate: e.target.value })
              }
            />
          </label>
          <label className="form-label">
            <span>{t.ticketType}</span>
            <select
              className="input-field"
              data-testid="fare-ticket-select"
              value={request.ticketType}
              onChange={(e) =>
                onChangeRequest({
                  ...request,
                  ticketType: e.target.value as TicketType,
                })
              }
            >
              <option value="ordinary_paper">{t.paperTicket}</option>
              <option value="ic_card">{t.icCard}</option>
            </select>
          </label>
        </div>

        <label className="form-label">
          <span>{t.routePref}</span>
          <select
            className="input-field"
            data-testid="fare-route-pref-select"
            value={request.routePreference ?? 'shortest'}
            onChange={(e) => {
              const pref = e.target.value as NonNullable<FareQuoteRequest['routePreference']>;
              onChangeRequest({
                ...request,
                routePreference: pref,
                preferShinkansen: pref === 'shinkansen',
              });
            }}
          >
            <option value="shortest">最短在来線 (Shortest Conventional)</option>
            <option value="yokosuka_bypass">横須賀線・西大井経由 (Art.69-4 Bypass)</option>
            <option value="oku_bypass">東北本線・尾久経由 (Art.69-2 Bypass)</option>
            <option value="saikyo_bypass">埼京線・戸田公園経由 (Saikyo Bypass)</option>
            <option value="yamanote_loop_detour">山手線大回り迂回 (Suburban Detour)</option>
            <option value="shinkansen">新幹線優先 (Shinkansen · Art.16-2)</option>
          </select>
        </label>

        <label className="form-label">
          <span>{t.surcharge}</span>
          <select
            className="input-field"
            data-testid="fare-surcharge-select"
            value={request.surchargeType ?? 'none'}
            onChange={(e) =>
              onChangeRequest({
                ...request,
                surchargeType: e.target.value as SurchargeType,
              })
            }
          >
            <option value="none">なし（普通乗車券のみ）</option>
            <option value="limited_express_non_reserved">特急料金・自由席（合成）</option>
            <option value="limited_express_reserved">特急料金・指定席（合成）</option>
            <option value="green_car">グリーン料金＋特急（合成）</option>
            <option value="gran_class">グランクラス料金＋特急（合成・新幹線限定）</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            data-testid="fare-stopover-checkbox"
            checked={Boolean(request.requireStopover)}
            onChange={(e) =>
              onChangeRequest({ ...request, requireStopover: e.target.checked })
            }
          />
          <span>{t.requireStopover}</span>
        </label>

        <button
          type="button"
          className="btn-primary"
          data-testid="fare-calculate-btn"
          onClick={() => onCalculate()}
        >
          {t.calculate}
        </button>
      </div>

      {/* Quote Output & Explainability Tree */}
      {quote && (
        <div className="card" data-testid="fare-quote-result">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${statusBadgeClass(quote.status)}`} data-testid="fare-status-badge">
              {quote.status}
            </span>
            {quote.ruleVersionUsed && (
              <span className="badge mono">{quote.ruleVersionUsed}</span>
            )}
          </div>

          {quote.status === 'OK' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {quote.isSyntheticTariff
                      ? '合成デモ合計（購入不可）'
                      : '合計金額'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }} className="mono" data-testid="fare-total-amount">
                    ¥{quote.totalAmountYen?.toLocaleString()}
                    {quote.isSyntheticTariff && (
                      <span className="badge badge-warn" style={{ marginLeft: 8, fontSize: 10 }}>
                        SYNTHETIC
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12 }}>
                  <div>
                    有効期間: <strong>{quote.validityDays} 日</strong>
                  </div>
                  <div>
                    途中下車: <strong>{quote.stopoverAllowed ? '可 (Allowed)' : '不可 (No)'}</strong>
                  </div>
                </div>
              </div>

              {quote.pathsDiffer && quote.pathDiffSummary && (
                <div className="banner banner-ok" style={{ fontSize: 11 }}>
                  {quote.pathDiffSummary}
                </div>
              )}

              {/* Candidate Routes */}
              {quote.candidateRoutes && quote.candidateRoutes.length > 0 && (
                <div>
                  <div className="section-title" style={{ marginBottom: 4 }}>
                    候補・比較経路（地図連動ハイライト）
                  </div>
                  {quote.candidateRoutes.map((cr) => (
                    <div
                      key={cr.id}
                      className="card-subtle"
                      style={{
                        marginBottom: 4,
                        padding: '5px 8px',
                        borderLeft: `4px solid ${cr.isBilledPath ? '#0284c7' : '#ea580c'}`,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{cr.label}</div>
                      <div className="mono muted" style={{ fontSize: 11 }}>
                        {cr.path.segmentIds.length} segments · operators:{' '}
                        {cr.path.operatorsInvolved.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Fare Breakdown */}
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>
                  費用内訳 (Fare Breakdown)
                </div>
                {quote.breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border)',
                      padding: '5px 0',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{item.label}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{item.notes}</div>
                    </div>
                    <div className="mono" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      ¥{item.amountYen?.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="banner banner-danger" data-testid="fare-rejected-reason">
              <div>
                <strong>金額出力なし（{quote.status}）:</strong> {quote.statusReason}
              </div>
            </div>
          )}

          {/* Explainability Tree */}
          <div data-testid="fare-explanation-tree">
            <div className="section-title" style={{ marginBottom: 6 }}>
              計算根拠ツリー (Rule Explanation Tree)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {quote.explanation.map((step, i) => (
                <div
                  key={`${step.ruleId}-${i}`}
                  className={`rule-step ${step.status === 'APPLIED' ? 'applied' : step.status === 'REJECTED' ? 'rejected' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 11 }}>
                      {step.ruleId}
                    </span>
                    <span
                      className={`badge ${
                        step.status === 'APPLIED'
                          ? 'badge-ok'
                          : step.status === 'REJECTED'
                            ? 'badge-danger'
                            : ''
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{step.articleRef}</div>
                  <div style={{ fontSize: 12 }}>{step.reason}</div>
                  <a href={step.officialUrl} target="_blank" rel="noreferrer">
                    公式根拠リンク: {step.officialUrl}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
