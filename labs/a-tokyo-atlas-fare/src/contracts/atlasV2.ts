/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Frozen Shared Domain & Geometry Contracts.
 *
 * Pure TypeScript (ZERO Three.js, ZERO React, ZERO browser DOM dependencies).
 * Owned by Lead Architect & Integration Coordinator on `integration/atlas-v2`.
 * All five parallel worktree sessions MUST consume these types rather than
 * inventing conflicting local schemas.
 *
 * Honesty & Provenance Discipline:
 *  - 2D geographic alignment, 3D schematic vertical tiers, procedural infill,
 *    prototype-scale rolling stock, and synthetic virtual train simulation
 *    are explicitly tagged and MUST NEVER be conflated in data or UI.
 *  - ODbL 1.0 datasets (osm-vertical.json, urban-chunks/*) remain strictly
 *    isolated from the CC-BY core AtlasDataset and JR Fare Engine.
 */

import type {
  HeightBasis,
  PortalPoint3D,
  SchematicTierId,
  SolvedPoint3D,
  TrackStructureKind,
} from '../domain/elevationSolver.js';
import type {
  AtlasDataset,
  DataNature,
  Provenance,
  SkId,
} from '../domain/types.js';

// ============================================================================
// 1. COORDINATE, ELEVATION & CLEARANCE CONTRACTS
// ============================================================================

/** WGS84 [longitude, latitude] in decimal degrees. */
export type GeoLonLat = [number, number];

/** Local tangent-plane metric coordinates: +X = East, -Z = North (+Z = South), 1 unit = 1m. */
export interface LocalMetricPoint2D {
  x: number;
  z: number;
}

/** Local tangent-plane 3D coordinates: +Y = Up (ground datum = 0). */
export interface LocalMetricPoint3D extends LocalMetricPoint2D {
  y: number;
}

export type ElevationDomain =
  | 'ground_datum_m'
  | 'schematic_tier_y'
  | 'terrain_dem_m'
  | 'structure_local_m';

export type GeometryFidelity =
  | 'geo_accurate_2d'
  | 'osm_derived_3d'
  | 'manual_verified_relative'
  | 'schematic_inferred'
  | 'procedural_infill'
  | 'procedural_prototype_scale'
  | 'synthetic_simulation';

/**
 * Strictly ordered opaque surface elevation stratification (meters relative to ground datum = 0)
 * to guarantee zero Z-fighting across city terrain, bay, rivers, parks, plazas, and roads.
 */
export const SURFACE_ELEVATION_LAYERS = {
  baseGroundY: -1.25,
  tokyoBayY: -0.95,
  landuseIndustrialY: -0.83,
  landuseResidentialY: -0.8,
  landuseCommercialY: -0.76,
  riverQuayY: -0.65,
  riverWaterMinY: -0.58,
  riverWaterMaxY: -0.49,
  parkMinY: -0.34,
  parkMaxY: -0.22,
  railGravelCorridorY: -0.14,
  sidewalkPlazaY: -0.06,
  localRoadY: 0.03,
  secondaryRoadY: 0.09,
  arterialRoadY: 0.16,
  elevatedExpresswayY: 7.4,
} as const;

/**
 * Unified track-to-train-to-tunnel physical clearance standards (1 unit = 1 meter).
 *
 * Vehicle local coordinate convention (MANDATORY for atlas-rollingstock & atlas-simulation):
 *  - Local +Z = Forward (front cab nose at +Z)
 *  - Local +Y = Up
 *  - Local  y = 0 at bottom of wheel tread (flush on rail head!)
 *  - Euler rotation order = 'YXZ':
 *      yawRad   = Math.atan2(dirX, dirZ)
 *      pitchRad = -Math.asin(clamp(dirY, -1, 1))
 *      rollRad  = 0 (or optional cant)
 *
 * Japanese Left-Hand Running (左側通行):
 *  - Right-hand normal for segment forward (dx, dz) is (rx, rz) = (-dz/len, dx/len).
 *  - direction = +1 (fromStation -> toStation): lateralOffsetM = -trackHalfSpacingM (LEFT track).
 *  - direction = -1 (toStation -> fromStation): lateralOffsetM = +trackHalfSpacingM (LEFT when facing reverse).
 *  - Single track: lateralOffsetM = 0.
 */
export const TRACK_CLEARANCE_STANDARDS = {
  surfaceRoadbedTopM: 0.32,
  slabRoadbedTopM: 0.12,
  railHeightM: 0.36,
  surfaceRailHeadOffsetM: 0.68,
  slabRailHeadOffsetM: 0.48,
  conventionalHalfSpacingM: 1.85,
  shinkansenHalfSpacingM: 2.15,
  linearMetroHalfSpacingM: 1.75,
  catenaryContactWireHeightM: 5.4,
  tunnelPortalThresholdY: -2.4,
  minTunnelClearance: {
    conventional: { halfWidthM: 4.6, headroomAboveRailM: 5.2 },
    shinkansen: { halfWidthM: 5.6, headroomAboveRailM: 5.8 },
    linearMetro: { halfWidthM: 4.2, headroomAboveRailM: 4.2 },
  },
} as const;

// ============================================================================
// 2. CITY PARCELS, BUILDINGS, ROADS & TERRAIN CONTRACTS (atlas-city)
// ============================================================================

export type TerrainDatumKind = 'flat_datum' | 'dem_meters';

export type CityLightingPreset = 'day' | 'dusk' | 'night';

export type CityParcelKind =
  | 'commercial'
  | 'residential'
  | 'industrial'
  | 'railway'
  | 'civic'
  | 'park'
  | 'water'
  | 'plaza';

export type CityRoadHierarchy =
  | 'expressway'
  | 'arterial'
  | 'secondary'
  | 'local'
  | 'pedestrian';

export interface CityParcelRecord {
  id: string;
  kind: CityParcelKind;
  footprintXZ: [number, number][];
  elevationM: number;
  geometryFidelity: GeometryFidelity;
  sourceId: string;
}

export interface CityRoadRecord {
  id: string;
  hierarchy: CityRoadHierarchy;
  widthM: number;
  elevationM: number;
  pointsXZ: [number, number][];
  isElevated: boolean;
  sourceId: string;
}

export interface CityTerrainElevationSampler {
  readonly datumKind: TerrainDatumKind;
  sampleGroundY(x: number, z: number): number;
}

export interface CityRenderStats {
  loadedChunks: number;
  totalChunks: number;
  renderedBuildings: number;
  lod0Chunks: number;
  lod1Chunks: number;
  realOsmBuildings: number;
  infillBuildings: number;
  landmarkCount: number;
  terrainDatumKind: TerrainDatumKind;
}

// ============================================================================
// 3. PHYSICAL TRACK, CONNECTIONS & STATION ANCHORS (SHARED SPINE)
// ============================================================================

export type TrackGaugeMm = 1067 | 1372 | 1435;

export type ElectrificationKind =
  | 'overhead_dc_1500v'
  | 'overhead_ac_25kv'
  | 'third_rail_600v'
  | 'linear_motor_dc_1500v'
  | 'non_electrified'
  | 'unknown';

/** +1 = fromStationId -> toStationId, -1 = toStationId -> fromStationId */
export type TrackDirection = 1 | -1;

/**
 * `physical_track` entity bridging AtlasDataset.trackSegments and SolvedRailwayNetwork3D.
 * Shared across atlas-underground, atlas-rollingstock, atlas-simulation, and atlas-camera-ui.
 */
export interface PhysicalTrack {
  /** Stable physical track ID: `sk:physical_track:<slug>` */
  id: string;
  /** Canonical AtlasDataset TrackSegment ID */
  segmentId: SkId<'segment'>;
  primaryLineId: SkId<'line'>;
  railLineIds: SkId<'line'>[];
  operatorId: SkId<'operator'>;
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  isDoubleTrack: boolean;
  isShinkansen: boolean;
  gaugeMm: TrackGaugeMm;
  electrification: ElectrificationKind;
  /** Half center-to-center track spacing (0 for single track) */
  trackHalfSpacingM: number;
  /** Vertical offset from track spline y to top-of-rail head */
  railHeadOffsetM: number;
  /** Statutory operating km from AtlasDataset (NEVER mutated by 3D geometry!) */
  operatingKm: number | null;
  /** True 3D metric polyline length at verticalExaggeration = 1.0 */
  geometryLengthM: number;
  /** Typical operating speed limit for virtual simulation (km/h) */
  maxSpeedKmh: number;
  speedBasis: 'typical_schematic' | 'official';
  dominantTier: SchematicTierId;
  dominantStructure: TrackStructureKind;
  heightBasis: HeightBasis;
  geometryFidelity: GeometryFidelity;
  points: SolvedPoint3D[];
  portals: PortalPoint3D[];
  minY: number;
  maxY: number;
  color: string;
  provenance: Provenance;
}

export type TrackConnectionKind =
  | 'continuation'
  | 'branch'
  | 'loop_closure'
  | 'through_service'
  | 'turnback';

export interface TrackConnection {
  id: string;
  atStationId: SkId<'station'>;
  fromTrackId: string;
  fromEnd: 'start' | 'end';
  toTrackId: string;
  toEnd: 'start' | 'end';
  kind: TrackConnectionKind;
  railLineIds: SkId<'line'>[];
  isThroughService: boolean;
}

export interface StationAnchor3D {
  stationId: SkId<'station'>;
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  stationComplexId: SkId<'complex'> | null;
  nameJa: string;
  nameEn: string | null;
  stationCode: string | null;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  tier: SchematicTierId;
  structure: TrackStructureKind;
  isUnderground: boolean;
  isMajorHub: boolean;
  platformLengthM: number;
  platformLayout: 'island' | 'side_dual' | 'stacked';
  heightBasis: HeightBasis;
  color: string;
}

export interface TrackPoseSample {
  /** World coordinate at TOP OF RAIL HEAD (incorporating left-hand offset & verticalExaggeration) */
  x: number;
  y: number;
  z: number;
  /** Track corridor centerline before lateral offset */
  centerX: number;
  centerY: number;
  centerZ: number;
  /** Unit forward tangent in the direction of travel */
  dirX: number;
  dirY: number;
  dirZ: number;
  /** Unit right-hand horizontal normal in the direction of travel */
  rightX: number;
  rightZ: number;
  /** Three.js YXZ Euler yaw so local +Z points along (dirX, dirY, dirZ) */
  yawRad: number;
  /** Three.js YXZ Euler pitch so local +Z pitches cleanly along grade */
  pitchRad: number;
  distanceFromTrackStartM: number;
  tier: SchematicTierId;
  structure: TrackStructureKind;
  isUnderground: boolean;
  inTunnel: boolean;
}

export interface PhysicalTrackGraph {
  tracks: PhysicalTrack[];
  tracksById: Map<string, PhysicalTrack>;
  tracksBySegmentId: Map<SkId<'segment'>, PhysicalTrack>;
  tracksByLineId: Map<SkId<'line'>, PhysicalTrack[]>;
  connections: TrackConnection[];
  /** Key: `${trackId}::${'start' | 'end'}` */
  connectionsByTrackEnd: Map<string, TrackConnection[]>;
  stationAnchors: StationAnchor3D[];
  /** Key: `${lineId}::${stationId}` */
  stationAnchorsByKey: Map<string, StationAnchor3D>;
}

// ============================================================================
// 4. OPERATING PATTERNS & VIRTUAL SERVICE SPEC (atlas-simulation)
// ============================================================================

export type VirtualServiceClass =
  | 'local'
  | 'rapid'
  | 'express'
  | 'limited_express'
  | 'shinkansen';

export interface OperatingPatternSpec {
  id: string;
  operatorId: SkId<'operator'>;
  railLineIds: SkId<'line'>[];
  nameJa: string;
  nameEn: string;
  serviceClass: VirtualServiceClass;
  stopStationIds: SkId<'station'>[];
  isLoop: boolean;
  headwaySec: number;
  defaultDwellSec: number;
  defaultTrainModelId: TrainModelId;
  defaultCarCount: number;
  /** Honesty tag: virtual patterns are ALWAYS synthetic */
  dataNature: 'synthetic';
  isVirtualSimulation: true;
  notes: string;
}

// ============================================================================
// 5. UNDERGROUND TUNNEL & STATION STRUCTURE CONTRACTS (atlas-underground)
// ============================================================================

export type TunnelProfileKind =
  | 'shield_single_bore'
  | 'shield_twin_bore'
  | 'cut_and_cover_box'
  | 'station_cavern';

export type TunnelCutawayStyle =
  | 'solid_shell'
  | 'translucent_shell'
  | 'section_cutaway'
  | 'interior_view';

export interface UndergroundTunnelSpec {
  trackId: string;
  lineId: SkId<'line'>;
  profileKind: TunnelProfileKind;
  innerHalfWidthM: number;
  innerHeightM: number;
  wallThicknessM: number;
  ringSpacingM: number;
  lightingIntervalM: number;
  geometryFidelity: GeometryFidelity;
}

export interface UndergroundStationStructureSpec {
  stationId: SkId<'station'>;
  stationComplexId: SkId<'complex'> | null;
  lineId: SkId<'line'>;
  platformLayout: 'island' | 'side_dual' | 'stacked';
  platformLengthM: number;
  platformWidthM: number;
  concourseLevels: number;
  hasPlatformScreenDoors: boolean;
  geometryFidelity: GeometryFidelity;
}

export interface UndergroundCutawayState {
  enabled: boolean;
  centerX: number;
  centerZ: number;
  radiusM: number;
  verticalExaggeration: number;
  groundOpacity: number;
  pinCutaway: boolean;
  hideBuildings: boolean;
  clipEnabled: boolean;
  clipY: number;
  tunnelCutawayStyle: TunnelCutawayStyle;
  visibleTiers: Record<SchematicTierId, boolean>;
}

export interface UndergroundRenderStats {
  tunnelBatchCount: number;
  undergroundStationCount: number;
  portalCount: number;
  transferConnectorCount: number;
  tunnelCutawayStyle: TunnelCutawayStyle;
  activeInteriorLightCount: number;
}

// ============================================================================
// 6. ROLLING STOCK MODELS & CONSIST CONTRACTS (atlas-rollingstock)
// ============================================================================

export type TrainModelId =
  | 'jr-e235-0'
  | 'jr-e233-0'
  | 'jr-e233-3000'
  | 'shinkansen-n700s'
  | 'shinkansen-e5'
  | 'metro-1000'
  | 'metro-2000'
  | 'metro-16000'
  | 'metro-17000'
  | 'metro-18000'
  | 'toei-12-600'
  | 'private-commuter-generic';

export type TrainCarRole =
  | 'lead_cab'
  | 'motor'
  | 'trailer'
  | 'pantograph'
  | 'tail_cab';

export interface RollingStockSpec {
  modelId: TrainModelId;
  nameJa: string;
  nameEn: string;
  operatorId: SkId<'operator'>;
  compatibleLineIds: SkId<'line'>[];
  gaugeMm: TrackGaugeMm;
  electrification: ElectrificationKind;
  /** Standard intermediate car length (m) */
  carLengthM: number;
  /** End cab car length (m) */
  endCarLengthM: number;
  /** Body width (m) */
  carWidthM: number;
  /** Body roof height above rail head (m, excluding raised pantograph) */
  carHeightM: number;
  /** Gap between adjacent cars (m) */
  couplerGapM: number;
  /** Distance between bogie centers (m) */
  bogiePitchM: number;
  defaultCarCount: number;
  maxSpeedKmh: number;
  liveryPrimaryHex: string;
  liveryAccentHex: string;
  bodyBaseHex: string;
  geometryFidelity: 'procedural_prototype_scale';
  dataNature: DataNature;
  referenceNotes: string;
}

export interface TrainConsistSpec {
  consistId: string;
  modelId: TrainModelId;
  carCount: number;
  cars: { index: number; role: TrainCarRole; lengthM: number }[];
  totalLengthM: number;
}

export interface RollingStockRenderStats {
  renderedTrainCount: number;
  renderedCarCount: number;
  lodNearTrains: number;
  lodMidTrains: number;
  lodFarTrains: number;
  drawCallsEstimate: number;
}

// ============================================================================
// 7. VIRTUAL TRAIN SIMULATION ENGINE CONTRACTS (atlas-simulation)
// ============================================================================

export type TrainPhase =
  | 'accelerating'
  | 'cruising'
  | 'braking'
  | 'dwelling'
  | 'turning_back';

export type TrainDoorState = 'closed' | 'opening' | 'open' | 'closing';

export interface SimulatedCarPose {
  carIndex: number;
  role: TrainCarRole;
  lengthM: number;
  /** Center of car at rail head height (already vertically scaled cleanly; car mesh stays 1:1!) */
  x: number;
  y: number;
  z: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  trackId: string;
  tier: SchematicTierId;
  isUnderground: boolean;
}

export interface SimulatedTrainState {
  trainId: string;
  runNumber: string;
  /** MANDATORY honesty guard — never confuse virtual simulation with real-time telemetry! */
  readonly isVirtualSimulation: true;
  readonly dataNature: 'synthetic';
  readonly disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME';
  operatorId: SkId<'operator'>;
  lineId: SkId<'line'>;
  lineColor: string;
  servicePatternId: string;
  serviceClass: VirtualServiceClass;
  modelId: TrainModelId;
  carCount: number;
  direction: TrackDirection;
  phase: TrainPhase;
  speedKmh: number;
  speedMps: number;
  currentTrackId: string;
  currentSegmentId: SkId<'segment'>;
  distanceAlongTrackM: number;
  fromStationId: SkId<'station'>;
  nextStationId: SkId<'station'>;
  destinationStationId: SkId<'station'>;
  dwellRemainingSec: number;
  doorState: TrainDoorState;
  headPose: {
    x: number;
    y: number;
    z: number;
    dirX: number;
    dirY: number;
    dirZ: number;
    yawRad: number;
    pitchRad: number;
  };
  carPoses: SimulatedCarPose[];
  tier: SchematicTierId;
  isUnderground: boolean;
  inTunnel: boolean;
  progressOnRoute: number;
}

export type SimTimeScale = 0.5 | 1 | 2 | 5 | 10;
export type SimTrainDensity = 'low' | 'normal' | 'rush';

export interface SimulationControlState {
  running: boolean;
  timeScale: SimTimeScale;
  simClockSec: number;
  density: SimTrainDensity;
  activeLineFilter: SkId<'line'>[] | null;
  totalActiveTrains: number;
  undergroundTrainCount: number;
  readonly isVirtualSimulation: true;
  readonly dataNature: 'synthetic';
}

export interface SimulationInitOptions {
  seed?: number;
  density?: SimTrainDensity;
  timeScale?: SimTimeScale;
  autoStart?: boolean;
  lineFilter?: SkId<'line'>[] | null;
}

export interface TrainSimulationEngineAdapter {
  readonly engineId: string;
  initialize(
    graph: PhysicalTrackGraph,
    dataset: AtlasDataset,
    options?: SimulationInitOptions,
  ): void;
  step(dtSec: number, verticalExaggeration?: number): readonly SimulatedTrainState[];
  getTrains(): readonly SimulatedTrainState[];
  getTrainById(trainId: string): SimulatedTrainState | undefined;
  getControlState(): SimulationControlState;
  setRunning(running: boolean): void;
  setTimeScale(scale: SimTimeScale): void;
  setDensity(density: SimTrainDensity): void;
  setLineFilter(lineIds: SkId<'line'>[] | null): void;
  reset(seed?: number): void;
  /**
   * Returns the trainId of a deterministic flagship underground demo train
   * (e.g., Tokyo Metro Marunouchi/Ginza/Fukutoshin or Toei Oedo) guaranteed
   * to run continuously through underground tunnels & stations.
   */
  getDemoUndergroundTrainId(): string | null;
}

// ============================================================================
// 8. CAMERA MODES, TARGETS & UI TELEMETRY CONTRACTS (atlas-camera-ui)
// ============================================================================

export type CameraModeV2 =
  | 'map'
  | 'free'
  | 'follow_train'
  | 'cab_ride'
  | 'underground_inspect'
  | 'station_focus';

export type TrainFollowView = 'chase' | 'side' | 'cab' | 'overhead_cutaway';

export type CameraTargetV2 =
  | { kind: 'world'; x: number; y: number; z: number }
  | { kind: 'hub'; presetId: string }
  | { kind: 'station'; stationId: SkId<'station'> }
  | { kind: 'line'; lineId: SkId<'line'> }
  | { kind: 'train'; trainId: string; view: TrainFollowView };

export interface CameraStateSnapshot {
  mode: CameraModeV2;
  target: CameraTargetV2;
  position: [number, number, number];
  lookAt: [number, number, number];
  distanceM: number;
  isUndergroundCamera: boolean;
  followingTrainId: string | null;
  followView: TrainFollowView | null;
}

export interface V2SceneTelemetryExtras {
  activeTrains?: number;
  undergroundTrains?: number;
  simRunning?: boolean;
  simTimeScale?: SimTimeScale;
  simClockSec?: number;
  cameraModeV2?: CameraModeV2;
  cameraUnderground?: boolean;
  tunnelCutawayStyle?: TunnelCutawayStyle;
  terrainDatumKind?: TerrainDatumKind;
  rollingStockCars?: number;
}
