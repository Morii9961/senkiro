/**
 * The shared timetable record — the contract between this prototype and
 * whoever produces the timetable.
 *
 * The timetable itself is built elsewhere. Nothing in this folder invents an
 * operating fact: this is the shape of the data, its validation, and adapters
 * that read a CSV or JSON export. The field names are the agreed ones and are
 * kept in snake_case so that a record can be compared with the file it came
 * from at a glance.
 *
 * Pure TypeScript, no React / three.js imports.
 */

/**
 * How the vehicle type of a trip is known.
 * - verified       : a reliable source confirms that this trip, or every trip
 *                    of this line, runs with this type.
 * - representative : a usual type of the line, shown for illustration; the
 *                    type of this particular trip was not confirmed.
 * - unknown        : nothing reliable; a neutral generic train is drawn.
 */
export type VehicleAssignmentStatus = 'verified' | 'representative' | 'unknown';

export const VEHICLE_ASSIGNMENT_STATUSES: readonly VehicleAssignmentStatus[] = ['verified', 'representative', 'unknown'];

/** One stop of one trip at one station. Missing values are null — never guessed. */
export interface TimetableRecord {
  /** Canonical station id, see ./registry.ts — each operator's Shinjuku is its own station. */
  station_id: string;
  operator_id: string;
  line_id: string;
  /** `<station_id>:<track number as printed>`. Namespaced so "1" of one operator is not "1" of another. */
  platform_id: string | null;
  direction_id: string | null;
  /** e.g. "weekday", "saturday", "holiday", "saturday-holiday". Kept as the producer writes it. */
  service_date_type: string;
  /** May be an internal id. It is never displayed as a train number. */
  trip_id: string;
  /** Only when a source gives one. */
  train_number: string | null;
  /** Japan Standard Time, "HH:MM" or "HH:MM:SS". Hours may run past 24 for trips after midnight. */
  arrival_time_local: string | null;
  departure_time_local: string | null;
  destination_text: string | null;
  service_class: string | null;
  vehicle_series: string | null;
  formation_length: number | null;
  vehicle_assignment_status: VehicleAssignmentStatus;
  source_id: string;
  /** ISO dates (YYYY-MM-DD) of the timetable revision this record belongs to. */
  valid_from: string | null;
  valid_until: string | null;
  remarks: string | null;
}

export const TIMETABLE_FIELDS = [
  'station_id', 'operator_id', 'line_id', 'platform_id', 'direction_id', 'service_date_type', 'trip_id', 'train_number',
  'arrival_time_local', 'departure_time_local', 'destination_text', 'service_class', 'vehicle_series', 'formation_length',
  'vehicle_assignment_status', 'source_id', 'valid_from', 'valid_until', 'remarks',
] as const satisfies readonly (keyof TimetableRecord)[];

/** Where a set of records comes from. */
export interface TimetableSource {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  /** ISO date or date-time the data was retrieved or generated. */
  retrievedAt: string | null;
  license: string | null;
  notes: string | null;
}

/**
 * - demo-fixture : made up by this prototype to exercise the animation. Every
 *                  source id starts with "demo:" and the interface says so.
 * - timetable    : a real timetable handed over by its producer.
 * The two are never mixed in one dataset (see validateDataset).
 */
export type TimetableKind = 'demo-fixture' | 'timetable';

export interface TimetableDataset {
  kind: TimetableKind;
  /** Free text shown next to the simulation clock. */
  label: string;
  generatedAt: string | null;
  sources: TimetableSource[];
  records: TimetableRecord[];
}

/**
 * State of a train on screen. Only `scheduled` is produced today: positions
 * are computed from the timetable. The others are reserved for a live feed
 * and must not be shown without one.
 */
export type TrainLiveState = 'scheduled' | 'live_adjusted' | 'live_position' | 'stale' | 'cancelled' | 'suspended';

export type IssueSeverity = 'error' | 'warning';

export interface TimetableIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Index of the record in the dataset, or null for a dataset-level issue. */
  index: number | null;
  trip_id: string | null;
}
