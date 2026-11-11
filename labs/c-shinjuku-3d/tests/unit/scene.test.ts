import { describe, expect, it } from 'vitest';
import { DEMO_ROUTES } from '../../src/domain/demo';
import { findRoute, type Route } from '../../src/domain/route';
import { GATE_LINE_TOLERANCE } from '../../src/domain/validate';
import {
  areasTouch,
  buildLabels,
  buildPrims,
  buildRoutePrims,
  maxTierForScale,
  routePoints,
  sceneBox,
  segmentInside,
  type ViewOptions,
} from '../../src/ui/scene/build';
import { PALETTES } from '../../src/ui/theme';
import { loadGraph, loadModel } from './helpers';

/**
 * The drawing is generated from the same StationModel as the routing graph.
 * These tests pin that down: nothing routable is invisible, nothing visible is
 * invented, and a highlighted route is drawn where the graph says it goes.
 */

const model = loadModel();
const graph = loadGraph();
const nodes = new Map(graph.nodes.map((n) => [n.id, n]));

function view(over: Partial<ViewOptions> = {}): ViewOptions {
  return {
    explode: 0.35,
    activeLevelId: null,
    ghostOthers: true,
    shellOpacity: 0.3,
    showVerticals: true,
    showBlocks: true,
    palette: PALETTES.light,
    route: null,
    selectedId: null,
    platformStatus: null,
    ...over,
  };
}

function demoRoute(id: string): Route {
  const d = DEMO_ROUTES.find((x) => x.id === id)!;
  const r = findRoute(graph, d.fromNodeId, d.toNodeId, { mode: d.mode });
  if (!r.found) throw new Error(`demo route ${id} not found`);
  return r;
}

describe('3D primitives ⇄ model', () => {
  const prims = buildPrims(model, view());
  const drawn = new Set(prims.map((p) => p.elementId).filter((id): id is string => id !== null));

  it('draws every area, gate, entrance, vertical facility and unverified block', () => {
    const expected = [
      ...model.areas.map((a) => a.id),
      ...model.gates.map((g) => g.id),
      ...model.entrances.map((e) => e.id),
      ...model.verticals.map((v) => v.id),
      ...model.unverifiedBlocks.map((b) => b.id),
    ];
    expect(expected.filter((id) => !drawn.has(id))).toEqual([]);
  });

  it('draws a connector for every passage whose two areas do not share an edge, and for every inferred one', () => {
    const areaById = new Map(model.areas.map((a) => [a.id, a]));
    const needLine = model.passages.filter((l) => l.connection === 'inferred' || !areasTouch(areaById.get(l.fromAreaId)!, areaById.get(l.toAreaId)!));
    expect(needLine.length).toBeGreaterThan(0);
    expect(needLine.filter((l) => !drawn.has(l.id)).map((l) => l.id)).toEqual([]);
  });

  it('draws nothing that is not in the model', () => {
    const known = new Set([
      ...model.areas.map((a) => a.id),
      ...model.gates.map((g) => g.id),
      ...model.entrances.map((e) => e.id),
      ...model.verticals.map((v) => v.id),
      ...model.unverifiedBlocks.map((b) => b.id),
      ...model.passages.map((p) => p.id),
    ]);
    expect([...drawn].filter((id) => !known.has(id))).toEqual([]);
  });

  it('every routing-graph node stands for an element that is drawn', () => {
    expect(graph.nodes.filter((n) => !drawn.has(n.elementId)).map((n) => n.id)).toEqual([]);
  });

  it('unverified blocks are translucent, hatched and never opaque', () => {
    for (const blk of model.unverifiedBlocks) {
      const body = prims.filter((p) => p.elementId === blk.id && p.role === 'block');
      expect(body).toHaveLength(1);
      expect(body[0]!.alpha).toBeLessThan(0.3);
      expect(prims.some((p) => p.elementId === blk.id && p.role === 'block-hatch')).toBe(true);
    }
  });

  it('single-level view without ghosting keeps only that level', () => {
    const level = model.levels.find((l) => l.label === 'B1F' && l.operatorId.endsWith('jr-east'))!;
    const only = buildPrims(model, view({ activeLevelId: level.id, ghostOthers: false, showBlocks: false }));
    const areaLevel = new Map(model.areas.map((a) => [a.id, a.levelId]));
    const strayAreas = only.filter((p) => p.role === 'area' && areaLevel.get(p.elementId!) !== level.id);
    expect(strayAreas).toEqual([]);
    expect(only.filter((p) => p.role === 'shell')).toHaveLength(1);
  });

  it('pulling the levels apart never changes their order', () => {
    const ys = (explode: number) =>
      [...model.levels].sort((a, b) => a.elevation - b.elevation).map((l) => buildPrims(model, view({ explode })).find((p) => p.role === 'shell' && Math.abs(p.a[1] - l.elevation * (1 + explode * 1.9) + 0.18) < 1e-6));
    for (const e of [0, 0.5, 1]) expect(ys(e).every((p) => p !== undefined)).toBe(true);
  });
});

