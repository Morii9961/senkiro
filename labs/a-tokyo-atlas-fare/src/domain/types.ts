/**
 * SENKIRO Lab · Tokyo Atlas & Fare
 * Shared Contract v0.1 Domain Model (Pure TypeScript, zero React dependency)
 */

export type DataNature =
  | 'official'
  | 'licensed-third-party'
  | 'derived'
  | 'manual-verified'
  | 'synthetic'
  | 'unknown';

export type LicensePermission = 'yes' | 'no' | 'conditional' | 'unknown';

export interface SourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string;
  retrievedAt: string;
  license: string;
  licenseUrl: string;
  commercialUse: LicensePermission;
  redistribution: LicensePermission;
  shareAlike: boolean | 'unknown';
  attributionText: string;
  notes: string;
}

export interface LocalizedNames {
  ja: string | null;
  ja_kana: string | null;
  en: string | null;
  zh?: string | null;
}

export interface Provenance {
  sourceIds: string[];
  dataNature: DataNature;
  lastVerifiedAt: string;
}

export type EntityIdPrefix =
  | 'operator'
  | 'line'
  | 'segment'
  | 'station'
  | 'complex'
  | 'platform'
  | 'entrance'
  | 'gate'
  | 'level'
  | 'interchange'
  | 'service'
  | 'trip'
  | 'stoptime'
  | 'through'
  | 'rule'
  | 'product'
  | 'quote'
  | 'pass';

export type SkId<T extends EntityIdPrefix = EntityIdPrefix> = `sk:${T}:${string}`;

export interface BaseEntity<T extends EntityIdPrefix = EntityIdPrefix> {
  id: SkId<T>;
  externalIds: Record<string, string>;
  names: LocalizedNames;
  provenance: Provenance;
  validFrom: string | null;
  validTo: string | null;
}

export type OperatorCategory = 'jr' | 'metro' | 'toei' | 'private' | 'third_sector';

export interface Operator extends BaseEntity<'operator'> {
  category: OperatorCategory;
  brandColor: string;
  coverageStatus: 'full' | 'partial' | 'none';
  coverageNotes: string;
}

export type LineClass =
  | 'shinkansen'
  | 'trunk'
  | 'local_line'
  | 'metro'
  | 'private'
  | 'unknown';

export interface RailLine extends BaseEntity<'line'> {
  operatorId: SkId<'operator'>;
  color: string;
  stationCodePrefix: string | null;
  lineClass: LineClass;
  inFareSlice: boolean;
  inTokyoSuburbanArea: boolean;
  stationIds: SkId<'station'>[];
  coverageStatus: 'full' | 'partial' | 'none';
}

export type VerticalClass = 'elevated' | 'at_grade' | 'underground' | 'unknown';

/**
 * Extension fields for 3D stereoscopic vertical layering.
 * Stored in an isolated ODbL dataset file (osm-vertical.json) and joined at view time
 * so share-alike attributes never contaminate the core CC-BY dataset.
 */
export interface TrackVerticalAttribute {
  trackSegmentId: SkId<'segment'>;
  verticalClass: VerticalClass;
  verticalOrder: number | null;
  elevationM: number | null;
  osmEvidence: {
    wayCount: number;
    tunnelValues: string[];
    bridgeValues: string[];
    layerValues: number[];
  };
  provenance: Provenance;
}

export interface TrackSegment extends BaseEntity<'segment'> {
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  railLineIds: SkId<'line'>[];
  operatorId: SkId<'operator'>;
  /** GeoJSON [lon, lat] polyline coordinates */
  geometry: [number, number][];
  /** Official operating kilometers (営業キロ) where verified; null if unavailable */
  operatingKm: number | null;
  distanceNature: DataNature;
  lineClass: LineClass;
  isShinkansen: boolean;
  /** Parallel conventional line ID for Shinkansen segments (used by Art. 16-2 predicates) */
  parallelConventionalLineId: SkId<'line'> | null;
  inTokyoSuburbanArea: boolean;
  /** Optional runtime-joined vertical attributes from separate ODbL file */
  verticalClass?: VerticalClass;
  verticalOrder?: number | null;
  elevationM?: number | null;
  verticalProvenance?: Provenance;
}

