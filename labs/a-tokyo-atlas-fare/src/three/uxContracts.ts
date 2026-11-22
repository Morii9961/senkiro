/**
 * SENKIRO Atlas v2 — Shared UX & Cross-Session Adapter Contracts + Synthetic Train Feed.
 *
 * Designed as the clean boundary between Camera/UX (this branch) and sibling worktrees:
 *  - train_simulation_engine        -> implements `TrainSimulationProvider`
 *  - japanese_rolling_stock_assets  -> plugs into `RollingStockVisualAdapter`
 *  - tokyo_environment_upgrade      -> implements `EnvironmentCollisionProvider`
 *  - underground_railway_geometry_system -> plugs into `TunnelExplorerAdapter`
 *  - Station Atlas (Lab C)          -> plugs into `StationAtlasNavigator`
 *
 * When external providers are not yet attached, `SyntheticTrainSimulationProvider` provides
 * an honest, strictly-labeled synthetic spline simulation over `SolvedRailwayNetwork3D` without
 * rebuilding any rolling-stock, tunnel, or city geometry.
 */

import type {
  CameraModeId,
  CameraModeState,
  TrainFollowAngle,
} from '../domain/cameraModeStateMachine.js';
import {
  classifyTier,
  type SchematicTierId,
  type SolvedPoint3D,
  type SolvedRailwayNetwork3D,
  type SolvedSegment3D,
} from '../domain/elevationSolver.js';
import type { AtlasDataset, DataNature, SkId } from '../domain/types.js';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type TrainSimulationStatus = 'running' | 'paused' | 'dwelling';

export interface TrainSimulationState {
  id: string;
  label: string;
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  color: string;
  /** Verified or explicitly marked synthetic/unattached rolling stock label */
  rollingStockJa: string;
  rollingStockEn: string;
  /** Honest direction string derived from line endpoints */
  directionJa: string;
  directionEn: string;
  status: TrainSimulationStatus;
  /** Must ALWAYS be true for simulated traffic; UI renders prominent badge */
  isSimulated: true;
  dataNature: DataNature;
  position: Vec3;
  /** Smoothed unit forward tangent along 3D track spline */
  tangent: Vec3;
  speedKmh: number;
  tier: SchematicTierId;
  isUnderground: boolean;
  nearestStationId: SkId<'station'> | null;
  nearestStationJa: string | null;
  nearestStationEn: string | null;
  nextStationJa: string | null;
  nextStationEn: string | null;
  progress01: number;
}

export interface TrainSimulationSnapshot {
  playing: boolean;
  speedMultiplier: number;
  visibleCount: number;
  trainsVisible: boolean;
  totalAvailable: number;
  trains: TrainSimulationState[];
}

export interface TrainSimulationProvider {
  readonly providerId: string;
  readonly isSynthetic: boolean;
  step(dtSec: number): void;
  getSnapshot(): TrainSimulationSnapshot;
  getTrainById(id: string): TrainSimulationState | null;
  getTrainsForLine(lineId: SkId<'line'>): TrainSimulationState[];
  setPlaying(playing: boolean): void;
  setSpeedMultiplier(multiplier: number): void;
  setVisibleCount(count: number): void;
  setTrainsVisible(visible: boolean): void;
  reset(): void;
}

export interface EnvironmentCollisionProvider {
  /** Clamps or pushes a camera position outside ground, buildings, and landmarks */
  resolveCameraPosition(
    pos: Vec3,
    clearanceRadiusM: number,
    allowUnderground: boolean,
    minY: number,
  ): Vec3;
  /** Returns nearest landmark/hub spatial description for street/underground orientation */
  describeNearestAnchor(pos: Vec3): {
    nameJa: string;
    nameEn: string;
    distanceM: number;
    bearingDeg: number;
  } | null;
}

