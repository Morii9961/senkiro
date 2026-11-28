/**
 * The MapLibre GL JS v5 engine for SENKIRO Atlas — a lazy chunk (with `maplibre-gl`, its
 * stylesheet and `pmtiles`), never part of the shell entry.
 *
 * Draws the four spec §3.2 layers from the bundle's PMTiles archive through the
 * `pmtiles://` protocol, or from the bundle's `trackGraph` when it has no published tiles.
 * Theme, language, operator filter and URL selection are applied with `setStyle(…, {diff})`;
 * a region switch flies the camera to the new region while the data source is swapped.
 */
import type { AppRegion, AppTheme, Locale } from '@senkiro/contracts';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { useEffect, useMemo, useRef } from 'react';
import { REGION_PRESETS } from '../../data/regions.ts';
import type { RegionalAtlasBundle } from '../../slots/slots.tsx';
import styles from './atlas.module.css';
import { type AtlasGeoJson, buildAtlasGeoJson } from './atlas-geojson.ts';
import { type AtlasIndex, lineBounds } from './atlas-index.ts';
import { type AtlasPick, pickFromFeature } from './atlas-pick.ts';
import type { AtlasMapStatus } from './atlas-store.ts';
import {
  ATLAS_CJK_FONT_FAMILIES,
  ATLAS_CLICK_LAYERS,
  type AtlasSelection,
  type AtlasSource,
  absoluteTileUrl,
  buildAtlasStyle,
} from './atlas-style.ts';

export interface AtlasMapViewProps {
  /** `null` while the region's bundle is loading or unavailable: the map stays, empty. */
  bundle: RegionalAtlasBundle | null;
  index: AtlasIndex | null;
  region: AppRegion;
  theme: AppTheme;
  lang: Locale;
  hiddenOperatorIds: readonly string[];
  selection: AtlasSelection;
  onStatus: (status: AtlasMapStatus, error?: string) => void;
  onPick: (pick: AtlasPick) => void;
}

const EMPTY_GEOJSON: AtlasGeoJson = {
  rail_segments: { type: 'FeatureCollection', features: [] },
  rail_stations: { type: 'FeatureCollection', features: [] },
  station_complexes: { type: 'FeatureCollection', features: [] },
  through_boundaries: { type: 'FeatureCollection', features: [] },
};

let pmtilesProtocol: Protocol | null = null;

/** Registers `pmtiles://` once per page (MapLibre keeps protocols globally). */
function ensurePmtilesProtocol(): void {
  if (pmtilesProtocol === null) {
    pmtilesProtocol = new Protocol();
    maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
  }
}

