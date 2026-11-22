/**
 * SENKIRO Atlas v2 — Deterministic Train Simulation Engine
 * Domain Model, 12-State FSM Contract, Configurable Parameters & Scene Output Interface.
 *
 * Pure TypeScript module (zero Three.js / React dependency).
 * Reuses Session 0 shared railway entities (`SkId`, `AtlasDataset`, `SolvedRailwayNetwork3D`,
 * `SchematicTierId`, `TrackStructureKind`) without inventing incompatible coordinate or line models.
 *
 * Honesty & Positioning Rule:
 * This is a virtual deterministic simulation system, NOT a real-time operations or official timetable feed.
 * All simulation entities, configurations, and outputs carry the mandatory tag:
 *   `Simulation / 模拟运行` (`dataNature: 'synthetic'`, `isRealtimeData: false`).
 */

import type {
  SchematicTierId,
  SolvedPoint3D,
  SolvedStationNode3D,
  TrackStructureKind,
} from '../domain/elevationSolver.js';
import type { DataNature, LineClass, SkId } from '../domain/types.js';

export const SIMULATION_LABEL = 'Simulation / 模拟运行' as const;
export type SimulationLabel = typeof SIMULATION_LABEL;

export const SIMULATION_DISCLAIMER =
  'Simulation / 模拟运行 — Virtual deterministic train simulation only; not official timetable or real-time train position data.' as const;

/**
 * 3D vector in SENKIRO's unified metric local tangent-plane coordinate system:
 *   +X = East (meters)
 *   +Y = Up   (schematic elevation units; ground = 0)
 *   -Z = North (meters; +Z = South)
 */
export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Complete 3D orientation for a train head or individual carriage in world coordinates.
 */
export interface Orientation3D {
  /** Unit forward tangent vector along direction of travel */
  readonly forward: Vector3Like;
  /** Unit up vector perpendicular to forward and right */
  readonly up: Vector3Like;
  /** Unit right-hand lateral vector */
  readonly right: Vector3Like;
  /** Heading angle in radians: atan2(forward.x, forward.z) in [-pi, pi] */
  readonly yawRad: number;
  /** Vertical grade pitch angle in radians: asin(forward.y) */
  readonly pitchRad: number;
  /** Cant / bank roll angle in radians (0 for level schematic tracks) */
  readonly rollRad: number;
  /** Unit quaternion [qx, qy, qz, qw] ready for direct consumption by Three.js Object3D.quaternion */
  readonly quaternion: readonly [number, number, number, number];
}

// ============================================================================
// 1. SIMULATION MODEL — 8 Distinct Domain Layers
// ============================================================================

/**
 * 1.1 Physical Track Segment (实体轨道区段)
 * Distinct from the nominal `RailLine` geographic polyline.
 * Represents a directed physical running track solved in 3D space with elevation,
 * structure kind, double-track lateral separation, and physical connectivity endpoints.
 */
export interface PhysicalTrackPathSegment {
  readonly trackSegmentId: SkId<'segment'>;
  readonly fromStationId: SkId<'station'>;
  readonly toStationId: SkId<'station'>;
  readonly operatorId: SkId<'operator'>;
  readonly railLineIds: readonly SkId<'line'>[];
  readonly isDoubleTrack: boolean;
  readonly isShinkansen: boolean;
  readonly lineClass: LineClass;
  /** Physical lateral offset (meters) separating up/down tracks on double-track corridors */
  readonly directionalLateralOffsetM: number;
  /** 3D solved points along this directed physical track segment */
  readonly points3D: readonly SolvedPoint3D[];
  /** Physical 3D arc length in meters */
  readonly lengthM: number;
  readonly dominantTier: SchematicTierId;
  readonly dominantStructure: TrackStructureKind;
}

/**
 * 1.2 Operating Line Reference (运营线路)
 */
export interface SimulatedOperatingLine {
  readonly lineId: SkId<'line'>;
  readonly operatorId: SkId<'operator'>;
  readonly nameJa: string;
  readonly nameEn: string | null;
  readonly color: string;
  readonly lineClass: LineClass;
  readonly stationIds: readonly SkId<'station'>[];
}

/**
 * 1.3 Station & Platform Stopping Target (站点与站台)
 */
