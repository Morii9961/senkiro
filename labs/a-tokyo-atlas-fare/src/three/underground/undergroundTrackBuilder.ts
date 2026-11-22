/**
 * Realistic Neutral Underground Track, Slab Track, Inspection Walkways, Cable Troughs,
 * Power Supply (Third Rail / Rigid Overhead Catenary) & Instanced Wayside Equipment Builder.
 *
 * All structural & railway materials remain strictly neutral realistic colors.
 * Operating line colors are NEVER baked here (handled solely by `lineOverlayHighlight.ts`).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  ProfilePoint2D,
  TrackFrame3D,
  TunnelSegmentChunkSpec,
} from './domain/tunnelTypes.js';
import type { TunnelMaterialLibrary } from './tunnelMaterials.js';

/**
 * Sweeps an open or closed 2D profile [rightM, upM] along a TrackFrame3D chain with outward/upward FrontSide normals.
 */
function sweepLinearProfile(
  frames: readonly TrackFrame3D[],
  profile: readonly ProfilePoint2D[],
  closed: boolean,
  vMetersPerTile = 8.0,
): THREE.BufferGeometry | null {
  if (frames.length < 2 || profile.length < 2) return null;

  const ringLen = profile.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    const v = f.distanceM / vMetersPerTile;
    for (let j = 0; j < ringLen; j++) {
      const [rM, uM] = profile[j]!;
      positions.push(
        f.position.x + f.right.x * rM,
        f.position.y + uM,
        f.position.z + f.right.z * rM,
      );
      uvs.push(j / Math.max(1, ringLen - 1), v);
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
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

interface SampleTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

function sampleTransformsAlongFrames(
  frames: readonly TrackFrame3D[],
  spacingM: number,
  startOffsetM = 0,
  endTrimM = 0,
): { frame: TrackFrame3D; yaw: number; pitch: number }[] {
  if (frames.length < 2) return [];
  const totalLen = frames[frames.length - 1]!.distanceM;
  const maxD = totalLen - endTrimM;
  const out: { frame: TrackFrame3D; yaw: number; pitch: number }[] = [];

  let nextD = Math.max(startOffsetM, spacingM * 0.5);
  let idx = 0;

  while (nextD <= maxD) {
    while (idx < frames.length - 2 && frames[idx + 1]!.distanceM < nextD) idx++;
    const a = frames[idx]!;
    const b = frames[idx + 1]!;
    const span = Math.max(1e-5, b.distanceM - a.distanceM);
    const f = Math.max(0, Math.min(1, (nextD - a.distanceM) / span));

    const tx = a.tangent.x + (b.tangent.x - a.tangent.x) * f;
    const ty = a.tangent.y + (b.tangent.y - a.tangent.y) * f;
    const tz = a.tangent.z + (b.tangent.z - a.tangent.z) * f;
    const hLen = Math.hypot(tx, tz) || 1;
    const rx = a.right.x + (b.right.x - a.right.x) * f;
    const rz = a.right.z + (b.right.z - a.right.z) * f;
    const rLen = Math.hypot(rx, rz) || 1;

    const frame: TrackFrame3D = {
      position: {
        x: a.position.x + (b.position.x - a.position.x) * f,
        y: a.position.y + (b.position.y - a.position.y) * f,
        z: a.position.z + (b.position.z - a.position.z) * f,
      },
      tangent: { x: tx / hLen, y: ty, z: tz / hLen },
      right: { x: rx / rLen, y: 0, z: rz / rLen },
      up: { x: 0, y: 1, z: 0 },
      distanceM: nextD,
      grade: ty / hLen,
      structureType: a.structureType,
      tier: a.tier,
      depthReliability: a.depthReliability,
      heightBasis: a.heightBasis,
    };

    // Local +X aligns with horizontal tangent (tx, tz); local +Z aligns with right (-tz, tx)
    const yaw = -Math.atan2(tz, tx);
    const pitch = Math.atan2(ty, hLen);
    out.push({ frame, yaw, pitch });
    nextD += spacingM;
  }

  return out;
}

function buildInstancedFromTransforms(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  transforms: SampleTransform[],
  name: string,
): THREE.InstancedMesh | null {
  if (transforms.length === 0) {
    geom.dispose();
    return null;
  }
  const inst = new THREE.InstancedMesh(geom, mat, transforms.length);
  inst.name = name;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < transforms.length; i++) {
    const tr = transforms[i]!;
    dummy.position.set(tr.x, tr.y, tr.z);
    dummy.rotation.set(0, tr.yaw, tr.pitch, 'YXZ');
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

export interface BuiltUndergroundTrackChunk {
  /** Always-visible macro underground trackbed (when chunk is visible) */
  baseGroup: THREE.Group;
  /** High-detail interior rails, sleepers, walkways, cables, power, lighting & wayside props */
  detailGroup: THREE.Group;
  /** Ceiling-mounted props (rigid catenary + luminaires) hidden when roof cutaway is active */
  ceilingDetailGroup: THREE.Group;
  /** World positions of tunnel luminaires for the camera-following PointLight pool */
  luminairePositions: THREE.Vector3[];
}

/**
 * Builds realistic neutral underground track & wayside infrastructure for one TunnelSegmentChunkSpec.
 */
export function buildUndergroundTrackChunk(
  chunk: TunnelSegmentChunkSpec,
  materials: TunnelMaterialLibrary,
): BuiltUndergroundTrackChunk {
  const baseGroup = new THREE.Group();
  baseGroup.name = `ug-track-base-${chunk.segmentId}`;

  const detailGroup = new THREE.Group();
  detailGroup.name = `ug-track-detail-${chunk.segmentId}`;

  const ceilingDetailGroup = new THREE.Group();
  ceilingDetailGroup.name = `ug-track-ceiling-${chunk.segmentId}`;

  const luminairePositions: THREE.Vector3[] = [];
  const frames = chunk.centerline;
  if (frames.length < 2) {
    return { baseGroup, detailGroup, ceilingDetailGroup, luminairePositions };
  }

  const boreSpan =
    chunk.subSpans.find((s) => s.structureType !== 'transition_collar') ?? chunk.subSpans[0]!;
  const spec = boreSpan.startSpec;
  const halfTrackSlabW = spec.isDoubleTrack ? 3.5 : 1.7;
  const slabTop = spec.slabTopOffsetM; // +0.12
  const railTop = spec.railTopOffsetM; // +0.48

  // ---- 1. Continuous Neutral Concrete Slab Track (runs full length including through stations!) ----
  // Ordered +R -> -R so cross(T, -R) points strictly +Y UPWARD!
  const slabProfile: ProfilePoint2D[] = [
    [halfTrackSlabW + 0.12, -0.28],
    [halfTrackSlabW, slabTop],
    [-halfTrackSlabW, slabTop],
    [-halfTrackSlabW - 0.12, -0.28],
  ];
  const slabGeom = sweepLinearProfile(frames, slabProfile, false, 8.0);
  if (slabGeom) {
    const slabMesh = new THREE.Mesh(slabGeom, materials.trackSlabMat);
    slabMesh.name = 'ug-concrete-track-slab';
    slabMesh.receiveShadow = true;
    slabMesh.userData = { kind: 'line', lineId: chunk.primaryLineId, segmentId: chunk.segmentId };
    baseGroup.add(slabMesh);
  }

  // ---- 2. Realistic Steel Rails (exact gauge 1.435m or 1.067m, aligned with surface/elevated tracks) ----
  const halfGauge = spec.gaugeM * 0.5;
  const railGeoms: THREE.BufferGeometry[] = [];
  for (const laneCenter of spec.trackCenterOffsetsM) {
    for (const side of [-1, 1]) {
      const rx = laneCenter + side * halfGauge;
      // 4-point flat-top Vignoles rail profile (+R -> -R upward)
      const railProfile: ProfilePoint2D[] = [
        [rx + 0.085, slabTop + 0.01],
        [rx + 0.055, railTop],
        [rx - 0.055, railTop],
        [rx - 0.085, slabTop + 0.01],
      ];
      const rg = sweepLinearProfile(frames, railProfile, false, 12.0);
      if (rg) railGeoms.push(rg);
    }
  }
  if (railGeoms.length > 0) {
    const mergedRails = mergeGeometries(railGeoms, false);
    railGeoms.forEach((g) => g.dispose());
    if (mergedRails) {
      const railMesh = new THREE.Mesh(mergedRails, materials.railSteelMat);
      railMesh.name = 'ug-steel-rails';
      railMesh.receiveShadow = true;
      detailGroup.add(railMesh);
    }
  }

  // ---- 3. Concrete Inspection Walkways, Handrails & Wall Cable Troughs (along bore sub-spans) ----
  const walkwayGeoms: THREE.BufferGeometry[] = [];
  const handrailGeoms: THREE.BufferGeometry[] = [];
  const cableGeoms: THREE.BufferGeometry[] = [];
  const thirdRailSteelGeoms: THREE.BufferGeometry[] = [];
  const thirdRailCoverGeoms: THREE.BufferGeometry[] = [];
  const catenaryBusGeoms: THREE.BufferGeometry[] = [];

  for (const span of chunk.subSpans) {
    if (span.structureType === 'transition_collar') continue;
    const sSpec = span.startSpec;

    // 3a. Inspection Walkways (監査歩廊) + continuous galvanized safety handrail
    for (const w of sSpec.walkways) {
      const rMin = Math.min(w.innerRightM, w.outerRightM);
      const rMax = Math.max(w.innerRightM, w.outerRightM);
      const walkProf: ProfilePoint2D[] = [
        [rMax, w.bottomUpM],
        [rMax, w.topUpM],
        [rMin, w.topUpM],
        [rMin, w.bottomUpM],
      ];
      const wg = sweepLinearProfile(span.samples, walkProf, false, 8.0);
      if (wg) walkwayGeoms.push(wg);

      // Handrail along track-facing edge of walkway (1.05m above walkway surface)
      const edgeR = Math.abs(rMin) < Math.abs(rMax) ? rMin + (rMin > 0 ? 0.08 : -0.08) : rMax + (rMax > 0 ? -0.08 : 0.08);
      const hrY = w.topUpM + 1.02;
      const hrProf: ProfilePoint2D[] = [
        [edgeR + 0.03, hrY - 0.03],
        [edgeR + 0.03, hrY + 0.03],
        [edgeR - 0.03, hrY + 0.03],
        [edgeR - 0.03, hrY - 0.03],
      ];
      const hrg = sweepLinearProfile(span.samples, hrProf, true, 12.0);
      if (hrg) handrailGeoms.push(hrg);
    }

    // 3b. Multi-tier Wall Cable Troughs (ケーブルトラフ)
    for (const ct of sSpec.cableTroughs) {
      const hw = ct.widthM * 0.5;
      const hh = ct.heightM * 0.5;
      const ctProf: ProfilePoint2D[] = [
        [ct.rightM + hw, ct.upM - hh],
        [ct.rightM + hw, ct.upM + hh],
        [ct.rightM - hw, ct.upM + hh],
        [ct.rightM - hw, ct.upM - hh],
      ];
      const cg = sweepLinearProfile(span.samples, ctProf, true, 10.0);
      if (cg) cableGeoms.push(cg);
    }

    // 3c. Power Supply — Third Rail vs Rigid Overhead Conductor Rail
    if (sSpec.powerSupply === 'third_rail') {
      for (const laneCenter of sSpec.trackCenterOffsetsM) {
        // Place third rail on the outer side of each lane (away from center columns)
        const dir = laneCenter >= 0 ? 1 : -1;
        const trX = laneCenter + dir * (halfGauge + 0.44);
        const trY = railTop + 0.16;
        const steelProf: ProfilePoint2D[] = [
          [trX + 0.05, trY - 0.08],
          [trX + 0.05, trY + 0.06],
          [trX - 0.05, trY + 0.06],
          [trX - 0.05, trY - 0.08],
        ];
        const coverProf: ProfilePoint2D[] = [
          [trX + 0.14, trY + 0.07],
          [trX + 0.14, trY + 0.15],
          [trX - 0.14, trY + 0.15],
          [trX - 0.14, trY + 0.07],
        ];
        const sg = sweepLinearProfile(span.samples, steelProf, true, 12.0);
        const cg = sweepLinearProfile(span.samples, coverProf, true, 12.0);
        if (sg) thirdRailSteelGeoms.push(sg);
        if (cg) thirdRailCoverGeoms.push(cg);
      }
    } else {
      // Rigid Overhead Conductor Rail (剛体架線) centered above each track lane at railTop + 4.38m
      const catY = railTop + 4.38;
      for (const laneCenter of sSpec.trackCenterOffsetsM) {
        const busProf: ProfilePoint2D[] = [
          [laneCenter + 0.07, catY - 0.07],
          [laneCenter + 0.07, catY + 0.09],
          [laneCenter - 0.07, catY + 0.09],
          [laneCenter - 0.07, catY - 0.07],
        ];
        const bg = sweepLinearProfile(span.samples, busProf, true, 12.0);
        if (bg) catenaryBusGeoms.push(bg);
      }
    }
  }

  const addMerged = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    parent: THREE.Group,
    name: string,
  ) => {
    if (geoms.length === 0) return;
    const m = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!m) return;
    const mesh = new THREE.Mesh(m, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    parent.add(mesh);
  };

  addMerged(walkwayGeoms, materials.walkwayMat, detailGroup, 'ug-inspection-walkways');
  addMerged(handrailGeoms, materials.handrailMat, detailGroup, 'ug-walkway-handrails');
  addMerged(cableGeoms, materials.cableTroughMat, detailGroup, 'ug-cable-troughs');
  addMerged(thirdRailSteelGeoms, materials.thirdRailSteelMat, detailGroup, 'ug-third-rail-steel');
  addMerged(thirdRailCoverGeoms, materials.thirdRailCoverMat, detailGroup, 'ug-third-rail-shroud');
  addMerged(catenaryBusGeoms, materials.rigidCatenaryMat, ceilingDetailGroup, 'ug-rigid-catenary-bus');

  // ---- 4. Instanced Repeated Infrastructure (Sleepers, Luminaires, Columns, Signals, Hangers) ----
  // Pilot corridors get denser spacing for crisp walk-through realism; non-pilot stays super lean!
  const sleeperStepM = chunk.isPilotCorridor ? 2.4 : 6.0;
  const luminaireStepM = chunk.isPilotCorridor ? 14.0 : 28.0;
  const columnStepM = chunk.isPilotCorridor ? 8.0 : 16.0;
  const signalStepM = chunk.isPilotCorridor ? 95.0 : 180.0;

  // 4a. Ballastless Short Sleeper / Fastener Blocks along full centerline
  const sleeperSamples = sampleTransformsAlongFrames(frames, sleeperStepM, 1.5, 1.5);
  const sleeperTransforms: SampleTransform[] = [];
  for (const s of sleeperSamples) {
    for (const laneCenter of spec.trackCenterOffsetsM) {
      sleeperTransforms.push({
        x: s.frame.position.x + s.frame.right.x * laneCenter,
        y: s.frame.position.y + slabTop + 0.055,
        z: s.frame.position.z + s.frame.right.z * laneCenter,
        yaw: s.yaw,
        pitch: s.pitch,
      });
    }
  }
  const sleeperInst = buildInstancedFromTransforms(
    new THREE.BoxGeometry(0.32, 0.11, spec.gaugeM + 0.56),
    materials.sleeperBlockMat,
    sleeperTransforms,
    'ug-sleepers-instanced',
  );
  if (sleeperInst) detailGroup.add(sleeperInst);

  // 4b. Bore-specific Instanced Props: Luminaires, Center Columns, Rigid Catenary Hangers, Wayside Signals
  const lumHousingTransforms: SampleTransform[] = [];
  const lumEmitterTransforms: SampleTransform[] = [];
  const columnTransforms: SampleTransform[] = [];
  const catHangerTransforms: SampleTransform[] = [];
  const signalHousingTransforms: SampleTransform[] = [];
  const signalAspectTransforms: SampleTransform[] = [];
  const emergencySignTransforms: SampleTransform[] = [];

  for (const span of chunk.subSpans) {
    if (span.structureType === 'transition_collar') continue;
    const sSpec = span.startSpec;

    // Luminaires
    const lumSamples = sampleTransformsAlongFrames(span.samples, luminaireStepM, 5, 5);
    for (const s of lumSamples) {
      for (const [lumR, lumU] of sSpec.luminaireAnchors) {
        const lx = s.frame.position.x + s.frame.right.x * lumR;
        const ly = s.frame.position.y + lumU;
        const lz = s.frame.position.z + s.frame.right.z * lumR;
        lumHousingTransforms.push({ x: lx, y: ly + 0.05, z: lz, yaw: s.yaw, pitch: s.pitch });
        lumEmitterTransforms.push({ x: lx, y: ly - 0.02, z: lz, yaw: s.yaw, pitch: s.pitch });
      }
      // Record one light anchor at bore crown center per spacing step for PointLight pool
      luminairePositions.push(
        new THREE.Vector3(
          s.frame.position.x,
          s.frame.position.y + sSpec.slabTopOffsetM + sSpec.innerHeightM - 0.85,
          s.frame.position.z,
        ),
      );
    }

    // Center structural H-columns in double-track rectangular cut-and-cover boxes
    if (sSpec.hasCenterColumns) {
      const colSamples = sampleTransformsAlongFrames(span.samples, columnStepM, 4, 4);
      const colCenterY = sSpec.slabTopOffsetM + sSpec.innerHeightM * 0.5;
      for (const s of colSamples) {
        columnTransforms.push({
          x: s.frame.position.x,
          y: s.frame.position.y + colCenterY,
          z: s.frame.position.z,
          yaw: s.yaw,
          pitch: 0,
        });
      }
    }

    // Rigid Catenary Insulator Hangers (connect ceiling down to rigid conductor rail)
    if (sSpec.powerSupply === 'rigid_catenary') {
      const hangerSamples = sampleTransformsAlongFrames(span.samples, 10.0, 4, 4);
      const catY = railTop + 4.38;
      const ceilY = sSpec.slabTopOffsetM + sSpec.innerHeightM - 0.1;
      const midY = (catY + ceilY) * 0.5;
      for (const s of hangerSamples) {
        for (const laneCenter of sSpec.trackCenterOffsetsM) {
          catHangerTransforms.push({
            x: s.frame.position.x + s.frame.right.x * laneCenter,
            y: s.frame.position.y + midY,
            z: s.frame.position.z + s.frame.right.z * laneCenter,
            yaw: s.yaw,
            pitch: 0,
          });
        }
      }
    }

    // Wayside Color-Light Signals & Emergency Evacuation Wall Markers
    const sigSamples = sampleTransformsAlongFrames(span.samples, signalStepM, 24, 24);
    for (const s of sigSamples) {
      const wallR = sSpec.innerWidthM * 0.5 - 0.52;
      for (const side of [-1, 1]) {
        const sx = s.frame.position.x + s.frame.right.x * (side * wallR);
        const sy = s.frame.position.y + 3.1;
        const sz = s.frame.position.z + s.frame.right.z * (side * wallR);
        signalHousingTransforms.push({ x: sx, y: sy, z: sz, yaw: s.yaw, pitch: 0 });
        signalAspectTransforms.push({
          x: sx - s.frame.tangent.x * 0.16,
          y: sy + 0.18,
          z: sz - s.frame.tangent.z * 0.16,
          yaw: s.yaw,
          pitch: 0,
        });
      }
      // Emergency exit / distance marker sign on right wall
      const ex = s.frame.position.x + s.frame.right.x * (wallR + 0.25);
      const ez = s.frame.position.z + s.frame.right.z * (wallR + 0.25);
      emergencySignTransforms.push({
        x: ex,
        y: s.frame.position.y + 1.9,
        z: ez,
        yaw: s.yaw,
        pitch: 0,
      });
    }
  }

  const lumHInst = buildInstancedFromTransforms(
    new THREE.BoxGeometry(2.6, 0.12, 0.26),
    materials.luminaireHousingMat,
    lumHousingTransforms,
    'ug-luminaire-housings-instanced',
  );
  if (lumHInst) ceilingDetailGroup.add(lumHInst);

  const lumEInst = buildInstancedFromTransforms(
    new THREE.BoxGeometry(2.4, 0.06, 0.2),
    materials.luminaireEmissiveMat,
    lumEmitterTransforms,
    'ug-luminaire-emitters-instanced',
  );
  if (lumEInst) ceilingDetailGroup.add(lumEInst);

  if (columnTransforms.length > 0) {
    const colH = spec.innerHeightM;
    const colInst = buildInstancedFromTransforms(
      new THREE.BoxGeometry(0.36, colH, 0.28),
      materials.columnMat,
      columnTransforms,
      'ug-center-columns-instanced',
    );
    if (colInst) detailGroup.add(colInst);
  }

  if (catHangerTransforms.length > 0) {
    const hangerH = Math.max(0.35, spec.slabTopOffsetM + spec.innerHeightM - (railTop + 4.38));
    const catInst = buildInstancedFromTransforms(
      new THREE.BoxGeometry(0.14, hangerH, 0.14),
      materials.handrailMat,
      catHangerTransforms,
      'ug-catenary-hangers-instanced',
    );
    if (catInst) ceilingDetailGroup.add(catInst);
  }

  const sigHInst = buildInstancedFromTransforms(
    new THREE.BoxGeometry(0.28, 0.92, 0.34),
    materials.signalHousingMat,
    signalHousingTransforms,
    'ug-signals-housing-instanced',
  );
  if (sigHInst) detailGroup.add(sigHInst);

  const sigAInst = buildInstancedFromTransforms(
    new THREE.BoxGeometry(0.08, 0.22, 0.22),
    materials.signalAspectMat,
    signalAspectTransforms,
    'ug-signals-aspect-instanced',
  );
  if (sigAInst) detailGroup.add(sigAInst);

  const emInst = buildInstancedFromTransforms(
    new THREE.BoxGeometry(0.95, 0.38, 0.08),
    materials.emergencySignMat,
    emergencySignTransforms,
    'ug-emergency-signs-instanced',
  );
  if (emInst) detailGroup.add(emInst);

  return { baseGroup, detailGroup, ceilingDetailGroup, luminairePositions };
}
