/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Canonical `TrainSimulationEngineAdapter` Implementation.
 *
 * Implements the frozen `TrainSimulationEngineAdapter` contract from `src/contracts/atlasV2.ts`:
 *  - Pure TypeScript (zero Three.js, zero React, zero DOM coupling).
 *  - Drives multi-car virtual trains deterministically on `PhysicalTrackGraph` using
 *    `samplePhysicalTrackPose()` (Japanese Left-Hand Running, unscaled rail-head offset,
 *    and verticalExaggeration-safe 3D articulation).
 *  - Uses the 12-state deterministic operational FSM (`INITIALIZING`, `READY_TO_DEPART`,
 *    `DEPARTING_STATION`, `ACCELERATING`, `CRUISING`, `DECELERATING`, `APPROACHING_STATION`,
 *    `STOPPING`, `DOORS_OPENING`, `DWELLING`, `DOORS_CLOSING`, `TERMINAL_TURNAROUND`) with
 *    a fixed-timestep accumulator (`fixedStepSec = 0.05s`) for cross-framerate invariance.
 *  - Enforces multi-train block/distance headway separation so trains on the same track never overlap.
 *  - Tags every train and control state with `isVirtualSimulation: true`, `dataNature: 'synthetic'`,
 *    and `disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME'`.
 */

import {
  buildTrainConsistSpec,
  getDefaultTrainModelForLine,
  ROLLING_STOCK_CATALOG as V2_ROLLING_STOCK_CATALOG,
  samplePhysicalTrackPose,
  type OperatingPatternSpec,
  type PhysicalTrack,
  type PhysicalTrackGraph,
  type SimulatedCarPose,
  type SimulatedTrainState,
  type SimulationControlState,
  type SimulationInitOptions,
  type SimTimeScale,
  type SimTrainDensity,
  type TrackDirection,
  type TrackPoseSample,
  type TrainConsistSpec,
  type TrainDoorState,
  type TrainModelId,
  type TrainPhase,
  type TrainSimulationEngineAdapter,
  type VirtualServiceClass,
} from '../contracts/index.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import type { TrainOperationalState } from './types.js';

export interface DirectedPhysicalTrackLeg {
  readonly track: PhysicalTrack;
  readonly direction: TrackDirection;
  readonly fromStationId: SkId<'station'>;
  readonly toStationId: SkId<'station'>;
  readonly startRouteM: number;
  readonly endRouteM: number;
  readonly lengthM: number;
}

export interface StitchedPhysicalRoute {
  readonly routeId: string;
  readonly pattern: OperatingPatternSpec;
  readonly lineId: SkId<'line'>;
  readonly lineColor: string;
  readonly operatorId: SkId<'operator'>;
  readonly legs: readonly DirectedPhysicalTrackLeg[];
  /** Exact cumulative route arc-length (meters) for each stop in `pattern.stopStationIds` */
  readonly stopRouteArcLengthsM: readonly number[];
  readonly totalRouteLengthM: number;
  readonly isLoop: boolean;
  readonly reverseRouteId: string | null;
}

interface InternalV2Train {
  readonly trainId: string;
  readonly runNumber: string;
  readonly modelId: TrainModelId;
  readonly consist: TrainConsistSpec;
  readonly maxSpeedMps: number;
  readonly serviceAccelMps2: number;
  readonly serviceDecelMps2: number;
  readonly defaultDwellSec: number;
  readonly isFlagshipUndergroundDemo: boolean;

  route: StitchedPhysicalRoute;
  state12: TrainOperationalState;
  stateTimerSec: number;
  originStopIdx: number;
  targetStopIdx: number;
  headRouteM: number;
  speedMps: number;
  dwellRemainingSec: number;
}

const FIXED_STEP_SEC = 0.05; // 20 Hz deterministic physics tick
const DOOR_OPEN_SEC = 1.4;
const DOOR_CLOSE_SEC = 1.4;
const STOPPING_SETTLE_SEC = 0.4;
const DEPART_CLEAR_SEC = 1.0;
const TURNAROUND_HOLD_SEC = 5.0;
const MIN_SAFE_TRAIN_SEPARATION_M = 85.0;

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function sampleRawLegPose(
  leg: DirectedPhysicalTrackLeg,
  localProgressM: number,
  verticalExaggeration: number,
): TrackPoseSample {
  const clamped = Math.max(0, Math.min(leg.lengthM, localProgressM));
  const distFromTrackStartM =
    leg.direction === 1 ? clamped : Math.max(0, leg.lengthM - clamped);
  return samplePhysicalTrackPose(
    leg.track,
    distFromTrackStartM,
    leg.direction,
    verticalExaggeration,
  );
}

function extrapolateAlongTangent(
  basePose: TrackPoseSample,
  deltaDistM: number,
): TrackPoseSample {
  const hLen = Math.hypot(basePose.dirX, basePose.dirZ) || 1;
  const hx = basePose.dirX / hLen;
  const hz = basePose.dirZ / hLen;
  const rightX = -hz;
  const rightZ = hx;
  return {
    ...basePose,
    x: basePose.x + hx * deltaDistM,
    y: basePose.y,
    z: basePose.z + hz * deltaDistM,
    centerX: basePose.centerX + hx * deltaDistM,
    centerY: basePose.centerY,
    centerZ: basePose.centerZ + hz * deltaDistM,
    dirX: hx,
    dirY: 0,
    dirZ: hz,
    rightX,
    rightZ,
    yawRad: Math.atan2(hx, hz),
    pitchRad: 0,
  };
}

