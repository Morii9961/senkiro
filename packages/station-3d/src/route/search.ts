/**
 * Indoor route search over an {@link IndoorGraph}.
 *
 * No surveyed distances exist, so a route's cost is never metres or minutes. It is a tuple
 * compared lexicographically (Lab C, generalised to the contract's place/link graph):
 *
 *   1. fewest gate passes      — never leave a paid area and come back in;
 *   2. fewest floors changed   — a lift past three floors counts three;
 *   3. fewest boardings        — consecutive stairs / escalator / lift links of one kind are
 *                                one ride, so one lift through three floors beats two lifts;
 *   4. (`step_free` only) fewest links whose step-free status no source confirms;
 *   5. fewest segments;
 *   6. (`standard` only) a mild preference escalator < stairs < lift, so lifts stay free for
 *      those who need them. It only ever breaks ties.
 *
 * Lexicographic order on additive, non-negative tuples is compatible with addition, so a
 * plain Dijkstra stays optimal. Ties resolve by state key, so results are deterministic.
 *
 * Hard boundaries, independent of cost: a link touching `'roadway'` is never used, and two
 * operators' paid areas are joined only by a verified transfer gate ({@link crossingVerdict}).
 */
import type {
  SkId,
  StationLinkKind,
  StationRouteFound,
  StationRouteMode,
  StationRouteNotFound,
  StationRouteQuery,
  StationRouteResult,
  StationRouteStep,
} from '@senkiro/contracts';
import {
  effectiveStepFree,
  type GraphEdge,
  type IndoorGraph,
  isVerticalLinkKind,
} from '../graph/build.ts';
import { crossingVerdict } from '../graph/policy.ts';

type Cost = readonly [number, number, number, number, number, number];
const ZERO: Cost = [0, 0, 0, 0, 0, 0];
const COST_SLOTS = 6;

function lessCost(a: Cost, b: Cost): boolean {
  for (let i = 0; i < COST_SLOTS; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) {
      return x < y;
    }
  }
  return false;
}

function addCost(a: Cost, b: Cost): Cost {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4], a[5] + b[5]];
}

const PREFERENCE: Readonly<Partial<Record<StationLinkKind, number>>> = {
  escalator: 0,
  stairs: 1,
  elevator: 2,
};

type RideKind = StationLinkKind | 'none';

interface State {
  key: string;
  place: SkId<'place'>;
  ride: RideKind;
}

function stateKey(place: SkId<'place'>, ride: RideKind): string {
  return `${place}|${ride}`;
}

/** Whether `edge` may be used at all in `mode`. */
export function edgeAllowed(
  graph: IndoorGraph,
  edge: GraphEdge,
  mode: StationRouteMode,
  allowInferred: boolean,
): boolean {
  const link = edge.link;
  if (!allowInferred && link.connection === 'inferred') {
    return false;
  }
  const from = graph.nodes.get(edge.from);
  const to = graph.nodes.get(edge.to);
  if (from === undefined || to === undefined) {
    return false;
  }
  if (crossingVerdict(link, from.zone, to.zone) !== 'open') {
    return false;
  }
  if (mode === 'step_free') {
    if (isVerticalLinkKind(link.kind) && link.kind !== 'elevator') {
      return false;
    }
    if (effectiveStepFree(link) === false) {
      return false;
    }
  }
  return true;
}

function edgeCost(edge: GraphEdge, ride: RideKind, mode: StationRouteMode): Cost {
  const link = edge.link;
  const unconfirmed = mode === 'step_free' && effectiveStepFree(link) === null ? 1 : 0;
  if (isVerticalLinkKind(link.kind)) {
    const boarding = ride === link.kind ? 0 : 1;
    const preference = mode === 'standard' && boarding === 1 ? (PREFERENCE[link.kind] ?? 0) : 0;
    return [0, edge.floorSpan, boarding, unconfirmed, boarding, preference];
  }
  const gate = link.kind === 'gate' ? 1 : 0;
  return [gate, 0, 0, unconfirmed, 1, 0];
}

/** Minimal binary heap ordered by (cost, state key). */
class StateHeap {
  private readonly items: { cost: Cost; state: State }[] = [];

