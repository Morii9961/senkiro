import type { Route, RouteLeg, RouteMode, RouteResult } from '../../domain/route';
import type { FareZone } from '../../domain/types';
import { FloorChip, Icon, type Glyph } from '../atoms';
import type { T } from '../i18n';
import type { Namer } from '../naming';

export interface RouteChoice {
  id: string;
  label: string;
  group: 'entrance' | 'gate' | 'platform';
}

export function legText(leg: RouteLeg, t: T, namer: Namer, zoneOf: (areaId: string) => FareZone | undefined): string {
  const a = leg.fromAreaId ? namer.short(leg.fromAreaId) : '';
  const b = leg.toAreaId ? namer.short(leg.toAreaId) : '';
  switch (leg.kind) {
    case 'enter':
      return t('legEnter', { a: namer.name(leg.elementId) });
    case 'exit':
      return t('legExit', { a: namer.name(leg.elementId) });
    case 'walk':
      return t('legWalk', { a, b });
    case 'gate': {
      const g = namer.name(leg.elementId);
      const fromZone = leg.fromAreaId ? zoneOf(leg.fromAreaId) : undefined;
      const toZone = leg.toAreaId ? zoneOf(leg.toAreaId) : undefined;
      if (toZone === undefined) return fromZone === undefined ? t('legGateOnly', { g }) : t('legGateOut', { g });
      if (toZone === 'unpaid') return t('legGateOut', { g });
      if (fromZone !== undefined && fromZone !== 'unpaid') return t('legGateTransfer', { g, b });
      return t('legGateIn', { g });
    }
    case 'vertical':
      return t('legVertical', { f: namer.short(leg.elementId), a, b });
  }
}

export function legGlyph(leg: RouteLeg, zoneOf: (areaId: string) => FareZone | undefined): Glyph {
  if (leg.kind === 'enter' || leg.kind === 'exit') return 'entrance';
  if (leg.kind === 'walk') return 'walk';
  if (leg.kind === 'vertical') return leg.verticalKind ?? 'stairs';
  const from = leg.fromAreaId ? zoneOf(leg.fromAreaId) : undefined;
  const to = leg.toAreaId ? zoneOf(leg.toAreaId) : undefined;
  return from && to && from !== 'unpaid' && to !== 'unpaid' ? 'transfer' : 'gate';
}

