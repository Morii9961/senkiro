/**
 * Graph 2 · StationGraph (contract §5.2): multi-level indoor space of a hub, unifying the
 * Lab B (Umeda) and Lab C (Shinjuku) models. Drives `<StationExplorer />` and step-free
 * wayfinding.
 */
import type { BaseEntity, SourcedFact, SourceRecord } from './base.ts';
import type { SkId } from './ids.ts';
import type { LocalizedNames } from './locale.ts';
import type { Operator, RailLine, Station, StationComplex } from './track.ts';

export type GeometryConfidence = 'verified' | 'schematic' | 'unknown';
export type ExistenceConfidence = 'verified' | 'unverified';
export type ConnectionConfidence = 'verified' | 'inferred';
/** `null` = no source says either way. */
export type StepFree = boolean | null;
/** Fare area of a place, e.g. `'paid:jr-west'`, `'paid:osaka-metro'`. */
export type FareZone = 'unpaid' | 'roadway' | `paid:${string}`;

/** Plan-view coordinates in metres (x east-west, z north-south). */
export interface PlanPoint {
  x: number;
  z: number;
}

export interface PlanRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function isPaidFareZone(zone: FareZone): zone is `paid:${string}` {
  return zone.startsWith('paid:') && zone.length > 'paid:'.length;
}

export interface StationLevel extends BaseEntity<'level'> {
  complexId: SkId<'complex'>;
  stationId: SkId<'station'> | null;
  operatorId: SkId<'operator'> | null;
  /** e.g. `"B1F"`. */
  label: string;
  /** Unique vertical ordering across the whole complex. */
  ordinal: number;
  elevation: number;
  elevationNote: string;
}

export type PlatformSide = 'z-' | 'z+' | 'x-' | 'x+';

export interface PlatformTrackService {
  railLineId: SkId<'line'>;
  towards: LocalizedNames;
}

export interface PlatformTrack {
  /** 番線, as printed (may be non-numeric). */
  number: string;
  services: PlatformTrackService[];
  side?: PlatformSide | null;
  /** Absent = not established by any source (not the same as "no doors"). */
  platformDoors?: SourcedFact<{ status: 'installed' | 'planned' | 'none'; since: string | null }>;
}

export type StationPlaceKind = 'platform' | 'concourse' | 'passage' | 'entrance' | 'landing';
export type StationPlaceManager = 'railway' | 'commercial' | 'public-road' | 'unknown';

export interface StationPlace extends BaseEntity<'place'> {
  complexId: SkId<'complex'>;
  levelId: SkId<'level'>;
  stationId: SkId<'station'> | null;
  kind: StationPlaceKind;
  fareZone: FareZone;
  manager: StationPlaceManager | null;
  footprint: PlanRect[];
  anchor: PlanPoint;
  existence: ExistenceConfidence;
  geometryConfidence: GeometryConfidence;
  asOf: string | null;
  tracks?: PlatformTrack[];
  terminus?: SourcedFact<{ end: PlatformSide }>;
  leadsTo?: LocalizedNames;
}

export type StationLinkKind = 'passage' | 'gate' | 'stairs' | 'escalator' | 'elevator';
export type StationLinkDirection = 'both' | 'forward' | 'unknown';

export interface StationLink extends BaseEntity<'link'> {
  complexId: SkId<'complex'>;
  kind: StationLinkKind;
  fromPlaceId: SkId<'place'>;
  toPlaceId: SkId<'place'>;
  direction: StationLinkDirection;
  connection: ConnectionConfidence;
  stepFree: StepFree;
  hasSteps: boolean | null;
  gateKind?: 'ticket' | 'transfer';
  position?: PlanPoint;
  hoursNote?: string | null;
  declaredSpan?: [SkId<'level'>, SkId<'level'>] | null;
}

export type StationExternalLinkKind =
  | 'official_floor_map'
  | 'official_timetable'
  | 'operator_info'
  | 'accessibility_info'
  | 'other';

/** Pointer to an official page (floor map, timetable …); SENKIRO does not copy its content. */
export interface StationExternalLink {
  kind: StationExternalLinkKind;
  label: LocalizedNames;
  url: string;
  operatorId: SkId<'operator'> | null;
  stationId: SkId<'station'> | null;
  sourceId: string | null;
}

/** Indoor graph of one hub (levels, places, links). */
export interface StationGraph {
  complexId: SkId<'complex'>;
  levels: StationLevel[];
  places: StationPlace[];
  links: StationLink[];
}

/** Self-contained export of one hub (e.g. Umeda, Shinjuku). */
export interface StationHubDataset {
  complex: StationComplex;
  operators: Operator[];
  lines: RailLine[];
  stations: Station[];
  levels: StationLevel[];
  places: StationPlace[];
  links: StationLink[];
  externalLinks?: StationExternalLink[];
  sources: SourceRecord[];
  disclaimer: LocalizedNames;
  /**
   * Model axis that points north on the plan (`'x-'`: north is towards −x). Absent means
   * the orientation has not been verified; consumers must not draw a north arrow then.
   */
  planNorth?: PlatformSide;
}

export type StationRouteMode = 'standard' | 'step_free';

export interface StationRouteQuery {
  complexId: SkId<'complex'>;
  fromPlaceId: SkId<'place'>;
  toPlaceId: SkId<'place'>;
  mode: StationRouteMode;
  /** Whether `connection: 'inferred'` links may be used. Engines default to `true`. */
  allowInferred?: boolean;
}

export interface StationRouteStep {
  index: number;
  linkId: SkId<'link'>;
  kind: StationLinkKind;
  fromPlaceId: SkId<'place'>;
  toPlaceId: SkId<'place'>;
  fromLevelId: SkId<'level'>;
  toLevelId: SkId<'level'>;
  stepFree: StepFree;
  connection: ConnectionConfidence;
}

export interface StationRouteFound {
  reachable: true;
  mode: StationRouteMode;
  steps: StationRouteStep[];
  /** Levels in visiting order, consecutive duplicates removed. */
  levelSequence: SkId<'level'>[];
  gatePasses: number;
  levelChanges: number;
  inferredLinkCount: number;
  /** Steps whose step-free status no source confirms. */
  unconfirmedStepFreeCount: number;
  /** No surveyed distances/durations exist yet; stay `null` until a source provides them. */
  distanceMeters: number | null;
  durationMinutes: number | null;
}

export type StationRouteFailureReason = 'unknown-place' | 'unreachable' | 'step-free-unavailable';

/** Honest failure: never routes through `'roadway'` or unverified cross-operator paid links. */
export interface StationRouteNotFound {
  reachable: false;
  mode: StationRouteMode;
  reason: StationRouteFailureReason;
  detail: string;
  steps: [];
}

export type StationRouteResult = StationRouteFound | StationRouteNotFound;
