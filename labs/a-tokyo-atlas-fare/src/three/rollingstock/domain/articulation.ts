/**
 * SENKIRO Atlas v2 — 3D Railway Curve Kinematics & Bogie-Chord Articulation Solver
 *
 * Pure TypeScript module (zero React / Three.js dependency) that computes:
 *  - Arc-length parameterized 3D track polylines (open corridors or closed loops like Yamanote Line)
 *  - Exact per-car 3D world positions and chord orientations from front/rear bogie centers
 *  - Independent local yaw articulation angles for front & rear bogies on horizontal curves
 *  - Pitch angles on vertical gradients (tunnel <-> portal <-> surface <-> viaduct ramps)
 *  - Inter-car gangway bellows deflection angles between coupled cars
 *  - Wheel angular rotation delta from linear travel distance
 */

import type {
  RollingStockSpec,
  SolvedCarPose3D,
  TrackSplinePoint3D,
} from './types.js';

export interface IndexedTrackSpline3D {
  readonly points: readonly TrackSplinePoint3D[];
  readonly cumulativeLengthsM: readonly number[];
  readonly segmentTangents: readonly { x: number; y: number; z: number }[];
  readonly totalLengthM: number;
  readonly closedLoop: boolean;
}

/**
 * Wraps an angle in radians into the interval [-PI, +PI].
 */
export function normalizeAngleRad(angleRad: number): number {
  let a = angleRad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Pre-indexes a 3D track polyline by cumulative 3D Euclidean arc-length in meters.
 */
export function indexTrackSpline3D(
  rawPoints: readonly TrackSplinePoint3D[],
  closedLoop = false,
): IndexedTrackSpline3D {
  if (rawPoints.length < 2) {
    throw new Error('Track spline requires at least 2 points.');
  }

  const points: TrackSplinePoint3D[] = [...rawPoints];
  if (closedLoop) {
    const first = rawPoints[0]!;
    const last = rawPoints[rawPoints.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) > 0.05) {
      points.push({ ...first });
    }
  }

  const cumulativeLengthsM: number[] = [0];
  const segmentTangents: { x: number; y: number; z: number }[] = [];
  let accum = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const segLen = Math.hypot(dx, dy, dz);
    const safeLen = segLen > 1e-6 ? segLen : 1;
    segmentTangents.push({
      x: dx / safeLen,
      y: dy / safeLen,
      z: dz / safeLen,
    });
    accum += segLen;
    cumulativeLengthsM.push(accum);
  }

  return {
    points,
    cumulativeLengthsM,
    segmentTangents,
    totalLengthM: Math.max(0.01, accum),
    closedLoop,
  };
}

export interface SplineSample3D {
  readonly position: { x: number; y: number; z: number };
  readonly tangent: { x: number; y: number; z: number };
  readonly cantRad: number;
  readonly arcDistanceM: number;
}

/**
 * Samples interpolated 3D position, smoothed tangent direction, and cant angle at any arc distance `sM`.
 * If `sM` falls outside `[0, totalLengthM]` on an open spline, extrapolates linearly along the start/end tangent
 * so multi-car trains entering or leaving a segment boundary never collapse onto a single point.
 */
