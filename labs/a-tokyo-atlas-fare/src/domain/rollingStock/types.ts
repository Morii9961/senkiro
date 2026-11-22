/**
 * SENKIRO Atlas v2 — Japanese Rolling Stock 3D Asset System
 * Pure TypeScript Domain Contract (Zero React / Zero Three.js dependency)
 */

import type {
  DataNature,
  LocalizedNames,
  Provenance,
  SkId,
  SourceRecord,
} from '../types.js';

export type RollingStockSeriesId =
  | 'jr-east-e235-0'
  | 'tokyo-metro-1000'
  | 'tokyo-metro-17000';

export type RollingStockEntityId = `sk:rolling-stock:${RollingStockSeriesId}`;

export type RollingStockCarRole =
  | 'lead_front'      // Cab car at head of train (+X / +forward local orientation)
  | 'intermediate_m'  // Motorized intermediate car (with pantograph on catenary trains)
  | 'intermediate_t'  // Trailer / non-pantograph intermediate car
  | 'lead_rear';      // Cab car at tail of train (flipped 180 deg so cab faces rear)

export type RollingStockLodLevel = 'high' | 'medium' | 'low';

export type DoorSide = 'left' | 'right' | 'both';

export type TravelDirection = 'forward' | 'reverse';

export type ElectrificationSystem =
  | 'overhead_1500v_dc'
  | 'third_rail_600v_dc';

export type BodyCrossSectionProfile =
  | 'wide_body_barrel'     // JR East 2950mm wide-body curved side (E235-0)
  | 'compact_subway_flat'  // Tokyo Metro Ginza 2550mm flat vertical side + arched maroon roof (1000)
  | 'atrain_tapered';      // Hitachi A-train 2800mm double-skin aluminum slight upper chamfer (17000)

export type FrontDesignArchetype =
  | 'flat_digital_frame'       // E235-0 flat black screen with rounded Uguisu Green outer bezel & top-corner rectangular LEDs
  | 'retro_box_center_door'    // 1000 series retro lemon-yellow cab with center emergency door & lower vertical twin headlamps
  | 'aero_sloped_round_eyes';  // 17000 series sloped 3D black glass dome with left-offset door & iconic circular ring headlights

export interface CarDimensionSpec {
  /** Coupler-to-coupler pitch length in meters (e.g., 20.0m or 16.0m) */
  readonly couplerLengthM: number;
  /** Lead car body shell length in meters (e.g., 19.57m, 15.52m, 19.63m) */
  readonly leadBodyLengthM: number;
  /** Intermediate car body shell length in meters (e.g., 19.50m, 15.40m, 19.50m) */
  readonly intermediateBodyLengthM: number;
  /** Maximum car body width in meters (e.g., 2.950m, 2.550m, 2.800m) */
  readonly bodyWidthM: number;
  /** Car roof crown height above railhead in meters (e.g., 3.620m, 3.465m, 3.635m) */
  readonly roofHeightM: number;
  /** Pantograph folded height above railhead in meters (null for third-rail trains) */
  readonly pantographHeightM: number | null;
  /** Car floor height above railhead in meters (e.g., 1.130m, 1.125m, 1.140m) */
  readonly floorHeightM: number;
  /** Track gauge in meters (1.067m narrow gauge or 1.435m standard gauge) */
  readonly trackGaugeM: number;
  /** Longitudinal distance between front and rear bogie centers in meters (e.g., 13.80m or 10.60m) */
  readonly bogieCenterDistanceM: number;
  /** Wheelbase between axles within a single bogie in meters (e.g., 2.10m or 1.90m) */
  readonly bogieWheelbaseM: number;
  /** Wheel tread diameter in meters (e.g., 0.860m) */
  readonly wheelDiameterM: number;
  /** Number of double-leaf passenger doors per side (4 for E235/17000, 3 for Ginza 1000) */
  readonly doorsPerSide: 3 | 4;
  /** Clear door opening width in meters (e.g., 1.300m) */
  readonly doorWidthM: number;
  /** Clear door opening height in meters (e.g., 1.850m) */
  readonly doorHeightM: number;
  /** Inter-car gangway gap in meters */
  readonly interCarGapM: number;
}

export interface LiveryColorPalette {
  /** Primary car body material color (hex) */
  readonly bodyPrimaryHex: string;
  /** Secondary body / lower skirt or roof color (hex) */
  readonly bodySecondaryHex: string;
  /** Roof main color (hex) */
  readonly roofHex: string;
  /** Primary line color stripe / bezel (hex) */
  readonly primaryStripeHex: string;
  /** Secondary line accent stripe (hex, e.g. Fukutoshin brown or Ginza white/brown belt) */
  readonly secondaryStripeHex: string | null;
  /** Front mask / glass surround color (hex) */
  readonly frontMaskHex: string;
  /** Underfloor equipment & bogie frame color (hex) */
  readonly underfloorHex: string;
  /** Window glass tint color (hex) */
  readonly glassHex: string;
  /** Livery pattern type for distinct side & distant appearance */
  readonly liveryPattern:
    | 'e235_vertical_door_bands'
    | 'ginza1000_full_yellow_maroon_roof'
    | 'metro17000_dual_gold_brown_belts';
}

export interface ConsistCarSlot {
  readonly carNumber: number; // 1-indexed car number in formation
  readonly designationJa: string; // e.g. "クハE235", "モハE235", "1100形", "17100形"
  readonly role: RollingStockCarRole;
  readonly hasPantograph: boolean;
  readonly pantographCount: 0 | 1 | 2;
  readonly hasFreeSpace?: boolean;
}

