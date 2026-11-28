import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COUNTABLE_VISIT_SQL_PREDICATE,
  type CountableVisitKind,
  canTriggerMunicipalityVisit,
  computeLineCoverage,
  countVisitedStations,
  isCountableVisit,
  parseHlc,
  type VisitedStation,
} from '../src/index.ts';

const ride = 'sk:ride:jp:test-ride-1' as const;

function visit(stationSlug: string, visitKind: VisitedStation['visitKind']): VisitedStation {
  return { rideId: ride, stationId: `sk:station:kansai:${stationSlug}`, visitKind };
}

describe('four-dimensional footprint: passed_through never counts', () => {
  it('isCountableVisit excludes passed_through and narrows the type', () => {
    const v = visit('test-a', 'passed_through');
    expect(isCountableVisit(v)).toBe(false);
    const counted = visit('test-b', 'transferred');
    if (isCountableVisit(counted)) {
      expectTypeOf(counted.visitKind).toEqualTypeOf<CountableVisitKind>();
    }
    expect(isCountableVisit(counted)).toBe(true);
  });

  it('counts distinct stations actually boarded, alighted or transferred at', () => {
    const visits = [
      visit('test-a', 'boarded'),
      visit('test-b', 'passed_through'),
      visit('test-c', 'passed_through'),
      visit('test-d', 'transferred'),
      visit('test-d', 'boarded'),
      visit('test-e', 'alighted'),
    ];
    expect(countVisitedStations(visits)).toBe(3);
  });

  it('a ride made only of passed-through stations visits nothing', () => {
    expect(countVisitedStations([visit('test-a', 'passed_through')])).toBe(0);
  });

  it('only real stops can light up a municipality', () => {
    expect(canTriggerMunicipalityVisit(visit('test-a', 'passed_through'))).toBe(false);
    expect(canTriggerMunicipalityVisit(visit('test-a', 'alighted'))).toBe(true);
  });

  it('exposes the SQL predicate used by local-db', () => {
    expect(COUNTABLE_VISIT_SQL_PREDICATE).toBe("visit_kind != 'passed_through'");
  });
});

describe('computeLineCoverage', () => {
  const segments = [
    { id: 'sk:segment:kansai:test-1', operatingKm: 2 },
    { id: 'sk:segment:kansai:test-2', operatingKm: 3 },
    { id: 'sk:segment:kansai:test-3', operatingKm: 5 },
  ] as const;

  it('a partial ride is never complete', () => {
    const coverage = computeLineCoverage(segments, ['sk:segment:kansai:test-1']);
    expect(coverage).toMatchObject({ totalSegments: 3, riddenSegments: 1, isComplete: false });
    expect(coverage.kmRatio).toBeCloseTo(0.2);
  });

  it('is complete only when every segment was ridden; foreign segments are ignored', () => {
    const coverage = computeLineCoverage(segments, [
      'sk:segment:kansai:test-1',
      'sk:segment:kansai:test-2',
      'sk:segment:kansai:test-3',
      'sk:segment:kansai:other-line',
    ]);
    expect(coverage).toMatchObject({ riddenSegments: 3, segmentRatio: 1, isComplete: true });
  });

  it('reports km ratio as null when any distance is unknown', () => {
    const coverage = computeLineCoverage(
      [...segments, { id: 'sk:segment:kansai:test-4', operatingKm: null }],
      ['sk:segment:kansai:test-1'],
    );
    expect(coverage.kmRatio).toBeNull();
    expect(coverage.segmentRatio).toBe(0.25);
  });

  it('an empty line is not complete', () => {
    expect(computeLineCoverage([], [])).toMatchObject({ isComplete: false, segmentRatio: 0 });
  });
});

describe('parseHlc', () => {
  it('parses ms and ISO timestamps with counter and node ID', () => {
    expect(parseHlc('1764300000000-0-node1')).toEqual({
      time: '1764300000000',
      counter: 0,
      nodeId: 'node1',
    });
    expect(parseHlc('2026-11-28T03:00:00.000Z-12-web_a1')).toEqual({
      time: '2026-11-28T03:00:00.000Z',
      counter: 12,
      nodeId: 'web_a1',
    });
  });

  it('rejects malformed clocks', () => {
    for (const bad of ['', 'abc', '1764300000000-node1', '1764300000000--node1', '1-2-node-x']) {
      expect(parseHlc(bad), bad).toBeNull();
    }
  });
});
