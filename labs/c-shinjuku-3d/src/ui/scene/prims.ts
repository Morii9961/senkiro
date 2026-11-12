/**
 * Shared vocabulary of the scene builders: the box primitive everything is
 * made of, view options, and plan-geometry helpers. No three.js, no React.
 */
import type { RunningStatus } from '../../domain/overlay';
import type { Route } from '../../domain/route';
import type { Level, PlanPoint, PlanRect } from '../../domain/types';
import type { Palette } from '../theme';

export type Vec3 = [number, number, number];

/** How a primitive is shaded. One GPU material per kind. */
export type MaterialKind = 'floor' | 'wall' | 'concrete' | 'metal' | 'dark' | 'accent' | 'glass';

export type PrimRole =
  | 'shell'
  | 'shell-edge'
  | 'area'
  | 'bridge'
  | 'wall'
  | 'platform-edge'
  | 'line-band'
  | 'track'
  | 'column'
  | 'gate'
  | 'entrance'
  | 'elevator'
  | 'stairs'
  | 'escalator'
  | 'link'
  | 'block'
  | 'block-hatch'
  | 'route'
  | 'route-node'
  | 'route-arrow';

export interface Prim {
  /** Model element this primitive draws; null for decoration. */
  elementId: string | null;
  role: PrimRole;
  material: MaterialKind;
  /** A beam from `a` to `b` with a rectangular cross-section. Axis-aligned boxes are beams along x. */
  a: Vec3;
  b: Vec3;
  width: number;
  thickness: number;
  color: string;
  /** 1 = opaque, <1 = translucent. */
  alpha: number;
  outline: boolean;
  outlineColor: string;
  pickable: boolean;
  /** Brightness of the bottom and the top vertices: a baked ambient-occlusion ramp. */
  shade?: [number, number];
}

/** A flat quad with per-corner opacity — used for baked contact shadows. */
export interface Decal {
  corners: [Vec3, Vec3, Vec3, Vec3];
  alphas: [number, number, number, number];
  color: string;
}

export interface ViewOptions {
  /** 0..1 — how far the floors are pulled apart. */
  explode: number;
  /** Floors (level ordinals) drawn at full strength; null = all of them. */
  focusOrdinals: ReadonlySet<number> | null;
  /** Draw the other floors faintly instead of hiding them. */
  ghostOthers: boolean;
  /** 0..1 */
  shellOpacity: number;
  showVerticals: boolean;
  showBlocks: boolean;
  palette: Palette;
  route: Route | null;
  /** Route leg to emphasise; null = the whole route. */
  focusLeg: number | null;
  selectedId: string | null;
  /** Worst running status per platform id while an operations overlay is on. */
  platformStatus: Map<string, RunningStatus> | null;
}

export type Visibility = 'full' | 'ghost' | 'hidden';

/** Drawing height of one schematic elevation unit with the floors stacked close. */
export const LEVEL_SCALE = 0.55;
export const EXPLODE_GAIN = 2.4;

/** Heights above a level's datum. */
export const SLAB_TOP = 0.14;
export const PLATFORM_TOP = 0.3;
export const WALL_HEIGHT = 0.6;

export function elevationY(elevation: number, explode: number): number {
  return elevation * LEVEL_SCALE * (1 + explode * EXPLODE_GAIN);
}

export function levelY(level: Level, explode: number): number {
  return elevationY(level.elevation, explode);
}

export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  return { a: [x0, cy, cz] as Vec3, b: [x1, cy, cz] as Vec3, width: z1 - z0, thickness: y1 - y0 };
}

// ---------------------------------------------------------------------------
// plan geometry
// ---------------------------------------------------------------------------

export const EPS = 0.02;

