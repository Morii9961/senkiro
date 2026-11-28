/**
 * Mount points for packages built in parallel during Wave 1 (P0-S1 / P0-S2).
 *
 * The shell itself never imports `@senkiro/station-3d` or `@senkiro/local-db`: it exposes
 * typed slots, and `registry.ts` fills them with lazily loaded adapters (P0-W2), so the
 * heavy 3D and SQLite code stays out of the shell chunk. A missing slot renders an honest
 * "not connected" placeholder, and tests can inject their own slots.
 */
import type { AppHub, AppTheme, Locale } from '@senkiro/contracts';
import {
  Component,
  type ComponentType,
  createContext,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useContext,
} from 'react';

/** Props the shell passes to `<StationExplorer />` (or an adapter around it). */
export interface StationExplorerSlotProps {
  hub: AppHub;
  lang: Locale;
  theme: AppTheme;
  /** Selected level ID or label from the URL (`level`), or `null`. */
  level: string | null;
  /** Selected place/link ID from the URL (`selection`), or `null`. */
  selection: string | null;
  stepFree: boolean;
  onLevelChange: (level: string | null) => void;
  onSelectionChange: (selection: string | null) => void;
  onStepFreeChange: (stepFree: boolean) => void;
}

/** Props for the local SQLite status probe from `@senkiro/local-db`. */
export interface LocalDbStatusProbeSlotProps {
  lang: Locale;
}

export interface ShellSlots {
  stationExplorer?: ComponentType<StationExplorerSlotProps>;
  localDbStatusProbe?: ComponentType<LocalDbStatusProbeSlotProps>;
}

const ShellSlotsContext = createContext<ShellSlots>({});

export function ShellSlotsProvider({
  slots,
  children,
}: {
  slots: ShellSlots;
  children: ReactNode;
}) {
  return <ShellSlotsContext.Provider value={slots}>{children}</ShellSlotsContext.Provider>;
}

export function useShellSlots(): ShellSlots {
  return useContext(ShellSlotsContext);
}

interface SlotBoundaryProps {
  fallback: ReactNode;
  loading: ReactNode;
  onError?: (error: unknown, info: ErrorInfo) => void;
  children: ReactNode;
}

interface SlotBoundaryState {
  failed: boolean;
}

/** Suspense + error boundary so a lazy slot can never take the shell down. */
export class SlotBoundary extends Component<SlotBoundaryProps, SlotBoundaryState> {
  override state: SlotBoundaryState = { failed: false };

  static getDerivedStateFromError(): SlotBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return this.props.fallback;
    }
    return <Suspense fallback={this.props.loading}>{this.props.children}</Suspense>;
  }
}
