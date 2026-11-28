/**
 * Ephemeral shell UI state (zustand). Anything a link should restore (region, module,
 * hub, language, theme, from/to) lives in the URL instead; this store only holds view
 * chrome that is fine to lose on refresh.
 */
import { create } from 'zustand';

export interface RouteDraft {
  from: string;
  to: string;
}

export interface ShellUiState {
  /** `null` = automatic: the module panel is open for every module except Atlas. */
  panelOpen: boolean | null;
  prefsOpen: boolean;
  /** Unsubmitted origin/destination text; `null` = mirror the URL values. */
  routeDraft: RouteDraft | null;
  /** Set when the dock's search entry asks the Route panel to focus its first field. */
  routeFocusRequested: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePrefs: () => void;
  setRouteDraft: (draft: RouteDraft | null) => void;
  requestRouteFocus: (requested: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  panelOpen: null,
  prefsOpen: false,
  routeDraft: null,
  routeFocusRequested: false,
} satisfies Partial<ShellUiState>;

export const useShellUi = create<ShellUiState>()((set) => ({
  ...INITIAL,
  setPanelOpen: (open) => set({ panelOpen: open }),
  togglePrefs: () => set((state) => ({ prefsOpen: !state.prefsOpen })),
  setRouteDraft: (draft) => set({ routeDraft: draft }),
  requestRouteFocus: (requested) => set({ routeFocusRequested: requested }),
  reset: () => set(INITIAL),
}));
