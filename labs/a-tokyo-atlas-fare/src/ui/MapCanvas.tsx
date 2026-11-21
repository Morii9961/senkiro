import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  AtlasDataset,
  FareQuote,
  RailLine,
  SkId,
  Station,
  TrackSegment,
  TrackVerticalAttribute,
  VerticalClass,
} from '../domain/types.js';
import { UI_TEXT, type Locale } from './i18n.js';

export type MapViewMode = 'geo' | '3d';

interface MapCanvasProps {
  dataset: AtlasDataset;
  viewMode: MapViewMode;
  theme: 'light' | 'dark';
  locale: Locale;
  visibleOperatorIds: Set<SkId<'operator'>>;
  selectedLineId: SkId<'line'> | null;
  selectedStationId: SkId<'station'> | null;
  fareSliceOnly: boolean;
  fareQuote: FareQuote | null;
  originStationId: SkId<'station'> | null;
  destStationId: SkId<'station'> | null;
  viaStationId: SkId<'station'> | null;
  verticalMap: Map<string, TrackVerticalAttribute>;
  verticalLoading: boolean;
  focusCoords: [number, number] | null;
  onSelectStation: (stationId: SkId<'station'>) => void;
  onSelectLine: (lineId: SkId<'line'>) => void;
}

/**
 * Generates a thin ribbon Polygon around a polyline for MapLibre 3D fill-extrusion
 * so elevated tracks visibly float above ground level in 3D view.
 */
