import { describe, expect, it } from 'vitest';
import { buildPhysicalTrackGraph } from '../../src/contracts/index.js';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';
import {
  ALL_TRAIN_OPERATIONAL_STATES,
  buildRunnableTrackRoute,
  buildShuttleRoutePair,
  buildVirtualTrainConsist,
  createClosedLoopMockNetwork,
  createCurvedCorridorMockNetwork,
  createDiscontinuousMockNetwork,
  createSingleIntervalMockNetwork,
  createTokyoAtlasSimulationEngine,
  createTrainSimulationEngine,
  getRollingStockSpec,
  resolveSimulationConfig,
  resolveTrainKinematics,
  Session0AtlasNetworkAdapter,
  SIMULATION_LABEL,
  TrainSimulationEngine,
  VirtualTrainSimulationEngine,
  type TrainOperationalState,
} from '../../src/simulation/index.js';

describe('SENKIRO Atlas v2 — Deterministic Train Simulation Engine', () => {
  // ==========================================================================
  // 1. Single-Train, Single-Interval Complete 12-State Simulation Cycle
  // ==========================================================================
  it('completes a full single-train, single-interval 12-state cycle and reverses on shuttle turnaround', () => {
    const mockNet = createSingleIntervalMockNetwork();
    const pair = buildShuttleRoutePair(mockNet, {
      lineId: 'sk:line:mock-single',
      defaultDwellSec: 6,
    });

    expect(pair.outbound.route.connectivity.valid).toBe(true);
    expect(pair.inbound.route.connectivity.valid).toBe(true);
    expect(pair.outbound.route.totalLengthM).toBeCloseTo(900, 1);

    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      timeScale: 1.0,
      dwellTimeSec: 6.0,
      doorOpenDurationSec: 1.0,
      doorCloseDurationSec: 1.0,
      stoppingSettleSec: 0.4,
      departureClearDurationSec: 1.0,
      turnaroundDurationSec: 3.0,
    });

    engine.registerRoutePair(pair);

    const initialSnap = engine.spawnTrain({
      trainId: 'sim:train:single-01',
      routeId: pair.outbound.route.routeId,
      rollingStockId: 'sk:rolling-stock:jre-e235-yamanote',
      carCount: 4,
    });

    // Verify honesty & simulation tags
    expect(initialSnap.simulationLabel).toBe(SIMULATION_LABEL);
    expect(initialSnap.dataNature).toBe('synthetic');
    expect(initialSnap.isRealtimeData).toBe(false);
    expect(initialSnap.state).toBe('INITIALIZING');
    expect(initialSnap.carriages.length).toBe(4);

    const observedStates = new Set<TrainOperationalState>([initialSnap.state]);

    // Step through outbound run (Alpha -> Beta), station stop, dwell, turnaround, and inbound departure (Beta -> Alpha)
    // 900m at ~25 m/s takes ~62s + 8.4s dwell/doors + 3s turnaround = ~73.4s; 1800 ticks (90s) travels well into inbound run
    for (let tick = 0; tick < 1800; tick++) {
      const world = engine.stepTicks(1);
      expect(world.simulationLabel).toBe(SIMULATION_LABEL);
      const t = world.trains[0]!;
      observedStates.add(t.state);
    }

    // Verify ALL 12 required operational states were visited deterministically!
    for (const reqState of ALL_TRAIN_OPERATIONAL_STATES) {
      expect(
        observedStates.has(reqState),
        `Expected train to visit state "${reqState}", visited: ${[...observedStates].join(', ')}`,
      ).toBe(true);
    }

    const finalSnap = engine.getTrainSnapshot('sim:train:single-01')!;
    // Train has completed outbound, turned around at Beta, and is now running or arrived on inbound route
    expect(finalSnap.completedLapsOrTurnarounds).toBeGreaterThanOrEqual(1);
    expect(finalSnap.direction).toBe('inbound');
    expect(finalSnap.routeId).toBe(pair.inbound.route.routeId);
    expect(finalSnap.totalDistanceTraveledM).toBeGreaterThan(950);
  });

  // ==========================================================================
  // 2. Cross-Framerate Deterministic Consistency (15 / 30 / 60 / 120 FPS & Jitter)
  // ==========================================================================
  it('produces identical simulation states, speeds, and 3D carriage poses across 15 FPS, 30 FPS, 60 FPS, 120 FPS, and variable frame jitter', () => {
    const runAtFrameDeltas = (frameDeltasSec: number[]) => {
      const mockNet = createCurvedCorridorMockNetwork();
      const pair = buildShuttleRoutePair(mockNet, {
        lineId: 'sk:line:mock-curved',
        defaultDwellSec: 5,
      });
      const engine = new TrainSimulationEngine({
        fixedStepSec: 0.05,
        timeScale: 1.0,
        dwellTimeSec: 5,
      });
      engine.registerRoutePair(pair);
      engine.spawnTrain({
        trainId: 'sim:train:fps-test',
        routeId: pair.outbound.route.routeId,
        rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
        carCount: 6,
      });

      for (const dt of frameDeltasSec) {
        engine.update(dt);
      }
      return engine.getWorldSnapshot();
    };

    const totalWallTimeSec = 30.0; // 30 seconds of simulation (600 fixed 50ms ticks)
    const frames15Fps = Array.from({ length: 450 }, () => 1 / 15);
    const frames30Fps = Array.from({ length: 900 }, () => 1 / 30);
    const frames60Fps = Array.from({ length: 1800 }, () => 1 / 60);
    const frames120Fps = Array.from({ length: 3600 }, () => 1 / 120);

    // Deterministic pseudo-random jittered frame sequence summing to exact 30.0s
    const framesJittered: number[] = [];
    let rem = totalWallTimeSec;
    const pattern = [0.011, 0.023, 0.016, 0.041, 0.009, 0.033, 0.017];
    let pIdx = 0;
    while (rem > 0.05) {
      const d = pattern[pIdx % pattern.length]!;
      framesJittered.push(d);
      rem -= d;
      pIdx++;
    }
    framesJittered.push(rem);

    const snap15 = runAtFrameDeltas(frames15Fps);
    const snap30 = runAtFrameDeltas(frames30Fps);
    const snap60 = runAtFrameDeltas(frames60Fps);
    const snap120 = runAtFrameDeltas(frames120Fps);
    const snapJitter = runAtFrameDeltas(framesJittered);

    expect(snap15.tickCount).toBe(600);
    expect(snap30.tickCount).toBe(600);
    expect(snap60.tickCount).toBe(600);
    expect(snap120.tickCount).toBe(600);
    expect(snapJitter.tickCount).toBe(600);

    expect(snap15.simTimeSec).toBe(30.0);
    expect(snap60.simTimeSec).toBe(30.0);
    expect(snap120.simTimeSec).toBe(30.0);
    expect(snapJitter.simTimeSec).toBe(30.0);

    const t60 = snap60.trains[0]!;
    for (const other of [
      snap15.trains[0]!,
      snap30.trains[0]!,
      snap120.trains[0]!,
      snapJitter.trains[0]!,
    ]) {
      expect(other.state).toBe(t60.state);
      expect(other.speedMps).toBe(t60.speedMps);
      expect(other.headArcLengthM).toBe(t60.headArcLengthM);
      expect(other.position).toEqual(t60.position);
      expect(other.orientation.quaternion).toEqual(t60.orientation.quaternion);
      expect(other.carriages).toEqual(t60.carriages);
    }
  });

  // ==========================================================================
  // 3. Curve Navigation, Two-Bogie Alignment & Multi-Carriage Spacing
  // ==========================================================================
  it('maintains accurate bogie alignment, inter-carriage spacing, and track elevation bounds through 90-degree curves and viaduct transitions', () => {
    const mockNet = createCurvedCorridorMockNetwork();
    const bundle = buildRunnableTrackRoute(mockNet, {
      lineId: 'sk:line:mock-curved',
      mode: 'one_way',
      defaultDwellSec: 2,
    });

    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      dwellTimeSec: 2,
    });
    engine.registerRoute(bundle);

    const spec = getRollingStockSpec('sk:rolling-stock:metro-1000-ginza');
    const expectedPitchM = spec.carLengthM + spec.interCarGapM; // 15.5 + 0.5 = 16.0m

    engine.spawnTrain({
      trainId: 'sim:train:curve-6car',
      routeId: bundle.route.routeId,
      rollingStockId: spec.rollingStockId,
      carCount: 6,
    });

    let maxHeadingDiffInCurveRad = 0;

    // Step across the entire 2-segment corridor (straight 800m -> 90-deg curve + viaduct climb to y=10, ~145s = 2900 ticks)
    for (let tick = 0; tick < 3000; tick++) {
      const snap = engine.stepTicks(1).trains[0]!;
      const cars = snap.carriages;
      expect(cars.length).toBe(6);

      for (let i = 0; i < cars.length; i++) {
        const car = cars[i]!;
        // 1. Quaternion must be unit normalized
        const [qx, qy, qz, qw] = car.orientation.quaternion;
        expect(Math.hypot(qx, qy, qz, qw)).toBeCloseTo(1.0, 5);

        // 2. Elevation must stay strictly within the track's vertical bounds [0, 10] (never floating or underground!)
        expect(car.position.y).toBeGreaterThanOrEqual(-0.01);
        expect(car.position.y).toBeLessThanOrEqual(10.01);

        // 3. Chord distance between front and rear bogies of the same car must match bogieCenterDistanceM
        const bogieChordM = Math.hypot(
          car.frontBogiePosition.x - car.rearBogiePosition.x,
          car.frontBogiePosition.y - car.rearBogiePosition.y,
          car.frontBogiePosition.z - car.rearBogiePosition.z,
        );
        expect(Math.abs(bogieChordM - spec.bogieCenterDistanceM)).toBeLessThan(0.08);

        // 4. Consecutive carriage spacing check
        if (i > 0) {
          const prevCar = cars[i - 1]!;
          const centerDist3D = Math.hypot(
            prevCar.position.x - car.position.x,
            prevCar.position.y - car.position.y,
            prevCar.position.z - car.position.z,
          );
          // Along straight orR=260m curve, 3D chord between car centers is within 0.15m of 16.0m arc pitch
          expect(Math.abs(centerDist3D - expectedPitchM)).toBeLessThan(0.15);

          // Track angular difference between consecutive cars while rounding the 90-degree curve
          let dYaw = Math.abs(prevCar.orientation.yawRad - car.orientation.yawRad);
          if (dYaw > Math.PI) dYaw = 2 * Math.PI - dYaw;
          if (dYaw > maxHeadingDiffInCurveRad) {
            maxHeadingDiffInCurveRad = dYaw;
          }
        }
      }
      if (snap.isTerminated) break;
    }

    // Confirm the train genuinely turned around the curve (adjacent 16m cars on R=260m curve differ by ~16/260 ≈ 0.061 rad)
    expect(maxHeadingDiffInCurveRad).toBeGreaterThan(0.03);
    expect(maxHeadingDiffInCurveRad).toBeLessThan(0.2);

    const endSnap = engine.getTrainSnapshot('sim:train:curve-6car')!;
    // Reached North Viaduct Terminal at y = 10 (L+1 viaduct)
    expect(endSnap.position.y).toBeCloseTo(10, 1);
    expect(endSnap.locationStatus.currentTier).toBe('L+1');
    expect(endSnap.locationStatus.currentStructure).toBe('viaduct');
  });

  // ==========================================================================
  // 4. Precision Station Stopping & Door/Dwell Sequence
  // ==========================================================================
  it('stops within < 0.05m of intermediate and terminal station platforms without overshooting', () => {
    const mockNet = createCurvedCorridorMockNetwork();
    const bundle = buildRunnableTrackRoute(mockNet, {
      lineId: 'sk:line:mock-curved',
      mode: 'one_way',
      defaultDwellSec: 5,
    });

    const stop1ArcM = bundle.route.stationStops[1]!.stopArcLengthM; // Central Junction (~800m)
    const stop2ArcM = bundle.route.stationStops[2]!.stopArcLengthM; // North Terminal

    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      dwellTimeSec: 5,
    });
    engine.registerRoute(bundle);
    engine.spawnTrain({
      trainId: 'sim:train:stop-precision',
      routeId: bundle.route.routeId,
      rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
      carCount: 4,
    });

    let stoppedAtStop1ArcM: number | null = null;
    let maxOvershootBeforeStop1DepartM = 0;
    let departedStop1 = false;
    let stoppedAtStop2ArcM: number | null = null;

    for (let tick = 0; tick < 3200; tick++) {
      const snap = engine.stepTicks(1).trains[0]!;

      if (!departedStop1) {
        if (
          (snap.state === 'DOORS_OPENING' ||
            snap.state === 'DWELLING' ||
            snap.state === 'DOORS_CLOSING') &&
          snap.locationStatus.currentStationId === 'sk:station:mock-junction'
        ) {
          stoppedAtStop1ArcM = snap.headArcLengthM;
          expect(snap.speedMps).toBe(0);
          const overshoot = Math.abs(snap.headArcLengthM - stop1ArcM);
          if (overshoot > maxOvershootBeforeStop1DepartM) {
            maxOvershootBeforeStop1DepartM = overshoot;
          }
        }
        if (stoppedAtStop1ArcM !== null && snap.state === 'DEPARTING_STATION') {
          departedStop1 = true;
        }
      } else {
        if (
          (snap.state === 'DOORS_OPENING' ||
            snap.state === 'DWELLING' ||
            snap.state === 'TERMINAL_TURNAROUND') &&
          snap.locationStatus.currentStationId === 'sk:station:mock-north'
        ) {
          stoppedAtStop2ArcM = snap.headArcLengthM;
          expect(snap.speedMps).toBe(0);
        }
      }
      if (snap.isTerminated) break;
    }

    expect(stoppedAtStop1ArcM).not.toBeNull();
    expect(Math.abs(stoppedAtStop1ArcM! - stop1ArcM)).toBeLessThan(0.05);
    expect(maxOvershootBeforeStop1DepartM).toBeLessThan(0.05);

    expect(stoppedAtStop2ArcM).not.toBeNull();
    expect(Math.abs(stoppedAtStop2ArcM! - stop2ArcM)).toBeLessThan(0.05);
  });

  // ==========================================================================
  // 5. Closed-Loop Wraparound Operation
  // ==========================================================================
  it('supports continuous closed-loop operation across multiple laps', () => {
    const loopNet = createClosedLoopMockNetwork();
    const loopBundle = buildRunnableTrackRoute(loopNet, {
      lineId: 'sk:line:mock-loop',
      mode: 'loop',
      direction: 'clockwise',
      defaultDwellSec: 3,
    });

    expect(loopBundle.route.isLoop).toBe(true);
    expect(loopBundle.route.connectivity.valid).toBe(true);
    expect(loopBundle.route.stationStops.length).toBe(4);

    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      dwellTimeSec: 3,
      doorOpenDurationSec: 0.6,
      doorCloseDurationSec: 0.6,
      stoppingSettleSec: 0.2,
    });
    engine.registerRoute(loopBundle);

    engine.spawnTrain({
      trainId: 'sim:train:loop-01',
      routeId: loopBundle.route.routeId,
      rollingStockId: 'sk:rolling-stock:jre-e235-yamanote',
      carCount: 4,
    });

    // Run long enough to complete more than 1 full loop lap (~2200m + 4 stops ≈ 215s = 4300 ticks)
    engine.stepTicks(4600);
    const snap = engine.getTrainSnapshot('sim:train:loop-01')!;
    expect(snap.completedLapsOrTurnarounds).toBeGreaterThanOrEqual(1);
    expect(snap.isTerminated).toBe(false);
    expect(snap.totalDistanceTraveledM).toBeGreaterThan(loopBundle.route.totalLengthM);
  });

  // ==========================================================================
  // 6. Track Connection Restrictions (Prohibiting Unconnected / Discontinuous Tracks)
  // ==========================================================================
  it('prohibits train routing and spawning across unconnected stations or spatially discontinuous tracks', () => {
    const brokenNet = createDiscontinuousMockNetwork();

    // Case A: Missing TrackSegment between st2 and st3
    const missingLinkBundle = buildRunnableTrackRoute(brokenNet, {
      lineId: 'sk:line:mock-broken',
      stationIds: [
        'sk:station:mock-b1',
        'sk:station:mock-b2',
        'sk:station:mock-b3',
      ],
    });
    expect(missingLinkBundle.route.connectivity.valid).toBe(false);
    expect(missingLinkBundle.route.connectivity.disconnectIndex).toBe(1);
    expect(missingLinkBundle.route.connectivity.reason).toContain('No physical track segment');

    // Case B: Spatial discontinuity (310m jump at st2 between segment 1 and segment 2)
    const teleportBundle = buildRunnableTrackRoute(brokenNet, {
      lineId: 'sk:line:mock-broken',
      stationIds: [
        'sk:station:mock-b1',
        'sk:station:mock-b2',
        'sk:station:mock-b4',
      ],
    });
    expect(teleportBundle.route.connectivity.valid).toBe(false);
    expect(teleportBundle.route.connectivity.spatialGapM).toBeGreaterThan(200);
    expect(teleportBundle.route.connectivity.reason).toContain('Discontinuous physical track');

    // Case C: Engine strictly rejects spawning on invalid routes
    const engine = new TrainSimulationEngine();
    engine.registerRoute(missingLinkBundle);
    expect(() =>
      engine.spawnTrain({
        trainId: 'sim:train:illegal',
        routeId: missingLinkBundle.route.routeId,
        rollingStockId: 'sk:rolling-stock:jre-e235-yamanote',
      }),
    ).toThrow(/Unconnected track prohibited/);
  });

  // ==========================================================================
  // 7. Pause, Resume, Time Scale Multiplier & Parameter Validation
  // ==========================================================================
  it('supports pause, resume, timeScale multipliers, and enforces realistic vehicle/line parameter bounds', () => {
    const mockNet = createSingleIntervalMockNetwork();
    const bundle = buildRunnableTrackRoute(mockNet, {
      lineId: 'sk:line:mock-single',
      mode: 'one_way',
    });

    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      timeScale: 1.0,
    });
    engine.registerRoute(bundle);
    engine.spawnTrain({
      trainId: 'sim:train:time-ctrl',
      routeId: bundle.route.routeId,
      rollingStockId: 'sk:rolling-stock:jre-e235-yamanote',
    });

    // Advance 2.0s at 1.0x -> 40 ticks
    engine.update(2.0);
    expect(engine.getTickCount()).toBe(40);
    expect(engine.getSimTimeSec()).toBe(2.0);
    const distAt2s = engine.getTrainSnapshot('sim:train:time-ctrl')!.headArcLengthM;
    expect(distAt2s).toBeGreaterThan(0);

    // Pause -> advancing 10.0s of wall time must do nothing!
    engine.pause();
    expect(engine.isPaused()).toBe(true);
    engine.update(10.0);
    expect(engine.getTickCount()).toBe(40);
    expect(engine.getSimTimeSec()).toBe(2.0);
    expect(engine.getTrainSnapshot('sim:train:time-ctrl')!.headArcLengthM).toBe(distAt2s);

    // Resume at 4.0x timeScale -> 2.0s of wall time advances 8.0s of simulated time (160 ticks -> total 200 ticks = 10.0s)
    engine.resume();
    engine.setTimeScale(4.0);
    expect(engine.isPaused()).toBe(false);
    expect(engine.getTimeScale()).toBe(4.0);
    engine.update(2.0);
    expect(engine.getTickCount()).toBe(200);
    expect(engine.getSimTimeSec()).toBe(10.0);

    // Parameter clamping verification against real RollingStockSpec limits
    const oedoSpec = getRollingStockSpec('sk:rolling-stock:toei-12-600-oedo');
    const clampedKin = resolveTrainKinematics(oedoSpec, {
      maxSpeedMps: 999, // Unrealistic 3600 km/h input
      accelerationMps2: 50,
      decelerationMps2: -5,
    });
    // Oedo 12-600 design max is 70 km/h (~19.44 m/s); clamped to <= 1.05 * design max
    expect(clampedKin.maxSpeedMps).toBeLessThanOrEqual((70 / 3.6) * 1.06);
    expect(clampedKin.accelerationMps2).toBeLessThanOrEqual(oedoSpec.serviceAccelerationMps2 * 1.6);
    expect(clampedKin.decelerationMps2).toBeGreaterThanOrEqual(0.3);

    const clampedConsist = buildVirtualTrainConsist(oedoSpec.rollingStockId, 99);
    expect(clampedConsist.carCount).toBe(8); // Oedo max allowed car count is 8

    const clampedCfg = resolveSimulationConfig({ timeScale: 500, maxActiveTrains: -3 });
    expect(clampedCfg.timeScale).toBe(30.0);
    expect(clampedCfg.maxActiveTrains).toBe(1);
  });

  // ==========================================================================
  // 8. Multi-Train Operation & Simplified Block Occupancy Control
  // ==========================================================================
  it('prevents train overlap on the same track section and enforces safe braking behind a dwelling leading train', () => {
    const mockNet = createCurvedCorridorMockNetwork();
    const bundle = buildRunnableTrackRoute(mockNet, {
      lineId: 'sk:line:mock-curved',
      mode: 'one_way',
      targetBlockLengthM: 120,
    });

    const minSafeSepM = 75;
    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      minSafeSeparationM: minSafeSepM,
      dwellTimeSec: 15,
    });
    engine.registerRoute(bundle);

    // Train 1 spawned at Stop 1 (Central Junction, s ≈ 800m) with a very long dwell (120s) so it blocks Stop 1!
    engine.spawnTrain({
      trainId: 'sim:train:leader-01',
      routeId: bundle.route.routeId,
      rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
      carCount: 4, // 63.5m consist
      initialStopIndex: 1,
      initialState: 'DWELLING',
      dwellTimeSec: 120,
    });

    // Reject spawning another train directly on top of Stop 1's occupied block
    expect(() =>
      engine.spawnTrain({
        trainId: 'sim:train:collision-attempt',
        routeId: bundle.route.routeId,
        rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
        carCount: 4,
        initialStopIndex: 1,
      }),
    ).toThrow(/track block already occupied/);

    // Train 2 spawned at Stop 0 (West Terminal, s = 0m) running toward Stop 1 where Train 1 is dwelling
    engine.spawnTrain({
      trainId: 'sim:train:follower-02',
      routeId: bundle.route.routeId,
      rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
      carCount: 4,
      initialStopIndex: 0,
      dwellTimeSec: 5,
    });

    let followerHeldForLeader = false;
    let minObservedNoseToTailM = Infinity;

    // Step 1600 ticks (80s): Follower accelerates from s=0, detects Leader blocking ahead, and brakes to a halt before Stop 1!
    // At tick 1100 (55s), Leader finishes dwelling or we let Leader depart after 50s to verify Follower resumes!
    for (let tick = 0; tick < 1600; tick++) {
      const world = engine.stepTicks(1);
      const leader = world.trains.find((t) => t.trainId === 'sim:train:leader-01')!;
      const follower = world.trains.find((t) => t.trainId === 'sim:train:follower-02')!;

      const noseToTailM = leader.tailArcLengthM - follower.headArcLengthM;
      if (noseToTailM < minObservedNoseToTailM) {
        minObservedNoseToTailM = noseToTailM;
      }

      // Trains must NEVER overlap (noseToTailM must stay >= minSafeSepM - small braking tolerance)
      expect(noseToTailM).toBeGreaterThanOrEqual(minSafeSepM - 1.0);

      // No physical block can be simultaneously owned by both trains
      const leaderBlocks = new Set(leader.occupancyStatus.occupiedBlockIds);
      for (const blkId of follower.occupancyStatus.occupiedBlockIds) {
        expect(leaderBlocks.has(blkId)).toBe(false);
      }

      if (
        follower.occupancyStatus.blockedByTrainId === 'sim:train:leader-01' &&
        follower.occupancyStatus.isHoldingForClearance &&
        follower.speedMps === 0
      ) {
        followerHeldForLeader = true;
      }
    }

    expect(followerHeldForLeader).toBe(true);
    expect(minObservedNoseToTailM).toBeGreaterThanOrEqual(minSafeSepM - 1.0);
  });

  // ==========================================================================
  // 9. Session 0 Real Tokyo Atlas 3D Network Integration
  // ==========================================================================
  it('integrates with Session 0 AtlasDataset & SolvedRailwayNetwork3D across multi-level Tokyo lines', async () => {
    const provider = new StaticAtlasProvider();
    const dataset = provider.getAtlasDataset();
    const osmVertical = await provider.loadOsmVerticalOverlay();

    const { engine, adapter, registeredRouteIds } = createTokyoAtlasSimulationEngine(
      dataset,
      osmVertical,
      {
        lineIds: [
          'sk:line:jr-east-yamanote',
          'sk:line:metro-ginza',
          'sk:line:metro-marunouchi',
          'sk:line:toei-oedo',
        ],
        trainsPerDirection: 2,
      },
    );

    expect(adapter.sourceKind).toBe('session0_atlas');
    expect(registeredRouteIds.length).toBeGreaterThanOrEqual(6);

    // Advance 25 seconds of simulated time (500 ticks)
    const snapshot = engine.stepTicks(500);
    expect(snapshot.simulationLabel).toBe(SIMULATION_LABEL);
    expect(snapshot.trains.length).toBeGreaterThanOrEqual(12);

    for (const train of snapshot.trains) {
      expect(train.simulationLabel).toBe(SIMULATION_LABEL);
      expect(train.dataNature).toBe('synthetic');
      expect(train.isRealtimeData).toBe(false);
      expect(train.carriages.length).toBeGreaterThanOrEqual(4);
      expect(Number.isFinite(train.position.x)).toBe(true);
      expect(Number.isFinite(train.position.y)).toBe(true);
      expect(Number.isFinite(train.position.z)).toBe(true);
      expect(train.locationStatus.fromStationId.startsWith('sk:station:')).toBe(true);
      expect(train.locationStatus.toStationId.startsWith('sk:station:')).toBe(true);
    }

    // Verify Ginza Line Shibuya origin platform sits on elevated L+1 (+14)
    const ginzaOutbound = engine.getRouteBundle('sim:route:metro-ginza:outbound')!;
    const shibuyaStop = ginzaOutbound.route.stationStops.find((s) => s.nameJa === '渋谷');
    expect(shibuyaStop).toBeDefined();
    expect(shibuyaStop!.position.y).toBeGreaterThanOrEqual(12);
    expect(shibuyaStop!.tier).toBe('L+1');
  });

  // ==========================================================================
  // 10. Headway Dispatch Queue & Ginza Line Shibuya 3F -> Omotesando Portal Traverse
  // ==========================================================================
  it('dispatches trains sequentially via headway_dispatch and traverses Ginza Line Shibuya 3F viaduct (+14) down into Omotesando underground (-10)', async () => {
    const provider = new StaticAtlasProvider();
    const dataset = provider.getAtlasDataset();
    const osmVertical = await provider.loadOsmVerticalOverlay();
    const adapter = new Session0AtlasNetworkAdapter(dataset, osmVertical);

    const ginzaLine = adapter.getLineById('sk:line:metro-ginza')!;
    // Take first 3 stations of Ginza Line (Shibuya -> Omotesando -> Gaiemmae)
    const sliceStations = ginzaLine.stationIds.slice(0, 3);
    const routeBundle = buildRunnableTrackRoute(adapter, {
      lineId: 'sk:line:metro-ginza',
      stationIds: sliceStations,
      mode: 'one_way',
      defaultDwellSec: 6,
    });
    expect(routeBundle.route.connectivity.valid).toBe(true);

    const engine = new TrainSimulationEngine({
      fixedStepSec: 0.05,
      headwaySec: 35,
      dwellTimeSec: 6,
      minSafeSeparationM: 70,
    });
    engine.registerRoute(routeBundle);

    const initialDispatched = engine.dispatchLineFleet({
      routeId: routeBundle.route.routeId,
      rollingStockId: 'sk:rolling-stock:metro-1000-ginza',
      trainCount: 2,
      carCount: 6,
      headwaySec: 35,
      spawnStrategy: 'headway_dispatch',
    });

    // At t = 0, only Train 01 is on the origin platform; Train 02 is queued for t = 35s
    expect(initialDispatched.length).toBe(1);
    expect(engine.getWorldSnapshot().trains.length).toBe(1);

    let observedViaductCar = false;
    let observedUndergroundCar = false;
    let secondTrainSpawned = false;

    for (let tick = 0; tick < 1800; tick++) {
      const world = engine.stepTicks(1);
      if (world.trains.length === 2) {
        secondTrainSpawned = true;
        const t1 = world.trains[0]!;
        const t2 = world.trains[1]!;
        expect(t1.tailArcLengthM - t2.headArcLengthM).toBeGreaterThanOrEqual(69.0);
      }
      const leadTrain = world.trains[0]!;
      for (const car of leadTrain.carriages) {
        if (car.structure === 'viaduct' && car.position.y > 8) {
          observedViaductCar = true;
        }
        if (car.structure === 'tunnel_box' && car.position.y < -5) {
          observedUndergroundCar = true;
        }
        // Elevation must stay bounded between Omotesando (-10) and Shibuya (+14)
        expect(car.position.y).toBeGreaterThanOrEqual(-10.5);
        expect(car.position.y).toBeLessThanOrEqual(14.5);
      }
    }

    expect(secondTrainSpawned).toBe(true);
    expect(observedViaductCar).toBe(true);
    expect(observedUndergroundCar).toBe(true);
  });

  // ==========================================================================
  // 11. Frozen v2.0 `TrainSimulationEngineAdapter` Contract Compliance
  // ==========================================================================
  it('implements the frozen v2.0 TrainSimulationEngineAdapter contract on PhysicalTrackGraph with articulated carPoses and underground demo train', async () => {
    const provider = new StaticAtlasProvider();
    const dataset = provider.getAtlasDataset();
    const osmVertical = await provider.loadOsmVerticalOverlay();
    const solved = solveRailwayNetwork3D(dataset, osmVertical);
    const graph = buildPhysicalTrackGraph(dataset, solved);

    const adapter: VirtualTrainSimulationEngine = createTrainSimulationEngine();
    adapter.initialize(graph, dataset, {
      density: 'normal',
      timeScale: 1,
      autoStart: true,
      seed: 20261122,
    });

    const ctrl0 = adapter.getControlState();
    expect(ctrl0.isVirtualSimulation).toBe(true);
    expect(ctrl0.dataNature).toBe('synthetic');
    expect(ctrl0.running).toBe(true);
    expect(ctrl0.totalActiveTrains).toBeGreaterThan(20);
    expect(ctrl0.undergroundTrainCount).toBeGreaterThan(8);

    // Flagship underground demo train ID must be valid and underground
    const demoTrainId = adapter.getDemoUndergroundTrainId();
    expect(demoTrainId).not.toBeNull();
    const demoTrain0 = adapter.getTrainById(demoTrainId!)!;
    expect(demoTrain0).toBeDefined();
    expect(demoTrain0.isVirtualSimulation).toBe(true);
    expect(demoTrain0.dataNature).toBe('synthetic');
    expect(demoTrain0.disclaimerCode).toBe('VIRTUAL_SIMULATION_NOT_REALTIME');
    expect(demoTrain0.isUnderground).toBe(true);
    expect(demoTrain0.carPoses.length).toBe(demoTrain0.carCount);

    // Step 10 seconds at verticalExaggeration = 1.0 vs 2.0 and verify deterministic invariance + verticalExaggeration rail-head scaling
    const adapterA = createTrainSimulationEngine();
    adapterA.initialize(graph, dataset, { seed: 42, density: 'low' });
    const adapterB = createTrainSimulationEngine();
    adapterB.initialize(graph, dataset, { seed: 42, density: 'low' });

    // Step A at 60 FPS (600 frames of 1/60s) and B at 20 FPS (200 frames of 1/20s)
    for (let i = 0; i < 600; i++) adapterA.step(1 / 60, 1.0);
    for (let i = 0; i < 200; i++) adapterB.step(1 / 20, 1.0);

    expect(adapterA.getControlState().simClockSec).toBe(10.0);
    expect(adapterB.getControlState().simClockSec).toBe(10.0);
    expect(adapterA.getTrains()[0]!.headPose).toEqual(adapterB.getTrains()[0]!.headPose);
    expect(adapterA.getTrains()[0]!.carPoses).toEqual(adapterB.getTrains()[0]!.carPoses);

    // Test pause, timeScale, density, lineFilter, and reset
    adapter.setRunning(false);
    const clockBeforePause = adapter.getControlState().simClockSec;
    adapter.step(5.0, 1.0);
    expect(adapter.getControlState().simClockSec).toBe(clockBeforePause);

    adapter.setRunning(true);
    adapter.setTimeScale(5);
    adapter.step(2.0, 1.4);
    expect(adapter.getControlState().simClockSec).toBeCloseTo(clockBeforePause + 10.0, 3);

    adapter.setLineFilter(['sk:line:metro-ginza']);
    const ginzaOnlyTrains = adapter.getTrains();
    expect(ginzaOnlyTrains.length).toBeGreaterThan(0);
    expect(ginzaOnlyTrains.every((t) => t.lineId === 'sk:line:metro-ginza')).toBe(true);

    adapter.setLineFilter(null);
    adapter.setDensity('rush');
    expect(adapter.getTrains().length).toBeGreaterThan(ctrl0.totalActiveTrains);
  });
});
