/**
 * Subterranean Interior Lighting Pool (Zero Per-Frame Allocation).
 *
 * Pre-allocates a small pool of warm-neutral PointLights (6 lights) that dynamically attach
 * to the real tunnel / station luminaire anchors closest to the camera whenever the camera
 * is underground or inspecting a tunnel interior.
 *
 * Produces realistic pool-of-light illumination on steel rails, concrete segment joints,
 * station columns, and platforms — neither overexposed nor pitch black — at minimal GPU cost.
 */

import * as THREE from 'three';

const POOL_SIZE = 6;

export class TunnelLightingSystem {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private activeCount = 0;
  private lastAnchorUpdateX = Infinity;
  private lastAnchorUpdateY = Infinity;
  private lastAnchorUpdateZ = Infinity;
  private lastActiveState = false;

  constructor() {
    this.group.name = 'underground-tunnel-lighting-pool';
    for (let i = 0; i < POOL_SIZE; i++) {
      // Physically balanced warm-neutral subway fluorescent/LED utility light (4000K)
      const pl = new THREE.PointLight(0xffe6c2, 0, 58, 1.45);
      pl.castShadow = false;
      pl.visible = false;
      this.lights.push(pl);
      this.group.add(pl);
    }
  }

  getActiveLightCount(): number {
    return this.activeCount;
  }

  /**
   * Updates the light pool to illuminate the tunnel/station space around `cameraPos`.
   * Re-sorts nearest anchors only when camera moves > 3m to keep per-frame CPU near zero.
   */
  update(
    cameraPos: THREE.Vector3,
    interiorActive: boolean,
    candidateAnchors: readonly THREE.Vector3[],
    verticalScale = 1.0,
  ): void {
    if (!interiorActive || candidateAnchors.length === 0) {
      if (this.lastActiveState) {
        for (const pl of this.lights) {
          pl.visible = false;
          pl.intensity = 0;
        }
        this.activeCount = 0;
        this.lastActiveState = false;
      }
      return;
    }

    const moved =
      Math.hypot(
        cameraPos.x - this.lastAnchorUpdateX,
        cameraPos.y - this.lastAnchorUpdateY,
        cameraPos.z - this.lastAnchorUpdateZ,
      ) > 3.0;

    if (!moved && this.lastActiveState) return;

    this.lastAnchorUpdateX = cameraPos.x;
    this.lastAnchorUpdateY = cameraPos.y;
    this.lastAnchorUpdateZ = cameraPos.z;
    this.lastActiveState = true;

    // Select the POOL_SIZE closest anchors within 115m of the camera (partial top-K selection)
    const maxDistSq = 115 * 115;
    const best: { anchor: THREE.Vector3; distSq: number }[] = [];

    for (let i = 0; i < candidateAnchors.length; i++) {
      const a = candidateAnchors[i]!;
      const dx = a.x - cameraPos.x;
      const dy = a.y * verticalScale - cameraPos.y;
      const dz = a.z - cameraPos.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > maxDistSq) continue;

      if (best.length < POOL_SIZE) {
        best.push({ anchor: a, distSq: dSq });
        best.sort((u, v) => u.distSq - v.distSq);
      } else if (dSq < best[POOL_SIZE - 1]!.distSq) {
        best[POOL_SIZE - 1] = { anchor: a, distSq: dSq };
        best.sort((u, v) => u.distSq - v.distSq);
      }
    }

    this.activeCount = best.length;
    for (let i = 0; i < POOL_SIZE; i++) {
      const pl = this.lights[i]!;
      const hit = best[i];
      if (hit) {
        pl.position.set(hit.anchor.x, hit.anchor.y * verticalScale, hit.anchor.z);
        // Stronger intensity for the 2 closest fixtures, gentle fill further down the tunnel
        const dist = Math.sqrt(hit.distSq);
        const falloff = THREE.MathUtils.clamp(1 - dist / 115, 0.25, 1.0);
        pl.intensity = 34 * falloff;
        pl.visible = true;
      } else {
        pl.visible = false;
        pl.intensity = 0;
      }
    }
  }

  dispose(): void {
    this.lights.forEach((l) => l.dispose());
  }
}