export function boundsOf(rects: PlanRect[]): PlanRect {
  return rects.reduce(
    (acc, r) => ({ x0: Math.min(acc.x0, r.x0), x1: Math.max(acc.x1, r.x1), z0: Math.min(acc.z0, r.z0), z1: Math.max(acc.z1, r.z1) }),
    { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
  );
}

/** `r` with `hole` cut out, as up to four rectangles. */
export function subtractRect(r: PlanRect, hole: PlanRect): PlanRect[] {
  const ix0 = Math.max(r.x0, hole.x0);
  const ix1 = Math.min(r.x1, hole.x1);
  const iz0 = Math.max(r.z0, hole.z0);
  const iz1 = Math.min(r.z1, hole.z1);
  if (ix1 - ix0 <= EPS || iz1 - iz0 <= EPS) return [r];
  const out: PlanRect[] = [];
  if (ix0 > r.x0 + EPS) out.push({ x0: r.x0, x1: ix0, z0: r.z0, z1: r.z1 });
  if (ix1 < r.x1 - EPS) out.push({ x0: ix1, x1: r.x1, z0: r.z0, z1: r.z1 });
  if (iz0 > r.z0 + EPS) out.push({ x0: ix0, x1: ix1, z0: r.z0, z1: iz0 });
  if (iz1 < r.z1 - EPS) out.push({ x0: ix0, x1: ix1, z0: iz1, z1: r.z1 });
  return out;
}

export function subtractRects(rects: PlanRect[], holes: PlanRect[]): PlanRect[] {
  let out = rects;
  for (const h of holes) out = out.flatMap((r) => subtractRect(r, h));
  return out;
}

/**
 * The area covered by `rects` (which may overlap) as rectangles that do not
 * overlap: the plane is cut along every rectangle side, the covered cells are
 * kept and neighbouring cells are joined again, first along x, then along z.
 */
export function unionRects(rects: PlanRect[]): PlanRect[] {
  const uniq = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.filter((v, i) => i === 0 || v - sorted[i - 1]! > 1e-6);
  };
  const xs = uniq(rects.flatMap((r) => [r.x0, r.x1]));
  const zs = uniq(rects.flatMap((r) => [r.z0, r.z1]));
  const covered = (x: number, z: number) => rects.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  let open: PlanRect[] = [];
  const done: PlanRect[] = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    const z0 = zs[j]!;
    const z1 = zs[j + 1]!;
    const runs: PlanRect[] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      if (!covered((xs[i]! + xs[i + 1]!) / 2, (z0 + z1) / 2)) continue;
      const last = runs.at(-1);
      if (last && Math.abs(last.x1 - xs[i]!) < 1e-6) last.x1 = xs[i + 1]!;
      else runs.push({ x0: xs[i]!, x1: xs[i + 1]!, z0, z1 });
    }
    // a run that continues the same span from the band before grows that rectangle
    const next: PlanRect[] = [];
    for (const run of runs) {
      const k = open.findIndex((o) => Math.abs(o.x0 - run.x0) < 1e-6 && Math.abs(o.x1 - run.x1) < 1e-6);
      if (k >= 0) {
        const grown = open.splice(k, 1)[0]!;
        grown.z1 = z1;
        next.push(grown);
      } else next.push(run);
    }
    done.push(...open);
    open = next;
  }
  return [...done, ...open];
}

/**
 * One straight piece of a footprint's outline.
 * `axis` is the direction the edge runs along; `at` is its fixed coordinate on
 * the other axis; `inward` points from the edge into the footprint.
 */
export interface Edge {
  axis: 'x' | 'z';
  at: number;
  lo: number;
  hi: number;
  inward: 1 | -1;
}

type Interval = [number, number];

function cut(intervals: Interval[], lo: number, hi: number): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of intervals) {
    if (hi <= a || lo >= b) out.push([a, b]);
    else {
      if (lo > a) out.push([a, lo]);
      if (hi < b) out.push([hi, b]);
    }
  }
  return out;
}

/** The four sides of a rectangle as edges. */
function sides(r: PlanRect): Edge[] {
  return [
    { axis: 'x', at: r.z0, lo: r.x0, hi: r.x1, inward: 1 },
    { axis: 'x', at: r.z1, lo: r.x0, hi: r.x1, inward: -1 },
    { axis: 'z', at: r.x0, lo: r.z0, hi: r.z1, inward: 1 },
    { axis: 'z', at: r.x1, lo: r.z0, hi: r.z1, inward: -1 },
  ];
}

/** Interval of `edge` that rectangle `o` touches from the outside, or null. */
function touching(edge: Edge, o: PlanRect): Interval | null {
  const [oLo, oHi, oNear, oFar] = edge.axis === 'x' ? [o.x0, o.x1, o.z0, o.z1] : [o.z0, o.z1, o.x0, o.x1];
  // the outside of the edge is on the −inward side
  const outsideFace = edge.inward === 1 ? oFar : oNear;
  if (Math.abs(outsideFace - edge.at) > EPS) return null;
  const lo = Math.max(edge.lo, oLo);
  const hi = Math.min(edge.hi, oHi);
  return hi - lo > EPS ? [lo, hi] : null;
}

