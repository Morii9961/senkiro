/**
 * Data validation. Every rule here is a statement about station reality (or
 * about the honesty contract), written so that a mistake in the hand-entered
 * data fails `npm run data:build` and the unit tests instead of reaching the UI.
 */
import { buildGraph, verticalStopNodeId, type StationGraph } from './graph';
import type {
  Area,
  FareZone,
  PlanPoint,
  PlanRect,
  SourceRecord,
  StationElementBase,
  StationModel,
} from './types';

export interface ValidationIssue {
  rule: string;
  elementId: string;
  message: string;
}

const ID_PATTERN = /^sk:[a-z-]+:[a-z0-9-]+$/;
const DATA_NATURES = new Set([
  'official',
  'licensed-third-party',
  'derived',
  'manual-verified',
  'synthetic',
  'unknown',
]);

export function pointInRect(p: PlanPoint, r: PlanRect, eps = 1e-6): boolean {
  return p.x >= r.x0 - eps && p.x <= r.x1 + eps && p.z >= r.z0 - eps && p.z <= r.z1 + eps;
}

export function pointInFootprint(p: PlanPoint, footprint: PlanRect[]): boolean {
  return footprint.some((r) => pointInRect(p, r));
}

/** The point of a footprint nearest to p (p itself when it is inside). */
export function nearestInFootprint(p: PlanPoint, footprint: PlanRect[]): { point: PlanPoint; distance: number } {
  let best = { point: p, distance: Infinity };
  for (const r of footprint) {
    const q = { x: Math.min(r.x1, Math.max(r.x0, p.x)), z: Math.min(r.z1, Math.max(r.z0, p.z)) };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < best.distance) best = { point: q, distance: d };
  }
  return best;
}

/**
 * A gate is drawn on the line between the two areas it separates, so it may sit
 * in the narrow gap between their footprints — but no further away than this.
 */
export const GATE_LINE_TOLERANCE = 0.75;

function rectsOverlap(a: PlanRect, b: PlanRect, eps = 1e-6): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
}

export function allElements(model: StationModel): StationElementBase[] {
  return [
    ...model.levels,
    ...model.areas,
    ...model.passages,
    ...model.gates,
    ...model.entrances,
    ...model.verticals,
    ...model.unverifiedBlocks,
  ];
}

