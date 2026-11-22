/**
 * SENKIRO Tokyo Atlas 3D v2.0 — Canonical `RollingStockRendererAdapter` Implementation
 *
 * Bridges the high-fidelity procedural Japanese rolling stock builders (E235-0 Yamanote,
 * Tokyo Metro 1000 Ginza, Tokyo Metro 17000 Yurakucho/Fukutoshin + 9 additional Tokyo catalog models)
 * into `Metropolitan3DScene` via the frozen `RollingStockRendererAdapter` contract.
 *
 * Key Guarantees:
 *  - Mandatory Vehicle Local Axes: Local `+Z` = Forward (front cab nose at `+Z`),
 *    Local `+Y` = Up, Local `y = 0.0` = Bottom of wheel tread (flush on rail head).
 *  - `group.scale.y` remains strictly `1.0` at all times (never distorted by verticalExaggeration).
 *  - Every `(modelId, role, lod, doorOpen)` car template is baked into a single vertex-colored
 *    `THREE.BufferGeometry` so each car renders in 1 Draw Call while preserving 100% 3D detail.
 */

import * as THREE from 'three';
import {
  ROLLING_STOCK_CATALOG,
  type RollingStockRenderStats,
  type RollingStockSpec as V2RollingStockSpec,
  type SimulatedTrainState,
  type TrainCarRole,
  type TrainModelId,
} from '../../contracts/index.js';
import type { RollingStockRendererAdapter } from '../contracts/adapters.js';
import { buildE235CarLod } from './builders/e235Builder.js';
import { buildMetro1000CarLod } from './builders/metro1000Builder.js';
import { buildMetro17000CarLod } from './builders/metro17000Builder.js';
import { getRollingStockSpec as getDetailedSeriesSpec } from './domain/specs.js';
import type {
  ConsistCarSlot,
  RollingStockCarRole,
  RollingStockLodLevel,
  RollingStockSeriesId,
} from './domain/types.js';
import { RollingStockMaterialRegistry } from './materials.js';

/**
 * Bakes any multi-mesh `THREE.Object3D` car hierarchy into a single non-indexed vertex-colored
 * `THREE.BufferGeometry`, applying an optional root rotation (e.g. `-PI/2` around Y to convert `+X` forward to `+Z` forward).
 */
export function bakeObject3DToVertexColorGeometry(
  root: THREE.Object3D,
  rotateXForwardToZForward = true,
): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const alignMatrix = rotateXForwardToZForward
    ? new THREE.Matrix4().makeRotationY(-Math.PI * 0.5)
    : new THREE.Matrix4().identity();

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();
  const normalMat = new THREE.Matrix3();
  const meshMatrix = new THREE.Matrix4();

  root.traverse((obj) => {
    if (!obj.visible || !(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count === 0) return;
    const normAttr = geom.getAttribute('normal') as THREE.BufferAttribute | undefined;

    meshMatrix.multiplyMatrices(rootInverse, obj.matrixWorld);
    meshMatrix.premultiply(alignMatrix);
    normalMat.getNormalMatrix(meshMatrix);

    const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    const baseCol = mat?.color ? mat.color.clone() : new THREE.Color(0xcccccc);
    if (mat?.emissive && (mat.emissiveIntensity ?? 0) > 0.25) {
      baseCol.lerp(mat.emissive, Math.min(0.85, (mat.emissiveIntensity ?? 0) * 0.55));
    }

    const pushVertex = (idx: number) => {
      vPos.fromBufferAttribute(posAttr, idx).applyMatrix4(meshMatrix);
      positions.push(vPos.x, vPos.y, vPos.z);

      if (normAttr) {
        vNorm.fromBufferAttribute(normAttr, idx).applyMatrix3(normalMat).normalize();
        normals.push(vNorm.x, vNorm.y, vNorm.z);
      } else {
        normals.push(0, 1, 0);
      }
      colors.push(baseCol.r, baseCol.g, baseCol.b);
    };

    if (geom.index) {
      const indexAttr = geom.index;
      for (let i = 0; i < indexAttr.count; i++) {
        pushVertex(indexAttr.getX(i));
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        pushVertex(i);
      }
    }
  });

  const baked = new THREE.BufferGeometry();
  baked.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  baked.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  baked.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (!baked.getAttribute('normal') || normals.length === 0) {
    baked.computeVertexNormals();
  }
  baked.computeBoundingBox();
  baked.computeBoundingSphere();
  return baked;
}

