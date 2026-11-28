import {
  type FareQuoteRequest,
  type FareRulePreferencePlan,
  type FareRuleRejection,
  isFareRuleRejection,
  parseSkId,
  type RegionalFareRulePack,
  type ResolvedPath,
  type SkId,
} from '@senkiro/contracts';
import type { GraphStep, TrackGraphIndex, TrackPathSearchOptions } from '@senkiro/domain-core';

/** Translate the contract-owned plan into `domain-core` path-search options. */
export function toTrackSearchOptions(plan: FareRulePreferencePlan | null): TrackPathSearchOptions {
  const options: TrackPathSearchOptions = {};
  if (plan === null) {
    return options;
  }
  if (plan.allowShinkansen !== undefined) {
    options.allowShinkansen = plan.allowShinkansen;
  }
  if (plan.allowLocalLines !== undefined) {
    options.allowLocalLines = plan.allowLocalLines;
  }
  if (plan.requireFareZoneTag !== undefined) {
    options.requireFareZoneTag = plan.requireFareZoneTag;
  }
  if (plan.preferredLineIds?.length) {
    options.preferLineIds = new Set(plan.preferredLineIds);
  }
  if (plan.preferredLineWeightFactor !== undefined) {
    options.preferredLineWeightFactor = plan.preferredLineWeightFactor;
  }
  if (plan.avoidedLineIds?.length) {
    options.avoidLineIds = new Set(plan.avoidedLineIds);
  }
  return options;
}

export function resolveActualPath(
  request: FareQuoteRequest,
  graph: TrackGraphIndex,
  pack: RegionalFareRulePack,
): ResolvedPath | FareRuleRejection {
  const { originStationId, destinationStationId, actualSegmentIds } = request;
  const operatorFilter = (id: SkId<'operator'>) =>
    pack.operatorScopes.includes(parseSkId(id, 'operator').slug);
  if (actualSegmentIds?.length) {
    const path = graph.resolveExplicitSegments(originStationId, actualSegmentIds, {
      transferFilter: ({ from, to }) => {
        const a = graph.getStation(from);
        const b = graph.getStation(to);
        return (
          a !== undefined &&
          b !== undefined &&
          operatorFilter(a.operatorId) &&
          operatorFilter(b.operatorId)
        );
      },
    });
    if (path?.stationIds.at(-1) !== destinationStationId) {
      return {
        status: 'MISSING_DATA',
        reason: 'Explicit segments do not connect the requested stations.',
      };
    }
    if (!path.operatorsInvolved.every(operatorFilter)) {
      return {
        status: 'UNSUPPORTED',
        reason: 'Explicit segments go outside the rule pack operator scope.',
      };
    }
    return path;
  }

  const preference = request.preferShinkansen
    ? 'shinkansen'
    : (request.routePreference ?? 'shortest');
  const routing =
    pack.resolveRoutePreference?.({ ...request, routePreference: preference }) ?? null;
  if (isFareRuleRejection(routing)) {
    return routing;
  }
  const search = toTrackSearchOptions(routing);
  if (preference.startsWith('pack:') && !routing && !request.viaStationIds?.length) {
    return { status: 'UNSUPPORTED', reason: `Unknown route preference: ${preference}.` };
  }
  const waypoints = [
    ...(request.viaStationIds?.length ? request.viaStationIds : (routing?.viaStationIds ?? [])),
    destinationStationId,
  ];
  const steps: GraphStep[] = [];
  let from = originStationId;
  for (const to of waypoints) {
    const leg = graph.findShortestTrackPath(from, to, {
      allowShinkansen:
        preference === 'shinkansen' ||
        graph.isShinkansenOnlyStation(from) ||
        graph.isShinkansenOnlyStation(to),
      ...search,
      operatorFilter,
    });
    if (leg === null) {
      return { status: 'MISSING_DATA', reason: `No track path from ${from} to ${to}.` };
    }
    steps.push(...leg);
    from = to;
  }
  const path = graph.resolveSteps(steps, originStationId);
  if (path.legs.length === 0) {
    return { status: 'MISSING_DATA', reason: 'The route contains no track segments.' };
  }
  return path;
}
