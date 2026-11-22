import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPhysicalTrackGraph } from '../../src/contracts/index.js';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';
import { createTrainSimulationEngine } from '../../src/simulation/index.js';
import { createRollingStockRenderer } from '../../src/three/rollingstock/index.js';

const provider = new StaticAtlasProvider();
const dataset = provider.getAtlasDataset();

describe('Wave 1+2 Integration: VirtualTrainSimulationEngine <-> RollingStockRendererV2', async () => {
  const osmVertical = await provider.loadOsmVerticalOverlay();
  const solved = solveRailwayNetwork3D(dataset, osmVertical);
  const graph = buildPhysicalTrackGraph(dataset, solved);

  it('drives real multi-car Tokyo trains through RollingStockRendererV2 across surface and underground tiers', () => {
    const sim = createTrainSimulationEngine();
    sim.initialize(graph, dataset, { autoStart: true, density: 'normal', seed: 42 });

    const renderer = createRollingStockRenderer();
    const camPos = new THREE.Vector3(0, 120, 400);

    // Step simulation 20 frames (1.0s simulated time) at 1.4x vertical exaggeration
    let trains = sim.getTrains();
    expect(trains.length).toBeGreaterThan(5);

    const demoId = sim.getDemoUndergroundTrainId();
    expect(demoId).not.toBeNull();
    const initialDemo = sim.getTrainById(demoId!);
    expect(initialDemo).toBeDefined();
    expect(initialDemo!.isVirtualSimulation).toBe(true);
    expect(initialDemo!.dataNature).toBe('synthetic');
    expect(initialDemo!.disclaimerCode).toBe('VIRTUAL_SIMULATION_NOT_REALTIME');

    const startX = initialDemo!.headPose.x;
    const startZ = initialDemo!.headPose.z;

    for (let i = 0; i < 40; i++) {
      trains = sim.step(0.05, 1.4);
      renderer.syncTrains(trains, camPos, 1.4, false);
    }

    const afterDemo = sim.getTrainById(demoId!);
    expect(afterDemo).toBeDefined();
    // Verify real movement along physical track (or active dwell countdown)
    const movedDist = Math.hypot(
      afterDemo!.headPose.x - startX,
      afterDemo!.headPose.z - startZ,
    );
    expect(movedDist > 0.1 || afterDemo!.phase === 'dwelling').toBe(true);

    // RollingStock group MUST remain unscaled vertically (scale.y === 1.0)
    expect(renderer.group.scale.y).toBe(1);

    const stats = renderer.getStats();
    expect(stats.renderedTrainCount).toBe(trains.length);
    expect(stats.renderedCarCount).toBeGreaterThanOrEqual(trains.length * 4);
    expect(renderer.interactiveTrainMeshes.length).toBeGreaterThan(0);

    renderer.setSelectedTrain(demoId);
    renderer.syncTrains(trains, camPos, 1.4, true);
    renderer.dispose();
  });
});
