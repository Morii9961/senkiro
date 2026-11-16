/**
 * ODPT train timetables (odpt:TrainTimetable) → TimetableRecord.
 *
 * An ODPT train timetable lists, for one train on one kind of day, the
 * stations it calls at with their times. This module picks out the calls at
 * the stations of this prototype and writes one record per call, in the
 * agreed format. It adds nothing that the timetable does not say, with one
 * exception that is written down per station below: the track. ODPT gives no
 * platform number at these stations, so the track is read from where the
 * train goes next (or came from), using the direction signs the station model
 * already records for each track. A call whose next / previous station does
 * not match a rule gets no platform and is not drawn.
 *
 * Pure TypeScript, no network: the fetch script (scripts/fetch-timetable-odpt.ts)
 * hands the downloaded JSON to `recordsFromOdptTrainTimetables`.
 */
import { platformIdOf } from './registry';
import type { TimetableRecord } from './types';

/** The parts of an odpt:TrainTimetable object this module reads. Everything is optional: data is read defensively. */
export interface OdptTrainTimetable {
  'owl:sameAs'?: string;
  'dct:issued'?: string;
  'odpt:railway'?: string;
  'odpt:calendar'?: string;
  'odpt:operator'?: string;
  'odpt:trainType'?: string;
  'odpt:trainNumber'?: string;
  'odpt:railDirection'?: string;
  'odpt:originStation'?: string[];
  'odpt:destinationStation'?: string[];
  'odpt:trainTimetableObject'?: OdptTimetableCall[];
}

export interface OdptTimetableCall {
  'odpt:arrivalTime'?: string;
  'odpt:arrivalStation'?: string;
  'odpt:departureTime'?: string;
  'odpt:departureStation'?: string;
  'odpt:platformNumber'?: string;
}

/** Which track a call uses, decided by the station the train runs to next, or came from. */
export interface TrackRule {
  /** The train's next call is at this ODPT station … */
  next?: string;
  /** … or (when it has no next call in this timetable) its previous call was here. */
  prev?: string;
  track: string;
}

export interface OdptStationMapping {
  /** ODPT station id, e.g. odpt.Station:Toei.Oedo.Shinjuku. */
  odptStation: string;
  station_id: string;
  operator_id: string;
  line_id: string;
  rules: TrackRule[];
  /**
   * Trains that start or end their run here have no track: where they turn
   * is not in the timetable. Set to true where that is so.
   */
  noTrackForTerminatingTrains?: boolean;
  /** Why the rules are what they are — copied into the report, not into the records. */
  note: string;
}

export interface OdptConversion {
  source_id: string;
  stations: OdptStationMapping[];
  /** ODPT station id → name, for destination_text. */
  stationNames: ReadonlyMap<string, string>;
  /** ODPT train type id → name as the data titles it. */
  trainTypeNames: ReadonlyMap<string, string>;
}

export interface OdptConversionResult {
  records: TimetableRecord[];
  /** Things the converter left out or could not read, for the fetch script to print. */
  notes: string[];
}

/** odpt.Calendar:* → service_date_type. Calendars for specific dates are not converted. */
export function serviceDateTypeOfCalendar(calendar: string | undefined): string | null {
  switch (calendar) {
    case 'odpt.Calendar:Weekday':
      return 'weekday';
    case 'odpt.Calendar:SaturdayHoliday':
      return 'saturday-holiday';
    case 'odpt.Calendar:Saturday':
      return 'saturday';
    case 'odpt.Calendar:Holiday':
    case 'odpt.Calendar:Sunday':
      return 'holiday';
    default:
      return null;
  }
}

/**
 * ODPT writes clock times ("00:29"); a service day runs past midnight. A time
 * before 03:00 belongs to the evening before and is written 24:xx, 25:xx, as
 * the record format asks. No train of these lines runs between 02:00 and 04:00.
 */
export function serviceTimeOf(clock: string | undefined): string | null {
  if (!clock) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(clock.trim());
  if (!m) return clock;
  let h = Number(m[1]);
  if (h < 3) h += 24;
  return `${String(h).padStart(2, '0')}:${m[2]}${m[3] ? `:${m[3]}` : ''}`;
}

