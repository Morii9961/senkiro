/**
 * SENKIRO Atlas v2 — Unified Rolling Stock Creation & Animation Factory
 *
 * Provides the unified creation, positioning, curve articulation, door/light animation,
 * and 3-tier LOD switching API for the virtual train simulation engine and 3D preview studio.
 */

import * as THREE from 'three';
import {
  computeWheelRotationDeltaRad,
  indexTrackSpline3D,
  solveConsistPosesAlongSpline,
  type IndexedTrackSpline3D,
} from './domain/articulation.js';
import {
  buildConsistFormation,
  getRollingStockForLine,
  getRollingStockSpec,
} from './domain/specs.js';
import type {
  ConsistCarSlot,
  DoorSide,
  RollingStockLodLevel,
  RollingStockSeriesId,
  RollingStockSpec,
  SolvedCarPose3D,
  TrackSplinePoint3D,
  TrainAnimationState,
  TrainDoorState,
  TrainLightState,
  TravelDirection,
} from './domain/types.js';
import type { SkId } from '../../domain/types.js';
import { buildE235CarLod, type BuiltCarLodResult } from './builders/e235Builder.js';
import { buildMetro1000CarLod } from './builders/metro1000Builder.js';
import { buildMetro17000CarLod } from './builders/metro17000Builder.js';
import {
  RollingStockMaterialRegistry,
  type ConsistDynamicLightMaterials,
  type SeriesSharedMaterials,
} from './materials.js';

function countGroupGeometryStats(root: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshes++;
      const geom = obj.geometry as THREE.BufferGeometry | undefined;
      if (geom) {
        if (geom.index) {
          triangles += Math.round(geom.index.count / 3);
        } else {
          const pos = geom.getAttribute('position');
          if (pos) triangles += Math.round(pos.count / 3);
        }
      }
    }
  });
  return { triangles, meshes };
}

function buildCarLodForSeries(params: {
  spec: RollingStockSpec;
  slot: ConsistCarSlot;
  lod: RollingStockLodLevel;
  mats: SeriesSharedMaterials;
  lightMats: ConsistDynamicLightMaterials;
}): BuiltCarLodResult {
  switch (params.spec.seriesId) {
    case 'jr-east-e235-0':
      return buildE235CarLod(params);
    case 'tokyo-metro-1000':
      return buildMetro1000CarLod(params);
    case 'tokyo-metro-17000':
      return buildMetro17000CarLod(params);
  }
}

export class TrainCarInstance {
  readonly carIndex: number;
  readonly slot: ConsistCarSlot;
  readonly spec: RollingStockSpec;
  readonly group: THREE.Group;

  private readonly lodBuilt: Record<RollingStockLodLevel, BuiltCarLodResult>;
  private readonly lodStats: Record<RollingStockLodLevel, { triangles: number; meshes: number }>;
  private activeLod: RollingStockLodLevel = 'high';
  private lastPose: SolvedCarPose3D | null = null;

  constructor(params: {
    carIndex: number;
    slot: ConsistCarSlot;
    spec: RollingStockSpec;
    mats: SeriesSharedMaterials;
    lightMats: ConsistDynamicLightMaterials;
    initialLod?: RollingStockLodLevel;
  }) {
    this.carIndex = params.carIndex;
    this.slot = params.slot;
    this.spec = params.spec;

    this.group = new THREE.Group();
    this.group.name = `TrainCar_${params.spec.seriesId}_${params.slot.carNumber}`;

    const high = buildCarLodForSeries({
      spec: params.spec,
      slot: params.slot,
      lod: 'high',
      mats: params.mats,
      lightMats: params.lightMats,
    });
    const medium = buildCarLodForSeries({
      spec: params.spec,
      slot: params.slot,
      lod: 'medium',
      mats: params.mats,
      lightMats: params.lightMats,
    });
    const low = buildCarLodForSeries({
      spec: params.spec,
      slot: params.slot,
      lod: 'low',
      mats: params.mats,
      lightMats: params.lightMats,
    });

    this.lodBuilt = { high, medium, low };
    this.lodStats = {
      high: countGroupGeometryStats(high.group),
      medium: countGroupGeometryStats(medium.group),
      low: countGroupGeometryStats(low.group),
    };

    this.group.add(high.group, medium.group, low.group);
    this.setLod(params.initialLod ?? 'high');
  }

