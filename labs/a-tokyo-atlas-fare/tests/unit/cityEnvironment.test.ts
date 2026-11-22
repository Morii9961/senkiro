import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACE_ELEVATION_LAYERS, TRACK_CLEARANCE_STANDARDS } from '../../src/contracts/atlasV2.js';
import {
  CityLayerV2,
  SHIBUYA_SHOWCASE_ZONE,
  ShibuyaStreetscapeLayer,
  detectSurfaceIntersections,
  getBuildingTintHex,
  getEffectiveRiverWidth,
  isSurfaceRiverVisible,
  selectFacadeVariant,
  showcaseZoneBounds,
  StreetClearanceGrid,
  TERRAIN_ELEVATION_LEVELS,
} from '../../src/three/city/index.js';
import type { UrbanBaseEnvironment, UrbanChunkData } from '../../src/three/types.js';

const CHUNKS_DIR = path.resolve(process.cwd(), 'public', 'data', 'urban-chunks');

describe('SENKIRO Atlas v2 — City Environment, PBR Facades & Shibuya Streetscape', () => {
  it('assigns diverse deterministic PBR facade variants across typologies instead of uniform windows', () => {
    const officeSet = new Set<string>();
    const commSet = new Set<string>();
    const resSet = new Set<string>();

    for (let i = 1; i <= 150; i++) {
      officeSet.add(selectFacadeVariant(1000 + i * 17, 'o', i % 2 === 0 ? 85 : 32));
      commSet.add(selectFacadeVariant(2000 + i * 19, 'c', 26));
      resSet.add(selectFacadeVariant(3000 + i * 23, 'r', i % 2 === 0 ? 22 : 9));
    }

    expect(officeSet.size).toBeGreaterThanOrEqual(4);
    expect(commSet.size).toBeGreaterThanOrEqual(5);
    expect(resSet.size).toBeGreaterThanOrEqual(3);
    expect(selectFacadeVariant(42, 's', 25)).toBe('stationCivic');

    const tints = new Set<number>();
    for (let i = 0; i < 40; i++) {
      tints.add(getBuildingTintHex(5000 + i, 'c', false));
    }
    expect(tints.size).toBeGreaterThanOrEqual(6);
  });

  it('maintains strictly monotonic terrain elevation and polygonOffset ordering to prevent Z-fighting', () => {
    for (let i = 1; i < TERRAIN_ELEVATION_LEVELS.length; i++) {
      const prev = TERRAIN_ELEVATION_LEVELS[i - 1]!;
      const cur = TERRAIN_ELEVATION_LEVELS[i]!;
      expect(cur.y).toBeGreaterThan(prev.y);
      expect(cur.poFactor).toBeLessThanOrEqual(prev.poFactor);
    }
    expect(TERRAIN_ELEVATION_LEVELS[0]!.y).toBe(SURFACE_ELEVATION_LAYERS.baseGroundY);
    const trunkSpec = TERRAIN_ELEVATION_LEVELS.find((l) => l.id === 'roadTrunk');
    const crosswalkSpec = TERRAIN_ELEVATION_LEVELS[TERRAIN_ELEVATION_LEVELS.length - 1]!;
    expect(trunkSpec?.y).toBe(SURFACE_ELEVATION_LAYERS.arterialRoadY);
    expect(crosswalkSpec.id).toBe('crosswalks');
    expect(crosswalkSpec.y).toBeLessThan(TRACK_CLEARANCE_STANDARDS.surfaceRoadbedTopM);
  });

  it('excludes underground culverted rivers (暗渠) and normalizes urban river widths', () => {
    expect(isSurfaceRiverVisible('宇田川暗渠（宇田川幹線）')).toBe(false);
    expect(isSurfaceRiverVisible('渋谷川')).toBe(true);
    expect(isSurfaceRiverVisible(null)).toBe(true);

    expect(getEffectiveRiverWidth('渋谷川', 32)).toBe(11);
    expect(getEffectiveRiverWidth('隅田川', 110)).toBe(105);
    expect(getEffectiveRiverWidth(null, 32)).toBeLessThanOrEqual(24);
  });

  it('detects Shibuya surface intersections including Scramble Crossing and enforces building/road clearance', () => {
    const env = JSON.parse(
      fs.readFileSync(path.join(CHUNKS_DIR, 'base-environment.json'), 'utf8'),
    ) as UrbanBaseEnvironment;
    const chunk31 = JSON.parse(
      fs.readFileSync(path.join(CHUNKS_DIR, 'chunk_-3_1.json'), 'utf8'),
    ) as UrbanChunkData;

    const bounds = showcaseZoneBounds(SHIBUYA_SHOWCASE_ZONE);
    const intersections = detectSurfaceIntersections(env.roads, env.intersections, bounds);
    expect(intersections.length).toBeGreaterThanOrEqual(15);
    expect(intersections.some((j) => j.isScramble)).toBe(true);

    const clearance = new StreetClearanceGrid(2.5);
    for (const r of env.roads) {
      if (r.el === 1) continue;
      clearance.markPolyline('road', r.pts, r.w * 0.48);
    }
    for (const b of chunk31.buildings) {
      clearance.markBuilding(b, 1.2);
    }

    // Center of a real OSM building in chunk_-3_1 must be blocked
    const sampleB = chunk31.buildings.find((b) => b.hb !== 'p')!;
    expect(clearance.isClear(sampleB.cx, sampleB.cz, 0.5)).toBe(false);

    // Midpoint of Shibuya Scramble Crossing road must be blocked as road
    expect(clearance.isRoadBlocked(-6017, 2414)).toBe(true);
  });

  it('populates Shibuya streetscape and switches near/mid/far LOD cleanly with hysteresis', () => {
    const env = JSON.parse(
      fs.readFileSync(path.join(CHUNKS_DIR, 'base-environment.json'), 'utf8'),
    ) as UrbanBaseEnvironment;
    const chunk31 = JSON.parse(
      fs.readFileSync(path.join(CHUNKS_DIR, 'chunk_-3_1.json'), 'utf8'),
    ) as UrbanChunkData;
    const chunk41 = JSON.parse(
      fs.readFileSync(path.join(CHUNKS_DIR, 'chunk_-4_1.json'), 'utf8'),
    ) as UrbanChunkData;

    const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000)];
    const street = new ShibuyaStreetscapeLayer(false, clip);
    street.populate(env, [...chunk31.buildings, ...chunk41.buildings]);

    const cam = new THREE.PerspectiveCamera(46, 1.6, 4, 90_000);
    const target = new THREE.Vector3(
      SHIBUYA_SHOWCASE_ZONE.centerX,
      0,
      SHIBUYA_SHOWCASE_ZONE.centerZ,
    );

    cam.position.set(target.x + 220, 180, target.z + 220);
    street.updateForCamera(cam, target);
    const nearStats = street.getStats();
    expect(nearStats.streetscapeLod).toBe('near');
    expect(nearStats.streetscapeInstances).toBeGreaterThan(150);

    // Move to 850m (inside hysteresis band 780..920 -> stays 'near')
    cam.position.set(target.x + 600, 300, target.z + 520);
    street.updateForCamera(cam, target);
    expect(street.getStats().streetscapeLod).toBe('near');

    // Move beyond exit threshold (> 920m -> switches to 'mid')
    cam.position.set(target.x + 900, 500, target.z + 650);
    street.updateForCamera(cam, target);
    expect(street.getStats().streetscapeLod).toBe('mid');

    // Move far away (> 2600m -> switches to 'far')
    cam.position.set(0, 3500, 0);
    target.set(0, 0, 0);
    street.updateForCamera(cam, target);
    expect(street.getStats().streetscapeLod).toBe('far');
    expect(street.getStats().showcaseActive).toBe(false);

    street.dispose();
  });

