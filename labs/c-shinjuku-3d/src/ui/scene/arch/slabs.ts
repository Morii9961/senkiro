/**
 * Floors and walls.
 *
 * Every area becomes a slab with real thickness. Its outline becomes a low
 * wall — low because this is a cutaway model: the ceiling and the upper part
 * of the walls are removed so that routes stay visible. Walls are left open
 * where one can walk on: towards a connected neighbouring area, at a gate, at
 * an entrance.
 *
 * The walls are a way of drawing the schematic footprints; they are generated
 * from them and carry no information of their own about the real building.
 */
import type { Area, PlanRect } from '../../../domain/types';
import { mix, zoneColor } from '../../theme';
import {
  PLATFORM_TOP,
  SLAB_TOP,
  WALL_HEIGHT,
  boundsOf,
  box,
  linkEnds,
  openAt,
  outlineEdges,
  rectsTouch,
  subtractRects,
  unionRects,
  type Edge,
  type Vec3,
} from '../prims';
import type { Ctx } from './context';

const WALL_T = 0.1;
const SHADOW_REACH = 0.7;

export function levelBounds(ctx: Pick<Ctx, 'model'>, levelId: string, pad = 1.6): PlanRect {
  const rects = ctx.model.areas.filter((a) => a.levelId === levelId).flatMap((a) => a.footprint);
  const b = boundsOf(rects);
  return { x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad };
}

export function areasTouch(a: Area, b: Area): boolean {
  return a.footprint.some((ra) => b.footprint.some((rb) => rectsTouch(ra, rb)));
}

/** How far a floor plate reaches beyond the areas standing on it. */
export const PLATE_PAD = 1.4;

/**
 * The floor plate of one drawn height: the areas of every level at that
 * elevation, each grown by a margin, joined into one outline. It follows the
 * shape of what is built there instead of boxing it in — an L-shaped floor
 * gets an L-shaped plate, not a rectangle that is mostly empty.
 */
export function plateRects(model: Ctx['model'], levelIds: readonly string[], pad = PLATE_PAD): PlanRect[] {
  const ids = new Set(levelIds);
  return unionRects(
    model.areas
      .filter((a) => ids.has(a.levelId))
      .flatMap((a) => a.footprint)
      .map((r) => ({ x0: r.x0 - pad, x1: r.x1 + pad, z0: r.z0 - pad, z1: r.z1 + pad })),
  );
}

/**
 * Faint plate under each floor plane: it makes the floors read as planes when
 * they are pulled apart. Levels of different operators drawn at the same
 * height share one plate, so that plates never overlap in one plane.
 */
export function buildShells(ctx: Ctx): void {
  const { p, opts } = ctx;
  if (opts.shellOpacity <= 0.004) return;
  const planes = new Map<number, { vis: 'full' | 'ghost'; levelIds: string[]; y: number }>();
  for (const level of ctx.model.levels) {
    const v = ctx.vis(level.id);
    if (v === 'hidden') continue;
    if (!ctx.model.areas.some((a) => a.levelId === level.id)) continue;
    const plane = planes.get(level.elevation) ?? { vis: 'ghost' as const, levelIds: [], y: ctx.yOf(level.id) };
    if (v === 'full') plane.vis = 'full';
    plane.levelIds.push(level.id);
    planes.set(level.elevation, plane);
  }
  for (const { vis, levelIds, y } of planes.values()) {
    const rects = plateRects(ctx.model, levelIds);
    const outlineColor = mix(p.shell, p.background, vis === 'ghost' ? 0.75 : 0.35);
    for (const r of rects) {
      ctx.prims.push({
        elementId: null,
        role: 'shell',
        material: 'glass',
        ...box(r.x0, r.x1, y - 0.3, y - 0.2, r.z0, r.z1),
        color: p.shell,
        alpha: vis === 'ghost' ? Math.min(opts.shellOpacity * 0.2, 0.04) : opts.shellOpacity * 0.5,
        outline: false,
        outlineColor,
        pickable: false,
      });
    }
    // The outline of the whole plate, not of its pieces: a beam without width
    // or thickness is nothing but its outline, which is drawn as a line.
    for (const e of outlineEdges(rects)) {
      const [a, b]: [Vec3, Vec3] = e.axis === 'x' ? [[e.lo, y - 0.2, e.at], [e.hi, y - 0.2, e.at]] : [[e.at, y - 0.2, e.lo], [e.at, y - 0.2, e.hi]];
      ctx.prims.push({ elementId: null, role: 'shell-edge', material: 'glass', a, b, width: 0, thickness: 0, color: p.shell, alpha: 0, outline: true, outlineColor, pickable: false });
    }
  }
}

function areaBaseColor(ctx: Ctx, area: Area): string {
  const { p } = ctx;
  if (area.kind !== 'platform') return zoneColor(p, area.fareZone);
  const status = ctx.opts.platformStatus?.get(area.id);
  if (status === 'delayed') return mix(p.platform, p.statusDelayed, 0.5);
  if (status === 'suspended' || status === 'partial-suspension') return mix(p.platform, p.statusSuspended, 0.5);
  if (status === 'normal') return mix(p.platform, p.statusNormal, 0.3);
  return p.platform;
}

