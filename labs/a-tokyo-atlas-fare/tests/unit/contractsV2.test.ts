import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildPhysicalTrackGraph,
  buildTrainConsistSpec,
  getDefaultTrainModelForLine,
  ROLLING_STOCK_CATALOG,
  samplePhysicalTrackPose,
  TRACK_CLEARANCE_STANDARDS,
} from '../../src/contracts/index.js';
import { solveRailwayNetwork3D } from '../../src/domain/elevationSolver.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';

const provider = new StaticAtlasProvider();
const dataset = provider.getAtlasDataset();

describe('SENKIRO Tokyo Atlas 3D v2.0 Frozen Contracts', async () => {
  const osmVertical = await provider.loadOsmVerticalOverlay();
  const solved = solveRailwayNetwork3D(dataset, osmVertical);
  const graph = buildPhysicalTrackGraph(dataset, solved);

  it('builds 1:1 PhysicalTrack entities for every solved TrackSegment with valid metrics & topology', () => {
    expect(graph.tracks.length).toBe(solved.segments.length);
    expect(graph.stationAnchors.length).toBe(solved.stationNodes.length);
    expect(graph.connections.length).toBeGreaterThan(300);

    for (const tr of graph.tracks) {
      expect(tr.id.startsWith('sk:physical_track:')).toBe(true);
      expect(tr.geometryLengthM).toBeGreaterThan(0);
      expect(Number.isFinite(tr.geometryLengthM)).toBe(true);
      expect([1067, 1372, 1435]).toContain(tr.gaugeMm);
      expect(tr.maxSpeedKmh).toBeGreaterThanOrEqual(60);
    }

    // Standard-gauge lines & linear metro check
    const ginzaTracks = graph.tracksByLineId.get('sk:line:metro-ginza') ?? [];
    expect(ginzaTracks.length).toBeGreaterThan(5);
    expect(ginzaTracks[0]!.gaugeMm).toBe(1435);
    expect(ginzaTracks[0]!.electrification).toBe('third_rail_600v');

    const oedoTracks = graph.tracksByLineId.get('sk:line:toei-oedo') ?? [];
    expect(oedoTracks.length).toBeGreaterThan(10);
    expect(oedoTracks[0]!.electrification).toBe('linear_motor_dc_1500v');
  });

  it('samples rail-head poses with Japanese Left-Hand Running, exact YXZ forward orientation, and unscaled rail-head offset', () => {
    const sampleTrack = graph.tracks.find((t) => t.isDoubleTrack && t.dominantTier === 'L-1')!;
    expect(sampleTrack).toBeDefined();

    const midDist = sampleTrack.geometryLengthM * 0.5;
    const poseFwd = samplePhysicalTrackPose(sampleTrack, midDist, 1, 1.0);
    const poseRev = samplePhysicalTrackPose(sampleTrack, midDist, -1, 1.0);
    const poseExag = samplePhysicalTrackPose(sampleTrack, midDist, 1, 2.0);

    // Opposite directions occupy opposite tracks separated by 2 * trackHalfSpacingM
    const lateralSep = Math.hypot(poseFwd.x - poseRev.x, poseFwd.z - poseRev.z);
    expect(Math.abs(lateralSep - sampleTrack.trackHalfSpacingM * 2)).toBeLessThan(0.05);

    // Forward travel tangent is opposite to reverse travel tangent
    expect(poseFwd.dirX * poseRev.dirX + poseFwd.dirZ * poseRev.dirZ).toBeLessThan(-0.99);

    // Three.js YXZ Euler applied to local +Z MUST match (dirX, dirY, dirZ)
    const euler = new THREE.Euler(poseFwd.pitchRad, poseFwd.yawRad, 0, 'YXZ');
    const localForward = new THREE.Vector3(0, 0, 1).applyEuler(euler);
    expect(Math.abs(localForward.x - poseFwd.dirX)).toBeLessThan(1e-4);
    expect(Math.abs(localForward.y - poseFwd.dirY)).toBeLessThan(1e-4);
    expect(Math.abs(localForward.z - poseFwd.dirZ)).toBeLessThan(1e-4);

    // Vertical exaggeration scales centerY ONLY, preserving unscaled rail-head offset
    const railOffset1 = poseFwd.y - poseFwd.centerY;
    const railOffset2 = poseExag.y - poseExag.centerY;
    expect(Math.abs(railOffset1 - railOffset2)).toBeLessThan(1e-5);
    expect(Math.abs(poseExag.centerY - poseFwd.centerY * 2.0)).toBeLessThan(1e-4);
  });

  it('guarantees every RollingStockSpec fits cleanly within its tunnel structure gauge envelope', () => {
    for (const spec of Object.values(ROLLING_STOCK_CATALOG)) {
      const isShinkansen = spec.modelId.startsWith('shinkansen-');
      const isLinear = spec.modelId === 'toei-12-600';
      const halfSpacing = isShinkansen
        ? TRACK_CLEARANCE_STANDARDS.shinkansenHalfSpacingM
        : isLinear
          ? TRACK_CLEARANCE_STANDARDS.linearMetroHalfSpacingM
          : TRACK_CLEARANCE_STANDARDS.conventionalHalfSpacingM;
      const clearance = isShinkansen
        ? TRACK_CLEARANCE_STANDARDS.minTunnelClearance.shinkansen
        : isLinear
          ? TRACK_CLEARANCE_STANDARDS.minTunnelClearance.linearMetro
          : TRACK_CLEARANCE_STANDARDS.minTunnelClearance.conventional;

      // Outer car edge must stay inside tunnel half-width
      const outerEdge = halfSpacing + spec.carWidthM * 0.5;
      expect(outerEdge).toBeLessThan(clearance.halfWidthM);

      // Opposing double-track trains must never collide laterally
      expect(spec.carWidthM).toBeLessThan(halfSpacing * 2);

      // Car roof must clear tunnel ceiling
      expect(spec.carHeightM).toBeLessThan(clearance.headroomAboveRailM);

      // Consist builder produces valid lead/tail cab consists
      const consist = buildTrainConsistSpec(spec.modelId);
      expect(consist.cars.length).toBe(spec.defaultCarCount);
      expect(consist.cars[0]!.role).toBe('lead_cab');
      expect(consist.cars[consist.cars.length - 1]!.role).toBe('tail_cab');
      expect(consist.totalLengthM).toBeGreaterThan(spec.carLengthM * 2);
    }

    expect(getDefaultTrainModelForLine('sk:line:jr-east-yamanote')).toBe('jr-e235-0');
    expect(getDefaultTrainModelForLine('sk:line:metro-ginza')).toBe('metro-1000');
    expect(getDefaultTrainModelForLine('sk:line:toei-oedo')).toBe('toei-12-600');
  });
});
