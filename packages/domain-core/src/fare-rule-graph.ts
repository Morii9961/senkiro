/**
 * FareRuleGraph: billing-path overlay on the TrackGraph. It computes statutory billing
 * paths that may differ from both the physical shortest path and the actual riding path
 * (specific-section corridor substitution, shortest path inside a fare zone). Which corridors
 * and zones apply is decided by regional fare packs; this class only provides the region-free
 * graph operations they compose.
 */
import type { ResolvedPath, SkId } from '@senkiro/contracts';
import type { TrackGraphIndex, TrackPathSearchOptions } from './track-graph.ts';

export interface CorridorReplacement {
  boundaryA: SkId<'station'>;
  boundaryB: SkId<'station'>;
  /** Line the statutory (shorter) corridor runs on. */
  preferredLineId: SkId<'line'>;
  /** Detour line whose use triggers the substitution. */
  avoidLineId: SkId<'line'>;
  /** Base search constraints for the replacement corridor (operators, shinkansen…). */
  search?: Omit<TrackPathSearchOptions, 'preferLineIds' | 'avoidLineIds'>;
}

export class FareRuleGraph {
  readonly trackGraph: TrackGraphIndex;

  constructor(trackGraph: TrackGraphIndex) {
    this.trackGraph = trackGraph;
  }

  /** Shortest billing path under the given constraints, e.g. inside one fare-zone tag. */
  findShortestBillingPath(
    originId: SkId<'station'>,
    destinationId: SkId<'station'>,
    search: TrackPathSearchOptions,
  ): ResolvedPath | null {
    const steps = this.trackGraph.findShortestTrackPath(originId, destinationId, search);
    if (steps === null) {
      return null;
    }
    return this.trackGraph.resolveSteps(steps, originId);
  }

  /**
   * Replace the sub-path between two boundary stations with the statutory corridor, but only
   * when the actual sub-path uses the detour line. Returns `null` when nothing is replaced.
   */
  replaceCorridorOnPath(path: ResolvedPath, replacement: CorridorReplacement): ResolvedPath | null {
    const { boundaryA, boundaryB, preferredLineId, avoidLineId } = replacement;
    const idxA = path.stationIds.indexOf(boundaryA);
    const idxB = path.stationIds.indexOf(boundaryB);
    if (idxA === -1 || idxB === -1) {
      return null;
    }
    const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
    const fromStation = path.stationIds[lo];
    const toStation = path.stationIds[hi];
    const origin = path.stationIds[0];
    if (fromStation === undefined || toStation === undefined || origin === undefined) {
      return null;
    }

    const insideLegs = path.legs.filter((leg) => {
      const start = path.stationIds.indexOf(leg.fromStationId);
      const end = path.stationIds.indexOf(leg.toStationId);
      return start >= lo && start <= hi && end >= lo && end <= hi;
    });
    const usesDetour = insideLegs.some(
      (leg) =>
        this.trackGraph.getSegment(leg.segmentId)?.railLineIds.includes(avoidLineId) ?? false,
    );
    if (!usesDetour) {
      return null;
    }

    const replacementSteps = this.trackGraph.findShortestTrackPath(fromStation, toStation, {
      ...replacement.search,
      preferLineIds: new Set([preferredLineId]),
      avoidLineIds: new Set([avoidLineId]),
    });
    if (replacementSteps === null) {
      return null;
    }

    const before: SkId<'segment'>[] = [];
    const after: SkId<'segment'>[] = [];
    let phase: 'before' | 'inside' | 'after' = 'before';
    for (const leg of path.legs) {
      if (phase === 'before' && leg.fromStationId === fromStation) {
        phase = 'inside';
      }
      if (phase === 'before') {
        before.push(leg.segmentId);
      } else if (phase === 'after') {
        after.push(leg.segmentId);
      }
      if (phase === 'inside' && leg.toStationId === toStation) {
        phase = 'after';
      }
    }
    const corridor = replacementSteps.flatMap((step) =>
      step.kind === 'track' ? [step.segment.id] : [],
    );
    return this.trackGraph.resolveExplicitSegments(origin, [...before, ...corridor, ...after]);
  }
}
