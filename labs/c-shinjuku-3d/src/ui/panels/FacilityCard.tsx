/**
 * The card shown when a platform, gate, entrance or lift is selected. It is
 * written for a passenger: which lines, which direction, which floors, what to
 * expect at the gate. Halls and corridors have no card.
 *
 * Provenance is kept to one line at the foot (operator, date printed on the
 * source, and the reminder that positions are schematic); the full source
 * list lives in the Sources tab.
 */
import type { ReactNode } from 'react';
import { floorLabel } from '../../domain/floors';
import type { BoundOverlay, RunningStatus } from '../../domain/overlay';
import type { StationElementBase, StationModel, StepFree } from '../../domain/types';
import { FloorChip, Icon, LineBadge, type Glyph } from '../atoms';
import type { Lang, StrKey, T } from '../i18n';
import { pickName, type Namer } from '../naming';
import { trackRange } from '../scene/labels';

export const STATUS_KEY: Record<RunningStatus, StrKey> = {
  normal: 'statusNormal',
  delayed: 'statusDelayed',
  suspended: 'statusSuspended',
  'partial-suspension': 'statusPartial',
  unknown: 'statusUnknown',
};

/** Elements that have a card. Halls, corridors and plain links do not. */
export function hasCard(model: StationModel, id: string): boolean {
  return (
    model.areas.some((a) => a.id === id && a.kind === 'platform') ||
    model.gates.some((g) => g.id === id) ||
    model.entrances.some((e) => e.id === id) ||
    model.verticals.some((v) => v.id === id) ||
    model.unverifiedBlocks.some((b) => b.id === id)
  );
}

function stepFreeLine(v: StepFree, t: T): string {
  return v === null ? t('stepFreeUnknown') : v ? t('stepFreeYes') : t('stepFreeNo');
}

