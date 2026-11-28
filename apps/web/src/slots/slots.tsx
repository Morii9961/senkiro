/**
 * Mount points for packages built in parallel waves (P0-S1 / P0-S2, then P1-S1).
 *
 * The shell itself never imports `@senkiro/station-3d`, `@senkiro/local-db` or
 * `@senkiro/data-kansai`: it exposes typed slots, and `registry.ts` fills them with lazily
 * loaded adapters, so the heavy 3D, SQLite and atlas data stay out of the shell chunk. A
 * missing slot renders an honest "not connected" placeholder, and tests can inject their
 * own slots.
 */
import type {
  AppHub,
  AppRegion,
  AppTheme,
  Locale,
  SkId,
  ThroughService,
  TrackGraph,
  TrackVerticalLayer,
} from '@senkiro/contracts';
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
  /**
   * In-station → atlas deep link (spec §5.2.3): the user picked one of the hub's external
   * lines. The shell switches to the Atlas module and opens that line's encyclopedia entry.
   */
  onNavigateExternalLine?: (lineId: SkId<'line'>) => void;
}

/** Props for the local SQLite status probe from `@senkiro/local-db`. */
export interface LocalDbStatusProbeSlotProps {
  lang: Locale;
}

/**
 * One region's atlas data (spec §5.1). Declared here, structurally identical to the export
 * of `@senkiro/data-kansai`, so Wave 1 builds without importing that package; Wave 2
 * (P1-W2) connects the real bundles through {@link RegionalAtlasBundleProvider}.
 */
export interface RegionalAtlasBundle {
  region: AppRegion;
  trackGraph: TrackGraph;
  throughServices: readonly ThroughService[];
  /**
   * Static PMTiles v3 archive with the four §3.2 layers, e.g. `/tiles/kansai-rail.pmtiles`.
   * An empty string means no tiles are published for this bundle (test fixtures, previews):
   * the map then draws the same four layers from `trackGraph` instead.
   */
  pmtilesUrl: string;
  /** Optional physically isolated ODbL layer metadata (never merged into trackGraph). */
  verticalLayer?: TrackVerticalLayer;
  verticalPmtilesUrl?: string;
}

/** Loads atlas bundles on demand, so region data is its own lazy chunk. */
export interface RegionalAtlasBundleProvider {
  /** Regions this provider publishes; any other region shows the honest "no data" state. */
  readonly regions: readonly AppRegion[];
  load(region: AppRegion): Promise<RegionalAtlasBundle>;
  /**
   * `true` when the bundles were injected for tests or previews rather than published data;
   * the shell then labels the map and the atlas panel as preview data.
   */
  readonly preview?: boolean;
}

export interface ShellSlots {
  stationExplorer?: ComponentType<StationExplorerSlotProps>;
  localDbStatusProbe?: ComponentType<LocalDbStatusProbeSlotProps>;
  /** SENKIRO Atlas region data (P1-S1 `@senkiro/data-kansai`, wired in P1-W2). */
  atlasDataSource?: RegionalAtlasBundleProvider;
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
