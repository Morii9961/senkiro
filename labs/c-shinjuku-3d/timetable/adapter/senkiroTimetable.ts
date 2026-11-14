/**
 * SENKIRO Greater Shinjuku timetable — types and query helpers for the V3 front end.
 *
 * Pure TypeScript, no imports, no DOM, no dependency on the browser time zone:
 * every clock time is Asia/Tokyo business-day time, converted with fixed +09:00
 * arithmetic (Japan has no DST). Only erasable TS syntax is used, so Node ≥ 23.6
 * can run it directly and Vite/tsc can import it unchanged.
 *
 * Contract fields (names fixed with the Fable 5.2 V3 project):
 *   station_id operator_id line_id platform_id direction_id service_date_type trip_id
 *   train_number arrival_time_local departure_time_local destination_text service_class
 *   vehicle_series formation_length vehicle_assignment_status source_id valid_from valid_until remarks
 */

export type ServiceDateType = 'weekday' | 'saturday_holiday';
export type VehicleAssignmentStatus = 'verified' | 'representative' | 'unknown';
export type DataStatus = 'official' | 'legacy_unverified';
export type ArrivalDepartureType = 'arrival_departure' | 'departure_only' | 'arrival_only';
export type ServiceClassUnified = 'local' | 'rapid' | 'express' | 'limited_express' | 'liner' | 'other';
export type PlatformVerificationStatus = 'verified' | 'legacy_unverified' | 'unknown';

export interface TimetableEvent {
  // ---- core contract
  station_id: string;
  operator_id: string;
  line_id: string;
  platform_id: string | null;
  direction_id: string | null;
  service_date_type: ServiceDateType;
  trip_id: string;
  train_number: string | null;
  arrival_time_local: string | null; // "HH:MM", hours may be ≥ 24
  departure_time_local: string | null;
  destination_text: string;
  service_class: string | null; // operator wording, e.g. 各駅停車 / 急行 / 特急
  vehicle_series: string | null;
  formation_length: number | null;
  vehicle_assignment_status: VehicleAssignmentStatus;
  source_id: string;
  valid_from: string | null;
  valid_until: string | null;
  remarks: string | null;
  // ---- auxiliary
  stop_event_id: string;
  station_complex_id: string | null;
  service_calendar_id: string;
  trip_id_is_synthetic: boolean;
  original_trip_id: string | null;
  arrival_time_source: string | null;
  departure_time_source: string | null;
  arrival_seconds: number | null; // seconds since business-day 00:00
  departure_seconds: number | null;
  time_precision: 'minute' | 'second';
  arrival_departure_type: ArrivalDepartureType;
  destination_text_zh: string | null;
  origin_text: string | null;
  service_class_unified: ServiceClassUnified;
  is_origin_at_station: boolean | null;
  is_terminal_at_station: boolean | null;
  through_service_text: string | null;
  platform_verification_status: PlatformVerificationStatus;
  route_pattern_id: string | null;
  original_station_code: string | null;
  original_line_code: string | null;
  vehicle_source_id: string | null;
  formation_source_id: string | null;
  source_confidence: 'high' | 'medium' | 'low';
  data_status: DataStatus;
  last_verified_at: string | null;
  // present only in the local legacy layer
  legacy_duplicate_count?: number | null;
  legacy_csv_lines?: string | null;
  legacy_match_status?: string | null;
  legacy_coupled_group?: string | null;
}

