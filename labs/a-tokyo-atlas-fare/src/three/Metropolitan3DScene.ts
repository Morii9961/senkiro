/**
 * SENKIRO Atlas v2 — Tokyo Metropolitan 3D Railway Atlas Scene Controller.
 *
 * Pure Three.js engine module (zero React dependency) unifying:
 *  - Existing procedural urban terrain, buildings/landmarks, viaducts, tracks, and concrete tunnels
 *  - Unified 5-Mode Spatial Camera State Machine & Collision-Guarded Controller
 *  - Pluggable Train Simulation Provider + Lightweight Schematic Proxy Markers
 *  - Screen-Space Hierarchical Deconflicted Label Projection
 *  - True Subterranean Tunnel Explorer with Solid Wall/Ceiling Occlusion & Local Headlamp
 */

import * as THREE from 'three';
import {
  createInitialCameraModeState,
  getCameraModeCapabilities,
  transitionCameraMode,
  type CameraModeAction,
  type CameraModeState,
} from '../domain/cameraModeStateMachine.js';
import {
  solveRailwayNetwork3D,
  type SolvedRailwayNetwork3D,
} from '../domain/elevationSolver.js';
import type { PlacedMapLabel } from '../domain/labelLayout.js';
import type {
  AtlasDataset,
  FareQuote,
  OsmVerticalDataset,
  SkId,
} from '../domain/types.js';
import { SpatialCameraController } from './cameraController.js';
import { CutawayPitVisuals } from './environment/cutawayVisuals.js';
import { SkyEnvironmentSystem } from './environment/skyEnvironment.js';
import { CityChunkManager } from './generators/buildingGenerator.js';
import { CityTerrainLayer } from './generators/cityTerrainGenerator.js';
import { RailTrackLayer, type RailwayLodTier } from './generators/railTrackGenerator.js';
import { TunnelAndStationLayer } from './generators/tunnelGenerator.js';
import { ViaductLayer } from './generators/viaductGenerator.js';
import {
  lonLatToWorld,
  TOKYO_HUB_PRESETS,
  worldToLonLat,
  type CameraHubPreset,
} from './geoProjection.js';
import { SpatialLabelRegistry } from './labelSystem.js';
import { createCutawayUniforms, type CutawayUniforms } from './materials/cutawayShader.js';
import { TrainMarkerLayer } from './trainMarkerLayer.js';
import type {
  CameraOrientationInfo,
  SceneTelemetry,
  UndergroundExplorerLocation,
  UrbanBaseEnvironment,
  UrbanManifest,
} from './types.js';
import {
  SyntheticTrainSimulationProvider,
  type EnvironmentCollisionProvider,
  type TrainSimulationProvider,
  type TrainSimulationSnapshot,
} from './uxContracts.js';

export interface SceneCallbacks {
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onSelectTrain?: (trainId: string) => void;
  onCameraModeChange?: (state: CameraModeState) => void;
  onOrientationChange?: (
    orientation: CameraOrientationInfo,
    explorerLoc: UndergroundExplorerLocation | null,
  ) => void;
  onLabelsUpdated?: (labels: PlacedMapLabel[]) => void;
  onSimulationUpdated?: (snapshot: TrainSimulationSnapshot) => void;
  onTelemetry?: (telemetry: SceneTelemetry) => void;
  onCameraMoved?: (lon: number, lat: number, zoomEquiv: number) => void;
}

export class Metropolitan3DScene {
  readonly solved: SolvedRailwayNetwork3D;

  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly camCtrl: SpatialCameraController;
  private readonly clipPlane: THREE.Plane;
  private readonly clipPlanes: THREE.Plane[];

  private readonly skyEnv: SkyEnvironmentSystem;
  private readonly cutawayUniforms: CutawayUniforms;
  private readonly cutawayVisuals: CutawayPitVisuals;
  private readonly terrainLayer: CityTerrainLayer;
  private readonly buildingManager: CityChunkManager;
  private readonly railLayer: RailTrackLayer;
  private readonly viaductLayer: ViaductLayer;
  private readonly tunnelLayer: TunnelAndStationLayer;
  private readonly trainMarkerLayer: TrainMarkerLayer;
  private readonly labelRegistry: SpatialLabelRegistry;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly subFillLight: THREE.DirectionalLight;
  private readonly explorerHeadlamp: THREE.PointLight;

  private simProvider: TrainSimulationProvider;
  private modeState: CameraModeState = createInitialCameraModeState();

  private cutawayActive = false;
  private cutawayPinned = false;
  private verticalExaggeration = 1.0;

