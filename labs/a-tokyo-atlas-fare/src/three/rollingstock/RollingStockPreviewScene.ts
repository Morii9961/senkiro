/**
 * SENKIRO Atlas v2 — Standalone 3D Rolling Stock Preview, Comparison & Curve Test Scene
 *
 * Self-contained Three.js scene controller (zero dependency on Metropolitan3DScene.ts)
 * for inspecting, animating, and capturing real WebGL screenshots of:
 *  1. JR East E235-0 Series (Yamanote Line)
 *  2. Tokyo Metro 1000 Series (Ginza Line)
 *  3. Tokyo Metro 17000 Series (Yurakucho & Fukutoshin Lines)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createShowcaseCurveSpline3D,
  type IndexedTrackSpline3D,
} from './domain/articulation.js';
import { LIST_ROLLING_STOCK_SPECS } from './domain/specs.js';
import type {
  DoorSide,
  RollingStockLodLevel,
  RollingStockSeriesId,
  TravelDirection,
} from './domain/types.js';
import { SkyEnvironmentSystem } from '../environment/skyEnvironment.js';
import { serializeObject3DToGlb } from './glbExporterAndCache.js';
import {
  createTrainConsist,
  type TrainConsistInstance,
} from './RollingStockFactory.js';

export type PreviewShowcaseMode = 'all_comparison' | 'single_focus';
export type PreviewTrackKind = 'straight' | 's_curve' | 'oval_loop';
export type PreviewCameraPreset =
  | 'lineup_front'
  | 'lineup_side'
  | 'lineup_far'
  | 'cab_closeup'
  | 'door_side'
  | 'roof_panto'
  | 'rear_tail'
  | 'curve_overview';

export interface PreviewSceneTelemetry {
  readonly fps: number;
  readonly drawCalls: number;
  readonly renderedTriangles: number;
  readonly showcaseMode: PreviewShowcaseMode;
  readonly activeSeriesId: RollingStockSeriesId;
  readonly activeLod: RollingStockLodLevel;
  readonly lodMode: RollingStockLodLevel | 'auto';
  readonly carCount: number;
  readonly totalConsistLengthM: number;
  readonly travelDirection: TravelDirection;
  readonly leftDoorProgress: number;
  readonly rightDoorProgress: number;
  readonly headlightsOn: boolean;
  readonly taillightsOn: boolean;
  readonly interiorLightsOn: boolean;
  readonly trackKind: PreviewTrackKind;
  readonly running: boolean;
  readonly speedKmh: number;
  readonly headDistanceM: number;
  readonly lodTrianglesByTier: Record<RollingStockLodLevel, number>;
}

const PARALLEL_TRACK_Z: Record<RollingStockSeriesId, number> = {
  'jr-east-e235-0': -9.5,
  'tokyo-metro-1000': 0,
  'tokyo-metro-17000': 9.5,
};

export class RollingStockPreviewScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly skyEnv: SkyEnvironmentSystem;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly rimLight: THREE.DirectionalLight;

  private readonly trackEnvGroup = new THREE.Group();
  private readonly consistsGroup = new THREE.Group();

  private readonly comparisonConsists = new Map<RollingStockSeriesId, TrainConsistInstance>();
  private singleConsist: TrainConsistInstance | null = null;
  private activeSpline: IndexedTrackSpline3D = createShowcaseCurveSpline3D('s_curve', 0, 0);

  private showcaseMode: PreviewShowcaseMode = 'all_comparison';
  private activeSeriesId: RollingStockSeriesId = 'jr-east-e235-0';
  private singleCarCount = 4;
  private trackKind: PreviewTrackKind = 's_curve';
  private lodMode: RollingStockLodLevel | 'auto' = 'high';
  private travelDirection: TravelDirection = 'forward';
  private headlightsOn = true;
  private taillightsOn = true;
  private interiorLightsOn = false;
  private isNight = false;
  private running = false;
  private speedKmh = 55;
  private headDistanceM = 85;

  private rafId: number | null = null;
  private disposed = false;
  private lastFrameTime = performance.now();
  private frameTimesMs: number[] = [];
  private smoothedFps = 60;
  private readonly resizeObserver: ResizeObserver;
  private readonly onTelemetry?: (telemetry: PreviewSceneTelemetry) => void;

  constructor(
    container: HTMLElement,
    options?: {
      isNight?: boolean;
      onTelemetry?: (telemetry: PreviewSceneTelemetry) => void;
    },
  ) {
    this.container = container;
    this.isNight = options?.isNight ?? false;
    this.onTelemetry = options?.onTelemetry;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 760);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'rolling-stock-3d-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.skyEnv = new SkyEnvironmentSystem(this.renderer, this.scene, this.isNight);

    const aspect = (container.clientWidth || 1280) / Math.max(1, container.clientHeight || 760);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.4, 8000);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 2400;
    this.controls.minDistance = 2.2;

    this.hemiLight = new THREE.HemisphereLight(
      this.isNight ? 0x7da4cc : 0xe2effa,
      this.isNight ? 0x182230 : 0x8f887d,
      this.isNight ? 0.65 : 0.88,
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      this.isNight ? 0x9ec2f0 : 0xfff5e4,
      this.isNight ? 1.05 : 1.95,
    );
    this.sunLight.position.set(65, 95, 75);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 360;
    const sc = 95;
    this.sunLight.shadow.camera.left = -sc;
    this.sunLight.shadow.camera.right = sc;
    this.sunLight.shadow.camera.top = sc;
    this.sunLight.shadow.camera.bottom = -sc;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(
      this.isNight ? 0x38bdf8 : 0xcbd5e1,
      this.isNight ? 0.62 : 0.48,
    );
    this.rimLight.position.set(-70, 35, -65);
    this.scene.add(this.rimLight);

    this.scene.add(this.trackEnvGroup, this.consistsGroup);

    this.initComparisonConsists();
    this.rebuildTrackEnvironment();
    this.applyCameraPreset('lineup_front');

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.lastFrameTime = performance.now();
    this.animate();
  }

  private initComparisonConsists(): void {
    for (const spec of LIST_ROLLING_STOCK_SPECS) {
      const zTrack = PARALLEL_TRACK_Z[spec.seriesId];
      const consist = createTrainConsist({
        id: `comparison-${spec.seriesId}`,
        seriesId: spec.seriesId,
        carCount: 3,
        initialLod: 'high',
        lodMode: this.lodMode,
        travelDirection: this.travelDirection,
      });
      // Align all 3 front cab noses at x = +22m so side-by-side front comparison is razor-sharp!
      const totalLen = consist.cars.length * spec.dimensions.couplerLengthM;
      const centerX = 22 - totalLen * 0.5;
      consist.placeOnStraightTrack({ x: centerX, y: 0, z: zTrack }, 0);
      this.comparisonConsists.set(spec.seriesId, consist);
      this.consistsGroup.add(consist.group);
    }
  }

  private rebuildSingleConsist(): void {
    if (this.singleConsist) {
      this.consistsGroup.remove(this.singleConsist.group);
      this.singleConsist.dispose();
      this.singleConsist = null;
    }

    this.singleConsist = createTrainConsist({
      id: `single-${this.activeSeriesId}-${this.singleCarCount}`,
      seriesId: this.activeSeriesId,
      carCount: this.singleCarCount,
      initialLod: this.lodMode === 'auto' ? 'high' : this.lodMode,
      lodMode: this.lodMode,
      travelDirection: this.travelDirection,
      initialLights: {
        headlights: this.headlightsOn,
        taillights: this.taillightsOn,
        interiorLights: this.interiorLightsOn,
        destinationSign: true,
        brightness: 1.0,
      },
    });
    this.consistsGroup.add(this.singleConsist.group);
    this.positionSingleConsist();
  }

  private positionSingleConsist(): void {
    if (!this.singleConsist) return;
    this.activeSpline = createShowcaseCurveSpline3D(this.trackKind, 0, 0);
    const totalTrainLen =
      this.singleConsist.cars.length * this.singleConsist.spec.dimensions.couplerLengthM;
    if (!this.running) {
      // Center the consist near the middle of the spline
      this.headDistanceM = this.activeSpline.totalLengthM * 0.5 + totalTrainLen * 0.5;
    }
    this.singleConsist.placeAlongSpline(this.activeSpline, this.headDistanceM, 0);
  }

  private rebuildTrackEnvironment(): void {
    while (this.trackEnvGroup.children.length > 0) {
      const ch = this.trackEnvGroup.children.pop()!;
      if (ch instanceof THREE.Mesh) {
        ch.geometry?.dispose();
      }
    }

    // Ground apron slab
    const groundMat = new THREE.MeshStandardMaterial({
      color: this.isNight ? 0x18202c : 0xd4d0c8,
      roughness: 0.94,
      metalness: 0.04,
    });
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
    groundMesh.rotation.x = -Math.PI * 0.5;
    groundMesh.position.y = -0.58;
    groundMesh.receiveShadow = true;
    this.trackEnvGroup.add(groundMesh);

    const ballastMat = new THREE.MeshStandardMaterial({
      color: 0x6b665e,
      roughness: 0.92,
      metalness: 0.05,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8e2,
      roughness: 0.24,
      metalness: 0.88,
    });
    const thirdRailMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.4,
      metalness: 0.35,
    });

    if (this.showcaseMode === 'all_comparison') {
      // 3 parallel display tracks with accurate 1,067mm / 1,435mm gauge & third-rail conductor bar on track 2
      for (const spec of LIST_ROLLING_STOCK_SPECS) {
        const zCenter = PARALLEL_TRACK_Z[spec.seriesId];
        const halfG = spec.dimensions.trackGaugeM * 0.5;

        const bed = new THREE.Mesh(new THREE.BoxGeometry(220, 0.48, 4.4), ballastMat);
        bed.position.set(0, -0.32, zCenter);
        bed.receiveShadow = true;
        this.trackEnvGroup.add(bed);

        const railGeom = new THREE.BoxGeometry(220, 0.14, 0.08);
        for (const zSign of [-1, 1]) {
          const rail = new THREE.Mesh(railGeom, railMat);
          rail.position.set(0, -0.07, zCenter + zSign * halfG);
          this.trackEnvGroup.add(rail);
        }

        if (spec.electrification === 'third_rail_600v_dc') {
          // 600V DC Third-Rail protective yellow shroud alongside Ginza Line 1000 Series track!
          const tr = new THREE.Mesh(new THREE.BoxGeometry(220, 0.16, 0.14), thirdRailMat);
          tr.position.set(0, 0.08, zCenter + halfG + 0.36);
          this.trackEnvGroup.add(tr);
        }
      }
    } else {
      // Render 3D track beds & rails along `this.activeSpline`
      const spec = LIST_ROLLING_STOCK_SPECS.find((s) => s.seriesId === this.activeSeriesId)!;
      const halfG = spec.dimensions.trackGaugeM * 0.5;
      const pts = this.activeSpline.points;

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const segLen = Math.hypot(dx, dy, dz);
        if (segLen < 0.1) continue;

        const yaw = Math.atan2(-dz, dx);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1);
        const midX = (a.x + b.x) * 0.5;
        const midY = (a.y + b.y) * 0.5;
        const midZ = (a.z + b.z) * 0.5;

        const segGroup = new THREE.Group();
        segGroup.position.set(midX, midY, midZ);
        segGroup.rotation.order = 'YXZ';
        segGroup.rotation.y = yaw;
        segGroup.rotation.z = pitch;
        segGroup.rotation.x = ((a.cantRad ?? 0) + (b.cantRad ?? 0)) * 0.5;

        const bed = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.25, 0.48, 4.4), ballastMat);
        bed.position.set(0, -0.32, 0);
        bed.receiveShadow = true;
        segGroup.add(bed);

        const railGeom = new THREE.BoxGeometry(segLen + 0.25, 0.14, 0.08);
        for (const zSign of [-1, 1]) {
          const r = new THREE.Mesh(railGeom, railMat);
          r.position.set(0, -0.07, zSign * halfG);
          segGroup.add(r);
        }

        if (spec.electrification === 'third_rail_600v_dc') {
          const tr = new THREE.Mesh(
            new THREE.BoxGeometry(segLen + 0.25, 0.16, 0.14),
            thirdRailMat,
          );
          tr.position.set(0, 0.08, halfG + 0.36);
          segGroup.add(tr);
        }

        this.trackEnvGroup.add(segGroup);
      }
    }
  }

  setShowcaseMode(mode: PreviewShowcaseMode): void {
    if (this.showcaseMode === mode) return;
    this.showcaseMode = mode;

    if (mode === 'all_comparison') {
      if (this.singleConsist) {
        this.singleConsist.group.visible = false;
      }
      for (const c of this.comparisonConsists.values()) {
        c.group.visible = true;
      }
      this.rebuildTrackEnvironment();
      this.applyCameraPreset('lineup_front');
    } else {
      for (const c of this.comparisonConsists.values()) {
        c.group.visible = false;
      }
      this.rebuildSingleConsist();
      this.rebuildTrackEnvironment();
      this.applyCameraPreset('cab_closeup');
    }
    this.emitTelemetry();
  }

  setActiveSeries(seriesId: RollingStockSeriesId): void {
    this.activeSeriesId = seriesId;
    if (this.showcaseMode === 'single_focus') {
      this.rebuildSingleConsist();
      this.rebuildTrackEnvironment();
    }
    this.emitTelemetry();
  }

  setCarCount(count: number): void {
    this.singleCarCount = Math.max(1, Math.min(12, count));
    if (this.showcaseMode === 'single_focus') {
      this.rebuildSingleConsist();
    }
    this.emitTelemetry();
  }

  setTrackKind(kind: PreviewTrackKind): void {
    this.trackKind = kind;
    if (this.showcaseMode === 'single_focus') {
      this.positionSingleConsist();
      this.rebuildTrackEnvironment();
    }
    this.emitTelemetry();
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.emitTelemetry();
  }

  setSpeedKmh(speedKmh: number): void {
    this.speedKmh = Math.max(0, Math.min(160, speedKmh));
    this.emitTelemetry();
  }

  setDoorState(side: DoorSide, open: boolean | number, immediate = false): void {
    for (const c of this.getActiveConsists()) {
      c.setDoorState(side, open, immediate);
    }
    this.emitTelemetry();
  }

  setTravelDirection(direction: TravelDirection): void {
    this.travelDirection = direction;
    for (const c of this.getActiveConsists()) {
      c.setTravelDirection(direction);
    }
    this.emitTelemetry();
  }

  setLights(params: {
    headlights?: boolean;
    taillights?: boolean;
    interiorLights?: boolean;
  }): void {
    if (params.headlights !== undefined) this.headlightsOn = params.headlights;
    if (params.taillights !== undefined) this.taillightsOn = params.taillights;
    if (params.interiorLights !== undefined) this.interiorLightsOn = params.interiorLights;

    for (const c of this.getActiveConsists()) {
      c.setLights({
        headlights: this.headlightsOn,
        taillights: this.taillightsOn,
        interiorLights: this.interiorLightsOn,
      });
    }
    this.emitTelemetry();
  }

  setNightMode(isNight: boolean): void {
    this.isNight = isNight;
    this.skyEnv.applyToScene(this.scene, isNight);
    this.hemiLight.color.setHex(isNight ? 0x7da4cc : 0xe2effa);
    this.hemiLight.groundColor.setHex(isNight ? 0x182230 : 0x8f887d);
    this.hemiLight.intensity = isNight ? 0.65 : 0.88;
    this.sunLight.color.setHex(isNight ? 0x9ec2f0 : 0xfff5e4);
    this.sunLight.intensity = isNight ? 1.05 : 1.95;
    this.setLights({ interiorLights: isNight });
  }

  setLodMode(mode: RollingStockLodLevel | 'auto'): void {
    this.lodMode = mode;
    for (const c of this.getActiveConsists()) {
      c.setLodMode(mode);
    }
    this.emitTelemetry();
  }

  applyCameraPreset(preset: PreviewCameraPreset): void {
    if (preset === 'lineup_front') {
      this.camera.position.set(34, 6.2, 16);
      this.controls.target.set(17.5, 2.1, 0);
    } else if (preset === 'lineup_side') {
      this.camera.position.set(4, 11.5, 36);
      this.controls.target.set(2, 2.0, 0);
    } else if (preset === 'lineup_far') {
      // Far distance recognition verification (145m away looking across all 3 consists)
      this.camera.position.set(115, 48, 108);
      this.controls.target.set(0, 2.0, 0);
    } else {
      const targetConsist =
        this.showcaseMode === 'single_focus' && this.singleConsist
          ? this.singleConsist
          : (this.comparisonConsists.get(this.activeSeriesId) ??
            this.comparisonConsists.get('jr-east-e235-0')!);

      const leadCar = targetConsist.cars[0]!;
      const tailCar = targetConsist.cars[targetConsist.cars.length - 1]!;
      const midCar = targetConsist.cars[Math.floor(targetConsist.cars.length / 2)]!;

      const leadPose = leadCar.getLastPose();
      const tailPose = tailCar.getLastPose();
      const midPose = midCar.getLastPose();

      if (preset === 'cab_closeup' && leadPose) {
        const fx = leadPose.forward.x;
        const fz = leadPose.forward.z;
        const rx = -fz;
        const rz = fx;
        const noseX = leadPose.position.x + fx * 9.5;
        const noseZ = leadPose.position.z + fz * 9.5;
        this.camera.position.set(noseX + fx * 8.5 + rx * 6.2, leadPose.position.y + 3.2, noseZ + fz * 8.5 + rz * 6.2);
        this.controls.target.set(noseX - fx * 1.5, leadPose.position.y + 2.0, noseZ - fz * 1.5);
      } else if (preset === 'door_side' && leadPose) {
        const fx = leadPose.forward.x;
        const fz = leadPose.forward.z;
        const rx = -fz;
        const rz = fx;
        this.camera.position.set(
          leadPose.position.x + fx * 2.5 + rx * 9.5,
          leadPose.position.y + 2.4,
          leadPose.position.z + fz * 2.5 + rz * 9.5,
        );
        this.controls.target.set(leadPose.position.x, leadPose.position.y + 1.9, leadPose.position.z);
      } else if (preset === 'roof_panto' && midPose) {
        const fx = midPose.forward.x;
        const fz = midPose.forward.z;
        const rx = -fz;
        const rz = fx;
        this.camera.position.set(
          midPose.position.x - fx * 10 + rx * 11,
          midPose.position.y + 8.5,
          midPose.position.z - fz * 10 + rz * 11,
        );
        this.controls.target.set(midPose.position.x, midPose.position.y + 3.2, midPose.position.z);
      } else if (preset === 'rear_tail' && tailPose) {
        const fx = tailPose.forward.x;
        const fz = tailPose.forward.z;
        const rx = -fz;
        const rz = fx;
        const tailX = tailPose.position.x - fx * 9.5;
        const tailZ = tailPose.position.z - fz * 9.5;
        this.camera.position.set(
          tailX - fx * 8.5 + rx * 6.2,
          tailPose.position.y + 3.2,
          tailZ - fz * 8.5 + rz * 6.2,
        );
        this.controls.target.set(tailX + fx * 1.5, tailPose.position.y + 2.0, tailZ + fz * 1.5);
      } else if (midPose) {
        // curve_overview
        this.camera.position.set(midPose.position.x + 36, midPose.position.y + 24, midPose.position.z + 52);
        this.controls.target.set(midPose.position.x, midPose.position.y + 2.0, midPose.position.z);
      }
    }

    this.controls.update();
    this.emitTelemetry();
  }

  /**
   * Exports the active train consist (at its current LOD) to a binary `.glb` buffer.
   */
  exportActiveConsistGlb(): Uint8Array {
    const target =
      this.showcaseMode === 'single_focus' && this.singleConsist
        ? this.singleConsist
        : this.comparisonConsists.get(this.activeSeriesId)!;
    return serializeObject3DToGlb(target.group, { includeOnlyVisible: true });
  }

  private getActiveConsists(): TrainConsistInstance[] {
    if (this.showcaseMode === 'single_focus' && this.singleConsist) {
      return [this.singleConsist];
    }
    return [...this.comparisonConsists.values()];
  }

  getPrimaryConsist(): TrainConsistInstance {
    if (this.showcaseMode === 'single_focus' && this.singleConsist) {
      return this.singleConsist;
    }
    return (
      this.comparisonConsists.get(this.activeSeriesId) ??
      this.comparisonConsists.get('jr-east-e235-0')!
    );
  }

  private emitTelemetry(): void {
    const primary = this.getPrimaryConsist();
    const perf = primary.getPerformanceMetrics();
    const anim = primary.getAnimationState();

    let totalRenderedTris = 0;
    for (const c of this.getActiveConsists()) {
      totalRenderedTris += c.getPerformanceMetrics().totalTriangles;
    }

    const telemetry: PreviewSceneTelemetry = {
      fps: this.smoothedFps,
      drawCalls: this.renderer.info.render.calls,
      renderedTriangles: totalRenderedTris,
      showcaseMode: this.showcaseMode,
      activeSeriesId: this.activeSeriesId,
      activeLod: perf.activeLod,
      lodMode: this.lodMode,
      carCount: perf.carCount,
      totalConsistLengthM: perf.totalLengthM,
      travelDirection: anim.travelDirection,
      leftDoorProgress: Math.round(anim.doors.leftCurrent * 100) / 100,
      rightDoorProgress: Math.round(anim.doors.rightCurrent * 100) / 100,
      headlightsOn: anim.lights.headlights,
      taillightsOn: anim.lights.taillights,
      interiorLightsOn: anim.lights.interiorLights,
      trackKind: this.trackKind,
      running: this.running,
      speedKmh: this.speedKmh,
      headDistanceM: Math.round(this.headDistanceM * 10) / 10,
      lodTrianglesByTier: perf.lodTrianglesByTier,
    };

    (
      window as unknown as { __SENKIRO_ROLLING_STOCK_TELEMETRY__?: PreviewSceneTelemetry }
    ).__SENKIRO_ROLLING_STOCK_TELEMETRY__ = telemetry;

    this.onTelemetry?.(telemetry);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
      if (this.frameTimesMs.length > 20) this.frameTimesMs.shift();
      const avg = this.frameTimesMs.reduce((a, b) => a + b, 0) / this.frameTimesMs.length;
      this.smoothedFps = Math.round(1000 / Math.max(1, avg));
    }

    let distanceDeltaM = 0;
    if (this.showcaseMode === 'single_focus' && this.running && this.singleConsist) {
      const speedMps = this.speedKmh / 3.6;
      const dirSign = this.travelDirection === 'forward' ? 1 : -1;
      distanceDeltaM = speedMps * dtSec;
      this.headDistanceM += distanceDeltaM * dirSign;

      if (this.activeSpline.closedLoop) {
        const tot = this.activeSpline.totalLengthM;
        this.headDistanceM = ((this.headDistanceM % tot) + tot) % tot;
      } else {
        const minD = 30;
        const maxD = this.activeSpline.totalLengthM - 10;
        if (this.headDistanceM > maxD) this.headDistanceM = minD;
        if (this.headDistanceM < minD) this.headDistanceM = maxD;
      }
      this.singleConsist.placeAlongSpline(this.activeSpline, this.headDistanceM, 0);
    }

    const camPos = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };

    for (const c of this.getActiveConsists()) {
      c.update(dtSec, {
        cameraPosition: camPos,
        distanceDeltaM: this.running ? distanceDeltaM : 0,
      });
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.emitTelemetry();
  };

  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const c of this.comparisonConsists.values()) {
      c.dispose();
    }
    this.singleConsist?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
