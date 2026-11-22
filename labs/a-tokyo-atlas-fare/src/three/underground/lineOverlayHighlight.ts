/**
 * Independent Operating Line-Color Information Highlight Overlay.
 *
 * Strictly decoupled from physical tunnel & track geometry so that:
 *  - Default underground tunnels, slabs, rails, walkways & stations render in realistic neutral tones.
 *  - Operating line colors ONLY appear through this independent overlay layer when explicitly toggled
 *    ON or when a specific line is selected for inspection.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SchematicTierId } from '../../domain/elevationSolver.js';
import type { SkId } from '../../domain/types.js';
import type {
  ProfilePoint2D,
  TrackFrame3D,
  TunnelSegmentChunkSpec,
} from '../../domain/underground/tunnelTypes.js';

interface LineOverlayEntry {
  segmentId: SkId<'segment'>;
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  tier: SchematicTierId;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

function sweepOverlayRibbon(
  frames: readonly TrackFrame3D[],
  profile: readonly ProfilePoint2D[],
): THREE.BufferGeometry | null {
  if (frames.length < 2 || profile.length < 2) return null;
  const ringLen = profile.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    for (let j = 0; j < ringLen; j++) {
      const [rM, uM] = profile[j]!;
      positions.push(
        f.position.x + f.right.x * rM,
        f.position.y + uM,
        f.position.z + f.right.z * rM,
      );
    }
    if (i > 0) {
      const aBase = (i - 1) * ringLen;
      const bBase = i * ringLen;
      for (let j = 0; j < ringLen - 1; j++) {
        indices.push(aBase + j, bBase + j, bBase + j + 1);
        indices.push(aBase + j, bBase + j + 1, aBase + j + 1);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

export class LineOverlayHighlightLayer {
  readonly group = new THREE.Group();
  private readonly entries: LineOverlayEntry[] = [];
  private readonly materialsByLine = new Map<SkId<'line'>, THREE.MeshStandardMaterial>();
  private overlayEnabled = false;

  constructor(chunks: readonly TunnelSegmentChunkSpec[], clipPlanes: THREE.Plane[]) {
    this.group.name = 'underground-line-color-info-overlay';
    this.group.visible = false;

    for (const chunk of chunks) {
      let mat = this.materialsByLine.get(chunk.primaryLineId);
      if (!mat) {
        const col = new THREE.Color(chunk.lineColor);
        mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.72,
          roughness: 0.35,
          metalness: 0.1,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
          clippingPlanes: clipPlanes,
        });
        this.materialsByLine.set(chunk.primaryLineId, mat);
      }

      // Sleek hovering info guide strip along tunnel outer crown & subtle interior guide edge
      const bore =
        chunk.subSpans.find((s) => s.structureType !== 'transition_collar') ?? chunk.subSpans[0];
      const topY = bore
        ? bore.startSpec.slabTopOffsetM + bore.startSpec.innerHeightM + bore.startSpec.wallThicknessM + 0.35
        : 6.2;
      const halfW = 0.85;

      const geoms: THREE.BufferGeometry[] = [];
      const outerCrownBand = sweepOverlayRibbon(chunk.centerline, [
        [halfW, topY],
        [-halfW, topY],
      ]);
      if (outerCrownBand) geoms.push(outerCrownBand);

      // Subtle interior guide line along right walkway curb (y = +1.06m, strictly clear of rails/trains!)
      const innerGuideR = bore ? bore.startSpec.innerWidthM * 0.5 - 0.18 : 4.2;
      const innerBand = sweepOverlayRibbon(chunk.centerline, [
        [innerGuideR, 2.95],
        [innerGuideR, 3.18],
      ]);
      if (innerBand) geoms.push(innerBand);

      if (geoms.length === 0) continue;
      const merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      if (!merged) continue;

      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `line-overlay-${chunk.segmentId}`;
      mesh.visible = false;
      this.group.add(mesh);

      this.entries.push({
        segmentId: chunk.segmentId,
        lineId: chunk.primaryLineId,
        operatorId: chunk.operatorId,
        tier: chunk.tier,
        mesh,
        material: mat,
      });
    }
  }

  setOverlayEnabled(enabled: boolean): void {
    this.overlayEnabled = enabled;
  }

  isOverlayEnabled(): boolean {
    return this.overlayEnabled;
  }

  updateVisibility(params: {
    allowUnderground: boolean;
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
  }): void {
    const {
      allowUnderground,
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds,
    } = params;

    const showAny = allowUnderground && (this.overlayEnabled || selectedLineId !== null);
    this.group.visible = showAny;
    if (!showAny) return;

    for (const e of this.entries) {
      const passFilter =
        visibleOperatorIds.has(e.operatorId) &&
        Boolean(visibleTiers[e.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(e.lineId));
      const matchesHighlight =
        this.overlayEnabled || (selectedLineId !== null && e.lineId === selectedLineId);
      e.mesh.visible = passFilter && matchesHighlight;
    }
  }

  dispose(): void {
    for (const e of this.entries) {
      e.mesh.geometry.dispose();
    }
    for (const m of this.materialsByLine.values()) {
      m.dispose();
    }
  }
}
