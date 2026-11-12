import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_ROUTE, DEMO_ROUTES, NODE } from '../../src/domain/demo';
import { findRoute, type Route } from '../../src/domain/route';
import { levelLabels, loadGraph, loadModel } from './helpers';

const model = loadModel();
const graph = loadGraph();
const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
const elementById = new Map(
  [...model.areas, ...model.gates, ...model.entrances, ...model.verticals, ...model.passages].map((e) => [e.id, e]),
);

function mustFind(from: string, to: string, mode: 'default' | 'elevator-only' = 'default'): Route {
  const r = findRoute(graph, from, to, { mode });
  if (!r.found) throw new Error(`${from} → ${to}: ${r.reason} (${r.detail})`);
  return r;
}

function liftLetters(r: Route): string[] {
  return r.legs
    .filter((l) => l.kind === 'vertical')
    .map((l) => {
      const v = model.verticals.find((x) => x.id === l.elementId)!;
      return v.operatorLabel ?? `(${v.verticalKind})`;
    });
}

describe('demo routes', () => {
  it('every demo route starts and ends on verified elements', () => {
    for (const d of DEMO_ROUTES) {
      for (const id of [d.fromNodeId, d.toNodeId]) {
        const el = elementById.get(id);
        expect(el, id).toBeDefined();
        expect(el!.existence, id).toBe('verified');
        expect(el!.provenance.sourceIds.length, id).toBeGreaterThan(0);
        expect(el!.asOf, id).not.toBeNull();
      }
    }
  });

  it.each(DEMO_ROUTES)('$id is reachable and passes the expected floors', (d) => {
    const r = mustFind(d.fromNodeId, d.toNodeId, d.mode);
    expect(levelLabels(model, r.levelSequence)).toEqual(d.expectedLevelLabels);
    expect(r.nodeIds[0]).toBe(d.fromNodeId);
    expect(r.nodeIds.at(-1)).toBe(d.toNodeId);
    // consecutive nodes are really joined by a graph edge
    for (let i = 0; i + 1 < r.nodeIds.length; i++) {
      expect(edgeById.has(`${r.nodeIds[i]}→${r.nodeIds[i + 1]}`), `${r.nodeIds[i]} → ${r.nodeIds[i + 1]}`).toBe(true);
    }
    // legs cover the node path without gaps
    expect(r.legs[0]!.nodeIds[0]).toBe(d.fromNodeId);
    for (let i = 0; i + 1 < r.legs.length; i++) {
      expect(r.legs[i]!.nodeIds.at(-1)).toBe(r.legs[i + 1]!.nodeIds[0]);
    }
    expect(r.legs.at(-1)!.nodeIds.at(-1)).toBe(d.toNodeId);
  });

  it('default demo: East Exit (street) → B1F gate → Yamanote Line island, one gate, two level changes', () => {
    const r = mustFind(DEFAULT_DEMO_ROUTE.fromNodeId, DEFAULT_DEMO_ROUTE.toNodeId);
    expect(r.cost).toEqual({ gatePasses: 1, levelChanges: 2, facilityBoardings: 2, segments: 4 });
    expect(r.legs.map((l) => l.kind)).toEqual(['enter', 'vertical', 'gate', 'vertical']);
    const gateLeg = r.legs.find((l) => l.kind === 'gate')!;
    const gate = model.gates.find((g) => g.id === gateLeg.elementId)!;
    expect(['東改札', '中央東改札']).toContain(gate.names.ja);
    const last = model.areas.find((a) => a.id === r.nodeIds.at(-1))!;
    expect(last.kind).toBe('platform');
    if (last.kind === 'platform') {
      expect(last.tracks.map((t) => t.number)).toEqual(['13', '14']);
      expect(last.tracks[1]!.services[0]!.railLineId).toBe('sk:line:jr-east-yamanote');
    }
    expect(r.facilityElementIds.length).toBe(4);
  });

  it('never reports metres or minutes — there is no surveyed distance data', () => {
    for (const d of DEMO_ROUTES) {
      const r = mustFind(d.fromNodeId, d.toNodeId, d.mode);
      expect(r.distanceMeters).toBeNull();
      expect(r.durationMinutes).toBeNull();
      expect(Object.keys(r.cost).sort()).toEqual(['facilityBoardings', 'gatePasses', 'levelChanges', 'segments']);
    }
    // and nothing in the data model carries a length either
    const json = JSON.stringify(model);
    expect(json).not.toMatch(/"(distance|length|meters|metres|minutes|walkTime)[A-Za-z]*"\s*:/i);
  });
});

