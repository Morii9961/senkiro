import { describe, expect, it } from 'vitest';
import { demoFixture } from '../../src/timetable/demoFixture';
import type { TimetableRecord } from '../../src/timetable/types';
import {
  APPROACH_SECONDS, ASSUMED_DWELL_SECONDS, DEPART_SECONDS, NOMINAL_CAR_LENGTH, TERMINATING_HOLD_SECONDS, buildTrainPlans, trainStateAt, trainStatesAt,
} from '../../src/trains/simulate';
import { physicalTrackKey, trackLine } from '../../src/trains/trackGeometry';
import { allTrackRunKeys, modelTrackKeys, trackRun } from '../../src/trains/trackRuns';
import { FORMATION_FACTS, GENERIC_VEHICLE, LINE_VEHICLE_RULES, VEHICLES, resolveVehicle, vehicleBySeries } from '../../src/trains/vehicles';
import { loadModel, loadSources } from './helpers';

const model = loadModel();
const sources = new Set(loadSources().map((s) => s.id));

const base: TimetableRecord = {
  station_id: 'jr-east:shinjuku', operator_id: 'jr-east', line_id: 'jr-east:yamanote', platform_id: 'jr-east:shinjuku:14', direction_id: null,
  service_date_type: 'weekday', trip_id: 't1', train_number: null, arrival_time_local: '08:00:00', departure_time_local: '08:01:00',
  destination_text: null, service_class: null, vehicle_series: null, formation_length: null, vehicle_assignment_status: 'unknown',
  source_id: 'src:x', valid_from: null, valid_until: null, remarks: null,
};
const rec = (over: Partial<TimetableRecord>): TimetableRecord => ({ ...base, ...over });
const plansOf = (records: TimetableRecord[]) => buildTrainPlans(model, records, { dayType: null });
const T = 8 * 3600;

describe('track running table', () => {
  it('covers every track of the model, and nothing else', () => {
    expect([...allTrackRunKeys()].sort()).toEqual([...modelTrackKeys(model)].sort());
  });

  it('every track with a recorded side yields a track line beside its platform', () => {
    for (const a of model.areas) {
      if (a.kind !== 'platform') continue;
      for (const t of a.tracks) {
        const line = trackLine(a, t.number);
        if (!t.side) {
          expect(line).toBeNull();
          continue;
        }
        const r = a.footprint[0]!;
        const [lo, hi] = line!.axis === 'x' ? [r.z0, r.z1] : [r.x0, r.x1];
        // the centre line lies outside the platform slab, within a track's width of its edge
        expect(line!.centre < lo || line!.centre > hi, a.id).toBe(true);
        expect(Math.min(Math.abs(line!.centre - lo), Math.abs(line!.centre - hi))).toBeLessThan(0.5);
        expect(line!.clipLo).toBeLessThan(line!.lo);
      }
    }
  });

  it('two platform numbers share a pair of rails only as the two faces of one track', () => {
    const seen = new Map<string, string>();
    for (const a of model.areas) {
      if (a.kind !== 'platform') continue;
      for (const t of a.tracks) {
        const line = trackLine(a, t.number);
        if (!line) continue;
        const key = `${a.levelId}|${line.axis}|${line.centre.toFixed(2)}`;
        const other = seen.get(key);
        if (other) {
          const [oa, on] = other.split('#');
          const ol = trackLine(model.areas.find((x) => x.id === oa) as never, on!)!;
          // a platform on each side of the same rails (Odakyu's boarding / alighting faces)
          expect(ol.platformSide, `${a.id}#${t.number} vs ${other}`).toBe(-line.platformSide);
          expect(physicalTrackKey(ol)).toBe(physicalTrackKey(line));
        }
        seen.set(key, `${a.id}#${t.number}`);
      }
    }
  });
});

