/**
 * Pure TypeScript Urban Geometry, Elevation Hierarchy & Intersection Detection Helpers
 * for SENKIRO Atlas v2. (Zero DOM / WebGL dependency; directly unit-testable.)
 */

import { SURFACE_ELEVATION_LAYERS } from '../../contracts/atlasV2.js';
import type { UrbanBaseEnvironment, UrbanBuildingRecord } from '../types.js';
import { SHIBUYA_SHOWCASE_ZONE, type CityShowcaseZone } from './streetscapeRegistry.js';

export interface TerrainLayerSpec {
  readonly id: string;
  readonly y: number;
  readonly poFactor: number;
}

/**
 * Strictly ordered opaque elevation & polygonOffset hierarchy aligned with frozen
 * `SURFACE_ELEVATION_LAYERS` in `src/contracts/atlasV2.ts` (bottom -> top).
 * Prevents coplanar Z-fighting across all zoom levels while staying safely below
 * surface railway roadbeds (+0.32m).
 */
export const TERRAIN_ELEVATION_LEVELS: readonly TerrainLayerSpec[] = [
  { id: 'baseGround', y: SURFACE_ELEVATION_LAYERS.baseGroundY, poFactor: 6 },
  { id: 'tokyoBay', y: SURFACE_ELEVATION_LAYERS.tokyoBayY, poFactor: 5 },
  { id: 'landuseIndustrial', y: SURFACE_ELEVATION_LAYERS.landuseIndustrialY, poFactor: 4 },
  { id: 'landuseResidential', y: SURFACE_ELEVATION_LAYERS.landuseResidentialY, poFactor: 4 },
  { id: 'landuseCommercial', y: SURFACE_ELEVATION_LAYERS.landuseCommercialY, poFactor: 4 },
  { id: 'riverQuay', y: SURFACE_ELEVATION_LAYERS.riverQuayY, poFactor: 3.5 },
  { id: 'inlandWater', y: SURFACE_ELEVATION_LAYERS.riverWaterMinY, poFactor: 3 },
  { id: 'parks', y: SURFACE_ELEVATION_LAYERS.parkMinY, poFactor: 2 },
  { id: 'railCorridors', y: SURFACE_ELEVATION_LAYERS.railGravelCorridorY, poFactor: 1.5 },
  { id: 'sidewalksPlazas', y: SURFACE_ELEVATION_LAYERS.sidewalkPlazaY, poFactor: 1 },
  { id: 'roadTertiary', y: SURFACE_ELEVATION_LAYERS.localRoadY, poFactor: -0.5 },
  { id: 'roadSecondary', y: SURFACE_ELEVATION_LAYERS.secondaryRoadY, poFactor: -1.0 },
  { id: 'roadPrimary', y: 0.125, poFactor: -1.5 },
  { id: 'roadTrunk', y: SURFACE_ELEVATION_LAYERS.arterialRoadY, poFactor: -2.0 },
  { id: 'roadIntersectionApron', y: 0.175, poFactor: -2.5 },
  { id: 'crosswalks', y: 0.192, poFactor: -3.5 },
] as const;

export function isSurfaceRiverVisible(name: string | null | undefined): boolean {
  if (!name) return true;
  // Culverted underground rivers (暗渠) must not be painted on top of streets.
  return !name.includes('暗渠');
}

export function getEffectiveRiverWidth(name: string | null | undefined, rawWidth: number): number {
  if (name) {
    if (name.includes('渋谷川')) return 11;
    if (name.includes('目黒川')) return 18;
    if (name.includes('神田川')) return 22;
    if (name.includes('隅田川')) return 105;
    if (name.includes('荒川')) return 150;
  }
  return Math.max(8, Math.min(rawWidth || 20, 24));
}