/**
 * Samples a 3D rail-head pose at cumulative distance `routeDistM` along a `StitchedPhysicalRoute`
 * using Session 0's canonical `samplePhysicalTrackPose()`.
 *
 * - For non-loop routes, smoothly extrapolates backward (`d < 0`) and forward (`d > L`) along
 *   terminal tangents at constant elevation so trailing cars never pile up or clip into Car 0.
 * - Applies C1-smooth lateral & tangent blending across consecutive leg boundaries at stations.
 */
export function sampleStitchedRoutePose(
  route: StitchedPhysicalRoute,
  rawRouteDistM: number,
  verticalExaggeration = 1.0,
): { pose: TrackPoseSample; leg: DirectedPhysicalTrackLeg } {
  const L = route.totalRouteLengthM;
  const firstLeg = route.legs[0]!;
  if (L <= 0 || route.legs.length === 0) {
    return {
      pose: samplePhysicalTrackPose(firstLeg.track, 0, firstLeg.direction, verticalExaggeration),
      leg: firstLeg,
    };
  }

  let d = rawRouteDistM;
  if (route.isLoop) {
    d = ((d % L) + L) % L;
  } else if (d < 0) {
    const pose0 = sampleRawLegPose(firstLeg, 0, verticalExaggeration);
    return { pose: extrapolateAlongTangent(pose0, d), leg: firstLeg };
  } else if (d > L) {
    const lastLeg = route.legs[route.legs.length - 1]!;
    const poseEnd = sampleRawLegPose(lastLeg, lastLeg.lengthM, verticalExaggeration);
    return { pose: extrapolateAlongTangent(poseEnd, d - L), leg: lastLeg };
  }

  // Binary search for enclosing leg
  let lo = 0;
  let hi = route.legs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.legs[mid]!.endRouteM < d) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const leg = route.legs[lo]!;
  const localProgressM = Math.max(0, Math.min(leg.lengthM, d - leg.startRouteM));
  let pose = sampleRawLegPose(leg, localProgressM, verticalExaggeration);

  // Smooth C1 transition across station leg boundaries so sharp polyline bends never cause
  // lateral offset jumps or yaw snaps as bogies/cab cross from leg[i] to leg[i+1].
  const legCount = route.legs.length;
  const prevLeg = lo > 0 ? route.legs[lo - 1]! : route.isLoop && legCount > 1 ? route.legs[legCount - 1]! : null;
  const nextLeg = lo < legCount - 1 ? route.legs[lo + 1]! : route.isLoop && legCount > 1 ? route.legs[0]! : null;

  let adjX = pose.x;
  let adjY = pose.y;
  let adjZ = pose.z;
  let adjDirX = pose.dirX;
  let adjDirY = pose.dirY;
  let adjDirZ = pose.dirZ;
  let adjusted = false;

  if (prevLeg) {
    const blendR = Math.min(14, leg.lengthM * 0.25, prevLeg.lengthM * 0.25);
    if (blendR > 0.5 && localProgressM < blendR) {
      const endPrev = sampleRawLegPose(prevLeg, prevLeg.lengthM, verticalExaggeration);
      const startCur = sampleRawLegPose(leg, 0, verticalExaggeration);
      const dxJump = startCur.x - endPrev.x;
      const dyJump = startCur.y - endPrev.y;
      const dzJump = startCur.z - endPrev.z;
      const dirDot =
        endPrev.dirX * startCur.dirX +
        endPrev.dirY * startCur.dirY +
        endPrev.dirZ * startCur.dirZ;
      if (Math.hypot(dxJump, dyJump, dzJump) < 12 && dirDot > -0.3) {
        const w = (1 - smoothstep01(localProgressM / blendR)) * 0.5;
        adjX -= dxJump * w;
        adjY -= dyJump * w;
        adjZ -= dzJump * w;
        adjDirX = adjDirX * (1 - w) + endPrev.dirX * w;
        adjDirY = adjDirY * (1 - w) + endPrev.dirY * w;
        adjDirZ = adjDirZ * (1 - w) + endPrev.dirZ * w;
        adjusted = true;
      }
    }
  }

  if (nextLeg) {
    const distToEnd = leg.lengthM - localProgressM;
    const blendR = Math.min(14, leg.lengthM * 0.25, nextLeg.lengthM * 0.25);
    if (blendR > 0.5 && distToEnd < blendR) {
      const endCur = sampleRawLegPose(leg, leg.lengthM, verticalExaggeration);
      const startNext = sampleRawLegPose(nextLeg, 0, verticalExaggeration);
      const dxJump = startNext.x - endCur.x;
      const dyJump = startNext.y - endCur.y;
      const dzJump = startNext.z - endCur.z;
      const dirDot =
        endCur.dirX * startNext.dirX +
        endCur.dirY * startNext.dirY +
        endCur.dirZ * startNext.dirZ;
      if (Math.hypot(dxJump, dyJump, dzJump) < 12 && dirDot > -0.3) {
        const w = (1 - smoothstep01(distToEnd / blendR)) * 0.5;
        adjX += dxJump * w;
        adjY += dyJump * w;
        adjZ += dzJump * w;
        adjDirX = adjDirX * (1 - w) + startNext.dirX * w;
        adjDirY = adjDirY * (1 - w) + startNext.dirY * w;
        adjDirZ = adjDirZ * (1 - w) + startNext.dirZ * w;
        adjusted = true;
      }
    }
  }

  if (adjusted) {
    const dLen = Math.hypot(adjDirX, adjDirY, adjDirZ) || 1;
    const ndx = adjDirX / dLen;
    const ndy = adjDirY / dLen;
    const ndz = adjDirZ / dLen;
    const hLen = Math.hypot(ndx, ndz) || 1;
    const clampedDirY = Math.max(-0.98, Math.min(0.98, ndy));
    pose = {
      ...pose,
      x: adjX,
      y: adjY,
      z: adjZ,
      dirX: ndx,
      dirY: ndy,
      dirZ: ndz,
      rightX: -ndz / hLen,
      rightZ: ndx / hLen,
      yawRad: Math.atan2(ndx, ndz),
      pitchRad: -Math.asin(clampedDirY),
    };
  }

  return { pose, leg };
}

