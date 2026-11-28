/**
 * SENKIRO Atlas encyclopedia entry for the URL selection (`station` › `complex` › `line`,
 * read with `useAppSearch()`). Every fact comes from the bundle; unknown values render as
 * `<UnknownValue />`, service status is the R-07 honest "unavailable", and a station
 * complex always lists what it explicitly does NOT include.
 */
import {
  HUB_REGION,
  type Interchange,
  type Locale,
  type RailLine,
  type SkId,
  type Station,
  type StationComplex,
  type ThroughService,
  unavailableOperationalStatus,
} from '@senkiro/contracts';
import { formatTemplate, LineBadge, ProvenanceTag, UnknownValue } from '@senkiro/ui-kit';
import type { ReactNode } from 'react';
import { useAppSearch, useMessages, useUpdateSearch } from '../../app/hooks.ts';
import { getHub } from '../../data/hubs.ts';
import type { Messages } from '../../i18n/messages.ts';
import { useShellUi } from '../../state/ui-store.ts';
import styles from './atlas.module.css';
import { hubForComplex } from './atlas-geojson.ts';
import { type AtlasIndex, complexOperators, nameOf } from './atlas-index.ts';

type Update = ReturnType<typeof useUpdateSearch>;

interface EntryContext {
  index: AtlasIndex;
  lang: Locale;
  m: Messages;
  update: Update;
}

function stationName(ctx: EntryContext, id: string): string {
  const station = ctx.index.stations.get(id);
  return station === undefined
    ? formatTemplate(ctx.m.atlas.entry.unknownEntity, { id })
    : (nameOf(station.names, ctx.lang) ?? id);
}

function operatorName(ctx: EntryContext, id: string): string {
  const operator = ctx.index.operators.get(id);
  return operator === undefined ? id : (nameOf(operator.names, ctx.lang) ?? id);
}

function lineName(ctx: EntryContext, line: RailLine): string {
  return nameOf(line.names, ctx.lang) ?? line.id;
}

/** Digits after the line prefix, for the badge (`HK-86` → `86`); `null` if it does not fit. */
function codeNumber(code: string | null, prefix: string | null): string | null {
  if (code === null || prefix === null || !code.startsWith(prefix)) {
    return null;
  }
  return code.slice(prefix.length).replace(/^-/, '') || null;
}

function goStation(ctx: EntryContext, id: SkId<'station'>) {
  ctx.update({ station: id, complex: undefined, line: undefined });
}

function goLine(ctx: EntryContext, id: SkId<'line'>) {
  ctx.update({ line: id, station: undefined, complex: undefined });
}

function goComplex(ctx: EntryContext, id: SkId<'complex'>) {
  ctx.update({ complex: id, station: undefined, line: undefined });
}

function LineButton({
  ctx,
  line,
  number,
}: {
  ctx: EntryContext;
  line: RailLine;
  number?: string | null;
}) {
  return (
    <button
      type="button"
      className={styles.badgeButton}
      data-line-link={line.id}
      onClick={() => goLine(ctx, line.id)}
    >
      <LineBadge
        lineName={lineName(ctx, line)}
        color={line.color}
        prefix={line.stationCodePrefix}
        number={number ?? null}
        lang={ctx.lang}
        size="sm"
      />
    </button>
  );
}

function Section({
  title,
  section,
  children,
}: {
  title: string;
  section: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.entrySection} data-entry-section={section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </section>
  );
}

