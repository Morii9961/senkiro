/**
 * SENKIRO Atlas v2 — Unified 5-Mode Spatial Camera Controller.
 *
 * Backward-compatible drop-in upgrade for `Metropolitan3DScene` AND full
 * `CameraControllerV2Adapter` implementation:
 *
 * Modes managed cleanly via `cameraModeStateMachine.ts`:
 *  1. `city_overview`        — 3D metropolitan aerial view (Orbit Left, Free Pan Mid/Right, Wheel Zoom, Dbl-Click Focus)
 *  2. `street_level`         — Low-altitude street & viaduct view with building/landmark collision guard & heading compass
 *  3. `underground_cutaway`  — GPU radial cutaway explorer with depth tiers & smooth high-polar dive
 *  4. `underground_explorer` — Subterranean tunnel corridor cruiser constrained strictly inside bore clearance
 *  5. `train_follow`         — Smooth curve-damped following of `SimulatedTrainState` (Cab / Front / Side / Chase / Overhead)
 *
 * Plus explicit Free Look toggle (`setMode('free')` / HUD / Key 'F') with WASD/QE flight.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  CameraModeV2,
  CameraStateSnapshot,
  CameraTargetV2,
  SimulatedTrainState,
  TrainFollowView,
} from '../contracts/atlasV2.js';
import {
  classifyTier,
  type SolvedPoint3D,
  type SolvedRailwayNetwork3D,
  type SolvedSegment3D,
} from '../domain/elevationSolver.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import type { CameraControllerV2Adapter } from './contracts/adapters.js';
import type { CameraMoveSpeed, CameraNavMode } from './types.js';
import {
  createInitialCameraModeState,
  getCameraModeCapabilities,
  toCameraModeV2,
  transitionCameraMode,
  type CameraModeCapabilities,
  type CameraModeState,
  type TrainFollowRig,
} from './camera/cameraModeStateMachine.js';
import type {
  CameraOrientationInfo,
  StreetCollisionGuard,
} from './camera/collisionGuard.js';
import {
  registerCameraControllerForElement,
  unregisterCameraControllerForElement,
  type SpatialCameraBridge,
  type UndergroundExplorerLocation,
} from './camera/controllerBridge.js';

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

const SPEED_MPS: Record<CameraMoveSpeed, number> = {
  slow: 140,
  normal: 380,
  fast: 920,
};

const STREET_SPEED_MPS: Record<CameraMoveSpeed, number> = {
  slow: 24,
  normal: 58,
  fast: 130,
};

const TUNNEL_SPEED_MPS: Record<CameraMoveSpeed, number> = {
  slow: 18,
  normal: 44,
  fast: 96,
};

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

export class SpatialCameraController
  implements CameraControllerV2Adapter, SpatialCameraBridge
{
  readonly controls: OrbitControls;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly onCameraMoved?: () => void;

  private modeState: CameraModeState = createInitialCameraModeState();
  private capabilities: CameraModeCapabilities = getCameraModeCapabilities(
    this.modeState,
    false,
  );
  private moveSpeed: CameraMoveSpeed = 'normal';
  private undergroundAllowed = false;
  private minUndergroundY = -62;

  private collisionGuard: StreetCollisionGuard | null = null;
  private trainLookupFn: ((trainId: string) => SimulatedTrainState | null) | null = null;
  private readonly tunnelCorridors: TunnelCorridor[] = [];
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
  private followedAngleSnap: TrainFollowRig | null = null;
  private latestFollowedTrain: SimulatedTrainState | null = null;
  private smoothedTrainPos = new THREE.Vector3();
  private smoothedTrainDir = new THREE.Vector3(0, 0, -1);
  private followScale = 1.0;
  private followYawOffset = 0;
  private followPitchOffset = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    onCameraMoved?: () => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.onCameraMoved = onCameraMoved;

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 85;
    this.controls.maxDistance = 18_500;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.zoomSpeed = 1.05;
    this.controls.rotateSpeed = 0.72;
    this.controls.panSpeed = 1.05;

    // Preserves repo convention tested in E2E: Left-drag = Orbit (click selects), Mid/Right-drag = Pan
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };

    this.controls.addEventListener('end', this.handleControlsEnd);
    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    this.domElement.addEventListener('auxclick', this.handleAuxClick);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.domElement.addEventListener('pointerdown', this.handleFreePointerDown);
    this.domElement.addEventListener('pointermove', this.handleFreePointerMove);
    this.domElement.addEventListener('pointerup', this.handleFreePointerUp);
    this.domElement.addEventListener('wheel', this.handleFreeWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);

    registerCameraControllerForElement(domElement, this);
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  attachUxContext(
    dataset: AtlasDataset,
    solved: SolvedRailwayNetwork3D,
    collisionGuard: StreetCollisionGuard,
    trainLookup?: (trainId: string) => SimulatedTrainState | null,
  ): void {
    this.collisionGuard = collisionGuard;
    this.trainLookupFn = trainLookup ?? null;
    this.buildTunnelCorridors(dataset, solved);
  }

  private buildTunnelCorridors(dataset: AtlasDataset, solved: SolvedRailwayNetwork3D): void {
    this.tunnelCorridors.length = 0;
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

  // ---- Legacy + v2 Contract Methods ----

  getMode(): CameraNavMode {
    if (this.modeState.freeLookEnabled || this.modeState.mode === 'underground_explorer') {
      return 'free';
    }
    return 'map';
  }

  getModeV2(): CameraModeV2 {
    return toCameraModeV2(this.modeState);
  }

  getSpeed(): CameraMoveSpeed {
    return this.moveSpeed;
  }

  setSpeed(speed: CameraMoveSpeed): void {
    this.moveSpeed = speed;
    this.modeState = transitionCameraMode(this.modeState, { type: 'SET_MOVE_SPEED', speed });
  }

  setUndergroundBounds(enabled: boolean, verticalExaggeration = 1.0): void {
    this.undergroundAllowed = enabled;
    this.minUndergroundY = -62 * Math.max(1.0, verticalExaggeration);
    if (this.modeState.mode === 'train_follow') {
      this.controls.minDistance = 6;
      this.controls.maxPolarAngle = Math.PI * 0.88;
      return;
    }
    this.controls.maxPolarAngle = enabled ? Math.PI * 0.78 : Math.PI * 0.47;
  }

  setMode(nextMode: CameraNavMode): void {
    const nextEnabled = nextMode === 'free';
    if (this.modeState.freeLookEnabled === nextEnabled && this.getMode() === nextMode) {
      return;
    }
    this.anim = null;
    this.pressedKeys.clear();
    this.draggingLook = false;

    this.modeState = transitionCameraMode(this.modeState, {
      type: 'TOGGLE_FREE_LOOK',
      enabled: nextEnabled,
    });
    this.capabilities = getCameraModeCapabilities(
      this.modeState,
      this.undergroundAllowed || this.camera.position.y < -1.5,
    );

    if (nextEnabled) {
      this.syncFreeEulerFromCamera();
      this.controls.enabled = false;
    } else {
      if (this.modeState.mode === 'underground_explorer') {
        this.modeState = transitionCameraMode(this.modeState, {
          type: 'SELECT_MODE',
          mode: 'underground_cutaway',
        });
      }
      this.syncOrbitTargetFromCamera();
      this.controls.enabled = true;
      this.controls.update();
    }
    this.onCameraMoved?.();
  }

  setModeV2(mode: CameraModeV2, target?: CameraTargetV2): void {
    if (target?.kind === 'train') {
      this.followTrain(target.trainId, target.view);
      return;
    }
    if (target?.kind === 'world') {
      this.focusWorldPoint(new THREE.Vector3(target.x, target.y, target.z));
    }
    if (mode === 'free') {
      this.setMode('free');
    } else if (mode === 'map') {
      this.applyModeState(
        transitionCameraMode(this.modeState, { type: 'SELECT_MODE', mode: 'city_overview' }),
        null,
        null,
        null,
      );
    } else if (mode === 'station_focus') {
      this.applyModeState(
        transitionCameraMode(this.modeState, { type: 'SELECT_MODE', mode: 'street_level' }),
        null,
        null,
        target?.kind === 'station' ? target.stationId : null,
      );
    } else if (mode === 'underground_inspect') {
      this.applyModeState(
        transitionCameraMode(this.modeState, {
          type: 'SELECT_MODE',
          mode: 'underground_cutaway',
        }),
        null,
        target?.kind === 'line' ? target.lineId : null,
        target?.kind === 'station' ? target.stationId : null,
      );
    }
  }

  followTrain(trainId: string | null, view: TrainFollowView = 'chase'): void {
    if (!trainId) {
      this.applyModeState(
        transitionCameraMode(this.modeState, { type: 'EXIT_TRAIN_FOLLOW' }),
        null,
        null,
        null,
      );
      return;
    }
    this.applyModeState(
      transitionCameraMode(this.modeState, {
        type: 'FOLLOW_TRAIN',
        trainId,
        angle: view,
      }),
      null,
      null,
      null,
    );
  }

  updateTrainTarget(train: SimulatedTrainState | null, dtSec: number): void {
    if (!train) return;
    const hp = train.headPose;
    const rawPos = new THREE.Vector3(hp.x, hp.y + 1.8, hp.z);
    const rawDir = new THREE.Vector3(hp.dirX, hp.dirY, hp.dirZ);
    if (rawDir.lengthSq() < 1e-6) rawDir.set(0, 0, -1);
    else rawDir.normalize();

    const rig = this.modeState.followAngle;
    const firstSnap =
      this.followedTrainSnapId !== train.trainId || this.followedAngleSnap !== rig;

    if (firstSnap) {
      this.followedTrainSnapId = train.trainId;
      this.followedAngleSnap = rig;
      this.latestFollowedTrain = train;
      this.smoothedTrainPos.copy(rawPos);
      this.smoothedTrainDir.copy(rawDir);
    } else {
      this.latestFollowedTrain = train;
      const posAlpha = 1 - Math.exp(-11.0 * Math.max(0.004, dtSec));
      const dirAlpha = 1 - Math.exp(-4.2 * Math.max(0.004, dtSec));
      this.smoothedTrainPos.lerp(rawPos, posAlpha);
      this.smoothedTrainDir.lerp(rawDir, dirAlpha).normalize();
    }

    const F = this.smoothedTrainDir.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const R = new THREE.Vector3().crossVectors(F, up);
    if (R.lengthSq() < 1e-4) R.set(1, 0, 0);
    else R.normalize();

    const scale = this.followScale;
    const isUg = train.isUnderground || train.inTunnel;

    const desiredEye = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (rig === 'cab') {
      desiredEye.copy(this.smoothedTrainPos).addScaledVector(F, 1.8);
      desiredEye.y = this.smoothedTrainPos.y + 0.55;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, 68);
      desiredLook.y = this.smoothedTrainPos.y + 0.3 + F.y * 55;
    } else if (rig === 'front') {
      const fwdDist = (isUg ? 24 : 38) * scale;
      const latDist = (isUg ? 2.2 : 13) * scale;
      const upDist = (isUg ? 4.5 : 14) * scale;
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(F, fwdDist)
        .addScaledVector(R, latDist);
      desiredEye.y = this.smoothedTrainPos.y + upDist;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, -18);
      desiredLook.y = this.smoothedTrainPos.y + 0.5;
    } else if (rig === 'side') {
      const sideDist = (isUg ? 34 : 32) * scale;
      const upDist = (isUg ? 16 : 12) * scale;
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(R, sideDist)
        .addScaledVector(F, -14 * scale);
      desiredEye.y = this.smoothedTrainPos.y + upDist;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, -18);
    } else if (rig === 'overhead_cutaway') {
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(F, -92 * scale)
        .addScaledVector(R, 62 * scale);
      desiredEye.y = Math.max(this.smoothedTrainPos.y + 135 * scale, 82);
      desiredLook.copy(this.smoothedTrainPos);
    } else {
      // 'chase': rear trailing follow
      const trailDist = (isUg ? 44 : 68) * scale;
      const upDist = (isUg ? 18 : 30) * scale;
      desiredEye
        .copy(this.smoothedTrainPos)
        .addScaledVector(F, -trailDist)
        .addScaledVector(R, 14 * scale);
      desiredEye.y = this.smoothedTrainPos.y + upDist;
      desiredLook.copy(this.smoothedTrainPos).addScaledVector(F, 26);
    }

    if (Math.abs(this.followYawOffset) > 0.001 || Math.abs(this.followPitchOffset) > 0.001) {
      if (rig === 'cab') {
        const cabFwd = new THREE.Vector3().subVectors(desiredLook, desiredEye);
        cabFwd.applyAxisAngle(up, this.followYawOffset);
        cabFwd.y = THREE.MathUtils.clamp(cabFwd.y + this.followPitchOffset * 38, -32, 32);
        desiredLook.copy(desiredEye).add(cabFwd);
      } else {
        const arm = new THREE.Vector3().subVectors(desiredEye, desiredLook);
        arm.applyAxisAngle(up, this.followYawOffset);
        arm.y = THREE.MathUtils.clamp(
          arm.y + this.followPitchOffset * arm.length() * 0.55,
          1.8,
          160,
        );
        desiredEye.copy(desiredLook).add(arm);
      }
    }

    if (!isUg && rig !== 'cab' && this.collisionGuard) {
      const safe = this.collisionGuard.resolveCameraPosition(
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
      const eyeAlpha = 1 - Math.exp(-8.5 * Math.max(0.004, dtSec));
      this.camera.position.lerp(desiredEye, eyeAlpha);
      this.controls.target.lerp(desiredLook, eyeAlpha);
    }
    this.camera.lookAt(this.controls.target);
  }

  returnToSurface(): void {
    const next = transitionCameraMode(this.modeState, { type: 'RETURN_TO_SURFACE' });
    this.applyModeState(next, null, null, null);
  }

  getSnapshot(): CameraStateSnapshot {
    const focus = this.getFocusTarget();
    const isUndergroundCamera = this.camera.position.y < -1.5;
    return {
      mode: this.getModeV2(),
      target:
        this.modeState.mode === 'train_follow' && this.modeState.followedTrainId
          ? {
              kind: 'train',
              trainId: this.modeState.followedTrainId,
              view: this.modeState.followAngle === 'front' ? 'chase' : this.modeState.followAngle,
            }
          : { kind: 'world', x: focus.x, y: focus.y, z: focus.z },
      position: [
        Math.round(this.camera.position.x * 10) / 10,
        Math.round(this.camera.position.y * 10) / 10,
        Math.round(this.camera.position.z * 10) / 10,
      ],
      lookAt: [
        Math.round(focus.x * 10) / 10,
        Math.round(focus.y * 10) / 10,
        Math.round(focus.z * 10) / 10,
      ],
      distanceM: Math.round(this.getDistanceToFocus() * 10) / 10,
      isUndergroundCamera,
      followingTrainId:
        this.modeState.mode === 'train_follow' ? this.modeState.followedTrainId : null,
      followView:
        this.modeState.mode === 'train_follow'
          ? this.modeState.followAngle === 'front'
            ? 'chase'
            : this.modeState.followAngle
          : null,
    };
  }

  // ---- 5-Mode State Synchronization ----

  applyModeState(
    nextState: CameraModeState,
    followedTrain: SimulatedTrainState | null,
    selectedLineId: SkId<'line'> | null,
    selectedStationId: SkId<'station'> | null,
  ): void {
    const prevMode = this.modeState.mode;
    const prevFree = this.modeState.freeLookEnabled;
    const prevAngle = this.modeState.followAngle;
    const prevTrainId = this.modeState.followedTrainId;

    this.modeState = nextState;
    if (followedTrain) {
      this.latestFollowedTrain = followedTrain;
    } else if (nextState.mode !== 'train_follow') {
      this.latestFollowedTrain = null;
    }
    this.moveSpeed = nextState.moveSpeed;
    this.capabilities = getCameraModeCapabilities(
      nextState,
      Boolean(followedTrain?.isUnderground),
    );
    this.undergroundAllowed = this.capabilities.allowUndergroundGeometry;
    this.minUndergroundY = this.capabilities.minCameraY;

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
        if (followedTrain) {
          // Immediately frame the camera near the train so Frame 1 is never stranded km away!
          this.updateTrainTarget(followedTrain, 0.016);
        }
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

    // Returning from underground_explorer or subterranean train follow cleanly restores surface camera
    if (
      prevMode === 'underground_explorer' ||
      (prevMode === 'train_follow' &&
        (nextState.mode === 'city_overview' || nextState.mode === 'street_level'))
    ) {
      const target =
        prevMode === 'underground_explorer' && this.activeTunnel
          ? this.sampleTunnelPoint(this.activeTunnel, this.tunnelDistAlong)
          : this.getFocusTarget();
      const surfaceTarget = new THREE.Vector3(target.x, 0, target.z);
      const dist = nextState.mode === 'street_level' ? 145 : 1150;
      const polar = nextState.mode === 'street_level' ? 74 : 54;
      this.controls.enabled = !nextState.freeLookEnabled;
      this.animateTo(surfaceTarget, dist, polar, this.getCurrentAzimuthDeg(), 620);
      return;
    }

    if (modeChanged && nextState.mode === 'street_level') {
      const focus = this.getFocusTarget().clone();
      focus.y = 1.5;
      const safeTarget = this.collisionGuard
        ? this.collisionGuard.resolveCameraPosition(focus, 8, false, 1.5)
        : focus;
      this.animateTo(
        new THREE.Vector3(safeTarget.x, 1.5, safeTarget.z),
        145,
        76,
        this.getCurrentAzimuthDeg(),
        480,
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
    this.tunnelLateralM = 0;
    this.tunnelHeadHeightM = 2.6;

    const pt = this.sampleTunnelPoint(bestCorridor, this.tunnelDistAlong);
    const tan = this.sampleTunnelTangent(bestCorridor, this.tunnelDistAlong);
    const faceSign = this.tunnelDistAlong > bestCorridor.totalDist * 0.65 ? -1 : 1;

    const endPos = new THREE.Vector3(pt.x, pt.y + this.tunnelHeadHeightM, pt.z);
    const endTarget = new THREE.Vector3(
      pt.x + tan.x * 48 * faceSign,
      pt.y + this.tunnelHeadHeightM + tan.y * 24 * faceSign,
      pt.z + tan.z * 48 * faceSign,
    );

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
      nearestAnchor: this.collisionGuard
        ? this.collisionGuard.describeNearestAnchor({
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
          })
        : null,
    };
  }

  getFocusTarget(): THREE.Vector3 {
    if (this.modeState.mode === 'train_follow') {
      return this.controls.target;
    }
    if (this.getMode() === 'map') {
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
          : 520;
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
    if (this.getMode() === 'free') {
      this.syncFreeEulerFromCamera();
    } else {
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
    let endPos = this.sphericalToPos(endTarget, distance, polarDeg, azimuthDeg);
    if (this.collisionGuard && this.modeState.mode === 'street_level') {
      const safe = this.collisionGuard.resolveCameraPosition(
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
    const minD = this.modeState.mode === 'street_level' ? 45 : 260;
    const maxD = this.modeState.mode === 'street_level' ? 240 : 1450;
    const nextDist = THREE.MathUtils.clamp(curDist * 0.52, minD, maxD);
    if (curDist > 1) {
      offset.multiplyScalar(nextDist / curDist);
    } else {
      offset.set(0, nextDist * 0.65, nextDist * 0.75);
    }
    let endPos = point.clone().add(offset);
    const minY = this.undergroundAllowed ? this.minUndergroundY : this.capabilities.minCameraY;
    endPos.y = Math.max(minY, endPos.y);
    if (this.collisionGuard && this.capabilities.isSurface) {
      const safe = this.collisionGuard.resolveCameraPosition(endPos, 4.5, false, minY);
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

  update(now: number, dtSec: number): void {
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
      if (this.getMode() === 'map') this.controls.update();
      return;
    }

    if (this.modeState.mode === 'train_follow') {
      const liveTrain =
        this.modeState.followedTrainId && this.trainLookupFn
          ? this.trainLookupFn(this.modeState.followedTrainId)
          : this.latestFollowedTrain;
      if (liveTrain) {
        this.updateTrainTarget(liveTrain, dtSec);
        return;
      }
    }

    if (this.modeState.mode === 'underground_explorer') {
      this.updateUndergroundExplorer(dtSec);
      return;
    }

    if (this.getMode() === 'free') {
      this.updateFreeLook(dtSec);
      return;
    }

    const dist = this.camera.position.distanceTo(this.controls.target);
    const speedFactor = this.modeState.mode === 'street_level' ? 0.65 : 1.0;
    this.controls.panSpeed =
      THREE.MathUtils.clamp(0.85 + dist / 4200, 0.85, 2.2) * speedFactor;
    this.controls.update();
    this.clampTarget();
    this.clampCameraBounds();
  }

  private getCurrentAzimuthDeg(): number {
    const focus = this.getFocusTarget();
    const dx = this.camera.position.x - focus.x;
    const dz = this.camera.position.z - focus.z;
    return THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
  }

  private syncFreeEulerFromCamera(): void {
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
      tDist = THREE.MathUtils.clamp(-this.camera.position.y / forward.y, 180, 5200);
    }
    this.controls.target.copy(this.camera.position).addScaledVector(forward, tDist);
    this.clampTarget();
  }

  private updateUndergroundExplorer(dtSec: number): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    if (!this.activeTunnel) return;

    const speed = TUNNEL_SPEED_MPS[this.moveSpeed];
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
    const speed = speedTable[this.moveSpeed];

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
      this.camera.position.y += vMove * speed * 0.65 * dtSec;
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
    const minY = this.undergroundAllowed ? this.minUndergroundY : -5;
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
    const minY = this.undergroundAllowed
      ? this.minUndergroundY
      : this.capabilities.minCameraY;
    this.camera.position.y = THREE.MathUtils.clamp(
      this.camera.position.y,
      minY,
      Math.min(MAX_ALTITUDE, this.capabilities.maxCameraY),
    );

    if (
      this.collisionGuard &&
      (this.modeState.mode === 'street_level' ||
        (this.getMode() === 'free' && this.capabilities.isSurface))
    ) {
      const safe = this.collisionGuard.resolveCameraPosition(
        {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
        4.5,
        this.undergroundAllowed,
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

  private usesManualLookDrag(): boolean {
    return (
      this.getMode() === 'free' ||
      this.modeState.mode === 'underground_explorer' ||
      this.modeState.mode === 'train_follow'
    );
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 1) {
      e.preventDefault();
    }
    this.anim = null;
  };

  private handleAuxClick = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault();
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleFreePointerDown = (e: PointerEvent): void => {
    if (!this.usesManualLookDrag()) return;
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      this.draggingLook = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.anim = null;
    }
  };

  private handleFreePointerMove = (e: PointerEvent): void => {
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
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * sens,
      -Math.PI * 0.45,
      Math.PI * 0.45,
    );
  };

  private handleFreePointerUp = (): void => {
    if (this.draggingLook) {
      this.draggingLook = false;
      this.onCameraMoved?.();
    }
  };

  private handleFreeWheel = (e: WheelEvent): void => {
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

    if (this.getMode() === 'free') {
      e.preventDefault();
      this.anim = null;
      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(this.camera.quaternion)
        .normalize();
      const speedTable =
        this.modeState.mode === 'street_level' ? STREET_SPEED_MPS : SPEED_MPS;
      const step = (e.deltaY > 0 ? -1 : 1) * speedTable[this.moveSpeed] * 0.16;
      this.camera.position.addScaledVector(forward, step);
      this.clampCameraBounds();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isTypingElement(e.target) || this.isTypingElement(document.activeElement)) return;
    if (this.getMode() !== 'free' && this.modeState.mode !== 'underground_explorer') return;
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
      if (this.modeState.mode === 'underground_explorer' && !e.repeat) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown') {
          this.updateUndergroundExplorer(0.12);
        }
      }
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
    unregisterCameraControllerForElement(this.domElement);
    this.controls.removeEventListener('end', this.handleControlsEnd);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    this.domElement.removeEventListener('auxclick', this.handleAuxClick);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.domElement.removeEventListener('pointerdown', this.handleFreePointerDown);
    this.domElement.removeEventListener('pointermove', this.handleFreePointerMove);
    this.domElement.removeEventListener('pointerup', this.handleFreePointerUp);
    this.domElement.removeEventListener('wheel', this.handleFreeWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.controls.dispose();
  }
}
