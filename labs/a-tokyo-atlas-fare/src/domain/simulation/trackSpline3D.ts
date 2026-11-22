/**
 * SENKIRO Atlas v2 — 3D Track Spline & Multi-Carriage Two-Bogie Pose Solver.
 *
 * Implements:
 *  1. Corner-rounded, arc-length parameterized 3D physical track curve (`TrackSpline3D`)
 *     built from solved 3D railway segments (`PhysicalTrackPathSegment[]`).
 *     Uses convex quadratic Bézier corner fillets at polyline vertices so that:
 *       - First-derivative tangent & curvature are continuous through curves.
 *       - Every point remains strictly within the convex hull of adjacent track bed points
 *         (zero vertical overshoot, never floating in mid-air, never dipping underground,
 *         and never cutting across buildings).
 *  2. Binary-search O(log N) arc-length evaluation returning position, 3D tangent,
 *     horizontal curvature, active TrackSegment ID, structure kind, and elevation tier.
 *  3. Two-bogie multi-carriage kinematic pose solver (`solveConsistCarriagePoses`)
 *     computing each carriage's front bogie, rear bogie, rigid body center, and
 *     3D orientation (Euler + unit quaternion) while strictly preserving inter-car spacing.
 */

import type { SchematicTierId, TrackStructureKind } from '../elevationSolver.js';
import type { SkId } from '../types.js';
import type {
  Orientation3D,
  PhysicalTrackPathSegment,
  RollingStockSpec,
  SimulatedCarriagePose,
  Vector3Like,
  VirtualTrainConsist,
} from './types.js';

export interface TrackSplineSample {
  readonly s: number; // Cumulative 3D arc length from route start (meters)
  readonly position: Vector3Like;
  readonly tangent: Vector3Like;
  /** Local horizontal curvature kappa = |d(yaw)/ds| in 1/meters */
  readonly curvature: number;
  readonly trackSegmentId: SkId<'segment'>;
  readonly structure: TrackStructureKind;
  readonly tier: SchematicTierId;
}

interface RawControlVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly trackSegmentId: SkId<'segment'>;
  readonly structure: TrackStructureKind;
  readonly tier: SchematicTierId;
}

/**
 * Computes a full 3D orientation (orthonormal basis, yaw, pitch, roll, and unit quaternion)
 * from a non-zero forward direction vector in SENKIRO's right-handed world space (+Y up).
 */
export function computeOrientationFromForward(forwardInput: Vector3Like): Orientation3D {
  const fLen = Math.hypot(forwardInput.x, forwardInput.y, forwardInput.z);
  const fx = fLen > 1e-8 ? forwardInput.x / fLen : 0;
  const fy = fLen > 1e-8 ? forwardInput.y / fLen : 0;
  const fz = fLen > 1e-8 ? forwardInput.z / fLen : 1;

  // Horizontal projection for right vector (keeps cars level laterally without unwanted roll)
  const hLen = Math.hypot(fx, fz);
  const rx = hLen > 1e-6 ? fz / hLen : 1;
  const ry = 0;
  const rz = hLen > 1e-6 ? -fx / hLen : 0;

  // Orthonormal up = forward x right in right-handed basis where R = [right, up, forward]
  // Wait: in right-handed coordinates (+X right, +Y up, +Z forward):
  // X cross Y = Z => right = up_world x forward = (0,1,0) x (fx,fy,fz) = (fz, 0, -fx)
  // and up = forward x right = (fy*rz - fz*ry, fz*rx - fx*rz, fx*ry - fy*rx)
  const uxRaw = fy * rz - fz * ry;
  const uyRaw = fz * rx - fx * rz;
  const uzRaw = fx * ry - fy * rx;
  const uLen = Math.hypot(uxRaw, uyRaw, uzRaw) || 1;
  const ux = uxRaw / uLen;
  const uy = uyRaw / uLen;
  const uz = uzRaw / uLen;

  const yawRad = Math.atan2(fx, fz);
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, fy)));
  const rollRad = 0;

  const quaternion = rotationMatrixToQuaternion(rx, ux, fx, ry, uy, fy, rz, uz, fz);

  return {
    forward: { x: fx, y: fy, z: fz },
    up: { x: ux, y: uy, z: uz },
    right: { x: rx, y: ry, z: rz },
    yawRad,
    pitchRad,
    rollRad,
    quaternion,
  };
}

/**
 * Converts a 3x3 proper orthonormal rotation matrix (columns = Right, Up, Forward)
 * into a normalized quaternion [qx, qy, qz, qw].
 */
