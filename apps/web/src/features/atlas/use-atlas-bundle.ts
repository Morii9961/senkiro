/**
 * Loads the current region's {@link RegionalAtlasBundle} through the `atlasDataSource`
 * slot and shares one cached result per provider and region across the map and the
 * Atlas panel. A failed load is not cached, so the next visit retries.
 */
import type { AppRegion } from '@senkiro/contracts';
import { useEffect, useSyncExternalStore } from 'react';
import {
  type RegionalAtlasBundle,
  type RegionalAtlasBundleProvider,
  useShellSlots,
} from '../../slots/slots.tsx';
import { type AtlasIndex, buildAtlasIndex } from './atlas-index.ts';

export type AtlasBundleState =
  /** No `atlasDataSource` slot is connected (Wave 1 default). */
  | { status: 'unconnected' }
  /** The provider publishes no bundle for this region. */
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; bundle: RegionalAtlasBundle; index: AtlasIndex; preview: boolean }
  | { status: 'error'; error: string };

const UNCONNECTED: AtlasBundleState = { status: 'unconnected' };
const UNAVAILABLE: AtlasBundleState = { status: 'unavailable' };
const LOADING: AtlasBundleState = { status: 'loading' };

const cache = new WeakMap<RegionalAtlasBundleProvider, Map<AppRegion, AtlasBundleState>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(provider: RegionalAtlasBundleProvider | undefined, region: AppRegion) {
  if (provider === undefined) {
    return UNCONNECTED;
  }
  if (!provider.regions.includes(region)) {
    return UNAVAILABLE;
  }
  return cache.get(provider)?.get(region) ?? LOADING;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Starts (once) the load of a region; safe to call repeatedly. */
export function loadAtlasBundle(
  provider: RegionalAtlasBundleProvider,
  region: AppRegion,
): Promise<AtlasBundleState> {
  let regions = cache.get(provider);
  if (regions === undefined) {
    regions = new Map();
    cache.set(provider, regions);
  }
  const cached = regions.get(region);
  if (cached !== undefined && cached.status !== 'error') {
    return Promise.resolve(cached);
  }
  const store = regions;
  store.set(region, LOADING);
  return provider.load(region).then(
    (bundle) => {
      const state: AtlasBundleState =
        bundle.region === region
          ? {
              status: 'ready',
              bundle,
              index: buildAtlasIndex(bundle),
              preview: provider.preview === true,
            }
          : {
              status: 'error',
              error: `atlas bundle for "${bundle.region}" returned for region "${region}"`,
            };
      store.set(region, state);
      emit();
      return state;
    },
    (error: unknown) => {
      const state: AtlasBundleState = { status: 'error', error: errorText(error) };
      // Stays visible; the next `loadAtlasBundle` call (next mount) retries an error.
      store.set(region, state);
      emit();
      return state;
    },
  );
}

export function useAtlasBundle(region: AppRegion): AtlasBundleState {
  const { atlasDataSource: provider } = useShellSlots();
  const state = useSyncExternalStore(
    subscribe,
    () => read(provider, region),
    () => read(provider, region),
  );
  const shouldLoad = provider?.regions.includes(region) === true;
  useEffect(() => {
    if (shouldLoad && provider !== undefined) {
      void loadAtlasBundle(provider, region);
    }
  }, [provider, region, shouldLoad]);
  return state;
}