export interface BoundingBoxXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function showcaseZoneBounds(zone: CityShowcaseZone = SHIBUYA_SHOWCASE_ZONE): BoundingBoxXZ {
  return {
    minX: zone.centerX - zone.halfSizeM,
    maxX: zone.centerX + zone.halfSizeM,
    minZ: zone.centerZ - zone.halfSizeM,
    maxZ: zone.centerZ + zone.halfSizeM,
  };
}

export interface IntersectionArm {
  angle: number; // outward direction radians from intersection center
  width: number;
  hw: string;
}

export interface DetectedIntersection {
  x: number;
  z: number;
  radius: number;
  arms: IntersectionArm[];
  isScramble: boolean;
}

interface Seg2D {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hw: string;
  w: number;
  roadIdx: number;
}

function segmentIntersection2D(
  a: Seg2D,
  b: Seg2D,
): { x: number; z: number } | null {
  const rdx = a.bx - a.ax;
  const rdz = a.bz - a.az;
  const sdx = b.bx - b.ax;
  const sdz = b.bz - b.az;
  const denom = rdx * sdz - rdz * sdx;
  if (Math.abs(denom) < 1e-4) return null;

  const qpx = b.ax - a.ax;
  const qpz = b.az - a.az;
  const t = (qpx * sdz - qpz * sdx) / denom;
  const u = (qpx * rdz - qpz * rdx) / denom;

  if (t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02) {
    return {
      x: a.ax + t * rdx,
      z: a.az + t * rdz,
    };
  }
  return null;
}

function pointToSegDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { distSq: number; t: number; cx: number; cz: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return {
    distSq: (px - cx) * (px - cx) + (pz - cz) * (pz - cz),
    t,
    cx,
    cz,
  };
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * Detects real surface road junctions inside `bounds` by combining:
 *  - Geometric segment-segment intersections & shared vertices across OSM surface roads
 *  - Explicit `base-environment.json` intersection hints
 * Returns clustered junctions with outward radiating road arm bearings & widths.
 */
export function detectSurfaceIntersections(
  roads: UrbanBaseEnvironment['roads'],
  baseIntersections: [number, number, number][],
  bounds: BoundingBoxXZ,
): DetectedIntersection[] {
  const pad = 80;
  const segs: Seg2D[] = [];

  for (let ri = 0; ri < roads.length; ri++) {
    const r = roads[ri]!;
    if (r.el === 1) continue;
    let overlaps = false;
    for (const [px, pz] of r.pts) {
      if (
        px >= bounds.minX - pad &&
        px <= bounds.maxX + pad &&
        pz >= bounds.minZ - pad &&
        pz <= bounds.maxZ + pad
      ) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const p0 = r.pts[i]!;
      const p1 = r.pts[i + 1]!;
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1.5) continue;
      segs.push({
        ax: p0[0],
        az: p0[1],
        bx: p1[0],
        bz: p1[1],
        hw: r.hw,
        w: r.w,
        roadIdx: ri,
      });
    }
  }

  const rawPoints: { x: number; z: number; hint: boolean }[] = [];
  for (const [ix, iz] of baseIntersections) {
    if (ix >= bounds.minX && ix <= bounds.maxX && iz >= bounds.minZ && iz <= bounds.maxZ) {
      rawPoints.push({ x: ix, z: iz, hint: true });
    }
  }

  // Pairwise segment crossings & vertex-to-vertex snapping inside bounds
  for (let i = 0; i < segs.length; i++) {
    const sa = segs[i]!;
    for (let j = i + 1; j < segs.length; j++) {
      const sb = segs[j]!;
      if (sa.roadIdx === sb.roadIdx) continue;
      if (
        Math.max(sa.ax, sa.bx) + 6 < Math.min(sb.ax, sb.bx) ||
        Math.min(sa.ax, sa.bx) - 6 > Math.max(sb.ax, sb.bx) ||
        Math.max(sa.az, sa.bz) + 6 < Math.min(sb.az, sb.bz) ||
        Math.min(sa.az, sa.bz) - 6 > Math.max(sb.az, sb.bz)
      ) {
        continue;
      }
      const hit = segmentIntersection2D(sa, sb);
      if (
        hit &&
        hit.x >= bounds.minX &&
        hit.x <= bounds.maxX &&
        hit.z >= bounds.minZ &&
        hit.z <= bounds.maxZ
      ) {
        rawPoints.push({ x: hit.x, z: hit.z, hint: false });
      }
    }
  }

  // Cluster nearby junction points within 16m
  const clusters: { sumX: number; sumZ: number; count: number; hint: boolean }[] = [];
  for (const pt of rawPoints) {
    let matched = false;
    for (const c of clusters) {
      const cx = c.sumX / c.count;
      const cz = c.sumZ / c.count;
      if (Math.hypot(pt.x - cx, pt.z - cz) < 16) {
        c.sumX += pt.x;
        c.sumZ += pt.z;
        c.count++;
        if (pt.hint) c.hint = true;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ sumX: pt.x, sumZ: pt.z, count: 1, hint: pt.hint });
    }
  }

  const out: DetectedIntersection[] = [];
  // Shibuya Scramble Crossing coordinates (~139.7005E, 35.6594N -> ~ -6017, 2414)
  const scrambleX = -6017;
  const scrambleZ = 2414;

  for (const c of clusters) {
    const jx = c.sumX / c.count;
    const jz = c.sumZ / c.count;
    const rawArms: IntersectionArm[] = [];
    let maxW = 7.5;

    for (const seg of segs) {
      const d = pointToSegDistSq(jx, jz, seg.ax, seg.az, seg.bx, seg.bz);
      const hitRad = Math.max(9.5, seg.w * 0.72);
      if (d.distSq > hitRad * hitRad) continue;
      maxW = Math.max(maxW, seg.w);

      // Emit outward arms along segment if endpoint extends > 10m away from junction
      const distA = Math.hypot(seg.ax - jx, seg.az - jz);
      const distB = Math.hypot(seg.bx - jx, seg.bz - jz);
      if (distA > 10) {
        rawArms.push({
          angle: Math.atan2(seg.az - jz, seg.ax - jx),
          width: seg.w,
          hw: seg.hw,
        });
      }
      if (distB > 10) {
        rawArms.push({
          angle: Math.atan2(seg.bz - jz, seg.bx - jx),
          width: seg.w,
          hw: seg.hw,
        });
      }
    }

    // Deduplicate collinear arms within 24 degrees, keeping widest road
    rawArms.sort((a, b) => b.width - a.width);
    const arms: IntersectionArm[] = [];
    for (const arm of rawArms) {
      if (!arms.some((existing) => angleDiff(existing.angle, arm.angle) < 0.42)) {
        arms.push(arm);
      }
    }

    if (arms.length >= 3 || (c.hint && arms.length >= 2)) {
      const isScramble = Math.hypot(jx - scrambleX, jz - scrambleZ) < 38;
      const radius = isScramble ? 12.5 : Math.max(4.5, Math.min(9.5, maxW * 0.52));
      out.push({
        x: Math.round(jx * 10) / 10,
        z: Math.round(jz * 10) / 10,
        radius,
        arms,
        isScramble,
      });
    }
  }

  return out;
}

/**
 * Spatial Clearance Index used to prevent streetscape furniture, streetlights,
 * signals, and trees from overlapping roadways, surface railways, rivers, or buildings.
 */
export class StreetClearanceGrid {
  private readonly cellSize: number;
  private readonly roadCells = new Set<string>();
  private readonly buildingAndRailCells = new Set<string>();

  constructor(cellSize = 3.0) {
    this.cellSize = cellSize;
  }