export interface SimulatedPlatformStop {
  readonly platformId: string;
  readonly stationId: SkId<'station'>;
  readonly lineId: SkId<'line'>;
  readonly nameJa: string;
  readonly nameEn: string | null;
  readonly stationCode: string | null;
  /** Stop index along the RunnableTrackRoute (0 .. N-1) */
  readonly stopIndex: number;
  /** Exact cumulative arc-length coordinate (meters) along the route where the train nose stops */
  readonly stopArcLengthM: number;
  /** Effective platform length in meters */
  readonly platformLengthM: number;
  readonly platformSide: 'left' | 'right' | 'island';
  readonly position: Vector3Like;
  readonly tangent: Vector3Like;
  readonly tier: SchematicTierId;
  readonly structure: TrackStructureKind;
  /** Default dwell duration at this station (seconds), overrideable by simulation config */
  readonly defaultDwellSec: number;
}

/**
 * 1.4 Direction & Running Interval (方向与运行区间)
 */
export type RunDirection =
  | 'outbound'
  | 'inbound'
  | 'clockwise'
  | 'counterclockwise';

export type RouteOperationMode =
  | 'loop' // Closed ring (e.g. Yamanote loop or circular track) — wraps continuously
  | 'shuttle' // Out-and-back (reverses direction onto return route at terminal)
  | 'one_way'; // Terminates after reaching final station and completing turnaround phase

/**
 * Discrete track block section for simplified block occupancy control (区段占用控制块)
 */
export interface TrackBlockSection {
  readonly blockId: string;
  /** Physical track key shared by trains running on the same physical track */
  readonly physicalTrackKey: string;
  readonly trackSegmentId: SkId<'segment'>;
  readonly fromStationId: SkId<'station'>;
  readonly toStationId: SkId<'station'>;
  readonly startArcLengthM: number;
  readonly endArcLengthM: number;
  readonly lengthM: number;
}

/**
 * Track connection validation report (轨道连接限制校验结果)
 */
export interface RouteConnectivityReport {
  readonly valid: boolean;
  readonly disconnectIndex: number | null;
  readonly fromStationId: SkId<'station'> | null;
  readonly toStationId: SkId<'station'> | null;
  readonly spatialGapM: number;
  readonly reason: string | null;
}

/**
 * 1.5 Runnable Track Route (可运行路径)
 * A verified, topologically continuous chain of PhysicalTrackPathSegments with
 * precomputed arc-length spline samples, platform stops, and block occupancy sections.
 */
export interface RunnableTrackRoute {
  readonly routeId: string;
  readonly lineId: SkId<'line'>;
  readonly operatorId: SkId<'operator'>;
  readonly nameJa: string;
  readonly nameEn: string;
  readonly color: string;
  readonly direction: RunDirection;
  readonly mode: RouteOperationMode;
  readonly isLoop: boolean;
  /** Optional paired reverse route ID used during TERMINAL_TURNAROUND in 'shuttle' mode */
  readonly reverseRouteId: string | null;
  readonly segments: readonly PhysicalTrackPathSegment[];
  readonly stationStops: readonly SimulatedPlatformStop[];
  readonly blocks: readonly TrackBlockSection[];
  readonly totalLengthM: number;
  readonly connectivity: RouteConnectivityReport;
  readonly simulationLabel: SimulationLabel;
  readonly dataNature: DataNature;
}

/**
 * 1.6 Rolling Stock Model Specification (车辆型号参数)
 * Decoupled from 3D mesh assets (which are provided by the Rolling Stock Session via `rollingStockId`).
 */
export interface RollingStockSpec {
  readonly rollingStockId: string;
  readonly operatorId: SkId<'operator'>;
  readonly compatibleLineIds: readonly SkId<'line'>[];
  readonly modelCode: string;
  readonly nameJa: string;
  readonly nameEn: string;
  readonly lineClass: LineClass;
  readonly trackGaugeMm: 1067 | 1435 | 1372;
  /** Individual car body length over couplers (meters) */
  readonly carLengthM: number;
  /** Car body width (meters) */
  readonly carWidthM: number;
  /** Car body height above rail top (meters) */
  readonly carHeightM: number;
  /** Longitudinal distance between front and rear bogie pivot centers within one car (meters) */
  readonly bogieCenterDistanceM: number;
  /** Gangway spacing between adjacent cars in a consist (meters) */
  readonly interCarGapM: number;
  /** Realistic operating speed ceiling in urban/suburban simulation (m/s) */
  readonly maxOperatingSpeedMps: number;
  /** Design maximum speed (km/h) */
  readonly designMaxSpeedKph: number;
  /** Normal service acceleration (m/s^2) */
  readonly serviceAccelerationMps2: number;
  /** Normal service deceleration (m/s^2) */
  readonly serviceDecelerationMps2: number;
  /** Maximum / emergency deceleration (m/s^2) */
  readonly emergencyDecelerationMps2: number;
  /** Allowed car counts per consist (e.g., [4, 6, 8, 10, 11]) */
  readonly allowedCarCounts: readonly number[];
  readonly defaultCarCount: number;
  readonly primaryColorHex: string;
  readonly accentColorHex: string;
  readonly simulationLabel: SimulationLabel;
}

