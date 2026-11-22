/**
 * Shared Shibuya Showcase Zone & Per-Scene Streetscape Registry (atlas-city).
 *
 * Allows `CityTerrainLayer` and `CityChunkManager` sharing the same per-scene
 * `CutawayUniforms` instance to coordinate building-footprint clearance, LOD,
 * and visibility without modifying `Metropolitan3DScene.ts` or leaking globals.
 */

import type { CutawayUniforms } from '../materials/cutawayShader.js';
import type { ShibuyaStreetscapeLayer } from './streetscapeGenerator.js';

export type StreetscapeLodTier = 'near' | 'mid' | 'far';

export interface CityShowcaseZone {
  readonly id: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfSizeM: number;
}

/**
 * High-detail 800m x 800m showcase zone centered on Shibuya Station & Scramble Crossing,
 * plus a 50m boundary blend margin (900m total span: [-6370..-5470] x [2128..3028]).
 */
export const SHIBUYA_SHOWCASE_ZONE: CityShowcaseZone = {
  id: 'shibuya-800m',
  centerX: -5920,
  centerZ: 2578,
  halfSizeM: 450,
};

const streetscapeByCutaway = new WeakMap<CutawayUniforms, ShibuyaStreetscapeLayer>();

export function registerStreetscapeForCutaway(
  uniforms: CutawayUniforms | undefined,
  layer: ShibuyaStreetscapeLayer,
): void {
  if (!uniforms) return;
  streetscapeByCutaway.set(uniforms, layer);
}

export function getStreetscapeForCutaway(
  uniforms: CutawayUniforms | undefined,
): ShibuyaStreetscapeLayer | undefined {
  if (!uniforms) return undefined;
  return streetscapeByCutaway.get(uniforms);
}