export interface Trip {
  trip_id: string; trip_id_is_synthetic: boolean; original_trip_id: string | null; train_number: string | null;
  operator_id: string; line_id: string; direction_id: string | null; service_date_type: ServiceDateType; service_calendar_id: string;
  service_class: string | null; service_class_unified: ServiceClassUnified; origin_text: string | null; destination_text: string;
  through_from_text: string | null; through_to_text: string | null; source_id: string; valid_from: string | null; valid_until: string | null; data_status: DataStatus;
}
export interface TripLink { trip_id: string; train_number: string | null; from_station_id: string; to_station_id: string; from_time_local: string; to_time_local: string; elapsed_minutes: number; match_status: string; source_id: string }
export interface TripVehicleAssignment { trip_id: string; train_number: string | null; vehicle_series: string | null; formation_length: number | null; candidate_vehicle_ids: string; owner_operator_id: string | null; vehicle_assignment_status: VehicleAssignmentStatus; vehicle_source_id: string | null; formation_source_id: string | null; valid_from: string | null; valid_until: string | null; basis: string }
export interface VehicleConfig { vehicle_id: string; operator_id: string; vehicle_series: string; formation_length: number; service_lines: string[]; valid_from: string | null; valid_until: string | null; model_asset_id: string | null; source_id: string; verification_status: VehicleAssignmentStatus; remarks: string | null }
export interface Station { station_id: string; operator_id: string; station_complex_id: string | null; name_ja: string; name_en: string; name_zh: string | null; line_ids: string[]; station_code: string | null; station_code_status: string; model_station_ref: string | null; remarks: string | null }
export interface Platform { platform_id: string; station_id: string; track_label: string; model_platform_ref: string | null; physical_group: string | null; verification_status: string; remarks: string | null }
export interface CalendarDate { date: string; weekday_ja: string; national_holiday_name: string | null; resolved_service_date_type: ServiceDateType; special_operation_flag: string | null }
export interface SourceRecord { source_id: string; title: string; publisher: string; url: string | null; license: string; redistribution: string; attribution_text: string | null; [k: string]: unknown }

export interface SenkiroTimetable {
  schema: 'senkiro-timetable';
  schema_version: string;
  generated_at: string;
  as_of_date: string;
  timezone: 'Asia/Tokyo';
  layers: string[];
  attribution: string[];
  operators: { operator_id: string; name_ja: string; name_en: string; name_zh: string }[];
  lines: { line_id: string; operator_id: string; name_ja: string; name_en: string; name_zh: string; line_code: string }[];
  stations: Station[];
  directions: { direction_id: string; line_id: string; label_ja: string; odpt_direction: string | null }[];
  platforms: Platform[];
  calendars: { service_calendar_id: string; operator_id: string; service_date_type: ServiceDateType; rule: string }[];
  calendar_dates: CalendarDate[];
  sources: SourceRecord[];
  vehicle_catalog: VehicleConfig[];
  trips: Trip[];
  events: TimetableEvent[];
  trip_links: TripLink[];
  trip_vehicle_assignments: TripVehicleAssignment[];
}

export interface TimetableIndex {
  data: SenkiroTimetable;
  byStation: Map<string, TimetableEvent[]>;
  byTrip: Map<string, TimetableEvent[]>;
  tripById: Map<string, Trip>;
  assignmentByTrip: Map<string, TripVehicleAssignment>;
  vehicleById: Map<string, VehicleConfig>;
  calendarByDate: Map<string, CalendarDate>;
  stationById: Map<string, Station>;
}

const JST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_S = 86400;

/** Seconds of the event used for ordering / windows: departure, else arrival. */
export const eventSeconds = (e: TimetableEvent): number => (e.departure_seconds ?? e.arrival_seconds) as number;

/**
 * Merge an optional local layer (e.g. data/shinjuku/local/senkiro_timetable.full.json)
 * over the committed one. Events/trips with the same id in the later layer win.
 */
export function mergeLayers(base: SenkiroTimetable, ...extra: SenkiroTimetable[]): SenkiroTimetable {
  const out: SenkiroTimetable = { ...base, layers: [...base.layers] };
  for (const x of extra) {
    const ev = new Map(out.events.map((e) => [e.stop_event_id, e]));
    for (const e of x.events) ev.set(e.stop_event_id, e);
    const tr = new Map(out.trips.map((t) => [t.trip_id, t]));
    for (const t of x.trips) tr.set(t.trip_id, t);
    out.events = [...ev.values()];
    out.trips = [...tr.values()];
    out.layers = [...new Set([...out.layers, ...x.layers])];
  }
  return out;
}