export function FacilityCard(props: {
  t: T;
  lang: Lang;
  model: StationModel;
  namer: Namer;
  elementId: string;
  canRoute: boolean;
  bound: BoundOverlay | null;
  onClose(): void;
  onFrom(id: string): void;
  onTo(id: string): void;
}) {
  const { t, model, namer, elementId: id, lang } = props;
  const area = model.areas.find((x) => x.id === id);
  const platform = area?.kind === 'platform' ? area : undefined;
  const gate = model.gates.find((x) => x.id === id);
  const entrance = model.entrances.find((x) => x.id === id);
  const vertical = model.verticals.find((x) => x.id === id);
  const block = model.unverifiedBlocks.find((x) => x.id === id);
  const el: StationElementBase | undefined = platform ?? gate ?? entrance ?? vertical ?? block;
  if (!el) return null;

  const ordinalOf = (levelId: string) => model.levels.find((l) => l.id === levelId)?.ordinal;
  const floorsOf = (levelIds: string[]) => {
    const out: string[] = [];
    for (const lid of levelIds) {
      const o = ordinalOf(lid);
      if (o === undefined) continue;
      const f = floorLabel(o);
      if (!out.includes(f)) out.push(f);
    }
    return out;
  };
  const floors = platform
    ? floorsOf([platform.levelId])
    : gate
      ? floorsOf([gate.levelId])
      : entrance
        ? floorsOf([entrance.levelId])
        : vertical
          ? floorsOf([...vertical.stops].sort((a, b) => (ordinalOf(b.levelId) ?? 0) - (ordinalOf(a.levelId) ?? 0)).map((s) => s.levelId))
          : [];

  const glyph: Glyph = platform ? 'platform' : gate ? (gate.gateKind === 'transfer' ? 'transfer' : 'gate') : entrance ? 'entrance' : vertical ? vertical.verticalKind : 'block';
  const operatorName = (stationId: string | null) => {
    const st = model.stations.find((s) => s.id === stationId);
    const op = model.operators.find((o) => o.id === st?.operatorId);
    return op ? (pickName(op.names, lang) ?? '') : '';
  };
  const zoneName = (areaId: string) => {
    const zone = model.areas.find((a) => a.id === areaId)?.fareZone;
    if (!zone) return '';
    if (zone === 'unpaid') return t('unpaid');
    const op = model.operators.find((o) => o.id === `sk:operator:${zone.replace('paid:', '')}`);
    return `${op ? (pickName(op.names, lang) ?? '') : ''} ${t('paid')}`.trim();
  };

  const facts: { key: string; label: string; value: ReactNode }[] = [];
  if (gate) {
    const sides = gate.sides.map((s) => ('areaId' in s ? zoneName(s.areaId) : namer.name(s.blockId)));
    facts.push({ key: 'sides', label: gate.gateKind === 'transfer' ? t('kindTransferGate') : t('kindGate'), value: sides.join(' ⇄ ') });
    if (gate.direction === 'exit-only') facts.push({ key: 'dir', label: t('fDirection'), value: <strong className="alert">{t('exitOnly')}</strong> });
    if (gate.hoursNote) facts.push({ key: 'hours', label: t('fHours'), value: gate.hoursNote });
    facts.push({ key: 'sf', label: t('fAccess'), value: stepFreeLine(gate.stepFree, t) });
    if (gate.aliases.length) facts.push({ key: 'alias', label: t('fAliases'), value: gate.aliases.map((a) => a.name).join('、') });
  }
  if (entrance) {
    const lead = lang === 'en' ? (entrance.leadsToEn ?? entrance.leadsToJa) : entrance.leadsToJa;
    facts.push({ key: 'lead', label: t('fLeadsTo'), value: lead ?? t('unknown') });
    facts.push({ key: 'sf', label: t('fAccess'), value: stepFreeLine(entrance.stepFree, t) });
  }
  if (vertical) {
    const stops = [...vertical.stops].sort((a, b) => (ordinalOf(b.levelId) ?? 0) - (ordinalOf(a.levelId) ?? 0));
    facts.push({
      key: 'stops',
      label: t('fConnects'),
      value: (
        <ul className="stops">
          {stops.map((s, i) => (
            <li key={i}>
              <FloorChip label={floorLabel(ordinalOf(s.levelId) ?? 0)} />
              <span>{namer.short(s.areaId)}</span>
            </li>
          ))}
        </ul>
      ),
    });
    if (vertical.hoursNote) facts.push({ key: 'hours', label: t('fHours'), value: vertical.hoursNote });
    if (vertical.verticalKind === 'escalator') facts.push({ key: 'dir', label: t('fDirection'), value: t('escalatorDirectionUnknown') });
    if (vertical.aggregated && vertical.verticalKind !== 'elevator') facts.push({ key: 'agg', label: t('fNote'), value: t('aggregatedNote') });
  }

  const tracks = platform && props.bound ? props.bound.tracks.filter((tr) => tr.platformId === platform.id) : [];
  const title = platform ? t('platformTitle', { n: trackRange(platform.tracks.map((x) => x.number)) }) : namer.name(id);

  return (
    <aside className="card" aria-label={t('inspector')} data-testid="inspector">
      <header className="card-head">
        <span className={`card-icon kind-${glyph}`}>
          <Icon glyph={glyph} size={22} />
        </span>
        <div className="card-title">
          <p className="card-kind">{namer.kind(id)}</p>
          <h2>{title}</h2>
          {el.names.ja && lang !== 'ja' && !platform && <p className="card-ja">{el.names.ja}</p>}
        </div>
        <div className="card-floors">
          {floors.map((f) => (
            <FloorChip key={f} label={f} active />
          ))}
        </div>
        <button type="button" className="icon-btn" onClick={props.onClose} aria-label={t('close')}>
          ×
        </button>
      </header>

      {block && <p className="unverified-banner">{t('blockNote')}</p>}

      {platform && (
        <ul className="track-list" data-testid="card-tracks">
          {platform.tracks.map((tr) => {
            const live = tracks.find((x) => x.track.number === tr.number);
            return (
              <li key={tr.number}>
                <span className="track-n">{tr.number}</span>
                <div className="track-services">
                  {tr.services.map((s, i) => {
                    const line = model.railLines.find((l) => l.id === s.railLineId);
                    const status = live?.statuses.find((x) => x.railLineId === s.railLineId);
                    return (
                      <div key={i} className="svc">
                        {line && <LineBadge line={line} lang={lang} />}
                        {status && (
                          <span className={`status status-${status.status}`}>
                            <span className="status-dot" />
                            {t(STATUS_KEY[status.status])}
                            {status.delayMinutes !== null && ` ${t('delayMin', { n: status.delayMinutes })}`}
                          </span>
                        )}
                        <p className="svc-towards">{lang === 'en' ? (s.towardsEn ?? s.towardsJa) : s.towardsJa}</p>
                      </div>
                    );
                  })}
                  {live && live.departures.length > 0 && (
                    <p className="svc-next">
                      {live.departures.slice(0, 2).map((d, i) => (
                        <span key={i}>
                          {d.scheduledTime}
                          {d.estimatedTime && <em> → {d.estimatedTime}</em>} {lang === 'en' ? (d.destinationEn ?? d.destinationJa) : d.destinationJa}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {facts.length > 0 && (
        <dl className="facts">
          {facts.map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {props.canRoute && (
        <div className="card-actions">
          <button type="button" className="btn" onClick={() => props.onFrom(id)} data-testid="card-from">
            <Icon glyph="start" size={16} />
            {t('setAsFrom')}
          </button>
          <button type="button" className="btn primary" onClick={() => props.onTo(id)} data-testid="card-to">
            <Icon glyph="goal" size={16} />
            {t('setAsTo')}
          </button>
        </div>
      )}

      <p className="card-source" data-testid="card-source">
        {el.existence === 'verified'
          ? t('cardSource', { op: operatorName(el.stationId) || t('operatorMaps'), date: el.asOf ?? t('unknown') })
          : t('cardSourceUnverified')}
        {' · '}
        {el.geometryConfidence === 'verified' ? t('cardGeometryVerified') : t('cardGeometrySchematic')}
      </p>
    </aside>
  );
}
