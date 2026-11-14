/**
 * Interface of the train simulation: the clock bar on the stage, the card of
 * a selected train, and the filters in the Operations tab.
 *
 * Wherever a train is shown, the interface says what it is: a simulation
 * computed from a timetable — never a live position — and, while the demo
 * fixture is in use, that the times themselves are made up.
 */
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import type { StationModel } from '../../domain/types';
import type { TimetableData } from '../../providers/timetableProvider';
import { lineEntry, stationEntry } from '../../timetable/registry';
import { formatClockTime, formatServiceTime, parseServiceTime, type CalendarDayType } from '../../timetable/time';
import { DAY_END, DAY_START, RATES, demoClock, nowClock, rebase, simSeconds, type SimClock } from '../../trains/clock';
import { trainStateAt, trainStatesAt, type TrainPhase, type TrainPlan } from '../../trains/simulate';
import { Icon, LineBadge } from '../atoms';
import type { Lang, StrKey, T } from '../i18n';
import { pickName } from '../naming';

const PHASE_KEY: Record<TrainPhase, StrKey> = {
  approaching: 'trainApproaching',
  braking: 'trainBraking',
  'doors-opening': 'trainDoorsOpening',
  'doors-open': 'trainDoorsOpen',
  'doors-closing': 'trainDoorsClosing',
  stopped: 'trainStopped',
  departing: 'trainDeparting',
};

const DAY_KEY: Record<CalendarDayType, StrKey> = { weekday: 'dayWeekday', saturday: 'daySaturday', sunday: 'daySunday' };

/** Re-renders a few times a second with the clock's current time; the 3D layer reads the clock on its own. */
function useSimSeconds(clock: RefObject<SimClock>): number {
  const [seconds, setSeconds] = useState(() => simSeconds(clock.current));
  useEffect(() => {
    const id = window.setInterval(() => setSeconds(simSeconds(clock.current)), 250);
    return () => window.clearInterval(id);
  }, [clock]);
  return seconds;
}

