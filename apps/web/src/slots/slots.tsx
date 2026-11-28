/**
 * Mount points for packages built in parallel during Wave 1 (P0-S1 / P0-S2).
 *
 * `apps/web` may only depend on `@senkiro/contracts` and `@senkiro/ui-kit` in Wave 1, so
 * the shell exposes typed slots instead of importing `@senkiro/station-3d` or
 * `@senkiro/local-db`. The coordinator fills `DEFAULT_SHELL_SLOTS` in `registry.ts` on the
 * integration branch; until then every slot renders an honest "not connected" placeholder.
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
