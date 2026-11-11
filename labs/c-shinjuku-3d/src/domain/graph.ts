/**
 * Builds the routing graph from a StationModel.
 *
 * The 3D view, the 2D plan and this graph all read the same StationModel, so
 * what is drawn and what is routable cannot drift apart silently —
 * `checkModelGraphConsistency` in validate.ts asserts the correspondence.
 */
import type {
  ConnectionConfidence,
  FareZone,
  Gate,
  PlanPoint,
  StationModel,
  StepFree,
  VerticalKind,
} from './types';

export type GraphNodeKind = 'area' | 'gate' | 'entrance' | 'vertical-stop';

/** Gates sit on the boundary, so they carry the sentinel zone 'gate'. */
export type NodeZone = FareZone | 'gate';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Element of the StationModel this node stands for. */
  elementId: string;
  levelId: string;
  /**
   * Shared vertical datum. Operators number floors independently (JR "B1F" and
   * Keio "B1F" are different Level entities), so same-height tests use this.
   */
  levelOrdinal: number;
  zone: NodeZone;
  position: PlanPoint;
}

export type GraphEdgeKind =
  /** area ↔ area through a Passage */
  | 'passage'
  /** area ↔ gate */
  | 'gate-approach'
  /** area ↔ entrance */
  | 'entrance-approach'
  /** area ↔ a vertical facility's stop on that level */
  | 'vertical-approach'
  /** stop ↔ stop of one vertical facility */
  | 'vertical';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  /** The StationModel element that justifies this edge. */
  elementId: string;
  verticalKind: VerticalKind | null;
  /** Absolute difference of level ordinals (0 for same-level edges). */
  levelChange: number;
  stepFree: StepFree;
  connection: ConnectionConfidence;
}

export interface StationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function verticalStopNodeId(facilityId: string, levelId: string): string {
  return `${facilityId}@${levelId}`;
}

function sideAreaId(side: Gate['sides'][number]): string | null {
  return 'areaId' in side ? side.areaId : null;
}

export function buildGraph(model: StationModel): StationGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const areaById = new Map(model.areas.map((a) => [a.id, a]));
  const levelById = new Map(model.levels.map((l) => [l.id, l]));

  const ordinalOf = (levelId: string) => levelById.get(levelId)?.ordinal ?? Number.NaN;

  const addEdge = (e: Omit<GraphEdge, 'id'>) => {
    edges.push({ ...e, id: `${e.from}→${e.to}` });
  };
  const addBoth = (e: Omit<GraphEdge, 'id' | 'from' | 'to'>, a: string, b: string) => {
    addEdge({ ...e, from: a, to: b });
    addEdge({ ...e, from: b, to: a });
  };

  for (const area of model.areas) {
    nodes.push({
      id: area.id,
      kind: 'area',
      elementId: area.id,
      levelId: area.levelId,
      levelOrdinal: ordinalOf(area.levelId),
      zone: area.fareZone,
      position: area.anchor,
    });
  }

  for (const p of model.passages) {
    addBoth(
      {
        kind: 'passage',
        elementId: p.id,
        verticalKind: null,
        levelChange: 0,
        stepFree: p.hasSteps === true ? false : p.stepFree,
        connection: p.connection,
      },
      p.fromAreaId,
      p.toAreaId,
    );
  }

  for (const gate of model.gates) {
    nodes.push({
      id: gate.id,
      kind: 'gate',
      elementId: gate.id,
      levelId: gate.levelId,
      levelOrdinal: ordinalOf(gate.levelId),
      zone: 'gate',
      position: gate.position,
    });
    const sideIds = gate.sides.map(sideAreaId);
    const base = {
      kind: 'gate-approach' as const,
      elementId: gate.id,
      verticalKind: null,
      levelChange: 0,
      stepFree: gate.stepFree,
      connection: 'verified' as const,
    };
    if (gate.direction === 'both') {
      for (const areaId of sideIds) {
        if (areaId) addBoth(base, areaId, gate.id);
      }
    } else {
      // exit-only: paid side → gate → unpaid side, never the reverse.
      for (const areaId of sideIds) {
        if (!areaId) continue;
        const area = areaById.get(areaId);
        if (!area) continue;
        if (area.fareZone === 'unpaid') addEdge({ ...base, from: gate.id, to: areaId });
        else addEdge({ ...base, from: areaId, to: gate.id });
      }
    }
  }

  for (const ent of model.entrances) {
    nodes.push({
      id: ent.id,
      kind: 'entrance',
      elementId: ent.id,
      levelId: ent.levelId,
      levelOrdinal: ordinalOf(ent.levelId),
      zone: 'unpaid',
      position: ent.position,
    });
    addBoth(
      {
        kind: 'entrance-approach',
        elementId: ent.id,
        verticalKind: null,
        levelChange: 0,
        stepFree: ent.stepFree,
        connection: 'verified',
      },
      ent.id,
      ent.areaId,
    );
  }

  for (const vf of model.verticals) {
    const stopIds: string[] = [];
    for (const stop of vf.stops) {
      const area = areaById.get(stop.areaId);
      const nodeId = verticalStopNodeId(vf.id, stop.levelId);
      stopIds.push(nodeId);
      nodes.push({
        id: nodeId,
        kind: 'vertical-stop',
        elementId: vf.id,
        levelId: stop.levelId,
        levelOrdinal: ordinalOf(stop.levelId),
        zone: area ? area.fareZone : 'unpaid',
        position: stop.position,
      });
      addBoth(
        {
          kind: 'vertical-approach',
          elementId: vf.id,
          verticalKind: vf.verticalKind,
          levelChange: 0,
          stepFree: null,
          connection: 'verified',
        },
        stop.areaId,
        nodeId,
      );
    }
    for (let i = 0; i + 1 < vf.stops.length; i++) {
      const a = vf.stops[i]!;
      const b = vf.stops[i + 1]!;
      const la = levelById.get(a.levelId);
      const lb = levelById.get(b.levelId);
      const levelChange = la && lb ? Math.abs(la.ordinal - lb.ordinal) : 1;
      addBoth(
        {
          kind: 'vertical',
          elementId: vf.id,
          verticalKind: vf.verticalKind,
          levelChange,
          stepFree: vf.verticalKind === 'elevator',
          connection: 'verified',
        },
        stopIds[i]!,
        stopIds[i + 1]!,
      );
    }
  }

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, edges };
}