  private key(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  private markDisc(set: Set<string>, x: number, z: number, radiusM: number): void {
    const r = Math.ceil(radiusM / this.cellSize);
    const gx0 = Math.floor(x / this.cellSize);
    const gz0 = Math.floor(z / this.cellSize);
    const rSq = radiusM * radiusM;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const cx = (gx0 + dx + 0.5) * this.cellSize;
        const cz = (gz0 + dz + 0.5) * this.cellSize;
        if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= rSq) {
          set.add(this.key(gx0 + dx, gz0 + dz));
        }
      }
    }
  }

  markPolyline(
    target: 'road' | 'obstacle',
    pts: [number, number][],
    halfWidthM: number,
  ): void {
    const set = target === 'road' ? this.roadCells : this.buildingAndRailCells;
    const stepM = Math.max(1.5, this.cellSize * 0.75);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / stepM));
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const z = az + ((bz - az) * s) / steps;
        this.markDisc(set, x, z, halfWidthM);
      }
    }
  }

  markBuilding(b: UrbanBuildingRecord, marginM = 1.2): void {
    if (b.p && b.p.length >= 3) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      const worldPoly: [number, number][] = b.p.map(([px, pz]) => {
        const wx = b.cx + px;
        const wz = b.cz + pz;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
        return [wx, wz];
      });
      minX -= marginM;
      maxX += marginM;
      minZ -= marginM;
      maxZ += marginM;

      const gxMin = Math.floor(minX / this.cellSize);
      const gxMax = Math.floor(maxX / this.cellSize);
      const gzMin = Math.floor(minZ / this.cellSize);
      const gzMax = Math.floor(maxZ / this.cellSize);

      for (let gx = gxMin; gx <= gxMax; gx++) {
        for (let gz = gzMin; gz <= gzMax; gz++) {
          const px = (gx + 0.5) * this.cellSize;
          const pz = (gz + 0.5) * this.cellSize;
          if (pointInPoly(px, pz, worldPoly)) {
            this.buildingAndRailCells.add(this.key(gx, gz));
          }
        }
      }
      // Also stamp building perimeter edges with marginM
      this.markPolyline('obstacle', [...worldPoly, worldPoly[0]!], marginM);
      return;
    }

    // Oriented box fallback
    const hw = b.w * 0.5 + marginM;
    const hd = b.d * 0.5 + marginM;
    const span = Math.hypot(hw, hd);
    const gxMin = Math.floor((b.cx - span) / this.cellSize);
    const gxMax = Math.floor((b.cx + span) / this.cellSize);
    const gzMin = Math.floor((b.cz - span) / this.cellSize);
    const gzMax = Math.floor((b.cz + span) / this.cellSize);
    const cosA = Math.cos(-b.a);
    const sinA = Math.sin(-b.a);
    for (let gx = gxMin; gx <= gxMax; gx++) {
      for (let gz = gzMin; gz <= gzMax; gz++) {
        const dx = (gx + 0.5) * this.cellSize - b.cx;
        const dz = (gz + 0.5) * this.cellSize - b.cz;
        const u = dx * cosA - dz * sinA;
        const v = dx * sinA + dz * cosA;
        if (Math.abs(u) <= hw && Math.abs(v) <= hd) {
          this.buildingAndRailCells.add(this.key(gx, gz));
        }
      }
    }
  }

  markObstacleDisc(x: number, z: number, radiusM: number): void {
    this.markDisc(this.buildingAndRailCells, x, z, radiusM);
  }

  isRoadBlocked(x: number, z: number): boolean {
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    return this.roadCells.has(this.key(gx, gz));
  }

  isClear(x: number, z: number, extraRadiusM = 0): boolean {
    const r = Math.floor(extraRadiusM / this.cellSize);
    const gx0 = Math.floor(x / this.cellSize);
    const gz0 = Math.floor(z / this.cellSize);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const k = this.key(gx0 + dx, gz0 + dz);
        if (this.roadCells.has(k) || this.buildingAndRailCells.has(k)) {
          return false;
        }
      }
    }
    return true;
  }
}

export function pointInPoly(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0];
    const zi = poly[i]![1];
    const xj = poly[j]![0];
    const zj = poly[j]![1];
    const intersect =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