  private readonly dataset: AtlasDataset;
  private readonly fareSliceLineIds: Set<SkId<'line'>>;
  private readonly callbacks: SceneCallbacks;
  private readonly resizeObserver: ResizeObserver;

  private visibleOperatorIds: Set<SkId<'operator'>>;
  private selectedLineId: SkId<'line'> | null = null;
  private selectedStationId: SkId<'station'> | null = null;
  private selectedTrainId: string | null = null;
  private fareSliceOnly = false;
  private locale: 'ja' | 'en' = 'ja';

  private rafId: number | null = null;
  private disposed = false;
  private isDark: boolean;
  private lastChunkUpdateTime = 0;
  private lastUiSyncTime = 0;
  private lastFrameTime = performance.now();
  private readonly sceneCreatedAt = performance.now();
  private urbanLoadedMs: number | null = null;
  private frameTimesMs: number[] = [];
  private smoothedFps = 0;
  private currentRailwayLod: RailwayLodTier = 'near';

  // Pointer click vs drag discrimination
  private pointerDownPos: { x: number; y: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  constructor(
    container: HTMLElement,
    dataset: AtlasDataset,
    osmVertical: OsmVerticalDataset | null,
    isDark: boolean,
    callbacks: SceneCallbacks,
    initialCenter?: { lon: number; lat: number; zoom?: number },
  ) {
    this.container = container;
    this.dataset = dataset;
    this.isDark = isDark;
    this.callbacks = callbacks;
    this.visibleOperatorIds = new Set(
      dataset.operators.filter((o) => o.coverageStatus !== 'none').map((o) => o.id),
    );
    this.fareSliceLineIds = new Set(
      dataset.railLines.filter((l) => l.inFareSlice).map((l) => l.id),
    );

    // 1. Solve continuous 3D vertical railway network
    this.solved = solveRailwayNetwork3D(dataset, osmVertical);
    this.simProvider = new SyntheticTrainSimulationProvider(dataset, this.solved);
    this.labelRegistry = new SpatialLabelRegistry(dataset, this.solved);

    // 2. Renderer (logarithmicDepthBuffer enables near=0.45m inside tunnels without far Z-fighting!)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || 960, container.clientHeight || 640);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'three-3d-canvas');
    container.appendChild(this.renderer.domElement);

    // 3. Scene & Atmospheric Sky Dome
    this.scene = new THREE.Scene();
    this.skyEnv = new SkyEnvironmentSystem(this.renderer, this.scene, isDark);

    // 4. Layers + GPU Radial Cutaway
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000);
    this.clipPlanes = [this.clipPlane];

    this.cutawayUniforms = createCutawayUniforms();
    this.cutawayVisuals = new CutawayPitVisuals(isDark);
    this.terrainLayer = new CityTerrainLayer(isDark, this.clipPlanes, this.cutawayUniforms);
    this.buildingManager = new CityChunkManager(isDark, this.clipPlanes, this.cutawayUniforms);
    this.railLayer = new RailTrackLayer(this.solved, this.clipPlanes);
    this.viaductLayer = new ViaductLayer(this.solved, null, this.clipPlanes);
    this.tunnelLayer = new TunnelAndStationLayer(this.solved, this.clipPlanes);
    this.trainMarkerLayer = new TrainMarkerLayer(this.clipPlanes);

    this.scene.add(
      this.terrainLayer.group,
      this.cutawayVisuals.group,
      this.buildingManager.group,
      this.viaductLayer.group,
      this.tunnelLayer.group,
      this.railLayer.group,
      this.trainMarkerLayer.group,
    );

    // 5. Read-only collision provider wrapping CityChunkManager
    const collisionProvider: EnvironmentCollisionProvider = {
      resolveCameraPosition: (pos, radius, allowUg, minY) => {
        if (allowUg && pos.y < -1) return pos;
        return this.buildingManager.resolveCameraCollision(pos, radius, minY);
      },
      describeNearestAnchor: (pos) => this.buildingManager.describeNearestLandmark(pos),
    };

    // 6. Camera & Unified 5-Mode Controller
    const aspect = (container.clientWidth || 960) / Math.max(1, container.clientHeight || 640);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 3.5, 90_000);
    this.camCtrl = new SpatialCameraController(
      this.camera,
      this.renderer.domElement,
      this.modeState,
      dataset,
      this.solved,
      collisionProvider,
      this.handleControlsEnd,
    );

