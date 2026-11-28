import type { AppRegion, ThroughService, TrackGraph, TrackVerticalLayer } from '@senkiro/contracts';

/**
 * Shared regional atlas bundle interface matching `docs/02-phase1-atlas-spec.md` §5.1
 * and `apps/web` `AtlasDataSourceSlot`.
 */
export interface RegionalAtlasBundle {
  region: AppRegion;
  trackGraph: TrackGraph;
  throughServices: readonly ThroughService[];
  pmtilesUrl: string;
  /** Optional physically isolated ODbL layer metadata (never merged into trackGraph). */
  verticalLayer?: TrackVerticalLayer;
  verticalPmtilesUrl?: string;
}
