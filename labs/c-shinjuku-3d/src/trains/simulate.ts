/**
 * Timetable-driven train simulation. Pure functions: timetable records and a
 * clock go in, the trains to draw come out.
 *
 * This is NOT a train position feed. A train's place is computed from the
 * scheduled arrival and departure times of the timetable and nothing else:
 * no delays, no signalling, no randomness. What the timetable does not say is
 * marked as assumed (`arrivalAssumed`) or left out.
 */
import type { StationModel } from '../domain/types';
import { lineEntry, resolveTrack, stationEntry } from '../timetable/registry';
import { parseServiceTime, serviceDateTypeApplies, type CalendarDayType } from '../timetable/time';
import type { TimetableRecord, TrainLiveState } from '../timetable/types';
import { physicalTrackKey, trackLine, type TrackLine } from './trackGeometry';
import { trackRun, type TrackRun } from './trackRuns';
import { resolveVehicle, type ResolvedVehicle } from './vehicles';

// --- display constants: choices of this prototype, not operating data -------------------

/** Seconds a train takes to run in from the end of the drawn track, and to run out again. */
export const APPROACH_SECONDS = 40;
export const DEPART_SECONDS = 36;
/** Dwell drawn before the departure when the timetable gives no arrival time. */
export const ASSUMED_DWELL_SECONDS = 30;
/**
 * A timetable printed to the minute gives the same minute for arrival and departure when the stop is
 * shorter than a minute. Such a stop is drawn this long, starting at the printed minute — inside the
 * minute both times name — and the card says the dwell is schematic.
 */
export const SHORT_STOP_SECONDS = 25;
/** How long a terminating train (no departure time) stays before it is taken off the display. */
export const TERMINATING_HOLD_SECONDS = 60;
const DOOR_MOVE_SECONDS = 3;
const DOOR_OPEN_AFTER = 1.5;
const DOOR_CLOSED_BEFORE = 4;
/** On a through track the next train may start to run in this long after the one before left. */
const FOLLOW_GAP_SECONDS = 14;
const MIN_APPROACH_SECONDS = 12;

/** Car length in schematic units when the platform has room: keeps a car about 6.8 times as long as it is wide. */
export const NOMINAL_CAR_LENGTH = 3.4;
/** Length drawn for a train whose number of cars is unknown, as a share of the platform. */
const UNKNOWN_LENGTH_SHARE = 0.72;
const PLATFORM_MARGIN = 0.8;

export type TrainPhase = 'approaching' | 'braking' | 'doors-opening' | 'doors-open' | 'doors-closing' | 'stopped' | 'departing';

export interface TrainPlan {
  /** Stable key: station + day type + trip. */
  id: string;
  record: TimetableRecord;
  platformAreaId: string;
  trackNumber: string;
  /** The pair of rails it stands on; two platform numbers can be the two faces of one track. */
  physicalTrack: string;
  line: TrackLine;
  run: TrackRun | null;
  /** RailLine id of the model, for colour and filters; null when the line is not in the registry. */
  modelLineId: string | null;
  vehicle: ResolvedVehicle;
  /** Seconds since the start of the service day. */
  arrive: number;
  /** null: the train terminates here and the timetable gives no departure. */
  depart: number | null;
  /** True when the timetable had no arrival time and the dwell is a display assumption. */
  arrivalAssumed: boolean;
  /** True when arrival and departure are the same printed minute and the stop is drawn SHORT_STOP_SECONDS long. */
  shortStopAssumed: boolean;
  /** When the train enters and leaves the display. */
  enter: number;
  leave: number;
  approachSeconds: number;
  /** Drawn length of the train and of one car, schematic units. */
  length: number;
  carLength: number | null;
  /** Coordinate of the train's centre when it stands at the platform. */
  stopAt: number;
  /** Distance between the stop position and the point where the train is fully past the end of the drawn track. */
  runDistance: number;
}

export interface TrainState {
  plan: TrainPlan;
  phase: TrainPhase;
  /** Coordinate of the train's centre along the track axis. */
  along: number;
  /** +1 / -1: direction of travel along the axis; 0 when the direction is not established. */
  heading: 1 | -1 | 0;
  /** 0 closed … 1 open. */
  doors: number;
  moving: boolean;
  liveState: TrainLiveState;
}

