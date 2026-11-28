/**
 * Graph 3 · ServiceGraph index (contract §5.3): operating patterns, trips, stop times and
 * cross-operator through services, kept apart from track ownership. Never consults the
 * TrackGraph, so a through service never implies a physical junction or a fare rule.
 */
import {
  requiresSyntheticDisclosure,
  type ServiceGraph,
  type ServicePattern,
  type SkId,
  type StopTime,
  type ThroughService,
  type Trip,
} from '@senkiro/contracts';

export class ServiceGraphIndex {
  readonly dataset: ServiceGraph;
  private readonly patternsById: ReadonlyMap<SkId<'service'>, ServicePattern>;
  private readonly tripsById: ReadonlyMap<SkId<'trip'>, Trip>;
  private readonly stopTimesByTrip: ReadonlyMap<SkId<'trip'>, StopTime[]>;

  constructor(dataset: ServiceGraph) {
    this.dataset = dataset;
    this.patternsById = new Map(dataset.servicePatterns.map((p) => [p.id, p]));
    this.tripsById = new Map(dataset.trips.map((t) => [t.id, t]));
    const byTrip = new Map<SkId<'trip'>, StopTime[]>();
    for (const stopTime of dataset.stopTimes) {
      const list = byTrip.get(stopTime.tripId);
      if (list === undefined) {
        byTrip.set(stopTime.tripId, [stopTime]);
      } else {
        list.push(stopTime);
      }
    }
    for (const list of byTrip.values()) {
      list.sort((a, b) => a.sequence - b.sequence);
    }
    this.stopTimesByTrip = byTrip;
  }

  getServicePattern(id: SkId<'service'>): ServicePattern | undefined {
    return this.patternsById.get(id);
  }

  getTrip(id: SkId<'trip'>): Trip | undefined {
    return this.tripsById.get(id);
  }

  getServicePatternsForLine(lineId: SkId<'line'>): ServicePattern[] {
    return this.dataset.servicePatterns.filter((p) => p.railLineIds.includes(lineId));
  }

  getServicePatternsStoppingAt(stationId: SkId<'station'>): ServicePattern[] {
    return this.dataset.servicePatterns.filter((p) => p.stopStationIds.includes(stationId));
  }

  getThroughServicesForLine(lineId: SkId<'line'>): ThroughService[] {
    return this.dataset.throughServices.filter(
      (ts) => ts.fromRailLineId === lineId || ts.toRailLineId === lineId,
    );
  }

  getThroughServicesAtStation(stationId: SkId<'station'>): ThroughService[] {
    return this.dataset.throughServices.filter((ts) => ts.boundaryStationId === stationId);
  }

  getTripsForServicePattern(servicePatternId: SkId<'service'>): Trip[] {
    return this.dataset.trips.filter((t) => t.servicePatternId === servicePatternId);
  }

  /** Stop times of a trip in `sequence` order. */
  getStopTimesForTrip(tripId: SkId<'trip'>): readonly StopTime[] {
    return this.stopTimesByTrip.get(tripId) ?? [];
  }

  /** Invariant 4: frequency-based or synthetic trips must be disclosed as such. */
  tripRequiresSyntheticDisclosure(tripId: SkId<'trip'>): boolean {
    const trip = this.tripsById.get(tripId);
    if (trip === undefined) {
      return false;
    }
    return requiresSyntheticDisclosure(trip.provenance, trip.schedulePrecision);
  }
}
