/**
 * SENKIRO Atlas v2 — Rolling Stock Catalog, Consist Builder & Parameter Validation.
 *
 * Provides realistic technical parameters for representative Tokyo rolling stock models
 * (car length, bogie pivot distance, inter-car gap, service accel/decel, max operating speed)
 * and enforces reasonable physical bounds when user/demo parameters are configured.
 *
 * All entries are explicitly tagged `Simulation / 模拟运行`.
 */

import type { LineClass, SkId } from '../types.js';
import {
  SIMULATION_LABEL,
  type RollingStockSpec,
  type SimulationConfig,
  type TrainKinematicsConfig,
  type VirtualTrainCarDefinition,
  type VirtualTrainConsist,
} from './types.js';

export const ROLLING_STOCK_CATALOG: readonly RollingStockSpec[] = [
  {
    rollingStockId: 'sk:rolling-stock:jre-e235-yamanote',
    operatorId: 'sk:operator:jr-east',
    compatibleLineIds: [
      'sk:line:jr-east-yamanote',
      'sk:line:jr-east-tokaido',
      'sk:line:jr-east-tohoku',
      'sk:line:jr-east-tokaido-hinkaku',
    ],
    modelCode: 'E235-0',
    nameJa: 'JR東日本 E235系0番台（山手線）',
    nameEn: 'JR East E235-0 Series (Yamanote Line)',
    lineClass: 'trunk',
    trackGaugeMm: 1067,
    carLengthM: 19.5,
    carWidthM: 2.95,
    carHeightM: 3.62,
    bogieCenterDistanceM: 13.8,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 25.0, // 90 km/h (Yamanote ATO/D-ATC operating max)
    designMaxSpeedKph: 120,
    serviceAccelerationMps2: 0.92, // 3.3 km/h/s
    serviceDecelerationMps2: 1.02, // 3.7 km/h/s
    emergencyDecelerationMps2: 1.39, // 5.0 km/h/s
    allowedCarCounts: [2, 3, 4, 6, 8, 11],
    defaultCarCount: 6, // 6 cars (120m) default for clear urban hub platform visualization; supports full 11
    primaryColorHex: '#9ACD32',
    accentColorHex: '#e2e8f0',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:jre-e233-chuo',
    operatorId: 'sk:operator:jr-east',
    compatibleLineIds: [
      'sk:line:jr-east-chuo',
      'sk:line:jr-east-sobu',
      'sk:line:jr-east-tohoku-saikyo',
      'sk:line:jr-east-akabane',
      'sk:line:jr-east-tohoku',
      'sk:line:jr-east-tohoku-oku',
      'sk:line:jr-east-tokaido',
      'sk:line:jr-east-joban',
      'sk:line:jr-east-hachiko',
    ],
    modelCode: 'E233-0',
    nameJa: 'JR東日本 E233系（中央快速・都市幹線）',
    nameEn: 'JR East E233 Series (Chuo Rapid & Urban Trunk)',
    lineClass: 'trunk',
    trackGaugeMm: 1067,
    carLengthM: 19.5,
    carWidthM: 2.95,
    carHeightM: 3.62,
    bogieCenterDistanceM: 13.8,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 27.78, // 100 km/h
    designMaxSpeedKph: 120,
    serviceAccelerationMps2: 0.83, // 3.0 km/h/s
    serviceDecelerationMps2: 1.0, // 3.6 km/h/s
    emergencyDecelerationMps2: 1.35,
    allowedCarCounts: [2, 3, 4, 6, 8, 10],
    defaultCarCount: 6,
    primaryColorHex: '#F15A22',
    accentColorHex: '#e2e8f0',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: ['sk:line:metro-ginza'],
    modelCode: 'TM-1000',
    nameJa: '東京メトロ 1000系（銀座線）',
    nameEn: 'Tokyo Metro 1000 Series (Ginza Line)',
    lineClass: 'metro',
    trackGaugeMm: 1435,
    carLengthM: 15.5,
    carWidthM: 2.55,
    carHeightM: 3.46,
    bogieCenterDistanceM: 10.5,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 22.22, // 80 km/h
    designMaxSpeedKph: 80,
    serviceAccelerationMps2: 0.92, // 3.3 km/h/s
    serviceDecelerationMps2: 1.11, // 4.0 km/h/s
    emergencyDecelerationMps2: 1.39, // 5.0 km/h/s
    allowedCarCounts: [2, 3, 4, 6],
    defaultCarCount: 6,
    primaryColorHex: '#FF9500',
    accentColorHex: '#7f1d1d',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:metro-2000-marunouchi',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: ['sk:line:metro-marunouchi'],
    modelCode: 'TM-2000',
    nameJa: '東京メトロ 2000系（丸ノ内線）',
    nameEn: 'Tokyo Metro 2000 Series (Marunouchi Line)',
    lineClass: 'metro',
    trackGaugeMm: 1435,
    carLengthM: 17.5,
    carWidthM: 2.78,
    carHeightM: 3.49,
    bogieCenterDistanceM: 12.0,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 20.83, // 75 km/h
    designMaxSpeedKph: 75,
    serviceAccelerationMps2: 0.92, // 3.3 km/h/s
    serviceDecelerationMps2: 1.11, // 4.0 km/h/s
    emergencyDecelerationMps2: 1.39,
    allowedCarCounts: [2, 3, 4, 6],
    defaultCarCount: 6,
    primaryColorHex: '#F62E36',
    accentColorHex: '#ffffff',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:metro-16000-chiyoda',
    operatorId: 'sk:operator:tokyo-metro',
    compatibleLineIds: [
      'sk:line:metro-chiyoda',
      'sk:line:metro-hibiya',
      'sk:line:metro-tozai',
      'sk:line:metro-yurakucho',
      'sk:line:metro-hanzomon',
      'sk:line:metro-namboku',
      'sk:line:metro-fukutoshin',
      'sk:line:toei-asakusa',
      'sk:line:toei-mita',
      'sk:line:toei-shinjuku',
    ],
    modelCode: 'TM-16000',
    nameJa: '東京メトロ 16000/18000系（20m級地下鉄車両）',
    nameEn: 'Tokyo Metro 16000/18000 Series (20m Subway EMU)',
    lineClass: 'metro',
    trackGaugeMm: 1067,
    carLengthM: 19.5,
    carWidthM: 2.8,
    carHeightM: 3.63,
    bogieCenterDistanceM: 13.8,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 25.0, // 90 km/h (underground)
    designMaxSpeedKph: 110,
    serviceAccelerationMps2: 0.92,
    serviceDecelerationMps2: 1.05,
    emergencyDecelerationMps2: 1.39,
    allowedCarCounts: [2, 4, 6, 8, 10],
    defaultCarCount: 6,
    primaryColorHex: '#00BB85',
    accentColorHex: '#e2e8f0',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:toei-12-600-oedo',
    operatorId: 'sk:operator:toei',
    compatibleLineIds: ['sk:line:toei-oedo'],
    modelCode: 'Toei-12-600',
    nameJa: '都営地下鉄 12-600形（大江戸線・リニアメトロ）',
    nameEn: 'Toei 12-600 Series (Oedo Line Linear Motor)',
    lineClass: 'metro',
    trackGaugeMm: 1435,
    carLengthM: 16.0,
    carWidthM: 2.49,
    carHeightM: 3.14,
    bogieCenterDistanceM: 11.0,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 19.44, // 70 km/h
    designMaxSpeedKph: 70,
    serviceAccelerationMps2: 0.83, // 3.0 km/h/s
    serviceDecelerationMps2: 1.11, // 4.0 km/h/s
    emergencyDecelerationMps2: 1.39,
    allowedCarCounts: [2, 4, 6, 8],
    defaultCarCount: 6,
    primaryColorHex: '#B6007A',
    accentColorHex: '#f1f5f9',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:jr-n700s-shinkansen',
    operatorId: 'sk:operator:jr-central',
    compatibleLineIds: [
      'sk:line:jr-central-tokaido-shinkansen',
      'sk:line:jr-east-tohoku-shinkansen',
    ],
    modelCode: 'N700S',
    nameJa: '新幹線 N700S / E5系（都市区間制限）',
    nameEn: 'Shinkansen N700S / E5 (Urban Corridor Profile)',
    lineClass: 'shinkansen',
    trackGaugeMm: 1435,
    carLengthM: 24.5,
    carWidthM: 3.36,
    carHeightM: 3.65,
    bogieCenterDistanceM: 17.5,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 36.11, // 130 km/h (Tokyo-Omiya / Tokyo-Shin-Yokohama urban section)
    designMaxSpeedKph: 285,
    serviceAccelerationMps2: 0.72, // 2.6 km/h/s
    serviceDecelerationMps2: 0.85, // 3.06 km/h/s
    emergencyDecelerationMps2: 1.2,
    allowedCarCounts: [4, 6, 8, 12, 16],
    defaultCarCount: 8,
    primaryColorHex: '#1E3A8A',
    accentColorHex: '#ffffff',
    simulationLabel: SIMULATION_LABEL,
  },
  {
    rollingStockId: 'sk:rolling-stock:private-commuter-20m',
    operatorId: 'sk:operator:tokyu',
    compatibleLineIds: [
      'sk:line:odakyu-odawara',
      'sk:line:keio-keio',
      'sk:line:keio-inokashira',
      'sk:line:seibu-shinjuku',
      'sk:line:seibu-ikebukuro',
      'sk:line:tokyu-toyoko',
      'sk:line:tokyu-denentoshi',
      'sk:line:keikyu-main',
      'sk:line:keikyu-airport',
      'sk:line:tobu-skytree',
      'sk:line:tobu-tojo',
      'sk:line:keisei-main',
      'sk:line:keisei-oshiage',
    ],
    modelCode: 'PRIV-5050',
    nameJa: '私鉄標準20m級通勤車（東急5050/小田急5000等）',
    nameEn: 'Private Railway 20m Commuter EMU',
    lineClass: 'private',
    trackGaugeMm: 1067,
    carLengthM: 19.5,
    carWidthM: 2.8,
    carHeightM: 3.65,
    bogieCenterDistanceM: 13.8,
    interCarGapM: 0.5,
    maxOperatingSpeedMps: 26.39, // 95 km/h
    designMaxSpeedKph: 110,
    serviceAccelerationMps2: 0.92,
    serviceDecelerationMps2: 1.05,
    emergencyDecelerationMps2: 1.39,
    allowedCarCounts: [2, 4, 6, 8, 10],
    defaultCarCount: 6,
    primaryColorHex: '#DC2626',
    accentColorHex: '#e2e8f0',
    simulationLabel: SIMULATION_LABEL,
  },
];