export function indexTimetable(data: SenkiroTimetable): TimetableIndex {
  const byStation = new Map<string, TimetableEvent[]>();
  const byTrip = new Map<string, TimetableEvent[]>();
  for (const e of data.events) {
    (byStation.get(e.station_id) ?? byStation.set(e.station_id, []).get(e.station_id)!).push(e);
    (byTrip.get(e.trip_id) ?? byTrip.set(e.trip_id, []).get(e.trip_id)!).push(e);
  }
  for (const list of byStation.values()) list.sort((a, b) => eventSeconds(a) - eventSeconds(b));
  for (const list of byTrip.values()) list.sort((a, b) => eventSeconds(a) - eventSeconds(b));
  return {
    data, byStation, byTrip,
    tripById: new Map(data.trips.map((t) => [t.trip_id, t])),
    assignmentByTrip: new Map(data.trip_vehicle_assignments.map((a) => [a.trip_id, a])),
    vehicleById: new Map(data.vehicle_catalog.map((v) => [v.vehicle_id, v])),
    calendarByDate: new Map(data.calendar_dates.map((c) => [c.date, c])),
    stationById: new Map(data.stations.map((s) => [s.station_id, s])),
  };
}

// ------------------------------------------------------------------ dates

const isoDate = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_S * 1000);
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export interface DayTypeResolution { date: string; service_date_type: ServiceDateType; holiday: string | null; basis: 'calendar_dates' | 'weekday_rule_no_holiday_data'; special_operation_flag: string | null }

/**
 * Day type of a service (business) date. Inside the published calendar_dates range
 * the national-holiday list is applied; outside it only Sat/Sun are known and the
 * result says so. All operators in this dataset use the weekday / Sat-Hol split.
 */
export function resolveServiceDateType(idx: TimetableIndex, serviceDate: string): DayTypeResolution {
  const c = idx.calendarByDate.get(serviceDate);
  if (c) return { date: serviceDate, service_date_type: c.resolved_service_date_type, holiday: c.national_holiday_name, basis: 'calendar_dates', special_operation_flag: c.special_operation_flag };
  const [y, m, d] = serviceDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date: serviceDate, service_date_type: dow === 0 || dow === 6 ? 'saturday_holiday' : 'weekday', holiday: null, basis: 'weekday_rule_no_holiday_data', special_operation_flag: null };
}

/** Business date + business seconds → absolute instant as "YYYY-MM-DDTHH:MM:SS+09:00". */
export function toInstant(serviceDate: string, seconds: number): string {
  const [y, m, d] = serviceDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + seconds * 1000); // treated as JST wall clock
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+09:00`;
}

/** Any ISO instant (with offset or Z) → JST calendar date and seconds since JST midnight. */
export function fromInstant(iso: string): { date: string; seconds: number } {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid instant: ${iso}`);
  const t = new Date(ms + JST_OFFSET_MS);
  return { date: isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()), seconds: t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds() };
}

// ------------------------------------------------------------------ queries

export interface ResolvedEvent extends TimetableEvent { service_date: string; arrival_instant: string | null; departure_instant: string | null }
const resolve = (e: TimetableEvent, serviceDate: string): ResolvedEvent => ({
  ...e, service_date: serviceDate,
  arrival_instant: e.arrival_seconds === null ? null : toInstant(serviceDate, e.arrival_seconds),
  departure_instant: e.departure_seconds === null ? null : toInstant(serviceDate, e.departure_seconds),
});

export interface QueryOptions { lineId?: string; directionId?: string; includeLegacy?: boolean }
const keep = (e: TimetableEvent, o: QueryOptions) =>
  (o.includeLegacy !== false || e.data_status === 'official') && (!o.lineId || e.line_id === o.lineId) && (!o.directionId || e.direction_id === o.directionId);

/** Departures (events with a departure time) at a station on one business date, in time order. */
export function getStationDepartures(idx: TimetableIndex, stationId: string, serviceDate: string, opts: QueryOptions = {}): ResolvedEvent[] {
  const dt = resolveServiceDateType(idx, serviceDate).service_date_type;
  return (idx.byStation.get(stationId) ?? [])
    .filter((e) => e.service_date_type === dt && e.departure_seconds !== null && keep(e, opts))
    .map((e) => resolve(e, serviceDate));
}

