/**
 * Ticket gates (a row of gate machines across the opening, on a strip of floor
 * that joins the two sides), entrances (a portal) and the abstract blocks that
 * stand for areas which were not verified.
 *
 * A gate is drawn by rule as four lanes between five machines, each machine with
 * a flap reaching into the lane(s) beside it and card readers on top. The number
 * of lanes, their width and the flaps say nothing about the real gate (the data
 * records no machine count or width). The one thing taken from the data is the
 * direction: an exit-only gate has readers only at the end on the paid side and
 * chevrons on the floor pointing out; every other gate has readers at both ends.
 */
import type { Area, Gate, PlanPoint } from '../../../domain/types';
import { nearestInFootprint } from '../../../domain/validate';
import { mix, zoneColor } from '../../theme';
import { SLAB_TOP, box, elevationY, outlineEdges, unit, type Vec3 } from '../prims';
import { pushSoftShadow, type Ctx } from './context';

const GATE_HALF = 0.85;
const MACHINES = 4;

function axisTowards(from: PlanPoint, to: PlanPoint): [number, number] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 0.05) return [1, 0];
  // gate lines are drawn square to the walls: snap to the dominant axis
  return Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
}

/** Direction of travel through a gate, from its first side to its second. */
export function gateDirection(gate: Gate, areaById: Map<string, Area>): { d: [number, number]; ends: PlanPoint[] } {
  const ends: PlanPoint[] = [];
  for (const side of gate.sides) {
    const area = 'areaId' in side ? areaById.get(side.areaId) : undefined;
    if (area) ends.push(nearestInFootprint(gate.position, area.footprint).point);
  }
  if (ends.length === 2 && Math.hypot(ends[1]!.x - ends[0]!.x, ends[1]!.z - ends[0]!.z) > 0.05) return { d: axisTowards(ends[0]!, ends[1]!), ends };
  if (ends.length >= 1 && Math.hypot(gate.position.x - ends[0]!.x, gate.position.z - ends[0]!.z) > 0.05) return { d: axisTowards(ends[0]!, gate.position), ends };
  const first = gate.sides.map((s) => ('areaId' in s ? areaById.get(s.areaId) : undefined)).find((a) => a);
  return { d: first ? axisTowards(first.anchor, gate.position) : [1, 0], ends };
}

/**
 * Which end of the gate line (-1 or +1 along the direction of travel `d`) lies on the paid side.
 * Used only for exit-only gates, whose paid side is where one may enter the gate from.
 */
function paidEndSign(gate: Gate, ctx: Ctx, x: number, z: number, dx: number, dz: number): number {
  for (const side of gate.sides) {
    const area = 'areaId' in side ? ctx.areaById.get(side.areaId) : undefined;
    if (!area || !area.fareZone.startsWith('paid:')) continue;
    const near = nearestInFootprint(gate.position, area.footprint);
    const ref = near.distance > 0.05 ? near.point : area.anchor;
    const dot = (ref.x - x) * dx + (ref.z - z) * dz;
    if (Math.abs(dot) > 1e-6) return Math.sign(dot);
  }
  return -1;
}