describe('vehicle rules', () => {
  it('every vehicle, line rule and formation fact cites a registered source', () => {
    for (const v of [...VEHICLES, GENERIC_VEHICLE]) for (const s of v.sourceIds) expect(sources.has(s), `${v.id}: ${s}`).toBe(true);
    for (const r of LINE_VEHICLE_RULES) {
      expect(VEHICLES.some((v) => v.id === r.vehicleId), r.line_id).toBe(true);
      for (const s of r.sourceIds) expect(sources.has(s), s).toBe(true);
    }
    for (const f of FORMATION_FACTS) for (const s of f.sourceIds) expect(sources.has(s), s).toBe(true);
  });

  it('takes the type from the trip first, then from a sourced line rule, else the generic train', () => {
    const trip = resolveVehicle(rec({ vehicle_series: 'E233系', vehicle_assignment_status: 'verified', formation_length: 12 }));
    expect(trip).toMatchObject({ basis: 'trip', status: 'verified', cars: 12, carsBasis: 'trip' });
    expect(trip.spec.id).toBe('jr-east:E233');

    const rule = resolveVehicle(base);
    expect(rule).toMatchObject({ basis: 'line-rule', status: 'verified', seriesLabel: 'E235系', cars: 11, carsBasis: 'line-fact' });
    expect(rule.sourceIds).toContain('src:trafficnews-yamanote-e235');

    expect(resolveVehicle(rec({ line_id: 'jr-east:chuo-rapid' })).status).toBe('representative');

    const none = resolveVehicle(rec({ station_id: 'odakyu:shinjuku', line_id: 'odakyu:odawara' }));
    expect(none).toMatchObject({ basis: 'none', status: 'unknown', cars: null });
    expect(none.spec).toBe(GENERIC_VEHICLE);

    const notInLibrary = resolveVehicle(rec({ vehicle_series: '8000形', vehicle_assignment_status: 'representative' }));
    expect(notInLibrary).toMatchObject({ basis: 'trip-series-not-in-library', status: 'representative', seriesLabel: '8000形' });
    expect(notInLibrary.spec).toBe(GENERIC_VEHICLE);
  });

  it('never assumes a number of cars: only the trip or a sourced fact gives one', () => {
    expect(resolveVehicle(rec({ station_id: 'odakyu:shinjuku', line_id: 'odakyu:odawara' })).cars).toBeNull();
    expect(resolveVehicle(rec({ line_id: 'jr-east:chuo-sobu-local' })).cars).toBeNull();
    // the trip's own figure wins over a fact about the line
    expect(resolveVehicle(rec({ formation_length: 10 }))).toMatchObject({ cars: 10, carsBasis: 'trip' });
    const oedo = resolveVehicle(rec({ station_id: 'toei:shinjuku:E27', line_id: 'toei:oedo' }));
    expect(oedo).toMatchObject({ cars: 8, carsBasis: 'line-fact', status: 'unknown' });
    expect(oedo.sourceIds).toContain('src:toei-shinjuku-map');
  });

  it('matches series spellings', () => {
    expect(vehicleBySeries('E235系')?.id).toBe('jr-east:E235');
    expect(vehicleBySeries('e235 series')?.id).toBe('jr-east:E235');
    expect(vehicleBySeries('E233-0')?.id).toBe('jr-east:E233');
    expect(vehicleBySeries('E353')).toBeNull();
  });
});

