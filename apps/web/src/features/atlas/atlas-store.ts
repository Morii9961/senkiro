/**
 * Ephemeral Atlas view state (zustand). The URL (`useAppSearch()`) owns what a link must
 * restore — region, station, complex, line, hub. The operator filter and the map engine
 * status are view chrome that is fine to lose on refresh, so they live here.
 */
import type { AppRegion } from '@senkiro/contracts';
import { create } from 'zustand';

/** `idle`: nothing to draw (no data source / no bundle for the region). */
export type AtlasMapStatus = 'idle' | 'loading' | 'ready' | 'no-webgl' | 'error';

export interface AtlasUiState {
  /** Operator IDs hidden by the filter, per region. Empty = every operator shown. */
  hiddenOperators: Readonly<Record<AppRegion, readonly string[]>>;
  mapStatus: AtlasMapStatus;
  /** Engine error text when `mapStatus === 'error'`. */
  mapError: string | null;
  toggleOperator: (region: AppRegion, operatorId: string) => void;
  showOnly: (region: AppRegion, operatorIds: readonly string[], keep: string) => void;
  showAll: (region: AppRegion) => void;
  setMapStatus: (status: AtlasMapStatus, error?: string) => void;
  reset: () => void;
}

const INITIAL = {
  hiddenOperators: { kansai: [], kanto: [] },
  mapStatus: 'idle',
  mapError: null,
} satisfies Partial<AtlasUiState>;

export const useAtlasUi = create<AtlasUiState>()((set) => ({
  ...INITIAL,
  toggleOperator: (region, operatorId) =>
    set((state) => {
      const hidden = state.hiddenOperators[region];
      const next = hidden.includes(operatorId)
        ? hidden.filter((id) => id !== operatorId)
        : [...hidden, operatorId];
      return { hiddenOperators: { ...state.hiddenOperators, [region]: next } };
    }),
  showOnly: (region, operatorIds, keep) =>
    set((state) => ({
      hiddenOperators: {
        ...state.hiddenOperators,
        [region]: operatorIds.filter((id) => id !== keep),
      },
    })),
  showAll: (region) =>
    set((state) => ({ hiddenOperators: { ...state.hiddenOperators, [region]: [] } })),
  setMapStatus: (mapStatus, error) => set({ mapStatus, mapError: error ?? null }),
  reset: () => set(INITIAL),
}));

const EMPTY: ReadonlySet<string> = new Set();

/** Hidden operator IDs for a region as a set (stable while the list is unchanged). */
export function hiddenSet(hidden: readonly string[]): ReadonlySet<string> {
  return hidden.length === 0 ? EMPTY : new Set(hidden);
}