const FLAGSHIP_MODEL_MAP: Partial<Record<TrainModelId, RollingStockSeriesId>> = {
  'jr-e235-0': 'jr-east-e235-0',
  'metro-1000': 'tokyo-metro-1000',
  'metro-17000': 'tokyo-metro-17000',
};

function mapV2RoleToDetailedSlot(role: TrainCarRole, hasOverheadPanto: boolean): ConsistCarSlot {
  let detailedRole: RollingStockCarRole = 'intermediate_t';
  let hasPantograph = false;
  let pantographCount: 0 | 1 | 2 = 0;

  if (role === 'lead_cab') {
    detailedRole = 'lead_front';
  } else if (role === 'tail_cab') {
    detailedRole = 'lead_rear';
  } else if (role === 'pantograph') {
    detailedRole = 'intermediate_m';
    hasPantograph = hasOverheadPanto;
    pantographCount = hasOverheadPanto ? 1 : 0;
  } else if (role === 'motor') {
    detailedRole = 'intermediate_m';
  }

  return {
    carNumber: role === 'lead_cab' ? 1 : role === 'tail_cab' ? 10 : 2,
    designationJa: role,
    role: detailedRole,
    hasPantograph,
    pantographCount,
  };
}

/**
 * Builds procedural 3D car hierarchy (already in local +Z forward, +Y up, y = 0 wheel tread bottom)
 * for the remaining 9 Tokyo models in `ROLLING_STOCK_CATALOG` (Shinkansen N700S/E5, E233-0/3000,
 * Metro 2000/16000/18000, Toei Oedo 12-600, Private Commuter).
 */
