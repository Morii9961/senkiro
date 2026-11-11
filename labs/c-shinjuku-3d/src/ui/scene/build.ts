/**
 * Turns the StationModel into drawable primitives (boxes and beams) and
 * labels. Pure functions, no three.js and no React: the 3D view feeds the
 * result to a geometry merger, and the unit tests check that every model
 * element is actually drawn.
 */
import type { RunningStatus } from '../../domain/overlay';
import type { Route } from '../../domain/route';
import type { Area, Level, PlanPoint, PlanRect, StationModel } from '../../domain/types';
import { GATE_LINE_TOLERANCE, nearestInFootprint } from '../../domain/validate';
import { mix, type Palette } from '../theme';

export type Vec3 = [number, number, number];

export interface Prim {
  /** Model element this primitive draws; null for level slabs and decoration. */
  elementId: string | null;
  role:
    | 'shell'
    | 'area'
    | 'platform-edge'
    | 'gate'
    | 'entrance'
    | 'elevator'
    | 'stairs'
    | 'escalator'
    | 'link'
    | 'block'
    | 'block-hatch'
    | 'route'
    | 'route-node';
  /** A beam from `a` to `b` with a rectangular cross-section. Axis-aligned boxes are beams along x. */
  a: Vec3;
  b: Vec3;
  width: number;
  thickness: number;
  color: string;
  /** 1 = opaque mesh, <1 = translucent mesh, 0 = outline only. */
  alpha: number;
  outline: boolean;
  outlineColor: string;
  pickable: boolean;
}

export interface ViewOptions {
  /** 0..1 — how far the levels are pulled apart. */
  explode: number;
  /** null = all levels. */
  activeLevelId: string | null;
  ghostOthers: boolean;
  /** 0..1 */
  shellOpacity: number;
  showVerticals: boolean;
  showBlocks: boolean;
  palette: Palette;
  route: Route | null;
  selectedId: string | null;
  /** Worst running status per platform id while an operations overlay is on. */
  platformStatus: Map<string, RunningStatus> | null;
}

export const EXPLODE_GAIN = 1.9;
const SLAB = 0.14;
const PLATFORM_SLAB = 0.24;

export function levelY(level: Level, explode: number): number {
  return level.elevation * (1 + explode * EXPLODE_GAIN);
}

export function elevationY(elevation: number, explode: number): number {
  return elevation * (1 + explode * EXPLODE_GAIN);
}

type Visibility = 'full' | 'ghost' | 'hidden';

function levelVisibility(levelId: string, opts: ViewOptions): Visibility {
  if (opts.activeLevelId === null || opts.activeLevelId === levelId) return 'full';
  return opts.ghostOthers ? 'ghost' : 'hidden';
}