  getActiveLod(): RollingStockLodLevel {
    return this.activeLod;
  }

  setLod(level: RollingStockLodLevel): void {
    this.activeLod = level;
    this.lodBuilt.high.group.visible = level === 'high';
    this.lodBuilt.medium.group.visible = level === 'medium';
    this.lodBuilt.low.group.visible = level === 'low';
  }

  /**
   * Slides left-side, right-side, or both-side double-leaf passenger doors smoothly.
   * `progress01`: 0 = completely closed, 1 = completely open.
   */
  setDoorProgress(side: DoorSide, progress01: number): void {
    const clamped = Math.max(0, Math.min(1, progress01));
    // Smooth cubic ease for realistic pneumatic/electric door motor acceleration & cushioning
    const eased = clamped * clamped * (3 - 2 * clamped);

    for (const lodKey of ['high', 'medium'] as const) {
      for (const door of this.lodBuilt[lodKey].doors) {
        if (side !== 'both' && door.side !== side) continue;
        const shift = eased * door.maxSlideOffsetM;
        door.forwardLeaf.position.x = door.closedForwardX + shift;
        door.rearLeaf.position.x = door.closedRearX - shift;
      }
    }
  }

  /**
   * Raises or lowers roof pantographs (for overhead 1500V DC motorized cars).
   */
  setPantographRaised(raised: boolean | number): void {
    const ratio = typeof raised === 'boolean' ? (raised ? 1 : 0.18) : Math.max(0.18, Math.min(1, raised));
    for (const lodKey of ['high', 'medium'] as const) {
      for (const panto of this.lodBuilt[lodKey].pantographs) {
        const arm = panto.getObjectByName('Pantograph_Arm');
        if (arm) {
          arm.scale.y = ratio;
        }
      }
    }
  }

  /**
   * Rotates all wheelsets around their axle (local Z axis).
   */
  setWheelRotation(angleRad: number): void {
    for (const lodKey of ['high', 'medium'] as const) {
      for (const ws of this.lodBuilt[lodKey].wheelsets) {
        ws.rotation.z = -angleRad;
      }
    }
  }

  /**
   * Positions the car body and independently articulates its front bogie, rear bogie,
   * and inter-car gangway bellows to track 3D horizontal curves and vertical gradients.
   */
  setPose(pose: SolvedCarPose3D): void {
    this.lastPose = pose;
    this.group.position.set(pose.position.x, pose.position.y, pose.position.z);
    // Euler 'YXZ': first yaw around world +Y, then pitch (rotation around local Z because +X is forward!), then roll (rotation around local X)
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = pose.yawRad;
    this.group.rotation.z = pose.pitchRad;
    this.group.rotation.x = pose.rollRad;

    for (const lodKey of ['high', 'medium'] as const) {
      const b = this.lodBuilt[lodKey];
      if (b.frontBogie) {
        b.frontBogie.rotation.y = pose.frontBogieLocalYawRad;
      }
      if (b.rearBogie) {
        b.rearBogie.rotation.y = pose.rearBogieLocalYawRad;
      }
      if (b.rearGangway) {
        b.rearGangway.rotation.y = pose.rearGangwayYawRad;
      }
    }
  }

  getLastPose(): SolvedCarPose3D | null {
    return this.lastPose;
  }

  getTriangleCount(lod: RollingStockLodLevel = this.activeLod): number {
    return this.lodStats[lod].triangles;
  }

  getMeshCount(lod: RollingStockLodLevel = this.activeLod): number {
    return this.lodStats[lod].meshes;
  }
}