/**
 * Solves articulated per-car 3D poses along a `StitchedPhysicalRoute` using front and rear bogie
 * pivot sampling on `samplePhysicalTrackPose()`.
 */
export function solveV2ArticulatedCarPoses(
  route: StitchedPhysicalRoute,
  consist: TrainConsistSpec,
  headRouteM: number,
  verticalExaggeration = 1.0,
): SimulatedCarPose[] {
  const spec =
    V2_ROLLING_STOCK_CATALOG[consist.modelId] ??
    V2_ROLLING_STOCK_CATALOG['private-commuter-generic'];
  const halfBogieM = spec.bogiePitchM * 0.5;
  const carPoses: SimulatedCarPose[] = [];

  let offsetFromNoseM = 0;
  for (const car of consist.cars) {
    const centerOffsetM = offsetFromNoseM + car.lengthM * 0.5;
    const centerRouteM = headRouteM - centerOffsetM;
    const frontBogieRouteM = centerRouteM + halfBogieM;
    const rearBogieRouteM = centerRouteM - halfBogieM;

    const frontHit = sampleStitchedRoutePose(route, frontBogieRouteM, verticalExaggeration);
    const rearHit = sampleStitchedRoutePose(route, rearBogieRouteM, verticalExaggeration);
    const centerHit = sampleStitchedRoutePose(route, centerRouteM, verticalExaggeration);

    const dx = frontHit.pose.x - rearHit.pose.x;
    const dy = frontHit.pose.y - rearHit.pose.y;
    const dz = frontHit.pose.z - rearHit.pose.z;
    const chordLen = Math.hypot(dx, dy, dz);

    let yawRad = centerHit.pose.yawRad;
    let pitchRad = centerHit.pose.pitchRad;
    const forwardAlignment =
      chordLen > 0.25
        ? (dx * centerHit.pose.dirX + dz * centerHit.pose.dirZ) / chordLen
        : -1;
    if (chordLen > 0.25 && forwardAlignment > 0.1) {
      yawRad = Math.atan2(dx, dz);
      const clampedDirY = Math.max(-0.98, Math.min(0.98, dy / chordLen));
      pitchRad = -Math.asin(clampedDirY);
    }

    carPoses.push({
      carIndex: car.index,
      role: car.role,
      lengthM: car.lengthM,
      x: (frontHit.pose.x + rearHit.pose.x) * 0.5,
      y: (frontHit.pose.y + rearHit.pose.y) * 0.25 + centerHit.pose.y * 0.5,
      z: (frontHit.pose.z + rearHit.pose.z) * 0.5,
      yawRad,
      pitchRad,
      rollRad: 0,
      trackId: centerHit.leg.track.id,
      tier: centerHit.pose.tier,
      isUnderground: centerHit.pose.isUnderground,
    });

    offsetFromNoseM += car.lengthM + spec.couplerGapM;
  }

  return carPoses;
}

/**
 * Maps our 12-state operational FSM to the v2 contract's `TrainPhase` and `TrainDoorState`.
 */
export function mapState12ToPhaseAndDoors(state12: TrainOperationalState): {
  phase: TrainPhase;
  doorState: TrainDoorState;
} {
  switch (state12) {
    case 'INITIALIZING':
    case 'READY_TO_DEPART':
      return { phase: 'dwelling', doorState: 'closed' };
    case 'DOORS_OPENING':
      return { phase: 'dwelling', doorState: 'opening' };
    case 'DWELLING':
      return { phase: 'dwelling', doorState: 'open' };
    case 'DOORS_CLOSING':
      return { phase: 'dwelling', doorState: 'closing' };
    case 'DEPARTING_STATION':
    case 'ACCELERATING':
      return { phase: 'accelerating', doorState: 'closed' };
    case 'CRUISING':
      return { phase: 'cruising', doorState: 'closed' };
    case 'DECELERATING':
    case 'APPROACHING_STATION':
    case 'STOPPING':
      return { phase: 'braking', doorState: 'closed' };
    case 'TERMINAL_TURNAROUND':
      return { phase: 'turning_back', doorState: 'closed' };
  }
}

export class VirtualTrainSimulationEngine implements TrainSimulationEngineAdapter {
  readonly engineId = 'senkiro-atlas-v2-deterministic-train-simulation-engine';

  private dataset: AtlasDataset | null = null;
  private readonly routesById = new Map<string, StitchedPhysicalRoute>();
  private readonly activeTrains: InternalV2Train[] = [];
  private cachedSnapshots: SimulatedTrainState[] = [];

  private running = true;
  private timeScale: SimTimeScale = 1;
  private density: SimTrainDensity = 'normal';
  private activeLineFilter: SkId<'line'>[] | null = null;
  private seed = 20261122;

  private simClockSec = 0;
  private accumulatorSec = 0;
  private lastVerticalExaggeration = 1.0;

  initialize(
    graph: PhysicalTrackGraph,
    dataset: AtlasDataset,
    options?: SimulationInitOptions,
  ): void {
    this.dataset = dataset;
    this.seed = options?.seed ?? 20261122;
    this.density = options?.density ?? 'normal';
    this.timeScale = options?.timeScale ?? 1;
    this.running = options?.autoStart ?? true;
    this.activeLineFilter = options?.lineFilter ?? null;

    this.buildAllStitchedRoutes(graph, dataset);
    this.respawnFleet();
  }