function buildCatalogFallbackCarHierarchyZForward(
  spec: V2RollingStockSpec,
  role: TrainCarRole,
  lod: RollingStockLodLevel,
  doorOpen: boolean,
): THREE.Group {
  const root = new THREE.Group();
  const isLead = role === 'lead_cab';
  const isTail = role === 'tail_cab';
  const isEnd = isLead || isTail;
  const isShinkansen = spec.modelId.startsWith('shinkansen-');

  const lenM = isEnd ? spec.endCarLengthM : spec.carLengthM;
  const halfLen = lenM * 0.5;
  const widthM = spec.carWidthM;
  const halfW = widthM * 0.5;
  const heightM = spec.carHeightM;
  const floorY = isShinkansen ? 1.25 : spec.modelId === 'toei-12-600' ? 0.95 : 1.13;
  const bodyH = heightM - floorY - 0.24;

  const matBody = new THREE.MeshStandardMaterial({ color: spec.bodyBaseHex });
  const matPrimary = new THREE.MeshStandardMaterial({ color: spec.liveryPrimaryHex });
  const matAccent = new THREE.MeshStandardMaterial({ color: spec.liveryAccentHex });
  const matRoof = new THREE.MeshStandardMaterial({ color: isShinkansen ? spec.bodyBaseHex : 0x9aa3ad });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x262b33 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x162430 });
  const matHeadlight = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfff0b3,
    emissiveIntensity: 1.2,
  });
  const matTaillight = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.2,
  });

  // Build in canonical +Z forward (if tail_cab, rotate canonical group 180 deg around Y so nose faces -Z)
  const carGroup = new THREE.Group();
  if (isTail) {
    carGroup.rotation.y = Math.PI;
  }
  root.add(carGroup);

  const noseLen = isEnd ? (isShinkansen ? 5.2 : 0.85) : 0;
  const mainStartZ = -halfLen;
  const mainEndZ = halfLen - noseLen;
  const mainSpanZ = mainEndZ - mainStartZ;
  const mainMidZ = (mainStartZ + mainEndZ) * 0.5;

  // Main car body box
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(widthM, bodyH, mainSpanZ),
    matBody,
  );
  bodyMesh.position.set(0, floorY + bodyH * 0.5, mainMidZ);
  carGroup.add(bodyMesh);

  // Roof cap
  const roofMesh = new THREE.Mesh(
    new THREE.BoxGeometry(widthM * 0.86, 0.24, mainSpanZ),
    matRoof,
  );
  roofMesh.position.set(0, heightM - 0.12, mainMidZ);
  carGroup.add(roofMesh);

  // Horizontal livery waist & accent stripes along both sides (+X and -X)
  const stripeGeom = new THREE.BoxGeometry(0.025, 0.18, mainSpanZ);
  const accentGeom = new THREE.BoxGeometry(0.026, 0.11, mainSpanZ);
  for (const xSign of [-1, 1]) {
    const s1 = new THREE.Mesh(stripeGeom, matPrimary);
    s1.position.set(xSign * (halfW + 0.005), floorY + 0.72, mainMidZ);
    carGroup.add(s1);

    const s2 = new THREE.Mesh(accentGeom, matAccent);
    s2.position.set(xSign * (halfW + 0.006), floorY + 0.56, mainMidZ);
    carGroup.add(s2);
  }

  // Distinct Aerodynamic Shinkansen Nose or Commuter/Subway Cab Nose at +Z
  if (isEnd) {
    const zBase = mainEndZ;
    if (isShinkansen) {
      // Multi-stage dual-wing aerodynamic Shinkansen nose cone
      const midCone = new THREE.Mesh(
        new THREE.BoxGeometry(widthM * 0.88, bodyH * 0.68, noseLen * 0.62),
        matBody,
      );
      midCone.position.set(0, floorY + bodyH * 0.3, zBase + noseLen * 0.28);
      midCone.rotation.x = 0.16;
      carGroup.add(midCone);

      const tipCone = new THREE.Mesh(
        new THREE.BoxGeometry(widthM * 0.62, bodyH * 0.38, noseLen * 0.52),
        matBody,
      );
      tipCone.position.set(0, floorY + 0.34, zBase + noseLen * 0.72);
      tipCone.rotation.x = 0.12;
      carGroup.add(tipCone);

      // Cockpit canopy glass
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(widthM * 0.64, 0.48, 1.85),
        matGlass,
      );
      canopy.position.set(0, floorY + bodyH * 0.68, zBase + 1.15);
      canopy.rotation.x = 0.26;
      carGroup.add(canopy);
    } else {
      // Sloped commuter/metro cab front mask
      const cabBlock = new THREE.Mesh(
        new THREE.BoxGeometry(widthM - 0.06, bodyH, noseLen),
        matPrimary,
      );
      cabBlock.position.set(0, floorY + bodyH * 0.5, zBase + noseLen * 0.5);
      carGroup.add(cabBlock);

      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(widthM - 0.24, bodyH * 0.62, 0.12),
        matDark,
      );
      visor.position.set(0, floorY + bodyH * 0.56, zBase + noseLen - 0.02);
      visor.rotation.x = 0.14;
      carGroup.add(visor);
    }

    // Headlights (white on lead_cab, red taillights on tail_cab)
    const lampMat = isTail ? matTaillight : matHeadlight;
    const lampGeom = new THREE.BoxGeometry(0.28, 0.16, 0.08);
    for (const xSign of [-1, 1]) {
      const lamp = new THREE.Mesh(lampGeom, lampMat);
      lamp.position.set(
        xSign * (halfW * 0.62),
        floorY + (isShinkansen ? 0.58 : 0.85),
        halfLen - (isShinkansen ? 1.1 : 0.02),
      );
      carGroup.add(lamp);
    }
  }

  if (lod !== 'low') {
    // Windows & Passenger Doors along +X and -X sides
    const doorCount = isShinkansen ? 2 : 4;
    const baySpan = (mainSpanZ - 1.6) / doorCount;
    const winGeom = new THREE.BoxGeometry(0.03, 0.86, Math.max(0.8, baySpan * 0.48));
    const doorGeom = new THREE.BoxGeometry(0.032, 1.82, 0.62);

    for (const xSign of [-1, 1]) {
      for (let i = 0; i < doorCount; i++) {
        const cz = mainStartZ + 0.8 + (i + 0.5) * baySpan;
        const slideShift = doorOpen ? 0.54 : 0;

        const d1 = new THREE.Mesh(doorGeom, matBody);
        d1.position.set(xSign * (halfW + 0.008), floorY + 0.91, cz + 0.32 + slideShift);
        carGroup.add(d1);

        const d2 = new THREE.Mesh(doorGeom, matBody);
        d2.position.set(xSign * (halfW + 0.008), floorY + 0.91, cz - 0.32 - slideShift);
        carGroup.add(d2);

        if (i < doorCount - 1) {
          const w = new THREE.Mesh(winGeom, matGlass);
          w.position.set(xSign * (halfW + 0.006), floorY + 1.28, cz + baySpan * 0.5);
          carGroup.add(w);
        }
      }
    }

    // Bogies (wheel tread bottom strictly at y = 0.0!)
    const wheelR = 0.43;
    const halfBogieZ = spec.bogiePitchM * 0.5;
    const halfG = (spec.gaugeMm / 1000) * 0.5;
    const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.14, lod === 'high' ? 12 : 8);
    wheelGeom.rotateZ(Math.PI * 0.5);
    const frameGeom = new THREE.BoxGeometry(spec.gaugeMm / 1000 + 0.35, 0.32, 2.5);

    for (const zBogie of [-halfBogieZ, halfBogieZ]) {
      const frame = new THREE.Mesh(frameGeom, matDark);
      frame.position.set(0, wheelR + 0.14, zBogie);
      carGroup.add(frame);

      for (const dz of [-0.95, 0.95]) {
        for (const xSign of [-1, 1]) {
          const w = new THREE.Mesh(wheelGeom, matDark);
          w.position.set(xSign * halfG, wheelR, zBogie + dz);
          carGroup.add(w);
        }
      }
    }

    // Roof HVAC & Single-Arm Pantograph on 'pantograph' role cars
    for (const zAc of [-mainSpanZ * 0.22, mainSpanZ * 0.22]) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.62, 0.22, 3.2), matRoof);
      ac.position.set(0, heightM + 0.06, mainMidZ + zAc);
      carGroup.add(ac);
    }

    if (role === 'pantograph' && spec.electrification !== 'third_rail_600v') {
      const panto = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.6), matDark);
      panto.position.set(0, heightM + 0.28, mainStartZ + 2.4);
      carGroup.add(panto);
    }
  } else {
    // Low LOD: include underbody wheel block reaching y = 0.0 so bounding box min.y === 0.0
    const underBlock = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.72, floorY, lenM * 0.78),
      matDark,
    );
    underBlock.position.set(0, floorY * 0.5, 0);
    carGroup.add(underBlock);
  }

  return root;
}

