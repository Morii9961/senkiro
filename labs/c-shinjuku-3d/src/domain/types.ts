/**
 * SENKIRO Lab · Shinjuku Station 3D — domain types.
 *
 * Pure TypeScript, no React / three.js imports, so this folder can be lifted
 * into a future web or mobile codebase unchanged.
 *
 * Entity names follow docs/00-shared-contract.md §5 (Operator, RailLine,
 * Station, StationComplex, Platform, Entrance, Gate, Level). Types that the
 * contract does not name (Concourse, Passage, VerticalFacility,
 * UnverifiedBlock) are additions made by this prototype.
 */

// ---------------------------------------------------------------------------
// Shared contract fields
// ---------------------------------------------------------------------------

/** Contract §2. */
export type DataNature =
  | 'official'
  | 'licensed-third-party'
  | 'derived'
  | 'manual-verified'
  | 'synthetic'
  | 'unknown';

export type TriState = 'yes' | 'no' | 'conditional' | 'unknown';

/** Contract §3. */
export interface SourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** ISO date this prototype last read the source. */
  retrievedAt: string;
  license: string;
  licenseUrl: string | null;
  commercialUse: TriState;
  redistribution: TriState;
  shareAlike: boolean | 'unknown';
  attributionText: string;
  notes: string;
  /**
   * Additions for this prototype: how the source was reached, the date printed
   * on the source material itself, and whether it feeds the shipped data.
   */
  accessedVia: string | null;
  sourceDate: string | null;
  usedInData: boolean;
}

export interface Names {
  ja: string | null;
  ja_kana: string | null;
  /** English label. Translations by this prototype are NOT official names. */
  en: string | null;
  zh?: string | null;
}

export interface Provenance {
  sourceIds: string[];
  dataNature: DataNature;
  /** ISO date the entry was last compared against its sources. */
  lastVerifiedAt: string | null;
  note?: string;
}

export interface EntityBase {
  /** sk:<type>:<slug> */
  id: string;
  externalIds: Record<string, string>;
  names: Names;
  provenance: Provenance;
  /** Business validity. Unknown is null — it is never guessed. */
  validFrom: string | null;
  validTo: string | null;
}

// ---------------------------------------------------------------------------
// Confidence vocabulary specific to station interiors
// ---------------------------------------------------------------------------

/**
 * How far the *drawn geometry* (coordinates, size, height) can be trusted.
 *
 * - verified  : coordinates come from surveyed / georeferenced data. Nothing in
 *               this prototype reaches that bar; the value exists so that a
 *               licensed dataset can be dropped in later.
 * - schematic : relative arrangement follows the cited source, but every
 *               coordinate, size and height is invented for legibility.
 * - unknown   : even the relative position is a placeholder.
 */
export type GeometryConfidence = 'verified' | 'schematic' | 'unknown';

/** Whether the element itself (it exists, on this level) was checked against a source. */
export type ExistenceConfidence = 'verified' | 'unverified';

/**
 * How a connection between two elements is known.
 * - verified : drawn or stated on the cited source.
 * - inferred : read indirectly (e.g. signage text "to X"); shown dashed, tagged in routes.
 */
export type ConnectionConfidence = 'verified' | 'inferred';

/** null = not stated on any source read. */
export type StepFree = boolean | null;

/**
 * Fare zone. Paid zones are per operator because a transfer gate separates
 * the JR paid area from the Keio paid area.
 */
export type FareZone = 'unpaid' | `paid:${string}`;

export function isPaid(zone: FareZone): boolean {
  return zone !== 'unpaid';
}

// ---------------------------------------------------------------------------
// Geometry (schematic units, NOT metres)
// ---------------------------------------------------------------------------

/**
 * Plan coordinates in schematic units.
 * x grows southwards (towards Shibuya / Yoyogi), z grows westwards.
 * In the 2D plan north is to the left and east is at the top — the same
 * orientation as the operator floor maps that were read.
 */
export interface PlanPoint {
  x: number;
  z: number;
}

/** Axis-aligned rectangle in plan coordinates. */
export interface PlanRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// ---------------------------------------------------------------------------
// Network entities
// ---------------------------------------------------------------------------

export interface Operator extends EntityBase {
  kind: 'operator';
}

export interface RailLine extends EntityBase {
  kind: 'rail-line';
  operatorId: string;
  /** Display colour. An approximation chosen by this prototype, not an official value. */
  displayColor: string;
  displayColorNote: string;
  stationNumberPrefix: string | null;
}

export interface Station extends EntityBase {
  kind: 'station';
  operatorId: string;
  complexId: string;
  railLineIds: string[];
}

