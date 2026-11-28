/// <reference path="./geojson-vt.d.ts" />
import geojsonvtRaw from 'geojson-vt';

export interface GeoJsonVtFeatureCompat {
  geometry: unknown;
  type: 1 | 2 | 3;
  tags: Record<string, string | number | boolean | null>;
}

export interface GeoJsonVtTileCompat {
  features: GeoJsonVtFeatureCompat[];
}

export interface GeoJsonVtOptionsCompat {
  maxZoom?: number;
  tolerance?: number;
  extent?: number;
  buffer?: number;
  indexMaxZoom?: number;
  indexMaxPoints?: number;
}

export interface GeoJsonVtIndexCompat {
  getTile(z: number, x: number, y: number): GeoJsonVtTileCompat | null;
}

const geojsonvt = geojsonvtRaw as unknown as (
  data: unknown,
  options?: GeoJsonVtOptionsCompat,
) => GeoJsonVtIndexCompat;

export default geojsonvt;
