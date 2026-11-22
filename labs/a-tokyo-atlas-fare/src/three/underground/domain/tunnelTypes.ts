/**
 * SENKIRO Atlas v2 — Underground Railway Geometry & Tunnel System Types
 *
 * Pure TypeScript domain & spatial-query contracts (zero Three.js / React dependency).
 * Built strictly on the unified metric local tangent-plane coordinate convention of
 * `src/three/geoProjection.ts` (+X East, +Y Up, -Z North, 1 unit = 1m, origin = TOKYO_ORIGIN)
 * and `src/domain/elevationSolver.ts`.
 */

import type {
  HeightBasis,
  SchematicTierId,
  TrackStructureKind,
} from '../../../domain/elevationSolver.js';
import type { SkId } from '../../../domain/types.js';

export type TunnelStructureType =
  | 'shield_single'
  | 'shield_double'
  | 'box_single'
  | 'box_double'
  | 'station_island'
  | 'station_side'
  | 'transition_collar'
  | 'portal_ramp';

export type PowerSupplyKind = 'third_rail' | 'rigid_catenary';

/**
 * Honesty marker for underground vertical depth:
 * All current Tokyo Atlas elevations are schematic relative tiers (not surveyed civil as-builts).
 */
export type DepthReliability = 'schematic' | 'surveyed';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Aabb3D {
  min: [number, number, number];
  max: [number, number, number];
}

/** 2D cross-section point in local tunnel frame: [rightOffsetM, upOffsetM] relative to track centerline y */
export type ProfilePoint2D = readonly [rightM: number, upM: number];

/**
 * Dynamic vehicle clearance gauge envelope for future Virtual Train Session.
 * All dimensions relative to track lane centerline & Top-of-Rail (TOR).
 */
export interface TrainClearanceEnvelope {
  /** Nominal track gauge in meters (1.435 standard or 1.067 narrow) */
  gaugeM: number;
  /** Maximum carbody width in meters (Japanese metro standard: 2.80-2.95m) */
  carWidthM: number;
  /** Maximum carbody roof height above TOR in meters */
  carHeightAboveTorM: number;
  /** Maximum pantograph / collector envelope height above TOR (0 if third rail) */
  collectorHeightAboveTorM: number;
  /** Required minimum structural clearance margin around dynamic envelope in meters */
  safetyMarginM: number;
}

export interface LineEngineeringSpec {
  lineId: SkId<'line'>;
  gaugeM: 1.435 | 1.067;
  powerSupply: PowerSupplyKind;
  preferShieldTunnel: boolean;
  /** Default single-bore vs double-bore when shield tunnel is used */
  shieldDoubleTrackSingleBore: boolean;
  /** Preferred underground station layout when not overridden */
  defaultStationLayout: 'station_island' | 'station_side';
  /** Track lane center lateral offsets relative to corridor centerline (m) */
  doubleTrackHalfSpacingM: number;
  /** Top-of-rail height above centerline y (matches railTrackGenerator.ts: 0.12 slab + 0.36 rail = 0.48) */
  railTopOffsetM: number;
  /** Track slab top surface offset above centerline y */
  slabTopOffsetM: number;
}

export interface WalkwaySpec {
  side: 'left' | 'right';
  innerRightM: number;
  outerRightM: number;
  topUpM: number;
  bottomUpM: number;
}

export interface CableTroughSpec {
  side: 'left' | 'right';
  rightM: number;
  upM: number;
  widthM: number;
  heightM: number;
}

export interface TunnelCrossSectionSpec {
  structureType: TunnelStructureType;
  isDoubleTrack: boolean;
  gaugeM: number;
  powerSupply: PowerSupplyKind;
  /** Lateral center offsets for each running track (e.g. [-1.85, +1.85] or [0]) */
  trackCenterOffsetsM: number[];
  slabTopOffsetM: number;
  railTopOffsetM: number;
  wallThicknessM: number;
  /** Clear interior width (m) */
  innerWidthM: number;
  /** Clear interior height above track slab (m) */
  innerHeightM: number;
  /** Closed counter-clockwise 2D inner lining profile [right, up] */
  innerProfile: ProfilePoint2D[];
  /** Closed counter-clockwise 2D outer structural shell profile [right, up] */
  outerProfile: ProfilePoint2D[];
  /** Indices into innerProfile that belong to the removable roof/crown cap for roof-cutaway mode */
  roofProfileSplitY: number;
  walkways: WalkwaySpec[];
  cableTroughs: CableTroughSpec[];
  /** Local [right, up] anchor positions for tunnel luminaires */
  luminaireAnchors: ProfilePoint2D[];
  /** Whether a central structural column row is placed between double tracks (rectangular box) */
  hasCenterColumns: boolean;
  /** Platform deck geometry in local coordinates (only for station_* types) */
  platforms: Array<{
    innerRightM: number;
    outerRightM: number;
    topUpM: number;
    bottomUpM: number;
  }>;
  clearanceEnvelope: TrainClearanceEnvelope;
}

