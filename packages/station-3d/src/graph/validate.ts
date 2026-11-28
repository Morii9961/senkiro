/**
 * Validation of a `StationHubDataset`. Every rule is a statement about station reality or
 * about the honesty contract, so a mistake in converted data fails tests instead of
 * reaching the UI. The validator collects every issue; it never stops at the first.
 */
import {
  type DataNature,
  type EntityIdPrefix,
  isPaidFareZone,
  isSkId,
  type PlanPoint,
  type PlanRect,
  type StationHubDataset,
} from '@senkiro/contracts';
import { floorOrdinals, floorSpanBetween, isVerticalLinkKind } from './build.ts';
import { crossingVerdict } from './policy.ts';

export interface ValidationIssue {
  rule: string;
  entityId: string;
  message: string;
}

const DATA_NATURES: ReadonlySet<DataNature> = new Set([
  'official',
  'licensed-third-party',
  'derived',
  'manual-verified',
  'synthetic',
  'unknown',
]);

const EPS = 1e-6;

export function pointInRect(p: PlanPoint, r: PlanRect): boolean {
  return p.x >= r.x0 - EPS && p.x <= r.x1 + EPS && p.z >= r.z0 - EPS && p.z <= r.z1 + EPS;
}

export function pointInFootprint(p: PlanPoint, footprint: readonly PlanRect[]): boolean {
  return footprint.some((r) => pointInRect(p, r));
}

interface Checked {
  id: string;
  provenance: { sourceIds: string[]; dataNature: DataNature };
  validFrom: string | null;
  validTo: string | null;
}