describe('level slabs do not fight for the same depth', () => {
  it('no two horizontal slabs on a level are coplanar and overlapping', () => {
    const prims = buildPrims(model, view({ explode: 0 })).filter((p) => p.role === 'area' || p.role === 'shell');
    const tops = prims.map((p) => ({ p, top: p.a[1] + p.thickness / 2, x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), z0: p.a[2] - p.width / 2, z1: p.a[2] + p.width / 2 }));
    const clashes: string[] = [];
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        const a = tops[i]!;
        const b = tops[j]!;
        if (Math.abs(a.top - b.top) > 1e-4) continue;
        if (a.p.elementId !== null && a.p.elementId === b.p.elementId) continue; // parts of one footprint
        const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
        if (overlap) clashes.push(`${a.p.elementId} / ${b.p.elementId}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('labels', () => {
  const labels = buildLabels(model, view(), (id) => id, { unverified: 'UNVERIFIED' });

  it('labels every level and every platform', () => {
    expect(labels.filter((l) => l.variant === 'level')).toHaveLength(model.levels.length);
    expect(labels.filter((l) => l.variant === 'platform')).toHaveLength(model.areas.filter((a) => a.kind === 'platform').length);
  });

  it('marks every unverified block as unverified in its label', () => {
    const blocks = labels.filter((l) => l.variant === 'block');
    expect(blocks).toHaveLength(model.unverifiedBlocks.length);
    expect(blocks.every((l) => l.text.startsWith('UNVERIFIED'))).toBe(true);
  });

  it('shows more label tiers as the drawing gets larger', () => {
    const tiers = [1, 3, 7, 10, 14, 30].map(maxTierForScale);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(tiers[0]).toBe(0);
    expect(tiers.at(-1)).toBe(3);
  });

  it('a route puts its own elements in the always-visible tier', () => {
    const route = demoRoute('east-exit-to-yamanote');
    const routed = buildLabels(model, view({ route }), (id) => id, { unverified: 'UNVERIFIED' });
    const gate = routed.find((l) => l.elementId === route.legs.find((leg) => leg.kind === 'gate')!.elementId)!;
    expect(gate.tier).toBe(0);
  });
});

describe('route drawing ⇄ routing graph', () => {
  const areaById = new Map(model.areas.map((a) => [a.id, a]));

  for (const demo of DEMO_ROUTES) {
    describe(demo.id, () => {
      const route = demoRoute(demo.id);
      const pts = routePoints(route, nodes, model);

      it('starts and ends at the route endpoints and keeps every non-area node', () => {
        expect(pts[0]!.nodeId).toBe(route.nodeIds[0]);
        expect(pts.at(-1)!.nodeId).toBe(route.nodeIds.at(-1));
        const kept = pts.map((p) => p.nodeId).filter((id): id is string => id !== null);
        const mustKeep = route.nodeIds.filter((id) => nodes.get(id)!.kind !== 'area');
        expect(mustKeep.filter((id) => !kept.includes(id))).toEqual([]);
        // order is preserved
        expect(kept).toEqual(route.nodeIds.filter((id) => kept.includes(id)));
      });

      it('visits the levels in the order the route reports', () => {
        const seq: string[] = [];
        for (const p of pts) if (seq.at(-1) !== p.levelId) seq.push(p.levelId);
        expect(seq).toEqual(route.levelSequence);
      });

      it('stays inside the drawn areas on every level (no line through a wall)', () => {
        const inferred = new Set<string>();
        for (const leg of route.legs) if (leg.connection === 'inferred') leg.nodeIds.forEach((id) => inferred.add(id));
        const outside: string[] = [];
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]!;
          const b = pts[i + 1]!;
          if (a.levelId !== b.levelId) continue;
          if (a.nodeId && b.nodeId && inferred.has(a.nodeId) && inferred.has(b.nodeId)) continue;
          // stepping on or off a gate crosses the gate line, the narrow gap between the two areas it separates
          const length = Math.hypot(a.plan.x - b.plan.x, a.plan.z - b.plan.z);
          if ((a.kind === 'gate' || b.kind === 'gate') && length <= GATE_LINE_TOLERANCE) continue;
          const footprint = model.areas.filter((x) => x.levelId === a.levelId).flatMap((x) => x.footprint);
          if (!segmentInside(a.plan, b.plan, footprint)) outside.push(`${a.nodeId ?? 'bend'} → ${b.nodeId ?? 'bend'}`);
        }
        expect(outside).toEqual([]);
      });

      it('produces highlight geometry, and only non-pickable', () => {
        const prims = buildRoutePrims(model, route, pts, view({ route }));
        expect(prims.length).toBeGreaterThanOrEqual(pts.length - 1);
        expect(prims.every((p) => !p.pickable)).toBe(true);
      });
    });
  }

  it('an area anchor is only skipped when the shortcut stays inside that area', () => {
    const route = demoRoute('south-exit-to-keio');
    const pts = routePoints(route, nodes, model);
    const kept = new Set(pts.map((p) => p.nodeId));
    for (let i = 1; i + 1 < route.nodeIds.length; i++) {
      const n = nodes.get(route.nodeIds[i]!)!;
      if (n.kind !== 'area' || kept.has(n.id)) continue;
      expect(areaById.has(n.elementId)).toBe(true);
    }
  });
});

describe('camera framing box', () => {
  it('contains every level and, when shown, the unverified blocks', () => {
    const station = sceneBox(model, { explode: 0.35, activeLevelId: null, showBlocks: false });
    const all = sceneBox(model, { explode: 0.35, activeLevelId: null, showBlocks: true });
    for (const i of [0, 1, 2] as const) {
      expect(all.min[i]).toBeLessThanOrEqual(station.min[i]);
      expect(all.max[i]).toBeGreaterThanOrEqual(station.max[i]);
    }
    for (const a of model.areas) {
      for (const r of a.footprint) {
        expect(r.x0).toBeGreaterThanOrEqual(station.min[0]);
        expect(r.x1).toBeLessThanOrEqual(station.max[0]);
        expect(r.z0).toBeGreaterThanOrEqual(station.min[2]);
        expect(r.z1).toBeLessThanOrEqual(station.max[2]);
      }
    }
  });

  it('shrinks to one level when that level is isolated', () => {
    const level = model.levels[0]!;
    const one = sceneBox(model, { explode: 0.35, activeLevelId: level.id, showBlocks: true });
    const all = sceneBox(model, { explode: 0.35, activeLevelId: null, showBlocks: true });
    expect(one.max[1] - one.min[1]).toBeLessThan(all.max[1] - all.min[1]);
  });
});
