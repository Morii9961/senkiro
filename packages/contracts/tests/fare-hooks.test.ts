import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  FARE_QUOTE_STATUSES,
  type FareBillingContext,
  type FarePrecheckContext,
  type FarePricingUnit,
  type FareQuoteRequest,
  type FareRulePreferencePlan,
  type FareRuleRejection,
  type FareValidityResult,
  isFareRuleRejection,
  type PricedSurchargeQuote,
  type RegionalFareRulePack,
  type ResolvedPath,
  type StationHubDataset,
  type SurchargeQuoteResult,
  type TariffProvider,
} from '../src/index.ts';
import { breakdownItem } from './fixtures.ts';

const request: FareQuoteRequest = {
  originStationId: 'sk:station:kanto:jr-east-tokyo',
  destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
  travelDate: '2026-11-28',
  ticketType: 'ordinary_paper',
};

const path: ResolvedPath = {
  stationIds: [],
  segmentIds: [],
  legs: [],
  totalOperatingKm: 10.3,
  operatorsInvolved: ['sk:operator:jp:jr-east'],
  usesShinkansen: false,
  usesLocalLine: false,
  commonFareZoneTags: [],
  hasRepeatedStationOrSegment: false,
};

const tariff: TariffProvider = {
  id: 'test-tariff',
  operatorScope: 'jr-east',
  ruleVersion: 'v1',
  validFrom: null,
  validTo: null,
  isSynthetic: true,
  disclaimer: 'Synthetic test tariff.',
  lookupBaseFare: () => ({ status: 'MISSING_DATA', amountYen: null, reason: 'test' }),
};

/** A pack written against the original v1.0 surface: no optional hooks at all. */
const v10Pack: RegionalFareRulePack = {
  id: 'v10',
  region: 'test',
  operatorScopes: ['jr-east'],
  ruleVersion: 'v1',
  validFrom: null,
  validTo: null,
  rules: [],
  fareZoneTags: [],
  tariffProviders: [tariff],
  appliesTo: () => true,
  evaluate: () => ({ status: 'OK', statusReason: 'ok', billedPath: null, steps: [] }),
};

const plan: FareRulePreferencePlan = {
  viaStationIds: ['sk:station:kanto:jr-east-ikebukuro'],
  preferredLineIds: ['sk:line:kanto:jr-east-yamanote'],
  avoidedLineIds: ['sk:line:kanto:jr-east-chuo'],
  allowShinkansen: false,
};

const fullPack: RegionalFareRulePack = {
  ...v10Pack,
  id: 'full',
  tariffProviders: [{ ...tariff, sourceIds: ['sk:source:test:tariff'] }],
  precheck: ({ request: r }) =>
    r.ticketType === 'ic_card' ? { status: 'UNSUPPORTED', reason: 'IC not modelled' } : null,
  resolveRoutePreference: (r) =>
    r.routePreference === 'pack:loop'
      ? plan
      : r.routePreference === 'pack:bad'
        ? { status: 'UNSUPPORTED', reason: 'unknown preference' }
        : null,
  resolveRuleVersion: (date) => (date >= '2026-03-14' ? 'v2' : 'v1'),
  computeValidityAndStopover: () => ({ validityDays: 1, stopoverAllowed: false }),
  pricingUnits: ({ billedPath }) => [
    {
      operatorScope: 'jr-east',
      operatorId: null,
      operatingKm: billedPath.totalOperatingKm ?? 0,
      fareZoneTags: [],
    },
  ],
  lookupSurcharge: () => ({
    status: 'OK',
    item: { ...breakdownItem(760), productKind: 'surcharge' },
    disclaimer: 'Synthetic surcharge.',
    sourceIds: ['sk:source:test:surcharge'],
  }),
};

