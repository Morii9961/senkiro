/**
 * Pure-TS Underground Centerline, Chunking, Station Cavern & Camera Viewpoint Builder.
 *
 * Consumes `SolvedRailwayNetwork3D` directly (single source of truth for world coordinates
 * and physical topology — never invents conflicting coordinate systems or fake 2D junctions).
 *
 * Responsibilities:
 *  - Smooth Catmull-Rom centerline resampling (6m step in pilot corridors, 14m elsewhere)
 *    while preserving exact station endpoints & portal transition coordinates.
 *  - Splits underground runs into non-overlapping sub-spans:
 *      [station cavern zone] <-> [transition collar] <-> [running bore] <-> [portal ramp]
 *  - Computes orthonormal TrackFrame3D (position, tangent, right, up, grade) at every sample.
 *  - Generates accurate AABBs, Camera Session curated viewpoints & clearance constraints.
 *  - Tags all schematic depths explicitly with `depthReliability: 'schematic'`.
 */

import type {
  SolvedPoint3D,
  SolvedRailwayNetwork3D,
  SolvedSegment3D,
  SolvedStationNode3D,
} from '../elevationSolver.js';
import type { SkId } from '../types.js';
import {
  createTunnelCrossSectionSpec,
  getLineEngineeringSpec,
} from './tunnelProfileSpecs.js';
import type {
  Aabb3D,
  BuiltUndergroundNetwork,
  DepthReliability,
  StationCavernSpec,
  TrackFrame3D,
  TunnelClearanceConstraint,
  TunnelPortalSpec,
  TunnelSegmentChunkSpec,
  TunnelStructureType,
  TunnelSubSpan,
  TunnelViewpoint,
  Vec3,
} from './tunnelTypes.js';

/** Exact elevation threshold matching elevationSolver.ts classifyStructure() */
export const TUNNEL_ELEVATION_THRESHOLD_Y = -2.4;

/**
 * Curated high-reliability pilot corridors (100% OSM underground evidence + verified relative overrides):
 *  - Ginza Line: Shibuya -> Omotesando -> Gaienmae -> Aoyama-Itchome (elevated portal -> box tunnel -> stations)
 *  - Fukutoshin Line: Shibuya -> Meiji-Jingumae (deep circular shield tunnel + rigid catenary)
 *  - Hanzomon Line: Omotesando -> Aoyama-Itchome (mid-depth rigid catenary crossing under Ginza)
 *  - Marunouchi Line: Tokyo -> Otemachi -> Awajicho -> Ochanomizu (5-line hub + Kanda River portal)
 */
export const PILOT_CORRIDOR_SEGMENT_IDS = new Set<string>([
  'sk:segment:metro-ginza--tokyo-metro-shibuya--tokyo-metro-omote-sando',
  'sk:segment:metro-ginza--tokyo-metro-omote-sando--tokyo-metro-003834',
  'sk:segment:metro-ginza--tokyo-metro-003834--tokyo-metro-003817',
  'sk:segment:metro-fukutoshin--tokyo-metro-shibuya--tokyo-metro-003844',
  'sk:segment:metro-hanzomon--tokyo-metro-omote-sando--tokyo-metro-003817',
  'sk:segment:metro-marunouchi--tokyo-metro-tokyo--tokyo-metro-otemachi',
  'sk:segment:metro-marunouchi--tokyo-metro-otemachi--tokyo-metro-003661',
  'sk:segment:metro-marunouchi--tokyo-metro-003661--tokyo-metro-ochanomizu',
]);

