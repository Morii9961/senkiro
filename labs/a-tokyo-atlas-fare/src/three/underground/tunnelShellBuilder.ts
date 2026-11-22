/**
 * True Dual-Surface Solid Tunnel Shell, Open Portal Headwall & Station Cavern Builder.
 *
 * Guarantees:
 *  - Every tunnel has BOTH a genuine inward-facing `FrontSide` inner lining surface AND an
 *    outward-facing `FrontSide` outer structural shell separated by real wall thickness (0.38-0.62m).
 *  - Zero transparent paper shells, zero `DoubleSide` hacks, zero inverted normals or holes.
 *  - Supports morphing `transition_collar` spans between any two 24-vertex cross-sections.
 *  - Splits upper roof/crown cap from lower walls+invert so `tunnel_roof_open` section cut toggles
 *    in O(1) without rebuilding geometry!
 *  - Builds open hollow portal arch headwalls + retaining wing walls so cameras & trains pass cleanly.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { interpolateProfile } from './domain/tunnelProfileSpecs.js';
import type {
  ProfilePoint2D,
  StationCavernSpec,
  TrackFrame3D,
  TunnelPortalSpec,
  TunnelSubSpan,
} from './domain/tunnelTypes.js';
import type { TunnelMaterialLibrary } from './tunnelMaterials.js';

/**
 * Evaluates a local 2D profile point [rightM, upM] into world space using the horizontal-right
 * tunnel frame (keeps tunnel invert and platforms strictly level horizontally while following grade).
 */
function profilePointToWorld(
  frame: TrackFrame3D,
  rightM: number,
  upM: number,
): [number, number, number] {
  return [
    frame.position.x + frame.right.x * rightM,
    frame.position.y + upM,
    frame.position.z + frame.right.z * rightM,
  ];
}

/**
 * Computes normalized perimeter U coordinates [0..1] around a 2D cross-section polygon
 * so concrete ring & formwork textures never stretch unevenly across wide vs narrow segments.
 */
function computePerimeterUs(profile: readonly ProfilePoint2D[]): number[] {
  const us: number[] = [0];
  let total = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    us.push(total);
  }
  const safeTotal = Math.max(1e-4, total);
  return us.map((v) => v / safeTotal);
}

/**
 * Sweeps a closed (or subset-filtered) 2D cross-section along a TrackFrame3D sequence.
 *
 * Winding order proof (Three.js right-handed, CCW front):
 *  - Profile vertices wind CCW in (R, U) plane; forward step is T with R x T = +U.
 *  - `inwardFacing = false` (OUTER shell): (a0, b0, b1) + (a0, b1, a1) -> strictly OUTWARD normal.
 *  - `inwardFacing = true`  (INNER lining): (a0, b1, b0) + (a0, a1, b1) -> strictly INWARD normal.
 */