describe('step-free (elevator-only) routing', () => {
  it('reproduces the route JR prints on its B1F map: B1F ⇔ Ⓖ ⇔ 2F ⇔ ⒶⒸ ⇔ ⒷⒹ ⇔ Ⓔ ⇔ 5,6番線', () => {
    const r = mustFind(NODE.eastGate, NODE.platform5_6, 'elevator-only');
    const letters = liftLetters(r);
    expect(letters).toHaveLength(4);
    expect(letters[0]).toBe('G');
    expect(['A', 'C']).toContain(letters[1]);
    expect(['B', 'D']).toContain(letters[2]);
    expect(letters[3]).toBe('E');
    // A pairs with B (platforms 1–2), C pairs with D (platforms 3–4)
    expect(`${letters[1]}${letters[2]}`).toMatch(/^(AB|CD)$/);
    expect(levelLabels(model, r.levelSequence)).toEqual(['B1F', '1F', '2F', '1F', '2F', '1F']);
  });

  it('uses lifts only and never a link known to have steps', () => {
    for (const to of model.areas.filter((a) => a.kind === 'platform' && a.stationId === 'sk:station:jr-east-shinjuku')) {
      const r = mustFind(NODE.southGate, to.id, 'elevator-only');
      for (const id of r.edgeIds) {
        const e = edgeById.get(id)!;
        if (e.kind === 'vertical') expect(e.verticalKind, id).toBe('elevator');
        expect(e.stepFree, id).not.toBe(false);
      }
    }
  });

  it('refuses the B1F corridor to Keio, where JR draws steps and says to use the South Exit instead', () => {
    const corridor = 'sk:passage:jr-b1f-central-to-keio-corridor';
    const transferGate = 'sk:gate:jr-keio-transfer-gate';
    // the ordinary route uses the corridor and the transfer gate
    const normal = mustFind(NODE.eastGate, NODE.keioPlatforms);
    expect(normal.legs.some((l) => l.elementId === corridor)).toBe(true);
    expect(normal.legs.some((l) => l.elementId === transferGate)).toBe(true);
    // the step-free route may not: it has to leave the JR paid area and enter Keio's from outside,
    // and it says so by counting the legs whose step-free status no source confirms
    const stepFree = mustFind(NODE.eastGate, NODE.keioPlatforms, 'elevator-only');
    expect(stepFree.legs.some((l) => l.elementId === corridor)).toBe(false);
    expect(stepFree.legs.some((l) => l.elementId === transferGate)).toBe(false);
    expect(stepFree.cost.gatePasses).toBeGreaterThan(normal.cost.gatePasses);
    expect(stepFree.unconfirmedStepFreeLegs).toBeGreaterThan(0);
    // inside the JR paid area alone there is no step-free way to the corridor's far end
    const corridorEnd = findRoute(graph, NODE.eastGate, 'sk:area:jr-b1f-keio-connection-corridor', { mode: 'elevator-only' });
    expect(corridorEnd.found).toBe(false);
  });
});