export function TrainBar(props: {
  t: T;
  clock: SimClock;
  clockRef: RefObject<SimClock>;
  demoData: boolean;
  trainsOn: boolean;
  dayType: CalendarDayType;
  onClock(c: SimClock): void;
  onToggle(on: boolean): void;
  onDayType(d: CalendarDayType): void;
}) {
  const { t, clock } = props;
  const seconds = useSimSeconds(props.clockRef);
  const live = clock.mode === 'now';

  return (
    <div className={`hud train-bar ${props.trainsOn ? '' : 'off'}`} role="group" aria-label={t('trainSim')} data-testid="train-bar">
      <p className="train-bar-note">
        <span className="sim-badge" data-testid="sim-badge">
          {t('trainSimBadge')}
        </span>
        {props.demoData && (
          <span className="demo-badge" data-testid="demo-badge" title={t('trainDemoNote')}>
            {t('trainDemoBadge')}
          </span>
        )}
      </p>
      <div className="train-bar-row">
        <button type="button" className="tb-btn" aria-pressed={props.trainsOn} onClick={() => props.onToggle(!props.trainsOn)} title={props.trainsOn ? t('trainHideAll') : t('trainShowAll')} aria-label={props.trainsOn ? t('trainHideAll') : t('trainShowAll')} data-testid="trains-toggle">
          <Icon glyph="platform" size={16} />
        </button>
        {props.trainsOn && (
          <>
            <button
              type="button"
              className="tb-btn"
              onClick={() => props.onClock(live ? { ...rebase(clock), playing: false } : { ...rebase(clock), playing: !clock.playing })}
              aria-label={clock.playing ? t('trainPause') : t('trainPlay')}
              title={clock.playing ? t('trainPause') : t('trainPlay')}
              data-testid="sim-play"
            >
              {clock.playing ? '❚❚' : '▶'}
            </button>
            <output className="sim-time" data-testid="sim-time" title={t('trainTimeJst')}>
              {formatClockTime(seconds, true)}
              <small>JST</small>
            </output>
            <input
              type="range"
              className="sim-scrub"
              min={DAY_START}
              max={DAY_END}
              step={10}
              value={Math.min(DAY_END, Math.max(DAY_START, Math.round(seconds)))}
              onChange={(e) => props.onClock(demoClock(Number(e.target.value), live ? false : clock.playing, live ? 1 : clock.rate))}
              aria-label={t('trainScrub')}
              aria-valuetext={formatServiceTime(seconds)}
              data-testid="sim-scrub"
            />
            <div className="segmented small" role="group" aria-label={t('trainRate')}>
              {RATES.map((r) => (
                <button key={r} type="button" className={!live && clock.rate === r ? 'on' : ''} aria-pressed={!live && clock.rate === r} onClick={() => props.onClock({ ...rebase(clock), rate: r, playing: true })} data-testid={`sim-rate-${r}`}>
                  ×{r}
                </button>
              ))}
            </div>
            <button type="button" className={`tb-btn text ${live ? 'on' : ''}`} aria-pressed={live} onClick={() => props.onClock(nowClock())} data-testid="sim-now">
              {t('trainNow')}
            </button>
            <label className="select-inline tb-day">
              <span className="sr-only">{t('trainDayType')}</span>
              <select value={props.dayType} onChange={(e) => props.onDayType(e.target.value as CalendarDayType)} data-testid="sim-day">
                {(['weekday', 'saturday', 'sunday'] as const).map((d) => (
                  <option key={d} value={d}>
                    {t(DAY_KEY[d])}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

export interface TrainFilter {
  line: string;
  track: string;
  status: 'all' | 'verified' | 'representative' | 'unknown';
}

export const NO_FILTER: TrainFilter = { line: 'all', track: 'all', status: 'all' };

export function trainPasses(plan: TrainPlan, f: TrainFilter): boolean {
  return (f.line === 'all' || plan.modelLineId === f.line) && (f.track === 'all' || `${plan.platformAreaId}#${plan.trackNumber}` === f.track) && (f.status === 'all' || plan.vehicle.status === f.status);
}

const STATUS_KEYS: Record<'verified' | 'representative' | 'unknown', StrKey> = { verified: 'vehVerified', representative: 'vehRepresentative', unknown: 'vehUnknown' };

/** The "Trains" block at the top of the Operations tab. */
export function TrainSection(props: {
  t: T;
  lang: Lang;
  model: StationModel;
  data: TimetableData;
  plans: TrainPlan[];
  unplaced: number;
  filter: TrainFilter;
  hiddenCount: number;
  clockRef: RefObject<SimClock>;
  shown(plan: TrainPlan): boolean;
  selectedId: string | null;
  onSelect(planId: string): void;
  onFilter(f: TrainFilter): void;
  onUnhide(): void;
}) {
  const { t, lang, model, data, plans, filter } = props;
  const demo = data.dataset.kind === 'demo-fixture';
  const lineIds = [...new Set(plans.map((p) => p.modelLineId).filter((x): x is string => !!x))];
  const tracks = [...new Map(plans.map((p) => [`${p.platformAreaId}#${p.trackNumber}`, p])).values()];
  const nameOf = (id: string) => pickName(model.railLines.find((l) => l.id === id)?.names ?? { ja: id, ja_kana: null, en: id }, lang) ?? id;
  const seconds = useSimSeconds(props.clockRef);
  const current = trainStatesAt(plans, seconds).filter((s) => props.shown(s.plan));
  const opName = (p: TrainPlan) => pickName(model.operators.find((o) => o.id === `sk:operator:${p.record.operator_id}`)?.names ?? { ja: p.record.operator_id, ja_kana: null, en: p.record.operator_id }, lang);

  return (
    <section className="train-section" data-testid="train-section">
      <h3>{t('trainSim')}</h3>
      <p className={`notice ${demo ? 'warn' : ''}`} data-testid="train-data-note">
        {demo ? t('trainDemoNote') : t('trainRealNote', { files: data.files.join(', ') })}
      </p>
      <p className="muted small">{t('trainSimNote')}</p>
      <dl className="mini-facts">
        <div>
          <dt>{t('trainRecords')}</dt>
          <dd data-testid="train-record-count">
            {data.records.length}
            {data.errorCount > 0 && ` · ${t('trainErrors', { n: data.errorCount })}`}
            {data.warningCount > 0 && ` · ${t('trainWarnings', { n: data.warningCount })}`}
            {props.unplaced > 0 && ` · ${t('trainUnplaced', { n: props.unplaced })}`}
          </dd>
        </div>
      </dl>
      <div className="filter-grid">
        <label>
          <span>{t('trainFilterLine')}</span>
          <select value={filter.line} onChange={(e) => props.onFilter({ ...filter, line: e.target.value })} data-testid="train-filter-line">
            <option value="all">{t('filterAll')}</option>
            {lineIds.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('trainFilterTrack')}</span>
          <select value={filter.track} onChange={(e) => props.onFilter({ ...filter, track: e.target.value })} data-testid="train-filter-track">
            <option value="all">{t('filterAll')}</option>
            {tracks.map((p) => (
              <option key={`${p.platformAreaId}#${p.trackNumber}`} value={`${p.platformAreaId}#${p.trackNumber}`}>
                {opName(p)} {t('trackN', { n: p.trackNumber })}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('trainFilterVehicle')}</span>
          <select value={filter.status} onChange={(e) => props.onFilter({ ...filter, status: e.target.value as TrainFilter['status'] })} data-testid="train-filter-status">
            <option value="all">{t('filterAll')}</option>
            {(['verified', 'representative', 'unknown'] as const).map((s) => (
              <option key={s} value={s}>
                {t(STATUS_KEYS[s])}
              </option>
            ))}
          </select>
        </label>
      </div>
      {props.hiddenCount > 0 && (
        <button type="button" className="btn" onClick={props.onUnhide} data-testid="train-unhide">
          {t('trainUnhide', { n: props.hiddenCount })}
        </button>
      )}
      <h4>
        {t('trainOnDisplay')} <span className="muted" data-testid="train-count">{current.length}</span>
      </h4>
      {current.length === 0 ? (
        <p className="muted small">{t('trainNone')}</p>
      ) : (
        <ul className="train-list" data-testid="train-list">
          {current.map((s) => {
            const line = model.railLines.find((l) => l.id === s.plan.modelLineId);
            return (
              <li key={s.plan.id}>
                <button type="button" className={props.selectedId === s.plan.id ? 'on' : ''} onClick={() => props.onSelect(s.plan.id)} data-testid="train-row">
                  {line ? <LineBadge line={line} lang={lang} compact /> : <span className="line-badge compact" />}
                  <span className="train-row-track">
                    {opName(s.plan)} {t('trackN', { n: s.plan.trackNumber })}
                  </span>
                  <span className="train-row-phase">{t(PHASE_KEY[s.phase])}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TrainCard(props: {
  t: T;
  lang: Lang;
  model: StationModel;
  plan: TrainPlan;
  data: TimetableData;
  clock: SimClock;
  clockRef: RefObject<SimClock>;
  onClose(): void;
  onFocus(): void;
  onHide(): void;
  onPause(): void;
}) {
  const { t, lang, model, plan, data } = props;
  const seconds = useSimSeconds(props.clockRef);
  const r = plan.record;
  const state = trainStateAt(plan, seconds);
  const line = model.railLines.find((l) => l.id === plan.modelLineId);
  const operator = model.operators.find((o) => o.id === `sk:operator:${r.operator_id}`);
  const station = stationEntry(r.station_id);
  const v = plan.vehicle;
  const source = data.dataset.sources.find((s) => s.id === r.source_id);
  const demo = data.dataset.kind === 'demo-fixture';
  const time = (text: string | null) => {
    const s = parseServiceTime(text);
    return s == null ? null : formatClockTime(s, /:\d\d:\d\d$/.test(text ?? '') && s % 60 !== 0);
  };
  const unknown = <span className="muted">{t('unknown')}</span>;

  const facts: { key: string; label: string; value: ReactNode }[] = [
    { key: 'op', label: t('tfOperator'), value: operator ? pickName(operator.names, lang) : r.operator_id },
    { key: 'line', label: t('tfLine'), value: line ? <LineBadge line={line} lang={lang} /> : (lineEntry(r.line_id)?.name_ja ?? r.line_id) },
    { key: 'class', label: t('tfClass'), value: r.service_class ?? unknown },
    { key: 'dest', label: t('tfDestination'), value: r.destination_text ?? unknown },
    {
      key: 'arr', label: t('tfArrival'),
      value: r.arrival_time_local ? time(r.arrival_time_local) : <span className="muted">{plan.arrivalAssumed ? t('tfArrivalAssumed') : t('unknown')}</span>,
    },
    { key: 'dep', label: t('tfDeparture'), value: r.departure_time_local ? time(r.departure_time_local) : <span className="muted">{t('tfTerminates')}</span> },
    { key: 'pf', label: t('tfPlatform'), value: `${station?.name_ja ?? r.station_id} · ${t('trackN', { n: plan.trackNumber })}` },
    {
      key: 'veh', label: t('tfVehicle'),
      value: (
        <>
          {v.seriesLabel ?? pickName({ ja: v.spec.names.ja, ja_kana: null, en: v.spec.names.en, zh: v.spec.names.zh }, lang)}{' '}
          <span className={`veh-status veh-${v.status}`} data-testid="train-vehicle-status">
            {t(STATUS_KEYS[v.status])}
          </span>
        </>
      ),
    },
    { key: 'cars', label: t('tfCars'), value: v.cars != null ? `${t('tfCarsN', { n: v.cars })}${v.carsBasis === 'line-fact' ? ` (${t('tfCarsFromLine')})` : ''}` : <span className="muted">{t('tfCarsUnknown')}</span> },
    { key: 'no', label: t('tfTrainNumber'), value: r.train_number ?? <span className="muted">{t('tfNoTrainNumber')}</span> },
    {
      key: 'state', label: t('tfState'),
      value: (
        <>
          <strong data-testid="train-live-state">{t('trainScheduled')}</strong>
          {' · '}
          <span data-testid="train-phase">{state ? t(PHASE_KEY[state.phase]) : t('trainGone')}</span>
          {plan.run?.departs == null && ` · ${t('trainNoDirection')}`}
        </>
      ),
    },
    {
      key: 'src', label: t('tfSource'),
      value: (
        <>
          {demo ? t('trainDemoBadge') : (source?.title ?? r.source_id)}
          {source?.retrievedAt ? ` · ${source.retrievedAt}` : data.dataset.generatedAt ? ` · ${data.dataset.generatedAt}` : ''}
        </>
      ),
    },
  ];

  return (
    <aside className="card train-card" aria-label={t('trainCard')} data-testid="train-card">
      <header className="card-head">
        <span className="card-icon" style={line ? { background: line.displayColor } : undefined}>
          <Icon glyph="platform" size={22} />
        </span>
        <div className="card-title">
          <p className="card-kind">{t('trainCard')}</p>
          <h2>{line ? pickName(line.names, lang) : r.line_id}</h2>
          <p className="card-ja">{t('trainSimBadge')}</p>
        </div>
        <button type="button" className="icon-btn" onClick={props.onClose} aria-label={t('close')}>
          ×
        </button>
      </header>
      {demo && <p className="unverified-banner">{t('trainDemoNote')}</p>}
      <dl className="facts">
        {facts.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="card-actions three">
        <button type="button" className="btn" onClick={props.onFocus} data-testid="train-focus">
          {t('trainFocus')}
        </button>
        <button type="button" className="btn" onClick={props.onHide} data-testid="train-hide">
          {t('trainHide')}
        </button>
        <button type="button" className="btn" onClick={props.onPause} data-testid="train-pause">
          {props.clock.playing ? t('trainPause') : t('trainPlay')}
        </button>
      </div>
      <p className="card-source">{v.note}</p>
    </aside>
  );
}