export interface StationAtlasEntryContext {
  stationId: SkId<'station'>;
  stationComplexId: SkId<'complex'> | null;
  stationNameJa: string;
  stationNameEn: string | null;
}

export interface StationAtlasNavigator {
  hasDetailedStationAtlas(stationId: SkId<'station'>, complexId: SkId<'complex'> | null): boolean;
  openStationAtlas(ctx: StationAtlasEntryContext): void;
}

export interface CameraModeControllerAPI {
  getState(): CameraModeState;
  setMode(mode: CameraModeId, options?: { trainId?: string | null }): void;
  toggleFreeLook(enabled?: boolean): void;
  setFollowAngle(angle: TrainFollowAngle): void;
  followTrain(trainId: string, angle?: TrainFollowAngle): void;
  exitTrainFollow(): void;
  returnToSurface(): void;
  resetOverview(): void;
  focusStation(stationId: SkId<'station'>): void;
  focusLine(lineId: SkId<'line'>): void;
}

// ============================================================================
// Default Lightweight Synthetic Simulation Provider (over SolvedRailwayNetwork3D)
// ============================================================================

interface StitchedLinePath {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  color: string;
  lineNameJa: string;
  lineNameEn: string;
  points: SolvedPoint3D[];
  totalDist: number;
  stationStops: {
    dist: number;
    stationId: SkId<'station'>;
    nameJa: string;
    nameEn: string;
  }[];
  originNameJa: string;
  originNameEn: string;
  terminusNameJa: string;
  terminusNameEn: string;
}

interface InternalSimTrain {
  id: string;
  slotIndex: number;
  path: StitchedLinePath;
  directionSign: 1 | -1;
  distAlong: number;
  baseSpeedMps: number;
  dwellRemainingSec: number;
  lastDwellStopIdx: number;
}

const DEFAULT_DEMO_LINE_IDS: SkId<'line'>[] = [
  'sk:line:jr-east-yamanote',
  'sk:line:metro-ginza',
  'sk:line:metro-marunouchi',
  'sk:line:jr-east-chuo',
  'sk:line:metro-fukutoshin',
  'sk:line:toei-oedo',
  'sk:line:metro-hanzomon',
  'sk:line:metro-chiyoda',
  'sk:line:jr-east-tohoku-shinkansen',
  'sk:line:jr-central-tokaido-shinkansen',
  'sk:line:toei-shinjuku',
  'sk:line:keio-inokashira',
  'sk:line:tokyu-toyoko',
  'sk:line:keikyu-main',
  'sk:line:metro-tozai',
  'sk:line:jr-east-sobu',
];

function buildStitchedLinePath(
  lineId: SkId<'line'>,
  dataset: AtlasDataset,
  solved: SolvedRailwayNetwork3D,
): StitchedLinePath | null {
  const line = dataset.railLines.find((l) => l.id === lineId);
  if (!line || line.stationIds.length < 2) return null;

  const segsByPair = new Map<string, { seg: SolvedSegment3D; reversed: boolean }>();
  for (const seg of solved.segments) {
    if (!seg.railLineIds.includes(lineId)) continue;
    segsByPair.set(`${seg.fromStationId}::${seg.toStationId}`, { seg, reversed: false });
    segsByPair.set(`${seg.toStationId}::${seg.fromStationId}`, { seg, reversed: true });
  }

  const stMap = new Map(dataset.stations.map((s) => [s.id, s]));
  const points: SolvedPoint3D[] = [];
  const stationStops: StitchedLinePath['stationStops'] = [];
  let accumDist = 0;

  for (let i = 0; i < line.stationIds.length - 1; i++) {
    const a = line.stationIds[i]!;
    const b = line.stationIds[i + 1]!;
    const hit = segsByPair.get(`${a}::${b}`);
    if (!hit) continue;

    const pts = hit.reversed ? [...hit.seg.points].reverse() : hit.seg.points;
    if (i === 0) {
      const sa = stMap.get(a);
      stationStops.push({
        dist: 0,
        stationId: a,
        nameJa: sa?.names.ja ?? a,
        nameEn: sa?.names.en ?? sa?.names.ja ?? a,
      });
    }

    for (let k = i === 0 ? 0 : 1; k < pts.length; k++) {
      const pt = pts[k]!;
      if (points.length > 0) {
        const prev = points[points.length - 1]!;
        accumDist += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
      }
      points.push({ ...pt, distFromStart: accumDist });
    }

    const sb = stMap.get(b);
    stationStops.push({
      dist: accumDist,
      stationId: b,
      nameJa: sb?.names.ja ?? b,
      nameEn: sb?.names.en ?? sb?.names.ja ?? b,
    });
  }

  if (points.length < 2 || accumDist < 50) return null;

  const firstStop = stationStops[0]!;
  const lastStop = stationStops[stationStops.length - 1]!;

  return {
    lineId,
    operatorId: line.operatorId,
    color: line.color,
    lineNameJa: line.names.ja ?? line.id,
    lineNameEn: line.names.en ?? line.names.ja ?? line.id,
    points,
    totalDist: accumDist,
    stationStops,
    originNameJa: firstStop.nameJa,
    originNameEn: firstStop.nameEn,
    terminusNameJa: lastStop.nameJa,
    terminusNameEn: lastStop.nameEn,
  };
}

