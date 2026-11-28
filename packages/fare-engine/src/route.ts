import { type FareQuoteRequest, parseSkId, type ResolvedPath, type SkId } from '@senkiro/contracts';
import type { GraphStep, TrackGraphIndex } from '@senkiro/domain-core';
import type { FareEngineRulePack, FareRejection } from './pack.ts';

export function resolveActualPath(
  request: FareQuoteRequest,
  graph: TrackGraphIndex,
  pack: FareEngineRulePack,
): ResolvedPath | FareRejection {
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
  const routing = pack.resolveRoutePreference?.({ ...request, routePreference: preference });
  if (routing && 'status' in routing) {
    return routing;
  }
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
      ...routing?.search,
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
