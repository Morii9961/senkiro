import { describe, expect, it } from 'vitest';
import { DEMO_ROUTES } from '../../src/domain/demo';
import { floorsOf } from '../../src/domain/floors';
import { findRoute, type Route } from '../../src/domain/route';
import { GATE_LINE_TOLERANCE, nearestInFootprint } from '../../src/domain/validate';
import {
  areasTouch,
  buildLabels,
  buildPrims,
  buildRoutePrims,
  buildScene,
  levelY,
  maxTierForScale,
  routeBox,
  routePoints,
  sceneBox,
  segmentInside,
  sharedEdgeMidpoint,
  type Prim,
  type ViewOptions,
} from '../../src/ui/scene/build';
import { MAX_POLAR, MIN_DISTANCE, MIN_POLAR, focusPose, homePose, mixPose, targetLimits } from '../../src/ui/scene/camera';
import { PALETTES } from '../../src/ui/theme';
import { loadGraph, loadModel } from './helpers';

/**
 * The drawing is generated from the same StationModel as the routing graph.
 * These tests pin that down: nothing routable is invisible, nothing visible is
 * invented, the generated architecture agrees with the connections, and a
 * highlighted route is drawn where the graph says it goes.
 */

const model = loadModel();
const graph = loadGraph();
const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
const areaById = new Map(model.areas.map((a) => [a.id, a]));
const ordinalOf = new Map(model.levels.map((l) => [l.id, l.ordinal]));

function view(over: Partial<ViewOptions> = {}): ViewOptions {
  return {
    explode: 0.3,
    focusOrdinals: null,
    ghostOthers: true,
    shellOpacity: 0.3,
    showVerticals: true,
    showBlocks: true,
    palette: PALETTES.light,
    route: null,
    focusLeg: null,
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

/** Plan rectangle a horizontal box primitive covers. */
function planRect(p: Prim) {
  return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), z0: p.a[2] - p.width / 2, z1: p.a[2] + p.width / 2 };
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
    const needLine = model.passages.filter((l) => l.connection === 'inferred' || !areasTouch(areaById.get(l.fromAreaId)!, areaById.get(l.toAreaId)!));
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

  it('decoration (columns, floor plates) can never be picked', () => {
    expect(prims.filter((p) => p.elementId === null && p.pickable)).toEqual([]);
    expect(prims.some((p) => p.role === 'column')).toBe(true);
  });

  it('unverified blocks are translucent, hatched and never opaque', () => {
    for (const blk of model.unverifiedBlocks) {
      const body = prims.filter((p) => p.elementId === blk.id && p.role === 'block');
      expect(body).toHaveLength(1);
      expect(body[0]!.alpha).toBeLessThan(0.3);
      expect(prims.some((p) => p.elementId === blk.id && p.role === 'block-hatch')).toBe(true);
    }
  });

  it('a single floor without ghosting keeps only that floor', () => {
    const only = buildPrims(model, view({ focusOrdinals: new Set([-1]), ghostOthers: false, showBlocks: false }));
    const stray = only.filter((p) => p.role === 'area' && ordinalOf.get(areaById.get(p.elementId!)!.levelId) !== -1);
    expect(stray).toEqual([]);
    expect(only.filter((p) => p.role === 'shell')).toHaveLength(model.levels.filter((l) => l.ordinal === -1).length);
  });

  it('ghosted floors are drawn faintly and without furniture', () => {
    const some = buildPrims(model, view({ focusOrdinals: new Set([0]) }));
    const ghostAreas = some.filter((p) => p.role === 'area' && ordinalOf.get(areaById.get(p.elementId!)!.levelId) !== 0);
    expect(ghostAreas.length).toBeGreaterThan(0);
    expect(ghostAreas.every((p) => p.alpha < 0.2)).toBe(true);
    const wallOwners = new Set(some.filter((p) => p.role === 'wall').map((p) => ordinalOf.get(areaById.get(p.elementId!)!.levelId)));
    expect([...wallOwners].every((o) => o === 0)).toBe(true);
  });

  it('pulling the floors apart never changes their order', () => {
    const byElevation = [...model.levels].sort((a, b) => a.elevation - b.elevation);
    for (const explode of [0, 0.5, 1]) {
      const ys = byElevation.map((l) => levelY(l, explode));
      expect(ys).toEqual([...ys].sort((a, b) => a - b));
    }
  });
});