const stationOf = (c: OdptTimetableCall | undefined): string | null => (c ? (c['odpt:departureStation'] ?? c['odpt:arrivalStation'] ?? null) : null);

export function recordsFromOdptTrainTimetables(trains: readonly OdptTrainTimetable[], conv: OdptConversion): OdptConversionResult {
  const records: TimetableRecord[] = [];
  const notes: string[] = [];
  const byStation = new Map(conv.stations.map((s) => [s.odptStation, s]));
  const skippedCalendars = new Map<string, number>();

  for (const train of trains) {
    const tripId = train['owl:sameAs'];
    const calls = train['odpt:trainTimetableObject'] ?? [];
    if (!tripId || calls.length === 0) continue;
    const dayType = serviceDateTypeOfCalendar(train['odpt:calendar']);

    calls.forEach((call, i) => {
      const odptStation = stationOf(call);
      const station = odptStation ? byStation.get(odptStation) : undefined;
      if (!station) return;
      if (!dayType) {
        const c = train['odpt:calendar'] ?? '(none)';
        skippedCalendars.set(c, (skippedCalendars.get(c) ?? 0) + 1);
        return;
      }

      const next = stationOf(calls[i + 1]);
      const prev = stationOf(calls[i - 1]);
      const origin = train['odpt:originStation'] ?? [];
      const destination = train['odpt:destinationStation'] ?? [];
      const terminatesOrStartsHere = destination.includes(station.odptStation) || origin.includes(station.odptStation);

      let track: string | null = null;
      let remark: string | null = null;
      if (station.noTrackForTerminatingTrains && terminatesOrStartsHere) {
        remark = destination.includes(station.odptStation)
          ? 'Terminates here; the track it uses to turn back is not in the timetable, so it is not drawn.'
          : 'Starts here; the track it leaves from is not in the timetable, so it is not drawn.';
      } else {
        const rule = station.rules.find((r) => (r.next != null ? r.next === next : r.prev != null && next == null && r.prev === prev));
        if (rule) track = rule.track;
        else remark = `No track rule for a train from ${prev ?? '(start)'} to ${next ?? '(end)'}; not drawn.`;
      }
      if (call['odpt:platformNumber']) {
        // Not seen at these stations so far; if the data starts to give one, it wins over the rule.
        track = call['odpt:platformNumber'];
        remark = 'Track as given by the timetable.';
      }

      const arrival = serviceTimeOf(call['odpt:arrivalTime']);
      const departure = serviceTimeOf(call['odpt:departureTime']);
      if (next == null && departure == null && !destination.includes(station.odptStation)) {
        // e.g. a Toei Shinjuku Line train that runs on into the Keio New Line: its departure is in Keio's timetable, not this one
        remark = [remark, 'Runs on beyond this station; the departure time is not in this timetable.'].filter(Boolean).join(' ');
      }

      records.push({
        station_id: station.station_id,
        operator_id: station.operator_id,
        line_id: station.line_id,
        platform_id: track == null ? null : platformIdOf(station.station_id, track),
        direction_id: train['odpt:railDirection']?.replace(/^odpt\.RailDirection:/, '') ?? null,
        service_date_type: dayType,
        trip_id: tripId,
        train_number: train['odpt:trainNumber'] ?? null,
        arrival_time_local: arrival,
        departure_time_local: departure,
        destination_text: destination.length ? destination.map((d) => conv.stationNames.get(d) ?? d).join('・') : null,
        service_class: train['odpt:trainType'] ? (conv.trainTypeNames.get(train['odpt:trainType']) ?? null) : null,
        vehicle_series: null,
        formation_length: null,
        vehicle_assignment_status: 'unknown',
        source_id: conv.source_id,
        valid_from: train['dct:issued'] ?? null,
        valid_until: null,
        remarks: remark,
      });
    });
  }

  for (const [calendar, n] of skippedCalendars) notes.push(`${n} calls on calendar ${calendar} were left out (not a weekday / Saturday / holiday timetable).`);
  const unnamed = new Set(records.map((r) => r.destination_text).filter((d): d is string => d != null && d.startsWith('odpt.Station:')));
  for (const d of unnamed) notes.push(`No name for destination ${d}; the ODPT id is kept.`);
  return { records, notes };
}
