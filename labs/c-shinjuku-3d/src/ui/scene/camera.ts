/**
 * Camera maths for the station view: an orbit camera that always looks down
 * at the model from an axonometric-like angle. This file computes poses; the
 * scene component applies them and animates between them.
 *
 * Limits (kept here so that the tests and the component agree):
 *   - pitch stays between a steep bird's-eye view and a shallow oblique one —
 *     never level, never from below, so the camera cannot end up inside a floor;
 *   - distance has a floor and a ceiling;
 *   - the point looked at stays near the model.
 */
import { Spherical, Vector3 } from 'three';
import type { StationModel } from '../../domain/types';
import { modelBounds, sceneBox } from './build';
import { LEVEL_SCALE, EXPLODE_GAIN, type Vec3, type ViewOptions } from './prims';

export const FOV = 36;
export const MIN_DISTANCE = 12;
/** Polar angle, measured from straight up. */
export const MIN_POLAR = 0.22;
export const MAX_POLAR = 1.32;
export const HOME_POLAR = 0.92;
export const HOME_AZIMUTH = 0.42;

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Pose {
  target: Vector3;
  radius: number;
  polar: number;
  azimuth: number;
}

function basis(polar: number, azimuth: number) {
  const dir = new Vector3().setFromSpherical(new Spherical(1, polar, azimuth));
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
  const up = new Vector3().crossVectors(dir, right).normalize();
  return { dir, right, up };
}

function corners(box: Box): Vector3[] {
  const out: Vector3[] = [];
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) out.push(new Vector3(x, y, z));
  return out;
}

/** How far the middle of `box`, as seen from the given direction, sits from `target` (in the view plane). */
export function screenOffset(target: Vector3, box: Box, polar: number, azimuth: number): Vector3 {
  const { right, up } = basis(polar, azimuth);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const c of corners(box)) {
    c.sub(target);
    u0 = Math.min(u0, c.dot(right));
    u1 = Math.max(u1, c.dot(right));
    v0 = Math.min(v0, c.dot(up));
    v1 = Math.max(v1, c.dot(up));
  }
  return right.multiplyScalar((u0 + u1) / 2).add(up.multiplyScalar((v0 + v1) / 2));
}

/** Camera distance at which every corner of `box` is inside the given fraction of the view. */
export function fitDistance(target: Vector3, box: Box, aspect: number, fit: { x: number; y: number }, polar: number, azimuth: number): number {
  const { dir, right, up } = basis(polar, azimuth);
  const tanY = Math.tan((FOV * Math.PI) / 360);
  const tanX = tanY * aspect;
  let radius = 0;
  for (const c of corners(box)) {
    c.sub(target);
    const depth = c.dot(dir);
    radius = Math.max(radius, depth + Math.abs(c.dot(right)) / (tanX * fit.x), depth + Math.abs(c.dot(up)) / (tanY * fit.y));
  }
  return radius;
}

const centre = (b: Box) => new Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);

/** The default view: the floors in focus (or the whole station) seen from the home direction. */
export function homePose(model: StationModel, view: Pick<ViewOptions, 'explode' | 'focusOrdinals' | 'showBlocks'>, aspect: number): Pose {
  const station = sceneBox(model, { ...view, showBlocks: false });
  const everything = sceneBox(model, view);
  const target = centre(station);
  target.add(screenOffset(target, everything, HOME_POLAR, HOME_AZIMUTH).multiplyScalar(0.8));
  const radius = Math.max(
    MIN_DISTANCE,
    fitDistance(target, station, aspect, { x: 0.8, y: 0.74 }, HOME_POLAR, HOME_AZIMUTH),
    fitDistance(target, everything, aspect, { x: 0.97, y: 0.95 }, HOME_POLAR, HOME_AZIMUTH),
  );
  return { target, radius, polar: HOME_POLAR, azimuth: HOME_AZIMUTH };
}

/** A view of one part of the model (a route leg, say), keeping the direction the user is looking from. */
export function focusPose(box: Box, aspect: number, current: { polar: number; azimuth: number }): Pose {
  const polar = Math.min(1.05, Math.max(0.62, current.polar));
  const target = centre(box);
  const radius = Math.max(MIN_DISTANCE * 1.5, fitDistance(target, box, aspect, { x: 0.5, y: 0.42 }, polar, current.azimuth));
  return { target, radius, polar, azimuth: current.azimuth };
}

/** The region the camera target may move in. */
export function targetLimits(model: StationModel): Box {
  const b = modelBounds(model);
  const pad = 10;
  const ys = model.levels.map((l) => l.elevation * LEVEL_SCALE * (1 + EXPLODE_GAIN));
  return { min: [b.x0 - pad, Math.min(...ys) - 4, b.z0 - pad], max: [b.x1 + pad, Math.max(...ys) + 6, b.z1 + pad] };
}

export function maxDistanceFor(homeRadius: number): number {
  return Math.max(260, homeRadius * 1.6);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Pose between two poses; the azimuth takes the short way round. */
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  let d = b.azimuth - a.azimuth;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return {
    target: a.target.clone().lerp(b.target, k),
    radius: a.radius + (b.radius - a.radius) * k,
    polar: a.polar + (b.polar - a.polar) * k,
    azimuth: a.azimuth + d * k,
  };
}