describe('generated architecture agrees with the connections', () => {
  const prims = buildPrims(model, view());
  const wallsOf = (areaId: string) => prims.filter((p) => p.role === 'wall' && p.elementId === areaId).map(planRect);
  const blocked = (areaId: string, x: number, z: number, margin = 0.3) =>
    wallsOf(areaId).some((r) => x > r.x0 - (r.x1 - r.x0 < 0.3 ? margin : 0) && x < r.x1 + (r.x1 - r.x0 < 0.3 ? margin : 0) && z > r.z0 - (r.z1 - r.z0 < 0.3 ? margin : 0) && z < r.z1 + (r.z1 - r.z0 < 0.3 ? margin : 0));

  it('every hall and corridor has walls; platforms have none', () => {
    for (const a of model.areas) {
      const n = prims.filter((p) => p.role === 'wall' && p.elementId === a.id).length;
      if (a.kind === 'platform') expect(n, a.id).toBe(0);
      else expect(n, a.id).toBeGreaterThan(0);
    }
  });

  it('no wall stands in a gate', () => {
    const shut: string[] = [];
    for (const g of model.gates) {
      for (const side of g.sides) {
        if (!('areaId' in side)) continue;
        const area = areaById.get(side.areaId)!;
        if (area.kind === 'platform') continue;
        const at = nearestInFootprint(g.position, area.footprint).point;
        if (blocked(area.id, at.x, at.z)) shut.push(`${g.id} @ ${area.id}`);
      }
    }
    expect(shut).toEqual([]);
  });

  it('no wall stands between two areas joined by a passage', () => {
    const shut: string[] = [];
    for (const link of model.passages) {
      const a = areaById.get(link.fromAreaId)!;
      const b = areaById.get(link.toAreaId)!;
      const door = sharedEdgeMidpoint(a, b);
      if (!door) continue;
      for (const area of [a, b]) if (area.kind !== 'platform' && blocked(area.id, door.x, door.z, 0.15)) shut.push(`${link.id} @ ${area.id}`);
    }
    expect(shut).toEqual([]);
  });

  it('no wall stands in an entrance', () => {
    const shut = model.entrances.filter((e) => areaById.get(e.areaId)!.kind !== 'platform' && blocked(e.areaId, e.position.x, e.position.z)).map((e) => e.id);
    expect(shut).toEqual([]);
  });

  it('a floor is opened where stairs, escalators and lifts come up through it', () => {
    const closed: string[] = [];
    const covered = (areaId: string, x: number, z: number) =>
      prims.some((p) => p.role === 'area' && p.elementId === areaId && (() => { const r = planRect(p); return x > r.x0 + 0.01 && x < r.x1 - 0.01 && z > r.z0 + 0.01 && z < r.z1 - 0.01; })());
    for (const v of model.verticals) {
      const stops = [...v.stops].sort((s, t) => model.levels.find((l) => l.id === s.levelId)!.elevation - model.levels.find((l) => l.id === t.levelId)!.elevation);
      for (let i = 1; i < stops.length; i++) {
        const lo = stops[i - 1]!;
        const up = stops[i]!;
        // just short of the head of the flight (or the shaft itself), on the upper floor
        const x = v.verticalKind === 'elevator' ? up.position.x : lo.position.x + (up.position.x - lo.position.x) * 0.85;
        const z = v.verticalKind === 'elevator' ? up.position.z : lo.position.z + (up.position.z - lo.position.z) * 0.85;
        if (covered(up.areaId, x, z)) closed.push(v.id);
      }
    }
    expect(closed).toEqual([]);
  });

  it('a track is drawn only where the data says which platform edge it runs along', () => {
    for (const a of model.areas) {
      if (a.kind !== 'platform') continue;
      const hasTracks = prims.some((p) => p.role === 'track' && p.elementId === a.id);
      expect(hasTracks, a.id).toBe(a.tracks.some((t) => t.side));
      const bands = prims.filter((p) => p.role === 'line-band' && p.elementId === a.id).length;
      expect(bands > 0, a.id).toBe(a.tracks.some((t) => t.side));
    }
  });

  it('baked contact shadows sit on fully drawn floors only', () => {
    const all = buildScene(model, view());
    const one = buildScene(model, view({ focusOrdinals: new Set([-1]) }));
    expect(all.decals.length).toBeGreaterThan(one.decals.length);
    expect(one.decals.length).toBeGreaterThan(0);
  });
});