export function buildGates(ctx: Ctx): void {
  const { p } = ctx;
  for (const gate of ctx.model.gates) {
    const vis = ctx.vis(gate.levelId);
    const accentColor = gate.gateKind === 'transfer' ? p.gateTransfer : p.gate;
    const accent = ctx.style(gate.id, accentColor, vis);
    if (!accent) continue;
    const y = ctx.yOf(gate.levelId);
    const top = y + SLAB_TOP;
    const { x, z } = gate.position;
    if (vis !== 'full') {
      ctx.add(gate.id, 'gate', 'accent', box(x - 0.3, x + 0.3, top, top + 0.4, z - 0.3, z + 0.3), accent);
      continue;
    }
    const { d, ends } = gateDirection(gate, ctx.areaById);
    const [dx, dz] = unit(d[0], d[1]);
    const nx = -dz;
    const nz = dx;

    // the strip of floor under the gate line, reaching both sides
    const zones = gate.sides.map((s) => ('areaId' in s ? ctx.areaById.get(s.areaId)?.fareZone : undefined)).filter((zone): zone is NonNullable<typeof zone> => !!zone);
    const floorColor = zones.includes('unpaid') || zones.length === 0 ? p.floorUnpaid : zoneColor(p, zones[0]!);
    // the strip stops a hair below the floors it joins, so the two never share a plane
    const reach = Math.max(0.3, ...ends.map((e) => Math.hypot(e.x - x, e.z - z) + 0.02));
    const floor = ctx.style(gate.id, mix(floorColor, p.gateBody, 0.12), vis)!;
    ctx.add(
      gate.id,
      'bridge',
      'floor',
      { a: [x - dx * reach, y + SLAB_TOP / 2 - 0.066, z - dz * reach], b: [x + dx * reach, y + SLAB_TOP / 2 - 0.066, z + dz * reach], width: GATE_HALF * 2 + 0.3, thickness: SLAB_TOP + 0.12 },
      floor,
      { shade: [0.72, 1] },
    );

    // Ends of the machines where a card or ticket is read. Both ends unless the data says the gate
    // is exit-only; then only the end on the paid side, and chevrons on the floor point the way out.
    const readerEnds = gate.direction === 'exit-only' ? [paidEndSign(gate, ctx, x, z, dx, dz)] : [-1, 1];

    // gate machines side by side, each with a strip of the gate's colour on top, card readers at
    // the ends one may enter from, and a flap reaching into the lane(s) beside it
    const body = ctx.style(gate.id, p.gateBody, vis)!;
    const reader = ctx.style(gate.id, mix(p.platformEdge, p.gateBody, 0.15), vis)!;
    const flap = ctx.style(gate.id, mix(accentColor, p.platformEdge, 0.3), vis)!;
    const lane = (2 * GATE_HALF) / MACHINES;
    // a soft shadow under the row of machines, so that it stands on the floor
    if (vis === 'full') {
      const al = 0.31;
      const ac = GATE_HALF + 0.06;
      pushSoftShadow(
        ctx,
        [
          [x - dx * al - nx * ac, z - dz * al - nz * ac],
          [x + dx * al - nx * ac, z + dz * al - nz * ac],
          [x + dx * al + nx * ac, z + dz * al + nz * ac],
          [x - dx * al + nx * ac, z - dz * al + nz * ac],
        ],
        top + 0.014,
        0.24,
        0.3,
      );
    }
    for (let i = 0; i <= MACHINES; i++) {
      const off = -GATE_HALF + i * lane;
      const cx = x + nx * off;
      const cz = z + nz * off;
      const a: Vec3 = [cx - dx * 0.26, top + 0.17, cz - dz * 0.26];
      const b: Vec3 = [cx + dx * 0.26, top + 0.17, cz + dz * 0.26];
      ctx.add(gate.id, 'gate', 'metal', { a, b, width: 0.09, thickness: 0.34 }, body, { shade: [0.75, 1] });
      ctx.add(gate.id, 'gate', 'accent', { a: [a[0], top + 0.355, a[2]], b: [b[0], top + 0.355, b[2]], width: 0.09, thickness: 0.03 }, accent);
      for (const end of readerEnds) {
        const rx = cx + dx * end * 0.19;
        const rz = cz + dz * end * 0.19;
        ctx.add(gate.id, 'gate-reader', 'accent', { a: [rx - dx * 0.04, top + 0.378, rz - dz * 0.04], b: [rx + dx * 0.04, top + 0.378, rz + dz * 0.04], width: 0.075, thickness: 0.016 }, reader, { pickable: false });
      }
      // one flap through the machine, sticking out into the lane on either side (only inwards at the two outer machines)
      const reach = lane * 0.3;
      const f0 = i === 0 ? 0 : -(0.045 + reach);
      const f1 = i === MACHINES ? 0 : 0.045 + reach;
      ctx.add(
        gate.id,
        'gate-flap',
        'accent',
        { a: [cx + nx * f0, top + 0.21, cz + nz * f0], b: [cx + nx * f1, top + 0.21, cz + nz * f1], width: 0.025, thickness: 0.12 },
        flap,
        { pickable: false },
      );
    }
    if (gate.direction === 'exit-only') {
      // a chevron in front of each lane on the way out, pointing from the paid side to the unpaid side
      const out = -readerEnds[0]!;
      const arrow = ctx.style(gate.id, p.platformEdge, vis)!;
      for (let i = 0; i < MACHINES; i++) {
        const off = -GATE_HALF + (i + 0.5) * lane;
        const tipX = x + nx * off + dx * out * 0.56;
        const tipZ = z + nz * off + dz * out * 0.56;
        for (const s of [-1, 1]) {
          const tail: Vec3 = [tipX - dx * out * 0.2 + nx * s * 0.15, top + 0.014, tipZ - dz * out * 0.2 + nz * s * 0.15];
          ctx.add(gate.id, 'gate-arrow', 'accent', { a: tail, b: [tipX, top + 0.014, tipZ], width: 0.06, thickness: 0.012 }, arrow, { pickable: false });
        }
      }
    }
    // header beam carrying the gate's colour — the thing one looks for from a distance
    const post = ctx.style(gate.id, p.gateBody, vis)!;
    for (const side of [-1, 1]) {
      const cx = x + nx * side * (GATE_HALF + 0.12);
      const cz = z + nz * side * (GATE_HALF + 0.12);
      ctx.add(gate.id, 'gate', 'metal', box(cx - 0.035, cx + 0.035, top, top + 0.95, cz - 0.035, cz + 0.035), post);
    }
    ctx.add(
      gate.id,
      'gate',
      'accent',
      {
        a: [x - nx * (GATE_HALF + 0.16), top + 1.0, z - nz * (GATE_HALF + 0.16)],
        b: [x + nx * (GATE_HALF + 0.16), top + 1.0, z + nz * (GATE_HALF + 0.16)],
        width: 0.07,
        thickness: 0.16,
      },
      accent,
    );
  }
}

