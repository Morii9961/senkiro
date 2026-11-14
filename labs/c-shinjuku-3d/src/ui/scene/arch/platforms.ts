/**
 * Platform furniture: the edge line and tactile strip, a band in the colour of
 * the line that stops at each edge, the track bed with its rails, and a row of
 * columns.
 *
 * Which edge a track runs along comes from the data (`PlatformTrack.side`);
 * where that is not recorded no track is drawn. The columns are decoration:
 * their number and spacing say nothing about the real station.
 */
import { TRACK_GAP, TRACK_STUB, TRACK_W, edgeOf, type TrackSide } from '../../../trains/trackGeometry';
import { mix } from '../../theme';
import { PLATFORM_TOP, box } from '../prims';
import type { Ctx } from './context';

const COLUMN_STEP = 4;

type Side = TrackSide;

/** A box given as [along0, along1] × [across0, across1], for a platform whose long axis is `axis`. */
function oriented(axis: 'x' | 'z', a0: number, a1: number, c0: number, c1: number, y0: number, y1: number) {
  const [lo, hi] = c0 < c1 ? [c0, c1] : [c1, c0];
  return axis === 'x' ? box(a0, a1, y0, y1, lo, hi) : box(lo, hi, y0, y1, a0, a1);
}

export function buildPlatforms(ctx: Ctx): void {
  const { p, model } = ctx;
  const lineColor = new Map(model.railLines.map((l) => [l.id, l.displayColor]));

  for (const area of model.areas) {
    if (area.kind !== 'platform') continue;
    const vis = ctx.vis(area.levelId);
    if (vis !== 'full' || ctx.veiled(area.levelId)) continue;
    const y = ctx.yOf(area.levelId);
    const top = y + PLATFORM_TOP;
    const dim = (c: string) => ctx.style(area.id, c, vis)!;

    for (const r of area.footprint) {
      const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
      const sides: Side[] = alongX ? ['z-', 'z+'] : ['x-', 'x+'];

      for (const side of sides) {
        const e = edgeOf(r, side);
        const inw = -e.out;
        // white edge line and tactile strip
        ctx.add(area.id, 'platform-edge', 'accent', oriented(e.axis, e.lo, e.hi, e.at, e.at + inw * 0.07, top, top + 0.012), dim(p.platformEdge));
        ctx.add(area.id, 'platform-edge', 'accent', oriented(e.axis, e.lo, e.hi, e.at + inw * 0.2, e.at + inw * 0.28, top, top + 0.012), dim(p.tactile));

        const track = area.tracks.find((t) => t.side === side);
        if (!track) continue;

        // band(s) on the platform face in the colour of the line(s) stopping here
        const colors = [...new Set(track.services.map((s) => lineColor.get(s.railLineId)).filter((c): c is string => !!c))].slice(0, 2);
        colors.forEach((c, i) => {
          const h = 0.2 / colors.length;
          const y1 = top - 0.03 - i * h;
          ctx.add(area.id, 'line-band', 'accent', oriented(e.axis, e.lo, e.hi, e.at, e.at + e.out * 0.03, y1 - h, y1), dim(c));
        });

        // track bed and rails
        const t0 = e.at + e.out * TRACK_GAP;
        const t1 = e.at + e.out * (TRACK_GAP + TRACK_W);
        const lo = e.lo - TRACK_STUB;
        const hi = e.hi + TRACK_STUB;
        ctx.add(area.id, 'track', 'dark', oriented(e.axis, lo, hi, t0, t1, y - 0.1, y + 0.03), dim(p.trackBed), { shade: [0.8, 1], pickable: false });
        for (const off of [0.17, 0.45]) {
          const c = e.at + e.out * (TRACK_GAP + off);
          ctx.add(area.id, 'track', 'metal', oriented(e.axis, lo, hi, c - 0.02, c + 0.02, y + 0.03, y + 0.075), dim(p.rail), { pickable: false });
        }
      }

      // columns along the middle, kept clear of stairs, lifts and their openings
      const obstacles = [
        ...(ctx.holes.get(area.id) ?? []),
        ...model.verticals.flatMap((v) => v.stops.filter((s) => s.areaId === area.id).map((s) => ({ x0: s.position.x - 0.6, x1: s.position.x + 0.6, z0: s.position.z - 0.6, z1: s.position.z + 0.6 }))),
      ];
      const [a0, a1] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
      const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      const count = Math.floor((a1 - a0 - 2) / COLUMN_STEP);
      const start = (a0 + a1) / 2 - (count * COLUMN_STEP) / 2;
      for (let i = 0; i <= count; i++) {
        const along = start + i * COLUMN_STEP;
        const [cx, cz] = alongX ? [along, mid] : [mid, along];
        if (obstacles.some((o) => cx > o.x0 - 0.35 && cx < o.x1 + 0.35 && cz > o.z0 - 0.35 && cz < o.z1 + 0.35)) continue;
        if (Math.hypot(cx - area.anchor.x, cz - area.anchor.z) < 0.8) continue;
        ctx.add(null, 'column', 'wall', box(cx - 0.07, cx + 0.07, top, top + 0.85, cz - 0.07, cz + 0.07), dim(mix(p.column, p.platform, 0.15)), {
          shade: [0.7, 1],
          pickable: false,
        });
        ctx.decals.push({
          corners: [
            [cx - 0.3, top + 0.01, cz - 0.3],
            [cx + 0.3, top + 0.01, cz - 0.3],
            [cx + 0.3, top + 0.01, cz + 0.3],
            [cx - 0.3, top + 0.01, cz + 0.3],
          ],
          alphas: [0.1 * p.contactShadow, 0.1 * p.contactShadow, 0.1 * p.contactShadow, 0.1 * p.contactShadow],
          color: p.shadow,
        });
      }
    }
  }
}