export interface ConsistPreset {
  readonly id: string;
  readonly labelJa: string;
  readonly labelEn: string;
  readonly carCount: number;
  readonly isOfficialFullLength: boolean;
  readonly cars: readonly ConsistCarSlot[];
}

export interface LodPerformanceBudget {
  readonly level: RollingStockLodLevel;
  /** Switch-in camera distance threshold in meters */
  readonly maxDistanceM: number;
  /** Target maximum triangles per car at this LOD */
  readonly maxTrianglesPerCar: number;
  /** Target maximum draw calls per car at this LOD */
  readonly maxDrawCallsPerCar: number;
  readonly featuresIncluded: readonly string[];
}

export interface AssetCredibilityRecord {
  readonly sourceIds: readonly string[];
  readonly dataNature: DataNature;
  readonly lastVerifiedAt: string;
  readonly officialReferenceUrls: readonly string[];
  readonly manufacturerAndDesigner: string;
  readonly assetLicense: string;
  readonly copyrightComplianceNotes: string;
  readonly accuracyHighlights: readonly string[];
  readonly knownSimplifications: readonly string[];
}

export interface RollingStockSpec {
  readonly id: RollingStockEntityId;
  readonly seriesId: RollingStockSeriesId;
  readonly operatorId: SkId<'operator'>;
  readonly applicableLineIds: readonly SkId<'line'>[];
  readonly names: LocalizedNames;
  readonly introducedYear: number;
  readonly maxOperatingSpeedKmh: number;
  readonly designSpeedKmh: number;
  readonly electrification: ElectrificationSystem;
  readonly bodyProfile: BodyCrossSectionProfile;
  readonly frontArchetype: FrontDesignArchetype;
  readonly bogieModel: string;
  readonly pantographModel: string | null;
  readonly dimensions: CarDimensionSpec;
  readonly palette: LiveryColorPalette;
  readonly standardConsists: readonly ConsistPreset[];
  readonly lodBudgets: Readonly<Record<RollingStockLodLevel, LodPerformanceBudget>>;
  readonly glbAssetPaths: {
    readonly leadCar: string;
    readonly intermediateCar: string;
    readonly previewConsist: string;
  };
  readonly credibility: AssetCredibilityRecord;
  readonly provenance: Provenance;
}

/**
 * 3D Point along a railway spline in world coordinates (1 unit = 1m).
 */
export interface TrackSplinePoint3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Optional cant / superelevation bank angle in radians */
  readonly cantRad?: number;
}

/**
 * Computed 3D world pose for a single railway car and its two articulating bogies.
 */
export interface SolvedCarPose3D {
  readonly carIndex: number;
  /** Car body center world coordinates (at railhead level) */
  readonly position: { x: number; y: number; z: number };
  /** Unit forward vector along the chord from rear bogie pivot to front bogie pivot */
  readonly forward: { x: number; y: number; z: number };
  /** Yaw rotation around +Y axis in radians (atan2(-forward.z, forward.x)) */
  readonly yawRad: number;
  /** Pitch rotation around local lateral axis in radians (positive = climbing) */
  readonly pitchRad: number;
  /** Roll / superelevation cant angle around local longitudinal axis in radians */
  readonly rollRad: number;
  /** Front bogie world pivot coordinates */
  readonly frontBogiePosition: { x: number; y: number; z: number };
  /** Rear bogie world pivot coordinates */
  readonly rearBogiePosition: { x: number; y: number; z: number };
  /** Front bogie local yaw deflection relative to car body in radians (for curve tracking) */
  readonly frontBogieLocalYawRad: number;
  /** Rear bogie local yaw deflection relative to car body in radians (for curve tracking) */
  readonly rearBogieLocalYawRad: number;
  /** Inter-car coupler/gangway yaw angle to the next car behind this car in radians */
  readonly rearGangwayYawRad: number;
  /** Arc-length distance of car center along the track polyline in meters */
  readonly centerArcDistanceM: number;
}

export interface TrainLightState {
  readonly headlights: boolean;
  readonly taillights: boolean;
  readonly destinationSign: boolean;
  readonly interiorLights: boolean;
  /** Emissive intensity multiplier (0.2 .. 2.0) */
  readonly brightness: number;
}

export interface TrainDoorState {
  /** Target open ratio for left-side doors (0 = closed, 1 = fully open) */
  readonly leftTarget: number;
  /** Current animated open ratio for left-side doors (0 .. 1) */
  readonly leftCurrent: number;
  /** Target open ratio for right-side doors (0 = closed, 1 = fully open) */
  readonly rightTarget: number;
  /** Current animated open ratio for right-side doors (0 .. 1) */
  readonly rightCurrent: number;
}

export interface TrainAnimationState {
  readonly travelDirection: TravelDirection;
  readonly doors: TrainDoorState;
  readonly lights: TrainLightState;
  readonly wheelRotationRad: number;
  readonly pantographRaised: boolean;
  readonly activeLod: RollingStockLodLevel;
  readonly lodMode: RollingStockLodLevel | 'auto';
}

export interface RollingStockCatalogDataset {
  readonly generatedAt: string;
  readonly schemaVersion: '2.0.0';
  readonly spatialUnit: '1_unit_equals_1_meter';
  readonly sources: readonly SourceRecord[];
  readonly rollingStock: readonly RollingStockSpec[];
}
