import { resolveLocalizedName } from '@senkiro/contracts';
import { DrawerPanel } from '@senkiro/ui-kit';
import type { ReactNode } from 'react';
import { useAppSearch, useMessages, useUpdateSearch } from '../app/hooks.ts';
import { getHub } from '../data/hubs.ts';
import { SlotBoundary, useShellSlots } from '../slots/slots.tsx';
import { useShellUi } from '../state/ui-store.ts';
import styles from './HubPanel.module.css';

export interface HubPanelProps {
  container: HTMLElement | null;
}

/**
 * Right-side hub preview (bottom sheet on phones). Umeda/Shinjuku mount the
 * `stationExplorer` slot once the coordinator connects `@senkiro/station-3d`; Kyoto stays
 * an honest Phase 1 placeholder even when the slot exists, because it has no data yet.
 *
 * The slot boundary is keyed by hub, so an error in one hub never sticks to the next one.
 * An external line picked inside the hub opens the Atlas line entry (spec §5.2.3) and keeps
 * this preview open, so the user can come back to the same level and selection.
 */
export function HubPanel({ container }: HubPanelProps) {
  const search = useAppSearch();
  const m = useMessages();
  const update = useUpdateSearch();
  const setPanelOpen = useShellUi((state) => state.setPanelOpen);
  const { stationExplorer: StationExplorer } = useShellSlots();
  if (search.hub === undefined) {
    return null;
  }
  const hub = getHub(search.hub);
  const name = resolveLocalizedName(hub.names, search.lang);
  const connected = hub.status !== 'phase-1-placeholder' && StationExplorer !== undefined;
  const statusText =
    hub.status === 'phase-1-placeholder'
      ? m.hubs.status.phase1
      : connected
        ? m.hubs.status.connected
        : m.hubs.status.slotPending;

  let body: ReactNode;
  if (hub.status === 'phase-1-placeholder') {
    body = <p className={styles.placeholder}>{m.hubs.phase1Body}</p>;
  } else if (StationExplorer === undefined) {
    body = <p className={styles.placeholder}>{m.hubs.slotPendingBody}</p>;
  } else {
    body = (
      <SlotBoundary
        key={hub.id}
        fallback={<p className={styles.placeholder}>{m.hubs.slotError}</p>}
        loading={<p className={styles.placeholder}>{m.hubs.loading}</p>}
      >
        <StationExplorer
          hub={hub.id}
          lang={search.lang}
          theme={search.theme}
          level={search.level ?? null}
          selection={search.selection ?? null}
          stepFree={search.stepFree === true}
          onLevelChange={(level) => update({ level: level ?? undefined })}
          onSelectionChange={(selection) => update({ selection: selection ?? undefined })}
          onStepFreeChange={(stepFree) => update({ stepFree: stepFree ? true : undefined })}
          onNavigateExternalLine={(lineId) => {
            setPanelOpen(true);
            update({ module: 'atlas', line: lineId, station: undefined, complex: undefined });
          }}
        />
      </SlotBoundary>
    );
  }

  return (
    <DrawerPanel
      open
      onOpenChange={(open) => {
        if (!open) {
          update({ hub: undefined, level: undefined, selection: undefined });
        }
      }}
      side="right"
      lang={search.lang}
      container={container}
      className={connected ? `${styles.panel} ${styles.panelWide}` : styles.panel}
      eyebrow={<span className={styles.eyebrow}>HUB · {m.regions[hub.region].name}</span>}
      title={name.text}
      description={m.hubs.panelDescription}
      footer={m.brand.notOfficial}
    >
      <p className={styles.status} data-status={hub.status} data-connected={connected}>
        {statusText}
      </p>
      <div
        className={connected ? styles.stageMounted : styles.stage}
        data-slot="station-explorer"
        data-hub={hub.id}
      >
        {body}
      </div>
    </DrawerPanel>
  );
}
