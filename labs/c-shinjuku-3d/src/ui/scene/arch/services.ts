/**
 * Passenger services that a floor map marks (ticket counters, ticket machines,
 * an information counter, a waiting room), and simplified buses at the bays of
 * the bus terminal.
 *
 * Services: a counter or a bank of machines is drawn as a low block over its
 * box (its place on the source drawing, converted into the schematic plan of
 * its area — see `ServicePoint`); a service the drawing shows only as an icon
 * is drawn as a small post with a sign on top. Not walkable, not routable.
 *
 * Buses: one simplified bus beside every bay of バスタ新宿 4F, parked along the
 * edge of the walkway on the roadway side. They are illustration only: there
 * is one at every bay all the time, and they carry no service, destination,
 * operator livery or timetable — the data has none (which services use which
 * bay is not on the floor map). Size and shape are schematic.
 */
import type { Entrance } from '../../../domain/types';
import { mix } from '../../theme';
import { SLAB_TOP, box, outlineEdges } from '../prims';
import type { Ctx } from './context';

/** A staffed counter is drawn low, a bank of machines taller and lighter, so that the two read apart. */
const HEIGHT = { 'ticket-counter': 0.3, 'ticket-machines': 0.52, information: 0.3, 'waiting-room': 0.3 } as const;
const BUS_L = 1.8;
const BUS_W = 0.6;
const BUS_H = 0.62;
/** Gap between the walkway edge and the side of a parked bus. */
const BUS_GAP = 0.18;

export function buildServices(ctx: Ctx): void {
  const { p } = ctx;
  for (const sv of ctx.model.services) {
    const vis = ctx.vis(sv.levelId);
    if (vis !== 'full' || ctx.veiled(sv.levelId)) continue;
    const top = ctx.topOf(sv.areaId);
    const r = sv.box;
    const machines = sv.serviceKind === 'ticket-machines';
    const body = ctx.style(sv.id, machines ? mix(p.service, p.platformEdge, 0.45) : mix(p.service, p.gateBody, 0.35), vis)!;
    const h = HEIGHT[sv.serviceKind];
    const accent = ctx.style(sv.id, p.service, vis)!;
    if (!sv.iconOnly) {
      // a counter or a bank of machines: a low block with a strip of the service colour on top
      ctx.add(sv.id, 'service', 'metal', box(r.x0, r.x1, top, top + h, r.z0, r.z1), body, { shade: [0.7, 1], pickable: false });
      ctx.add(sv.id, 'service', 'accent', box(r.x0, r.x1, top + h, top + h + 0.03, r.z0, r.z1), accent, { pickable: false });
      continue;
    }
    // only an icon on the source: a post with a square sign, standing where the icon is
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    ctx.add(sv.id, 'service', 'metal', box(cx - 0.035, cx + 0.035, top, top + 0.75, cz - 0.035, cz + 0.035), body, { pickable: false });
    ctx.add(sv.id, 'service', 'accent', box(cx - 0.17, cx + 0.17, top + 0.75, top + 1.09, cz - 0.03, cz + 0.03), accent, { pickable: false });
  }
}

const isBay = (e: Entrance) => e.id.startsWith('sk:entrance:busta-4f-bay-');

export function buildBuses(ctx: Ctx): void {
  const { p } = ctx;
  for (const bay of ctx.model.entrances.filter(isBay)) {
    const vis = ctx.vis(bay.levelId);
    if (vis !== 'full' || ctx.veiled(bay.levelId)) continue;
    const area = ctx.areaById.get(bay.areaId);
    if (!area) continue;
    // the walkway edge the bay stands on; the bus parks on its far side
    let edge: ReturnType<typeof outlineEdges>[number] | null = null;
    let best = Infinity;
    for (const e of outlineEdges(area.footprint)) {
      const along = e.axis === 'x' ? bay.position.x : bay.position.z;
      const across = e.axis === 'x' ? bay.position.z : bay.position.x;
      const t = Math.min(e.hi, Math.max(e.lo, along));
      const d = Math.hypot(along - t, across - e.at);
      if (d < best) {
        best = d;
        edge = e;
      }
    }
    if (!edge) continue;
    const out = -edge.inward;
    const along = edge.axis === 'x' ? bay.position.x : bay.position.z;
    const c0 = edge.at + out * BUS_GAP;
    const c1 = edge.at + out * (BUS_GAP + BUS_W);
    const [n0, n1] = c0 < c1 ? [c0, c1] : [c1, c0];
    const a0 = along - BUS_L / 2;
    const a1 = along + BUS_L / 2;
    const y = ctx.yOf(bay.levelId) + SLAB_TOP;
    const at = (lo: number, hi: number, y0: number, y1: number, m0 = n0, m1 = n1) => (edge!.axis === 'x' ? box(lo, hi, y0, y1, m0, m1) : box(m0, m1, y0, y1, lo, hi));
    const body = ctx.style(null, p.bus, vis)!;
    const glass = ctx.style(null, p.busWindow, vis)!;
    // body on a little clearance, a window band round it, and a roof a shade lighter
    ctx.add(null, 'bus', 'metal', at(a0, a1, y + 0.06, y + BUS_H, n0, n1), body, { shade: [0.7, 1], pickable: false });
    ctx.add(null, 'bus', 'dark', at(a0 - 0.01, a1 + 0.01, y + 0.36, y + 0.52, n0 - 0.01, n1 + 0.01), glass, { pickable: false });
    ctx.add(null, 'bus', 'metal', at(a0 + 0.08, a1 - 0.08, y + BUS_H, y + BUS_H + 0.05, n0 + 0.06, n1 - 0.06), ctx.style(null, mix(p.bus, p.background, 0.3), vis)!, { pickable: false });
  }
}
