/**
 * Thin adapter: `StationExplorerSlotProps` (URL-driven, from `HubPanel` via `useAppSearch`)
 * → `<StationExplorer />` from `@senkiro/station-3d`.
 *
 * Each hub dataset is its own lazily imported chunk. Kyoto has no loader, so its data can
 * never be fetched or guessed; `HubPanel` keeps it on the honest Phase 1 placeholder and this
 * adapter refuses it as well.
 */
import type { AppHub, StationHubDataset } from '@senkiro/contracts';
import { StationExplorer } from '@senkiro/station-3d';
import { use } from 'react';
import type { StationExplorerSlotProps } from '../slots.tsx';

type HubLoader = () => Promise<StationHubDataset>;

export const HUB_DATASET_LOADERS: Readonly<Partial<Record<AppHub, HubLoader>>> = {
  umeda: () => import('@senkiro/data-stations/umeda').then((m) => m.umedaHubDataset),
  shinjuku: () => import('@senkiro/data-stations/shinjuku').then((m) => m.shinjukuHubDataset),
};

/**
 * A promise that records its outcome the way React's `use()` reads it, so a dataset that has
 * already loaded renders synchronously instead of suspending again (e.g. reopening a hub).
 */
export type TrackedPromise<T> = Promise<T> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
};

const datasets = new Map<AppHub, TrackedPromise<StationHubDataset>>();

/** One stable promise per hub, so React's `use()` suspends only on the first visit. */
export function loadHubDataset(hub: AppHub): TrackedPromise<StationHubDataset> | null {
  const loader = HUB_DATASET_LOADERS[hub];
  if (loader === undefined) {
    return null;
  }
  const cached = datasets.get(hub);
  if (cached !== undefined) {
    return cached;
  }
  const pending: TrackedPromise<StationHubDataset> = loader();
  pending.status = 'pending';
  pending.then(
    (value) => {
      pending.status = 'fulfilled';
      pending.value = value;
    },
    (reason: unknown) => {
      pending.status = 'rejected';
      pending.reason = reason;
      // A failed import must not stay cached; the next visit retries.
      datasets.delete(hub);
    },
  );
  datasets.set(hub, pending);
  return pending;
}

export function StationExplorerSlot(props: StationExplorerSlotProps) {
  const pending = loadHubDataset(props.hub);
  if (pending === null) {
    throw new Error(`No in-station dataset is published for hub "${props.hub}".`);
  }
  return <HubStationExplorer {...props} pending={pending} />;
}

function HubStationExplorer({
  pending,
  lang,
  theme,
  level,
  selection,
  stepFree,
  onLevelChange,
  onSelectionChange,
  onStepFreeChange,
  onNavigateExternalLine,
}: StationExplorerSlotProps & { pending: TrackedPromise<StationHubDataset> }) {
  // Suspend only while the chunk is still loading; a loaded hub renders synchronously.
  const dataset =
    pending.status === 'fulfilled' && pending.value !== undefined
      ? pending.value
      : use<StationHubDataset>(pending as Promise<StationHubDataset>);
  return (
    <StationExplorer
      dataset={dataset}
      locale={lang}
      theme={theme}
      level={level}
      onLevelChange={onLevelChange}
      selectedId={selection}
      onSelect={onSelectionChange}
      stepFree={stepFree}
      onStepFreeChange={onStepFreeChange}
      {...(onNavigateExternalLine === undefined ? {} : { onNavigateExternalLine })}
    />
  );
}
