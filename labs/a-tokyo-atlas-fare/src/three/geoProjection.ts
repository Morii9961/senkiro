/**
 * Unified Metric Local Tangent-Plane Projection for Tokyo Metropolitan 3D Atlas.
 *
 * Right-handed Three.js coordinate convention:
 *   +X = East (meters)
 *   +Y = Up   (schematic elevation units; ground = 0)
 *   -Z = North (meters; +Z = South)
 *
 * Origin (0, 0, 0) = Tokyo Station (139.7671°E, 35.6812°N).
 * Parameterizable via `ProjectionOrigin` so SENKIRO can migrate directly to Osaka, Nagoya, etc.
 */

export interface ProjectionOrigin {
  readonly lon: number;
  readonly lat: number;
  readonly label: string;
}

export const TOKYO_ORIGIN: ProjectionOrigin = {
  lon: 139.7671,
  lat: 35.6812,
  label: 'Tokyo Station',
};

const METERS_PER_DEG_LAT = 111_132.95;
const METERS_PER_DEG_LON_AT_EQ = 111_319.49;

export const CHUNK_SIZE_METERS = 2000;

export function lonLatToWorld(
  lon: number,
  lat: number,
  origin: ProjectionOrigin = TOKYO_ORIGIN,
): { x: number; z: number } {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const x = (lon - origin.lon) * METERS_PER_DEG_LON_AT_EQ * cosLat;
  const z = -(lat - origin.lat) * METERS_PER_DEG_LAT;
  return { x, z };
}

export function worldToLonLat(
  x: number,
  z: number,
  origin: ProjectionOrigin = TOKYO_ORIGIN,
): [number, number] {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const lon = origin.lon + x / (METERS_PER_DEG_LON_AT_EQ * cosLat);
  const lat = origin.lat - z / METERS_PER_DEG_LAT;
  return [lon, lat];
}

export function worldToChunkCoords(x: number, z: number): { cx: number; cz: number } {
  return {
    cx: Math.floor(x / CHUNK_SIZE_METERS),
    cz: Math.floor(z / CHUNK_SIZE_METERS),
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}

export interface CameraHubPreset {
  id: string;
  labelJa: string;
  labelZh: string;
  labelEn: string;
  lon: number;
  lat: number;
  targetY: number;
  distance: number;
  polarDeg: number;
  azimuthDeg: number;
  recommendUnderground?: boolean;
}

export const TOKYO_HUB_PRESETS: CameraHubPreset[] = [
  {
    id: 'shibuya',
    labelJa: '渋谷（銀3F＋地上＋地下多層）',
    labelZh: '涩谷（银座线3F＋地面＋地下多层）',
    labelEn: 'Shibuya (Ginza 3F + Surface + Deep)',
    lon: 139.7016,
    lat: 35.6580,
    targetY: -4,
    distance: 620,
    polarDeg: 62,
    azimuthDeg: -38,
    recommendUnderground: true,
  },
  {
    id: 'shinjuku',
    labelJa: '新宿（地上大幹線＋大江戸線深層）',
    labelZh: '新宿（地面干线＋大江户线深层）',
    labelEn: 'Shinjuku (Surface Hub + Deep Oedo)',
    lon: 139.7004,
    lat: 35.6896,
    targetY: -6,
    distance: 780,
    polarDeg: 58,
    azimuthDeg: -25,
    recommendUnderground: true,
  },
  {
    id: 'tokyo',
    labelJa: '東京・大手町（高架＋地下交差）',
    labelZh: '东京・大手町（高架＋地下交错）',
    labelEn: 'Tokyo & Otemachi (Viaduct + Subways)',
    lon: 139.7662,
    lat: 35.6826,
    targetY: -6,
    distance: 840,
    polarDeg: 56,
    azimuthDeg: 32,
    recommendUnderground: true,
  },
  {
    id: 'shinagawa',
    labelJa: '品川（幹線・新幹線・京急）',
    labelZh: '品川（干线・新干线・京急）',
    labelEn: 'Shinagawa Corridor',
    lon: 139.7390,
    lat: 35.6285,
    targetY: 4,
    distance: 750,
    polarDeg: 56,
    azimuthDeg: -20,
  },
  {
    id: 'ikebukuro',
    labelJa: '池袋（JR・私鉄・副都心深層）',
    labelZh: '池袋（JR＋私铁＋副都心深层）',
    labelEn: 'Ikebukuro Multi-Operator Hub',
    lon: 139.7109,
    lat: 35.7295,
    targetY: -4,
    distance: 720,
    polarDeg: 58,
    azimuthDeg: 18,
  },
  {
    id: 'tokyo23',
    labelJa: '都心23区 全景',
    labelZh: '东京都心23区 全景',
    labelEn: 'Tokyo 23 Wards Overview',
    lon: 139.7400,
    lat: 35.6815,
    targetY: 0,
    distance: 6800,
    polarDeg: 52,
    azimuthDeg: -14,
  },
];
