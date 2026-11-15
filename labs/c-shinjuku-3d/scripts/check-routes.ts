/**
 * Consistency check of the walking graph: npx tsx scripts/check-routes.ts
 *
 * Searches a route between every ordered pair of places a user can pick (platforms, ticket gates,
 * entrances), in both modes, and prints what cannot be reached and why. Nothing is written.
 * The unit test tests/unit/route.test.ts pins the numbers this prints.
 */
import stationJson from '../data/processed/station.json';
import { buildGraph } from '../src/domain/graph';
import { findRoute, type RouteMode } from '../src/domain/route';
import type { StationModel } from '../src/domain/types';

const model = stationJson as unknown as StationModel;
const graph = buildGraph(model);

export interface RouteAudit {
  places: number;
  pairs: number;
  unreachable: { from: string; to: string; reason: string }[];
  /** Routes whose floor sequence changes floor on a leg that is not a stair, escalator or lift. */
  levelJumps: string[];
}

export function auditRoutes(mode: RouteMode): RouteAudit {
  const places = [
    ...model.areas.filter((a) => a.kind === 'platform').map((a) => a.id),
    ...model.gates.map((g) => g.id),
    ...model.entrances.map((e) => e.id),
  ];
  const unreachable: RouteAudit['unreachable'] = [];
  const levelJumps: string[] = [];
  let pairs = 0;
  for (const from of places) {
    for (const to of places) {
      if (from === to) continue;
      pairs += 1;
      const r = findRoute(graph, from, to, { mode });
      if (!r.found) {
        unreachable.push({ from, to, reason: r.reason });
        continue;
      }
      for (const leg of r.legs) {
        if (leg.kind !== 'vertical' && new Set(leg.levelIds).size > 1) levelJumps.push(`${from} → ${to}: ${leg.kind} ${leg.levelIds.join(' → ')}`);
      }
    }
  }
  return { places: places.length, pairs, unreachable, levelJumps };
}

const short = (id: string) => id.replace(/^sk:/, '');

if (process.argv[1]?.endsWith('check-routes.ts')) {
  for (const mode of ['default', 'elevator-only'] as const) {
    const a = auditRoutes(mode);
    console.log(`\n== ${mode}: ${a.places} places, ${a.pairs} ordered pairs, ${a.unreachable.length} without a route, ${a.levelJumps.length} floor jumps off a vertical ==`);
    const byReason = new Map<string, number>();
    for (const u of a.unreachable) byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1);
    console.log('  by reason:', Object.fromEntries(byReason));
    // a place that nothing reaches, or that reaches nothing, is the interesting case
    const total = a.places - 1;
    const asFrom = new Map<string, number>();
    const asTo = new Map<string, number>();
    for (const u of a.unreachable) {
      asFrom.set(u.from, (asFrom.get(u.from) ?? 0) + 1);
      asTo.set(u.to, (asTo.get(u.to) ?? 0) + 1);
    }
    const dead = [...asFrom].filter(([, n]) => n === total).map(([id]) => short(id));
    const orphan = [...asTo].filter(([, n]) => n === total).map(([id]) => short(id));
    console.log(`  cannot leave (${dead.length}):`, dead.join(', ') || '—');
    console.log(`  cannot be reached (${orphan.length}):`, orphan.join(', ') || '—');
    const partial = [...asTo].filter(([, n]) => n !== total).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([id, n]) => `${short(id)} (${n})`);
    console.log('  hardest to reach otherwise:', partial.join(', ') || '—');
    for (const j of a.levelJumps.slice(0, 5)) console.log('  floor jump:', j);
  }
}