export function sweepMorphingTunnelShell(
  samples: readonly TrackFrame3D[],
  startProfile: readonly ProfilePoint2D[],
  endProfile: readonly ProfilePoint2D[],
  options: {
    inwardFacing: boolean;
    /** Optional filter over ring edge index j: return true to emit quad j -> (j+1)%N */
    edgeFilter?: (j: number, pA: ProfilePoint2D, pB: ProfilePoint2D) => boolean;
    /** World meters per V texture repeat (e.g. 6.0m = 4 shield rings) */
    vMetersPerTile?: number;
    /** U tile repetitions around full tunnel perimeter */
    uPerimeterTiles?: number;
  },
): THREE.BufferGeometry | null {
  if (samples.length < 2 || startProfile.length < 3) return null;

  const ringLen = startProfile.length;
  const vMetersPerTile = options.vMetersPerTile ?? 6.0;
  const uPerimeterTiles = options.uPerimeterTiles ?? 3.0;
  const perimUs = computePerimeterUs(startProfile);

  const isMorphing = startProfile !== endProfile;
  const startDist = samples[0]!.distanceM;
  const totalSpan = Math.max(1e-4, samples[samples.length - 1]!.distanceM - startDist);

  // Use ringLen + 1 columns per slice so the seam vertex j = ringLen has clean UV = uPerimeterTiles
  const stride = ringLen + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Cache interpolated profiles per slice for edgeFilter checks
  const sliceProfiles: ProfilePoint2D[][] = [];

  for (let i = 0; i < samples.length; i++) {
    const fr = samples[i]!;
    const alpha = (fr.distanceM - startDist) / totalSpan;
    const prof = isMorphing
      ? interpolateProfile(startProfile, endProfile, alpha)
      : (startProfile as ProfilePoint2D[]);
    sliceProfiles.push(prof);

    const vCoord = fr.distanceM / vMetersPerTile;
    for (let j = 0; j <= ringLen; j++) {
      const pt = prof[j % ringLen]!;
      const [wx, wy, wz] = profilePointToWorld(fr, pt[0], pt[1]);
      positions.push(wx, wy, wz);
      uvs.push(perimUs[j]! * uPerimeterTiles, vCoord);
    }
  }

  for (let i = 1; i < samples.length; i++) {
    const aBase = (i - 1) * stride;
    const bBase = i * stride;
    const midProf = sliceProfiles[Math.floor(samples.length / 2)]!;

    for (let j = 0; j < ringLen; j++) {
      if (options.edgeFilter) {
        const pA = midProf[j]!;
        const pB = midProf[(j + 1) % ringLen]!;
        if (!options.edgeFilter(j, pA, pB)) continue;
      }
      const a0 = aBase + j;
      const a1 = aBase + j + 1;
      const b0 = bBase + j;
      const b1 = bBase + j + 1;

      if (options.inwardFacing) {
        indices.push(a0, b1, b0);
        indices.push(a0, a1, b1);
      } else {
        indices.push(a0, b0, b1);
        indices.push(a0, b1, a1);
      }
    }
  }

  if (indices.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

/**
 * Builds a solid annular concrete end-ring bridging `innerProfile` to `outerProfile` at a tunnel end,
 * so the wall thickness (0.38-0.62m) is completely watertight with zero open gap between shells.
 */
export function buildAnnularEndCap(
  frame: TrackFrame3D,
  innerProfile: readonly ProfilePoint2D[],
  outerProfile: readonly ProfilePoint2D[],
  faceForward: boolean,
): THREE.BufferGeometry {
  const n = Math.min(innerProfile.length, outerProfile.length);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j < n; j++) {
    const pi = innerProfile[j]!;
    const po = outerProfile[j]!;
    const [ix, iy, iz] = profilePointToWorld(frame, pi[0], pi[1]);
    const [ox, oy, oz] = profilePointToWorld(frame, po[0], po[1]);
    positions.push(ix, iy, iz, ox, oy, oz);
    uvs.push(j / n, 0, j / n, 0.25);
  }

  for (let j = 0; j < n; j++) {
    const jNext = (j + 1) % n;
    const i0 = j * 2;
    const o0 = j * 2 + 1;
    const i1 = jNext * 2;
    const o1 = jNext * 2 + 1;
    // Inner->Outer radial vector is outward; CCW step is E_ring.
    // (o0 - i0) x (i1 - i0) = Radial x E_ring = -T (points backward toward -tangent)!
    if (faceForward) {
      indices.push(i0, i1, o1);
      indices.push(i0, o1, o0);
    } else {
      indices.push(i0, o1, i1);
      indices.push(i0, o0, o1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

export interface DualSurfaceShellResult {
  innerLowerMesh: THREE.Mesh | null;
  innerRoofMesh: THREE.Mesh | null;
  outerLowerMesh: THREE.Mesh | null;
  outerRoofMesh: THREE.Mesh | null;
}

/**
 * Builds the complete dual-surface (inner lining + outer shell, roof-cutaway splittable)
 * meshes for a list of TunnelSubSpans belonging to one chunk.
 */
export function buildChunkShellMeshes(
  subSpans: readonly TunnelSubSpan[],
  materials: TunnelMaterialLibrary,
): DualSurfaceShellResult {
  const innerLowerGeoms: THREE.BufferGeometry[] = [];
  const innerRoofGeoms: THREE.BufferGeometry[] = [];
  const outerLowerGeoms: THREE.BufferGeometry[] = [];
  const outerRoofGeoms: THREE.BufferGeometry[] = [];

  let usesShieldMat = false;

  for (const span of subSpans) {
    const isShield =
      span.structureType === 'shield_single' || span.structureType === 'shield_double';
    if (isShield) usesShieldMat = true;

    const splitY = Math.min(span.startSpec.roofProfileSplitY, span.endSpec.roofProfileSplitY);
    const isRoofEdge = (_j: number, pA: ProfilePoint2D, pB: ProfilePoint2D) =>
      pA[1] >= splitY && pB[1] >= splitY;
    const isLowerEdge = (j: number, pA: ProfilePoint2D, pB: ProfilePoint2D) =>
      !isRoofEdge(j, pA, pB);

    const vTile = isShield ? 6.0 : 10.0;
    const uTile = isShield ? 3.0 : 2.5;

    const inLow = sweepMorphingTunnelShell(
      span.samples,
      span.startSpec.innerProfile,
      span.endSpec.innerProfile,
      { inwardFacing: true, edgeFilter: isLowerEdge, vMetersPerTile: vTile, uPerimeterTiles: uTile },
    );
    if (inLow) innerLowerGeoms.push(inLow);

    const inRoof = sweepMorphingTunnelShell(
      span.samples,
      span.startSpec.innerProfile,
      span.endSpec.innerProfile,
      { inwardFacing: true, edgeFilter: isRoofEdge, vMetersPerTile: vTile, uPerimeterTiles: uTile },
    );
    if (inRoof) innerRoofGeoms.push(inRoof);

    const outLow = sweepMorphingTunnelShell(
      span.samples,
      span.startSpec.outerProfile,
      span.endSpec.outerProfile,
      { inwardFacing: false, edgeFilter: isLowerEdge, vMetersPerTile: vTile, uPerimeterTiles: uTile },
    );
    if (outLow) outerLowerGeoms.push(outLow);

    const outRoof = sweepMorphingTunnelShell(
      span.samples,
      span.startSpec.outerProfile,
      span.endSpec.outerProfile,
      { inwardFacing: false, edgeFilter: isRoofEdge, vMetersPerTile: vTile, uPerimeterTiles: uTile },
    );
    if (outRoof) outerRoofGeoms.push(outRoof);
  }

  // Add annular end caps at the start of the first span and end of the last span
  if (subSpans.length > 0) {
    const first = subSpans[0]!;
    const last = subSpans[subSpans.length - 1]!;
    outerLowerGeoms.push(
      buildAnnularEndCap(
        first.samples[0]!,
        first.startSpec.innerProfile,
        first.startSpec.outerProfile,
        false,
      ),
    );
    outerLowerGeoms.push(
      buildAnnularEndCap(
        last.samples[last.samples.length - 1]!,
        last.endSpec.innerProfile,
        last.endSpec.outerProfile,
        true,
      ),
    );
  }

  const innerMat = usesShieldMat ? materials.shieldInnerMat : materials.boxInnerMat;

  const mergeToMesh = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    receiveShadow: boolean,
  ): THREE.Mesh | null => {
    if (geoms.length === 0) return null;
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = false;
    return mesh;
  };

  return {
    innerLowerMesh: mergeToMesh(innerLowerGeoms, innerMat, 'tunnel-inner-lower', true),
    innerRoofMesh: mergeToMesh(innerRoofGeoms, innerMat, 'tunnel-inner-roof', true),
    outerLowerMesh: mergeToMesh(outerLowerGeoms, materials.outerShellMat, 'tunnel-outer-lower', true),
    outerRoofMesh: mergeToMesh(outerRoofGeoms, materials.outerShellMat, 'tunnel-outer-roof', true),
  };
}

/**
 * Builds an OPEN hollow architectural concrete tunnel portal frame (headwall lintel + left/right piers
 * + flared retaining wing walls + open U-trough approach apron) so cameras and trains enter cleanly!
 */
export function buildOpenPortalHeadwallMesh(
  portal: TunnelPortalSpec,
  materials: TunnelMaterialLibrary,
): THREE.Mesh | null {
  const spec = portal.spec;
  const halfInnerW = spec.innerWidthM * 0.5;
  const innerH = spec.slabTopOffsetM + spec.innerHeightM;
  const pierW = 1.65;
  const headwallDepth = 2.6;
  const lintelH = 1.85;
  const totalW = (halfInnerW + pierW) * 2;

  const parts: THREE.BufferGeometry[] = [];

  // Left & Right structural portal piers strictly OUTSIDE inner clearance width!
  const pierH = innerH + lintelH + 0.6;
  const leftPier = new THREE.BoxGeometry(headwallDepth, pierH, pierW);
  leftPier.translate(0, pierH * 0.5 - 0.5, -(halfInnerW + pierW * 0.5));
  parts.push(leftPier.toNonIndexed());

  const rightPier = new THREE.BoxGeometry(headwallDepth, pierH, pierW);
  rightPier.translate(0, pierH * 0.5 - 0.5, halfInnerW + pierW * 0.5);
  parts.push(rightPier.toNonIndexed());

  // Top headwall lintel beam strictly ABOVE tunnel ceiling!
  const lintel = new THREE.BoxGeometry(headwallDepth + 0.4, lintelH, totalW + 0.8);
  lintel.translate(0, innerH + lintelH * 0.5, 0);
  parts.push(lintel.toNonIndexed());

  // Flared retaining wing walls extending 14m outward along the ramp approach (open sky above!)
  const wingLen = 14.0;
  const wingH = 3.4;
  const sign = -portal.intoTunnelSign; // outward toward surface/viaduct
  for (const side of [-1, 1]) {
    const wing = new THREE.BoxGeometry(wingLen, wingH, 0.85);
    wing.translate(sign * (wingLen * 0.5 + headwallDepth * 0.45), wingH * 0.5 - 0.4, side * (halfInnerW + 0.65));
    parts.push(wing.toNonIndexed());
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) return null;

  // Align local +X with frame tangent in XZ plane
  const angle = Math.atan2(portal.frame.tangent.z, portal.frame.tangent.x);
  merged.rotateY(-angle);
  merged.translate(portal.frame.position.x, portal.frame.position.y, portal.frame.position.z);

  const mesh = new THREE.Mesh(merged, materials.portalConcreteMat);
  mesh.name = `portal-${portal.id}`;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export interface BuiltStationCavernGroup {
  group: THREE.Group;
  roofGroup: THREE.Group;
  outerGroup: THREE.Group;
  pickMesh: THREE.Mesh | null;
  luminairePositions: THREE.Vector3[];
}

/**
 * Builds an enlarged, enterable underground station cavern with:
 *  - True dual-surface concrete cavern walls + splittable roof slab
 *  - Side or island architectural concrete platforms strictly outside train clearance
 *  - Yellow tactile platform safety edge strips & recessed dark aprons
 *  - Structural columns placed safely outside vehicle gauge
 *  - Ceiling luminaire housings + emissive light strips
 */
export function buildStationCavernGroup(
  cavern: StationCavernSpec,
  materials: TunnelMaterialLibrary,
): BuiltStationCavernGroup {
  const group = new THREE.Group();
  group.name = `station-cavern-${cavern.stationId}`;

  const roofGroup = new THREE.Group();
  roofGroup.name = 'station-cavern-roof';

  const outerGroup = new THREE.Group();
  outerGroup.name = 'station-cavern-outer';

  group.add(roofGroup, outerGroup);

  const halfLen = cavern.lengthM * 0.5;
  const t = cavern.tangent;
  const r = cavern.right;
  const c = cavern.center;
  const spec = cavern.spec;

  // Build straight 5-slice frame chain spanning [-halfLen, +halfLen]
  const slices = 6;
  const frames: TrackFrame3D[] = [];
  for (let i = 0; i <= slices; i++) {
    const s = -halfLen + (cavern.lengthM * i) / slices;
    frames.push({
      position: { x: c.x + t.x * s, y: c.y, z: c.z + t.z * s },
      tangent: { ...t },
      right: { ...r },
      up: { x: 0, y: 1, z: 0 },
      distanceM: (cavern.lengthM * i) / slices,
      grade: 0,
      structureType: cavern.layout,
      tier: cavern.tier,
      depthReliability: cavern.depthReliability,
      heightBasis: cavern.heightBasis,
    });
  }

  const splitY = spec.roofProfileSplitY;
  const isRoof = (_j: number, pA: ProfilePoint2D, pB: ProfilePoint2D) =>
    pA[1] >= splitY && pB[1] >= splitY;
  const isLower = (j: number, pA: ProfilePoint2D, pB: ProfilePoint2D) => !isRoof(j, pA, pB);

  // 1. Inner Lining (Lower + Roof)
  const innerLower = sweepMorphingTunnelShell(frames, spec.innerProfile, spec.innerProfile, {
    inwardFacing: true,
    edgeFilter: isLower,
    vMetersPerTile: 8.0,
    uPerimeterTiles: 4.0,
  });
  if (innerLower) {
    const m = new THREE.Mesh(innerLower, materials.stationInnerMat);
    m.receiveShadow = true;
    m.userData = { kind: 'station', stationId: cavern.stationId };
    group.add(m);
  }

  const innerRoof = sweepMorphingTunnelShell(frames, spec.innerProfile, spec.innerProfile, {
    inwardFacing: true,
    edgeFilter: isRoof,
    vMetersPerTile: 8.0,
    uPerimeterTiles: 4.0,
  });
  if (innerRoof) {
    const m = new THREE.Mesh(innerRoof, materials.stationInnerMat);
    m.receiveShadow = true;
    roofGroup.add(m);
  }

  // 2. Outer Structural Shell (Lower + Roof + Annular End Rings)
  const outerLowerGeoms: THREE.BufferGeometry[] = [];
  const oLow = sweepMorphingTunnelShell(frames, spec.outerProfile, spec.outerProfile, {
    inwardFacing: false,
    edgeFilter: isLower,
    vMetersPerTile: 8.0,
    uPerimeterTiles: 4.0,
  });
  if (oLow) outerLowerGeoms.push(oLow);
  outerLowerGeoms.push(
    buildAnnularEndCap(frames[0]!, spec.innerProfile, spec.outerProfile, false),
    buildAnnularEndCap(frames[frames.length - 1]!, spec.innerProfile, spec.outerProfile, true),
  );
  const outerLowerMerged = mergeGeometries(outerLowerGeoms, false);
  outerLowerGeoms.forEach((g) => g.dispose());
  let pickMesh: THREE.Mesh | null = null;
  if (outerLowerMerged) {
    const m = new THREE.Mesh(outerLowerMerged, materials.outerShellMat);
    m.receiveShadow = true;
    m.userData = { kind: 'station', stationId: cavern.stationId };
    outerGroup.add(m);
    pickMesh = m;
  }

  const outerRoof = sweepMorphingTunnelShell(frames, spec.outerProfile, spec.outerProfile, {
    inwardFacing: false,
    edgeFilter: isRoof,
    vMetersPerTile: 8.0,
    uPerimeterTiles: 4.0,
  });
  if (outerRoof) {
    const m = new THREE.Mesh(outerRoof, materials.outerShellMat);
    m.receiveShadow = true;
    roofGroup.add(m);
  }

  // 3. Architectural Platforms (flanking tracks, strictly outside train clearance!)
  const angle = Math.atan2(t.z, t.x);
  const platDeckGeoms: THREE.BufferGeometry[] = [];
  const platYellowGeoms: THREE.BufferGeometry[] = [];
  const platApronGeoms: THREE.BufferGeometry[] = [];
  const colGeoms: THREE.BufferGeometry[] = [];
  const lumHousingGeoms: THREE.BufferGeometry[] = [];
  const lumEmissiveGeoms: THREE.BufferGeometry[] = [];

  const placeLocalBox = (
    lenX: number,
    hY: number,
    wZ: number,
    localAlong: number,
    localUp: number,
    localRight: number,
  ): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(lenX, hY, wZ);
    g.translate(localAlong, localUp, localRight);
    g.rotateY(-angle);
    g.translate(c.x, c.y, c.z);
    return g.toNonIndexed();
  };

  for (const p of spec.platforms) {
    const minR = Math.min(p.innerRightM, p.outerRightM);
    const maxR = Math.max(p.innerRightM, p.outerRightM);
    const width = maxR - minR;
    const midR = (minR + maxR) * 0.5;
    const deckThick = 0.28;
    const apronH = Math.max(0.2, p.topUpM - deckThick - p.bottomUpM);

    // Top concrete terrazzo platform slab
    platDeckGeoms.push(
      placeLocalBox(cavern.lengthM - 0.4, deckThick, width, 0, p.topUpM - deckThick * 0.5, midR),
    );
    // Recessed dark platform under-wall apron (real subway overhang shadow!)
    const trackFacingSign = Math.abs(minR) < Math.abs(maxR) ? 1 : -1;
    const apronW = Math.max(0.4, width - 0.32);
    const apronMidR = midR + trackFacingSign * 0.16;
    platApronGeoms.push(
      placeLocalBox(
        cavern.lengthM - 0.6,
        apronH,
        apronW,
        0,
        p.bottomUpM + apronH * 0.5,
        apronMidR,
      ),
    );

    // Yellow tactile safety warning strip along track-facing edge(s)
    const addTactileEdge = (edgeRightM: number, inwardDir: number) => {
      platYellowGeoms.push(
        placeLocalBox(
          cavern.lengthM - 1.0,
          0.03,
          0.32,
          0,
          p.topUpM + 0.015,
          edgeRightM + inwardDir * 0.48,
        ),
      );
    };
    if (cavern.layout === 'station_island') {
      addTactileEdge(minR, 1);
      addTactileEdge(maxR, -1);
    } else {
      const trackEdge = Math.abs(minR) < Math.abs(maxR) ? minR : maxR;
      const inwardDir = trackEdge === minR ? 1 : -1;
      addTactileEdge(trackEdge, inwardDir);
    }

    // Structural platform support columns every 10m safely set back from platform edge
    const colRight =
      cavern.layout === 'station_island' ? 0 : midR + (midR > 0 ? 0.55 : -0.55);
    const colH = spec.slabTopOffsetM + spec.innerHeightM - p.topUpM;
    for (let s = -halfLen + 8; s <= halfLen - 8; s += 10) {
      colGeoms.push(placeLocalBox(0.55, colH, 0.55, s, p.topUpM + colH * 0.5, colRight));
    }
  }

  // Center slim structural columns between tracks for wide side-platform stations
  if (spec.hasCenterColumns) {
    const colH = spec.innerHeightM;
    for (let s = -halfLen + 7; s <= halfLen - 7; s += 9) {
      colGeoms.push(placeLocalBox(0.32, colH, 0.28, s, spec.slabTopOffsetM + colH * 0.5, 0));
    }
  }

  // Station ceiling linear luminaire bars + Light anchors for PointLight pool
  const luminairePositions: THREE.Vector3[] = [];
  for (let s = -halfLen + 6; s <= halfLen - 6; s += 9) {
    for (const [lumR, lumU] of spec.luminaireAnchors) {
      lumHousingGeoms.push(placeLocalBox(4.2, 0.14, 0.32, s, lumU + 0.04, lumR));
      lumEmissiveGeoms.push(placeLocalBox(3.9, 0.06, 0.24, s, lumU - 0.04, lumR));
    }
    // Center light sample point for the camera-following PointLight pool
    luminairePositions.push(
      new THREE.Vector3(
        c.x + t.x * s,
        c.y + spec.slabTopOffsetM + spec.innerHeightM - 0.85,
        c.z + t.z * s,
      ),
    );
  }

  const addMerged = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    parent: THREE.Group,
    name: string,
    asPick = false,
  ) => {
    if (geoms.length === 0) return;
    const mGeom = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!mGeom) return;
    const mesh = new THREE.Mesh(mGeom, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    if (asPick) {
      mesh.userData = { kind: 'station', stationId: cavern.stationId };
      if (!pickMesh) pickMesh = mesh;
    }
    parent.add(mesh);
  };

  addMerged(platDeckGeoms, materials.platformDeckMat, group, 'station-platform-decks', true);
  addMerged(platYellowGeoms, materials.platformEdgeYellowMat, group, 'station-tactile-strips');
  addMerged(platApronGeoms, materials.platformApronMat, group, 'station-platform-aprons');
  addMerged(colGeoms, materials.columnMat, group, 'station-columns');
  addMerged(lumHousingGeoms, materials.luminaireHousingMat, roofGroup, 'station-luminaire-housings');
  addMerged(lumEmissiveGeoms, materials.luminaireEmissiveMat, roofGroup, 'station-luminaire-emitters');

  return { group, roofGroup, outerGroup, pickMesh, luminairePositions };
}
