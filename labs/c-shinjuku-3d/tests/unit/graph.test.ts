import { describe, expect, it } from 'vitest';
import graphJson from '../../data/processed/graph.json';
import { buildGraph, verticalStopNodeId, type StationGraph } from '../../src/domain/graph';
import { isPaid } from '../../src/domain/types';
import { checkModelGraphConsistency, validateGraph } from '../../src/domain/validate';
import { loadGraph, loadModel } from './helpers';

describe('routing graph', () => {
  const model = loadModel();
  const graph = loadGraph();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  it('is generated from the station model and matches the committed graph.json', () => {
    expect(buildGraph(model)).toEqual(graphJson as unknown as StationGraph);
  });

  it('every edge starts and ends on an existing node', () => {
    expect(graph.edges.length).toBeGreaterThan(100);
    for (const e of graph.edges) {
      expect(nodeById.has(e.from), `${e.id}: from`).toBe(true);
      expect(nodeById.has(e.to), `${e.id}: to`).toBe(true);
      expect(e.from).not.toBe(e.to);
    }
  });

  it('node ids are unique', () => {
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
  });

  it('paid and unpaid nodes are joined only through a Gate', () => {
    const crossing = graph.edges.filter((e) => {
      const a = nodeById.get(e.from)!;
      const b = nodeById.get(e.to)!;
      return a.zone !== b.zone;
    });
    expect(crossing.length).toBeGreaterThan(0);
    for (const e of crossing) {
      const kinds = [nodeById.get(e.from)!.kind, nodeById.get(e.to)!.kind];
      expect(kinds, e.id).toContain('gate');
      expect(e.kind, e.id).toBe('gate-approach');
    }
    expect(validateGraph(graph).filter((i) => i.rule === 'graph-fare-boundary')).toEqual([]);
  });

  it('without walking through a gate, nothing unpaid ever reaches a paid node (flood fill)', () => {
    const out = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (nodeById.get(e.from)!.kind === 'gate' || nodeById.get(e.to)!.kind === 'gate') continue;
      out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    }
    const starts = graph.nodes.filter((n) => n.zone === 'unpaid');
    expect(starts.length).toBeGreaterThan(10);
    const seen = new Set(starts.map((n) => n.id));
    const queue = [...seen];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const next of out.get(id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const id of seen) {
      const zone = nodeById.get(id)!.zone;
      expect(zone === 'gate' || !isPaid(zone), `${id} is ${zone}`).toBe(true);
    }
  });

  it('the JR paid area and the Keio paid area touch only at the transfer gate', () => {
    const jrToKeio = graph.edges.filter((e) => {
      const z = [nodeById.get(e.from)!.zone, nodeById.get(e.to)!.zone];
      return z.includes('paid:jr-east') && z.includes('paid:keio');
    });
    expect(jrToKeio).toEqual([]);
    const transfer = graph.edges.filter((e) => e.elementId === 'sk:gate:jr-keio-transfer-gate');
    const zones = new Set(transfer.flatMap((e) => [nodeById.get(e.from)!.zone, nodeById.get(e.to)!.zone]));
    expect([...zones].sort()).toEqual(['gate', 'paid:jr-east', 'paid:keio']);
  });

  it('only vertical-facility edges change level', () => {
    for (const e of graph.edges) {
      const a = nodeById.get(e.from)!;
      const b = nodeById.get(e.to)!;
      if (e.kind === 'vertical') {
        expect(e.levelChange, e.id).toBe(Math.abs(a.levelOrdinal - b.levelOrdinal));
        expect(e.levelChange, e.id).toBeGreaterThanOrEqual(1);
      } else {
        expect(a.levelOrdinal, e.id).toBe(b.levelOrdinal);
        expect(e.levelChange, e.id).toBe(0);
      }
    }
  });

  it('vertical facilities link adjacent levels unless they are declared, with a reason, to skip floors', () => {
    const ordinal = new Map(model.levels.map((l) => [l.id, l.ordinal]));
    expect(model.verticals.length).toBeGreaterThan(50);
    for (const v of model.verticals) {
      for (let i = 0; i + 1 < v.stops.length; i++) {
        const span = Math.abs(ordinal.get(v.stops[i]!.levelId)! - ordinal.get(v.stops[i + 1]!.levelId)!);
        if (v.declaredNonAdjacent) expect(v.declaredNonAdjacent.reason.length, v.id).toBeGreaterThan(10);
        else expect(span, `${v.id} stop ${i}`).toBe(1);
        expect(span, `${v.id} stop ${i}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('exit-only gates have no edge leading into the paid area', () => {
    const exitOnly = model.gates.filter((g) => g.direction === 'exit-only');
    expect(exitOnly.map((g) => g.names.ja).sort()).toEqual(['広場口', '臨時口']);
    for (const g of exitOnly) {
      const outOfGate = graph.edges.filter((e) => e.from === g.id);
      for (const e of outOfGate) expect(nodeById.get(e.to)!.zone, e.id).toBe('unpaid');
      const intoGate = graph.edges.filter((e) => e.to === g.id);
      for (const e of intoGate) expect(isPaid(nodeById.get(e.from)!.zone as never), e.id).toBe(true);
    }
  });

  it('what is drawn and what is routable are the same set of elements', () => {
    expect(checkModelGraphConsistency(model, graph)).toEqual([]);
    // every drawn area / gate / entrance / facility stop has exactly one node
    const expected = [
      ...model.areas.map((a) => a.id),
      ...model.gates.map((g) => g.id),
      ...model.entrances.map((e) => e.id),
      ...model.verticals.flatMap((v) => v.stops.map((s) => verticalStopNodeId(v.id, s.levelId))),
    ].sort();
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(expected);
    // node positions are the very coordinates the views draw
    for (const v of model.verticals) {
      for (const s of v.stops) {
        expect(nodeById.get(verticalStopNodeId(v.id, s.levelId))!.position).toEqual(s.position);
      }
    }
  });

  it('unverified blocks are drawn but never become nodes or edge targets', () => {
    const blockIds = new Set(model.unverifiedBlocks.map((b) => b.id));
    expect(blockIds.size).toBeGreaterThan(0);
    expect(graph.nodes.filter((n) => blockIds.has(n.elementId))).toEqual([]);
    // gates that face a block keep exactly one modelled side
    const facingBlock = model.gates.filter((g) => g.sides.some((s) => 'blockId' in s));
    expect(facingBlock.map((g) => g.id)).toEqual(['sk:gate:toei-oedo-gate-b']);
    for (const g of facingBlock) {
      const neighbours = new Set(graph.edges.filter((e) => e.from === g.id || e.to === g.id).flatMap((e) => [e.from, e.to]));
      neighbours.delete(g.id);
      expect(neighbours.size, g.id).toBe(1);
    }
  });
});