/** Sampling step along an outline when looking for the stretches where the fare zone changes. */
const FARE_STEP = 0.25;

/**
 * The edge of the paid area: a low kerb in the gate colour wherever the floor
 * on one side of a paid area's outline belongs to another fare zone than the
 * floor on the other side (or to no floor at all). It is left open at ticket
 * gates. Platforms are left out: their edge towards the track is drawn as a
 * platform edge already. The kerb follows the footprints of the model, which
 * are schematic — it is not a surveyed line of walls and fences.
 */
export function buildFareBoundary(ctx: Ctx): void {
  if (ctx.opts.showFareBoundary === false) return;
  const { p } = ctx;
  const paidByLevel = new Map<string, Area[]>();
  for (const area of ctx.model.areas) {
    if (!area.fareZone.startsWith('paid:')) continue;
    const list = paidByLevel.get(area.levelId);
    if (list) list.push(area);
    else paidByLevel.set(area.levelId, [area]);
  }
  const seen = new Set<string>();
  for (const [levelId, paid] of paidByLevel) {
    if (ctx.vis(levelId) !== 'full') continue;
    const gatesHere = ctx.model.gates.filter((g) => g.levelId === levelId);
    const zoneAt = (x: number, z: number): string | null => {
      for (const area of paid) for (const r of area.footprint) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return area.fareZone;
      return null;
    };
    for (const area of paid) {
      if (area.kind === 'platform') continue;
      const s = ctx.style(area.id, mix(p.gate, p.gateBody, 0.25), 'full');
      if (!s) continue;
      const y = ctx.topOf(area.id) + 0.035;
      for (const e of outlineEdges(area.footprint)) {
        const n = Math.max(1, Math.ceil((e.hi - e.lo) / FARE_STEP));
        const step = (e.hi - e.lo) / n;
        let from: number | null = null;
        for (let i = 0; i <= n; i++) {
          let boundary = false;
          if (i < n) {
            const m = e.lo + step * (i + 0.5);
            const px = e.axis === 'x' ? m : e.at;
            const pz = e.axis === 'x' ? e.at : m;
            const za = e.axis === 'x' ? zoneAt(m, e.at - 0.04) : zoneAt(e.at - 0.04, m);
            const zb = e.axis === 'x' ? zoneAt(m, e.at + 0.04) : zoneAt(e.at + 0.04, m);
            boundary = za !== zb && !gatesHere.some((g) => Math.hypot(px - g.position.x, pz - g.position.z) < GATE_HALF + 0.2);
          }
          if (boundary && from === null) from = e.lo + step * i;
          if (!boundary && from !== null) {
            const to = e.lo + step * i;
            const key = `${levelId}|${e.axis}|${e.at.toFixed(3)}|${from.toFixed(3)}|${to.toFixed(3)}`;
            if (!seen.has(key)) {
              seen.add(key);
              const a: Vec3 = e.axis === 'x' ? [from, y, e.at] : [e.at, y, from];
              const b: Vec3 = e.axis === 'x' ? [to, y, e.at] : [e.at, y, to];
              ctx.add(area.id, 'fare-edge', 'accent', { a, b, width: 0.06, thickness: 0.07 }, s, { pickable: false });
            }
            from = null;
          }
        }
      }
    }
  }
}

