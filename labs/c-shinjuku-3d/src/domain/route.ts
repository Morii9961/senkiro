/**
 * Route search over the station graph.
 *
 * There is no surveyed distance data, so a route's cost is NEVER expressed in
 * metres or minutes. It is a tuple compared lexicographically:
 *
 *   1. fewest gate passes   — never leave the paid area and come back in,
 *                             which in reality costs a fare;
 *   2. fewest level changes;
 *   3. fewest boardings     — each staircase, escalator or lift taken counts
 *                             once however many floors it covers, so one lift
 *                             through three floors beats two lifts in a row;
 *   4. fewest segments;
 *   5. a mild preference    — in the default mode escalator, then stairs, then
 *                             lift, so that lifts are left to those who need
 *                             them. It only ever breaks ties.
 *
 * Lexicographic comparison of additive non-negative tuples is a total order
 * compatible with addition, so plain Dijkstra stays correct.
 */
import type { GraphEdge, GraphNode, StationGraph } from './graph';
import type { ConnectionConfidence, StepFree, VerticalKind } from './types';

export type RouteMode = 'default' | 'elevator-only';

export interface RouteOptions {
  mode?: RouteMode;
  /** Use links whose existence was inferred from signage text. Default true. */
  allowInferred?: boolean;
}

export interface RouteCost {
  gatePasses: number;
  levelChanges: number;
  /** Staircases, escalators and lifts taken (a multi-floor ride counts once). */
  facilityBoardings: number;
  segments: number;
}

export type RouteLegKind = 'enter' | 'exit' | 'walk' | 'gate' | 'vertical';

export interface RouteLeg {
  index: number;
  kind: RouteLegKind;
  /** Graph nodes covered by this leg, in order. */
  nodeIds: string[];
  /** The facility / gate / passage / entrance this leg uses. */
  elementId: string;
  fromAreaId: string | null;
  toAreaId: string | null;
  /** Levels visited by this leg, in order (one entry for same-level legs). */
  levelIds: string[];
  verticalKind: VerticalKind | null;
  stepFree: StepFree;
  connection: ConnectionConfidence;
}

export interface Route {
  found: true;
  mode: RouteMode;
  nodeIds: string[];
  edgeIds: string[];
  legs: RouteLeg[];
  cost: RouteCost;
  /** Levels in visiting order, consecutive duplicates removed. */
  levelSequence: string[];
  /** Gates, entrances and vertical facilities used, in order. */
  facilityElementIds: string[];
  /** Legs whose step-free status no source confirms (elevator-only mode cares). */
  unconfirmedStepFreeLegs: number;
  inferredLegs: number;
  /** No surveyed data exists. These stay null; the UI prints "unknown". */
  distanceMeters: null;
  durationMinutes: null;
}

export interface NoRoute {
  found: false;
  mode: RouteMode;
  reason: 'unknown-node' | 'unreachable';
  detail: string;
}

export type RouteResult = Route | NoRoute;

/** [gate passes, level changes, boardings, segments, preference] */
type Cost = readonly [number, number, number, number, number];
const ZERO: Cost = [0, 0, 0, 0, 0];

function less(a: Cost, b: Cost): boolean {
  for (let i = 0; i < 5; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

function add(a: Cost, b: Cost): Cost {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4]];
}

const DEFAULT_PREFERENCE = { escalator: 0, stairs: 1, elevator: 2 } as const;

/**
 * Edge weights. A gate pass is charged on the way *into* the gate node, a
 * level change on the stop→stop edge, a boarding on the way *onto* a
 * facility. The segment component approximates the number of legs a person
 * would describe, so stepping off a facility or out of a gate is free.
 */
function edgeWeight(edge: GraphEdge, nodeById: Map<string, GraphNode>, mode: RouteMode): Cost {
  const to = nodeById.get(edge.to);
  switch (edge.kind) {
    case 'gate-approach':
      return to?.kind === 'gate' ? [1, 0, 0, 1, 0] : ZERO;
    case 'vertical':
      return [0, edge.levelChange, 0, 0, 0];
    case 'vertical-approach': {
      if (to?.kind !== 'vertical-stop') return ZERO;
      const pref = mode === 'default' && edge.verticalKind ? DEFAULT_PREFERENCE[edge.verticalKind] : 0;
      return [0, 0, 1, 1, pref];
    }
    case 'entrance-approach':
      return [0, 0, 0, 1, 0];
    case 'passage':
      return [0, 0, 0, 1, 0];
  }
}

