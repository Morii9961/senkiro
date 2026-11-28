import { lazy } from 'react';
import type { ShellSlots } from './slots.tsx';

/**
 * Slot registry (wired in P0-W2). Each adapter is a lazy chunk, so `three`, the hub
 * datasets and the SQLite Worker load only when a hub panel or the Profile / Journey probe
 * is opened. Kyoto never reaches the explorer slot (honest Phase 1 placeholder).
 */
export const DEFAULT_SHELL_SLOTS: ShellSlots = {
  stationExplorer: lazy(() =>
    import('./adapters/station-explorer.tsx').then((m) => ({ default: m.StationExplorerSlot })),
  ),
  localDbStatusProbe: lazy(() =>
    import('./adapters/local-db-probe.tsx').then((m) => ({ default: m.LocalDbStatusProbeSlot })),
  ),
};
