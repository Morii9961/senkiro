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
    // (a route that starts on one therefore leaves through it: see the consistency tests below)
    const hiroba = 'sk:gate:keio-hiroba-gate';
    // leaving through it works
    const out = mustFind(NODE.keioPlatforms, hiroba);
    expect(out.cost.gatePasses).toBe(1);
    expect(out.nodeIds.at(-1)).toBe(hiroba);
    // as an origin it cannot be entered: the route starts outside it and goes in through another gate
    const round = mustFind(hiroba, NODE.keioPlatforms);
    expect(nodeById.get(round.nodeIds[1]!)!.zone).toBe('unpaid');
    expect(round.nodeIds.filter((id) => nodeById.get(id)!.kind === 'gate')).toEqual([hiroba, 'sk:gate:keio-west-gate']);
    // and entering from outside never goes through it
    for (const from of ['sk:entrance:keio-west-side', 'sk:area:keio-b1f-west-gate-unpaid']) {
      const into = mustFind(from, NODE.keioPlatforms);
      const gatesUsed = into.legs.filter((l) => l.kind === 'gate' && l.toAreaId !== null && nodeById.get(l.toAreaId)!.zone !== 'unpaid');
      expect(gatesUsed.map((l) => l.elementId), from).toEqual(['sk:gate:keio-west-gate']);
    }
    // the temporary gate is exit-only too: it can be left through, never entered
    const rinji = 'sk:gate:keio-temporary-gate';
    expect(mustFind(NODE.keioPlatforms, rinji).nodeIds.at(-1)).toBe(rinji);
    expect(nodeById.get(mustFind(rinji, NODE.keioPlatforms).nodeIds[1]!)!.zone).toBe('unpaid');
  });

  it('大江戸線改札B leads down to the Oedo Line, and the Shinjuku Line transfer gate joins the two Toei lines', () => {
    const viaGateB = mustFind('sk:entrance:new-line-exit-5', 'sk:platform:toei-oedo-shinjuku-6-7');
    expect(viaGateB.legs.filter((l) => l.kind === 'gate').map((l) => l.elementId)).toEqual(['sk:gate:toei-oedo-gate-b']);
    expect(levelLabels(model, viaGateB.levelSequence)).toEqual(['B1F', 'B1F', 'B4F', 'B7F']);
    const transfer = mustFind('sk:platform:keio-new-line-shinjuku-4-5', 'sk:platform:toei-oedo-shinjuku-6-7');
    expect(transfer.legs.filter((l) => l.kind === 'gate').map((l) => l.elementId)).toEqual(['sk:gate:toei-oedo-transfer-gate']);
  });

  it('西武新宿駅 is reached underground through サブナード, and on its own platforms by 正面口 or 北口', () => {
    // JR 東改札 → メトロ通路 → サブナード → up to the front of 西武新宿駅 → 正面口 → platform, with one gate on the way and nothing inferred
    const r = mustFind('sk:gate:jr-east-gate', 'sk:platform:seibu-shinjuku-2-3');
    expect(r.nodeIds).toContain('sk:area:subnade-underground-mall');
    expect(r.legs.filter((l) => l.kind === 'gate').map((l) => l.elementId)).toContain('sk:gate:seibu-front-gate');
    expect(r.inferredLegs).toBe(0);
    expect(levelLabels(model, r.levelSequence).at(-1)).toBe('2F');
    // 北口 has stairs only on the drawing: lift-only travel must use 正面口
    const lift = mustFind('sk:entrance:seibu-front-entrance', 'sk:platform:seibu-shinjuku-1', 'elevator-only');
    expect(lift.legs.filter((l) => l.kind === 'gate').map((l) => l.elementId)).toEqual(['sk:gate:seibu-front-gate']);
    const north = mustFind('sk:entrance:seibu-north-exit', 'sk:platform:seibu-shinjuku-1');
    expect(north.legs.filter((l) => l.kind === 'gate').map((l) => l.elementId)).toEqual(['sk:gate:seibu-north-gate']);
    // streets are not part of the model, so from 北口 there is no lift-only way: the search says so instead of inventing one
    expect(findRoute(graph, 'sk:entrance:seibu-north-exit', 'sk:platform:seibu-shinjuku-1', { mode: 'elevator-only' }).found).toBe(false);
  });

  it('the operators meet in public space: 西口地下広場, 東口地下通路 and 南口', () => {
    // Odakyu underground gate → plaza → Marunouchi Line gates, without entering anybody's paid area on the way
    const r = mustFind('sk:gate:odakyu-west-underground-gate', 'sk:gate:tokyo-metro-west-gates');
    expect(r.inferredLegs).toBe(0);
    expect(r.nodeIds).toContain('sk:area:west-exit-underground-plaza');
    // JR South Exit → the crossing of 甲州街道 → Busta 4F
    const bus = mustFind('sk:entrance:jr-south-exit', 'sk:entrance:busta-4f-bay-c8');
    expect(bus.cost.gatePasses).toBe(0);
    expect(levelLabels(model, bus.levelSequence).at(-1)).toBe('4F');
  });

  it('Busta 新宿: every boarding bay and both drop-off points are reachable from the JR gates below', () => {
    const bays = model.entrances.filter((e) => /busta-4f-bay-/.test(e.id));
    expect(bays.map((e) => e.names.ja)).toEqual(['A1', 'A2', 'A3', 'B4', 'B5', 'B6', 'C7', 'C8', 'C9', 'D10', 'D11', 'D12'].map((c) => `${c} のりば`));
    for (const b of bays) {
      // from a JR platform: out through one gate line, then up to 4F
      const r = mustFind(NODE.platform13_14, b.id);
      expect(r.cost.gatePasses, b.id).toBe(1);
      expect(r.inferredLegs, b.id).toBe(0);
      expect(levelLabels(model, r.levelSequence).at(-1), b.id).toBe('4F');
      // and by lift alone from outside 新南改札
      expect(mustFind('sk:gate:jr-new-south-gate', b.id, 'elevator-only').found, b.id).toBe(true);
    }
    // the bay belongs to the boarding area whose letter it carries
    for (const b of bays) expect(b.areaId).toBe(`sk:area:busta-4f-area-${b.names.ja![0]!.toLowerCase()}`);
    // arriving on 3F: from either drop-off point down to the JR gate, and across to the taxi stand
    for (const from of ['sk:entrance:busta-3f-bus-drop-off-centre', 'sk:entrance:busta-3f-bus-drop-off-deck']) {
      const down = mustFind(from, 'sk:gate:jr-new-south-gate');
      expect(levelLabels(model, down.levelSequence)[0]).toBe('3F');
      expect(mustFind(from, 'sk:entrance:busta-3f-taxi').levelSequence.every((l) => l === 'sk:level:busta-shinjuku-3f')).toBe(true);
    }
    // the 4F直結 escalator skips 3F
    const direct = model.verticals.find((v) => v.id === 'sk:vertical:busta-escalator-new-south-direct-4f')!;
    expect(direct.stops.map((st) => st.levelId)).toEqual(['sk:level:jr-east-shinjuku-2f', 'sk:level:busta-shinjuku-4f']);
  });

  it('marks legs that rest on inferred connections, and can be told to avoid them', () => {
    // two links rest on signage only: outside JR 中央西改札 ⇄ the front of the Odakyu underground gate,
    // and the Marunouchi Line passage of 新宿 ⇄ the concourse of 新宿三丁目
    expect(model.passages.filter((p) => p.connection === 'inferred').map((p) => p.id)).toEqual([
      'sk:passage:jr-central-west-outside-to-odakyu-west-underground',
      'sk:passage:marunouchi-shinjuku-concourse-to-sanchome-concourse',
    ]);
    const odakyuFront = 'sk:area:odakyu-b1f-west-underground-gate-unpaid';
    const r = mustFind('sk:entrance:jr-central-west-outside', odakyuFront);
    expect(r.inferredLegs).toBe(1);
    expect(r.cost.gatePasses).toBe(0);
    // told to avoid inferred links, the search goes the long way round through the JR paid area
    const strict = findRoute(graph, 'sk:entrance:jr-central-west-outside', odakyuFront, { allowInferred: false });
    expect(strict.found).toBe(true);
    if (strict.found) {
      expect(strict.inferredLegs).toBe(0);
      expect(strict.cost.gatePasses).toBeGreaterThan(r.cost.gatePasses);
    }
  });

  it('walks from 新宿 to the 新宿三丁目 stations, and says that the way rests on signage', () => {
    const fukutoshin = 'sk:platform:tokyo-metro-shinjuku-sanchome-3-4';
    const toei = 'sk:platform:toei-shinjuku-sanchome-1-2';
    const r = mustFind(NODE.platform13_14, fukutoshin);
    expect(r.inferredLegs).toBe(1);
    // out of the JR gates and in through Tokyo Metro's: two gate lines, never the Marunouchi Line of 新宿 in between
    expect(r.cost.gatePasses).toBe(2);
    expect(r.nodeIds.map((id) => nodeById.get(id)!.zone)).not.toContain('paid:toei');
    // without the inferred passage the two stations are not connected on foot in this model
    expect(findRoute(graph, NODE.platform13_14, fukutoshin, { allowInferred: false }).found).toBe(false);
    // 丸ノ内線 → 副都心線 inside the gates: platform to platform, no gate at all
    expect(mustFind('sk:platform:tokyo-metro-shinjuku-sanchome-1-2', fukutoshin).cost.gatePasses).toBe(0);
    // 副都心線 → 都営新宿線 means leaving one operator's gates and entering the other's
    const transfer = mustFind(fukutoshin, toei);
    expect(transfer.cost.gatePasses).toBe(2);
    expect(transfer.inferredLegs).toBe(0);
  });

  it('walks from 新宿 to 新宿西口 (E01) through the Marunouchi Line passage, on drawn links only', () => {
    const e01 = 'sk:platform:toei-shinjuku-nishiguchi-1-2';
    const fromJr = mustFind(NODE.platform13_14, e01);
    expect(fromJr.inferredLegs).toBe(0);
    expect(fromJr.cost.gatePasses).toBe(2);
    // 丸ノ内線 新宿 → 大江戸線 新宿西口: out of Tokyo Metro's gates, in through Toei's
    expect(mustFind('sk:platform:tokyo-metro-shinjuku-1-2', e01).cost.gatePasses).toBe(2);
    // E01 and E27 are different stations: going between them on foot leaves the gates
    expect(mustFind(e01, 'sk:platform:toei-oedo-shinjuku-6-7').cost.gatePasses).toBe(2);
    // step-free: the lift chain D2 → B1F → B3F → platform exists
    expect(mustFind('sk:entrance:nishiguchi-exit-d2', e01, 'elevator-only').found).toBe(true);
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

describe('consistency of the whole walking graph (scripts/check-routes.ts runs it over every pair)', () => {
  const places = [...model.areas.filter((a) => a.kind === 'platform').map((a) => a.id), ...model.gates.map((g) => g.id), ...model.entrances.map((e) => e.id)];
  const hub = NODE.platform13_14;

  it('every place a user can pick is reached from a JR platform, and leads back to one', () => {
    expect(places.filter((p) => p !== hub && !findRoute(graph, hub, p, { mode: 'default' }).found)).toEqual([]);
    expect(places.filter((p) => p !== hub && !findRoute(graph, p, hub, { mode: 'default' }).found)).toEqual([]);
  });

  it('a gate that cannot be used the way it was picked is read the other way round', () => {
    // origin = "enter here" fails for an exit-only gate: the route then starts by leaving through it
    const hiroba = mustFind('sk:gate:keio-hiroba-gate', hub);
    expect(hiroba.legs[0]!.kind).toBe('gate');
    expect(hiroba.legs[0]!.toAreaId).toBe('sk:area:keio-b1f-west-gate-unpaid');
    // behind 西武新宿 正面口 the only other gate leads to an exit that joins nothing else
    const seibu = mustFind('sk:gate:seibu-front-gate', hub);
    expect(nodeById.get(seibu.nodeIds[1]!)!.zone).toBe('unpaid');
    // destination = "leave here" fails the same way: the route then ends by entering through it
    const e01 = mustFind(hub, 'sk:gate:nishiguchi-gates-south');
    expect(nodeById.get(e01.nodeIds.at(-2)!)!.zone).toBe('unpaid');
    expect(e01.cost.gatePasses).toBe(2);
    // where the picked reading works it is kept: from inside its own station the gate is still left from the paid side
    const own = mustFind('sk:platform:toei-shinjuku-nishiguchi-1-2', 'sk:gate:nishiguchi-gates-south');
    expect(nodeById.get(own.nodeIds.at(-2)!)!.zone).not.toBe('unpaid');
    expect(own.cost.gatePasses).toBe(1);
  });

  it('a route changes floor only on stairs, escalators and lifts', () => {
    for (const p of places) {
      for (const r of [findRoute(graph, hub, p, { mode: 'default' }), findRoute(graph, p, hub, { mode: 'elevator-only' })]) {
        if (!r.found) continue;
        for (const leg of r.legs) if (leg.kind !== 'vertical') expect(new Set(leg.levelIds).size, `${p}: ${leg.kind}`).toBe(1);
      }
    }
  });
});

describe('one-way escalators (only where a source says so)', () => {
  const oneWay = model.verticals.filter((v) => v.escalatorDirection?.direction === 'up' || v.escalatorDirection?.direction === 'down');
  const switching = model.verticals.filter((v) => v.escalatorDirection?.direction === 'scheduled');

  it('have their walking edge in the running direction only', () => {
    expect(oneWay.length).toBeGreaterThan(0);
    for (const v of oneWay) {
      const edges = graph.edges.filter((e) => e.kind === 'vertical' && e.elementId === v.id);
      expect(edges).toHaveLength(v.stops.length - 1);
      for (const e of edges) {
        const from = nodeById.get(e.from)!;
        const to = nodeById.get(e.to)!;
        const up = v.escalatorDirection!.direction === 'up';
        expect(up ? to.levelOrdinal > from.levelOrdinal : to.levelOrdinal < from.levelOrdinal).toBe(true);
      }
    }
  });

  it('an escalator that switches by time of day stays usable both ways (the planner has no clock)', () => {
    expect(switching.length).toBeGreaterThan(0);
    for (const v of switching) expect(graph.edges.filter((e) => e.kind === 'vertical' && e.elementId === v.id)).toHaveLength(2 * (v.stops.length - 1));
  });

  it('the alighting-only Keio platform is left by stairs only, towards the 京王西口 end', () => {
    const out = mustFind('sk:platform:keio-shinjuku-alighting', 'sk:gate:keio-west-gate');
    expect(out.legs[0]!.elementId).toBe('sk:vertical:keio-stairs-concourse-to-alighting-platform');
    const lift = findRoute(graph, 'sk:platform:keio-shinjuku-alighting', 'sk:gate:keio-west-gate', { mode: 'elevator-only' });
    expect(lift.found).toBe(false);
  });

  it('a route down to the Yamanote platform from the south concourse does not ride the up-only escalator', () => {
    const down = mustFind('sk:area:jr-2f-south-concourse', 'sk:platform:jr-east-shinjuku-13-14');
    expect(down.legs.some((l) => l.elementId === 'sk:vertical:jr-escalator-2f-south-to-platform-13-14')).toBe(false);
  });
});
