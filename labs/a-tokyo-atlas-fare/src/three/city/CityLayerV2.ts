/**
 * Consolidated Atlas v2 City Layer Adapter (`CityLayerV2`) implementing `CityLayerAdapter`
 * (`src/three/contracts/adapters.ts`).
 *
 * Composes `CityTerrainLayer` (with its embedded `ShibuyaStreetscapeLayer`),
 * `CityChunkManager`, and an optional `SkyEnvironmentSystem` around shared
 * `CutawayUniforms` so `Metropolitan3DScene` or the v2 unified integration harness
 * can operate the entire surface & building subsystem behind a single contract.
 */

import * as THREE from 'three';
import type {
  CityLightingPreset,
  CityRenderStats,
  CityTerrainElevationSampler,
  UndergroundCutawayState,
} from '../../contracts/atlasV2.js';
import type { CityLayerAdapter } from '../contracts/adapters.js';
import { SkyEnvironmentSystem } from '../environment/skyEnvironment.js';
import { CityChunkManager } from '../generators/buildingGenerator.js';
import { CityTerrainLayer } from '../generators/cityTerrainGenerator.js';
import { createCutawayUniforms, type CutawayUniforms } from '../materials/cutawayShader.js';
import type { UrbanBaseEnvironment, UrbanLandmarkRecord, UrbanManifest } from '../types.js';
import type { ShibuyaStreetscapeLayer } from './streetscapeGenerator.js';

export interface CityLayerV2Options {
  isDark: boolean;
  clipPlanes: THREE.Plane[];
  cutawayUniforms?: CutawayUniforms;
  preset?: CityLightingPreset;
  renderer?: THREE.WebGLRenderer;
  scene?: THREE.Scene;
}

export class CityLayerV2 implements CityLayerAdapter {
  readonly group = new THREE.Group();
  readonly landmarksGroup: THREE.Group;
  readonly elevationSampler: CityTerrainElevationSampler;
  readonly cutawayUniforms: CutawayUniforms;
  readonly terrainLayer: CityTerrainLayer;
  readonly buildingManager: CityChunkManager;
  readonly streetscapeLayer: ShibuyaStreetscapeLayer;
  readonly skyEnv: SkyEnvironmentSystem | null;

  private readonly hostScene: THREE.Scene | null;
  private isDark: boolean;
  private activePreset: CityLightingPreset;

  constructor(options: CityLayerV2Options) {
    this.isDark = options.isDark;
    this.activePreset = options.preset ?? (options.isDark ? 'night' : 'day');
    this.hostScene = options.scene ?? null;
    this.cutawayUniforms = options.cutawayUniforms ?? createCutawayUniforms();

    this.terrainLayer = new CityTerrainLayer(
      this.isDark,
      options.clipPlanes,
      this.cutawayUniforms,
    );
    this.streetscapeLayer = this.terrainLayer.streetscapeLayer;
    this.elevationSampler = this.terrainLayer.elevationSampler;
    this.buildingManager = new CityChunkManager(
      this.isDark,
      options.clipPlanes,
      this.cutawayUniforms,
    );
    this.landmarksGroup = this.buildingManager.landmarksGroup;

    this.group.name = 'atlas-v2-city-layer';
    this.group.add(this.terrainLayer.group, this.buildingManager.group);

    this.skyEnv =
      options.renderer && options.scene
        ? new SkyEnvironmentSystem(options.renderer, options.scene, this.isDark, this.activePreset)
        : null;
  }

  setEnvironmentData(
    env: UrbanBaseEnvironment,
    manifest?: UrbanManifest,
    landmarks?: UrbanLandmarkRecord[],
  ): void {
    this.terrainLayer.populateFromEnvironment(env);
    if (manifest) {
      this.buildingManager.setManifest(manifest, landmarks ?? env.landmarks);
    }
  }

  setTheme(isDark: boolean, preset?: CityLightingPreset): void {
    const resolvedPreset: CityLightingPreset = preset ?? (isDark ? 'night' : 'day');
    const resolvedDark = resolvedPreset === 'night' ? true : isDark;
    this.isDark = resolvedDark;
    this.activePreset = resolvedPreset;

    this.terrainLayer.setTheme(resolvedDark);
    this.buildingManager.setTheme(resolvedDark);
    if (this.skyEnv && this.hostScene) {
      this.skyEnv.applyToScene(this.hostScene, resolvedDark, resolvedPreset);
    }
  }

  setUndergroundCutaway(state: UndergroundCutawayState): void {
    this.cutawayUniforms.uCutawayCenter.value.set(state.centerX, 0, state.centerZ);
    this.cutawayUniforms.uCutawayRadius.value = state.radiusM;
    this.cutawayUniforms.uCutawayActive.value = state.enabled ? 1.0 : 0.0;

    const effectiveGroundOpacity = state.enabled ? state.groundOpacity : 1.0;
    this.terrainLayer.setSurfaceOpacity(effectiveGroundOpacity, state.enabled);
    this.buildingManager.setVisibilityAndOpacity(
      !state.hideBuildings,
      effectiveGroundOpacity,
      state.enabled,
    );
  }

  updateForCamera(
    camera: THREE.PerspectiveCamera,
    focusTarget: THREE.Vector3,
    _dtSec: number,
  ): void {
    this.buildingManager.updateForCamera(camera, focusTarget);
    this.skyEnv?.updateForCamera(camera.position);
  }

  getStats(): CityRenderStats {
    const bStats = this.buildingManager.getStats();
    return {
      loadedChunks: bStats.loadedChunks,
      totalChunks: bStats.totalChunks,
      renderedBuildings: bStats.renderedBuildings,
      lod0Chunks: bStats.lod0Chunks,
      lod1Chunks: bStats.lod1Chunks,
      realOsmBuildings: bStats.realOsmBuildings,
      infillBuildings: bStats.infillBuildings,
      landmarkCount: bStats.landmarkCount,
      terrainDatumKind: this.elevationSampler.datumKind,
    };
  }

  dispose(): void {
    this.skyEnv?.dispose();
    this.terrainLayer.dispose();
    this.buildingManager.dispose();
  }
}

export function createCityLayerAdapter(options: CityLayerV2Options): CityLayerV2 {
  return new CityLayerV2(options);
}
