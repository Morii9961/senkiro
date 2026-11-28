import { describe, expect, it } from 'vitest';
import {
  assertOdbLIsolation,
  ContractViolationError,
  isPaidFareZone,
  isServiceTime,
  requiresSyntheticDisclosure,
  serviceTimeToMinutes,
  unavailableOperationalStatus,
} from '../src/index.ts';
import { source } from './fixtures.ts';

const ccBy = source('sk:source:jp:test-cc-by', false);
const osm = source('sk:source:jp:test-osm', true);

function record(id: string, sourceIds: string[]) {
  return { id, provenance: { sourceIds, dataNature: 'derived' as const, lastVerifiedAt: null } };
}

describe('assertOdbLIsolation', () => {
  it('accepts a main dataset built only from non share-alike sources', () => {
    expect(() =>
      assertOdbLIsolation({
        sources: [ccBy],
        records: [record('sk:segment:kansai:test-1', [ccBy.id])],
      }),
    ).not.toThrow();
  });

  it('rejects an ODbL source registered in the main dataset', () => {
    expect(() =>
      assertOdbLIsolation({
        sources: [ccBy, osm],
        records: [record('sk:segment:kansai:test-1', [osm.id])],
      }),
    ).toThrow(/share-alike source/);
  });

  it('rejects sources with unknown share-alike status', () => {
    expect(() =>
      assertOdbLIsolation({
        sources: [source('sk:source:jp:test-unknown', 'unknown')],
        records: [],
      }),
    ).toThrow(/unknown share-alike/);
  });

  it('rejects records referencing sources outside the registry', () => {
    try {
      assertOdbLIsolation({
        sources: [ccBy],
        records: [record('sk:station:kansai:test-a', [ccBy.id, 'sk:source:jp:osm-planet'])],
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContractViolationError);
      expect((error as ContractViolationError).code).toBe('ODBL_ISOLATION_VIOLATION');
      expect((error as ContractViolationError).issues[0]).toMatch(/sk:station:kansai:test-a/);
    }
  });
});

describe('service and station helpers', () => {
  it('parses after-midnight service times and rejects invalid ones', () => {
    expect(serviceTimeToMinutes('05:12')).toBe(312);
    expect(serviceTimeToMinutes('24:35')).toBe(1475);
    expect(serviceTimeToMinutes('24:35:59')).toBe(1475);
    for (const bad of ['5:12', '24:60', '48:00', '12-30', '']) {
      expect(isServiceTime(bad), bad).toBe(false);
    }
  });

  it('defaults operational status to unavailable without a licensed feed', () => {
    expect(unavailableOperationalStatus('sk:line:kansai:test-line')).toEqual({
      lineId: 'sk:line:kansai:test-line',
      status: 'unavailable',
      message: null,
      observedAt: null,
      sourceId: null,
      dataNature: 'unknown',
    });
  });

  it('flags synthetic data and non-timetable schedules for disclosure', () => {
    expect(requiresSyntheticDisclosure({ dataNature: 'synthetic' })).toBe(true);
    expect(requiresSyntheticDisclosure({ dataNature: 'official' }, 'frequency')).toBe(true);
    expect(requiresSyntheticDisclosure({ dataNature: 'official' }, 'demo_synthetic')).toBe(true);
    expect(requiresSyntheticDisclosure({ dataNature: 'official' }, 'timetable')).toBe(false);
  });

  it('distinguishes paid fare zones from unpaid and roadway areas', () => {
    expect(isPaidFareZone('paid:jr-west')).toBe(true);
    expect(isPaidFareZone('unpaid')).toBe(false);
    expect(isPaidFareZone('roadway')).toBe(false);
  });
});
