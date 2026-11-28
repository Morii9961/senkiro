import { computeLineCoverage } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import { FareRuleGraph, TrackGraphIndex } from '../src/index.ts';
import { ALPHA, BETA, buildTestville, line, segIdOf, st } from './fixtures.ts';

const graph = new TrackGraphIndex(buildTestville());
const alphaOnly = (op: string) => op === ALPHA;

describe('TrackGraphIndex — indexing & integrity', () => {
  it('indexes the synthetic dataset without integrity issues', () => {
    expect(graph.issues).toEqual([]);
    expect(graph.stationsById.size).toBe(11);
    expect(
      graph
        .edgesFrom(st('a2'))
        .map((e) => e.to)
        .sort(),
    ).toEqual([st('a1'), st('a3'), st('l1')].sort());
    expect(graph.transfersFrom(st('a1')).map((t) => t.to)).toEqual([st('s1')]);
  });

  it('reports broken references explicitly and keeps them out of the adjacency', () => {
    const dataset = buildTestville();
    const [first] = dataset.segments;
    if (first === undefined) {
      throw new Error('fixture');
    }
    dataset.segments.push(
      { ...first, id: 'sk:segment:testville:ghost', toStationId: st('nowhere') },
      { ...first, id: 'sk:segment:testville:lineless', railLineIds: [] },
      first,
    );
    const [ic] = dataset.interchanges;
    if (ic === undefined) {
      throw new Error('fixture');
    }
    dataset.interchanges.push({ ...ic, id: 'sk:interchange:testville:bad', toStationId: st('x') });
    const broken = new TrackGraphIndex(dataset);
    expect(broken.issues.map((i) => i.code).sort()).toEqual([
      'DUPLICATE_ID',
      'INTERCHANGE_UNKNOWN_STATION',
      'SEGMENT_UNKNOWN_STATION',
      'SEGMENT_WITHOUT_LINE',
    ]);
    expect(
      broken.edgesFrom(st('a1')).filter((e) => e.segment.id === 'sk:segment:testville:lineless'),
    ).toEqual([]);
  });

  it('identifies shinkansen-only stations from line classes, not from ID strings', () => {
    expect(graph.isShinkansenOnlyStation(st('s1'))).toBe(true);
    expect(graph.isShinkansenOnlyStation(st('a1'))).toBe(false);
    expect(graph.isShinkansenOnlyStation(st('missing'))).toBe(false);
  });
});

describe('TrackGraphIndex — shortest paths with region-neutral filters', () => {
  it('finds the km-shortest path and resolves distance, operators and legs', () => {
    const steps = graph.findShortestTrackPath(st('a1'), st('a4'), {
      operatorFilter: alphaOnly,
      allowShinkansen: false,
    });
    expect(steps).not.toBeNull();
    const path = graph.resolveSteps(steps ?? [], st('a1'));
    expect(path.stationIds).toEqual([st('a1'), st('a2'), st('a3'), st('a4')]);
    expect(path.totalOperatingKm).toBe(4.2);
    expect(path.operatorsInvolved).toEqual([ALPHA]);
    expect(path.legs.map((l) => l.railLineId)).toEqual([
      line('alpha-main'),
      line('alpha-main'),
      line('alpha-main'),
    ]);
    expect(path.commonFareZoneTags).toEqual(['zone:inner']);
    expect(path.hasRepeatedStationOrSegment).toBe(false);
  });

  it('hop mode and preferred lines can pick the detour corridor', () => {
    const preferred = graph.findShortestTrackPath(st('a2'), st('a4'), {
      preferLineIds: new Set([line('alpha-loop')]),
    });
    expect(graph.resolveSteps(preferred ?? [], st('a2')).stationIds).toEqual([
      st('a2'),
      st('l1'),
      st('a4'),
    ]);
    const avoided = graph.findShortestTrackPath(st('a2'), st('a4'), {
      preferLineIds: new Set([line('alpha-loop')]),
      avoidLineIds: new Set([line('alpha-loop')]),
    });
    expect(graph.resolveSteps(avoided ?? [], st('a2')).stationIds).toEqual([
      st('a2'),
      st('a3'),
      st('a4'),
    ]);
  });

  it('shinkansen, local-line, operator and fare-zone filters all narrow the search', () => {
    // Without the shinkansen, s1 → s4 still works through both in-gate transfers.
    const conventional = graph.findShortestTrackPath(st('s1'), st('s4'), {
      allowShinkansen: false,
    });
    expect(conventional?.filter((s) => s.kind === 'transfer')).toHaveLength(2);
    expect(
      graph.findShortestTrackPath(st('s1'), st('s4'), {
        allowShinkansen: false,
        allowTransfers: false,
      }),
    ).toBeNull();
    expect(graph.findShortestTrackPath(st('s1'), st('s4'), { allowShinkansen: true })?.length).toBe(
      1,
    );
    // With the shinkansen allowed, a1 → a4 is cheaper via s1 — s4 (3.62 < 4.2).
    const viaShinkansen = graph.findShortestTrackPath(st('a1'), st('a4'));
    expect(graph.resolveSteps(viaShinkansen ?? [], st('a1')).usesShinkansen).toBe(true);
    expect(graph.findShortestTrackPath(st('a1'), st('q1'), { allowLocalLines: false })).toBeNull();
    expect(
      graph.findShortestTrackPath(st('a1'), st('q1'), { requireFareZoneTag: 'zone:inner' }),
    ).toBeNull();
    expect(
      graph.findShortestTrackPath(st('b1'), st('b3'), { operatorFilter: alphaOnly }),
    ).toBeNull();
    expect(
      graph.findShortestTrackPath(st('b1'), st('b3'), { operatorFilter: (op) => op === BETA })
        ?.length,
    ).toBe(2);
  });

  it('crosses in-gate transfers unless disabled, and drops zone tags of off-zone stations', () => {
    const steps = graph.findShortestTrackPath(st('a2'), st('s4'), { allowShinkansen: false });
    expect(steps?.at(-1)?.kind).toBe('transfer');
    const path = graph.resolveSteps(steps ?? [], st('a2'));
    expect(path.stationIds.at(-1)).toBe(st('s4'));
    expect(path.legs).toHaveLength(2);
    expect(path.commonFareZoneTags).toEqual([]);
    expect(path.usesShinkansen).toBe(false);
    expect(graph.findShortestTrackPath(st('a1'), st('s4'), { allowTransfers: false })).toBeNull();
  });

  it('unknown km never becomes a partial sum', () => {
    const steps = graph.findShortestTrackPath(st('b1'), st('b3'));
    const path = graph.resolveSteps(steps ?? [], st('b1'));
    expect(path.legs).toHaveLength(2);
    expect(path.totalOperatingKm).toBeNull();
  });

  it('returns null / empty for unknown or identical endpoints', () => {
    expect(graph.findShortestTrackPath(st('a1'), st('zz'))).toBeNull();
    expect(graph.findShortestTrackPath(st('a1'), st('a1'))).toEqual([]);
  });
});