/**
 * Ensures the baked geometry's lowest vertex sits flush at `y = 0.0` (top of rail head).
 */
function ensureWheelTreadAtYZero(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (bb && Math.abs(bb.min.y) > 1e-4 && Number.isFinite(bb.min.y)) {
    geom.translate(0, -bb.min.y, 0);
    geom.computeBoundingBox();
  }
  return geom;
}

interface PooledTrainVisual {
  readonly trainId: string;
  readonly modelId: TrainModelId;
  readonly group: THREE.Group;
  readonly carMeshes: THREE.Mesh[];
  activeLod: RollingStockLodLevel;
  doorOpen: boolean;
}

export class RollingStockRendererV2 implements RollingStockRendererAdapter {
  readonly group = new THREE.Group();
  readonly interactiveTrainMeshes: THREE.Object3D[] = [];

  private readonly matRegistry = RollingStockMaterialRegistry.getInstance();
  private readonly geomCache = new Map<string, THREE.BufferGeometry>();
  private readonly activeTrains = new Map<string, PooledTrainVisual>();

  private readonly normalMaterial: THREE.MeshStandardMaterial;
  private readonly selectedMaterial: THREE.MeshStandardMaterial;
  private readonly farInstancedMaterial: THREE.MeshStandardMaterial;
  private readonly farInstancedMesh: THREE.InstancedMesh;
  private readonly farInstanceTrainIds: string[] = [];
  private readonly farDummy = new THREE.Object3D();
  private readonly farColor = new THREE.Color();
  private static readonly MAX_FAR_INSTANCES = 1600;

