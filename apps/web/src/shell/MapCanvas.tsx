import type { AppRegion } from '@senkiro/contracts';
import { formatTemplate } from '@senkiro/ui-kit';
import { useMessages } from '../app/hooks.ts';
import { presetCenter, REGION_PRESETS, type RegionViewPreset } from '../data/regions.ts';
import { AtlasMapLayer } from '../features/atlas/AtlasMapLayer.tsx';
import { type AtlasMapStatus, useAtlasUi } from '../features/atlas/atlas-store.ts';
import { type AtlasBundleState, useAtlasBundle } from '../features/atlas/use-atlas-bundle.ts';
import type { Messages } from '../i18n/messages.ts';
import { useShellSlots } from '../slots/slots.tsx';
import styles from './MapCanvas.module.css';

/** Equirectangular projection scaled by cos(latitude) so grid cells look square. */
function project(preset: RegionViewPreset) {
  const { lat } = presetCenter(preset);
  const k = Math.cos((lat * Math.PI) / 180);
  return { x: (lon: number) => lon * k, y: (latitude: number) => -latitude };
}

function steps(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(from / step - 1e-9);
  const last = Math.floor(to / step + 1e-9);
  for (let i = first; i <= last; i += 1) {
    out.push(Number((i * step).toFixed(6)));
  }
  return out;
}