export function validateModel(model: StationModel, sources: SourceRecord[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (rule: string, elementId: string, message: string) =>
    issues.push({ rule, elementId, message });

  const sourceIds = new Set(sources.map((s) => s.id));
  const levelById = new Map(model.levels.map((l) => [l.id, l]));
  const areaById = new Map<string, Area>(model.areas.map((a) => [a.id, a]));
  const blockIds = new Set(model.unverifiedBlocks.map((b) => b.id));
  const stationIds = new Set(model.stations.map((s) => s.id));
  const lineIds = new Set(model.railLines.map((l) => l.id));
  const operatorIds = new Set(model.operators.map((o) => o.id));

  // --- ids -----------------------------------------------------------------
  const everything = [
    ...model.operators,
    ...model.railLines,
    model.complex,
    ...model.stations,
    ...allElements(model),
  ];
  const seen = new Set<string>();
  for (const e of everything) {
    if (!ID_PATTERN.test(e.id)) push('id-format', e.id, 'id must look like sk:<type>:<slug>');
    if (seen.has(e.id)) push('id-unique', e.id, 'duplicate id');
    seen.add(e.id);
    // --- provenance (contract §1.3: every visible datum traces to a source) --
    if (e.provenance.sourceIds.length === 0) push('provenance', e.id, 'no source');
    for (const s of e.provenance.sourceIds) {
      if (!sourceIds.has(s)) push('provenance', e.id, `unknown source ${s}`);
    }
    if (!DATA_NATURES.has(e.provenance.dataNature)) push('provenance', e.id, 'bad dataNature');
    // Hand-entered data: the compiler guarantees the keys, this guards the JSON round trip.
    const raw = e as unknown as Record<string, unknown>;
    if (raw.validFrom === undefined || raw.validTo === undefined) push('validity', e.id, 'validFrom/validTo missing');
  }

  for (const e of allElements(model)) {
    if (e.stationId !== null && !stationIds.has(e.stationId)) {
      push('reference', e.id, `unknown station ${e.stationId}`);
    }
    if (!['verified', 'schematic', 'unknown'].includes(e.geometryConfidence)) {
      push('geometry-confidence', e.id, 'bad geometryConfidence');
    }
    // Honesty: an element that was not verified cannot claim better geometry.
    if (e.existence === 'unverified' && e.geometryConfidence !== 'unknown') {
      push('geometry-confidence', e.id, 'unverified elements must have geometryConfidence "unknown"');
    }
    if (e.existence === 'verified' && e.asOf === null) {
      push('as-of', e.id, 'verified elements must record the date of their source material');
    }
    // Schematic coordinates are synthetic; nothing may be marked "verified"
    // geometry unless it carries a non-synthetic, non-manual source.
    if (e.geometryConfidence === 'verified' && e.provenance.dataNature === 'manual-verified') {
      push('geometry-confidence', e.id, 'hand-entered geometry cannot be "verified"');
    }
  }

  // --- levels ----------------------------------------------------------------
  for (const l of model.levels) {
    if (!operatorIds.has(l.operatorId)) push('reference', l.id, `unknown operator ${l.operatorId}`);
  }
  const sortedByOrdinal = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 0; i + 1 < sortedByOrdinal.length; i++) {
    const lo = sortedByOrdinal[i]!;
    const hi = sortedByOrdinal[i + 1]!;
    if (lo.ordinal < hi.ordinal && lo.elevation >= hi.elevation) {
      push('level-order', hi.id, `drawn elevation contradicts ordinal (vs ${lo.id})`);
    }
  }

  // --- areas -----------------------------------------------------------------
  for (const a of model.areas) {
    if (!levelById.has(a.levelId)) push('reference', a.id, `unknown level ${a.levelId}`);
    if (a.footprint.length === 0) push('geometry', a.id, 'empty footprint');
    for (const r of a.footprint) {
      if (!(r.x0 < r.x1 && r.z0 < r.z1)) push('geometry', a.id, 'degenerate rectangle');
    }
    for (let i = 0; i < a.footprint.length; i++) {
      for (let j = i + 1; j < a.footprint.length; j++) {
        if (rectsOverlap(a.footprint[i]!, a.footprint[j]!)) {
          push('geometry', a.id, 'footprint rectangles overlap (would z-fight)');
        }
      }
    }
    if (!pointInFootprint(a.anchor, a.footprint)) push('geometry', a.id, 'anchor outside footprint');
    if (a.kind === 'platform') {
      if (a.fareZone === 'unpaid') push('fare-zone', a.id, 'a platform cannot be unpaid');
      for (const t of a.tracks) {
        for (const s of t.services) {
          if (!lineIds.has(s.railLineId)) push('reference', a.id, `unknown rail line ${s.railLineId}`);
        }
      }
    }
  }
  // Areas of the same level must not overlap each other: one spot, one zone.
  for (let i = 0; i < model.areas.length; i++) {
    for (let j = i + 1; j < model.areas.length; j++) {
      const a = model.areas[i]!;
      const b = model.areas[j]!;
      if (a.levelId !== b.levelId) continue;
      if (a.footprint.some((ra) => b.footprint.some((rb) => rectsOverlap(ra, rb)))) {
        push('geometry', a.id, `overlaps ${b.id} on the same level`);
      }
    }
  }

  // --- passages: same level, same fare zone ----------------------------------
  for (const p of model.passages) {
    const a = areaById.get(p.fromAreaId);
    const b = areaById.get(p.toAreaId);
    if (!a || !b) {
      push('reference', p.id, 'passage endpoint does not exist');
      continue;
    }
    // Operators number floors independently, so "same floor" means same ordinal.
    if (levelById.get(a.levelId)?.ordinal !== levelById.get(b.levelId)?.ordinal) {
      push('passage-level', p.id, 'a passage cannot change level');
    }
    if (a.fareZone !== b.fareZone) {
      push('fare-zone', p.id, `passage joins ${a.fareZone} and ${b.fareZone} without a gate`);
    }
  }

  // --- gates -----------------------------------------------------------------
  for (const g of model.gates) {
    if (!levelById.has(g.levelId)) push('reference', g.id, `unknown level ${g.levelId}`);
    const zones: (FareZone | 'outside-model')[] = [];
    let areaSides = 0;
    for (const side of g.sides) {
      if ('areaId' in side) {
        const area = areaById.get(side.areaId);
        if (!area) {
          push('reference', g.id, `unknown area ${side.areaId}`);
          continue;
        }
        areaSides += 1;
        zones.push(area.fareZone);
        if (levelById.get(area.levelId)?.ordinal !== levelById.get(g.levelId)?.ordinal) {
          push('gate-level', g.id, `${area.id} is on another level`);
        }
        // the drawing and the graph must agree on where the gate is: on the edge of each area it joins
        if (nearestInFootprint(g.position, area.footprint).distance > GATE_LINE_TOLERANCE) {
          push('gate-position', g.id, `drawn away from ${area.id}`);
        }
      } else {
        if (!blockIds.has(side.blockId)) push('reference', g.id, `unknown block ${side.blockId}`);
        zones.push('outside-model');
      }
    }
    if (areaSides === 0) push('gate-sides', g.id, 'a gate needs at least one modelled side');
    const [z0, z1] = zones;
    if (z0 !== undefined && z1 !== undefined && z0 === z1) {
      push('gate-sides', g.id, 'a gate must separate two different fare zones');
    }
    const paidSides = zones.filter((z) => z !== 'unpaid' && z !== 'outside-model').length;
    if (g.gateKind === 'ticket' && zones.includes('outside-model') === false) {
      if (!(paidSides === 1 && zones.includes('unpaid'))) {
        push('gate-sides', g.id, 'a ticket gate separates exactly one paid and one unpaid area');
      }
    }
    if (g.gateKind === 'transfer' && zones.includes('unpaid')) {
      push('gate-sides', g.id, 'a transfer gate joins two paid areas');
    }
    if (g.direction === 'exit-only' && g.gateKind !== 'ticket') {
      push('gate-sides', g.id, 'only ticket gates can be exit-only');
    }
  }

  // --- entrances: only into unpaid areas -------------------------------------
  for (const e of model.entrances) {
    const area = areaById.get(e.areaId);
    if (!area) {
      push('reference', e.id, `unknown area ${e.areaId}`);
      continue;
    }
    if (area.fareZone !== 'unpaid') {
      push('fare-zone', e.id, 'an entrance cannot open straight into a paid area');
    }
    if (area.levelId !== e.levelId) push('entrance-level', e.id, 'entrance and its area differ in level');
  }

  // --- vertical facilities ---------------------------------------------------
  for (const v of model.verticals) {
    if (v.stops.length < 2) push('vertical-stops', v.id, 'needs at least two stops');
    const zones = new Set<FareZone>();
    const levels = new Set<string>();
    for (const s of v.stops) {
      const area = areaById.get(s.areaId);
      const level = levelById.get(s.levelId);
      if (!area) push('reference', v.id, `unknown area ${s.areaId}`);
      if (!level) push('reference', v.id, `unknown level ${s.levelId}`);
      if (!area || !level) continue;
      if (area.levelId !== s.levelId) push('vertical-stops', v.id, `${area.id} is not on ${s.levelId}`);
      if (levels.has(s.levelId)) push('vertical-stops', v.id, `stops twice on ${s.levelId}`);
      levels.add(s.levelId);
      zones.add(area.fareZone);
      if (!pointInFootprint(s.position, area.footprint)) {
        push('geometry', v.id, `stop on ${s.levelId} lies outside ${area.id}`);
      }
    }
    // A staircase or lift never crosses the fare boundary on its own.
    if (zones.size > 1) {
      push('fare-zone', v.id, `joins ${[...zones].join(' and ')} without a gate`);
    }
    for (let i = 0; i + 1 < v.stops.length; i++) {
      const a = levelById.get(v.stops[i]!.levelId);
      const b = levelById.get(v.stops[i + 1]!.levelId);
      if (!a || !b) continue;
      const span = Math.abs(a.ordinal - b.ordinal);
      if (span === 0) push('vertical-adjacent', v.id, `${a.id} and ${b.id} are the same height`);
      if (span > 1 && !v.declaredNonAdjacent) {
        push(
          'vertical-adjacent',
          v.id,
          `${a.id} → ${b.id} skips a level and is not declared as a non-adjacent connection`,
        );
      }
    }
    if (v.verticalKind === 'elevator') {
      // A lift shaft is vertical: every stop shares one plan position.
      const p0 = v.stops[0]?.position;
      for (const s of v.stops) {
        if (p0 && (Math.abs(s.position.x - p0.x) > 1e-6 || Math.abs(s.position.z - p0.z) > 1e-6)) {
          push('geometry', v.id, 'elevator stops are not vertically aligned');
        }
      }
    }
  }

  // --- unverified blocks must say so -----------------------------------------
  for (const b of model.unverifiedBlocks) {
    if (b.existence !== 'unverified') push('unverified-block', b.id, 'must be marked unverified');
  }

  issues.push(...validateGraph(buildGraph(model)));
  issues.push(...checkModelGraphConsistency(model, buildGraph(model)));
  return issues;
}