export function buildEntrances(ctx: Ctx): void {
  const { p } = ctx;
  for (const ent of ctx.model.entrances) {
    const vis = ctx.vis(ent.levelId);
    const s = ctx.style(ent.id, p.entrance, vis);
    if (!s) continue;
    const top = ctx.yOf(ent.levelId) + SLAB_TOP;
    const { x, z } = ent.position;
    if (vis !== 'full') {
      ctx.add(ent.id, 'entrance', 'accent', box(x - 0.25, x + 0.25, top, top + 0.5, z - 0.25, z + 0.25), s);
      continue;
    }
    // a portal standing in the wall line: two posts and a lintel
    const area = ctx.areaById.get(ent.areaId);
    let alongX = true;
    if (area) {
      let best = Infinity;
      for (const e of outlineEdges(area.footprint)) {
        const along = e.axis === 'x' ? x : z;
        const across = e.axis === 'x' ? z : x;
        const t = Math.min(e.hi, Math.max(e.lo, along));
        const dist = Math.hypot(along - t, across - e.at);
        if (dist < best) {
          best = dist;
          alongX = e.axis === 'x';
        }
      }
    }
    const [ux, uz] = alongX ? [1, 0] : [0, 1];
    const post = ctx.style(ent.id, mix(p.entrance, p.gateBody, 0.35), vis)!;
    for (const side of [-1, 1]) {
      const cx = x + ux * side * 0.6;
      const cz = z + uz * side * 0.6;
      ctx.add(ent.id, 'entrance', 'metal', box(cx - 0.05, cx + 0.05, top, top + 1.05, cz - 0.05, cz + 0.05), post, { shade: [0.75, 1] });
    }
    ctx.add(
      ent.id,
      'entrance',
      'accent',
      { a: [x - ux * 0.68, top + 1.12, z - uz * 0.68], b: [x + ux * 0.68, top + 1.12, z + uz * 0.68], width: 0.14, thickness: 0.22 },
      s,
    );
  }
}

export function buildBlocks(ctx: Ctx): void {
  const { p, opts } = ctx;
  if (!opts.showBlocks) return;
  for (const blk of ctx.model.unverifiedBlocks) {
    const y0 = elevationY(blk.elevation, opts.explode);
    const y1 = y0 + blk.height * 0.55;
    const selected = blk.id === opts.selectedId;
    const color = selected ? mix(p.block, p.selected, 0.5) : p.block;
    const r = blk.box;
    ctx.prims.push({
      elementId: blk.id,
      role: 'block',
      material: 'glass',
      ...box(r.x0, r.x1, y0, y1, r.z0, r.z1),
      color,
      alpha: opts.focusOrdinals === null ? 0.14 : 0.06,
      outline: true,
      outlineColor: mix(color, p.outline, 0.35),
      pickable: true,
    });
    // diagonal hatching on the top face: the drafting convention for "not surveyed"
    const span = r.x1 - r.x0 + (r.z1 - r.z0);
    for (let dd = 1.2; dd < span; dd += 1.6) {
      const ax = Math.min(r.x0 + dd, r.x1);
      const az = r.z0 + Math.max(0, dd - (r.x1 - r.x0));
      const bx = r.x0 + Math.max(0, dd - (r.z1 - r.z0));
      const bz = Math.min(r.z0 + dd, r.z1);
      ctx.prims.push({
        elementId: blk.id,
        role: 'block-hatch',
        material: 'accent',
        a: [ax, y1 + 0.02, az],
        b: [bx, y1 + 0.02, bz],
        width: 0.07,
        thickness: 0.02,
        color: mix(color, p.outline, 0.25),
        alpha: 1,
        outline: false,
        outlineColor: color,
        pickable: true,
      });
    }
  }
}