function isMajor(value: number, major: number): boolean {
  const ratio = value / major;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

const fmt = (value: number, pos: string, neg: string) =>
  `${Math.abs(value).toFixed(2)}°${value >= 0 ? pos : neg}`;

export interface MapCanvasProps {
  region: AppRegion;
}

export type MapState = 'unconnected' | 'unavailable' | 'loading' | 'ready' | 'no-webgl' | 'error';

/** One honest state for the status line, from the data slot and the engine. */
export function mapState(
  connected: boolean,
  bundle: AtlasBundleState,
  engine: AtlasMapStatus,
): MapState {
  if (!connected) {
    return 'unconnected';
  }
  // Missing data is the more fundamental fact, so it outranks the engine's state.
  if (bundle.status === 'unavailable') {
    return 'unavailable';
  }
  if (engine === 'no-webgl') {
    return 'no-webgl';
  }
  if (bundle.status === 'error' || engine === 'error') {
    return 'error';
  }
  return bundle.status === 'ready' && engine === 'ready' ? 'ready' : 'loading';
}

function statusText(
  m: Messages,
  state: MapState,
  region: AppRegion,
  bundle: AtlasBundleState,
  engineError: string | null,
): string {
  const values = { region: m.regions[region].name };
  switch (state) {
    case 'unconnected':
      return m.map.states.unconnected;
    case 'unavailable':
      return formatTemplate(m.map.states.unavailable, values);
    case 'loading':
      return formatTemplate(m.map.states.loading, values);
    case 'no-webgl':
      return m.map.states.noWebgl;
    case 'error':
      return formatTemplate(m.map.states.error, {
        error: bundle.status === 'error' ? bundle.error : (engineError ?? '—'),
      });
    case 'ready': {
      const ready = bundle.status === 'ready' ? bundle : null;
      const source = ready?.bundle.pmtilesUrl === '' ? m.map.sourceInline : m.map.sourcePmtiles;
      return `${m.map.states.ready} · ${source}${ready?.preview === true ? ` · ${m.map.preview}` : ''}`;
    }
  }
}

/**
 * Map base. The Phase 0 latitude/longitude graticule for the region's view preset always
 * renders first; when an `atlasDataSource` slot is connected and WebGL exists, the lazy
 * MapLibre engine mounts into `[data-map-mount]` above it and the graticule hides once the
 * vector line network has loaded. The status line says honestly which state applies.
 */
export function MapCanvas({ region }: MapCanvasProps) {
  const m = useMessages();
  const { atlasDataSource } = useShellSlots();
  const bundle = useAtlasBundle(region);
  const engine = useAtlasUi((ui) => ui.mapStatus);
  const engineError = useAtlasUi((ui) => ui.mapError);
  const state = mapState(atlasDataSource !== undefined, bundle, engine);
  const preset = REGION_PRESETS[region];
  const { west, south, east, north } = preset.bounds;
  const center = presetCenter(preset);
  const p = project(preset);

  // Draw the grid well beyond the preset so a "slice" fit never shows an empty edge.
  const padLon = east - west;
  const padLat = north - south;
  const lons = steps(west - padLon, east + padLon, preset.minorStep);
  const lats = steps(south - padLat, north + padLat, preset.minorStep);
  const x0 = p.x(west);
  const y0 = p.y(north);
  const width = p.x(east) - x0;
  const height = p.y(south) - y0;
  const font = height / 64;
  const gx0 = p.x(west - padLon);
  const gx1 = p.x(east + padLon);
  const gy0 = p.y(north + padLat);
  const gy1 = p.y(south - padLat);

  return (
    <div className={styles.root} data-region={region} data-map-state={state}>
      <svg
        className={styles.grid}
        viewBox={`${x0} ${y0} ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`${m.shell.mapLabel} · ${m.regions[region].name}`}
      >
        <title>{m.map.presetNote}</title>
        {lons.map((lon) => (
          <line
            key={`lon-${lon}`}
            x1={p.x(lon)}
            x2={p.x(lon)}
            y1={gy0}
            y2={gy1}
            className={isMajor(lon, preset.majorStep) ? styles.major : styles.minor}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lats.map((lat) => (
          <line
            key={`lat-${lat}`}
            x1={gx0}
            x2={gx1}
            y1={p.y(lat)}
            y2={p.y(lat)}
            className={isMajor(lat, preset.majorStep) ? styles.major : styles.minor}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <rect
          x={x0}
          y={y0}
          width={width}
          height={height}
          className={styles.extent}
          vectorEffect="non-scaling-stroke"
        />
        {lons
          .filter((lon) => isMajor(lon, preset.majorStep) && lon >= west && lon <= east)
          .map((lon) => (
            <text
              key={`lon-label-${lon}`}
              x={p.x(lon) + font * 0.3}
              y={p.y(center.lat) - font * 0.4}
              fontSize={font}
              className={styles.label}
            >
              {fmt(lon, 'E', 'W')}
            </text>
          ))}
        {lats
          .filter((lat) => isMajor(lat, preset.majorStep) && lat >= south && lat <= north)
          .map((lat) => (
            <text
              key={`lat-label-${lat}`}
              x={p.x(center.lon) + font * 0.3}
              y={p.y(lat) - font * 0.4}
              fontSize={font}
              className={styles.label}
            >
              {fmt(lat, 'N', 'S')}
            </text>
          ))}
        <g className={styles.crosshair}>
          <circle
            cx={p.x(center.lon)}
            cy={p.y(center.lat)}
            r={font * 0.9}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={p.x(center.lon) - font * 1.8}
            x2={p.x(center.lon) + font * 1.8}
            y1={p.y(center.lat)}
            y2={p.y(center.lat)}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={p.x(center.lon)}
            x2={p.x(center.lon)}
            y1={p.y(center.lat) - font * 1.8}
            y2={p.y(center.lat) + font * 1.8}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      <div
        className={styles.mount}
        data-map-mount="maplibre"
        aria-hidden={atlasDataSource === undefined ? true : undefined}
      >
        <AtlasMapLayer region={region} />
      </div>
      <p className={styles.status} role="status" data-map-status={state}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span>
          <strong>{statusText(m, state, region, bundle, engineError)}</strong>
          <span className={styles.statusDetail}>
            {' '}
            · {m.map.viewCenter} {fmt(center.lat, 'N', 'S')} {fmt(center.lon, 'E', 'W')} ·{' '}
            {m.map.presetNote}
          </span>
        </span>
      </p>
    </div>
  );
}
