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
  classifyTier,
  solveRailwayNetwork3D,
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
import { SpatialCameraController } from './cameraController.js';
import { CutawayPitVisuals } from './environment/cutawayVisuals.js';
import { SkyEnvironmentSystem } from './environment/skyEnvironment.js';
import { CityChunkManager } from './generators/buildingGenerator.js';
import { CityTerrainLayer } from './generators/cityTerrainGenerator.js';
import { RailTrackLayer, type RailwayLodTier } from './generators/railTrackGenerator.js';
import { TunnelAndStationLayer } from './generators/tunnelGenerator.js';
import { ViaductLayer } from './generators/viaductGenerator.js';
import type {
  TunnelViewpoint,
  UndergroundRailwayQueryAPI,
  UndergroundSectionCutState,
} from '../domain/underground/tunnelTypes.js';
import { UndergroundRailwaySystem } from './underground/UndergroundRailwaySystem.js';
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
  onTelemetry?: (telemetry: SceneTelemetry) => void;
  onTraceUpdate?: (status: LineTraceStatus) => void;
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
  private readonly undergroundSystem: UndergroundRailwaySystem;
  private readonly traceProbe: THREE.Mesh;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly subFillLight: THREE.DirectionalLight;

  private cutawayActive = false;
  private cutawayPinned = false;
  private verticalExaggeration = 1.0;
  private interiorTunnelActive = false;
  private lastInteriorLightingApplied = false;

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
  ) {
    this.container = container;
    this.dataset = dataset;
    this.isDark = isDark;
    this.callbacks = callbacks;
    this.fareSliceLineIds = new Set(
      dataset.railLines.filter((l) => l.inFareSlice).map((l) => l.id),
    );

    // 1. Solve continuous 3D vertical railway network from shared AtlasDataset + OSM vertical tags
    this.solved = solveRailwayNetwork3D(dataset, osmVertical);

    // 2. Renderer (logarithmicDepthBuffer: true eliminates distant coplanar ground/water Z-fighting!)
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

    // 3. Scene, Procedural Sky Dome, PMREM Reflections & Clean Distance Fog (P3)
    this.scene = new THREE.Scene();
    this.skyEnv = new SkyEnvironmentSystem(this.renderer, this.scene, isDark);

    // 4. Camera & Unified Spatial Camera Controller (P6: Map Browse + Free Explore!)
    const aspect = (container.clientWidth || 960) / Math.max(1, container.clientHeight || 640);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 4, 90_000);
    this.camCtrl = new SpatialCameraController(
      this.camera,
      this.renderer.domElement,
      this.handleControlsEnd,
    );

    // 5. Lighting (Semi-Realistic Architectural Viz Sunlight + Soft Shadows + Bounce Fill)
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

    // Subtle cool sky fill opposite the sun + subterranean tunnel readability fill
    this.subFillLight = new THREE.DirectionalLight(isDark ? 0x3b82f6 : 0xbdd7f0, isDark ? 0.48 : 0.34);
    this.subFillLight.position.set(-1200, -320, -900);
    this.scene.add(this.subFillLight);

    // 6. Horizontal Clipping Plane (disabled by default via large constant)
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000);
    this.clipPlanes = [this.clipPlane];

    // 7. Instantiate Procedural Layers + GPU Radial Cutaway System (P5)
    this.cutawayUniforms = createCutawayUniforms();
    this.cutawayVisuals = new CutawayPitVisuals(isDark);
    this.terrainLayer = new CityTerrainLayer(isDark, this.clipPlanes, this.cutawayUniforms);
    this.buildingManager = new CityChunkManager(isDark, this.clipPlanes, this.cutawayUniforms);
    this.railLayer = new RailTrackLayer(this.solved, this.clipPlanes);
    this.viaductLayer = new ViaductLayer(this.solved, null, this.clipPlanes);
    this.tunnelLayer = new TunnelAndStationLayer(this.solved, this.clipPlanes);
    this.undergroundSystem = new UndergroundRailwaySystem(this.solved, this.clipPlanes);

    this.scene.add(
      this.terrainLayer.group,
      this.cutawayVisuals.group,
      this.buildingManager.group,
      this.viaductLayer.group,
      this.tunnelLayer.group,
      this.undergroundSystem.group,
      this.undergroundSystem.lightingSystem.group,
      this.railLayer.group,
    );

    // Expose read-only Underground Spatial Query & Section-Cut bridge for Camera Session & E2E
    (
      window as unknown as {
        __SENKIRO_UNDERGROUND__?: {
          api: UndergroundRailwayQueryAPI;
          enterViewpoint: (id: string) => boolean;
          exitInterior: () => void;
          setSectionCut: (state: UndergroundSectionCutState) => void;
          setCameraPose: (
            pos: [number, number, number],
            lookAt: [number, number, number],
            nearM?: number,
          ) => void;
        };
      }
    ).__SENKIRO_UNDERGROUND__ = {
      api: this.undergroundSystem,
      enterViewpoint: (id: string) => this.enterTunnelViewpoint(id),
      exitInterior: () => this.exitTunnelInterior(),
      setSectionCut: (state: UndergroundSectionCutState) => this.setUndergroundSectionCut(state),
      setCameraPose: (pos, lookAt, nearM = 0.25) => this.setCustomTunnelPose(pos, lookAt, nearM),
    };

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

  getUndergroundAPI(): UndergroundRailwayQueryAPI {
    return this.undergroundSystem;
  }

  getTunnelViewpoints(): TunnelViewpoint[] {
    return this.undergroundSystem.getCuratedViewpoints();
  }

  setUndergroundSectionCut(state: UndergroundSectionCutState): void {
    this.undergroundSystem.setSectionCutState(state);
    this.emitTelemetry();
  }

  /**
   * Positions camera inside an enterable tunnel/station viewpoint using the existing
   * SpatialCameraController (without rewriting global camera controls).
   */
  enterTunnelViewpoint(viewpointId: string): boolean {
    const vp = this.undergroundSystem.getCuratedViewpoints().find((v) => v.id === viewpointId);
    if (!vp) return false;
    this.setCustomTunnelPose(
      [vp.position.x, vp.position.y, vp.position.z],
      [vp.lookAt.x, vp.lookAt.y, vp.lookAt.z],
      vp.recommendedNearM,
      vp.recommendedFovDeg,
    );
    return true;
  }

  private setCustomTunnelPose(
    pos: [number, number, number],
    lookAt: [number, number, number],
    nearM = 0.25,
    fovDeg = 54,
  ): void {
    this.tracePlaying = false;
    this.interiorTunnelActive = true;
    // Lock 1:1 vertical scale while inspecting tunnel interior so circular bores & clearance stay exact!
    this.verticalExaggeration = 1.0;
    this.railLayer.group.scale.y = 1.0;
    this.viaductLayer.group.scale.y = 1.0;
    this.tunnelLayer.group.scale.y = 1.0;
    this.undergroundSystem.group.scale.y = 1.0;
    this.undergroundSystem.setInteriorMode(true);
    this.tunnelLayer.setInteriorMode(true);

    this.camCtrl.setUndergroundBounds(true, 1.0);
    if (this.camCtrl.getMode() === 'free') {
      this.camCtrl.setMode('map');
    }
    this.camera.fov = fovDeg;
    this.camera.near = nearM;
    this.camera.far = 16_000;
    this.camera.updateProjectionMatrix();

    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camCtrl.controls.target.set(lookAt[0], lookAt[1], lookAt[2]);
    this.camCtrl.setMode('free');
    this.camCtrl.setSpeed('slow');
    this.emitTelemetry();
  }

  exitTunnelInterior(): void {
    this.interiorTunnelActive = false;
    this.undergroundSystem.setInteriorMode(false);
    this.tunnelLayer.setInteriorMode(false);
    this.camCtrl.setUndergroundBounds(false, 1.0);
    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();

    // Lift camera cleanly back above ground surface around the current focus XZ so Return to Surface
    // never leaves the camera stranded underground inside a tunnel bore!
    const focus = this.camCtrl.getFocusTarget();
    const liftTarget = new THREE.Vector3(focus.x, 0, focus.z);
    this.camCtrl.setMode('map');
    this.camCtrl.setSpeed('normal');
    if (this.camera.position.y < 30) {
      this.camCtrl.jumpTo(liftTarget, 620, 58, -32);
    }
    this.buildingManager.group.visible = true;
    this.terrainLayer.group.visible = true;
    this.emitTelemetry();
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
    this.cutawayActive = underground.enabled;
    this.cutawayPinned = underground.pinCutaway;
    // Keep 1:1 vertical scale whenever inside a tunnel interior so circular bores & clearance never distort!
    this.verticalExaggeration =
      underground.enabled && !this.interiorTunnelActive
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

    // Visual-only vertical exaggeration on 3D railway layers (NEVER mutates legal operatingKm!)
    this.railLayer.group.scale.y = this.verticalExaggeration;
    this.viaductLayer.group.scale.y = this.verticalExaggeration;
    this.tunnelLayer.group.scale.y = this.verticalExaggeration;
    this.undergroundSystem.group.scale.y = this.verticalExaggeration;

    // Boost subterranean illumination gently inside cutaway pit so concrete tunnels pop crisply!
    this.subFillLight.intensity = underground.enabled
      ? this.isDark
        ? 0.85
        : 0.72
      : this.isDark
        ? 0.48
        : 0.34;

    // Outer ground stays crisp around cutaway pit unless user dials down Outer Surface Opacity!
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
      undergroundActive: underground.enabled,
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
      undergroundActive: underground.enabled,
      clipEnabled: underground.clipEnabled,
    });

    this.undergroundSystem.applyFilters({
      visibleOperatorIds,
      visibleTiers: underground.visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
      undergroundActive: underground.enabled,
      clipEnabled: underground.clipEnabled,
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

  flyToStation(stationId: SkId<'station'>): void {
    const node = this.solved.stationNodes.find((n) => n.stationId === stationId);
    if (!node) return;
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

    // Prioritize clickable 3D station volumes (batched InstancedMesh + underground station caverns!)
    const stationHits = this.raycaster
      .intersectObjects(
        [...this.tunnelLayer.interactiveStationMeshes, ...this.undergroundSystem.interactiveStationMeshes],
        false,
      )
      .filter((h) => h.object.visible);
    for (const hit of stationHits) {
      const sid =
        this.tunnelLayer.resolveStationHit(hit) ?? this.undergroundSystem.resolveStationHit(hit);
      if (sid) {
        this.callbacks.onSelectStation(sid);
        return;
      }
    }

    const lineHits = this.raycaster
      .intersectObjects(
        [...this.railLayer.interactiveMeshes, ...this.undergroundSystem.interactiveTrackMeshes],
        false,
      )
      .filter((h) => h.object.visible);
    if (lineHits.length > 0) {
      const lid = lineHits[0]!.object.userData?.lineId as SkId<'line'> | undefined;
      if (lid) {
        this.callbacks.onSelectLine(lid);
      }
    }
  };

  private handleControlsEnd = (): void => {
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
      underground: this.undergroundSystem.getTelemetry(),
    };
    (window as unknown as { __SENKIRO_3D_METRICS__?: SceneTelemetry }).__SENKIRO_3D_METRICS__ =
      telemetry;
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

    // Active Line Trace fly-through progression
    if (this.tracePlaying && this.tracePath.length >= 2) {
      this.traceProgress += dtSec * 0.045;
      if (this.traceProgress >= 1) {
        this.traceProgress = 1;
        this.tracePlaying = false;
      }
      this.positionCameraOnTrace(this.traceProgress);
    } else {
      this.camCtrl.update(now, dtSec);
    }

    const focusTarget = this.camCtrl.getFocusTarget();
    const camDist = this.camCtrl.getDistanceToFocus();

    // Update chunked underground railway geometry, frustum culling, depth attenuation & PointLight pool
    const { isCameraInsideTunnel, isEnclosedInterior } = this.undergroundSystem.updateForCamera(
      this.camera,
      camDist,
      this.verticalExaggeration,
    );
    const insideTunnel = this.interiorTunnelActive || isCameraInsideTunnel;
    this.tunnelLayer.setInteriorMode(insideTunnel);

    // Cull invisible surface city/terrain draw calls while deeply enclosed inside an opaque concrete bore!
    this.buildingManager.group.visible = !isEnclosedInterior;
    this.terrainLayer.group.visible = !isEnclosedInterior;

    // Balance subterranean illumination cleanly when inside a tunnel (neither blown out nor pitch black!)
    if (isEnclosedInterior !== this.lastInteriorLightingApplied) {
      this.lastInteriorLightingApplied = isEnclosedInterior;
      if (isEnclosedInterior) {
        this.sunLight.intensity = 0.08;
        this.hemiLight.intensity = 0.28;
        this.subFillLight.intensity = 0.28;
      } else {
        this.sunLight.intensity = this.isDark ? 0.92 : 1.78;
        this.hemiLight.intensity = this.isDark ? 0.58 : 0.78;
        this.subFillLight.intensity = this.cutawayActive
          ? this.isDark
            ? 0.85
            : 0.72
          : this.isDark
            ? 0.48
            : 0.34;
      }
    }

    // Adaptive near/far planes: drop near to 0.25m inside tunnels so walls & rails never clip!
    const targetNear = insideTunnel ? 0.25 : Math.max(4, Math.min(75, camDist * 0.012));
    const targetFar = insideTunnel ? 16_000 : Math.max(28_000, camDist * 8.5);
    if (
      Math.abs(targetNear - this.camera.near) / Math.max(0.05, this.camera.near) > 0.1 ||
      Math.abs(targetFar - this.camera.far) / Math.max(1, this.camera.far) > 0.15
    ) {
      this.camera.near = targetNear;
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    // 3-Tier Railway Distance LOD (P4: near steel/sleepers/catenary -> mid deck -> far skeleton!)
    this.currentRailwayLod = this.railLayer.updateLod(camDist);
    this.viaductLayer.updateLod(camDist);
    this.tunnelLayer.updateLod(camDist);

    this.skyEnv.updateForCamera(this.camera.position);

    // Smoothly track cutaway pit center onto camera focus target unless pinned (P5)
    if (this.cutawayActive) {
      if (!this.cutawayPinned) {
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

    // Keep shadow frustum centered near camera target along solar direction for crisp local shadows!
    this.sunLight.target.position.set(focusTarget.x, 0, focusTarget.z);
    this.sunLight.position.set(
      focusTarget.x + this.skyEnv.sunDirection.x * 3000,
      this.skyEnv.sunDirection.y * 3000,
      focusTarget.z + this.skyEnv.sunDirection.z * 3000,
    );

    // Throttled chunk streaming, lazy LOD0 & GPU memory eviction (~4Hz)
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
    this.undergroundSystem.dispose();
    this.traceProbe.geometry.dispose();
    (this.traceProbe.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
