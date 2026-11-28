/**
 * Graph 3 · ServiceGraph (contract §5.3): service patterns, trips, stop times, through
 * services and honest operational status.
 */
import type { BaseEntity, DataNature, SchedulePrecision } from './base.ts';
import type { SkId } from './ids.ts';
import type { LocalizedNames } from './locale.ts';

export interface ServicePattern extends BaseEntity<'service'> {
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  /** As printed by the operator, e.g. `新快速`, `特急`, `普通`. */
  serviceCategory: string;
  stopStationIds: SkId<'station'>[];
  throughServiceId: SkId<'through'> | null;
}

export type TripDirection = 'inbound' | 'outbound' | 'clockwise' | 'counterclockwise' | 'unknown';

export interface Trip extends BaseEntity<'trip'> {
  servicePatternId: SkId<'service'>;
  /** Official train number only. Internal trip IDs must never be shown as one. */
  trainNumber: string | null;
  direction: TripDirection;
  calendarId: string;
  vehicleSeriesId?: SkId<'vehicle'> | null;
  schedulePrecision: SchedulePrecision;
}

export interface StopTime extends BaseEntity<'stoptime'> {
  tripId: SkId<'trip'>;
  stationId: SkId<'station'>;
  sequence: number;
  /** `HH:MM[:SS]`; hours may exceed 23 for after-midnight service (e.g. `24:35`). */
  arrivalTime: string | null;
  departureTime: string | null;
  platformNumber: string | null;
}

export interface ThroughService extends BaseEntity<'through'> {
  boundaryStationId: SkId<'station'>;
  fromRailLineId: SkId<'line'>;
  toRailLineId: SkId<'line'>;
  operatorIds: SkId<'operator'>[];
  serviceDescription: string;
  notes: string | null;
}

export type OperationalStatusKind = 'normal' | 'delayed' | 'suspended' | 'unavailable';

/** R-07 honest degradation: without a licensed feed the status is always `'unavailable'`. */
export interface OperationalStatus {
  lineId: SkId<'line'>;
  status: OperationalStatusKind;
  message: LocalizedNames | null;
  observedAt: string | null;
  sourceId: string | null;
  dataNature: DataNature;
}

export interface ServiceGraph {
  servicePatterns: ServicePattern[];
  trips: Trip[];
  stopTimes: StopTime[];
  throughServices: ThroughService[];
}

/** The only status allowed when no authorised real-time source exists. */
export function unavailableOperationalStatus(lineId: SkId<'line'>): OperationalStatus {
  return {
    lineId,
    status: 'unavailable',
    message: null,
    observedAt: null,
    sourceId: null,
    dataNature: 'unknown',
  };
}

const SERVICE_TIME_PATTERN = /^(\d{2}):([0-5]\d)(?::([0-5]\d))?$/;

/** Hours 00–47 cover service days that run past midnight. */
const MAX_SERVICE_HOUR = 47;

/** Minutes after service-day start for `HH:MM[:SS]` (seconds floored); `null` if invalid. */
export function serviceTimeToMinutes(value: string): number | null {
  const match = SERVICE_TIME_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > MAX_SERVICE_HOUR) {
    return null;
  }
  return hours * 60 + minutes;
}

export function isServiceTime(value: unknown): value is string {
  return typeof value === 'string' && serviceTimeToMinutes(value) !== null;
}