/**
 * 1.7 Virtual Train Consist (虚拟列车编组)
 */
export interface VirtualTrainCarDefinition {
  readonly carIndex: number;
  readonly carId: string;
  readonly role: 'cab_lead' | 'motor_mid' | 'trailer_mid' | 'cab_tail';
  readonly lengthM: number;
  readonly bogieCenterDistanceM: number;
  /** Offset of this car's center behind the train's leading nose (meters, positive) */
  readonly centerOffsetFromNoseM: number;
  /** Offset of this car's front bogie behind the train's leading nose (meters, positive) */
  readonly frontBogieOffsetFromNoseM: number;
  /** Offset of this car's rear bogie behind the train's leading nose (meters, positive) */
  readonly rearBogieOffsetFromNoseM: number;
}

export interface VirtualTrainConsist {
  readonly consistId: string;
  readonly rollingStockId: string;
  readonly carCount: number;
  readonly carLengthM: number;
  readonly interCarGapM: number;
  readonly bogieCenterDistanceM: number;
  readonly totalLengthM: number;
  readonly cars: readonly VirtualTrainCarDefinition[];
}

// ============================================================================
// 2. DETERMINISTIC FINITE STATE MACHINE (12 Required States)
// ============================================================================

/**
 * 1.8 & 2. Train Operational State (列车运行状态机 — 12 个必选状态)
 */
export type TrainOperationalState =
  | 'INITIALIZING' // 1. 初始化
  | 'READY_TO_DEPART' // 2. 出发准备
  | 'ACCELERATING' // 3. 加速
  | 'CRUISING' // 4. 巡航
  | 'DECELERATING' // 5. 减速
  | 'APPROACHING_STATION' // 6. 进站
  | 'STOPPING' // 7. 停车
  | 'DOORS_OPENING' // 8. 开门
  | 'DWELLING' // 9. 停站
  | 'DOORS_CLOSING' // 10. 关门
  | 'DEPARTING_STATION' // 11. 出站
  | 'TERMINAL_TURNAROUND'; // 12. 终到或折返

export const ALL_TRAIN_OPERATIONAL_STATES: readonly TrainOperationalState[] = [
  'INITIALIZING',
  'READY_TO_DEPART',
  'ACCELERATING',
  'CRUISING',
  'DECELERATING',
  'APPROACHING_STATION',
  'STOPPING',
  'DOORS_OPENING',
  'DWELLING',
  'DOORS_CLOSING',
  'DEPARTING_STATION',
  'TERMINAL_TURNAROUND',
] as const;

// ============================================================================
// 5. CONFIGURABLE PARAMETERS (可配置参数)
// ============================================================================

export interface TrainKinematicsConfig {
  /** Maximum target cruise speed (m/s). Clamped to rolling stock & line limits */
  readonly maxSpeedMps?: number;
  /** Service acceleration (m/s^2). Clamped to realistic bounds */
  readonly accelerationMps2?: number;
  /** Service deceleration (m/s^2). Clamped to realistic bounds */
  readonly decelerationMps2?: number;
  /** Maximum comfortable lateral acceleration on curves (m/s^2), default 0.85 */
  readonly maxCurveLateralAccelMps2?: number;
  /** Minimum curve speed floor (m/s), default 5.5 m/s (~20 km/h) */
  readonly minCurveSpeedMps?: number;
}

