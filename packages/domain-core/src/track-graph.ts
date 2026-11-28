/**
 * Graph 1 · TrackGraph index (contract §5.1): physical track topology over the exact
 * `Station` / `TrackSegment` entities rendered on the map.
 *
 * Region-neutral by construction: no operator, line, station or fare-zone identifier is
 * hard-coded. Callers narrow a search through {@link TrackPathSearchOptions} (operator
 * predicates, fare-zone tags, preferred / avoided lines), which is how regional fare packs
 * express rules such as "JR conventional lines inside one suburban area" without the core
 * knowing any region.
 */
import type {
  Interchange,
  LineSegmentRef,
  PathLeg,
  RailLine,
  ResolvedPath,
  SkId,
  Station,
  TrackGraph,
  TrackSegment,
} from '@senkiro/contracts';
import { MinHeap } from './internal/min-heap.ts';

/** A traversal of one physical track segment, oriented `from → to`. */
export interface TrackEdge {
  kind: 'track';
  segment: TrackSegment;
  from: SkId<'station'>;
  to: SkId<'station'>;
}

/** An in-gate (paid-area) transfer between two station entities of one complex. */
export interface TransferEdge {
  kind: 'transfer';
  interchange: Interchange;
  from: SkId<'station'>;
  to: SkId<'station'>;
}

export type GraphStep = TrackEdge | TransferEdge;

export interface TrackPathSearchOptions {
  /** Only segments (and transfer endpoints) whose operator passes are traversed. */
  operatorFilter?: (operatorId: SkId<'operator'>) => boolean;
  /** Default `true`. */
  allowShinkansen?: boolean;
  /** Default `true`. Excludes `lineClass === 'local_line'` segments when `false`. */
  allowLocalLines?: boolean;
  /** Segments and transfer targets must carry this fare-zone tag (e.g. `'suburban:<area>'`). */
  requireFareZoneTag?: string;
  /** Segments on any of these lines get their weight multiplied by `preferredLineWeightFactor`. */
  preferLineIds?: ReadonlySet<SkId<'line'>>;
  /** Default `0.45` (Lab A calibration). */
  preferredLineWeightFactor?: number;
  /** Segments whose every line is avoided are skipped. */
  avoidLineIds?: ReadonlySet<SkId<'line'>>;
  /** Follow `in_gate` interchanges. Default `true`. */
  allowTransfers?: boolean;
  /** Search weight of one in-gate transfer. Default `0.01`. */
  transferWeight?: number;
  /** Default `'operating_km'`. */
  weightMode?: 'operating_km' | 'hops';
  /**
   * Search-only penalty for a segment whose operating km is unknown. Default `9999`.
   * It never leaks into billing: a path containing such a segment resolves with
   * `totalOperatingKm: null`.
   */
  unknownKmWeight?: number;
}

export interface ResolveExplicitOptions {
  /** Which in-gate transfers may bridge two non-adjacent segments. Default: all. */
  transferFilter?: (edge: TransferEdge) => boolean;
}

export type TrackGraphIssueCode =
  | 'DUPLICATE_ID'
  | 'SEGMENT_UNKNOWN_STATION'
  | 'SEGMENT_WITHOUT_LINE'
  | 'INTERCHANGE_UNKNOWN_STATION'
  | 'LINE_UNKNOWN_STATION';

/** A referential-integrity problem found while indexing. Offending edges are left out. */
export interface TrackGraphIssue {
  code: TrackGraphIssueCode;
  entityId: string;
  message: string;
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

function intersectInPlace(target: Set<string>, tags: readonly string[]): void {
  const keep = new Set(tags);
  for (const tag of target) {
    if (!keep.has(tag)) {
      target.delete(tag);
    }
  }
}

export class TrackGraphIndex {
  readonly dataset: TrackGraph;
  readonly stationsById: ReadonlyMap<SkId<'station'>, Station>;
  readonly linesById: ReadonlyMap<SkId<'line'>, RailLine>;
  readonly segmentsById: ReadonlyMap<SkId<'segment'>, TrackSegment>;
  readonly issues: readonly TrackGraphIssue[];

  private readonly adjacency = new Map<SkId<'station'>, TrackEdge[]>();
  private readonly transfers = new Map<SkId<'station'>, TransferEdge[]>();
  private readonly segmentsByLine = new Map<SkId<'line'>, TrackSegment[]>();

