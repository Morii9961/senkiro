/**
 * Stairs, escalators and lifts as recognisable objects. Stairs are two flights
 * of steps with a half landing between them, on stringers, with handrails.
 * Escalators are an incline with step treads, glass balustrades that run out
 * level over the landing plates, and newels at both ends. Lifts are a glass
 * shaft with a car at every stop and, on the side that faces into the area,
 * a door with an indicator above it. Where one of them comes up through a
 * floor, the slab above is opened.
 *
 * All of this is drawn by rule from the two ends of each facility: the number
 * of steps, the landing, which way a lift door faces and how wide anything is
 * say nothing about the real station. Running direction of escalators is not
 * recorded in the data and is not shown.
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
/** Share of a staircase's run taken by its half landing. */
const LANDING = 0.1;
/** How far an escalator's balustrade runs level beyond each end, over the landing plate. */
const ESC_LEAD = 0.34;

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
    // a door at every stop, on the face that looks into the area it serves, with an indicator above it
    const door = c.style(v.id, mix(p.elevatorFrame, p.platformEdge, 0.55), vis)!;
    for (const stop of v.stops) {
      const y = c.topOf(stop.areaId);
      const anchor = c.areaById.get(stop.areaId)?.anchor ?? stop.position;
      const ax = anchor.x - x;
      const az = anchor.z - z;
      const alongX = Math.abs(ax) >= Math.abs(az);
      const sgn = (alongX ? ax : az) >= 0 ? 1 : -1;
      // a slab on the door face: w0..w1 across the face, d0..d1 out from the shaft wall
      const face = (w0: number, w1: number, ya: number, yb: number, d0: number, d1: number) => {
        const a = (alongX ? x : z) + sgn * (LIFT_R + d0);
        const b = (alongX ? x : z) + sgn * (LIFT_R + d1);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        return alongX ? box(lo, hi, ya, yb, z + w0, z + w1) : box(x + w0, x + w1, ya, yb, lo, hi);
      };
      c.add(v.id, 'elevator', 'metal', face(-0.22, 0.22, y + 0.02, y + 0.66, 0, 0.02), frame);
      c.add(v.id, 'elevator', 'metal', face(-0.18, -0.005, y + 0.04, y + 0.6, 0.02, 0.032), door);
      c.add(v.id, 'elevator', 'metal', face(0.005, 0.18, y + 0.04, y + 0.6, 0.02, 0.032), door);
      c.add(v.id, 'elevator', 'accent', face(-0.1, 0.1, y + 0.61, y + 0.655, 0.02, 0.034), car);
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
    // two flights with a half landing between them
    const half = STEPS / 2;
    const k0 = (1 - LANDING) / 2;
    const k1 = (1 + LANDING) / 2;
    const yM = (yL + yU) / 2;
    const rise = (yU - yL) / STEPS;
    const th = Math.max(rise * 1.5, 0.08);
    /** A point of the run at share k, at height y, moved sideways by "side". */
    const P = (k: number, y: number, side = 0): Vec3 => {
      const q = at(k, 0, side);
      q[1] = y;
      return q;
    };
    const tread = (ka: number, kb: number, top: number) =>
      c.add(v.id, 'stairs', 'concrete', { a: P(ka, top - th / 2), b: P(kb, top - th / 2), width: STAIR_W, thickness: th }, s, { shade: [0.78, 1] });
    for (let n = 0; n < half; n++) tread((k0 * n) / half, (k0 * (n + 1)) / half, yL + rise * (n + 1));
    c.add(v.id, 'stairs', 'concrete', { a: P(k0, yM - 0.05), b: P(k1, yM - 0.05), width: STAIR_W + 0.08, thickness: 0.1 }, s, { shade: [0.78, 1] });
    for (let n = 0; n < half; n++) tread(k1 + ((1 - k1) * n) / half, k1 + ((1 - k1) * (n + 1)) / half, yM + rise * (n + 1));

    const rail = c.style(v.id, p.stairsSide, vis)!;
    const stringer = c.style(v.id, mix(p.stairs, p.stairsSide, 0.45), vis)!;
    const legs: [number, number, number, number][] = [
      [0, yL, k0, yM],
      [k0, yM, k1, yM],
      [k1, yM, 1, yU],
    ];
    for (const side of [-1, 1]) {
      const off = side * (STAIR_W / 2 + 0.02);
      for (const [ka, ya, kb, yb] of legs) {
        c.add(v.id, 'stairs', 'metal', { a: P(ka, ya + 0.36, off), b: P(kb, yb + 0.36, off), width: 0.035, thickness: 0.045 }, rail);
        c.add(v.id, 'stairs', 'concrete', { a: P(ka, ya - 0.04, off), b: P(kb, yb - 0.04, off), width: 0.03, thickness: 0.22 }, stringer, { shade: [0.8, 1] });
      }
      // newel posts at the foot, the landing and the head
      for (const [k, y] of [[0, yL], [k0, yM], [k1, yM], [1, yU]] as const) {
        const q = P(k, y, off);
        c.add(v.id, 'stairs', 'metal', box(q[0] - 0.02, q[0] + 0.02, y, y + 0.38, q[2] - 0.02, q[2] + 0.02), rail);
      }
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
    const { run } = ends(c, lo, up);
    // step treads: bright nosings across the incline (how many says nothing about the real machine)
    const nosing = c.style(v.id, mix(p.escalator, p.stairsSide, 0.6), vis)!;
    const treads = Math.max(6, Math.min(16, Math.round(run / 0.28)));
    for (let n = 1; n < treads; n++) {
      const k = n / treads;
      c.add(v.id, 'escalator', 'metal', { a: at(k - 0.012, 0.095), b: at(k + 0.012, 0.095), width: ESC_W - 0.08, thickness: 0.02 }, nosing);
    }
    /** A point beyond an end of the incline: level, ESC_LEAD further out along the run. */
    const beyond = (k: 0 | 1, lift: number, off: number): Vec3 => {
      const q = at(k, lift, off);
      const dir = k === 0 ? -1 : 1;
      return [q[0] + dx * dir * ESC_LEAD, q[1], q[2] + dz * dir * ESC_LEAD];
    };
    for (const side of [-1, 1]) {
      const off = side * (ESC_W / 2 + 0.03);
      c.add(v.id, 'escalator', 'glass', { a: at(0, 0.24, off), b: at(1, 0.24, off), width: 0.025, thickness: 0.32 }, glass);
      c.add(v.id, 'escalator', 'dark', { a: at(0, 0.42, off), b: at(1, 0.42, off), width: 0.06, thickness: 0.045 }, rail);
      // the balustrade and handrail run out level over the landing plate and end in a newel
      for (const k of [0, 1] as const) {
        c.add(v.id, 'escalator', 'glass', { a: at(k, 0.24, off), b: beyond(k, 0.24, off), width: 0.025, thickness: 0.32 }, glass);
        c.add(v.id, 'escalator', 'dark', { a: at(k, 0.42, off), b: beyond(k, 0.42, off), width: 0.06, thickness: 0.045 }, rail);
        const q = beyond(k, 0, off);
        c.add(v.id, 'escalator', 'dark', box(q[0] - 0.035, q[0] + 0.035, q[1] + 0.02, q[1] + 0.44, q[2] - 0.035, q[2] + 0.035), rail);
      }
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