export function validateHubDataset(dataset: StationHubDataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (rule: string, entityId: string, message: string) => {
    issues.push({ rule, entityId, message });
  };

  // --- sources -------------------------------------------------------------------------
  const sourceIds = new Set<string>();
  for (const source of dataset.sources) {
    if (sourceIds.has(source.id)) {
      push('source-unique', source.id, 'duplicate source id');
    }
    sourceIds.add(source.id);
    if (source.title.trim() === '' || source.publisher.trim() === '') {
      push('source-fields', source.id, 'a source needs a title and a publisher');
    }
    if (source.license.trim() === '') {
      push('source-fields', source.id, 'a source must state its licence (or "unknown")');
    }
  }
  const sourced = (entityId: string, ids: readonly string[], what: string) => {
    if (ids.length === 0) {
      push('provenance', entityId, `${what} has no source`);
    }
    for (const id of ids) {
      if (!sourceIds.has(id)) {
        push('provenance', entityId, `${what} cites unregistered source ${id}`);
      }
    }
  };

  // --- ids and provenance --------------------------------------------------------------
  const seen = new Set<string>();
  const entity = (value: Checked, prefix: EntityIdPrefix) => {
    if (!isSkId(value.id, prefix)) {
      push('id-format', value.id, `not a v1.0 ${prefix} SkId`);
    }
    if (seen.has(value.id)) {
      push('id-unique', value.id, 'duplicate id');
    }
    seen.add(value.id);
    sourced(value.id, value.provenance.sourceIds, 'entity');
    if (!DATA_NATURES.has(value.provenance.dataNature)) {
      push('provenance', value.id, `bad dataNature ${String(value.provenance.dataNature)}`);
    }
    if (value.validFrom === undefined || value.validTo === undefined) {
      push('validity', value.id, 'validFrom / validTo must be present (null when unknown)');
    }
  };
  entity(dataset.complex, 'complex');
  for (const o of dataset.operators) {
    entity(o, 'operator');
  }
  for (const l of dataset.lines) {
    entity(l, 'line');
  }
  for (const s of dataset.stations) {
    entity(s, 'station');
  }
  for (const l of dataset.levels) {
    entity(l, 'level');
  }
  for (const p of dataset.places) {
    entity(p, 'place');
  }
  for (const l of dataset.links) {
    entity(l, 'link');
  }

  // --- references ----------------------------------------------------------------------
  const complexId = dataset.complex.id;
  const operatorIds = new Set(dataset.operators.map((o) => o.id));
  const lineIds = new Set(dataset.lines.map((l) => l.id));
  const stationIds = new Set(dataset.stations.map((s) => s.id));
  const levelById = new Map(dataset.levels.map((l) => [l.id, l]));
  const placeById = new Map(dataset.places.map((p) => [p.id, p]));

  for (const id of dataset.complex.stationIds) {
    if (!stationIds.has(id)) {
      push('reference', complexId, `complex lists unknown station ${id}`);
    }
  }
  for (const line of dataset.lines) {
    if (!operatorIds.has(line.operatorId)) {
      push('reference', line.id, `unknown operator ${line.operatorId}`);
    }
  }
  for (const station of dataset.stations) {
    if (!operatorIds.has(station.operatorId)) {
      push('reference', station.id, `unknown operator ${station.operatorId}`);
    }
    for (const id of station.railLineIds) {
      if (!lineIds.has(id)) {
        push('reference', station.id, `unknown line ${id}`);
      }
    }
    if (station.stationComplexId !== null && station.stationComplexId !== complexId) {
      push('reference', station.id, `belongs to ${station.stationComplexId}, not ${complexId}`);
    }
  }

  // --- levels --------------------------------------------------------------------------
  for (const level of dataset.levels) {
    if (level.complexId !== complexId) {
      push('complex', level.id, 'level of another complex');
    }
    if (level.stationId !== null && !stationIds.has(level.stationId)) {
      push('reference', level.id, `unknown station ${level.stationId}`);
    }
    if (level.operatorId !== null && !operatorIds.has(level.operatorId)) {
      push('reference', level.id, `unknown operator ${level.operatorId}`);
    }
    if (!Number.isFinite(level.ordinal) || !Number.isFinite(level.elevation)) {
      push('level-order', level.id, 'ordinal and elevation must be finite numbers');
    }
  }
  const byOrdinal = [...dataset.levels].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 0; i + 1 < byOrdinal.length; i += 1) {
    const lo = byOrdinal[i];
    const hi = byOrdinal[i + 1];
    if (
      lo !== undefined &&
      hi !== undefined &&
      lo.ordinal < hi.ordinal &&
      lo.elevation >= hi.elevation
    ) {
      push('level-order', hi.id, `drawn elevation contradicts ordinal (vs ${lo.id})`);
    }
  }

  // --- places --------------------------------------------------------------------------
  for (const place of dataset.places) {
    if (place.complexId !== complexId) {
      push('complex', place.id, 'place of another complex');
    }
    if (!levelById.has(place.levelId)) {
      push('reference', place.id, `unknown level ${place.levelId}`);
    }
    if (place.stationId !== null && !stationIds.has(place.stationId)) {
      push('reference', place.id, `unknown station ${place.stationId}`);
    }
    if (place.footprint.length === 0) {
      push('geometry', place.id, 'empty footprint');
    }
    for (const r of place.footprint) {
      if (!(r.x0 < r.x1 && r.z0 < r.z1)) {
        push('geometry', place.id, 'degenerate rectangle');
      }
    }
    if (place.footprint.length > 0 && !pointInFootprint(place.anchor, place.footprint)) {
      push('geometry', place.id, 'anchor outside footprint');
    }
    if (place.kind === 'platform' && !isPaidFareZone(place.fareZone)) {
      push('fare-zone', place.id, `a platform must be in a paid area, not ${place.fareZone}`);
    }
    if (place.kind === 'entrance' && place.fareZone !== 'unpaid') {
      push('fare-zone', place.id, 'an entrance opens onto the unpaid area');
    }
    if (place.existence === 'unverified' && place.geometryConfidence !== 'unknown') {
      push('honesty', place.id, 'unverified places must have geometryConfidence "unknown"');
    }
    if (
      place.geometryConfidence === 'verified' &&
      place.provenance.dataNature === 'manual-verified'
    ) {
      push('honesty', place.id, 'hand-entered geometry cannot be "verified"');
    }
    for (const track of place.tracks ?? []) {
      for (const service of track.services) {
        if (!lineIds.has(service.railLineId)) {
          push(
            'reference',
            place.id,
            `track ${track.number} cites unknown line ${service.railLineId}`,
          );
        }
      }
      if (track.platformDoors !== undefined) {
        sourced(place.id, track.platformDoors.sourceIds, `platform doors of track ${track.number}`);
      }
    }
    if (place.terminus !== undefined) {
      sourced(place.id, place.terminus.sourceIds, 'terminus');
    }
  }

  // --- links ---------------------------------------------------------------------------
  const floors = floorOrdinals(dataset.levels);
  const linkedPlaces = new Set<string>();
  for (const link of dataset.links) {
    if (link.complexId !== complexId) {
      push('complex', link.id, 'link of another complex');
    }
    const a = placeById.get(link.fromPlaceId);
    const b = placeById.get(link.toPlaceId);
    if (a === undefined || b === undefined) {
      push(
        'reference',
        link.id,
        `endpoint missing: ${a === undefined ? link.fromPlaceId : link.toPlaceId}`,
      );
      continue;
    }
    if (a.id === b.id) {
      push('reference', link.id, 'a link must join two different places');
    }
    linkedPlaces.add(a.id);
    linkedPlaces.add(b.id);
    const la = levelById.get(a.levelId);
    const lb = levelById.get(b.levelId);
    if (la === undefined || lb === undefined) {
      continue;
    }

    if (isVerticalLinkKind(link.kind)) {
      if (la.ordinal === lb.ordinal) {
        push('vertical-flat', link.id, `${link.kind} joins two places on the same floor`);
      }
      const span = floorSpanBetween(floors, la.ordinal, lb.ordinal);
      if (span > 1 && (link.declaredSpan === undefined || link.declaredSpan === null)) {
        push('vertical-adjacent', link.id, `skips ${span - 1} floor(s) without a declaredSpan`);
      }
    } else if (la.ordinal !== lb.ordinal) {
      push('level-change', link.id, `a ${link.kind} cannot change floor`);
    }
    if (link.declaredSpan !== undefined && link.declaredSpan !== null) {
      const [s0, s1] = link.declaredSpan;
      const declared = new Set([s0, s1]);
      if (!levelById.has(s0) || !levelById.has(s1)) {
        push('reference', link.id, 'declaredSpan names an unknown level');
      } else if (!(declared.has(la.id) && declared.has(lb.id))) {
        push('declared-span', link.id, 'declaredSpan does not match the levels of its endpoints');
      }
    }

    const verdict = crossingVerdict(link, a.fareZone, b.fareZone);
    if (verdict === 'roadway') {
      push('roadway', link.id, 'nothing may connect to a roadway area');
    } else if (verdict === 'ungated-boundary') {
      push('fare-boundary', link.id, `${a.fareZone} ↔ ${b.fareZone} joined without a gate`);
    }
    if (link.kind === 'gate') {
      if (a.fareZone === b.fareZone) {
        push('gate-sides', link.id, 'a gate must separate two different fare zones');
      }
      const paid = [a.fareZone, b.fareZone].filter(isPaidFareZone).length;
      if (link.gateKind === undefined) {
        push('gate-kind', link.id, 'a gate must say whether it is a ticket or a transfer gate');
      } else if (link.gateKind === 'ticket' && paid !== 1) {
        push('gate-sides', link.id, 'a ticket gate separates one paid and one unpaid area');
      } else if (link.gateKind === 'transfer' && paid !== 2) {
        push('gate-sides', link.id, 'a transfer gate joins two paid areas');
      }
    } else if (link.gateKind !== undefined) {
      push('gate-kind', link.id, 'only gates carry a gateKind');
    }
  }
  for (const place of dataset.places) {
    if (place.fareZone === 'roadway' && linkedPlaces.has(place.id)) {
      push('roadway', place.id, 'a roadway area must not be linked to anything');
    }
  }

  // --- external links ------------------------------------------------------------------
  for (const external of dataset.externalLinks ?? []) {
    if (!/^https:\/\//.test(external.url)) {
      push('external-link', external.url, 'external links must be https URLs');
    }
    if (external.sourceId !== null && !sourceIds.has(external.sourceId)) {
      push('provenance', external.url, `cites unregistered source ${external.sourceId}`);
    }
  }

  return issues;
}

/** Throwing form for trust boundaries (JSON loaded at runtime). */
export class HubDatasetValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(complexId: string, issues: readonly ValidationIssue[]) {
    const head = issues
      .slice(0, 5)
      .map((i) => `${i.rule}@${i.entityId}: ${i.message}`)
      .join('; ');
    super(`${complexId}: ${issues.length} validation issue(s): ${head}`);
    this.name = 'HubDatasetValidationError';
    this.issues = issues;
  }
}

export function assertValidHubDataset(dataset: StationHubDataset): void {
  const issues = validateHubDataset(dataset);
  if (issues.length > 0) {
    throw new HubDatasetValidationError(dataset.complex.id, issues);
  }
}

export { validateHubDataset as validateStationHubDataset };