function lineToRibbonPolygon(
  coords: [number, number][],
  halfWidthDeg = 0.00028,
): [number, number][][] | null {
  if (coords.length < 2) return null;
  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < coords.length; i++) {
    const prev = coords[Math.max(0, i - 1)]!;
    const next = coords[Math.min(coords.length - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfWidthDeg;
    const ny = (dx / len) * halfWidthDeg;
    const cur = coords[i]!;
    left.push([cur[0] + nx, cur[1] + ny]);
    right.push([cur[0] - nx, cur[1] - ny]);
  }
  const ring = [...left, ...right.reverse(), left[0]!];
  return [ring];
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  dataset,
  viewMode,
  theme,
  locale,
  visibleOperatorIds,
  selectedLineId,
  selectedStationId,
  fareSliceOnly,
  fareQuote,
  originStationId,
  destStationId,
  viaStationId,
  verticalMap,
  verticalLoading,
  focusCoords,
  onSelectStation,
  onSelectLine,
}) => {
  const t = UI_TEXT[locale];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    title: string;
    subtitle: string;
    extra?: string;
  } | null>(null);

  const lineById = useMemo(
    () => new Map<SkId<'line'>, RailLine>(dataset.railLines.map((l) => [l.id, l])),
    [dataset],
  );
  const operatorById = useMemo(
    () => new Map(dataset.operators.map((o) => [o.id, o])),
    [dataset],
  );
  const segmentById = useMemo(
    () => new Map<SkId<'segment'>, TrackSegment>(dataset.trackSegments.map((s) => [s.id, s])),
    [dataset],
  );
  const stationById = useMemo(
    () => new Map<SkId<'station'>, Station>(dataset.stations.map((s) => [s.id, s])),
    [dataset],
  );

  // Build filtered GeoJSON collections
  const { tracksGeoJson, elevatedRibbonsGeoJson, stationsGeoJson } = useMemo(() => {
    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const ribbonFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    for (const seg of dataset.trackSegments) {
      if (!visibleOperatorIds.has(seg.operatorId)) continue;
      const primaryLine = lineById.get(seg.railLineIds[0]!);
      if (fareSliceOnly && !primaryLine?.inFareSlice) continue;

      const isSelected =
        selectedLineId !== null && seg.railLineIds.includes(selectedLineId);
      const dimmed = selectedLineId !== null && !isSelected;

      const vert = verticalMap.get(seg.id);
      const verticalClass: VerticalClass = vert?.verticalClass ?? 'unknown';
      const verticalOrder = vert?.verticalOrder ?? 0;

      const color = primaryLine?.color ?? '#64748b';
      const opName = operatorById.get(seg.operatorId)?.names.ja ?? seg.operatorId;

      lineFeatures.push({
        type: 'Feature',
        properties: {
          segmentId: seg.id,
          lineId: primaryLine?.id ?? '',
          lineNameJa: primaryLine?.names.ja ?? '',
          lineNameEn: primaryLine?.names.en ?? '',
          operatorName: opName,
          color,
          operatingKm: seg.operatingKm,
          isShinkansen: seg.isShinkansen ? 1 : 0,
          selected: isSelected ? 1 : 0,
          dimmed: dimmed ? 1 : 0,
          verticalClass,
          verticalOrder,
        },
        geometry: {
          type: 'LineString',
          coordinates: seg.geometry,
        },
      });

      if (viewMode === '3d' && verticalClass === 'elevated') {
        const poly = lineToRibbonPolygon(seg.geometry, isSelected ? 0.00042 : 0.00026);
        if (poly) {
          const baseH = Math.max(25, 45 + verticalOrder * 10);
          ribbonFeatures.push({
            type: 'Feature',
            properties: {
              segmentId: seg.id,
              lineId: primaryLine?.id ?? '',
              color,
              baseHeight: baseH,
              topHeight: baseH + 18,
              opacity: dimmed ? 0.2 : 0.9,
            },
            geometry: {
              type: 'Polygon',
              coordinates: poly,
            },
          });
        }
      }
    }

    const stationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const st of dataset.stations) {
      if (!visibleOperatorIds.has(st.operatorId)) continue;
      if (fareSliceOnly && !st.inFareSlice) continue;

      const isSelected = st.id === selectedStationId;
      const isOnSelectedLine =
        selectedLineId !== null && st.railLineIds.includes(selectedLineId);
      const isOrigin = st.id === originStationId;
      const isDest = st.id === destStationId;
      const isVia = st.id === viaStationId;
      const primaryLine = lineById.get(st.railLineIds[0]!);

      stationFeatures.push({
        type: 'Feature',
        properties: {
          stationId: st.id,
          nameJa: st.names.ja ?? '',
          nameEn: st.names.en ?? '',
          code: st.stationCode ?? '',
          operatorName: operatorById.get(st.operatorId)?.names.ja ?? '',
          color: primaryLine?.color ?? '#334155',
          inFareSlice: st.inFareSlice ? 1 : 0,
          isHub: st.railLineIds.length > 1 ? 1 : 0,
          isSelected: isSelected ? 1 : 0,
          isOnSelectedLine: isOnSelectedLine ? 1 : 0,
          role: isOrigin ? 'origin' : isDest ? 'dest' : isVia ? 'via' : 'normal',
        },
        geometry: {
          type: 'Point',
          coordinates: st.coordinates,
        },
      });
    }

    return {
      tracksGeoJson: {
        type: 'FeatureCollection' as const,
        features: lineFeatures,
      },
      elevatedRibbonsGeoJson: {
        type: 'FeatureCollection' as const,
        features: ribbonFeatures,
      },
      stationsGeoJson: {
        type: 'FeatureCollection' as const,
        features: stationFeatures,
      },
    };
  }, [
    dataset,
    visibleOperatorIds,
    selectedLineId,
    selectedStationId,
    fareSliceOnly,
    originStationId,
    destStationId,
    viaStationId,
    verticalMap,
    viewMode,
    lineById,
    operatorById,
  ]);

  // Build actualPath & billedPath GeoJSON overlays
  const { actualPathGeoJson, billedPathGeoJson } = useMemo(() => {
    const toFeatures = (segIds: SkId<'segment'>[] | undefined): GeoJSON.Feature<GeoJSON.LineString>[] => {
      if (!segIds) return [];
      const out: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      for (const sid of segIds) {
        const seg = segmentById.get(sid);
        if (!seg) continue;
        out.push({
          type: 'Feature',
          properties: { segmentId: sid },
          geometry: { type: 'LineString', coordinates: seg.geometry },
        });
      }
      return out;
    };

    return {
      actualPathGeoJson: {
        type: 'FeatureCollection' as const,
        features: toFeatures(fareQuote?.actualPath?.segmentIds),
      },
      billedPathGeoJson: {
        type: 'FeatureCollection' as const,
        features: toFeatures(fareQuote?.billedPath?.segmentIds),
      },
    };
  }, [fareQuote, segmentById]);

  // Initialize MapLibre once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [139.745, 35.685],
      zoom: 11.4,
      minZoom: 8,
      maxZoom: 17,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          gsiPale: {
            type: 'raster',
            tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '地理院タイル（国土地理院） | 国土数値情報 N02-24 | ODPT 都営GTFS',
          },
          tracks: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          elevatedRibbons: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          actualPath: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          billedPath: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          stations: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': theme === 'dark' ? '#101822' : '#eef2f6' },
          },
          {
            id: 'gsi-basemap',
            type: 'raster',
            source: 'gsiPale',
            paint: {
              'raster-opacity': theme === 'dark' ? 0.24 : 0.72,
              'raster-saturation': theme === 'dark' ? -0.8 : -0.35,
            },
          },
          // 2D / Ground tracks
          {
            id: 'tracks-underground',
            type: 'line',
            source: 'tracks',
            filter: ['==', ['get', 'verticalClass'], 'underground'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['case', ['==', ['get', 'selected'], 1], 5.5, 3],
              'line-dasharray': [2.2, 1.4],
              'line-opacity': ['case', ['==', ['get', 'dimmed'], 1], 0.18, 0.78],
            },
          },
          {
            id: 'tracks-surface',
            type: 'line',
            source: 'tracks',
            filter: ['!=', ['get', 'verticalClass'], 'underground'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': [
                'case',
                ['==', ['get', 'selected'], 1],
                6,
                ['==', ['get', 'isShinkansen'], 1],
                4.2,
                3.2,
              ],
              'line-opacity': ['case', ['==', ['get', 'dimmed'], 1], 0.2, 0.92],
            },
          },
          // 3D Elevated viaduct extrusions (visible when viewMode === '3d')
          {
            id: 'tracks-3d-elevated',
            type: 'fill-extrusion',
            source: 'elevatedRibbons',
            paint: {
              'fill-extrusion-color': ['get', 'color'],
              'fill-extrusion-base': ['get', 'baseHeight'],
              'fill-extrusion-height': ['get', 'topHeight'],
              'fill-extrusion-opacity': ['get', 'opacity'],
            },
          },
          // Fare comparison overlays (Billed path solid cyan + Actual path dashed orange)
          {
            id: 'billed-path-glow',
            type: 'line',
            source: 'billedPath',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0284c7',
              'line-width': 9,
              'line-opacity': 0.3,
            },
          },
          {
            id: 'billed-path-line',
            type: 'line',
            source: 'billedPath',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0284c7',
              'line-width': 5,
              'line-opacity': 0.95,
            },
          },
          {
            id: 'actual-path-line',
            type: 'line',
            source: 'actualPath',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#ea580c',
              'line-width': 4.5,
              'line-dasharray': [2.5, 1.8],
              'line-opacity': 0.98,
            },
          },
          // Stations
          {
            id: 'stations-circle',
            type: 'circle',
            source: 'stations',
            paint: {
              'circle-radius': [
                'case',
                ['!=', ['get', 'role'], 'normal'],
                8,
                ['==', ['get', 'isSelected'], 1],
                7.5,
                ['==', ['get', 'isOnSelectedLine'], 1],
                5.5,
                ['==', ['get', 'isHub'], 1],
                4.8,
                3.4,
              ],
              'circle-color': [
                'match',
                ['get', 'role'],
                'origin',
                '#16a34a',
                'dest',
                '#dc2626',
                'via',
                '#d97706',
                '#ffffff',
              ],
              'circle-stroke-color': [
                'case',
                ['==', ['get', 'isSelected'], 1],
                '#0c6e78',
                ['get', 'color'],
              ],
              'circle-stroke-width': [
                'case',
                ['!=', ['get', 'role'], 'normal'],
                2.8,
                ['==', ['get', 'isSelected'], 1],
                3,
                1.8,
              ],
            },
          },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Suppress non-fatal offline raster tile errors so headless/offline renders stay clean
    map.on('error', () => {
      // Ignore tile fetch errors when offline
    });

    map.on('load', () => {
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Wire click & hover handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handleStationClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const sid = f?.properties?.stationId as SkId<'station'> | undefined;
      if (sid) {
        onSelectStation(sid);
      }
    };

    const handleTrackClick = (e: maplibregl.MapLayerMouseEvent) => {
      // Prioritize station clicks if overlapping
      const stHits = map.queryRenderedFeatures(e.point, { layers: ['stations-circle'] });
      if (stHits.length > 0) return;
      const f = e.features?.[0];
      const lid = f?.properties?.lineId as SkId<'line'> | undefined;
      if (lid) {
        onSelectLine(lid);
      }
    };

    const handleStationMove = (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0]?.properties;
      if (p) {
        setHoverInfo({
          title: `${p.nameJa}${p.nameEn ? ` · ${p.nameEn}` : ''}`,
          subtitle: `${p.operatorName}${p.code ? ` (${p.code})` : ''}`,
        });
      }
    };

    const handleTrackMove = (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0]?.properties;
      if (p) {
        const kmText =
          p.operatingKm !== null && p.operatingKm !== undefined && p.operatingKm !== 'null'
            ? `営業キロ: ${p.operatingKm} km`
            : '営業キロ: 未知';
        const vertText =
          viewMode === '3d' ? ` · 縦断(模式): ${p.verticalClass}` : '';
        setHoverInfo({
          title: String(p.lineNameJa || p.lineId),
          subtitle: String(p.operatorName || ''),
          extra: `${kmText}${vertText}`,
        });
      }
    };

    const handleLeave = () => {
      map.getCanvas().style.cursor = '';
      setHoverInfo(null);
    };

    map.on('click', 'stations-circle', handleStationClick);
    map.on('click', 'tracks-surface', handleTrackClick);
    map.on('click', 'tracks-underground', handleTrackClick);
    map.on('mousemove', 'stations-circle', handleStationMove);
    map.on('mousemove', 'tracks-surface', handleTrackMove);
    map.on('mousemove', 'tracks-underground', handleTrackMove);
    map.on('mouseleave', 'stations-circle', handleLeave);
    map.on('mouseleave', 'tracks-surface', handleLeave);
    map.on('mouseleave', 'tracks-underground', handleLeave);

    return () => {
      map.off('click', 'stations-circle', handleStationClick);
      map.off('click', 'tracks-surface', handleTrackClick);
      map.off('click', 'tracks-underground', handleTrackClick);
      map.off('mousemove', 'stations-circle', handleStationMove);
      map.off('mousemove', 'tracks-surface', handleTrackMove);
      map.off('mousemove', 'tracks-underground', handleTrackMove);
      map.off('mouseleave', 'stations-circle', handleLeave);
      map.off('mouseleave', 'tracks-surface', handleLeave);
      map.off('mouseleave', 'tracks-underground', handleLeave);
    };
  }, [mapReady, onSelectStation, onSelectLine, viewMode]);

  // Update GeoJSON sources when data/filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource('tracks') as maplibregl.GeoJSONSource | undefined)?.setData(tracksGeoJson);
    (map.getSource('elevatedRibbons') as maplibregl.GeoJSONSource | undefined)?.setData(
      elevatedRibbonsGeoJson,
    );
    (map.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(stationsGeoJson);
    (map.getSource('actualPath') as maplibregl.GeoJSONSource | undefined)?.setData(
      actualPathGeoJson,
    );
    (map.getSource('billedPath') as maplibregl.GeoJSONSource | undefined)?.setData(
      billedPathGeoJson,
    );
  }, [
    mapReady,
    tracksGeoJson,
    elevatedRibbonsGeoJson,
    stationsGeoJson,
    actualPathGeoJson,
    billedPathGeoJson,
  ]);

  // Switch theme colors cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setPaintProperty('background', 'background-color', theme === 'dark' ? '#101822' : '#eef2f6');
    map.setPaintProperty('gsi-basemap', 'raster-opacity', theme === 'dark' ? 0.24 : 0.72);
  }, [mapReady, theme]);

  // Switch 2D Geo vs 3D Stereoscopic pitch & styling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (viewMode === '3d') {
      map.easeTo({ pitch: 58, bearing: -18, duration: 500 });
      map.setPaintProperty('tracks-underground', 'line-opacity', 0.55);
      map.setPaintProperty('tracks-underground', 'line-color', '#7c3aed');
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
      map.setPaintProperty('tracks-underground', 'line-color', ['get', 'color']);
      map.setPaintProperty('tracks-underground', 'line-opacity', [
        'case',
        ['==', ['get', 'dimmed'], 1],
        0.18,
        0.82,
      ]);
    }
  }, [mapReady, viewMode]);

  // Fly to focused station when searched/clicked in sidebar
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusCoords) return;
    map.easeTo({
      center: focusCoords,
      zoom: Math.max(map.getZoom(), 13),
      duration: 450,
    });
  }, [mapReady, focusCoords]);

  // Fit bounds smoothly to fare paths when a new quote is calculated
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !fareQuote?.actualPath) return;
    const coords: [number, number][] = [];
    for (const sid of fareQuote.actualPath.stationIds) {
      const st = stationById.get(sid);
      if (st) coords.push(st.coordinates);
    }
    if (fareQuote.billedPath) {
      for (const sid of fareQuote.billedPath.stationIds) {
        const st = stationById.get(sid);
        if (st) coords.push(st.coordinates);
      }
    }
    if (coords.length >= 2) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0]!, coords[0]!),
      );
      map.fitBounds(bounds, { padding: 70, duration: 500, maxZoom: 13.5 });
    }
  }, [mapReady, fareQuote, stationById]);

  return (
    <div className="canvas-pane" data-testid="map-canvas-pane">
      <div
        ref={containerRef}
        className="map-container"
        aria-label={locale === 'ja' ? '東京鉄道路線図マップ' : 'Tokyo Railway Interactive Map'}
      />

      {/* Top Overlays: 3D schematic honesty banner & actual vs billed path diff banner */}
      <div className="map-overlay-top">
        {viewMode === '3d' && (
          <div className="banner banner-warning" data-testid="vertical-3d-banner">
            <span>
              <strong>3D 模式表示 / Schematic 3D:</strong> {t.vertical3dBanner}
              {verticalLoading ? ' (loading osm-vertical.json...)' : ''}
            </span>
          </div>
        )}
        {fareQuote && fareQuote.pathsDiffer && (
          <div className="banner banner-ok" data-testid="path-diff-banner">
            <span>
              <strong>{t.pathsDifferBadge}:</strong> {fareQuote.pathDiffSummary}
            </span>
          </div>
        )}
      </div>

      {/* Bottom-left legend */}
      <div className="map-legend" aria-label="Map Legend">
        {fareQuote?.actualPath && (
          <>
            <div className="legend-row">
              <span className="swatch-dashed" />
              <span>
                {t.actualPathLabel} ({fareQuote.actualPath.totalOperatingKm ?? '?'} km)
              </span>
            </div>
            {fareQuote.billedPath && (
              <div className="legend-row">
                <span className="swatch-line" style={{ background: '#0284c7' }} />
                <span>
                  {t.billedPathLabel} ({fareQuote.billedPath.totalOperatingKm ?? '?'} km)
                </span>
              </div>
            )}
          </>
        )}
        {viewMode === '3d' && (
          <>
            <div className="legend-row">
              <span className="swatch-line" style={{ background: '#f59e0b', height: 6 }} />
              <span>高架 (elevated · 3D 立体押出)</span>
            </div>
            <div className="legend-row">
              <span className="swatch-line" style={{ background: '#378640' }} />
              <span>地上 (at_grade)</span>
            </div>
            <div className="legend-row">
              <span
                className="swatch-dashed"
                style={{ borderTopColor: '#7c3aed' }}
              />
              <span>地下 (underground · 破線模式)</span>
            </div>
            <div className="legend-row">
              <span
                className="swatch-dashed"
                style={{ borderTopColor: '#64748b' }}
              />
              <span>未確認 (unknown · 推測なし)</span>
            </div>
          </>
        )}
        {!fareQuote?.actualPath && viewMode === 'geo' && (
          <div className="muted">
            {locale === 'ja'
              ? '駅または路線をクリックして詳細表示・JR運賃計算へ入力'
              : 'Click any station or line to inspect details or set JR fare origin/destination'}
          </div>
        )}
      </div>

      {/* Bottom-right hover tooltip */}
      {hoverInfo && (
        <div className="hover-tooltip" role="status">
          <div style={{ fontWeight: 700 }}>{hoverInfo.title}</div>
          <div className="muted">{hoverInfo.subtitle}</div>
          {hoverInfo.extra && <div className="mono">{hoverInfo.extra}</div>}
        </div>
      )}
    </div>
  );
};
