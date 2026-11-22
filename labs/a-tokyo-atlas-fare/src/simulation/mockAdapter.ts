/**
 * SENKIRO Atlas v2 — Independent Mock Railway Network Adapter & Tokyo Atlas Preset Builders.
 *
 * Provides:
 *  1. `MockRailwayNetworkAdapter`: Standalone deterministic adapter implementing
 *     `RailwayNetworkSimulationSource` for isolated unit tests of single-interval 12-state cycles,
 *     90-degree curve bogie kinematics, shuttle turnaround, closed-loop operation, and
 *     unconnected-track rejection.
 *  2. `createTokyoAtlasSimulationEngine`: Pre-configured multi-line simulation builder consuming
 *     Session 0's real `AtlasDataset` + `SolvedRailwayNetwork3D` (Yamanote, Ginza, Marunouchi,
 *     Chuo, Oedo).
 */

import {
  classifyStructure,
  classifyTier,
  type SolvedPoint3D,
  type SolvedRailwayNetwork3D,
  type SolvedStationNode3D,
} from '../domain/elevationSolver.js';
import type { AtlasDataset, OsmVerticalDataset, SkId } from '../domain/types.js';
import { getDefaultRollingStockForLine } from './rollingStockCatalog.js';
import {
  applyLateralTrackOffset3D,
  buildShuttleRoutePair,
  DOUBLE_TRACK_HALF_SEPARATION_M,
  Session0AtlasNetworkAdapter,
} from './routeBuilder.js';
import { TrainSimulationEngine } from './simulationEngine.js';
import type {
  PhysicalTrackPathSegment,
  RailwayNetworkSimulationSource,
  SimulatedOperatingLine,
  SimulationConfig,
} from './types.js';

export interface MockSegmentDefinition {
  readonly trackSegmentId: SkId<'segment'>;
  readonly lineId: SkId<'line'>;
  readonly operatorId: SkId<'operator'>;
  readonly fromStationId: SkId<'station'>;
  readonly toStationId: SkId<'station'>;
  readonly isDoubleTrack?: boolean;
  readonly isShinkansen?: boolean;
  readonly waypoints: readonly { x: number; y: number; z: number }[];
}

export interface MockStationDefinition {
  readonly stationId: SkId<'station'>;
  readonly lineId: SkId<'line'>;
  readonly operatorId: SkId<'operator'>;
  readonly nameJa: string;
  readonly nameEn: string;
  readonly stationCode: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Standalone Mock Adapter implementing `RailwayNetworkSimulationSource` for deterministic unit tests.
 */
export class MockRailwayNetworkAdapter implements RailwayNetworkSimulationSource {
  readonly sourceKind = 'mock_adapter' as const;

  private readonly lines: SimulatedOperatingLine[];
  private readonly lineById = new Map<SkId<'line'>, SimulatedOperatingLine>();
  private readonly stationNodes = new Map<string, SolvedStationNode3D>();
  private readonly segmentsByPair = new Map<
    string,
    { def: MockSegmentDefinition; reversed: boolean }[]
  >();
  private readonly applyDoubleTrackOffset: boolean;

