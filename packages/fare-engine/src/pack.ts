import type {
  FareBreakdownItem,
  FareExplanationStep,
  FareQuoteRequest,
  FareRulePackContext,
  RegionalFareRulePack,
  ResolvedPath,
  SkId,
  Station,
  TariffProvider,
  UnpricedFareQuoteStatus,
} from '@senkiro/contracts';
import type { TrackPathSearchOptions } from '@senkiro/domain-core';

export interface FareRejection {
  status: UnpricedFareQuoteStatus;
  reason: string;
  steps?: FareExplanationStep[];
}

export interface FarePrecheckContext {
  request: FareQuoteRequest;
  origin: Station;
  destination: Station;
}

export interface FareRoutingOptions {
  viaStationIds?: readonly SkId<'station'>[];
  search?: TrackPathSearchOptions;
}

export interface FareBillingContext extends FareRulePackContext {
  billedPath: ResolvedPath;
}

export interface FarePricingUnit {
  operatorScope: string;
  operatorId: SkId<'operator'> | null;
  operatingKm: number;
  fareZoneTags: readonly string[];
}

export interface FareValidity {
  validityDays: number | null;
  stopoverAllowed: boolean | null;
  rejection?: FareRejection;
}

export interface FareSurcharge {
  status: 'OK';
  item: FareBreakdownItem;
  disclaimer: string | null;
  steps?: FareExplanationStep[];
  sourceIds?: readonly string[];
}

export interface FareEngineTariffProvider extends TariffProvider {
  readonly sourceIds?: readonly string[];
}

/** Optional capabilities. A v1.0 RegionalFareRulePack can be registered as-is. */
export interface FareEngineRulePack extends RegionalFareRulePack {
  readonly tariffProviders: readonly FareEngineTariffProvider[];
  precheck?(context: FarePrecheckContext): FareRejection | null;
  resolveRoutePreference?(request: FareQuoteRequest): FareRoutingOptions | FareRejection | null;
  resolveRuleVersion?(travelDate: string): string | null;
  computeValidityAndStopover?(context: FareBillingContext): FareValidity;
  pricingUnits?(context: FareBillingContext): readonly FarePricingUnit[];
  lookupSurcharge?(context: FareBillingContext): FareSurcharge | FareRejection;
}
