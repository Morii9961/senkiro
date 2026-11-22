/**
 * Lightweight Schematic Simulated Train Proxy Layer (InstancedMesh, ~2 Draw Calls).
 *
 * Intentionally avoids building custom rolling-stock car bodies (owned by sibling worktree
 * `japanese_rolling_stock_assets`), instead rendering crisp directional spatial markers
 * on `SolvedRailwayNetwork3D` paths with Raycaster `instanceId` click picking.
 */

import * as THREE from 'three';
import type { TrainSimulationState } from './uxContracts.js';

const MAX_MARKERS = 32;

export class TrainMarkerLayer {
  readonly group = new THREE.Group();
  readonly interactiveMeshes: THREE.Object3D[] = [];

  private readonly bodyInst: THREE.InstancedMesh;
  private readonly stripeInst: THREE.InstancedMesh;
  private readonly selectionHalo: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly stripeMat: THREE.MeshStandardMaterial;
  private readonly haloMat: THREE.MeshStandardMaterial;

  private activeTrainIds: string[] = [];

  constructor(clipPlanes: THREE.Plane[]) {
    this.group.name = 'simulated-train-markers';

    // Sleek directional wedge/capsule proxy (length 22m along +Z, height 3.2m, width 3.2m)
    const bodyGeom = new THREE.BoxGeometry(3.2, 3.0, 22);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.34,
      metalness: 0.55,
      clippingPlanes: clipPlanes,
    });
    this.bodyInst = new THREE.InstancedMesh(bodyGeom, this.bodyMat, MAX_MARKERS);
    this.bodyInst.name = 'sim-train-proxy-bodies';
    this.bodyInst.count = 0;

    // Slim line-color identification roof/fascia stripe
    const stripeGeom = new THREE.BoxGeometry(3.36, 0.72, 20.8);
    this.stripeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.14,
      clippingPlanes: clipPlanes,
    });
    this.stripeInst = new THREE.InstancedMesh(stripeGeom, this.stripeMat, MAX_MARKERS);
    this.stripeInst.name = 'sim-train-proxy-stripes';
    this.stripeInst.count = 0;

    this.haloMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.75,
      wireframe: true,
      clippingPlanes: clipPlanes,
    });
    this.selectionHalo = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.8, 25), this.haloMat);
    this.selectionHalo.visible = false;
    this.selectionHalo.name = 'sim-train-selection-halo';

    this.group.add(this.bodyInst, this.stripeInst, this.selectionHalo);
    this.interactiveMeshes.push(this.bodyInst, this.stripeInst);
  }

  update(params: {
    trains: TrainSimulationState[];
    trainsVisible: boolean;
    allowUnderground: boolean;
    verticalExaggeration: number;
    selectedTrainId: string | null;
  }): void {
    const {
      trains,
      trainsVisible,
      allowUnderground,
      verticalExaggeration,
      selectedTrainId,
    } = params;

    if (!trainsVisible) {
      this.group.visible = false;
      this.activeTrainIds = [];
      return;
    }
    this.group.visible = true;

    const visibleList = trains
      .filter((t) => !t.isUnderground || allowUnderground)
      .slice(0, MAX_MARKERS);

    this.activeTrainIds = visibleList.map((t) => t.id);
    this.bodyInst.count = visibleList.length;
    this.stripeInst.count = visibleList.length;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const targetPt = new THREE.Vector3();
    let haloVisible = false;

    for (let i = 0; i < visibleList.length; i++) {
      const tr = visibleList[i]!;
      const y = tr.position.y * verticalExaggeration + 2.0;

      dummy.position.set(tr.position.x, y, tr.position.z);
      targetPt.set(
        tr.position.x + tr.tangent.x * 10,
        y + tr.tangent.y * verticalExaggeration * 10,
        tr.position.z + tr.tangent.z * 10,
      );
      dummy.lookAt(targetPt);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.bodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tr.position.x, y + 1.1, tr.position.z);
      dummy.updateMatrix();
      this.stripeInst.setMatrixAt(i, dummy.matrix);

      color.set(tr.color || '#38bdf8');
      this.stripeInst.setColorAt(i, color);

      if (tr.id === selectedTrainId) {
        this.selectionHalo.position.set(tr.position.x, y + 0.3, tr.position.z);
        this.selectionHalo.quaternion.copy(dummy.quaternion);
        haloVisible = true;
      }
    }

    this.selectionHalo.visible = haloVisible;
    this.bodyInst.instanceMatrix.needsUpdate = true;
    this.stripeInst.instanceMatrix.needsUpdate = true;
    if (this.stripeInst.instanceColor) this.stripeInst.instanceColor.needsUpdate = true;
    if (visibleList.length > 0) {
      this.bodyInst.computeBoundingSphere();
      this.stripeInst.computeBoundingSphere();
    }
  }

  resolveTrainHit(hit: THREE.Intersection): string | null {
    if (typeof hit.instanceId !== 'number') return null;
    return this.activeTrainIds[hit.instanceId] ?? null;
  }

  dispose(): void {
    this.bodyInst.geometry.dispose();
    this.stripeInst.geometry.dispose();
    this.selectionHalo.geometry.dispose();
    this.bodyMat.dispose();
    this.stripeMat.dispose();
    this.haloMat.dispose();
  }
}