  constructor(params: {
    lines: readonly SimulatedOperatingLine[];
    stations: readonly MockStationDefinition[];
    segments: readonly MockSegmentDefinition[];
    applyDoubleTrackOffset?: boolean;
  }) {
    this.lines = [...params.lines];
    this.applyDoubleTrackOffset = params.applyDoubleTrackOffset ?? false;

    for (const l of this.lines) {
      this.lineById.set(l.lineId, l);
    }

    for (const st of params.stations) {
      const node: SolvedStationNode3D = {
        stationId: st.stationId,
        lineId: st.lineId,
        operatorId: st.operatorId,
        stationComplexId: null,
        nameJa: st.nameJa,
        nameEn: st.nameEn,
        stationCode: st.stationCode,
        x: st.x,
        y: st.y,
        z: st.z,
        dirX: 1,
        dirZ: 0,
        tier: classifyTier(st.y),
        structure: classifyStructure(st.y, st.lineId),
        heightBasis: 'manual-verified-relative',
        color: this.lineById.get(st.lineId)?.color ?? '#f59e0b',
        isMajorHub: false,
      };
      this.stationNodes.set(`${st.lineId}::${st.stationId}`, node);
      this.stationNodes.set(st.stationId, node);
    }

    for (const seg of params.segments) {
      const fwdKey = `${seg.fromStationId}::${seg.toStationId}`;
      const revKey = `${seg.toStationId}::${seg.fromStationId}`;
      if (!this.segmentsByPair.has(fwdKey)) this.segmentsByPair.set(fwdKey, []);
      if (!this.segmentsByPair.has(revKey)) this.segmentsByPair.set(revKey, []);
      this.segmentsByPair.get(fwdKey)!.push({ def: seg, reversed: false });
      this.segmentsByPair.get(revKey)!.push({ def: seg, reversed: true });
    }
  }

  getLines(): readonly SimulatedOperatingLine[] {
    return this.lines;
  }

  getLineById(lineId: SkId<'line'>): SimulatedOperatingLine | undefined {
    return this.lineById.get(lineId);
  }

  getStationNode(
    stationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): SolvedStationNode3D | undefined {
    if (lineId) {
      const exact = this.stationNodes.get(`${lineId}::${stationId}`);
      if (exact) return exact;
    }
    return this.stationNodes.get(stationId);
  }

  hasPhysicalTrackConnection(
    fromStationId: SkId<'station'>,
    toStationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): boolean {
    return this.getPhysicalSegment(fromStationId, toStationId, lineId) !== undefined;
  }

