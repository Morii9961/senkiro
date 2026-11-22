/**
 * Procedural 3D Railway Track Generator (P4: Physical Engineering Structures + 3-Tier Distance LOD).
 *
 * Generates genuine 3D track geometry along solved 3D splines from `elevationSolver.ts`:
 *  - Surface tracks: sloped crushed-stone ballast embankment berm + concrete sleepers + steel rails
 *    + galvanized overhead catenary portal gantries (InstancedMesh) + slim line-color fascia stripe
 *  - Elevated / Underground tracks: precast concrete track slab + metallic steel rails + slim stripe
 *  - 3-Tier Distance LOD:
 *      * NEAR (< 1850m): full steel rails + concrete sleepers + overhead catenary gantries + roadbed + stripe
 *      * MID (1850m - 4800m): roadbed + slim fascia stripe (fine rails/sleepers/catenary culled!)
 *      * FAR (>= 4800m): crisp, ultra-lightweight metropolitan network skeleton ribbons (< 45k tris)
 *  - Smart surface-mode occlusion culling: underground L-1..L-4 tracks hidden when ground is opaque!
 *  - Luminous 3D dual-path ribbons for JR Fare calculation (Actual Riding Path vs Statutory Billed Path).
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

export type RailwayLodTier = 'near' | 'mid' | 'far';

/**
 * Sweeps a 2D cross-section profile `profile: [rightOffset, upOffset][]` along a 3D point chain.
 * Supports optional world-length UVs (for concrete tunnel lining rings) and skips degenerate micro-steps.
 */
