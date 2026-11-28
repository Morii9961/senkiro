import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { timetableDataFrom } from '../../src/providers/timetableProvider';
import { recordsFromOdptTrainTimetables, serviceDateTypeOfCalendar, serviceTimeOf, type OdptConversion, type OdptTrainTimetable } from '../../src/timetable/odpt';
import { parseServiceTime } from '../../src/timetable/time';
import { buildTrainPlans, trainStateAt, trainStatesAt } from '../../src/trains/simulate';
import { loadModel, loadSources } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../data/timetable');
const model = loadModel();

// --- the converter, on objects written for this test in the shape of the ODPT spec (not a recorded response) ---

const S = 'odpt.Station:Toei.Oedo.';
const conv: OdptConversion = {
  source_id: 'src:test',
  stations: [
    {
      odptStation: `${S}Shinjuku`, station_id: 'toei:shinjuku:E27', operator_id: 'toei', line_id: 'toei:oedo',
      rules: [{ next: `${S}Yoyogi`, track: '6' }, { next: `${S}Tochomae`, track: '7' }], note: '',
    },
    {
      odptStation: 'odpt.Station:Toei.Shinjuku.Shinjuku', station_id: 'toei:shinjuku:S01', operator_id: 'toei', line_id: 'toei:shinjuku',
      rules: [{ prev: 'odpt.Station:Toei.Shinjuku.ShinjukuSanchome', track: '4' }], noTrackForTerminatingTrains: true, note: '',
    },
  ],
  stationNames: new Map([[`${S}Hikarigaoka`, '光が丘'], [`${S}Tochomae`, '都庁前'], ['odpt.Station:Keio.KeioNew.Sasazuka', '笹塚'], ['odpt.Station:Toei.Shinjuku.Shinjuku', '新宿']]),
  trainTypeNames: new Map([['odpt.TrainType:Toei.Local', '普通']]),
};

const train = (over: Partial<OdptTrainTimetable>): OdptTrainTimetable => ({
  'owl:sameAs': 'odpt.TrainTimetable:Toei.Oedo.1A.Weekday', 'dct:issued': '2025-03-17', 'odpt:calendar': 'odpt.Calendar:Weekday',
  'odpt:trainType': 'odpt.TrainType:Toei.Local', 'odpt:trainNumber': '1A', 'odpt:railDirection': 'odpt.RailDirection:OuterLoop',
  'odpt:destinationStation': [`${S}Hikarigaoka`],
  'odpt:trainTimetableObject': [
    { 'odpt:departureTime': '23:58', 'odpt:departureStation': `${S}Yoyogi` },
    { 'odpt:arrivalTime': '00:00', 'odpt:arrivalStation': `${S}Shinjuku`, 'odpt:departureTime': '00:01', 'odpt:departureStation': `${S}Shinjuku` },
    { 'odpt:arrivalTime': '00:03', 'odpt:arrivalStation': `${S}Tochomae` },
  ],
  ...over,
});

describe('ODPT train timetable conversion', () => {
  it('writes one record per call at a mapped station, with the track from the next station and times past midnight as 24:xx', () => {
    const { records } = recordsFromOdptTrainTimetables([train({})], conv);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      station_id: 'toei:shinjuku:E27', platform_id: 'toei:shinjuku:E27:7', service_date_type: 'weekday', train_number: '1A',
      arrival_time_local: '24:00', departure_time_local: '24:01', destination_text: '光が丘', service_class: '普通',
      vehicle_series: null, formation_length: null, vehicle_assignment_status: 'unknown', source_id: 'src:test', valid_from: '2025-03-17',
    });
    // the trip id is the ODPT id, never the train number
    expect(records[0]!.trip_id).not.toBe(records[0]!.train_number);
  });

  it('leaves a call without a matching rule off the tracks instead of guessing', () => {
    const odd = train({ 'odpt:trainTimetableObject': [
      { 'odpt:departureTime': '10:00', 'odpt:departureStation': `${S}Shinjuku` },
      { 'odpt:arrivalTime': '10:05', 'odpt:arrivalStation': `${S}Roppongi` },
    ] });
    const { records } = recordsFromOdptTrainTimetables([odd], conv);
    expect(records[0]!.platform_id).toBeNull();
    expect(records[0]!.remarks).toMatch(/No track rule/);
  });

  it('places a train that runs on into another timetable, but not one that turns back here', () => {
    const through = train({
      'owl:sameAs': 'odpt.TrainTimetable:Toei.Shinjuku.1T.Weekday', 'odpt:destinationStation': ['odpt.Station:Keio.KeioNew.Sasazuka'],
      'odpt:trainTimetableObject': [
        { 'odpt:departureTime': '10:00', 'odpt:departureStation': 'odpt.Station:Toei.Shinjuku.ShinjukuSanchome' },
        { 'odpt:arrivalTime': '10:02', 'odpt:arrivalStation': 'odpt.Station:Toei.Shinjuku.Shinjuku' },
      ],
    });
    const turning = { ...through, 'owl:sameAs': 'odpt.TrainTimetable:Toei.Shinjuku.3T.Weekday', 'odpt:destinationStation': ['odpt.Station:Toei.Shinjuku.Shinjuku'] };
    const { records } = recordsFromOdptTrainTimetables([through, turning], conv);
    expect(records[0]).toMatchObject({ platform_id: 'toei:shinjuku:S01:4', departure_time_local: null, destination_text: '笹塚' });
    expect(records[0]!.remarks).toMatch(/departure time is not in this timetable/);
    expect(records[1]!.platform_id).toBeNull();
    expect(records[1]!.remarks).toMatch(/Terminates here/);
  });

  it('reads calendars and clock times as the record format wants them', () => {
    expect(serviceDateTypeOfCalendar('odpt.Calendar:Weekday')).toBe('weekday');
    expect(serviceDateTypeOfCalendar('odpt.Calendar:SaturdayHoliday')).toBe('saturday-holiday');
    expect(serviceDateTypeOfCalendar('odpt.Calendar:Specific.Toei.20260101')).toBeNull();
    expect(serviceTimeOf('05:09')).toBe('05:09');
    expect(serviceTimeOf('0:29')).toBe('24:29');
    expect(serviceTimeOf('02:59')).toBe('26:59');
    const special = recordsFromOdptTrainTimetables([train({ 'odpt:calendar': 'odpt.Calendar:Specific.Toei.20260101' })], conv);
    expect(special.records).toEqual([]);
    expect(special.notes.join(' ')).toMatch(/left out/);
  });
});

