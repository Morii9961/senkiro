import {
  assertHonestFareQuote,
  assertOdbLIsolation,
  type FareQuoteRequest,
  isSkId,
  type RegionalFareRulePack,
  type ResolvedPath,
  type TariffProvider,
} from '@senkiro/contracts';
import { FareRuleGraph, TrackGraphIndex } from '@senkiro/domain-core';
import { describe, expect, it, vi } from 'vitest';
import { calculateFareQuote, createFareEngineContext } from '../src/index.ts';
import { createKansaiPlaceholderPack } from '../src/packs/kansai/index.ts';
import { createKantoJrRulePack } from '../src/packs/kanto-jr/index.ts';
import { dataset } from './fixtures/atlas.ts';

const graph = new TrackGraphIndex(dataset);
const fareRuleGraph = new FareRuleGraph(graph);
const request: FareQuoteRequest = {
  originStationId: 'sk:station:kanto:jr-east-tokyo',
  destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
  travelDate: '2026-06-01',
  ticketType: 'ordinary_paper',
};
const placeholder = createKansaiPlaceholderPack();

describe('Regional fare pipeline', () => {
  it('validates fixture IDs, source isolation and JR slice sizes', () => {
    const entities = [
      ...dataset.operators,
      ...dataset.lines,
      ...dataset.stations,
      ...dataset.segments,
      ...dataset.complexes,
      ...dataset.interchanges,
    ];
    expect(entities.every(({ id }) => isSkId(id))).toBe(true);
    expect(dataset.sources.every(({ id }) => isSkId(id, 'source'))).toBe(true);
    expect(graph.issues).toEqual([]);
    expect(
      dataset.stations.filter(({ operatorId }) =>
        ['sk:operator:jp:jr-east', 'sk:operator:jp:jr-central'].includes(operatorId),
      ),
    ).toHaveLength(72);
    expect(dataset.segments).toHaveLength(80);
    expect(
      dataset.stations.filter(({ fareZoneTags }) => fareZoneTags.includes('slice:jr-east-kanto')),
    ).toHaveLength(66);
    expect(() =>
      assertOdbLIsolation({ sources: dataset.sources, records: entities }),
    ).not.toThrow();
  });

  it('reports a multi-pack scope conflict before dates or hooks', () => {
    const pack = createKantoJrRulePack({ trackGraph: graph, fareRuleGraph });
    const precheck = vi.fn(pack.precheck);
    const context = createFareEngineContext(graph, [
      placeholder,
      { ...pack, precheck },
      { ...pack, id: 'other-kanto' },
    ]);
    const quote = calculateFareQuote({ ...request, travelDate: '2030-01-01' }, context);
    expect(quote).toMatchObject({ status: 'ERROR', totalAmountYen: null, breakdown: [] });
    expect(quote.statusReason).toContain('other-kanto');
    expect(precheck).not.toHaveBeenCalled();
  });

  it('selects Kansai even with an unrelated Kanto pack installed', () => {
    const kansai = new TrackGraphIndex({
      ...dataset,
      stations: dataset.stations.slice(0, 2).map((station, index) => ({
        ...station,
        id: `sk:station:kansai:test-${index}`,
        operatorId: 'sk:operator:jp:jr-west',
      })),
      lines: [],
      segments: [],
      interchanges: [],
    });
    const kanto = createKantoJrRulePack({ trackGraph: graph, fareRuleGraph });
    const quote = calculateFareQuote(
      {
        ...request,
        originStationId: 'sk:station:kansai:test-0',
        destinationStationId: 'sk:station:kansai:test-1',
      },
      createFareEngineContext(kansai, [kanto, placeholder]),
    );
    expect(quote).toMatchObject({ status: 'UNSUPPORTED', totalAmountYen: null, breakdown: [] });
    expect(quote.statusReason).toContain('Phase 2');
  });

  it('runs a plain v1.0 pack without optional engine hooks', () => {
    const provider: TariffProvider = {
      id: 'test',
      operatorScope: 'jr-east',
      ruleVersion: 'test',
      validFrom: null,
      validTo: null,
      isSynthetic: true,
      disclaimer: 'Synthetic unit-test tariff.',
      lookupBaseFare: () => ({ status: 'OK', amountYen: 55, ruleId: 'test' }),
    };
    const pack: RegionalFareRulePack = {
      id: 'test',
      region: 'test',
      validFrom: null,
      validTo: null,
      rules: [],
      fareZoneTags: [],
      operatorScopes: ['jr-east'],
      ruleVersion: 'test',
      tariffProviders: [provider],
      appliesTo: () => true,
      evaluate: ({ actualPath }: { actualPath: ResolvedPath }) => ({
        status: 'OK',
        statusReason: 'Test fare',
        billedPath: actualPath,
        steps: [],
      }),
    };
    const context = createFareEngineContext(graph, [pack]);
    expect(calculateFareQuote(request, context)).toMatchObject({
      status: 'OK',
      totalAmountYen: 55,
    });
  });

  it('converts dishonest tariff results and provider exceptions into honest errors', () => {
    const pack = createKantoJrRulePack({ trackGraph: graph, fareRuleGraph });
    for (const lookup of [
      () => ({ status: 'OK' as const, amountYen: Number.NaN, ruleId: 'broken' }),
      () => {
        throw new Error('Unavailable provider');
      },
    ]) {
      const context = createFareEngineContext(graph, [
        {
          ...pack,
          tariffProviders: pack.tariffProviders.map((provider) => ({
            ...provider,
            lookupBaseFare: lookup,
          })),
        },
      ]);
      const quote = calculateFareQuote(request, context);
      assertHonestFareQuote(quote);
      expect(quote).toMatchObject({ status: 'ERROR', totalAmountYen: null, breakdown: [] });
    }
  });

  it('rejects an impossible date before station and pack lookup', () => {
    const quote = calculateFareQuote(
      {
        ...request,
        travelDate: '2026-02-29',
        originStationId: 'sk:station:kanto:absent',
      },
      createFareEngineContext(graph, []),
    );
    expect(quote).toMatchObject({ status: 'ERROR', totalAmountYen: null, breakdown: [] });
  });

  it('rejects explicit track IDs ending at a different station', () => {
    const wrong = graph.edgesFrom(request.originStationId)[0];
    if (!wrong) {
      throw new Error('Tokyo fixture needs track edges');
    }
    const pack = createKantoJrRulePack({ trackGraph: graph, fareRuleGraph });
    const quote = calculateFareQuote(
      { ...request, actualSegmentIds: [wrong.segment.id] },
      createFareEngineContext(graph, [pack]),
    );
    expect(quote.status).toBe('MISSING_DATA');
  });

  it.each([
    'limited_express_non_reserved',
    'limited_express_reserved',
    'green_car',
    'gran_class',
  ] as const)('labels the %s charge as synthetic', (surchargeType) => {
    const pack = createKantoJrRulePack({ trackGraph: graph, fareRuleGraph });
    const result = calculateFareQuote(
      {
        ...request,
        surchargeType,
        preferShinkansen: true,
        destinationStationId: 'sk:station:kanto:jr-east-omiya',
      },
      createFareEngineContext(graph, [pack]),
    );
    expect(result.status).toBe('OK');
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ productKind: 'surcharge', dataNature: 'synthetic' }),
    );
    expect(result.tariffDisclaimer).toContain('示例数据');
  });
});
