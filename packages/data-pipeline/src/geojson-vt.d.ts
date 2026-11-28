declare module 'geojson-vt' {
  export interface GeojsonVtFeature {
    geometry: unknown;
    type: 1 | 2 | 3;
    tags: Record<string, string | number | boolean | null>;
    id?: string | number;
  }

  export interface GeojsonVtTile {
    features: GeojsonVtFeature[];
    numPoints: number;
    numSimplified: number;
    numFeatures: number;
    source: unknown;
    x: number;
    y: number;
    z: number;
    transformed: boolean;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }

  export interface GeojsonVtOptions {
    maxZoom?: number;
    tolerance?: number;
    extent?: number;
    buffer?: number;
    debug?: 0 | 1 | 2;
    lineMetrics?: boolean;
    promoteId?: string;
    generateId?: boolean;
    indexMaxZoom?: number;
    indexMaxPoints?: number;
  }

  export interface GeojsonVtIndex {
    getTile(z: number, x: number, y: number): GeojsonVtTile | null;
  }

  export default function geojsonvt(data: unknown, options?: GeojsonVtOptions): GeojsonVtIndex;
}