export interface UnplacedRecord {
  record: TimetableRecord;
  reason: 'station-not-in-model' | 'no-platform' | 'track-not-in-model' | 'track-side-unknown' | 'no-time';
}

export interface PlanOptions {
  /** Only records whose service_date_type applies on this kind of day. null = all. */
  dayType: CalendarDayType | null;
}

export function trainLength(line: TrackLine, cars: number | null, carLengthM = 20): { length: number; carLength: number | null } {
  const room = Math.max(1, line.hi - line.lo - PLATFORM_MARGIN * 2);
  if (cars == null) return { length: Math.min(room * UNKNOWN_LENGTH_SHARE, NOMINAL_CAR_LENGTH * 8), carLength: null };
  // shorter cars (18 m, 16.5 m) are drawn shorter
  const carLength = Math.min((NOMINAL_CAR_LENGTH * carLengthM) / 20, room / cars);
  return { length: carLength * cars, carLength };
}

/** Turns timetable records into drawable plans, one per record that can be placed on a track of the model. */
export function buildTrainPlans(model: StationModel, records: TimetableRecord[], opts: PlanOptions): { plans: TrainPlan[]; unplaced: UnplacedRecord[] } {
  const plans: TrainPlan[] = [];
  const unplaced: UnplacedRecord[] = [];

  for (const record of records) {
    if (opts.dayType && !serviceDateTypeApplies(record.service_date_type, opts.dayType)) continue;
    if (!record.platform_id) {
      unplaced.push({ record, reason: 'no-platform' });
      continue;
    }
    const track = resolveTrack(model, record.station_id, record.platform_id);
    if (!track) {
      unplaced.push({ record, reason: stationInModel(model, record.station_id) ? 'track-not-in-model' : 'station-not-in-model' });
      continue;
    }
    const line = trackLine(track.platform, track.trackNumber);
    if (!line) {
      unplaced.push({ record, reason: 'track-side-unknown' });
      continue;
    }
    const arr = parseServiceTime(record.arrival_time_local);
    const dep = parseServiceTime(record.departure_time_local);
    if (arr == null && dep == null) {
      unplaced.push({ record, reason: 'no-time' });
      continue;
    }
    const arrive = arr ?? dep! - ASSUMED_DWELL_SECONDS;
    const minuteOnly = (t: string | null) => t != null && /^\d{1,2}:\d{2}$/.test(t.trim());
    const shortStop = arr != null && dep === arr && minuteOnly(record.arrival_time_local) && minuteOnly(record.departure_time_local);
    const depart = shortStop ? arr + SHORT_STOP_SECONDS : dep;
    const vehicle = resolveVehicle(record);
    const { length, carLength } = trainLength(line, vehicle.cars, vehicle.spec.carLengthM);
    const run = runOfTrip(record, trackRun(track.platform.id, track.trackNumber), line.axis);
    const stopAt = (line.lo + line.hi) / 2;
    const moves = run?.departs != null;
    plans.push({
      id: `${record.station_id}|${record.service_date_type}|${record.trip_id}`,
      record,
      platformAreaId: track.platform.id,
      trackNumber: track.trackNumber,
      physicalTrack: physicalTrackKey(line),
      line,
      run,
      modelLineId: lineEntry(record.line_id)?.modelLineIds[0] ?? null,
      vehicle,
      arrive,
      depart,
      arrivalAssumed: arr == null,
      shortStopAssumed: shortStop,
      enter: moves ? arrive - APPROACH_SECONDS : arrive,
      leave: depart == null ? arrive + TERMINATING_HOLD_SECONDS : moves ? depart + DEPART_SECONDS : depart,
      approachSeconds: APPROACH_SECONDS,
      length,
      carLength,
      stopAt,
      runDistance: (line.clipHi - line.clipLo) / 2 + length / 2 + 0.2,
    });
  }

  mergeComplementaryPlans(plans);

  // One track holds one train at a time: a train does not start to run in while the one before is still leaving.
  const byTrack = new Map<string, TrainPlan[]>();
  for (const p of plans) {
    const key = `${p.physicalTrack}|${p.record.service_date_type}`;
    let list = byTrack.get(key);
    if (!list) byTrack.set(key, (list = []));
    list.push(p);
  }
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.arrive - b.arrive);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.run?.departs == null || prev.depart == null) continue;
      const clearAt = prev.depart + (cur.run.kind === 'terminal' ? DEPART_SECONDS : FOLLOW_GAP_SECONDS);
      if (cur.enter < clearAt) {
        cur.approachSeconds = Math.max(MIN_APPROACH_SECONDS, cur.arrive - clearAt);
        cur.enter = cur.arrive - cur.approachSeconds;
      }
    }
  }

  plans.sort((a, b) => a.enter - b.enter);
  return { plans, unplaced };
}