  private buildAllStitchedRoutes(graph: PhysicalTrackGraph, dataset: AtlasDataset): void {
    this.routesById.clear();

    // Index physical tracks by directed station pairs
    const trackLookup = new Map<string, { track: PhysicalTrack; dir: TrackDirection }[]>();
    const addLookup = (
      fromId: SkId<'station'>,
      toId: SkId<'station'>,
      track: PhysicalTrack,
      dir: TrackDirection,
    ) => {
      const k = `${fromId}::${toId}`;
      if (!trackLookup.has(k)) trackLookup.set(k, []);
      trackLookup.get(k)!.push({ track, dir });
    };

    for (const tr of graph.tracks) {
      addLookup(tr.fromStationId, tr.toStationId, tr, 1);
      addLookup(tr.toStationId, tr.fromStationId, tr, -1);
    }

    const resolveDirectedLeg = (
      fromId: SkId<'station'>,
      toId: SkId<'station'>,
      lineId: SkId<'line'>,
    ): { track: PhysicalTrack; dir: TrackDirection } | null => {
      const candidates = trackLookup.get(`${fromId}::${toId}`);
      if (!candidates || candidates.length === 0) return null;
      return (
        candidates.find(
          (c) =>
            c.track.primaryLineId === lineId || c.track.railLineIds.includes(lineId),
        ) ?? candidates[0]!
      );
    };

    const buildDirectionalRoute = (
      routeId: string,
      reverseRouteId: string | null,
      lineId: SkId<'line'>,
      lineColor: string,
      operatorId: SkId<'operator'>,
      nameJa: string,
      nameEn: string,
      serviceClass: VirtualServiceClass,
      stationSequence: SkId<'station'>[],
      isLoop: boolean,
    ): StitchedPhysicalRoute | null => {
      if (stationSequence.length < 2) return null;
      const effectiveStations = [...stationSequence];
      if (
        isLoop &&
        effectiveStations[effectiveStations.length - 1] !== effectiveStations[0]
      ) {
        effectiveStations.push(effectiveStations[0]!);
      }

      const legs: DirectedPhysicalTrackLeg[] = [];
      const stopRouteArcLengthsM: number[] = [0];
      let accumM = 0;

      for (let i = 0; i < effectiveStations.length - 1; i++) {
        const a = effectiveStations[i]!;
        const b = effectiveStations[i + 1]!;
        const hit = resolveDirectedLeg(a, b, lineId);
        if (!hit) return null; // Reject unconnected station pair!

        const len = Math.max(1, hit.track.geometryLengthM);
        legs.push({
          track: hit.track,
          direction: hit.dir,
          fromStationId: a,
          toStationId: b,
          startRouteM: accumM,
          endRouteM: accumM + len,
          lengthM: len,
        });
        accumM += len;
        if (!isLoop || i < effectiveStations.length - 2) {
          stopRouteArcLengthsM.push(accumM);
        }
      }

      if (legs.length === 0) return null;

      const modelId = getDefaultTrainModelForLine(lineId);
      const spec = V2_ROLLING_STOCK_CATALOG[modelId];
      const pattern: OperatingPatternSpec = {
        id: `pattern:${routeId}`,
        operatorId,
        railLineIds: [lineId],
        nameJa,
        nameEn,
        serviceClass,
        stopStationIds: isLoop
          ? effectiveStations.slice(0, effectiveStations.length - 1)
          : effectiveStations,
        isLoop,
        headwaySec: 120,
        defaultDwellSec: 16,
        defaultTrainModelId: modelId,
        defaultCarCount: Math.min(8, spec.defaultCarCount),
        dataNature: 'synthetic',
        isVirtualSimulation: true,
        notes: 'Simulation / 模拟运行 — Deterministic virtual route built from PhysicalTrackGraph.',
      };

      return {
        routeId,
        pattern,
        lineId,
        lineColor,
        operatorId,
        legs,
        stopRouteArcLengthsM,
        totalRouteLengthM: accumM,
        isLoop,
        reverseRouteId,
      };
    };

    for (const line of dataset.railLines) {
      if (line.stationIds.length < 2) continue;
      const slug = line.id.replace(/^sk:line:/, '');
      const fwdId = `v2:route:${slug}:fwd`;
      const revId = `v2:route:${slug}:rev`;
      const serviceClass: VirtualServiceClass =
        line.lineClass === 'shinkansen'
          ? 'shinkansen'
          : line.id === 'sk:line:jr-east-chuo'
            ? 'rapid'
            : 'local';

      const fwdRoute = buildDirectionalRoute(
        fwdId,
        revId,
        line.id,
        line.color,
        line.operatorId,
        line.names.ja ?? line.id,
        line.names.en ?? line.id,
        serviceClass,
        [...line.stationIds],
        false,
      );
      const revRoute = buildDirectionalRoute(
        revId,
        fwdId,
        line.id,
        line.color,
        line.operatorId,
        line.names.ja ?? line.id,
        line.names.en ?? line.id,
        serviceClass,
        [...line.stationIds].reverse(),
        false,
      );

      if (fwdRoute && revRoute) {
        this.routesById.set(fwdId, fwdRoute);
        this.routesById.set(revId, revRoute);
      }
    }
  }