const ROLLING_STOCK_BY_ID = new Map<string, RollingStockSpec>(
  ROLLING_STOCK_CATALOG.map((spec) => [spec.rollingStockId, spec]),
);

/**
 * Looks up a RollingStockSpec by ID, or throws a clear error if unknown.
 */
export function getRollingStockSpec(rollingStockId: string): RollingStockSpec {
  const spec = ROLLING_STOCK_BY_ID.get(rollingStockId);
  if (!spec) {
    throw new Error(`Unknown rollingStockId: ${rollingStockId}`);
  }
  return spec;
}

/**
 * Selects the default compatible RollingStockSpec for a given lineId and lineClass.
 */
export function getDefaultRollingStockForLine(
  lineId: SkId<'line'>,
  lineClass: LineClass = 'trunk',
): RollingStockSpec {
  const exact = ROLLING_STOCK_CATALOG.find((s) => s.compatibleLineIds.includes(lineId));
  if (exact) return exact;
  if (lineClass === 'shinkansen') {
    return getRollingStockSpec('sk:rolling-stock:jr-n700s-shinkansen');
  }
  if (lineClass === 'metro') {
    return getRollingStockSpec('sk:rolling-stock:metro-16000-chiyoda');
  }
  if (lineClass === 'private') {
    return getRollingStockSpec('sk:rolling-stock:private-commuter-20m');
  }
  return getRollingStockSpec('sk:rolling-stock:jre-e233-chuo');
}