/**
 * A JR Shinjuku record may name its own direction of travel ('southbound' / 'northbound', read from the
 * train's next or previous stop). On a through track that decides the way the train runs, also where the
 * track table leaves it open (5・6: limited expresses of both directions) or names the more frequent
 * direction only. JR platforms lie north–south in the model: +1 is south.
 */
export function runOfTrip(record: TimetableRecord, run: TrackRun | null, axis: 'x' | 'z' = 'x'): TrackRun | null {
  if (!run || run.kind !== 'through') return run;
  // x grows southwards and z westwards in the model, so +1 is south on an x platform and west on a z platform
  const dir = (record.direction_id ?? '').toLowerCase();
  const d = axis === 'x' ? (dir === 'southbound' ? 1 : dir === 'northbound' ? -1 : null) : dir === 'westbound' ? 1 : dir === 'eastbound' ? -1 : null;
  if (d == null || d === run.departs) return run;
  return { ...run, departs: d, note: `${run.note} This trip runs ${dir}, as its own timetable record says.` };
}

/** How far apart the arrival of one record and the departure of another may be to be read as one stop. */
export const COMPLEMENT_WINDOW_SECONDS = 300;

/**
 * Written at the start of the remarks of an arrival that ends here and goes back the way it came (a 都営新宿線 train
 * that ends at 新宿 and returns to 本八幡 from the other track): it is never joined to a departure on its track.
 */
export const TURNS_BACK_REMARK = 'Turns back here';

/**
 * Two records can each hold half of one stop: at 京王新線 新宿 the Toei train timetable ends with the
 * arrival of a train that runs on into the Keio New Line, and Keio's station timetable has its departure;
 * at JR 新宿 a 埼京線 train arrives under one number and leaves for 相鉄線 under another. One track holds
 * one train, so on one track and one kind of day an arrival-only plan followed within
 * COMPLEMENT_WINDOW_SECONDS by a departure-only plan is drawn as one train: the departure record is kept
 * and takes the arrival time (and the train number, if it has none) of the other, which is named in its
 * remarks with its destination. Pairs are taken in time order; a departure to the same destination is
 * preferred, otherwise the nearest one.
 */