export interface ClearanceValidationResult {
  valid: boolean;
  minHorizontalMarginM: number;
  minVerticalMarginM: number;
  violations: string[];
}

export interface TrackFrame3D {
  position: Vec3;
  tangent: Vec3;
  right: Vec3;
  up: Vec3;
  /** Arc-length from segment start in meters */
  distanceM: number;
  /** Longitudinal grade dy / dHoriz */
  grade: number;
  structureType: TunnelStructureType;
  tier: SchematicTierId;
  depthReliability: DepthReliability;
  heightBasis: HeightBasis;
}

export interface TunnelSubSpan {
  id: string;
  segmentId: SkId<'segment'>;
  structureType: TunnelStructureType;
  /** Start & end cross-sections (differ for transition_collar) */
  startSpec: TunnelCrossSectionSpec;
  endSpec: TunnelCrossSectionSpec;
  samples: TrackFrame3D[];
  startDistM: number;
  endDistM: number;
  bounds: Aabb3D;
}

export interface TunnelPortalSpec {
  id: string;
  segmentId: SkId<'segment'>;
  lineId: SkId<'line'>;
  frame: TrackFrame3D;
  /** Direction entering underground (+1 if tangent points underground, -1 if exiting underground) */
  intoTunnelSign: 1 | -1;
  structureType: TunnelStructureType;
  spec: TunnelCrossSectionSpec;
  /** Ground cutout footprint hint for Environment Session coordination */
  surfaceCutout: {
    centerX: number;
    centerZ: number;
    dirX: number;
    dirZ: number;
    lengthM: number;
    widthM: number;
  };
}

export interface TunnelSegmentChunkSpec {
  segmentId: SkId<'segment'>;
  primaryLineId: SkId<'line'>;
  railLineIds: SkId<'line'>[];
  operatorId: SkId<'operator'>;
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  lineColor: string;
  tier: SchematicTierId;
  dominantStructure: TrackStructureKind;
  engineering: LineEngineeringSpec;
  depthReliability: DepthReliability;
  heightBasis: HeightBasis;
  /** Whether this segment is part of the high-detail pilot verification corridor */
  isPilotCorridor: boolean;
  totalLengthM: number;
  /** Smooth arc-length sampled centerline frames covering the entire underground run */
  centerline: TrackFrame3D[];
  subSpans: TunnelSubSpan[];
  portals: TunnelPortalSpec[];
  bounds: Aabb3D;
  /** Whether this segment is physically connected to neighbors via stations (not 2D crossings) */
  connectedStationIds: [SkId<'station'>, SkId<'station'>];
  deconflictedCrossings: number;
}

export interface StationCavernSpec {
  stationId: SkId<'station'>;
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  nameJa: string;
  nameEn: string | null;
  lineColor: string;
  tier: SchematicTierId;
  layout: 'station_island' | 'station_side';
  center: Vec3;
  tangent: Vec3;
  right: Vec3;
  lengthM: number;
  spec: TunnelCrossSectionSpec;
  platformLevelY: number;
  ceilingY: number;
  bounds: Aabb3D;
  depthReliability: DepthReliability;
  heightBasis: HeightBasis;
  isMajorHub: boolean;
  isPilotCorridor: boolean;
}

