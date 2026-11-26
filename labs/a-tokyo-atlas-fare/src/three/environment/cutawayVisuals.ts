/**
 * Global Ghost-Surface Underground Alignment Guides (Scheme A — Mini Tokyo 3D Style).
 *
 * Replaces the legacy circular cutaway pit & glowing radar disc completely with
 * calm, razor-clean architectural vertical drop-lines and subtle surface street-level
 * pinpoint anchors linking each underground station platform (L-1..L-4) directly to
 * its exact ground-level intersection above.
 */

import * as THREE from 'three';

export interface UndergroundAnchorNode {
  x: number;
  y: number;
  z: number;
  color: string;
  isMajorHub: boolean;
}

export class CutawayPitVisuals {
  readonly group = new THREE.Group();

  private dropLines: THREE.LineSegments | null = null;
  private dropLinesMat: THREE.LineBasicMaterial;
  private surfaceDots: THREE.InstancedMesh | null = null;
  private surfaceDotGeo: THREE.CylinderGeometry;
  private surfaceDotMat: THREE.MeshBasicMaterial;
  private isDark: boolean;

  constructor(isDark: boolean, undergroundStations?: readonly UndergroundAnchorNode[]) {
    this.isDark = isDark;
    this.group.name = 'underground-ghost-alignment-guides';
    this.group.visible = false;

    this.dropLinesMat = new THREE.LineBasicMaterial({
      color: isDark ? 0x94a3b8 : 0x475569,
      transparent: true,
      opacity: isDark ? 0.36 : 0.34,
      depthWrite: false,
    });

    this.surfaceDotGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.55, 14);
    this.surfaceDotMat = new THREE.MeshBasicMaterial({
      color: isDark ? 0xe2e8f0 : 0xffffff,
      transparent: true,
      opacity: isDark ? 0.72 : 0.78,
      depthWrite: false,
    });

    if (undergroundStations && undergroundStations.length > 0) {
      this.setStationAnchors(undergroundStations);
    }
  }

  /**
   * Builds one batched LineSegments + one batched InstancedMesh linking every unique
   * underground station site vertically to surface ground y = 0.
   */
  setStationAnchors(stations: readonly UndergroundAnchorNode[]): void {
    if (this.dropLines) {
      this.group.remove(this.dropLines);
      this.dropLines.geometry.dispose();
      this.dropLines = null;
    }
    if (this.surfaceDots) {
      this.group.remove(this.surfaceDots);
      this.surfaceDots = null;
    }

    // Deduplicate stacked platforms at the same XZ cell, keeping the deepest platform so one clean line spans all levels
    const byCell = new Map<string, UndergroundAnchorNode>();
    for (const st of stations) {
      if (st.y >= -2.2) continue;
      const key = `${Math.round(st.x / 22)},${Math.round(st.z / 22)}`;
      const existing = byCell.get(key);
      if (!existing || st.y < existing.y) {
        byCell.set(key, st);
      }
    }

    const anchors = Array.from(byCell.values());
    if (anchors.length === 0) return;

    const linePositions = new Float32Array(anchors.length * 6);
    const dummy = new THREE.Object3D();
    const inst = new THREE.InstancedMesh(this.surfaceDotGeo, this.surfaceDotMat, anchors.length);
    inst.name = 'underground-surface-pinpoints';
    inst.frustumCulled = false;
    inst.renderOrder = 3;

    const tmpColor = new THREE.Color();
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i]!;
      const o = i * 6;
      linePositions[o] = a.x;
      linePositions[o + 1] = 0.25;
      linePositions[o + 2] = a.z;
      linePositions[o + 3] = a.x;
      linePositions[o + 4] = a.y;
      linePositions[o + 5] = a.z;

      const scale = a.isMajorHub ? 1.45 : 1.0;
      dummy.position.set(a.x, 0.35, a.z);
      dummy.scale.set(scale, 1.0, scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      tmpColor.set(a.color || '#38bdf8');
      inst.setColorAt(i, tmpColor);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeo, this.dropLinesMat);
    lines.name = 'underground-vertical-drop-lines';
    lines.frustumCulled = false;
    lines.renderOrder = 2;

    this.dropLines = lines;
    this.surfaceDots = inst;
    this.group.add(lines, inst);
  }

  update(
    active: boolean,
    _centerX: number,
    _centerZ: number,
    _radius: number,
    verticalExaggeration: number,
  ): void {
    this.group.visible = active;
    if (!active) return;

    const vScale = Math.max(1.0, Math.min(2.6, verticalExaggeration));
    if (this.dropLines) {
      this.dropLines.scale.set(1, vScale, 1);
    }
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.dropLinesMat.color.setHex(isDark ? 0x94a3b8 : 0x475569);
    this.dropLinesMat.opacity = isDark ? 0.38 : 0.34;
    this.surfaceDotMat.color.setHex(isDark ? 0xe2e8f0 : 0xffffff);
    this.surfaceDotMat.opacity = isDark ? 0.72 : 0.78;
  }

  dispose(): void {
    if (this.dropLines) {
      this.dropLines.geometry.dispose();
    }
    this.dropLinesMat.dispose();
    this.surfaceDotGeo.dispose();
    this.surfaceDotMat.dispose();
  }
}
