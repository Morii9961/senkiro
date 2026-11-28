/**
 * Shared Tokyo Bay Coastline & Reclaimed Artificial Island Boundaries.
 * Single source of truth consumed by both `tokyoBayWaterfront.ts` (runtime) and
 * `scripts/build-urban-chunks.mjs` (data build pipeline) via `tokyoCoastline.json`.
 */

import coastlineRaw from './tokyoCoastline.json' with { type: 'json' };
import { pointInPoly } from './cityGeometryHelpers.js';

export interface ReclaimedIslandSpec {
  id: string;
  name: string;
  kind: 'urban' | 'port' | 'airport';
  pts: readonly [number, number][];
}

export const TOKYO_BAY_OCEAN_POLYGON: readonly [number, number][] =
  coastlineRaw.oceanPolygon as [number, number][];

export const TOKYO_BAY_ISLANDS: readonly ReclaimedIslandSpec[] =
  coastlineRaw.islands as unknown as ReclaimedIslandSpec[];

/**
 * Returns true if world coordinate `(x, z)` lies over open Tokyo Bay water
 * (inside the ocean coastline polygon and NOT on any reclaimed artificial island).
 */
export function isPointInTokyoBayWater(x: number, z: number): boolean {
  if (z < 1850) return false;
  if (!pointInPoly(x, z, TOKYO_BAY_OCEAN_POLYGON as [number, number][])) return false;
  for (const isl of TOKYO_BAY_ISLANDS) {
    if (pointInPoly(x, z, isl.pts as [number, number][])) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if `(x, z)` lies on Haneda Airport landmass (protects runways from urban infill).
 */
export function isPointOnHanedaAirport(x: number, z: number): boolean {
  if (z < 12800 || z > 17000 || x < -1700 || x > 5300) return false;
  for (const isl of TOKYO_BAY_ISLANDS) {
    if (isl.kind === 'airport' && pointInPoly(x, z, isl.pts as [number, number][])) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if `(x, z)` lies on Tokyo Bay container port terminals or Breakwater port islands
 * (protects container yards & reclaimed port aprons from suburban residential infill).
 */
export function isPointOnTokyoBayPort(x: number, z: number): boolean {
  if (z < 3950 || z > 13000 || x < -2100 || x > 4600) return false;
  for (const isl of TOKYO_BAY_ISLANDS) {
    if (isl.kind !== 'port') continue;
    if (isl.id === 'odaiba-aomi' && z < 6200) continue;
    if (pointInPoly(x, z, isl.pts as [number, number][])) {
      return true;
    }
  }
  return false;
}