export interface SimulationConfig {
  /** Fixed deterministic physics step in seconds (default 0.05s = 20Hz or 1/60s = 60Hz) */
  readonly fixedStepSec: number;
  /** Simulation time multiplier (0.1 .. 20.0, default 1.0) */
  readonly timeScale: number;
  /** Default dispatch headway interval between trains on the same route (seconds, default 120) */
  readonly headwaySec: number;
  /** Default station dwell duration when doors are open (seconds, default 20) */
  readonly dwellTimeSec: number;
  /** Door opening duration (seconds, default 1.5) */
  readonly doorOpenDurationSec: number;
  /** Door closing duration (seconds, default 1.5) */
  readonly doorCloseDurationSec: number;
  /** Brake settle pause in STOPPING state before opening doors (seconds, default 0.5) */
  readonly stoppingSettleSec: number;
  /** Departure phase duration/distance threshold before full ACCELERATING (seconds, default 1.5) */
  readonly departureClearDurationSec: number;
  /** Turnaround duration at terminal station in TERMINAL_TURNAROUND state (seconds, default 8.0) */
  readonly turnaroundDurationSec: number;
  /** Minimum nose-to-tail safe separation distance between two trains on the same track (meters, default 90) */
  readonly minSafeSeparationM: number;
  /** Maximum number of active displayed trains across the simulation (default 32) */
  readonly maxActiveTrains: number;
}

export interface TrainSpawnRequest {
  readonly trainId: string;
  readonly routeId: string;
  readonly rollingStockId: string;
  readonly carCount?: number;
  /** Initial station stop index on the route (default 0) */
  readonly initialStopIndex?: number;
  /** Optional initial state override ('INITIALIZING' by default) */
  readonly initialState?: 'INITIALIZING' | 'READY_TO_DEPART' | 'DWELLING';
  /** Optional per-train dwell time override (seconds) */
  readonly dwellTimeSec?: number;
  /** Optional per-train departure delay offset (seconds, used for headway staggering) */
  readonly departureDelaySec?: number;
  /** Optional per-train kinematics overrides (validated & clamped against RollingStockSpec) */
  readonly kinematics?: TrainKinematicsConfig;
}

export interface LineFleetDispatchConfig {
  readonly routeId: string;
  readonly rollingStockId: string;
  readonly trainCount: number;
  readonly carCount?: number;
  readonly headwaySec?: number;
  readonly dwellTimeSec?: number;
  readonly kinematics?: TrainKinematicsConfig;
  /**
   * Spawn strategy:
   * - 'staggered_stops': places trains at evenly spaced stations around the route immediately
   * - 'headway_dispatch': spawns trains sequentially from stop 0 separated by `headwaySec`
   */
  readonly spawnStrategy?: 'staggered_stops' | 'headway_dispatch';
}

// ============================================================================
// 6. SCENE SYSTEM OUTPUT INTERFACE (向场景系统输出接口)
// ============================================================================

/**
 * Individual carriage pose in 3D space (编组各节车厢的姿态)
 */
export interface SimulatedCarriagePose {
  readonly carIndex: number;
  readonly carId: string;
  readonly role: 'cab_lead' | 'motor_mid' | 'trailer_mid' | 'cab_tail';
  readonly lengthM: number;
  readonly widthM: number;
  readonly heightM: number;
  /** Car body geometric center position in world meters */
  readonly position: Vector3Like;
  /** Car body 3D orientation (derived from front & rear bogie chord on the 3D spline) */
  readonly orientation: Orientation3D;
  /** Front bogie pivot 3D position on the track spline */
  readonly frontBogiePosition: Vector3Like;
  /** Rear bogie pivot 3D position on the track spline */
  readonly rearBogiePosition: Vector3Like;
  /** Arc-length coordinate of car center along current route (meters) */
  readonly centerArcLengthM: number;
  readonly trackSegmentId: SkId<'segment'>;
  readonly structure: TrackStructureKind;
  readonly tier: SchematicTierId;
}

/**
 * Current simulated station or inter-station running interval (当前模拟车站或区间)
 */
export interface TrainLocationStatus {
  readonly kind: 'at_station' | 'inter_station';
  /** Present when train is stopped/dwelling/departing/approaching at a station platform */
  readonly currentStationId: SkId<'station'> | null;
  readonly currentStationNameJa: string | null;
  readonly currentStationNameEn: string | null;
  readonly currentPlatformId: string | null;
  /** Origin station of the current running interval */
  readonly fromStationId: SkId<'station'>;
  readonly fromStationNameJa: string;
  /** Destination (upcoming) station of the current running interval */
  readonly toStationId: SkId<'station'>;
  readonly toStationNameJa: string;
  /** Active physical track segment under the leading car */
  readonly currentSegmentId: SkId<'segment'>;
  /** Normalized progress [0..1] between `fromStationId` and `toStationId` */
  readonly intervalProgress01: number;
  /** Remaining distance along the track to the next station stop point (meters) */
  readonly distanceToNextStationM: number;
  /** Current 3D schematic elevation tier and structure */
  readonly currentTier: SchematicTierId;
  readonly currentStructure: TrackStructureKind;
}

