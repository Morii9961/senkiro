import type { AppModule } from '@senkiro/contracts';
import { DrawerPanel, SignCode } from '@senkiro/ui-kit';
import { type ComponentType, type CSSProperties, useEffect, useState } from 'react';
import { useAppSearch, useMessages } from '../app/hooks.ts';
import { AtlasModule } from '../modules/AtlasModule.tsx';
import { JourneyModule } from '../modules/JourneyModule.tsx';
import { ProfileModule } from '../modules/ProfileModule.tsx';
import { RouteModule } from '../modules/RouteModule.tsx';
import { TicketsModule } from '../modules/TicketsModule.tsx';
import { useShellUi } from '../state/ui-store.ts';
import styles from './AppShell.module.css';
import { CommandDock, MODULE_CODES } from './CommandDock.tsx';
import { HubPanel } from './HubPanel.tsx';
import { HubQuickEntry } from './HubQuickEntry.tsx';
import { MapCanvas } from './MapCanvas.tsx';

const MODULE_VIEWS: Readonly<Record<AppModule, ComponentType>> = {
  atlas: AtlasModule,
  route: RouteModule,
  tickets: TicketsModule,
  journey: JourneyModule,
  profile: ProfileModule,
};

/** Fallback before the first measurement (dock height incl. top inset). */
const DEFAULT_DOCK_BOTTOM = 232;

/** Tracks the dock's bottom edge so the module panel always sits just below it. */
function useDockBottom(dock: HTMLElement | null): number {
  const [bottom, setBottom] = useState(DEFAULT_DOCK_BOTTOM);
  useEffect(() => {
    if (dock === null) {
      return undefined;
    }
    const measure = () => {
      const rect = dock.getBoundingClientRect();
      if (rect.height > 0) {
        setBottom(Math.round(rect.bottom));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [dock]);
  return bottom;
}

/**
 * The SENKIRO home shell (decision D-02): a full-screen railway map canvas with the
 * floating command dock top-left, the module panel below it, hub quick entry and the
 * hub preview panel on the right.
 */
export function AppShell() {
  const search = useAppSearch();
  const m = useMessages();
  const panelOpenState = useShellUi((state) => state.panelOpen);
  const setPanelOpen = useShellUi((state) => state.setPanelOpen);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const dockBottom = useDockBottom(dock);
  const panelOpen = panelOpenState ?? search.module !== 'atlas';
  const ModuleView = MODULE_VIEWS[search.module];
  const copy = m.modules[search.module];

  return (
    <div
      className={styles.shell}
      data-theme={search.theme}
      data-module={search.module}
      style={{ '--sk-dock-bottom': `${dockBottom}px` } as CSSProperties}
    >
      <MapCanvas region={search.region} />
      <CommandDock ref={setDock} />
      {layer !== null && panelOpen && (
        <DrawerPanel
          open
          onOpenChange={setPanelOpen}
          side="left"
          lang={search.lang}
          container={layer}
          className={styles.modulePanel}
          eyebrow={
            <span className={styles.eyebrow}>
              <SignCode code={MODULE_CODES[search.module]} active />
              {copy.subtitle}
            </span>
          }
          title={copy.title}
          description={copy.description}
          footer={m.shell.phaseNotice}
        >
          <ModuleView />
        </DrawerPanel>
      )}
      {!panelOpen && <HubQuickEntry />}
      {layer !== null && <HubPanel container={layer} />}
      {/* Portal target for both drawers, so they sit inside the main landmark and inherit
          the shell's theme and layout variables. */}
      <main ref={setLayer} className={styles.layer} aria-label={copy.title} />
    </div>
  );
}