/**
 * Graph-level statement of the fare rule: wherever an edge joins two different
 * zones, one of its ends is a Gate. Paid and unpaid never touch directly.
 */
export function validateGraph(graph: StationGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) issues.push({ rule: 'graph-node-unique', elementId: n.id, message: 'duplicate node' });
    ids.add(n.id);
  }
  for (const e of graph.edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) {
      issues.push({
        rule: 'graph-endpoints',
        elementId: e.id,
        message: `edge endpoint missing: ${!a ? e.from : e.to}`,
      });
      continue;
    }
    if (a.zone !== b.zone && a.kind !== 'gate' && b.kind !== 'gate') {
      issues.push({
        rule: 'graph-fare-boundary',
        elementId: e.id,
        message: `${a.zone} ↔ ${b.zone} joined without a gate`,
      });
    }
    if (e.kind !== 'vertical' && a.levelOrdinal !== b.levelOrdinal) {
      issues.push({
        rule: 'graph-level-change',
        elementId: e.id,
        message: 'only vertical-facility edges may change level',
      });
    }
    if (e.kind === 'vertical' && e.levelChange < 1) {
      issues.push({ rule: 'graph-level-change', elementId: e.id, message: 'vertical edge without level change' });
    }
  }
  return issues;
}

/**
 * The drawn model and the routing graph must describe the same station:
 * every routable element has its node(s), and every node points back to an
 * element that exists and sits on the node's level.
 */