describe('train simulation', () => {
  it('runs in, stops, opens and closes the doors, and leaves — on a through track', () => {
    const { plans, unplaced } = plansOf([base]);
    expect(unplaced).toEqual([]);
    const p = plans[0]!;
    expect(p.run?.kind).toBe('through');
    expect(p.arrivalAssumed).toBe(false);
    expect(trainStateAt(p, T - APPROACH_SECONDS - 1)).toBeNull();

    const far = trainStateAt(p, T - APPROACH_SECONDS + 1)!;
    const near = trainStateAt(p, T - 2)!;
    expect(far.phase).toBe('approaching');
    expect(near.phase).toBe('braking');
    // heads south (x grows) and comes from the north: behind the stop position, closing in
    expect(far.heading).toBe(1);
    expect(far.along).toBeLessThan(near.along);
    expect(near.along).toBeLessThan(p.stopAt);
    // decelerating: covers less ground in the last seconds than in the first
    const step = (t: number) => Math.abs(trainStateAt(p, t + 1)!.along - trainStateAt(p, t)!.along);
    expect(step(T - 3)).toBeLessThan(step(T - APPROACH_SECONDS + 2));

    expect(trainStateAt(p, T)!).toMatchObject({ phase: 'stopped', along: p.stopAt, doors: 0, moving: false });
    expect(trainStateAt(p, T + 3)!.phase).toBe('doors-opening');
    expect(trainStateAt(p, T + 30)!).toMatchObject({ phase: 'doors-open', doors: 1 });
    expect(trainStateAt(p, T + 54.5)!.phase).toBe('doors-closing');
    expect(trainStateAt(p, T + 59)!).toMatchObject({ doors: 0, moving: false });

    const leaving = trainStateAt(p, T + 60 + 10)!;
    expect(leaving).toMatchObject({ phase: 'departing', heading: 1, doors: 0 });
    expect(leaving.along).toBeGreaterThan(p.stopAt);
    expect(trainStateAt(p, T + 60 + DEPART_SECONDS)).toBeNull();
    // by then it is wholly past the end of the drawn track
    const last = trainStateAt(p, T + 60 + DEPART_SECONDS - 0.01)!;
    expect(last.along - p.length / 2).toBeGreaterThan(p.line.clipHi);
    expect(far.along + p.length / 2).toBeLessThan(p.line.clipLo + 3);
  });

  it('at a terminal track the train leaves the way it came', () => {
    const p = plansOf([rec({ station_id: 'odakyu:shinjuku', operator_id: 'odakyu', line_id: 'odakyu:odawara', platform_id: 'odakyu:shinjuku:4' })]).plans[0]!;
    expect(p.run?.kind).toBe('terminal');
    const coming = trainStateAt(p, T - 20)!;
    const going = trainStateAt(p, T + 60 + 20)!;
    expect(coming.along).toBeGreaterThan(p.stopAt);
    expect(going.along).toBeGreaterThan(p.stopAt);
    expect(coming.heading).toBe(-1);
    expect(going.heading).toBe(1);
  });

  it('marks the dwell as assumed when the timetable has no arrival time', () => {
    const p = plansOf([rec({ arrival_time_local: null })]).plans[0]!;
    expect(p.arrivalAssumed).toBe(true);
    expect(p.arrive).toBe(T + 60 - ASSUMED_DWELL_SECONDS);
  });

  it('a terminating train stays a while with its doors open and is not given a made-up departure', () => {
    const p = plansOf([rec({ departure_time_local: null })]).plans[0]!;
    expect(p.depart).toBeNull();
    expect(trainStateAt(p, T + 30)!).toMatchObject({ phase: 'doors-open', moving: false });
    expect(trainStateAt(p, T + TERMINATING_HOLD_SECONDS)).toBeNull();
  });

  it('shows a train only while it stands when the direction of the track is not established', () => {
    const p = plansOf([rec({ line_id: 'jr-east:narita-express', platform_id: 'jr-east:shinjuku:5' })]).plans[0]!;
    expect(p.run?.departs).toBeNull();
    expect(trainStateAt(p, T - 1)).toBeNull();
    expect(trainStateAt(p, T + 10)!).toMatchObject({ heading: 0, moving: false });
    expect(trainStateAt(p, T + 60)).toBeNull();
  });

  it('draws the cars the data gives and fits them to the platform; unknown stays undivided', () => {
    const eleven = plansOf([rec({ formation_length: 11 })]).plans[0]!;
    expect(eleven.carLength).toBeCloseTo(NOMINAL_CAR_LENGTH);
    expect(eleven.length).toBeCloseTo(11 * NOMINAL_CAR_LENGTH);
    const unknown = plansOf([rec({ line_id: 'jr-east:chuo-sobu-local', platform_id: 'jr-east:shinjuku:13' })]).plans[0]!;
    expect(unknown.carLength).toBeNull();
    const oedo = plansOf([rec({ station_id: 'toei:shinjuku:E27', operator_id: 'toei', line_id: 'toei:oedo', platform_id: 'toei:shinjuku:E27:6' })]).plans[0]!;
    expect(oedo.vehicle.cars).toBe(8);
    // a short platform: the cars shrink so that the train still fits
    expect(oedo.length).toBeLessThan(oedo.line.hi - oedo.line.lo);
    expect(oedo.carLength!).toBeLessThan(NOMINAL_CAR_LENGTH);
  });

  it('reports records it cannot place instead of drawing them somewhere', () => {
    const { plans, unplaced } = plansOf([
      rec({ platform_id: null }),
      rec({ trip_id: 'a', platform_id: 'jr-east:shinjuku:99' }),
      rec({ trip_id: 'b', station_id: 'toei:shinjuku-nishiguchi:E01', operator_id: 'toei', line_id: 'toei:oedo', platform_id: 'toei:shinjuku-nishiguchi:E01:1' }),
    ]);
    expect(plans).toEqual([]);
    expect(unplaced.map((u) => u.reason)).toEqual(['no-platform', 'track-not-in-model', expect.stringMatching(/station-not-in-model|track-not-in-model/)]);
  });

  it('filters by the kind of day', () => {
    const records = [base, rec({ trip_id: 'h', service_date_type: 'holiday' })];
    expect(buildTrainPlans(model, records, { dayType: 'weekday' }).plans.map((p) => p.record.trip_id)).toEqual(['t1']);
    expect(buildTrainPlans(model, records, { dayType: 'sunday' }).plans.map((p) => p.record.trip_id)).toEqual(['h']);
  });

  it('two trains never overlap on a track, all day, in the demo fixture', () => {
    const { plans, unplaced } = plansOf(demoFixture().records);
    expect(unplaced).toEqual([]);
    const byTrack = new Map<string, typeof plans>();
    for (const p of plans) byTrack.set(p.physicalTrack, [...(byTrack.get(p.physicalTrack) ?? []), p]);
    for (const [key, list] of byTrack) {
      for (let t = 5 * 3600 - 120; t < 25 * 3600; t += 7) {
        const on = list.map((p) => trainStateAt(p, t)).filter((s) => s !== null);
        for (let i = 0; i < on.length; i++) {
          for (let j = i + 1; j < on.length; j++) {
            const gap = Math.abs(on[i]!.along - on[j]!.along) - (on[i]!.plan.length + on[j]!.plan.length) / 2;
            expect(gap, `${key} at ${t}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('shows no train when none is scheduled', () => {
    const { plans } = plansOf(demoFixture().records);
    expect(trainStatesAt(plans, 3.5 * 3600)).toEqual([]);
    expect(trainStatesAt(plans, 12 * 3600).length).toBeGreaterThan(5);
    for (const s of trainStatesAt(plans, 12 * 3600)) expect(s.liveState).toBe('scheduled');
  });
});
