/**
 * Three-Graph Separation (Pure TypeScript, zero React dependency):
 *  1. TrackGraph    — Physical track topology built directly from Atlas Station & TrackSegment entities.
 *  2. ServiceGraph  — Operating services & cross-operator ThroughServices, independent of track ownership.
 *  3. FareRuleGraph — JR billing graph overlay applying Art. 69, Art. 157(2), and Art. 16-2 predicates.
 */

import type {
  AtlasDataset,
  Interchange,
  PathLeg,
  RailLine,
  ResolvedPath,
  ServicePattern,
  SkId,
  Station,
  ThroughService,
  TrackSegment,
} from './types.js';

export interface TrackEdge {
  segment: TrackSegment;
  from: SkId<'station'>;
  to: SkId<'station'>;
  isTransferEdge?: false;
}

export interface JrTransferEdge {
  from: SkId<'station'>;
  to: SkId<'station'>;
  interchange: Interchange;
  isTransferEdge: true;
}

export type GraphStep = TrackEdge | JrTransferEdge;

/**
 * 1. TRACK TOPOLOGY GRAPH (軌道拓扑图)
 * Reuses the exact Station and TrackSegment entities rendered on the map.
 */
export class TrackGraph {
  readonly stationsById: Map<SkId<'station'>, Station>;
  readonly linesById: Map<SkId<'line'>, RailLine>;
  readonly segmentsById: Map<SkId<'segment'>, TrackSegment>;
  readonly adjacency: Map<SkId<'station'>, TrackEdge[]>;
  readonly jrInGateTransfers: Map<SkId<'station'>, JrTransferEdge[]>;

  constructor(dataset: AtlasDataset) {
    this.stationsById = new Map(dataset.stations.map((s) => [s.id, s]));
    this.linesById = new Map(dataset.railLines.map((l) => [l.id, l]));
    this.segmentsById = new Map(dataset.trackSegments.map((seg) => [seg.id, seg]));
    this.adjacency = new Map();
    this.jrInGateTransfers = new Map();

    for (const s of dataset.stations) {
      this.adjacency.set(s.id, []);
      this.jrInGateTransfers.set(s.id, []);
    }

    for (const seg of dataset.trackSegments) {
      this.adjacency.get(seg.fromStationId)?.push({
        segment: seg,
        from: seg.fromStationId,
        to: seg.toStationId,
      });
      this.adjacency.get(seg.toStationId)?.push({
        segment: seg,
        from: seg.toStationId,
        to: seg.fromStationId,
      });
    }

    // Add JR <-> JR in-gate transfer edges (e.g., JR East <-> JR Central at Tokyo, Shinagawa, Odawara, Atami)
    for (const ic of dataset.interchanges) {
      const fromSt = this.stationsById.get(ic.fromStationId);
      const toSt = this.stationsById.get(ic.toStationId);
      if (!fromSt || !toSt) continue;
      const isJr = (op: SkId<'operator'>) =>
        op === 'sk:operator:jr-east' || op === 'sk:operator:jr-central';
      if (isJr(fromSt.operatorId) && isJr(toSt.operatorId) && ic.gateType === 'in_gate') {
        this.jrInGateTransfers.get(ic.fromStationId)?.push({
          from: ic.fromStationId,
          to: ic.toStationId,
          interchange: ic,
          isTransferEdge: true,
        });
        this.jrInGateTransfers.get(ic.toStationId)?.push({
          from: ic.toStationId,
          to: ic.fromStationId,
          interchange: ic,
          isTransferEdge: true,
        });
      }
    }
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

  /**
   * Finds shortest path on physical tracks (optionally filtering allowed edges).
   */
  findShortestTrackPath(
    originId: SkId<'station'>,
    destId: SkId<'station'>,
    options?: {
      allowShinkansen?: boolean;
      allowOnlyJr?: boolean;
      allowOnlySuburban?: boolean;
      allowLocalLines?: boolean;
      preferLineIds?: Set<SkId<'line'>>;
      avoidLineIds?: Set<SkId<'line'>>;
      allowJrTransfers?: boolean;
      weightMode?: 'operating_km' | 'hops';
    },
  ): GraphStep[] | null {
    const allowShinkansen = options?.allowShinkansen ?? false;
    const allowOnlyJr = options?.allowOnlyJr ?? true;
    const allowOnlySuburban = options?.allowOnlySuburban ?? false;
    const allowLocalLines = options?.allowLocalLines ?? true;
    const allowJrTransfers = options?.allowJrTransfers ?? true;
    const preferLineIds = options?.preferLineIds;
    const avoidLineIds = options?.avoidLineIds;

    if (!this.stationsById.has(originId) || !this.stationsById.has(destId)) {
      return null;
    }
    if (originId === destId) return [];

    const dist = new Map<SkId<'station'>, number>([[originId, 0]]);
    const prev = new Map<SkId<'station'>, GraphStep>();
    const visited = new Set<SkId<'station'>>();
    const pq: [number, SkId<'station'>][] = [[0, originId]];

    const isJrOp = (op: SkId<'operator'>) =>
      op === 'sk:operator:jr-east' || op === 'sk:operator:jr-central';

    while (pq.length > 0) {
      pq.sort((a, b) => a[0] - b[0]);
      const item = pq.shift();
      if (!item) break;
      const [d, u] = item;
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === destId) break;

      const trackEdges = this.adjacency.get(u) ?? [];
      for (const edge of trackEdges) {
        const seg = edge.segment;
        if (allowOnlyJr && !isJrOp(seg.operatorId)) continue;
        if (!allowShinkansen && seg.isShinkansen) continue;
        if (allowOnlySuburban && !seg.inTokyoSuburbanArea) continue;
        if (!allowLocalLines && seg.lineClass === 'local_line') continue;
        if (avoidLineIds && seg.railLineIds.every((lid) => avoidLineIds.has(lid))) continue;

        let weight =
          options?.weightMode === 'hops'
            ? 1
            : seg.operatingKm !== null
              ? seg.operatingKm
              : 9999;

        if (preferLineIds && seg.railLineIds.some((lid) => preferLineIds.has(lid))) {
          weight = weight * 0.45;
        }

        const nd = d + weight;
        if (nd < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, nd);
          prev.set(edge.to, edge);
          pq.push([nd, edge.to]);
        }
      }

      if (allowJrTransfers) {
        const xfers = this.jrInGateTransfers.get(u) ?? [];
        for (const xf of xfers) {
          const targetSt = this.stationsById.get(xf.to);
          if (!targetSt) continue;
          if (allowOnlySuburban && !targetSt.inTokyoSuburbanArea) continue;
          const nd = d + 0.01;
          if (nd < (dist.get(xf.to) ?? Infinity)) {
            dist.set(xf.to, nd);
            prev.set(xf.to, xf);
            pq.push([nd, xf.to]);
          }
        }
      }
    }