export interface StationComplex extends EntityBase {
  kind: 'station-complex';
  stationIds: string[];
  /** Stations that share part of the name but are NOT part of this complex model. */
  explicitlyExcluded: { name: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Station interior
// ---------------------------------------------------------------------------

export interface StationElementBase extends EntityBase {
  stationId: string | null;
  existence: ExistenceConfidence;
  geometryConfidence: GeometryConfidence;
  /** Date printed on the source material this entry was read from (e.g. "2026-08"). */
  asOf: string | null;
  notes?: string;
}

export interface Level extends StationElementBase {
  kind: 'level';
  operatorId: string;
  /** Floor label exactly as the operator prints it, e.g. "B1F". */
  label: string;
  /**
   * Vertical order. Two levels are "adjacent" when their ordinals differ by 1.
   * Operators number floors independently, so ordinals — not labels — are the
   * shared vertical datum of this model.
   */
  ordinal: number;
  /** Schematic height used for drawing only. */
  elevation: number;
  elevationNote: string;
}

export type AreaKind = 'concourse' | 'platform' | 'passage';

interface AreaBase extends StationElementBase {
  levelId: string;
  fareZone: FareZone;
  /** Disjoint rectangles; their union is the drawn footprint. */
  footprint: PlanRect[];
  /** Where routes and labels attach. Must lie inside the footprint. */
  anchor: PlanPoint;
}

export interface Concourse extends AreaBase {
  kind: 'concourse';
}

/** A corridor-like area. The task brief calls these 通道. */
export interface PassageArea extends AreaBase {
  kind: 'passage';
}

export interface PlatformTrack {
  /** Track / platform number as printed, e.g. "14". */
  number: string;
  services: { railLineId: string; towardsJa: string; towardsEn: string | null }[];
}

export interface Platform extends AreaBase {
  kind: 'platform';
  tracks: PlatformTrack[];
}

export type Area = Concourse | PassageArea | Platform;

/** Walkable link between two areas on the same level (no gate, no level change). */
export interface Passage extends StationElementBase {
  kind: 'passage-link';
  fromAreaId: string;
  toAreaId: string;
  connection: ConnectionConfidence;
  stepFree: StepFree;
  /** True when the source shows steps inside this same-level link. */
  hasSteps: boolean | null;
}

export type GateKind = 'ticket' | 'transfer';

export interface Gate extends StationElementBase {
  kind: 'gate';
  levelId: string;
  gateKind: GateKind;
  position: PlanPoint;
  /**
   * The two sides this gate separates. A ticket gate has one paid and one
   * unpaid side; a transfer gate has two paid sides of different operators.
   * The outer side may be an UnverifiedBlock when the far side is outside the
   * verified model — then no routing edge is generated towards it.
   */
  sides: [GateSide, GateSide];
  /** exit-only gates produce a one-way edge pair (paid → unpaid only). */
  direction: 'both' | 'exit-only';
  hoursNote: string | null;
  stepFree: StepFree;
  aliases: { name: string; usedBy: string }[];
}

export type GateSide = { areaId: string } | { blockId: string };

export interface Entrance extends StationElementBase {
  kind: 'entrance';
  levelId: string;
  /** The unpaid area this entrance opens onto. */
  areaId: string;
  position: PlanPoint;
  leadsToJa: string | null;
  leadsToEn: string | null;
  stepFree: StepFree;
}

export type VerticalKind = 'stairs' | 'escalator' | 'elevator';

export interface VerticalStop {
  levelId: string;
  areaId: string;
  position: PlanPoint;
}

export interface VerticalFacility extends StationElementBase {
  kind: 'vertical';
  verticalKind: VerticalKind;
  /** Letter the operator prints next to the elevator, if any. */
  operatorLabel: string | null;
  /** Ordered bottom-to-top or top-to-bottom; consecutive stops are linked. */
  stops: VerticalStop[];
  /**
   * Set only when two consecutive stops are deliberately NOT on adjacent
   * levels (an express lift, say). Validation rejects such a span otherwise.
   */
  declaredNonAdjacent?: { reason: string };
  /** Direction of escalators is not recorded on the sources read. */
  directionNote: string | null;
  hoursNote: string | null;
  /** True when one entry stands for several physical units of the same kind. */
  aggregated: boolean;
}

/** Abstract placeholder for a station area that was not verified. */
export interface UnverifiedBlock extends StationElementBase {
  kind: 'unverified-block';
  operatorId: string | null;
  box: PlanRect;
  /** Schematic vertical extent for drawing. */
  elevation: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Whole model
// ---------------------------------------------------------------------------

export interface StationModel {
  schemaVersion: 1;
  generatedAt: string;
  unitNote: string;
  operators: Operator[];
  railLines: RailLine[];
  complex: StationComplex;
  stations: Station[];
  levels: Level[];
  areas: Area[];
  passages: Passage[];
  gates: Gate[];
  entrances: Entrance[];
  verticals: VerticalFacility[];
  unverifiedBlocks: UnverifiedBlock[];
  /** Connections that the sources hint at but that were NOT modelled. */
  unconfirmedConnections: { id: string; description: string; reason: string }[];
}

export type StationElement =
  | Level
  | Area
  | Passage
  | Gate
  | Entrance
  | VerticalFacility
  | UnverifiedBlock;