  private respawnFleet(): void {
    this.activeTrains.length = 0;
    this.simClockSec = 0;
    this.accumulatorSec = 0;

    if (!this.dataset || this.routesById.size === 0) {
      this.cachedSnapshots = [];
      return;
    }

    // Priority line list ensuring strong coverage across underground subways, JR trunk/loop, Shinkansen & private lines
    const priorityLines: SkId<'line'>[] = [
      'sk:line:metro-marunouchi',
      'sk:line:metro-ginza',
      'sk:line:toei-oedo',
      'sk:line:metro-fukutoshin',
      'sk:line:metro-hanzomon',
      'sk:line:metro-chiyoda',
      'sk:line:metro-hibiya',
      'sk:line:metro-tozai',
      'sk:line:metro-yurakucho',
      'sk:line:metro-namboku',
      'sk:line:toei-shinjuku',
      'sk:line:toei-mita',
      'sk:line:toei-asakusa',
      'sk:line:jr-east-yamanote',
      'sk:line:jr-east-chuo',
      'sk:line:jr-east-tokaido',
      'sk:line:jr-east-tohoku',
      'sk:line:jr-east-sobu',
      'sk:line:jr-central-tokaido-shinkansen',
      'sk:line:jr-east-tohoku-shinkansen',
      'sk:line:tokyu-toyoko',
      'sk:line:tokyu-denentoshi',
      'sk:line:odakyu-odawara',
      'sk:line:keio-keio',
      'sk:line:keio-inokashira',
      'sk:line:seibu-shinjuku',
      'sk:line:keikyu-main',
    ];

    const filterSet =
      this.activeLineFilter && this.activeLineFilter.length > 0
        ? new Set(this.activeLineFilter)
        : null;

    const linesToPopulate = priorityLines.filter((lid) =>
      filterSet ? filterSet.has(lid) : true,
    );

    const trainsPerDirection =
      this.density === 'low' ? 1 : this.density === 'rush' ? 3 : 2;

    let trainSeq = 0;
    let assignedFlagshipDemo = false;

    for (const lineId of linesToPopulate) {
      const slug = lineId.replace(/^sk:line:/, '');
      const fwdRoute = this.routesById.get(`v2:route:${slug}:fwd`);
      const revRoute = this.routesById.get(`v2:route:${slug}:rev`);
      const dirRoutes = [fwdRoute, revRoute].filter(
        (r): r is StitchedPhysicalRoute => r !== undefined,
      );

      for (const route of dirRoutes) {
        const stopCount = route.stopRouteArcLengthsM.length;
        if (stopCount < 2) continue;

        const modelId = route.pattern.defaultTrainModelId;
        const spec =
          V2_ROLLING_STOCK_CATALOG[modelId] ??
          V2_ROLLING_STOCK_CATALOG['private-commuter-generic'];
        // Use 6-car default in 3D metropolitan view so trains fit all urban platforms cleanly
        const carCount = Math.min(6, spec.defaultCarCount);
        const consist = buildTrainConsistSpec(modelId, carCount);
        const maxSpeedMps = Math.min(34, (spec.maxSpeedKmh / 3.6) * 0.92);

        const countForRoute = Math.min(trainsPerDirection, Math.max(1, stopCount - 1));
        const stopStride = Math.max(1, Math.floor((stopCount - 1) / countForRoute));

        for (let k = 0; k < countForRoute; k++) {
          const originIdx = Math.min(stopCount - 2, k * stopStride);
          const targetIdx = originIdx + 1;
          const startS = route.stopRouteArcLengthsM[originIdx]!;
          const endS = route.stopRouteArcLengthsM[targetIdx]!;

          // Place first underground metro train mid-run inside an underground tunnel for immediate demo readiness!
          const isDeepMetro =
            lineId === 'sk:line:metro-marunouchi' ||
            lineId === 'sk:line:toei-oedo' ||
            lineId === 'sk:line:metro-fukutoshin' ||
            lineId === 'sk:line:metro-hanzomon';

          const isFlagship = !assignedFlagshipDemo && isDeepMetro && k === 0;
          if (isFlagship) {
            assignedFlagshipDemo = true;
          }

          // Stagger initial positions deterministically using seed + index
          const frac = isFlagship
            ? 0.35
            : ((this.seed + trainSeq * 37) % 100) / 160;
          const headRouteM =
            k % 2 === 0 || isFlagship
              ? startS + (endS - startS) * Math.min(0.65, Math.max(0.18, frac))
              : startS;
          const initialRunning = headRouteM > startS + 1.0;

          trainSeq++;
          const dirTag = route.routeId.endsWith(':fwd') ? 'A' : 'B';
          const trainId = `sim:v2:${slug}:${dirTag}${String(k + 1).padStart(2, '0')}`;
          const runNumber = `${ Math.floor(100 + ((trainSeq * 17) % 890)) }${dirTag}`;

          this.activeTrains.push({
            trainId,
            runNumber,
            modelId,
            consist,
            maxSpeedMps,
            serviceAccelMps2: 0.92,
            serviceDecelMps2: 1.05,
            defaultDwellSec: route.pattern.defaultDwellSec,
            isFlagshipUndergroundDemo: isFlagship,
            route,
            state12: initialRunning ? 'CRUISING' : 'READY_TO_DEPART',
            stateTimerSec: 0,
            originStopIdx: originIdx,
            targetStopIdx: targetIdx,
            headRouteM,
            speedMps: initialRunning ? maxSpeedMps * 0.72 : 0,
            dwellRemainingSec: 0,
          });
        }
      }
    }

    this.rebuildSnapshots(this.lastVerticalExaggeration);
  }

  step(
    dtSec: number,
    verticalExaggeration = this.lastVerticalExaggeration,
  ): readonly SimulatedTrainState[] {
    this.lastVerticalExaggeration = Math.max(1.0, Math.min(2.5, verticalExaggeration));

    if (this.running && dtSec > 0 && Number.isFinite(dtSec)) {
      this.accumulatorSec += dtSec * this.timeScale;
      let steps = 0;
      while (this.accumulatorSec + 1e-9 >= FIXED_STEP_SEC && steps < 4000) {
        this.accumulatorSec = Math.max(0, this.accumulatorSec - FIXED_STEP_SEC);
        this.stepSingleFixedTick(FIXED_STEP_SEC);
        steps++;
      }
    }

    this.rebuildSnapshots(this.lastVerticalExaggeration);
    return this.cachedSnapshots;
  }