function edgeAllowed(edge: GraphEdge, mode: RouteMode, allowInferred: boolean): boolean {
  if (!allowInferred && edge.connection === 'inferred') return false;
  if (mode === 'elevator-only') {
    if (edge.kind === 'vertical' && edge.verticalKind !== 'elevator') return false;
    if (edge.kind === 'vertical-approach' && edge.verticalKind !== 'elevator') return false;
    if (edge.stepFree === false) return false;
  }
  return true;
}

export function findRoute(
  graph: StationGraph,
  fromNodeId: string,
  toNodeId: string,
  options: RouteOptions = {},
): RouteResult {
  const mode = options.mode ?? 'default';
  const allowInferred = options.allowInferred ?? true;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!nodeById.has(fromNodeId) || !nodeById.has(toNodeId)) {
    return {
      found: false,
      mode,
      reason: 'unknown-node',
      detail: `${!nodeById.has(fromNodeId) ? fromNodeId : toNodeId} is not a node of the graph`,
    };
  }

  // A ticket gate as origin means "enter here"; as destination, "leave here".
  // So the first step may not fall back out to the unpaid side, and the last
  // step may not arrive from it. (An exit-only gate therefore cannot be an origin.)
  const ticketGates = new Set<string>();
  for (const e of graph.edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (a?.kind === 'gate' && b?.zone === 'unpaid') ticketGates.add(a.id);
    if (b?.kind === 'gate' && a?.zone === 'unpaid') ticketGates.add(b.id);
  }
  const startsAtTicketGate = ticketGates.has(fromNodeId);
  const endsAtTicketGate = ticketGates.has(toNodeId);

  const out = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!edgeAllowed(e, mode, allowInferred)) continue;
    if (startsAtTicketGate && e.from === fromNodeId && nodeById.get(e.to)?.zone === 'unpaid') continue;
    if (endsAtTicketGate && e.to === toNodeId && nodeById.get(e.from)?.zone === 'unpaid') continue;
    const list = out.get(e.from);
    if (list) list.push(e);
    else out.set(e.from, [e]);
  }

  const dist = new Map<string, Cost>([[fromNodeId, ZERO]]);
  const prev = new Map<string, GraphEdge>();
  const done = new Set<string>();

  // The graph has a few hundred nodes; a linear scan keeps this dependency-free
  // and fully deterministic (ties resolve by node id).
  for (;;) {
    let current: string | null = null;
    let best: Cost | null = null;
    for (const [id, d] of dist) {
      if (done.has(id)) continue;
      if (best === null || less(d, best) || (!less(best, d) && current !== null && id < current)) {
        best = d;
        current = id;
      }
    }
    if (current === null || best === null) break;
    if (current === toNodeId) break;
    done.add(current);
    for (const e of out.get(current) ?? []) {
      if (done.has(e.to)) continue;
      const cand = add(best, edgeWeight(e, nodeById, mode));
      const known = dist.get(e.to);
      if (!known || less(cand, known)) {
        dist.set(e.to, cand);
        prev.set(e.to, e);
      }
    }
  }

  if (!dist.has(toNodeId)) {
    return {
      found: false,
      mode,
      reason: 'unreachable',
      detail:
        mode === 'elevator-only'
          ? 'No route that uses only elevators and avoids links known to have steps.'
          : 'No route in the verified model.',
    };
  }

  const pathEdges: GraphEdge[] = [];
  for (let at = toNodeId; at !== fromNodeId; ) {
    const e = prev.get(at);
    if (!e) break;
    pathEdges.unshift(e);
    at = e.from;
  }
  return assembleRoute(mode, fromNodeId, pathEdges, nodeById);
}

