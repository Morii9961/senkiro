/**
 * SENKIRO Lab — Tokyo Metropolitan 3D Railway Atlas Scene Controller.
 *
 * Pure Three.js engine module (zero React dependency) unifying:
 *  - Procedural Terrain, Rivers, Parks & Major Roads (CityTerrainLayer)
 *  - Chunked, Frustum-Culled, Multi-LOD Real OSM Buildings & 9 Hero Landmarks (CityChunkManager)
 *  - Continuous 3D Ballasted Tracks, Steel Rails, Sleepers & JR Fare Dual-Path Ribbons (RailTrackLayer)
 *  - Elevated Viaduct Decks, Piers & Elevated Station Platforms (ViaductLayer)
 *  - Continuous Circular/Rectangular Underground Tunnels, Portals & Complex Shafts (TunnelAndStationLayer)
 *  - Smooth OrbitControls, Underground View + Clipping Plane, Line Trace Fly-Through & 2D/3D Sync.
 */

import * as THREE from 'three';
import {
  buildPhysicalTrackGraph,
  type CameraModeV2,
  type CameraStateSnapshot,
  type CameraTargetV2,
  type PhysicalTrackGraph,
  type SimulatedTrainState,
  type SimulationControlState,
  type SimTimeScale,
  type SimTrainDensity,
  type TrainFollowView,
  type TunnelCutawayStyle,
  type TrainSimulationEngineAdapter,
  type UndergroundCutawayState,
} from '../contracts/index.js';
import {
  solveRailwayNetwork3D,
  classifyTier,
  type SolvedPoint3D,
  type SolvedRailwayNetwork3D,
  type SolvedSegment3D,
} from '../domain/elevationSolver.js';
import type {
  AtlasDataset,
  FareQuote,
  OsmVerticalDataset,
  SkId,
} from '../domain/types.js';
import { createTrainSimulationEngine } from '../simulation/index.js';
import { SpatialCameraController } from './cameraController.js';
import type {
  AtlasV2SceneApi,
  AtlasV2ScenePlugins,
  RollingStockRendererAdapter,
} from './contracts/adapters.js';
import { createRollingStockRenderer } from './rollingstock/index.js';
import { CutawayPitVisuals } from './environment/cutawayVisuals.js';
import { SkyEnvironmentSystem, type SolarLightingState } from './environment/skyEnvironment.js';
import { buildOuterMetroEnvironment, type OuterMetroHandle } from './city/outerMetroEnvironment.js';
import { CityChunkManager } from './generators/buildingGenerator.js';
import { CityTerrainLayer } from './generators/cityTerrainGenerator.js';
import { RailTrackLayer, type RailwayLodTier } from './generators/railTrackGenerator.js';
import { TunnelAndStationLayer } from './generators/tunnelGenerator.js';
import { ViaductLayer } from './generators/viaductGenerator.js';
import {
  createCityLightingUniforms,
  type CityLightingUniforms,
  type VisualMode,
} from './materials/groundShader.js';
import {
  configureHighQualitySunShadow,
  createOptimalRenderer,
  probeWebGpuCapability,
  type OptimalRendererBundle,
} from './rendererFactory.js';
import type { UndergroundRailwayQueryAPI } from './underground/domain/tunnelTypes.js';
import {
  lonLatToWorld,
  TOKYO_HUB_PRESETS,
  worldToLonLat,
  type CameraHubPreset,
} from './geoProjection.js';
import { createCutawayUniforms, type CutawayUniforms } from './materials/cutawayShader.js';
import type {
  CameraMoveSpeed,
  CameraNavMode,
  LineTraceStatus,
  SceneTelemetry,
  UndergroundViewSettings,
  UrbanBaseEnvironment,
  UrbanManifest,
} from './types.js';

export interface SceneCallbacks {
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
  onSelectTrain?: (trainId: string | null) => void;
  onClearSelection?: () => void;
  onTelemetry?: (telemetry: SceneTelemetry) => void;
  onTraceUpdate?: (status: LineTraceStatus) => void;
  onSimulationUpdate?: (
    control: SimulationControlState,
    trains: readonly SimulatedTrainState[],
  ) => void;
  onCameraStateChange?: (snapshot: CameraStateSnapshot) => void;
  onCameraMoved?: (lon: number, lat: number, zoomEquiv: number) => void;
}

export class Metropolitan3DScene implements AtlasV2SceneApi {
  readonly solved: SolvedRailwayNetwork3D;
  readonly physicalTracks: PhysicalTrackGraph;

  private readonly container: HTMLElement;
  private readonly rendererBundle: OptimalRendererBundle;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly camCtrl: SpatialCameraController;
  private readonly clipPlane: THREE.Plane;
  private readonly clipPlanes: THREE.Plane[];

  private readonly skyEnv: SkyEnvironmentSystem;
  private readonly lightingUniforms: CityLightingUniforms;
  private readonly cutawayUniforms: CutawayUniforms;
  private readonly cutawayVisuals: CutawayPitVisuals;
  private readonly terrainLayer: CityTerrainLayer;
  private readonly outerMetro: OuterMetroHandle;
  private readonly buildingManager: CityChunkManager;
  private readonly railLayer: RailTrackLayer;
  private readonly viaductLayer: ViaductLayer;
  private readonly tunnelLayer: TunnelAndStationLayer;
  private readonly traceProbe: THREE.Mesh;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly subFillLight: THREE.DirectionalLight;

  private cutawayActive = false;
  private cutawayPinned = false;
  private selectedStationUnderground = false;
  private verticalExaggeration = 1.0;
  private tunnelCutawayStyle: TunnelCutawayStyle = 'translucent_shell';
  private lastUndergroundSettings: UndergroundViewSettings | null = null;
  private enclosedUndergroundActive = false;
  private currentTimeOfDayHour: number;
  private currentNightFactor: number;
  private visualMode: VisualMode = 'cinematic';
  private lastShadowSpan = 1850;
  private webGpuAdapterName: string | null = null;

