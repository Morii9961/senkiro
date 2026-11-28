import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildIrregularFootprintPoly,
  sampleDistrictProfile,
} from '../../src/three/city/districtProfiles.js';
import { isPointInTokyoBayWater } from '../../src/three/city/tokyoBayWaterfront.js';
import {
  computeSolarLightingState,
  getTokyoLocalHour,
} from '../../src/three/environment/skyEnvironment.js';
import type { UrbanBaseEnvironment, UrbanManifest } from '../../src/three/types.js';

const CHUNKS_DIR = path.resolve(process.cwd(), 'public/data/urban-chunks');

describe('SENKIRO Urban Realism & Lighting Upgrade', () => {
  it('places zero procedural/OSM chunk buildings inside Tokyo Bay open water', () => {
    const manifestPath = path.join(CHUNKS_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as UrbanManifest;
    expect(manifest.totalChunks).toBeGreaterThan(80);
    expect(manifest.totalBuildings).toBeGreaterThan(40_000);

    let bayHits = 0;
    let checked = 0;
    for (const meta of manifest.chunks) {
      const chunkPath = path.join(CHUNKS_DIR, meta.file);
      const data = JSON.parse(fs.readFileSync(chunkPath, 'utf8')) as {
        buildings?: { x: number; z: number }[];
      };
      for (const b of data.buildings ?? []) {
        checked++;
        if (isPointInTokyoBayWater(b.x, b.z)) {
          bayHits++;
        }
      }
    }

    expect(checked).toBe(manifest.totalBuildings);
    expect(bayHits).toBe(0);
  });

  it('includes classified parks/forests and landuse zones in base-environment.json', () => {
    const envPath = path.join(CHUNKS_DIR, 'base-environment.json');
    const env = JSON.parse(fs.readFileSync(envPath, 'utf8')) as UrbanBaseEnvironment;
    expect(env.parkPolygons.length).toBeGreaterThan(100);
    expect((env.landuseBlocks ?? []).length).toBeGreaterThan(100);
    expect(env.parkPolygons.some((p) => p.kind === 'forest' || p.kind === 'park')).toBe(true);
  });

  it('keeps 24h solar direction continuous across dusk without an 18:15 jump and renders luminous Blue Hour', () => {
    const s1800 = computeSolarLightingState(18.0);
    const s1815 = computeSolarLightingState(18.25);
    const s1842 = computeSolarLightingState(18.42);
    const s1725 = computeSolarLightingState(17.25);
    const s2150 = computeSolarLightingState(21.5);

    // Sun direction vector stays strictly continuous (no sudden snap)
    const dirDot = s1800.sunDirection.dot(s1815.sunDirection);
    expect(dirDot).toBeGreaterThan(0.95);

    // Golden hour peaks around 17:15 with warm direct sun
    expect(s1725.goldenFactor).toBeGreaterThan(0.8);
    expect(s1725.sunLightColor.r).toBeGreaterThan(s1725.sunLightColor.b);

    // Blue Hour (18:25) is an independent luminous twilight state, never pitch black
    expect(s1842.blueHourFactor).toBeGreaterThan(0.85);
    expect(s1842.hemiIntensity).toBeGreaterThan(0.68);
    expect(s1842.skyHorizonColor.b).toBeGreaterThan(s1842.skyHorizonColor.r);

    // Readable night at 21:30 preserves non-zero sky irradiance
    expect(s2150.nightFactor).toBeGreaterThan(0.95);
    expect(s2150.hemiIntensity).toBeGreaterThan(0.45);
  });

  it('computes Tokyo JST fractional hour within [0, 24)', () => {
    const jst = getTokyoLocalHour(new Date('2026-06-01T09:30:00Z')); // 18:30 JST
    expect(jst).toBeCloseTo(18.5, 2);
    const nowJst = getTokyoLocalHour();
    expect(nowJst).toBeGreaterThanOrEqual(0);
    expect(nowJst).toBeLessThan(24);
  });

  it('produces distinct, deterministic district profiles and irregular footprints across Tokyo', () => {
    const marunouchi = sampleDistrictProfile(-180, -120, 'commercial');
    const setagaya = sampleDistrictProfile(-9200, 1200, 'residential');
    const shinagawaPort = sampleDistrictProfile(1400, 6200, 'industrial');

    expect(marunouchi.typology).toBe('cbd_highrise');
    expect(marunouchi.heightMax).toBeGreaterThan(95);
    expect(marunouchi.commercialRatio).toBeGreaterThan(0.7);

    expect(setagaya.typology).toBe('residential_lowrise');
    expect(setagaya.pitchedRoofProb).toBeGreaterThan(0.35);
    expect(setagaya.heightMax).toBeLessThan(28);

    expect(shinagawaPort.lotCoverage).toBeLessThan(marunouchi.lotCoverage);

    const polyA = buildIrregularFootprintPoly(18, 12, 0.4, 0.37);
    const polyB = buildIrregularFootprintPoly(18, 12, 0.4, 0.37);
    expect(polyA.length).toBeGreaterThanOrEqual(4);
    expect(polyA).toEqual(polyB);
  });
});
