/**
 * Routing graph of one hub, built from the contract's `StationGraph` (levels, places, links).
 *
 * Places are the nodes; every `StationLink` becomes one or two directed edges. The 2D plan,
 * the 3D scene and the router all read this one structure, so what is drawn and what is
 * routable cannot drift apart.
 */
import type {
  FareZone,
  SkId,
  StationGraph,
  StationHubDataset,
  StationLevel,
  StationLink,
  StationLinkKind,
  StationPlace,
} from '@senkiro/contracts';

/** Levels, places and links: what layout code needs from a hub. */
export type IndoorGraphInput = Pick<StationGraph, 'levels' | 'places' | 'links'>;

/** A contract `StationGraph` or a whole `StationHubDataset`. */
export type IndoorGraphSource = StationGraph | StationHubDataset;

export function complexIdOf(source: IndoorGraphSource): SkId<'complex'> {
  return 'complexId' in source ? source.complexId : source.complex.id;
}

export const VERTICAL_LINK_KINDS: ReadonlySet<StationLinkKind> = new Set([
  'stairs',
  'escalator',
  'elevator',
]);

export function isVerticalLinkKind(kind: StationLinkKind): boolean {
  return VERTICAL_LINK_KINDS.has(kind);
}

export interface GraphNode {
  id: SkId<'place'>;
  place: StationPlace;
  level: StationLevel;
  /** Shared vertical datum of the hub; operators number their floors independently. */
  ordinal: number;
  zone: FareZone;
}

export interface GraphEdge {
  /** `<linkId>` for the stored direction, `<linkId>~rev` for the reverse traversal. */
  id: string;
  link: StationLink;
  from: SkId<'place'>;
  to: SkId<'place'>;
  /** Whether this edge runs against the link's stored `fromPlaceId → toPlaceId`. */
  reversed: boolean;
  /** Floors of the hub passed through (0 for same-floor links). */
  floorSpan: number;
}

export interface IndoorGraph {
  complexId: SkId<'complex'>;
  nodes: ReadonlyMap<SkId<'place'>, GraphNode>;
  /** Outgoing edges per place, sorted by edge id for deterministic search. */
  outgoing: ReadonlyMap<SkId<'place'>, readonly GraphEdge[]>;
  edges: readonly GraphEdge[];
  levels: ReadonlyMap<SkId<'level'>, StationLevel>;
  /** Distinct level ordinals of the hub, ascending: the hub's floors. */
  floors: readonly number[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Distinct ordinals, ascending. Several operator levels may share one ordinal (one floor). */
export function floorOrdinals(levels: readonly StationLevel[]): number[] {
  return [...new Set(levels.map((level) => level.ordinal))].sort((a, b) => a - b);
}

/** Number of hub floors strictly above `low` and at or below `high` (order-free). */
export function floorSpanBetween(floors: readonly number[], a: number, b: number): number {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  let span = 0;
  for (const floor of floors) {
    if (floor > low && floor <= high) {
      span += 1;
    }
  }
  return span;
}

/**
 * Build the directed graph. Links whose endpoints are missing are skipped here; the
 * validator reports them. `direction: 'unknown'` is traversable both ways (no source says
 * which way an escalator runs), exactly as in Lab C.
 */
export function buildIndoorGraph(input: IndoorGraphSource): IndoorGraph {
  const levels = new Map(input.levels.map((level) => [level.id, level]));
  const floors = floorOrdinals(input.levels);
  const nodes = new Map<SkId<'place'>, GraphNode>();
  for (const place of input.places) {
    const level = levels.get(place.levelId);
    if (level === undefined) {
      continue;
    }
    nodes.set(place.id, {
      id: place.id,
      place,
      level,
      ordinal: level.ordinal,
      zone: place.fareZone,
    });
  }

  const edges: GraphEdge[] = [];
  for (const link of input.links) {
    const a = nodes.get(link.fromPlaceId);
    const b = nodes.get(link.toPlaceId);
    if (a === undefined || b === undefined) {
      continue;
    }
    const floorSpan = floorSpanBetween(floors, a.ordinal, b.ordinal);
    edges.push({ id: link.id, link, from: a.id, to: b.id, reversed: false, floorSpan });
    if (link.direction !== 'forward') {
      edges.push({ id: `${link.id}~rev`, link, from: b.id, to: a.id, reversed: true, floorSpan });
    }
  }
  edges.sort((x, y) => compareText(x.id, y.id));

  const outgoing = new Map<SkId<'place'>, GraphEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list === undefined) {
      outgoing.set(edge.from, [edge]);
    } else {
      list.push(edge);
    }
  }

  return { complexId: complexIdOf(input), nodes, outgoing, edges, levels, floors };
}

/** Effective step-free status of a link: a link known to have steps is never step-free. */
export function effectiveStepFree(link: StationLink): boolean | null {
  if (link.hasSteps === true) {
    return false;
  }
  return link.stepFree;
}