function ThroughList({ ctx, items }: { ctx: EntryContext; items: readonly ThroughService[] }) {
  const e = ctx.m.atlas.entry;
  if (items.length === 0) {
    return null;
  }
  return (
    <Section title={e.through} section="through">
      <ul className={styles.entryList}>
        {items.map((through) => {
          const from = ctx.index.lines.get(through.fromRailLineId);
          const to = ctx.index.lines.get(through.toRailLineId);
          return (
            <li key={through.id} className={styles.throughItem} data-through-id={through.id}>
              <span className={styles.throughName}>
                {nameOf(through.names, ctx.lang) ?? through.id}
              </span>
              <span className={styles.throughLines}>
                {from === undefined ? (
                  <code>{through.fromRailLineId}</code>
                ) : (
                  <LineButton ctx={ctx} line={from} />
                )}
                <span aria-hidden="true">⇄</span>
                {to === undefined ? (
                  <code>{through.toRailLineId}</code>
                ) : (
                  <LineButton ctx={ctx} line={to} />
                )}
              </span>
              <dl className={styles.miniFacts}>
                <dt>{e.boundary}</dt>
                <dd>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => goStation(ctx, through.boundaryStationId)}
                  >
                    {stationName(ctx, through.boundaryStationId)}
                  </button>
                </dd>
                <dt>{e.throughOperators}</dt>
                <dd>{through.operatorIds.map((id) => operatorName(ctx, id)).join(' / ')}</dd>
              </dl>
              <ProvenanceTag
                provenance={through.provenance}
                lang={ctx.lang}
                sources={ctx.index.bundle.trackGraph.sources}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function HubButton({ ctx, complex }: { ctx: EntryContext; complex: StationComplex }) {
  const hub = hubForComplex(complex.id);
  if (hub === null || HUB_REGION[hub] !== ctx.index.bundle.region) {
    return null;
  }
  const pending = getHub(hub).status === 'phase-1-placeholder';
  return (
    <div className={styles.hubAction}>
      <button
        type="button"
        className={styles.primaryButton}
        data-enter-hub={hub}
        onClick={() =>
          ctx.update({
            region: HUB_REGION[hub],
            hub,
            complex: complex.id,
            station: undefined,
            line: undefined,
          })
        }
      >
        <span className={styles.hubBadge} aria-hidden="true">
          3D
        </span>
        {ctx.m.atlas.entry.enterHub}
      </button>
      {pending ? <p className={styles.hint}>{ctx.m.atlas.entry.hubPending}</p> : null}
    </div>
  );
}

function InterchangeList({ ctx, items }: { ctx: EntryContext; items: readonly Interchange[] }) {
  const e = ctx.m.atlas.entry;
  if (items.length === 0) {
    return null;
  }
  return (
    <Section title={e.interchanges} section="interchanges">
      <ul className={styles.entryList}>
        {items.map((interchange) => (
          <li
            key={interchange.id}
            className={styles.interchange}
            data-gate-type={interchange.gateType}
          >
            <span className={styles.interchangePair}>
              {stationName(ctx, interchange.fromStationId)} ⇄{' '}
              {stationName(ctx, interchange.toStationId)}
            </span>
            <span className={styles.gate} data-gate={interchange.gateType}>
              {e.gate[interchange.gateType]}
            </span>
            <dl className={styles.miniFacts}>
              <dt>{e.walking}</dt>
              <dd>
                {interchange.walkingMinutes === null ? (
                  <UnknownValue lang={ctx.lang} label={e.walking} />
                ) : (
                  formatTemplate(e.minutes, { minutes: String(interchange.walkingMinutes) })
                )}
              </dd>
              <dt>{e.stepFree}</dt>
              <dd>
                {interchange.stepFree === null ? (
                  <UnknownValue lang={ctx.lang} label={e.stepFree} />
                ) : interchange.stepFree ? (
                  e.stepFreeValues.yes
                ) : (
                  e.stepFreeValues.no
                )}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function LineEntry({ ctx, line }: { ctx: EntryContext; line: RailLine }) {
  const e = ctx.m.atlas.entry;
  const segments = ctx.index.segmentsByLine.get(line.id) ?? [];
  const known = segments.every((segment) => segment.operatingKm !== null);
  const total = segments.reduce((sum, segment) => sum + (segment.operatingKm ?? 0), 0);
  const status = unavailableOperationalStatus(line.id);
  return (
    <>
      <header className={styles.entryHead}>
        <span className={styles.kind} data-kind="line">
          {e.kinds.line}
        </span>
        <LineBadge
          lineName={lineName(ctx, line)}
          color={line.color}
          prefix={line.stationCodePrefix}
          lang={ctx.lang}
        />
        <ProvenanceTag
          provenance={line.provenance}
          lang={ctx.lang}
          sources={ctx.index.bundle.trackGraph.sources}
        />
      </header>
      <dl className={styles.miniFacts}>
        <dt>{e.operator}</dt>
        <dd>{operatorName(ctx, line.operatorId)}</dd>
        <dt>{e.lineClass}</dt>
        <dd>{e.lineClasses[line.lineClass]}</dd>
        <dt>{e.coverage}</dt>
        <dd>{e.coverageStatus[line.coverageStatus]}</dd>
        <dt>{e.operatingKm}</dt>
        <dd data-operating-km={known && segments.length > 0 ? total : 'unknown'}>
          {known && segments.length > 0 ? (
            formatTemplate(e.operatingKmTotal, {
              km: String(Math.round(total * 10) / 10),
              count: String(segments.length),
            })
          ) : (
            <UnknownValue lang={ctx.lang} label={e.operatingKm} />
          )}
        </dd>
      </dl>
      <Section title={e.operationalStatus} section="status">
        <p className={styles.statusNote} data-operational-status={status.status}>
          {e.operationalUnavailable}
        </p>
      </Section>
      <Section title={e.stationSequence} section="sequence">
        <ol className={styles.sequence}>
          {line.stationIds.map((stationId) => {
            const station = ctx.index.stations.get(stationId);
            return (
              <li key={stationId}>
                <button
                  type="button"
                  className={styles.sequenceStop}
                  data-station-link={stationId}
                  aria-label={formatTemplate(e.jumpStation, {
                    station: stationName(ctx, stationId),
                  })}
                  onClick={() => goStation(ctx, stationId)}
                >
                  <span className={styles.stopDot} aria-hidden="true" />
                  <span>{stationName(ctx, stationId)}</span>
                  {station?.stationCode ? (
                    <code className={styles.code}>{station.stationCode}</code>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
        <p className={styles.hint}>
          {formatTemplate(e.sequenceNote, { count: String(line.stationIds.length) })}
        </p>
      </Section>
      <ThroughList ctx={ctx} items={ctx.index.throughByLine.get(line.id) ?? []} />
    </>
  );
}

function StationEntry({ ctx, station }: { ctx: EntryContext; station: Station }) {
  const e = ctx.m.atlas.entry;
  const lines = ctx.index.linesByStation.get(station.id) ?? [];
  const complex =
    station.stationComplexId === null
      ? undefined
      : ctx.index.complexes.get(station.stationComplexId);
  const interchanges =
    complex === undefined
      ? []
      : (ctx.index.interchangesByComplex.get(complex.id) ?? []).filter(
          (item) => item.fromStationId === station.id || item.toStationId === station.id,
        );
  return (
    <>
      <header className={styles.entryHead}>
        <span className={styles.kind} data-kind="station">
          {e.kinds.station}
        </span>
        <h3 className={styles.entryTitle}>{nameOf(station.names, ctx.lang) ?? station.id}</h3>
        <ProvenanceTag
          provenance={station.provenance}
          lang={ctx.lang}
          sources={ctx.index.bundle.trackGraph.sources}
        />
      </header>
      <dl className={styles.miniFacts}>
        <dt>{e.operator}</dt>
        <dd>{operatorName(ctx, station.operatorId)}</dd>
        <dt>{e.stationCode}</dt>
        <dd data-station-code={station.stationCode ?? 'unknown'}>
          {station.stationCode === null ? (
            <UnknownValue lang={ctx.lang} kind="unverified" label={e.stationCode} />
          ) : (
            <code className={styles.stationCode}>{station.stationCode}</code>
          )}
        </dd>
      </dl>
      {lines.length > 0 ? (
        <Section title={e.lines} section="lines">
          <div className={styles.badges}>
            {lines.map((line) => (
              <LineButton
                key={line.id}
                ctx={ctx}
                line={line}
                number={codeNumber(station.stationCode, line.stationCodePrefix)}
              />
            ))}
          </div>
        </Section>
      ) : null}
      <Section title={e.complex} section="complex">
        {complex === undefined ? (
          <p className={styles.hint} data-station-standalone="">
            {e.standalone}
          </p>
        ) : (
          <button
            type="button"
            className={styles.textButton}
            data-complex-link={complex.id}
            onClick={() => goComplex(ctx, complex.id)}
          >
            {nameOf(complex.names, ctx.lang) ?? complex.id}
          </button>
        )}
      </Section>
      {complex === undefined ? null : <HubButton ctx={ctx} complex={complex} />}
      <InterchangeList ctx={ctx} items={interchanges} />
      <ThroughList ctx={ctx} items={ctx.index.throughByStation.get(station.id) ?? []} />
    </>
  );
}

function ComplexEntry({ ctx, complex }: { ctx: EntryContext; complex: StationComplex }) {
  const e = ctx.m.atlas.entry;
  const name = nameOf(complex.names, ctx.lang) ?? complex.id;
  const operators = complexOperators(ctx.index, complex);
  return (
    <>
      <header className={styles.entryHead}>
        <span className={styles.kind} data-kind="complex">
          {e.kinds.complex}
        </span>
        <h3 className={styles.entryTitle}>{name}</h3>
        <ProvenanceTag
          provenance={complex.provenance}
          lang={ctx.lang}
          sources={ctx.index.bundle.trackGraph.sources}
        />
      </header>
      <p className={styles.hint}>
        {formatTemplate(ctx.m.atlas.search.complexMeta, {
          stations: String(complex.stationIds.length),
          operators: String(operators.length),
        })}
      </p>
      <HubButton ctx={ctx} complex={complex} />
      <Section
        title={formatTemplate(e.members, { count: String(complex.stationIds.length) })}
        section="members"
      >
        <ul className={styles.entryList}>
          {complex.stationIds.map((stationId) => {
            const station = ctx.index.stations.get(stationId);
            return (
              <li key={stationId}>
                <button
                  type="button"
                  className={styles.memberButton}
                  data-station-link={stationId}
                  onClick={() => goStation(ctx, stationId)}
                >
                  <span>{stationName(ctx, stationId)}</span>
                  <span className={styles.meta}>
                    {station === undefined ? null : operatorName(ctx, station.operatorId)}
                    {station?.stationCode ? (
                      <>
                        {' · '}
                        <code className={styles.code}>{station.stationCode}</code>
                      </>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      {complex.explicitlyExcluded.length > 0 ? (
        <section
          className={styles.excluded}
          data-entry-section="excluded"
          role="note"
          aria-label={e.excluded}
        >
          <h4 className={styles.excludedTitle}>{e.excluded}</h4>
          <p className={styles.excludedLead}>{formatTemplate(e.excludedLead, { complex: name })}</p>
          <ul className={styles.entryList}>
            {complex.explicitlyExcluded.map((exclusion) => {
              const linked =
                exclusion.stationId === undefined
                  ? undefined
                  : ctx.index.stations.get(exclusion.stationId);
              return (
                <li
                  key={`${exclusion.name}-${exclusion.stationId ?? ''}`}
                  data-excluded-station={exclusion.stationId ?? ''}
                >
                  {linked === undefined ? (
                    <strong>{exclusion.name}</strong>
                  ) : (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => goStation(ctx, linked.id)}
                    >
                      {exclusion.name}
                    </button>
                  )}
                  <span className={styles.meta}> · {exclusion.reason}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <InterchangeList ctx={ctx} items={ctx.index.interchangesByComplex.get(complex.id) ?? []} />
    </>
  );
}

export function AtlasEncyclopedia({ index }: { index: AtlasIndex }) {
  const { lang, station, complex, line } = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const setPanelOpen = useShellUi((state) => state.setPanelOpen);
  const ctx: EntryContext = { index, lang, m, update };
  const selected = station ?? complex ?? line;
  if (selected === undefined) {
    return null;
  }

  let body: ReactNode;
  let kind: 'station' | 'complex' | 'line';
  if (station !== undefined) {
    kind = 'station';
    const found = index.stations.get(station);
    body = found === undefined ? null : <StationEntry ctx={ctx} station={found} />;
  } else if (complex !== undefined) {
    kind = 'complex';
    const found = index.complexes.get(complex);
    body = found === undefined ? null : <ComplexEntry ctx={ctx} complex={found} />;
  } else {
    kind = 'line';
    const found = line === undefined ? undefined : index.lines.get(line);
    body = found === undefined ? null : <LineEntry ctx={ctx} line={found} />;
  }

  return (
    <article className={styles.entry} data-atlas-entry={kind} data-entry-id={selected}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => {
          // The panel may only be open because of the selection; keep it open for search.
          setPanelOpen(true);
          update({ station: undefined, complex: undefined, line: undefined });
        }}
      >
        ← {m.atlas.entry.back}
      </button>
      {body ?? (
        <p className={styles.notice} role="note" data-entry-missing="">
          {formatTemplate(m.atlas.entry.notFound, { id: selected })}
        </p>
      )}
    </article>
  );
}