    if (!prev.has(destId)) return null;

    const steps: GraphStep[] = [];
    let cur: SkId<'station'> = destId;
    while (cur !== originId) {
      const step = prev.get(cur);
      if (!step) return null;
      steps.push(step);
      cur = step.from;
    }
    steps.reverse();
    return steps;
  }

  /**
   * Resolves a sequence of graph steps into a structured ResolvedPath with
   * station repetition detection, operator list, distance aggregation, and suburban flags.
   */
  resolveSteps(steps: GraphStep[], originId: SkId<'station'>): ResolvedPath {
    const stationIds: SkId<'station'>[] = [originId];
    const segmentIds: SkId<'segment'>[] = [];
    const legs: PathLeg[] = [];
    const operatorsSet = new Set<SkId<'operator'>>();
    const seenStations = new Set<SkId<'station'>>([originId]);
    const seenSegments = new Set<SkId<'segment'>>();

    let totalKm = 0;
    let hasNullKm = false;
    let usesShinkansen = false;
    let usesLocalLine = false;
    let allSuburban = true;
    let hasRepeated = false;

    const originStation = this.stationsById.get(originId);
    if (originStation && !originStation.inTokyoSuburbanArea) {
      allSuburban = false;
    }

    for (const step of steps) {
      if (step.isTransferEdge) {
        // Same physical station complex transfer (e.g., JR East Tokyo -> JR Central Tokyo Shinkansen)
        stationIds.push(step.to);
        const toSt = this.stationsById.get(step.to);
        if (toSt && !toSt.inTokyoSuburbanArea) {
          // Note: JR Central Tokyo is Shinkansen, not Tokyo Suburban Area
          allSuburban = false;
        }
        continue;
      }

      const seg = step.segment;
      if (seenSegments.has(seg.id)) {
        hasRepeated = true;
      }
      seenSegments.add(seg.id);

      if (seenStations.has(step.to)) {
        hasRepeated = true;
      }
      seenStations.add(step.to);

      stationIds.push(step.to);
      segmentIds.push(seg.id);
      operatorsSet.add(seg.operatorId);

      if (seg.operatingKm === null) {
        hasNullKm = true;
      } else {
        totalKm += seg.operatingKm;
      }
      if (seg.isShinkansen) usesShinkansen = true;
      if (seg.lineClass === 'local_line') usesLocalLine = true;
      if (!seg.inTokyoSuburbanArea) allSuburban = false;

      const toSt = this.stationsById.get(step.to);
      if (toSt && !toSt.inTokyoSuburbanArea) allSuburban = false;

      legs.push({
        segmentId: seg.id,
        fromStationId: step.from,
        toStationId: step.to,
        railLineId: seg.railLineIds[0] ?? 'sk:line:unknown',
        operatorId: seg.operatorId,
        operatingKm: seg.operatingKm,
        isShinkansen: seg.isShinkansen,
        lineClass: seg.lineClass,
      });
    }

    return {
      stationIds,
      segmentIds,
      legs,
      totalOperatingKm: hasNullKm ? null : Math.round(totalKm * 10) / 10,
      operatorsInvolved: [...operatorsSet],
      usesShinkansen,
      usesLocalLine,
      allWithinTokyoSuburbanArea: allSuburban && !usesShinkansen,
      hasRepeatedStationOrSegment: hasRepeated,
    };
  }

  /**
   * Builds a ResolvedPath from an explicit caller-supplied list of TrackSegment IDs.
   */
  resolveExplicitSegments(
    originId: SkId<'station'>,
    segmentIds: SkId<'segment'>[],
  ): ResolvedPath | null {
    const steps: GraphStep[] = [];
    let cur = originId;
    for (const segId of segmentIds) {
      const seg = this.segmentsById.get(segId);
      if (!seg) return null;
      if (seg.fromStationId === cur) {
        steps.push({ segment: seg, from: cur, to: seg.toStationId });
        cur = seg.toStationId;
      } else if (seg.toStationId === cur) {
        steps.push({ segment: seg, from: cur, to: seg.fromStationId });
        cur = seg.fromStationId;
      } else {
        // Try a JR in-gate transfer at the current station complex (e.g. JR East <-> JR Central at Tokyo)
        const xfer = (this.jrInGateTransfers.get(cur) ?? []).find(
          (x) => x.to === seg.fromStationId || x.to === seg.toStationId,
        );
        if (!xfer) return null;
        steps.push(xfer);
        cur = xfer.to;
        if (seg.fromStationId === cur) {
          steps.push({ segment: seg, from: cur, to: seg.toStationId });
          cur = seg.toStationId;
        } else {
          steps.push({ segment: seg, from: cur, to: seg.fromStationId });
          cur = seg.fromStationId;
        }
      }
    }
    return this.resolveSteps(steps, originId);
  }
}

