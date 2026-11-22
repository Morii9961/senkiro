/**
 * SENKIRO Atlas v2 — Unified 5-Mode Human-Centered 3D Camera Controller.
 *
 * Desktop-first consistent controls:
 *  - Left Click (< 6px): Select Station / Rail Line / Simulated Train
 *  - Left Drag (Map modes): Continuous ground-plane Pan (consistent with 2D MapLibre!)
 *  - Middle / Right Drag: Smooth Orbit rotation or Free Look yaw/pitch
 *  - Wheel: Smooth damped Zoom (Map/Street/Cutaway) · Move along tunnel (Explorer) · Follow distance (Train Follow)
 *  - Double-Click: Raycast & smoothly fly focus onto target
 *  - Explicit Free Look toggle ('F' or HUD button): Left/Mid drag look + WASD/QE collision-guarded flight
 *  - Safe Escape / Return to Surface / Reset Overview transitions across all 5 modes!
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  getCameraModeCapabilities,
  type CameraModeCapabilities,
  type CameraModeState,
  type TrainFollowAngle,
} from '../domain/cameraModeStateMachine.js';
import {
  classifyTier,
  type SolvedPoint3D,
  type SolvedRailwayNetwork3D,
  type SolvedSegment3D,
} from '../domain/elevationSolver.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import type {
  CameraOrientationInfo,
  UndergroundExplorerLocation,
} from './types.js';
import type {
  EnvironmentCollisionProvider,
  TrainSimulationState,
} from './uxContracts.js';

interface CameraAnim {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  durationMs: number;
}

interface TunnelCorridor {
  lineId: SkId<'line'>;
  lineNameJa: string;
  lineNameEn: string;
  color: string;
  points: SolvedPoint3D[];
  totalDist: number;
  stations: {
    dist: number;
    stationId: SkId<'station'>;
    nameJa: string;
    nameEn: string;
  }[];
}

const SPEED_MPS = {
  slow: 90,
  normal: 240,
  fast: 680,
} as const;

const TUNNEL_SPEED_MPS = {
  slow: 18,
  normal: 44,
  fast: 96,
} as const;

const STREET_SPEED_MPS = {
  slow: 22,
  normal: 54,
  fast: 120,
} as const;

const MAX_EXTENT_XZ = 26_000;
const MAX_ALTITUDE = 15_500;

function headingToCardinal(deg: number): CameraOrientationInfo['cardinal'] {
  const dirs: CameraOrientationInfo['cardinal'][] = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8]!;
}

export class SpatialCameraController {
  readonly controls: OrbitControls;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly onCameraMoved?: () => void;
  private readonly collisionProvider?: EnvironmentCollisionProvider;
  private readonly tunnelCorridors: TunnelCorridor[] = [];

  private modeState: CameraModeState;
  private capabilities: CameraModeCapabilities;
  private anim: CameraAnim | null = null;

  // Free Look / Explorer orientation (YXZ Euler: yaw around Y, pitch around X)
  private yaw = 0;
  private pitch = -0.35;
  private readonly pressedKeys = new Set<string>();
  private draggingLook = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private readonly focusProxy = new THREE.Vector3();

  // Underground Explorer tunnel-constrained cursor
  private activeTunnel: TunnelCorridor | null = null;
  private tunnelDistAlong = 0;
  private tunnelLateralM = 0;
  private tunnelHeadHeightM = 2.6;

  // Train Follow smooth curve damping state
  private followedTrainSnapId: string | null = null;
  private followedAngleSnap: TrainFollowAngle | null = null;
  private smoothedTrainPos = new THREE.Vector3();
  private smoothedTrainDir = new THREE.Vector3(0, 0, -1);
  private followScale = 1.0;
  private followYawOffset = 0;
  private followPitchOffset = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    initialModeState: CameraModeState,
    dataset: AtlasDataset,
    solved: SolvedRailwayNetwork3D,
    collisionProvider?: EnvironmentCollisionProvider,
    onCameraMoved?: () => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.modeState = initialModeState;
    this.capabilities = getCameraModeCapabilities(initialModeState, false);
    this.collisionProvider = collisionProvider;
    this.onCameraMoved = onCameraMoved;

    this.buildTunnelCorridors(dataset, solved);

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.screenSpacePanning = false; // Strict horizontal ground-plane pan!
    this.controls.minDistance = this.capabilities.minDistance;
    this.controls.maxDistance = this.capabilities.maxDistance;
    this.controls.minPolarAngle = this.capabilities.minPolarRad;
    this.controls.maxPolarAngle = this.capabilities.maxPolarRad;
    this.controls.zoomSpeed = 1.05;
    this.controls.rotateSpeed = 0.72;
    this.controls.panSpeed = 1.05;

    // Desktop-first consistent mapping:
    // Left-drag = Ground Pan (consistent with 2D MapLibre!)
    // Middle-drag = Orbit / Free rotation
    // Right-drag = Orbit / Tilt (consistent with 2D MapLibre!)
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    this.controls.addEventListener('end', this.handleControlsEnd);
    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    this.domElement.addEventListener('auxclick', this.handleAuxClick);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private buildTunnelCorridors(dataset: AtlasDataset, solved: SolvedRailwayNetwork3D): void {
    const stMap = new Map(dataset.stations.map((s) => [s.id, s]));
    const segsByPair = new Map<string, { seg: SolvedSegment3D; reversed: boolean }>();
    for (const seg of solved.segments) {
      for (const lid of seg.railLineIds) {
        segsByPair.set(`${lid}::${seg.fromStationId}::${seg.toStationId}`, {
          seg,
          reversed: false,
        });
        segsByPair.set(`${lid}::${seg.toStationId}::${seg.fromStationId}`, {
          seg,
          reversed: true,
        });
      }
    }

    for (const line of dataset.railLines) {
      if (line.stationIds.length < 2) continue;
      // Stitch continuous underground runs along this line
      let currentPts: SolvedPoint3D[] = [];
      let currentStations: TunnelCorridor['stations'] = [];
      let accum = 0;

      const flushRun = () => {
        if (currentPts.length >= 2 && accum > 60) {
          this.tunnelCorridors.push({
            lineId: line.id,
            lineNameJa: line.names.ja ?? line.id,
            lineNameEn: line.names.en ?? line.names.ja ?? line.id,
            color: line.color,
            points: currentPts,
            totalDist: accum,
            stations: currentStations,
          });
        }
        currentPts = [];
        currentStations = [];
        accum = 0;
      };

      for (let i = 0; i < line.stationIds.length - 1; i++) {
        const a = line.stationIds[i]!;
        const b = line.stationIds[i + 1]!;
        const hit = segsByPair.get(`${line.id}::${a}::${b}`);
        if (!hit) {
          flushRun();
          continue;
        }
        const rawPts = hit.reversed ? [...hit.seg.points].reverse() : hit.seg.points;
        const ugPts = rawPts.filter((p) => p.y < -2.2);
        if (ugPts.length < 2) {
          flushRun();
          continue;
        }

        const sa = stMap.get(a);
        const sb = stMap.get(b);
        if (currentPts.length === 0 && rawPts[0]!.y < -2.2 && sa) {
          currentStations.push({
            dist: 0,
            stationId: a,
            nameJa: sa.names.ja ?? a,
            nameEn: sa.names.en ?? sa.names.ja ?? a,
          });
        }

        for (const pt of ugPts) {
          if (currentPts.length > 0) {
            const prev = currentPts[currentPts.length - 1]!;
            const step = Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
            if (step < 0.5) continue;
            accum += step;
          }
          currentPts.push({ ...pt, distFromStart: accum });
        }

        if (rawPts[rawPts.length - 1]!.y < -2.2 && sb) {
          currentStations.push({
            dist: accum,
            stationId: b,
            nameJa: sb.names.ja ?? b,
            nameEn: sb.names.en ?? sb.names.ja ?? b,
          });
        }
      }
      flushRun();
    }
  }

  getModeState(): CameraModeState {
    return this.modeState;
  }

  getCapabilities(): CameraModeCapabilities {
    return this.capabilities;
  }

  /**
   * Synchronizes the spatial controller whenever the state machine changes mode or cutaway bounds.
   */
  applyModeState(
    nextState: CameraModeState,
    followedTrain: TrainSimulationState | null,
    selectedLineId: SkId<'line'> | null,
    selectedStationId: SkId<'station'> | null,
  ): void {
    const prevMode = this.modeState.mode;
    const prevFree = this.modeState.freeLookEnabled;
    const prevAngle = this.modeState.followAngle;
    const prevTrainId = this.modeState.followedTrainId;

    this.modeState = nextState;
    this.capabilities = getCameraModeCapabilities(
      nextState,
      Boolean(followedTrain?.isUnderground),
    );

    this.controls.minDistance = this.capabilities.minDistance;
    this.controls.maxDistance = this.capabilities.maxDistance;
    this.controls.minPolarAngle = this.capabilities.minPolarRad;
    this.controls.maxPolarAngle = this.capabilities.maxPolarRad;

    const modeChanged = prevMode !== nextState.mode;
    const freeChanged = prevFree !== nextState.freeLookEnabled;

    if (nextState.mode === 'train_follow') {
      this.controls.enabled = false;
      this.anim = null;
      this.pressedKeys.clear();
      if (
        modeChanged ||
        prevTrainId !== nextState.followedTrainId ||
        prevAngle !== nextState.followAngle
      ) {
        this.followYawOffset = 0;
        this.followPitchOffset = 0;
        if (prevTrainId !== nextState.followedTrainId) {
          this.followedTrainSnapId = null;
        }
        this.followedAngleSnap = null;
      }
      return;
    }

    if (nextState.mode === 'underground_explorer') {
      this.controls.enabled = false;
      if (modeChanged) {
        this.enterUndergroundExplorer(selectedLineId, selectedStationId);
      }
      return;
    }

    // Returning from underground_explorer to surface/cutaway: smoothly lift camera out above ground!
    if (prevMode === 'underground_explorer') {
      const target = this.activeTunnel
        ? this.sampleTunnelPoint(this.activeTunnel, this.tunnelDistAlong)
        : this.getFocusTarget();
      const surfaceTarget = new THREE.Vector3(target.x, 0, target.z);
      const dist = nextState.mode === 'street_level' ? 140 : 1200;
      const polar = nextState.mode === 'street_level' ? 76 : 56;
      this.controls.enabled = !nextState.freeLookEnabled;
      this.animateTo(surfaceTarget, dist, polar, -24, 650);
      return;
    }

    if (modeChanged && nextState.mode === 'street_level') {
      const focus = this.getFocusTarget().clone();
      focus.y = 1.5;
      const safeTarget = this.collisionProvider
        ? this.collisionProvider.resolveCameraPosition(focus, 8, false, 1.5)
        : focus;
      this.animateTo(
        new THREE.Vector3(safeTarget.x, 1.5, safeTarget.z),
        135,
        78,
        this.getCurrentAzimuthDeg(),
        450,
      );
    }

    if (modeChanged && nextState.mode === 'city_overview' && prevMode === 'street_level') {
      const focus = this.getFocusTarget().clone();
      focus.y = 0;
      this.animateTo(focus, 1350, 54, this.getCurrentAzimuthDeg(), 620);
    }

    if (nextState.freeLookEnabled) {
      if (freeChanged || modeChanged) {
        this.syncFreeEulerFromCamera();
      }
      this.controls.enabled = false;
    } else {
      if (freeChanged || modeChanged) {
        this.syncOrbitTargetFromCamera();
      }
      this.controls.enabled = true;
      this.controls.update();
    }
  }

  private getCurrentAzimuthDeg(): number {
    const focus = this.getFocusTarget();
    const dx = this.camera.position.x - focus.x;
    const dz = this.camera.position.z - focus.z;
    return THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
  }

  private syncFreeEulerFromCamera(): void {
    if (this.controls.enabled) {
      this.camera.lookAt(this.controls.target);
    }
    const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(
      this.camera.quaternion,
      'YXZ',
    );
    this.yaw = euler.y;
    this.pitch = THREE.MathUtils.clamp(euler.x, -Math.PI * 0.45, Math.PI * 0.45);
  }

  private syncOrbitTargetFromCamera(): void {
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    let tDist = this.modeState.mode === 'street_level' ? 120 : 650;
    if (forward.y < -0.06 && this.camera.position.y > 0) {
      tDist = THREE.MathUtils.clamp(
        -this.camera.position.y / forward.y,
        this.capabilities.minDistance,
        Math.min(5200, this.capabilities.maxDistance),
      );
    }
    this.controls.target.copy(this.camera.position).addScaledVector(forward, tDist);
    this.clampTarget();
  }

  /**
   * Enters Underground Explorer inside the closest or selected underground tunnel corridor.
   */
  enterUndergroundExplorer(
    preferredLineId: SkId<'line'> | null = null,
    preferredStationId: SkId<'station'> | null = null,
  ): boolean {
    if (this.tunnelCorridors.length === 0) return false;
    const focus = this.getFocusTarget();

    let bestCorridor: TunnelCorridor | null = null;
    let bestDistIdx = 0;
    let bestScore = Infinity;

    for (const c of this.tunnelCorridors) {
      // Priority match: exact station or line
      if (preferredStationId) {
        const stHit = c.stations.find((s) => s.stationId === preferredStationId);
        if (stHit) {
          bestCorridor = c;
          bestDistIdx = this.findNearestPointIndex(c.points, stHit.dist);
          break;
        }
      }

      for (let i = 0; i < c.points.length; i++) {
        const pt = c.points[i]!;
        let d = Math.hypot(pt.x - focus.x, pt.z - focus.z);
        if (preferredLineId && c.lineId === preferredLineId) {
          d *= 0.15;
        }
        if (d < bestScore) {
          bestScore = d;
          bestCorridor = c;
          bestDistIdx = i;
        }
      }
    }

    if (!bestCorridor) return false;
    this.activeTunnel = bestCorridor;
    const margin = Math.min(48, bestCorridor.totalDist * 0.25);
    this.tunnelDistAlong = THREE.MathUtils.clamp(
      bestCorridor.points[bestDistIdx]!.distFromStart,
      margin,
      Math.max(margin, bestCorridor.totalDist - margin),
    );
    this.tunnelLateralM = 0.0;
    this.tunnelHeadHeightM = 2.6;

    const pt = this.sampleTunnelPoint(bestCorridor, this.tunnelDistAlong);
    const tan = this.sampleTunnelTangent(bestCorridor, this.tunnelDistAlong);
    // Face inward along the open tunnel corridor rather than into a terminus dead-end!
    const faceSign = this.tunnelDistAlong > bestCorridor.totalDist * 0.65 ? -1 : 1;

    const endPos = new THREE.Vector3(pt.x, pt.y + this.tunnelHeadHeightM, pt.z);
    const endTarget = new THREE.Vector3(
      pt.x + tan.x * 48 * faceSign,
      pt.y + this.tunnelHeadHeightM + tan.y * 24 * faceSign,
      pt.z + tan.z * 48 * faceSign,
    );

    // Compute exact yaw/pitch facing down the tunnel bore
    const lookVec = new THREE.Vector3().subVectors(endTarget, endPos).normalize();
    this.yaw = Math.atan2(-lookVec.x, -lookVec.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(lookVec.y, -0.75, 0.75));

    this.anim = {
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.getFocusTarget().clone(),
      endTarget,
      startTime: performance.now(),
      durationMs: 680,
    };
    this.onCameraMoved?.();
    return true;
  }

  jumpToTunnelLine(lineId: SkId<'line'>): boolean {
    return this.enterUndergroundExplorer(lineId, null);
  }

  private findNearestPointIndex(points: SolvedPoint3D[], dist: number): number {
    let bestIdx = 0;
    let bestErr = Infinity;
    for (let i = 0; i < points.length; i++) {
      const err = Math.abs(points[i]!.distFromStart - dist);
      if (err < bestErr) {
        bestErr = err;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private sampleTunnelPoint(c: TunnelCorridor, dist: number): THREE.Vector3 {
    const pts = c.points;
    if (dist <= 0) return new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z);
    const last = pts[pts.length - 1]!;
    if (dist >= last.distFromStart) return new THREE.Vector3(last.x, last.y, last.z);

    let lo = 0;
    let hi = pts.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]!.distFromStart <= dist) lo = mid;
      else hi = mid;
    }
    const p0 = pts[lo]!;
    const p1 = pts[hi]!;
    const span = Math.max(0.01, p1.distFromStart - p0.distFromStart);
    const f = Math.max(0, Math.min(1, (dist - p0.distFromStart) / span));
    return new THREE.Vector3(
      p0.x + (p1.x - p0.x) * f,
      p0.y + (p1.y - p0.y) * f,
      p0.z + (p1.z - p0.z) * f,
    );
  }

  private sampleTunnelTangent(c: TunnelCorridor, dist: number): THREE.Vector3 {
    const d0 = Math.max(0, dist - 14);
    const d1 = Math.min(c.totalDist, dist + 14);
    const p0 = this.sampleTunnelPoint(c, d0);
    const p1 = this.sampleTunnelPoint(c, d1);
    const dir = new THREE.Vector3().subVectors(p1, p0);
    if (dir.lengthSq() < 0.001) return new THREE.Vector3(0, 0, -1);
    return dir.normalize();
  }

  getExplorerLocation(): UndergroundExplorerLocation | null {
    if (this.modeState.mode !== 'underground_explorer' || !this.activeTunnel) {
      return null;
    }
    const c = this.activeTunnel;
    const pt = this.sampleTunnelPoint(c, this.tunnelDistAlong);

    let nearestSt = c.stations[0] ?? null;
    let minStDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < c.stations.length; i++) {
      const st = c.stations[i]!;
      const d = Math.abs(st.dist - this.tunnelDistAlong);
      if (d < minStDist) {
        minStDist = d;
        nearestSt = st;
        nearestIdx = i;
      }
    }
    const nextSt = c.stations[Math.min(c.stations.length - 1, nearestIdx + 1)] ?? null;

    // Discover nearby crossing underground corridors within 260m horizontally
    const nearbyIds = new Set<SkId<'line'>>();
    for (const other of this.tunnelCorridors) {
      if (other.lineId === c.lineId) continue;
      for (let i = 0; i < other.points.length; i += 2) {
        const op = other.points[i]!;
        if (Math.hypot(op.x - pt.x, op.z - pt.z) < 260) {
          nearbyIds.add(other.lineId);
          break;
        }
      }
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const headingDeg =
      ((Math.atan2(forward.x, -forward.z) * 180) / Math.PI + 360) % 360;

    return {
      lineId: c.lineId,
      lineNameJa: c.lineNameJa,
      lineNameEn: c.lineNameEn,
      lineColor: c.color,
      tier: classifyTier(pt.y),
      trackY: Math.round(pt.y * 10) / 10,
      nearestStationId: nearestSt?.stationId ?? null,
      nearestStationJa: nearestSt?.nameJa ?? null,
      nearestStationEn: nearestSt?.nameEn ?? null,
      nextStationJa: nextSt && nextSt.stationId !== nearestSt?.stationId ? nextSt.nameJa : null,
      distanceToNearestM: Number.isFinite(minStDist) ? Math.round(minStDist) : 0,
      headingDeg: Math.round(headingDeg),
      progress01: Math.max(0, Math.min(1, this.tunnelDistAlong / Math.max(1, c.totalDist))),
      nearbyLineIds: Array.from(nearbyIds).slice(0, 5),
    };
  }

  getOrientationInfo(): CameraOrientationInfo {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const headingDeg = Math.round(
      ((Math.atan2(forward.x, -forward.z) * 180) / Math.PI + 360) % 360,
    );
    return {
      headingDeg,
      cardinal: headingToCardinal(headingDeg),
      altitudeM: Math.round(this.camera.position.y * 10) / 10,
      distanceToFocusM: Math.round(this.getDistanceToFocus()),
      nearestAnchor: this.collisionProvider
        ? this.collisionProvider.describeNearestAnchor({
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
          })
        : null,
    };
  }

  getFocusTarget(): THREE.Vector3 {
    if (this.modeState.mode === 'train_follow') {
      return this.smoothedTrainPos;
    }
    if (this.controls.enabled) {
      return this.controls.target;
    }
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    const dist =
      forward.y < -0.08 && this.camera.position.y > 0
        ? THREE.MathUtils.clamp(-this.camera.position.y / forward.y, 120, 2400)
        : this.modeState.mode === 'underground_explorer'
          ? 60
          : 420;
    this.focusProxy.copy(this.camera.position).addScaledVector(forward, dist);
    this.focusProxy.y = Math.max(-55, Math.min(220, this.focusProxy.y));
    return this.focusProxy;
  }

  getDistanceToFocus(): number {
    return this.camera.position.distanceTo(this.getFocusTarget());
  }

  cancelAnimation(): void {
    this.anim = null;
  }

  sphericalToPos(
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

  jumpTo(target: THREE.Vector3, distance: number, polarDeg: number, azimuthDeg: number): void {
    this.anim = null;
    const pos = this.sphericalToPos(target, distance, polarDeg, azimuthDeg);
    this.controls.target.copy(target);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    this.syncFreeEulerFromCamera();
    if (this.controls.enabled) {
      this.controls.update();
    }
  }

  animateTo(
    endTarget: THREE.Vector3,
    distance: number,
    polarDeg: number,
    azimuthDeg: number,
    durationMs = 680,
  ): void {
    const clampedDist = THREE.MathUtils.clamp(
      distance,
      this.capabilities.minDistance,
      this.capabilities.maxDistance,
    );
    const clampedPolar = THREE.MathUtils.clamp(
      polarDeg,
      THREE.MathUtils.radToDeg(this.capabilities.minPolarRad),
      THREE.MathUtils.radToDeg(this.capabilities.maxPolarRad),
    );
    let endPos = this.sphericalToPos(endTarget, clampedDist, clampedPolar, azimuthDeg);
    if (this.collisionProvider && this.modeState.mode === 'street_level') {
      const safe = this.collisionProvider.resolveCameraPosition(
        endPos,
        5,
        false,
        this.capabilities.minCameraY,
      );
      endPos = new THREE.Vector3(safe.x, safe.y, safe.z);
    }
    this.anim = {
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.getFocusTarget().clone(),
      endTarget: endTarget.clone(),
      startTime: performance.now(),
      durationMs,
    };
  }

  focusWorldPoint(point: THREE.Vector3, durationMs = 620): void {
    if (this.modeState.mode === 'underground_explorer') {
      this.enterUndergroundExplorer(null, null);
      return;
    }
    const curTarget = this.getFocusTarget();
    const offset = new THREE.Vector3().subVectors(this.camera.position, curTarget);
    const curDist = offset.length();
    const minD = this.modeState.mode === 'street_level' ? 45 : 220;
    const maxD = this.modeState.mode === 'street_level' ? 240 : 1400;
    const nextDist = THREE.MathUtils.clamp(curDist * 0.52, minD, maxD);
    if (curDist > 1) {
      offset.multiplyScalar(nextDist / curDist);
    } else {
      offset.set(0, nextDist * 0.65, nextDist * 0.75);
    }
    let endPos = point.clone().add(offset);
    endPos.y = Math.max(this.capabilities.minCameraY, endPos.y);
    if (this.collisionProvider && this.capabilities.isSurface) {
      const safe = this.collisionProvider.resolveCameraPosition(
        endPos,
        4.5,
        false,
        this.capabilities.minCameraY,
      );
      endPos = new THREE.Vector3(safe.x, safe.y, safe.z);
    }

    this.anim = {
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: curTarget.clone(),
      endTarget: point.clone(),
      startTime: performance.now(),
      durationMs,
    };
  }

  /**
   * Frame tick: executes active animation, Train Follow smooth rig, Underground Explorer tunnel navigation,
   * Free Look collision-guarded flight, or damped OrbitControls.
   */
  update(now: number, dtSec: number, followedTrain: TrainSimulationState | null): void {
    if (this.anim) {
      const elapsed = (now - this.anim.startTime) / this.anim.durationMs;
      if (elapsed >= 1) {
        this.camera.position.copy(this.anim.endPos);
        this.controls.target.copy(this.anim.endTarget);
        this.camera.lookAt(this.anim.endTarget);
        this.syncFreeEulerFromCamera();
        this.anim = null;
        this.onCameraMoved?.();
      } else {
        const ease = elapsed * elapsed * (3 - 2 * elapsed);
        this.camera.position.lerpVectors(this.anim.startPos, this.anim.endPos, ease);
        this.controls.target.lerpVectors(this.anim.startTarget, this.anim.endTarget, ease);
        this.camera.lookAt(this.controls.target);
        this.syncFreeEulerFromCamera();
      }
      if (this.controls.enabled) this.controls.update();
      return;
    }

    if (this.modeState.mode === 'train_follow' && followedTrain) {
      this.updateTrainFollow(dtSec, followedTrain);
      return;
    }

    if (this.modeState.mode === 'underground_explorer') {
      this.updateUndergroundExplorer(dtSec);
      return;
    }

    if (this.modeState.freeLookEnabled) {
      this.updateFreeLook(dtSec);
      return;
    }

    // Standard damped OrbitControls (city_overview, street_level, underground_cutaway)
    const dist = this.camera.position.distanceTo(this.controls.target);
    const speedFactor = this.modeState.mode === 'street_level' ? 0.55 : 1.0;
    this.controls.panSpeed = THREE.MathUtils.clamp(0.75 + dist / 4200, 0.75, 2.2) * speedFactor;
    this.controls.update();
    this.clampTarget();
    this.clampCameraBounds();
  }

  private updateTrainFollow(dtSec: number, tr: TrainSimulationState): void {
    const rawPos = new THREE.Vector3(tr.position.x, tr.position.y + 2.0, tr.position.z);
    const rawDir = new THREE.Vector3(tr.tangent.x, tr.tangent.y, tr.tangent.z).normalize();

    const firstSnap =
      this.followedTrainSnapId !== tr.id || this.followedAngleSnap !== this.modeState.followAngle;

    if (firstSnap) {
      this.followedTrainSnapId = tr.id;
      this.followedAngleSnap = this.modeState.followAngle;
      this.smoothedTrainPos.copy(rawPos);
      this.smoothedTrainDir.copy(rawDir);
    } else {
      // Exponential curve damping keeps bends glassy-smooth at any FPS
      const posAlpha = 1 - Math.exp(-11.0 * dtSec);
      const dirAlpha = 1 - Math.exp(-4.2 * dtSec);
      this.smoothedTrainPos.lerp(rawPos, posAlpha);
      this.smoothedTrainDir.lerp(rawDir, dirAlpha).normalize();
    }

    const F = this.smoothedTrainDir.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const R = new THREE.Vector3().crossVectors(F, up);
    if (R.lengthSq() < 1e-4) R.set(1, 0, 0);
    else R.normalize();

    const angle = this.modeState.followAngle;
    const scale = this.followScale;
    const isUg = tr.isUnderground;

    const desiredEye = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (angle === 'cab') {
      // Inside front driver's cab looking ahead down the track / through tunnel portals
      desiredEye.copy(this.smoothedTrainPos).addScaledVector(F, 11.8);
      desiredEye.y = this.smoothedTrainPos.y + 1.55;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, 92);
      desiredLook.y = this.smoothedTrainPos.y + 1.2 + F.y * 40;
    } else if (angle === 'front') {
      const fwdDist = (isUg ? 21 : 34) * scale;
      const latDist = (isUg ? 1.25 : 10) * scale;
      const upDist = (isUg ? 1.55 : 13) * scale;
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(F, fwdDist)
        .addScaledVector(R, latDist);
      desiredEye.y = this.smoothedTrainPos.y + upDist;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, 4);
      desiredLook.y += 1.0;
    } else if (angle === 'rear') {
      const backDist = (isUg ? 21 : 34) * scale;
      const latDist = (isUg ? 1.1 : 9) * scale;
      const upDist = (isUg ? 1.65 : 12) * scale;
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(F, -backDist)
        .addScaledVector(R, latDist);
      desiredEye.y = this.smoothedTrainPos.y + upDist;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, 26);
      desiredLook.y += 1.2;
    } else {
      // 'side' view: perpendicular elevated view (in cutaway if underground!)
      const sideDist = (isUg ? 44 : 38) * scale;
      const upDist = (isUg ? 24 : 16) * scale;
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(R, sideDist)
        .addScaledVector(F, -8 * scale);
      desiredEye.y = this.smoothedTrainPos.y + upDist;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, 8);
    }

    // Apply optional local peek orbit offset around look target (via middle/left drag)
    if (Math.abs(this.followYawOffset) > 0.001 || Math.abs(this.followPitchOffset) > 0.001) {
      if (angle === 'cab') {
        const cabFwd = new THREE.Vector3().subVectors(desiredLook, desiredEye);
        cabFwd.applyAxisAngle(up, this.followYawOffset);
        cabFwd.y = THREE.MathUtils.clamp(cabFwd.y + this.followPitchOffset * 40, -35, 35);
        desiredLook.copy(desiredEye).add(cabFwd);
      } else {
        const arm = new THREE.Vector3().subVectors(desiredEye, desiredLook);
        arm.applyAxisAngle(up, this.followYawOffset);
        arm.y = THREE.MathUtils.clamp(arm.y + this.followPitchOffset * arm.length() * 0.6, 1.8, 120);
        desiredEye.copy(desiredLook).add(arm);
      }
    }

    // Guard surface exterior views against building wall clipping
    if (!isUg && angle !== 'cab' && this.collisionProvider) {
      const safe = this.collisionProvider.resolveCameraPosition(
        { x: desiredEye.x, y: desiredEye.y, z: desiredEye.z },
        4.0,
        false,
        4.5,
      );
      desiredEye.set(safe.x, safe.y, safe.z);
    }

    if (firstSnap) {
      this.camera.position.copy(desiredEye);
      this.controls.target.copy(desiredLook);
    } else {
      const eyeAlpha = 1 - Math.exp(-7.5 * dtSec);
      this.camera.position.lerp(desiredEye, eyeAlpha);
      this.controls.target.lerp(desiredLook, eyeAlpha);
    }
    this.camera.lookAt(this.controls.target);
  }

  private updateUndergroundExplorer(dtSec: number): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    if (!this.activeTunnel) return;

    const speed = TUNNEL_SPEED_MPS[this.modeState.moveSpeed];
    // Determine forward/backward along tunnel relative to current camera facing!
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const tunTan = this.sampleTunnelTangent(this.activeTunnel, this.tunnelDistAlong);
    const alignSign = camFwd.x * tunTan.x + camFwd.z * tunTan.z >= 0 ? 1 : -1;

    let alongDelta = 0;
    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) {
      alongDelta += alignSign * speed * dtSec;
    }
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) {
      alongDelta -= alignSign * speed * dtSec;
    }

    if (alongDelta !== 0) {
      this.tunnelDistAlong = THREE.MathUtils.clamp(
        this.tunnelDistAlong + alongDelta,
        12,
        Math.max(12, this.activeTunnel.totalDist - 12),
      );
    }

    let latDelta = 0;
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) latDelta += 1;
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) latDelta -= 1;
    if (latDelta !== 0) {
      this.tunnelLateralM = THREE.MathUtils.clamp(
        this.tunnelLateralM + latDelta * alignSign * 4.5 * dtSec,
        -2.2,
        2.2,
      );
    }

    let vertDelta = 0;
    if (this.pressedKeys.has('KeyE') || this.pressedKeys.has('Space')) vertDelta += 1;
    if (
      this.pressedKeys.has('KeyQ') ||
      this.pressedKeys.has('ShiftLeft') ||
      this.pressedKeys.has('ShiftRight')
    ) {
      vertDelta -= 1;
    }
    if (vertDelta !== 0) {
      this.tunnelHeadHeightM = THREE.MathUtils.clamp(
        this.tunnelHeadHeightM + vertDelta * 3.2 * dtSec,
        1.4,
        4.1,
      );
    }

    // Clamp camera strictly inside tunnel cross-section envelope!
    const pt = this.sampleTunnelPoint(this.activeTunnel, this.tunnelDistAlong);
    const tan = this.sampleTunnelTangent(this.activeTunnel, this.tunnelDistAlong);
    const rightX = -tan.z;
    const rightZ = tan.x;
    const rLen = Math.hypot(rightX, rightZ) || 1;

    this.camera.position.set(
      pt.x + (rightX / rLen) * this.tunnelLateralM,
      pt.y + this.tunnelHeadHeightM,
      pt.z + (rightZ / rLen) * this.tunnelLateralM,
    );
    this.controls.target.copy(this.getFocusTarget());
  }

  private updateFreeLook(dtSec: number): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    const speedTable =
      this.modeState.mode === 'street_level' ? STREET_SPEED_MPS : SPEED_MPS;
    const speed = speedTable[this.modeState.moveSpeed];

    const forwardXZ = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightXZ = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();

    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) move.add(forwardXZ);
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) move.sub(forwardXZ);
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) move.add(rightXZ);
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) move.sub(rightXZ);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dtSec);
      this.camera.position.add(move);
    }

    let vMove = 0;
    if (this.pressedKeys.has('KeyE') || this.pressedKeys.has('Space')) vMove += 1;
    if (
      this.pressedKeys.has('KeyQ') ||
      this.pressedKeys.has('ShiftLeft') ||
      this.pressedKeys.has('ShiftRight')
    ) {
      vMove -= 1;
    }
    if (vMove !== 0) {
      this.camera.position.y += vMove * speed * 0.6 * dtSec;
    }

    this.clampCameraBounds();
    this.controls.target.copy(this.getFocusTarget());
  }

  private clampTarget(): void {
    this.controls.target.x = THREE.MathUtils.clamp(
      this.controls.target.x,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    this.controls.target.z = THREE.MathUtils.clamp(
      this.controls.target.z,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    const minY = this.capabilities.allowUndergroundGeometry
      ? this.capabilities.minCameraY
      : -5;
    this.controls.target.y = THREE.MathUtils.clamp(this.controls.target.y, minY, 450);
  }

  private clampCameraBounds(): void {
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z,
      -MAX_EXTENT_XZ,
      MAX_EXTENT_XZ,
    );
    this.camera.position.y = THREE.MathUtils.clamp(
      this.camera.position.y,
      this.capabilities.minCameraY,
      Math.min(MAX_ALTITUDE, this.capabilities.maxCameraY),
    );

    // Building & Landmark collision prevention in Street-Level / Surface Free Look!
    if (
      this.collisionProvider &&
      (this.modeState.mode === 'street_level' ||
        (this.modeState.freeLookEnabled && this.capabilities.isSurface))
    ) {
      const safe = this.collisionProvider.resolveCameraPosition(
        {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
        4.5,
        this.capabilities.allowUndergroundGeometry,
        this.capabilities.minCameraY,
      );
      this.camera.position.set(safe.x, safe.y, safe.z);
    }
  }

  private isTypingElement(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  private handleMouseDown = (e: MouseEvent): void => {
    // Suppress Windows/Chrome middle-button auto-scroll icon cleanly
    if (e.button === 1) {
      e.preventDefault();
    }
    this.anim = null;
  };

  private handleAuxClick = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault();
  };

  private handleContextMenu = (e: MouseEvent): void => {
    // Prevent distracting browser context menu during Right-drag Orbit / Free Look
    e.preventDefault();
  };

  private usesManualLookDrag(): boolean {
    return (
      this.modeState.freeLookEnabled ||
      this.modeState.mode === 'underground_explorer' ||
      this.modeState.mode === 'train_follow'
    );
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (!this.usesManualLookDrag()) return;
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      this.draggingLook = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.anim = null;
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.usesManualLookDrag() || !this.draggingLook) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;

    const sens = 0.004;
    if (this.modeState.mode === 'train_follow') {
      this.followYawOffset = THREE.MathUtils.clamp(
        this.followYawOffset - dx * sens,
        -Math.PI * 0.85,
        Math.PI * 0.85,
      );
      this.followPitchOffset = THREE.MathUtils.clamp(
        this.followPitchOffset + dy * sens,
        -0.65,
        0.65,
      );
      return;
    }

    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -Math.PI * 0.44, Math.PI * 0.44);
  };

  private handlePointerUp = (): void => {
    if (this.draggingLook) {
      this.draggingLook = false;
      this.onCameraMoved?.();
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.modeState.mode === 'train_follow') {
      e.preventDefault();
      this.followScale = THREE.MathUtils.clamp(
        this.followScale * (e.deltaY > 0 ? 1.09 : 0.91),
        0.55,
        2.4,
      );
      return;
    }

    if (this.modeState.mode === 'underground_explorer' && this.activeTunnel) {
      e.preventDefault();
      this.anim = null;
      const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const tunTan = this.sampleTunnelTangent(this.activeTunnel, this.tunnelDistAlong);
      const alignSign = camFwd.x * tunTan.x + camFwd.z * tunTan.z >= 0 ? 1 : -1;
      const step = (e.deltaY < 0 ? 1 : -1) * alignSign * 26;
      this.tunnelDistAlong = THREE.MathUtils.clamp(
        this.tunnelDistAlong + step,
        12,
        Math.max(12, this.activeTunnel.totalDist - 12),
      );
      this.onCameraMoved?.();
      return;
    }

    if (this.modeState.freeLookEnabled) {
      e.preventDefault();
      this.anim = null;
      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(this.camera.quaternion)
        .normalize();
      const speedTable =
        this.modeState.mode === 'street_level' ? STREET_SPEED_MPS : SPEED_MPS;
      const step = (e.deltaY > 0 ? -1 : 1) * speedTable[this.modeState.moveSpeed] * 0.16;
      this.camera.position.addScaledVector(forward, step);
      this.clampCameraBounds();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isTypingElement(e.target) || this.isTypingElement(document.activeElement)) return;
    if (
      !this.modeState.freeLookEnabled &&
      this.modeState.mode !== 'underground_explorer'
    ) {
      return;
    }
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyQ',
        'KeyE',
        'Space',
        'ShiftLeft',
        'ShiftRight',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(e.code)
    ) {
      e.preventDefault();
      this.anim = null;
      this.pressedKeys.add(e.code);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (this.pressedKeys.delete(e.code)) {
      this.onCameraMoved?.();
    }
  };

  private handleWindowBlur = (): void => {
    this.pressedKeys.clear();
    this.draggingLook = false;
  };

  private handleControlsEnd = (): void => {
    this.onCameraMoved?.();
  };

  dispose(): void {
    this.controls.removeEventListener('end', this.handleControlsEnd);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    this.domElement.removeEventListener('auxclick', this.handleAuxClick);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.controls.dispose();
  }
}
