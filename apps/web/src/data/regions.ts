/**
 * Approximate camera presets for the two switchable regions (decision D-02).
 *
 * These are UI view extents chosen for orientation, rounded to 0.05°. They are NOT
 * station coordinates or any other railway fact, and the map says so on screen.
 */
import type { AppRegion } from '@senkiro/contracts';

export interface RegionViewPreset {
  id: AppRegion;
  bounds: { west: number; south: number; east: number; north: number };
  /** Graticule spacing in degrees. */
  minorStep: number;
  majorStep: number;
}

export const REGION_PRESETS: Readonly<Record<AppRegion, RegionViewPreset>> = {
  kansai: {
    id: 'kansai',
    bounds: { west: 135.05, south: 34.45, east: 136.0, north: 35.15 },
    minorStep: 0.05,
    majorStep: 0.25,
  },
  kanto: {
    id: 'kanto',
    bounds: { west: 139.55, south: 35.5, east: 139.95, north: 35.8 },
    minorStep: 0.01,
    majorStep: 0.05,
  },
};

export function presetCenter(preset: RegionViewPreset): { lon: number; lat: number } {
  const { west, south, east, north } = preset.bounds;
  return { lon: (west + east) / 2, lat: (south + north) / 2 };
}
