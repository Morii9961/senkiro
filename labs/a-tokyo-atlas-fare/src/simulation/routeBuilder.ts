/**
 * SENKIRO Atlas v2 — Physical Track Network Adapter, Connectivity Validator & Runnable Route Builder.
 *
 * Bridges Session 0's `AtlasDataset` + `SolvedRailwayNetwork3D` into validated `RunnableTrackRoute`s
 * and `TrackSpline3D` curves while strictly enforcing:
 *  1. Separation between nominal `RailLine` and physical 3D `TrackSegment` (`SolvedSegment3D`).
 *  2. Double-track directional lateral separation (left-hand traffic in Japan, ±1.85m from corridor center)
 *     vs single-track shared physical blocks.
 *  3. Prohibition of train traversal across unconnected stations or spatially discontinuous track segments.
 *  4. Support for `loop` (closed ring), `shuttle` (out-and-back with terminal turnaround), and `one_way` modes.
 */

import {
  solveRailwayNetwork3D,
  type SolvedPoint3D,
  type SolvedRailwayNetwork3D,
  type SolvedSegment3D,
  type SolvedStationNode3D,
} from '../domain/elevationSolver.js';
import type { AtlasDataset, OsmVerticalDataset, SkId } from '../domain/types.js';
import { TrackSpline3D } from './trackSpline3D.js';
import {
  SIMULATION_LABEL,
  type PhysicalTrackPathSegment,
  type RailwayNetworkSimulationSource,
  type RouteConnectivityReport,
  type RouteOperationMode,
  type RunDirection,
  type RunnableTrackRoute,
  type SimulatedOperatingLine,
  type SimulatedPlatformStop,
  type TrackBlockSection,
} from './types.js';

export const DOUBLE_TRACK_HALF_SEPARATION_M = 1.85;
export const MAX_ALLOWED_JUNCTION_GAP_M = 35.0;

/**
 * Offsets a chain of 3D solved track points laterally in the horizontal XZ plane
 * while preserving exact vertical elevation `y`, tier, and structure.
 *
 * In SENKIRO's right-handed world (+X East, +Y Up, -Z North):
 * Given forward horizontal tangent `(dx, dz) / len`, the right-hand normal is `(-dz, dx) / len`
 * (or `(dz, -dx)` depending on orientation; consistent with `elevationSolver.ts`:
 *  `nx = -dz / len, nz = dx / len`).
 * A negative offset shifts to the left-hand track (Japanese standard left-hand running).
 */
export function applyLateralTrackOffset3D(
  points: readonly SolvedPoint3D[],
  lateralOffsetM: number,
): SolvedPoint3D[] {
  if (points.length < 2 || Math.abs(lateralOffsetM) < 1e-3) {
    return points.map((p) => ({ ...p }));
  }

  const out: SolvedPoint3D[] = [];
  let accumDist = 0;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const cur = points[i]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const hLen = Math.hypot(dx, dz) || 1;
    const nx = -dz / hLen;
    const nz = dx / hLen;

    const x = cur.x + nx * lateralOffsetM;
    const z = cur.z + nz * lateralOffsetM;
    if (i > 0) {
      const prevOut = out[i - 1]!;
      accumDist += Math.hypot(x - prevOut.x, cur.y - prevOut.y, z - prevOut.z);
    }

    out.push({
      ...cur,
      x,
      z,
      distFromStart: accumDist,
    });
  }

  const total = accumDist || 1;
  return out.map((pt) => ({
    ...pt,
    t: pt.distFromStart / total,
  }));
}

/**
 * Session 0 Atlas + Solved 3D Network Adapter implementing `RailwayNetworkSimulationSource`.
 */
export class Session0AtlasNetworkAdapter implements RailwayNetworkSimulationSource {
  readonly sourceKind = 'session0_atlas' as const;
  readonly dataset: AtlasDataset;
  readonly solved: SolvedRailwayNetwork3D;

