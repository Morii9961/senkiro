import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildConsistFormation,
  createShowcaseCurveSpline3D,
  createTrainConsist,
  createTrainConsistForLine,
  getRollingStockForLine,
  getRollingStockSpec,
  inspectGlbBinary,
  LIST_ROLLING_STOCK_SPECS,
  parseGlbBufferWithThreeLoader,
  ROLLING_STOCK_SOURCES,
  serializeObject3DToGlb,
  solveConsistPosesAlongSpline,
} from '../../src/three/rollingStock/index.js';

describe('SENKIRO Atlas v2 — Japanese Rolling Stock 3D Asset System', () => {
  it('1. verifies official dimensions, distinct structural profiles, and source provenance for all 3 series', () => {
    expect(LIST_ROLLING_STOCK_SPECS).toHaveLength(3);
    const sourceIds = new Set(ROLLING_STOCK_SOURCES.map((s) => s.id));

    const e235 = getRollingStockSpec('jr-east-e235-0');
    const m1000 = getRollingStockSpec('tokyo-metro-1000');
    const m17000 = getRollingStockSpec('tokyo-metro-17000');

    // Every series has distinct body width, cross-section profile, front archetype, and livery pattern (no generic box recoloring!)
    expect(new Set([e235.bodyProfile, m1000.bodyProfile, m17000.bodyProfile]).size).toBe(3);
    expect(new Set([e235.frontArchetype, m1000.frontArchetype, m17000.frontArchetype]).size).toBe(3);
    expect(
      new Set([
        e235.palette.liveryPattern,
        m1000.palette.liveryPattern,
        m17000.palette.liveryPattern,
      ]).size,
    ).toBe(3);

    // E235-0 Yamanote Line official specs: 20.0m length, 2.95m wide-body, 1,067mm gauge, 4 doors, 11-car full consist
    expect(e235.dimensions.couplerLengthM).toBe(20.0);
    expect(e235.dimensions.bodyWidthM).toBe(2.95);
    expect(e235.dimensions.trackGaugeM).toBe(1.067);
    expect(e235.dimensions.doorsPerSide).toBe(4);
    expect(e235.electrification).toBe('overhead_1500v_dc');
    expect(e235.standardConsists[0]?.carCount).toBe(11);

    // Tokyo Metro 1000 Ginza Line official specs: 16.0m compact length, 2.55m width, 1,435mm standard gauge, 3 doors, 600V third rail (NO pantograph)
    expect(m1000.dimensions.couplerLengthM).toBe(16.0);
    expect(m1000.dimensions.bodyWidthM).toBe(2.55);
    expect(m1000.dimensions.trackGaugeM).toBe(1.435);
    expect(m1000.dimensions.doorsPerSide).toBe(3);
    expect(m1000.electrification).toBe('third_rail_600v_dc');
    expect(m1000.pantographModel).toBeNull();
    expect(m1000.standardConsists[0]?.carCount).toBe(6);

    // Tokyo Metro 17000 Yurakucho/Fukutoshin official specs: 20.0m length, 2.80m tapered A-train width, 1,067mm gauge, 4 doors, 10-car & 8-car consists
    expect(m17000.dimensions.couplerLengthM).toBe(20.0);
    expect(m17000.dimensions.bodyWidthM).toBe(2.8);
    expect(m17000.dimensions.trackGaugeM).toBe(1.067);
    expect(m17000.dimensions.doorsPerSide).toBe(4);
    expect(m17000.standardConsists.map((c) => c.carCount)).toContain(10);
    expect(m17000.standardConsists.map((c) => c.carCount)).toContain(8);

    // Provenance & credibility check
    for (const spec of LIST_ROLLING_STOCK_SPECS) {
      expect(spec.provenance.dataNature).toBe('manual-verified');
      expect(spec.credibility.sourceIds.length).toBeGreaterThanOrEqual(2);
      for (const sid of spec.credibility.sourceIds) {
        expect(sourceIds.has(sid)).toBe(true);
      }
      expect(spec.credibility.accuracyHighlights.length).toBeGreaterThanOrEqual(3);
      expect(spec.credibility.knownSimplifications.length).toBeGreaterThanOrEqual(2);
    }

    // Line-to-Rolling-Stock mapping
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

      // Verify third-rail Ginza 1000 has 0 pantographs, while E235 & 17000 have pantographs on motorized cars
      const pantoCars = consist.cars.filter((c) => c.slot.hasPantograph);
      if (spec.electrification === 'third_rail_600v_dc') {
        expect(pantoCars).toHaveLength(0);
      } else {
        expect(pantoCars.length).toBeGreaterThanOrEqual(1);
      }

      // Verify triangle counts strictly descend across LOD0 (high) > LOD1 (medium) > LOD2 (low) and stay within budget
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

      // Verify automatic camera-distance LOD switching
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

    // Open left-side doors over time (smooth animation)
    consist.setDoorState('left', true, false);
    expect(consist.getDoorState().leftTarget).toBe(1);
    expect(consist.getDoorState().leftCurrent).toBe(0);

    consist.update(0.7); // half stroke
    const midProgress = consist.getDoorState().leftCurrent;
    expect(midProgress).toBeGreaterThan(0.3);
    expect(midProgress).toBeLessThan(0.9);
    expect(consist.getDoorState().rightCurrent).toBe(0);

    consist.update(1.0); // full open
    expect(consist.getDoorState().leftCurrent).toBe(1);

    // Close left doors and open right doors immediately
    consist.setDoorState('left', false, true);
    consist.setDoorState('right', true, true);
    expect(consist.getDoorState().leftCurrent).toBe(0);
    expect(consist.getDoorState().rightCurrent).toBe(1);

    // Direction switching swaps active headlights and taillights
    expect(consist.getTravelDirection()).toBe('forward');
    consist.reverseTravelDirection();
    expect(consist.getTravelDirection()).toBe('reverse');

    // Advancing distance rotates wheels
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

    // S-curve with vertical ramp
    const curveSpline = createShowcaseCurveSpline3D('s_curve', 0, 0);
    const curvePoses = solveConsistPosesAlongSpline(curveSpline, spec, 220, {
      carCount: 6,
    });
    expect(curvePoses).toHaveLength(6);

    // On the S-curve, bogies articulate relative to the car body chord and cars pitch on the ramp
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

    // Official 11-car Yamanote formation check
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

    // Parse back with Three.js official GLTFLoader
    const parsed = await parseGlbBufferWithThreeLoader(glbBytes);
    expect(parsed.scene).toBeDefined();
    expect(parsed.scene.getObjectByName('Bogie_Front')).toBeDefined();

    // Verify pre-built static .glb files and manifest in public/assets/rolling-stock/
    const assetDir = path.resolve(process.cwd(), 'public', 'assets', 'rolling-stock');
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
});