/**
 * 2. OPERATING SERVICE GRAPH (运营服务图)
 * Separates train operating patterns & cross-company ThroughServices from track ownership.
 */
export class ServiceGraph {
  readonly servicePatterns: ServicePattern[];
  readonly throughServices: ThroughService[];
  readonly interchanges: Interchange[];

  constructor(dataset: AtlasDataset) {
    this.servicePatterns = dataset.servicePatterns;
    this.throughServices = dataset.throughServices;
    this.interchanges = dataset.interchanges;
  }

  getThroughServicesForLine(lineId: SkId<'line'>): ThroughService[] {
    return this.throughServices.filter(
      (ts) => ts.fromRailLineId === lineId || ts.toRailLineId === lineId,
    );
  }

  getThroughServicesAtStation(stationId: SkId<'station'>): ThroughService[] {
    return this.throughServices.filter((ts) => ts.boundaryStationId === stationId);
  }

  getServicePatternsForLine(lineId: SkId<'line'>): ServicePattern[] {
    return this.servicePatterns.filter((sp) => sp.railLineIds.includes(lineId));
  }

  getInterchangesForStation(stationId: SkId<'station'>): Interchange[] {
    return this.interchanges.filter(
      (ic) => ic.fromStationId === stationId || ic.toStationId === stationId,
    );
  }
}