describe('route search behaviour', () => {
  const jrPlatforms = model.areas.filter((a) => a.kind === 'platform' && a.stationId === 'sk:station:jr-east-shinjuku');
  const jrGates = model.gates.filter(
    (g) => g.stationId === 'sk:station:jr-east-shinjuku' && g.gateKind === 'ticket' && g.id !== 'sk:gate:jr-central-west-gate-keio-side',
  );

  it('every JR ticket gate reaches every JR platform inside the paid area, through no further gate', () => {
    expect(jrPlatforms).toHaveLength(8);
    expect(jrGates).toHaveLength(9);
    for (const g of jrGates) {
      for (const p of jrPlatforms) {
        const r = mustFind(g.id, p.id);
        expect(r.cost.gatePasses, `${g.names.ja} → ${p.names.ja}`).toBe(1);
        for (const id of r.nodeIds.slice(1)) {
          expect(nodeById.get(id)!.zone, `${g.names.ja} → ${p.names.ja} via ${id}`).toBe('paid:jr-east');
        }
      }
    }
  });

  it('platforms 5–6 cannot be reached from the north concourse in a single climb', () => {
    const r = mustFind(NODE.eastGate, NODE.platform5_6);
    // B1F → 1F needs the long passage and its escalator; nothing lands on 5–6 from the north concourse
    expect(r.legs.some((l) => l.elementId === 'sk:vertical:jr-escalator-b1f-passage-to-platform-5-6')).toBe(true);
    expect(r.cost.levelChanges).toBe(1);
  });

  it('the two 2F paid areas are joined only by going down to a platform', () => {
    const r = mustFind('sk:area:jr-2f-south-concourse', 'sk:area:jr-2f-new-south-concourse');
    expect(r.cost.gatePasses).toBe(0);
    expect(r.cost.levelChanges).toBe(2);
    expect(levelLabels(model, r.levelSequence)).toEqual(['2F', '1F', '2F']);
  });

  it('exit-only gates cannot be used to enter', () => {
    const hiroba = 'sk:gate:keio-hiroba-gate';
    // leaving through it works
    const out = mustFind(NODE.keioPlatforms, hiroba);
    expect(out.cost.gatePasses).toBe(1);
    expect(out.nodeIds.at(-1)).toBe(hiroba);
    // as an origin ("enter here") it leads nowhere
    expect(findRoute(graph, hiroba, NODE.keioPlatforms)).toMatchObject({ found: false, reason: 'unreachable' });
    // and entering from outside never goes through it
    for (const from of ['sk:entrance:keio-west-side', 'sk:area:keio-b1f-west-gate-unpaid']) {
      const into = mustFind(from, NODE.keioPlatforms);
      const gatesUsed = into.legs.filter((l) => l.kind === 'gate' && l.toAreaId !== null && nodeById.get(l.toAreaId)!.zone !== 'unpaid');
      expect(gatesUsed.map((l) => l.elementId), from).toEqual(['sk:gate:keio-west-gate']);
    }
    // the temporary gate is exit-only too: it can be left through, never entered
    const rinji = 'sk:gate:keio-temporary-gate';
    expect(mustFind(NODE.keioPlatforms, rinji).nodeIds.at(-1)).toBe(rinji);
    expect(findRoute(graph, rinji, NODE.keioPlatforms)).toMatchObject({ found: false, reason: 'unreachable' });
    // a gate that faces an unverified block has nothing beyond it
    expect(graph.edges.filter((e) => e.from === 'sk:gate:toei-oedo-gate-b' && e.kind !== 'gate-approach').map((e) => e.to)).toEqual([]);
  });

  it('marks legs that rest on inferred connections, and can be told to avoid them', () => {
    const keioWestOutside = 'sk:area:keio-b1f-west-gate-unpaid';
    const r = mustFind('sk:entrance:jr-west-exit-basement', keioWestOutside);
    expect(r.inferredLegs).toBe(1);
    expect(r.cost.gatePasses).toBe(0);
    // told to avoid inferred links, the search goes the long way round through both paid areas
    const strict = findRoute(graph, 'sk:entrance:jr-west-exit-basement', keioWestOutside, { allowInferred: false });
    expect(strict.found).toBe(true);
    if (strict.found) {
      expect(strict.inferredLegs).toBe(0);
      expect(strict.cost.gatePasses).toBeGreaterThan(r.cost.gatePasses);
    }
  });

  it('a ticket gate as origin means entering through it, as destination leaving through it', () => {
    const inbound = mustFind(NODE.eastGate, NODE.platform13_14);
    expect(nodeById.get(inbound.nodeIds[1]!)!.zone).toBe('paid:jr-east');
    const outbound = mustFind(NODE.platform13_14, NODE.eastGate);
    expect(nodeById.get(outbound.nodeIds.at(-2)!)!.zone).toBe('paid:jr-east');
    expect(outbound.cost.gatePasses).toBe(1);
  });

  it('reports unknown nodes instead of throwing', () => {
    const r = findRoute(graph, 'sk:gate:nope', NODE.platform13_14);
    expect(r).toMatchObject({ found: false, reason: 'unknown-node' });
  });

  it('is deterministic', () => {
    const a = mustFind(NODE.southExit, NODE.keioPlatforms);
    const b = mustFind(NODE.southExit, NODE.keioPlatforms);
    expect(a.nodeIds).toEqual(b.nodeIds);
  });
});