  getPhysicalSegment(
    fromStationId: SkId<'station'>,
    toStationId: SkId<'station'>,
    lineId?: SkId<'line'>,
  ): PhysicalTrackPathSegment | undefined {
    const candidates = this.segmentsByPair.get(`${fromStationId}::${toStationId}`);
    if (!candidates || candidates.length === 0) return undefined;

    const match =
      (lineId ? candidates.find((c) => c.def.lineId === lineId) : undefined) ??
      candidates[0]!;
    if (lineId && match.def.lineId !== lineId) return undefined;

    const rawWaypoints = match.reversed
      ? [...match.def.waypoints].reverse()
      : [...match.def.waypoints];

    // Subdivide waypoints into SolvedPoint3D chain
    const solvedPts: SolvedPoint3D[] = [];
    let accumDist = 0;

    for (let i = 0; i < rawWaypoints.length; i++) {
      const w = rawWaypoints[i]!;
      if (i === 0) {
        solvedPts.push({
          x: w.x,
          y: w.y,
          z: w.z,
          t: 0,
          distFromStart: 0,
          structure: classifyStructure(w.y, match.def.lineId),
          tier: classifyTier(w.y),
        });
      } else {
        const prev = rawWaypoints[i - 1]!;
        const segLen = Math.hypot(w.x - prev.x, w.y - prev.y, w.z - prev.z);
        const steps = Math.max(4, Math.ceil(segLen / 25));
        for (let s = 1; s <= steps; s++) {
          const frac = s / steps;
          const x = prev.x + (w.x - prev.x) * frac;
          const y = prev.y + (w.y - prev.y) * frac;
          const z = prev.z + (w.z - prev.z) * frac;
          accumDist += segLen / steps;
          solvedPts.push({
            x,
            y,
            z,
            t: 0,
            distFromStart: accumDist,
            structure: classifyStructure(y, match.def.lineId),
            tier: classifyTier(y),
          });
        }
      }
    }

    const safeTotal = accumDist || 1;
    const normalizedPts = solvedPts.map((p) => ({
      ...p,
      t: p.distFromStart / safeTotal,
    }));

    const isDouble = match.def.isDoubleTrack ?? true;
    const lateralOffsetM =
      this.applyDoubleTrackOffset && isDouble ? -DOUBLE_TRACK_HALF_SEPARATION_M : 0;
    const directedPts = applyLateralTrackOffset3D(normalizedPts, lateralOffsetM);
    const lengthM =
      directedPts.length > 0 ? directedPts[directedPts.length - 1]!.distFromStart : 0;
    const midPt = directedPts[Math.floor(directedPts.length / 2)]!;

    return {
      trackSegmentId: match.def.trackSegmentId,
      fromStationId,
      toStationId,
      operatorId: match.def.operatorId,
      railLineIds: [match.def.lineId],
      isDoubleTrack: isDouble,
      isShinkansen: match.def.isShinkansen ?? false,
      lineClass: match.def.isShinkansen ? 'shinkansen' : 'trunk',
      directionalLateralOffsetM: lateralOffsetM,
      points3D: directedPts,
      lengthM,
      dominantTier: midPt?.tier ?? 'L0',
      dominantStructure: midPt?.structure ?? 'surface',
    };
  }
}

/**
 * Creates a deterministic 1-interval (2-station, 900m) mock network for testing the complete
 * single-train, single-interval 12-state cycle and cross-framerate invariance.
 */
export function createSingleIntervalMockNetwork(): MockRailwayNetworkAdapter {
  const lineId: SkId<'line'> = 'sk:line:mock-single';
  const operatorId: SkId<'operator'> = 'sk:operator:jr-east';
  const stA: SkId<'station'> = 'sk:station:mock-alpha';
  const stB: SkId<'station'> = 'sk:station:mock-beta';

  return new MockRailwayNetworkAdapter({
    lines: [
      {
        lineId,
        operatorId,
        nameJa: '模擬単区間テスト線（アルファ〜ベータ）',
        nameEn: 'Mock Single-Interval Test Line (Alpha - Beta)',
        color: '#9ACD32',
        lineClass: 'trunk',
        stationIds: [stA, stB],
      },
    ],
    stations: [
      {
        stationId: stA,
        lineId,
        operatorId,
        nameJa: 'アルファ駅',
        nameEn: 'Alpha Station',
        stationCode: 'M01',
        x: 0,
        y: 0,
        z: 0,
      },
      {
        stationId: stB,
        lineId,
        operatorId,
        nameJa: 'ベータ駅',
        nameEn: 'Beta Station',
        stationCode: 'M02',
        x: 900,
        y: 0,
        z: 0,
      },
    ],
    segments: [
      {
        trackSegmentId: 'sk:segment:mock-alpha-beta',
        lineId,
        operatorId,
        fromStationId: stA,
        toStationId: stB,
        isDoubleTrack: true,
        waypoints: [
          { x: 0, y: 0, z: 0 },
          { x: 450, y: 0, z: 0 },
          { x: 900, y: 0, z: 0 },
        ],
      },
    ],
  });
}

/**
 * Creates a 3-station mock corridor with a 90-degree curve and grade transition (surface L0 -> viaduct L+1)
 * for testing multi-car curve kinematics, inter-car spacing, shuttle turnaround, and multi-train occupancy.
 */
export function createCurvedCorridorMockNetwork(): MockRailwayNetworkAdapter {
  const lineId: SkId<'line'> = 'sk:line:mock-curved';
  const operatorId: SkId<'operator'> = 'sk:operator:tokyo-metro';
  const st1: SkId<'station'> = 'sk:station:mock-west';
  const st2: SkId<'station'> = 'sk:station:mock-junction';
  const st3: SkId<'station'> = 'sk:station:mock-north';

  // Quarter-circle arc of radius R = 260m tangent to +X at (950, 0) turning smoothly to -Z (North)
  const R = 260;
  const cx = 950;
  const cz = -R;
  const curveWaypoints: { x: number; y: number; z: number }[] = [
    { x: 800, y: 0, z: 0 },
    { x: 950, y: 2, z: 0 },
  ];
  const arcSteps = 12;
  for (let i = 1; i <= arcSteps; i++) {
    const theta = (Math.PI / 2) * (i / arcSteps); // 0 to 90 deg
    const x = cx + R * Math.sin(theta);
    const z = cz + R * Math.cos(theta);
    const y = 2 + (8 * i) / arcSteps;
    curveWaypoints.push({ x, y, z });
  }
  curveWaypoints.push({ x: cx + R, y: 10, z: -R - 250 });

  const endPt = curveWaypoints[curveWaypoints.length - 1]!;

  return new MockRailwayNetworkAdapter({
    lines: [
      {
        lineId,
        operatorId,
        nameJa: '模擬曲線・高架遷移線',
        nameEn: 'Mock Curved & Viaduct Grade Line',
        color: '#FF9500',
        lineClass: 'metro',
        stationIds: [st1, st2, st3],
      },
    ],
    stations: [
      {
        stationId: st1,
        lineId,
        operatorId,
        nameJa: '西ターミナル',
        nameEn: 'West Terminal',
        stationCode: 'C01',
        x: 0,
        y: 0,
        z: 0,
      },
      {
        stationId: st2,
        lineId,
        operatorId,
        nameJa: '中央ジャンクション',
        nameEn: 'Central Junction',
        stationCode: 'C02',
        x: 800,
        y: 0,
        z: 0,
      },
      {
        stationId: st3,
        lineId,
        operatorId,
        nameJa: '北高架ターミナル',
        nameEn: 'North Viaduct Terminal',
        stationCode: 'C03',
        x: endPt.x,
        y: endPt.y,
        z: endPt.z,
      },
    ],
    segments: [
      {
        trackSegmentId: 'sk:segment:mock-west-junction',
        lineId,
        operatorId,
        fromStationId: st1,
        toStationId: st2,
        isDoubleTrack: true,
        waypoints: [
          { x: 0, y: 0, z: 0 },
          { x: 400, y: 0, z: 0 },
          { x: 800, y: 0, z: 0 },
        ],
      },
      {
        trackSegmentId: 'sk:segment:mock-junction-north',
        lineId,
        operatorId,
        fromStationId: st2,
        toStationId: st3,
        isDoubleTrack: true,
        waypoints: curveWaypoints,
      },
    ],
  });
}

/**
 * Creates a 4-station closed circular loop mock network (radius = 350m, circumference ~ 2200m)
 * for testing closed-loop (`mode: 'loop'`) wrap-around and multi-train ring occupancy.
 */
export function createClosedLoopMockNetwork(): MockRailwayNetworkAdapter {
  const lineId: SkId<'line'> = 'sk:line:mock-loop';
  const operatorId: SkId<'operator'> = 'sk:operator:jr-east';
  const stN: SkId<'station'> = 'sk:station:mock-loop-north';
  const stE: SkId<'station'> = 'sk:station:mock-loop-east';
  const stS: SkId<'station'> = 'sk:station:mock-loop-south';
  const stW: SkId<'station'> = 'sk:station:mock-loop-west';

  const R = 350;
  const makeQuarterArc = (startAngle: number, endAngle: number) => {
    const pts: { x: number; y: number; z: number }[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / steps;
      pts.push({
        x: Math.round(R * Math.sin(a) * 100) / 100,
        y: 4,
        z: Math.round(-R * Math.cos(a) * 100) / 100,
      });
    }
    return pts;
  };

  return new MockRailwayNetworkAdapter({
    lines: [
      {
        lineId,
        operatorId,
        nameJa: '模擬環状線',
        nameEn: 'Mock Circular Loop Line',
        color: '#9ACD32',
        lineClass: 'trunk',
        stationIds: [stN, stE, stS, stW],
      },
    ],
    stations: [
      {
        stationId: stN,
        lineId,
        operatorId,
        nameJa: '北駅',
        nameEn: 'North Loop Station',
        stationCode: 'L01',
        x: 0,
        y: 4,
        z: -R,
      },
      {
        stationId: stE,
        lineId,
        operatorId,
        nameJa: '東駅',
        nameEn: 'East Loop Station',
        stationCode: 'L02',
        x: R,
        y: 4,
        z: 0,
      },
      {
        stationId: stS,
        lineId,
        operatorId,
        nameJa: '南駅',
        nameEn: 'South Loop Station',
        stationCode: 'L03',
        x: 0,
        y: 4,
        z: R,
      },
      {
        stationId: stW,
        lineId,
        operatorId,
        nameJa: '西駅',
        nameEn: 'West Loop Station',
        stationCode: 'L04',
        x: -R,
        y: 4,
        z: 0,
      },
    ],
    segments: [
      {
        trackSegmentId: 'sk:segment:mock-loop-ne',
        lineId,
        operatorId,
        fromStationId: stN,
        toStationId: stE,
        isDoubleTrack: true,
        waypoints: makeQuarterArc(0, Math.PI / 2),
      },
      {
        trackSegmentId: 'sk:segment:mock-loop-es',
        lineId,
        operatorId,
        fromStationId: stE,
        toStationId: stS,
        isDoubleTrack: true,
        waypoints: makeQuarterArc(Math.PI / 2, Math.PI),
      },
      {
        trackSegmentId: 'sk:segment:mock-loop-sw',
        lineId,
        operatorId,
        fromStationId: stS,
        toStationId: stW,
        isDoubleTrack: true,
        waypoints: makeQuarterArc(Math.PI, (3 * Math.PI) / 2),
      },
      {
        trackSegmentId: 'sk:segment:mock-loop-wn',
        lineId,
        operatorId,
        fromStationId: stW,
        toStationId: stN,
        isDoubleTrack: true,
        waypoints: makeQuarterArc((3 * Math.PI) / 2, 2 * Math.PI),
      },
    ],
  });
}

/**
 * Creates a mock network with a missing physical track link (st2 -/-> st3) AND
 * a spatially broken track link (st3 -> st4 has a 180m spatial discontinuity at st3)
 * to verify strict enforcement of track connection restrictions.
 */
export function createDiscontinuousMockNetwork(): MockRailwayNetworkAdapter {
  const lineId: SkId<'line'> = 'sk:line:mock-broken';
  const operatorId: SkId<'operator'> = 'sk:operator:jr-east';
  const st1: SkId<'station'> = 'sk:station:mock-b1';
  const st2: SkId<'station'> = 'sk:station:mock-b2';
  const st3: SkId<'station'> = 'sk:station:mock-b3';
  const st4: SkId<'station'> = 'sk:station:mock-b4';

  return new MockRailwayNetworkAdapter({
    lines: [
      {
        lineId,
        operatorId,
        nameJa: '模擬未接続・分断テスト線',
        nameEn: 'Mock Discontinuous Track Test Line',
        color: '#ef4444',
        lineClass: 'trunk',
        stationIds: [st1, st2, st3, st4],
      },
    ],
    stations: [
      {
        stationId: st1,
        lineId,
        operatorId,
        nameJa: 'B1駅',
        nameEn: 'B1',
        stationCode: 'B1',
        x: 0,
        y: 0,
        z: 0,
      },
      {
        stationId: st2,
        lineId,
        operatorId,
        nameJa: 'B2駅',
        nameEn: 'B2',
        stationCode: 'B2',
        x: 600,
        y: 0,
        z: 0,
      },
      {
        stationId: st3,
        lineId,
        operatorId,
        nameJa: 'B3駅',
        nameEn: 'B3',
        stationCode: 'B3',
        x: 1200,
        y: 0,
        z: 0,
      },
      {
        stationId: st4,
        lineId,
        operatorId,
        nameJa: 'B4駅',
        nameEn: 'B4',
        stationCode: 'B4',
        x: 2000,
        y: 0,
        z: 0,
      },
    ],
    segments: [
      {
        trackSegmentId: 'sk:segment:mock-b1-b2',
        lineId,
        operatorId,
        fromStationId: st1,
        toStationId: st2,
        isDoubleTrack: true,
        waypoints: [
          { x: 0, y: 0, z: 0 },
          { x: 600, y: 0, z: 0 },
        ],
      },
      // NOTE: No physical segment between st2 and st3!
      // And segment between st1 and st4 has a 250m spatial teleport gap at st2:
      {
        trackSegmentId: 'sk:segment:mock-b2-b4-teleported',
        lineId,
        operatorId,
        fromStationId: st2,
        toStationId: st4,
        isDoubleTrack: true,
        waypoints: [
          { x: 850, y: 0, z: 180 }, // 310m away from st2 (600, 0, 0)!
          { x: 2000, y: 0, z: 0 },
        ],
      },
    ],
  });
}

export interface TokyoSimulationSetupResult {
  readonly engine: TrainSimulationEngine;
  readonly adapter: Session0AtlasNetworkAdapter;
  readonly registeredRouteIds: readonly string[];
}

/**
 * Builds a pre-configured `TrainSimulationEngine` populated with real Tokyo railway lines
 * from Session 0's `AtlasDataset` + `SolvedRailwayNetwork3D`.
 */
export function createTokyoAtlasSimulationEngine(
  dataset: AtlasDataset,
  solvedOrOsm?: SolvedRailwayNetwork3D | OsmVerticalDataset | null,
  options?: {
    config?: Partial<SimulationConfig>;
    lineIds?: readonly SkId<'line'>[];
    trainsPerDirection?: number;
  },
): TokyoSimulationSetupResult {
  const adapter = new Session0AtlasNetworkAdapter(dataset, solvedOrOsm, {
    applyDoubleTrackOffset: true,
  });
  const engine = new TrainSimulationEngine(options?.config);

  const defaultLineIds: readonly SkId<'line'>[] = options?.lineIds ?? [
    'sk:line:jr-east-yamanote',
    'sk:line:metro-ginza',
    'sk:line:metro-marunouchi',
    'sk:line:jr-east-chuo',
    'sk:line:toei-oedo',
  ];

  const trainsPerDir = options?.trainsPerDirection ?? 2;
  const registeredRouteIds: string[] = [];

  for (const lineId of defaultLineIds) {
    const line = adapter.getLineById(lineId);
    if (!line || line.stationIds.length < 2) continue;

    const pair = buildShuttleRoutePair(adapter, {
      lineId,
      defaultDwellSec: engine.getConfig().dwellTimeSec,
    });

    if (pair.outbound.route.connectivity.valid && pair.inbound.route.connectivity.valid) {
      engine.registerRoutePair(pair);
      registeredRouteIds.push(pair.outbound.route.routeId, pair.inbound.route.routeId);

      const rollingStock = getDefaultRollingStockForLine(lineId, line.lineClass);

      if (trainsPerDir > 0) {
        engine.dispatchLineFleet({
          routeId: pair.outbound.route.routeId,
          rollingStockId: rollingStock.rollingStockId,
          trainCount: trainsPerDir,
          spawnStrategy: 'staggered_stops',
        });
        engine.dispatchLineFleet({
          routeId: pair.inbound.route.routeId,
          rollingStockId: rollingStock.rollingStockId,
          trainCount: trainsPerDir,
          spawnStrategy: 'staggered_stops',
        });
      }
    } else if (pair.outbound.route.connectivity.valid) {
      engine.registerRoute(pair.outbound);
      registeredRouteIds.push(pair.outbound.route.routeId);
    }
  }

  return {
    engine,
    adapter,
    registeredRouteIds,
  };
}