export interface TunnelViewpoint {
  id: string;
  labelJa: string;
  labelEn: string;
  segmentId: SkId<'segment'>;
  stationId?: SkId<'station'>;
  lineId: SkId<'line'>;
  kind:
    | 'portal_entry'
    | 'tunnel_interior'
    | 'station_platform'
    | 'shield_bore'
    | 'crossing_overlook'
    | 'cab_preview';
  position: Vec3;
  lookAt: Vec3;
  recommendedNearM: number;
  recommendedFovDeg: number;
  depthReliability: DepthReliability;
}

export interface TunnelClearanceConstraint {
  segmentId: SkId<'segment'>;
  bounds: Aabb3D;
  /** Safe interior camera envelope relative to track centerline (right, up) */
  safeCorridorLocal: {
    minRightM: number;
    maxRightM: number;
    minUpM: number;
    maxUpM: number;
  };
  exclusionBoxesLocal: Array<{
    startDistM: number;
    endDistM: number;
    minRightM: number;
    maxRightM: number;
    minUpM: number;
    maxUpM: number;
    reason: 'platform' | 'column' | 'rail_equipment' | 'wall';
  }>;
}

export type SectionCutMode =
  | 'none'
  | 'radial_cutaway'
  | 'horizontal_slice'
  | 'tunnel_roof_open';

export interface UndergroundSectionCutState {
  mode: SectionCutMode;
  /** Optional segment IDs whose outer shell is hidden for direct interior inspection */
  hideOuterShellForSegmentIds?: Set<SkId<'segment'>>;
  /** Optional segment IDs whose roof/crown cap is lifted/hidden for cutaway inspection */
  revealRoofForSegmentIds?: Set<SkId<'segment'>>;
  /** Reveal roof globally on all active underground chunks when mode === 'tunnel_roof_open' */
  revealAllRoofs?: boolean;
  /** Control independent line-color info overlay (default false = neutral realistic tracks) */
  lineOverlayVisible?: boolean;
}

export interface UndergroundSystemTelemetry {
  totalTunnelChunks: number;
  visibleTunnelChunks: number;
  detailedInteriorChunks: number;
  totalStationCaverns: number;
  visibleStationCaverns: number;
  activePointLights: number;
  portalCount: number;
  pilotChunkCount: number;
  roofCutawayActive: boolean;
  lineOverlayVisible: boolean;
  interiorModeActive: boolean;
}

/**
 * Spatial query & visibility contract exported for Camera Session and Virtual Train Session.
 * Does NOT replace or rewrite global `cameraController.ts`.
 */
export interface UndergroundRailwayQueryAPI {
  getEnterableSegments(): Array<{
    segmentId: SkId<'segment'>;
    lineId: SkId<'line'>;
    lengthM: number;
    bounds: Aabb3D;
    isPilotCorridor: boolean;
    depthReliability: DepthReliability;
    heightBasis: HeightBasis;
  }>;
  getCuratedViewpoints(): TunnelViewpoint[];
  sampleTrackFrame(
    segmentId: SkId<'segment'>,
    distanceM: number,
    trackIndex?: 0 | 1,
  ): TrackFrame3D | null;
  projectPointToNearestTunnel(
    worldPos: Vec3,
    maxDistM?: number,
  ): {
    segmentId: SkId<'segment'>;
    distanceM: number;
    frame: TrackFrame3D;
    localRightM: number;
    localUpM: number;
    insideClearance: boolean;
  } | null;
  getClearanceConstraint(segmentId: SkId<'segment'>): TunnelClearanceConstraint | null;
  getStationCavernBounds(stationId: SkId<'station'>): {
    stationId: SkId<'station'>;
    bounds: Aabb3D;
    platformLevelY: number;
    ceilingY: number;
    layout: 'station_island' | 'station_side';
    depthReliability: DepthReliability;
  } | null;
  getPortalCutoutHints(): TunnelPortalSpec['surfaceCutout'][];
  setSectionCutState(state: UndergroundSectionCutState): void;
  getSectionCutState(): UndergroundSectionCutState;
  getTelemetry(): UndergroundSystemTelemetry;
}

export interface BuiltUndergroundNetwork {
  chunks: TunnelSegmentChunkSpec[];
  stationCaverns: StationCavernSpec[];
  portals: TunnelPortalSpec[];
  viewpoints: TunnelViewpoint[];
  pilotSegmentIds: Set<SkId<'segment'>>;
  pilotStationIds: Set<SkId<'station'>>;
}