function withMockCanvasDocument<T>(fn: () => T): T {
  const g = globalThis as { document?: unknown };
  const prevDocument = g.document;
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const proxyCtx = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => gradient;
        }
        if (prop === 'createImageData' || prop === 'getImageData') {
          return (w = 512, h = 512) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          });
        }
        return noop;
      },
      set: () => true,
    },
  );
  g.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => proxyCtx }),
  };
  try {
    return fn();
  } finally {
    if (prevDocument === undefined) {
      delete g.document;
    } else {
      g.document = prevDocument;
    }
  }
}

  it('implements frozen CityLayerAdapter contract via CityLayerV2 across presets and cutaway states', () => {
    withMockCanvasDocument(() => {
      const env = JSON.parse(
        fs.readFileSync(path.join(CHUNKS_DIR, 'base-environment.json'), 'utf8'),
      ) as UrbanBaseEnvironment;

      const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000)];
      const layer = new CityLayerV2({
        isDark: false,
        clipPlanes: clip,
        preset: 'day',
      });

      expect(layer.elevationSampler.datumKind).toBe('flat_datum');
      expect(layer.elevationSampler.sampleGroundY(-5920, 2578)).toBe(0);

      layer.setEnvironmentData(env);

      const cam = new THREE.PerspectiveCamera(46, 1.6, 4, 90_000);
      const focus = new THREE.Vector3(
        SHIBUYA_SHOWCASE_ZONE.centerX,
        0,
        SHIBUYA_SHOWCASE_ZONE.centerZ,
      );
      cam.position.set(focus.x + 250, 210, focus.z + 240);
      layer.updateForCamera(cam, focus, 0.016);

      expect(layer.streetscapeLayer.getStats().streetscapeLod).toBe('near');

      layer.setTheme(false, 'dusk');
      layer.setTheme(true, 'night');

      layer.setUndergroundCutaway({
        enabled: true,
        centerX: SHIBUYA_SHOWCASE_ZONE.centerX,
        centerZ: SHIBUYA_SHOWCASE_ZONE.centerZ,
        radiusM: 650,
        verticalExaggeration: 1,
        groundOpacity: 0.4,
        pinCutaway: false,
        hideBuildings: true,
        clipEnabled: false,
        clipY: 0,
        tunnelCutawayStyle: 'solid_shell',
        visibleTiers: {
          'L+2': true,
          'L+1': true,
          L0: true,
          'L-1': true,
          'L-2': true,
          'L-3': true,
          'L-4': true,
        },
      });

      expect(layer.cutawayUniforms.uCutawayActive.value).toBe(1);
      expect(layer.cutawayUniforms.uCutawayRadius.value).toBe(650);
      expect(layer.cutawayUniforms.uCutawayCenter.value.z).toBe(SHIBUYA_SHOWCASE_ZONE.centerZ);
      expect(layer.landmarksGroup.visible).toBe(false);

      const stats = layer.getStats();
      expect(stats.terrainDatumKind).toBe('flat_datum');
      expect(stats.loadedChunks).toBe(0);
      expect(stats.renderedBuildings).toBe(0);
      expect(stats.landmarkCount).toBe(0);

      layer.dispose();
    });
  });
});
