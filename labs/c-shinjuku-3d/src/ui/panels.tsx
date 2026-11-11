import type { ReactNode } from 'react';
import type { BoundOverlay, OverlayResult, RunningStatus } from '../domain/overlay';
import type { Route, RouteLeg, RouteMode, RouteResult } from '../domain/route';
import type { FareZone, SourceRecord, StationElementBase, StationModel, StepFree } from '../domain/types';
import type { StrKey, T } from './i18n';
import { pickName, type Namer } from './naming';
import type { Lang } from './i18n';
import type { RenderStats } from './Scene3D';
import type { Palette } from './theme';

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface RouteChoice {
  id: string;
  label: string;
  group: 'entrance' | 'gate' | 'platform';
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
  zoneOf(areaId: string): FareZone | undefined;
  onFrom(id: string): void;
  onTo(id: string): void;
  onMode(mode: RouteMode): void;
  onSwap(): void;
  onDemo(id: string): void;
  onClear(): void;
  onSelect(id: string): void;
}) {
  const { t } = props;
  const groups: { key: RouteChoice['group']; label: string }[] = [
    { key: 'entrance', label: t('groupEntrances') },
    { key: 'gate', label: t('groupGates') },
    { key: 'platform', label: t('groupPlatforms') },
  ];
  const options = (
    <>
      <option value="">—</option>
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
      <section>
        <h3>{t('demos')}</h3>
        <div className="demo-list">
          {props.demos.map((d, i) => (
            <button key={d.id} type="button" className="demo" aria-pressed={d.active} data-testid={`demo-${i + 1}`} onClick={() => props.onDemo(d.id)}>
              <span className="demo-n">{i + 1}</span>
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="route-form">
        <label>
          <span>{t('from')}</span>
          <select value={props.fromId} onChange={(e) => props.onFrom(e.target.value)} data-testid="route-from">
            {options}
          </select>
        </label>
        <button type="button" className="icon-btn swap" onClick={props.onSwap} aria-label={t('swap')} title={t('swap')}>
          ⇅
        </button>
        <label>
          <span>{t('to')}</span>
          <select value={props.toId} onChange={(e) => props.onTo(e.target.value)} data-testid="route-to">
            {options}
          </select>
        </label>
        <fieldset className="segmented" aria-label={t('mode')}>
          <legend>{t('mode')}</legend>
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
          <p className="muted">{t('pickRoute')}</p>
        ) : !props.result.found ? (
          <p className="warn" data-testid="route-none">
            {props.result.mode === 'elevator-only' ? t('noRouteElevator') : t('noRoute')}
          </p>
        ) : (
          <RouteView t={t} namer={props.namer} route={props.result} zoneOf={props.zoneOf} onSelect={props.onSelect} onClear={props.onClear} />
        )}
      </section>
    </div>
  );
}

function RouteView({
  t,
  namer,
  route,
  zoneOf,
  onSelect,
  onClear,
}: {
  t: T;
  namer: Namer;
  route: Route;
  zoneOf(areaId: string): FareZone | undefined;
  onSelect(id: string): void;
  onClear(): void;
}) {
  return (
    <>
      <div className="row-between">
        <h3>{t('routeSummary')}</h3>
        <button type="button" className="link-btn" onClick={onClear}>
          {t('clearRoute')}
        </button>
      </div>
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
      <p className="level-seq" data-testid="route-levels">
        <span className="muted">{t('levelsVisited')}</span>
        {route.levelSequence.map((id, i) => (
          <span key={i} className="chip">
            {namer.level(id)}
          </span>
        ))}
      </p>
      <p className="unknowns" data-testid="route-unknowns">
        {t('distance')}: <em>{t('unknownNoSurvey')}</em> · {t('duration')}: <em>{t('unknownNoSurvey')}</em>
      </p>
      {route.inferredLegs > 0 && <p className="warn">{t('warnInferred', { n: route.inferredLegs })}</p>}
      {route.mode === 'elevator-only' && route.unconfirmedStepFreeLegs > 0 && (
        <p className="warn">{t('warnStepFree', { n: route.unconfirmedStepFreeLegs })}</p>
      )}
      <h3>{t('steps')}</h3>
      <ol className="legs" data-testid="route-legs">
        {route.legs.map((leg) => (
          <li key={leg.index} className={`leg leg-${leg.kind}`}>
            <button type="button" onClick={() => onSelect(leg.elementId)}>
              <span className="leg-levels">{leg.levelIds.map((id) => namer.level(id)).join(' → ')}</span>
              <span className="leg-text">{legText(leg, t, namer, zoneOf)}</span>
              {leg.connection === 'inferred' && <span className="tag tag-warn">{t('inferredTag')}</span>}
              {route.mode === 'elevator-only' && leg.kind !== 'vertical' && leg.stepFree === null && (
                <span className="tag">{t('stepFreeUnknownTag')}</span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function legText(leg: RouteLeg, t: T, namer: Namer, zoneOf: (areaId: string) => FareZone | undefined): string {
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

// ---------------------------------------------------------------------------
// Levels / layers
// ---------------------------------------------------------------------------

export function LayersPanel(props: {
  t: T;
  palette: Palette;
  is3d: boolean;
  explode: number;
  shell: number;
  ghostOthers: boolean;
  showLabels: boolean;
  showVerticals: boolean;
  showBlocks: boolean;
  onExplode(v: number): void;
  onShell(v: number): void;
  onGhost(v: boolean): void;
  onLabels(v: boolean): void;
  onVerticals(v: boolean): void;
  onBlocks(v: boolean): void;
  levelButtons: ReactNode;
}) {
  const { t, palette: p } = props;
  const legend: [string, StrKey, string?][] = [
    [p.paidJr, 'legendPaidJr'],
    [p.paidKeio, 'legendPaidKeio'],
    [p.unpaid, 'legendUnpaid'],
    [p.platform, 'legendPlatform'],
    [p.gate, 'legendGate'],
    [p.entrance, 'legendEntrance'],
    [p.elevator, 'legendElevator'],
    [p.stairs, 'legendStairs'],
    [p.escalator, 'legendEscalator'],
    [p.block, 'legendUnverified', 'hatch'],
    [p.route, 'legendRoute'],
    [p.link, 'legendInferred', 'dash'],
  ];
  return (
    <div className="panel-body">
      <section>
        <h3>{t('levels')}</h3>
        <p className="fine">{t('singleLevelHint')}</p>
        {props.levelButtons}
      </section>
      <section className="sliders">
        <label>
          <span>
            {t('explode')} <output>{Math.round(props.explode * 100)}%</output>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={props.explode} disabled={!props.is3d} onChange={(e) => props.onExplode(Number(e.target.value))} data-testid="explode" />
        </label>
        <label>
          <span>
            {t('shell')} <output>{Math.round(props.shell * 100)}%</output>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={props.shell} disabled={!props.is3d} onChange={(e) => props.onShell(Number(e.target.value))} data-testid="shell" />
        </label>
      </section>
      <section className="checks">
        <Check label={t('ghostOthers')} checked={props.ghostOthers} onChange={props.onGhost} disabled={!props.is3d} />
        <Check label={t('showLabels')} checked={props.showLabels} onChange={props.onLabels} />
        <Check label={t('showVerticals')} checked={props.showVerticals} onChange={props.onVerticals} />
        <Check label={t('showBlocks')} checked={props.showBlocks} onChange={props.onBlocks} />
      </section>
      <section>
        <h3>{t('legend')}</h3>
        <ul className="legend">
          {legend.map(([color, key, style]) => (
            <li key={key}>
              <span className={`swatch ${style ?? ''}`} style={{ ['--c' as string]: color }} />
              {t(key)}
            </li>
          ))}
        </ul>
        <p className="fine">{t('orientationNote')}</p>
      </section>
    </div>
  );
}

function Check(props: { label: string; checked: boolean; disabled?: boolean; onChange(v: boolean): void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Operations overlay
// ---------------------------------------------------------------------------

export type OpsMode = 'off' | 'example' | 'odpt';

const STATUS_KEY: Record<RunningStatus, StrKey> = {
  normal: 'statusNormal',
  delayed: 'statusDelayed',
  suspended: 'statusSuspended',
  'partial-suspension': 'statusPartial',
  unknown: 'statusUnknown',
};

export function OpsPanel(props: {
  t: T;
  lang: Lang;
  model: StationModel;
  namer: Namer;
  mode: OpsMode;
  result: OverlayResult | null;
  bound: BoundOverlay | null;
  providerLabels: Record<Exclude<OpsMode, 'off'>, string>;
  onMode(m: OpsMode): void;
  onSelect(id: string): void;
}) {
  const { t, lang, model } = props;
  const lineName = (id: string) => {
    const l = model.railLines.find((x) => x.id === id);
    return l ? (pickName(l.names, lang) ?? id) : id;
  };
  return (
    <div className="panel-body">
      <p className="fine">{t('opsIntro')}</p>
      <fieldset className="stack-radio">
        <legend>{t('opsSource')}</legend>
        {(['off', 'example', 'odpt'] as const).map((m) => (
          <label key={m} className={props.mode === m ? 'on' : ''}>
            <input type="radio" name="ops" value={m} checked={props.mode === m} onChange={() => props.onMode(m)} data-testid={`ops-${m}`} />
            {m === 'off' ? t('opsOff') : props.providerLabels[m]}
          </label>
        ))}
      </fieldset>

      {props.result?.status === 'unavailable' && (
        <div className="notice" data-testid="ops-unavailable">
          <strong>{t('opsUnavailable')}</strong>
          <p>
            {props.result.reason === 'license-restricted' ? t('reasonLicense') : props.result.reason === 'missing-key' ? t('reasonKey') : t('reasonOther')}
          </p>
          <p className="fine">{props.result.detail}</p>
          <p className="fine mono">{props.result.sourceId}</p>
        </div>
      )}

      {props.bound && (
        <>
          {props.bound.snapshot.isSynthetic && (
            <div className="sample-box" data-testid="ops-sample-box">
              <strong>{t('sampleBanner')}</strong>
              <p>{t('opsNoTrains')}</p>
            </div>
          )}
          <dl className="meta">
            <dt>{t('opsSourceLine')}</dt>
            <dd>
              {props.bound.snapshot.sourceTitle} <span className="mono">({props.bound.snapshot.sourceId})</span>
            </dd>
            <dt>{t('opsTimestamp')}</dt>
            <dd>
              <time dateTime={props.bound.snapshot.fetchedAt}>{props.bound.snapshot.fetchedAt}</time>{' '}
              {props.bound.snapshot.isSynthetic && <span className="muted">{t('opsTimestampFake')}</span>}
            </dd>
            <dt>{t('fNature')}</dt>
            <dd className="mono">{props.bound.snapshot.dataNature}</dd>
          </dl>
          <table className="tracks">
            <thead>
              <tr>
                <th scope="col">{t('opsTrack')}</th>
                <th scope="col">{t('opsStatus')}</th>
                <th scope="col">{t('opsDepartures')}</th>
              </tr>
            </thead>
            <tbody>
              {props.bound.tracks
                .filter((tr) => tr.statuses.length > 0 || tr.departures.length > 0)
                .map((tr) => (
                  <tr key={`${tr.platformId}#${tr.track.number}`}>
                    <th scope="row">
                      <button type="button" className="link-btn" onClick={() => props.onSelect(tr.platformId)}>
                        {tr.track.number}
                      </button>
                    </th>
                    <td>
                      {tr.statuses.map((s) => (
                        <div key={s.railLineId} className={`status status-${s.status}`}>
                          <span className="status-dot" />
                          {lineName(s.railLineId)}: {t(STATUS_KEY[s.status])}
                          {s.delayMinutes !== null && ` ${t('delayMin', { n: s.delayMinutes })}`}
                        </div>
                      ))}
                    </td>
                    <td>
                      {tr.departures.length === 0 ? (
                        <span className="muted">{t('opsNoData')}</span>
                      ) : (
                        tr.departures.map((d, i) => (
                          <div key={i}>
                            {t('scheduled')} {d.scheduledTime}
                            {d.estimatedTime && ` → ${t('estimated')} ${d.estimatedTime}`} {lang === 'ja' ? d.destinationJa : (d.destinationEn ?? d.destinationJa)}
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources / info
// ---------------------------------------------------------------------------

export function InfoPanel(props: { t: T; model: StationModel; sources: SourceRecord[]; stats: RenderStats | null }) {
  const { t, model } = props;
  return (
    <div className="panel-body">
      <section>
        <h3>{t('scope')}</h3>
        <p>{t('scopeBody')}</p>
        <h3>{t('precision')}</h3>
        <p>{t('precisionBody')}</p>
        <p className="notice">{t('enteredBy')}</p>
        <p className="fine">{t('translationNote')}</p>
      </section>
      <section>
        <h3>{t('excluded')}</h3>
        <ul className="plain">
          {model.complex.explicitlyExcluded.map((x) => (
            <li key={x.name}>
              <strong>{x.name}</strong> — {x.reason}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{t('unconfirmed')}</h3>
        <ul className="plain" data-testid="unconfirmed">
          {model.unconfirmedConnections.map((u) => (
            <li key={u.id}>
              <strong>{u.description}</strong>
              <br />
              <span className="muted">{u.reason}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{t('sourcesList')}</h3>
        <ul className="sources" data-testid="sources">
          {props.sources.map((s) => (
            <li key={s.id}>
              <div className="row-between">
                <span className="mono">{s.id}</span>
                <span className={`tag ${s.usedInData ? 'tag-ok' : ''}`}>{s.usedInData ? t('usedInData') : t('notUsed')}</span>
              </div>
              {s.url.startsWith('http') ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
              ) : (
                <span>{s.title}</span>
              )}
              <div className="muted">{s.publisher}</div>
              <div className="fine">
                {t('sourceDate')}: {s.sourceDate ?? t('unknown')} · {t('retrieved')}: {s.retrievedAt} · {t('redistribution')}: {s.redistribution}
              </div>
              <div className="fine">
                {t('licenseLabel')}: {s.license}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{t('stats')}</h3>
        {props.stats ? (
          <p className="mono" data-testid="stats">
            {t('statsTriangles')} {props.stats.triangles.toLocaleString()} · {t('statsCalls')} {props.stats.calls} <span className="muted">({t('statsNote')})</span>
          </p>
        ) : (
          <p className="muted">—</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function stepFreeText(v: StepFree, t: T): string {
  return v === null ? t('unknown') : v ? t('yes') : t('no');
}

export function Inspector(props: {
  t: T;
  lang: Lang;
  model: StationModel;
  sources: SourceRecord[];
  namer: Namer;
  elementId: string;
  canRoute: boolean;
  onClose(): void;
  onFrom(id: string): void;
  onTo(id: string): void;
}) {
  const { t, model, namer, elementId: id, lang } = props;
  const area = model.areas.find((x) => x.id === id);
  const gate = model.gates.find((x) => x.id === id);
  const entrance = model.entrances.find((x) => x.id === id);
  const vertical = model.verticals.find((x) => x.id === id);
  const link = model.passages.find((x) => x.id === id);
  const block = model.unverifiedBlocks.find((x) => x.id === id);
  const el: StationElementBase | undefined = area ?? gate ?? entrance ?? vertical ?? link ?? block;
  if (!el) return null;

  const levelIds = area ? [area.levelId] : gate ? [gate.levelId] : entrance ? [entrance.levelId] : vertical ? vertical.stops.map((s) => s.levelId) : [];
  const zone = area?.fareZone;
  const lineName = (lid: string) => {
    const l = model.railLines.find((x) => x.id === lid);
    return l ? (pickName(l.names, lang) ?? lid) : lid;
  };
  const srcTitle = (sid: string) => props.sources.find((s) => s.id === sid)?.title ?? sid;
  const rows: [string, ReactNode][] = [];
  rows.push([t('fKind'), namer.kind(id)]);
  if (levelIds.length) rows.push([t('fLevel'), levelIds.map((l) => namer.level(l)).join(' ⇄ ')]);
  if (zone) rows.push([t('fZone'), zone === 'unpaid' ? t('unpaid') : `${t('paid')} (${zone.replace('paid:', '')})`]);
  if (gate) {
    rows.push([t('fDirection'), gate.direction === 'exit-only' ? t('exitOnly') : t('bothWays')]);
    if (gate.hoursNote) rows.push([t('fHours'), gate.hoursNote]);
    rows.push([t('fStepFree'), stepFreeText(gate.stepFree, t)]);
    if (gate.aliases.length) rows.push([t('fAliases'), gate.aliases.map((a) => `${a.name} (${a.usedBy})`).join(', ')]);
  }
  if (entrance) {
    rows.push([t('fLeadsTo'), (lang === 'ja' ? entrance.leadsToJa : (entrance.leadsToEn ?? entrance.leadsToJa)) ?? t('unknown')]);
    rows.push([t('fStepFree'), stepFreeText(entrance.stepFree, t)]);
  }
  if (vertical?.hoursNote) rows.push([t('fHours'), vertical.hoursNote]);
  if (link) rows.push([t('fStepFree'), stepFreeText(link.hasSteps ? false : link.stepFree, t)]);
  rows.push([
    t('fExistence'),
    <span className={el.existence === 'verified' ? 'tag tag-ok' : 'tag tag-warn'}>{el.existence === 'verified' ? t('verified') : t('unverified')}</span>,
  ]);
  rows.push([
    t('fGeometry'),
    <span className="tag">{el.geometryConfidence === 'schematic' ? t('schematic') : el.geometryConfidence === 'unknown' ? t('unknown') : t('verified')}</span>,
  ]);
  rows.push([t('fAsOf'), el.asOf ?? t('unknown')]);
  rows.push([t('fValid'), `${el.validFrom ?? t('unknown')} / ${el.validTo ?? t('unknown')}`]);
  rows.push([t('fNature'), <span className="mono">{el.provenance.dataNature}</span>]);

  return (
    <aside className="inspector" aria-label={t('inspector')} data-testid="inspector">
      <header>
        <div>
          <h2>{namer.name(id)}</h2>
          {el.names.ja && lang !== 'ja' && <div className="muted">{el.names.ja}</div>}
        </div>
        <button type="button" className="icon-btn" onClick={props.onClose} aria-label={t('close')}>
          ×
        </button>
      </header>
      {block && <p className="unverified-banner">{t('legendUnverified')}</p>}
      <dl className="meta">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {area?.kind === 'platform' && (
        <>
          <h3>{t('fTracks')}</h3>
          <ul className="tracks-list">
            {area.tracks.map((tr) => (
              <li key={tr.number}>
                <span className="track-n">{tr.number}</span>
                <span>
                  {tr.services.map((s, i) => {
                    const line = model.railLines.find((l) => l.id === s.railLineId);
                    return (
                      <span key={i} className="svc">
                        <span className="line-dot" style={{ background: line?.displayColor }} />
                        {lineName(s.railLineId)} <span className="muted">{lang === 'ja' ? s.towardsJa : (s.towardsEn ?? s.towardsJa)}</span>
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>{t('fSources')}</h3>
      <ul className="plain small">
        {el.provenance.sourceIds.map((s) => (
          <li key={s}>
            <span className="mono">{s}</span>
            <br />
            <span className="muted">{srcTitle(s)}</span>
          </li>
        ))}
      </ul>
      {(el.notes || el.provenance.note) && (
        <>
          <h3>{t('fNotes')}</h3>
          <p className="small">{[el.notes, el.provenance.note, vertical?.directionNote].filter(Boolean).join(' ')}</p>
        </>
      )}
      <p className="mono idline">{id}</p>
      {props.canRoute && (
        <div className="row-gap">
          <button type="button" className="btn" onClick={() => props.onFrom(id)}>
            {t('setAsFrom')}
          </button>
          <button type="button" className="btn" onClick={() => props.onTo(id)}>
            {t('setAsTo')}
          </button>
        </div>
      )}
    </aside>
  );
}

export function HelpDialog({ t, onClose }: { t: T; onClose(): void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()} data-testid="help-dialog">
        <header className="row-between">
          <h2 id="help-title">{t('helpTitle')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')} autoFocus>
            ×
          </button>
        </header>
        <dl className="help">
          <dt>{t('helpMouse')}</dt>
          <dd>{t('helpMouseBody')}</dd>
          <dt>{t('helpTouch')}</dt>
          <dd>{t('helpTouchBody')}</dd>
          <dt>{t('helpKeys')}</dt>
          <dd>{t('helpKeysBody')}</dd>
        </dl>
        <p className="notice">{t('helpLost')}</p>
        <p className="fine">{t('honestyShort')}</p>
        <p className="fine">{t('orientationNote')}</p>
      </div>
    </div>
  );
}
