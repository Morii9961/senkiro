/**
 * Turns the StationModel into what the 3D view draws: box primitives grouped
 * by material, and flat decals for baked contact shadows. Pure functions, no
 * three.js and no React, so the unit tests can check that every model element
 * is drawn and nothing else is.
 *
 * The individual builders live in ./arch; this file only runs them in order.
 */
import type { PlanRect, StationModel } from '../../domain/types';
import { createContext } from './arch/context';
import { buildBlocks, buildEntrances, buildGates } from './arch/gates';
import { buildPlatforms } from './arch/platforms';
import { buildAreas, buildLinks, buildShells } from './arch/slabs';
import { buildVerticals, computeHoles } from './arch/vertical';
import { boundsOf, elevationY, levelY, type Decal, type Prim, type Vec3, type ViewOptions } from './prims';

export type { Decal, Prim, Vec3, ViewOptions } from './prims';
export { EXPLODE_GAIN, LEVEL_SCALE, levelY, elevationY } from './prims';
export { routeElementIds } from './arch/context';
export { areasTouch } from './arch/slabs';
export { buildLabels, maxTierForScale, type SceneLabel, type LabelChip } from './labels';
export { buildRoutePrims, routePoints, routeBox, pathInside, segmentInside, sharedEdgeMidpoint, type RoutePoint } from './routeLine';

export interface SceneParts {
  prims: Prim[];
  decals: Decal[];
}

export function buildScene(model: StationModel, opts: ViewOptions): SceneParts {
  const ctx = createContext(model, opts);
  computeHoles(ctx);
  buildShells(ctx);
  buildAreas(ctx);
  buildPlatforms(ctx);
  buildLinks(ctx);
  buildGates(ctx);
  buildEntrances(ctx);
  buildVerticals(ctx);
  buildBlocks(ctx);
  return { prims: ctx.prims, decals: ctx.decals };
}

export function buildPrims(model: StationModel, opts: ViewOptions): Prim[] {
  return buildScene(model, opts).prims;
}

export function levelBounds(model: StationModel, levelId: string, pad = 1.6): PlanRect {
  const b = boundsOf(model.areas.filter((a) => a.levelId === levelId).flatMap((a) => a.footprint));
  return { x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad };
}

export function modelBounds(model: StationModel): PlanRect {
  return boundsOf([...model.areas.flatMap((a) => a.footprint), ...model.unverifiedBlocks.map((b) => b.box)]);
}

/**
 * The box the camera has to frame: everything drawn at full strength.
 * With some floors in focus it is those floors only.
 */
export function sceneBox(model: StationModel, opts: Pick<ViewOptions, 'explode' | 'focusOrdinals' | 'showBlocks'>): { min: Vec3; max: Vec3 } {
  const headroom = 1.6;
  const focused = opts.focusOrdinals;
  const levels = focused === null ? model.levels : model.levels.filter((l) => focused.has(l.ordinal));
  const used = levels.length > 0 ? levels : model.levels;
  const withBlocks = focused === null && opts.showBlocks;
  const plan = boundsOf([...used.map((l) => levelBounds(model, l.id)), ...(withBlocks ? model.unverifiedBlocks.map((b) => b.box) : [])]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const level of used) {
    const y = levelY(level, opts.explode);
    y0 = Math.min(y0, y - 0.3);
    y1 = Math.max(y1, y + headroom);
  }
  if (withBlocks) {
    for (const blk of model.unverifiedBlocks) {
      const y = elevationY(blk.elevation, opts.explode);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + blk.height * 0.55);
    }
  }
  return { min: [plan.x0, y0, plan.z0], max: [plan.x1, y1, plan.z1] };
}