  get size(): number {
    return this.items.length;
  }

  private before(i: number, j: number): boolean {
    const a = this.items[i];
    const b = this.items[j];
    if (a === undefined || b === undefined) {
      return false;
    }
    if (lessCost(a.cost, b.cost)) {
      return true;
    }
    if (lessCost(b.cost, a.cost)) {
      return false;
    }
    return a.state.key < b.state.key;
  }

  private swap(i: number, j: number): void {
    const a = this.items[i];
    const b = this.items[j];
    if (a !== undefined && b !== undefined) {
      this.items[i] = b;
      this.items[j] = a;
    }
  }

  push(cost: Cost, state: State): void {
    this.items.push({ cost, state });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { cost: Cost; state: State } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined || last === undefined || this.items.length === 0) {
      return top;
    }
    this.items[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < this.items.length && this.before(l, best)) {
        best = l;
      }
      if (r < this.items.length && this.before(r, best)) {
        best = r;
      }
      if (best === i) {
        break;
      }
      this.swap(i, best);
      i = best;
    }
    return top;
  }
}

interface Tree {
  dist: Map<string, Cost>;
  prev: Map<string, { edge: GraphEdge; from: string }>;
  bestState: Map<SkId<'place'>, string>;
}

function shortestPathTree(
  graph: IndoorGraph,
  origin: SkId<'place'>,
  mode: StationRouteMode,
  allowInferred: boolean,
): Tree {
  const dist = new Map<string, Cost>();
  const prev = new Map<string, { edge: GraphEdge; from: string }>();
  const done = new Set<string>();
  const bestState = new Map<SkId<'place'>, string>();
  const node = graph.nodes.get(origin);
  if (!node || node.zone === 'roadway') {
    return { dist, prev, bestState };
  }
  const heap = new StateHeap();
  const start: State = { key: stateKey(origin, 'none'), place: origin, ride: 'none' };
  dist.set(start.key, ZERO);
  heap.push(ZERO, start);

  while (heap.size > 0) {
    const item = heap.pop();
    if (item === undefined) {
      break;
    }
    const { cost, state } = item;
    if (done.has(state.key)) {
      continue;
    }
    done.add(state.key);
    if (!bestState.has(state.place)) {
      // States pop in (cost, key) order, so the first state of a place is its best one.
      bestState.set(state.place, state.key);
    }
    for (const edge of graph.outgoing.get(state.place) ?? []) {
      if (!edgeAllowed(graph, edge, mode, allowInferred)) {
        continue;
      }
      const nextRide: RideKind = isVerticalLinkKind(edge.link.kind) ? edge.link.kind : 'none';
      const next: State = { key: stateKey(edge.to, nextRide), place: edge.to, ride: nextRide };
      if (done.has(next.key)) {
        continue;
      }
      const candidate = addCost(cost, edgeCost(edge, state.ride, mode));
      const known = dist.get(next.key);
      if (known === undefined || lessCost(candidate, known)) {
        dist.set(next.key, candidate);
        prev.set(next.key, { edge, from: state.key });
        heap.push(candidate, next);
      }
    }
  }
  return { dist, prev, bestState };
}

function notFound(
  mode: StationRouteMode,
  reason: StationRouteNotFound['reason'],
  detail: string,
): StationRouteNotFound {
  return { reachable: false, mode, reason, detail, steps: [] };
}

/** Edges are only ever built between existing nodes, so a miss is a programming error. */
function levelOf(graph: IndoorGraph, placeId: SkId<'place'>): SkId<'level'> {
  const node = graph.nodes.get(placeId);
  if (node === undefined) {
    throw new Error(`route edge references unknown place ${placeId}`);
  }
  return node.level.id;
}

