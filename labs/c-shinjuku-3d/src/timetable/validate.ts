/**
 * Validation of timetable records. It reports; it never repairs. A record
 * with an error is left out of the simulation, a warning is only shown.
 */
import { lineEntry, stationEntry } from './registry';
import { parseServiceTime } from './time';
import { VEHICLE_ASSIGNMENT_STATUSES, type TimetableDataset, type TimetableIssue, type TimetableRecord } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Longest train at these stations is well below this; anything above is a data error. */
const MAX_FORMATION = 20;

const DEMO_PREFIX = 'demo:';
export const isDemoId = (id: string): boolean => id.startsWith(DEMO_PREFIX);

export function validateRecord(r: TimetableRecord, index: number): TimetableIssue[] {
  const issues: TimetableIssue[] = [];
  const add = (severity: TimetableIssue['severity'], code: string, message: string) =>
    issues.push({ severity, code, message, index, trip_id: r.trip_id || null });

  for (const f of ['station_id', 'operator_id', 'line_id', 'service_date_type', 'trip_id', 'source_id'] as const) {
    if (typeof r[f] !== 'string' || r[f].trim() === '') add('error', 'missing-field', `${f} is required`);
  }

  const station = r.station_id ? stationEntry(r.station_id) : null;
  if (r.station_id && !station) add('error', 'unknown-station', `station_id "${r.station_id}" is not in the station registry`);
  if (station && r.operator_id && station.operator_id !== r.operator_id) {
    add('error', 'operator-mismatch', `station ${r.station_id} belongs to ${station.operator_id}, not ${r.operator_id}`);
  }

  const line = r.line_id ? lineEntry(r.line_id) : null;
  if (r.line_id && !line) add('warning', 'unknown-line', `line_id "${r.line_id}" is not in the line registry; the train is drawn without a line colour`);
  if (line && station && !station.line_ids.includes(line.line_id)) {
    add('warning', 'line-not-at-station', `${line.line_id} is not listed for ${station.station_id}`);
  }

  if (r.platform_id != null && station && !r.platform_id.startsWith(`${station.station_id}:`)) {
    add('warning', 'platform-not-namespaced', `platform_id "${r.platform_id}" should be "${station.station_id}:<track>"`);
  }
  if (r.platform_id == null) add('warning', 'no-platform', 'no platform_id: the train cannot be placed on a track and is not drawn');

  const arr = parseServiceTime(r.arrival_time_local);
  const dep = parseServiceTime(r.departure_time_local);
  if (r.arrival_time_local != null && arr == null) add('error', 'bad-time', `arrival_time_local "${r.arrival_time_local}" is not HH:MM[:SS]`);
  if (r.departure_time_local != null && dep == null) add('error', 'bad-time', `departure_time_local "${r.departure_time_local}" is not HH:MM[:SS]`);
  if (r.arrival_time_local == null && r.departure_time_local == null) add('error', 'no-time', 'neither an arrival nor a departure time');
  if (arr != null && dep != null && dep < arr) add('error', 'departs-before-arrival', `departure ${r.departure_time_local} is before arrival ${r.arrival_time_local}`);

  if (!VEHICLE_ASSIGNMENT_STATUSES.includes(r.vehicle_assignment_status)) {
    add('error', 'bad-vehicle-status', `vehicle_assignment_status "${String(r.vehicle_assignment_status)}" must be verified, representative or unknown`);
  } else if (r.vehicle_series == null && r.vehicle_assignment_status !== 'unknown') {
    add('error', 'vehicle-status-without-series', `vehicle_assignment_status is "${r.vehicle_assignment_status}" but vehicle_series is empty`);
  } else if (r.vehicle_series != null && r.vehicle_assignment_status === 'unknown') {
    add('warning', 'series-marked-unknown', `vehicle_series "${r.vehicle_series}" is given but marked unknown; a generic train is drawn`);
  }

  if (r.formation_length != null && (!Number.isInteger(r.formation_length) || r.formation_length < 1 || r.formation_length > MAX_FORMATION)) {
    add('error', 'bad-formation', `formation_length ${r.formation_length} is not a whole number of cars between 1 and ${MAX_FORMATION}`);
  }

  if (r.train_number != null && r.train_number.trim() === '') add('error', 'empty-train-number', 'train_number is empty; use null when no source gives one');
  if (r.train_number != null && r.train_number === r.trip_id) {
    add('warning', 'train-number-equals-trip-id', 'train_number repeats trip_id; an internal trip id must not stand in for a train number');
  }
  if (r.train_number != null && r.source_id && isDemoId(r.source_id)) add('error', 'demo-train-number', 'a demo record must not carry a train_number');

  for (const f of ['valid_from', 'valid_until'] as const) {
    const v = r[f];
    if (v != null && (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v)))) add('error', 'bad-date', `${f} "${v}" is not YYYY-MM-DD`);
  }
  if (r.valid_from && r.valid_until && r.valid_until < r.valid_from) add('error', 'validity-reversed', 'valid_until is before valid_from');

  return issues;
}

