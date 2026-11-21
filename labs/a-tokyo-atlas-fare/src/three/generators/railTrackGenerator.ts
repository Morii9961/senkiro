/**
 * Procedural 3D Railway Track Generator (Roadbed + Twin/Double-Track Steel Rails + Sleepers + Line Identity Trim).
 *
 * Generates genuine 3D track geometry along solved 3D splines from `elevationSolver.ts`
 * rather than flat 2D colored lines. Also renders luminous 3D ribbons for JR Fare dual-path
 * highlighting (Actual Riding Path vs Statutory Billed Path).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  SchematicTierId,
  SolvedPoint3D,
  SolvedRailwayNetwork3D,
  SolvedSegment3D,
} from '../../domain/elevationSolver.js';
import type { FareQuote, SkId } from '../../domain/types.js';

/**
 * Sweeps a 2D cross-section profile `profile: [rightOffset, upOffset][]` along a 3D point chain.
 * Closed profile creates a clean extruded 3D prism along curves and vertical gradients.
 */
export function sweepProfileAlong3D(
  points: { x: number; y: number; z: number }[],
  profile: [number, number][],
  closed = true,
): THREE.BufferGeometry | null {
  if (points.length < 2 || profile.length < 2) return null;
  const ringLen = profile.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const cur = points[i]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;

    // Horizontal right-hand perpendicular normal in XZ plane (keeps roadbeds & rails level horizontally!)
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const hLen = Math.hypot(dx, dz) || 1;
    const rx = -dz / hLen;
    const rz = dx / hLen;

    for (let j = 0; j < ringLen; j++) {
      const [rightOff, upOff] = profile[j]!;
      positions.push(cur.x + rx * rightOff, cur.y + upOff, cur.z + rz * rightOff);
    }

    if (i > 0) {
      const aBase = (i - 1) * ringLen;
      const bBase = i * ringLen;
      const segs = closed ? ringLen : ringLen - 1;
      for (let j = 0; j < segs; j++) {
        const jNext = (j + 1) % ringLen;
        indices.push(aBase + j, bBase + j, bBase + jNext);
        indices.push(aBase + j, bBase + jNext, aBase + jNext);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

interface LineTrackBatch {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  tier: SchematicTierId;
  color: string;
  group: THREE.Group;
  accentMaterial: THREE.MeshStandardMaterial;
  roadbedMaterial: THREE.MeshStandardMaterial;
  railMaterial: THREE.MeshStandardMaterial;
  hitMeshes: THREE.Mesh[];
}

export class RailTrackLayer {
  readonly group = new THREE.Group();
  readonly fareHighlightGroup = new THREE.Group();
  readonly interactiveMeshes: THREE.Mesh[] = [];

  private readonly batches: LineTrackBatch[] = [];
  private readonly sleepersMesh: THREE.InstancedMesh | null = null;
  private readonly sleepersMaterial: THREE.MeshStandardMaterial;
  private readonly segmentMap = new Map<SkId<'segment'>, SolvedSegment3D>();
  private readonly clipPlanes: THREE.Plane[];

  constructor(solved: SolvedRailwayNetwork3D, clipPlanes: THREE.Plane[]) {
    this.clipPlanes = clipPlanes;
    this.group.name = 'procedural-3d-rail-tracks';
    this.fareHighlightGroup.name = 'fare-dual-path-3d';
    this.group.add(this.fareHighlightGroup);

    this.sleepersMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c534a,
      roughness: 0.92,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });

    for (const seg of solved.segments) {
      this.segmentMap.set(seg.segmentId, seg);
    }

    // Group solved segments by (primaryLineId, dominantTier) for clean per-line & per-tier visibility/highlight
    const grouped = new Map<string, SolvedSegment3D[]>();
    for (const seg of solved.segments) {
      const k = `${seg.primaryLineId}::${seg.dominantTier}`;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(seg);
    }

    // Collect sleeper transforms across Tokyo 23 wards (sampled cleanly every 14m to stay under ~32k instances)
    const sleeperTransforms: { x: number; y: number; z: number; angle: number; width: number }[] = [];

    for (const segs of grouped.values()) {
      const first = segs[0]!;
      const batchGroup = new THREE.Group();
      batchGroup.name = `track-${first.primaryLineId}-${first.dominantTier}`;

      const roadbedGeoms: THREE.BufferGeometry[] = [];
      const steelRailGeoms: THREE.BufferGeometry[] = [];
      const accentGeoms: THREE.BufferGeometry[] = [];

      for (const seg of segs) {
        const halfRoadbed = seg.isShinkansen ? 5.2 : seg.isDoubleTrack ? 4.4 : 2.6;
        // Trapezoidal ballast / slab roadbed profile
        const roadbedProfile: [number, number][] = [
          [-halfRoadbed - 0.7, -0.55],
          [-halfRoadbed, 0.05],
          [halfRoadbed, 0.05],
          [halfRoadbed + 0.7, -0.55],
        ];
        const rb = sweepProfileAlong3D(seg.points, roadbedProfile, true);
        if (rb) roadbedGeoms.push(rb);

        // Twin / Quad metallic steel rails along the 3D spline
        const railOffsets = seg.isDoubleTrack
          ? [-2.6, -1.2, 1.2, 2.6]
          : [-0.75, 0.75];
        for (const off of railOffsets) {
          const railProf: [number, number][] = [
            [off - 0.14, 0.05],
            [off - 0.10, 0.42],
            [off + 0.10, 0.42],
            [off + 0.14, 0.05],
          ];
          const rg = sweepProfileAlong3D(seg.points, railProf, true);
          if (rg) steelRailGeoms.push(rg);
        }

        // Crisp line-identity color edge strips on both sides of the trackbed (keeps railway lines unmistakable!)
        const stripProfL: [number, number][] = [
          [-halfRoadbed - 0.95, -0.15],
          [-halfRoadbed - 0.95, 0.55],
          [-halfRoadbed - 0.15, 0.55],
          [-halfRoadbed - 0.15, -0.15],
        ];
        const stripProfR: [number, number][] = [
          [halfRoadbed + 0.15, -0.15],
          [halfRoadbed + 0.15, 0.55],
          [halfRoadbed + 0.95, 0.55],
          [halfRoadbed + 0.95, -0.15],
        ];
        const sL = sweepProfileAlong3D(seg.points, stripProfL, true);
        const sR = sweepProfileAlong3D(seg.points, stripProfR, true);
        if (sL) accentGeoms.push(sL);
        if (sR) accentGeoms.push(sR);

        // Sample crossties/sleepers within central Tokyo 23 wards (within 13km of origin)
        const midPt = seg.points[Math.floor(seg.points.length / 2)]!;
        if (Math.hypot(midPt.x, midPt.z) < 13_000 && sleeperTransforms.length < 32_000) {
          this.sampleSleepers(seg.points, halfRoadbed * 1.75, 16, sleeperTransforms);
        }
      }

      const roadbedMaterial = new THREE.MeshStandardMaterial({
        color: 0x4b5159,
        roughness: 0.92,
        metalness: 0.06,
        transparent: true,
        opacity: 1.0,
        clippingPlanes: clipPlanes,
      });

      const railMaterial = new THREE.MeshStandardMaterial({
        color: 0xdbe4ee,
        roughness: 0.26,
        metalness: 0.82,
        transparent: true,
        opacity: 1.0,
        clippingPlanes: clipPlanes,
      });

      const accentColor = new THREE.Color(first.color);
      const accentMaterial = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: first.dominantTier.startsWith('L-') ? 0.32 : 0.14,
        roughness: 0.45,
        metalness: 0.12,
        transparent: true,
        opacity: 1.0,
        clippingPlanes: clipPlanes,
      });

      const hitMeshes: THREE.Mesh[] = [];

      if (roadbedGeoms.length > 0) {
        const m = mergeGeometries(roadbedGeoms, false);
        if (m) {
          const mesh = new THREE.Mesh(m, roadbedMaterial);
          mesh.receiveShadow = true;
          mesh.userData = { kind: 'line', lineId: first.primaryLineId };
          batchGroup.add(mesh);
          hitMeshes.push(mesh);
          this.interactiveMeshes.push(mesh);
        }
        roadbedGeoms.forEach((g) => g.dispose());
      }

      if (steelRailGeoms.length > 0) {
        const m = mergeGeometries(steelRailGeoms, false);
        if (m) {
          const mesh = new THREE.Mesh(m, railMaterial);
          batchGroup.add(mesh);
        }
        steelRailGeoms.forEach((g) => g.dispose());
      }

      if (accentGeoms.length > 0) {
        const m = mergeGeometries(accentGeoms, false);
        if (m) {
          const mesh = new THREE.Mesh(m, accentMaterial);
          mesh.userData = { kind: 'line', lineId: first.primaryLineId };
          batchGroup.add(mesh);
          hitMeshes.push(mesh);
          this.interactiveMeshes.push(mesh);
        }
        accentGeoms.forEach((g) => g.dispose());
      }

      this.group.add(batchGroup);
      this.batches.push({
        lineId: first.primaryLineId,
        operatorId: first.operatorId,
        tier: first.dominantTier,
        color: first.color,
        group: batchGroup,
        accentMaterial,
        roadbedMaterial,
        railMaterial,
        hitMeshes,
      });
    }

    // Build single InstancedMesh for all crossties / sleepers!
    if (sleeperTransforms.length > 0) {
      const sleeperGeom = new THREE.BoxGeometry(1, 0.24, 0.85);
      const inst = new THREE.InstancedMesh(
        sleeperGeom,
        this.sleepersMaterial,
        sleeperTransforms.length,
      );
      inst.name = 'track-sleepers-instanced';
      const dummy = new THREE.Object3D();
      for (let i = 0; i < sleeperTransforms.length; i++) {
        const s = sleeperTransforms[i]!;
        dummy.position.set(s.x, s.y + 0.08, s.z);
        dummy.rotation.set(0, -s.angle, 0);
        dummy.scale.set(s.width, 1, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.sleepersMesh = inst;
      this.group.add(inst);
    }
  }

  private sampleSleepers(
    pts: SolvedPoint3D[],
    width: number,
    spacingM: number,
    out: { x: number; y: number; z: number; angle: number; width: number }[],
  ): void {
    let accum = spacingM * 0.5;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen < 1) continue;
      const angle = Math.atan2(b.z - a.z, b.x - a.x) - Math.PI / 2;
      while (accum <= segLen) {
        const f = accum / segLen;
        out.push({
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          z: a.z + (b.z - a.z) * f,
          angle,
          width,
        });
        accum += spacingM;
      }
      accum -= segLen;
    }
  }

  /**
   * Updates visibility & highlighting for operator filter, selected RailLine, JR slice toggle, and Underground tiers.
   */
  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
  }): void {
    const { visibleOperatorIds, visibleTiers, selectedLineId, fareSliceOnly, fareSliceLineIds } =
      params;

    for (const batch of this.batches) {
      const visible =
        visibleOperatorIds.has(batch.operatorId) &&
        Boolean(visibleTiers[batch.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(batch.lineId));

      batch.group.visible = visible;
      if (!visible) continue;

      const isSelected = selectedLineId !== null && batch.lineId === selectedLineId;
      const isDimmed = selectedLineId !== null && !isSelected;

      const opacity = isDimmed ? 0.16 : 1.0;
      batch.accentMaterial.opacity = opacity;
      batch.roadbedMaterial.opacity = isDimmed ? 0.12 : 0.96;
      batch.railMaterial.opacity = isDimmed ? 0.14 : 1.0;
      batch.accentMaterial.emissiveIntensity = isSelected
        ? 0.72
        : batch.tier.startsWith('L-')
          ? 0.34
          : 0.14;
      batch.accentMaterial.depthWrite = !isDimmed;
      batch.roadbedMaterial.depthWrite = !isDimmed;
      batch.railMaterial.depthWrite = !isDimmed;
    }
  }

  /**
   * Renders luminous 3D elevated guide ribbons for Active JR Fare Actual vs Billed Paths!
   */
  setFareQuoteHighlight(quote: FareQuote | null): void {
    // Clear previous highlight meshes
    while (this.fareHighlightGroup.children.length > 0) {
      const ch = this.fareHighlightGroup.children.pop()!;
      if (ch instanceof THREE.Mesh) {
        ch.geometry.dispose();
        (ch.material as THREE.Material).dispose();
      }
    }
    if (!quote?.actualPath) return;

    const buildRibbon = (
      segIds: SkId<'segment'>[],
      colorHex: number,
      yLift: number,
      halfWidth: number,
    ) => {
      const geoms: THREE.BufferGeometry[] = [];
      const prof: [number, number][] = [
        [-halfWidth, yLift],
        [-halfWidth, yLift + 1.4],
        [halfWidth, yLift + 1.4],
        [halfWidth, yLift],
      ];
      for (const sid of segIds) {
        const seg = this.segmentMap.get(sid);
        if (!seg) continue;
        const g = sweepProfileAlong3D(seg.points, prof, true);
        if (g) geoms.push(g);
      }
      if (geoms.length === 0) return;
      const merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      if (!merged) return;

      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.85,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
        clippingPlanes: this.clipPlanes,
      });
      const mesh = new THREE.Mesh(merged, mat);
      this.fareHighlightGroup.add(mesh);
    };

    // Actual riding path (luminous orange, slightly lifted)
    buildRibbon(quote.actualPath.segmentIds, 0xf97316, 2.2, 3.6);
    // Statutory billed path (luminous cyan, layered clearly)
    if (quote.billedPath) {
      buildRibbon(quote.billedPath.segmentIds, 0x06b6d4, 4.0, 2.6);
    }
  }

  dispose(): void {
    for (const b of this.batches) {
      b.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      b.accentMaterial.dispose();
      b.roadbedMaterial.dispose();
      b.railMaterial.dispose();
    }
    if (this.sleepersMesh) {
      this.sleepersMesh.geometry.dispose();
    }
    this.sleepersMaterial.dispose();
    this.setFareQuoteHighlight(null);
  }
}