function boundsOf(rects: PlanRect[]): PlanRect {
  return rects.reduce(
    (acc, r) => ({ x0: Math.min(acc.x0, r.x0), x1: Math.max(acc.x1, r.x1), z0: Math.min(acc.z0, r.z0), z1: Math.max(acc.z1, r.z1) }),
    { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
  );
}

export function levelBounds(model: StationModel, levelId: string, pad = 1.6): PlanRect {
  const rects = model.areas.filter((a) => a.levelId === levelId).flatMap((a) => a.footprint);
  const b = boundsOf(rects);
  return { x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad };
}

export function modelBounds(model: StationModel): PlanRect {
  return boundsOf([...model.areas.flatMap((a) => a.footprint), ...model.unverifiedBlocks.map((b) => b.box)]);
}

function rectsTouch(a: PlanRect, b: PlanRect, eps = 0.01): boolean {
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (overlapX >= -eps && overlapZ > eps) || (overlapZ >= -eps && overlapX > eps);
}

export function areasTouch(a: Area, b: Area): boolean {
  return a.footprint.some((ra) => b.footprint.some((rb) => rectsTouch(ra, rb)));
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  return { a: [x0, cy, cz] as Vec3, b: [x1, cy, cz] as Vec3, width: z1 - z0, thickness: y1 - y0 };
}

function areaColor(area: Area, p: Palette, status: RunningStatus | undefined): string {
  if (area.kind === 'platform') {
    if (status === 'delayed') return mix(p.platform, p.statusDelayed, 0.55);
    if (status === 'suspended' || status === 'partial-suspension') return mix(p.platform, p.statusSuspended, 0.55);
    if (status === 'normal') return mix(p.platform, p.statusNormal, 0.4);
    return p.platform;
  }
  if (area.fareZone === 'unpaid') return p.unpaid;
  return area.fareZone === 'paid:keio' ? p.paidKeio : p.paidJr;
}

export function routeElementIds(route: Route | null): Set<string> {
  const ids = new Set<string>();
  if (!route) return ids;
  for (const leg of route.legs) {
    ids.add(leg.elementId);
    if (leg.fromAreaId) ids.add(leg.fromAreaId);
    if (leg.toAreaId) ids.add(leg.toAreaId);
  }
  return ids;
}

export function buildPrims(model: StationModel, opts: ViewOptions): Prim[] {
  const p = opts.palette;
  const prims: Prim[] = [];
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const areaById = new Map(model.areas.map((a) => [a.id, a]));
  const onRoute = routeElementIds(opts.route);
  const routeActive = opts.route !== null;
  const yOf = (levelId: string) => levelY(levelById.get(levelId)!, opts.explode);

  /** Applies ghosting, route dimming and selection to a base colour. */
  const style = (
    elementId: string | null,
    color: string,
    vis: Visibility,
    baseAlpha = 1,
  ): { color: string; alpha: number; outlineColor: string; pickable: boolean } | null => {
    if (vis === 'hidden') return null;
    let c = color;
    let alpha = baseAlpha;
    let outlineColor = mix(color, p.ink, 0.55);
    if (routeActive && elementId && !onRoute.has(elementId)) {
      c = mix(c, p.background, 0.55);
      outlineColor = mix(outlineColor, p.background, 0.6);
    }
    if (elementId && elementId === opts.selectedId) {
      c = mix(c, p.selected, 0.6);
      outlineColor = p.selected;
    }
    if (vis === 'ghost') {
      alpha = Math.min(alpha, 0.1);
      outlineColor = mix(outlineColor, p.background, 0.75);
    }
    return { color: c, alpha, outlineColor, pickable: vis === 'full' };
  };

  // --- level slabs ("shell") --------------------------------------------------
  for (const level of model.levels) {
    const vis = levelVisibility(level.id, opts);
    if (vis === 'hidden') continue;
    const b = levelBounds(model, level.id);
    const y = yOf(level.id);
    prims.push({
      elementId: null,
      role: 'shell',
      ...box(b.x0, b.x1, y - 0.3, y - 0.06, b.z0, b.z1),
      color: p.shell,
      alpha: vis === 'ghost' ? Math.min(opts.shellOpacity * 0.25, 0.05) : opts.shellOpacity * 0.55,
      outline: true,
      outlineColor: mix(p.shell, p.background, vis === 'ghost' ? 0.7 : 0.25),
      pickable: false,
    });
  }

  // --- areas ---------------------------------------------------------------------
  for (const area of model.areas) {
    const vis = levelVisibility(area.levelId, opts);
    const s = style(area.id, areaColor(area, p, opts.platformStatus?.get(area.id)), vis);
    if (!s) continue;
    const y = yOf(area.levelId);
    const h = area.kind === 'platform' ? PLATFORM_SLAB : SLAB;
    for (const r of area.footprint) {
      prims.push({ elementId: area.id, role: 'area', ...box(r.x0, r.x1, y, y + h, r.z0, r.z1), ...s, outline: true });
      if (area.kind === 'platform' && vis === 'full') {
        // the two platform edges, drawn as dark strips
        for (const z of [r.z0 + 0.09, r.z1 - 0.09]) {
          prims.push({
            elementId: area.id,
            role: 'platform-edge',
            ...box(r.x0, r.x1, y + h, y + h + 0.03, z - 0.09, z + 0.09),
            color: routeActive && !onRoute.has(area.id) ? mix(p.platformEdge, p.background, 0.55) : p.platformEdge,
            alpha: 1,
            outline: false,
            outlineColor: p.platformEdge,
            pickable: true,
          });
        }
      }
    }
  }

  // --- links between areas that do not touch (and every inferred link) ------------
  for (const link of model.passages) {
    const from = areaById.get(link.fromAreaId);
    const to = areaById.get(link.toAreaId);
    if (!from || !to) continue;
    if (link.connection === 'verified' && areasTouch(from, to)) continue;
    const vis =
      levelVisibility(from.levelId, opts) === 'full' || levelVisibility(to.levelId, opts) === 'full'
        ? 'full'
        : levelVisibility(from.levelId, opts);
    const s = style(link.id, p.link, vis);
    if (!s) continue;
    const a: Vec3 = [from.anchor.x, yOf(from.levelId) + 0.2, from.anchor.z];
    const b: Vec3 = [to.anchor.x, yOf(to.levelId) + 0.2, to.anchor.z];
    for (const [da, db] of dashes(a, b, link.connection === 'inferred' ? 1.1 : 0)) {
      prims.push({ elementId: link.id, role: 'link', a: da, b: db, width: 0.22, thickness: 0.08, ...s, outline: false });
    }
  }

  // --- gates ---------------------------------------------------------------------
  for (const gate of model.gates) {
    const vis = levelVisibility(gate.levelId, opts);
    const s = style(gate.id, gate.gateKind === 'transfer' ? p.gateTransfer : p.gate, vis);
    if (!s) continue;
    const y = yOf(gate.levelId);
    const { x, z } = gate.position;
    prims.push({ elementId: gate.id, role: 'gate', ...box(x - 0.42, x + 0.42, y + 0.02, y + 1.15, z - 0.42, z + 0.42), ...s, outline: true });
  }

  // --- entrances -------------------------------------------------------------------
  for (const ent of model.entrances) {
    const vis = levelVisibility(ent.levelId, opts);
    const s = style(ent.id, p.entrance, vis);
    if (!s) continue;
    const y = yOf(ent.levelId);
    const { x, z } = ent.position;
    prims.push({ elementId: ent.id, role: 'entrance', ...box(x - 0.1, x + 0.1, y + 0.02, y + 1.5, z - 0.1, z + 0.1), ...s, outline: false });
    prims.push({ elementId: ent.id, role: 'entrance', ...box(x - 0.38, x + 0.38, y + 1.5, y + 2.1, z - 0.38, z + 0.38), ...s, outline: true });
  }

  // --- vertical facilities --------------------------------------------------------
  for (const v of model.verticals) {
    const stopVis = v.stops.map((s) => levelVisibility(s.levelId, opts));
    const vis: Visibility = stopVis.includes('full') ? 'full' : stopVis.includes('ghost') ? 'ghost' : 'hidden';
    const routed = onRoute.has(v.id);
    if (v.verticalKind !== 'elevator' && !opts.showVerticals && !routed && v.id !== opts.selectedId) continue;
    if (v.verticalKind === 'elevator') {
      const s = style(v.id, p.elevator, vis);
      if (!s) continue;
      const ys = v.stops.map((st) => yOf(st.levelId));
      const { x, z } = v.stops[0]!.position;
      // translucent shaft over the whole travel, opaque cab at every stop
      prims.push({
        elementId: v.id,
        role: 'elevator',
        ...box(x - 0.36, x + 0.36, Math.min(...ys) + 0.3, Math.max(...ys) + 1.2, z - 0.36, z + 0.36),
        ...s,
        alpha: Math.min(s.alpha, 0.3),
        outline: true,
      });
      for (const y of ys) {
        prims.push({ elementId: v.id, role: 'elevator', ...box(x - 0.3, x + 0.3, y + 0.28, y + 1.05, z - 0.3, z + 0.3), ...s, outline: false });
      }
    } else {
      const s = style(v.id, v.verticalKind === 'stairs' ? p.stairs : p.escalator, vis);
      if (!s) continue;
      for (let i = 0; i + 1 < v.stops.length; i++) {
        const a = v.stops[i]!;
        const b = v.stops[i + 1]!;
        prims.push({
          elementId: v.id,
          role: v.verticalKind,
          a: [a.position.x, yOf(a.levelId) + 0.3, a.position.z],
          b: [b.position.x, yOf(b.levelId) + 0.3, b.position.z],
          width: v.verticalKind === 'stairs' ? 0.5 : 0.36,
          thickness: 0.1,
          ...s,
          outline: false,
        });
      }
    }
  }

  // --- unverified blocks ----------------------------------------------------------
  if (opts.showBlocks) {
    for (const blk of model.unverifiedBlocks) {
      const y0 = elevationY(blk.elevation, opts.explode);
      const y1 = y0 + blk.height;
      const selected = blk.id === opts.selectedId;
      const color = selected ? mix(p.block, p.selected, 0.5) : p.block;
      const r = blk.box;
      prims.push({
        elementId: blk.id,
        role: 'block',
        ...box(r.x0, r.x1, y0, y1, r.z0, r.z1),
        color,
        alpha: opts.activeLevelId === null ? 0.16 : 0.07,
        outline: true,
        outlineColor: mix(color, p.ink, 0.35),
        pickable: true,
      });
      // diagonal hatching on the top face: the drafting convention for "not surveyed"
      const span = r.x1 - r.x0 + (r.z1 - r.z0);
      for (let d = 1.2; d < span; d += 1.6) {
        const ax = Math.min(r.x0 + d, r.x1);
        const az = r.z0 + Math.max(0, d - (r.x1 - r.x0));
        const bx = r.x0 + Math.max(0, d - (r.z1 - r.z0));
        const bz = Math.min(r.z0 + d, r.z1);
        prims.push({
          elementId: blk.id,
          role: 'block-hatch',
          a: [ax, y1 + 0.02, az],
          b: [bx, y1 + 0.02, bz],
          width: 0.07,
          thickness: 0.02,
          color: mix(color, p.ink, 0.25),
          alpha: 1,
          outline: false,
          outlineColor: color,
          pickable: true,
        });
      }
    }
  }

  return prims;
}

function dashes(a: Vec3, b: Vec3, dash: number): [Vec3, Vec3][] {
  if (dash <= 0) return [[a, b]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.floor(len / (dash * 2)));
  const out: [Vec3, Vec3][] = [];
  const at = (k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < n; i++) out.push([at(i / n), at((i + 0.5) / n)]);
  return out;
}

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

export interface RoutePoint {
  /** Graph node this point stands for; null for points added only to shape the line. */
  nodeId: string | null;
  levelId: string;
  plan: PlanPoint;
  kind: 'area' | 'gate' | 'entrance' | 'vertical-stop' | 'bend';
  /** Area the point belongs to, when it is an area anchor. */
  areaId?: string;
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
  const raw: RoutePoint[] = [];
  for (const id of route.nodeIds) {
    const n = nodes.get(id);
    if (!n) continue;
    raw.push({ nodeId: id, levelId: n.levelId, plan: n.position, kind: n.kind, ...(n.kind === 'area' ? { areaId: n.elementId } : {}) });
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
      if (door) withDoors.push({ nodeId: null, levelId: pt.levelId, plan: door, kind: 'bend' });
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
    if (Math.hypot(last.x - plan.x, last.z - plan.z) > 1e-6) out.push({ nodeId: null, levelId, plan, kind: 'bend' });
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
  return out;
}

export function buildRoutePrims(model: StationModel, route: Route | null, points: RoutePoint[], opts: ViewOptions): Prim[] {
  if (!route || points.length === 0) return [];
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const y = (levelId: string) => levelY(levelById.get(levelId)!, opts.explode) + 0.62;
  const inferredNodePairs = new Set<string>();
  for (const leg of route.legs) {
    if (leg.connection !== 'inferred') continue;
    for (let i = 0; i + 1 < leg.nodeIds.length; i++) inferredNodePairs.add(`${leg.nodeIds[i]}|${leg.nodeIds[i + 1]}`);
  }
  const prims: Prim[] = [];
  const common = {
    color: opts.palette.route,
    alpha: 1,
    outline: false,
    outlineColor: opts.palette.route,
    pickable: false,
  };
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const va: Vec3 = [a.plan.x, y(a.levelId), a.plan.z];
    const vb: Vec3 = [b.plan.x, y(b.levelId), b.plan.z];
    const dash = a.nodeId !== null && b.nodeId !== null && inferredNodePairs.has(`${a.nodeId}|${b.nodeId}`) ? 0.7 : 0;
    for (const [da, db] of dashes(va, vb, dash)) {
      prims.push({ elementId: null, role: 'route', a: da, b: db, width: 0.3, thickness: 0.3, ...common });
    }
  }
  points.forEach((pt, i) => {
    const big = i === 0 || i === points.length - 1;
    if (!big && (pt.kind === 'area' || pt.kind === 'bend')) return;
    const r = big ? 0.5 : 0.3;
    const cy = y(pt.levelId);
    prims.push({
      elementId: null,
      role: 'route-node',
      ...box(pt.plan.x - r, pt.plan.x + r, cy - r, cy + r, pt.plan.z - r, pt.plan.z + r),
      ...common,
    });
  });
  return prims;
}

// ---------------------------------------------------------------------------
// labels
// ---------------------------------------------------------------------------

export interface SceneLabel {
  key: string;
  elementId: string | null;
  text: string;
  position: Vec3;
  /** 0 always · 1 far · 2 medium · 3 close */
  tier: 0 | 1 | 2 | 3;
  /** Higher wins when labels collide. */
  priority: number;
  variant: 'level' | 'platform' | 'gate' | 'area' | 'entrance' | 'lift' | 'block';
}

export function buildLabels(
  model: StationModel,
  opts: ViewOptions,
  name: (id: string) => string,
  texts: { unverified: string },
): SceneLabel[] {
  const labels: SceneLabel[] = [];
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const yOf = (levelId: string) => levelY(levelById.get(levelId)!, opts.explode);
  const onRoute = routeElementIds(opts.route);
  const visible = (levelId: string) => levelVisibility(levelId, opts) === 'full';
  const boost = (id: string) => (onRoute.has(id) || id === opts.selectedId ? 100 : 0);
  const tierOf = (id: string, tier: SceneLabel['tier']): SceneLabel['tier'] => (onRoute.has(id) || id === opts.selectedId ? 0 : tier);

  for (const level of model.levels) {
    if (!visible(level.id)) continue;
    const b = levelBounds(model, level.id);
    labels.push({
      key: `level:${level.id}`,
      elementId: null,
      text: name(level.id),
      position: [b.x0, yOf(level.id) + 0.2, b.z1],
      tier: 0,
      priority: 90,
      variant: 'level',
    });
  }

  for (const area of model.areas) {
    if (!visible(area.levelId)) continue;
    const y = yOf(area.levelId);
    if (area.kind === 'platform') {
      const nums = area.tracks.map((x) => x.number);
      labels.push({
        key: `pf:${area.id}`,
        elementId: area.id,
        text: nums.length > 2 ? `${nums[0]}–${nums.at(-1)}` : nums.join('·'),
        position: [area.anchor.x, y + 0.9, area.anchor.z],
        tier: tierOf(area.id, 1),
        priority: 60 + boost(area.id),
        variant: 'platform',
      });
    } else if (area.names.ja !== null) {
      labels.push({
        key: `area:${area.id}`,
        elementId: area.id,
        text: name(area.id),
        position: [area.anchor.x, y + 0.7, area.anchor.z],
        tier: tierOf(area.id, 3),
        priority: 20 + boost(area.id),
        variant: 'area',
      });
    }
  }

  for (const gate of model.gates) {
    if (!visible(gate.levelId)) continue;
    labels.push({
      key: `gate:${gate.id}`,
      elementId: gate.id,
      text: name(gate.id),
      position: [gate.position.x, yOf(gate.levelId) + 1.7, gate.position.z],
      tier: tierOf(gate.id, 2),
      priority: 50 + boost(gate.id),
      variant: 'gate',
    });
  }

  for (const ent of model.entrances) {
    if (!visible(ent.levelId)) continue;
    labels.push({
      key: `ent:${ent.id}`,
      elementId: ent.id,
      text: name(ent.id),
      position: [ent.position.x, yOf(ent.levelId) + 2.5, ent.position.z],
      tier: tierOf(ent.id, ent.names.ja ? 2 : 3),
      priority: (ent.names.ja ? 45 : 15) + boost(ent.id),
      variant: 'entrance',
    });
  }

  for (const v of model.verticals) {
    if (v.verticalKind !== 'elevator' || !v.operatorLabel) continue;
    const top = v.stops.reduce((best, s) => (yOf(s.levelId) > yOf(best.levelId) ? s : best), v.stops[0]!);
    if (!v.stops.some((s) => visible(s.levelId))) continue;
    labels.push({
      key: `lift:${v.id}`,
      elementId: v.id,
      text: v.operatorLabel,
      position: [top.position.x, yOf(top.levelId) + 1.6, top.position.z],
      tier: tierOf(v.id, 3),
      priority: 30 + boost(v.id),
      variant: 'lift',
    });
  }

  if (opts.showBlocks) {
    for (const blk of model.unverifiedBlocks) {
      const y = elevationY(blk.elevation, opts.explode) + blk.height;
      labels.push({
        key: `block:${blk.id}`,
        elementId: blk.id,
        text: `${texts.unverified} · ${name(blk.id)}`,
        position: [(blk.box.x0 + blk.box.x1) / 2, y + 0.5, (blk.box.z0 + blk.box.z1) / 2],
        tier: blk.id === opts.selectedId ? 0 : 1,
        priority: 40 + boost(blk.id),
        variant: 'block',
      });
    }
  }
  return labels;
}

/**
 * Highest label tier shown at a given drawing scale (screen pixels per model
 * unit at the orbit target). Scale rather than raw distance, so a phone and a
 * wide monitor make the same decision for the same apparent size.
 */
export function maxTierForScale(pxPerUnit: number): 0 | 1 | 2 | 3 {
  if (pxPerUnit < 2.6) return 0;
  if (pxPerUnit < 6.5) return 1;
  if (pxPerUnit < 13) return 2;
  return 3;
}

/**
 * The box the camera has to frame: everything drawn at full strength.
 * With one level isolated it is that level only.
 */
export function sceneBox(model: StationModel, opts: Pick<ViewOptions, 'explode' | 'activeLevelId' | 'showBlocks'>): { min: Vec3; max: Vec3 } {
  const headroom = 2.4;
  if (opts.activeLevelId !== null) {
    const level = model.levels.find((l) => l.id === opts.activeLevelId);
    if (level) {
      const b = levelBounds(model, level.id);
      const y = levelY(level, opts.explode);
      return { min: [b.x0, y - 0.3, b.z0], max: [b.x1, y + headroom, b.z1] };
    }
  }
  const plan = boundsOf([...model.levels.map((l) => levelBounds(model, l.id)), ...(opts.showBlocks ? model.unverifiedBlocks.map((b) => b.box) : [])]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const level of model.levels) {
    const y = levelY(level, opts.explode);
    y0 = Math.min(y0, y - 0.3);
    y1 = Math.max(y1, y + headroom);
  }
  if (opts.showBlocks) {
    for (const blk of model.unverifiedBlocks) {
      const y = elevationY(blk.elevation, opts.explode);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + blk.height);
    }
  }
  return { min: [plan.x0, y0, plan.z0], max: [plan.x1, y1, plan.z1] };
}