  private readonly lines: SimulatedOperatingLine[];
  private readonly lineById = new Map<SkId<'line'>, SimulatedOperatingLine>();
  private readonly solvedSegmentsByPair = new Map<
    string,
    { seg: SolvedSegment3D; reversed: boolean }[]
  >();
  private readonly stationNodesByKey = new Map<string, SolvedStationNode3D>();
  private readonly applyDoubleTrackOffset: boolean;

  constructor(
    dataset: AtlasDataset,
    solvedOrOsm?: SolvedRailwayNetwork3D | OsmVerticalDataset | null,
    options?: { applyDoubleTrackOffset?: boolean },
  ) {
    this.dataset = dataset;
    this.applyDoubleTrackOffset = options?.applyDoubleTrackOffset ?? true;

    if (solvedOrOsm && 'segments' in solvedOrOsm && 'stationNodes' in solvedOrOsm) {
      this.solved = solvedOrOsm;
    } else {
      this.solved = solveRailwayNetwork3D(
        dataset,
        (solvedOrOsm as OsmVerticalDataset | null | undefined) ?? null,
      );
    }

    this.lines = dataset.railLines.map((l) => ({
      lineId: l.id,
      operatorId: l.operatorId,
      nameJa: l.names.ja ?? l.id,
      nameEn: l.names.en,
      color: l.color,
      lineClass: l.lineClass,
      stationIds: [...l.stationIds],
    }));

    for (const l of this.lines) {
      this.lineById.set(l.lineId, l);
    }

    for (const seg of this.solved.segments) {
      const fwdKey = `${seg.fromStationId}::${seg.toStationId}`;
      const revKey = `${seg.toStationId}::${seg.fromStationId}`;
      if (!this.solvedSegmentsByPair.has(fwdKey)) {
        this.solvedSegmentsByPair.set(fwdKey, []);
      }
      if (!this.solvedSegmentsByPair.has(revKey)) {
        this.solvedSegmentsByPair.set(revKey, []);
      }
      this.solvedSegmentsByPair.get(fwdKey)!.push({ seg, reversed: false });
      this.solvedSegmentsByPair.get(revKey)!.push({ seg, reversed: true });
    }

    for (const node of this.solved.stationNodes) {
      this.stationNodesByKey.set(`${node.lineId}::${node.stationId}`, node);
      if (!this.stationNodesByKey.has(node.stationId)) {
        this.stationNodesByKey.set(node.stationId, node);
      }
    }
  }

  getLines(): readonly SimulatedOperatingLine[] {
    return this.lines;
  }

  getLineById(lineId: SkId<'line'>): SimulatedOperatingLine | undefined {
    return this.lineById.get(lineId);
  }

  getStationNode(
    stationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): SolvedStationNode3D | undefined {
    if (lineId) {
      const exact = this.stationNodesByKey.get(`${lineId}::${stationId}`);
      if (exact) return exact;
    }
    return this.stationNodesByKey.get(stationId);
  }

  hasPhysicalTrackConnection(
    fromStationId: SkId<'station'>,
    toStationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): boolean {
    return this.getPhysicalSegment(fromStationId, toStationId, lineId) !== undefined;
  }

