import type {
  FareExplanationStep,
  FareRuleRejection,
  PathLeg,
  ResolvedPath,
} from '@senkiro/contracts';
import type { GraphStep, TrackGraphIndex } from '@senkiro/domain-core';
import { explain, line, SLICE, station } from './rules.ts';

export const TOHOKU_SHINKANSEN = line('jr-east-tohoku-shinkansen');
export const TOKAIDO_SHINKANSEN = line('jr-central-tokaido-shinkansen');
const SHIN_YOKOHAMA = station('jr-central-shin-yokohama');
const ATAMI_AND_WEST_IN_SLICE = new Set([
  station('jr-central-atami'),
  station('jr-central-mishima'),
]);

function isSeparateAfterRevision(leg: PathLeg): boolean {
  return (
    leg.railLineId === TOKAIDO_SHINKANSEN &&
    !(
      ATAMI_AND_WEST_IN_SLICE.has(leg.fromStationId) && ATAMI_AND_WEST_IN_SLICE.has(leg.toStationId)
    )
  );
}

export function applyShinkansenEquivalence(
  graph: TrackGraphIndex,
  path: ResolvedPath,
  revised: boolean,
  explanation: FareExplanationStep[],
): ResolvedPath | FareRuleRejection {
  const ruleId = revised ? 'JR-ART16-2-V2026' : 'JR-ART16-2-V2025';
  const firstStation = path.stationIds[0];
  if (!firstStation || !path.usesShinkansen) {
    explanation.push(
      explain(ruleId, 'NOT_APPLICABLE', 'The actual route uses conventional tracks only.'),
    );
    return path;
  }

  // Keep the actual conventional legs and in-gate transfers. Replace each continuous
  // Shinkansen run separately so that a regular via station is never erased by Art. 16-2.
  const steps: GraphStep[] = [];
  let stationIndex = 0;
  let legIndex = 0;
  while (stationIndex < path.stationIds.length - 1) {
    const from = path.stationIds[stationIndex];
    const to = path.stationIds[stationIndex + 1];
    if (!from || !to) {
      break;
    }
    const leg = path.legs[legIndex];
    if (leg?.fromStationId !== from || leg.toStationId !== to) {
      const transfer = graph.transfersFrom(from).find((edge) => edge.to === to);
      if (!transfer) {
        return { status: 'MISSING_DATA', reason: 'An actual path transfer is unavailable.' };
      }
      steps.push(transfer);
      stationIndex++;
      continue;
    }
    if (!leg.isShinkansen) {
      const edge = graph.edgesFrom(from).find(({ segment }) => segment.id === leg.segmentId);
      if (!edge) {
        return { status: 'MISSING_DATA', reason: 'An actual path segment is unavailable.' };
      }
      steps.push(edge);
      legIndex++;
      stationIndex++;
      continue;
    }

    const separate = revised && isSeparateAfterRevision(leg);
    const run: GraphStep[] = [];
    let end = from;
    for (const next of path.legs.slice(legIndex)) {
      if (
        next.railLineId !== leg.railLineId ||
        next.fromStationId !== end ||
        (revised && isSeparateAfterRevision(next) !== separate)
      ) {
        break;
      }
      const edge = graph.edgesFrom(end).find(({ segment }) => segment.id === next.segmentId);
      if (!edge) {
        return { status: 'MISSING_DATA', reason: 'A Shinkansen track segment is unavailable.' };
      }
      run.push(edge);
      end = edge.to;
    }
    legIndex += run.length;
    stationIndex += run.length;
    const isTokaido = leg.railLineId === TOKAIDO_SHINKANSEN;
    const touchesException =
      !revised && isTokaido && (from === SHIN_YOKOHAMA || end === SHIN_YOKOHAMA);
    if (touchesException || separate || (!isTokaido && leg.railLineId !== TOHOKU_SHINKANSEN)) {
      const step = explain(
        ruleId,
        'REJECTED',
        touchesException
          ? 'Shin-Yokohama is the origin, destination or connection within Shinagawa–Odawara.'
          : 'This Shinkansen run is treated as a separate line for the selected rule version.',
      );
      explanation.push(
        touchesException ? { ...step, articleRef: '旅客営業規則 第16条の2第2項第1号' } : step,
      );
      steps.push(...run);
      continue;
    }

    const conventionalLines = isTokaido
      ? new Set([line('jr-east-tokaido'), line('jr-central-tokaido')])
      : new Set([line('jr-east-tohoku')]);
    const avoidLineIds = new Set(
      graph.dataset.lines.filter(({ id }) => !conventionalLines.has(id)).map(({ id }) => id),
    );
    const parallel = graph.findShortestTrackPath(from, end, {
      allowShinkansen: false,
      allowLocalLines: false,
      requireFareZoneTag: SLICE,
      avoidLineIds,
    });
    if (!parallel?.length || !parallel.some((step) => step.kind === 'track')) {
      return {
        status: 'MISSING_DATA',
        reason: 'The parallel conventional billing corridor is incomplete.',
      };
    }
    explanation.push(
      explain(ruleId, 'APPLIED', 'Use the parallel conventional corridor for this Shinkansen run.'),
    );
    steps.push(...parallel);
  }
  return graph.resolveSteps(steps, firstStation);
}