/**
 * Builds a VirtualTrainConsist with exact per-car longitudinal and bogie offsets from the leading nose.
 *
 * Enforces reasonable car counts relative to the RollingStockSpec (`1..maxAllowedCars`).
 */
export function buildVirtualTrainConsist(
  rollingStockId: string,
  requestedCarCount?: number,
  consistId?: string,
): VirtualTrainConsist {
  const spec = getRollingStockSpec(rollingStockId);
  const maxAllowed = Math.max(...spec.allowedCarCounts);
  const minAllowed = 1;
  const carCount =
    requestedCarCount !== undefined
      ? Math.max(minAllowed, Math.min(maxAllowed, Math.round(requestedCarCount)))
      : spec.defaultCarCount;

  const carPitchM = spec.carLengthM + spec.interCarGapM;
  const totalLengthM =
    carCount * spec.carLengthM + Math.max(0, carCount - 1) * spec.interCarGapM;
  const halfBogieSpan = spec.bogieCenterDistanceM * 0.5;

  const cars: VirtualTrainCarDefinition[] = [];
  for (let i = 0; i < carCount; i++) {
    const role: VirtualTrainCarDefinition['role'] =
      i === 0
        ? 'cab_lead'
        : i === carCount - 1
          ? 'cab_tail'
          : i % 2 === 1
            ? 'motor_mid'
            : 'trailer_mid';

    const centerOffsetFromNoseM = i * carPitchM + spec.carLengthM * 0.5;
    const frontBogieOffsetFromNoseM = centerOffsetFromNoseM - halfBogieSpan;
    const rearBogieOffsetFromNoseM = centerOffsetFromNoseM + halfBogieSpan;

    cars.push({
      carIndex: i,
      carId: `car-${i + 1}`,
      role,
      lengthM: spec.carLengthM,
      bogieCenterDistanceM: spec.bogieCenterDistanceM,
      centerOffsetFromNoseM,
      frontBogieOffsetFromNoseM,
      rearBogieOffsetFromNoseM,
    });
  }

  return {
    consistId: consistId ?? `${spec.modelCode}-${carCount}cars`,
    rollingStockId: spec.rollingStockId,
    carCount,
    carLengthM: spec.carLengthM,
    interCarGapM: spec.interCarGapM,
    bogieCenterDistanceM: spec.bogieCenterDistanceM,
    totalLengthM,
    cars,
  };
}