/**
 * Block occupancy status for a train instance (列车区段占用状态)
 */
export interface TrainOccupancyStatus {
  readonly occupiedBlockIds: readonly string[];
  readonly blockedByTrainId: string | null;
  readonly clearanceAheadM: number | null;
  readonly isHoldingForClearance: boolean;
}

/**
 * Scene output snapshot for a single simulated train (单列车场景输出快照)
 */
export interface SimulatedTrainSnapshot {
  /** 列车唯一 ID */
  readonly trainId: string;
  /** 车型 ID (consumed by Rolling Stock Session to bind 3D vehicle meshes) */
  readonly rollingStockId: string;
  readonly modelCode: string;
  /** 对应线路 ID */
  readonly lineId: SkId<'line'>;
  readonly operatorId: SkId<'operator'>;
  readonly routeId: string;
  readonly lineColor: string;
  /** 运行方向 */
  readonly direction: RunDirection;
  readonly operationMode: RouteOperationMode;
  /** 当前状态 (12-state FSM) */
  readonly state: TrainOperationalState;
  /** State elapsed time in current FSM state (seconds) */
  readonly stateTimerSec: number;
  /** 列车头部基准位置 (world meters) */
  readonly position: Vector3Like;
  /** 列车头部朝向 */
  readonly orientation: Orientation3D;
  /** Current instantaneous speed (m/s and km/h) */
  readonly speedMps: number;
  readonly speedKph: number;
  /** Current longitudinal acceleration (m/s^2, positive = accel, negative = braking) */
  readonly accelerationMps2: number;
  /** Leading nose arc-length position along current route (meters) */
  readonly headArcLengthM: number;
  /** Trailing end arc-length position along current route (meters) */
  readonly tailArcLengthM: number;
  /** Total distance traveled since train initialization (meters) */
  readonly totalDistanceTraveledM: number;
  /** Number of completed terminal turnarounds or loop laps */
  readonly completedLapsOrTurnarounds: number;
  /** Whether the train has finished a one-way non-returning journey */
  readonly isTerminated: boolean;
  /** Doors open ratio [0..1] for visual door animation in Rolling Stock Session */
  readonly doorsOpenRatio: number;
  /** 编组各节车厢的姿态 */
  readonly carriages: readonly SimulatedCarriagePose[];
  /** 当前模拟车站或区间 */
  readonly locationStatus: TrainLocationStatus;
  /** 多列车区段占用状态 */
  readonly occupancyStatus: TrainOccupancyStatus;
  /** Mandatory honesty tag: 'Simulation / 模拟运行' */
  readonly simulationLabel: SimulationLabel;
  readonly dataNature: 'synthetic';
  readonly isRealtimeData: false;
}

/**
 * Complete frame-independent world snapshot emitted to the 3D Scene & UI Systems.
 */
export interface SimulationWorldSnapshot {
  readonly simulationLabel: SimulationLabel;
  readonly disclaimer: string;
  readonly dataNature: 'synthetic';
  readonly isRealtimeData: false;
  /** Total deterministic simulated time elapsed (seconds) */
  readonly simTimeSec: number;
  /** Exact integer number of fixed deterministic physics steps executed */
  readonly tickCount: number;
  /** Fixed physics step size (seconds) */
  readonly fixedStepSec: number;
  /** Current paused state */
  readonly paused: boolean;
  /** Current time multiplier */
  readonly timeScale: number;
  /** Active train snapshots ordered deterministically by trainId */
  readonly trains: readonly SimulatedTrainSnapshot[];
  /** Map of occupied block IDs -> occupying trainId */
  readonly activeBlockOccupancies: Readonly<Record<string, string>>;
}

/**
 * Minimal adapter interface allowing the simulation engine to consume either
 * the full Session 0 `AtlasDataset` + `SolvedRailwayNetwork3D` OR a lightweight
 * `MockRailwayNetworkAdapter` in isolated unit tests.
 */
export interface RailwayNetworkSimulationSource {
  readonly sourceKind: 'session0_atlas' | 'mock_adapter';
  getLines(): readonly SimulatedOperatingLine[];
  getLineById(lineId: SkId<'line'>): SimulatedOperatingLine | undefined;
  getPhysicalSegment(
    fromStationId: SkId<'station'>,
    toStationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): PhysicalTrackPathSegment | undefined;
  getStationNode(
    stationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): SolvedStationNode3D | undefined;
  hasPhysicalTrackConnection(
    fromStationId: SkId<'station'>,
    toStationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): boolean;
}