describe('promoted fare rule-pack hooks (P0-S1 → contracts)', () => {
  it('keeps every hook optional so a v1.0 pack registers unchanged', () => {
    expect(v10Pack.precheck).toBeUndefined();
    expect(v10Pack.resolveRoutePreference).toBeUndefined();
    expect(v10Pack.resolveRuleVersion).toBeUndefined();
    expect(v10Pack.computeValidityAndStopover).toBeUndefined();
    expect(v10Pack.pricingUnits).toBeUndefined();
    expect(v10Pack.lookupSurcharge).toBeUndefined();
    expect(v10Pack.tariffProviders[0]?.sourceIds).toBeUndefined();
  });

  it('types each hook with contract-owned inputs and results', () => {
    expectTypeOf<NonNullable<RegionalFareRulePack['precheck']>>()
      .parameter(0)
      .toEqualTypeOf<FarePrecheckContext>();
    expectTypeOf<
      ReturnType<NonNullable<RegionalFareRulePack['resolveRoutePreference']>>
    >().toEqualTypeOf<FareRulePreferencePlan | FareRuleRejection | null>();
    expectTypeOf<
      ReturnType<NonNullable<RegionalFareRulePack['computeValidityAndStopover']>>
    >().toEqualTypeOf<FareValidityResult>();
    expectTypeOf<NonNullable<RegionalFareRulePack['pricingUnits']>>()
      .parameter(0)
      .toEqualTypeOf<FareBillingContext>();
    expectTypeOf<ReturnType<NonNullable<RegionalFareRulePack['pricingUnits']>>>().toEqualTypeOf<
      readonly FarePricingUnit[]
    >();
    expectTypeOf<
      ReturnType<NonNullable<RegionalFareRulePack['lookupSurcharge']>>
    >().toEqualTypeOf<SurchargeQuoteResult>();
    expectTypeOf<TariffProvider['sourceIds']>().toEqualTypeOf<readonly string[] | undefined>();
  });

  it('uses plain ID arrays in the route plan, never engine search types', () => {
    expectTypeOf<FareRulePreferencePlan['preferredLineIds']>().toEqualTypeOf<
      readonly `sk:line:${string}:${string}`[] | undefined
    >();
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it('runs a pack that implements every hook', () => {
    const billing: FareBillingContext = { request, actualPath: path, billedPath: path };
    expect(fullPack.precheck?.({ request, origin: {} as never, destination: {} as never })).toBe(
      null,
    );
    expect(fullPack.resolveRoutePreference?.({ ...request, routePreference: 'pack:loop' })).toBe(
      plan,
    );
    expect(fullPack.resolveRuleVersion?.('2026-11-28')).toBe('v2');
    expect(fullPack.computeValidityAndStopover?.(billing)).toEqual({
      validityDays: 1,
      stopoverAllowed: false,
    });
    expect(fullPack.pricingUnits?.(billing)).toEqual([
      { operatorScope: 'jr-east', operatorId: null, operatingKm: 10.3, fareZoneTags: [] },
    ]);
    const surcharge = fullPack.lookupSurcharge?.(billing);
    expect(isFareRuleRejection(surcharge)).toBe(false);
    expect((surcharge as PricedSurchargeQuote).item.amountYen).toBe(760);
  });
});

describe('isFareRuleRejection', () => {
  it('accepts every unpriced status with a reason', () => {
    for (const status of FARE_QUOTE_STATUSES.filter((s) => s !== 'OK')) {
      expect(isFareRuleRejection({ status, reason: 'x' }), status).toBe(true);
    }
  });

  it('rejects priced results, plans, paths and malformed values', () => {
    const priced = fullPack.lookupSurcharge?.({ request, actualPath: path, billedPath: path });
    expect(isFareRuleRejection(priced)).toBe(false);
    expect(isFareRuleRejection(plan)).toBe(false);
    expect(isFareRuleRejection(path)).toBe(false);
    expect(isFareRuleRejection(null)).toBe(false);
    expect(isFareRuleRejection({ status: 'NOPE', reason: 'x' })).toBe(false);
    expect(isFareRuleRejection({ status: 'MISSING_DATA' })).toBe(false);
  });

  it('narrows a hook result to its refusal branch', () => {
    const result = fullPack.resolveRoutePreference?.({ ...request, routePreference: 'pack:bad' });
    if (!isFareRuleRejection(result)) {
      throw new Error('expected a rejection');
    }
    expectTypeOf(result).toEqualTypeOf<FareRuleRejection>();
    expect(result.status).toBe('UNSUPPORTED');
  });
});

describe('StationHubDataset.planNorth', () => {
  it('is an optional PlatformSide', () => {
    expectTypeOf<StationHubDataset['planNorth']>().toEqualTypeOf<
      'z-' | 'z+' | 'x-' | 'x+' | undefined
    >();
  });
});
