/**
 * The drawn line of a route, shared by the 3D view and the 2D plans.
 */
import type { Route } from '../../domain/route';
import type { Area, PlanPoint, PlanRect, StationModel } from '../../domain/types';
import { GATE_LINE_TOLERANCE, nearestInFootprint } from '../../domain/validate';
import { dashes } from './arch/slabs';
import { SLAB_TOP, levelY, type Prim, type Vec3, type ViewOptions } from './prims';

export interface RoutePoint {
  /** Graph node this point stands for; null for points added only to shape the line. */
  nodeId: string | null;
  levelId: string;
  plan: PlanPoint;
  kind: 'area' | 'gate' | 'entrance' | 'vertical-stop' | 'bend';
  /** Area the point belongs to, when it is an area anchor. */
  areaId?: string;
  /** Route leg that the stretch ending at this point belongs to. */
  leg: number;
}

const EDGE_EPS = 0.02;

/** Middle of the edge two touching areas share, or null when they do not touch. */
export function sharedEdgeMidpoint(a: Area, b: Area): PlanPoint | null {
  let best: { p: PlanPoint; len: number } | null = null;
  for (const ra of a.footprint) {
    for (const rb of b.footprint) {
      const x0 = Math.max(ra.x0, rb.x0);
      const x1 = Math.min(ra.x1, rb.x1);
      const z0 = Math.max(ra.z0, rb.z0);
      const z1 = Math.min(ra.z1, rb.z1);
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.abs(dz) <= EDGE_EPS && dx > EDGE_EPS ? dx : Math.abs(dx) <= EDGE_EPS && dz > EDGE_EPS ? dz : 0;
      if (len > 0 && (!best || len > best.len)) best = { p: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, len };
    }
  }
  return best?.p ?? null;
}

function inRect(p: PlanPoint, r: PlanRect, eps = 0.06): boolean {
  return p.x >= r.x0 - eps && p.x <= r.x1 + eps && p.z >= r.z0 - eps && p.z <= r.z1 + eps;
}

function inFootprint(p: PlanPoint, footprint: PlanRect[]): boolean {
  return footprint.some((r) => inRect(p, r));
}

/** True when the straight line from a to b never leaves the footprint (sampled). */
export function segmentInside(a: PlanPoint, b: PlanPoint, footprint: PlanRect[]): boolean {
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    if (!inFootprint({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }, footprint)) return false;
  }
  return true;
}

function rectDoor(ra: PlanRect, rb: PlanRect): PlanPoint | null {
  const x0 = Math.max(ra.x0, rb.x0);
  const x1 = Math.min(ra.x1, rb.x1);
  const z0 = Math.max(ra.z0, rb.z0);
  const z1 = Math.min(ra.z1, rb.z1);
  const touches = (Math.abs(z1 - z0) <= EDGE_EPS && x1 - x0 > EDGE_EPS) || (Math.abs(x1 - x0) <= EDGE_EPS && z1 - z0 > EDGE_EPS);
  return touches ? { x: (x0 + x1) / 2, z: (z0 + z1) / 2 } : null;
}

/**
 * Intermediate points of a walk from a to b that stays inside a footprint made
 * of rectangles: across the rectangles through the middles of their shared
 * edges, shortcuts taken where they stay inside, remaining diagonals squared
 * off. Returns null when a or b is not in the footprint.
 */
export function pathInside(a: PlanPoint, b: PlanPoint, footprint: PlanRect[]): PlanPoint[] | null {
  const starts = footprint.map((r, i) => (inRect(a, r) ? i : -1)).filter((i) => i >= 0);
  const goals = new Set(footprint.map((r, i) => (inRect(b, r) ? i : -1)).filter((i) => i >= 0));
  if (starts.length === 0 || goals.size === 0) return null;

  // breadth-first over rectangles
  const cameFrom = new Map<number, number | null>(starts.map((i) => [i, null]));
  const queue = [...starts];
  let goal: number | null = null;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (goals.has(cur)) {
      goal = cur;
      break;
    }
    footprint.forEach((r, i) => {
      if (!cameFrom.has(i) && rectDoor(footprint[cur]!, r)) {
        cameFrom.set(i, cur);
        queue.push(i);
      }
    });
  }
  if (goal === null) return null;
  const rects: number[] = [];
  for (let cur: number | null = goal; cur !== null; cur = cameFrom.get(cur) ?? null) rects.unshift(cur);

  let pts: PlanPoint[] = [a];
  for (let i = 0; i + 1 < rects.length; i++) pts.push(rectDoor(footprint[rects[i]!]!, footprint[rects[i + 1]!]!)!);
  pts.push(b);

  // take shortcuts that stay inside
  for (let i = 1; i + 1 < pts.length; ) {
    if (segmentInside(pts[i - 1]!, pts[i + 1]!, footprint)) pts.splice(i, 1);
    else i++;
  }

  // square off diagonals where a right-angled bend fits
  const squared: PlanPoint[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const p = squared.at(-1)!;
    const q = pts[i]!;
    const dx = Math.abs(q.x - p.x);
    const dz = Math.abs(q.z - p.z);
    if (Math.min(dx, dz) > 0.25) {
      const alongX = { x: q.x, z: p.z };
      const alongZ = { x: p.x, z: q.z };
      const corner = (dx >= dz ? [alongX, alongZ] : [alongZ, alongX]).find((c) => segmentInside(p, c, footprint) && segmentInside(c, q, footprint));
      if (corner) squared.push(corner);
    }
    squared.push(q);
  }
  pts = squared;
  return pts.slice(1, -1);
}

