import {
  type AlignmentOptions,
  type AlignmentResult,
  alignExternalStations,
  type CanonicalStationTarget,
  DEFAULT_ALIGNMENT_GUARD_METERS,
  type ExternalStationCandidate,
} from '@senkiro/domain-core';
import type { KsjStationFeature } from './ksj-reader.ts';

export {
  type AlignmentOptions,
  type AlignmentResult,
  alignExternalStations,
  type CanonicalStationTarget,
  DEFAULT_ALIGNMENT_GUARD_METERS,
  type ExternalStationCandidate,
};

export interface AlignKsjOptions extends AlignmentOptions {
  sourceId: string;
}

/**
 * Convert KSJ N02-24 station features into {@link ExternalStationCandidate}s and run the
 * `@senkiro/domain-core` 650 m spatial guard, explicitly preserving all unaligned records.
 */
export function alignKsjStationsToTargets(
  ksjFeatures: readonly KsjStationFeature[],
  targets: readonly CanonicalStationTarget[],
  options: AlignKsjOptions,
): AlignmentResult {
  const candidates: ExternalStationCandidate[] = ksjFeatures.map((feat, index) => ({
    sourceId: options.sourceId,
    externalId: feat.stationCode.length > 0 ? `ksj:${feat.stationCode}` : `ksj-idx:${index}`,
    rawName: feat.stationName,
    operatorRaw: feat.operatorName,
    lineRaw: feat.lineName,
    coordinates: feat.midpoint,
  }));

  return alignExternalStations(candidates, targets, {
    ...options,
    maxDistanceMeters: options.maxDistanceMeters ?? DEFAULT_ALIGNMENT_GUARD_METERS,
  });
}
