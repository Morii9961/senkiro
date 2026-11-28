/**
 * `<StationPlan2D />`: stateless SVG floor plan of one hub floor, drawn as split panels at a
 * shared scale. Everything is controlled through props (floor, selection, route), so the
 * same component serves the web app, Expo `"use dom"` and tests.
 */
import type {
  Locale,
  PlatformSide,
  SkId,
  StationHubDataset,
  StationLink,
  StationPlace,
  StationRouteFound,
} from '@senkiro/contracts';
import { type KeyboardEvent, useMemo } from 'react';
import { isVerticalLinkKind } from '../graph/build.ts';
import { linkKindLabel, nameText, placeKindLabel, t } from '../i18n.ts';
import { STATION_PALETTES, type StationTheme, zoneFill } from '../theme.ts';
import { UnknownValue } from '../ui/UnknownValue.tsx';
import {
  floorLabel,
  floorLayout,
  floorsTopDown,
  northVector,
  type PanelProjection,
  panelGrid,
  panelProjection,
} from './layout.ts';

export type StationSelectionId = SkId<'place'> | SkId<'link'>;

export interface StationPlan2DProps {
  dataset: StationHubDataset;
  locale: Locale;
  theme: StationTheme;
  /** Floor (level ordinal) to draw; `null` draws the top floor. */
  activeFloor: number | null;
  onFloorChange?: (ordinal: number) => void;
  selectedId: StationSelectionId | null;
  onSelect?: (id: StationSelectionId | null) => void;
  route?: StationRouteFound | null;
  /** Model axis pointing north; `null` / absent = not established (compass says so). */
  planNorth?: PlatformSide | null;
  width?: number;
  height?: number;
  /** Hide the built-in floor buttons (when a parent renders its own floor control). */
  hideFloorPicker?: boolean;
}

const VERTICAL_GLYPH: Record<'stairs' | 'escalator' | 'elevator', string> = {
  stairs: 'S',
  escalator: 'E',
  elevator: 'L',
};

const KIND_ORDER: Record<StationPlace['kind'], number> = {
  concourse: 0,
  passage: 1,
  platform: 2,
  landing: 3,
  entrance: 4,
};

interface RouteSets {
  places: Set<string>;
  links: Set<string>;
}

function routeSets(route: StationRouteFound | null | undefined): RouteSets {
  const places = new Set<string>();
  const links = new Set<string>();
  for (const step of route?.steps ?? []) {
    places.add(step.fromPlaceId);
    places.add(step.toPlaceId);
    links.add(step.linkId);
  }
  return { places, links };
}