/**
 * Areas one can walk into from `area` without a gate: joined by a passage and touching it.
 * Operators number their floors separately, so "the same floor" means the same ordinal.
 */
function walkableNeighbours(ctx: Pick<Ctx, 'model' | 'areaById'>, area: Area): Area[] {
  const out: Area[] = [];
  const ordinal = (levelId: string) => ctx.model.levels.find((l) => l.id === levelId)?.ordinal;
  for (const link of ctx.model.passages) {
    const otherId = link.fromAreaId === area.id ? link.toAreaId : link.toAreaId === area.id ? link.fromAreaId : null;
    const other = otherId ? ctx.areaById.get(otherId) : undefined;
    if (other && ordinal(other.levelId) === ordinal(area.levelId) && areasTouch(area, other)) out.push(other);
  }
  return out;
}

export function wallEdges(ctx: Pick<Ctx, 'model' | 'areaById'>, area: Area): Edge[] {
  let edges = outlineEdges(area.footprint, walkableNeighbours(ctx, area).flatMap((n) => n.footprint));
  for (const gate of ctx.model.gates) {
    if (!gate.sides.some((s) => 'areaId' in s && s.areaId === area.id)) continue;
    edges = openAt(edges, gate.position, 1.0, 0.8).edges;
  }
  for (const ent of ctx.model.entrances) {
    if (ent.areaId === area.id) edges = openAt(edges, ent.position, 0.7, 0.4).edges;
  }
  return edges;
}

export function buildAreas(ctx: Ctx): void {
  const { p } = ctx;
  for (const area of ctx.model.areas) {
    const vis = ctx.vis(area.levelId);
    const veiled = vis === 'full' && ctx.veiled(area.levelId);
    const s = ctx.style(area.id, areaBaseColor(ctx, area), vis, veiled ? 0.42 : 1);
    if (!s) continue;
    const y = ctx.yOf(area.levelId);
    const isPlatform = area.kind === 'platform';
    const top = y + (isPlatform ? PLATFORM_TOP : SLAB_TOP);
    const rects = vis === 'full' ? subtractRects(area.footprint, ctx.holes.get(area.id) ?? []) : area.footprint;
    for (const r of rects) {
      ctx.add(area.id, 'area', isPlatform ? 'concrete' : 'floor', box(r.x0, r.x1, y - 0.12, top, r.z0, r.z1), s, {
        outline: true,
        shade: [0.62, 1],
      });
    }
    if (isPlatform || vis !== 'full' || veiled) continue;

    // low walls along the outline, with a baked contact shadow at their foot
    const wall = ctx.style(area.id, p.wall, vis);
    if (!wall) continue;
    for (const e of wallEdges(ctx, area)) {
      const near = e.at + e.inward * 0.01;
      const far = e.at + e.inward * (0.01 + WALL_T);
      const [n0, n1] = near < far ? [near, far] : [far, near];
      const geom = e.axis === 'x' ? box(e.lo, e.hi, top, top + WALL_HEIGHT, n0, n1) : box(n0, n1, top, top + WALL_HEIGHT, e.lo, e.hi);
      ctx.add(area.id, 'wall', 'wall', geom, wall, { shade: [0.8, 1], pickable: false });

      const yS = top + 0.012;
      const s0 = far;
      const s1 = far + e.inward * SHADOW_REACH;
      const corners: [Vec3, Vec3, Vec3, Vec3] =
        e.axis === 'x'
          ? [[e.lo, yS, s0], [e.hi, yS, s0], [e.hi, yS, s1], [e.lo, yS, s1]]
          : [[s0, yS, e.lo], [s0, yS, e.hi], [s1, yS, e.hi], [s1, yS, e.lo]];
      ctx.decals.push({ corners, alphas: [0.22, 0.22, 0, 0], color: p.shadow });
    }
  }
}

/** Passages between areas that do not touch (and every inferred one), as a strip on the floor. */
export function buildLinks(ctx: Ctx): void {
  const { p } = ctx;
  for (const link of ctx.model.passages) {
    const from = ctx.areaById.get(link.fromAreaId);
    const to = ctx.areaById.get(link.toAreaId);
    if (!from || !to) continue;
    if (link.connection === 'verified' && areasTouch(from, to)) continue;
    const vf = ctx.vis(from.levelId);
    const vt = ctx.vis(to.levelId);
    const vis = vf === 'full' || vt === 'full' ? 'full' : vf;
    const s = ctx.style(link.id, p.link, vis);
    if (!s) continue;
    const [pa, pb] = linkEnds(from, to);
    const a: Vec3 = [pa.x, ctx.topOf(from.id) + 0.03, pa.z];
    const b: Vec3 = [pb.x, ctx.topOf(to.id) + 0.03, pb.z];
    for (const [da, db] of dashes(a, b, link.connection === 'inferred' ? 1.1 : 0)) {
      ctx.add(link.id, 'link', 'accent', { a: da, b: db, width: 0.26, thickness: 0.05 }, s, { pickable: false });
    }
  }
}

export function dashes(a: Vec3, b: Vec3, dash: number): [Vec3, Vec3][] {
  if (dash <= 0) return [[a, b]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.floor(len / (dash * 2)));
  const out: [Vec3, Vec3][] = [];
  const at = (k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < n; i++) out.push([at(i / n), at((i + 0.5) / n)]);
  return out;
}
