/**
 * Debug helper: npx tsx scripts/print-route.ts [fromNodeId toNodeId [mode]]
 * Prints the demo routes (or one ad-hoc route) leg by leg.
 */
import stationJson from '../data/processed/station.json';
import { DEMO_ROUTES } from '../src/domain/demo';
import { buildGraph } from '../src/domain/graph';
import { findRoute, type RouteMode } from '../src/domain/route';
import type { StationModel } from '../src/domain/types';

const model = stationJson as unknown as StationModel;
const graph = buildGraph(model);
const label = new Map<string, string>();
for (const e of [...model.areas, ...model.gates, ...model.entrances, ...model.verticals]) {
  label.set(e.id, e.names.ja ?? e.names.en ?? e.id.replace(/^sk:[a-z-]+:/, ''));
}
const levelLabel = new Map(model.levels.map((l) => [l.id, l.names.ja ?? l.label]));

const [from, to, mode] = process.argv.slice(2);
const jobs = from && to ? [{ id: 'ad-hoc', fromNodeId: from, toNodeId: to, mode: (mode ?? 'default') as RouteMode }] : DEMO_ROUTES;

for (const job of jobs) {
  const r = findRoute(graph, job.fromNodeId, job.toNodeId, { mode: job.mode });
  console.log(`\n== ${job.id} (${job.mode}) ==`);
  if (!r.found) {
    console.log(`no route: ${r.reason} — ${r.detail}`);
    continue;
  }
  for (const leg of r.legs) {
    const lv = leg.levelIds.map((l) => levelLabel.get(l)).join(' → ');
    const fromTo = [leg.fromAreaId, leg.toAreaId].map((x) => (x ? label.get(x) : '—')).join(' → ');
    console.log(
      `${String(leg.index + 1).padStart(2)}. ${leg.kind.padEnd(8)} [${lv}] ${label.get(leg.elementId) ?? leg.elementId}${leg.verticalKind ? ` (${leg.verticalKind})` : ''} | ${fromTo}${leg.connection === 'inferred' ? ' | INFERRED' : ''}`,
    );
  }
  console.log('cost', JSON.stringify(r.cost), 'levels', r.levelSequence.map((l) => levelLabel.get(l)).join(' → '));
}
