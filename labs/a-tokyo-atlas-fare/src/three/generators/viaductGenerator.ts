/**
 * Procedural 3D Elevated Viaduct, Bridge Pier & Elevated Station Platform Generator.
 *
 * For all elevated railway spans (y > 2.4):
 *  - Sweeps continuous concrete box-girder decks with side parapet walls smoothly along gradients
 *  - Places InstancedMesh concrete bridge piers strictly down to ground y = 0, skipping road
 *    intersections & river spans (avoiding piers punching through roads or buildings!)
 *  - Builds simplified elevated station platforms & architectural canopy roofs (prominently
 *    showcasing Tokyo Metro Ginza Line Shibuya 3F & Tokyo Station elevated corridors!).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  SchematicTierId,
  SolvedPoint3D,
  SolvedRailwayNetwork3D,
} from '../../domain/elevationSolver.js';
import type { SkId } from '../../domain/types.js';
import type { UrbanBaseEnvironment } from '../types.js';
import { sweepProfileAlong3D } from './railTrackGenerator.js';

interface ViaductBatch {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  tier: SchematicTierId;
  group: THREE.Group;
  deckMaterial: THREE.MeshStandardMaterial;
}

export class ViaductLayer {
  readonly group = new THREE.Group();
  private readonly batches: ViaductBatch[] = [];
  private readonly piersMesh: THREE.InstancedMesh | null = null;
  private readonly pierMaterial: THREE.MeshStandardMaterial;
  private readonly stationPlatformMaterial: THREE.MeshStandardMaterial;
  private readonly canopyMaterial: THREE.MeshStandardMaterial;

  constructor(
    solved: SolvedRailwayNetwork3D,
    env: UrbanBaseEnvironment | null,
    clipPlanes: THREE.Plane[],
  ) {
    this.group.name = 'procedural-3d-viaducts';

    this.pierMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.86,
      metalness: 0.08,
      transparent: true,
      opacity: 0.95,
      clippingPlanes: clipPlanes,
    });

    this.stationPlatformMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.78,
      metalness: 0.08,
      transparent: true,
      opacity: 0.96,
      clippingPlanes: clipPlanes,
    });

    this.canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.45,
      metalness: 0.35,
      transparent: true,
      opacity: 0.88,
      clippingPlanes: clipPlanes,
    });

    // Build spatial avoidance hash for road intersections so piers don't land inside intersections
    const avoidCells = new Set<string>();
    const cellKey = (x: number, z: number) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
    if (env) {
      for (const [ix, iz] of env.intersections) {
        avoidCells.add(cellKey(ix, iz));
      }
    }

    const piers: { x: number; z: number; h: number; angle: number; width: number }[] = [];

    // Group elevated sub-spans by (lineId, tier)
    const decksByKey = new Map<
      string,
      {
        lineId: SkId<'line'>;
        operatorId: SkId<'operator'>;
        tier: SchematicTierId;
        geoms: THREE.BufferGeometry[];
      }
    >();

    for (const seg of solved.segments) {
      // Extract contiguous elevated point runs (y > 2.2) plus one ramp transition point on each end
      const runs: SolvedPoint3D[][] = [];
      let curRun: SolvedPoint3D[] = [];

      for (let i = 0; i < seg.points.length; i++) {
        const pt = seg.points[i]!;
        if (pt.y > 2.0) {
          if (curRun.length === 0 && i > 0) {
            curRun.push(seg.points[i - 1]!);
          }
          curRun.push(pt);
        } else if (curRun.length > 0) {
          curRun.push(pt);
          if (curRun.length >= 2) runs.push(curRun);
          curRun = [];
        }
      }
      if (curRun.length >= 2) runs.push(curRun);
      if (runs.length === 0) continue;

      const key = `${seg.primaryLineId}::${seg.dominantTier}`;
      if (!decksByKey.has(key)) {
        decksByKey.set(key, {
          lineId: seg.primaryLineId,
          operatorId: seg.operatorId,
          tier: seg.dominantTier,
          geoms: [],
        });
      }
      const entry = decksByKey.get(key)!;

      const hw = seg.isShinkansen ? 6.0 : seg.isDoubleTrack ? 5.2 : 3.4;
      // Box-girder deck + low side noise barrier parapets!
      const deckProfile: [number, number][] = [
        [-hw - 0.35, 1.05],
        [-hw - 0.35, -0.5],
        [-hw + 0.9, -2.1],
        [hw - 0.9, -2.1],
        [hw + 0.35, -0.5],
        [hw + 0.35, 1.05],
        [hw - 0.05, 1.05],
        [hw - 0.05, -0.35],
        [-hw + 0.05, -0.35],
        [-hw + 0.05, 1.05],
      ];

      for (const run of runs) {
        const g = sweepProfileAlong3D(run, deckProfile, true);
        if (g) entry.geoms.push(g);

        // Sample concrete piers every 48m along elevated portion where y >= 4.2
        let accum = 24;
        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1]!;
          const b = run[i]!;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 2) continue;
          const angle = Math.atan2(b.z - a.z, b.x - a.x);
          while (accum <= len) {
            const f = accum / len;
            const px = a.x + (b.x - a.x) * f;
            const py = a.y + (b.y - a.y) * f;
            const pz = a.z + (b.z - a.z) * f;
            if (py >= 4.2 && !avoidCells.has(cellKey(px, pz)) && piers.length < 12_000) {
              piers.push({ x: px, z: pz, h: py - 1.6, angle, width: hw * 0.95 });
            }
            accum += 48;
          }
          accum -= len;
        }
      }
    }

    for (const entry of decksByKey.values()) {
      if (entry.geoms.length === 0) continue;
      const merged = mergeGeometries(entry.geoms, false);
      entry.geoms.forEach((g) => g.dispose());
      if (!merged) continue;

      const deckMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8c0ca,
        roughness: 0.84,
        metalness: 0.08,
        transparent: true,
        opacity: 0.96,
        clippingPlanes: clipPlanes,
      });

      const grp = new THREE.Group();
      grp.name = `viaduct-${entry.lineId}-${entry.tier}`;
      const mesh = new THREE.Mesh(merged, deckMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);

      this.group.add(grp);
      this.batches.push({
        lineId: entry.lineId,
        operatorId: entry.operatorId,
        tier: entry.tier,
        group: grp,
        deckMaterial,
      });
    }

    // Instanced concrete bridge piers (strictly grounded at y = 0!)
    if (piers.length > 0) {
      const pierGeom = new THREE.BoxGeometry(2.6, 1, 1);
      const inst = new THREE.InstancedMesh(pierGeom, this.pierMaterial, piers.length);
      inst.name = 'viaduct-piers-instanced';
      inst.castShadow = true;
      inst.receiveShadow = true;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < piers.length; i++) {
        const p = piers[i]!;
        dummy.position.set(p.x, p.h * 0.5, p.z);
        dummy.rotation.set(0, -p.angle, 0);
        dummy.scale.set(1, p.h, p.width);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.piersMesh = inst;
      this.group.add(inst);
    }

    // Simplified Elevated Station Platforms & Architectural Canopies (e.g., Ginza Line Shibuya 3F!)
    const platformGeoms: THREE.BufferGeometry[] = [];
    const canopyGeoms: THREE.BufferGeometry[] = [];
    for (const node of solved.stationNodes) {
      if (node.structure !== 'viaduct' || node.y < 5) continue;
      const angle = Math.atan2(node.dirZ, node.dirX);
      const length = node.isMajorHub ? 115 : 74;
      const width = node.isMajorHub ? 16 : 12;

      const plat = new THREE.BoxGeometry(length, 2.2, width);
      plat.rotateY(-angle);
      plat.translate(node.x, node.y - 0.6, node.z);
      platformGeoms.push(plat.toNonIndexed());

      const roof = new THREE.BoxGeometry(length * 0.9, 1.2, width + 2);
      roof.rotateY(-angle);
      roof.translate(node.x, node.y + 5.8, node.z);
      canopyGeoms.push(roof.toNonIndexed());
    }

    if (platformGeoms.length > 0) {
      const m = mergeGeometries(platformGeoms, false);
      platformGeoms.forEach((g) => g.dispose());
      if (m) {
        const mesh = new THREE.Mesh(m, this.stationPlatformMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = 'elevated-station-platforms';
        this.group.add(mesh);
      }
    }
    if (canopyGeoms.length > 0) {
      const m = mergeGeometries(canopyGeoms, false);
      canopyGeoms.forEach((g) => g.dispose());
      if (m) {
        const mesh = new THREE.Mesh(m, this.canopyMaterial);
        mesh.castShadow = true;
        mesh.name = 'elevated-station-canopies';
        this.group.add(mesh);
      }
    }
  }

  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
  }): void {
    const { visibleOperatorIds, visibleTiers, selectedLineId, fareSliceOnly, fareSliceLineIds } =
      params;
    const anyElevatedVisible = Boolean(visibleTiers['L+1'] || visibleTiers['L+2']);
    if (this.piersMesh) this.piersMesh.visible = anyElevatedVisible;

    for (const b of this.batches) {
      const visible =
        visibleOperatorIds.has(b.operatorId) &&
        Boolean(visibleTiers[b.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(b.lineId));
      b.group.visible = visible;
      if (!visible) continue;
      const isDimmed = selectedLineId !== null && b.lineId !== selectedLineId;
      b.deckMaterial.opacity = isDimmed ? 0.14 : 0.94;
      b.deckMaterial.depthWrite = !isDimmed;
    }
  }

  dispose(): void {
    for (const b of this.batches) {
      b.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      b.deckMaterial.dispose();
    }
    if (this.piersMesh) this.piersMesh.geometry.dispose();
    this.pierMaterial.dispose();
    this.stationPlatformMaterial.dispose();
    this.canopyMaterial.dispose();
  }
}
