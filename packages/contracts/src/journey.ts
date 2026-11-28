/**
 * Graph 5 · JourneyGraph (contract §5.5): personal four-dimensional ride history,
 * commemorative tickets and the HLC sync op-log. Backs `packages/local-db`.
 */
import type { BaseEntity } from './base.ts';
import type { SkId } from './ids.ts';
import type { LocalizedNames } from './locale.ts';

export interface RideRecord extends BaseEntity<'ride'> {
  travelDate: string;
  originStationId: SkId<'station'>;
  destinationStationId: SkId<'station'>;
  segmentIds: SkId<'segment'>[];
  lineId: SkId<'line'> | null;
  vehicleSeriesId: SkId<'vehicle'> | null;
  trainNumber: string | null;
  farePaidYen: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RideSegment {
  rideId: SkId<'ride'>;
  segmentId: SkId<'segment'>;
  direction: 'forward' | 'reverse' | 'unknown';
  operatingKm: number | null;
}

export const VISIT_KINDS = ['boarded', 'alighted', 'transferred', 'passed_through'] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

/** Visit kinds that count as "been there": the traveller actually got on, off or changed. */
export type CountableVisitKind = Exclude<VisitKind, 'passed_through'>;

export interface VisitedStation {
  rideId: SkId<'ride'>;
  stationId: SkId<'station'>;
  visitKind: VisitKind;
}

export interface CountableVisitedStation extends VisitedStation {
  visitKind: CountableVisitKind;
}

/** SQL predicate `packages/local-db` must use when counting visited stations. */
export const COUNTABLE_VISIT_SQL_PREDICATE = "visit_kind != 'passed_through'";

/** Invariant 6: a station the train merely passed through is never a visit. */
export function isCountableVisit(visit: VisitedStation): visit is CountableVisitedStation {
  return visit.visitKind !== 'passed_through';
}

/** Distinct stations actually visited (passed-through stations excluded). */
export function countVisitedStations(visits: readonly VisitedStation[]): number {
  const stations = new Set<string>();
  for (const visit of visits) {
    if (isCountableVisit(visit)) {
      stations.add(visit.stationId);
    }
  }
  return stations.size;
}

export interface MunicipalityVisit {
  municipalityCode: string;
  names: LocalizedNames;
  prefectureCode: string;
  firstVisitedAt: string;
  /** Only rides with a real boarding, alighting or transfer in the municipality qualify. */
  triggeredByRideId: SkId<'ride'>;
}

/** Only a countable visit may light up a municipality. */
export function canTriggerMunicipalityVisit(visit: VisitedStation): boolean {
  return isCountableVisit(visit);
}

export interface LineCoverage {
  totalSegments: number;
  riddenSegments: number;
  /** Ridden / total by segment count; `0` for a line with no segments. */
  segmentRatio: number;
  /** Ridden / total by operating km; `null` when any segment's km is unknown. */
  kmRatio: number | null;
  /** True only when every segment of the line was actually ridden. */
  isComplete: boolean;
}

export interface LineSegmentRef {
  id: SkId<'segment'>;
  operatingKm: number | null;
}

/**
 * Invariant 6: completion is measured by the track segments actually ridden, never by
 * "rode some part of the line". Segments outside the line are ignored.
 */
export function computeLineCoverage(
  lineSegments: readonly LineSegmentRef[],
  riddenSegmentIds: Iterable<SkId<'segment'>>,
): LineCoverage {
  const ridden = new Set<string>(riddenSegmentIds);
  const unique = new Map<string, LineSegmentRef>();
  for (const segment of lineSegments) {
    unique.set(segment.id, segment);
  }
  let riddenCount = 0;
  let totalKm = 0;
  let riddenKm = 0;
  let kmKnown = true;
  for (const segment of unique.values()) {
    const wasRidden = ridden.has(segment.id);
    if (wasRidden) {
      riddenCount += 1;
    }
    if (segment.operatingKm === null) {
      kmKnown = false;
    } else {
      totalKm += segment.operatingKm;
      if (wasRidden) {
        riddenKm += segment.operatingKm;
      }
    }
  }
  const total = unique.size;
  return {
    totalSegments: total,
    riddenSegments: riddenCount,
    segmentRatio: total === 0 ? 0 : riddenCount / total,
    kmRatio: kmKnown && totalKm > 0 ? riddenKm / totalKm : null,
    isComplete: total > 0 && riddenCount === total,
  };
}

export interface VehicleSeries extends BaseEntity<'vehicle'> {
  operatorId: SkId<'operator'>;
  seriesCode: string;
  inServicePeriod: string | null;
  carCountOptions: number[];
  assignedLineIds: SkId<'line'>[];
  factConfidence: 'verified' | 'representative' | 'unknown';
}

/** Exact watermark every commemorative ticket must render (invariant 5). */
export const COMMEMORATIVE_WATERMARK = 'SAMPLE · 記念用 · 乗車不可' as const;

export const COMMEMORATIVE_TEMPLATE_IDS = ['jnr-seiji', 'showa-b-ticket', 'kansai-maroon'] as const;
export type CommemorativeTemplateId = (typeof COMMEMORATIVE_TEMPLATE_IDS)[number];

/** Non-valid collectible card. Never machine-readable (no QR, barcode or magnetic stripe). */
export interface CommemorativeTicket extends BaseEntity<'ticket'> {
  rideId: SkId<'ride'> | null;
  templateId: CommemorativeTemplateId;
  displayOrigin: LocalizedNames;
  displayDestination: LocalizedNames;
  travelDate: string;
  seatClassLabel: string | null;
  nonValidWatermark: typeof COMMEMORATIVE_WATERMARK;
  allowsBarcode: false;
}

export type SyncEntityType =
  | 'ride'
  | 'ride_segment'
  | 'visited_station'
  | 'municipality_visit'
  | 'ticket';

/** HLC-based idempotent sync log row. */
export interface SyncOpLogEntry {
  opId: string;
  /** Hybrid Logical Clock: `<iso_or_ms>-<counter>-<nodeId>`. */
  hlc: string;
  entityType: SyncEntityType;
  entityId: string;
  op: 'upsert' | 'delete';
  /** May be `null` for `delete`. */
  payloadJson: string | null;
  /** `null` while not yet synced. */
  syncedAt: string | null;
  createdAt: string;
}

export interface ParsedHlc {
  time: string;
  counter: number;
  nodeId: string;
}

const HLC_PATTERN = /^(\d+|\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2}))-(\d+)-([A-Za-z0-9_]+)$/;

/** Parse `<iso_or_ms>-<counter>-<nodeId>`; `null` when malformed. */
export function parseHlc(value: string): ParsedHlc | null {
  const match = HLC_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const [, time = '', counter = '', nodeId = ''] = match;
  return { time, counter: Number(counter), nodeId };
}

export interface JourneyGraph {
  rides: RideRecord[];
  rideSegments: RideSegment[];
  visitedStations: VisitedStation[];
  municipalityVisits: MunicipalityVisit[];
  vehicleSeries: VehicleSeries[];
  tickets: CommemorativeTicket[];
  opLog: SyncOpLogEntry[];
}
