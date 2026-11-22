/**
 * WeakMap Bridge connecting a WebGL canvas DOM element to its live `SpatialCameraController`
 * without altering `Metropolitan3DScene`'s sealed Coordinator API.
 */

import type * as THREE from 'three';
import type { SkId } from '../../domain/types.js';
import type { SolvedRailwayNetwork3D } from '../../domain/elevationSolver.js';
import type { AtlasDataset } from '../../domain/types.js';
import type { CameraControllerV2Adapter } from '../contracts/adapters.js';
import type { CameraModeState } from './cameraModeStateMachine.js';
import type { CameraOrientationInfo, StreetCollisionGuard } from './collisionGuard.js';

export interface UndergroundExplorerLocation {
  lineId: SkId<'line'>;
  lineNameJa: string;
  lineNameEn: string;
  lineColor: string;
  tier: import('../../domain/elevationSolver.js').SchematicTierId;
  trackY: number;
  nearestStationId: SkId<'station'> | null;
  nearestStationJa: string | null;
  nearestStationEn: string | null;
  nextStationJa: string | null;
  distanceToNearestM: number;
  headingDeg: number;
  progress01: number;
  nearbyLineIds: SkId<'line'>[];
}

export interface SpatialCameraBridge extends CameraControllerV2Adapter {
  getCamera(): THREE.PerspectiveCamera;
  attachUxContext(
    dataset: AtlasDataset,
    solved: SolvedRailwayNetwork3D,
    collisionGuard: StreetCollisionGuard,
    trainLookup?: (trainId: string) => import('../../contracts/atlasV2.js').SimulatedTrainState | null,
  ): void;
  applyModeState(
    nextState: CameraModeState,
    followedTrain: import('../../contracts/atlasV2.js').SimulatedTrainState | null,
    selectedLineId: SkId<'line'> | null,
    selectedStationId: SkId<'station'> | null,
  ): void;
  enterUndergroundExplorer(
    preferredLineId?: SkId<'line'> | null,
    preferredStationId?: SkId<'station'> | null,
  ): boolean;
  jumpToTunnelLine(lineId: SkId<'line'>): boolean;
  getExplorerLocation(): UndergroundExplorerLocation | null;
  getOrientationInfo(): CameraOrientationInfo;
  getFocusTarget(): THREE.Vector3;
  getDistanceToFocus(): number;
}

const ELEMENT_TO_CAMERA_CTRL = new WeakMap<HTMLElement, SpatialCameraBridge>();

export function registerCameraControllerForElement(
  domElement: HTMLElement,
  ctrl: SpatialCameraBridge,
): void {
  ELEMENT_TO_CAMERA_CTRL.set(domElement, ctrl);
}

export function unregisterCameraControllerForElement(domElement: HTMLElement): void {
  ELEMENT_TO_CAMERA_CTRL.delete(domElement);
}

export function getCameraControllerForElement(
  domElement: HTMLElement,
): SpatialCameraBridge | null {
  return ELEMENT_TO_CAMERA_CTRL.get(domElement) ?? null;
}

export function findCameraControllerInsideContainer(
  container: HTMLElement | null,
): SpatialCameraBridge | null {
  if (!container) return null;
  const canvas = container.querySelector('canvas[data-testid="three-3d-canvas"]');
  if (canvas instanceof HTMLElement) {
    return ELEMENT_TO_CAMERA_CTRL.get(canvas) ?? null;
  }
  return null;
}