function samplePathPosition(points: SolvedPoint3D[], dist: number): Vec3 {
  if (dist <= 0) {
    const p = points[0]!;
    return { x: p.x, y: p.y, z: p.z };
  }
  const last = points[points.length - 1]!;
  if (dist >= last.distFromStart) {
    return { x: last.x, y: last.y, z: last.z };
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.distFromStart <= dist) lo = mid;
    else hi = mid;
  }
  const p0 = points[lo]!;
  const p1 = points[hi]!;
  const span = Math.max(0.01, p1.distFromStart - p0.distFromStart);
  const f = Math.max(0, Math.min(1, (dist - p0.distFromStart) / span));
  return {
    x: p0.x + (p1.x - p0.x) * f,
    y: p0.y + (p1.y - p0.y) * f,
    z: p0.z + (p1.z - p0.z) * f,
  };
}

/**
 * Samples a curve-smoothed tangent by averaging over a look-behind/look-ahead chord window.
 * Eliminates sharp camera snaps on polygonal track bends during Train Follow!
 */
function sampleSmoothedTangent(
  points: SolvedPoint3D[],
  dist: number,
  totalDist: number,
  dirSign: 1 | -1,
): Vec3 {
  const halfWin = 22;
  const dBack = Math.max(0, Math.min(totalDist, dist - halfWin * dirSign));
  const dAhead = Math.max(0, Math.min(totalDist, dist + halfWin * dirSign));
  const pBack = samplePathPosition(points, dBack);
  const pAhead = samplePathPosition(points, dAhead);
  const dx = pAhead.x - pBack.x;
  const dy = pAhead.y - pBack.y;
  const dz = pAhead.z - pBack.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

export class SyntheticTrainSimulationProvider implements TrainSimulationProvider {
  readonly providerId = 'senkiro-synthetic-spline-sim-v2';
  readonly isSynthetic = true;

  private readonly trains: InternalSimTrain[] = [];
  private playing = true;
  private speedMultiplier = 1.0;
  private visibleCount = 12;
  private trainsVisible = true;

  constructor(dataset: AtlasDataset, solved: SolvedRailwayNetwork3D) {
    const pathCache = new Map<SkId<'line'>, StitchedLinePath>();
    for (const lid of DEFAULT_DEMO_LINE_IDS) {
      const p = buildStitchedLinePath(lid, dataset, solved);
      if (p) pathCache.set(lid, p);
    }

    // Also ensure any remaining lines in dataset can be sampled if needed
    let slot = 0;
    for (const lid of DEFAULT_DEMO_LINE_IDS) {
      const path = pathCache.get(lid);
      if (!path) continue;
      const isShinkansen = lid.includes('shinkansen');
      const baseSpeedMps = isShinkansen ? 42 : 20; // visual simulation cruise pace (m/s)
      const frac = ((slot * 0.23 + 0.14) % 0.72) + 0.12;
      const dirSign: 1 | -1 = slot % 2 === 0 ? 1 : -1;

      this.trains.push({
        id: `sim:train:${lid.replace('sk:line:', '')}-1`,
        slotIndex: slot,
        path,
        directionSign: dirSign,
        distAlong: path.totalDist * frac,
        baseSpeedMps,
        dwellRemainingSec: 0,
        lastDwellStopIdx: -1,
      });
      slot++;
    }

    // Add a couple of opposite-direction flagship trains on Yamanote & Ginza for rich visual encounter
    const extraLines: SkId<'line'>[] = ['sk:line:jr-east-yamanote', 'sk:line:metro-ginza'];
    for (const lid of extraLines) {
      const path = pathCache.get(lid);
      if (!path) continue;
      this.trains.push({
        id: `sim:train:${lid.replace('sk:line:', '')}-2`,
        slotIndex: slot,
        path,
        directionSign: -1,
        distAlong: path.totalDist * 0.62,
        baseSpeedMps: 20,
        dwellRemainingSec: 0,
        lastDwellStopIdx: -1,
      });
      slot++;
    }
  }

  step(dtSec: number): void {
    if (!this.playing || dtSec <= 0) return;
    const clampedDt = Math.min(0.1, dtSec);
    const effDt = clampedDt * this.speedMultiplier;

    for (let i = 0; i < this.trains.length; i++) {
      const tr = this.trains[i]!;
      if (tr.dwellRemainingSec > 0) {
        tr.dwellRemainingSec = Math.max(0, tr.dwellRemainingSec - effDt);
        continue;
      }

      const prevDist = tr.distAlong;
      tr.distAlong += tr.directionSign * tr.baseSpeedMps * effDt;

      // Bounce cleanly at termini with a brief simulated turnaround dwell
      if (tr.distAlong >= tr.path.totalDist) {
        tr.distAlong = tr.path.totalDist;
        tr.directionSign = -1;
        tr.dwellRemainingSec = 1.6;
        tr.lastDwellStopIdx = tr.path.stationStops.length - 1;
      } else if (tr.distAlong <= 0) {
        tr.distAlong = 0;
        tr.directionSign = 1;
        tr.dwellRemainingSec = 1.6;
        tr.lastDwellStopIdx = 0;
      } else {
        // Brief dwell when passing an intermediate station stop
        for (let s = 1; s < tr.path.stationStops.length - 1; s++) {
          if (s === tr.lastDwellStopIdx) continue;
          const sd = tr.path.stationStops[s]!.dist;
          const crossed =
            tr.directionSign > 0
              ? prevDist < sd && tr.distAlong >= sd
              : prevDist > sd && tr.distAlong <= sd;
          if (crossed) {
            tr.distAlong = sd;
            tr.dwellRemainingSec = 1.1;
            tr.lastDwellStopIdx = s;
            break;
          }
        }
      }
    }
  }

  private toPublicState(tr: InternalSimTrain): TrainSimulationState {
    const pos = samplePathPosition(tr.path.points, tr.distAlong);
    const tan = sampleSmoothedTangent(
      tr.path.points,
      tr.distAlong,
      tr.path.totalDist,
      tr.directionSign,
    );
    const tier = classifyTier(pos.y);

    let nearest = tr.path.stationStops[0] ?? null;
    let bestD = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < tr.path.stationStops.length; i++) {
      const st = tr.path.stationStops[i]!;
      const d = Math.abs(st.dist - tr.distAlong);
      if (d < bestD) {
        bestD = d;
        nearest = st;
        nearestIdx = i;
      }
    }

    const nextIdx = Math.max(
      0,
      Math.min(tr.path.stationStops.length - 1, nearestIdx + tr.directionSign),
    );
    const nextStop = tr.path.stationStops[nextIdx] ?? null;

    const status: TrainSimulationStatus = !this.playing
      ? 'paused'
      : tr.dwellRemainingSec > 0
        ? 'dwelling'
        : 'running';

    const dirJa =
      tr.directionSign > 0
        ? `${tr.path.originNameJa} → ${tr.path.terminusNameJa} 方向 (模擬)`
        : `${tr.path.terminusNameJa} → ${tr.path.originNameJa} 方向 (模擬)`;
    const dirEn =
      tr.directionSign > 0
        ? `${tr.path.originNameEn} → ${tr.path.terminusNameEn} (Simulated)`
        : `${tr.path.terminusNameEn} → ${tr.path.originNameEn} (Simulated)`;

    const kmh =
      status === 'running'
        ? Math.round(tr.baseSpeedMps * 3.6 * this.speedMultiplier)
        : 0;

    return {
      id: tr.id,
      label: `${tr.path.lineNameJa.split('（')[0]} · #${tr.slotIndex + 1}`,
      lineId: tr.path.lineId,
      operatorId: tr.path.operatorId,
      color: tr.path.color,
      rollingStockJa: '仮想デモ編成（車種アセット未接続・非実在）',
      rollingStockEn: 'Synthetic Demo Consist (Rolling stock unattached)',
      directionJa: dirJa,
      directionEn: dirEn,
      status,
      isSimulated: true,
      dataNature: 'synthetic',
      position: pos,
      tangent: tan,
      speedKmh: kmh,
      tier,
      isUnderground: pos.y < -2.2,
      nearestStationId: nearest?.stationId ?? null,
      nearestStationJa: nearest?.nameJa ?? null,
      nearestStationEn: nearest?.nameEn ?? null,
      nextStationJa: nextStop?.nameJa ?? null,
      nextStationEn: nextStop?.nameEn ?? null,
      progress01: Math.max(0, Math.min(1, tr.distAlong / Math.max(1, tr.path.totalDist))),
    };
  }

  getSnapshot(): TrainSimulationSnapshot {
    const activeSlice = this.trains.slice(0, this.visibleCount);
    return {
      playing: this.playing,
      speedMultiplier: this.speedMultiplier,
      visibleCount: this.visibleCount,
      trainsVisible: this.trainsVisible,
      totalAvailable: this.trains.length,
      trains: activeSlice.map((tr) => this.toPublicState(tr)),
    };
  }

  getTrainById(id: string): TrainSimulationState | null {
    const tr = this.trains.find((t) => t.id === id);
    return tr ? this.toPublicState(tr) : null;
  }

  getTrainsForLine(lineId: SkId<'line'>): TrainSimulationState[] {
    return this.trains
      .filter((t) => t.path.lineId === lineId)
      .map((t) => this.toPublicState(t));
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.25, Math.min(6, multiplier));
  }

  setVisibleCount(count: number): void {
    this.visibleCount = Math.max(1, Math.min(this.trains.length, count));
  }

  setTrainsVisible(visible: boolean): void {
    this.trainsVisible = visible;
  }

  reset(): void {
    for (let i = 0; i < this.trains.length; i++) {
      const tr = this.trains[i]!;
      const frac = ((tr.slotIndex * 0.23 + 0.14) % 0.72) + 0.12;
      tr.directionSign = tr.slotIndex % 2 === 0 ? 1 : -1;
      tr.distAlong = tr.path.totalDist * frac;
      tr.dwellRemainingSec = 0;
      tr.lastDwellStopIdx = -1;
    }
    this.playing = true;
    this.speedMultiplier = 1.0;
    this.trainsVisible = true;
  }
}