/**
 * The drawn line of a route. The graph only knows "area A, then area B"; drawn
 * naively through the two area anchors the line would cut across walls. So the
 * line crosses from one area to the next at the middle of their shared edge,
 * and inside an area it is walked through the footprint (see pathInside).
 * This shapes the drawing only — the route itself is `route.nodeIds`.
 */
export function routePoints(
  route: Route,
  nodes: Map<string, { elementId: string; levelId: string; position: PlanPoint; kind: 'area' | 'gate' | 'entrance' | 'vertical-stop' }>,
  model: StationModel,
): RoutePoint[] {
  const areaById = new Map(model.areas.map((a) => [a.id, a]));
  // the leg in which each node is reached (the first node belongs to the first leg)
  const arrive = new Map<string, number>();
  for (const leg of route.legs) for (const id of leg.nodeIds.slice(1)) arrive.set(id, leg.index);
  const raw: RoutePoint[] = [];
  for (const id of route.nodeIds) {
    const n = nodes.get(id);
    if (!n) continue;
    raw.push({ nodeId: id, levelId: n.levelId, plan: n.position, kind: n.kind, leg: arrive.get(id) ?? (id === route.nodeIds[0] ? 0 : -1), ...(n.kind === 'area' ? { areaId: n.elementId } : {}) });
  }

  // 1. cross between touching areas at their shared edge
  const withDoors: RoutePoint[] = [];
  raw.forEach((pt, i) => {
    withDoors.push(pt);
    const next = raw[i + 1];
    if (pt.areaId && next?.areaId) {
      const a = areaById.get(pt.areaId);
      const b = areaById.get(next.areaId);
      const door = a && b ? sharedEdgeMidpoint(a, b) : null;
      if (door) withDoors.push({ nodeId: null, levelId: pt.levelId, plan: door, kind: 'bend', leg: next.leg });
    }
  });

  // A gate sits on the line between two areas, a hair outside both footprints:
  // "at the area" means inside it or within the gate-line tolerance of it.
  const at = (p: PlanPoint, fp: PlanRect[]): PlanPoint | null => {
    const n = nearestInFootprint(p, fp);
    return n.distance <= GATE_LINE_TOLERANCE ? n.point : null;
  };

  // 2. drop area anchors that are merely passed through, remembering which area each stretch runs in
  const kept: RoutePoint[] = [];
  const stretchArea: (string | undefined)[] = []; // stretchArea[k]: area of kept[k] → kept[k+1]
  let passedThrough: string | undefined;
  withDoors.forEach((pt, i) => {
    const prev = withDoors[i - 1];
    const next = withDoors[i + 1];
    const area = pt.areaId ? areaById.get(pt.areaId) : undefined;
    if (area && prev && next && at(prev.plan, area.footprint) && at(next.plan, area.footprint)) {
      passedThrough = area.id;
      return;
    }
    if (kept.length > 0) stretchArea.push(passedThrough ?? pt.areaId ?? kept.at(-1)!.areaId);
    kept.push(pt);
    passedThrough = undefined;
  });

  // 3. walk each stretch inside its area
  const out: RoutePoint[] = [];
  const bend = (levelId: string, plan: PlanPoint) => {
    const last = out.at(-1)!.plan;
    if (Math.hypot(last.x - plan.x, last.z - plan.z) > 1e-6) out.push({ nodeId: null, levelId, plan, kind: 'bend', leg: -1 });
  };
  kept.forEach((pt, k) => {
    out.push(pt);
    const next = kept[k + 1];
    const area = stretchArea[k] ? areaById.get(stretchArea[k]!) : undefined;
    if (!next || !area) return;
    const from = at(pt.plan, area.footprint);
    const to = at(next.plan, area.footprint);
    if (!from || !to) return;
    bend(area.levelId, from);
    for (const p of pathInside(from, to, area.footprint) ?? []) bend(area.levelId, p);
    if (Math.hypot(to.x - next.plan.x, to.z - next.plan.z) > 1e-6) bend(area.levelId, to);
  });

  // A stretch belongs to the leg of the next point that knows its leg: walking
  // across a hall towards the stairs is part of 'take the stairs'.
  let current = route.legs.length - 1;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]!.leg >= 0) current = out[i]!.leg;
    else out[i]!.leg = current;
  }
  return out;
}

/** Height of the route line above a level's datum. */
export const ROUTE_LIFT = SLAB_TOP + 0.3;