function createEmptyAabb(): Aabb3D {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function expandAabb(aabb: Aabb3D, x: number, y: number, z: number, padXZ = 0, padY = 0): void {
  if (x - padXZ < aabb.min[0]) aabb.min[0] = x - padXZ;
  if (y - padY < aabb.min[1]) aabb.min[1] = y - padY;
  if (z - padXZ < aabb.min[2]) aabb.min[2] = z - padXZ;
  if (x + padXZ > aabb.max[0]) aabb.max[0] = x + padXZ;
  if (y + padY > aabb.max[1]) aabb.max[1] = y + padY;
  if (z + padXZ > aabb.max[2]) aabb.max[2] = z + padXZ;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Extracts continuous underground runs (y <= TUNNEL_ELEVATION_THRESHOLD_Y) from a SolvedSegment3D,
 * inserting exact linear-interpolated crossing vertices at y = -2.4 so underground tunnels meet
 * surface/viaduct tracks with zero gap or overlap!
 */
interface UndergroundRun {
  points: SolvedPoint3D[];
  startsAtPortal: boolean;
  endsAtPortal: boolean;
  touchesStartStation: boolean;
  touchesEndStation: boolean;
}

function extractUndergroundRuns(seg: SolvedSegment3D): UndergroundRun[] {
  const pts = seg.points;
  if (pts.length < 2) return [];

  const runs: UndergroundRun[] = [];
  let cur: SolvedPoint3D[] = [];
  let startsAtPortal = false;
  let touchesStartStation = false;

  const isUg = (p: SolvedPoint3D) => p.y <= TUNNEL_ELEVATION_THRESHOLD_Y;

  const interpPortalPoint = (a: SolvedPoint3D, b: SolvedPoint3D): SolvedPoint3D => {
    const dy = b.y - a.y;
    const f = Math.abs(dy) > 1e-5 ? (TUNNEL_ELEVATION_THRESHOLD_Y - a.y) / dy : 0.5;
    const cf = Math.max(0, Math.min(1, f));
    return {
      x: a.x + (b.x - a.x) * cf,
      y: TUNNEL_ELEVATION_THRESHOLD_Y,
      z: a.z + (b.z - a.z) * cf,
      t: a.t + (b.t - a.t) * cf,
      distFromStart: a.distFromStart + (b.distFromStart - a.distFromStart) * cf,
      structure: isUg(a) ? a.structure : b.structure,
      tier: isUg(a) ? a.tier : b.tier,
    };
  };

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (isUg(p)) {
      if (cur.length === 0) {
        if (i === 0) {
          touchesStartStation = true;
          startsAtPortal = false;
        } else {
          // Entered underground from surface/viaduct
          startsAtPortal = true;
          touchesStartStation = false;
          cur.push(interpPortalPoint(pts[i - 1]!, p));
        }
      }
      cur.push(p);
    } else if (cur.length > 0) {
      // Exited underground to surface/viaduct
      cur.push(interpPortalPoint(pts[i - 1]!, p));
      if (cur.length >= 2) {
        runs.push({
          points: cur,
          startsAtPortal,
          endsAtPortal: true,
          touchesStartStation,
          touchesEndStation: false,
        });
      }
      cur = [];
      startsAtPortal = false;
      touchesStartStation = false;
    }
  }

  if (cur.length >= 2) {
    runs.push({
      points: cur,
      startsAtPortal,
      endsAtPortal: false,
      touchesStartStation,
      touchesEndStation: true,
    });
  }

  return runs;
}

/**
 * Removes redundant hairpin overshoots near segment endpoints (common in raw GIS railway polylines
 * where a line passes a station coordinate, overshoots by 30-120m, and reverses back to the station).
 * Preserves exact start & end coordinates while guaranteeing monotonic approach into stations.
 */
function pruneEndpointOvershoots(raw: SolvedPoint3D[]): SolvedPoint3D[] {
  if (raw.length < 4) return raw;
  let pts = raw;

  // 1. Check tail overshoot: does an earlier vertex pass near endPt before overshooting away and returning?
  const endPt = pts[pts.length - 1]!;
  let closestTailIdx = -1;
  let closestTailDist = 28;
  for (let i = Math.floor(pts.length * 0.35); i < pts.length - 2; i++) {
    const p = pts[i]!;
    const d = Math.hypot(p.x - endPt.x, p.z - endPt.z);
    if (d < closestTailDist) {
      let maxAfter = d;
      for (let k = i + 1; k < pts.length - 1; k++) {
        const dk = Math.hypot(pts[k]!.x - endPt.x, pts[k]!.z - endPt.z);
        if (dk > maxAfter) maxAfter = dk;
      }
      if (maxAfter > d + 18) {
        closestTailDist = d;
        closestTailIdx = i;
      }
    }
  }
  if (closestTailIdx >= 1) {
    const kept = pts.slice(0, closestTailIdx + 1);
    const lastKept = kept[kept.length - 1]!;
    // Avoid creating a near-vertical micro-step if lastKept is already right on top of endPt
    if (Math.hypot(lastKept.x - endPt.x, lastKept.z - endPt.z) < 2.5) {
      kept[kept.length - 1] = endPt;
      pts = kept;
    } else {
      pts = [...kept, endPt];
    }
  }

  // 2. Check head overshoot: does a later vertex pass near startPt after overshooting away?
  if (pts.length >= 4) {
    const startPt = pts[0]!;
    let closestHeadIdx = -1;
    let closestHeadDist = 28;
    for (let i = 2; i < Math.ceil(pts.length * 0.65); i++) {
      const p = pts[i]!;
      const d = Math.hypot(p.x - startPt.x, p.z - startPt.z);
      if (d < closestHeadDist) {
        let maxBefore = d;
        for (let k = 1; k < i; k++) {
          const dk = Math.hypot(pts[k]!.x - startPt.x, pts[k]!.z - startPt.z);
          if (dk > maxBefore) maxBefore = dk;
        }
        if (maxBefore > d + 18) {
          closestHeadDist = d;
          closestHeadIdx = i;
        }
      }
    }
    if (closestHeadIdx >= 2 && closestHeadIdx < pts.length - 1) {
      const tail = pts.slice(closestHeadIdx);
      const firstTail = tail[0]!;
      if (Math.hypot(firstTail.x - startPt.x, firstTail.z - startPt.z) < 2.5) {
        tail[0] = startPt;
        pts = tail;
      } else {
        pts = [startPt, ...tail];
      }
    }
  }

  return pts;
}

/**
 * Resamples a raw underground polyline with Catmull-Rom smoothing to uniform step size
 * while preserving exact start and end points (critical for station & portal continuity).
 */
function resampleSmoothPoints(rawInput: SolvedPoint3D[], targetStepM: number): Vec3[] {
  const raw = pruneEndpointOvershoots(rawInput);
  if (raw.length < 2) return [];

  // Deduplicate near-coincident control points
  const ctrl: Vec3[] = [{ x: raw[0]!.x, y: raw[0]!.y, z: raw[0]!.z }];
  for (let i = 1; i < raw.length - 1; i++) {
    const prev = ctrl[ctrl.length - 1]!;
    const p = raw[i]!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) >= 1.5) {
      ctrl.push({ x: p.x, y: p.y, z: p.z });
    }
  }
  const lastRaw = raw[raw.length - 1]!;
  const lastCtrl = ctrl[ctrl.length - 1]!;
  if (Math.hypot(lastRaw.x - lastCtrl.x, lastRaw.y - lastCtrl.y, lastRaw.z - lastCtrl.z) >= 0.2) {
    ctrl.push({ x: lastRaw.x, y: lastRaw.y, z: lastRaw.z });
  }
  if (ctrl.length < 2) return [];

  const dense: Vec3[] = [ctrl[0]!];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]!;
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    const steps = Math.max(1, Math.ceil(chord / targetStepM));

    // Only apply Catmull-Rom curvature when the bend is realistic (< 65 deg), else linear to prevent overshoot
    const v1x = p1.x - p0.x;
    const v1z = p1.z - p0.z;
    const v2x = p2.x - p1.x;
    const v2z = p2.z - p1.z;
    const v3x = p3.x - p2.x;
    const v3z = p3.z - p2.z;
    const l1 = Math.hypot(v1x, v1z);
    const l2 = Math.hypot(v2x, v2z);
    const l3 = Math.hypot(v3x, v3z);
    const dotA = l1 > 1e-3 && l2 > 1e-3 ? (v1x * v2x + v1z * v2z) / (l1 * l2) : 1;
    const dotB = l2 > 1e-3 && l3 > 1e-3 ? (v2x * v3x + v2z * v3z) / (l2 * l3) : 1;
    const useSpline = ctrl.length >= 3 && dotA > 0.35 && dotB > 0.35;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (useSpline) {
        dense.push({
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
          y: p1.y + (p2.y - p1.y) * t, // keep monotonic vertical grade without overshoot!
          z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
        });
      } else {
        dense.push({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
          z: p1.z + (p2.z - p1.z) * t,
        });
      }
    }
  }
  return dense;
}