describe('floor slabs do not fight for the same depth', () => {
  it('no two horizontal slabs on a floor are coplanar and overlapping', () => {
    const prims = buildPrims(model, view({ explode: 0 })).filter((p) => p.role === 'area' || p.role === 'shell' || p.role === 'bridge');
    const tops = prims.map((p) => ({ p, top: p.a[1] + p.thickness / 2, ...planRect(p) }));
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
  const chip = (id: string) => ({ text: id, color: '#000000' });
  const texts = { unverified: 'UNVERIFIED', start: 'START', goal: 'GOAL' };
  const labels = buildLabels(model, view(), (id) => id, chip, texts);

  it('labels every floor once — by floor, not by operator — and every platform with its lines', () => {
    const floors = floorsOf(model);
    const floorLabels = labels.filter((l) => l.variant === 'level');
    expect(floorLabels.map((l) => l.text).sort()).toEqual(floors.map((f) => f.label).sort());
    const platforms = labels.filter((l) => l.variant === 'platform');
    expect(platforms).toHaveLength(model.areas.filter((a) => a.kind === 'platform').length);
    expect(platforms.every((l) => (l.chips?.length ?? 0) > 0)).toBe(true);
  });

  it('marks every unverified block as unverified in its label', () => {
    const blocks = labels.filter((l) => l.variant === 'block');
    expect(blocks).toHaveLength(model.unverifiedBlocks.length);
    expect(blocks.every((l) => l.text.startsWith('UNVERIFIED'))).toBe(true);
  });

  it('halls are named but open no card', () => {
    const halls = labels.filter((l) => l.variant === 'area');
    expect(halls.length).toBeGreaterThan(0);
    expect(halls.every((l) => l.elementId === null)).toBe(true);
  });

  it('shows more label tiers as the drawing gets larger', () => {
    const tiers = [1, 3, 7, 10, 14, 30].map(maxTierForScale);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(tiers[0]).toBe(0);
    expect(tiers.at(-1)).toBe(3);
  });

  it('a route puts its own elements in the always-visible tier and marks its two ends', () => {
    const route = demoRoute('east-exit-to-yamanote');
    const pts = routePoints(route, nodes, model);
    const routed = buildLabels(model, view({ route }), (id) => id, chip, texts, pts);
    const gate = routed.find((l) => l.elementId === route.legs.find((leg) => leg.kind === 'gate')!.elementId)!;
    expect(gate.tier).toBe(0);
    expect(routed.find((l) => l.variant === 'route-start')?.text).toBe('START');
    expect(routed.find((l) => l.variant === 'route-end')?.text).toBe('GOAL');
  });
});

describe('route drawing ⇄ routing graph', () => {
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

      it('every stretch belongs to a leg, and the legs come in order', () => {
        const legs = pts.map((p) => p.leg);
        expect(legs.every((l) => l >= 0 && l < route.legs.length)).toBe(true);
        expect(legs).toEqual([...legs].sort((a, b) => a - b));
        // every gate pass and every ride can be focused
        for (const leg of route.legs) {
          if (leg.kind !== 'gate' && leg.kind !== 'vertical') continue;
          expect(routeBox(model, pts, leg.index, 0.3), `leg ${leg.index}`).not.toBeNull();
        }
      });

      it('produces highlight geometry, and only non-pickable', () => {
        const prims = buildRoutePrims(model, route, pts, view({ route }));
        expect(prims.length).toBeGreaterThanOrEqual(pts.length - 1);
        expect(prims.every((p) => !p.pickable)).toBe(true);
      });

      it('with a leg in focus only that leg keeps the route colour', () => {
        const leg = route.legs.find((l) => l.kind === 'vertical')!;
        const p = PALETTES.light;
        const prims = buildRoutePrims(model, route, pts, view({ route, focusLeg: leg.index })).filter((x) => x.role === 'route');
        expect(prims.some((x) => x.color === p.route)).toBe(true);
        expect(prims.some((x) => x.color === p.routeDim)).toBe(true);
      });
    });
  }

  it('a floor above a focused leg is drawn see-through, the floor the leg starts on stays solid', () => {
    const route = demoRoute('east-exit-to-yamanote');
    const leg = route.legs.find((l) => l.kind === 'vertical' && l.levelIds.length > 1)!;
    const ords = leg.levelIds.map((id) => ordinalOf.get(id)!);
    const prims = buildPrims(model, view({ route, focusLeg: leg.index, focusOrdinals: new Set(ords) }));
    const alphaOf = (ordinal: number) => prims.filter((p) => p.role === 'area' && ordinalOf.get(areaById.get(p.elementId!)!.levelId) === ordinal).map((p) => p.alpha);
    expect(alphaOf(Math.min(...ords)).every((a) => a === 1)).toBe(true);
    expect(alphaOf(Math.max(...ords)).every((a) => a < 1)).toBe(true);
  });
});

