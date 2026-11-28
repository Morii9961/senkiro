/**
 * Span check of stairs and escalators: npx tsx scripts/check-verticals.ts [--json]
 *
 * For every pair of consecutive stops of a staircase or escalator, prints the horizontal span
 * (plan distance between the two stop positions), the rise as drawn (same rule as `ctx.topOf`:
 * level height plus the slab or platform top, at the default floor spacing of the 3D view), and
 * the angle that gives. Flags spans that are drawn far steeper or flatter than a real flight, or
 * that have no horizontal run at all, and stops that lie outside the area they belong to.
 *
 * Plan coordinates and elevations are schematic units (see `unitNote` in station.json), so the
 * angle is a property of the drawing, not of the real station: a flag says the drawing looks
 * implausible, not that the data is wrong. Nothing is written; this script only reads.
 */
import stationJson from '../data/processed/station.json';
import { pointInFootprint, nearestInFootprint } from '../src/domain/validate';
import type { Area, Level, StationModel } from '../src/domain/types';
import { PLATFORM_TOP, SLAB_TOP, levelY } from '../src/ui/scene/prims';

const model = stationJson as unknown as StationModel;
/** Default of the "floor spacing" slider in src/ui/App.tsx. */
const DEFAULT_EXPLODE = 0.3;

/** Drawn angles outside this band are flagged. A real staircase is about 30–35°, an escalator 30°. */
export const STEEP_DEG = 65;
export const FLAT_DEG = 15;
/** A span this long (schematic units) is flagged as a long free-standing flight whatever its angle. */
export const LONG_SPAN = 8;

export interface SpanRow {
  id: string;
  kind: 'stairs' | 'escalator';
  from: string;
  to: string;
  span: number;
  rise: number;
  angle: number;
  flags: string[];
}

export function auditSpans(m: StationModel = model, explode = DEFAULT_EXPLODE): SpanRow[] {
  const levelById = new Map<string, Level>(m.levels.map((l) => [l.id, l]));
  const areaById = new Map<string, Area>(m.areas.map((a) => [a.id, a]));
  const topOf = (areaId: string) => {
    const a = areaById.get(areaId)!;
    return levelY(levelById.get(a.levelId)!, explode) + (a.kind === 'platform' ? PLATFORM_TOP : SLAB_TOP);
  };
  const rows: SpanRow[] = [];
  for (const v of m.verticals) {
    if (v.verticalKind === 'elevator') continue;
    for (let i = 0; i + 1 < v.stops.length; i++) {
      const a = v.stops[i]!;
      const b = v.stops[i + 1]!;
      const span = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
      const rise = Math.abs(topOf(b.areaId) - topOf(a.areaId));
      const angle = (Math.atan2(rise, span) * 180) / Math.PI;
      const flags: string[] = [];
      if (span < 0.05) flags.push('no-run');
      else if (angle > STEEP_DEG) flags.push('steep');
      if (angle < FLAT_DEG) flags.push('flat');
      if (span > LONG_SPAN) flags.push('long');
      for (const s of [a, b]) {
        const area = areaById.get(s.areaId);
        if (area && !pointInFootprint(s.position, area.footprint)) {
          flags.push(`stop-outside:${s.areaId.replace(/^sk:/, '')}(${nearestInFootprint(s.position, area.footprint).distance.toFixed(2)})`);
        }
      }
      rows.push({ id: v.id, kind: v.verticalKind, from: a.levelId, to: b.levelId, span, rise, angle, flags });
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith('check-verticals.ts')) {
  const rows = auditSpans();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 1));
  } else {
    const short = (id: string) => id.replace(/^sk:(vertical|level):/, '');
    const angles = rows.map((r) => r.angle).sort((x, y) => x - y);
    const q = (f: number) => angles[Math.min(angles.length - 1, Math.floor(f * angles.length))]!.toFixed(0);
    console.log(`${rows.length} spans (stairs ${rows.filter((r) => r.kind === 'stairs').length}, escalators ${rows.filter((r) => r.kind === 'escalator').length}); drawn angle at floor spacing ${DEFAULT_EXPLODE}: min ${q(0)}°, median ${q(0.5)}°, max ${q(0.999)}°`);
    console.log(`flags: steep > ${STEEP_DEG}°, flat < ${FLAT_DEG}°, long > ${LONG_SPAN} units, no-run = no horizontal run, stop-outside = stop position not inside its area (distance)`);
    const flagged = rows.filter((r) => r.flags.length > 0);
    console.log(`${flagged.length} flagged:`);
    for (const r of flagged) {
      console.log(`  ${r.kind.padEnd(9)} ${short(r.id)}  ${short(r.from)} → ${short(r.to)}  span ${r.span.toFixed(2)}  rise ${r.rise.toFixed(2)}  ${r.angle.toFixed(0)}°  [${r.flags.join(', ')}]`);
    }
  }
}