export interface ResolvedTrainKinematics {
  readonly maxSpeedMps: number;
  readonly accelerationMps2: number;
  readonly decelerationMps2: number;
  readonly emergencyDecelerationMps2: number;
  readonly maxCurveLateralAccelMps2: number;
  readonly minCurveSpeedMps: number;
}

/**
 * Validates and clamps user/demo kinematic parameters against the physical limits of
 * the selected RollingStockSpec and line class.
 */
export function resolveTrainKinematics(
  spec: RollingStockSpec,
  overrides?: TrainKinematicsConfig,
): ResolvedTrainKinematics {
  const designMaxMps = (spec.designMaxSpeedKph / 3.6) * 1.05;
  const rawMaxSpeed = overrides?.maxSpeedMps ?? spec.maxOperatingSpeedMps;
  const maxSpeedMps = Math.max(4.0, Math.min(designMaxMps, rawMaxSpeed));

  const rawAccel = overrides?.accelerationMps2 ?? spec.serviceAccelerationMps2;
  const accelerationMps2 = Math.max(0.25, Math.min(spec.serviceAccelerationMps2 * 1.6, rawAccel));

  const rawDecel = overrides?.decelerationMps2 ?? spec.serviceDecelerationMps2;
  const decelerationMps2 = Math.max(0.3, Math.min(spec.emergencyDecelerationMps2 * 1.25, rawDecel));

  const emergencyDecelerationMps2 = Math.max(
    decelerationMps2,
    spec.emergencyDecelerationMps2,
  );

  const maxCurveLateralAccelMps2 = Math.max(
    0.35,
    Math.min(1.5, overrides?.maxCurveLateralAccelMps2 ?? 0.85),
  );
  const minCurveSpeedMps = Math.max(
    3.0,
    Math.min(maxSpeedMps, overrides?.minCurveSpeedMps ?? 5.5),
  );

  return {
    maxSpeedMps,
    accelerationMps2,
    decelerationMps2,
    emergencyDecelerationMps2,
    maxCurveLateralAccelMps2,
    minCurveSpeedMps,
  };
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  fixedStepSec: 0.05, // 50ms deterministic tick (20 Hz)
  timeScale: 1.0,
  headwaySec: 120,
  dwellTimeSec: 20,
  doorOpenDurationSec: 1.5,
  doorCloseDurationSec: 1.5,
  stoppingSettleSec: 0.5,
  departureClearDurationSec: 1.2,
  turnaroundDurationSec: 8.0,
  minSafeSeparationM: 80,
  maxActiveTrains: 32,
};