export function mergeComplementaryPlans(plans: TrainPlan[]): void {
  const groups = new Map<string, TrainPlan[]>();
  for (const p of plans) {
    const k = `${p.physicalTrack}|${p.record.service_date_type}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(p);
  }
  const drop = new Set<TrainPlan>();
  for (const g of groups.values()) {
    const arrivals = g.filter((p) => p.depart == null && !p.arrivalAssumed && !p.record.remarks?.startsWith(TURNS_BACK_REMARK)).sort((a, b) => a.arrive - b.arrive);
    const departures = g.filter((p) => p.arrivalAssumed && p.depart != null).sort((a, b) => a.depart! - b.depart!);
    const used = new Set<TrainPlan>();
    for (const a of arrivals) {
      const near = departures.filter((d) => !used.has(d) && d.depart! >= a.arrive && d.depart! - a.arrive <= COMPLEMENT_WINDOW_SECONDS);
      // compared after NFKC: one source writes 塚 as the compatibility ideograph U+FA10
      const dest = (p: TrainPlan) => p.record.destination_text?.normalize('NFKC') ?? null;
      const b = near.find((d) => dest(d) != null && dest(d) === dest(a)) ?? near[0];
      if (!b) continue;
      used.add(b);
      drop.add(a);
      b.record = {
        ...b.record,
        arrival_time_local: a.record.arrival_time_local,
        train_number: b.record.train_number ?? a.record.train_number,
        remarks: [
          b.record.remarks,
          `Arrival time${b.record.train_number == null && a.record.train_number != null ? ' and train number' : ''} from ${a.record.trip_id} (${a.record.source_id})${dest(a) !== dest(b) && a.record.destination_text ? `, which arrives as a train for ${a.record.destination_text}${a.record.train_number ? ` (${a.record.train_number})` : ''}` : ''}.`,
        ]
          .filter(Boolean)
          .join(' · '),
      };
      b.arrive = a.arrive;
      b.arrivalAssumed = false;
      b.enter = b.run?.departs != null ? b.arrive - APPROACH_SECONDS : b.arrive;
    }
  }
  if (drop.size === 0) return;
  for (let i = plans.length - 1; i >= 0; i--) if (drop.has(plans[i]!)) plans.splice(i, 1);
}

function stationInModel(model: StationModel, stationId: string): boolean {
  const id = stationEntry(stationId)?.modelStationId;
  return id != null && model.stations.some((s) => s.id === id);
}

/** The state of one plan at time `t` (seconds of the service day), or null when the train is not on display. */
export function trainStateAt(plan: TrainPlan, t: number): TrainState | null {
  if (t < plan.enter || t >= plan.leave) return null;
  const dir = plan.run?.departs ?? null;
  const terminal = plan.run?.kind === 'terminal';
  const base = { plan, liveState: 'scheduled' as const };

  if (t < plan.arrive) {
    // Runs in with constant deceleration and comes to rest at the stop position.
    const u = (t - plan.enter) / plan.approachSeconds;
    const remaining = plan.runDistance * (1 - u) * (1 - u);
    const d = dir ?? 1;
    // through: comes from behind (−dir). terminal: comes in from the open end (+dir), heading −dir.
    const along = terminal ? plan.stopAt + d * remaining : plan.stopAt - d * remaining;
    return { ...base, phase: u < 0.45 ? 'approaching' : 'braking', along, heading: (terminal ? -d : d) as 1 | -1, doors: 0, moving: true };
  }

  const standsUntil = plan.depart ?? plan.leave;
  if (t < standsUntil) {
    const since = t - plan.arrive;
    const until = standsUntil - t;
    const dwell = standsUntil - plan.arrive;
    // Short dwells: the doors still open, for whatever time is there.
    const openAfter = Math.min(DOOR_OPEN_AFTER, dwell * 0.1);
    const closedBefore = plan.depart == null ? 0 : Math.min(DOOR_CLOSED_BEFORE, dwell * 0.2);
    const move = Math.min(DOOR_MOVE_SECONDS, Math.max(0.5, (dwell - openAfter - closedBefore) / 2));
    const opening = Math.min(1, Math.max(0, (since - openAfter) / move));
    const closing = plan.depart == null ? 1 : Math.min(1, Math.max(0, (until - closedBefore) / move));
    const doors = Math.min(opening, closing);
    const phase: TrainPhase = doors >= 1 ? 'doors-open' : closing < 1 && closing <= opening ? (doors > 0 ? 'doors-closing' : 'stopped') : doors > 0 ? 'doors-opening' : 'stopped';
    return { ...base, phase, along: plan.stopAt, heading: dir == null ? 0 : dir, doors, moving: false };
  }

  // Leaves with constant acceleration.
  const u = (t - plan.depart!) / DEPART_SECONDS;
  const d = dir ?? 1;
  return { ...base, phase: 'departing', along: plan.stopAt + d * plan.runDistance * u * u, heading: d as 1 | -1, doors: 0, moving: true };
}

/** Every train on display at time `t`. `plans` must be sorted by `enter`, as buildTrainPlans returns them. */
export function trainStatesAt(plans: TrainPlan[], t: number): TrainState[] {
  const out: TrainState[] = [];
  for (const plan of plans) {
    if (plan.enter > t) break;
    const s = trainStateAt(plan, t);
    if (s) out.push(s);
  }
  return out;
}

/** The next moment after `t` at which any train enters the display, or null. */
export function nextEventAfter(plans: TrainPlan[], t: number): number | null {
  for (const plan of plans) if (plan.enter > t) return plan.enter;
  return null;
}