  private stepSingleFixedTick(dt: number): void {
    this.simClockSec = Math.round((this.simClockSec + dt) * 1_000_000) / 1_000_000;

    // Group active trains by routeId to compute preceding train clearance (block occupancy control)
    const trainsByRoute = new Map<string, InternalV2Train[]>();
    for (const t of this.activeTrains) {
      const rid = t.route.routeId;
      if (!trainsByRoute.has(rid)) trainsByRoute.set(rid, []);
      trainsByRoute.get(rid)!.push(t);
    }

    for (const t of this.activeTrains) {
      const sameRouteTrains = trainsByRoute.get(t.route.routeId) ?? [];
      let clearanceAheadM: number | null = null;
      for (const other of sameRouteTrains) {
        if (other.trainId === t.trainId) continue;
        if (other.headRouteM > t.headRouteM) {
          const otherTailM = other.headRouteM - other.consist.totalLengthM;
          const allowedM = Math.max(
            0,
            otherTailM - t.headRouteM - MIN_SAFE_TRAIN_SEPARATION_M,
          );
          if (clearanceAheadM === null || allowedM < clearanceAheadM) {
            clearanceAheadM = allowedM;
          }
        }
      }

      this.advanceTrain12StateTick(t, dt, clearanceAheadM);
    }
  }