export function sweepProfileAlong3D(
  points: { x: number; y: number; z: number }[],
  profile: [number, number][],
  closed = true,
  withUv = false,
): THREE.BufferGeometry | null {
  if (points.length < 2 || profile.length < 2) return null;

  // Compact near-duplicate consecutive vertices (< 1.2m) to prevent degenerate normals & excess tris
  const pts: { x: number; y: number; z: number }[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = pts[pts.length - 1]!;
    const cur = points[i]!;
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z) >= 1.2) {
      pts.push(cur);
    }
  }
  pts.push(points[points.length - 1]!);
  if (pts.length < 2) return null;

  const ringLen = profile.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let accumLen = 0;

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const cur = pts[i]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;

    if (i > 0) {
      accumLen += Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
    }

    // Horizontal right-hand perpendicular normal in XZ plane (keeps roadbeds & rails level horizontally!)
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const hLen = Math.hypot(dx, dz) || 1;
    const rx = -dz / hLen;
    const rz = dx / hLen;

    for (let j = 0; j < ringLen; j++) {
      const [rightOff, upOff] = profile[j]!;
      positions.push(cur.x + rx * rightOff, cur.y + upOff, cur.z + rz * rightOff);
      if (withUv) {
        uvs.push(j / Math.max(1, ringLen - (closed ? 0 : 1)), accumLen * 0.12);
      }
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
  if (withUv) {
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

/**
 * Builds a single reusable galvanized-steel overhead catenary portal gantry geometry
 * (unit Z width = 1, scaled per instance to match double/single track corridor width).
 */
function createCatenaryPortalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Left & right steel masts (at z = ±0.5, scaled by track width)
  const mastL = new THREE.BoxGeometry(0.45, 7.6, 0.045);
  mastL.translate(0, 3.8, -0.5);
  parts.push(mastL.toNonIndexed());

  const mastR = new THREE.BoxGeometry(0.45, 7.6, 0.045);
  mastR.translate(0, 3.8, 0.5);
  parts.push(mastR.toNonIndexed());

  // Overhead truss crossbar spanning across tracks
  const crossTop = new THREE.BoxGeometry(0.38, 0.42, 1.06);
  crossTop.translate(0, 7.25, 0);
  parts.push(crossTop.toNonIndexed());

  const crossLower = new THREE.BoxGeometry(0.22, 0.22, 1.02);
  crossLower.translate(0, 6.25, 0);
  parts.push(crossLower.toNonIndexed());

  // Center insulator droppers down toward contact wire level (~5.4m)
  const dropL = new THREE.BoxGeometry(0.14, 1.1, 0.025);
  dropL.translate(0, 5.75, -0.2);
  parts.push(dropL.toNonIndexed());

  const dropR = new THREE.BoxGeometry(0.14, 1.1, 0.025);
  dropR.translate(0, 5.75, 0.2);
  parts.push(dropR.toNonIndexed());

  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

interface LineTrackBatch {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  tier: SchematicTierId;
  isUnderground: boolean;
  color: string;
  detailedGroup: THREE.Group;
  railsMesh: THREE.Mesh | null;
  skeletonMesh: THREE.Mesh | null;
  accentMaterial: THREE.MeshStandardMaterial;
  roadbedMaterial: THREE.MeshStandardMaterial;
  railMaterial: THREE.MeshStandardMaterial;
  skeletonMaterial: THREE.MeshStandardMaterial;
  filterVisible: boolean;
  hitMeshes: THREE.Mesh[];
}

export class RailTrackLayer {
  readonly group = new THREE.Group();
  readonly fareHighlightGroup = new THREE.Group();
  readonly interactiveMeshes: THREE.Mesh[] = [];

  private readonly batches: LineTrackBatch[] = [];
  private readonly sleepersMesh: THREE.InstancedMesh | null = null;
  private readonly catenaryMesh: THREE.InstancedMesh | null = null;
  private readonly sleepersMaterial: THREE.MeshStandardMaterial;
  private readonly catenaryMaterial: THREE.MeshStandardMaterial;
  private readonly segmentMap = new Map<SkId<'segment'>, SolvedSegment3D>();
  private readonly clipPlanes: THREE.Plane[];

  private currentLod: RailwayLodTier = 'near';
  private undergroundActive = false;
  private clipEnabled = false;
  private anySurfaceOrElevVisible = true;

  constructor(solved: SolvedRailwayNetwork3D, clipPlanes: THREE.Plane[]) {
    this.clipPlanes = clipPlanes;
    this.group.name = 'procedural-3d-rail-tracks';
    this.fareHighlightGroup.name = 'fare-dual-path-3d';
    this.group.add(this.fareHighlightGroup);

    this.sleepersMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a857c,
      roughness: 0.92,
      metalness: 0.04,
      clippingPlanes: clipPlanes,
    });

    this.catenaryMaterial = new THREE.MeshStandardMaterial({
      color: 0x7b8591,
      roughness: 0.45,
      metalness: 0.65,
      clippingPlanes: clipPlanes,
    });

    for (const seg of solved.segments) {
      this.segmentMap.set(seg.segmentId, seg);
    }

    const grouped = new Map<string, SolvedSegment3D[]>();
    for (const seg of solved.segments) {
      const k = `${seg.primaryLineId}::${seg.dominantTier}`;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(seg);
    }

    const sleeperTransforms: { x: number; y: number; z: number; angle: number; width: number }[] = [];
    const catenaryTransforms: { x: number; y: number; z: number; angle: number; width: number }[] = [];

    for (const segs of grouped.values()) {
      const first = segs[0]!;
      const isUnderground = first.dominantTier.startsWith('L-');
      const isSurface = first.dominantTier === 'L0';
      const batchGroup = new THREE.Group();
      batchGroup.name = `track-${first.primaryLineId}-${first.dominantTier}`;

      const roadbedGeoms: THREE.BufferGeometry[] = [];
      const steelRailGeoms: THREE.BufferGeometry[] = [];
      const accentGeoms: THREE.BufferGeometry[] = [];
      const skeletonGeoms: THREE.BufferGeometry[] = [];

      for (const seg of segs) {
        const halfRoadbed = seg.isShinkansen ? 5.2 : seg.isDoubleTrack ? 4.4 : 2.6;

        // Open-bottom trapezoidal ballast berm (surface) or precast slab (viaduct/tunnel)
        // Ordered right-to-left (+R -> -R) so cross(forward, -R) points strictly +Y UPWARD!
        const roadbedProfile: [number, number][] = isSurface
          ? [
              [halfRoadbed + 1.15, -0.55],
              [halfRoadbed, 0.32],
              [-halfRoadbed, 0.32],
              [-halfRoadbed - 1.15, -0.55],
            ]
          : [
              [halfRoadbed + 0.35, -0.25],
              [halfRoadbed, 0.12],
              [-halfRoadbed, 0.12],
              [-halfRoadbed - 0.35, -0.25],
            ];
        const rb = sweepProfileAlong3D(seg.points, roadbedProfile, false);
        if (rb) roadbedGeoms.push(rb);

        // P7: Only sweep fine 4-rail steel tubes inside Tokyo 23 wards (< 16km); distant regional corridors
        // beyond 16km keep crisp ballast roadbed + slim fascia stripe + Far network skeleton!
        const midPt = seg.points[Math.floor(seg.points.length / 2)]!;
        const inCoreMetro = Math.hypot(midPt.x, midPt.z) < 16_000;
        if (inCoreMetro) {
          const railYBase = isSurface ? 0.32 : 0.12;
          const railOffsets = seg.isDoubleTrack ? [-2.55, -1.15, 1.15, 2.55] : [-0.72, 0.72];
          for (const off of railOffsets) {
            const railProf: [number, number][] = [
              [off + 0.15, railYBase],
              [off, railYBase + 0.36],
              [off - 0.15, railYBase],
            ];
            const rg = sweepProfileAlong3D(seg.points, railProf, false);
            if (rg) steelRailGeoms.push(rg);
          }
        }

        // Restrained slim line-color architectural fascia stripe along roadbed shoulders (+R -> -R upward!)
        const stripeY0 = isSurface ? 0.12 : 0.02;
        const stripeY1 = isSurface ? 0.52 : 0.44;
        const stripProfL: [number, number][] = [
          [-halfRoadbed - 0.06, stripeY1],
          [-halfRoadbed - 0.52, stripeY1],
          [-halfRoadbed - 0.52, stripeY0],
        ];
        const stripProfR: [number, number][] = [
          [halfRoadbed + 0.52, stripeY0],
          [halfRoadbed + 0.52, stripeY1],
          [halfRoadbed + 0.06, stripeY1],
        ];
        const sL = sweepProfileAlong3D(seg.points, stripProfL, false);
        const sR = sweepProfileAlong3D(seg.points, stripProfR, false);
        if (sL) accentGeoms.push(sL);
        if (sR) accentGeoms.push(sR);

        // Far-LOD ultra-lightweight metropolitan network skeleton ribbon (+R -> -R upward!)
        const skelW = seg.isShinkansen ? 9.5 : seg.isDoubleTrack ? 7.5 : 5.5;
        const skelProf: [number, number][] = [
          [skelW, 1.6],
          [-skelW, 1.6],
        ];
        const sk = sweepProfileAlong3D(seg.points, skelProf, false);
        if (sk) skeletonGeoms.push(sk);

        // Sample sleepers & overhead catenary gantries on surface/elevated tracks within 12km of Tokyo center
        if (!isUnderground && Math.hypot(midPt.x, midPt.z) < 12_500) {
          if (sleeperTransforms.length < 18_000) {
            this.sampleAlongPolyline(
              seg.points,
              halfRoadbed * 1.7,
              18,
              -1.5,
              sleeperTransforms,
            );
          }
          if (catenaryTransforms.length < 4_200) {
            this.sampleAlongPolyline(
              seg.points,
              halfRoadbed * 2.25,
              85,
              -0.5,
              catenaryTransforms,
            );
          }
        }
      }

      // Crushed-stone ballast on surface; realistic dark precast slab in tunnels & viaducts
      const roadbedMaterial = new THREE.MeshStandardMaterial({
        color: isSurface ? 0x69645b : isUnderground ? 0x646b75 : 0x7c838d,
        roughness: 0.92,
        metalness: 0.04,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        clippingPlanes: clipPlanes,
      });

      const railMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4dde6,
        roughness: 0.22,
        metalness: 0.86,
        envMapIntensity: 1.2,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        clippingPlanes: clipPlanes,
      });

      // Restrained architectural line color: slim identification band only (never neon pipes underground!)
      const baseColor = new THREE.Color(first.color);
      const restrainedColor = baseColor
        .clone()
        .lerp(new THREE.Color(0x525862), isUnderground ? 0.24 : 0.16);

      const accentMaterial = new THREE.MeshStandardMaterial({
        color: restrainedColor,
        emissive: baseColor,
        emissiveIntensity: isUnderground ? 0.08 : 0.05,
        roughness: 0.52,
        metalness: 0.1,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        clippingPlanes: clipPlanes,
      });

      const skeletonMaterial = new THREE.MeshStandardMaterial({
        color: baseColor.clone().lerp(new THREE.Color(0x475569), isUnderground ? 0.42 : 0.14),
        emissive: baseColor,
        emissiveIntensity: isUnderground ? 0.10 : 0.14,
        roughness: 0.6,
        metalness: 0.08,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
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

      let railsMesh: THREE.Mesh | null = null;
      if (steelRailGeoms.length > 0) {
        const m = mergeGeometries(steelRailGeoms, false);
        if (m) {
          railsMesh = new THREE.Mesh(m, railMaterial);
          batchGroup.add(railsMesh);
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

      let skeletonMesh: THREE.Mesh | null = null;
      if (skeletonGeoms.length > 0) {
        const m = mergeGeometries(skeletonGeoms, false);
        if (m) {
          skeletonMesh = new THREE.Mesh(m, skeletonMaterial);
          skeletonMesh.visible = false;
          skeletonMesh.userData = { kind: 'line', lineId: first.primaryLineId };
          this.group.add(skeletonMesh);
          hitMeshes.push(skeletonMesh);
          this.interactiveMeshes.push(skeletonMesh);
        }
        skeletonGeoms.forEach((g) => g.dispose());
      }

      this.group.add(batchGroup);
      this.batches.push({
        lineId: first.primaryLineId,
        operatorId: first.operatorId,
        tier: first.dominantTier,
        isUnderground,
        color: first.color,
        detailedGroup: batchGroup,
        railsMesh,
        skeletonMesh,
        accentMaterial,
        roadbedMaterial,
        railMaterial,
        skeletonMaterial,
        filterVisible: true,
        hitMeshes,
      });
    }

    // Batched InstancedMesh for concrete sleepers (visible only in NEAR LOD!)
    if (sleeperTransforms.length > 0) {
      const sleeperGeom = new THREE.BoxGeometry(1, 0.22, 0.72);
      const inst = new THREE.InstancedMesh(
        sleeperGeom,
        this.sleepersMaterial,
        sleeperTransforms.length,
      );
      inst.name = 'track-sleepers-instanced';
      const dummy = new THREE.Object3D();
      for (let i = 0; i < sleeperTransforms.length; i++) {
        const s = sleeperTransforms[i]!;
        dummy.position.set(s.x, s.y + 0.14, s.z);
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

    // Batched InstancedMesh for galvanized overhead catenary portal gantries (visible in NEAR LOD!)
    if (catenaryTransforms.length > 0) {
      const catGeom = createCatenaryPortalGeometry();
      const inst = new THREE.InstancedMesh(
        catGeom,
        this.catenaryMaterial,
        catenaryTransforms.length,
      );
      inst.name = 'track-catenary-portals-instanced';
      const dummy = new THREE.Object3D();
      for (let i = 0; i < catenaryTransforms.length; i++) {
        const c = catenaryTransforms[i]!;
        dummy.position.set(c.x, c.y, c.z);
        // Catenary crossbeam runs along local Z; rotate so local X aligns with track tangent!
        dummy.rotation.set(0, -(c.angle + Math.PI / 2), 0);
        dummy.scale.set(1, 1, c.width);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.catenaryMesh = inst;
      this.group.add(inst);
    }
  }

  private sampleAlongPolyline(
    pts: SolvedPoint3D[],
    width: number,
    spacingM: number,
    minY: number,
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
        const y = a.y + (b.y - a.y) * f;
        if (y >= minY) {
          out.push({
            x: a.x + (b.x - a.x) * f,
            y,
            z: a.z + (b.z - a.z) * f,
            angle,
            width,
          });
        }
        accum += spacingM;
      }
      accum -= segLen;
    }
  }

  /**
   * 3-Tier Distance LOD switcher:
   *  - NEAR (< 1850m): full steel rails + sleepers + catenary gantries + roadbed + stripe
   *  - MID (1850m..4800m): roadbed + slim fascia stripe only
   *  - FAR (>= 4800m): crisp metropolitan network skeleton ribbons only
   */
  updateLod(camDist: number): RailwayLodTier {
    const nextLod: RailwayLodTier =
      camDist < 1850 ? 'near' : camDist < 4800 ? 'mid' : 'far';
    if (nextLod !== this.currentLod) {
      this.currentLod = nextLod;
      this.refreshBatchVisibility();
    }
    return this.currentLod;
  }

  private refreshBatchVisibility(): void {
    const showDetailed = this.currentLod !== 'far';
    const showNearProps = this.currentLod === 'near';
    const showSkeleton = this.currentLod === 'far';
    const allowUnderground = this.undergroundActive || this.clipEnabled;

    if (this.sleepersMesh) {
      this.sleepersMesh.visible = showNearProps && this.anySurfaceOrElevVisible;
    }
    if (this.catenaryMesh) {
      this.catenaryMesh.visible = showNearProps && this.anySurfaceOrElevVisible;
    }

    for (const batch of this.batches) {
      const visibleNow =
        batch.filterVisible && (!batch.isUnderground || allowUnderground);
      batch.detailedGroup.visible = visibleNow && showDetailed;
      if (batch.railsMesh) {
        batch.railsMesh.visible = showNearProps;
      }
      if (batch.skeletonMesh) {
        batch.skeletonMesh.visible = visibleNow && showSkeleton;
      }
    }
  }

  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
    undergroundActive?: boolean;
    clipEnabled?: boolean;
  }): void {
    const {
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds,
      undergroundActive = false,
      clipEnabled = false,
    } = params;

    this.undergroundActive = undergroundActive;
    this.clipEnabled = clipEnabled;
    this.anySurfaceOrElevVisible = Boolean(
      visibleTiers.L0 || visibleTiers['L+1'] || visibleTiers['L+2'],
    );

    const setMatFade = (mat: THREE.MeshStandardMaterial, dimmed: boolean, targetOpacity: number) => {
      const wantTrans = dimmed || targetOpacity < 0.99;
      if (mat.transparent !== wantTrans) {
        mat.transparent = wantTrans;
        mat.needsUpdate = true;
      }
      mat.opacity = targetOpacity;
      mat.depthWrite = !wantTrans;
    };

    for (const batch of this.batches) {
      batch.filterVisible =
        visibleOperatorIds.has(batch.operatorId) &&
        Boolean(visibleTiers[batch.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(batch.lineId));

      const isSelected = selectedLineId !== null && batch.lineId === selectedLineId;
      const isDimmed = selectedLineId !== null && !isSelected;

      setMatFade(batch.accentMaterial, isDimmed, isDimmed ? 0.16 : 1.0);
      setMatFade(batch.roadbedMaterial, isDimmed, isDimmed ? 0.12 : 1.0);
      setMatFade(batch.railMaterial, isDimmed, isDimmed ? 0.14 : 1.0);
      setMatFade(batch.skeletonMaterial, isDimmed, isDimmed ? 0.16 : 1.0);

      batch.accentMaterial.emissiveIntensity = isSelected
        ? 0.72
        : batch.isUnderground
          ? 0.08
          : 0.05;
      batch.skeletonMaterial.emissiveIntensity = isSelected
        ? 0.72
        : batch.isUnderground
          ? 0.10
          : 0.14;
    }

    this.refreshBatchVisibility();
  }

  /**
   * Renders luminous 3D elevated guide ribbons for Active JR Fare Actual vs Billed Paths!
   */
  setFareQuoteHighlight(quote: FareQuote | null): void {
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
        [-halfWidth, yLift + 1.3],
        [halfWidth, yLift + 1.3],
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
      this.fareHighlightGroup.add(new THREE.Mesh(merged, mat));
    };

    buildRibbon(quote.actualPath.segmentIds, 0xf97316, 2.2, 3.6);
    if (quote.billedPath) {
      buildRibbon(quote.billedPath.segmentIds, 0x06b6d4, 4.0, 2.6);
    }
  }

  dispose(): void {
    for (const b of this.batches) {
      b.detailedGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      b.skeletonMesh?.geometry.dispose();
      b.accentMaterial.dispose();
      b.roadbedMaterial.dispose();
      b.railMaterial.dispose();
      b.skeletonMaterial.dispose();
    }
    this.sleepersMesh?.geometry.dispose();
    this.catenaryMesh?.geometry.dispose();
    this.sleepersMaterial.dispose();
    this.catenaryMaterial.dispose();
    this.setFareQuoteHighlight(null);
  }
}