export interface ValidationResult {
  issues: TimetableIssue[];
  /** Records without an error, in their original order. */
  usable: TimetableRecord[];
  errorCount: number;
  warningCount: number;
}

/** Validates every record and the dataset as a whole. */
export function validateDataset(dataset: TimetableDataset): ValidationResult {
  const issues: TimetableIssue[] = [];
  const bad = new Set<number>();
  const push = (list: TimetableIssue[]) => {
    for (const i of list) {
      issues.push(i);
      if (i.severity === 'error' && i.index != null) bad.add(i.index);
    }
  };

  const sourceIds = new Set(dataset.sources.map((s) => s.id));
  const seen = new Map<string, number>();
  const dwell: Record<string, { from: number; to: number; index: number; trip: string }[]> = {};

  dataset.records.forEach((r, index) => {
    push(validateRecord(r, index));
    const own: TimetableIssue[] = [];
    const add = (severity: TimetableIssue['severity'], code: string, message: string) => own.push({ severity, code, message, index, trip_id: r.trip_id || null });

    if (r.source_id && !sourceIds.has(r.source_id)) add('error', 'unknown-source', `source_id "${r.source_id}" is not among the dataset's sources`);
    // A demo fixture stays a demo fixture: it is never topped up with real records, nor the reverse.
    if (r.source_id && dataset.kind === 'demo-fixture' && !isDemoId(r.source_id)) add('error', 'mixed-dataset', 'a demo fixture may only contain records of a "demo:" source');
    if (r.source_id && dataset.kind === 'timetable' && isDemoId(r.source_id)) add('error', 'mixed-dataset', 'a timetable must not contain demo records');
    if (dataset.kind === 'demo-fixture' && r.trip_id && !isDemoId(r.trip_id)) add('error', 'demo-trip-id', 'trip ids of a demo fixture start with "demo:"');

    const key = `${r.station_id}|${r.service_date_type}|${r.trip_id}`;
    const first = seen.get(key);
    if (first != null) add('error', 'duplicate-trip', `the same trip_id appears twice at this station for ${r.service_date_type} (first at record ${first})`);
    else seen.set(key, index);

    // Two trains on one track at the same moment.
    const arr = parseServiceTime(r.arrival_time_local);
    const dep = parseServiceTime(r.departure_time_local);
    if (r.platform_id && (arr != null || dep != null)) {
      const from = arr ?? dep!;
      const to = dep ?? arr!;
      (dwell[`${r.platform_id}|${r.service_date_type}`] ??= []).push({ from, to, index, trip: r.trip_id });
    }
    push(own);
  });

  for (const list of Object.values(dwell)) {
    list.sort((a, b) => a.from - b.from);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.from < prev.to) {
        issues.push({ severity: 'warning', code: 'track-conflict', index: cur.index, trip_id: cur.trip, message: `stands on the same track while ${prev.trip} is still there` });
      }
    }
  }

  if (dataset.kind === 'demo-fixture') {
    for (const s of dataset.sources) {
      if (!isDemoId(s.id)) issues.push({ severity: 'error', code: 'mixed-dataset', index: null, trip_id: null, message: `source "${s.id}" of a demo fixture must start with "demo:"` });
    }
  }

  return {
    issues,
    usable: dataset.records.filter((_, i) => !bad.has(i)),
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
  };
}