export interface CreateTrainConsistOptions {
  readonly id?: string;
  readonly seriesId: RollingStockSeriesId;
  /** Number of cars in the consist (defaults to 4 for preview or official preset if specified) */
  readonly carCount?: number;
  readonly initialLod?: RollingStockLodLevel;
  readonly lodMode?: RollingStockLodLevel | 'auto';
  readonly travelDirection?: TravelDirection;
  readonly worldScale?: number;
  readonly initialLights?: Partial<TrainLightState>;
}

export class TrainConsistInstance {
  readonly id: string;
  readonly spec: RollingStockSpec;
  readonly group: THREE.Group;
  readonly cars: readonly TrainCarInstance[];

  private readonly matRegistry = RollingStockMaterialRegistry.getInstance();
  private readonly lightMats: ConsistDynamicLightMaterials;

  private travelDirection: TravelDirection;
  private doors: TrainDoorState = {
    leftTarget: 0,
    leftCurrent: 0,
    rightTarget: 0,
    rightCurrent: 0,
  };
  private lights: TrainLightState;
  private wheelRotationRad = 0;
  private pantographRaised = true;
  private activeLod: RollingStockLodLevel;
  private lodMode: RollingStockLodLevel | 'auto';
  private worldScale: number;
  private cachedSpline: IndexedTrackSpline3D | null = null;

  constructor(options: CreateTrainConsistOptions) {
    this.spec = getRollingStockSpec(options.seriesId);
    this.id = options.id ?? `consist-${this.spec.seriesId}-${Math.random().toString(36).slice(2, 7)}`;
    this.travelDirection = options.travelDirection ?? 'forward';
    this.activeLod = options.initialLod ?? 'high';
    this.lodMode = options.lodMode ?? (options.initialLod ?? 'auto');
    this.worldScale = options.worldScale ?? 1.0;

    this.lights = {
      headlights: true,
      taillights: true,
      destinationSign: true,
      interiorLights: false,
      brightness: 1.0,
      ...options.initialLights,
    };

    const sharedMats = this.matRegistry.getSeriesMaterials(this.spec.seriesId);
    this.lightMats = this.matRegistry.createConsistLightMaterials(this.spec.seriesId);

    const slots = buildConsistFormation(this.spec.seriesId, options.carCount);
    this.group = new THREE.Group();
    this.group.name = `TrainConsist_${this.spec.seriesId}_${slots.length}cars`;

    const builtCars: TrainCarInstance[] = [];
    for (let i = 0; i < slots.length; i++) {
      const car = new TrainCarInstance({
        carIndex: i,
        slot: slots[i]!,
        spec: this.spec,
        mats: sharedMats,
        lightMats: this.lightMats,
        initialLod: this.activeLod,
      });
      if (this.worldScale !== 1.0) {
        car.group.scale.setScalar(this.worldScale);
      }
      this.group.add(car.group);
      builtCars.push(car);
    }
    this.cars = builtCars;

    this.syncLightMaterials();
    this.placeOnStraightTrack({ x: 0, y: 0, z: 0 }, 0);
  }

  /**
   * Positions all cars of the consist along a straight horizontal track centered at `centerOrigin`.
   */
  placeOnStraightTrack(
    centerOrigin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    yawRad = 0,
  ): SolvedCarPose3D[] {
    const pitchM = this.spec.dimensions.couplerLengthM * this.worldScale;
    const totalLen = this.cars.length * pitchM;
    const cosY = Math.cos(yawRad);
    const sinY = -Math.sin(yawRad);

    const poses: SolvedCarPose3D[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      // Car 0 is at the front (+totalLen/2 - 0.5*pitchM), Car N-1 at the rear (-totalLen/2 + 0.5*pitchM)
      const localX = totalLen * 0.5 - (i + 0.5) * pitchM;
      const wx = centerOrigin.x + localX * cosY;
      const wz = centerOrigin.z + localX * sinY;
      const halfBogie = this.spec.dimensions.bogieCenterDistanceM * 0.5 * this.worldScale;

      const pose: SolvedCarPose3D = {
        carIndex: i,
        position: { x: wx, y: centerOrigin.y, z: wz },
        forward: { x: cosY, y: 0, z: sinY },
        yawRad,
        pitchRad: 0,
        rollRad: 0,
        frontBogiePosition: {
          x: wx + halfBogie * cosY,
          y: centerOrigin.y,
          z: wz + halfBogie * sinY,
        },
        rearBogiePosition: {
          x: wx - halfBogie * cosY,
          y: centerOrigin.y,
          z: wz - halfBogie * sinY,
        },
        frontBogieLocalYawRad: 0,
        rearBogieLocalYawRad: 0,
        rearGangwayYawRad: 0,
        centerArcDistanceM: totalLen * 0.5 + localX,
      };
      this.cars[i]!.setPose(pose);
      poses.push(pose);
    }
    return poses;
  }