  getPhysicalSegment(
    fromStationId: SkId<'station'>,
    toStationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): PhysicalTrackPathSegment | undefined {
    const candidates = this.solvedSegmentsByPair.get(`${fromStationId}::${toStationId}`);
    if (!candidates || candidates.length === 0) return undefined;

    const match =
      (lineId
        ? candidates.find(
            (c) => c.seg.primaryLineId === lineId || c.seg.railLineIds.includes(lineId),
          )
        : undefined) ?? candidates[0]!;

    // If a specific lineId was requested and none of the candidate physical segments belong to that line
    // (or share tracks with it), do not jump across unrelated operators' tracks
    if (
      lineId &&
      !match.seg.railLineIds.includes(lineId) &&
      match.seg.primaryLineId !== lineId
    ) {
      return undefined;
    }

    const basePts = match.reversed
      ? [...match.seg.points].reverse()
      : [...match.seg.points];

    const lateralOffsetM =
      this.applyDoubleTrackOffset && match.seg.isDoubleTrack
        ? -DOUBLE_TRACK_HALF_SEPARATION_M
        : 0;

    const directedPts = applyLateralTrackOffset3D(basePts, lateralOffsetM);
    const lengthM =
      directedPts.length > 0 ? directedPts[directedPts.length - 1]!.distFromStart : 0;

    return {
      trackSegmentId: match.seg.segmentId,
      fromStationId,
      toStationId,
      operatorId: match.seg.operatorId,
      railLineIds: [...match.seg.railLineIds],
      isDoubleTrack: match.seg.isDoubleTrack,
      isShinkansen: match.seg.isShinkansen,
      lineClass: match.seg.isShinkansen ? 'shinkansen' : 'trunk',
      directionalLateralOffsetM: lateralOffsetM,
      points3D: directedPts,
      lengthM,
      dominantTier: match.seg.dominantTier,
      dominantStructure: match.seg.dominantStructure,
    };
  }
}

export interface BuildRouteOptions {
  readonly routeId?: string;
  readonly lineId: SkId<'line'>;
  /** Ordered station sequence to traverse. Defaults to the line's `stationIds` */
  readonly stationIds?: readonly SkId<'station'>[];
  readonly direction?: RunDirection;
  readonly mode?: RouteOperationMode;
  readonly reverseRouteId?: string | null;
  readonly defaultDwellSec?: number;
  readonly targetBlockLengthM?: number;
  readonly maxJunctionGapM?: number;
  /** Strictly enforce lineId match when resolving track segments (default false allows shared physical corridors like Yamanote loop across Tokaido/Tohoku tracks) */
  readonly strictLineMatch?: boolean;
}

export interface BuiltRouteBundle {
  readonly route: RunnableTrackRoute;
  readonly spline: TrackSpline3D;
}

/**
 * Validates physical track connectivity across `stationIds` and builds a `RunnableTrackRoute`
 * along with its `TrackSpline3D`, station platform stop targets, and block occupancy sections.
 *
 * Never uses the nominal `RailLine` polyline directly — always stitches solved 3D `PhysicalTrackPathSegment`s.
 */
