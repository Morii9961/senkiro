/**
 * The four PMTiles layers of spec §3.2 (`rail_segments`, `rail_stations`,
 * `station_complexes`, `through_boundaries`) rebuilt as GeoJSON from a bundle's
 * `trackGraph`, with exactly the same property names. The map uses them when a bundle has
 * no published tiles (`pmtilesUrl === ''`), so one MapLibre style serves both sources.
 *
 * Derived values (`corridor_slot`, `corridor_count`, `importance_rank`) follow the spec's
 * definitions; they only affect drawing order and label density, never railway facts.
 */
import type { AppHub, LocalizedNames } from '@senkiro/contracts';
import { HUB_REGION } from '@senkiro/contracts';
import type { AtlasIndex } from './atlas-index.ts';

export interface PointFeature<P> {
  type: 'Feature';
  id?: number;
  properties: P;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

export interface LineFeature<P> {
  type: 'Feature';
  id?: number;
  properties: P;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

export interface FeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
}

interface LabelProps {
  label_zh_cn: string;
  label_ja: string;
  label_en: string;
}

export interface RailSegmentProps extends LabelProps {
  id: string;
  operator_id: string;
  primary_line_id: string;
  line_ids_json: string;
  color: string;
  line_class: string;
  is_shinkansen: boolean;
  corridor_slot: number;
  corridor_count: number;
}

export interface RailStationProps extends LabelProps {
  id: string;
  operator_id: string;
  complex_id: string;
  station_code: string;
  importance_rank: 1 | 2 | 3;
}

export interface StationComplexProps extends LabelProps {
  id: string;
  hub_key: AppHub | '';
  station_count: number;
}

export interface ThroughBoundaryProps extends LabelProps {
  id: string;
  boundary_station_id: string;
}

export interface AtlasGeoJson {
  rail_segments: FeatureCollection<LineFeature<RailSegmentProps>>;
  rail_stations: FeatureCollection<PointFeature<RailStationProps>>;
  station_complexes: FeatureCollection<PointFeature<StationComplexProps>>;
  through_boundaries: FeatureCollection<PointFeature<ThroughBoundaryProps>>;
}

/** Complexes with a published (or in-progress) in-station model, by frozen complex ID. */
export const HUB_COMPLEX_IDS: Readonly<Record<AppHub, string>> = {
  umeda: 'sk:complex:kansai:osaka-umeda',
  kyoto: 'sk:complex:kansai:kyoto',
  shinjuku: 'sk:complex:kanto:shinjuku',
};

export function hubForComplex(complexId: string): AppHub | null {
  for (const [hub, id] of Object.entries(HUB_COMPLEX_IDS) as [AppHub, string][]) {
    if (id === complexId) {
      return hub;
    }
  }
  return null;
}

/** Empty strings, not guesses, for unknown names (the tile schema has no nulls). */
function labels(names: LocalizedNames): LabelProps {
  return { label_zh_cn: names.zh ?? '', label_ja: names.ja ?? '', label_en: names.en ?? '' };
}

/** Slot sequence 0, 1, -1, 2, -2 … for the n-th line sharing one corridor. */
export function corridorSlot(position: number): number {
  return position === 0 ? 0 : position % 2 === 1 ? (position + 1) / 2 : -position / 2;
}

function corridorKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildAtlasGeoJson(index: AtlasIndex): AtlasGeoJson {
  const { trackGraph, throughServices, region } = index.bundle;

  // Parallel lines between the same pair of stations (or a shared complex pair) share a
  // corridor and get distinct offset slots, ordered by line ID for stability.
  const complexOf = (stationId: string) =>
    index.stations.get(stationId)?.stationComplexId ?? stationId;
  const corridors = new Map<string, string[]>();
  for (const segment of trackGraph.segments) {
    const key = corridorKey(complexOf(segment.fromStationId), complexOf(segment.toStationId));
    const list = corridors.get(key) ?? [];
    list.push(segment.id);
    corridors.set(key, list);
  }
  const slotOf = new Map<string, { slot: number; count: number }>();
  for (const ids of corridors.values()) {
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    for (const [position, id] of sorted.entries()) {
      slotOf.set(id, { slot: corridorSlot(position), count: sorted.length });
    }
  }

  const rail_segments = trackGraph.segments
    .filter((segment) => segment.geometry.length >= 2)
    .map((segment, i): LineFeature<RailSegmentProps> => {
      const primary = segment.railLineIds[0] ?? '';
      const line = index.lines.get(primary);
      const corridor = slotOf.get(segment.id) ?? { slot: 0, count: 1 };
      return {
        type: 'Feature',
        id: i,
        properties: {
          id: segment.id,
          operator_id: segment.operatorId,
          primary_line_id: primary,
          line_ids_json: JSON.stringify(segment.railLineIds),
          color: line?.color ?? '',
          line_class: segment.lineClass,
          is_shinkansen: segment.isShinkansen,
          corridor_slot: corridor.slot,
          corridor_count: corridor.count,
          ...labels(line?.names ?? segment.names),
        },
        geometry: { type: 'LineString', coordinates: segment.geometry },
      };
    });

  const hubComplexes = new Set(
    (Object.entries(HUB_COMPLEX_IDS) as [AppHub, string][])
      .filter(([hub]) => HUB_REGION[hub] === region)
      .map(([, id]) => id),
  );
  const rail_stations = trackGraph.stations.map((station, i): PointFeature<RailStationProps> => {
    const complex =
      station.stationComplexId === null ? undefined : index.complexes.get(station.stationComplexId);
    const lineCount = index.linesByStation.get(station.id)?.length ?? 0;
    const rank: 1 | 2 | 3 =
      complex !== undefined && (hubComplexes.has(complex.id) || complex.stationIds.length >= 3)
        ? 1
        : complex !== undefined || lineCount >= 2
          ? 2
          : 3;
    return {
      type: 'Feature',
      id: i,
      properties: {
        id: station.id,
        operator_id: station.operatorId,
        complex_id: station.stationComplexId ?? '',
        station_code: station.stationCode ?? '',
        importance_rank: rank,
        ...labels(station.names),
      },
      geometry: { type: 'Point', coordinates: station.coordinates },
    };
  });

  const station_complexes = trackGraph.complexes.map(
    (complex, i): PointFeature<StationComplexProps> => {
      const hub = hubForComplex(complex.id);
      return {
        type: 'Feature',
        id: i,
        properties: {
          id: complex.id,
          hub_key: hub !== null && HUB_REGION[hub] === region ? hub : '',
          station_count: complex.stationIds.length,
          ...labels(complex.names),
        },
        geometry: { type: 'Point', coordinates: complex.coordinates },
      };
    },
  );

  const through_boundaries = throughServices.flatMap(
    (through, i): PointFeature<ThroughBoundaryProps>[] => {
      const boundary = index.stations.get(through.boundaryStationId);
      if (boundary === undefined) {
        return [];
      }
      return [
        {
          type: 'Feature',
          id: i,
          properties: {
            id: through.id,
            boundary_station_id: through.boundaryStationId,
            ...labels(through.names),
          },
          geometry: { type: 'Point', coordinates: boundary.coordinates },
        },
      ];
    },
  );

  return {
    rail_segments: { type: 'FeatureCollection', features: rail_segments },
    rail_stations: { type: 'FeatureCollection', features: rail_stations },
    station_complexes: { type: 'FeatureCollection', features: station_complexes },
    through_boundaries: { type: 'FeatureCollection', features: through_boundaries },
  };
}