  /**
   * Positions and articulates all cars and bogies along an indexed 3D railway track spline.
   */
  placeAlongSpline(
    spline: IndexedTrackSpline3D,
    headDistanceM: number,
    railheadOffsetY = 0,
  ): SolvedCarPose3D[] {
    this.cachedSpline = spline;
    const poses = solveConsistPosesAlongSpline(spline, this.spec, headDistanceM, {
      carCount: this.cars.length,
      worldScale: this.worldScale,
      railheadOffsetY,
    });
    for (let i = 0; i < poses.length; i++) {
      this.cars[i]?.setPose(poses[i]!);
    }
    return poses;
  }

  /**
   * Convenience method for simulation engines passing raw 3D point arrays (`{x, y, z}[]`).
   */
  placeAlongPolyline3D(
    points: readonly TrackSplinePoint3D[],
    headDistanceM: number,
    closedLoop = false,
    railheadOffsetY = 0,
  ): SolvedCarPose3D[] {
    const spline = indexTrackSpline3D(points, closedLoop);
    return this.placeAlongSpline(spline, headDistanceM, railheadOffsetY);
  }

  /**
   * Direct per-car pose setter for simulation engines that compute car transforms externally.
   */
  setCarPose(
    carIndex: number,
    pose: Partial<SolvedCarPose3D> & {
      position: { x: number; y: number; z: number };
      yawRad: number;
    },
  ): void {
    const car = this.cars[carIndex];
    if (!car) return;
    const fullPose: SolvedCarPose3D = {
      carIndex,
      position: pose.position,
      forward: pose.forward ?? {
        x: Math.cos(pose.yawRad),
        y: 0,
        z: -Math.sin(pose.yawRad),
      },
      yawRad: pose.yawRad,
      pitchRad: pose.pitchRad ?? 0,
      rollRad: pose.rollRad ?? 0,
      frontBogiePosition: pose.frontBogiePosition ?? pose.position,
      rearBogiePosition: pose.rearBogiePosition ?? pose.position,
      frontBogieLocalYawRad: pose.frontBogieLocalYawRad ?? 0,
      rearBogieLocalYawRad: pose.rearBogieLocalYawRad ?? 0,
      rearGangwayYawRad: pose.rearGangwayYawRad ?? 0,
      centerArcDistanceM: pose.centerArcDistanceM ?? 0,
    };
    car.setPose(fullPose);
  }

  /**
   * Controls passenger door opening & closing on `'left'`, `'right'`, or `'both'` sides.
   * When `immediate` is true, doors snap immediately; otherwise `update(dtSec)` animates them smoothly.
   */
  setDoorState(side: DoorSide, open: boolean | number, immediate = false): void {
    const target = typeof open === 'boolean' ? (open ? 1 : 0) : Math.max(0, Math.min(1, open));
    const nextLeftTarget = side === 'left' || side === 'both' ? target : this.doors.leftTarget;
    const nextRightTarget = side === 'right' || side === 'both' ? target : this.doors.rightTarget;

    this.doors = {
      leftTarget: nextLeftTarget,
      leftCurrent: immediate ? nextLeftTarget : this.doors.leftCurrent,
      rightTarget: nextRightTarget,
      rightCurrent: immediate ? nextRightTarget : this.doors.rightCurrent,
    };

    if (immediate) {
      for (const car of this.cars) {
        car.setDoorProgress('left', this.doors.leftCurrent);
        car.setDoorProgress('right', this.doors.rightCurrent);
      }
    }
  }