export function sampleTrackSplineAtDistance(
  spline: IndexedTrackSpline3D,
  sM: number,
): SplineSample3D {
  const total = spline.totalLengthM;
  let targetS = sM;

  if (spline.closedLoop) {
    targetS = ((sM % total) + total) % total;
  } else if (sM < 0) {
    const p0 = spline.points[0]!;
    const t0 = spline.segmentTangents[0]!;
    return {
      position: {
        x: p0.x + t0.x * sM,
        y: p0.y + t0.y * sM,
        z: p0.z + t0.z * sM,
      },
      tangent: t0,
      cantRad: p0.cantRad ?? 0,
      arcDistanceM: sM,
    };
  } else if (sM > total) {
    const lastIdx = spline.points.length - 1;
    const pn = spline.points[lastIdx]!;
    const tn = spline.segmentTangents[lastIdx - 1]!;
    const over = sM - total;
    return {
      position: {
        x: pn.x + tn.x * over,
        y: pn.y + tn.y * over,
        z: pn.z + tn.z * over,
      },
      tangent: tn,
      cantRad: pn.cantRad ?? 0,
      arcDistanceM: sM,
    };
  }

  // Binary search segment index in cumulativeLengthsM
  const cum = spline.cumulativeLengthsM;
  let lo = 0;
  let hi = cum.length - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid + 1]! < targetS) {
      lo = mid + 1;
    } else if (cum[mid]! > targetS) {
      hi = mid - 1;
    } else {
      lo = mid;
      break;
    }
  }

  const segIdx = Math.max(0, Math.min(cum.length - 2, lo));
  const s0 = cum[segIdx]!;
  const s1 = cum[segIdx + 1]!;
  const segLen = Math.max(1e-6, s1 - s0);
  const f = Math.max(0, Math.min(1, (targetS - s0) / segLen));

  const p0 = spline.points[segIdx]!;
  const p1 = spline.points[segIdx + 1]!;
  const tCur = spline.segmentTangents[segIdx]!;
  const tPrev = spline.segmentTangents[Math.max(0, segIdx - 1)]!;
  const tNext = spline.segmentTangents[Math.min(spline.segmentTangents.length - 1, segIdx + 1)]!;

  // Smooth tangent across segment joints using local blend near vertices
  const tStart = {
    x: (tPrev.x + tCur.x) * 0.5,
    y: (tPrev.y + tCur.y) * 0.5,
    z: (tPrev.z + tCur.z) * 0.5,
  };
  const tEnd = {
    x: (tCur.x + tNext.x) * 0.5,
    y: (tCur.y + tNext.y) * 0.5,
    z: (tCur.z + tNext.z) * 0.5,
  };
  const rawTx = tStart.x + (tEnd.x - tStart.x) * f;
  const rawTy = tStart.y + (tEnd.y - tStart.y) * f;
  const rawTz = tStart.z + (tEnd.z - tStart.z) * f;
  const tLen = Math.hypot(rawTx, rawTy, rawTz) || 1;

  const c0 = p0.cantRad ?? 0;
  const c1 = p1.cantRad ?? 0;

  return {
    position: {
      x: p0.x + (p1.x - p0.x) * f,
      y: p0.y + (p1.y - p0.y) * f,
      z: p0.z + (p1.z - p0.z) * f,
    },
    tangent: {
      x: rawTx / tLen,
      y: rawTy / tLen,
      z: rawTz / tLen,
    },
    cantRad: c0 + (c1 - c0) * f,
    arcDistanceM: targetS,
  };
}

export interface ConsistPlacementOptions {
  /** Number of cars in the consist */
  readonly carCount: number;
  /** World display scale multiplier (default 1.0 where 1 unit = 1m) */
  readonly worldScale?: number;
  /** Vertical offset above track spline y to railhead (default 0) */
  readonly railheadOffsetY?: number;
}

/**
 * Solves the 3D world pose and bogie articulation angles for every car in a multi-car consist
 * positioned along an indexed 3D railway track spline.
 *
 * `headDistanceM` is the arc-length distance of the front nose of Car #1 along the spline.
 */
export function solveConsistPosesAlongSpline(
  spline: IndexedTrackSpline3D,
  spec: RollingStockSpec,
  headDistanceM: number,
  options: ConsistPlacementOptions,
): SolvedCarPose3D[] {
  const carCount = Math.max(1, options.carCount);
  const scale = options.worldScale ?? 1.0;
  const yOff = options.railheadOffsetY ?? 0;

  const couplerPitchM = spec.dimensions.couplerLengthM * scale;
  const halfBogieSpanM = spec.dimensions.bogieCenterDistanceM * 0.5 * scale;

  const poses: SolvedCarPose3D[] = [];

  for (let i = 0; i < carCount; i++) {
    const centerArcM = headDistanceM - (i + 0.5) * couplerPitchM;
    const frontBogieArcM = centerArcM + halfBogieSpanM;
    const rearBogieArcM = centerArcM - halfBogieSpanM;

    const frontSample = sampleTrackSplineAtDistance(spline, frontBogieArcM);
    const rearSample = sampleTrackSplineAtDistance(spline, rearBogieArcM);

    // Chord vector from rear bogie pivot to front bogie pivot
    const dx = frontSample.position.x - rearSample.position.x;
    const dy = frontSample.position.y - rearSample.position.y;
    const dz = frontSample.position.z - rearSample.position.z;
    const chordLen = Math.hypot(dx, dy, dz) || 1;
    const horizLen = Math.hypot(dx, dz) || 1;

    const forward = {
      x: dx / chordLen,
      y: dy / chordLen,
      z: dz / chordLen,
    };

    // Three.js convention: local +X is car forward, +Y is up, +Z is right side
    // Yaw rotation around +Y axis so local +X points toward (dx, dz):
    const yawRad = Math.atan2(-dz, dx);
    const pitchRad = Math.atan2(dy, horizLen);
    const rollRad = (frontSample.cantRad + rearSample.cantRad) * 0.5;

    // Local bogie yaw relative to car body chord
    const frontTrackYaw = Math.atan2(-frontSample.tangent.z, frontSample.tangent.x);
    const rearTrackYaw = Math.atan2(-rearSample.tangent.z, rearSample.tangent.x);

    const frontBogieLocalYawRad = normalizeAngleRad(frontTrackYaw - yawRad);
    const rearBogieLocalYawRad = normalizeAngleRad(rearTrackYaw - yawRad);

    poses.push({
      carIndex: i,
      position: {
        x: (frontSample.position.x + rearSample.position.x) * 0.5,
        y: (frontSample.position.y + rearSample.position.y) * 0.5 + yOff,
        z: (frontSample.position.z + rearSample.position.z) * 0.5,
      },
      forward,
      yawRad,
      pitchRad,
      rollRad,
      frontBogiePosition: {
        x: frontSample.position.x,
        y: frontSample.position.y + yOff,
        z: frontSample.position.z,
      },
      rearBogiePosition: {
        x: rearSample.position.x,
        y: rearSample.position.y + yOff,
        z: rearSample.position.z,
      },
      frontBogieLocalYawRad,
      rearBogieLocalYawRad,
      rearGangwayYawRad: 0, // populated in pass 2 below
      centerArcDistanceM: centerArcM,
    });
  }

  // Pass 2: compute inter-car gangway bellows deflection angle between car i and car i+1
  return poses.map((pose, idx) => {
    if (idx >= poses.length - 1) return pose;
    const nextPose = poses[idx + 1]!;
    const rearGangwayYawRad = normalizeAngleRad(nextPose.yawRad - pose.yawRad) * 0.5;
    return {
      ...pose,
      rearGangwayYawRad,
    };
  });
}