// --- the committed timetable ---

const files = readdirSync(dataDir).filter((f) => /\.(csv|json)$/.test(f)).map((name) => ({ name, content: readFileSync(resolve(dataDir, name), 'utf8') }));
const data = timetableDataFrom(files);

describe('committed timetable (data/timetable/)', () => {
  it('is a real timetable: no error, no demo record, and the demo fixture is not used', () => {
    expect(data.dataset.kind).toBe('timetable');
    expect(data.errorCount).toBe(0);
    expect(data.records.length).toBeGreaterThan(2500);
    expect(data.records.some((r) => r.source_id.startsWith('demo:') || r.trip_id.startsWith('demo:'))).toBe(false);
  });

  it('every record traces to a SourceRecord whose licence allows it in a public repository', () => {
    const sources = loadSources();
    for (const id of new Set(data.records.map((r) => r.source_id))) {
      const s = sources.find((x) => x.id === id);
      expect(s, id).toBeTruthy();
      expect(s!.redistribution, id).toBe('yes');
      expect(s!.usedInData, id).toBe(true);
      expect(data.dataset.sources.find((x) => x.id === id)?.license, id).toMatch(/CC BY 4\.0/);
    }
  });

  it('covers the Toei Shinjuku and Oedo lines at their four stations, on weekdays and on Saturdays / holidays', () => {
    expect(new Set(data.coveredLineIds)).toEqual(new Set(['toei:shinjuku', 'toei:oedo']));
    expect(new Set(data.records.map((r) => r.station_id))).toEqual(new Set(['toei:shinjuku:S01', 'toei:shinjuku-sanchome:S02', 'toei:shinjuku:E27', 'toei:shinjuku-nishiguchi:E01']));
    expect(new Set(data.records.map((r) => r.service_date_type))).toEqual(new Set(['weekday', 'saturday-holiday']));
    // the only records without a track are trains that start or end their run at Shinjuku (S01)
    for (const r of data.records.filter((x) => x.platform_id == null)) {
      expect(r.station_id).toBe('toei:shinjuku:S01');
      expect(r.remarks).toMatch(/^(Terminates|Starts) here/);
    }
  });

  it('every call with a track is placed in the model, in the direction its next station lies', () => {
    const { plans, unplaced } = buildTrainPlans(model, data.records, { dayType: null });
    expect(unplaced.every((u) => u.reason === 'no-platform')).toBe(true);
    for (const p of plans) expect(p.run?.departs, p.id).not.toBeNull();
    const e27 = plans.filter((p) => p.record.station_id === 'toei:shinjuku:E27');
    expect(new Set(e27.map((p) => `${p.record.direction_id}->${p.trackNumber}`))).toEqual(new Set(['InnerLoop->6', 'OuterLoop->7']));
  });

  it('shows trains through the day and none in the small hours, on both kinds of day', () => {
    for (const dayType of ['weekday', 'sunday'] as const) {
      const { plans } = buildTrainPlans(model, data.records, { dayType });
      expect(trainStatesAt(plans, 12 * 3600).length, dayType).toBeGreaterThan(0);
      expect(trainStatesAt(plans, 3.5 * 3600), dayType).toEqual([]);
    }
  });

  it('two trains never overlap on a track, all day', () => {
    for (const dayType of ['weekday', 'sunday'] as const) {
      const { plans } = buildTrainPlans(model, data.records, { dayType });
      const byTrack = new Map<string, typeof plans>();
      for (const p of plans) byTrack.set(p.physicalTrack, [...(byTrack.get(p.physicalTrack) ?? []), p]);
      for (const [key, list] of byTrack) {
        for (let t = 4.5 * 3600; t < 25.5 * 3600; t += 5) {
          const on = list.map((p) => trainStateAt(p, t)).filter((s) => s !== null);
          for (let i = 0; i < on.length; i++) {
            for (let j = i + 1; j < on.length; j++) {
              const gap = Math.abs(on[i]!.along - on[j]!.along) - (on[i]!.plan.length + on[j]!.plan.length) / 2;
              expect(gap, `${dayType} ${key} at ${t}: ${on[i]!.plan.record.trip_id} / ${on[j]!.plan.record.trip_id}`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('times are plausible: every dwell under ten minutes, nothing before 04:00', () => {
    for (const r of data.records) {
      const a = parseServiceTime(r.arrival_time_local);
      const d = parseServiceTime(r.departure_time_local);
      if (a != null && d != null) expect(d - a, r.trip_id).toBeLessThan(10 * 60);
      expect((d ?? a)!, r.trip_id).toBeGreaterThanOrEqual(4 * 3600);
    }
  });
});
