/**
 * Region-neutral local tangent-plane projection and great-circle distance.
 *
 * Right-handed convention shared by every SENKIRO 3D consumer:
 *   +X = east (metres), +Y = up (schematic elevation units), -Z = north (metres).
 *
 * There is deliberately no default origin: each city / region dataset supplies its own
 * {@link ProjectionOrigin}, so nothing in the core is anchored to one metropolis.
 */
import type { LonLat } from '@senkiro/contracts';

export interface ProjectionOrigin {
  readonly lon: number;
  readonly lat: number;
  readonly label: string;
}

export interface PlanarPoint {
  x: number;
  z: number;
}

const METERS_PER_DEG_LAT = 111_132.95;
const METERS_PER_DEG_LON_AT_EQUATOR = 111_319.49;
const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Project `[lon, lat]` onto the local plane around `origin`. */
export function lonLatToWorld(lon: number, lat: number, origin: ProjectionOrigin): PlanarPoint {
  const cosLat = Math.cos(toRadians(origin.lat));
  return {
    x: (lon - origin.lon) * METERS_PER_DEG_LON_AT_EQUATOR * cosLat,
    z: -(lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

/** Inverse of {@link lonLatToWorld}. */
export function worldToLonLat(x: number, z: number, origin: ProjectionOrigin): LonLat {
  const cosLat = Math.cos(toRadians(origin.lat));
  return [
    origin.lon + x / (METERS_PER_DEG_LON_AT_EQUATOR * cosLat),
    origin.lat - z / METERS_PER_DEG_LAT,
  ];
}

/** Haversine distance in metres between two `[lon, lat]` points. */
export function haversineMeters(a: LonLat, b: LonLat): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