  private selectedTrainId: string | null = null;
  private isDark = false;
  private stats: RollingStockRenderStats = {
    renderedTrainCount: 0,
    renderedCarCount: 0,
    lodNearTrains: 0,
    lodMidTrains: 0,
    lodFarTrains: 0,
    drawCallsEstimate: 0,
  };

  constructor() {
    this.group.name = 'atlas-v2-rolling-stock-layer';
    // INVARIANT: group.scale.y MUST remain 1.0 at all times!
    this.group.scale.set(1, 1, 1);

    this.normalMaterial = new THREE.MeshStandardMaterial({
      name: 'v2-rolling-stock-vertex-pbr',
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.42,
      envMapIntensity: 1.15,
    });

    // Subtle warm specular sheen preserves authentic Japanese livery colors (e.g., Marunouchi Red, Ginza Yellow)
    this.selectedMaterial = new THREE.MeshStandardMaterial({
      name: 'v2-rolling-stock-selected-pbr',
      vertexColors: true,
      roughness: 0.26,
      metalness: 0.46,
      emissive: 0xfff8eb,
      emissiveIntensity: 0.08,
      envMapIntensity: 1.35,
    });

    // Single-Draw-Call InstancedMesh batch for far-LOD (>= 1350m) non-selected trains across Tokyo!
    const farBox = new THREE.BoxGeometry(1, 1, 1);
    farBox.translate(0, 0.5, 0); // Bottom rests strictly at y = 0.0 (rail head!)
    this.farInstancedMaterial = new THREE.MeshStandardMaterial({
      name: 'v2-rolling-stock-far-instanced',
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.32,
      envMapIntensity: 1.0,
    });
    this.farInstancedMesh = new THREE.InstancedMesh(
      farBox,
      this.farInstancedMaterial,
      RollingStockRendererV2.MAX_FAR_INSTANCES,
    );
    this.farInstancedMesh.name = 'SimTrains_FarLodInstancedBatch';
    this.farInstancedMesh.count = 0;
    this.farInstancedMesh.castShadow = false;
    this.farInstancedMesh.receiveShadow = false;
    this.farInstancedMesh.frustumCulled = false;
    this.group.add(this.farInstancedMesh);
  }

