import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ROLLING_STOCK_CATALOG,
  TRACK_CLEARANCE_STANDARDS,
  type SimulatedTrainState,
} from '../../src/contracts/index.js';
import {
  buildConsistFormation,
  createRollingStockRenderer,
  createShowcaseCurveSpline3D,
  createTrainConsist,
  createTrainConsistForLine,
  getRollingStockForLine,
  getRollingStockSpec,
  inspectGlbBinary,
  LIST_ROLLING_STOCK_SPECS,
  parseGlbBufferWithThreeLoader,
  ROLLING_STOCK_SOURCES,
  RollingStockRendererV2,
  serializeObject3DToGlb,
  solveConsistPosesAlongSpline,
} from '../../src/three/rollingstock/index.js';

describe('SENKIRO Atlas v2 — Japanese Rolling Stock 3D Asset System & RollingStockRendererAdapter', () => {
  it('1. verifies official dimensions, distinct structural profiles, and source provenance for flagship series', () => {
    expect(LIST_ROLLING_STOCK_SPECS).toHaveLength(3);
    const sourceIds = new Set(ROLLING_STOCK_SOURCES.map((s) => s.id));

    const e235 = getRollingStockSpec('jr-east-e235-0');
    const m1000 = getRollingStockSpec('tokyo-metro-1000');
    const m17000 = getRollingStockSpec('tokyo-metro-17000');

    expect(new Set([e235.bodyProfile, m1000.bodyProfile, m17000.bodyProfile]).size).toBe(3);
    expect(new Set([e235.frontArchetype, m1000.frontArchetype, m17000.frontArchetype]).size).toBe(3);
    expect(
      new Set([
        e235.palette.liveryPattern,
        m1000.palette.liveryPattern,
        m17000.palette.liveryPattern,
      ]).size,
    ).toBe(3);

    expect(e235.dimensions.couplerLengthM).toBe(20.0);
    expect(e235.dimensions.bodyWidthM).toBe(2.95);
    expect(e235.dimensions.trackGaugeM).toBe(1.067);
    expect(e235.dimensions.doorsPerSide).toBe(4);
    expect(e235.electrification).toBe('overhead_1500v_dc');
    expect(e235.standardConsists[0]?.carCount).toBe(11);

    expect(m1000.dimensions.couplerLengthM).toBe(16.0);
    expect(m1000.dimensions.bodyWidthM).toBe(2.55);
    expect(m1000.dimensions.trackGaugeM).toBe(1.435);
    expect(m1000.dimensions.doorsPerSide).toBe(3);
    expect(m1000.electrification).toBe('third_rail_600v_dc');
    expect(m1000.pantographModel).toBeNull();
    expect(m1000.standardConsists[0]?.carCount).toBe(6);

    expect(m17000.dimensions.couplerLengthM).toBe(20.0);
    expect(m17000.dimensions.bodyWidthM).toBe(2.8);
    expect(m17000.dimensions.trackGaugeM).toBe(1.067);
    expect(m17000.dimensions.doorsPerSide).toBe(4);
    expect(m17000.standardConsists.map((c) => c.carCount)).toContain(10);
    expect(m17000.standardConsists.map((c) => c.carCount)).toContain(8);

    for (const spec of LIST_ROLLING_STOCK_SPECS) {
      expect(spec.provenance.dataNature).toBe('manual-verified');
      expect(spec.credibility.sourceIds.length).toBeGreaterThanOrEqual(2);
      for (const sid of spec.credibility.sourceIds) {
        expect(sourceIds.has(sid)).toBe(true);
      }
    }

    expect(getRollingStockForLine('sk:line:jr-east-yamanote')?.seriesId).toBe('jr-east-e235-0');
    expect(getRollingStockForLine('sk:line:metro-ginza')?.seriesId).toBe('tokyo-metro-1000');
    expect(getRollingStockForLine('sk:line:metro-yurakucho')?.seriesId).toBe('tokyo-metro-17000');
    expect(getRollingStockForLine('sk:line:metro-fukutoshin')?.seriesId).toBe('tokyo-metro-17000');
  });

  it('2. builds modular multi-car consists and respects 3-tier LOD polygon budgets and auto-switching', () => {
    for (const spec of LIST_ROLLING_STOCK_SPECS) {
      const consist = createTrainConsist({
        seriesId: spec.seriesId,
        carCount: 4,
        initialLod: 'high',
        lodMode: 'auto',
      });

      expect(consist.cars).toHaveLength(4);
      expect(consist.cars[0]?.slot.role).toBe('lead_front');
      expect(consist.cars[3]?.slot.role).toBe('lead_rear');

      for (const car of consist.cars) {
        const tHigh = car.getTriangleCount('high');
        const tMed = car.getTriangleCount('medium');
        const tLow = car.getTriangleCount('low');

        expect(tHigh).toBeGreaterThan(tMed);
        expect(tMed).toBeGreaterThan(tLow);
        expect(tLow).toBeGreaterThan(50);

        expect(tHigh).toBeLessThanOrEqual(spec.lodBudgets.high.maxTrianglesPerCar);
        expect(tMed).toBeLessThanOrEqual(spec.lodBudgets.medium.maxTrianglesPerCar);
        expect(tLow).toBeLessThanOrEqual(spec.lodBudgets.low.maxTrianglesPerCar);
      }

      expect(consist.updateLodForCamera({ x: 0, y: 10, z: 80 })).toBe('high');
      expect(consist.updateLodForCamera({ x: 0, y: 50, z: 500 })).toBe('medium');
      expect(consist.updateLodForCamera({ x: 0, y: 200, z: 1600 })).toBe('low');

      consist.dispose();
    }
  });

  it('3. animates left/right passenger doors smoothly and switches headlights/taillights with travel direction', () => {
    const consist = createTrainConsistForLine('sk:line:jr-east-yamanote', {
      carCount: 3,
      initialLod: 'high',
    })!;
    expect(consist).not.toBeNull();

    consist.setDoorState('left', true, false);
    expect(consist.getDoorState().leftTarget).toBe(1);
    expect(consist.getDoorState().leftCurrent).toBe(0);

    consist.update(0.7);
    const midProgress = consist.getDoorState().leftCurrent;
    expect(midProgress).toBeGreaterThan(0.3);
    expect(midProgress).toBeLessThan(0.9);
    expect(consist.getDoorState().rightCurrent).toBe(0);

    consist.update(1.0);
    expect(consist.getDoorState().leftCurrent).toBe(1);

    consist.setDoorState('left', false, true);
    consist.setDoorState('right', true, true);
    expect(consist.getDoorState().leftCurrent).toBe(0);
    expect(consist.getDoorState().rightCurrent).toBe(1);

    expect(consist.getTravelDirection()).toBe('forward');
    consist.reverseTravelDirection();
    expect(consist.getTravelDirection()).toBe('reverse');

    const w0 = consist.getAnimationState().wheelRotationRad;
    consist.update(0.1, { distanceDeltaM: 2.5 });
    expect(consist.getAnimationState().wheelRotationRad).not.toBe(w0);

    consist.dispose();
  });

  it('4. solves 3D curve bogie-chord articulation and inter-car gangway angles accurately', () => {
    const spec = getRollingStockSpec('tokyo-metro-17000');
    const straightSpline = createShowcaseCurveSpline3D('straight', 0, 0);
    const straightPoses = solveConsistPosesAlongSpline(straightSpline, spec, 120, {
      carCount: 4,
    });
    expect(straightPoses).toHaveLength(4);
    for (const p of straightPoses) {
      expect(Math.abs(p.frontBogieLocalYawRad)).toBeLessThan(1e-4);
      expect(Math.abs(p.rearBogieLocalYawRad)).toBeLessThan(1e-4);
      expect(Math.abs(p.pitchRad)).toBeLessThan(1e-4);
    }

    const curveSpline = createShowcaseCurveSpline3D('s_curve', 0, 0);
    const curvePoses = solveConsistPosesAlongSpline(curveSpline, spec, 220, {
      carCount: 6,
    });
    expect(curvePoses).toHaveLength(6);

    const maxBogieDeflection = Math.max(
      ...curvePoses.map((p) =>
        Math.max(Math.abs(p.frontBogieLocalYawRad), Math.abs(p.rearBogieLocalYawRad)),
      ),
    );
    const maxGangwayDeflection = Math.max(
      ...curvePoses.map((p) => Math.abs(p.rearGangwayYawRad)),
    );
    const maxPitch = Math.max(...curvePoses.map((p) => Math.abs(p.pitchRad)));

    expect(maxBogieDeflection).toBeGreaterThan(0.01);
    expect(maxGangwayDeflection).toBeGreaterThan(0.01);
    expect(maxPitch).toBeGreaterThan(0.005);

    const yamanote11 = buildConsistFormation('jr-east-e235-0', 11);
    expect(yamanote11).toHaveLength(11);
  });

  it('5. serializes and parses Khronos glTF 2.0 binary (.glb) assets with Three.js GLTFLoader', async () => {
    const consist = createTrainConsist({
      seriesId: 'tokyo-metro-1000',
      carCount: 2,
      initialLod: 'high',
    });

    const glbBytes = serializeObject3DToGlb(consist.group, { includeOnlyVisible: true });
    const header = inspectGlbBinary(glbBytes);

    expect(header.validMagic).toBe(true);
    expect(header.magicText).toBe('glTF');
    expect(header.version).toBe(2);
    expect(header.nodeCount).toBeGreaterThan(40);
    expect(header.meshCount).toBeGreaterThan(20);
    expect(header.materialCount).toBeGreaterThanOrEqual(8);
    expect(header.nodeNames.some((n) => n.startsWith('Door_L_1'))).toBe(true);
    expect(header.nodeNames.some((n) => n.startsWith('Headlight_L'))).toBe(true);
    expect(header.nodeNames.some((n) => n === 'Bogie_Front')).toBe(true);

    const parsed = await parseGlbBufferWithThreeLoader(glbBytes);
    expect(parsed.scene).toBeDefined();
    expect(parsed.scene.getObjectByName('Bogie_Front')).toBeDefined();

    const assetDir = path.resolve(
      process.cwd(),
      'src',
      'three',
      'rollingstock',
      'assets',
    );
    const manifestPath = path.join(assetDir, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      totalAssets: number;
      assets: { fileName: string; byteLength: number }[];
    };
    expect(manifest.totalAssets).toBe(9);
    for (const item of manifest.assets) {
      const filePath = path.join(assetDir, item.fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBe(item.byteLength);
    }

    consist.dispose();
  });

  it('6. satisfies Session 0 RollingStockRendererAdapter contract (+Z forward, y=0 wheel tread, 12 models, 3-tier LOD, picking & scale.y===1.0 invariant)', () => {
    const renderer = createRollingStockRenderer() as RollingStockRendererV2;
    expect(renderer.listAvailableModels()).toHaveLength(12);
    expect(renderer.group.scale.y).toBe(1.0);

    // Verify all 12 catalog models obey +Z forward, y=0.0 wheel tread bottom, and tunnel clearance envelope
    for (const spec of renderer.listAvailableModels()) {
      const geomLead = renderer.getOrCreateCarGeometry(spec.modelId, 'lead_cab', 'high', false);
      geomLead.computeBoundingBox();
      const bb = geomLead.boundingBox!;
      expect(bb).not.toBeNull();

      // Wheel tread bottom must rest flush at y = 0.0
      expect(Math.abs(bb.min.y)).toBeLessThan(1e-3);

      // Car width is along X, car length is along Z (+Z forward)
      const widthX = bb.max.x - bb.min.x;
      const lengthZ = bb.max.z - bb.min.z;
      expect(lengthZ).toBeGreaterThan(widthX * 3.5);
      expect(widthX).toBeLessThanOrEqual(spec.carWidthM + 0.45);

      const isShinkansen = spec.modelId.startsWith('shinkansen-');
      const isLinear = spec.modelId === 'toei-12-600';
      const clearance = isShinkansen
        ? TRACK_CLEARANCE_STANDARDS.minTunnelClearance.shinkansen
        : isLinear
          ? TRACK_CLEARANCE_STANDARDS.minTunnelClearance.linearMetro
          : TRACK_CLEARANCE_STANDARDS.minTunnelClearance.conventional;

      expect(bb.max.y).toBeLessThanOrEqual(clearance.headroomAboveRailM);
    }

    // Simulate syncing 3 virtual trains at Near, Mid, and Far camera distances
    const makeMockTrain = (
      trainId: string,
      modelId: keyof typeof ROLLING_STOCK_CATALOG,
      zPos: number,
      doorState: 'closed' | 'open',
    ): SimulatedTrainState => ({
      trainId,
      runNumber: '101G',
      isVirtualSimulation: true,
      dataNature: 'synthetic',
      disclaimerCode: 'VIRTUAL_SIMULATION_NOT_REALTIME',
      operatorId: 'sk:operator:jr-east',
      lineId: 'sk:line:jr-east-yamanote',
      lineColor: '#80c241',
      servicePatternId: 'svc-1',
      serviceClass: 'local',
      modelId,
      carCount: 3,
      direction: 1,
      phase: doorState === 'open' ? 'dwelling' : 'cruising',
      speedKmh: doorState === 'open' ? 0 : 65,
      speedMps: doorState === 'open' ? 0 : 18,
      currentTrackId: 'sk:physical_track:test',
      currentSegmentId: 'sk:segment:test',
      distanceAlongTrackM: 100,
      fromStationId: 'sk:station:a',
      nextStationId: 'sk:station:b',
      destinationStationId: 'sk:station:b',
      dwellRemainingSec: 0,
      doorState,
      headPose: {
        x: 0,
        y: 0.68,
        z: zPos,
        dirX: 0,
        dirY: 0,
        dirZ: 1,
        yawRad: 0,
        pitchRad: 0,
      },
      carPoses: [
        {
          carIndex: 0,
          role: 'lead_cab',
          lengthM: 20,
          x: 0,
          y: 0.68,
          z: zPos,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          trackId: 'sk:physical_track:test',
          tier: 'L0',
          isUnderground: false,
        },
        {
          carIndex: 1,
          role: 'pantograph',
          lengthM: 20,
          x: 0,
          y: 0.68,
          z: zPos - 20.45,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          trackId: 'sk:physical_track:test',
          tier: 'L0',
          isUnderground: false,
        },
        {
          carIndex: 2,
          role: 'tail_cab',
          lengthM: 20,
          x: 0,
          y: 0.68,
          z: zPos - 40.9,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          trackId: 'sk:physical_track:test',
          tier: 'L0',
          isUnderground: false,
        },
      ],
      tier: 'L0',
      isUnderground: false,
      inTunnel: false,
      progressOnRoute: 0.5,
    });

    const trains: SimulatedTrainState[] = [
      makeMockTrain('train-e235-near', 'jr-e235-0', 50, 'open'),
      makeMockTrain('train-1000-mid', 'metro-1000', 600, 'closed'),
      makeMockTrain('train-17000-far', 'metro-17000', 2200, 'closed'),
    ];

    renderer.syncTrains(trains, new THREE.Vector3(0, 10, 0), 2.2, true);

    // Invariant: group.scale.y must remain 1.0 even when verticalExaggeration = 2.2
    expect(renderer.group.scale.y).toBe(1.0);

    const stats = renderer.getStats();
    expect(stats.renderedTrainCount).toBe(3);
    expect(stats.renderedCarCount).toBe(9);
    expect(stats.lodNearTrains).toBe(1);
    expect(stats.lodMidTrains).toBe(1);
    expect(stats.lodFarTrains).toBe(1);
    expect(renderer.interactiveTrainMeshes).toHaveLength(9);

    // Selection & Raycast hit resolution
    renderer.setSelectedTrain('train-1000-mid');
    const hitMesh = renderer.interactiveTrainMeshes[3]!;
    const resolvedId = renderer.resolveTrainHit({
      object: hitMesh,
      distance: 10,
      point: new THREE.Vector3(),
    });
    expect(resolvedId).toBe('train-1000-mid');

    renderer.dispose();
    expect(renderer.interactiveTrainMeshes).toHaveLength(0);
  });
});
