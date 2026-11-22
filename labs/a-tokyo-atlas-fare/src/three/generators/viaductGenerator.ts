/**
 * Procedural 3D Elevated Viaduct, Grounded Twin-Column Concrete Piers & Elevated Station
 * Canopy Generator (P4: Physical Engineering Structures + 3-Tier Distance LOD).
 *
 * For all elevated railway spans (y > 2.0):
 *  - Sweeps continuous cast-concrete box-girder decks with side acoustic parapet walls
 *  - Places InstancedMesh RC twin-column portal bents extending strictly down to y = -1.25
 *    (zero floating piers above ground, parks, or canals!)
 *  - Builds articulated elevated station platforms with structural columns & sleek steel-glass canopies
 *  - Integrated into 3-tier distance LOD (piers cull > 2600m; full viaducts cull >= 4800m)
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

/**
 * Builds a reusable RC twin-column viaduct portal bent (unit Y height = 1 from 0..1, unit Z width = 1).
 */
function createTwinColumnPierGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Left & right reinforced-concrete columns (y: 0..0.92)
  const colL = new THREE.BoxGeometry(2.1, 0.92, 0.24);
  colL.translate(0, 0.46, -0.34);
  parts.push(colL.toNonIndexed());

  const colR = new THREE.BoxGeometry(2.1, 0.92, 0.24);
  colR.translate(0, 0.46, 0.34);
  parts.push(colR.toNonIndexed());

  // Top transverse cap beam supporting the viaduct box girder (y: 0.86..1.0)
  const cap = new THREE.BoxGeometry(2.5, 0.14, 1.02);
  cap.translate(0, 0.93, 0);
  parts.push(cap.toNonIndexed());

  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

interface ViaductBatch {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  tier: SchematicTierId;
  group: THREE.Group;
  deckMaterial: THREE.MeshStandardMaterial;
  filterVisible: boolean;
}

export class ViaductLayer {
  readonly group = new THREE.Group();
  private readonly batches: ViaductBatch[] = [];
  private readonly piersMesh: THREE.InstancedMesh | null = null;
  private readonly stationGroup = new THREE.Group();
  private readonly pierMaterial: THREE.MeshStandardMaterial;
  private readonly stationPlatformMaterial: THREE.MeshStandardMaterial;
  private readonly canopyMaterial: THREE.MeshStandardMaterial;

  private anyElevatedVisible = true;
  private showDecks = true;
  private showPiers = true;