  constructor(dataset: TrackGraph) {
    this.dataset = dataset;
    const issues: TrackGraphIssue[] = [];
    const stations = new Map<SkId<'station'>, Station>();
    const lines = new Map<SkId<'line'>, RailLine>();
    const segments = new Map<SkId<'segment'>, TrackSegment>();

    const register = <K extends string, V>(map: Map<K, V>, id: K, value: V): boolean => {
      if (map.has(id)) {
        issues.push({ code: 'DUPLICATE_ID', entityId: id, message: `duplicate id ${id}` });
        return false;
      }
      map.set(id, value);
      return true;
    };

    for (const station of dataset.stations) {
      if (register(stations, station.id, station)) {
        this.adjacency.set(station.id, []);
        this.transfers.set(station.id, []);
      }
    }
    for (const line of dataset.lines) {
      register(lines, line.id, line);
      for (const stationId of line.stationIds) {
        if (!stations.has(stationId)) {
          issues.push({
            code: 'LINE_UNKNOWN_STATION',
            entityId: line.id,
            message: `line ${line.id} lists unknown station ${stationId}`,
          });
        }
      }
    }
    for (const segment of dataset.segments) {
      if (!register(segments, segment.id, segment)) {
        continue;
      }
      const fromEdges = this.adjacency.get(segment.fromStationId);
      const toEdges = this.adjacency.get(segment.toStationId);
      if (fromEdges === undefined || toEdges === undefined) {
        issues.push({
          code: 'SEGMENT_UNKNOWN_STATION',
          entityId: segment.id,
          message: `segment ${segment.id} references a station missing from the dataset`,
        });
        continue;
      }
      if (segment.railLineIds.length === 0) {
        issues.push({
          code: 'SEGMENT_WITHOUT_LINE',
          entityId: segment.id,
          message: `segment ${segment.id} belongs to no rail line`,
        });
        continue;
      }
      fromEdges.push({
        kind: 'track',
        segment,
        from: segment.fromStationId,
        to: segment.toStationId,
      });
      toEdges.push({
        kind: 'track',
        segment,
        from: segment.toStationId,
        to: segment.fromStationId,
      });
      for (const lineId of segment.railLineIds) {
        const list = this.segmentsByLine.get(lineId);
        if (list === undefined) {
          this.segmentsByLine.set(lineId, [segment]);
        } else {
          list.push(segment);
        }
      }
    }
    for (const interchange of dataset.interchanges) {
      const fromList = this.transfers.get(interchange.fromStationId);
      const toList = this.transfers.get(interchange.toStationId);
      if (fromList === undefined || toList === undefined) {
        issues.push({
          code: 'INTERCHANGE_UNKNOWN_STATION',
          entityId: interchange.id,
          message: `interchange ${interchange.id} references a station missing from the dataset`,
        });
        continue;
      }
      if (interchange.gateType !== 'in_gate') {
        continue;
      }
      fromList.push({
        kind: 'transfer',
        interchange,
        from: interchange.fromStationId,
        to: interchange.toStationId,
      });
      toList.push({
        kind: 'transfer',
        interchange,
        from: interchange.toStationId,
        to: interchange.fromStationId,
      });
    }

    this.stationsById = stations;
    this.linesById = lines;
    this.segmentsById = segments;
    this.issues = issues;
  }

  getStation(id: SkId<'station'>): Station | undefined {
    return this.stationsById.get(id);
  }

  getSegment(id: SkId<'segment'>): TrackSegment | undefined {
    return this.segmentsById.get(id);
  }

  getLine(id: SkId<'line'>): RailLine | undefined {
    return this.linesById.get(id);
  }

  /** Track edges leaving `stationId` (both directions of every incident segment). */
  edgesFrom(stationId: SkId<'station'>): readonly TrackEdge[] {
    return this.adjacency.get(stationId) ?? [];
  }

  /** In-gate transfer edges leaving `stationId`. */
  transfersFrom(stationId: SkId<'station'>): readonly TransferEdge[] {
    return this.transfers.get(stationId) ?? [];
  }

  getInterchangesForStation(stationId: SkId<'station'>): Interchange[] {
    return this.dataset.interchanges.filter(
      (ic) => ic.fromStationId === stationId || ic.toStationId === stationId,
    );
  }

