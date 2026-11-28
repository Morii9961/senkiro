import type {
  FareQuoteRequest,
  FareRulePackOutcome,
  ResolvedPath,
  SkId,
  TariffProvider,
} from '@senkiro/contracts';
import type { FareRuleGraph, TrackGraphIndex } from '@senkiro/domain-core';
import { isWithinDates } from '../../engine.ts';
import type {
  FareBillingContext,
  FareEngineRulePack,
  FarePricingUnit,
  FareRoutingOptions,
} from '../../pack.ts';
import {
  applyShinkansenEquivalence,
  TOHOKU_SHINKANSEN,
  TOKAIDO_SHINKANSEN,
} from './equivalence.ts';
import {
  CENTRAL,
  corridors,
  EAST,
  explain,
  isRevised,
  line,
  rules,
  SLICE,
  SUBURBAN,
  station,
  VERSIONS,
} from './rules.ts';
import { createSyntheticKantoTariffs, lookupSyntheticSurcharge } from './tariff.ts';

export interface KantoJrRulePackOptions {
  trackGraph: TrackGraphIndex;
  fareRuleGraph: FareRuleGraph;
  /** Omit for labelled Lab A demo fares. Pass [] for a pack without tariff data. */
  tariffProviders?: readonly TariffProvider[];
}

const jrOnly = (id: SkId<'operator'>) => id === EAST || id === CENTRAL;
const conventional = {
  allowShinkansen: false,
  allowLocalLines: false,
  operatorFilter: jrOnly,
  requireFareZoneTag: SLICE,
};

const detours: Partial<Record<`pack:${string}`, FareRoutingOptions>> = {
  'pack:saikyo_bypass': {
    viaStationIds: [station('jr-east-toda-koen')],
    search: { preferLineIds: new Set([line('jr-east-tohoku-saikyo')]) },
  },
  'pack:yokosuka_bypass': {
    viaStationIds: [station('jr-east-nishi-oi')],
    search: { preferLineIds: new Set([line('jr-east-tokaido-hinkaku')]) },
  },
  'pack:oku_bypass': {
    viaStationIds: [station('jr-east-oku')],
    search: { preferLineIds: new Set([line('jr-east-tohoku-oku')]) },
  },
  'pack:yamanote_loop_detour': {
    viaStationIds: [station('jr-east-shibuya'), station('jr-east-ikebukuro')],
    search: {
      preferLineIds: new Set([line('jr-east-yamanote')]),
      avoidLineIds: new Set([line('jr-east-chuo')]),
    },
  },
};

function resolveRoutePreference(request: FareQuoteRequest): FareRoutingOptions | null {
  const { originStationId, destinationStationId, routePreference } = request;
  if (routePreference === 'shinkansen') {
    return { search: { preferLineIds: new Set([TOKAIDO_SHINKANSEN, TOHOKU_SHINKANSEN]) } };
  }
  const detour =
    routePreference?.startsWith('pack:') && detours[routePreference as `pack:${string}`];
  if (!detour) {
    return null;
  }
  return {
    ...detour,
    viaStationIds:
      detour.viaStationIds?.filter((id) => id !== originStationId && id !== destinationStationId) ??
      [],
  };
}

function suburbanOnly(path: ResolvedPath): boolean {
  return (
    !path.usesShinkansen &&
    path.commonFareZoneTags.includes(SUBURBAN) &&
    path.operatorsInvolved.every((id) => id === EAST)
  );
}

function pricingUnits({ request, billedPath }: FareBillingContext): readonly FarePricingUnit[] {
  if (!isRevised(request.travelDate) && billedPath.operatorsInvolved.length > 1) {
    return [
      {
        operatorScope: 'jr-east',
        operatorId: null,
        operatingKm: billedPath.totalOperatingKm ?? 0,
        fareZoneTags: billedPath.commonFareZoneTags,
      },
    ];
  }
  const byOperator = new Map<SkId<'operator'>, number>();
  for (const leg of billedPath.legs) {
    byOperator.set(leg.operatorId, (byOperator.get(leg.operatorId) ?? 0) + (leg.operatingKm ?? 0));
  }
  return [...byOperator].map(([operatorId, km]) => ({
    operatorScope: operatorId === EAST ? 'jr-east' : 'jr-central',
    operatorId,
    operatingKm: Math.round(km * 10) / 10,
    fareZoneTags: billedPath.commonFareZoneTags,
  }));
}

