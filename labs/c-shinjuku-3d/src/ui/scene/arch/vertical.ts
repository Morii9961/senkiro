/**
 * Stairs, escalators and lifts as recognisable objects: stairs are a flight of
 * steps with handrails, escalators an incline with glass balustrades and
 * landing plates, lifts a glass shaft with a car at every stop. Where one of
 * them comes up through a floor, the slab above is opened.
 *
 * One model entry may stand for several physical staircases (`aggregated`);
 * it is still drawn once, at its schematic position.
 */
import type { PlanRect, VerticalFacility, VerticalStop } from '../../../domain/types';
import { mix } from '../../theme';
import { box, unit, type Vec3, type Visibility } from '../prims';
import type { Ctx } from './context';

const STAIR_W = 0.8;
const ESC_W = 0.5;
const STEPS = 12;
const LIFT_R = 0.34;

function ordered(ctx: Ctx, a: VerticalStop, b: VerticalStop): [VerticalStop, VerticalStop] {
  return ctx.topOf(a.areaId) <= ctx.topOf(b.areaId) ? [a, b] : [b, a];
}

/** Openings that stairs, escalators and lift shafts need in the slabs they pass through. */
export function computeHoles(ctx: Ctx): void {
  const push = (areaId: string, r: PlanRect) => {
    const list = ctx.holes.get(areaId) ?? [];
    list.push(r);
    ctx.holes.set(areaId, list);
  };
  for (const v of ctx.model.verticals) {
    if (v.verticalKind === 'elevator') {
      const lowest = v.stops.reduce((m, s) => (ctx.topOf(s.areaId) < ctx.topOf(m.areaId) ? s : m), v.stops[0]!);
      for (const s of v.stops) {
        if (s === lowest) continue;
        push(s.areaId, { x0: s.position.x - LIFT_R - 0.04, x1: s.position.x + LIFT_R + 0.04, z0: s.position.z - LIFT_R - 0.04, z1: s.position.z + LIFT_R + 0.04 });
      }
      continue;
    }
    const half = (v.verticalKind === 'stairs' ? STAIR_W : ESC_W + 0.12) / 2 + 0.05;
    for (let i = 0; i + 1 < v.stops.length; i++) {
      const [lo, up] = ordered(ctx, v.stops[i]!, v.stops[i + 1]!);
      const [dx, dz] = unit(up.position.x - lo.position.x, up.position.z - lo.position.z);
      // along the run from the foot to the head, as wide as the flight
      const px = Math.abs(dz) * half;
      const pz = Math.abs(dx) * half;
      push(up.areaId, {
        x0: Math.min(lo.position.x, up.position.x) - px,
        x1: Math.max(lo.position.x, up.position.x) + px,
        z0: Math.min(lo.position.z, up.position.z) - pz,
        z1: Math.max(lo.position.z, up.position.z) + pz,
      });
    }
  }
}

function facilityVisibility(ctx: Ctx, v: VerticalFacility): Visibility {
  const vs = v.stops.map((s) => ctx.vis(s.levelId));
  return vs.includes('full') ? 'full' : vs.includes('ghost') ? 'ghost' : 'hidden';
}

