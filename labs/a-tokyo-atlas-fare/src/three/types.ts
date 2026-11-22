import type { SchematicTierId } from '../domain/elevationSolver.js';
import type { SkId } from '../domain/types.js';

export interface UrbanBuildingRecord {
  id: number;
  cx: number;
  cz: number;
  w: number;
  d: number;
  a: number; // radians orientation
  h: number; // meters
  hb: 'o' | 'l' | 'i' | 'p'; // osm height | osm levels | osm inferred | procedural schematic infill
  t: 'c' | 'o' | 'r' | 's'; // commercial | office | residential | station/civic
  p?: [number, number][]; // optional simplified footprint relative to (cx, cz)
}

export interface UrbanChunkData {
  key: string;
  cx: number;
  cz: number;
  hub: boolean;
  buildings: UrbanBuildingRecord[];
}

export interface UrbanChunkMeta {
  key: string;
  cx: number;
  cz: number;
  file: string;
  hub: boolean;
  count: number;
  realCount?: number;
  infillCount?: number;
  centerX: number;
  centerZ: number;
}

export interface UrbanLandmarkRecord {
  id: string;
  nameJa: string;
  nameEn: string;
  kind:
    | 'lattice_tower_orange'
    | 'skytree_tower'
    | 'twin_stepped_tower'
    | 'cocoon_ellipsoid'
    | 'glass_stepped_hub'
    | 'tiered_cultural_tower'
    | 'heritage_brick_station'
    | 'octagonal_crown_tower'
    | 'slab_skyscraper'
    | 'triple_stepped_tower'
    | 'marunouchi_tower'
    | 'intercity_trio'
    | 'stepped_stream_tower';
  lon: number;
  lat: number;
  x: number;
  z: number;
  height: number;
  width?: number;
  depth?: number;
  radius?: number;
  heightBasis: string;
}

export interface UrbanCoverageDiagnostics {
  osmExplicitHeight: number;
  osmLevels: number;
  osmInferred: number;
  schematicInfill: number;
  totalRealOsm: number;
  landuseBlocks: number;
  roadSegments: number;
  parks: number;
  waterBodies: number;
}

export interface UrbanManifest {
  generatedAt: string;
  license: string;
  licenseNotice: string;
  chunkSizeMeters: number;
  origin: { lon: number; lat: number };
  totalChunks: number;
  totalBuildings: number;
  totalDetailedFootprints: number;
  coverage?: UrbanCoverageDiagnostics;
  chunks: UrbanChunkMeta[];
}

export interface UrbanLanduseBlock {
  kind: 'commercial' | 'residential' | 'industrial' | 'railway';
  pts: [number, number][];
}

export interface UrbanStationPlaza {
  x: number;
  z: number;
  rx: number;
  rz: number;
  a: number;
}

export interface UrbanBaseEnvironment {
  generatedAt: string;
  license: string;
  origin: { lon: number; lat: number };
  waterPolygons: { name: string | null; pts: [number, number][] }[];
  riverLines: { name: string | null; width: number; pts: [number, number][] }[];
  parkPolygons: { name: string | null; pts: [number, number][] }[];
  landuseBlocks?: UrbanLanduseBlock[];
  stationPlazas?: UrbanStationPlaza[];
  plazaPolygons?: { pts: [number, number][] }[];
  railCorridors?: { width: number; pts: [number, number][] }[];
  roads: { hw: string; w: number; el: number; pts: [number, number][] }[];
  intersections: [number, number, number][];
  landmarks: UrbanLandmarkRecord[];
}

export interface UndergroundViewSettings {
  enabled: boolean;
  groundOpacity: number; // 0..1
  hideBuildings: boolean;
  clipEnabled: boolean;
  clipY: number; // -45 .. +35
  visibleTiers: Record<SchematicTierId, boolean>;
}

export interface LineTraceStatus {
  active: boolean;
  playing: boolean;
  lineId: SkId<'line'> | null;
  progress: number; // 0..1
  currentStationName: string | null;
  currentTier: SchematicTierId | null;
  currentY: number | null;
}

export interface SceneTelemetry {
  loadedChunks: number;
  totalChunks: number;
  renderedBuildings: number;
  lod0Chunks: number;
  lod1Chunks: number;
  deconflictedCrossings: number;
  tunnelPortals: number;
  fps: number;
  drawCalls: number;
  triangles: number;
  loadTimeMs: number | null;
  realOsmBuildings?: number;
  infillBuildings?: number;
  railwayLod?: 'near' | 'mid' | 'far';
}
