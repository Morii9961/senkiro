import { describe, expect, it } from 'vitest';
import {
  assertValidHubDataset,
  HubDatasetValidationError,
  validateHubDataset,
} from '../src/index.ts';
import { fixtureHub, link, lk, pl, place } from './fixtures.ts';

const rules = (hub: ReturnType<typeof fixtureHub>) => validateHubDataset(hub).map((i) => i.rule);

describe('validateHubDataset', () => {
  it('accepts the fixture hub', () => {
    expect(validateHubDataset(fixtureHub())).toEqual([]);
    expect(() => assertValidHubDataset(fixtureHub())).not.toThrow();
  });

  it('rejects paid and unpaid joined without a gate', () => {
    const hub = fixtureHub();
    hub.links.push(link('sneak', 'passage', 'hall', 'a-hall'));
    expect(rules(hub)).toContain('fare-boundary');
  });

  it('rejects a gate between two places of one zone and a ticket gate between two paid areas', () => {
    const hub = fixtureHub();
    hub.links.push(link('same', 'gate', 'hall', 'entrance', { gateKind: 'ticket' }));
    hub.links.push(link('paid-paid', 'gate', 'a-plat', 'b-hall', { gateKind: 'ticket' }));
    const found = rules(hub);
    expect(found.filter((r) => r === 'gate-sides').length).toBeGreaterThanOrEqual(2);
  });

  it('requires a gate kind on gates only', () => {
    const hub = fixtureHub();
    hub.links = hub.links.map((l) => {
      if (l.id === lk('a-gate')) {
        const { gateKind: _drop, ...rest } = l;
        return rest;
      }
      return l.id === lk('entrance-hall') ? { ...l, gateKind: 'ticket' as const } : l;
    });
    expect(rules(hub).filter((r) => r === 'gate-kind')).toHaveLength(2);
  });

  it('rejects a passage that changes floor and a staircase on one floor', () => {
    const hub = fixtureHub();
    hub.links.push(link('fall', 'passage', 'hall', 'b-free'));
    hub.links.push(link('flat', 'stairs', 'hall', 'entrance'));
    const found = rules(hub);
    expect(found).toContain('level-change');
    expect(found).toContain('vertical-flat');
  });

  it('needs a declaredSpan for a link that skips a floor', () => {
    const hub = fixtureHub();
    hub.links.push(link('express', 'elevator', 'hall', 'b-plat'));
    expect(rules(hub)).toContain('vertical-adjacent');
    hub.links = hub.links.map((l) =>
      l.id === lk('express')
        ? { ...l, declaredSpan: ['sk:level:test:a-1f', 'sk:level:test:b-b2'] }
        : l,
    );
    expect(rules(hub)).not.toContain('vertical-adjacent');
  });

  it('forbids anything linked to a roadway', () => {
    const hub = fixtureHub();
    hub.places.push(place('road', 'a-1f', 'concourse', 'roadway', { x0: 0, z0: 5, x1: 10, z1: 9 }));
    hub.links.push(link('to-road', 'passage', 'hall', 'road'));
    expect(rules(hub)).toContain('roadway');
  });

  it('checks ids, sources and references', () => {
    const hub = fixtureHub();
    hub.places.push({
      ...place('dup', 'a-1f', 'concourse', 'unpaid', { x0: 0, z0: 20, x1: 1, z1: 21 }),
      id: pl('hall'),
    });
    hub.links.push({ ...link('ghost', 'passage', 'hall', 'nowhere') });
    const first = hub.places[0];
    if (first !== undefined) {
      hub.places[0] = {
        ...first,
        provenance: { ...first.provenance, sourceIds: ['sk:source:test:missing'] },
      };
    }
    const found = rules(hub);
    expect(found).toContain('id-unique');
    expect(found).toContain('reference');
    expect(found).toContain('provenance');
  });

  it('rejects a three-segment legacy id', () => {
    const hub = fixtureHub();
    const first = hub.places[0];
    if (first !== undefined) {
      hub.places[0] = { ...first, id: 'sk:place:legacy' as never };
    }
    expect(rules(hub)).toContain('id-format');
  });

  it('keeps platforms paid, entrances unpaid and anchors inside footprints', () => {
    const hub = fixtureHub();
    hub.places = hub.places.map((p) => {
      if (p.id === pl('a-plat')) {
        return { ...p, fareZone: 'unpaid' as const };
      }
      if (p.id === pl('entrance')) {
        return { ...p, fareZone: 'paid:a' as const, anchor: { x: 99, z: 99 } };
      }
      return p;
    });
    const found = validateHubDataset(hub);
    expect(found.filter((i) => i.rule === 'fare-zone')).toHaveLength(2);
    expect(found.some((i) => i.rule === 'geometry' && i.entityId === pl('entrance'))).toBe(true);
  });

  it('enforces geometry honesty for hand-entered data', () => {
    const hub = fixtureHub();
    hub.places = hub.places.map((p) =>
      p.id === pl('hall')
        ? {
            ...p,
            geometryConfidence: 'verified' as const,
            provenance: { ...p.provenance, dataNature: 'manual-verified' as const },
          }
        : p,
    );
    expect(rules(hub)).toContain('honesty');
  });

  it('throws a HubDatasetValidationError listing every issue', () => {
    const hub = fixtureHub();
    hub.links.push(
      link('sneak', 'passage', 'hall', 'a-hall'),
      link('fall', 'passage', 'hall', 'b-free'),
    );
    try {
      assertValidHubDataset(hub);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HubDatasetValidationError);
      expect((error as HubDatasetValidationError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