/**
 * Computes wheel angular rotation delta (radians) for a given linear distance traveled (meters).
 */
export function computeWheelRotationDeltaRad(
  distanceTraveledM: number,
  wheelDiameterM: number,
  worldScale = 1.0,
): number {
  const radiusM = Math.max(0.1, (wheelDiameterM * 0.5) * worldScale);
  return distanceTraveledM / radiusM;
}

/**
 * Creates a smooth S-curve or closed oval 3D test track spline for curved articulation testing & previewing.
 */
export function createShowcaseCurveSpline3D(
  kind: 'straight' | 's_curve' | 'oval_loop',
  lateralOffsetZ = 0,
  baseElevationY = 0,
): IndexedTrackSpline3D {
  if (kind === 'straight') {
    const pts: TrackSplinePoint3D[] = [];
    for (let x = -250; x <= 250; x += 10) {
      pts.push({ x, y: baseElevationY, z: lateralOffsetZ });
    }
    return indexTrackSpline3D(pts, false);
  }

  if (kind === 's_curve') {
    // Realistic railway S-curve with gentle vertical ramp and superelevation cant
    const pts: TrackSplinePoint3D[] = [];
    for (let i = 0; i <= 80; i++) {
      const u = i / 80; // 0..1
      const x = -180 + u * 360;
      const z = lateralOffsetZ + Math.sin(u * Math.PI * 2) * 28;
      const y = baseElevationY + Math.sin(u * Math.PI) * 2.2;
      const cantRad = Math.cos(u * Math.PI * 2) * 0.045;
      pts.push({ x, y, z, cantRad });
    }
    return indexTrackSpline3D(pts, false);
  }

  // Closed stadium oval loop (straightaways + R=65m semicircular curves)
  const pts: TrackSplinePoint3D[] = [];
  const straightHalf = 70;
  const radius = 58;
  const stepsStraight = 18;
  const stepsCurve = 28;

  // Bottom straight (-straightHalf -> +straightHalf at z = +radius)
  for (let i = 0; i < stepsStraight; i++) {
    const f = i / stepsStraight;
    pts.push({
      x: -straightHalf + f * (straightHalf * 2),
      y: baseElevationY,
      z: lateralOffsetZ + radius,
      cantRad: 0,
    });
  }
  // Right semicircle (+straightHalf, angle +PI/2 -> -PI/2)
  for (let i = 0; i < stepsCurve; i++) {
    const f = i / stepsCurve;
    const ang = Math.PI * 0.5 - f * Math.PI;
    pts.push({
      x: straightHalf + Math.cos(ang) * radius,
      y: baseElevationY + Math.sin(f * Math.PI) * 1.5,
      z: lateralOffsetZ + Math.sin(ang) * radius,
      cantRad: -0.055 * Math.sin(f * Math.PI),
    });
  }
  // Top straight (+straightHalf -> -straightHalf at z = -radius)
  for (let i = 0; i < stepsStraight; i++) {
    const f = i / stepsStraight;
    pts.push({
      x: straightHalf - f * (straightHalf * 2),
      y: baseElevationY,
      z: lateralOffsetZ - radius,
      cantRad: 0,
    });
  }
  // Left semicircle (-straightHalf, angle -PI/2 -> -3PI/2)
  for (let i = 0; i < stepsCurve; i++) {
    const f = i / stepsCurve;
    const ang = -Math.PI * 0.5 - f * Math.PI;
    pts.push({
      x: -straightHalf + Math.cos(ang) * radius,
      y: baseElevationY,
      z: lateralOffsetZ + Math.sin(ang) * radius,
      cantRad: -0.055 * Math.sin(f * Math.PI),
    });
  }

  return indexTrackSpline3D(pts, true);
}