export function buildVerticals(ctx: Ctx): void {
  const { p, opts } = ctx;
  for (const v of ctx.model.verticals) {
    const vis = facilityVisibility(ctx, v);
    if (vis === 'hidden') continue;
    const routed = ctx.onRoute.has(v.id);
    if (v.verticalKind !== 'elevator' && !opts.showVerticals && !routed && v.id !== opts.selectedId) continue;

    if (v.verticalKind === 'elevator') lift(ctx, v, vis);
    else {
      for (let i = 0; i + 1 < v.stops.length; i++) {
        const [lo, up] = ordered(ctx, v.stops[i]!, v.stops[i + 1]!);
        if (v.verticalKind === 'stairs') stairs(ctx, v, lo, up, vis);
        else escalator(ctx, v, lo, up, vis);
      }
    }
  }

  function lift(c: Ctx, v: VerticalFacility, vis: Visibility) {
    const ys = v.stops.map((s) => c.topOf(s.areaId));
    const { x, z } = v.stops[0]!.position;
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys) + 0.95;
    const glass = c.style(v.id, p.elevatorGlass, vis, 0.32);
    if (!glass) return;
    c.add(v.id, 'elevator', 'glass', box(x - LIFT_R, x + LIFT_R, y0, y1, z - LIFT_R, z + LIFT_R), glass, { outline: vis === 'ghost' });
    if (vis !== 'full') return;
    const frame = c.style(v.id, p.elevatorFrame, vis)!;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = x + sx * LIFT_R;
        const cz = z + sz * LIFT_R;
        c.add(v.id, 'elevator', 'metal', box(cx - 0.025, cx + 0.025, y0, y1, cz - 0.025, cz + 0.025), frame);
      }
    }
    c.add(v.id, 'elevator', 'metal', box(x - LIFT_R - 0.02, x + LIFT_R + 0.02, y1, y1 + 0.05, z - LIFT_R - 0.02, z + LIFT_R + 0.02), frame);
    const car = c.style(v.id, p.elevator, vis)!;
    const band = c.style(v.id, mix(p.elevator, p.platformEdge, 0.25), vis)!;
    for (const y of ys) {
      c.add(v.id, 'elevator', 'accent', box(x - LIFT_R + 0.06, x + LIFT_R - 0.06, y + 0.02, y + 0.62, z - LIFT_R + 0.06, z + LIFT_R - 0.06), car, { shade: [0.75, 1] });
      c.add(v.id, 'elevator', 'accent', box(x - LIFT_R - 0.03, x + LIFT_R + 0.03, y + 0.7, y + 0.76, z - LIFT_R - 0.03, z + LIFT_R + 0.03), band);
    }
  }

  function ends(c: Ctx, lo: VerticalStop, up: VerticalStop) {
    const yL = c.topOf(lo.areaId);
    const yU = c.topOf(up.areaId);
    const run = Math.hypot(up.position.x - lo.position.x, up.position.z - lo.position.z);
    const [dx, dz] = unit(up.position.x - lo.position.x, up.position.z - lo.position.z);
    const at = (k: number, lift = 0, side = 0): Vec3 => [
      lo.position.x + dx * run * k - dz * side,
      yL + (yU - yL) * k + lift,
      lo.position.z + dz * run * k + dx * side,
    ];
    return { yL, yU, run, dx, dz, at };
  }

  function stairs(c: Ctx, v: VerticalFacility, lo: VerticalStop, up: VerticalStop, vis: Visibility) {
    const s = c.style(v.id, p.stairs, vis);
    if (!s) return;
    const { yL, yU, at } = ends(c, lo, up);
    if (vis !== 'full') {
      c.add(v.id, 'stairs', 'concrete', { a: at(0, 0.05), b: at(1, 0.05), width: STAIR_W, thickness: 0.08 }, s);
      return;
    }
    const rise = (yU - yL) / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const top = yL + rise * (i + 1);
      const th = Math.max(rise * 1.5, 0.08);
      const a = at(i / STEPS);
      const b = at((i + 1) / STEPS);
      a[1] = b[1] = top - th / 2;
      c.add(v.id, 'stairs', 'concrete', { a, b, width: STAIR_W, thickness: th }, s, { shade: [0.78, 1] });
    }
    const rail = c.style(v.id, p.stairsSide, vis)!;
    for (const side of [-1, 1]) {
      const off = side * (STAIR_W / 2 + 0.02);
      c.add(v.id, 'stairs', 'metal', { a: at(0, 0.34, off), b: at(1, 0.34, off), width: 0.035, thickness: 0.045 }, rail);
    }
  }

  function escalator(c: Ctx, v: VerticalFacility, lo: VerticalStop, up: VerticalStop, vis: Visibility) {
    const s = c.style(v.id, p.escalator, vis);
    if (!s) return;
    const { at, dx, dz, yL, yU } = ends(c, lo, up);
    c.add(v.id, 'escalator', 'dark', { a: at(0, 0.04), b: at(1, 0.04), width: ESC_W, thickness: 0.1 }, s, { shade: [0.8, 1] });
    if (vis !== 'full') return;
    const glass = c.style(v.id, p.escalatorSide, vis, 0.5)!;
    const rail = c.style(v.id, p.handrail, vis)!;
    const plate = c.style(v.id, p.stairsSide, vis)!;
    for (const side of [-1, 1]) {
      const off = side * (ESC_W / 2 + 0.03);
      c.add(v.id, 'escalator', 'glass', { a: at(0, 0.24, off), b: at(1, 0.24, off), width: 0.025, thickness: 0.32 }, glass);
      c.add(v.id, 'escalator', 'dark', { a: at(0, 0.42, off), b: at(1, 0.42, off), width: 0.06, thickness: 0.045 }, rail);
    }
    // landing plates at the foot and the head
    for (const [x, z, y, dir] of [
      [lo.position.x, lo.position.z, yL, -1],
      [up.position.x, up.position.z, yU, 1],
    ] as const) {
      c.add(
        v.id,
        'escalator',
        'metal',
        { a: [x, y + 0.02, z], b: [x + dx * dir * 0.42, y + 0.02, z + dz * dir * 0.42], width: ESC_W + 0.1, thickness: 0.035 },
        plate,
      );
    }
  }
}