export interface Station extends BaseEntity<'station'> {
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  stationComplexId: SkId<'complex'> | null;
  stationCode: string | null;
  /** [lon, lat] */
  coordinates: [number, number];
  wardOrCity: string | null;
  inFareSlice: boolean;
  inTokyoSuburbanArea: boolean;
}

export interface StationComplex extends BaseEntity<'complex'> {
  stationIds: SkId<'station'>[];
  coordinates: [number, number];
  wardOrCity: string | null;
}

export interface Platform extends BaseEntity<'platform'> {
  stationId: SkId<'station'>;
  platformNumber: string | null;
  levelId: SkId<'level'> | null;
}

export interface Entrance extends BaseEntity<'entrance'> {
  stationId: SkId<'station'>;
  code: string | null;
  coordinates: [number, number] | null;
}

export interface Gate extends BaseEntity<'gate'> {
  stationId: SkId<'station'>;
  levelId: SkId<'level'> | null;
  isTransferGate: boolean;
}

export interface Level extends BaseEntity<'level'> {
  stationComplexId: SkId<'complex'>;
  ordinal: number;
  label: string;
}

export type InterchangeGateType = 'in_gate' | 'out_of_gate' | 'unknown';

export interface Interchange extends BaseEntity<'interchange'> {
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  stationComplexId: SkId<'complex'>;
  gateType: InterchangeGateType;
  walkingMinutes: number | null;
  notes: string | null;
}

export interface ServicePattern extends BaseEntity<'service'> {
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  serviceCategory: string;
  stopStationIds: SkId<'station'>[];
  throughServiceId: SkId<'through'> | null;
}

export interface Trip extends BaseEntity<'trip'> {
  servicePatternId: SkId<'service'>;
  trainNumber: string | null;
  direction: 'inbound' | 'outbound' | 'clockwise' | 'counterclockwise' | 'unknown';
}

export interface StopTime extends BaseEntity<'stoptime'> {
  tripId: SkId<'trip'>;
  stationId: SkId<'station'>;
  sequence: number;
  arrivalTime: string | null;
  departureTime: string | null;
}

export interface ThroughService extends BaseEntity<'through'> {
  boundaryStationId: SkId<'station'>;
  fromRailLineId: SkId<'line'>;
  toRailLineId: SkId<'line'>;
  operatorIds: SkId<'operator'>[];
  serviceDescription: string;
  notes: string | null;
}

export interface FareRule extends BaseEntity<'rule'> {
  ruleId: string;
  articleRef: string;
  officialUrl: string;
  category:
    | 'base_fare'
    | 'specific_section'
    | 'suburban_area'
    | 'shinkansen_equivalence'
    | 'local_line_conversion'
    | 'cross_company'
    | 'surcharge';
  summary: string;
  preconditions: string[];
  exceptions: string[];
}

export type TicketType = 'ordinary_paper' | 'ic_card';

export type SurchargeType =
  | 'none'
  | 'limited_express_non_reserved'
  | 'limited_express_reserved'
  | 'green_car'
  | 'gran_class';

export interface FareProduct extends BaseEntity<'product'> {
  productKind: 'base_fare' | 'surcharge';
  ticketType?: TicketType;
  surchargeType?: SurchargeType;
  tariffNature: DataNature;
  disclaimer: string | null;
}

export type FareQuoteStatus =
  | 'OK'
  | 'NOT_APPLICABLE'
  | 'MISSING_DATA'
  | 'UNSUPPORTED'
  | 'STALE_RULE'
  | 'ERROR';

export interface FareExplanationStep {
  ruleId: string;
  articleRef: string;
  officialUrl: string;
  applied: boolean;
  status: 'APPLIED' | 'REJECTED' | 'NOT_APPLICABLE' | 'WARNING';
  reason: string;
  details?: string;
}

