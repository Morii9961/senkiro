/**
 * SENKIRO Atlas v2 — Camera Obstacle Collision Guard & Urban Orientation Helper.
 *
 * Prevents surface cameras (Street-Level / Free Look / Surface Train Follow) from
 * passing through landmark towers, station volumes, or ground floors, and optionally
 * ingests cached building OBB records from `./data/urban-chunks/` without modifying
 * sibling generator files.
 */

import type { UrbanLandmarkRecord } from '../types.js';

export interface BuildingObstacleBox {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  cosA: number;
  sinA: number;
  height: number;
}

export interface CameraOrientationInfo {
  headingDeg: number;
  cardinal: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  altitudeM: number;
  distanceToFocusM: number;
  nearestAnchor: {
    nameJa: string;
    nameEn: string;
    distanceM: number;
  } | null;
}

export class StreetCollisionGuard {
  private readonly boxes: BuildingObstacleBox[] = [];
  private readonly landmarks: UrbanLandmarkRecord[] = [];
  private urbanLoaded = false;

  setLandmarks(landmarks: readonly UrbanLandmarkRecord[]): void {
    this.landmarks.length = 0;
    this.boxes.length = 0;

    for (const lm of landmarks) {
      this.landmarks.push(lm);
      const halfW = (lm.width ?? lm.radius ?? 32) * 0.55;
      const halfD = (lm.depth ?? lm.radius ?? 32) * 0.55;
      this.boxes.push({
        cx: lm.x,
        cz: lm.z,
        halfW,
        halfD,
        cosA: 1,
        sinA: 0,
        height: lm.height,
      });
    }
  }

  addBuildingBoxes(records: { cx: number; cz: number; w: number; d: number; a: number; h: number }[]): void {
    for (const b of records) {
      if (b.h < 6) continue;
      this.boxes.push({
        cx: b.cx,
        cz: b.cz,
        halfW: b.w * 0.5,
        halfD: b.d * 0.5,
        cosA: Math.cos(b.a),
        sinA: Math.sin(b.a),
        height: b.h,
      });
    }
  }

  getLandmarks(): readonly UrbanLandmarkRecord[] {
    return this.landmarks;
  }

  /**
   * Lazily populates landmark colliders from the already browser-cached base-environment.json.
   */
  async ensureLoadedFromCache(): Promise<UrbanLandmarkRecord[]> {
    if (this.urbanLoaded) return this.landmarks;
    this.urbanLoaded = true;
    try {
      const res = await fetch('./data/urban-chunks/base-environment.json');
      if (!res.ok) return this.landmarks;
      const env = (await res.json()) as { landmarks?: UrbanLandmarkRecord[] };
      if (Array.isArray(env.landmarks)) {
        this.setLandmarks(env.landmarks);
      }
    } catch {
      // Offline / headless unit test environment: continue with zero errors
    }
    return this.landmarks;
  }

  resolveCameraPosition(
    pos: { x: number; y: number; z: number },
    radius = 4.5,
    allowUnderground = false,
    minSurfaceY = 4.5,
  ): { x: number; y: number; z: number; collided: boolean } {
    let x = pos.x;
    let y = pos.y;
    let z = pos.z;
    let collided = false;

    if (!allowUnderground && y < minSurfaceY) {
      y = minSurfaceY;
      collided = true;
    }

    if (y >= 0 && y < 380) {
      for (const box of this.boxes) {
        if (y > box.height + radius) continue;
        const maxExtent = Math.max(box.halfW, box.halfD) + radius + 4;
        const dx = x - box.cx;
        const dz = z - box.cz;
        if (Math.abs(dx) > maxExtent || Math.abs(dz) > maxExtent) continue;

        const lx = dx * box.cosA + dz * box.sinA;
        const lz = -dx * box.sinA + dz * box.cosA;

        const limX = box.halfW + radius;
        const limZ = box.halfD + radius;
        if (Math.abs(lx) < limX && Math.abs(lz) < limZ) {
          const pushX = limX - Math.abs(lx);
          const pushZ = limZ - Math.abs(lz);
          let nlx = lx;
          let nlz = lz;
          if (pushX < pushZ) {
            nlx = lx >= 0 ? limX : -limX;
          } else {
            nlz = lz >= 0 ? limZ : -limZ;
          }
          x = box.cx + nlx * box.cosA - nlz * box.sinA;
          z = box.cz + nlx * box.sinA + nlz * box.cosA;
          collided = true;
        }
      }
    }

    return { x, y, z, collided };
  }

  describeNearestAnchor(pos: {
    x: number;
    y: number;
    z: number;
  }): CameraOrientationInfo['nearestAnchor'] {
    let best: UrbanLandmarkRecord | null = null;
    let bestD = Infinity;
    for (const lm of this.landmarks) {
      const d = Math.hypot(lm.x - pos.x, lm.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = lm;
      }
    }
    if (!best) return null;
    return {
      nameJa: best.nameJa,
      nameEn: best.nameEn,
      distanceM: Math.round(bestD),
    };
  }
}
