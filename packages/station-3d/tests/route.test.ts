import type { StationRouteFound, StationRouteResult } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import { buildIndoorGraph, findStationRoute, routesFrom } from '../src/index.ts';
import { COMPLEX, fixtureHub, link, lk, pl, place } from './fixtures.ts';

function found(result: StationRouteResult): StationRouteFound {
  if (!result.reachable) {
    throw new Error(`expected a route, got ${result.reason}: ${result.detail}`);
  }
  return result;
}

const query = (from: string, to: string, mode: 'standard' | 'step_free' = 'standard') => ({
  complexId: COMPLEX,
  fromPlaceId: pl(from),
  toPlaceId: pl(to),
  mode,
});

describe('findStationRoute', () => {
  const graph = buildIndoorGraph(fixtureHub());

  it('enters through one gate and prefers the escalator in standard mode', () => {
    const route = found(findStationRoute(graph, query('entrance', 'a-plat')));
    expect(route.gatePasses).toBe(1);
    expect(route.levelChanges).toBe(1);
    expect(route.steps.map((s) => s.linkId)).toEqual([
      lk('entrance-hall'),
      lk('a-gate'),
      lk('a-esc'),
    ]);
    expect(route.steps[0]?.fromPlaceId).toBe(pl('entrance'));
    expect(route.steps.at(-1)?.toPlaceId).toBe(pl('a-plat'));
    expect(route.distanceMeters).toBeNull();
    expect(route.durationMinutes).toBeNull();
  });

  it('uses only the lift in step-free mode and reports unconfirmed links', () => {
    const route = found(findStationRoute(graph, query('entrance', 'a-plat', 'step_free')));
    const kinds = route.steps.map((s) => s.kind);
    expect(kinds).toContain('elevator');
    expect(kinds).not.toContain('stairs');
    expect(kinds).not.toContain('escalator');
    expect(route.unconfirmedStepFreeCount).toBe(2);
    expect(route.levelSequence).toEqual(['sk:level:test:a-1f', 'sk:level:test:a-b1']);
  });

  it('says step-free-unavailable when only stairs reach the place', () => {
    const result = findStationRoute(graph, query('entrance', 'b-plat', 'step_free'));
    expect(result.reachable).toBe(false);
    expect(!result.reachable && result.reason).toBe('step-free-unavailable');
    expect(result.steps).toEqual([]);
  });

  it('never uses an inferred (unverified) cross-operator transfer gate', () => {
    const route = found(findStationRoute(graph, query('a-plat', 'b-plat')));
    expect(route.steps.map((s) => s.linkId)).not.toContain(lk('a-b-transfer'));
    // Out through A's gate, across the unpaid area, in through B's gate.
    expect(route.gatePasses).toBe(2);
  });

  it('uses a verified transfer gate and saves the two gate passes', () => {
    const hub = fixtureHub();
    hub.links = hub.links.map((l) =>
      l.id === lk('a-b-transfer') ? { ...l, connection: 'verified' } : l,
    );
    const route = found(findStationRoute(buildIndoorGraph(hub), query('a-plat', 'b-plat')));
    expect(route.steps.map((s) => s.linkId)).toContain(lk('a-b-transfer'));
    expect(route.gatePasses).toBe(1);
  });

  it('never routes through a roadway area, even when it is shorter', () => {
    const hub = fixtureHub();
    hub.places.push(place('road', 'a-1f', 'concourse', 'roadway', { x0: 0, z0: 5, x1: 10, z1: 9 }));
    hub.links.push(
      link('hall-road', 'passage', 'hall', 'road'),
      link('road-a', 'passage', 'road', 'a-hall'),
    );
    const g = buildIndoorGraph(hub);
    const route = found(findStationRoute(g, query('entrance', 'a-hall')));
    expect(
      route.steps.some((s) => s.fromPlaceId === pl('road') || s.toPlaceId === pl('road')),
    ).toBe(false);
    expect(findStationRoute(g, query('road', 'hall')).reachable).toBe(false);
  });

  it('respects forward-only links', () => {
    const hub = fixtureHub();
    hub.links = hub.links.map((l) =>
      l.id === lk('entrance-hall') ? { ...l, direction: 'forward' } : l,
    );
    const g = buildIndoorGraph(hub);
    expect(findStationRoute(g, query('entrance', 'hall')).reachable).toBe(true);
    const back = findStationRoute(g, query('hall', 'entrance'));
    expect(!back.reachable && back.reason).toBe('unreachable');
  });

  it('counts one boarding for a multi-floor lift ride but every floor passed', () => {
    const hub = fixtureHub();
    hub.places.push(
      place('lift-top', 'a-1f', 'landing', 'unpaid', { x0: 1, z0: 1, x1: 2, z1: 2 }, null),
      place('lift-mid', 'b-b1', 'landing', 'unpaid', { x0: 1, z0: 11, x1: 2, z1: 12 }, null),
      place('lift-low', 'b-b2', 'landing', 'unpaid', { x0: 1, z0: 11, x1: 2, z1: 12 }, null),
      place('b-low-free', 'b-b2', 'concourse', 'unpaid', { x0: 0, z0: 14, x1: 10, z1: 18 }),
    );
    hub.links.push(
      link('to-lift', 'passage', 'hall', 'lift-top', { stepFree: null, hasSteps: null }),
      link('lift-1', 'elevator', 'lift-top', 'lift-mid'),
      link('lift-2', 'elevator', 'lift-mid', 'lift-low'),
      link('from-lift', 'passage', 'lift-low', 'b-low-free', { stepFree: null, hasSteps: null }),
    );
    const route = found(
      findStationRoute(buildIndoorGraph(hub), query('hall', 'b-low-free', 'step_free')),
    );
    expect(route.levelChanges).toBe(2);
    expect(route.steps.filter((s) => s.kind === 'elevator')).toHaveLength(2);
    expect(route.levelSequence).toHaveLength(3);
  });

  it('returns a zero-step route from a place to itself', () => {
    const route = found(findStationRoute(graph, query('hall', 'hall')));
    expect(route.steps).toEqual([]);
    expect(route.levelSequence).toEqual(['sk:level:test:a-1f']);
  });

  it('fails honestly for unknown places and another hub', () => {
    const unknown = findStationRoute(graph, { ...query('hall', 'hall'), toPlaceId: pl('nowhere') });
    expect(!unknown.reachable && unknown.reason).toBe('unknown-place');
    const other = findStationRoute(graph, {
      ...query('hall', 'hall'),
      complexId: 'sk:complex:test:other',
    });
    expect(!other.reachable && other.reason).toBe('unknown-place');
  });

  it('can exclude inferred links', () => {
    const hub = fixtureHub();
    hub.links = hub.links.map((l) =>
      l.id === lk('b-gate') ? { ...l, connection: 'inferred' } : l,
    );
    const g = buildIndoorGraph(hub);
    expect(findStationRoute(g, query('hall', 'b-hall')).reachable).toBe(true);
    const strict = findStationRoute(g, { ...query('hall', 'b-hall'), allowInferred: false });
    expect(strict.reachable).toBe(false);
    const counted = found(findStationRoute(g, query('hall', 'b-hall')));
    expect(counted.inferredLinkCount).toBe(1);
  });

  it('agrees with the single-source planner and is deterministic', () => {
    const tree = routesFrom(graph, pl('entrance'), 'standard');
    for (const target of graph.nodes.keys()) {
      const single = findStationRoute(graph, {
        ...query('entrance', 'entrance'),
        toPlaceId: target,
      });
      const fromTree = tree.to(target);
      expect(single.reachable).toBe(fromTree !== null);
      if (single.reachable && fromTree !== null) {
        expect(fromTree.steps).toEqual(single.steps);
      }
    }
  });
});