export function createKantoJrRulePack({
  trackGraph,
  fareRuleGraph,
  tariffProviders,
}: KantoJrRulePackOptions): FareEngineRulePack {
  return {
    id: 'kanto-jr',
    region: 'kanto',
    operatorScopes: ['jr-east', 'jr-central'],
    ruleVersion: VERSIONS[1].ruleVersion,
    validFrom: VERSIONS[0].validFrom,
    validTo: VERSIONS[1].validTo,
    rules,
    fareZoneTags: [SUBURBAN, SLICE],
    tariffProviders: tariffProviders ?? createSyntheticKantoTariffs(),
    resolveRuleVersion: (date) =>
      VERSIONS.find((version) => isWithinDates(date, version))?.ruleVersion ?? null,
    precheck({ request, origin, destination }) {
      if (request.ticketType === 'ic_card') {
        const step = explain('JR-TICKET-IC-UNSUPPORTED', 'REJECTED');
        return { status: 'UNSUPPORTED', reason: step.reason, steps: [step] };
      }
      const stations = [
        origin,
        destination,
        ...(request.viaStationIds ?? []).map((id) => trackGraph.getStation(id)),
      ];
      const explicitSegments =
        request.actualSegmentIds?.map((id) => trackGraph.getSegment(id)) ?? [];
      if (
        [...stations, ...explicitSegments].some(
          (entity) => entity && !entity.fareZoneTags.includes(SLICE),
        )
      ) {
        return {
          status: 'UNSUPPORTED',
          reason:
            'A requested station or track segment lies outside the verified Kanto JR fare slice.',
        };
      }
      return null;
    },
    resolveRoutePreference,
    appliesTo: ({ actualPath }) => actualPath.operatorsInvolved.every(jrOnly),
    evaluate({ request, actualPath }): FareRulePackOutcome {
      const steps: FareRulePackOutcome['steps'] = [];
      const reject = (
        status: 'UNSUPPORTED' | 'NOT_APPLICABLE' | 'MISSING_DATA',
        statusReason: string,
      ): FareRulePackOutcome => ({ status, statusReason, billedPath: null, steps });
      if (!actualPath.commonFareZoneTags.includes(SLICE)) {
        return reject('UNSUPPORTED', 'The resolved route leaves the verified Kanto JR fare slice.');
      }
      if (actualPath.usesLocalLine) {
        const step = explain('JR-LOCAL-LINE-UNSUPPORTED', 'REJECTED');
        steps.push(step);
        return reject('UNSUPPORTED', step.reason);
      }
      if (
        actualPath.hasRepeatedStationOrSegment ||
        new Set(actualPath.stationIds).size !== actualPath.stationIds.length
      ) {
        const step = explain('JR-ART157-SUBURBAN-NO-REPEAT', 'REJECTED');
        steps.push(step);
        return reject('NOT_APPLICABLE', step.reason);
      }

      const revised = isRevised(request.travelDate);
      const mapped = applyShinkansenEquivalence(trackGraph, actualPath, revised, steps);
      if ('status' in mapped) {
        return { status: mapped.status, statusReason: mapped.reason, billedPath: null, steps };
      }
      let billedPath = mapped;

      if (!actualPath.usesShinkansen) {
        for (const corridor of corridors) {
          const a = billedPath.stationIds.indexOf(corridor.boundaryA);
          const b = billedPath.stationIds.indexOf(corridor.boundaryB);
          if (a === -1 || b === -1) {
            continue;
          }
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const interior = new Set(billedPath.stationIds.slice(lo, hi + 1));
          const detour = billedPath.legs.some(
            (leg) =>
              interior.has(leg.fromStationId) &&
              interior.has(leg.toStationId) &&
              trackGraph.getSegment(leg.segmentId)?.railLineIds.includes(corridor.avoidLineId),
          );
          if (!detour) {
            continue;
          }
          const ruleId = `JR-ART69-${corridor.number}`;
          if (lo === 0 || hi === billedPath.stationIds.length - 1) {
            steps.push(
              explain(
                ruleId,
                'NOT_APPLICABLE',
                'The journey does not extend beyond both corridor boundaries.',
              ),
            );
            continue;
          }
          const replacement = fareRuleGraph.replaceCorridorOnPath(billedPath, {
            ...corridor,
            search: conventional,
          });
          if (!replacement) {
            return reject('MISSING_DATA', 'The prescribed billing corridor is incomplete.');
          }
          billedPath = replacement;
          steps.push(explain(ruleId, 'APPLIED'));
        }
      }

      if (suburbanOnly(actualPath)) {
        const shortest = fareRuleGraph.findShortestBillingPath(
          request.originStationId,
          request.destinationStationId,
          {
            ...conventional,
            requireFareZoneTag: SUBURBAN,
            operatorFilter: (id) => id === EAST,
          },
        );
        if (!shortest?.commonFareZoneTags.includes(SLICE)) {
          return reject(
            'MISSING_DATA',
            'The shortest verified Tokyo suburban billing corridor is unavailable.',
          );
        }
        billedPath = shortest;
        steps.push(explain('JR-ART157-SUBURBAN', 'APPLIED'));
      } else {
        steps.push(
          explain(
            'JR-ART157-SUBURBAN',
            'NOT_APPLICABLE',
            'The actual journey does not stay on Tokyo suburban conventional tracks.',
          ),
        );
      }
      if (billedPath.operatorsInvolved.length > 1) {
        steps.push(
          explain(revised ? 'JR-CROSS-COMPANY-V2026' : 'JR-CROSS-COMPANY-V2025', 'APPLIED'),
        );
      }
      return { status: 'OK', statusReason: 'Kanto JR billing route resolved.', billedPath, steps };
    },
    computeValidityAndStopover({ request, actualPath, billedPath }) {
      const km = billedPath.totalOperatingKm;
      if (km === null) {
        return { validityDays: null, stopoverAllowed: null };
      }
      const suburban = suburbanOnly(actualPath);
      const stopoverAllowed = !suburban && km > 100;
      const validityDays = stopoverAllowed ? Math.ceil(km / 200) + 1 : 1;
      if (request.requireStopover && !stopoverAllowed) {
        const step = explain(
          suburban ? 'JR-ART156-SUBURBAN-NO-STOPOVER' : 'JR-ART156-UNDER-100KM',
          'REJECTED',
        );
        return {
          validityDays,
          stopoverAllowed,
          rejection: { status: 'NOT_APPLICABLE', reason: step.reason, steps: [step] },
        };
      }
      return { validityDays, stopoverAllowed };
    },
    pricingUnits,
    lookupSurcharge: lookupSyntheticSurcharge,
  };
}