export function buildRunnableTrackRoute(
  source: RailwayNetworkSimulationSource,
  options: BuildRouteOptions,
): BuiltRouteBundle {
  const line = source.getLineById(options.lineId);
  const stationIds = options.stationIds ?? line?.stationIds ?? [];
  const mode: RouteOperationMode = options.mode ?? 'shuttle';
  const isLoop = mode === 'loop';
  const direction: RunDirection =
    options.direction ?? (isLoop ? 'clockwise' : 'outbound');
  const routeId =
    options.routeId ?? `sim:route:${options.lineId.replace('sk:line:', '')}:${direction}`;
  const defaultDwellSec = options.defaultDwellSec ?? 20;
  const targetBlockLengthM = options.targetBlockLengthM ?? 180;
  const maxJunctionGapM = options.maxJunctionGapM ?? MAX_ALLOWED_JUNCTION_GAP_M;

  if (stationIds.length < 2) {
    const emptyConnectivity: RouteConnectivityReport = {
      valid: false,
      disconnectIndex: 0,
      fromStationId: stationIds[0] ?? null,
      toStationId: null,
      spatialGapM: 0,
      reason: 'A runnable route requires at least 2 connected stations.',
    };
    const emptyRoute: RunnableTrackRoute = {
      routeId,
      lineId: options.lineId,
      operatorId: line?.operatorId ?? 'sk:operator:unknown',
      nameJa: line?.nameJa ?? options.lineId,
      nameEn: line?.nameEn ?? options.lineId,
      color: line?.color ?? '#64748b',
      direction,
      mode,
      isLoop,
      reverseRouteId: options.reverseRouteId ?? null,
      segments: [],
      stationStops: [],
      blocks: [],
      totalLengthM: 0,
      connectivity: emptyConnectivity,
      simulationLabel: SIMULATION_LABEL,
      dataNature: 'synthetic',
    };
    return { route: emptyRoute, spline: new TrackSpline3D([]) };
  }

  // Build effective station chain (for loop mode, ensure final station closes back to stationIds[0])
  const effectiveStations: SkId<'station'>[] = [...stationIds];
  if (isLoop && effectiveStations[effectiveStations.length - 1] !== effectiveStations[0]) {
    effectiveStations.push(effectiveStations[0]!);
  }

  const segments: PhysicalTrackPathSegment[] = [];
  let maxObservedGapM = 0;

  for (let i = 0; i < effectiveStations.length - 1; i++) {
    const fromId = effectiveStations[i]!;
    const toId = effectiveStations[i + 1]!;
    const seg =
      source.getPhysicalSegment(fromId, toId, options.lineId) ??
      (options.strictLineMatch ? undefined : source.getPhysicalSegment(fromId, toId));

    if (!seg || seg.points3D.length < 2) {
      const report: RouteConnectivityReport = {
        valid: false,
        disconnectIndex: i,
        fromStationId: fromId,
        toStationId: toId,
        spatialGapM: Infinity,
        reason: `No physical track segment connects ${fromId} -> ${toId} on line ${options.lineId}. Train passage prohibited.`,
      };
      const invalidRoute: RunnableTrackRoute = {
        routeId,
        lineId: options.lineId,
        operatorId: line?.operatorId ?? 'sk:operator:unknown',
        nameJa: line?.nameJa ?? options.lineId,
        nameEn: line?.nameEn ?? options.lineId,
        color: line?.color ?? '#64748b',
        direction,
        mode,
        isLoop,
        reverseRouteId: options.reverseRouteId ?? null,
        segments,
        stationStops: [],
        blocks: [],
        totalLengthM: 0,
        connectivity: report,
        simulationLabel: SIMULATION_LABEL,
        dataNature: 'synthetic',
      };
      return { route: invalidRoute, spline: new TrackSpline3D([]) };
    }

    // Check 3D spatial continuity at intermediate station junction
    if (segments.length > 0) {
      const prevSeg = segments[segments.length - 1]!;
      const prevEnd = prevSeg.points3D[prevSeg.points3D.length - 1]!;
      const curStart = seg.points3D[0]!;
      const gapM = Math.hypot(
        curStart.x - prevEnd.x,
        curStart.y - prevEnd.y,
        curStart.z - prevEnd.z,
      );
      if (gapM > maxObservedGapM) {
        maxObservedGapM = gapM;
      }
      if (gapM > maxJunctionGapM) {
        const report: RouteConnectivityReport = {
          valid: false,
          disconnectIndex: i,
          fromStationId: fromId,
          toStationId: toId,
          spatialGapM: Math.round(gapM * 100) / 100,
          reason: `Discontinuous physical track geometry at station ${fromId} (3D gap ${gapM.toFixed(1)}m exceeds ${maxJunctionGapM}m limit).`,
        };
        const invalidRoute: RunnableTrackRoute = {
          routeId,
          lineId: options.lineId,
          operatorId: line?.operatorId ?? 'sk:operator:unknown',
          nameJa: line?.nameJa ?? options.lineId,
          nameEn: line?.nameEn ?? options.lineId,
          color: line?.color ?? '#64748b',
          direction,
          mode,
          isLoop,
          reverseRouteId: options.reverseRouteId ?? null,
          segments,
          stationStops: [],
          blocks: [],
          totalLengthM: 0,
          connectivity: report,
          simulationLabel: SIMULATION_LABEL,
          dataNature: 'synthetic',
        };
        return { route: invalidRoute, spline: new TrackSpline3D([]) };
      }
    }

    segments.push(seg);
  }

  // Check loop closure spatial continuity if isLoop
  if (isLoop && segments.length >= 2) {
    const firstPt = segments[0]!.points3D[0]!;
    const lastSeg = segments[segments.length - 1]!;
    const lastPt = lastSeg.points3D[lastSeg.points3D.length - 1]!;
    const closureGapM = Math.hypot(
      lastPt.x - firstPt.x,
      lastPt.y - firstPt.y,
      lastPt.z - firstPt.z,
    );
    if (closureGapM > maxJunctionGapM) {
      const report: RouteConnectivityReport = {
        valid: false,
        disconnectIndex: segments.length - 1,
        fromStationId: lastSeg.fromStationId,
        toStationId: lastSeg.toStationId,
        spatialGapM: Math.round(closureGapM * 100) / 100,
        reason: `Loop closure gap ${closureGapM.toFixed(1)}m at ${lastSeg.toStationId} exceeds ${maxJunctionGapM}m limit.`,
      };
      const invalidRoute: RunnableTrackRoute = {
        routeId,
        lineId: options.lineId,
        operatorId: line?.operatorId ?? 'sk:operator:unknown',
        nameJa: line?.nameJa ?? options.lineId,
        nameEn: line?.nameEn ?? options.lineId,
        color: line?.color ?? '#64748b',
        direction,
        mode,
        isLoop,
        reverseRouteId: options.reverseRouteId ?? null,
        segments,
        stationStops: [],
        blocks: [],
        totalLengthM: 0,
        connectivity: report,
        simulationLabel: SIMULATION_LABEL,
        dataNature: 'synthetic',
      };
      return { route: invalidRoute, spline: new TrackSpline3D([]) };
    }
  }

  // Build continuous 3D arc-length parameterized spline
  const spline = new TrackSpline3D(segments, { isLoop });

  // Locate each station stop's exact cumulative arc-length along the spline
  const stationStops: SimulatedPlatformStop[] = [];
  const stopBoundaryArcLengths: number[] = [0];
  let searchCursorS = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const endPt = seg.points3D[seg.points3D.length - 1]!;
    const nextS =
      i === segments.length - 1
        ? spline.totalLengthM
        : spline.findClosestArcLength(
            endPt,
            searchCursorS + Math.max(1, seg.lengthM * 0.5),
            Math.min(spline.totalLengthM, searchCursorS + seg.lengthM * 1.4 + 40),
          );
    stopBoundaryArcLengths.push(nextS);
    searchCursorS = nextS;
  }

  // For loop routes, the closing station equals stop 0 (at s = 0 / s = totalLengthM),
  // so stationStops contains the unique cycle stops [0 .. effectiveStations.length - 2]
  // while non-loop routes include all stops [0 .. effectiveStations.length - 1].
  const stopCount = isLoop ? effectiveStations.length - 1 : effectiveStations.length;
  for (let i = 0; i < stopCount; i++) {
    const stId = effectiveStations[i]!;
    const node = source.getStationNode(stId, options.lineId);
    const stopS = stopBoundaryArcLengths[i]!;
    const sample = spline.sampleAtArcLength(stopS);

    stationStops.push({
      platformId: `sim:platform:${options.lineId.replace('sk:line:', '')}:${stId.replace('sk:station:', '')}:${direction}`,
      stationId: stId,
      lineId: options.lineId,
      nameJa: node?.nameJa ?? stId,
      nameEn: node?.nameEn ?? null,
      stationCode: node?.stationCode ?? null,
      stopIndex: i,
      stopArcLengthM: Math.round(stopS * 1000) / 1000,
      platformLengthM: 165,
      platformSide: 'island',
      position: sample.position,
      tangent: sample.tangent,
      tier: sample.tier,
      structure: sample.structure,
      defaultDwellSec,
    });
  }

  // Partition route into discrete TrackBlockSections for multi-train occupancy control
  const blocks: TrackBlockSection[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const segStartS = stopBoundaryArcLengths[i]!;
    const segEndS = stopBoundaryArcLengths[i + 1]!;
    const segSpanM = Math.max(1, segEndS - segStartS);
    const subCount = Math.max(1, Math.round(segSpanM / targetBlockLengthM));
    const subLen = segSpanM / subCount;

    // On single-track lines, both directions share the same physicalTrackKey!
    // On double-track lines, up and down tracks have separate physicalTrackKeys.
    const physicalTrackBaseKey = seg.isDoubleTrack
      ? `${seg.trackSegmentId}::${seg.fromStationId}->${seg.toStationId}`
      : `${seg.trackSegmentId}::SINGLE_TRACK`;

    for (let b = 0; b < subCount; b++) {
      const bStart = segStartS + b * subLen;
      const bEnd = b === subCount - 1 ? segEndS : segStartS + (b + 1) * subLen;
      // If single track, order sub-block index canonical from canonical station order so opposing trains lock identical physical blocks
      const canonicalIdx =
        !seg.isDoubleTrack && seg.fromStationId > seg.toStationId
          ? subCount - 1 - b
          : b;
      const physicalTrackKey = `${physicalTrackBaseKey}#${canonicalIdx}`;

      blocks.push({
        blockId: `${routeId}:blk:${i}-${b}`,
        physicalTrackKey,
        trackSegmentId: seg.trackSegmentId,
        fromStationId: seg.fromStationId,
        toStationId: seg.toStationId,
        startArcLengthM: bStart,
        endArcLengthM: bEnd,
        lengthM: bEnd - bStart,
      });
    }
  }

  const connectivity: RouteConnectivityReport = {
    valid: true,
    disconnectIndex: null,
    fromStationId: effectiveStations[0] ?? null,
    toStationId: effectiveStations[effectiveStations.length - 1] ?? null,
    spatialGapM: Math.round(maxObservedGapM * 100) / 100,
    reason: null,
  };

  const route: RunnableTrackRoute = {
    routeId,
    lineId: options.lineId,
    operatorId: line?.operatorId ?? segments[0]?.operatorId ?? 'sk:operator:unknown',
    nameJa: line?.nameJa ?? options.lineId,
    nameEn: line?.nameEn ?? options.lineId,
    color: line?.color ?? '#64748b',
    direction,
    mode,
    isLoop,
    reverseRouteId: options.reverseRouteId ?? null,
    segments,
    stationStops,
    blocks,
    totalLengthM: spline.totalLengthM,
    connectivity,
    simulationLabel: SIMULATION_LABEL,
    dataNature: 'synthetic',
  };

  return { route, spline };
}

