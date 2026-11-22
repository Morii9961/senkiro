import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import {
  buildClearanceConstraintForChunk,
  buildUndergroundNetworkSpec,
  PILOT_CORRIDOR_SEGMENT_IDS,
  sliceFramesByDistance,
  TUNNEL_ELEVATION_THRESHOLD_Y,
} from '../../src/domain/underground/tunnelCenterlineBuilder.js';
import {
  createTunnelCrossSectionSpec,
  getLineEngineeringSpec,
  interpolateProfile,
  isPointInsideProfile2D,
  PROFILE_VERTEX_COUNT,
  validateTrainClearance,
} from '../../src/domain/underground/tunnelProfileSpecs.js';
import type {
  ProfilePoint2D,
  TrackFrame3D,
  TunnelStructureType,
} from '../../src/domain/underground/tunnelTypes.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';
import {
  buildAnnularEndCap,
  sweepMorphingTunnelShell,
} from '../../src/three/underground/tunnelShellBuilder.js';

const provider = new StaticAtlasProvider();
const dataset = provider.getAtlasDataset();

describe('SENKIRO Atlas v2 — Underground Railway Geometry & Tunnel System', async () => {
  const osmVertical = await provider.loadOsmVerticalOverlay();
  const solved = solveRailwayNetwork3D(dataset, osmVertical);
  const underground = buildUndergroundNetworkSpec(solved);

  it('validates dynamic train clearance across all tunnel structure types, gauges & power systems', () => {
    const ginzaEng = getLineEngineeringSpec('sk:line:metro-ginza', 'tunnel_box'); // 1435mm third rail
    const fukutoshinEng = getLineEngineeringSpec('sk:line:metro-fukutoshin', 'tunnel_shield'); // 1067mm rigid catenary

    expect(ginzaEng.gaugeM).toBe(1.435);
    expect(ginzaEng.powerSupply).toBe('third_rail');
    expect(fukutoshinEng.gaugeM).toBe(1.067);
    expect(fukutoshinEng.powerSupply).toBe('rigid_catenary');

    const cases: Array<[TunnelStructureType, boolean]> = [
      ['shield_single', false],
      ['shield_double', true],
      ['box_single', false],
      ['box_double', true],
      ['station_side', true],
      ['station_island', true],
      ['transition_collar', true],
      ['portal_ramp', true],
    ];

    for (const eng of [ginzaEng, fukutoshinEng]) {
      for (const [structType, isDouble] of cases) {
        const spec = createTunnelCrossSectionSpec(structType, eng, isDouble);
        expect(spec.innerProfile.length).toBe(PROFILE_VERTEX_COUNT);
        expect(spec.outerProfile.length).toBe(PROFILE_VERTEX_COUNT);
        expect(spec.wallThicknessM).toBeGreaterThanOrEqual(0.35);

        const check = validateTrainClearance(spec);
        expect(check.violations).toEqual([]);
        expect(check.valid).toBe(true);
        expect(check.minHorizontalMarginM).toBeGreaterThanOrEqual(spec.clearanceEnvelope.safetyMarginM);
        expect(check.minVerticalMarginM).toBeGreaterThanOrEqual(spec.clearanceEnvelope.safetyMarginM);
      }
    }
  });

  it('morphs smoothly between any two 24-vertex tunnel profiles (e.g. box <-> shield, bore <-> station)', () => {
    const eng = getLineEngineeringSpec('sk:line:metro-ginza', 'tunnel_box');
    const box = createTunnelCrossSectionSpec('box_double', eng, true);
    const station = createTunnelCrossSectionSpec('station_side', eng, true);
    const mid = interpolateProfile(box.innerProfile, station.innerProfile, 0.5);

    expect(mid.length).toBe(PROFILE_VERTEX_COUNT);
    for (const [r, u] of mid) {
      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isFinite(u)).toBe(true);
    }
    // Midpoint width lies strictly between running bore width and station cavern width
    const maxR = Math.max(...mid.map(([r]) => Math.abs(r)));
    expect(maxR).toBeGreaterThan(box.innerWidthM * 0.5);
    expect(maxR).toBeLessThan(station.innerWidthM * 0.5);
  });

  it('generates strictly inward-facing inner lining normals and strictly outward-facing outer shell normals', () => {
    const eng = getLineEngineeringSpec('sk:line:metro-fukutoshin', 'tunnel_shield');
    const shield = createTunnelCrossSectionSpec('shield_double', eng, true);

    const frames: TrackFrame3D[] = [0, 10, 20, 30].map((d) => ({
      position: { x: 0, y: -30, z: -d },
      tangent: { x: 0, y: 0, z: -1 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      distanceM: d,
      grade: 0,
      structureType: 'shield_double',
      tier: 'L-3',
      depthReliability: 'schematic',
      heightBasis: 'manual-verified-relative',
    }));

    const innerGeom = sweepMorphingTunnelShell(frames, shield.innerProfile, shield.innerProfile, {
      inwardFacing: true,
    });
    const outerGeom = sweepMorphingTunnelShell(frames, shield.outerProfile, shield.outerProfile, {
      inwardFacing: false,
    });
    expect(innerGeom).not.toBeNull();
    expect(outerGeom).not.toBeNull();

    // Check every vertex normal against the bore center (0, -30 + 2.25, z)
    const centerY = -30 + 2.25;
    const verifyNormals = (geom: THREE.BufferGeometry, expectInward: boolean) => {
      const pos = geom.getAttribute('position') as THREE.BufferAttribute;
      const norm = geom.getAttribute('normal') as THREE.BufferAttribute;
      let checked = 0;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const toCenterX = 0 - vx;
        const toCenterY = centerY - vy;
        const nx = norm.getX(i);
        const ny = norm.getY(i);
        const dot = toCenterX * nx + toCenterY * ny;
        if (expectInward) {
          expect(dot).toBeGreaterThan(0);
        } else {
          expect(dot).toBeLessThan(0);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(100);
    };

    verifyNormals(innerGeom!, true);
    verifyNormals(outerGeom!, false);

    // Verify roof/lower partition covers 100% of ring edges with zero gaps and zero overlaps
    const splitY = shield.roofProfileSplitY;
    const isRoof = (_j: number, a: ProfilePoint2D, b: ProfilePoint2D) => a[1] >= splitY && b[1] >= splitY;
    const isLower = (j: number, a: ProfilePoint2D, b: ProfilePoint2D) => !isRoof(j, a, b);

    const lowerGeom = sweepMorphingTunnelShell(frames, shield.innerProfile, shield.innerProfile, {
      inwardFacing: true,
      edgeFilter: isLower,
    });
    const roofGeom = sweepMorphingTunnelShell(frames, shield.innerProfile, shield.innerProfile, {
      inwardFacing: true,
      edgeFilter: isRoof,
    });
    expect(lowerGeom).not.toBeNull();
    expect(roofGeom).not.toBeNull();
    const totalSplitVerts =
      lowerGeom!.getAttribute('position').count + roofGeom!.getAttribute('position').count;
    expect(totalSplitVerts).toBe(innerGeom!.getAttribute('position').count);

    // Annular end cap builds finite watertight ring geometry
    const endCap = buildAnnularEndCap(frames[0]!, shield.innerProfile, shield.outerProfile, false);
    expect(endCap.getAttribute('position').count).toBe(PROFILE_VERTEX_COUNT * 6);

    innerGeom!.dispose();
    outerGeom!.dispose();
    lowerGeom!.dispose();
    roofGeom!.dispose();
    endCap.dispose();
  });

  it('builds all pilot corridor chunks, station caverns, open portals & orthonormal TrackFrame3Ds', () => {
    expect(underground.chunks.length).toBeGreaterThan(150);
    expect(underground.stationCaverns.length).toBeGreaterThan(100);
    expect(underground.portals.length).toBeGreaterThan(5);

    // Every pilot corridor segment must exist with valid finite bounds & schematic depth honesty tag
    const chunkById = new Map(underground.chunks.map((c) => [c.segmentId, c]));
    for (const segId of PILOT_CORRIDOR_SEGMENT_IDS) {
      const ch = chunkById.get(segId as `sk:segment:${string}`);
      expect(ch).toBeDefined();
      expect(ch!.isPilotCorridor).toBe(true);
      expect(ch!.depthReliability).toBe('schematic');
      expect(ch!.totalLengthM).toBeGreaterThan(200);
      expect(ch!.subSpans.length).toBeGreaterThanOrEqual(1);

      // Verify orthonormal TrackFrame3D along entire centerline
      for (const fr of ch!.centerline) {
        const tLen = Math.hypot(fr.tangent.x, fr.tangent.y, fr.tangent.z);
        const rLen = Math.hypot(fr.right.x, fr.right.y, fr.right.z);
        const uLen = Math.hypot(fr.up.x, fr.up.y, fr.up.z);
        expect(tLen).toBeCloseTo(1, 3);
        expect(rLen).toBeCloseTo(1, 3);
        expect(uLen).toBeCloseTo(1, 3);
        expect(fr.up.y).toBeGreaterThan(0.85);
        // right is strictly horizontal
        expect(fr.right.y).toBe(0);
        // tangent and right are orthogonal in XZ
        const dotTR = fr.tangent.x * fr.right.x + fr.tangent.z * fr.right.z;
        expect(Math.abs(dotTR)).toBeLessThan(1e-3);
      }
    }
  });

  it('maintains exact portal coordinate continuity at y = -2.4m with surface/elevated tracks', () => {
    const ginzaShibuya = underground.chunks.find(
      (c) => c.segmentId === 'sk:segment:metro-ginza--tokyo-metro-shibuya--tokyo-metro-omote-sando',
    );
    expect(ginzaShibuya).toBeDefined();
    expect(ginzaShibuya!.portals.length).toBeGreaterThanOrEqual(1);

    const portal = ginzaShibuya!.portals[0]!;
    expect(portal.frame.position.y).toBeCloseTo(TUNNEL_ELEVATION_THRESHOLD_Y, 4);
    expect(portal.surfaceCutout.widthM).toBeGreaterThan(8);
    expect(portal.surfaceCutout.lengthM).toBeGreaterThan(20);
  });

  it('places curated interior Camera Session viewpoints strictly inside tunnel clearance space', () => {
    expect(underground.viewpoints.length).toBeGreaterThanOrEqual(4);
    const chunkById = new Map(underground.chunks.map((c) => [c.segmentId, c]));

    for (const vp of underground.viewpoints) {
      expect(vp.recommendedNearM).toBeLessThanOrEqual(0.5);
      expect(vp.depthReliability).toBe('schematic');

      if (vp.kind === 'tunnel_interior' || vp.kind === 'shield_bore') {
        const ch = chunkById.get(vp.segmentId);
        expect(ch).toBeDefined();
        const constraint = buildClearanceConstraintForChunk(ch!);
        expect(constraint.safeCorridorLocal.maxUpM).toBeGreaterThan(
          constraint.safeCorridorLocal.minUpM,
        );

        // Find nearest centerline sample and verify camera sits strictly inside innerProfile
        let bestFrame = ch!.centerline[0]!;
        let bestDistSq = Infinity;
        for (const f of ch!.centerline) {
          const dSq =
            (vp.position.x - f.position.x) ** 2 +
            (vp.position.y - f.position.y) ** 2 +
            (vp.position.z - f.position.z) ** 2;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestFrame = f;
          }
        }
        const localRight =
          (vp.position.x - bestFrame.position.x) * bestFrame.right.x +
          (vp.position.z - bestFrame.position.z) * bestFrame.right.z;
        const localUp = vp.position.y - bestFrame.position.y;
        const bore =
          ch!.subSpans.find((s) => s.structureType !== 'transition_collar') ?? ch!.subSpans[0]!;
        expect(isPointInsideProfile2D(localRight, localUp, bore.startSpec.innerProfile)).toBe(true);
      }
    }

    // Verify distance slicing preserves exact boundary endpoints
    const sampleChunk = chunkById.get(
      'sk:segment:metro-ginza--tokyo-metro-omote-sando--tokyo-metro-003834',
    )!;
    const sliced = sliceFramesByDistance(sampleChunk.centerline, 50, 200);
    expect(sliced[0]!.distanceM).toBeCloseTo(50, 3);
    expect(sliced[sliced.length - 1]!.distanceM).toBeCloseTo(200, 3);
  });

  it('prevents running tunnel bores from piercing incident underground station caverns (e.g. Omotesando)', () => {
    const cavernByKey = new Map(
      underground.stationCaverns.map((c) => [`${c.lineId}::${c.stationId}`, c]),
    );
    const pilotChunks = underground.chunks.filter((c) => c.isPilotCorridor);
    expect(pilotChunks.length).toBe(PILOT_CORRIDOR_SEGMENT_IDS.size);

    for (const ch of pilotChunks) {
      const incidentCaverns = [
        cavernByKey.get(`${ch.primaryLineId}::${ch.fromStationId}`),
        cavernByKey.get(`${ch.primaryLineId}::${ch.toStationId}`),
      ].filter((c): c is NonNullable<typeof c> => Boolean(c));

      for (const span of ch.subSpans) {
        if (span.structureType === 'transition_collar') continue;
        for (const cav of incidentCaverns) {
          for (const fr of span.samples) {
            const distXZ = Math.hypot(
              fr.position.x - cav.center.x,
              fr.position.z - cav.center.z,
            );
            // Every running bore vertex must stay strictly outside the station cavern envelope!
            expect(distXZ).toBeGreaterThanOrEqual(cav.lengthM * 0.45);
          }
        }
      }
    }
  });
});
