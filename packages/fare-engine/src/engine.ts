import {
  assertHonestFareQuote,
  createUnpricedFareQuote,
  type FareBreakdownItem,
  type FareExplanationStep,
  type FarePricingUnit,
  type FareQuote,
  type FareQuoteBaseFields,
  type FareQuoteRequest,
  isFareRuleRejection,
  parseSkId,
  type RegionalFareRulePack,
  type ResolvedPath,
  type SkId,
  type UnpricedFareQuoteStatus,
} from '@senkiro/contracts';
import type { TrackGraphIndex } from '@senkiro/domain-core';
import { resolveActualPath } from './route.ts';

export interface FareEngineContext {
  trackGraph: TrackGraphIndex;
  rulePacks: readonly RegionalFareRulePack[];
}

export function createFareEngineContext(
  trackGraph: TrackGraphIndex,
  rulePacks: readonly RegionalFareRulePack[],
): FareEngineContext {
  return { trackGraph, rulePacks };
}

export function isWithinDates(
  date: string,
  { validFrom, validTo }: { validFrom: string | null; validTo: string | null },
): boolean {
  return (validFrom === null || date >= validFrom) && (validTo === null || date <= validTo);
}

function quoteId(request: FareQuoteRequest): SkId<'quote'> {
  const key = JSON.stringify([
    request.originStationId,
    request.destinationStationId,
    request.travelDate,
    request.ticketType,
    request.viaStationIds,
    request.actualSegmentIds,
    request.routePreference,
    request.preferShinkansen,
    request.requireStopover,
    request.surchargeType,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }
  return `sk:quote:fare:${(hash >>> 0).toString(16)}`;
}

function defaultPricingUnits(path: ResolvedPath): FarePricingUnit[] {
  const kmByOperator = new Map<SkId<'operator'>, number>();
  for (const leg of path.legs) {
    kmByOperator.set(
      leg.operatorId,
      (kmByOperator.get(leg.operatorId) ?? 0) + (leg.operatingKm ?? 0),
    );
  }
  return [...kmByOperator].map(([operatorId, km]) => ({
    operatorId,
    operatorScope: parseSkId(operatorId, 'operator').slug,
    operatingKm: Math.round(km * 10) / 10,
    fareZoneTags: path.commonFareZoneTags,
  }));
}

export function calculateFareQuote(
  request: FareQuoteRequest,
  { trackGraph, rulePacks }: FareEngineContext,
): FareQuote {
  const explanation: FareExplanationStep[] = [];
  const fields: FareQuoteBaseFields = {
    id: quoteId(request),
    request,
    isSyntheticTariff: false,
    tariffDisclaimer: null,
    ruleVersionUsed: null,
    actualPath: null,
    billedPath: null,
    validityDays: null,
    stopoverAllowed: null,
    provenance: { sourceIds: [], dataNature: 'unknown', lastVerifiedAt: null },
    explanation,
  };
  const reject = (
    status: UnpricedFareQuoteStatus,
    reason: string,
    steps: FareExplanationStep[] = [],
  ): FareQuote => {
    explanation.push(...steps);
    const quote = createUnpricedFareQuote(
      fields,
      status,
      reason.trim() || 'Fare calculation failed.',
    );
    assertHonestFareQuote(quote);
    return quote;
  };

  const { travelDate } = request;
  const day = new Date(`${travelDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(travelDate) ||
    !Number.isFinite(day.valueOf()) ||
    day.toISOString().slice(0, 10) !== travelDate
  ) {
    return reject('ERROR', 'Travel date must be a valid YYYY-MM-DD calendar date.');
  }
  const origin = trackGraph.getStation(request.originStationId);
  const destination = trackGraph.getStation(request.destinationStationId);
  if (!origin || !destination) {
    return reject('MISSING_DATA', 'Origin or destination station is missing from the track graph.');
  }
  if (origin.id === destination.id) {
    return reject('NOT_APPLICABLE', 'Origin and destination are the same station.');
  }

  const scopes = [origin, destination].map(
    ({ operatorId }) => parseSkId(operatorId, 'operator').slug,
  );
  const candidates = rulePacks.filter((pack) =>
    scopes.every((scope) => pack.operatorScopes.includes(scope)),
  );
  const [pack] = candidates;
  if (!pack) {
    return reject('NOT_APPLICABLE', 'No fare rule pack covers both endpoint operators.');
  }
  if (candidates.length > 1) {
    return reject('ERROR', `Conflicting rule packs: ${candidates.map(({ id }) => id).join(', ')}.`);
  }

  try {
    if (!isWithinDates(travelDate, pack)) {
      return reject('STALE_RULE', 'Travel date is outside the rule pack validity window.');
    }
    fields.ruleVersionUsed = pack.resolveRuleVersion
      ? pack.resolveRuleVersion(travelDate)
      : pack.ruleVersion;
    if (fields.ruleVersionUsed === null) {
      return reject('STALE_RULE', 'No rule version is in force on the travel date.');
    }

    const precheck = pack.precheck?.({ request, origin, destination });
    if (precheck) {
      return reject(precheck.status, precheck.reason, precheck.steps);
    }

    const actualPath = resolveActualPath(request, trackGraph, pack);
    if (isFareRuleRejection(actualPath)) {
      return reject(actualPath.status, actualPath.reason, actualPath.steps);
    }
    fields.actualPath = actualPath;
    const context = { request, actualPath };
    if (!pack.appliesTo(context)) {
      return reject('NOT_APPLICABLE', 'The selected rule pack does not apply to this route.');
    }

    const outcome = pack.evaluate(context);
    explanation.push(...outcome.steps);
    for (const step of explanation) {
      const rule = pack.rules.find(({ ruleId }) => ruleId === step.ruleId);
      if (rule) {
        fields.provenance.sourceIds.push(...rule.provenance.sourceIds);
      }
    }
    const billedPath = outcome.billedPath;
    fields.billedPath = billedPath;
    if (billedPath) {
      fields.pathsDiffer =
        actualPath.segmentIds.length !== billedPath.segmentIds.length ||
        actualPath.segmentIds.some((id, index) => id !== billedPath.segmentIds[index]);
      fields.pathDiffSummary = fields.pathsDiffer
        ? `Actual path: ${actualPath.totalOperatingKm ?? 'unknown'} km. Billing path: ${billedPath.totalOperatingKm ?? 'unknown'} km.`
        : null;
    }
    if (outcome.status !== 'OK') {
      return reject(outcome.status, outcome.statusReason);
    }
    if (
      billedPath?.totalOperatingKm == null ||
      billedPath.legs.some(({ operatingKm }) => operatingKm === null)
    ) {
      return reject('MISSING_DATA', 'Billing path operating distance is unavailable.');
    }
    const billing = { ...context, billedPath };
    const validity = pack.computeValidityAndStopover?.(billing);
    fields.validityDays = validity?.validityDays ?? null;
    fields.stopoverAllowed = validity?.stopoverAllowed ?? null;
    if (validity?.rejection) {
      return reject(validity.rejection.status, validity.rejection.reason, validity.rejection.steps);
    }
    if (request.requireStopover && fields.stopoverAllowed !== true) {
      return reject(
        fields.stopoverAllowed === false ? 'NOT_APPLICABLE' : 'UNSUPPORTED',
        'Stopover permission is unavailable for this route.',
      );
    }

    const breakdown: FareBreakdownItem[] = [];
    const disclaimers = new Set<string>();
    const units = pack.pricingUnits?.(billing) ?? defaultPricingUnits(billedPath);
    for (const unit of units) {
      const matching = pack.tariffProviders.filter(
        (provider) => provider.operatorScope === unit.operatorScope,
      );
      const active = matching.filter(
        (provider) =>
          provider.ruleVersion === fields.ruleVersionUsed && isWithinDates(travelDate, provider),
      );
      const [provider] = active;
      if (!provider) {
        return reject(
          matching.length ? 'STALE_RULE' : 'MISSING_DATA',
          `No active tariff for ${unit.operatorScope}.`,
        );
      }
      if (active.length > 1) {
        return reject('ERROR', `Multiple active tariffs for ${unit.operatorScope}.`);
      }
      if (!Number.isFinite(unit.operatingKm) || unit.operatingKm <= 0) {
        return reject('MISSING_DATA', 'Pricing unit has no positive operating distance.');
      }
      const fare = provider.lookupBaseFare({
        operatingKm: unit.operatingKm,
        ticketType: request.ticketType,
        travelDate,
        fareZoneTags: unit.fareZoneTags,
      });
      if (fare.status !== 'OK') {
        return reject(fare.status, fare.reason);
      }
      if (provider.disclaimer?.trim()) {
        disclaimers.add(provider.disclaimer);
      }
      if (provider.isSynthetic && !provider.disclaimer?.trim()) {
        return reject('ERROR', `Synthetic tariff ${provider.id} has no disclaimer.`);
      }
      breakdown.push({
        label: 'Base fare',
        productKind: 'base_fare',
        operatorId: unit.operatorId,
        distanceKm: unit.operatingKm,
        amountYen: fare.amountYen,
        dataNature: provider.isSynthetic ? 'synthetic' : 'derived',
        notes: fare.ruleId,
      });
      fields.provenance.sourceIds.push(...(provider.sourceIds ?? []));
      const tariffRule = pack.rules.find(({ ruleId }) => ruleId === fare.ruleId);
      if (tariffRule) {
        fields.provenance.sourceIds.push(...tariffRule.provenance.sourceIds);
        explanation.push({
          ruleId: tariffRule.ruleId,
          articleRef: tariffRule.articleRef,
          officialUrl: tariffRule.officialUrl,
          applied: true,
          status: 'APPLIED',
          reason: tariffRule.summary,
        });
      }
    }
    if (!breakdown.length) {
      return reject('MISSING_DATA', 'No base fare pricing units were provided.');
    }

    if (request.surchargeType && request.surchargeType !== 'none') {
      const surcharge = pack.lookupSurcharge?.(billing);
      if (!surcharge) {
        return reject('UNSUPPORTED', 'No surcharge provider for the requested product.');
      }
      if (surcharge.status !== 'OK') {
        return reject(surcharge.status, surcharge.reason, surcharge.steps);
      }
      if (surcharge.item.dataNature === 'synthetic' && !surcharge.disclaimer?.trim()) {
        return reject('ERROR', 'Synthetic surcharge has no disclaimer.');
      }
      if (surcharge.disclaimer?.trim()) {
        disclaimers.add(surcharge.disclaimer);
      }
      breakdown.push(surcharge.item);
      explanation.push(...(surcharge.steps ?? []));
      fields.provenance.sourceIds.push(...(surcharge.sourceIds ?? []));
    }

    const isSyntheticTariff = breakdown.some(({ dataNature }) => dataNature === 'synthetic');
    const sourceIds = new Set(fields.provenance.sourceIds);
    for (const id of [...actualPath.segmentIds, ...billedPath.segmentIds]) {
      for (const source of trackGraph.getSegment(id)?.provenance.sourceIds ?? []) {
        sourceIds.add(source);
      }
    }
    const quote: FareQuote = {
      ...fields,
      status: 'OK',
      statusReason: outcome.statusReason,
      totalAmountYen: breakdown.reduce((sum, item) => sum + (item.amountYen ?? 0), 0),
      breakdown,
      pathsDiffer: fields.pathsDiffer ?? false,
      pathDiffSummary: fields.pathDiffSummary ?? null,
      explanation,
      isSyntheticTariff,
      tariffDisclaimer: [...disclaimers].join(' / ') || null,
      candidateRoutes: fields.pathsDiffer
        ? [
            { id: 'actual', label: 'Actual path', path: actualPath, isBilledPath: false },
            { id: 'billed', label: 'Billing path', path: billedPath, isBilledPath: true },
          ]
        : [
            {
              id: 'actual',
              label: 'Actual and billing path',
              path: actualPath,
              isBilledPath: true,
            },
          ],
      provenance: {
        sourceIds: [...sourceIds],
        dataNature: isSyntheticTariff ? 'synthetic' : 'derived',
        lastVerifiedAt: null,
      },
    };
    assertHonestFareQuote(quote);
    return quote;
  } catch (error) {
    return reject('ERROR', error instanceof Error ? error.message : 'Fare rule pack failed.');
  }
}