/**
 * Convenience builder that creates a paired Outbound + Inbound shuttle route pair
 * linked by `reverseRouteId` for deterministic terminal turnaround (`TERMINAL_TURNAROUND`).
 */
export function buildShuttleRoutePair(
  source: RailwayNetworkSimulationSource,
  options: Omit<BuildRouteOptions, 'direction' | 'mode' | 'reverseRouteId'> & {
    outboundRouteId?: string;
    inboundRouteId?: string;
  },
): {
  outbound: BuiltRouteBundle;
  inbound: BuiltRouteBundle;
} {
  const line = source.getLineById(options.lineId);
  const forwardStations = [...(options.stationIds ?? line?.stationIds ?? [])];
  const reverseStations = [...forwardStations].reverse();

  const slug = options.lineId.replace('sk:line:', '');
  const outboundRouteId = options.outboundRouteId ?? `sim:route:${slug}:outbound`;
  const inboundRouteId = options.inboundRouteId ?? `sim:route:${slug}:inbound`;

  const outbound = buildRunnableTrackRoute(source, {
    ...options,
    routeId: outboundRouteId,
    stationIds: forwardStations,
    direction: 'outbound',
    mode: 'shuttle',
    reverseRouteId: inboundRouteId,
  });

  const inbound = buildRunnableTrackRoute(source, {
    ...options,
    routeId: inboundRouteId,
    stationIds: reverseStations,
    direction: 'inbound',
    mode: 'shuttle',
    reverseRouteId: outboundRouteId,
  });

  return { outbound, inbound };
}