  private advanceTrain12StateTick(
    t: InternalV2Train,
    dt: number,
    clearanceAheadM: number | null,
  ): void {
    t.stateTimerSec += dt;
    const stopArcs = t.route.stopRouteArcLengthsM;
    const targetStopM = stopArcs[t.targetStopIdx] ?? t.route.totalRouteLengthM;
    const originStopM = stopArcs[t.originStopIdx] ?? 0;
    const intervalLenM = Math.max(10, targetStopM - originStopM);
    const distToStopM = Math.max(0, targetStopM - t.headRouteM);
    const distFromOriginM = Math.max(0, t.headRouteM - originStopM);

    const isBlockGoverning =
      clearanceAheadM !== null && clearanceAheadM < distToStopM - 0.5;
    const effectiveStopDistM = isBlockGoverning ? clearanceAheadM : distToStopM;

    const transition = (next: TrainOperationalState) => {
      if (t.state12 !== next) {
        t.state12 = next;
        t.stateTimerSec = 0;
      }
    };

    switch (t.state12) {
      case 'INITIALIZING': {
        t.speedMps = 0;
        t.dwellRemainingSec = 0;
        if (t.stateTimerSec >= dt) {
          transition('READY_TO_DEPART');
        }
        break;
      }

      case 'READY_TO_DEPART': {
        t.speedMps = 0;
        t.dwellRemainingSec = 0;
        if (clearanceAheadM !== null && clearanceAheadM < 15.0) {
          break;
        }
        if (t.stateTimerSec >= dt) {
          transition('DEPARTING_STATION');
        }
        break;
      }

      case 'DEPARTING_STATION':
      case 'ACCELERATING':
      case 'CRUISING':
      case 'DECELERATING':
      case 'APPROACHING_STATION':
      case 'STOPPING': {
        const brakeDistM =
          (t.speedMps * t.speedMps) / (2 * t.serviceDecelMps2) +
          t.speedMps * dt * 1.5 +
          0.4;
        const cruiseHorizonM = brakeDistM * 1.2 + 6.0;
        const approachZoneM = Math.min(45, Math.max(12, intervalLenM * 0.22));
        const stoppingZoneM = Math.min(3.8, Math.max(1.5, intervalLenM * 0.04));

        if (t.state12 === 'DEPARTING_STATION') {
          if (effectiveStopDistM <= brakeDistM) {
            transition('DECELERATING');
          } else if (
            t.stateTimerSec >= DEPART_CLEAR_SEC ||
            distFromOriginM >= Math.min(16, intervalLenM * 0.14)
          ) {
            transition('ACCELERATING');
          }
        }

        if (t.state12 === 'ACCELERATING') {
          if (effectiveStopDistM <= brakeDistM) {
            transition('DECELERATING');
          } else if (
            t.speedMps >= t.maxSpeedMps - 0.05 ||
            effectiveStopDistM <= cruiseHorizonM
          ) {
            transition('CRUISING');
          }
        }

        if (t.state12 === 'CRUISING') {
          if (effectiveStopDistM <= brakeDistM) {
            transition('DECELERATING');
          }
        }

        if (t.state12 === 'DECELERATING') {
          if (
            !isBlockGoverning &&
            distToStopM <= approachZoneM &&
            distToStopM > stoppingZoneM
          ) {
            transition('APPROACHING_STATION');
          } else if (!isBlockGoverning && distToStopM <= stoppingZoneM) {
            transition('STOPPING');
          } else if (
            !isBlockGoverning &&
            distToStopM > cruiseHorizonM + 18 &&
            t.speedMps < t.maxSpeedMps * 0.72
          ) {
            transition('ACCELERATING');
          }
        }

        if (t.state12 === 'APPROACHING_STATION') {
          if (!isBlockGoverning && distToStopM <= stoppingZoneM) {
            transition('STOPPING');
          }
        }

        // Integrate velocity & position
        if (t.state12 === 'DEPARTING_STATION' || t.state12 === 'ACCELERATING') {
          if (isBlockGoverning && clearanceAheadM <= 0.5) {
            t.speedMps = 0;
            break;
          }
          const acc =
            t.state12 === 'DEPARTING_STATION'
              ? t.serviceAccelMps2 * 0.85
              : t.serviceAccelMps2;
          const nextV = Math.min(t.maxSpeedMps, t.speedMps + acc * dt);
          const ds = Math.min(
            effectiveStopDistM,
            0.5 * (t.speedMps + nextV) * dt,
          );
          t.headRouteM += Math.max(0, ds);
          t.speedMps = nextV;
        } else if (t.state12 === 'CRUISING') {
          const ds = Math.min(effectiveStopDistM, t.speedMps * dt);
          t.headRouteM += Math.max(0, ds);
        } else if (t.state12 === 'DECELERATING' || t.state12 === 'APPROACHING_STATION') {
          if (isBlockGoverning && clearanceAheadM <= 0.2) {
            t.speedMps = 0;
            break;
          }
          const remM = Math.max(0.02, effectiveStopDistM);
          const reqDecel = Math.min(
            t.serviceDecelMps2 * 1.45,
            Math.max(0.02, (t.speedMps * t.speedMps) / (2 * remM)),
          );
          const nextV = Math.max(0, t.speedMps - reqDecel * dt);
          const ds = Math.min(remM, 0.5 * (t.speedMps + nextV) * dt);
          t.headRouteM += Math.max(0, ds);
          t.speedMps = nextV;
        } else if (t.state12 === 'STOPPING') {
          const remM = targetStopM - t.headRouteM;
          if (remM > 0.02 && t.speedMps > 0.005) {
            const reqDecel = Math.min(
              t.serviceDecelMps2 * 1.45,
              Math.max(0.02, (t.speedMps * t.speedMps) / (2 * Math.max(0.005, remM))),
            );
            const nextV = Math.max(0.15, t.speedMps - reqDecel * dt);
            const ds = 0.5 * (t.speedMps + nextV) * dt;
            if (ds >= remM - 0.02 || remM <= 0.03) {
              t.headRouteM = targetStopM;
              t.speedMps = 0;
              t.stateTimerSec = 0;
            } else {
              t.headRouteM += ds;
              t.speedMps = nextV;
            }
          } else {
            t.headRouteM = targetStopM;
            t.speedMps = 0;
            if (t.stateTimerSec >= STOPPING_SETTLE_SEC - 1e-6) {
              t.dwellRemainingSec =
                DOOR_OPEN_SEC + t.defaultDwellSec + DOOR_CLOSE_SEC;
              transition('DOORS_OPENING');
            }
          }
        }
        break;
      }

      case 'DOORS_OPENING': {
        t.speedMps = 0;
        t.dwellRemainingSec = Math.max(
          0,
          t.defaultDwellSec + DOOR_CLOSE_SEC + (DOOR_OPEN_SEC - t.stateTimerSec),
        );
        if (t.stateTimerSec >= DOOR_OPEN_SEC - 1e-6) {
          transition('DWELLING');
        }
        break;
      }

      case 'DWELLING': {
        t.speedMps = 0;
        t.dwellRemainingSec = Math.max(
          0,
          DOOR_CLOSE_SEC + (t.defaultDwellSec - t.stateTimerSec),
        );
        if (t.stateTimerSec >= t.defaultDwellSec - 1e-6) {
          transition('DOORS_CLOSING');
        }
        break;
      }

      case 'DOORS_CLOSING': {
        t.speedMps = 0;
        t.dwellRemainingSec = Math.max(0, DOOR_CLOSE_SEC - t.stateTimerSec);
        if (t.stateTimerSec >= DOOR_CLOSE_SEC - 1e-6) {
          t.dwellRemainingSec = 0;
          const stopCount = stopArcs.length;
          if (!t.route.isLoop && t.targetStopIdx >= stopCount - 1) {
            t.originStopIdx = t.targetStopIdx;
            transition('TERMINAL_TURNAROUND');
          } else {
            t.originStopIdx = t.targetStopIdx;
            t.targetStopIdx = Math.min(stopCount - 1, t.targetStopIdx + 1);
            transition('READY_TO_DEPART');
          }
        }
        break;
      }

      case 'TERMINAL_TURNAROUND': {
        t.speedMps = 0;
        t.dwellRemainingSec = Math.max(0, TURNAROUND_HOLD_SEC - t.stateTimerSec);
        if (t.stateTimerSec >= TURNAROUND_HOLD_SEC - 1e-6) {
          const revId = t.route.reverseRouteId;
          const revRoute = revId ? this.routesById.get(revId) : undefined;
          if (revRoute && revRoute.stopRouteArcLengthsM.length >= 2) {
            t.route = revRoute;
            t.originStopIdx = 0;
            t.targetStopIdx = 1;
            t.headRouteM = revRoute.stopRouteArcLengthsM[0] ?? 0;
            t.dwellRemainingSec = 0;
            transition('READY_TO_DEPART');
          } else {
            // Wrap back to stop 0 on same route if reverse route unavailable
            t.originStopIdx = 0;
            t.targetStopIdx = Math.min(1, t.route.stopRouteArcLengthsM.length - 1);
            t.headRouteM = 0;
            transition('READY_TO_DEPART');
          }
        }
        break;
      }
    }
  }

