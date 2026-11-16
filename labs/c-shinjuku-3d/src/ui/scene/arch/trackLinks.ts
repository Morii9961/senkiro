/**
 * Track between two neighbouring stations of one line, where both stations
 * are in the model: the 丸ノ内線 between 新宿 (M08) and 新宿三丁目 (M09), and
 * the 都営新宿線 between 新宿 (S01, the 京王新線 platform it shares) and
 * 新宿三丁目 (S02). That the stations are neighbours on the line comes from
 * their station numbers; where the tunnel runs, how it curves and how it
 * climbs between the two depths is drawn by rule and is not the real
 * alignment. Each track of one station is joined to the track of the other
 * station that runs the same way (named below).
 */
import { TRACK_GAP, TRACK_STUB, TRACK_W, edgeOf } from '../../../trains/trackGeometry';
import type { Ctx } from './context';

interface Join {
  from: { platform: string; track: string };
  to: { platform: string; track: string };
}

interface LineLink {
  joins: Join[];
  note: string;
}

export const TRACK_LINKS: LineLink[] = [
  {
    note: '丸ノ内線 M08 新宿 ↔ M09 新宿三丁目: 1番線 (荻窪方面) with 1番線, 2番線 (池袋方面) with 2番線.',
    joins: [
      { from: { platform: 'sk:platform:tokyo-metro-shinjuku-1-2', track: '1' }, to: { platform: 'sk:platform:tokyo-metro-shinjuku-sanchome-1-2', track: '1' } },
      { from: { platform: 'sk:platform:tokyo-metro-shinjuku-1-2', track: '2' }, to: { platform: 'sk:platform:tokyo-metro-shinjuku-sanchome-1-2', track: '2' } },
    ],
  },
  {
    note: '都営新宿線 S01 新宿 ↔ S02 新宿三丁目: 新宿 4番線 (trains from 新宿三丁目, on to 京王新線) with 新宿三丁目 1番線 (新宿方面); 新宿 5番線 (本八幡方面) with 新宿三丁目 2番線 (本八幡方面).',
    joins: [
      { from: { platform: 'sk:platform:keio-new-line-shinjuku-4-5', track: '4' }, to: { platform: 'sk:platform:toei-shinjuku-sanchome-1-2', track: '1' } },
      { from: { platform: 'sk:platform:keio-new-line-shinjuku-4-5', track: '5' }, to: { platform: 'sk:platform:toei-shinjuku-sanchome-1-2', track: '2' } },
    ],
  },
];

type P3 = [number, number, number];

/** The end of a track's drawn bed towards another point: the stub end nearest to it, on the track's centre line. */
function trackEnd(ctx: Ctx, platformId: string, trackNumber: string, towards: { x: number; z: number }): { p: P3; axis: 'x' | 'z'; dir: number } | null {
  const area = ctx.areaById.get(platformId);
  if (!area || area.kind !== 'platform') return null;
  const track = area.tracks.find((t) => t.number === trackNumber);
  const r = area.footprint[0];
  if (!track?.side || !r) return null;
  const e = edgeOf(r, track.side);
  const centre = e.at + e.out * (TRACK_GAP + TRACK_W / 2);
  const towardsAlong = e.axis === 'x' ? towards.x : towards.z;
  const dir = towardsAlong < (e.lo + e.hi) / 2 ? -1 : 1;
  const along = dir === -1 ? e.lo - TRACK_STUB : e.hi + TRACK_STUB;
  const y = ctx.yOf(area.levelId);
  return { p: e.axis === 'x' ? [along, y, centre] : [centre, y, along], axis: e.axis, dir };
}

export function buildTrackLinks(ctx: Ctx): void {
  const { p } = ctx;
  for (const link of TRACK_LINKS) {
    for (const j of link.joins) {
      const fa = ctx.areaById.get(j.from.platform);
      const ta = ctx.areaById.get(j.to.platform);
      if (!fa || !ta) continue;
      const vf = ctx.vis(fa.levelId);
      const vt = ctx.vis(ta.levelId);
      // drawn only when both stations' floors are drawn in full
      if (vf !== 'full' || vt !== 'full') continue;
      const a = trackEnd(ctx, j.from.platform, j.from.track, ta.anchor);
      const b = trackEnd(ctx, j.to.platform, j.to.track, fa.anchor);
      if (!a || !b) continue;
      // run straight out of each station along its track for a while, then join the two with a slope
      const lead = 6;
      const out = (e: NonNullable<typeof a>, d: number): P3 => (e.axis === 'x' ? [e.p[0] + e.dir * d, e.p[1], e.p[2]] : [e.p[0], e.p[1], e.p[2] + e.dir * d]);
      const gap = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]);
      const pts: P3[] = gap < 2 * lead ? [a.p, b.p] : [a.p, out(a, lead), out(b, lead), b.p];
      const bed = ctx.style(null, p.trackBed, 'full')!;
      const rail = ctx.style(null, p.rail, 'full')!;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, y0, z0] = pts[i]!;
        const [x1, y1, z1] = pts[i + 1]!;
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 1e-3) continue;
        ctx.add(null, 'track', 'dark', { a: [x0, y0 - 0.035, z0], b: [x1, y1 - 0.035, z1], width: TRACK_W, thickness: 0.13 }, bed, { shade: [0.8, 1], pickable: false });
        // the two rails, offset across the direction of this stretch
        const nx = -(z1 - z0) / len;
        const nz = (x1 - x0) / len;
        for (const off of [-0.14, 0.14]) {
          ctx.add(null, 'track', 'metal', { a: [x0 + nx * off, y0 + 0.052, z0 + nz * off], b: [x1 + nx * off, y1 + 0.052, z1 + nz * off], width: 0.04, thickness: 0.045 }, rail, { pickable: false });
        }
      }
    }
  }
}