/**
 * Computes orthonormal TrackFrame3D chain with level horizontal `right` vector (in XZ plane)
 * so roadbeds, rails, walkways, and station platforms never roll/bank unnaturally.
 */
function buildFramesFromPoints(
  pts: Vec3[],
  structureType: TunnelStructureType,
  tier: SolvedSegment3D['dominantTier'],
  heightBasis: SolvedSegment3D['heightBasis'],
  depthReliability: DepthReliability,
): TrackFrame3D[] {
  const frames: TrackFrame3D[] = [];
  let accumDist = 0;
  let lastRx = 1;
  let lastRz = 0;
  let lastTx = 0;
  let lastTy = 0;
  let lastTz = -1;

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const cur = pts[i]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    if (i > 0) {
      accumDist += Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
    }

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    let dz = next.z - prev.z;
    // Fallback to one-sided difference if centered difference cancels on a micro-reversal
    if (Math.hypot(dx, dz) < 1e-4 && i < pts.length - 1) {
      dx = next.x - cur.x;
      dy = next.y - cur.y;
      dz = next.z - cur.z;
    }
    if (Math.hypot(dx, dz) < 1e-4 && i > 0) {
      dx = cur.x - prev.x;
      dy = cur.y - prev.y;
      dz = cur.z - prev.z;
    }

    const len3 = Math.hypot(dx, dy, dz);
    const hLen = Math.hypot(dx, dz);

    const tx = len3 > 1e-4 ? dx / len3 : lastTx;
    const ty = len3 > 1e-4 ? dy / len3 : lastTy;
    const tz = len3 > 1e-4 ? dz / len3 : lastTz;

    // Right-hand horizontal perpendicular in Three.js (+X East, +Y Up, -Z North):
    // cross(tangent, +Y) = (-tz, 0, tx) normalized in XZ
    const rx = hLen > 1e-4 ? -dz / hLen : lastRx;
    const rz = hLen > 1e-4 ? dx / hLen : lastRz;

    lastTx = tx;
    lastTy = ty;
    lastTz = tz;
    lastRx = rx;
    lastRz = rz;

    // Orthonormal up = cross(right, tangent) with right = (rx, 0, rz) -> points strictly +Y!
    const ux = -ty * rz;
    const uy = rz * tx - rx * tz;
    const uz = rx * ty;
    const uLen = Math.hypot(ux, uy, uz) || 1;

    frames.push({
      position: cur,
      tangent: { x: tx, y: ty, z: tz },
      right: { x: rx, y: 0, z: rz },
      up: { x: ux / uLen, y: uy / uLen, z: uz / uLen },
      distanceM: accumDist,
      grade: hLen > 1e-4 ? dy / hLen : 0,
      structureType,
      tier,
      depthReliability,
      heightBasis,
    });
  }

  return frames;
}

/**
 * Slices a frame sequence cleanly between [startDistM, endDistM], inserting exact interpolated
 * boundary frames so adjacent sub-spans share identical seam vertices (zero cracks/gaps!).
 */
export function sliceFramesByDistance(
  frames: readonly TrackFrame3D[],
  startDistM: number,
  endDistM: number,
  overrideStructure?: TunnelStructureType,
): TrackFrame3D[] {
  if (frames.length < 2 || endDistM <= startDistM + 0.25) return [];

  const totalLen = frames[frames.length - 1]!.distanceM;
  const sDist = Math.max(0, Math.min(totalLen, startDistM));
  const eDist = Math.max(sDist, Math.min(totalLen, endDistM));
  if (eDist - sDist < 0.25) return [];

  const sampleAt = (d: number): TrackFrame3D => {
    let idx = 0;
    while (idx < frames.length - 2 && frames[idx + 1]!.distanceM < d) idx++;
    const a = frames[idx]!;
    const b = frames[idx + 1]!;
    const span = Math.max(1e-5, b.distanceM - a.distanceM);
    const f = Math.max(0, Math.min(1, (d - a.distanceM) / span));
    const lerp = (u: number, v: number) => u + (v - u) * f;
    const tx = lerp(a.tangent.x, b.tangent.x);
    const ty = lerp(a.tangent.y, b.tangent.y);
    const tz = lerp(a.tangent.z, b.tangent.z);
    const tLen = Math.hypot(tx, ty, tz) || 1;
    const rx = lerp(a.right.x, b.right.x);
    const rz = lerp(a.right.z, b.right.z);
    const rLen = Math.hypot(rx, rz) || 1;
    const ux = lerp(a.up.x, b.up.x);
    const uy = lerp(a.up.y, b.up.y);
    const uz = lerp(a.up.z, b.up.z);
    const uLen = Math.hypot(ux, uy, uz) || 1;
    return {
      position: {
        x: lerp(a.position.x, b.position.x),
        y: lerp(a.position.y, b.position.y),
        z: lerp(a.position.z, b.position.z),
      },
      tangent: { x: tx / tLen, y: ty / tLen, z: tz / tLen },
      right: { x: rx / rLen, y: 0, z: rz / rLen },
      up: { x: ux / uLen, y: uy / uLen, z: uz / uLen },
      distanceM: d,
      grade: lerp(a.grade, b.grade),
      structureType: overrideStructure ?? a.structureType,
      tier: a.tier,
      depthReliability: a.depthReliability,
      heightBasis: a.heightBasis,
    };
  };

  const out: TrackFrame3D[] = [sampleAt(sDist)];
  for (const fr of frames) {
    if (fr.distanceM > sDist + 0.4 && fr.distanceM < eDist - 0.4) {
      out.push(overrideStructure ? { ...fr, structureType: overrideStructure } : fr);
    }
  }
  out.push(sampleAt(eDist));
  return out;
}