function regionBounds(region: AppRegion): [[number, number], [number, number]] {
  const { west, south, east, north } = REGION_PRESETS[region].bounds;
  return [
    [west, south],
    [east, north],
  ];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function AtlasMapView({
  bundle,
  index,
  region,
  theme,
  lang,
  hiddenOperatorIds,
  selection,
  onStatus,
  onPick,
}: AtlasMapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const callbacks = useRef({ onStatus, onPick });
  callbacks.current = { onStatus, onPick };

  const source = useMemo<AtlasSource>(() => {
    if (bundle !== null && index !== null && bundle.pmtilesUrl !== '') {
      return { kind: 'pmtiles', url: absoluteTileUrl(bundle.pmtilesUrl, document.baseURI) };
    }
    return {
      kind: 'geojson',
      data: bundle !== null && index !== null ? buildAtlasGeoJson(index) : EMPTY_GEOJSON,
    };
  }, [bundle, index]);

  const attribution = useMemo(
    () =>
      (bundle?.trackGraph.sources ?? [])
        .map((record) => record.attributionText)
        .filter((text) => text.trim() !== '')
        .join(' | '),
    [bundle],
  );

  const { lineId, stationId, complexId } = selection;
  const style = useMemo(
    () =>
      buildAtlasStyle({
        theme,
        lang,
        source,
        hiddenOperatorIds,
        selection: {
          ...(lineId === undefined ? {} : { lineId }),
          ...(stationId === undefined ? {} : { stationId }),
          ...(complexId === undefined ? {} : { complexId }),
        },
        attribution,
      }),
    [theme, lang, source, hiddenOperatorIds, lineId, stationId, complexId, attribution],
  );
  const latestStyle = useRef(style);
  latestStyle.current = style;
  const initialRegion = useRef(region);
  const initialLang = useRef(lang);

  // Create the map once; everything else is applied to the live instance.
  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return undefined;
    }
    ensurePmtilesProtocol();
    callbacks.current.onStatus('loading');
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: element,
        style: latestStyle.current,
        bounds: regionBounds(initialRegion.current),
        fitBoundsOptions: { padding: 32 },
        minZoom: 5,
        maxZoom: 17,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        // Bottom-left: the shell's status line owns the bottom-right corner.
        attributionControl: false,
        localIdeographFontFamily: ATLAS_CJK_FONT_FAMILIES[initialLang.current],
      });
    } catch (error) {
      callbacks.current.onStatus('error', errorText(error));
      return undefined;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    mapRef.current = map;
    map.on('load', () => {
      loaded.current = true;
      callbacks.current.onStatus('ready');
    });
    // A listener also stops MapLibre from logging the error to the console itself.
    map.on('error', (event) => {
      callbacks.current.onStatus('error', errorText(event.error));
    });
    const layersAt = (point: maplibregl.Point) => {
      const pad = 6;
      const layers = ATLAS_CLICK_LAYERS.filter((id) => map.getLayer(id) !== undefined);
      return map.queryRenderedFeatures(
        [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ],
        { layers: [...layers] },
      );
    };
    map.on('click', (event) => {
      const features = layersAt(event.point);
      for (const layer of ATLAS_CLICK_LAYERS) {
        const feature = features.find((candidate) => candidate.layer.id === layer);
        const pick =
          feature === undefined ? null : pickFromFeature(layer, feature.properties ?? {});
        if (pick !== null) {
          callbacks.current.onPick(pick);
          return;
        }
      }
    });
    map.on('mousemove', (event) => {
      map.getCanvas().style.cursor = layersAt(event.point).length > 0 ? 'pointer' : '';
    });
    return () => {
      loaded.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // A language switch also swaps the CJK font (Japanese vs Simplified Chinese glyph forms).
  const styledLang = useRef(lang);
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    if (styledLang.current === lang) {
      map.setStyle(style, { diff: true });
    } else {
      styledLang.current = lang;
      map.setStyle(style, { diff: true, localIdeographFontFamily: ATLAS_CJK_FONT_FAMILIES[lang] });
    }
  }, [style, lang]);

  // Region switch: fly to the region preset while the new source loads.
  const lastRegion = useRef(region);
  useEffect(() => {
    if (lastRegion.current === region) {
      return;
    }
    lastRegion.current = region;
    mapRef.current?.fitBounds(regionBounds(region), { padding: 32, duration: 1200 });
  }, [region]);

  // Bring a URL selection into view (also restores the view from a shared link).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || index === null) {
      return;
    }
    const target =
      stationId === undefined
        ? complexId === undefined
          ? null
          : (index.complexes.get(complexId)?.coordinates ?? null)
        : (index.stations.get(stationId)?.coordinates ?? null);
    if (target !== null) {
      map.easeTo({ center: target, zoom: Math.max(map.getZoom(), 13), duration: 800 });
      return;
    }
    if (lineId !== undefined) {
      const bounds = lineBounds(index, lineId);
      if (bounds !== null) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 64, maxZoom: 14, duration: 900 },
        );
      }
    }
  }, [index, stationId, complexId, lineId]);

  return (
    <div
      ref={container}
      className={styles.mapView}
      data-atlas-map=""
      data-atlas-source={source.kind}
      data-atlas-region={region}
    />
  );
}