export function StationPlan2D(props: StationPlan2DProps) {
  const {
    dataset,
    locale,
    theme,
    selectedId,
    onSelect,
    onFloorChange,
    route,
    planNorth = null,
    width = 960,
    height = 520,
    hideFloorPicker = false,
  } = props;
  const palette = STATION_PALETTES[theme];
  const floors = useMemo(() => floorsTopDown(dataset.levels), [dataset.levels]);
  const floor =
    props.activeFloor !== null && floors.includes(props.activeFloor)
      ? props.activeFloor
      : (floors[0] ?? 0);
  const layout = useMemo(() => floorLayout(dataset, floor), [dataset, floor]);
  const grid = useMemo(() => panelGrid(layout, width, height), [layout, width, height]);
  const sets = useMemo(() => routeSets(route), [route]);
  const placeById = useMemo(() => new Map(dataset.places.map((p) => [p.id, p])), [dataset.places]);
  const floorPlaceIds = useMemo(() => new Set(layout.places.map((p) => p.id)), [layout.places]);
  const north = northVector(layout.rotated, planNorth);
  const selectedPlace =
    selectedId !== null ? placeById.get(selectedId as SkId<'place'>) : undefined;
  const selectedLink =
    selectedId !== null ? dataset.links.find((l) => l.id === selectedId) : undefined;
  const selectedName =
    selectedPlace !== undefined
      ? nameText(selectedPlace.names, locale)
      : selectedLink !== undefined
        ? nameText(selectedLink.names, locale)
        : null;

  const drawPanel = (projection: PanelProjection, placeIds: ReadonlySet<string>) => {
    const places = layout.places
      .filter((p) => placeIds.has(p.id))
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : 1));
    const links = dataset.links.filter(
      (l) =>
        placeIds.has(l.fromPlaceId) && placeIds.has(l.toPlaceId) && !isVerticalLinkKind(l.kind),
    );
    const verticals = dataset.links.filter(
      (l) =>
        isVerticalLinkKind(l.kind) && (placeIds.has(l.fromPlaceId) || placeIds.has(l.toPlaceId)),
    );
    return (
      <>
        {places
          .filter((p) => p.kind !== 'landing' && p.kind !== 'entrance')
          .map((place) => drawArea(place, projection))}
        {links.map((link) => drawLink(link, projection))}
        {verticals.map((link) => drawVertical(link, projection, placeIds))}
        {places
          .filter((p) => p.kind === 'landing' || p.kind === 'entrance')
          .map((place) => drawMarker(place, projection))}
      </>
    );
  };

  const clickPlace = (id: StationSelectionId) => (event: { stopPropagation(): void }) => {
    event.stopPropagation();
    onSelect?.(id);
  };

  const keySelect = (id: StationSelectionId) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      clickPlace(id)(event);
    }
  };

  const drawArea = (place: StationPlace, projection: PanelProjection) => {
    const selected = place.id === selectedId;
    const onRoute = sets.places.has(place.id);
    const label = nameText(place.names, locale);
    const isPlatform = place.kind === 'platform';
    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG groups need button semantics without HTML children.
      <g
        key={place.id}
        data-place-id={place.id}
        data-kind={place.kind}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={nameText(place.names, locale) ?? placeKindLabel(locale, place.kind)}
        onClick={clickPlace(place.id)}
        onKeyDown={keySelect(place.id)}
      >
        {place.footprint.map((r) => {
          const q = projection.rect(r);
          return (
            <rect
              key={`${place.id}-rect-${r.x0}-${r.z0}-${r.x1}-${r.z1}`}
              x={q.x}
              y={q.y}
              width={Math.max(q.width, 1)}
              height={Math.max(q.height, 1)}
              fill={zoneFill(palette, place.fareZone, isPlatform)}
              fillOpacity={place.fareZone === 'roadway' ? 0.45 : 0.9}
              stroke={selected ? palette.selection : onRoute ? palette.route : palette.outline}
              strokeWidth={selected ? 2.5 : onRoute ? 1.8 : 0.6}
              strokeDasharray={place.existence === 'unverified' ? '4 3' : undefined}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
        {isPlatform ? drawTracks(place, projection) : null}
        {label !== null && (place.kind === 'platform' || place.kind === 'concourse') ? (
          <text
            x={projection.point(place.anchor).x}
            y={projection.point(place.anchor).y}
            fontSize={10}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={palette.text}
            pointerEvents="none"
          >
            {label}
          </text>
        ) : null}
      </g>
    );
  };

  const drawTracks = (place: StationPlace, projection: PanelProjection) => {
    const r = place.footprint[0];
    if (r === undefined) {
      return null;
    }
    const lines = (place.tracks ?? []).flatMap((track) => {
      const side = track.side;
      if (side === undefined || side === null) {
        return [];
      }
      const along = side.startsWith('z');
      const at = side.endsWith('-') ? (along ? r.z0 : r.x0) : along ? r.z1 : r.x1;
      const out = side.endsWith('-') ? -0.6 : 0.6;
      const a = along ? { x: r.x0, z: at + out } : { x: at + out, z: r.z0 };
      const b = along ? { x: r.x1, z: at + out } : { x: at + out, z: r.z1 };
      const pa = projection.point(a);
      const pb = projection.point(b);
      const doors = track.platformDoors?.status === 'installed';
      return [
        <line
          key={`${place.id}-track-${track.number}-${side}`}
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke={doors ? palette.platformDoor : palette.track}
          strokeWidth={doors ? 2 : 1.4}
          strokeDasharray={doors ? '5 2' : undefined}
          data-track={track.number}
          pointerEvents="none"
        />,
      ];
    });
    const end = place.terminus?.end;
    if (end !== undefined) {
      const along = end.startsWith('x');
      const at = end.endsWith('-') ? (along ? r.x0 : r.z0) : along ? r.x1 : r.z1;
      const a = along ? { x: at, z: r.z0 } : { x: r.x0, z: at };
      const b = along ? { x: at, z: r.z1 } : { x: r.x1, z: at };
      const pa = projection.point(a);
      const pb = projection.point(b);
      lines.push(
        <line
          key="terminus"
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke={palette.bufferStop}
          strokeWidth={3}
          data-terminus={end}
          pointerEvents="none"
        />,
      );
    }
    return lines;
  };

  const drawLink = (link: StationLink, projection: PanelProjection) => {
    const a = placeById.get(link.fromPlaceId);
    const b = placeById.get(link.toPlaceId);
    if (a === undefined || b === undefined) {
      return null;
    }
    const pa = projection.point(a.anchor);
    const pb = projection.point(b.anchor);
    const onRoute = sets.links.has(link.id);
    const selected = link.id === selectedId;
    const isGate = link.kind === 'gate';
    const mid =
      link.position !== undefined
        ? projection.point(link.position)
        : { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG groups need button semantics without HTML children.
      <g
        key={link.id}
        data-link-id={link.id}
        data-kind={link.kind}
        role="button"
        tabIndex={0}
        aria-pressed={link.id === selectedId}
        aria-label={nameText(link.names, locale) ?? linkKindLabel(locale, link.kind)}
        onClick={clickPlace(link.id)}
        onKeyDown={keySelect(link.id)}
      >
        <line
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke={onRoute ? palette.route : isGate ? palette.gate : palette.link}
          strokeWidth={onRoute ? 3.2 : selected ? 2.4 : 0.9}
          strokeDasharray={link.connection === 'inferred' ? '3 3' : undefined}
          strokeOpacity={onRoute ? 1 : 0.7}
        />
        {isGate ? (
          <rect
            x={mid.x - 4}
            y={mid.y - 4}
            width={8}
            height={8}
            fill={palette.gate}
            stroke={selected ? palette.selection : palette.panel}
            strokeWidth={selected ? 2 : 1}
            style={{ cursor: 'pointer' }}
          >
            <title>{nameText(link.names, locale) ?? linkKindLabel(locale, link.kind)}</title>
          </rect>
        ) : null}
      </g>
    );
  };

  const drawVertical = (
    link: StationLink,
    projection: PanelProjection,
    placeIds: ReadonlySet<string>,
  ) => {
    const hereId = placeIds.has(link.fromPlaceId) ? link.fromPlaceId : link.toPlaceId;
    const here = placeById.get(hereId);
    if (here === undefined || here.kind === 'landing') {
      // A landing draws its own marker with the glyph.
      return null;
    }
    const p = projection.point(link.position ?? here.anchor);
    const onRoute = sets.links.has(link.id);
    const glyph =
      link.kind === 'stairs' || link.kind === 'escalator' || link.kind === 'elevator'
        ? VERTICAL_GLYPH[link.kind]
        : '?';
    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG groups need button semantics without HTML children.
      <g
        key={link.id}
        data-link-id={link.id}
        data-kind={link.kind}
        role="button"
        tabIndex={0}
        aria-pressed={link.id === selectedId}
        aria-label={nameText(link.names, locale) ?? linkKindLabel(locale, link.kind)}
        onClick={clickPlace(link.id)}
        onKeyDown={keySelect(link.id)}
      >
        <circle cx={p.x} cy={p.y} r={5} fill={onRoute ? palette.route : palette.vertical} />
        <text
          x={p.x}
          y={p.y}
          fontSize={7}
          textAnchor="middle"
          dominantBaseline="central"
          fill={palette.panel}
          pointerEvents="none"
        >
          {glyph}
        </text>
      </g>
    );
  };

  const landingGlyph = (place: StationPlace): string => {
    const kinds = new Set(
      dataset.links
        .filter(
          (l) =>
            isVerticalLinkKind(l.kind) && (l.fromPlaceId === place.id || l.toPlaceId === place.id),
        )
        .map((l) => l.kind),
    );
    if (kinds.has('elevator')) {
      return VERTICAL_GLYPH.elevator;
    }
    if (kinds.has('escalator')) {
      return VERTICAL_GLYPH.escalator;
    }
    if (kinds.has('stairs')) {
      return VERTICAL_GLYPH.stairs;
    }
    return '·';
  };

  const drawMarker = (place: StationPlace, projection: PanelProjection) => {
    const p = projection.point(place.anchor);
    const selected = place.id === selectedId;
    const onRoute = sets.places.has(place.id);
    const isEntrance = place.kind === 'entrance';
    const fill = onRoute ? palette.route : isEntrance ? palette.entrance : palette.vertical;
    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG groups need button semantics without HTML children.
      <g
        key={place.id}
        data-place-id={place.id}
        data-kind={place.kind}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={nameText(place.names, locale) ?? placeKindLabel(locale, place.kind)}
        onClick={clickPlace(place.id)}
        onKeyDown={keySelect(place.id)}
        style={{ cursor: 'pointer' }}
      >
        {isEntrance ? (
          <circle
            cx={p.x}
            cy={p.y}
            r={5.5}
            fill={fill}
            stroke={selected ? palette.selection : palette.panel}
            strokeWidth={selected ? 2.5 : 1}
          />
        ) : (
          <rect
            x={p.x - 5}
            y={p.y - 5}
            width={10}
            height={10}
            rx={2}
            fill={fill}
            stroke={selected ? palette.selection : palette.panel}
            strokeWidth={selected ? 2.5 : 1}
          />
        )}
        <text
          x={p.x}
          y={p.y}
          fontSize={7}
          textAnchor="middle"
          dominantBaseline="central"
          fill={palette.panel}
          pointerEvents="none"
        >
          {isEntrance ? '⇲' : landingGlyph(place)}
        </text>
        <title>{nameText(place.names, locale) ?? t(locale, 'unknown')}</title>
      </g>
    );
  };

  const label = floorLabel(dataset.levels, floor);
  const blockCount = layout.blocks.length;

  return (
    <div
      data-station-plan-2d=""
      data-floor={floor}
      data-plan-rotated={layout.rotated ? 'true' : 'false'}
      style={{
        background: palette.background,
        color: palette.text,
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      {hideFloorPicker ? null : (
        <div
          role="toolbar"
          aria-label={t(locale, 'floors')}
          style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: 6 }}
        >
          {floors.map((ordinal) => (
            <button
              key={ordinal}
              type="button"
              aria-pressed={ordinal === floor}
              data-floor-button={ordinal}
              onClick={() => onFloorChange?.(ordinal)}
              style={{
                padding: '2px 10px',
                borderRadius: 4,
                border: `1px solid ${palette.panelBorder}`,
                background: ordinal === floor ? palette.selection : palette.panel,
                color: ordinal === floor ? '#1f2328' : palette.text,
                cursor: 'pointer',
              }}
            >
              {floorLabel(dataset.levels, ordinal)}
            </button>
          ))}
        </div>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: The SVG must expose its interactive descendants. */}
      <svg
        role="group"
        aria-label={`${t(locale, 'floor')} ${label}`}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: 'block' }}
        onClick={() => onSelect?.(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onSelect?.(null);
          }
        }}
      >
        <rect x={0} y={0} width={width} height={height} fill={palette.background} />
        {grid.panels.map((box) => {
          const block = layout.blocks[box.block];
          if (block === undefined) {
            return null;
          }
          const projection = panelProjection(layout, grid, box);
          const placeIds = new Set<string>(block.placeIds.filter((id) => floorPlaceIds.has(id)));
          return (
            <g key={box.block} data-panel={box.block}>
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={4}
                fill={palette.panel}
                stroke={palette.panelBorder}
              />
              <text
                x={box.x + 8}
                y={box.y + 17}
                fontSize={12}
                fontWeight={600}
                fill={palette.mutedText}
              >
                {blockCount > 1 ? `${label} · ${box.block + 1}/${blockCount}` : label}
              </text>
              {drawPanel(projection, placeIds)}
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 8px',
          fontSize: 12,
          color: palette.mutedText,
        }}
      >
        <span data-compass={north === null ? 'unknown' : 'known'}>
          {north === null ? (
            <UnknownValue locale={locale} kind="unverified" />
          ) : (
            <>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  transform: `rotate(${(Math.atan2(north.x, -north.y) * 180) / Math.PI}deg)`,
                }}
              >
                ↑
              </span>{' '}
              {t(locale, 'north')}
            </>
          )}
        </span>
        <span>{t(locale, 'schematicNote')}</span>
        {selectedId !== null ? (
          <span data-selected-name="">{selectedName ?? <UnknownValue locale={locale} />}</span>
        ) : null}
      </div>
    </div>
  );
}