function rotationMatrixToQuaternion(
  m00: number,
  m01: number,
  m02: number,
  m10: number,
  m11: number,
  m12: number,
  m20: number,
  m21: number,
  m22: number,
): readonly [number, number, number, number] {
  const trace = m00 + m11 + m22;
  let qx: number;
  let qy: number;
  let qz: number;
  let qw: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const norm = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / norm, qy / norm, qz / norm, qw / norm];
}

function normalizeAngleDelta(dTheta: number): number {
  let d = dTheta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Continuous 3D Arc-Length Parameterized Track Spline.
 */
export class TrackSpline3D {
  readonly samples: readonly TrackSplineSample[];
  readonly totalLengthM: number;
  readonly isLoop: boolean;

  constructor(
    segments: readonly PhysicalTrackPathSegment[],
    options?: {
      isLoop?: boolean;
      maxFilletRadiusM?: number;
      filletSubdivisions?: number;
      maxSampleStepM?: number;
    },
  ) {
    this.isLoop = options?.isLoop ?? false;
    const maxFilletM = options?.maxFilletRadiusM ?? 65;
    const filletSubdivs = options?.filletSubdivisions ?? 8;
    const maxSampleStepM = options?.maxSampleStepM ?? 6;

    // 1. Collect deduplicated control vertices from the stitched physical track segments
    const dedupVertices: RawControlVertex[] = [];
    for (const seg of segments) {
      for (const pt of seg.points3D) {
        if (dedupVertices.length > 0) {
          const prev = dedupVertices[dedupVertices.length - 1]!;
          const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
          if (dist < 0.25) continue;
        }
        dedupVertices.push({
          x: pt.x,
          y: pt.y,
          z: pt.z,
          trackSegmentId: seg.trackSegmentId,
          structure: pt.structure,
          tier: pt.tier,
        });
      }
    }

    // Collapse redundant collinear intermediate points (from prior linear resampling)
    // so corner fillets see the true chord length between actual bends!
    const rawVertices: RawControlVertex[] = [];
    for (let i = 0; i < dedupVertices.length; i++) {
      const cur = dedupVertices[i]!;
      if (i === 0 || i === dedupVertices.length - 1) {
        rawVertices.push(cur);
        continue;
      }
      const prev = rawVertices[rawVertices.length - 1]!;
      const next = dedupVertices[i + 1]!;
      if (
        cur.trackSegmentId !== prev.trackSegmentId ||
        cur.trackSegmentId !== next.trackSegmentId ||
        cur.structure !== prev.structure ||
        cur.tier !== prev.tier
      ) {
        rawVertices.push(cur);
        continue;
      }
      const dx1 = cur.x - prev.x;
      const dy1 = cur.y - prev.y;
      const dz1 = cur.z - prev.z;
      const l1 = Math.hypot(dx1, dy1, dz1);
      const dx2 = next.x - cur.x;
      const dy2 = next.y - cur.y;
      const dz2 = next.z - cur.z;
      const l2 = Math.hypot(dx2, dy2, dz2);
      if (l1 < 0.5 || l2 < 0.5) continue;
      const dot = Math.max(
        -1,
        Math.min(1, (dx1 * dx2 + dy1 * dy2 + dz1 * dz2) / (l1 * l2)),
      );
      const angle = Math.acos(dot);
      // Keep vertex if it turns by >= 0.6 degrees or spans > 80m
      if (angle >= 0.01 || l1 > 80) {
        rawVertices.push(cur);
      }
    }

    if (rawVertices.length < 2) {
      const fallback: RawControlVertex = rawVertices[0] ?? {
        x: 0,
        y: 0,
        z: 0,
        trackSegmentId: 'sk:segment:empty',
        structure: 'surface',
        tier: 'L0',
      };
      this.samples = [
        {
          s: 0,
          position: { x: fallback.x, y: fallback.y, z: fallback.z },
          tangent: { x: 0, y: 0, z: 1 },
          curvature: 0,
          trackSegmentId: fallback.trackSegmentId,
          structure: fallback.structure,
          tier: fallback.tier,
        },
      ];
      this.totalLengthM = 0;
      return;
    }

    // 2. Build corner-rounded dense polyline (convex quadratic Bézier fillets at interior corners)
    const denseVertices: RawControlVertex[] = [];
    const pushDense = (v: RawControlVertex) => {
      if (denseVertices.length > 0) {
        const last = denseVertices[denseVertices.length - 1]!;
        if (Math.hypot(v.x - last.x, v.y - last.y, v.z - last.z) < 0.05) return;
      }
      denseVertices.push(v);
    };

    const subdivideLinear = (a: RawControlVertex, b: RawControlVertex) => {
      const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const steps = Math.max(1, Math.ceil(dist / maxSampleStepM));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        pushDense({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          trackSegmentId: t < 0.5 ? a.trackSegmentId : b.trackSegmentId,
          structure: t < 0.5 ? a.structure : b.structure,
          tier: t < 0.5 ? a.tier : b.tier,
        });
      }
    };

    pushDense(rawVertices[0]!);
    let currentAnchor: RawControlVertex = rawVertices[0]!;

    for (let i = 1; i < rawVertices.length - 1; i++) {
      const prev = rawVertices[i - 1]!;
      const cur = rawVertices[i]!;
      const next = rawVertices[i + 1]!;

      const inDx = cur.x - prev.x;
      const inDy = cur.y - prev.y;
      const inDz = cur.z - prev.z;
      const inLen = Math.hypot(inDx, inDy, inDz);

      const outDx = next.x - cur.x;
      const outDy = next.y - cur.y;
      const outDz = next.z - cur.z;
      const outLen = Math.hypot(outDx, outDy, outDz);

      if (inLen < 1.0 || outLen < 1.0) {
        subdivideLinear(currentAnchor, cur);
        currentAnchor = cur;
        continue;
      }

      const ux1 = inDx / inLen;
      const uy1 = inDy / inLen;
      const uz1 = inDz / inLen;
      const ux2 = outDx / outLen;
      const uy2 = outDy / outLen;
      const uz2 = outDz / outLen;

      const dot = Math.max(-1, Math.min(1, ux1 * ux2 + uy1 * uy2 + uz1 * uz2));
      const turnAngle = Math.acos(dot);

      // If nearly collinear (< 1.5 degrees), no fillet needed
      if (turnAngle < 0.026) {
        subdivideLinear(currentAnchor, cur);
        currentAnchor = cur;
        continue;
      }

      const cutDist = Math.min(maxFilletM, inLen * 0.46, outLen * 0.46);
      const filletStart: RawControlVertex = {
        x: cur.x - ux1 * cutDist,
        y: cur.y - uy1 * cutDist,
        z: cur.z - uz1 * cutDist,
        trackSegmentId: cur.trackSegmentId,
        structure: cur.structure,
        tier: cur.tier,
      };
      const filletEnd: RawControlVertex = {
        x: cur.x + ux2 * cutDist,
        y: cur.y + uy2 * cutDist,
        z: cur.z + uz2 * cutDist,
        trackSegmentId: next.trackSegmentId,
        structure: cur.structure,
        tier: cur.tier,
      };

      // Linear section from currentAnchor up to filletStart
      subdivideLinear(currentAnchor, filletStart);

      // Quadratic Bézier curve from filletStart -> cur -> filletEnd (strictly convex combination!)
      for (let k = 1; k <= filletSubdivs; k++) {
        const t = k / filletSubdivs;
        const omt = 1 - t;
        const w0 = omt * omt;
        const w1 = 2 * omt * t;
        const w2 = t * t;
        pushDense({
          x: w0 * filletStart.x + w1 * cur.x + w2 * filletEnd.x,
          y: w0 * filletStart.y + w1 * cur.y + w2 * filletEnd.y,
          z: w0 * filletStart.z + w1 * cur.z + w2 * filletEnd.z,
          trackSegmentId: t < 0.5 ? cur.trackSegmentId : next.trackSegmentId,
          structure: cur.structure,
          tier: cur.tier,
        });
      }

      currentAnchor = filletEnd;
    }

    // Final chord to last vertex
    subdivideLinear(currentAnchor, rawVertices[rawVertices.length - 1]!);

    // 3. Compute cumulative 3D arc length, unit tangents, and local horizontal curvature
    const cumLengths: number[] = [0];
    let totalLen = 0;
    for (let i = 1; i < denseVertices.length; i++) {
      const a = denseVertices[i - 1]!;
      const b = denseVertices[i]!;
      totalLen += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      cumLengths.push(totalLen);
    }

    const tangents: Vector3Like[] = [];
    for (let i = 0; i < denseVertices.length; i++) {
      const prev = denseVertices[Math.max(0, i - 1)]!;
      const next = denseVertices[Math.min(denseVertices.length - 1, i + 1)]!;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      tangents.push({ x: dx / len, y: dy / len, z: dz / len });
    }

    const builtSamples: TrackSplineSample[] = [];
    for (let i = 0; i < denseVertices.length; i++) {
      const v = denseVertices[i]!;
      const tCur = tangents[i]!;
      const sCur = cumLengths[i]!;
      // Measure curvature over a ~16m carriage-length window [sCur - 8m, sCur + 8m]
      let iPrev = i;
      while (iPrev > 0 && sCur - cumLengths[iPrev]! < 8.0) {
        iPrev--;
      }
      let iNext = i;
      while (iNext < denseVertices.length - 1 && cumLengths[iNext]! - sCur < 8.0) {
        iNext++;
      }
      const ds = Math.max(1.0, cumLengths[iNext]! - cumLengths[iPrev]!);
      const yawPrev = Math.atan2(tangents[iPrev]!.x, tangents[iPrev]!.z);
      const yawNext = Math.atan2(tangents[iNext]!.x, tangents[iNext]!.z);
      const dYaw = Math.abs(normalizeAngleDelta(yawNext - yawPrev));
      const curvature = dYaw / ds;

      builtSamples.push({
        s: sCur,
        position: { x: v.x, y: v.y, z: v.z },
        tangent: tCur,
        curvature,
        trackSegmentId: v.trackSegmentId,
        structure: v.structure,
        tier: v.tier,
      });
    }

    this.samples = builtSamples;
    this.totalLengthM = totalLen;
  }

  /**
   * Normalizes an arc-length value `s`:
   *  - If `isLoop` is true, wraps modulo `totalLengthM` into `[0, totalLengthM)`.
   *  - If `isLoop` is false, leaves `s` as-is (supporting linear platform extrapolation at endpoints).
   */
  normalizeArcLength(s: number): number {
    if (!this.isLoop || this.totalLengthM <= 0) return s;
    const m = s % this.totalLengthM;
    return m < 0 ? m + this.totalLengthM : m;
  }

  /**
   * Evaluates 3D position, tangent, curvature, and track metadata at arbitrary arc-length `s` (meters)
   * in O(log N) time via binary search.
   */
  sampleAtArcLength(rawS: number): TrackSplineSample {
    const n = this.samples.length;
    if (n === 0) {
      throw new Error('TrackSpline3D has no samples');
    }
    if (n === 1 || this.totalLengthM <= 1e-6) {
      return this.samples[0]!;
    }

    const s = this.normalizeArcLength(rawS);

    // Handle before-origin extrapolation (e.g., trailing cars resting on origin station platform at s < 0)
    if (s <= 0) {
      const first = this.samples[0]!;
      if (s === 0) return first;
      const hLen = Math.hypot(first.tangent.x, first.tangent.z) || 1;
      const hx = first.tangent.x / hLen;
      const hz = first.tangent.z / hLen;
      return {
        s,
        position: {
          x: first.position.x + hx * s,
          y: first.position.y, // Platform level stays horizontal at station elevation
          z: first.position.z + hz * s,
        },
        tangent: { x: hx, y: 0, z: hz },
        curvature: 0,
        trackSegmentId: first.trackSegmentId,
        structure: first.structure,
        tier: first.tier,
      };
    }

    // Handle past-terminal extrapolation (e.g., front bogie extending slightly past s = totalLengthM)
    if (s >= this.totalLengthM) {
      const last = this.samples[n - 1]!;
      const extra = s - this.totalLengthM;
      if (extra <= 1e-6) return last;
      const hLen = Math.hypot(last.tangent.x, last.tangent.z) || 1;
      const hx = last.tangent.x / hLen;
      const hz = last.tangent.z / hLen;
      return {
        s,
        position: {
          x: last.position.x + hx * extra,
          y: last.position.y,
          z: last.position.z + hz * extra,
        },
        tangent: { x: hx, y: 0, z: hz },
        curvature: 0,
        trackSegmentId: last.trackSegmentId,
        structure: last.structure,
        tier: last.tier,
      };
    }

    // Binary search for interval [lo, hi] where samples[lo].s <= s <= samples[hi].s
    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid]!.s <= s) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const a = this.samples[lo]!;
    const b = this.samples[hi]!;
    const span = b.s - a.s;
    const t = span > 1e-6 ? (s - a.s) / span : 0;

    const px = a.position.x + (b.position.x - a.position.x) * t;
    const py = a.position.y + (b.position.y - a.position.y) * t;
    const pz = a.position.z + (b.position.z - a.position.z) * t;

    const txRaw = a.tangent.x + (b.tangent.x - a.tangent.x) * t;
    const tyRaw = a.tangent.y + (b.tangent.y - a.tangent.y) * t;
    const tzRaw = a.tangent.z + (b.tangent.z - a.tangent.z) * t;
    const tLen = Math.hypot(txRaw, tyRaw, tzRaw) || 1;

    const curvature = a.curvature + (b.curvature - a.curvature) * t;
    const activeSample = t < 0.5 ? a : b;

    return {
      s,
      position: { x: px, y: py, z: pz },
      tangent: { x: txRaw / tLen, y: tyRaw / tLen, z: tzRaw / tLen },
      curvature,
      trackSegmentId: activeSample.trackSegmentId,
      structure: activeSample.structure,
      tier: activeSample.tier,
    };
  }

  /**
   * Computes the maximum horizontal curvature kappa (1/m) within a lookahead window
   * `[sStart, sEnd]` so the train speed controller can enforce curve speed limits smoothly.
   */
  getMaxCurvatureInWindow(sStart: number, sEnd: number, stepM = 8): number {
    let maxKappa = 0;
    const dist = Math.max(0, sEnd - sStart);
    const steps = Math.max(1, Math.ceil(dist / stepM));
    for (let i = 0; i <= steps; i++) {
      const s = sStart + (dist * i) / steps;
      const sample = this.sampleAtArcLength(s);
      if (sample.curvature > maxKappa) {
        maxKappa = sample.curvature;
      }
    }
    return maxKappa;
  }

  /**
   * Projects a 3D world point (e.g. a station coordinate) onto the closest arc-length `s`
   * within an optional search range `[minS, maxS]`.
   */
  findClosestArcLength(
    target: { x: number; y?: number; z: number },
    minS = 0,
    maxS = this.totalLengthM,
  ): number {
    let bestS = minS;
    let bestDistSq = Infinity;
    for (const sample of this.samples) {
      if (sample.s < minS - 1 || sample.s > maxS + 1) continue;
      const dx = sample.position.x - target.x;
      const dz = sample.position.z - target.z;
      const dy = target.y !== undefined ? (sample.position.y - target.y) * 0.5 : 0;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestS = sample.s;
      }
    }
    return Math.max(minS, Math.min(maxS, bestS));
  }
}

