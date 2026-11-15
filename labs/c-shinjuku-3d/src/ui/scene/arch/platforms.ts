/**
 * Platform furniture: the edge line and tactile strip, a band in the colour of
 * the line that stops at each edge, the track bed with its rails, a row of
 * columns with track-number boards, and benches.
 *
 * Which edge a track runs along comes from the data (`PlatformTrack.side`);
 * where that is not recorded no track is drawn. That is also what tells an
 * island platform (a track recorded along both long edges) from a platform
 * served on one edge only: the edge line and tactile strip are drawn only along
 * an edge with a recorded track. A platform whose tracks are all unrecorded
 * keeps both edge markings, since nothing says which edge is used. Whether a
 * platform is a terminal (buffer stops) is not in the data and is not drawn.
 *
 * The columns, boards and benches are decoration drawn by rule: their number,
 * spacing and look say nothing about the real station. A board carries, on each
 * half, the colour of the line on the track on that side; it has no text.
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

      const anySide = area.tracks.some((t) => t.side);
      const sideColor = new Map<Side, string>();
      for (const side of sides) {
        const e = edgeOf(r, side);
        const inw = -e.out;
        const track = area.tracks.find((t) => t.side === side);
        // white edge line and tactile strip, along the edges trains stop at
        if (track || !anySide) {
          ctx.add(area.id, 'platform-edge', 'accent', oriented(e.axis, e.lo, e.hi, e.at, e.at + inw * 0.07, top, top + 0.012), dim(p.platformEdge));
          ctx.add(area.id, 'platform-edge', 'accent', oriented(e.axis, e.lo, e.hi, e.at + inw * 0.2, e.at + inw * 0.28, top, top + 0.012), dim(p.tactile));
        }
        if (!track) continue;

        // band(s) on the platform face in the colour of the line(s) stopping here
        const colors = [...new Set(track.services.map((s) => lineColor.get(s.railLineId)).filter((c): c is string => !!c))].slice(0, 2);
        if (colors[0]) sideColor.set(side, colors[0]);
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
      const blocked = (cx: number, cz: number, m = 0.35) =>
        obstacles.some((o) => cx > o.x0 - m && cx < o.x1 + m && cz > o.z0 - m && cz < o.z1 + m) || Math.hypot(cx - area.anchor.x, cz - area.anchor.z) < 0.8;
      const across = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
      const boardHalf = Math.min(0.24, across / 2 - 0.35);
      const [loSide, hiSide] = sides as [Side, Side];
      for (let i = 0; i <= count; i++) {
        const along = start + i * COLUMN_STEP;
        const [cx, cz] = alongX ? [along, mid] : [mid, along];
        // a bench in the middle of every other bay between columns
        if (i < count && i % 2 === 0) {
          const b = along + COLUMN_STEP / 2;
          const [bx, bz] = alongX ? [b, mid] : [mid, b];
          if (!blocked(bx, bz, 0.6)) {
            ctx.add(null, 'column', 'metal', oriented(alongX ? 'x' : 'z', b - 0.45, b + 0.45, mid - 0.09, mid + 0.09, top, top + 0.12), dim(mix(p.gateBody, p.platform, 0.35)), { shade: [0.7, 1], pickable: false });
          }
        }
        if (blocked(cx, cz)) continue;
        // track-number board on the column: each half in the colour of the line on that side
        if (boardHalf > 0.1) {
          const axis = alongX ? 'x' : 'z';
          ctx.add(null, 'column', 'metal', oriented(axis, along - 0.03, along + 0.03, mid - boardHalf, mid + boardHalf, top + 0.6, top + 0.76), dim(p.gateBody), { pickable: false });
          for (const [side, c0, c1] of [[loSide, mid - boardHalf, mid], [hiSide, mid, mid + boardHalf]] as const) {
            const c = sideColor.get(side);
            if (!c) continue;
            ctx.add(null, 'column', 'accent', oriented(axis, along - 0.035, along + 0.035, c0, c1, top + 0.56, top + 0.6), dim(c), { pickable: false });
          }
        }
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