  openDoors(side: DoorSide = 'both', immediate = false): void {
    this.setDoorState(side, 1, immediate);
  }

  closeDoors(side: DoorSide = 'both', immediate = false): void {
    this.setDoorState(side, 0, immediate);
  }

  getDoorState(): TrainDoorState {
    return { ...this.doors };
  }

  /**
   * Switches headlights, taillights, destination LED boards, and interior cabin night lighting.
   */
  setLights(partial: Partial<TrainLightState>): void {
    this.lights = {
      ...this.lights,
      ...partial,
    };
    this.syncLightMaterials();
  }

  /**
   * Changes the train's travel direction (`'forward'` vs `'reverse'`), automatically swapping
   * white headlights and red taillights between Lead Car #1 and Tail Car #N.
   */
  setTravelDirection(direction: TravelDirection): void {
    this.travelDirection = direction;
    this.syncLightMaterials();
  }

  reverseTravelDirection(): TravelDirection {
    const next: TravelDirection = this.travelDirection === 'forward' ? 'reverse' : 'forward';
    this.setTravelDirection(next);
    return next;
  }

  getTravelDirection(): TravelDirection {
    return this.travelDirection;
  }

  setPantographRaised(raised: boolean): void {
    this.pantographRaised = raised;
    for (const car of this.cars) {
      car.setPantographRaised(raised);
    }
  }

  setWorldScale(scale: number): void {
    this.worldScale = Math.max(0.1, Math.min(20, scale));
    for (const car of this.cars) {
      car.group.scale.setScalar(this.worldScale);
    }
  }

  getWorldScale(): number {
    return this.worldScale;
  }

  /**
   * Sets LOD mode (`'high'`, `'medium'`, `'low'`, or `'auto'`).
   */
  setLodMode(mode: RollingStockLodLevel | 'auto'): void {
    this.lodMode = mode;
    if (mode !== 'auto') {
      this.activeLod = mode;
      for (const car of this.cars) {
        car.setLod(mode);
      }
    }
  }

  /**
   * Evaluates camera distance to the consist and switches LOD automatically when `lodMode === 'auto'`.
   */
  updateLodForCamera(cameraPosition: { x: number; y: number; z: number }): RollingStockLodLevel {
    if (this.lodMode !== 'auto') {
      return this.activeLod;
    }
    const midCar = this.cars[Math.floor(this.cars.length / 2)] ?? this.cars[0];
    const pos = midCar?.group.position ?? this.group.position;
    const dist = Math.hypot(
      cameraPosition.x - pos.x,
      cameraPosition.y - pos.y,
      cameraPosition.z - pos.z,
    );

    const highMax = this.spec.lodBudgets.high.maxDistanceM;
    const medMax = this.spec.lodBudgets.medium.maxDistanceM;

    const nextLod: RollingStockLodLevel =
      dist <= highMax ? 'high' : dist <= medMax ? 'medium' : 'low';

    if (nextLod !== this.activeLod) {
      this.activeLod = nextLod;
      for (const car of this.cars) {
        car.setLod(nextLod);
      }
    }
    return this.activeLod;
  }

