import type { BoundOverlay, OverlayResult, OverlayUnavailableReason } from '../../domain/overlay';
import type { StationModel } from '../../domain/types';
import { LineBadge } from '../atoms';
import type { Lang, StrKey, T } from '../i18n';
import { STATUS_KEY } from './FacilityCard';

export type OpsMode = 'off' | 'example' | 'odpt';

const REASON_KEY: Record<OverlayUnavailableReason, StrKey> = {
  'missing-key': 'reasonKey',
  'license-restricted': 'reasonLicense',
  'not-implemented': 'reasonOther',
  'network-error': 'reasonNetwork',
  'bad-response': 'reasonBadResponse',
};

function clock(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // station time is Japan time, wherever the browser is
    return `${d.toLocaleString(lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : 'en-GB', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} JST`;
}

export function OpsPanel(props: {
  t: T;
  lang: Lang;
  model: StationModel;
  mode: OpsMode;
  loading: boolean;
  result: OverlayResult | null;
  bound: BoundOverlay | null;
  providerLabels: Record<Exclude<OpsMode, 'off'>, string>;
  onMode(m: OpsMode): void;
  onRefresh(): void;
  onSelect(id: string): void;
}) {
  const { t, lang, model, bound } = props;
  const lineOf = (id: string) => model.railLines.find((x) => x.id === id);
  const snapshot = bound?.snapshot;
  const statuses = snapshot ? snapshot.lineStatuses.filter((s) => lineOf(s.railLineId)) : [];
  const boards = bound ? bound.tracks.filter((tr) => tr.departures.length > 0) : [];

  return (
    <div className="panel-body">
      <fieldset className="stack-radio">
        <legend>{t('opsSource')}</legend>
        {(['off', 'example', 'odpt'] as const).map((m) => (
          <label key={m} className={props.mode === m ? 'on' : ''}>
            <input type="radio" name="ops" value={m} checked={props.mode === m} onChange={() => props.onMode(m)} data-testid={`ops-${m}`} />
            {m === 'off' ? t('opsOff') : props.providerLabels[m]}
          </label>
        ))}
      </fieldset>

      {props.mode === 'off' && <p className="muted">{t('opsIntro')}</p>}
      {props.loading && (
        <p className="muted" role="status">
          {t('opsLoading')}
        </p>
      )}

      {props.result?.status === 'unavailable' && (
        <div className="notice" data-testid="ops-unavailable">
          <strong>{t('opsUnavailable')}</strong>
          <p>{t(REASON_KEY[props.result.reason])}</p>
          {props.result.reason === 'missing-key' && <p className="fine">{t('opsKeyHowTo')}</p>}
          <button type="button" className="btn small" onClick={props.onRefresh}>
            {t('opsRetry')}
          </button>
        </div>
      )}

      {snapshot && (
        <>
          {snapshot.isSynthetic ? (
            <div className="sample-box" data-testid="ops-sample-box">
              <strong>{t('sampleBanner')}</strong>
              <p>{t('opsNoTrains')}</p>
            </div>
          ) : (
            <p className="fine">{t('opsLiveNote')}</p>
          )}
          <p className="ops-meta" data-testid="ops-meta">
            <span>
              {t('opsSourceLine')}: {snapshot.isSynthetic ? t('opsExampleTitle') : snapshot.sourceTitle}
            </span>
            <span>
              {t('opsTimestamp')}: <time dateTime={snapshot.fetchedAt}>{clock(snapshot.fetchedAt, lang)}</time>
              {snapshot.isSynthetic && ` ${t('opsTimestampFake')}`}
            </span>
            {!snapshot.isSynthetic && (
              <button type="button" className="link-btn" onClick={props.onRefresh}>
                {t('opsRefresh')}
              </button>
            )}
          </p>

          <h3>{t('opsLineStatus')}</h3>
          {statuses.length === 0 ? (
            <p className="muted">{t('opsNoData')}</p>
          ) : (
            <ul className="line-status" data-testid="ops-lines">
              {statuses.map((s) => {
                const line = lineOf(s.railLineId)!;
                const message = lang === 'en' ? (s.messageEn ?? s.messageJa) : s.messageJa;
                return (
                  <li key={s.railLineId}>
                    <div className="row-between">
                      <LineBadge line={line} lang={lang} />
                      <span className={`status status-${s.status}`}>
                        <span className="status-dot" />
                        {t(STATUS_KEY[s.status])}
                        {s.delayMinutes !== null && ` ${t('delayMin', { n: s.delayMinutes })}`}
                      </span>
                    </div>
                    {message && <p className="fine">{message}</p>}
                  </li>
                );
              })}
            </ul>
          )}

          {boards.length > 0 && (
            <>
              <h3>{t('opsDepartures')}</h3>
              <ul className="board" data-testid="ops-board">
                {boards.map((tr) => (
                  <li key={`${tr.platformId}#${tr.track.number}`}>
                    <button type="button" className="track-n" onClick={() => props.onSelect(tr.platformId)} title={t('opsShowPlatform')}>
                      {tr.track.number}
                    </button>
                    <div>
                      {tr.departures.map((d, i) => {
                        const line = lineOf(d.railLineId);
                        return (
                          <p key={i} className="dep">
                            <span className="dep-time">
                              {d.scheduledTime}
                              {d.estimatedTime && <em> → {d.estimatedTime}</em>}
                            </span>
                            {line && <LineBadge line={line} lang={lang} compact />}
                            <span>
                              {d.trainTypeJa ? `${d.trainTypeJa} ` : ''}
                              {lang === 'en' ? (d.destinationEn ?? d.destinationJa) : d.destinationJa}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {bound && bound.unmatched.length > 0 && <p className="fine">{t('opsUnmatched', { n: bound.unmatched.length })}</p>}
        </>
      )}
    </div>
  );
}