export interface PathLeg {
  segmentId: SkId<'segment'>;
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  railLineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  operatingKm: number | null;
  isShinkansen: boolean;
  lineClass: LineClass;
}

export interface ResolvedPath {
  stationIds: SkId<'station'>[];
  segmentIds: SkId<'segment'>[];
  legs: PathLeg[];
  totalOperatingKm: number | null;
  operatorsInvolved: SkId<'operator'>[];
  usesShinkansen: boolean;
  usesLocalLine: boolean;
  allWithinTokyoSuburbanArea: boolean;
  hasRepeatedStationOrSegment: boolean;
}

export interface FareBreakdownItem {
  label: string;
  productKind: 'base_fare' | 'surcharge';
  operatorId: SkId<'operator'> | null;
  distanceKm: number | null;
  amountYen: number | null;
  dataNature: DataNature;
  notes: string;
}

export interface FareQuoteRequest {
  originStationId: SkId<'station'>;
  destinationStationId: SkId<'station'>;
  viaStationIds?: SkId<'station'>[];
  /** Explicit actual segment IDs if caller wants to specify exact track route */
  actualSegmentIds?: SkId<'segment'>[];
  /** Prefer Shinkansen where available between origin/via/destination */
  preferShinkansen?: boolean;
  /** Prefer specific bypass route (e.g. Saikyo via Toda-Koen, Yokosuka via Nishi-Oi, Oku) */
  routePreference?: 'shortest' | 'saikyo_bypass' | 'yokosuka_bypass' | 'oku_bypass' | 'yamanote_loop_detour' | 'shinkansen';
  travelDate: string; // YYYY-MM-DD
  ticketType: TicketType;
  requireStopover?: boolean;
  surchargeType?: SurchargeType;
}

export interface FareQuote {
  id: SkId<'quote'>;
  status: FareQuoteStatus;
  statusReason: string;
  request: FareQuoteRequest;
  isSyntheticTariff: boolean;
  tariffDisclaimer: string | null;
  actualPath: ResolvedPath | null;
  billedPath: ResolvedPath | null;
  pathsDiffer: boolean;
  pathDiffSummary: string | null;
  validityDays: number | null;
  stopoverAllowed: boolean | null;
  totalAmountYen: number | null;
  breakdown: FareBreakdownItem[];
  explanation: FareExplanationStep[];
  ruleVersionUsed: string | null;
  candidateRoutes?: {
    id: string;
    label: string;
    path: ResolvedPath;
    isBilledPath: boolean;
  }[];
  provenance: Provenance;
}

export interface PassProduct extends BaseEntity<'pass'> {
  operatorIds: SkId<'operator'>[];
  validityDays: number;
  notes: string;
}

export interface PassEligibility {
  passId: SkId<'pass'>;
  eligible: boolean | 'unverified';
  reason: string;
}

export interface UnalignedRecord {
  sourceId: string;
  externalId: string;
  rawName: string;
  operatorRaw: string;
  lineRaw: string;
  coordinates: [number, number] | null;
  reason: string;
}

export interface AtlasDataset {
  generatedAt: string;
  sources: SourceRecord[];
  operators: Operator[];
  railLines: RailLine[];
  stations: Station[];
  stationComplexes: StationComplex[];
  trackSegments: TrackSegment[];
  interchanges: Interchange[];
  servicePatterns: ServicePattern[];
  throughServices: ThroughService[];
  unalignedRecords: UnalignedRecord[];
}

export interface OsmVerticalDataset {
  generatedAt: string;
  licenseNotice: string;
  source: SourceRecord;
  records: TrackVerticalAttribute[];
}

export interface RealtimeServiceStatus {
  operatorId: SkId<'operator'>;
  railLineId: SkId<'line'> | null;
  status: 'normal' | 'delay' | 'suspended' | 'unavailable';
  summary: string;
  observedAt: string | null;
  sourceId: string | null;
  dataNature: DataNature;
}
