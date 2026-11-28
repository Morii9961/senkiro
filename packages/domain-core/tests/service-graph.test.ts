import { makeLocalizedNames, type ServiceGraph } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import { ServiceGraphIndex } from '../src/index.ts';
import { ALPHA, BETA, line, st, synthetic } from './fixtures.ts';

const base = <T extends string>(id: T) => ({
  id,
  externalIds: {},
  names: makeLocalizedNames({ en: id }),
  provenance: synthetic,
  validFrom: null,
  validTo: null,
});

const dataset: ServiceGraph = {
  servicePatterns: [
    {
      ...base('sk:service:testville:alpha-local'),
      operatorId: ALPHA,
      railLineIds: [line('alpha-main')],
      serviceCategory: 'local',
      stopStationIds: [st('a1'), st('a2'), st('a3'), st('a4')],
      throughServiceId: 'sk:through:testville:alpha-beta',
    },
  ],
  trips: [
    {
      ...base('sk:trip:testville:t1'),
      servicePatternId: 'sk:service:testville:alpha-local',
      trainNumber: null,
      direction: 'outbound',
      calendarId: 'weekday',
      schedulePrecision: 'frequency',
    },
    {
      ...base('sk:trip:testville:t2'),
      servicePatternId: 'sk:service:testville:alpha-local',
      trainNumber: null,
      direction: 'inbound',
      calendarId: 'weekday',
      schedulePrecision: 'timetable',
    },
  ],
  stopTimes: [
    {
      ...base('sk:stoptime:testville:t1-2'),
      tripId: 'sk:trip:testville:t1',
      stationId: st('a2'),
      sequence: 2,
      arrivalTime: null,
      departureTime: null,
      platformNumber: null,
    },
    {
      ...base('sk:stoptime:testville:t1-1'),
      tripId: 'sk:trip:testville:t1',
      stationId: st('a1'),
      sequence: 1,
      arrivalTime: null,
      departureTime: null,
      platformNumber: null,
    },
  ],
  throughServices: [
    {
      ...base('sk:through:testville:alpha-beta'),
      boundaryStationId: st('a4'),
      fromRailLineId: line('alpha-main'),
      toRailLineId: line('beta-metro'),
      operatorIds: [ALPHA, BETA],
      serviceDescription: 'synthetic through service',
      notes: null,
    },
  ],
};

describe('ServiceGraphIndex — services kept apart from track ownership', () => {
  const index = new ServiceGraphIndex(dataset);

  it('looks up through services by line and boundary station', () => {
    expect(index.getThroughServicesForLine(line('beta-metro'))).toHaveLength(1);
    expect(index.getThroughServicesAtStation(st('a4'))).toHaveLength(1);
    expect(index.getThroughServicesAtStation(st('a1'))).toEqual([]);
  });

  it('finds patterns by line and stop, trips by pattern, stop times in sequence order', () => {
    expect(index.getServicePatternsForLine(line('alpha-main'))).toHaveLength(1);
    expect(index.getServicePatternsStoppingAt(st('b1'))).toEqual([]);
    expect(index.getTripsForServicePattern('sk:service:testville:alpha-local')).toHaveLength(2);
    expect(index.getStopTimesForTrip('sk:trip:testville:t1').map((s) => s.sequence)).toEqual([
      1, 2,
    ]);
    expect(index.getServicePattern('sk:service:testville:alpha-local')?.serviceCategory).toBe(
      'local',
    );
  });

  it('flags frequency-based / synthetic trips for disclosure (invariant 4)', () => {
    expect(index.tripRequiresSyntheticDisclosure('sk:trip:testville:t1')).toBe(true);
    // t2 is timetable precision but its provenance is synthetic test data.
    expect(index.tripRequiresSyntheticDisclosure('sk:trip:testville:t2')).toBe(true);
    expect(index.tripRequiresSyntheticDisclosure('sk:trip:testville:none')).toBe(false);
  });
});