  // v2.0 Subsystem Plugin Slots (injected by Integration Coordinator as branches merge)
  private simulationEngine: TrainSimulationEngineAdapter | null = null;
  private rollingStockRenderer: RollingStockRendererAdapter | null = null;
  private latestTrains: readonly SimulatedTrainState[] = [];
  private selectedTrainId: string | null = null;
  private followTrainId: string | null = null;
  private followTrainView: TrainFollowView = 'chase';
  private lastSimEmitTime = 0;

  private readonly dataset: AtlasDataset;
  private readonly fareSliceLineIds: Set<SkId<'line'>>;
  private readonly callbacks: SceneCallbacks;
  private readonly resizeObserver: ResizeObserver;

  private rafId: number | null = null;
  private disposed = false;
  private isDark: boolean;
  private lastChunkUpdateTime = 0;

  // Line Trace Fly-Through state
  private traceLineId: SkId<'line'> | null = null;
  private tracePath: SolvedPoint3D[] = [];
  private traceStationNames: { dist: number; name: string }[] = [];
  private traceProgress = 0;
  private tracePlaying = false;
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
    plugins?: AtlasV2ScenePlugins,
  ) {
    this.container = container;
    this.dataset = dataset;
    this.isDark = isDark;
    this.currentTimeOfDayHour = isDark ? 21.0 : 13.5;
    this.currentNightFactor = isDark ? 1.0 : 0.0;
    this.callbacks = callbacks;
    this.fareSliceLineIds = new Set(
      dataset.railLines.filter((l) => l.inFareSlice).map((l) => l.id),
    );

    // 1. Solve continuous 3D vertical railway network & build unified v2.0 PhysicalTrackGraph
    this.solved = solveRailwayNetwork3D(dataset, osmVertical);
    this.physicalTracks = buildPhysicalTrackGraph(dataset, this.solved);

    // 2. High-Realism Renderer Bundle (WebGPU capability detection + HDR Bloom + 2048px shadows)
    this.rendererBundle = createOptimalRenderer(container, {
      enableBloom: true,
      maxPixelRatio: 2,
      initialNightFactor: this.currentNightFactor,
    });
    this.renderer = this.rendererBundle.renderer;
    void probeWebGpuCapability().then((rep) => {
      if (!this.disposed && rep.supported) {
        this.webGpuAdapterName = rep.adapterName;
      }
    });

    // 3. Scene, Dynamic Time-of-Day Sky Dome, PMREM Reflections & Clean Distance Fog (P3)
    this.scene = new THREE.Scene();
    this.skyEnv = new SkyEnvironmentSystem(this.renderer, this.scene, isDark);

    // 4. Camera & Unified Spatial Camera Controller (P6: Map Browse + Street/Underground/Follow)
    const aspect = (container.clientWidth || 960) / Math.max(1, container.clientHeight || 640);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 4, 90_000);
    this.camCtrl = new SpatialCameraController(
      this.camera,
      this.renderer.domElement,
      this.handleControlsEnd,
    );

    // 5. Dynamic Architectural Sunlight + Crisp 2048px Soft Shadows + Bounce Fill
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
    configureHighQualitySunShadow(this.sunLight, 1850);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle cool sky fill opposite the sun + subterranean tunnel readability fill
    this.subFillLight = new THREE.DirectionalLight(isDark ? 0x3b82f6 : 0xbdd7f0, isDark ? 0.48 : 0.34);
    this.subFillLight.position.set(-1200, -320, -900);
    this.scene.add(this.subFillLight);

    // 6. Horizontal Clipping Plane (disabled by default via large constant)
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000);
    this.clipPlanes = [this.clipPlane];

    // 7. Instantiate Procedural Layers + Global Ghost-Surface Underground Alignment Guides (Scheme A)
    this.lightingUniforms = createCityLightingUniforms();
    this.cutawayUniforms = createCutawayUniforms();
    this.cutawayVisuals = new CutawayPitVisuals(isDark, this.solved.stationNodes);
    this.terrainLayer = new CityTerrainLayer(
      isDark,
      this.clipPlanes,
      this.cutawayUniforms,
      this.lightingUniforms,
    );
    this.outerMetro = buildOuterMetroEnvironment(this.clipPlanes, this.lightingUniforms);
    this.buildingManager = new CityChunkManager(
      isDark,
      this.clipPlanes,
      this.cutawayUniforms,
      undefined,
      this.lightingUniforms,
    );
    this.railLayer = new RailTrackLayer(this.solved, this.clipPlanes);
    this.viaductLayer = new ViaductLayer(this.solved, null, this.clipPlanes);
    this.tunnelLayer = new TunnelAndStationLayer(this.solved, this.clipPlanes);

    this.scene.add(
      this.terrainLayer.group,
      this.outerMetro.group,
      this.cutawayVisuals.group,
      this.buildingManager.group,
      this.viaductLayer.group,
      this.tunnelLayer.group,
      this.railLayer.group,
    );
    this.applySolarState(this.skyEnv.applyTimeOfDay(this.scene, this.currentTimeOfDayHour));

    // 7b. v2.0 Simulation Engine & Rolling Stock Renderer plugins (Wave 1 + Wave 2 defaults)
    this.attachSimulationEngine(plugins?.simulationEngine ?? createTrainSimulationEngine());
    this.attachRollingStockRenderer(
      plugins?.rollingStockRenderer ?? createRollingStockRenderer(),
    );

    // Glowing trace probe for Line Trace fly-through
    this.traceProbe = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.0,
      }),
    );
    this.traceProbe.visible = false;
    this.scene.add(this.traceProbe);

    // 8. Initial camera positioning (preserve 2D center if passed, else showcase Shibuya/Central Tokyo!)
    if (initialCenter) {
      this.setViewFromLonLat(initialCenter.lon, initialCenter.lat, initialCenter.zoom ?? 12.2);
    } else {
      const shibuya = TOKYO_HUB_PRESETS[0]!;
      this.jumpToHubPreset(shibuya);
    }

    // 9. Async load real OSM base environment & chunk manifest (non-blocking — railway network renders frame 1!)
    void this.loadUrbanAssets();

    // 10. Event listeners
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Start render loop
    this.lastFrameTime = performance.now();
    this.animate();
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
        this.buildingManager.setEnvironmentForInfill(env);
        if (manifestRes.ok) {
          const manifest = (await manifestRes.json()) as UrbanManifest;
          this.buildingManager.setManifest(manifest, env.landmarks);
          this.buildingManager.updateForCamera(this.camera, this.camCtrl.getFocusTarget());
          this.urbanLoadedMs = Math.round(performance.now() - this.sceneCreatedAt);
          this.emitTelemetry();
        }
      }
    } catch {
      // Graceful fallback: 3D railway & terrain continue running cleanly even if urban chunks fail
    }
  }

  setCameraMode(mode: CameraNavMode): void {
    this.tracePlaying = false;
    this.camCtrl.setMode(mode);
    this.emitTelemetry();
  }

  setCameraSpeed(speed: CameraMoveSpeed): void {
    this.camCtrl.setSpeed(speed);
  }

  setCameraModeV2(mode: CameraModeV2, target?: CameraTargetV2): void {
    this.tracePlaying = false;
    this.camCtrl.setModeV2(mode, target);
    this.callbacks.onCameraStateChange?.(this.getCameraStateSnapshot());
    this.emitTelemetry();
  }

  // ---- v2.0 Subsystem Plugin Attachment & Public AtlasV2SceneApi ----

  attachSimulationEngine(engine: TrainSimulationEngineAdapter): void {
    this.simulationEngine = engine;
    engine.initialize(this.physicalTracks, this.dataset, { autoStart: true });
    this.latestTrains = engine.getTrains();
  }

  attachRollingStockRenderer(renderer: RollingStockRendererAdapter): void {
    if (this.rollingStockRenderer) {
      this.scene.remove(this.rollingStockRenderer.group);
    }
    this.rollingStockRenderer = renderer;
    // INVARIANT: rolling stock group NEVER inherits verticalExaggeration scale.y!
    renderer.group.scale.set(1, 1, 1);
    this.scene.add(renderer.group);
    if (this.latestTrains.length > 0) {
      renderer.syncTrains(
        this.latestTrains,
        this.camera.position,
        this.verticalExaggeration,
        this.isDark,
      );
    }
  }

  getSimulatedTrains(): readonly SimulatedTrainState[] {
    return this.latestTrains;
  }

  getSimulationControlState(): SimulationControlState {
    if (this.simulationEngine) {
      return this.simulationEngine.getControlState();
    }
    return {
      running: false,
      timeScale: 1,
      simClockSec: 0,
      density: 'normal',
      activeLineFilter: null,
      totalActiveTrains: 0,
      undergroundTrainCount: 0,
      isVirtualSimulation: true,
      dataNature: 'synthetic',
    };
  }

  setSimulationRunning(running: boolean): void {
    this.simulationEngine?.setRunning(running);
    this.emitSimulationState();
  }

  setSimulationTimeScale(scale: SimTimeScale): void {
    this.simulationEngine?.setTimeScale(scale);
    this.emitSimulationState();
  }

  setSimulationDensity(density: SimTrainDensity): void {
    this.simulationEngine?.setDensity(density);
    if (this.simulationEngine) {
      this.latestTrains = this.simulationEngine.getTrains();
    }
    this.emitSimulationState();
  }

  setSimulationLineFilter(lineIds: SkId<'line'>[] | null): void {
    this.simulationEngine?.setLineFilter(lineIds);
    if (this.simulationEngine) {
      this.latestTrains = this.simulationEngine.getTrains();
    }
    this.emitSimulationState();
  }

  resetSimulation(seed?: number): void {
    this.simulationEngine?.reset(seed);
    if (this.simulationEngine) {
      this.latestTrains = this.simulationEngine.getTrains();
    }
    this.emitSimulationState();
  }

  selectTrain(trainId: string | null): void {
    this.selectedTrainId = trainId;
    this.rollingStockRenderer?.setSelectedTrain(trainId);
    this.callbacks.onSelectTrain?.(trainId);
  }

  getSelectedTrainId(): string | null {
    return this.selectedTrainId;
  }

  followTrain(trainId: string | null, view: TrainFollowView = 'chase'): void {
    this.followTrainId = trainId;
    this.followTrainView = view;
    if (trainId) {
      this.tracePlaying = false;
      this.camCtrl.cancelAnimation();
      this.selectTrain(trainId);
      if (view === 'cab') {
        this.setUndergroundCutawayStyle('interior_view');
      }
    }
    this.callbacks.onCameraStateChange?.(this.getCameraStateSnapshot());
  }

  startUndergroundTrainDemo(view: TrainFollowView = 'chase'): string | null {
    const demoId = this.simulationEngine?.getDemoUndergroundTrainId() ?? null;
    if (!demoId) return null;
    this.simulationEngine?.setRunning(true);
    this.camCtrl.followTrain(demoId, view);
    this.followTrain(demoId, view);
    return demoId;
  }

  setUndergroundCutawayStyle(style: TunnelCutawayStyle): void {
    this.tunnelCutawayStyle = style;
    this.tunnelLayer.setCutawayState(this.buildUndergroundCutawayState());
    this.emitTelemetry();
  }

  getUndergroundAPI(): UndergroundRailwayQueryAPI {
    return this.tunnelLayer.getUndergroundAPI();
  }

  private buildUndergroundCutawayState(override?: UndergroundViewSettings): UndergroundCutawayState {
    const ug = override ?? this.lastUndergroundSettings;
    return {
      enabled: ug?.enabled ?? this.cutawayActive,
      centerX: this.cutawayUniforms.uCutawayCenter.value.x,
      centerZ: this.cutawayUniforms.uCutawayCenter.value.z,
      radiusM: this.cutawayUniforms.uCutawayRadius.value,
      verticalExaggeration: this.verticalExaggeration,
      groundOpacity: ug?.groundOpacity ?? (this.cutawayActive ? 0.94 : 1.0),
      pinCutaway: ug?.pinCutaway ?? this.cutawayPinned,
      hideBuildings: ug?.hideBuildings ?? false,
      clipEnabled: ug?.clipEnabled ?? false,
      clipY: ug?.clipY ?? 20,
      tunnelCutawayStyle: ug?.tunnelCutawayStyle ?? this.tunnelCutawayStyle,
      visibleTiers: ug?.visibleTiers ?? {
        'L+2': true,
        'L+1': true,
        L0: true,
        'L-1': true,
        'L-2': true,
        'L-3': true,
        'L-4': true,
      },
    };
  }

  getCameraStateSnapshot(): CameraStateSnapshot {
    return this.camCtrl.getSnapshot();
  }

  private emitSimulationState(): void {
    if (!this.callbacks.onSimulationUpdate) return;
    this.callbacks.onSimulationUpdate(this.getSimulationControlState(), this.latestTrains);
  }

  setTimeOfDay(hour: number): void {
    const normalizedHour = ((hour % 24) + 24) % 24;
    this.currentTimeOfDayHour = normalizedHour;
    const solar = this.skyEnv.applyTimeOfDay(this.scene, normalizedHour);
    this.applySolarState(solar);
  }

  setVisualMode(mode: VisualMode): void {
    if (this.visualMode === mode) return;
    this.visualMode = mode;
    this.lightingUniforms.uVisualMode.value = mode === 'cinematic' ? 1.0 : 0.0;
    const solar = this.skyEnv.applyTimeOfDay(this.scene, this.currentTimeOfDayHour);
    this.applySolarState(solar);
  }

  getVisualMode(): VisualMode {
    return this.visualMode;
  }

  private applySolarState(solar: SolarLightingState): void {
    this.currentNightFactor = solar.nightFactor;
    const isAtlas = this.visualMode === 'atlas';

    this.hemiLight.color.copy(solar.hemiSkyColor);
    this.hemiLight.groundColor.copy(solar.hemiGroundColor);
    this.hemiLight.intensity = solar.hemiIntensity * (isAtlas ? 1.08 : 1.0);

    this.sunLight.color.copy(solar.sunLightColor);
    this.sunLight.intensity = solar.sunLightIntensity * (isAtlas ? 0.94 : 1.0);

    this.subFillLight.color.copy(solar.subFillColor);
    const cutawayBoost = this.cutawayActive || this.selectedStationUnderground ? 0.35 : 0.0;
    this.subFillLight.intensity = solar.subFillIntensity + cutawayBoost;

    // Position opposite-side cool bounce fill perpendicular/opposite to active light direction
    this.subFillLight.position.set(
      -solar.activeLightDirection.x * 1400,
      -260,
      -solar.activeLightDirection.z * 1400,
    );

    this.renderer.toneMappingExposure = solar.toneMappingExposure * (isAtlas ? 1.02 : 1.0);
    this.rendererBundle.setNightFactor(solar.nightFactor);
    this.rendererBundle.setBloomTuning(
      solar.bloomStrength * (isAtlas ? 0.42 : 1.0),
      isAtlas ? Math.min(0.98, solar.bloomThreshold + 0.08) : solar.bloomThreshold,
    );

    // Sync unified shader uniforms continuously without destructive texture/LOD0 rebuilds!
    this.lightingUniforms.uTimeHour.value = solar.hour;
    this.lightingUniforms.uSunDir.value.copy(solar.sunDirection);
    this.lightingUniforms.uSunColor.value.copy(solar.sunLightColor);
    this.lightingUniforms.uSkyTopColor.value.copy(solar.skyTopColor);
    this.lightingUniforms.uSkyHorizonColor.value.copy(solar.skyHorizonColor);
    this.lightingUniforms.uNightFactor.value = solar.nightFactor;
    this.lightingUniforms.uGoldenFactor.value = solar.goldenFactor;
    this.lightingUniforms.uBlueHourFactor.value = solar.blueHourFactor;
    this.lightingUniforms.uVisualMode.value = isAtlas ? 0.0 : 1.0;
    this.lightingUniforms.uAerialColor.value.copy(solar.aerialScatterColor);

    this.scene.environmentIntensity = solar.envIntensity * (isAtlas ? 0.72 : 1.0);
    this.isDark = solar.isDark;

    this.buildingManager.setNightFactor(solar.nightFactor);
    this.terrainLayer.setTimeOfDay(solar.hour, solar.nightFactor);
    this.outerMetro.setTimeOfDay(solar.nightFactor, solar.goldenFactor, solar.blueHourFactor);
    this.tunnelLayer.setNightFactor(solar.nightFactor);
    this.cutawayVisuals.setTheme(solar.isDark);

    if (this.enclosedUndergroundActive) {
      this.scene.background = new THREE.Color(0x0a0f18);
      this.scene.fog = new THREE.Fog(0x0a0f18, 85, 390);
    }
  }

  getTimeOfDay(): number {
    return this.currentTimeOfDayHour;
  }

  getWebGpuAdapterName(): string | null {
    return this.webGpuAdapterName;
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.setTimeOfDay(isDark ? 21.5 : 13.5);
  }

  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    selectedLineId: SkId<'line'> | null;
    selectedStationId: SkId<'station'> | null;
    fareSliceOnly: boolean;
    underground: UndergroundViewSettings;
  }): void {
    const { visibleOperatorIds, selectedLineId, selectedStationId, fareSliceOnly, underground } =
      params;

    // P5 True 3D Cutaway / Underground Explorer state!
    const wasActive = this.cutawayActive;
    this.lastUndergroundSettings = underground;
    if (underground.tunnelCutawayStyle) {
      this.tunnelCutawayStyle = underground.tunnelCutawayStyle;
    }
    this.cutawayActive = underground.enabled;
    this.cutawayPinned = underground.pinCutaway;
    this.verticalExaggeration = underground.enabled
      ? Math.max(1.0, Math.min(2.5, underground.verticalExaggeration))
      : 1.0;

    this.cutawayUniforms.uCutawayActive.value = underground.enabled ? 1.0 : 0.0;
    this.cutawayUniforms.uCutawayRadius.value = Math.max(
      250,
      Math.min(3500, underground.cutawayRadius),
    );
    if (underground.enabled && !wasActive) {
      // Snap cutaway pit immediately onto current focus target upon entering Underground Mode!
      const focus = this.camCtrl.getFocusTarget();
      this.cutawayUniforms.uCutawayCenter.value.set(focus.x, 0, focus.z);
    }

    // Selected Station Focus Semi-Transparency (keeps surrounding buildings frosted/translucent
    // even when underground cutaway is OFF, and opens a gentle X-ray window for underground stations!)
    let stIsUnderground = false;
    if (selectedStationId) {
      const stNode = this.solved.stationNodes.find((n) => n.stationId === selectedStationId);
      if (stNode) {
        stIsUnderground =
          stNode.structure === 'tunnel_box' ||
          stNode.structure === 'tunnel_shield' ||
          stNode.y < -2.4;
        this.cutawayUniforms.uStationFocusActive.value = 1.0;
        this.cutawayUniforms.uStationFocusCenter.value.set(stNode.x, stNode.y, stNode.z);
        this.cutawayUniforms.uStationFocusRadius.value = stNode.isMajorHub ? 260.0 : 210.0;
        this.cutawayUniforms.uStationFocusUnderground.value = stIsUnderground ? 1.0 : 0.0;
      } else {
        this.cutawayUniforms.uStationFocusActive.value = 0.0;
        this.cutawayUniforms.uStationFocusUnderground.value = 0.0;
      }
    } else {
      this.cutawayUniforms.uStationFocusActive.value = 0.0;
      this.cutawayUniforms.uStationFocusUnderground.value = 0.0;
    }
    this.selectedStationUnderground = stIsUnderground;

    // Visual-only vertical exaggeration on 3D railway layers (NEVER mutates legal operatingKm!)
    this.railLayer.group.scale.y = this.verticalExaggeration;
    this.viaductLayer.group.scale.y = this.verticalExaggeration;
    this.tunnelLayer.group.scale.y = this.verticalExaggeration;

    // Boost subterranean illumination gently inside cutaway or selected underground station!
    const effectiveUndergroundReveal = underground.enabled || stIsUnderground;
    this.subFillLight.intensity = effectiveUndergroundReveal
      ? this.isDark
        ? 0.88
        : 0.78
      : this.isDark
        ? 0.48
        : 0.34;

    // Global Ghost-Surface opacity: when underground mode is active, smoothly fade entire surface city
    const effectiveGroundOpacity = underground.enabled ? underground.groundOpacity : 1.0;
    this.terrainLayer.setSurfaceOpacity(effectiveGroundOpacity, underground.enabled);

    const bldgVisible = !underground.hideBuildings;
    this.buildingManager.setVisibilityAndOpacity(
      bldgVisible,
      effectiveGroundOpacity,
      underground.enabled,
    );

    this.cutawayVisuals.update(
      underground.enabled,
      this.cutawayUniforms.uCutawayCenter.value.x,
      this.cutawayUniforms.uCutawayCenter.value.z,
      this.cutawayUniforms.uCutawayRadius.value,
      this.verticalExaggeration,
    );

    // Allow diving cleanly underneath ground level when Underground Explorer is active!
    this.camCtrl.setUndergroundBounds(underground.enabled, this.verticalExaggeration);
    this.clipPlane.constant = underground.clipEnabled ? underground.clipY : 10_000;

    this.railLayer.applyFilters({
      visibleOperatorIds,
      visibleTiers: underground.visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
      undergroundActive: effectiveUndergroundReveal,
      clipEnabled: underground.clipEnabled,
    });

    this.viaductLayer.applyFilters({
      visibleOperatorIds,
      visibleTiers: underground.visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
    });

    this.tunnelLayer.applyFilters({
      visibleOperatorIds,
      visibleTiers: underground.visibleTiers,
      selectedLineId,
      selectedStationId,
      fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
      undergroundActive: effectiveUndergroundReveal,
      clipEnabled: underground.clipEnabled,
    });
    this.tunnelLayer.setCutawayState(this.buildUndergroundCutawayState(underground));
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
        this.animateCameraTo(
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
    const { x, z } = lonLatToWorld(preset.lon, preset.lat);
    if (!this.cutawayPinned) {
      this.cutawayUniforms.uCutawayCenter.value.set(x, 0, z);
    }
    this.animateCameraTo(
      new THREE.Vector3(x, preset.targetY, z),
      preset.distance,
      preset.polarDeg,
      preset.azimuthDeg,
      700,
    );
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

  setCameraView(
    lon: number,
    lat: number,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
    targetY = 0,
  ): void {
    this.tracePlaying = false;
    const { x, z } = lonLatToWorld(lon, lat);
    if (!this.cutawayPinned) {
      this.cutawayUniforms.uCutawayCenter.value.set(x, 0, z);
    }
    this.camCtrl.jumpTo(new THREE.Vector3(x, targetY, z), distance, polarDeg, azimuthDeg);
    this.buildingManager.updateForCamera(this.camera, this.camCtrl.getFocusTarget());
    this.emitTelemetry();
  }

  flyToStation(stationId: SkId<'station'>): void {
    const node = this.solved.stationNodes.find((n) => n.stationId === stationId);
    if (!node) return;
    if (!this.cutawayPinned) {
      this.cutawayUniforms.uCutawayCenter.value.set(node.x, 0, node.z);
    }
    this.animateCameraTo(new THREE.Vector3(node.x, node.y, node.z), 560, 58, -28, 650);
  }

  flyToLine(lineId: SkId<'line'>): void {
    const segs = this.solved.segments.filter((s) => s.primaryLineId === lineId);
    if (segs.length === 0) return;
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
    this.animateCameraTo(new THREE.Vector3(cx, cy, cz), span, 56, -24, 700);
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

  // ---- Section 6.3: Line Trace Smooth Camera Fly-Through ----
  startLineTrace(lineId: SkId<'line'>, autoPlay = true): boolean {
    const line = this.dataset.railLines.find((l) => l.id === lineId);
    if (!line) return false;
    const segsByPair = new Map<string, { seg: SolvedSegment3D; reversed: boolean }>();
    for (const seg of this.solved.segments) {
      if (!seg.railLineIds.includes(lineId)) continue;
      segsByPair.set(`${seg.fromStationId}::${seg.toStationId}`, { seg, reversed: false });
      segsByPair.set(`${seg.toStationId}::${seg.fromStationId}`, { seg, reversed: true });
    }

    const stitched: SolvedPoint3D[] = [];
    const stationMarkers: { dist: number; name: string }[] = [];
    const stMap = new Map(this.dataset.stations.map((s) => [s.id, s]));
    let accumDist = 0;

    for (let i = 0; i < line.stationIds.length - 1; i++) {
      const a = line.stationIds[i]!;
      const b = line.stationIds[i + 1]!;
      const hit = segsByPair.get(`${a}::${b}`);
      if (!hit) continue;
      const pts = hit.reversed ? [...hit.seg.points].reverse() : hit.seg.points;
      if (i === 0) {
        stationMarkers.push({ dist: 0, name: stMap.get(a)?.names.ja ?? a });
      }
      for (let k = i === 0 ? 0 : 1; k < pts.length; k++) {
        const pt = pts[k]!;
        if (stitched.length > 0) {
          const prev = stitched[stitched.length - 1]!;
          accumDist += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
        }
        stitched.push({ ...pt, distFromStart: accumDist });
      }
      stationMarkers.push({ dist: accumDist, name: stMap.get(b)?.names.ja ?? b });
    }

    if (stitched.length < 2) return false;
    this.traceLineId = lineId;
    this.tracePath = stitched;
    this.traceStationNames = stationMarkers;
    this.traceProgress = 0;
    this.tracePlaying = autoPlay;
    this.traceProbe.visible = true;
    this.camCtrl.cancelAnimation();
    this.positionCameraOnTrace(0);
    return true;
  }

  setLineTracePlaying(playing: boolean): void {
    this.tracePlaying = playing;
    this.emitTraceStatus();
  }

  setLineTraceProgress(progress: number): void {
    this.traceProgress = Math.max(0, Math.min(1, progress));
    this.positionCameraOnTrace(this.traceProgress);
  }

  stopLineTrace(): void {
    this.tracePlaying = false;
    this.traceLineId = null;
    this.tracePath = [];
    this.traceProbe.visible = false;
    this.emitTraceStatus();
  }

  private positionCameraOnTrace(progress: number): void {
    if (this.tracePath.length < 2) return;
    const totalDist = this.tracePath[this.tracePath.length - 1]!.distFromStart || 1;
    const targetDist = progress * totalDist;

    let idx = 0;
    while (idx < this.tracePath.length - 2 && this.tracePath[idx + 1]!.distFromStart < targetDist) {
      idx++;
    }
    const p0 = this.tracePath[idx]!;
    const p1 = this.tracePath[idx + 1]!;
    const segLen = Math.max(0.01, p1.distFromStart - p0.distFromStart);
    const f = Math.max(0, Math.min(1, (targetDist - p0.distFromStart) / segLen));

    const x = p0.x + (p1.x - p0.x) * f;
    const y = p0.y + (p1.y - p0.y) * f;
    const z = p0.z + (p1.z - p0.z) * f;

    this.traceProbe.position.set(x, y + 3, z);

    // Smooth look-ahead tangent for cinematic railway chase camera
    const lookIdx = Math.min(this.tracePath.length - 1, idx + 4);
    const ahead = this.tracePath[lookIdx]!;
    const dx = ahead.x - x;
    const dz = ahead.z - z;
    const hLen = Math.hypot(dx, dz) || 1;
    const dirX = dx / hLen;
    const dirZ = dz / hLen;

    // Position camera behind and obliquely offset so height changes (tunnel <-> portal <-> viaduct) are super readable!
    const sideX = -dirZ;
    const sideZ = dirX;
    const camPos = new THREE.Vector3(
      x - dirX * 260 + sideX * 190,
      Math.max(y + 135, 45),
      z - dirZ * 260 + sideZ * 190,
    );
    const lookTarget = new THREE.Vector3(x + dirX * 90, y, z + dirZ * 90);

    this.camera.position.lerp(camPos, 0.25);
    this.camCtrl.controls.target.lerp(lookTarget, 0.25);
    this.camCtrl.controls.update();
    this.emitTraceStatus(y, targetDist);
  }

  private emitTraceStatus(currentY?: number, targetDist?: number): void {
    if (!this.callbacks.onTraceUpdate) return;
    if (!this.traceLineId || this.tracePath.length === 0) {
      this.callbacks.onTraceUpdate({
        active: false,
        playing: false,
        lineId: null,
        progress: 0,
        currentStationName: null,
        currentTier: null,
        currentY: null,
      });
      return;
    }

    let nearestSt: string | null = null;
    if (targetDist !== undefined && this.traceStationNames.length > 0) {
      let bestD = Infinity;
      for (const sm of this.traceStationNames) {
        const d = Math.abs(sm.dist - targetDist);
        if (d < bestD) {
          bestD = d;
          nearestSt = sm.name;
        }
      }
    }
    const yVal = currentY ?? this.traceProbe.position.y - 3;
    this.callbacks.onTraceUpdate({
      active: true,
      playing: this.tracePlaying,
      lineId: this.traceLineId,
      progress: this.traceProgress,
      currentStationName: nearestSt,
      currentTier: classifyTier(yVal),
      currentY: Math.round(yVal * 10) / 10,
    });
  }

  private animateCameraTo(
    endTarget: THREE.Vector3,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
    durationMs: number,
  ): void {
    this.tracePlaying = false;
    this.camCtrl.animateTo(endTarget, distance, polarDeg, azimuthDeg, durationMs);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.camCtrl.cancelAnimation();
  };

  private handleDoubleClick = (e: MouseEvent): void => {
    // P6: Double-click anywhere on buildings, stations, tracks, or ground to smoothly focus that location!
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hitTargets: THREE.Object3D[] = [
      ...this.tunnelLayer.interactiveStationMeshes,
      ...this.railLayer.interactiveMeshes,
      this.buildingManager.landmarksGroup,
      this.terrainLayer.group,
    ];
    const hits = this.raycaster
      .intersectObjects(hitTargets, true)
      .filter((h) => h.object.visible);

    if (hits.length > 0) {
      this.tracePlaying = false;
      this.camCtrl.focusWorldPoint(hits[0]!.point);
      return;
    }

    // Fallback: intersect horizontal ground plane y = 0 cleanly
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(groundPlane, pt)) {
      this.tracePlaying = false;
      this.camCtrl.focusWorldPoint(pt);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.pointerDownPos) return;
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    this.pointerDownPos = null;
    if (dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // Prioritize clickable 3D virtual trains first (when rolling stock renderer is active)
    if (this.rollingStockRenderer && this.rollingStockRenderer.interactiveTrainMeshes.length > 0) {
      const trainHits = this.raycaster
        .intersectObjects(this.rollingStockRenderer.interactiveTrainMeshes, true)
        .filter((h) => h.object.visible);
      for (const hit of trainHits) {
        const tid = this.rollingStockRenderer.resolveTrainHit(hit);
        if (tid) {
          this.selectTrain(tid);
          return;
        }
      }
    }

    // Next prioritize clickable 3D station volumes (batched InstancedMesh with instanceId resolution!)
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

    const lineHits = this.raycaster
      .intersectObjects(this.railLayer.interactiveMeshes, false)
      .filter((h) => h.object.visible);
    if (lineHits.length > 0) {
      const lid = lineHits[0]!.object.userData?.lineId as SkId<'line'> | undefined;
      if (lid) {
        this.callbacks.onSelectLine(lid);
        return;
      }
    }

    // Clicking empty map/city space clears active station/line/train selections cleanly
    this.selectTrain(null);
    this.callbacks.onClearSelection?.();
  };

  private handleControlsEnd = (): void => {
    this.syncWindowCameraSnapshot();
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
    this.rendererBundle.setSize(w, h);
  }

  private emitTelemetry(): void {
    const bStats = this.buildingManager.getStats();
    const portalCount = this.solved.segments.reduce((s, seg) => s + seg.portals.length, 0);
    const adjustedCount = this.solved.crossings.filter((c) => c.wasAdjusted).length;
    const simCtrl = this.getSimulationControlState();
    const rsStats = this.rollingStockRenderer?.getStats();
    const camSnap = this.getCameraStateSnapshot();
    const renderStats = this.rendererBundle.getSceneRenderStats();
    const telemetry: SceneTelemetry = {
      ...bStats,
      deconflictedCrossings: adjustedCount,
      tunnelPortals: portalCount,
      fps: this.smoothedFps,
      drawCalls: renderStats.calls,
      triangles: renderStats.triangles,
      loadTimeMs: this.urbanLoadedMs,
      railwayLod: this.currentRailwayLod,
      activeTrains: simCtrl.totalActiveTrains,
      undergroundTrains: simCtrl.undergroundTrainCount,
      simRunning: simCtrl.running,
      simTimeScale: simCtrl.timeScale,
      simClockSec: simCtrl.simClockSec,
      cameraModeV2: camSnap.mode,
      cameraUnderground: camSnap.isUndergroundCamera,
      tunnelCutawayStyle: this.tunnelCutawayStyle,
      rollingStockCars: rsStats?.renderedCarCount ?? 0,
    };
    (window as unknown as { __SENKIRO_3D_METRICS__?: SceneTelemetry }).__SENKIRO_3D_METRICS__ =
      telemetry;
    this.syncWindowCameraSnapshot();
    this.callbacks.onTelemetry?.(telemetry);
  }

  private syncWindowCameraSnapshot(): void {
    const focus = this.camCtrl.getFocusTarget();
    (
      window as unknown as {
        __SENKIRO_3D_CAMERA__?: {
          mode: CameraNavMode;
          pos: [number, number, number];
          target: [number, number, number];
        };
      }
    ).__SENKIRO_3D_CAMERA__ = {
      mode: this.camCtrl.getMode(),
      pos: [
        Math.round(this.camera.position.x),
        Math.round(this.camera.position.y),
        Math.round(this.camera.position.z),
      ],
      target: [Math.round(focus.x), Math.round(focus.y), Math.round(focus.z)],
    };
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

    // 1. Step v2.0 virtual train simulation first so camera follow & rolling stock read the exact current frame
    if (this.simulationEngine) {
      this.latestTrains = this.simulationEngine.step(dtSec, this.verticalExaggeration);
      if (now - this.lastSimEmitTime > 250) {
        this.lastSimEmitTime = now;
        this.emitSimulationState();
      }
    }

    // 2. Active Train Follow, Line Trace fly-through, or Interactive Spatial Camera
    if (this.followTrainId && this.simulationEngine) {
      const targetTrain = this.simulationEngine.getTrainById(this.followTrainId);
      if (targetTrain) {
        this.camCtrl.updateTrainTarget(targetTrain, dtSec);
      } else {
        this.camCtrl.update(now, dtSec);
      }
    } else if (this.tracePlaying && this.tracePath.length >= 2) {
      this.traceProgress += dtSec * 0.045;
      if (this.traceProgress >= 1) {
        this.traceProgress = 1;
        this.tracePlaying = false;
      }
      this.positionCameraOnTrace(this.traceProgress);
    } else {
      this.camCtrl.update(now, dtSec);
    }
    this.syncWindowCameraSnapshot();

    // 3. Enclosed subterranean atmosphere & surface occlusion when camera is physically inside a tunnel
    const wantEnclosedUnderground = this.camera.position.y < -4.2 && !this.cutawayActive;
    if (wantEnclosedUnderground !== this.enclosedUndergroundActive) {
      this.enclosedUndergroundActive = wantEnclosedUnderground;
      const skyDome = this.scene.getObjectByName('atmospheric-sky-dome');
      if (skyDome) skyDome.visible = !wantEnclosedUnderground;
      this.terrainLayer.group.visible = !wantEnclosedUnderground;
      this.outerMetro.setVisibility(!wantEnclosedUnderground);
      this.buildingManager.group.visible = !wantEnclosedUnderground;
      this.viaductLayer.group.visible = !wantEnclosedUnderground;
      if (wantEnclosedUnderground) {
        this.scene.background = new THREE.Color(0x0a0f18);
        this.scene.fog = new THREE.Fog(0x0a0f18, 85, 390);
      } else {
        this.applySolarState(this.skyEnv.applyTimeOfDay(this.scene, this.currentTimeOfDayHour));
      }
    }

    // 4. Sync 1:1 unscaled rolling stock meshes (cull buried deep-tunnel trains while surface ground is opaque!)
    if (this.rollingStockRenderer && this.latestTrains.length > 0) {
      const groundOpaqueAbove =
        !this.cutawayActive && !this.selectedStationUnderground && this.camera.position.y >= -1.5;
      const trainsForRender = groundOpaqueAbove
        ? this.latestTrains.filter(
            (tr) => !(tr.isUnderground && tr.inTunnel) || tr.trainId === this.followTrainId,
          )
        : this.latestTrains;
      this.rollingStockRenderer.syncTrains(
        trainsForRender,
        this.camera.position,
        this.verticalExaggeration,
        this.isDark,
      );
    }

    const focusTarget = this.camCtrl.getFocusTarget();
    const camDist = this.camCtrl.getDistanceToFocus();

    // Adaptive near/far planes: tight 0.25m near-plane inside underground tunnels / cab / close train rigs,
    // wider 4..75m near-plane at metropolitan overview distances for depth precision!
    const isCloseOrInterior =
      this.camera.position.y < -1.5 ||
      camDist < 120 ||
      (this.followTrainId !== null && this.followTrainView === 'cab');
    const targetNear = isCloseOrInterior
      ? 0.25
      : Math.max(4, Math.min(75, camDist * 0.012));
    const targetFar = Math.max(65_000, camDist * 9.0);
    if (
      Math.abs(targetNear - this.camera.near) / this.camera.near > 0.1 ||
      Math.abs(targetFar - this.camera.far) / this.camera.far > 0.15
    ) {
      this.camera.near = targetNear;
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    // 3-Tier Railway Distance LOD (P4: near steel/sleepers/catenary -> mid deck -> far skeleton!)
    this.currentRailwayLod = this.railLayer.updateLod(camDist);
    this.viaductLayer.updateLod(camDist);
    this.tunnelLayer.updateLod(camDist, this.camera.position);

    this.skyEnv.updateForCamera(this.camera.position, this.camera.far);
    this.skyEnv.updateTime(now * 0.001);
    this.lightingUniforms.uTimeSec.value = now * 0.001;
    this.terrainLayer.updateAnimation(now * 0.001);

    // Smoothly track cutaway pit center onto camera focus target unless pinned (P5)
    if (this.cutawayActive) {
      if (!this.cutawayPinned) {
        const cutAlpha = 1 - Math.exp(-10.0 * Math.max(0.016, dtSec));
        this.cutawayUniforms.uCutawayCenter.value.x = THREE.MathUtils.lerp(
          this.cutawayUniforms.uCutawayCenter.value.x,
          focusTarget.x,
          cutAlpha,
        );
        this.cutawayUniforms.uCutawayCenter.value.z = THREE.MathUtils.lerp(
          this.cutawayUniforms.uCutawayCenter.value.z,
          focusTarget.z,
          cutAlpha,
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

    // Dynamic camera-distance adaptive shadow frustum + texel-snapping to eliminate shadow swimming
    const targetSpan = Math.max(520, Math.min(2600, camDist * 0.88));
    if (Math.abs(targetSpan - this.lastShadowSpan) / this.lastShadowSpan > 0.14) {
      this.lastShadowSpan = targetSpan;
      this.sunLight.shadow.camera.left = -targetSpan;
      this.sunLight.shadow.camera.right = targetSpan;
      this.sunLight.shadow.camera.top = targetSpan;
      this.sunLight.shadow.camera.bottom = -targetSpan;
      this.sunLight.shadow.camera.updateProjectionMatrix();
    }
    const texelWorld = (this.lastShadowSpan * 2) / 2048;
    const snapX = Math.round(focusTarget.x / texelWorld) * texelWorld;
    const snapZ = Math.round(focusTarget.z / texelWorld) * texelWorld;
    this.sunLight.target.position.set(snapX, 0, snapZ);
    this.sunLight.position.set(
      snapX + this.skyEnv.activeLightDirection.x * 3600,
      this.skyEnv.activeLightDirection.y * 3600,
      snapZ + this.skyEnv.activeLightDirection.z * 3600,
    );

    // Throttled chunk streaming, lazy LOD0 & GPU memory eviction (~4Hz)
    if (now - this.lastChunkUpdateTime > 260) {
      this.lastChunkUpdateTime = now;
      this.buildingManager.updateForCamera(this.camera, focusTarget);
      this.emitTelemetry();
    }

    this.rendererBundle.render(this.scene, this.camera);
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
    this.outerMetro.dispose();
    this.buildingManager.dispose();
    this.railLayer.dispose();
    this.viaductLayer.dispose();
    this.tunnelLayer.dispose();
    this.rollingStockRenderer?.dispose();
    this.traceProbe.geometry.dispose();
    (this.traceProbe.material as THREE.Material).dispose();
    this.rendererBundle.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
