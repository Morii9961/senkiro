/**
 * Graph 1 · TrackGraph (contract §5.1): physical lines, operator ownership, segment
 * geometry and station complexes.
 */
import type { BaseEntity, DataNature, Provenance, SourceRecord } from './base.ts';
import type { SkId } from './ids.ts';

/** `[lon, lat]` in WGS 84. */
export type LonLat = [number, number];

export type OperatorCategory =
  | 'jr'
  | 'metro'
  | 'toei'
  | 'private'
  | 'third_sector'
  | 'monorail'
  | 'tram';

export type CoverageStatus = 'full' | 'partial' | 'none';

export type LineClass = 'shinkansen' | 'trunk' | 'local_line' | 'metro' | 'private' | 'unknown';

export interface Operator extends BaseEntity<'operator'> {
  category: OperatorCategory;
  brandColor: string;
  coverageStatus: CoverageStatus;
  coverageNotes: string;
}

export interface RailLine extends BaseEntity<'line'> {
  operatorId: SkId<'operator'>;
  color: string;
  stationCodePrefix: string | null;
  lineClass: LineClass;
  stationIds: SkId<'station'>[];
  coverageStatus: CoverageStatus;
}

export interface TrackSegment extends BaseEntity<'segment'> {
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  railLineIds: SkId<'line'>[];
  operatorId: SkId<'operator'>;
  /** Polyline of `[lon, lat]` points. */
  geometry: LonLat[];
  /** 営業キロ; `null` when no source states it. */
  operatingKm: number | null;
  distanceNature: DataNature;
  lineClass: LineClass;
  isShinkansen: boolean;
  parallelConventionalLineId: SkId<'line'> | null;
  /** Region-neutral tags, e.g. `'suburban:tokyo'`, `'suburban:osaka'`, `'tariff:keihanshin'`. */
  fareZoneTags: string[];
}

export type VerticalClass = 'elevated' | 'at_grade' | 'underground' | 'unknown';

/**
 * ODbL share-alike side layer (invariant 7). Lives in its own physical dataset and joins
 * the main graph only through `trackSegmentId`; it is never embedded in `TrackSegment`.
 */
export interface TrackVerticalAttribute {
  trackSegmentId: SkId<'segment'>;
  verticalClass: VerticalClass;
  verticalOrder: number | null;
  elevationM: number | null;
  provenance: Provenance;
}

export interface Station extends BaseEntity<'station'> {
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  stationComplexId: SkId<'complex'> | null;
  stationCode: string | null;
  coordinates: LonLat;
  municipalityCode: string | null;
  wardOrCity: string | null;
  fareZoneTags: string[];
}

export interface StationComplexExclusion {
  name: string;
  stationId?: SkId<'station'>;
  reason: string;
}

export interface StationComplex extends BaseEntity<'complex'> {
  stationIds: SkId<'station'>[];
  coordinates: LonLat;
  wardOrCity: string | null;
  /** Guards against false merges such as JR Kyoto vs Kawaramachi, Shinjuku vs Seibu-Shinjuku. */
  explicitlyExcluded: StationComplexExclusion[];
}

export type InterchangeGateType = 'in_gate' | 'out_of_gate' | 'unknown';

export interface Interchange extends BaseEntity<'interchange'> {
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  stationComplexId: SkId<'complex'>;
  gateType: InterchangeGateType;
  walkingMinutes: number | null;
  stepFree: boolean | null;
  notes: string | null;
}

/** Main (non share-alike) track dataset. */
export interface TrackGraph {
  operators: Operator[];
  lines: RailLine[];
  segments: TrackSegment[];
  stations: Station[];
  complexes: StationComplex[];
  interchanges: Interchange[];
  sources: SourceRecord[];
}

/** Physically separate ODbL dataset holding {@link TrackVerticalAttribute}s. */
export interface TrackVerticalLayer {
  attributes: TrackVerticalAttribute[];
  sources: SourceRecord[];
}