/**
 * Boxes for the route: the line itself, direction chevrons on the longer
 * straights, small markers at gates and facilities, and distinct markers for
 * the start and the end. With a leg in focus that leg keeps the route colour
 * and the rest is drawn thinner and paler.
 */
export function buildRoutePrims(model: StationModel, route: Route | null, points: RoutePoint[], opts: ViewOptions): Prim[] {
  if (!route || points.length === 0) return [];
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const y = (levelId: string) => levelY(levelById.get(levelId)!, opts.explode) + ROUTE_LIFT;
  const inferredNodePairs = new Set<string>();
  for (const leg of route.legs) {
    if (leg.connection !== 'inferred') continue;
    for (let i = 0; i + 1 < leg.nodeIds.length; i++) inferredNodePairs.add(`${leg.nodeIds[i]}|${leg.nodeIds[i + 1]}`);
  }
  const p = opts.palette;
  const focus = opts.focusLeg;
  const prims: Prim[] = [];
  const base = { elementId: null, material: 'accent' as const, alpha: 1, outline: false, outlineColor: p.route, pickable: false };

  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const strong = focus === null || b.leg === focus;
    const va: Vec3 = [a.plan.x, y(a.levelId), a.plan.z];
    const vb: Vec3 = [b.plan.x, y(b.levelId), b.plan.z];
    const dash = a.nodeId !== null && b.nodeId !== null && inferredNodePairs.has(`${a.nodeId}|${b.nodeId}`) ? 0.7 : 0;
    const width = focus === null ? 0.26 : strong ? 0.32 : 0.16;
    for (const [da, db] of dashes(va, vb, dash)) {
      prims.push({ ...base, role: 'route', a: da, b: db, width, thickness: width * 0.6, color: strong ? p.route : p.routeDim });
    }
    // a chevron pointing the way on straights long enough to carry one
    const dx = vb[0] - va[0];
    const dz = vb[2] - va[2];
    const len = Math.hypot(dx, dz);
    if (strong && a.levelId === b.levelId && len >= 2.4) {
      const ux = dx / len;
      const uz = dz / len;
      const tip: Vec3 = [(va[0] + vb[0]) / 2 + ux * 0.2, va[1] + width * 0.3 + 0.03, (va[2] + vb[2]) / 2 + uz * 0.2];
      for (const side of [-1, 1]) {
        const tail: Vec3 = [tip[0] - ux * 0.34 - uz * side * 0.2, tip[1], tip[2] - uz * 0.34 + ux * side * 0.2];
        prims.push({ ...base, role: 'route-arrow', a: tip, b: tail, width: 0.075, thickness: 0.03, color: p.routeHalo });
      }
    }
  }

  points.forEach((pt, i) => {
    const first = i === 0;
    const last = i === points.length - 1;
    if (!first && !last && (pt.kind === 'area' || pt.kind === 'bend')) return;
    const cy = y(pt.levelId);
    const { x, z } = pt.plan;
    const cube = (r: number, y0: number, y1: number, color: string): Prim => ({
      ...base,
      role: 'route-node',
      a: [x - r, (y0 + y1) / 2, z],
      b: [x + r, (y0 + y1) / 2, z],
      width: r * 2,
      thickness: y1 - y0,
      color,
    });
    if (first) {
      // start: a flat ringed plate
      prims.push(cube(0.5, cy - 0.12, cy - 0.02, p.routeHalo), cube(0.34, cy - 0.02, cy + 0.14, p.route));
    } else if (last) {
      // end: a pin standing above the floor
      prims.push(cube(0.05, cy - 0.1, cy + 0.9, p.route), cube(0.36, cy + 0.9, cy + 1.5, p.route), cube(0.2, cy + 1.02, cy + 1.38, p.routeHalo));
    } else {
      const strong = focus === null || pt.leg === focus || points[i + 1]?.leg === focus;
      prims.push(cube(strong ? 0.2 : 0.12, cy - 0.16, cy + 0.2, strong ? p.route : p.routeDim));
    }
  });
  return prims;
}

/** Bounding box of one leg of the drawn route (or of all of it), in scene coordinates. */
export function routeBox(model: StationModel, points: RoutePoint[], leg: number | null, explode: number): { min: Vec3; max: Vec3 } | null {
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const add = (pt: RoutePoint) => {
    const yy = levelY(levelById.get(pt.levelId)!, explode);
    min[0] = Math.min(min[0], pt.plan.x);
    max[0] = Math.max(max[0], pt.plan.x);
    min[1] = Math.min(min[1], yy);
    max[1] = Math.max(max[1], yy + 1);
    min[2] = Math.min(min[2], pt.plan.z);
    max[2] = Math.max(max[2], pt.plan.z);
  };
  points.forEach((pt, i) => {
    if (leg === null || pt.leg === leg) {
      add(pt);
      if (i > 0 && leg !== null) add(points[i - 1]!);
    }
  });
  return Number.isFinite(min[0]) ? { min, max } : null;
}
