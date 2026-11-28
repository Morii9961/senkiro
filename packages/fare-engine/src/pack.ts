/**
 * The optional rule-pack hooks now live in `@senkiro/contracts` (promoted from P0-S1).
 * This module only re-exports them under the names the engine has used since P0-S1, so
 * existing imports keep compiling; there is no second definition.
 */
import type {
  FareBillingContext,
  FarePrecheckContext,
  FarePricingUnit,
  FareRulePreferencePlan,
  FareRuleRejection,
  FareValidityResult,
  PricedSurchargeQuote,
  RegionalFareRulePack,
  TariffProvider,
} from '@senkiro/contracts';

export type { FareBillingContext, FarePrecheckContext, FarePricingUnit };

/** @deprecated Use `FareRuleRejection` from `@senkiro/contracts`. */
export type FareRejection = FareRuleRejection;
/** @deprecated Use `FareRulePreferencePlan` from `@senkiro/contracts`. */
export type FareRoutingOptions = FareRulePreferencePlan;
/** @deprecated Use `FareValidityResult` from `@senkiro/contracts`. */
export type FareValidity = FareValidityResult;
/** @deprecated Use `PricedSurchargeQuote` from `@senkiro/contracts`. */
export type FareSurcharge = PricedSurchargeQuote;
/** @deprecated `TariffProvider.sourceIds` is part of the contract. */
export type FareEngineTariffProvider = TariffProvider;
/** @deprecated Every hook is an optional member of `RegionalFareRulePack`. */
export type FareEngineRulePack = RegionalFareRulePack;