    // 7. Lighting + Local Subterranean Tunnel Headlamp (active only inside Underground Explorer)
    this.hemiLight = new THREE.HemisphereLight(
      isDark ? 0x7da4cc : 0xdcebf9,
      isDark ? 0x16202e : 0xa6a096,
      isDark ? 0.58 : 0.78,
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      isDark ? 0xa3c4f0 : 0xfff3de,
      isDark ? 0.92 : 1.78,
    );
    this.sunLight.position.set(1750, 2050, 1320);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1536, 1536);
    this.sunLight.shadow.camera.near = 250;
    this.sunLight.shadow.camera.far = 7200;
    const sc = 1650;
    this.sunLight.shadow.camera.left = -sc;
    this.sunLight.shadow.camera.right = sc;
    this.sunLight.shadow.camera.top = sc;
    this.sunLight.shadow.camera.bottom = -sc;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 1.6;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.subFillLight = new THREE.DirectionalLight(
      isDark ? 0x3b82f6 : 0xbdd7f0,
      isDark ? 0.48 : 0.34,
    );
    this.subFillLight.position.set(-1200, -320, -900);
    this.scene.add(this.subFillLight);

    this.explorerHeadlamp = new THREE.PointLight(0xf8fafc, 0, 190, 1.4);
    this.scene.add(this.explorerHeadlamp);

    // 8. Initial camera positioning
    if (initialCenter) {
      this.setViewFromLonLat(initialCenter.lon, initialCenter.lat, initialCenter.zoom ?? 12.2);
    } else {
      const shibuya = TOKYO_HUB_PRESETS[0]!;
      this.jumpToHubPreset(shibuya);
    }

    // 9. Async load real OSM urban assets
    void this.loadUrbanAssets();

    // 10. Event listeners
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.syncEnvironmentWithMode();
    this.callbacks.onCameraModeChange?.(this.modeState);
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());

    this.lastFrameTime = performance.now();
    this.animate();
  }

  /** Allows sibling simulation engine worktree to plug in an external TrainSimulationProvider */
  setTrainSimulationProvider(provider: TrainSimulationProvider): void {
    this.simProvider = provider;
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());
  }

  getTrainSimulationSnapshot(): TrainSimulationSnapshot {
    return this.simProvider.getSnapshot();
  }

  getCameraModeState(): CameraModeState {
    return this.modeState;
  }

  dispatchCameraAction(action: CameraModeAction): void {
    const next = transitionCameraMode(this.modeState, action);
    if (next === this.modeState) return;
    this.modeState = next;

    if (action.type === 'FOLLOW_TRAIN') {
      this.selectedTrainId = action.trainId;
    } else if (action.type === 'RESET_OVERVIEW') {
      this.selectedTrainId = null;
      const tokyo23 = TOKYO_HUB_PRESETS.find((h) => h.id === 'tokyo23');
      if (tokyo23) {
        this.flyToHubPreset(tokyo23);
      }
    }

    const followed = this.modeState.followedTrainId
      ? this.simProvider.getTrainById(this.modeState.followedTrainId)
      : null;

    this.camCtrl.applyModeState(
      this.modeState,
      followed,
      this.selectedLineId,
      this.selectedStationId,
    );
    this.syncEnvironmentWithMode();
    this.callbacks.onCameraModeChange?.(this.modeState);
    this.emitTelemetry();
    this.emitLabelsNow();
  }

  jumpToExplorerLine(lineId: SkId<'line'>): void {
    if (this.modeState.mode !== 'underground_explorer') {
      this.dispatchCameraAction({ type: 'SELECT_MODE', mode: 'underground_explorer' });
    }
    this.camCtrl.jumpToTunnelLine(lineId);
    this.selectedLineId = lineId;
    this.syncEnvironmentWithMode();
    this.emitLabelsNow();
  }

  setSimulationPlaying(playing: boolean): void {
    this.simProvider.setPlaying(playing);
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());
  }

  setSimulationSpeed(speedMultiplier: number): void {
    this.simProvider.setSpeedMultiplier(speedMultiplier);
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());
  }

  setSimulationVisibleCount(count: number): void {
    this.simProvider.setVisibleCount(count);
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());
  }

  setSimulationTrainsVisible(visible: boolean): void {
    this.simProvider.setTrainsVisible(visible);
    if (!visible && this.modeState.mode === 'train_follow') {
      this.dispatchCameraAction({ type: 'EXIT_TRAIN_FOLLOW' });
    }
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());
    this.emitLabelsNow();
  }

  resetSimulation(): void {
    this.simProvider.reset();
    this.callbacks.onSimulationUpdated?.(this.simProvider.getSnapshot());
    this.emitLabelsNow();
  }

  setLocale(locale: 'ja' | 'en'): void {
    if (this.locale === locale) return;
    this.locale = locale;
    this.emitLabelsNow();
  }

  private async loadUrbanAssets(): Promise<void> {
    try {
      const [envRes, manifestRes] = await Promise.all([
        fetch('./data/urban-chunks/base-environment.json'),
        fetch('./data/urban-chunks/manifest.json'),
      ]);
      if (this.disposed) return;

      if (envRes.ok) {
        const env = (await envRes.json()) as UrbanBaseEnvironment;
        this.terrainLayer.populateFromEnvironment(env);
        if (manifestRes.ok) {
          const manifest = (await manifestRes.json()) as UrbanManifest;
          this.buildingManager.setManifest(manifest, env.landmarks);
          this.labelRegistry.setLandmarks(env.landmarks);
          this.buildingManager.updateForCamera(this.camera, this.camCtrl.getFocusTarget());
          this.urbanLoadedMs = Math.round(performance.now() - this.sceneCreatedAt);
          this.emitTelemetry();
          this.emitLabelsNow();
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.skyEnv.applyToScene(this.scene, isDark);
    this.hemiLight.color.setHex(isDark ? 0x7da4cc : 0xdcebf9);
    this.hemiLight.groundColor.setHex(isDark ? 0x16202e : 0xa6a096);
    this.hemiLight.intensity = isDark ? 0.58 : 0.78;
    this.sunLight.color.setHex(isDark ? 0xa3c4f0 : 0xfff3de);
    this.sunLight.intensity = isDark ? 0.92 : 1.78;
    this.subFillLight.color.setHex(isDark ? 0x3b82f6 : 0xbdd7f0);
    this.subFillLight.intensity = isDark ? 0.48 : 0.34;
    this.terrainLayer.setTheme(isDark);
    this.buildingManager.setTheme(isDark);
    this.cutawayVisuals.setTheme(isDark);
  }

  applySelectionAndFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    selectedLineId: SkId<'line'> | null;
    selectedStationId: SkId<'station'> | null;
    selectedTrainId: string | null;
    fareSliceOnly: boolean;
  }): void {
    this.visibleOperatorIds = params.visibleOperatorIds;
    this.selectedLineId = params.selectedLineId;
    this.selectedStationId = params.selectedStationId;
    this.selectedTrainId = params.selectedTrainId;
    this.fareSliceOnly = params.fareSliceOnly;
    this.syncEnvironmentWithMode();
    this.emitLabelsNow();
  }

  private syncEnvironmentWithMode(): void {
    const followed = this.modeState.followedTrainId
      ? this.simProvider.getTrainById(this.modeState.followedTrainId)
      : null;
    const caps = getCameraModeCapabilities(
      this.modeState,
      Boolean(followed?.isUnderground),
    );
    const cutaway = this.modeState.cutaway;

    const wasCutaway = this.cutawayActive;
    this.cutawayActive = caps.useRadialCutaway;
    this.cutawayPinned = cutaway.pinCutaway && this.modeState.mode === 'underground_cutaway';
    this.verticalExaggeration = caps.verticalExaggeration;

    this.cutawayUniforms.uCutawayActive.value = caps.useRadialCutaway ? 1.0 : 0.0;
    this.cutawayUniforms.uCutawayRadius.value =
      this.modeState.mode === 'train_follow'
        ? 460
        : Math.max(250, Math.min(3500, cutaway.cutawayRadius));

    if (caps.useRadialCutaway && !wasCutaway) {
      const anchor =
        this.modeState.mode === 'train_follow' && followed
          ? followed.position
          : this.camCtrl.getFocusTarget();
      this.cutawayUniforms.uCutawayCenter.value.set(anchor.x, 0, anchor.z);
    }

    // Visual-only vertical exaggeration
    this.railLayer.group.scale.y = this.verticalExaggeration;
    this.viaductLayer.group.scale.y = this.verticalExaggeration;
    this.tunnelLayer.group.scale.y = this.verticalExaggeration;

    // Illumination & ceiling occlusion for true subterranean interior view
    const tunnelInterior = caps.useExplorerSolidTunnels;
    this.explorerHeadlamp.intensity = tunnelInterior ? 2.6 : 0;
    this.subFillLight.intensity = caps.allowUndergroundGeometry
      ? tunnelInterior
        ? 1.05
        : this.isDark
          ? 0.85
          : 0.72
      : this.isDark
        ? 0.48
        : 0.34;

    const effectiveGroundOpacity = caps.useRadialCutaway
      ? cutaway.groundOpacity
      : 1.0;

    this.terrainLayer.setSurfaceOpacity(
      effectiveGroundOpacity,
      caps.useRadialCutaway,
    );
    this.terrainLayer.setUndergroundCeilingOcclusion(caps.enableSurfaceCeilingOcclusion);

    const bldgVisible =
      this.modeState.mode === 'underground_cutaway' ? !cutaway.hideBuildings : true;
    this.buildingManager.setVisibilityAndOpacity(
      bldgVisible,
      effectiveGroundOpacity,
      caps.useRadialCutaway,
    );

    this.cutawayVisuals.update(
      caps.useRadialCutaway,
      this.cutawayUniforms.uCutawayCenter.value.x,
      this.cutawayUniforms.uCutawayCenter.value.z,
      this.cutawayUniforms.uCutawayRadius.value,
      this.verticalExaggeration,
    );

    this.clipPlane.constant =
      this.modeState.mode === 'underground_cutaway' && cutaway.clipEnabled
        ? cutaway.clipY
        : 10_000;

    const clipActive =
      this.modeState.mode === 'underground_cutaway' && cutaway.clipEnabled;

    this.railLayer.applyFilters({
      visibleOperatorIds: this.visibleOperatorIds,
      visibleTiers: cutaway.visibleTiers,
      selectedLineId: this.selectedLineId,
      fareSliceOnly: this.fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
      undergroundActive: caps.allowUndergroundGeometry,
      clipEnabled: clipActive,
    });

    this.viaductLayer.applyFilters({
      visibleOperatorIds: this.visibleOperatorIds,
      visibleTiers: cutaway.visibleTiers,
      selectedLineId: this.selectedLineId,
      fareSliceOnly: this.fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
    });

    this.tunnelLayer.applyFilters({
      visibleOperatorIds: this.visibleOperatorIds,
      visibleTiers: cutaway.visibleTiers,
      selectedLineId: this.selectedLineId,
      selectedStationId: this.selectedStationId,
      fareSliceOnly: this.fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
      undergroundActive: caps.allowUndergroundGeometry,
      clipEnabled: clipActive,
      explorerInterior: tunnelInterior,
    });
  }

  setFareQuote(quote: FareQuote | null): void {
    this.railLayer.setFareQuoteHighlight(quote);
    if (quote?.actualPath && quote.actualPath.stationIds.length >= 2) {
      const stationMap = new Map(this.dataset.stations.map((s) => [s.id, s]));
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const sid of quote.actualPath.stationIds) {
        const st = stationMap.get(sid);
        if (!st) continue;
        const { x, z } = lonLatToWorld(st.coordinates[0], st.coordinates[1]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      if (Number.isFinite(minX)) {
        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        const span = Math.max(850, Math.hypot(maxX - minX, maxZ - minZ) * 0.9);
        this.camCtrl.animateTo(
          new THREE.Vector3(cx, 0, cz),
          Math.min(12_000, span),
          54,
          -22,
          750,
        );
      }
    }
  }

  flyToHubPreset(preset: CameraHubPreset): void {
    if (this.modeState.mode === 'train_follow') {
      this.dispatchCameraAction({ type: 'EXIT_TRAIN_FOLLOW' });
    }
    const { x, z } = lonLatToWorld(preset.lon, preset.lat);
    if (this.modeState.mode === 'underground_explorer') {
      this.camCtrl.jumpTo(new THREE.Vector3(x, 0, z), 500, 56, -24);
      this.camCtrl.enterUndergroundExplorer(this.selectedLineId, this.selectedStationId);
      return;
    }
    const dist =
      this.modeState.mode === 'street_level'
        ? Math.min(240, preset.distance * 0.3)
        : preset.distance;
    const polar = this.modeState.mode === 'street_level' ? 78 : preset.polarDeg;
    const ty = this.modeState.mode === 'street_level' ? 1.5 : preset.targetY;
    this.camCtrl.animateTo(new THREE.Vector3(x, ty, z), dist, polar, preset.azimuthDeg, 700);
  }

  private jumpToHubPreset(preset: CameraHubPreset): void {
    const { x, z } = lonLatToWorld(preset.lon, preset.lat);
    this.camCtrl.jumpTo(
      new THREE.Vector3(x, preset.targetY, z),
      preset.distance,
      preset.polarDeg,
      preset.azimuthDeg,
    );
  }

  flyToStation(stationId: SkId<'station'>): void {
    const node = this.solved.stationNodes.find((n) => n.stationId === stationId);
    if (!node) return;
    if (this.modeState.mode === 'train_follow') {
      this.dispatchCameraAction({ type: 'EXIT_TRAIN_FOLLOW' });
    }
    if (this.modeState.mode === 'underground_explorer') {
      this.camCtrl.enterUndergroundExplorer(node.lineId, stationId);
      return;
    }
    const dist = this.modeState.mode === 'street_level' ? 150 : 540;
    const polar = this.modeState.mode === 'street_level' ? 76 : 58;
    const ty = this.modeState.mode === 'street_level' ? Math.max(0, node.y) : node.y;
    this.camCtrl.animateTo(new THREE.Vector3(node.x, ty, node.z), dist, polar, -28, 650);
  }

  flyToLine(lineId: SkId<'line'>): void {
    const segs = this.solved.segments.filter((s) => s.primaryLineId === lineId);
    if (segs.length === 0) return;
    if (this.modeState.mode === 'train_follow') {
      this.dispatchCameraAction({ type: 'EXIT_TRAIN_FOLLOW' });
    }
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity,
      sumY = 0,
      cnt = 0;
    for (const seg of segs) {
      for (const p of seg.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
        sumY += p.y;
        cnt++;
      }
    }
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const cy = cnt > 0 ? sumY / cnt : 0;
    const span = Math.max(700, Math.min(8500, Math.hypot(maxX - minX, maxZ - minZ) * 0.85));
    this.camCtrl.animateTo(new THREE.Vector3(cx, cy, cz), span, 56, -24, 700);
  }

  setViewFromLonLat(lon: number, lat: number, mapZoom = 12): void {
    const { x, z } = lonLatToWorld(lon, lat);
    const dist = Math.max(380, Math.min(14_000, 1400 * Math.pow(2, 12.5 - mapZoom)));
    this.camCtrl.jumpTo(new THREE.Vector3(x, 0, z), dist, 55, -24);
  }

  getViewLonLatZoom(): { lon: number; lat: number; zoom: number } {
    const focus = this.camCtrl.getFocusTarget();
    const [lon, lat] = worldToLonLat(focus.x, focus.z);
    const dist = this.camCtrl.getDistanceToFocus();
    const zoom = Math.max(8.5, Math.min(16, 12.5 - Math.log2(Math.max(120, dist) / 1400)));
    return { lon, lat, zoom };
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.camCtrl.cancelAnimation();
  };

  private handleDoubleClick = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hitTargets: THREE.Object3D[] = [
      ...this.trainMarkerLayer.interactiveMeshes,
      ...this.tunnelLayer.interactiveStationMeshes,
      ...this.railLayer.interactiveMeshes,
      this.buildingManager.landmarksGroup,
      this.terrainLayer.group,
    ];
    const hits = this.raycaster
      .intersectObjects(hitTargets, true)
      .filter((h) => h.object.visible);

    if (hits.length > 0) {
      this.camCtrl.focusWorldPoint(hits[0]!.point);
      return;
    }

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(groundPlane, pt)) {
      this.camCtrl.focusWorldPoint(pt);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.pointerDownPos) return;
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    this.pointerDownPos = null;
    // Only Left Click (< 6px drag) triggers entity selection!
    if (e.button !== 0 || dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // 1. Prioritize simulated train picking
    if (this.trainMarkerLayer.group.visible) {
      const trainHits = this.raycaster
        .intersectObjects(this.trainMarkerLayer.interactiveMeshes, false)
        .filter((h) => h.object.visible);
      for (const hit of trainHits) {
        const tid = this.trainMarkerLayer.resolveTrainHit(hit);
        if (tid) {
          this.selectedTrainId = tid;
          this.callbacks.onSelectTrain?.(tid);
          return;
        }
      }
    }

    // 2. Clickable 3D stations
    const stationHits = this.raycaster
      .intersectObjects(this.tunnelLayer.interactiveStationMeshes, false)
      .filter((h) => h.object.visible);
    for (const hit of stationHits) {
      const sid = this.tunnelLayer.resolveStationHit(hit);
      if (sid) {
        this.callbacks.onSelectStation(sid);
        return;
      }
    }

    // 3. Clickable 3D rail lines
    const lineHits = this.raycaster
      .intersectObjects(this.railLayer.interactiveMeshes, false)
      .filter((h) => h.object.visible);
    if (lineHits.length > 0) {
      const lid = lineHits[0]!.object.userData?.lineId as SkId<'line'> | undefined;
      if (lid) {
        this.callbacks.onSelectLine(lid);
      }
    }
  };

  private handleControlsEnd = (): void => {
    this.emitLabelsNow();
    if (!this.callbacks.onCameraMoved) return;
    const { lon, lat, zoom } = this.getViewLonLatZoom();
    this.callbacks.onCameraMoved(lon, lat, zoom);
  };

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.emitLabelsNow();
  }

  private emitLabelsNow(): void {
    if (!this.callbacks.onLabelsUpdated) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    const simSnap = this.simProvider.getSnapshot();
    const labels = this.labelRegistry.computeVisibleLabels({
      camera: this.camera,
      mode: this.modeState.mode,
      locale: this.locale,
      viewportWidth: w,
      viewportHeight: h,
      cameraDistanceM: this.camCtrl.getDistanceToFocus(),
      verticalExaggeration: this.verticalExaggeration,
      cutawayCenterX: this.cutawayUniforms.uCutawayCenter.value.x,
      cutawayCenterZ: this.cutawayUniforms.uCutawayCenter.value.z,
      cutawayRadiusM: this.cutawayUniforms.uCutawayRadius.value,
      visibleOperatorIds: this.visibleOperatorIds,
      selectedStationId: this.selectedStationId,
      selectedLineId: this.selectedLineId,
      selectedTrainId: this.selectedTrainId,
      trains: simSnap.trains,
      trainsVisible: simSnap.trainsVisible,
    });
    this.callbacks.onLabelsUpdated(labels);
    (
      window as unknown as {
        __SENKIRO_3D_LABELS__?: { count: number; tier: string | null; ids: string[] };
      }
    ).__SENKIRO_3D_LABELS__ = {
      count: labels.length,
      tier: labels[0]?.zoomTier ?? null,
      ids: labels.map((l) => l.id),
    };
  }

  private emitCameraDebug(): void {
    const focus = this.camCtrl.getFocusTarget();
    (
      window as unknown as {
        __SENKIRO_3D_CAMERA__?: {
          mode: string;
          freeLook: boolean;
          followAngle: string;
          pos: [number, number, number];
          target: [number, number, number];
        };
      }
    ).__SENKIRO_3D_CAMERA__ = {
      mode: this.modeState.mode,
      freeLook: this.modeState.freeLookEnabled,
      followAngle: this.modeState.followAngle,
      pos: [
        Math.round(this.camera.position.x),
        Math.round(this.camera.position.y),
        Math.round(this.camera.position.z),
      ],
      target: [Math.round(focus.x), Math.round(focus.y), Math.round(focus.z)],
    };
  }

  private emitTelemetry(): void {
    const bStats = this.buildingManager.getStats();
    const portalCount = this.solved.segments.reduce((s, seg) => s + seg.portals.length, 0);
    const adjustedCount = this.solved.crossings.filter((c) => c.wasAdjusted).length;
    const telemetry: SceneTelemetry = {
      ...bStats,
      deconflictedCrossings: adjustedCount,
      tunnelPortals: portalCount,
      fps: this.smoothedFps,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      loadTimeMs: this.urbanLoadedMs,
      railwayLod: this.currentRailwayLod,
    };
    (window as unknown as { __SENKIRO_3D_METRICS__?: SceneTelemetry }).__SENKIRO_3D_METRICS__ =
      telemetry;
    this.emitCameraDebug();
    this.callbacks.onTelemetry?.(telemetry);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const rawDtMs = now - this.lastFrameTime;
    const dtSec = Math.min(0.1, rawDtMs / 1000);
    this.lastFrameTime = now;

    if (rawDtMs > 0 && rawDtMs < 2000) {
      this.frameTimesMs.push(rawDtMs);
      if (this.frameTimesMs.length > 24) this.frameTimesMs.shift();
      const avg =
        this.frameTimesMs.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimesMs.length);
      this.smoothedFps = Math.round((1000 / Math.max(1, avg)) * 10) / 10;
    }

    // 1. Step simulation provider
    this.simProvider.step(dtSec);
    const simSnap = this.simProvider.getSnapshot();
    const followedTrain =
      this.modeState.mode === 'train_follow' && this.modeState.followedTrainId
        ? this.simProvider.getTrainById(this.modeState.followedTrainId)
        : null;

    // If followed train crosses portal between surface & underground, dynamically update occlusion/cutaway!
    const caps = getCameraModeCapabilities(
      this.modeState,
      Boolean(followedTrain?.isUnderground),
    );
    if (this.modeState.mode === 'train_follow' && followedTrain) {
      const wantCutaway = caps.useRadialCutaway;
      const wantInterior = caps.useExplorerSolidTunnels;
      if (
        wantCutaway !== this.cutawayActive ||
        wantInterior !== (this.explorerHeadlamp.intensity > 0)
      ) {
        this.camCtrl.applyModeState(
          this.modeState,
          followedTrain,
          this.selectedLineId,
          this.selectedStationId,
        );
        this.syncEnvironmentWithMode();
      }
      if (wantCutaway) {
        this.cutawayUniforms.uCutawayCenter.value.set(
          followedTrain.position.x,
          0,
          followedTrain.position.z,
        );
      }
    }

    // 2. Update camera controller
    this.camCtrl.update(now, dtSec, followedTrain);

    // Move subterranean headlamp with camera inside tunnels
    if (this.explorerHeadlamp.intensity > 0) {
      this.explorerHeadlamp.position.copy(this.camera.position);
    }

    // 3. Update simulated train proxy markers
    this.trainMarkerLayer.update({
      trains: simSnap.trains,
      trainsVisible: simSnap.trainsVisible,
      allowUnderground: caps.allowUndergroundGeometry,
      verticalExaggeration: this.verticalExaggeration,
      selectedTrainId: this.selectedTrainId,
    });

    const focusTarget = this.camCtrl.getFocusTarget();
    const camDist = this.camCtrl.getDistanceToFocus();

    // 4. Adaptive near/far clipping planes (0.45m inside street/tunnel/follow prevents wall slicing!)
    const targetNear = Math.max(caps.nearPlaneMin, Math.min(60, camDist * 0.01));
    const targetFar = Math.max(28_000, camDist * 8.5);
    if (
      Math.abs(targetNear - this.camera.near) / Math.max(0.1, this.camera.near) > 0.1 ||
      Math.abs(targetFar - this.camera.far) / this.camera.far > 0.15
    ) {
      this.camera.near = targetNear;
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    // 5. Railway 3-tier LOD
    this.currentRailwayLod = this.railLayer.updateLod(camDist);
    this.viaductLayer.updateLod(camDist);
    this.tunnelLayer.updateLod(camDist);

    this.skyEnv.updateForCamera(this.camera.position);

    // 6. Track cutaway pit center smoothly unless pinned
    if (this.cutawayActive) {
      if (!this.cutawayPinned && this.modeState.mode === 'underground_cutaway') {
        this.cutawayUniforms.uCutawayCenter.value.x = THREE.MathUtils.lerp(
          this.cutawayUniforms.uCutawayCenter.value.x,
          focusTarget.x,
          0.18,
        );
        this.cutawayUniforms.uCutawayCenter.value.z = THREE.MathUtils.lerp(
          this.cutawayUniforms.uCutawayCenter.value.z,
          focusTarget.z,
          0.18,
        );
      }
      this.cutawayVisuals.update(
        true,
        this.cutawayUniforms.uCutawayCenter.value.x,
        this.cutawayUniforms.uCutawayCenter.value.z,
        this.cutawayUniforms.uCutawayRadius.value,
        this.verticalExaggeration,
      );
    }

    // 7. Sun shadow frustum centered near camera target
    this.sunLight.target.position.set(focusTarget.x, 0, focusTarget.z);
    this.sunLight.position.set(
      focusTarget.x + this.skyEnv.sunDirection.x * 3000,
      this.skyEnv.sunDirection.y * 3000,
      focusTarget.z + this.skyEnv.sunDirection.z * 3000,
    );

    // 8. Throttled UI label & simulation snapshot sync (~15Hz) + chunk streaming (~4Hz)
    if (now - this.lastUiSyncTime > 65) {
      this.lastUiSyncTime = now;
      this.emitCameraDebug();
      this.emitLabelsNow();
      this.callbacks.onSimulationUpdated?.(simSnap);
      this.callbacks.onOrientationChange?.(
        this.camCtrl.getOrientationInfo(),
        this.camCtrl.getExplorerLocation(),
      );
    }

    if (now - this.lastChunkUpdateTime > 260) {
      this.lastChunkUpdateTime = now;
      this.buildingManager.updateForCamera(this.camera, focusTarget);
      this.emitTelemetry();
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    this.camCtrl.dispose();

    this.skyEnv.dispose();
    this.cutawayVisuals.dispose();
    this.terrainLayer.dispose();
    this.buildingManager.dispose();
    this.railLayer.dispose();
    this.viaductLayer.dispose();
    this.tunnelLayer.dispose();
    this.trainMarkerLayer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