describe('TrackGraphIndex — explicit segment sequences', () => {
  it('resolves contiguous sequences in either direction and bridges in-gate transfers', () => {
    const path = graph.resolveExplicitSegments(st('a3'), [
      segIdOf('a2', 'a3'),
      segIdOf('a1', 'a2'),
      segIdOf('s1', 's4'),
    ]);
    expect(path?.stationIds).toEqual([st('a3'), st('a2'), st('a1'), st('s1'), st('s4')]);
    expect(path?.legs).toHaveLength(3);
    expect(path?.totalOperatingKm).toBe(6.9);
  });

  it('flags repeated stations / segments and rejects gaps', () => {
    const repeated = graph.resolveExplicitSegments(st('a1'), [
      segIdOf('a1', 'a2'),
      segIdOf('a1', 'a2'),
    ]);
    expect(repeated?.hasRepeatedStationOrSegment).toBe(true);
    expect(graph.resolveExplicitSegments(st('a1'), [segIdOf('a3', 'a4')])).toBeNull();
    expect(
      graph.resolveExplicitSegments(st('a1'), [segIdOf('a1', 'a2'), segIdOf('s1', 's4')], {
        transferFilter: () => false,
      }),
    ).toBeNull();
  });
});

describe('Line coverage honours ridden segments only (invariant 6)', () => {
  it('riding part of a line is never 100 %', () => {
    const refs = graph.lineSegmentRefs(line('alpha-main'));
    expect(refs).toHaveLength(3);
    const partial = computeLineCoverage(refs, [segIdOf('a1', 'a2')]);
    expect(partial.isComplete).toBe(false);
    expect(partial.kmRatio).toBeCloseTo(1.2 / 4.2, 10);
    const full = computeLineCoverage(
      refs,
      refs.map((r) => r.id),
    );
    expect(full.isComplete).toBe(true);
  });
});

describe('FareRuleGraph — billing-path overlay', () => {
  const fareGraph = new FareRuleGraph(graph);

  it('replaces a detour corridor only when the detour line is actually used', () => {
    const detour = graph.resolveExplicitSegments(st('a1'), [
      segIdOf('a1', 'a2'),
      segIdOf('a2', 'l1'),
      segIdOf('l1', 'a4'),
    ]);
    if (detour === null) {
      throw new Error('fixture');
    }
    expect(detour.totalOperatingKm).toBe(4.7);
    const billed = fareGraph.replaceCorridorOnPath(detour, {
      boundaryA: st('a2'),
      boundaryB: st('a4'),
      preferredLineId: line('alpha-main'),
      avoidLineId: line('alpha-loop'),
      search: { operatorFilter: alphaOnly, allowShinkansen: false, allowTransfers: false },
    });
    expect(billed?.stationIds).toEqual([st('a1'), st('a2'), st('a3'), st('a4')]);
    expect(billed?.totalOperatingKm).toBe(4.2);

    const direct = graph.resolveExplicitSegments(st('a1'), [
      segIdOf('a1', 'a2'),
      segIdOf('a2', 'a3'),
      segIdOf('a3', 'a4'),
    ]);
    if (direct === null) {
      throw new Error('fixture');
    }
    expect(
      fareGraph.replaceCorridorOnPath(direct, {
        boundaryA: st('a2'),
        boundaryB: st('a4'),
        preferredLineId: line('alpha-main'),
        avoidLineId: line('alpha-loop'),
      }),
    ).toBeNull();
  });

  it('computes the shortest billing path inside a fare zone', () => {
    const path = fareGraph.findShortestBillingPath(st('a1'), st('a4'), {
      requireFareZoneTag: 'zone:inner',
      allowShinkansen: false,
    });
    expect(path?.totalOperatingKm).toBe(4.2);
    expect(
      fareGraph.findShortestBillingPath(st('a1'), st('q1'), { requireFareZoneTag: 'zone:inner' }),
    ).toBeNull();
  });
});