  /**
   * Per-frame animation update:
   *  - Smoothly interpolates door opening/closing (1.6s full stroke duration)
   *  - Advances wheel rotation when `distanceDeltaM` is supplied
   *  - Evaluates automatic camera-distance LOD when `cameraPosition` is supplied
   */
  update(
    dtSec: number,
    options?: {
      cameraPosition?: { x: number; y: number; z: number };
      distanceDeltaM?: number;
    },
  ): void {
    const safeDt = Math.max(0, Math.min(2.0, dtSec));
    const doorSpeed = 1 / 1.4; // Full open/close stroke in 1.4 seconds

    let leftCur = this.doors.leftCurrent;
    let rightCur = this.doors.rightCurrent;
    let doorsChanged = false;

    if (Math.abs(this.doors.leftTarget - leftCur) > 1e-4) {
      const step = Math.sign(this.doors.leftTarget - leftCur) * doorSpeed * safeDt;
      if (Math.abs(step) >= Math.abs(this.doors.leftTarget - leftCur)) {
        leftCur = this.doors.leftTarget;
      } else {
        leftCur += step;
      }
      doorsChanged = true;
    }

    if (Math.abs(this.doors.rightTarget - rightCur) > 1e-4) {
      const step = Math.sign(this.doors.rightTarget - rightCur) * doorSpeed * safeDt;
      if (Math.abs(step) >= Math.abs(this.doors.rightTarget - rightCur)) {
        rightCur = this.doors.rightTarget;
      } else {
        rightCur += step;
      }
      doorsChanged = true;
    }

    if (doorsChanged) {
      this.doors = {
        ...this.doors,
        leftCurrent: leftCur,
        rightCurrent: rightCur,
      };
      for (const car of this.cars) {
        car.setDoorProgress('left', leftCur);
        car.setDoorProgress('right', rightCur);
      }
    }

    if (options?.distanceDeltaM && Math.abs(options.distanceDeltaM) > 1e-5) {
      const dirSign = this.travelDirection === 'forward' ? 1 : -1;
      const deltaRad = computeWheelRotationDeltaRad(
        options.distanceDeltaM * dirSign,
        this.spec.dimensions.wheelDiameterM,
        this.worldScale,
      );
      this.wheelRotationRad = (this.wheelRotationRad + deltaRad) % (Math.PI * 2);
      for (const car of this.cars) {
        car.setWheelRotation(this.wheelRotationRad);
      }
    }

    if (options?.cameraPosition) {
      this.updateLodForCamera(options.cameraPosition);
    }
  }

  getAnimationState(): TrainAnimationState {
    return {
      travelDirection: this.travelDirection,
      doors: { ...this.doors },
      lights: { ...this.lights },
      wheelRotationRad: this.wheelRotationRad,
      pantographRaised: this.pantographRaised,
      activeLod: this.activeLod,
      lodMode: this.lodMode,
    };
  }

  getPerformanceMetrics(): {
    activeLod: RollingStockLodLevel;
    totalTriangles: number;
    trianglesPerCar: number;
    totalMeshes: number;
    carCount: number;
    totalLengthM: number;
    lodTrianglesByTier: Record<RollingStockLodLevel, number>;
  } {
    let totalTriangles = 0;
    let totalMeshes = 0;
    const byTier: Record<RollingStockLodLevel, number> = { high: 0, medium: 0, low: 0 };

    for (const car of this.cars) {
      totalTriangles += car.getTriangleCount(this.activeLod);
      totalMeshes += car.getMeshCount(this.activeLod);
      byTier.high += car.getTriangleCount('high');
      byTier.medium += car.getTriangleCount('medium');
      byTier.low += car.getTriangleCount('low');
    }

    return {
      activeLod: this.activeLod,
      totalTriangles,
      trianglesPerCar: Math.round(totalTriangles / Math.max(1, this.cars.length)),
      totalMeshes,
      carCount: this.cars.length,
      totalLengthM: this.cars.length * this.spec.dimensions.couplerLengthM * this.worldScale,
      lodTrianglesByTier: byTier,
    };
  }

  getCachedSpline(): IndexedTrackSpline3D | null {
    return this.cachedSpline;
  }

  private syncLightMaterials(): void {
    this.matRegistry.applyConsistLightState(
      this.lightMats,
      this.travelDirection,
      this.lights,
    );
  }

  dispose(): void {
    this.lightMats.dispose();
  }
}

/**
 * Convenience top-level factory functions for the Virtual Train Simulation Engine.
 */
export function createTrainConsist(options: CreateTrainConsistOptions): TrainConsistInstance {
  return new TrainConsistInstance(options);
}

export function createTrainConsistForLine(
  lineId: SkId<'line'>,
  options?: Omit<CreateTrainConsistOptions, 'seriesId'>,
): TrainConsistInstance | null {
  const spec = getRollingStockForLine(lineId);
  if (!spec) return null;
  return new TrainConsistInstance({
    ...options,
    seriesId: spec.seriesId,
  });
}