export interface TimeWindow { serviceDate: string; fromSeconds: number; toSeconds: number }
/** Arrivals and departures on one platform within a business-day window (seconds may exceed 86400). */
export function getPlatformEvents(idx: TimetableIndex, stationId: string, platformId: string, w: TimeWindow, opts: QueryOptions = {}): ResolvedEvent[] {
  const dt = resolveServiceDateType(idx, w.serviceDate).service_date_type;
  return (idx.byStation.get(stationId) ?? [])
    .filter((e) => e.platform_id === platformId && e.service_date_type === dt && keep(e, opts))
    .filter((e) => [e.arrival_seconds, e.departure_seconds].some((s) => s !== null && s >= w.fromSeconds && s <= w.toSeconds))
    .map((e) => resolve(e, w.serviceDate));
}

/** One trip with its events at the covered stations and cross-station links. */
export function getTrainByTripId(idx: TimetableIndex, tripId: string) {
  const trip = idx.tripById.get(tripId) ?? null;
  if (!trip) return null;
  return { trip, events: idx.byTrip.get(tripId) ?? [], links: idx.data.trip_links.filter((l) => l.trip_id === tripId) };
}

export interface VehicleAnswer { trip_id: string; status: VehicleAssignmentStatus; vehicle_series: string | null; formation_length: number | null; candidates: VehicleConfig[]; basis: string | null; source_id: string | null; isActualForThisTrain: boolean }
/**
 * Vehicle information for a trip. `isActualForThisTrain` is true ONLY for status
 * 'verified'; UI must not present 'representative' as the car actually running.
 */
export function getVehicleAssignment(idx: TimetableIndex, tripId: string): VehicleAnswer {
  const a = idx.assignmentByTrip.get(tripId);
  if (!a) return { trip_id: tripId, status: 'unknown', vehicle_series: null, formation_length: null, candidates: [], basis: null, source_id: null, isActualForThisTrain: false };
  const candidates = a.candidate_vehicle_ids.split(';').filter(Boolean).map((id) => idx.vehicleById.get(id)).filter((v): v is VehicleConfig => !!v);
  return { trip_id: tripId, status: a.vehicle_assignment_status, vehicle_series: a.vehicle_series, formation_length: a.formation_length, candidates, basis: a.basis, source_id: a.vehicle_source_id, isActualForThisTrain: a.vehicle_assignment_status === 'verified' };
}

/**
 * Events at the given stations within ±window of an absolute instant. Handles
 * midnight: at 00:20 JST on day D both business day D (00:20) and business day
 * D-1 (24:20) are searched, each with its own day type.
 */
export function getEventsAroundTime(idx: TimetableIndex, instantIso: string, stationIds: string[], opts: QueryOptions & { beforeMinutes?: number; afterMinutes?: number } = {}): ResolvedEvent[] {
  const { date, seconds } = fromInstant(instantIso);
  const before = (opts.beforeMinutes ?? 10) * 60; const after = (opts.afterMinutes ?? 10) * 60;
  const out: ResolvedEvent[] = [];
  for (const [serviceDate, s] of [[date, seconds], [addDays(date, -1), seconds + DAY_S]] as [string, number][]) {
    const dt = resolveServiceDateType(idx, serviceDate).service_date_type;
    for (const sid of stationIds) for (const e of idx.byStation.get(sid) ?? []) {
      if (e.service_date_type !== dt || !keep(e, opts)) continue;
      if ([e.arrival_seconds, e.departure_seconds].some((x) => x !== null && x >= s - before && x <= s + after)) out.push(resolve(e, serviceDate));
    }
  }
  return out.sort((a, b) => (a.departure_instant ?? a.arrival_instant)!.localeCompare((b.departure_instant ?? b.arrival_instant)!));
}

/** Short human label for UI badges; never claims more certainty than the data has. */
export function vehicleLabel(e: Pick<TimetableEvent, 'vehicle_series' | 'formation_length' | 'vehicle_assignment_status'>): string {
  if (e.vehicle_assignment_status === 'unknown') return '車両: 未確認';
  const body = [e.vehicle_series, e.formation_length ? `${e.formation_length}両` : null].filter(Boolean).join(' ');
  return e.vehicle_assignment_status === 'verified' ? body : `${body || '車両不明'}（代表例・本列車の実車両ではない）`;
}
