/**
 * SENKIRO Atlas v2 — Deterministic Train Simulation Engine Core.
 *
 * Orchestrates:
 *  - Fixed-timestep deterministic accumulator (`fixedStepSec`), guaranteeing identical
 *    simulation results across arbitrary rendering frame rates (15 FPS, 30 FPS, 60 FPS, 120 FPS).
 *  - Pause, resume, and dynamic `timeScale` multiplier.
 *  - Single-train & multi-train fleet dispatching (staggered station placement + headway queue).
 *  - Simplified railway block occupancy & safe separation enforcement (`BlockOccupancyController`).
 *  - Frame-independent `SimulationWorldSnapshot` output for Scene and UI consumers,
 *    explicitly tagged with `Simulation / 模拟运行`.
 */

import {
  BlockOccupancyController,
  type ActiveTrainFootprint,
} from './blockOccupancy.js';
import { resolveSimulationConfig } from './rollingStockCatalog.js';
import type { BuiltRouteBundle } from './routeBuilder.js';
import { SimulatedTrainInstance } from './trainStateMachine.js';
import {
  SIMULATION_DISCLAIMER,
  SIMULATION_LABEL,
  type LineFleetDispatchConfig,
  type RunnableTrackRoute,
  type SimulatedTrainSnapshot,
  type SimulationConfig,
  type SimulationWorldSnapshot,
  type TrainSpawnRequest,
} from './types.js';

interface PendingHeadwayDispatch {
  readonly request: TrainSpawnRequest;
  readonly scheduledSimTimeSec: number;
}

export type SimulationSnapshotListener = (snapshot: SimulationWorldSnapshot) => void;

export class TrainSimulationEngine {
  private config: SimulationConfig;
  private readonly routes = new Map<string, BuiltRouteBundle>();
  private readonly trains = new Map<string, SimulatedTrainInstance>();
  private readonly pendingDispatches: PendingHeadwayDispatch[] = [];
  private readonly blockController: BlockOccupancyController;
  private readonly listeners = new Set<SimulationSnapshotListener>();

  private tickCount = 0;
  private simTimeSec = 0;
  private accumulatorSec = 0;
  private paused = false;

  constructor(initialConfig?: Partial<SimulationConfig>) {
    this.config = resolveSimulationConfig(initialConfig);
    this.blockController = new BlockOccupancyController(this.config.minSafeSeparationM);
  }

  // --------------------------------------------------------------------------
  // Configuration, Pause/Resume & Time Scale
  // --------------------------------------------------------------------------

  getConfig(): SimulationConfig {
    return this.config;
  }