  /** Every segment of a line, as the reference list `computeLineCoverage` expects. */
  lineSegmentRefs(lineId: SkId<'line'>): LineSegmentRef[] {
    return (this.segmentsByLine.get(lineId) ?? []).map((segment) => ({
      id: segment.id,
      operatingKm: segment.operatingKm,
    }));
  }

  /** True when every line serving the station is a shinkansen line (and it has at least one). */
  isShinkansenOnlyStation(stationId: SkId<'station'>): boolean {
    const station = this.stationsById.get(stationId);
    if (station === undefined || station.railLineIds.length === 0) {
      return false;
    }
    return station.railLineIds.every(
      (lineId) => this.linesById.get(lineId)?.lineClass === 'shinkansen',
    );
  }

  /** Dijkstra over track segments plus in-gate transfers. `null` when unreachable. */
  findShortestTrackPath(
    originId: SkId<'station'>,
    destinationId: SkId<'station'>,
    options: TrackPathSearchOptions = {},
  ): GraphStep[] | null {
    if (!this.stationsById.has(originId) || !this.stationsById.has(destinationId)) {
      return null;
    }
    if (originId === destinationId) {
      return [];
    }
    const allowShinkansen = options.allowShinkansen ?? true;
    const allowLocalLines = options.allowLocalLines ?? true;
    const allowTransfers = options.allowTransfers ?? true;
    const preferFactor = options.preferredLineWeightFactor ?? 0.45;
    const transferWeight = options.transferWeight ?? 0.01;
    const unknownKmWeight = options.unknownKmWeight ?? 9999;
    const { operatorFilter, requireFareZoneTag, preferLineIds, avoidLineIds } = options;

    const stationPasses = (stationId: SkId<'station'>): boolean => {
      const station = this.stationsById.get(stationId);
      if (station === undefined) {
        return false;
      }
      if (operatorFilter !== undefined && !operatorFilter(station.operatorId)) {
        return false;
      }
      return requireFareZoneTag === undefined || station.fareZoneTags.includes(requireFareZoneTag);
    };

    const dist = new Map<SkId<'station'>, number>([[originId, 0]]);
    const prev = new Map<SkId<'station'>, GraphStep>();
    const settled = new Set<SkId<'station'>>();
    const heap = new MinHeap<SkId<'station'>>();
    heap.push(0, originId);

    const relax = (step: GraphStep, candidate: number): void => {
      if (candidate < (dist.get(step.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(step.to, candidate);
        prev.set(step.to, step);
        heap.push(candidate, step.to);
      }
    };

    while (heap.size > 0) {
      const item = heap.pop();
      if (item === undefined) {
        break;
      }
      const { priority: d, value: u } = item;
      if (settled.has(u)) {
        continue;
      }
      settled.add(u);
      if (u === destinationId) {
        break;
      }
      for (const edge of this.edgesFrom(u)) {
        const segment = edge.segment;
        if (operatorFilter !== undefined && !operatorFilter(segment.operatorId)) {
          continue;
        }
        if (!allowShinkansen && segment.isShinkansen) {
          continue;
        }
        if (!allowLocalLines && segment.lineClass === 'local_line') {
          continue;
        }
        if (
          requireFareZoneTag !== undefined &&
          !segment.fareZoneTags.includes(requireFareZoneTag)
        ) {
          continue;
        }
        if (
          avoidLineIds !== undefined &&
          segment.railLineIds.every((lineId) => avoidLineIds.has(lineId))
        ) {
          continue;
        }
        let weight = options.weightMode === 'hops' ? 1 : (segment.operatingKm ?? unknownKmWeight);
        if (
          preferLineIds !== undefined &&
          segment.railLineIds.some((lineId) => preferLineIds.has(lineId))
        ) {
          weight *= preferFactor;
        }
        relax(edge, d + weight);
      }
      if (allowTransfers) {
        for (const transfer of this.transfersFrom(u)) {
          if (stationPasses(transfer.to) && stationPasses(transfer.from)) {
            relax(transfer, d + transferWeight);
          }
        }
      }
    }

    if (!prev.has(destinationId)) {
      return null;
    }
    const steps: GraphStep[] = [];
    let cursor: SkId<'station'> = destinationId;
    while (cursor !== originId) {
      const step = prev.get(cursor);
      if (step === undefined) {
        return null;
      }
      steps.push(step);
      cursor = step.from;
    }
    steps.reverse();
    return steps;
  }

  /**
   * Fold graph steps into a {@link ResolvedPath}: legs, repetition detection, operators,
   * distance (null as soon as any km is unknown) and the fare-zone tags shared by every
   * station and segment on the path.
   */
  resolveSteps(steps: readonly GraphStep[], originId: SkId<'station'>): ResolvedPath {
    const stationIds: SkId<'station'>[] = [originId];
    const segmentIds: SkId<'segment'>[] = [];
    const legs: PathLeg[] = [];
    const operators = new Set<SkId<'operator'>>();
    const seenStations = new Set<SkId<'station'>>([originId]);
    const seenSegments = new Set<SkId<'segment'>>();
    const commonTags = new Set<string>(this.stationsById.get(originId)?.fareZoneTags ?? []);
    let totalKm = 0;
    let unknownKm = false;
    let usesShinkansen = false;
    let usesLocalLine = false;
    let repeated = false;

    const absorbStation = (stationId: SkId<'station'>): void => {
      intersectInPlace(commonTags, this.stationsById.get(stationId)?.fareZoneTags ?? []);
    };

    for (const step of steps) {
      if (step.kind === 'transfer') {
        stationIds.push(step.to);
        absorbStation(step.to);
        continue;
      }
      const segment = step.segment;
      if (seenSegments.has(segment.id) || seenStations.has(step.to)) {
        repeated = true;
      }
      seenSegments.add(segment.id);
      seenStations.add(step.to);
      stationIds.push(step.to);
      segmentIds.push(segment.id);
      operators.add(segment.operatorId);
      if (segment.operatingKm === null) {
        unknownKm = true;
      } else {
        totalKm += segment.operatingKm;
      }
      usesShinkansen ||= segment.isShinkansen;
      usesLocalLine ||= segment.lineClass === 'local_line';
      intersectInPlace(commonTags, segment.fareZoneTags);
      absorbStation(step.to);
      const [railLineId] = segment.railLineIds;
      if (railLineId === undefined) {
        // Unreachable: segments without a line are never indexed as edges.
        continue;
      }
      legs.push({
        segmentId: segment.id,
        fromStationId: step.from,
        toStationId: step.to,
        railLineId,
        operatorId: segment.operatorId,
        operatingKm: segment.operatingKm,
        isShinkansen: segment.isShinkansen,
        lineClass: segment.lineClass,
      });
    }

    return {
      stationIds,
      segmentIds,
      legs,
      totalOperatingKm: unknownKm ? null : roundKm(totalKm),
      operatorsInvolved: [...operators],
      usesShinkansen,
      usesLocalLine,
      commonFareZoneTags: [...commonTags].sort(),
      hasRepeatedStationOrSegment: repeated,
    };
  }

  /**
   * Resolve a caller-supplied segment sequence starting at `originId`. Two segments that do
   * not share a station may be bridged by one in-gate transfer. `null` when the sequence is
   * not contiguous or references an unknown segment.
   */
  resolveExplicitSegments(
    originId: SkId<'station'>,
    segmentIds: readonly SkId<'segment'>[],
    options: ResolveExplicitOptions = {},
  ): ResolvedPath | null {
    if (!this.stationsById.has(originId)) {
      return null;
    }
    const steps: GraphStep[] = [];
    let cursor = originId;
    for (const segmentId of segmentIds) {
      const segment = this.segmentsById.get(segmentId);
      if (segment === undefined || segment.railLineIds.length === 0) {
        return null;
      }
      if (segment.fromStationId !== cursor && segment.toStationId !== cursor) {
        const bridge = this.transfersFrom(cursor).find(
          (transfer) =>
            (transfer.to === segment.fromStationId || transfer.to === segment.toStationId) &&
            (options.transferFilter === undefined || options.transferFilter(transfer)),
        );
        if (bridge === undefined) {
          return null;
        }
        steps.push(bridge);
        cursor = bridge.to;
      }
      const to = segment.fromStationId === cursor ? segment.toStationId : segment.fromStationId;
      steps.push({ kind: 'track', segment, from: cursor, to });
      cursor = to;
    }
    return this.resolveSteps(steps, originId);
  }
}