  private rebuildSnapshots(verticalExaggeration: number): void {
    const out: SimulatedTrainState[] = [];
    // Sub-tick interpolation eliminates 20 Hz stepping stutter at 60–240 FPS while keeping
    // deterministic physics ticks (`t.headRouteM`) untouched and preserving exact bit-equality
    // when accumulatorSec is ~0 (e.g. exact multiples of FIXED_STEP_SEC in unit tests).
    const interpDtSec =
      this.running && this.accumulatorSec > 1e-5
        ? Math.min(FIXED_STEP_SEC, this.accumulatorSec)
        : 0;

    for (const t of this.activeTrains) {
      const isMotionState =
        t.state12 === 'DEPARTING_STATION' ||
        t.state12 === 'ACCELERATING' ||
        t.state12 === 'CRUISING' ||
        t.state12 === 'DECELERATING' ||
        t.state12 === 'APPROACHING_STATION' ||
        t.state12 === 'STOPPING';
      const targetStopM =
        t.route.stopRouteArcLengthsM[t.targetStopIdx] ?? t.route.totalRouteLengthM;
      const visualHeadRouteM =
        interpDtSec > 0 && isMotionState && t.speedMps > 0.001
          ? Math.min(targetStopM, t.headRouteM + t.speedMps * interpDtSec)
          : t.headRouteM;

      const headHit = sampleStitchedRoutePose(
        t.route,
        visualHeadRouteM,
        verticalExaggeration,
      );
      const carPoses = solveV2ArticulatedCarPoses(
        t.route,
        t.consist,
        visualHeadRouteM,
        verticalExaggeration,
      );
      const { phase, doorState } = mapState12ToPhaseAndDoors(t.state12);

      const stops = t.route.pattern.stopStationIds;
      const fromStationId = stops[t.originStopIdx] ?? headHit.leg.fromStationId;
      const nextStationId = stops[t.targetStopIdx] ?? headHit.leg.toStationId;
      const destinationStationId = stops[stops.length - 1] ?? nextStationId;

      const distanceAlongTrackM = Math.max(
        0,
        Math.min(headHit.leg.lengthM, visualHeadRouteM - headHit.leg.startRouteM),
      );
      const progressOnRoute =
        t.route.totalRouteLengthM > 0
          ? Math.max(0, Math.min(1, visualHeadRouteM / t.route.totalRouteLengthM))
          : 0;

      out.push({
        trainId: t.trainId,
        runNumber: t.runNumber,
        isVirtualSimulation: true,
        dataNature: 'synthetic',
        disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME',
        operatorId: t.route.operatorId,
        lineId: t.route.lineId,
        lineColor: t.route.lineColor,
        servicePatternId: t.route.pattern.id,
        serviceClass: t.route.pattern.serviceClass,
        modelId: t.modelId,
        carCount: t.consist.carCount,
        direction: headHit.leg.direction,
        phase,
        speedKmh: Math.round(t.speedMps * 3.6 * 10) / 10,
        speedMps: Math.round(t.speedMps * 100) / 100,
        currentTrackId: headHit.leg.track.id,
        currentSegmentId: headHit.leg.track.segmentId,
        distanceAlongTrackM: Math.round(distanceAlongTrackM * 100) / 100,
        fromStationId,
        nextStationId,
        destinationStationId,
        dwellRemainingSec: Math.round(t.dwellRemainingSec * 10) / 10,
        doorState,
        headPose: {
          x: headHit.pose.x,
          y: headHit.pose.y,
          z: headHit.pose.z,
          dirX: headHit.pose.dirX,
          dirY: headHit.pose.dirY,
          dirZ: headHit.pose.dirZ,
          yawRad: headHit.pose.yawRad,
          pitchRad: headHit.pose.pitchRad,
        },
        carPoses,
        tier: headHit.pose.tier,
        isUnderground: headHit.pose.isUnderground,
        inTunnel: headHit.pose.inTunnel,
        progressOnRoute: Math.round(progressOnRoute * 1000) / 1000,
      });
    }

    this.cachedSnapshots = out;
  }

  getTrains(): readonly SimulatedTrainState[] {
    return this.cachedSnapshots;
  }

  getTrainById(trainId: string): SimulatedTrainState | undefined {
    return this.cachedSnapshots.find((t) => t.trainId === trainId);
  }

  getControlState(): SimulationControlState {
    let undergroundTrainCount = 0;
    for (const t of this.cachedSnapshots) {
      if (t.isUnderground) undergroundTrainCount++;
    }
    return {
      running: this.running,
      timeScale: this.timeScale,
      simClockSec: Math.round(this.simClockSec * 100) / 100,
      density: this.density,
      activeLineFilter: this.activeLineFilter ? [...this.activeLineFilter] : null,
      totalActiveTrains: this.cachedSnapshots.length,
      undergroundTrainCount,
      isVirtualSimulation: true,
      dataNature: 'synthetic',
    };
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  setTimeScale(scale: SimTimeScale): void {
    this.timeScale = scale;
  }

  setDensity(density: SimTrainDensity): void {
    if (this.density === density) return;
    this.density = density;
    this.respawnFleet();
  }

  setLineFilter(lineIds: SkId<'line'>[] | null): void {
    this.activeLineFilter = lineIds && lineIds.length > 0 ? [...lineIds] : null;
    this.respawnFleet();
  }

  reset(seed?: number): void {
    if (seed !== undefined) {
      this.seed = seed;
    }
    this.respawnFleet();
  }

  getDemoUndergroundTrainId(): string | null {
    // 1. Prefer an actively moving underground tunnel train on Marunouchi, Oedo, Fukutoshin, Hanzomon, or Ginza
    const movingUnderground = this.cachedSnapshots.find(
      (t) => t.isUnderground && t.inTunnel && t.speedMps > 1.0,
    );
    if (movingUnderground) return movingUnderground.trainId;

    // 2. Fallback to any underground train
    const anyUnderground = this.cachedSnapshots.find((t) => t.isUnderground);
    if (anyUnderground) return anyUnderground.trainId;

    return this.cachedSnapshots[0]?.trainId ?? null;
  }
}

/**
 * Factory function creating a ready-to-attach `VirtualTrainSimulationEngine` instance
 * implementing `TrainSimulationEngineAdapter`.
 */
export function createTrainSimulationEngine(): VirtualTrainSimulationEngine {
  return new VirtualTrainSimulationEngine();
}
