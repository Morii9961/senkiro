'use dom';

import type {
  Locale,
  PlatformSide,
  SkId,
  StationHubDataset,
  StationRouteFound,
} from '@senkiro/contracts';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { buildIndoorGraph } from '../graph/build.ts';
import { langTag, nameText, placeKindLabel, t } from '../i18n.ts';
import { floorLabel, floorsTopDown } from '../plan2d/layout.ts';
import { StationPlan2D, type StationSelectionId } from '../plan2d/StationPlan2D.tsx';
import { findStationRoute } from '../route/search.ts';
import { StationSceneController } from '../scene/StationSceneController.ts';
import { STATION_PALETTES, type StationTheme } from '../theme.ts';
import { StationDetails } from './StationDetails.tsx';

export interface StationExplorerProps {
  dataset: StationHubDataset;
  planNorth?: PlatformSide;
  locale?: Locale;
  theme?: StationTheme;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onNavigateExternalLine?: (lineId: SkId<'line'>) => void;
}

interface ViewportProps {
  dataset: StationHubDataset;
  locale: Locale;
  theme: StationTheme;
  floor: number | null;
  exploded: boolean;
  selected: StationSelectionId | null;
  route: StationRouteFound | null;
  onSelect: (id: StationSelectionId | null) => void;
  onUnavailable: () => void;
  sceneRef: { current: StationSceneController | null };
}