function assembleRoute(
  mode: RouteMode,
  fromNodeId: string,
  pathEdges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
): Route {
  const nodeIds = [fromNodeId, ...pathEdges.map((e) => e.to)];
  const legs: RouteLeg[] = [];
  const node = (id: string) => nodeById.get(id)!;
  const areaOf = (id: string): string | null => (node(id).kind === 'area' ? id : null);

  let i = 0;
  while (i < pathEdges.length) {
    const e = pathEdges[i]!;
    const from = node(e.from);
    const to = node(e.to);

    if (e.kind === 'passage') {
      legs.push(leg('walk', [e.from, e.to], e, e.from, e.to, [from.levelId]));
      i += 1;
      continue;
    }

    if (e.kind === 'entrance-approach') {
      const entering = from.kind === 'entrance';
      legs.push(
        leg(
          entering ? 'enter' : 'exit',
          [e.from, e.to],
          e,
          entering ? null : e.from,
          entering ? e.to : null,
          [from.levelId],
        ),
      );
      i += 1;
      continue;
    }

    if (e.kind === 'gate-approach') {
      // area → gate [→ area]; a route may also start or end on the gate itself.
      const next = pathEdges[i + 1];
      if (to.kind === 'gate' && next && next.kind === 'gate-approach' && next.from === e.to) {
        legs.push(leg('gate', [e.from, e.to, next.to], e, e.from, next.to, [to.levelId]));
        i += 2;
      } else {
        const gateId = to.kind === 'gate' ? e.to : e.from;
        legs.push(leg('gate', [e.from, e.to], e, areaOf(e.from), areaOf(e.to), [node(gateId).levelId]));
        i += 1;
      }
      continue;
    }

    // vertical-approach / vertical: gather the whole ride on one facility.
    const facilityId = e.elementId;
    const rideNodes = [e.from];
    const levels: string[] = [];
    let stepFree: StepFree = true;
    let j = i;
    while (j < pathEdges.length) {
      const r = pathEdges[j]!;
      if (r.elementId !== facilityId || (r.kind !== 'vertical' && r.kind !== 'vertical-approach')) break;
      rideNodes.push(r.to);
      if (r.kind === 'vertical') {
        if (levels.length === 0) levels.push(node(r.from).levelId);
        levels.push(node(r.to).levelId);
        if (r.stepFree !== true) stepFree = r.stepFree;
      }
      j += 1;
    }
    if (levels.length === 0) levels.push(from.levelId);
    const first = rideNodes[0]!;
    const last = rideNodes[rideNodes.length - 1]!;
    legs.push({
      index: legs.length,
      kind: 'vertical',
      nodeIds: rideNodes,
      elementId: facilityId,
      fromAreaId: areaOf(first),
      toAreaId: areaOf(last),
      levelIds: levels,
      verticalKind: e.verticalKind,
      stepFree,
      connection: 'verified',
    });
    i = j;
  }

  function leg(
    kind: RouteLegKind,
    ids: string[],
    e: GraphEdge,
    fromAreaId: string | null,
    toAreaId: string | null,
    levelIds: string[],
  ): RouteLeg {
    return {
      index: legs.length,
      kind,
      nodeIds: ids,
      elementId: e.elementId,
      fromAreaId,
      toAreaId,
      levelIds,
      verticalKind: null,
      stepFree: e.stepFree,
      connection: e.connection,
    };
  }

  const levelSequence: string[] = [];
  for (const id of nodeIds) {
    const lv = node(id).levelId;
    if (levelSequence[levelSequence.length - 1] !== lv) levelSequence.push(lv);
  }

  const facilityElementIds: string[] = [];
  for (const l of legs) {
    if (l.kind !== 'walk' && facilityElementIds[facilityElementIds.length - 1] !== l.elementId) {
      facilityElementIds.push(l.elementId);
    }
  }

  let levelChanges = 0;
  for (const e of pathEdges) if (e.kind === 'vertical') levelChanges += e.levelChange;
  const gatePasses = nodeIds.filter((id) => node(id).kind === 'gate').length;

  return {
    found: true,
    mode,
    nodeIds,
    edgeIds: pathEdges.map((e) => e.id),
    legs,
    cost: {
      gatePasses,
      levelChanges,
      facilityBoardings: legs.filter((l) => l.kind === 'vertical').length,
      segments: legs.length,
    },
    levelSequence,
    facilityElementIds,
    unconfirmedStepFreeLegs: legs.filter((l) => l.kind !== 'vertical' && l.stepFree === null).length,
    inferredLegs: legs.filter((l) => l.connection === 'inferred').length,
    distanceMeters: null,
    durationMinutes: null,
  };
}