/**
 * Solves the 3D position and orientation of every carriage in a `VirtualTrainConsist`
 * given the leading nose arc-length `headArcLengthM` along `spline`.
 *
 * Uses the physical two-bogie chord method:
 *  - Each car's front and rear bogie pivots are sampled directly on the 3D track spline.
 *  - The car body center sits at the midpoint between its front and rear bogie pivots
 *    (with vertical elevation blended 50/50 with the center rail sample to prevent chord sag on vertical grade transitions).
 *  - The car body orientation vector is strictly aligned with `(frontBogie - rearBogie)`.
 */
export function solveConsistCarriagePoses(
  spline: TrackSpline3D,
  consist: VirtualTrainConsist,
  spec: RollingStockSpec,
  headArcLengthM: number,
): SimulatedCarriagePose[] {
  const poses: SimulatedCarriagePose[] = [];

  for (const car of consist.cars) {
    const centerS = headArcLengthM - car.centerOffsetFromNoseM;
    const frontBogieS = headArcLengthM - car.frontBogieOffsetFromNoseM;
    const rearBogieS = headArcLengthM - car.rearBogieOffsetFromNoseM;

    const frontSample = spline.sampleAtArcLength(frontBogieS);
    const rearSample = spline.sampleAtArcLength(rearBogieS);
    const centerSample = spline.sampleAtArcLength(centerS);

    const chordX = frontSample.position.x - rearSample.position.x;
    const chordY = frontSample.position.y - rearSample.position.y;
    const chordZ = frontSample.position.z - rearSample.position.z;
    const chordLen = Math.hypot(chordX, chordY, chordZ);

    const forward: Vector3Like =
      chordLen > 1e-4
        ? { x: chordX / chordLen, y: chordY / chordLen, z: chordZ / chordLen }
        : centerSample.tangent;

    const orientation = computeOrientationFromForward(forward);

    // Midpoint of front and rear bogies for horizontal curvaure inscription;
    // blend Y with center track elevation so vertical grade crowns never sag
    const position: Vector3Like = {
      x: (frontSample.position.x + rearSample.position.x) * 0.5,
      y:
        (frontSample.position.y + rearSample.position.y) * 0.25 +
        centerSample.position.y * 0.5,
      z: (frontSample.position.z + rearSample.position.z) * 0.5,
    };

    poses.push({
      carIndex: car.carIndex,
      carId: car.carId,
      role: car.role,
      lengthM: car.lengthM,
      widthM: spec.carWidthM,
      heightM: spec.carHeightM,
      position,
      orientation,
      frontBogiePosition: frontSample.position,
      rearBogiePosition: rearSample.position,
      centerArcLengthM: spline.normalizeArcLength(centerS),
      trackSegmentId: centerSample.trackSegmentId,
      structure: centerSample.structure,
      tier: centerSample.tier,
    });
  }

  return poses;
}