/**
 * Validates and clamps global simulation configuration parameters to keep demo values
 * physically and numerically well-behaved.
 */
export function resolveSimulationConfig(
  partial?: Partial<SimulationConfig>,
): SimulationConfig {
  return {
    fixedStepSec: Math.max(
      0.005,
      Math.min(0.25, partial?.fixedStepSec ?? DEFAULT_SIMULATION_CONFIG.fixedStepSec),
    ),
    timeScale: Math.max(
      0.05,
      Math.min(30.0, partial?.timeScale ?? DEFAULT_SIMULATION_CONFIG.timeScale),
    ),
    headwaySec: Math.max(
      15,
      Math.min(1800, partial?.headwaySec ?? DEFAULT_SIMULATION_CONFIG.headwaySec),
    ),
    dwellTimeSec: Math.max(
      2.0,
      Math.min(300, partial?.dwellTimeSec ?? DEFAULT_SIMULATION_CONFIG.dwellTimeSec),
    ),
    doorOpenDurationSec: Math.max(
      0.3,
      Math.min(10, partial?.doorOpenDurationSec ?? DEFAULT_SIMULATION_CONFIG.doorOpenDurationSec),
    ),
    doorCloseDurationSec: Math.max(
      0.3,
      Math.min(10, partial?.doorCloseDurationSec ?? DEFAULT_SIMULATION_CONFIG.doorCloseDurationSec),
    ),
    stoppingSettleSec: Math.max(
      0.05,
      Math.min(5, partial?.stoppingSettleSec ?? DEFAULT_SIMULATION_CONFIG.stoppingSettleSec),
    ),
    departureClearDurationSec: Math.max(
      0.2,
      Math.min(
        10,
        partial?.departureClearDurationSec ?? DEFAULT_SIMULATION_CONFIG.departureClearDurationSec,
      ),
    ),
    turnaroundDurationSec: Math.max(
      1.0,
      Math.min(
        300,
        partial?.turnaroundDurationSec ?? DEFAULT_SIMULATION_CONFIG.turnaroundDurationSec,
      ),
    ),
    minSafeSeparationM: Math.max(
      15,
      Math.min(600, partial?.minSafeSeparationM ?? DEFAULT_SIMULATION_CONFIG.minSafeSeparationM),
    ),
    maxActiveTrains: Math.max(
      1,
      Math.min(
        120,
        Math.round(partial?.maxActiveTrains ?? DEFAULT_SIMULATION_CONFIG.maxActiveTrains),
      ),
    ),
  };
}