export function RoutePanel(props: {
  t: T;
  namer: Namer;
  choices: RouteChoice[];
  fromId: string;
  toId: string;
  mode: RouteMode;
  result: RouteResult | null;
  demos: { id: string; label: string; active: boolean }[];
  focusLeg: number | null;
  zoneOf(areaId: string): FareZone | undefined;
  onFrom(id: string): void;
  onTo(id: string): void;
  onMode(mode: RouteMode): void;
  onSwap(): void;
  onDemo(id: string): void;
  onClear(): void;
  onFocusLeg(index: number | null): void;
}) {
  const { t } = props;
  const groups: { key: RouteChoice['group']; label: string }[] = [
    { key: 'platform', label: t('groupPlatforms') },
    { key: 'gate', label: t('groupGates') },
    { key: 'entrance', label: t('groupEntrances') },
  ];
  const options = (
    <>
      <option value="">{t('choose')}</option>
      {groups.map((g) => (
        <optgroup key={g.key} label={g.label}>
          {props.choices
            .filter((c) => c.group === g.key)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <div className="panel-body">
      <section className="route-form">
        <div className="od">
          <label className="od-row">
            <span className="od-mark od-from" aria-hidden="true" />
            <span className="sr-only">{t('from')}</span>
            <select value={props.fromId} onChange={(e) => props.onFrom(e.target.value)} data-testid="route-from" aria-label={t('from')}>
              {options}
            </select>
          </label>
          <label className="od-row">
            <span className="od-mark od-to" aria-hidden="true" />
            <span className="sr-only">{t('to')}</span>
            <select value={props.toId} onChange={(e) => props.onTo(e.target.value)} data-testid="route-to" aria-label={t('to')}>
              {options}
            </select>
          </label>
          <button type="button" className="icon-btn swap" onClick={props.onSwap} aria-label={t('swap')} title={t('swap')}>
            ⇅
          </button>
        </div>
        <fieldset className="segmented" aria-label={t('mode')}>
          <legend className="sr-only">{t('mode')}</legend>
          {(['default', 'elevator-only'] as const).map((m) => (
            <label key={m} className={props.mode === m ? 'on' : ''}>
              <input type="radio" name="mode" value={m} checked={props.mode === m} onChange={() => props.onMode(m)} />
              {m === 'default' ? t('modeDefault') : t('modeElevator')}
            </label>
          ))}
        </fieldset>
        {props.mode === 'elevator-only' && <p className="fine">{t('modeElevatorNote')}</p>}
      </section>

      <section aria-live="polite" data-testid="route-result">
        {props.result === null ? (
          <>
            <p className="muted">{t('pickRoute')}</p>
            <h3>{t('demos')}</h3>
            <Demos {...props} />
          </>
        ) : !props.result.found ? (
          <p className="warn" data-testid="route-none">
            {props.result.mode === 'elevator-only' ? t('noRouteElevator') : t('noRoute')}
          </p>
        ) : (
          <RouteView {...props} route={props.result} />
        )}
      </section>

      {props.result !== null && (
        <section>
          <h3>{t('demos')}</h3>
          <Demos {...props} />
        </section>
      )}
    </div>
  );
}

function Demos(props: { demos: { id: string; label: string; active: boolean }[]; onDemo(id: string): void }) {
  return (
    <div className="demo-list">
      {props.demos.map((d, i) => (
        <button key={d.id} type="button" className="demo" aria-pressed={d.active} data-testid={`demo-${i + 1}`} onClick={() => props.onDemo(d.id)}>
          <span className="demo-n">{i + 1}</span>
          {d.label}
        </button>
      ))}
    </div>
  );
}

function RouteView({
  t,
  namer,
  route,
  zoneOf,
  focusLeg,
  onFocusLeg,
  onClear,
}: {
  t: T;
  namer: Namer;
  route: Route;
  focusLeg: number | null;
  zoneOf(areaId: string): FareZone | undefined;
  onFocusLeg(index: number | null): void;
  onClear(): void;
}) {
  const floors: string[] = [];
  for (const id of route.levelSequence) {
    const f = namer.level(id);
    if (floors[floors.length - 1] !== f) floors.push(f);
  }
  return (
    <>
      <div className="row-between">
        <h3>{t('routeSummary')}</h3>
        <button type="button" className="link-btn" onClick={onClear} data-testid="route-clear">
          {t('clearRoute')}
        </button>
      </div>
      <p className="level-seq" data-testid="route-levels">
        {floors.map((f, i) => (
          <span key={i} className="level-step">
            {i > 0 && <span className="level-arrow" aria-hidden="true">›</span>}
            <FloorChip label={f} />
          </span>
        ))}
      </p>
      <dl className="cost" data-testid="route-cost">
        <div>
          <dt>{t('costSegments')}</dt>
          <dd data-testid="cost-segments">{route.cost.segments}</dd>
        </div>
        <div>
          <dt>{t('costLevelChanges')}</dt>
          <dd data-testid="cost-levels">{route.cost.levelChanges}</dd>
        </div>
        <div>
          <dt>{t('costGates')}</dt>
          <dd data-testid="cost-gates">{route.cost.gatePasses}</dd>
        </div>
        <div>
          <dt>{t('costBoardings')}</dt>
          <dd>{route.cost.facilityBoardings}</dd>
        </div>
      </dl>
      <p className="unknowns" data-testid="route-unknowns">
        {t('distance')}・{t('duration')}: <em>{t('unknownNoSurvey')}</em>
      </p>
      {route.inferredLegs > 0 && <p className="warn">{t('warnInferred', { n: route.inferredLegs })}</p>}
      {route.mode === 'elevator-only' && route.unconfirmedStepFreeLegs > 0 && <p className="warn">{t('warnStepFree', { n: route.unconfirmedStepFreeLegs })}</p>}

      <div className="row-between">
        <h3>{t('steps')}</h3>
        {focusLeg !== null && (
          <button type="button" className="link-btn" onClick={() => onFocusLeg(null)}>
            {t('stepAll')}
          </button>
        )}
      </div>
      <p className="fine">{t('stepsHint')}</p>
      <ol className="legs" data-testid="route-legs">
        {route.legs.map((leg) => {
          const legFloors: string[] = [];
          for (const id of leg.levelIds) {
            const f = namer.level(id);
            if (legFloors[legFloors.length - 1] !== f) legFloors.push(f);
          }
          const on = focusLeg === leg.index;
          return (
            <li key={leg.index} className={`leg leg-${leg.kind} ${on ? 'on' : ''}`}>
              <button type="button" aria-pressed={on} onClick={() => onFocusLeg(on ? null : leg.index)}>
                <span className="leg-icon">
                  <Icon glyph={legGlyph(leg, zoneOf)} />
                </span>
                <span className="leg-main">
                  <span className="leg-text">{legText(leg, t, namer, zoneOf)}</span>
                  <span className="leg-meta">
                    <span className="leg-levels">{legFloors.join(' → ')}</span>
                    {leg.connection === 'inferred' && <span className="tag tag-warn">{t('inferredTag')}</span>}
                    {route.mode === 'elevator-only' && leg.kind !== 'vertical' && leg.stepFree === null && <span className="tag">{t('stepFreeUnknownTag')}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
