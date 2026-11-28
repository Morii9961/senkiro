/**
 * Shell-side half of the Atlas map: decides whether the MapLibre engine may start and
 * turns map picks into URL updates. The engine itself (`maplibre-gl`, its CSS and
 * `pmtiles`) is the lazy `AtlasMapView` chunk, loaded only when an `atlasDataSource` slot
 * is connected and the browser has WebGL. Otherwise nothing is mounted and the Phase 0
 * graticule stays, with an honest status line (see `MapCanvas`).
 */
import { type AppRegion, HUB_REGION } from '@senkiro/contracts';
import { lazy, useEffect, useMemo } from 'react';
import { useAppSearch, useUpdateSearch } from '../../app/hooks.ts';
import { SlotBoundary, useShellSlots } from '../../slots/slots.tsx';
import { useShellUi } from '../../state/ui-store.ts';
import type { AtlasPick } from './atlas-pick.ts';
import { useAtlasUi } from './atlas-store.ts';
import { useAtlasBundle } from './use-atlas-bundle.ts';

const AtlasMapView = lazy(() => import('./AtlasMapView.tsx'));

/** WebGL probe that never logs: jsdom and locked-down browsers simply report `false`. */
export function hasWebGL(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  if (
    typeof WebGL2RenderingContext === 'undefined' &&
    typeof WebGLRenderingContext === 'undefined'
  ) {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}

export function AtlasMapLayer({ region }: { region: AppRegion }) {
  const search = useAppSearch();
  const update = useUpdateSearch();
  const setPanelOpen = useShellUi((state) => state.setPanelOpen);
  const { atlasDataSource: provider } = useShellSlots();
  const state = useAtlasBundle(region);
  const hidden = useAtlasUi((ui) => ui.hiddenOperators[region]);
  const setMapStatus = useAtlasUi((ui) => ui.setMapStatus);
  const webgl = useMemo(() => provider !== undefined && hasWebGL(), [provider]);

  useEffect(() => {
    if (provider === undefined) {
      setMapStatus('idle');
    } else if (!webgl) {
      setMapStatus('no-webgl');
    }
  }, [provider, webgl, setMapStatus]);

  if (provider === undefined || !webgl) {
    return null;
  }

  const ready = state.status === 'ready' ? state : null;
  const onPick = (pick: AtlasPick) => {
    setPanelOpen(true);
    if (pick.kind === 'station') {
      update({ station: pick.id, complex: undefined, line: undefined });
    } else if (pick.kind === 'complex' && pick.hub !== null) {
      // Spec §5.2.2: a 3D hub badge opens the hub preview and the complex entry together.
      update({
        region: HUB_REGION[pick.hub],
        hub: pick.hub,
        complex: pick.id,
        station: undefined,
        line: undefined,
      });
    } else if (pick.kind === 'complex') {
      update({ complex: pick.id, station: undefined, line: undefined });
    } else {
      update({ line: pick.id, station: undefined, complex: undefined });
    }
  };

  return (
    <SlotBoundary
      fallback={null}
      loading={null}
      onError={(error) =>
        setMapStatus('error', error instanceof Error ? error.message : String(error))
      }
    >
      <AtlasMapView
        bundle={ready?.bundle ?? null}
        index={ready?.index ?? null}
        region={region}
        theme={search.theme}
        lang={search.lang}
        hiddenOperatorIds={hidden}
        selection={{
          ...(search.line === undefined ? {} : { lineId: search.line }),
          ...(search.station === undefined ? {} : { stationId: search.station }),
          ...(search.complex === undefined ? {} : { complexId: search.complex }),
        }}
        onStatus={setMapStatus}
        onPick={onPick}
      />
    </SlotBoundary>
  );
}
