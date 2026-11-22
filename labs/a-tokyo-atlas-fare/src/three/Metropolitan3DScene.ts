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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
import { CityChunkManager } from './generators/buildingGenerator.js';
import { CityTerrainLayer } from './generators/cityTerrainGenerator.js';
import { RailTrackLayer } from './generators/railTrackGenerator.js';
import { TunnelAndStationLayer } from './generators/tunnelGenerator.js';
import { ViaductLayer } from './generators/viaductGenerator.js';
import {
  lonLatToWorld,
  TOKYO_HUB_PRESETS,
  worldToLonLat,
  type CameraHubPreset,
} from './geoProjection.js';
import type {
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

interface CameraAnim {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  durationMs: number;
}

export class Metropolitan3DScene {
  readonly solved: SolvedRailwayNetwork3D;

  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clipPlane: THREE.Plane;
  private readonly clipPlanes: THREE.Plane[];

  private readonly terrainLayer: CityTerrainLayer;
  private readonly buildingManager: CityChunkManager;
  private readonly railLayer: RailTrackLayer;
  private readonly viaductLayer: ViaductLayer;
  private readonly tunnelLayer: TunnelAndStationLayer;
  private readonly traceProbe: THREE.Mesh;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;

  private readonly dataset: AtlasDataset;
  private readonly fareSliceLineIds: Set<SkId<'line'>>;
  private readonly callbacks: SceneCallbacks;
  private readonly resizeObserver: ResizeObserver;

  private rafId: number | null = null;
  private disposed = false;
  private isDark: boolean;
  private lastChunkUpdateTime = 0;
  private cameraAnim: CameraAnim | null = null;

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

    // 3. Scene, Sky & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.applySceneAtmosphere(isDark);

    // 4. Camera & OrbitControls
    const aspect = (container.clientWidth || 960) / Math.max(1, container.clientHeight || 640);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 4, 90_000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 18_500;
    this.controls.minPolarAngle = 0.14;
    this.controls.maxPolarAngle = Math.PI * 0.47;

    // 5. Lighting (Architectural Viz Soft Daylight + Underground Clarity Fill)
    this.hemiLight = new THREE.HemisphereLight(
      isDark ? 0x94b8db : 0xf4f8ff,
      isDark ? 0x1e293b : 0x8f9aa8,
      isDark ? 0.9 : 1.05,
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbf2, isDark ? 1.15 : 1.45);
    this.sunLight.position.set(1600, 2600, 1400);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 200;
    this.sunLight.shadow.camera.far = 9000;
    const sc = 2400;
    this.sunLight.shadow.camera.left = -sc;
    this.sunLight.shadow.camera.right = sc;
    this.sunLight.shadow.camera.top = sc;
    this.sunLight.shadow.camera.bottom = -sc;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle subterranean upward fill light so underground tunnel shells & rails pop clearly!
    const subFill = new THREE.DirectionalLight(0x60a5fa, 0.45);
    subFill.position.set(-800, -350, -600);
    this.scene.add(subFill);

    // 6. Horizontal Clipping Plane (disabled by default via large constant)
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000);
    this.clipPlanes = [this.clipPlane];

    // 7. Instantiate Procedural Layers
    this.terrainLayer = new CityTerrainLayer(isDark, this.clipPlanes);
    this.buildingManager = new CityChunkManager(isDark, this.clipPlanes);
    this.railLayer = new RailTrackLayer(this.solved, this.clipPlanes);
    this.viaductLayer = new ViaductLayer(this.solved, null, this.clipPlanes);
    this.tunnelLayer = new TunnelAndStationLayer(this.solved, this.clipPlanes);

    this.scene.add(
      this.terrainLayer.group,
      this.buildingManager.group,
      this.viaductLayer.group,
      this.tunnelLayer.group,
      this.railLayer.group,
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
    this.controls.addEventListener('end', this.handleControlsEnd);

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
          this.buildingManager.updateForCamera(this.camera, this.controls.target);
          this.urbanLoadedMs = Math.round(performance.now() - this.sceneCreatedAt);
          this.emitTelemetry();
        }
      }
    } catch {
      // Graceful fallback: 3D railway & terrain continue running cleanly even if urban chunks fail
    }
  }

  private applySceneAtmosphere(isDark: boolean): void {
    const bgHex = isDark ? 0x0b111a : 0xdde7f0;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, isDark ? 0.000048 : 0.000042);
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.applySceneAtmosphere(isDark);
    this.hemiLight.color.setHex(isDark ? 0x94b8db : 0xf4f8ff);
    this.hemiLight.groundColor.setHex(isDark ? 0x1e293b : 0x8f9aa8);
    this.hemiLight.intensity = isDark ? 0.9 : 1.05;
    this.sunLight.intensity = isDark ? 1.15 : 1.45;
    this.terrainLayer.setTheme(isDark);
    this.buildingManager.setTheme(isDark);
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

    // Underground View surface fading, building visibility, polar angle allowance & depth slicing!
    const effectiveGroundOpacity = underground.enabled ? underground.groundOpacity : 1.0;
    this.terrainLayer.setSurfaceOpacity(effectiveGroundOpacity, underground.enabled);

    const bldgVisible = !underground.hideBuildings;
    const bldgOpacity = underground.enabled
      ? Math.max(0.18, Math.min(0.65, underground.groundOpacity + 0.16))
      : 1.0;
    this.buildingManager.setVisibilityAndOpacity(bldgVisible, bldgOpacity);

    // Allow diving underneath ground level when Underground View is active!
    this.controls.maxPolarAngle = underground.enabled ? Math.PI * 0.72 : Math.PI * 0.47;
    this.clipPlane.constant = underground.clipEnabled ? underground.clipY : 10_000;

    this.railLayer.applyFilters({
      visibleOperatorIds,
      visibleTiers: underground.visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds: this.fareSliceLineIds,
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
    const target = new THREE.Vector3(x, preset.targetY, z);
    const pos = this.sphericalToPos(target, preset.distance, preset.polarDeg, preset.azimuthDeg);
    this.controls.target.copy(target);
    this.camera.position.copy(pos);
    this.controls.update();
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
    const target = new THREE.Vector3(x, 0, z);
    const pos = this.sphericalToPos(target, dist, 55, -24);
    this.controls.target.copy(target);
    this.camera.position.copy(pos);
    this.controls.update();
  }

  getViewLonLatZoom(): { lon: number; lat: number; zoom: number } {
    const [lon, lat] = worldToLonLat(this.controls.target.x, this.controls.target.z);
    const dist = this.camera.position.distanceTo(this.controls.target);
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
    this.cameraAnim = null;
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
    this.controls.target.lerp(lookTarget, 0.25);
    this.controls.update();
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

  private sphericalToPos(
    target: THREE.Vector3,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
  ): THREE.Vector3 {
    const phi = THREE.MathUtils.degToRad(polarDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    const sinPhi = Math.sin(phi);
    return new THREE.Vector3(
      target.x + distance * sinPhi * Math.sin(theta),
      target.y + distance * Math.cos(phi),
      target.z + distance * sinPhi * Math.cos(theta),
    );
  }

  private animateCameraTo(
    endTarget: THREE.Vector3,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
    durationMs: number,
  ): void {
    this.tracePlaying = false;
    const endPos = this.sphericalToPos(endTarget, distance, polarDeg, azimuthDeg);
    this.cameraAnim = {
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.controls.target.clone(),
      endTarget,
      startTime: performance.now(),
      durationMs,
    };
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    // User manual drag cancels automated fly-through animation cleanly
    this.cameraAnim = null;
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

    // Prioritize clickable 3D station volumes over tracks
    const stationHits = this.raycaster
      .intersectObjects(this.tunnelLayer.interactiveStationMeshes, false)
      .filter((h) => h.object.visible);
    if (stationHits.length > 0) {
      const sid = stationHits[0]!.object.userData?.stationId as SkId<'station'> | undefined;
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
    };
    (window as unknown as { __SENKIRO_3D_METRICS__?: SceneTelemetry }).__SENKIRO_3D_METRICS__ =
      telemetry;
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

    // Adaptive near/far planes for optimal depth buffer precision across all zoom levels (P0)
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const targetNear = Math.max(4, Math.min(75, camDist * 0.012));
    const targetFar = Math.max(28_000, camDist * 8.5);
    if (
      Math.abs(targetNear - this.camera.near) / this.camera.near > 0.1 ||
      Math.abs(targetFar - this.camera.far) / this.camera.far > 0.15
    ) {
      this.camera.near = targetNear;
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    // Smooth camera animation
    if (this.cameraAnim) {
      const elapsed = (now - this.cameraAnim.startTime) / this.cameraAnim.durationMs;
      if (elapsed >= 1) {
        this.camera.position.copy(this.cameraAnim.endPos);
        this.controls.target.copy(this.cameraAnim.endTarget);
        this.cameraAnim = null;
      } else {
        const ease = elapsed * elapsed * (3 - 2 * elapsed);
        this.camera.position.lerpVectors(this.cameraAnim.startPos, this.cameraAnim.endPos, ease);
        this.controls.target.lerpVectors(
          this.cameraAnim.startTarget,
          this.cameraAnim.endTarget,
          ease,
        );
      }
    }

    // Active Line Trace fly-through progression
    if (this.tracePlaying && this.tracePath.length >= 2) {
      this.traceProgress += dtSec * 0.045;
      if (this.traceProgress >= 1) {
        this.traceProgress = 1;
        this.tracePlaying = false;
      }
      this.positionCameraOnTrace(this.traceProgress);
    }

    this.controls.update();

    // Keep shadow frustum centered near camera target for crisp local building & viaduct shadows!
    this.sunLight.target.position.set(this.controls.target.x, 0, this.controls.target.z);
    this.sunLight.position.set(
      this.controls.target.x + 1500,
      2500,
      this.controls.target.z + 1300,
    );

    // Throttled chunk streaming & LOD update (~4Hz)
    if (now - this.lastChunkUpdateTime > 260) {
      this.lastChunkUpdateTime = now;
      this.buildingManager.updateForCamera(this.camera, this.controls.target);
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
    this.controls.removeEventListener('end', this.handleControlsEnd);
    this.controls.dispose();

    this.terrainLayer.dispose();
    this.buildingManager.dispose();
    this.railLayer.dispose();
    this.viaductLayer.dispose();
    this.tunnelLayer.dispose();
    this.traceProbe.geometry.dispose();
    (this.traceProbe.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