  /**
   * Builds and caches a single-draw-call vertex-colored `BufferGeometry` for any
   * `(modelId, role, lod, doorOpen)` combination in Local `+Z` Forward, `+Y` Up, `y = 0` Wheel Tread coordinates.
   */
  getOrCreateCarGeometry(
    modelId: TrainModelId,
    role: TrainCarRole,
    lod: RollingStockLodLevel,
    doorOpen = false,
  ): THREE.BufferGeometry {
    const effectiveDoorOpen = lod === 'low' ? false : doorOpen;
    const key = `${modelId}::${role}::${lod}::${effectiveDoorOpen ? 'open' : 'closed'}`;
    const cached = this.geomCache.get(key);
    if (cached) return cached;

    const flagshipSeriesId = FLAGSHIP_MODEL_MAP[modelId];
    let baked: THREE.BufferGeometry;

    if (flagshipSeriesId) {
      const detailedSpec = getDetailedSeriesSpec(flagshipSeriesId);
      const mats = this.matRegistry.getSeriesMaterials(flagshipSeriesId);
      const lightMats = this.matRegistry.createConsistLightMaterials(flagshipSeriesId);
      this.matRegistry.applyConsistLightState(lightMats, 'forward', {
        headlights: true,
        taillights: true,
        destinationSign: true,
        interiorLights: false,
        brightness: 1.0,
      });

      const slot = mapV2RoleToDetailedSlot(
        role,
        detailedSpec.electrification === 'overhead_1500v_dc',
      );

      const built =
        flagshipSeriesId === 'jr-east-e235-0'
          ? buildE235CarLod({ spec: detailedSpec, slot, lod, mats, lightMats })
          : flagshipSeriesId === 'tokyo-metro-1000'
            ? buildMetro1000CarLod({ spec: detailedSpec, slot, lod, mats, lightMats })
            : buildMetro17000CarLod({ spec: detailedSpec, slot, lod, mats, lightMats });

      if (effectiveDoorOpen && built.doors.length > 0) {
        for (const d of built.doors) {
          d.forwardLeaf.position.x = d.closedForwardX + d.maxSlideOffsetM;
          d.rearLeaf.position.x = d.closedRearX - d.maxSlideOffsetM;
        }
      }

      if (lod === 'low') {
        // Add compact under-floor wheel support block in low LOD so wheel tread rests strictly at y = 0.0
        const floorY = detailedSpec.dimensions.floorHeightM;
        const underGeom = new THREE.BoxGeometry(
          detailedSpec.dimensions.intermediateBodyLengthM * 0.75,
          floorY,
          detailedSpec.dimensions.bodyWidthM * 0.72,
        );
        const underMesh = new THREE.Mesh(underGeom, mats.bogieFrame);
        underMesh.position.set(0, floorY * 0.5, 0);
        built.group.add(underMesh);
      }

      // Rotate from builder's +X forward into Session 0's mandatory +Z forward!
      baked = ensureWheelTreadAtYZero(bakeObject3DToVertexColorGeometry(built.group, true));
      lightMats.dispose();
    } else {
      const v2Spec = this.getTrainSpec(modelId);
      const tempGroup = buildCatalogFallbackCarHierarchyZForward(
        v2Spec,
        role,
        lod,
        effectiveDoorOpen,
      );
      baked = ensureWheelTreadAtYZero(bakeObject3DToVertexColorGeometry(tempGroup, false));
    }

    this.geomCache.set(key, baked);
    return baked;
  }