/**
 * 3. FARE RULE GRAPH (计费规则图)
 * Computes JR billing paths distinct from physical shortest path or actual riding path:
 *  - Art. 69 specific section replacement (detour corridor -> shorter statutory billing corridor)
 *  - Art. 157(2) Tokyo Suburban Area shortest billing path
 *  - Art. 16-2 Shinkansen -> parallel conventional line mapping (when predicate holds)
 */
export class FareRuleGraph {
  constructor(private readonly trackGraph: TrackGraph) {}

  /**
   * Computes shortest JR conventional billing path within Tokyo Suburban Area (Art. 157(2)).
   */
  findSuburbanShortestBillingPath(
    originId: SkId<'station'>,
    destId: SkId<'station'>,
  ): ResolvedPath | null {
    const steps = this.trackGraph.findShortestTrackPath(originId, destId, {
      allowShinkansen: false,
      allowOnlyJr: true,
      allowOnlySuburban: true,
      allowLocalLines: false,
      allowJrTransfers: false,
      weightMode: 'operating_km',
    });
    if (!steps) return null;
    return this.trackGraph.resolveSteps(steps, originId);
  }

  /**
   * Replaces a sub-path between boundary stations [startIdx..endIdx] with a statutory Art. 69 shorter corridor.
   */
  replaceCorridorOnPath(
    path: ResolvedPath,
    boundaryA: SkId<'station'>,
    boundaryB: SkId<'station'>,
    preferredLineId: SkId<'line'>,
    avoidLineId: SkId<'line'>,
  ): ResolvedPath | null {
    const idxA = path.stationIds.indexOf(boundaryA);
    const idxB = path.stationIds.indexOf(boundaryB);
    if (idxA === -1 || idxB === -1) return null;

    const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
    const fromSt = path.stationIds[lo];
    const toSt = path.stationIds[hi];
    if (!fromSt || !toSt) return null;

    // Check that the actual path between lo and hi actually traverses avoidLineId
    const subLegs = path.legs.filter((_, i) => {
      // Find legs belonging between lo and hi
      const legStart = path.legs[i]?.fromStationId;
      const legEnd = path.legs[i]?.toStationId;
      if (!legStart || !legEnd) return false;
      const posStart = path.stationIds.indexOf(legStart);
      const posEnd = path.stationIds.indexOf(legEnd);
      return posStart >= lo && posStart <= hi && posEnd >= lo && posEnd <= hi;
    });
    const usesAvoided = subLegs.some((leg) => {
      const seg = this.trackGraph.getSegment(leg.segmentId);
      return seg?.railLineIds.includes(avoidLineId) ?? false;
    });
    if (!usesAvoided) return null;

    const replacementSteps = this.trackGraph.findShortestTrackPath(fromSt, toSt, {
      allowShinkansen: false,
      allowOnlyJr: true,
      allowLocalLines: false,
      preferLineIds: new Set([preferredLineId]),
      avoidLineIds: new Set([avoidLineId]),
      allowJrTransfers: false,
      weightMode: 'operating_km',
    });
    if (!replacementSteps) return null;

    // Rebuild full segment sequence: prefix legs + replacement segments + suffix legs
    const beforeSegs: SkId<'segment'>[] = [];
    const afterSegs: SkId<'segment'>[] = [];
    let phase: 'before' | 'inside' | 'after' = 'before';

    for (const leg of path.legs) {
      if (phase === 'before' && leg.fromStationId === fromSt) {
        phase = 'inside';
      }
      if (phase === 'before') {
        beforeSegs.push(leg.segmentId);
      } else if (phase === 'after') {
        afterSegs.push(leg.segmentId);
      }
      if (phase === 'inside' && leg.toStationId === toSt) {
        phase = 'after';
      }
    }

    const repSegs = replacementSteps
      .filter((s): s is TrackEdge => !s.isTransferEdge)
      .map((s) => s.segment.id);

    const origin = path.stationIds[0];
    if (!origin) return null;
    return this.trackGraph.resolveExplicitSegments(origin, [
      ...beforeSegs,
      ...repSegs,
      ...afterSegs,
    ]);
  }
}