export function checkModelGraphConsistency(model: StationModel, graph: StationGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const expect = (id: string, owner: string) => {
    if (!nodeIds.has(id)) {
      issues.push({ rule: 'model-graph', elementId: owner, message: `drawn but not in the graph: ${id}` });
    }
  };
  for (const a of model.areas) expect(a.id, a.id);
  for (const g of model.gates) expect(g.id, g.id);
  for (const e of model.entrances) expect(e.id, e.id);
  for (const v of model.verticals) for (const s of v.stops) expect(verticalStopNodeId(v.id, s.levelId), v.id);

  const elementLevel = new Map<string, Set<string>>();
  const put = (id: string, levelId: string) => {
    const set = elementLevel.get(id) ?? new Set<string>();
    set.add(levelId);
    elementLevel.set(id, set);
  };
  for (const a of model.areas) put(a.id, a.levelId);
  for (const g of model.gates) put(g.id, g.levelId);
  for (const e of model.entrances) put(e.id, e.levelId);
  for (const v of model.verticals) for (const s of v.stops) put(v.id, s.levelId);

  for (const n of graph.nodes) {
    const levels = elementLevel.get(n.elementId);
    if (!levels) {
      issues.push({ rule: 'model-graph', elementId: n.id, message: 'graph node without a drawn element' });
    } else if (!levels.has(n.levelId)) {
      issues.push({ rule: 'model-graph', elementId: n.id, message: 'node level differs from its element' });
    }
  }

  const edgeElements = new Set([
    ...model.passages.map((p) => p.id),
    ...model.gates.map((g) => g.id),
    ...model.entrances.map((e) => e.id),
    ...model.verticals.map((v) => v.id),
  ]);
  for (const e of graph.edges) {
    if (!edgeElements.has(e.elementId)) {
      issues.push({ rule: 'model-graph', elementId: e.id, message: 'edge not backed by a model element' });
    }
  }
  // Unverified blocks are drawn but must never be routable.
  const blockIds = new Set(model.unverifiedBlocks.map((b) => b.id));
  for (const n of graph.nodes) {
    if (blockIds.has(n.elementId)) {
      issues.push({ rule: 'model-graph', elementId: n.id, message: 'unverified block leaked into the graph' });
    }
  }
  return issues;
}