function computeFramesAabb(
  frames: readonly TrackFrame3D[],
  halfW: number,
  heightM: number,
): Aabb3D {
  const aabb = createEmptyAabb();
  for (const f of frames) {
    expandAabb(aabb, f.position.x, f.position.y + heightM * 0.45, f.position.z, halfW, heightM * 0.65);
  }
  return aabb;
}

/**
 * Builds the complete Underground Railway Geometry specification from SolvedRailwayNetwork3D.
 */
export function buildUndergroundNetworkSpec(
  solved: SolvedRailwayNetwork3D,
): BuiltUndergroundNetwork {
  const chunks: TunnelSegmentChunkSpec[] = [];
  const stationCaverns: StationCavernSpec[] = [];
  const portals: TunnelPortalSpec[] = [];
  const viewpoints: TunnelViewpoint[] = [];
  const pilotSegmentIds = new Set<SkId<'segment'>>();
  const pilotStationIds = new Set<SkId<'station'>>();

  // Index underground station nodes by `${lineId}::${stationId}`
  const ugStationByKey = new Map<string, SolvedStationNode3D>();
  const stationCavernLengthByKey = new Map<string, number>();
  const stationCavernLayoutByKey = new Map<string, 'station_island' | 'station_side'>();

  // Precompute averaged bisector tangents per underground station from all incident segments of the same line
  // so station caverns align smoothly with BOTH incoming and outgoing tunnel approaches!
  const stationDirAccum = new Map<string, { dx: number; dz: number }>();
  for (const seg of solved.segments) {
    if (seg.points.length < 2) continue;
    const p0 = seg.points[0]!;
    const p1 = seg.points[Math.min(2, seg.points.length - 1)]!;
    const l0 = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    const kStart = `${seg.primaryLineId}::${seg.fromStationId}`;
    const accS = stationDirAccum.get(kStart) ?? { dx: 0, dz: 0 };
    accS.dx += (p1.x - p0.x) / l0;
    accS.dz += (p1.z - p0.z) / l0;
    stationDirAccum.set(kStart, accS);

    const pn = seg.points[seg.points.length - 1]!;
    const pnPrev = seg.points[Math.max(0, seg.points.length - 3)]!;
    const lN = Math.hypot(pn.x - pnPrev.x, pn.z - pnPrev.z) || 1;
    const kEnd = `${seg.primaryLineId}::${seg.toStationId}`;
    const accE = stationDirAccum.get(kEnd) ?? { dx: 0, dz: 0 };
    accE.dx += (pn.x - pnPrev.x) / lN;
    accE.dz += (pn.z - pnPrev.z) / lN;
    stationDirAccum.set(kEnd, accE);
  }

  for (const node of solved.stationNodes) {
    const isUg =
      node.y <= TUNNEL_ELEVATION_THRESHOLD_Y ||
      node.structure === 'tunnel_box' ||
      node.structure === 'tunnel_shield';
    if (!isUg) continue;

    const key = `${node.lineId}::${node.stationId}`;
    ugStationByKey.set(key, node);
    const len = node.isMajorHub ? 84 : 62;
    stationCavernLengthByKey.set(key, len);

    const eng = getLineEngineeringSpec(node.lineId, node.structure);
    // Keep Ginza/Marunouchi shallow stations as side platforms (collinear double track),
    // deep shield major hubs as island/side caverns.
    const layout: 'station_island' | 'station_side' =
      node.nameJa === '表参道' || node.nameJa === '外苑前' || node.nameJa === '青山一丁目'
        ? 'station_side'
        : eng.defaultStationLayout;
    stationCavernLayoutByKey.set(key, layout);
  }

  // Track which stations belong to pilot corridors
  for (const seg of solved.segments) {
    if (PILOT_CORRIDOR_SEGMENT_IDS.has(seg.segmentId)) {
      pilotSegmentIds.add(seg.segmentId);
      pilotStationIds.add(seg.fromStationId);
      pilotStationIds.add(seg.toStationId);
    }
  }

  // ---- 1. Build Underground Station Caverns ----
  const stationCavernMap = new Map<string, StationCavernSpec>();
  for (const [key, node] of ugStationByKey.entries()) {
    const eng = getLineEngineeringSpec(node.lineId, node.structure);
    const layout = stationCavernLayoutByKey.get(key) ?? 'station_side';
    const lengthM = stationCavernLengthByKey.get(key) ?? 62;
    // Note: Keep station track centerline aligned seamlessly with running double tracks!
    const spec = createTunnelCrossSectionSpec(layout, eng, true);

    const acc = stationDirAccum.get(key);
    const rawDx = acc && Math.hypot(acc.dx, acc.dz) > 0.2 ? acc.dx : node.dirX;
    const rawDz = acc && Math.hypot(acc.dx, acc.dz) > 0.2 ? acc.dz : node.dirZ;
    const hLen = Math.hypot(rawDx, rawDz) || 1;
    const tx = rawDx / hLen;
    const tz = rawDz / hLen;
    const rx = -tz;
    const rz = tx;

    const halfLen = lengthM * 0.5;
    const halfW = spec.innerWidthM * 0.5 + spec.wallThicknessM;
    const aabb = createEmptyAabb();
    for (const sLen of [-halfLen, halfLen]) {
      for (const sWid of [-halfW, halfW]) {
        const wx = node.x + tx * sLen + rx * sWid;
        const wz = node.z + tz * sLen + rz * sWid;
        expandAabb(aabb, wx, node.y - 0.6, wz);
        expandAabb(aabb, wx, node.y + spec.innerHeightM + spec.wallThicknessM + 0.5, wz);
      }
    }

    const platTop = spec.platforms[0]?.topUpM ?? spec.railTopOffsetM + 1.08;
    const depthReliability: DepthReliability = 'schematic';

    const cavSpec: StationCavernSpec = {
      stationId: node.stationId,
      lineId: node.lineId,
      operatorId: node.operatorId,
      nameJa: node.nameJa,
      nameEn: node.nameEn,
      lineColor: node.color,
      tier: node.tier,
      layout,
      center: { x: node.x, y: node.y, z: node.z },
      tangent: { x: tx, y: 0, z: tz },
      right: { x: rx, y: 0, z: rz },
      lengthM,
      spec,
      platformLevelY: node.y + platTop,
      ceilingY: node.y + spec.slabTopOffsetM + spec.innerHeightM,
      bounds: aabb,
      depthReliability,
      heightBasis: node.heightBasis,
      isMajorHub: node.isMajorHub,
      isPilotCorridor: pilotStationIds.has(node.stationId),
    };
    stationCaverns.push(cavSpec);
    stationCavernMap.set(key, cavSpec);
  }

  // ---- 2. Build Per-Segment Underground Chunks, Transition Collars & Portals ----
  for (const seg of solved.segments) {
    const runs = extractUndergroundRuns(seg);
    if (runs.length === 0) continue;

    const isPilot = PILOT_CORRIDOR_SEGMENT_IDS.has(seg.segmentId);
    const eng = getLineEngineeringSpec(seg.primaryLineId, seg.dominantStructure);
    const isShield = eng.preferShieldTunnel || seg.minY <= -24;
    const runningType: TunnelStructureType = isShield
      ? seg.isDoubleTrack
        ? 'shield_double'
        : 'shield_single'
      : seg.isDoubleTrack
        ? 'box_double'
        : 'box_single';

    const runningSpec = createTunnelCrossSectionSpec(runningType, eng, seg.isDoubleTrack);
    const depthReliability: DepthReliability = 'schematic';
    const stepM = isPilot ? 6.0 : 14.0;

    // Combine all underground runs of this segment into one chunk (almost all segments have 1 continuous run)
    const segSubSpans: TunnelSubSpan[] = [];
    const segPortals: TunnelPortalSpec[] = [];
    let primaryCenterline: TrackFrame3D[] = [];
    const segBounds = createEmptyAabb();

    runs.forEach((run, runIdx) => {
      const smoothPts = resampleSmoothPoints(run.points, stepM);
      if (smoothPts.length < 2) return;

      const frames = buildFramesFromPoints(
        smoothPts,
        runningType,
        seg.dominantTier,
        seg.heightBasis,
        depthReliability,
      );
      if (frames.length < 2) return;

      const totalLen = frames[frames.length - 1]!.distanceM;
      if (totalLen < 6) return;

      if (runIdx === 0 || totalLen > (primaryCenterline[primaryCenterline.length - 1]?.distanceM ?? 0)) {
        primaryCenterline = frames;
      }

      // Check station cavern trims at start/end so running tunnels NEVER pierce station boxes!
      // Use Euclidean exclusion distance from station center so curved approaches never enter the cavern.
      const startStKey = `${seg.primaryLineId}::${seg.fromStationId}`;
      const endStKey = `${seg.primaryLineId}::${seg.toStationId}`;
      const startCav = run.touchesStartStation ? stationCavernMap.get(startStKey) : undefined;
      const endCav = run.touchesEndStation ? stationCavernMap.get(endStKey) : undefined;
      const hasStartCavern = Boolean(startCav);
      const hasEndCavern = Boolean(endCav);

      const findExitDistanceFromStation = (
        cav: StationCavernSpec,
        fromEnd: boolean,
      ): number => {
        const minClearR = cav.lengthM * 0.5 + 3.0;
        if (!fromEnd) {
          // Find the LAST frame within the first half that is still inside minClearR -> start strictly outside!
          let lastInsideIdx = -1;
          const limit = Math.floor(frames.length * 0.55);
          for (let i = 0; i < limit; i++) {
            const f = frames[i]!;
            if (Math.hypot(f.position.x - cav.center.x, f.position.z - cav.center.z) < minClearR) {
              lastInsideIdx = i;
            }
          }
          if (lastInsideIdx >= 0 && lastInsideIdx + 1 < frames.length) {
            return frames[lastInsideIdx + 1]!.distanceM;
          }
          return cav.lengthM * 0.5 + 3.0;
        }
        // Find the FIRST frame within the second half that enters minClearR -> stop strictly outside!
        const startScan = Math.floor(frames.length * 0.45);
        for (let i = startScan; i < frames.length; i++) {
          const f = frames[i]!;
          if (Math.hypot(f.position.x - cav.center.x, f.position.z - cav.center.z) < minClearR) {
            const prevIdx = Math.max(0, i - 1);
            return totalLen - frames[prevIdx]!.distanceM;
          }
        }
        return cav.lengthM * 0.5 + 3.0;
      };

      const rawStartHalf = startCav ? findExitDistanceFromStation(startCav, false) : 0;
      const rawEndHalf = endCav ? findExitDistanceFromStation(endCav, true) : 0;

      // Guarantee trims leave room for running bore even on short segments
      const maxTrim = totalLen * 0.36;
      const startTrim = Math.min(rawStartHalf, maxTrim);
      const endTrim = Math.min(rawEndHalf, maxTrim);
      const transLen = Math.min(22, Math.max(0, (totalLen - startTrim - endTrim) * 0.16));

      // Align transition collar outer end cleanly onto the exact station cavern end-face frame!
      const makeStationEndFrame = (
        cav: StationCavernSpec,
        sideSign: 1 | -1,
        distM: number,
        origFrame: TrackFrame3D,
      ): TrackFrame3D => {
        const halfL = cav.lengthM * 0.5;
        // Align tangent direction with segment travel direction
        const dotDir =
          cav.tangent.x * origFrame.tangent.x + cav.tangent.z * origFrame.tangent.z;
        const dirFlip = dotDir >= 0 ? 1 : -1;
        const tx = cav.tangent.x * dirFlip;
        const tz = cav.tangent.z * dirFlip;
        const rx = -tz;
        const rz = tx;
        return {
          ...origFrame,
          position: {
            x: cav.center.x + cav.tangent.x * halfL * sideSign,
            y: cav.center.y,
            z: cav.center.z + cav.tangent.z * halfL * sideSign,
          },
          tangent: { x: tx, y: 0, z: tz },
          right: { x: rx, y: 0, z: rz },
          up: { x: 0, y: 1, z: 0 },
          distanceM: distM,
        };
      };

      const startLayout = stationCavernLayoutByKey.get(startStKey) ?? eng.defaultStationLayout;
      const endLayout = stationCavernLayoutByKey.get(endStKey) ?? eng.defaultStationLayout;

      let boreStart = startTrim;
      let boreEnd = totalLen - endTrim;

      // Start transition collar (Station Cavern end face -> Running Bore)
      if (hasStartCavern && startCav && transLen >= 4) {
        const stSpec = createTunnelCrossSectionSpec(startLayout, eng, seg.isDoubleTrack);
        const colFrames = sliceFramesByDistance(
          frames,
          startTrim,
          startTrim + transLen,
          'transition_collar',
        );
        if (colFrames.length >= 2) {
          const dotOut =
            startCav.tangent.x * colFrames[0]!.tangent.x +
            startCav.tangent.z * colFrames[0]!.tangent.z;
          const faceSign: 1 | -1 = dotOut >= 0 ? 1 : -1;
          colFrames[0] = makeStationEndFrame(startCav, faceSign, startTrim, colFrames[0]!);
          const b = computeFramesAabb(
            colFrames,
            Math.max(stSpec.innerWidthM, runningSpec.innerWidthM) * 0.5 + 0.8,
            Math.max(stSpec.innerHeightM, runningSpec.innerHeightM) + 1.0,
          );
          segSubSpans.push({
            id: `${seg.segmentId}:r${runIdx}:trans-start`,
            segmentId: seg.segmentId,
            structureType: 'transition_collar',
            startSpec: stSpec,
            endSpec: runningSpec,
            samples: colFrames,
            startDistM: startTrim,
            endDistM: startTrim + transLen,
            bounds: b,
          });
          boreStart = startTrim + transLen;
        }
      }

      // End transition collar (Running Bore -> Station Cavern end face)
      let endCollarSpan: TunnelSubSpan | null = null;
      if (hasEndCavern && endCav && transLen >= 4) {
        const stSpec = createTunnelCrossSectionSpec(endLayout, eng, seg.isDoubleTrack);
        const colStart = totalLen - endTrim - transLen;
        const colEnd = totalLen - endTrim;
        if (colStart > boreStart + 4) {
          const colFrames = sliceFramesByDistance(frames, colStart, colEnd, 'transition_collar');
          if (colFrames.length >= 2) {
            const lastIdx = colFrames.length - 1;
            const dotIn =
              endCav.tangent.x * colFrames[lastIdx]!.tangent.x +
              endCav.tangent.z * colFrames[lastIdx]!.tangent.z;
            const faceSign: 1 | -1 = dotIn >= 0 ? -1 : 1;
            colFrames[lastIdx] = makeStationEndFrame(
              endCav,
              faceSign,
              colEnd,
              colFrames[lastIdx]!,
            );
            const b = computeFramesAabb(
              colFrames,
              Math.max(stSpec.innerWidthM, runningSpec.innerWidthM) * 0.5 + 0.8,
              Math.max(stSpec.innerHeightM, runningSpec.innerHeightM) + 1.0,
            );
            endCollarSpan = {
              id: `${seg.segmentId}:r${runIdx}:trans-end`,
              segmentId: seg.segmentId,
              structureType: 'transition_collar',
              startSpec: runningSpec,
              endSpec: stSpec,
              samples: colFrames,
              startDistM: colStart,
              endDistM: colEnd,
              bounds: b,
            };
            boreEnd = colStart;
          }
        }
      }

      // Main running bore span
      if (boreEnd > boreStart + 2) {
        const boreFrames = sliceFramesByDistance(frames, boreStart, boreEnd, runningType);
        if (boreFrames.length >= 2) {
          const b = computeFramesAabb(
            boreFrames,
            runningSpec.innerWidthM * 0.5 + runningSpec.wallThicknessM + 0.5,
            runningSpec.innerHeightM + runningSpec.wallThicknessM + 0.8,
          );
          segSubSpans.push({
            id: `${seg.segmentId}:r${runIdx}:bore`,
            segmentId: seg.segmentId,
            structureType: runningType,
            startSpec: runningSpec,
            endSpec: runningSpec,
            samples: boreFrames,
            startDistM: boreStart,
            endDistM: boreEnd,
            bounds: b,
          });
        }
      }

      if (endCollarSpan) {
        segSubSpans.push(endCollarSpan);
      }

      // Register open concrete portals where underground run meets surface/viaduct at y = -2.4
      if (run.startsAtPortal) {
        const f0 = frames[0]!;
        const pSpec: TunnelPortalSpec = {
          id: `${seg.segmentId}:r${runIdx}:portal-start`,
          segmentId: seg.segmentId,
          lineId: seg.primaryLineId,
          frame: f0,
          intoTunnelSign: 1,
          structureType: runningType,
          spec: runningSpec,
          surfaceCutout: {
            centerX: f0.position.x - f0.tangent.x * 16,
            centerZ: f0.position.z - f0.tangent.z * 16,
            dirX: f0.tangent.x,
            dirZ: f0.tangent.z,
            lengthM: 48,
            widthM: runningSpec.innerWidthM + runningSpec.wallThicknessM * 2 + 2.0,
          },
        };
        segPortals.push(pSpec);
        portals.push(pSpec);
      }
      if (run.endsAtPortal) {
        const fn = frames[frames.length - 1]!;
        const pSpec: TunnelPortalSpec = {
          id: `${seg.segmentId}:r${runIdx}:portal-end`,
          segmentId: seg.segmentId,
          lineId: seg.primaryLineId,
          frame: fn,
          intoTunnelSign: -1,
          structureType: runningType,
          spec: runningSpec,
          surfaceCutout: {
            centerX: fn.position.x + fn.tangent.x * 16,
            centerZ: fn.position.z + fn.tangent.z * 16,
            dirX: fn.tangent.x,
            dirZ: fn.tangent.z,
            lengthM: 48,
            widthM: runningSpec.innerWidthM + runningSpec.wallThicknessM * 2 + 2.0,
          },
        };
        segPortals.push(pSpec);
        portals.push(pSpec);
      }

      for (const fr of frames) {
        expandAabb(
          segBounds,
          fr.position.x,
          fr.position.y + runningSpec.innerHeightM * 0.5,
          fr.position.z,
          runningSpec.innerWidthM * 0.5 + 2.0,
          runningSpec.innerHeightM * 0.7 + 1.0,
        );
      }
    });

    if (primaryCenterline.length < 2 || segSubSpans.length === 0) continue;

    chunks.push({
      segmentId: seg.segmentId,
      primaryLineId: seg.primaryLineId,
      railLineIds: seg.railLineIds,
      operatorId: seg.operatorId,
      fromStationId: seg.fromStationId,
      toStationId: seg.toStationId,
      lineColor: seg.color,
      tier: seg.dominantTier,
      dominantStructure: seg.dominantStructure,
      engineering: eng,
      depthReliability,
      heightBasis: seg.heightBasis,
      isPilotCorridor: isPilot,
      totalLengthM: primaryCenterline[primaryCenterline.length - 1]!.distanceM,
      centerline: primaryCenterline,
      subSpans: segSubSpans,
      portals: segPortals,
      bounds: segBounds,
      connectedStationIds: [seg.fromStationId, seg.toStationId],
      deconflictedCrossings: seg.deconflictedCrossings,
    });
  }

  // ---- 3. Build Curated Camera Viewpoints for Pilot Corridors & Verification ----
  const chunkBySegId = new Map(chunks.map((c) => [c.segmentId, c]));
  const cavernByKey = new Map(stationCaverns.map((s) => [`${s.lineId}::${s.nameJa}`, s]));

  const makeInteriorViewpoint = (
    id: string,
    labelJa: string,
    labelEn: string,
    segmentId: SkId<'segment'>,
    distFrac: number,
    lateralOffsetM: number,
    eyeUpM: number,
    lookAheadM: number,
    kind: TunnelViewpoint['kind'],
  ): TunnelViewpoint | null => {
    const ch = chunkBySegId.get(segmentId);
    if (!ch || ch.centerline.length < 2) return null;
    const d0 = Math.max(8, Math.min(ch.totalLengthM - 40, ch.totalLengthM * distFrac));
    const d1 = Math.min(ch.totalLengthM - 2, d0 + lookAheadM);
    const f0 = sliceFramesByDistance(ch.centerline, d0, d0 + 1)[0];
    const f1 = sliceFramesByDistance(ch.centerline, d1, d1 + 1)[0];
    if (!f0 || !f1) return null;
    return {
      id,
      labelJa,
      labelEn,
      segmentId,
      lineId: ch.primaryLineId,
      kind,
      position: {
        x: f0.position.x + f0.right.x * lateralOffsetM,
        y: f0.position.y + eyeUpM,
        z: f0.position.z + f0.right.z * lateralOffsetM,
      },
      lookAt: {
        x: f1.position.x + f1.right.x * (lateralOffsetM * 0.65),
        y: f1.position.y + eyeUpM - 0.15,
        z: f1.position.z + f1.right.z * (lateralOffsetM * 0.65),
      },
      recommendedNearM: 0.25,
      recommendedFovDeg: 54,
      depthReliability: ch.depthReliability,
    };
  };

  // VP 1: Ginza Line Cut-and-Cover Box Tunnel Interior (Shibuya -> Omotesando, right lane cab view)
  const vpGinzaBox = makeInteriorViewpoint(
    'ginza-box-interior',
    '銀座線 矩形トンネル内部（渋谷→表参道）',
    'Ginza Box Tunnel Interior (Shibuya -> Omotesando)',
    'sk:segment:metro-ginza--tokyo-metro-shibuya--tokyo-metro-omote-sando',
    0.52,
    1.85,
    2.45,
    52,
    'tunnel_interior',
  );
  if (vpGinzaBox) viewpoints.push(vpGinzaBox);

  // VP 2: Ginza Line Portal Entry (approaching underground mouth from Shibuya viaduct)
  const ginzaShibuyaChunk = chunkBySegId.get(
    'sk:segment:metro-ginza--tokyo-metro-shibuya--tokyo-metro-omote-sando',
  );
  if (ginzaShibuyaChunk && ginzaShibuyaChunk.portals.length > 0) {
    const p = ginzaShibuyaChunk.portals[0]!;
    const s = p.intoTunnelSign;
    viewpoints.push({
      id: 'ginza-shibuya-portal',
      labelJa: '銀座線 渋谷坑口（高架→地下接続）',
      labelEn: 'Ginza Shibuya Portal (Viaduct -> Tunnel)',
      segmentId: p.segmentId,
      lineId: p.lineId,
      kind: 'portal_entry',
      position: {
        x: p.frame.position.x - p.frame.tangent.x * 36 * s + p.frame.right.x * 2.2,
        y: p.frame.position.y + 4.2,
        z: p.frame.position.z - p.frame.tangent.z * 36 * s + p.frame.right.z * 2.2,
      },
      lookAt: {
        x: p.frame.position.x + p.frame.tangent.x * 48 * s,
        y: p.frame.position.y + 1.2,
        z: p.frame.position.z + p.frame.tangent.z * 48 * s,
      },
      recommendedNearM: 0.35,
      recommendedFovDeg: 50,
      depthReliability: 'schematic',
    });
  }

  // VP 3: Omotesando Underground Station Cavern (Ginza Line widened side-platform cavern)
  const omotesandoCavern = cavernByKey.get('sk:line:metro-ginza::表参道');
  if (omotesandoCavern) {
    const t = omotesandoCavern.tangent;
    const r = omotesandoCavern.right;
    const c = omotesandoCavern.center;
    viewpoints.push({
      id: 'ginza-omotesando-station',
      labelJa: '表参道駅 地下ホーム大空間（銀座線）',
      labelEn: 'Omotesando Underground Station Cavern (Ginza)',
      segmentId: 'sk:segment:metro-ginza--tokyo-metro-omote-sando--tokyo-metro-003834',
      stationId: omotesandoCavern.stationId,
      lineId: omotesandoCavern.lineId,
      kind: 'station_platform',
      position: {
        x: c.x - t.x * 24 + r.x * 4.9,
        y: omotesandoCavern.platformLevelY + 1.85,
        z: c.z - t.z * 24 + r.z * 4.9,
      },
      lookAt: {
        x: c.x + t.x * 26 - r.x * 1.4,
        y: omotesandoCavern.platformLevelY + 0.85,
        z: c.z + t.z * 26 - r.z * 1.4,
      },
      recommendedNearM: 0.25,
      recommendedFovDeg: 58,
      depthReliability: omotesandoCavern.depthReliability,
    });
  }

  // VP 4: Fukutoshin Line Deep Circular Shield Tunnel (Shibuya -> Meiji-Jingumae, L-3 -30m)
  const vpFukutoshinShield = makeInteriorViewpoint(
    'fukutoshin-shield-interior',
    '副都心線 円形シールドトンネル内部（渋谷→明治神宮前）',
    'Fukutoshin Circular Shield Tunnel (Shibuya -> Meiji-Jingumae)',
    'sk:segment:metro-fukutoshin--tokyo-metro-shibuya--tokyo-metro-003844',
    0.45,
    1.85,
    2.55,
    56,
    'shield_bore',
  );
  if (vpFukutoshinShield) viewpoints.push(vpFukutoshinShield);

  // VP 5: Marunouchi Line Box Tunnel (Tokyo -> Otemachi)
  const vpMarunouchi = makeInteriorViewpoint(
    'marunouchi-tokyo-otemachi',
    '丸ノ内線 矩形トンネル内部（東京→大手町）',
    'Marunouchi Box Tunnel (Tokyo -> Otemachi)',
    'sk:segment:metro-marunouchi--tokyo-metro-tokyo--tokyo-metro-otemachi',
    0.48,
    -1.85,
    2.45,
    50,
    'tunnel_interior',
  );
  if (vpMarunouchi) viewpoints.push(vpMarunouchi);

  return {
    chunks,
    stationCaverns,
    portals,
    viewpoints,
    pilotSegmentIds,
    pilotStationIds,
  };
}