function StationViewport({
  dataset,
  locale,
  theme,
  floor,
  exploded,
  selected,
  route,
  onSelect,
  onUnavailable,
  sceneRef,
}: ViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const select = useEffectEvent(onSelect);
  const unavailable = useEffectEvent(onUnavailable);
  useEffect(() => {
    if (!host.current) {
      return;
    }
    const scene = new StationSceneController(host.current, { onSelect: (id) => select(id) });
    if (!scene.getState().webglAvailable) {
      scene.dispose();
      unavailable();
      return;
    }
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, [sceneRef]);
  useEffect(() => {
    sceneRef.current?.setDataset(dataset);
    sceneRef.current?.setActiveLevel(floor);
    sceneRef.current?.setSelection(selected);
    sceneRef.current?.setRoute(route);
  }, [dataset, floor, selected, route, sceneRef]);
  useEffect(() => sceneRef.current?.setExploded(exploded), [exploded, sceneRef]);
  useEffect(() => sceneRef.current?.setTheme(theme), [theme, sceneRef]);
  useEffect(() => sceneRef.current?.setLocale(locale), [locale, sceneRef]);
  return (
    <>
      <div ref={host} data-station-viewport="" style={{ height: 'clamp(19rem, 56vh, 36rem)' }} />
      <button type="button" onClick={() => sceneRef.current?.resetView()}>
        {t(locale, 'resetView')}
      </button>
    </>
  );
}

export function StationExplorer(props: StationExplorerProps) {
  return <HubExplorer key={props.dataset.complex.id} {...props} />;
}

function HubExplorer({
  dataset,
  planNorth,
  locale = 'ja',
  theme = 'light',
  selectedId,
  onSelect,
  onNavigateExternalLine,
}: StationExplorerProps) {
  const sceneRef = useRef<StationSceneController>(null);
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [unavailable, setUnavailable] = useState(false);
  const [ordinal, setOrdinal] = useState<number | null>(null);
  const [exploded, setExploded] = useState(false);
  const [internalSelection, setInternalSelection] = useState<StationSelectionId | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stepFree, setStepFree] = useState(false);
  const palette = STATION_PALETTES[theme];
  const sceneVisible = view === '3d' && !unavailable;
  const graph = useMemo(() => buildIndoorGraph(dataset), [dataset]);
  const floors = useMemo(() => floorsTopDown(dataset.levels), [dataset.levels]);
  const floor = ordinal !== null && floors.includes(ordinal) ? ordinal : null;
  const facilities = useMemo(
    () => new Map([...dataset.places, ...dataset.links].map((item) => [item.id as string, item])),
    [dataset],
  );
  const selected = facilities.get(
    (selectedId !== undefined ? selectedId : internalSelection) ?? '',
  );
  const route = useMemo(() => {
    if (!from || !to) {
      return null;
    }
    return findStationRoute(graph, {
      complexId: dataset.complex.id,
      fromPlaceId: from as SkId<'place'>,
      toPlaceId: to as SkId<'place'>,
      mode: stepFree ? 'step_free' : 'standard',
    });
  }, [dataset.complex.id, from, to, stepFree, graph]);
  const found = route?.reachable ? route : null;
  const choose = (id: StationSelectionId | null) => {
    if (selectedId === undefined) {
      setInternalSelection(id);
    }
    onSelect?.(id);
  };
  const chooseFloor = (level: number | null, unfold: boolean) => {
    setOrdinal(level);
    setExploded(unfold);
  };
  const focus =
    selected && sceneVisible
      ? () => {
          const levelId =
            'levelId' in selected
              ? selected.levelId
              : graph.nodes.get(selected.fromPlaceId)?.level.id;
          const targetLevel = dataset.levels.find((level) => level.id === levelId)?.ordinal;
          if (floor !== null && targetLevel !== undefined && floor !== targetLevel) {
            chooseFloor(targetLevel, false);
            sceneRef.current?.setActiveLevel(targetLevel);
          }
          sceneRef.current?.focusPlace(selected.id);
        }
      : undefined;
  const options = dataset.places
    .filter((place) => place.fareZone !== 'roadway')
    .map((place) => (
      <option key={place.id} value={place.id}>
        {nameText(place.names, locale) ?? placeKindLabel(locale, place.kind)} ·{' '}
        {graph.nodes.get(place.id)?.level.label}
      </option>
    ));

  return (
    <section
      data-station-explorer=""
      data-theme={theme}
      lang={langTag(locale)}
      aria-label={nameText(dataset.complex.names, locale) ?? t(locale, 'station')}
      style={{ background: palette.background, color: palette.text, padding: '1rem' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '0.5rem 1rem',
        }}
      >
        <h1 style={{ margin: '0.25rem 0', fontSize: 'clamp(1.45rem, 4vw, 2.35rem)' }}>
          {nameText(dataset.complex.names, locale) ?? t(locale, 'station')}
        </h1>
        <fieldset aria-label={t(locale, 'viewMode')} style={{ border: 0, margin: 0, padding: 0 }}>
          <button
            type="button"
            aria-pressed={sceneVisible}
            disabled={unavailable}
            onClick={() => setView('3d')}
          >
            {t(locale, 'view3d')}
          </button>
          <button type="button" aria-pressed={!sceneVisible} onClick={() => setView('2d')}>
            {t(locale, 'view2d')}
          </button>
        </fieldset>
      </header>
      <p style={{ color: palette.mutedText, fontSize: '0.875rem' }}>
        {nameText(dataset.disclaimer, locale) ?? t(locale, 'schematicNote')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'start' }}>
        <div style={{ flex: '3 1 32rem', minWidth: 0 }}>
          <fieldset
            aria-label={t(locale, 'floors')}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.3rem',
              padding: '0.5rem 0',
              border: 0,
              margin: 0,
              borderBlock: `1px solid ${palette.panelBorder}`,
            }}
          >
            {sceneVisible ? (
              <button
                type="button"
                aria-pressed={floor === null && !exploded}
                onClick={() => chooseFloor(null, false)}
              >
                {t(locale, 'allFloors')}
              </button>
            ) : null}
            {floors.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === (sceneVisible ? floor : (floor ?? floors[0]))}
                onClick={() => chooseFloor(item, false)}
              >
                {floorLabel(dataset.levels, item)}
              </button>
            ))}
            {sceneVisible ? (
              <button
                type="button"
                aria-pressed={exploded}
                onClick={() => chooseFloor(null, !exploded)}
              >
                {t(locale, 'exploded')}
              </button>
            ) : null}
          </fieldset>
          {unavailable ? <p role="status">{t(locale, 'webglUnavailable')}</p> : null}
          {sceneVisible ? (
            <StationViewport
              dataset={dataset}
              locale={locale}
              theme={theme}
              floor={floor}
              exploded={exploded}
              selected={selected?.id ?? null}
              route={found}
              onSelect={choose}
              onUnavailable={() => setUnavailable(true)}
              sceneRef={sceneRef}
            />
          ) : (
            <StationPlan2D
              dataset={dataset}
              locale={locale}
              theme={theme}
              activeFloor={floor}
              planNorth={planNorth ?? null}
              selectedId={selected?.id ?? null}
              onSelect={choose}
              route={found}
              hideFloorPicker
            />
          )}
        </div>
        <aside
          style={{
            flex: '1 1 17rem',
            minWidth: 0,
            background: palette.panel,
            padding: '0.85rem',
            border: `1px solid ${palette.panelBorder}`,
          }}
        >
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend style={{ fontWeight: 700 }}>{t(locale, 'route')}</legend>
            <label style={{ display: 'grid', marginBlock: '0.5rem' }}>
              {t(locale, 'from')}
              <select
                style={{ width: '100%' }}
                value={from}
                onChange={(event) => setFrom(event.currentTarget.value)}
              >
                <option value="">{t(locale, 'choosePlace')}</option>
                {options}
              </select>
            </label>
            <label style={{ display: 'grid', marginBlock: '0.5rem' }}>
              {t(locale, 'to')}
              <select
                style={{ width: '100%' }}
                value={to}
                onChange={(event) => setTo(event.currentTarget.value)}
              >
                <option value="">{t(locale, 'choosePlace')}</option>
                {options}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={stepFree}
                onChange={(event) => setStepFree(event.currentTarget.checked)}
              />{' '}
              {t(locale, 'stepFreeMode')}
            </label>
            <div
              aria-live="polite"
              data-station-route-mode={route?.mode}
              data-reachable={route?.reachable}
            >
              {found ? (
                <>
                  <p>
                    {t(locale, 'gatePasses')} {found.gatePasses} · {t(locale, 'levelChanges')}{' '}
                    {found.levelChanges}
                  </p>
                  {found.inferredLinkCount ? (
                    <p>
                      {t(locale, 'inferredLinks')} {found.inferredLinkCount}
                    </p>
                  ) : null}
                  {stepFree && found.unconfirmedStepFreeCount ? (
                    <p>
                      {t(locale, 'unconfirmedStepFree')} {found.unconfirmedStepFreeCount}
                    </p>
                  ) : null}
                  <ol>
                    {found.steps.map((step) => {
                      const node = graph.nodes.get(step.toPlaceId);
                      return (
                        <li key={step.index}>
                          {node
                            ? (nameText(node.place.names, locale) ??
                              placeKindLabel(locale, node.place.kind))
                            : t(locale, 'unknown')}
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : route && !route.reachable ? (
                <p>{t(locale, `reason.${route.reason}`)}</p>
              ) : null}
            </div>
          </fieldset>
          <hr style={{ border: 0, borderTop: `1px solid ${palette.panelBorder}` }} />
          <StationDetails
            dataset={dataset}
            locale={locale}
            facility={selected}
            onFocus={focus}
            onNavigateExternalLine={onNavigateExternalLine}
          />
        </aside>
      </div>
    </section>
  );
}