  constructor(
    solved: SolvedRailwayNetwork3D,
    env: UrbanBaseEnvironment | null,
    clipPlanes: THREE.Plane[],
  ) {
    this.group.name = 'procedural-3d-viaducts';
    this.stationGroup.name = 'elevated-station-structures';
    this.group.add(this.stationGroup);

    this.pierMaterial = new THREE.MeshStandardMaterial({
      color: 0xa4abb4,
      roughness: 0.88,
      metalness: 0.06,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.stationPlatformMaterial = new THREE.MeshStandardMaterial({
      color: 0xcfd4da,
      roughness: 0.8,
      metalness: 0.06,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0x525e6d,
      roughness: 0.42,
      metalness: 0.36,
      envMapIntensity: 0.8,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    const avoidCells = new Set<string>();
    const cellKey = (x: number, z: number) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
    if (env) {
      for (const [ix, iz] of env.intersections) {
        avoidCells.add(cellKey(ix, iz));
      }
    }

    const piers: { x: number; z: number; h: number; angle: number; width: number }[] = [];
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

      const hw = seg.isShinkansen ? 6.0 : seg.isDoubleTrack ? 5.1 : 3.4;
      // Clean cast-concrete box-girder + acoustic noise barrier parapet walls (8-pt profile)
      const deckProfile: [number, number][] = [
        [-hw - 0.35, 1.05],
        [-hw - 0.35, -0.55],
        [-hw + 0.95, -2.1],
        [hw - 0.95, -2.1],
        [hw + 0.35, -0.55],
        [hw + 0.35, 1.05],
        [hw - 0.08, -0.2],
        [-hw + 0.08, -0.2],
      ];

      for (const run of runs) {
        const g = sweepProfileAlong3D(run, deckProfile, true);
        if (g) entry.geoms.push(g);

        // Grounded RC twin-column piers every 54m along elevated runs (down to y = -1.25!)
        let accum = 27;
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
            if (py >= 4.2 && !avoidCells.has(cellKey(px, pz)) && piers.length < 9_000) {
              // Extend bottom cleanly to y = -1.25 (metropolitan base plane) so zero piers float!
              piers.push({ x: px, z: pz, h: py - 1.65 + 1.25, angle, width: hw * 1.65 });
            }
            accum += 54;
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
        color: 0xbcc1c8,
        roughness: 0.85,
        metalness: 0.06,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
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
        filterVisible: true,
      });
    }

    // Instanced RC twin-column bridge piers anchored cleanly at y = -1.25!
    if (piers.length > 0) {
      const pierGeom = createTwinColumnPierGeometry();
      const inst = new THREE.InstancedMesh(pierGeom, this.pierMaterial, piers.length);
      inst.name = 'viaduct-piers-instanced';
      inst.castShadow = false;
      inst.receiveShadow = true;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < piers.length; i++) {
        const p = piers[i]!;
        dummy.position.set(p.x, -1.25, p.z);
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

    // Articulated Elevated Station Platforms + Canopy Support Columns + Overhanging Roofs
    const platformGeoms: THREE.BufferGeometry[] = [];
    const canopyGeoms: THREE.BufferGeometry[] = [];
    for (const node of solved.stationNodes) {
      if (node.structure !== 'viaduct' || node.y < 5) continue;
      const angle = Math.atan2(node.dirZ, node.dirX);
      const length = node.isMajorHub ? 115 : 74;
      const width = node.isMajorHub ? 15.5 : 11.8;

      const plat = new THREE.BoxGeometry(length, 2.0, width);
      plat.rotateY(-angle);
      plat.translate(node.x, node.y - 0.5, node.z);
      platformGeoms.push(plat.toNonIndexed());

      // Two slim structural canopy support columns along centerline
      for (const offset of [-length * 0.28, length * 0.28]) {
        const col = new THREE.BoxGeometry(1.4, 5.4, 1.4);
        col.translate(offset, 2.7, 0);
        col.rotateY(-angle);
        col.translate(node.x, node.y + 0.5, node.z);
        platformGeoms.push(col.toNonIndexed());
      }

      const roof = new THREE.BoxGeometry(length * 0.92, 0.95, width + 2.2);
      roof.rotateY(-angle);
      roof.translate(node.x, node.y + 5.7, node.z);
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
        this.stationGroup.add(mesh);
      }
    }
    if (canopyGeoms.length > 0) {
      const m = mergeGeometries(canopyGeoms, false);
      canopyGeoms.forEach((g) => g.dispose());
      if (m) {
        const mesh = new THREE.Mesh(m, this.canopyMaterial);
        mesh.castShadow = true;
        mesh.name = 'elevated-station-canopies';
        this.stationGroup.add(mesh);
      }
    }
  }

  updateLod(camDist: number): void {
    const nextDecks = camDist < 4800;
    const nextPiers = camDist < 2600;
    if (nextDecks !== this.showDecks || nextPiers !== this.showPiers) {
      this.showDecks = nextDecks;
      this.showPiers = nextPiers;
      this.refreshVisibility();
    }
  }

  private refreshVisibility(): void {
    if (this.piersMesh) {
      this.piersMesh.visible = this.anyElevatedVisible && this.showPiers;
    }
    this.stationGroup.visible = this.anyElevatedVisible && this.showDecks;
    for (const b of this.batches) {
      b.group.visible = b.filterVisible && this.showDecks;
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
    this.anyElevatedVisible = Boolean(visibleTiers['L+1'] || visibleTiers['L+2']);

    for (const b of this.batches) {
      b.filterVisible =
        visibleOperatorIds.has(b.operatorId) &&
        Boolean(visibleTiers[b.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(b.lineId));

      const isDimmed = selectedLineId !== null && b.lineId !== selectedLineId;
      const wantTrans = isDimmed;
      if (b.deckMaterial.transparent !== wantTrans) {
        b.deckMaterial.transparent = wantTrans;
        b.deckMaterial.needsUpdate = true;
      }
      b.deckMaterial.opacity = isDimmed ? 0.14 : 1.0;
      b.deckMaterial.depthWrite = !isDimmed;
    }

    this.refreshVisibility();
  }

  dispose(): void {
    for (const b of this.batches) {
      b.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      b.deckMaterial.dispose();
    }
    this.stationGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    if (this.piersMesh) this.piersMesh.geometry.dispose();
    this.pierMaterial.dispose();
    this.stationPlatformMaterial.dispose();
    this.canopyMaterial.dispose();
  }
}
