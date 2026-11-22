/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Deterministic Train Simulation Engine
 * Public API Barrel Export (`src/simulation/index.ts`, Pure TypeScript, zero Three.js/React coupling).
 *
 * Exports both:
 *  1. `VirtualTrainSimulationEngine` / `createTrainSimulationEngine` implementing the frozen
 *     `TrainSimulationEngineAdapter` contract from `src/contracts/atlasV2.ts` for direct plug-in
 *     to `Metropolitan3DScene` and `RollingStockRendererAdapter`.
 *  2. The 12-state deterministic `TrainSimulationEngine`, `TrackSpline3D`, `BlockOccupancyController`,
 *     `Session0AtlasNetworkAdapter`, and `MockRailwayNetworkAdapter` for fine-grained simulation control
 *     and standalone testing.
 */

export * from './types.js';
export * from './rollingStockCatalog.js';
export * from './trackSpline3D.js';
export * from './routeBuilder.js';
export * from './blockOccupancy.js';
export * from './trainStateMachine.js';
export * from './simulationEngine.js';
export * from './mockAdapter.js';
export * from './v2Adapter.js';