/**
 * Builds Camera Session collision / clearance constraint metadata for a given chunk.
 */
export function buildClearanceConstraintForChunk(
  chunk: TunnelSegmentChunkSpec,
): TunnelClearanceConstraint {
  const boreSpan =
    chunk.subSpans.find((s) => s.structureType !== 'transition_collar') ?? chunk.subSpans[0]!;
  const spec = boreSpan.startSpec;
  const halfSafeW = spec.innerWidthM * 0.5 - 0.55;
  const exclusionBoxesLocal: TunnelClearanceConstraint['exclusionBoxesLocal'] = [];

  // Record walkways, cable troughs & center columns as interior exclusion volumes
  for (const w of spec.walkways) {
    exclusionBoxesLocal.push({
      startDistM: 0,
      endDistM: chunk.totalLengthM,
      minRightM: Math.min(w.innerRightM, w.outerRightM),
      maxRightM: Math.max(w.innerRightM, w.outerRightM),
      minUpM: w.bottomUpM,
      maxUpM: w.topUpM,
      reason: 'rail_equipment',
    });
  }

  if (spec.hasCenterColumns) {
    exclusionBoxesLocal.push({
      startDistM: boreSpan.startDistM,
      endDistM: boreSpan.endDistM,
      minRightM: -0.22,
      maxRightM: 0.22,
      minUpM: spec.slabTopOffsetM,
      maxUpM: spec.slabTopOffsetM + spec.innerHeightM,
      reason: 'column',
    });
  }

  return {
    segmentId: chunk.segmentId,
    bounds: chunk.bounds,
    safeCorridorLocal: {
      minRightM: -halfSafeW,
      maxRightM: halfSafeW,
      minUpM: spec.railTopOffsetM + 0.65,
      maxUpM: spec.slabTopOffsetM + spec.innerHeightM - 0.55,
    },
    exclusionBoxesLocal,
  };
}