/**
 * Outline of a footprint made of rectangles: every rectangle side, minus the
 * stretches where another rectangle of the same footprint continues behind it.
 * `openings` are further rectangles (neighbouring areas one can walk into)
 * whose shared stretches are left open as well.
 */
export function outlineEdges(footprint: PlanRect[], openings: PlanRect[] = []): Edge[] {
  const out: Edge[] = [];
  for (const r of footprint) {
    for (const side of sides(r)) {
      let parts: Interval[] = [[side.lo, side.hi]];
      for (const o of [...footprint, ...openings]) {
        if (o === r) continue;
        const t = touching(side, o);
        if (t) parts = cut(parts, t[0], t[1]);
      }
      for (const [lo, hi] of parts) if (hi - lo > EPS) out.push({ ...side, lo, hi });
    }
  }
  return out;
}

/** Removes a gap of `halfWidth` either side of the point of `edges` nearest to `p` (if within `reach`). */
export function openAt(edges: Edge[], p: PlanPoint, halfWidth: number, reach: number): { edges: Edge[]; hit: Edge | null } {
  let best: { i: number; d: number; t: number } | null = null;
  edges.forEach((e, i) => {
    const along = e.axis === 'x' ? p.x : p.z;
    const across = e.axis === 'x' ? p.z : p.x;
    const t = Math.min(e.hi, Math.max(e.lo, along));
    const d = Math.hypot(along - t, across - e.at);
    if (!best || d < best.d) best = { i, d, t };
  });
  const b = best as { i: number; d: number; t: number } | null;
  if (!b || b.d > reach) return { edges, hit: null };
  const hit = edges[b.i]!;
  const out: Edge[] = [];
  edges.forEach((e, i) => {
    if (i !== b.i) {
      // the same wall line may continue on a neighbouring edge piece
      if (e.axis === hit.axis && Math.abs(e.at - hit.at) < EPS && e.inward === hit.inward) {
        for (const [lo, hi] of cut([[e.lo, e.hi]], b.t - halfWidth, b.t + halfWidth)) if (hi - lo > EPS) out.push({ ...e, lo, hi });
      } else out.push(e);
      return;
    }
    for (const [lo, hi] of cut([[e.lo, e.hi]], b.t - halfWidth, b.t + halfWidth)) if (hi - lo > EPS) out.push({ ...e, lo, hi });
  });
  return { edges: out, hit };
}

/**
 * Where a link between two areas is drawn: from the point of one footprint to
 * the point of the other that are closest together. For areas that touch or
 * overlap in plan there is no gap to bridge, and the anchors are used instead.
 */
export function linkEnds(a: { footprint: PlanRect[]; anchor: PlanPoint }, b: { footprint: PlanRect[]; anchor: PlanPoint }): [PlanPoint, PlanPoint] {
  const span = (a0: number, a1: number, b0: number, b1: number): [number, number] => {
    const lo = Math.max(a0, b0);
    const hi = Math.min(a1, b1);
    if (lo <= hi) return [(lo + hi) / 2, (lo + hi) / 2];
    return a1 < b0 ? [a1, b0] : [a0, b1];
  };
  let best: { d: number; ends: [PlanPoint, PlanPoint] } | null = null;
  for (const ra of a.footprint) {
    for (const rb of b.footprint) {
      const [ax, bx] = span(ra.x0, ra.x1, rb.x0, rb.x1);
      const [az, bz] = span(ra.z0, ra.z1, rb.z0, rb.z1);
      const d = Math.hypot(ax - bx, az - bz);
      if (!best || d < best.d) best = { d, ends: [{ x: ax, z: az }, { x: bx, z: bz }] };
    }
  }
  return best && best.d > 0.3 ? best.ends : [a.anchor, b.anchor];
}

export function rectsTouch(a: PlanRect, b: PlanRect, eps = 0.01): boolean {
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (overlapX >= -eps && overlapZ > eps) || (overlapZ >= -eps && overlapX > eps);
}

export function unit(dx: number, dz: number): [number, number] {
  const l = Math.hypot(dx, dz);
  return l < 1e-6 ? [1, 0] : [dx / l, dz / l];
}