  syncTrains(
    trains: readonly SimulatedTrainState[],
    cameraPos: THREE.Vector3,
    _verticalExaggeration: number,
    isDark: boolean,
  ): void {
    // Enforce invariant: group.scale.y MUST remain 1.0 at all times
    this.group.scale.set(1, 1, 1);

    if (this.isDark !== isDark) {
      this.isDark = isDark;
      this.normalMaterial.emissive.setHex(isDark ? 0x1e293b : 0x000000);
      this.normalMaterial.emissiveIntensity = isDark ? 0.22 : 0.0;
      this.farInstancedMaterial.emissive.setHex(isDark ? 0x334155 : 0x000000);
      this.farInstancedMaterial.emissiveIntensity = isDark ? 0.28 : 0.0;
    }

    const seenIds = new Set<string>();
    let renderedCars = 0;
    let detailedDrawCalls = 0;
    let lodNear = 0;
    let lodMid = 0;
    let lodFar = 0;
    let farInstanceIdx = 0;

    this.interactiveTrainMeshes.length = 0;
    this.farInstanceTrainIds.length = 0;

    for (const train of trains) {
      const distM = Math.hypot(
        cameraPos.x - train.headPose.x,
        cameraPos.y - train.headPose.y,
        cameraPos.z - train.headPose.z,
      );

      const isSelected = train.trainId === this.selectedTrainId;
      const lod: RollingStockLodLevel =
        distM < 380 ? 'high' : distM < 1350 ? 'medium' : 'low';
      if (lod === 'high') lodNear++;
      else if (lod === 'medium') lodMid++;
      else lodFar++;

      // Batch all far-LOD (>= 1350m) non-selected trains into ONE GPU InstancedMesh (1 draw call total!)
      if (lod === 'low' && !isSelected) {
        const spec = this.getTrainSpec(train.modelId);
        const bodyBase = new THREE.Color(spec.bodyBaseHex);
        const primary = new THREE.Color(train.lineColor || spec.liveryPrimaryHex);
        this.farColor.copy(bodyBase).lerp(primary, 0.58);
        for (const cp of train.carPoses) {
          if (farInstanceIdx >= RollingStockRendererV2.MAX_FAR_INSTANCES) break;
          this.farDummy.position.set(cp.x, cp.y, cp.z);
          this.farDummy.rotation.order = 'YXZ';
          this.farDummy.rotation.set(cp.pitchRad, cp.yawRad, cp.rollRad, 'YXZ');
          this.farDummy.scale.set(spec.carWidthM, spec.carHeightM, Math.max(8, cp.lengthM * 0.95));
          this.farDummy.updateMatrix();
          this.farInstancedMesh.setMatrixAt(farInstanceIdx, this.farDummy.matrix);
          this.farInstancedMesh.setColorAt(farInstanceIdx, this.farColor);
          this.farInstanceTrainIds.push(train.trainId);
          farInstanceIdx++;
          renderedCars++;
        }
        continue;
      }

      seenIds.add(train.trainId);

      const doorOpen =
        train.doorState === 'open' ||
        train.doorState === 'opening' ||
        train.doorState === 'closing';

      let visual = this.activeTrains.get(train.trainId);
      if (
        !visual ||
        visual.modelId !== train.modelId ||
        visual.carMeshes.length !== train.carPoses.length
      ) {
        if (visual) {
          this.group.remove(visual.group);
        }
        const trainGroup = new THREE.Group();
        trainGroup.name = `SimTrain_${train.trainId}`;
        trainGroup.userData = { trainId: train.trainId, modelId: train.modelId };

        const carMeshes: THREE.Mesh[] = [];
        const mat = isSelected ? this.selectedMaterial : this.normalMaterial;

        for (const cp of train.carPoses) {
          const geom = this.getOrCreateCarGeometry(train.modelId, cp.role, lod, doorOpen);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.name = `SimCar_${train.trainId}_${cp.carIndex}`;
          mesh.castShadow = lod !== 'low';
          mesh.receiveShadow = lod === 'high';
          mesh.userData = {
            trainId: train.trainId,
            modelId: train.modelId,
            carIndex: cp.carIndex,
            role: cp.role,
          };
          trainGroup.add(mesh);
          carMeshes.push(mesh);
        }

        this.group.add(trainGroup);
        visual = {
          trainId: train.trainId,
          modelId: train.modelId,
          group: trainGroup,
          carMeshes,
          activeLod: lod,
          doorOpen,
        };
        this.activeTrains.set(train.trainId, visual);
      }

      const needsGeomSwap = visual.activeLod !== lod || visual.doorOpen !== doorOpen;
      const targetMat = isSelected ? this.selectedMaterial : this.normalMaterial;

      for (let i = 0; i < train.carPoses.length; i++) {
        const cp = train.carPoses[i]!;
        const mesh = visual.carMeshes[i]!;

        if (needsGeomSwap) {
          mesh.geometry = this.getOrCreateCarGeometry(train.modelId, cp.role, lod, doorOpen);
          mesh.castShadow = lod !== 'low';
          mesh.receiveShadow = lod === 'high';
        }
        if (mesh.material !== targetMat) {
          mesh.material = targetMat;
        }

        mesh.position.set(cp.x, cp.y, cp.z);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.set(cp.pitchRad, cp.yawRad, cp.rollRad, 'YXZ');
        mesh.scale.set(1, 1, 1);

        this.interactiveTrainMeshes.push(mesh);
        renderedCars++;
        detailedDrawCalls++;
      }

      visual.activeLod = lod;
      visual.doorOpen = doorOpen;
    }

    this.farInstancedMesh.count = farInstanceIdx;
    this.farInstancedMesh.visible = farInstanceIdx > 0;
    if (farInstanceIdx > 0) {
      this.farInstancedMesh.instanceMatrix.needsUpdate = true;
      if (this.farInstancedMesh.instanceColor) {
        this.farInstancedMesh.instanceColor.needsUpdate = true;
      }
      this.interactiveTrainMeshes.push(this.farInstancedMesh);
    }

    // Remove stale trains that are no longer detailed or in the simulation state
    for (const [tid, visual] of this.activeTrains.entries()) {
      if (!seenIds.has(tid)) {
        this.group.remove(visual.group);
        this.activeTrains.delete(tid);
      }
    }

    this.stats = {
      renderedTrainCount: trains.length,
      renderedCarCount: renderedCars,
      lodNearTrains: lodNear,
      lodMidTrains: lodMid,
      lodFarTrains: lodFar,
      drawCallsEstimate: detailedDrawCalls + (farInstanceIdx > 0 ? 1 : 0),
    };
  }

