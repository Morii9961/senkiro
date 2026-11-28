import { APP_REGIONS, type AppRegion } from '@senkiro/contracts';
import { lazy } from 'react';
import type { RegionalAtlasBundle, RegionalAtlasBundleProvider, ShellSlots } from './slots.tsx';

/** Global a test or preview harness may set before the app loads (see below). */
export const ATLAS_PREVIEW_GLOBAL = '__SENKIRO_ATLAS_PREVIEW__';

function isBundleFor(region: AppRegion, value: unknown): value is RegionalAtlasBundle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const bundle = value as Partial<RegionalAtlasBundle>;
  return (
    bundle.region === region &&
    typeof bundle.pmtilesUrl === 'string' &&
    Array.isArray(bundle.throughServices) &&
    typeof bundle.trackGraph === 'object' &&
    bundle.trackGraph !== null
  );
}

/**
 * Preview seam for the Atlas: Playwright (or a developer) can put
 * `{ kansai?: RegionalAtlasBundle, kanto?: RegionalAtlasBundle }` on
 * `window.__SENKIRO_ATLAS_PREVIEW__` before the page loads. The shell then shows those
 * bundles, always labelled as preview data. No fixture data ships in the app itself, and
 * without the global nothing changes. Wave 2 (P1-W2) adds the real `@senkiro/data-kansai`
 * provider next to this.
 */
export function previewAtlasSource(
  scope: object = globalThis,
): RegionalAtlasBundleProvider | undefined {
  const injected: unknown = Reflect.get(scope, ATLAS_PREVIEW_GLOBAL);
  if (typeof injected !== 'object' || injected === null) {
    return undefined;
  }
  const bundles = new Map<AppRegion, RegionalAtlasBundle>();
  for (const region of APP_REGIONS) {
    const candidate: unknown = Reflect.get(injected, region);
    if (isBundleFor(region, candidate)) {
      bundles.set(region, candidate);
    }
  }
  if (bundles.size === 0) {
    return undefined;
  }
  return {
    regions: [...bundles.keys()],
    preview: true,
    load: (region) => {
      const bundle = bundles.get(region);
      return bundle === undefined
        ? Promise.reject(new Error(`no preview atlas bundle for ${region}`))
        : Promise.resolve(bundle);
    },
  };
}

const atlasDataSource = previewAtlasSource();

/**
 * Slot registry (wired in P0-W2). Each adapter is a lazy chunk, so `three`, the hub
 * datasets and the SQLite Worker load only when a hub panel or the Profile / Journey probe
 * is opened. Kyoto never reaches the explorer slot (honest Phase 1 placeholder).
 * `atlasDataSource` stays empty in Wave 1 unless a preview bundle was injected.
 */
export const DEFAULT_SHELL_SLOTS: ShellSlots = {
  stationExplorer: lazy(() =>
    import('./adapters/station-explorer.tsx').then((m) => ({ default: m.StationExplorerSlot })),
  ),
  localDbStatusProbe: lazy(() =>
    import('./adapters/local-db-probe.tsx').then((m) => ({ default: m.LocalDbStatusProbeSlot })),
  ),
  ...(atlasDataSource === undefined ? {} : { atlasDataSource }),
};
