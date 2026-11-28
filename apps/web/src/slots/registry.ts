import type { ShellSlots } from './slots.tsx';

/**
 * Slot registry, wired by the coordinator on `integration/phase-0` after P0-S1/P0-S2 merge.
 * Example:
 *
 *   import { lazy } from 'react';
 *   export const DEFAULT_SHELL_SLOTS: ShellSlots = {
 *     stationExplorer: lazy(() =>
 *       import('./adapters/station-explorer.tsx').then((m) => ({ default: m.StationExplorerSlot })),
 *     ),
 *     localDbStatusProbe: lazy(() =>
 *       import('./adapters/local-db-probe.tsx').then((m) => ({ default: m.LocalDbStatusProbeSlot })),
 *     ),
 *   };
 *
 * Empty in Wave 1: every slot shows its honest "not connected" placeholder.
 */
export const DEFAULT_SHELL_SLOTS: ShellSlots = {};