  setSelectedTrain(trainId: string | null): void {
    this.selectedTrainId = trainId;
    for (const [tid, visual] of this.activeTrains.entries()) {
      const mat = tid === trainId ? this.selectedMaterial : this.normalMaterial;
      for (const mesh of visual.carMeshes) {
        mesh.material = mat;
      }
    }
  }

  resolveTrainHit(hit: THREE.Intersection): string | null {
    if (hit.object === this.farInstancedMesh && typeof hit.instanceId === 'number') {
      return this.farInstanceTrainIds[hit.instanceId] ?? null;
    }
    let cur: THREE.Object3D | null = hit.object;
    while (cur) {
      const tid = (cur.userData as { trainId?: unknown } | undefined)?.trainId;
      if (typeof tid === 'string' && tid.length > 0) {
        return tid;
      }
      cur = cur.parent;
    }
    return null;
  }

  getTrainSpec(modelId: TrainModelId): V2RollingStockSpec {
    return ROLLING_STOCK_CATALOG[modelId] ?? ROLLING_STOCK_CATALOG['private-commuter-generic'];
  }

  listAvailableModels(): V2RollingStockSpec[] {
    return Object.values(ROLLING_STOCK_CATALOG);
  }

  getStats(): RollingStockRenderStats {
    return { ...this.stats };
  }

  dispose(): void {
    this.activeTrains.clear();
    this.interactiveTrainMeshes.length = 0;
    this.farInstanceTrainIds.length = 0;
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]!);
    }
    for (const g of this.geomCache.values()) {
      g.dispose();
    }
    this.geomCache.clear();
    this.farInstancedMesh.geometry.dispose();
    this.farInstancedMaterial.dispose();
    this.normalMaterial.dispose();
    this.selectedMaterial.dispose();
  }
}

export function createRollingStockRenderer(): RollingStockRendererAdapter {
  return new RollingStockRendererV2();
}
