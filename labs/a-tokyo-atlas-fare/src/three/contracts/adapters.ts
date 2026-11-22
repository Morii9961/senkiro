/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Three.js Subsystem Adapter Interfaces.
 *
 * Owned by Lead Architect & Integration Coordinator (`integration/atlas-v2`).
 * Each worktree session implements its corresponding adapter so all five
 * subsystems plug cleanly into `Metropolitan3DScene` without modifying
 * shared entrypoints or conflicting with sibling branches.
 */

import type * as THREE from 'three';
import type {
  CameraModeV2,
  CameraStateSnapshot,
  CameraTargetV2,
  CityLightingPreset,
  CityRenderStats,
  CityTerrainElevationSampler,
  PhysicalTrackGraph,
  RollingStockRenderStats,
  RollingStockSpec,
  SimulatedTrainState,
  SimulationControlState,
  SimTimeScale,
  SimTrainDensity,
  TrainFollowView,
  TrainModelId,
  TrainSimulationEngineAdapter,
  TunnelCutawayStyle,
  UndergroundCutawayState,
  UndergroundRenderStats,
} from '../../contracts/atlasV2.js';
import type { SchematicTierId } from '../../domain/elevationSolver.js';
import type { SkId } from '../../domain/types.js';
import type { CameraMoveSpeed, CameraNavMode } from '../types.js';

// ============================================================================
// 1. CITY ADAPTER (atlas-city -> branch: tokyo_environment_upgrade)
// ============================================================================

export interface CityLayerAdapter {
  readonly group: THREE.Group;
  readonly landmarksGroup: THREE.Group;
  readonly elevationSampler: CityTerrainElevationSampler;
  setTheme(isDark: boolean, preset?: CityLightingPreset): void;
  setUndergroundCutaway(state: UndergroundCutawayState): void;
  updateForCamera(
    camera: THREE.PerspectiveCamera,
    focusTarget: THREE.Vector3,
    dtSec: number,
  ): void;
  getStats(): CityRenderStats;
  dispose(): void;
}

// ============================================================================
// 2. UNDERGROUND ADAPTER (atlas-underground -> branch: underground_railway_geometry_system)
// ============================================================================

export interface UndergroundFilterParams {
  visibleOperatorIds: Set<SkId<'operator'>>;
  visibleTiers: Record<SchematicTierId, boolean>;
  selectedLineId: SkId<'line'> | null;
  selectedStationId: SkId<'station'> | null;
  fareSliceOnly: boolean;
  fareSliceLineIds: Set<SkId<'line'>>;
  undergroundActive: boolean;
  clipEnabled: boolean;
}

export interface UndergroundLayerAdapter {
  readonly group: THREE.Group;
  readonly interactiveStationMeshes: THREE.Object3D[];
  resolveStationHit(hit: THREE.Intersection): SkId<'station'> | null;
  applyFilters(params: UndergroundFilterParams): void;
  setCutawayState(state: UndergroundCutawayState): void;
  setTheme(isDark: boolean): void;
  updateLod(camDist: number, cameraPos?: THREE.Vector3): void;
  getStats(): UndergroundRenderStats;
  dispose(): void;
}

// ============================================================================
// 3. ROLLING STOCK ADAPTER (atlas-rollingstock -> branch: japanese_rolling_stock_assets)
// ============================================================================

export interface RollingStockRendererAdapter {
  /**
   * Root group added directly to THREE.Scene.
   * INVARIANT: `group.scale.y` MUST remain `1.0` at all times!
   */
  readonly group: THREE.Group;
  readonly interactiveTrainMeshes: THREE.Object3D[];
  syncTrains(
    trains: readonly SimulatedTrainState[],
    cameraPos: THREE.Vector3,
    verticalExaggeration: number,
    isDark: boolean,
  ): void;
  setSelectedTrain(trainId: string | null): void;
  resolveTrainHit(hit: THREE.Intersection): string | null;
  getTrainSpec(modelId: TrainModelId): RollingStockSpec;
  listAvailableModels(): RollingStockSpec[];
  getStats(): RollingStockRenderStats;
  dispose(): void;
}

// ============================================================================
// 4. CAMERA V2 ADAPTER (atlas-camera-ui -> branch: camera_experience_ux)
// ============================================================================

export interface CameraControllerV2Adapter {
  getMode(): CameraNavMode;
  getModeV2(): CameraModeV2;
  setMode(mode: CameraNavMode): void;
  setModeV2(mode: CameraModeV2, target?: CameraTargetV2): void;
  setSpeed(speed: CameraMoveSpeed): void;
  setUndergroundBounds(enabled: boolean, verticalExaggeration?: number): void;
  followTrain(trainId: string | null, view?: TrainFollowView): void;
  updateTrainTarget(train: SimulatedTrainState | null, dtSec: number): void;
  getSnapshot(): CameraStateSnapshot;
  returnToSurface(): void;
  dispose(): void;
}

// ============================================================================
// 5. SCENE PLUGIN INJECTION & PUBLIC FACADE FOR UI (Metropolitan3DScene)
// ============================================================================

export interface AtlasV2ScenePlugins {
  simulationEngine?: TrainSimulationEngineAdapter;
  rollingStockRenderer?: RollingStockRendererAdapter;
}

export interface AtlasV2SceneApi {
  readonly physicalTracks: PhysicalTrackGraph;
  getSimulatedTrains(): readonly SimulatedTrainState[];
  getSimulationControlState(): SimulationControlState;
  setSimulationRunning(running: boolean): void;
  setSimulationTimeScale(scale: SimTimeScale): void;
  setSimulationDensity(density: SimTrainDensity): void;
  setSimulationLineFilter(lineIds: SkId<'line'>[] | null): void;
  resetSimulation(seed?: number): void;
  selectTrain(trainId: string | null): void;
  followTrain(trainId: string | null, view?: TrainFollowView): void;
  startUndergroundTrainDemo(view?: TrainFollowView): string | null;
  setUndergroundCutawayStyle(style: TunnelCutawayStyle): void;
  getCameraStateSnapshot(): CameraStateSnapshot;
}