function assemble(
  graph: IndoorGraph,
  mode: StationRouteMode,
  origin: SkId<'place'>,
  path: readonly GraphEdge[],
): StationRouteFound {
  const steps: StationRouteStep[] = path.map((edge, index) => ({
    index,
    linkId: edge.link.id,
    kind: edge.link.kind,
    fromPlaceId: edge.from,
    toPlaceId: edge.to,
    fromLevelId: levelOf(graph, edge.from),
    toLevelId: levelOf(graph, edge.to),
    stepFree: effectiveStepFree(edge.link),
    connection: edge.link.connection,
  }));
  const levelSequence: SkId<'level'>[] = [];
  const pushLevel = (levelId: SkId<'level'> | undefined) => {
    if (levelId !== undefined && levelSequence[levelSequence.length - 1] !== levelId) {
      levelSequence.push(levelId);
    }
  };
  pushLevel(levelOf(graph, origin));
  for (const step of steps) {
    pushLevel(step.toLevelId);
  }
  let levelChanges = 0;
  for (const edge of path) {
    levelChanges += edge.floorSpan;
  }
  return {
    reachable: true,
    mode,
    steps,
    levelSequence,
    gatePasses: steps.filter((step) => step.kind === 'gate').length,
    levelChanges,
    inferredLinkCount: steps.filter((step) => step.connection === 'inferred').length,
    unconfirmedStepFreeCount: steps.filter((step) => step.stepFree === null).length,
    distanceMeters: null,
    durationMinutes: null,
  };
}

export interface RoutesFrom {
  origin: SkId<'place'>;
  mode: StationRouteMode;
  /** Best route to `target`, or `null` when no allowed path exists. */
  to(target: SkId<'place'>): StationRouteFound | null;
  /** Places reachable from the origin (the origin included). */
  reachable(): ReadonlySet<SkId<'place'>>;
}

/** Single-source search: one Dijkstra, then any number of targets. */
export function routesFrom(
  graph: IndoorGraph,
  origin: SkId<'place'>,
  mode: StationRouteMode,
  allowInferred = true,
): RoutesFrom {
  const tree = shortestPathTree(graph, origin, mode, allowInferred);
  const reachable = new Set(tree.bestState.keys());
  return {
    origin,
    mode,
    reachable: () => reachable,
    to(target) {
      const key = tree.bestState.get(target);
      if (key === undefined) {
        return null;
      }
      const path: GraphEdge[] = [];
      for (let at = key; ; ) {
        const step = tree.prev.get(at);
        if (step === undefined) {
          break;
        }
        path.push(step.edge);
        at = step.from;
      }
      path.reverse();
      return assemble(graph, mode, origin, path);
    },
  };
}

/** Reuse one search tree for all queries with the same origin, mode and inference policy. */
export function findStationRoutesFrom(
  graph: IndoorGraph,
  query: Omit<StationRouteQuery, 'toPlaceId'>,
): (toPlaceId: SkId<'place'>) => StationRouteResult {
  const { complexId, fromPlaceId, mode, allowInferred = true } = query;
  if (complexId !== graph.complexId) {
    const failure = notFound(
      mode,
      'unknown-place',
      `query is for ${complexId}, graph is ${graph.complexId}`,
    );
    return () => failure;
  }
  if (!graph.nodes.has(fromPlaceId)) {
    const failure = notFound(
      mode,
      'unknown-place',
      `${fromPlaceId} is not a place of ${graph.complexId}`,
    );
    return () => failure;
  }

  const tree = routesFrom(graph, fromPlaceId, mode, allowInferred);
  let standard: RoutesFrom | undefined;
  return (toPlaceId) => {
    if (!graph.nodes.has(toPlaceId)) {
      return notFound(mode, 'unknown-place', `${toPlaceId} is not a place of ${graph.complexId}`);
    }
    const found = tree.to(toPlaceId);
    if (found) {
      return found;
    }
    if (mode === 'step_free') {
      standard ??= routesFrom(graph, fromPlaceId, 'standard', allowInferred);
      if (standard.reachable().has(toPlaceId)) {
        return notFound(
          mode,
          'step-free-unavailable',
          'Reachable only by stairs, escalators or links known to have steps.',
        );
      }
    }
    return notFound(
      mode,
      'unreachable',
      'No route in the verified model (roadways and unverified cross-operator links are never used).',
    );
  };
}

/** Contract entry point for one pair of places. */
export function findStationRoute(graph: IndoorGraph, query: StationRouteQuery): StationRouteResult {
  return findStationRoutesFrom(graph, query)(query.toPlaceId);
}