  updateConfig(partial: Partial<SimulationConfig>): SimulationConfig {
    this.config = resolveSimulationConfig({ ...this.config, ...partial });
    this.blockController.setMinSafeSeparationM(this.config.minSafeSeparationM);
    // If maxActiveTrains was lowered, trim excess trains deterministically from the end
    if (this.trains.size > this.config.maxActiveTrains) {
      const ids = [...this.trains.keys()];
      for (let i = this.config.maxActiveTrains; i < ids.length; i++) {
        this.trains.delete(ids[i]!);
      }
      this.refreshOccupancies();
    }
    return this.config;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setTimeScale(timeScale: number): void {
    this.config = resolveSimulationConfig({ ...this.config, timeScale });
  }

  getTimeScale(): number {
    return this.config.timeScale;
  }

  getSimTimeSec(): number {
    return this.simTimeSec;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  // --------------------------------------------------------------------------
  // Route Registration & Connectivity Enforcement
  // --------------------------------------------------------------------------

  registerRoute(bundle: BuiltRouteBundle): RunnableTrackRoute {
    this.routes.set(bundle.route.routeId, bundle);
    return bundle.route;
  }

  registerRoutePair(pair: { outbound: BuiltRouteBundle; inbound: BuiltRouteBundle }): void {
    this.registerRoute(pair.outbound);
    this.registerRoute(pair.inbound);
  }

  getRouteBundle(routeId: string): BuiltRouteBundle | undefined {
    return this.routes.get(routeId);
  }

  getRegisteredRoutes(): RunnableTrackRoute[] {
    return [...this.routes.values()].map((b) => b.route);
  }

  // --------------------------------------------------------------------------
  // Train Spawning & Fleet Dispatching
  // --------------------------------------------------------------------------

  /**
   * Spawns a single virtual train instance on a registered `RunnableTrackRoute`.
   *
   * Throws an explicit error if:
   *  - The route is not registered.
   *  - The route fails physical track connectivity validation (`!route.connectivity.valid`).
   *  - The active train count has reached `config.maxActiveTrains`.
   *  - Another train already occupies the requested spawn track block.
   */
  spawnTrain(request: TrainSpawnRequest): SimulatedTrainSnapshot {
    if (this.trains.has(request.trainId)) {
      throw new Error(`Train with ID "${request.trainId}" already exists.`);
    }
    if (this.trains.size >= this.config.maxActiveTrains) {
      throw new Error(
        `Cannot spawn train "${request.trainId}": active train limit (${this.config.maxActiveTrains}) reached.`,
      );
    }

    const bundle = this.routes.get(request.routeId);
    if (!bundle) {
      throw new Error(`Cannot spawn train "${request.trainId}": route "${request.routeId}" is not registered.`);
    }
    if (!bundle.route.connectivity.valid) {
      throw new Error(
        `Unconnected track prohibited for route "${request.routeId}": ${bundle.route.connectivity.reason}`,
      );
    }

    const candidate = new SimulatedTrainInstance(request, bundle);
    this.refreshOccupancies();

    const footprints = this.buildActiveFootprints();
    const check = this.blockController.canAcquireSpan(
      candidate.trainId,
      bundle.route,
      candidate.getTailArcLengthM(),
      candidate.getHeadArcLengthM(),
      footprints,
    );
    if (!check.allowed) {
      throw new Error(
        `Cannot spawn train "${request.trainId}" at stop index ${request.initialStopIndex ?? 0} on route "${request.routeId}": track block already occupied by "${check.conflictingTrainId}".`,
      );
    }

    this.trains.set(candidate.trainId, candidate);
    this.refreshOccupancies();
    return candidate.toSnapshot();
  }

  /**
   * Dispatches a multi-train fleet onto `fleetConfig.routeId`.
   *
   * Supports two strategies:
   *  - `'staggered_stops'` (default): Immediately places trains at well-separated station stops
   *    along the route while respecting block occupancy and `maxActiveTrains`.
   *  - `'headway_dispatch'`: Spawns the first train immediately at stop 0 and queues subsequent
   *    trains to dispatch from stop 0 at intervals of `headwaySec` as soon as stop 0 clears.
   */
  dispatchLineFleet(fleetConfig: LineFleetDispatchConfig): SimulatedTrainSnapshot[] {
    const bundle = this.routes.get(fleetConfig.routeId);
    if (!bundle) {
      throw new Error(`Route "${fleetConfig.routeId}" is not registered.`);
    }
    if (!bundle.route.connectivity.valid) {
      throw new Error(
        `Unconnected track prohibited for route "${fleetConfig.routeId}": ${bundle.route.connectivity.reason}`,
      );
    }

    const availableSlots = Math.max(0, this.config.maxActiveTrains - this.trains.size);
    const desiredCount = Math.max(0, Math.min(availableSlots, Math.round(fleetConfig.trainCount)));
    if (desiredCount === 0) return [];

    const strategy = fleetConfig.spawnStrategy ?? 'staggered_stops';
    const headwaySec = fleetConfig.headwaySec ?? this.config.headwaySec;
    const spawnedSnapshots: SimulatedTrainSnapshot[] = [];
    const routeSlug = fleetConfig.routeId.replace(/^sim:route:/, '').replace(/:/g, '-');

    if (strategy === 'headway_dispatch') {
      for (let i = 0; i < desiredCount; i++) {
        const trainId = `sim:train:${routeSlug}-${String(i + 1).padStart(2, '0')}`;
        const req: TrainSpawnRequest = {
          trainId,
          routeId: fleetConfig.routeId,
          rollingStockId: fleetConfig.rollingStockId,
          carCount: fleetConfig.carCount,
          initialStopIndex: 0,
          dwellTimeSec: fleetConfig.dwellTimeSec,
          kinematics: fleetConfig.kinematics,
        };
        if (i === 0) {
          spawnedSnapshots.push(this.spawnTrain(req));
        } else {
          this.pendingDispatches.push({
            request: req,
            scheduledSimTimeSec: this.simTimeSec + i * headwaySec,
          });
        }
      }
      return spawnedSnapshots;
    }

    // Strategy: 'staggered_stops' — spread trains across non-terminal stops along the route
    const stopCount = bundle.route.stationStops.length;
    const eligibleStops = bundle.route.isLoop ? stopCount : Math.max(1, stopCount - 1);
    const step = Math.max(1, Math.floor(eligibleStops / desiredCount));

    let placed = 0;
    for (let stopIdx = 0; stopIdx < eligibleStops && placed < desiredCount; stopIdx += step) {
      const trainId = `sim:train:${routeSlug}-${String(placed + 1).padStart(2, '0')}`;
      try {
        const snap = this.spawnTrain({
          trainId,
          routeId: fleetConfig.routeId,
          rollingStockId: fleetConfig.rollingStockId,
          carCount: fleetConfig.carCount,
          initialStopIndex: stopIdx,
          dwellTimeSec: fleetConfig.dwellTimeSec,
          departureDelaySec: (placed % 2) * 1.5,
          kinematics: fleetConfig.kinematics,
        });
        spawnedSnapshots.push(snap);
        placed++;
      } catch {
        // Skip stop if its block is too close to the previously placed train
      }
    }

    return spawnedSnapshots;
  }

  removeTrain(trainId: string): boolean {
    const existed = this.trains.delete(trainId);
    if (existed) {
      this.refreshOccupancies();
    }
    return existed;
  }

  clearAllTrains(): void {
    this.trains.clear();
    this.pendingDispatches.length = 0;
    this.refreshOccupancies();
  }

  resetSimulation(): void {
    this.clearAllTrains();
    this.tickCount = 0;
    this.simTimeSec = 0;
    this.accumulatorSec = 0;
    this.paused = false;
  }

  // --------------------------------------------------------------------------
  // Fixed-Timestep Deterministic Execution
  // --------------------------------------------------------------------------

  /**
   * Advances the simulation from a real-time frame delta `wallDeltaSec` (seconds).
   *
   * Accumulates `wallDeltaSec * timeScale` and steps physics in exact increments of
   * `config.fixedStepSec`, ensuring frame-rate independence.
   */
  update(wallDeltaSec: number): SimulationWorldSnapshot {
    if (!this.paused && wallDeltaSec > 0 && Number.isFinite(wallDeltaSec)) {
      const scaledDelta = wallDeltaSec * this.config.timeScale;
      this.accumulatorSec += scaledDelta;

      const dt = this.config.fixedStepSec;
      // Small epsilon (1e-9) prevents IEEE-754 summation drift (e.g. 60 * (1/60) = 0.9999999999999999)
      const maxStepsPerCall = 10_000;
      let stepsExecuted = 0;

      while (this.accumulatorSec + 1e-9 >= dt && stepsExecuted < maxStepsPerCall) {
        this.accumulatorSec = Math.max(0, this.accumulatorSec - dt);
        this.executeSingleFixedTick(dt);
        stepsExecuted++;
      }
    }

    const snapshot = this.getWorldSnapshot();
    if (this.listeners.size > 0) {
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }
    return snapshot;
  }

  /**
   * Steps an exact integer number of deterministic fixed timesteps `numTicks`.
   */
  stepTicks(numTicks: number): SimulationWorldSnapshot {
    const count = Math.max(0, Math.round(numTicks));
    const dt = this.config.fixedStepSec;
    for (let i = 0; i < count; i++) {
      this.executeSingleFixedTick(dt);
    }
    const snapshot = this.getWorldSnapshot();
    if (this.listeners.size > 0) {
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }
    return snapshot;
  }

  private executeSingleFixedTick(dt: number): void {
    this.tickCount += 1;
    this.simTimeSec = Math.round(this.tickCount * dt * 1_000_000) / 1_000_000;

    // 1. Process any due headway-queued dispatches if origin block is clear
    this.processPendingDispatches();

    // 2. Rebuild current block occupancies across all active trains
    this.refreshOccupancies();

    // 3. Step each train deterministically in stable ID order
    const orderedTrains = [...this.trains.values()].sort((a, b) =>
      a.trainId.localeCompare(b.trainId),
    );

    for (const train of orderedTrains) {
      const allFootprints = this.buildActiveFootprints();
      const myFootprint: ActiveTrainFootprint = {
        trainId: train.trainId,
        route: train.getRoute(),
        headArcLengthM: train.getHeadArcLengthM(),
        tailArcLengthM: train.getTailArcLengthM(),
        consistLengthM: train.getConsistLengthM(),
        isTerminated: train.getIsTerminated(),
      };
      const clearance = this.blockController.computeAheadClearance(
        myFootprint,
        allFootprints,
      );

      train.stepFixedTick(dt, this.config, clearance, (tId, revRouteId, consistLenM) => {
        const revBundle = this.routes.get(revRouteId) ?? null;
        if (!revBundle || !revBundle.route.connectivity.valid) {
          return {
            allowed: false,
            reverseBundle: null,
            conflictingTrainId: null,
          };
        }
        const stop0S = revBundle.route.stationStops[0]?.stopArcLengthM ?? 0;
        const canEnter = this.blockController.canAcquireSpan(
          tId,
          revBundle.route,
          stop0S - consistLenM,
          stop0S,
          this.buildActiveFootprints(),
        );
        return {
          allowed: canEnter.allowed,
          reverseBundle: revBundle,
          conflictingTrainId: canEnter.conflictingTrainId,
        };
      });

      // Immediately update occupancy table after each train moves so following trains see updated positions
      this.blockController.rebuildOccupancies(this.buildActiveFootprints());
    }

    // 4. Finalize clearance & occupiedBlockIds on every train after the tick completes
    this.refreshOccupancies();
  }

  private processPendingDispatches(): void {
    if (this.pendingDispatches.length === 0) return;

    for (let i = 0; i < this.pendingDispatches.length; ) {
      if (this.trains.size >= this.config.maxActiveTrains) break;
      const item = this.pendingDispatches[i]!;
      if (this.simTimeSec + 1e-6 < item.scheduledSimTimeSec) {
        i++;
        continue;
      }

      const bundle = this.routes.get(item.request.routeId);
      if (!bundle || !bundle.route.connectivity.valid) {
        this.pendingDispatches.splice(i, 1);
        continue;
      }

      try {
        this.spawnTrain(item.request);
        this.pendingDispatches.splice(i, 1);
      } catch {
        // Origin station block is still occupied by previous train; retry on next tick!
        i++;
      }
    }
  }

  private buildActiveFootprints(): ActiveTrainFootprint[] {
    const out: ActiveTrainFootprint[] = [];
    for (const t of this.trains.values()) {
      out.push({
        trainId: t.trainId,
        route: t.getRoute(),
        headArcLengthM: t.getHeadArcLengthM(),
        tailArcLengthM: t.getTailArcLengthM(),
        consistLengthM: t.getConsistLengthM(),
        isTerminated: t.getIsTerminated(),
      });
    }
    return out;
  }

  private refreshOccupancies(): void {
    const footprints = this.buildActiveFootprints();
    this.blockController.rebuildOccupancies(footprints);
    for (const t of this.trains.values()) {
      const fp: ActiveTrainFootprint = {
        trainId: t.trainId,
        route: t.getRoute(),
        headArcLengthM: t.getHeadArcLengthM(),
        tailArcLengthM: t.getTailArcLengthM(),
        consistLengthM: t.getConsistLengthM(),
        isTerminated: t.getIsTerminated(),
      };
      t.setLastClearance(this.blockController.computeAheadClearance(fp, footprints));
    }
  }

  // --------------------------------------------------------------------------
  // Scene & UI Snapshot Output
  // --------------------------------------------------------------------------

  subscribe(listener: SimulationSnapshotListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getTrainInstance(trainId: string): SimulatedTrainInstance | undefined {
    return this.trains.get(trainId);
  }

  getTrainSnapshot(trainId: string): SimulatedTrainSnapshot | undefined {
    return this.trains.get(trainId)?.toSnapshot();
  }

  /**
   * Produces a pure TypeScript `SimulationWorldSnapshot` for consumption by the 3D Scene
   * and UI layers without coupling simulation state to Three.js per-frame rendering code.
   */
  getWorldSnapshot(): SimulationWorldSnapshot {
    const orderedTrains = [...this.trains.values()]
      .sort((a, b) => a.trainId.localeCompare(b.trainId))
      .map((t) => t.toSnapshot());

    return {
      simulationLabel: SIMULATION_LABEL,
      disclaimer: SIMULATION_DISCLAIMER,
      dataNature: 'synthetic',
      isRealtimeData: false,
      simTimeSec: this.simTimeSec,
      tickCount: this.tickCount,
      fixedStepSec: this.config.fixedStepSec,
      paused: this.paused,
      timeScale: this.config.timeScale,
      trains: orderedTrains,
      activeBlockOccupancies: this.blockController.getActiveBlockOccupancyRecord(),
    };
  }
}