describe('camera', () => {
  it('the framing box contains every level and, when shown, the unverified blocks', () => {
    const station = sceneBox(model, { explode: 0.3, focusOrdinals: null, showBlocks: false });
    const all = sceneBox(model, { explode: 0.3, focusOrdinals: null, showBlocks: true });
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

  it('the box shrinks to the floors in focus', () => {
    const one = sceneBox(model, { explode: 0.3, focusOrdinals: new Set([model.levels[0]!.ordinal]), showBlocks: true });
    const all = sceneBox(model, { explode: 0.3, focusOrdinals: null, showBlocks: true });
    expect(one.max[1] - one.min[1]).toBeLessThan(all.max[1] - all.min[1]);
  });

  it('home and focus poses stay inside the pitch and distance limits', () => {
    const home = homePose(model, { explode: 0.3, focusOrdinals: null, showBlocks: true }, 16 / 9);
    expect(home.radius).toBeGreaterThanOrEqual(MIN_DISTANCE);
    expect(home.polar).toBeGreaterThan(MIN_POLAR);
    expect(home.polar).toBeLessThan(MAX_POLAR);

    const route = demoRoute('south-exit-to-keio');
    const pts = routePoints(route, nodes, model);
    for (const leg of route.legs) {
      const box = routeBox(model, pts, leg.index, 0.3);
      if (!box) continue;
      // even when the user is looking almost straight down or almost level
      for (const polar of [MIN_POLAR, 0.9, MAX_POLAR]) {
        const pose = focusPose(box, 16 / 9, { polar, azimuth: 2.1 });
        expect(pose.polar).toBeGreaterThanOrEqual(MIN_POLAR);
        expect(pose.polar).toBeLessThanOrEqual(MAX_POLAR);
        expect(pose.radius).toBeGreaterThanOrEqual(MIN_DISTANCE);
        expect(pose.radius).toBeLessThan(home.radius * 1.2);
        expect(pose.azimuth).toBe(2.1);
      }
    }
  });

  it('the camera target is confined to a box around the model', () => {
    const lim = targetLimits(model);
    for (const a of model.areas) {
      expect(a.anchor.x).toBeGreaterThan(lim.min[0]);
      expect(a.anchor.x).toBeLessThan(lim.max[0]);
      expect(a.anchor.z).toBeGreaterThan(lim.min[2]);
      expect(a.anchor.z).toBeLessThan(lim.max[2]);
    }
    const reach = Math.max(lim.max[0] - lim.min[0], lim.max[2] - lim.min[2]);
    expect(reach).toBeLessThan(200);
  });

  it('a camera move turns the short way round', () => {
    const home = homePose(model, { explode: 0.3, focusOrdinals: null, showBlocks: false }, 1.5);
    const a = { ...home, azimuth: 3.0 };
    const b = { ...home, azimuth: -3.0 };
    const mid = mixPose(a, b, 0.5);
    expect(Math.abs(mid.azimuth - Math.PI)).toBeLessThan(0.2);
  });
});
