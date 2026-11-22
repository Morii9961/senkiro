# Progress Report — atlas-simulation (`train_simulation_engine`)

- **Status**: `READY_FOR_INTEGRATION`
- **Base Contract Commit**: `be8db1b` (`integration/atlas-v2` — frozen architecture, contracts, `PhysicalTrackGraph` and scene plugin facade)
- **Latest Branch Commit**: `train_simulation_engine` (HEAD)
- **Updated At**: 2026-11-22 18:19

## Completed Deliverables

1. **Canonical v2.0 `TrainSimulationEngineAdapter` Implementation (`src/simulation/v2Adapter.ts` & `src/simulation/index.ts`)**:
   - Exported `VirtualTrainSimulationEngine` and factory `createTrainSimulationEngine()` from `src/simulation/index.ts` (Pure TypeScript, zero Three.js/React/DOM coupling).
   - Consumes `PhysicalTrackGraph` and `AtlasDataset` directly in `initialize(graph, dataset, options)`.
   - Stitches validated directional multi-segment routes (`StitchedPhysicalRoute`) across `PhysicalTrack` entities while rejecting any unconnected station pairs.
   - Uses Session 0's canonical `samplePhysicalTrackPose(track, distFromStartM, direction, verticalExaggeration)` for all head and bogie sampling so:
     - Double-track trains strictly follow **Japanese Left-Hand Running (`左側通行`)**.
     - `verticalExaggeration` (`1.0× .. 2.5×`) scales only `centerY`, keeping `railHeadOffsetM` (`+0.68m` surface / `+0.48m` slab & tunnel) unscaled and car bodies at 1:1 metric scale.
     - Multi-car articulated `carPoses: SimulatedCarPose[]` are solved via front and rear bogie pivot chords (`±bogiePitchM * 0.5`) so every carriage bends naturally through curves and across portal/grade transitions.
   - Implements deterministic `getDemoUndergroundTrainId()` returning an active underground tunnel train (prioritizing Tokyo Metro Marunouchi / Toei Oedo / Fukutoshin / Hanzomon / Ginza) for `Metropolitan3DScene.startUndergroundTrainDemo()`.
   - Supports `setRunning`, `setTimeScale` (`0.5 | 1 | 2 | 5 | 10`), `setDensity` (`low | normal | rush`), `setLineFilter`, and `reset(seed)`.
   - Enforces honesty tags on every `SimulatedTrainState` and `SimulationControlState`:
     - `isVirtualSimulation: true`
     - `dataNature: 'synthetic'`
     - `disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME'`
     - `simulationLabel: 'Simulation / 模拟运行'`

2. **12-State Deterministic Operational FSM, 3D Spline & Block Occupancy Engine (`src/simulation/*`)**:
   - Full 12-state deterministic FSM (`INITIALIZING`, `READY_TO_DEPART`, `DEPARTING_STATION`, `ACCELERATING`, `CRUISING`, `DECELERATING`, `APPROACHING_STATION`, `STOPPING`, `DOORS_OPENING`, `DWELLING`, `DOORS_CLOSING`, `TERMINAL_TURNAROUND`) driven by a fixed-timestep accumulator (`fixedStepSec = 0.05s = 20 Hz`) for bit-for-bit cross-framerate consistency (`15 / 30 / 60 / 120 FPS` and variable frame jitter).
   - Simplified railway block occupancy and nose-to-tail headway controller (`BlockOccupancyController`) preventing train overlap on the same track section and enforcing safe braking behind dwelling trains.
   - Standalone `MockRailwayNetworkAdapter` (`src/simulation/mockAdapter.ts`) for isolated single-interval, 90° curve, closed-loop, and discontinuous-track testing.

3. **Comprehensive Automated Unit Tests (`tests/unit/simulationEngine.test.ts`)**:
   - 11 unit test suites covering single-train 12-state cycle, cross-framerate invariance, curve bogie alignment & inter-car spacing, `< 0.05m` precision station stopping, closed-loop wraparound, unconnected track prohibition, pause/resume/timeScale/parameter clamping, multi-train block occupancy safety, Session 0 multi-level Tokyo lines, `headway_dispatch` portal traversal, and full `TrainSimulationEngineAdapter` v2.0 contract compliance.

## Files Created / Modified (Strictly within `atlas-simulation` Exclusive Write Boundary)

- `labs/a-tokyo-atlas-fare/src/simulation/index.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/v2Adapter.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/types.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/rollingStockCatalog.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/trackSpline3D.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/routeBuilder.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/blockOccupancy.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/trainStateMachine.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/simulationEngine.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/mockAdapter.ts`
- `labs/a-tokyo-atlas-fare/src/simulation/samplePresets.json`
- `labs/a-tokyo-atlas-fare/tests/unit/simulationEngine.test.ts`
- `docs/atlas-v2/reports/atlas-simulation.md`

## Verification Evidence (Actually Run)

- `npm --prefix labs/a-tokyo-atlas-fare run build` (`tsc --noEmit && vite build`): **PASS** (`0 errors`, `dist/` built cleanly)
- `npm --prefix labs/a-tokyo-atlas-fare test` (`vitest run`): **PASS** (`5 test files, 56/56 tests passed`: `fareEngine.test.ts` 26/26, `alignmentAndData.test.ts` 9/9, `contractsV2.test.ts` 3/3, `elevationSolver.test.ts` 7/7, `simulationEngine.test.ts` 11/11)

## Contract / Integration Requests (for Lead Architect / Session 0)

- **Zero contract changes needed** — `VirtualTrainSimulationEngine` implements `TrainSimulationEngineAdapter` from `src/contracts/atlasV2.ts` out-of-the-box.
- **One-line wiring in `Metropolitan3DScene.ts` (or plugin injection)**:
  ```ts
  import { createTrainSimulationEngine } from '../simulation/index.js';
  // Inside Metropolitan3DScene constructor (or default plugins fallback):
  this.attachSimulationEngine(plugins?.simulationEngine ?? createTrainSimulationEngine());
  ```

## Known Limitations & Honesty Notes

- All virtual train positions, run numbers, headways, and dwell intervals are deterministic synthetic simulations (`dataNature: 'synthetic'`, `isVirtualSimulation: true`, `disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME'`, `Simulation / 模拟运行`), never real-time timetable feeds.
- Block occupancy uses deterministic discrete physical track blocks + continuous nose-to-tail safe separation (`85m`) rather than a full multi-aspect interlocking signal table.
