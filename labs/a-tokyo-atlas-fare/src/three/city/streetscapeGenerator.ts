/**
 * Shibuya 800m x 800m High-Detail Streetscape Showcase & Tokyo Park Vegetation Generator (Atlas v2).
 *
 * Driven strictly by real OpenStreetMap roads, intersections, plazas, parks, and loaded building
 * footprints — never generates fake streets or ungrounded floating props.
 *
 * Performance & Batching:
 *  - Crosswalks & raised curbs merged into 2 static BufferGeometries.
 *  - Streetlights, traffic signals, guardrails, bollards, benches, shelters, and 3D trees
 *    all batched into InstancedMeshes with per-instance botanical/material variation.
 *  - 3-tier distance LOD with hysteresis (`near` < 780m / exit 920m, `mid` < 1650m / exit 1850m, `far`).
 *  - Cutaway-aware via `injectRadialCutaway(..., 'building')`.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SURFACE_ELEVATION_LAYERS } from '../../contracts/atlasV2.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import type { UrbanBaseEnvironment, UrbanBuildingRecord } from '../types.js';
import {
  detectSurfaceIntersections,
  getEffectiveRiverWidth,
  isSurfaceRiverVisible,
  pointInPoly,
  showcaseZoneBounds,
  StreetClearanceGrid,
  TERRAIN_ELEVATION_LEVELS,
  type DetectedIntersection,
} from './cityGeometryHelpers.js';
import { SHIBUYA_SHOWCASE_ZONE, type StreetscapeLodTier } from './streetscapeRegistry.js';

const CROSSWALK_Y = TERRAIN_ELEVATION_LEVELS.find((l) => l.id === 'crosswalks')!.y;
const CROSSWALK_PO = TERRAIN_ELEVATION_LEVELS.find((l) => l.id === 'crosswalks')!.poFactor;
const SIDEWALK_Y = SURFACE_ELEVATION_LAYERS.sidewalkPlazaY;
const PARK_Y = SURFACE_ELEVATION_LAYERS.parkMinY;

function hashDet(x: number, z: number, salt = 17): number {
  const h = Math.sin(x * 0.0317 + z * 0.0571 + salt * 19.31) * 43758.5453123;
  return h - Math.floor(h);
}

function normalizeForMerge(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (out.getAttribute('uv')) out.deleteAttribute('uv');
  return out;
}

function makeUpwardQuad(
  cx: number,
  y: number,
  cz: number,
  lenX: number,
  lenZ: number,
  rotY: number,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(lenX, lenZ);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rotY);
  g.translate(cx, y, cz);
  return normalizeForMerge(g);
}

function buildMultiLobeCanopyGeometry(): THREE.BufferGeometry {
  const l1 = new THREE.IcosahedronGeometry(1.75, 1);
  l1.scale(1.05, 0.92, 1.0);
  l1.translate(0, 4.15, 0);

  const l2 = new THREE.IcosahedronGeometry(1.3, 1);
  l2.scale(1.0, 0.85, 1.0);
  l2.translate(0.95, 3.65, 0.45);

  const l3 = new THREE.IcosahedronGeometry(1.25, 1);
  l3.scale(1.0, 0.88, 1.0);
  l3.translate(-0.85, 3.75, -0.45);

  const merged = mergeGeometries([normalizeForMerge(l1), normalizeForMerge(l2), normalizeForMerge(l3)], false);
  l1.dispose();
  l2.dispose();
  l3.dispose();
  return merged ?? new THREE.IcosahedronGeometry(1.8, 1);
}

function buildTreeTrunkGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.16, 0.28, 3.8, 6);
  g.translate(0, 1.6, 0);
  return g;
}

function buildStreetlightPoleGeometry(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.08, 0.14, 6.2, 7);
  post.translate(0, 3.1, 0);
  const arm = new THREE.CylinderGeometry(0.05, 0.07, 1.65, 6);
  arm.rotateZ(-Math.PI / 2);
  arm.translate(0.75, 6.1, 0);
  const merged = mergeGeometries([normalizeForMerge(post), normalizeForMerge(arm)], false);
  post.dispose();
  arm.dispose();
  return merged ?? new THREE.BoxGeometry(0.2, 6.2, 0.2);
}

function buildStreetlightLampGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.72, 0.16, 0.34);
  g.translate(1.45, 6.02, 0);
  return g;
}

function buildSignalPoleGeometry(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.11, 0.16, 5.5, 7);
  post.translate(0, 2.75, 0);
  const arm = new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6);
  arm.rotateZ(-Math.PI / 2);
  arm.translate(1.75, 5.2, 0);
  const housing = new THREE.BoxGeometry(1.35, 0.44, 0.32);
  housing.translate(2.55, 5.2, 0);
  const merged = mergeGeometries(
    [normalizeForMerge(post), normalizeForMerge(arm), normalizeForMerge(housing)],
    false,
  );
  post.dispose();
  arm.dispose();
  housing.dispose();
  return merged ?? new THREE.BoxGeometry(0.25, 5.5, 0.25);
}

function buildSignalLensGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.15, 0.22, 0.36);
  g.translate(2.55, 5.2, 0);
  return g;
}

function buildGuardrailGeometry(): THREE.BufferGeometry {
  const p1 = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6);
  p1.translate(-1.35, 0.45, 0);
  const p2 = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6);
  p2.translate(1.35, 0.45, 0);
  const topBar = new THREE.BoxGeometry(3.1, 0.07, 0.06);
  topBar.translate(0, 0.84, 0);
  const midBar = new THREE.BoxGeometry(3.1, 0.06, 0.05);
  midBar.translate(0, 0.48, 0);
  const merged = mergeGeometries(
    [
      normalizeForMerge(p1),
      normalizeForMerge(p2),
      normalizeForMerge(topBar),
      normalizeForMerge(midBar),
    ],
    false,
  );
  p1.dispose();
  p2.dispose();
  topBar.dispose();
  midBar.dispose();
  return merged ?? new THREE.BoxGeometry(3.1, 0.88, 0.08);
}

function buildBenchGeometry(): THREE.BufferGeometry {
  const leg1 = new THREE.BoxGeometry(0.12, 0.42, 0.56);
  leg1.translate(-0.72, 0.21, 0);
  const leg2 = new THREE.BoxGeometry(0.12, 0.42, 0.56);
  leg2.translate(0.72, 0.21, 0);
  const seat = new THREE.BoxGeometry(1.85, 0.09, 0.58);
  seat.translate(0, 0.45, 0);
  const back = new THREE.BoxGeometry(1.85, 0.36, 0.08);
  back.translate(0, 0.68, -0.25);
  const merged = mergeGeometries(
    [
      normalizeForMerge(leg1),
      normalizeForMerge(leg2),
      normalizeForMerge(seat),
      normalizeForMerge(back),
    ],
    false,
  );
  leg1.dispose();
  leg2.dispose();
  seat.dispose();
  back.dispose();
  return merged ?? new THREE.BoxGeometry(1.85, 0.75, 0.6);
}

function buildShelterGeometry(): THREE.BufferGeometry {
  const roof = new THREE.BoxGeometry(4.2, 0.14, 1.9);
  roof.translate(0, 2.75, 0);
  const backWall = new THREE.BoxGeometry(4.0, 2.55, 0.12);
  backWall.translate(0, 1.35, -0.78);
  const p1 = new THREE.BoxGeometry(0.12, 2.7, 0.12);
  p1.translate(-1.88, 1.35, 0.65);
  const p2 = new THREE.BoxGeometry(0.12, 2.7, 0.12);
  p2.translate(1.88, 1.35, 0.65);
  const bench = new THREE.BoxGeometry(2.6, 0.45, 0.48);
  bench.translate(0, 0.225, -0.45);
  const merged = mergeGeometries(
    [
      normalizeForMerge(roof),
      normalizeForMerge(backWall),
      normalizeForMerge(p1),
      normalizeForMerge(p2),
      normalizeForMerge(bench),
    ],
    false,
  );
  roof.dispose();
  backWall.dispose();
  p1.dispose();
  p2.dispose();
  bench.dispose();
  return merged ?? new THREE.BoxGeometry(4.2, 2.8, 1.9);
}

interface PlacementTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
  sx: number;
  sy: number;
  sz: number;
  colorHex?: number;
}

const TREE_CANOPY_DAY = [0x587a4e, 0x678a59, 0x4b6c44, 0x749662, 0x608253];
const TREE_CANOPY_NIGHT = [0x223b2c, 0x284533, 0x1d3426, 0x2d4c38];

export class ShibuyaStreetscapeLayer {
  readonly group = new THREE.Group();
  private readonly nearGroup = new THREE.Group();
  private readonly midNearGroup = new THREE.Group();
  private readonly parkVegetationGroup = new THREE.Group();

  private readonly crosswalkMat: THREE.MeshStandardMaterial;
  private readonly curbMat: THREE.MeshStandardMaterial;
  private readonly poleMat: THREE.MeshStandardMaterial;
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly signalLensMat: THREE.MeshStandardMaterial;
  private readonly guardrailMat: THREE.MeshStandardMaterial;
  private readonly trunkMat: THREE.MeshStandardMaterial;
  private readonly canopyMat: THREE.MeshStandardMaterial;
  private readonly benchMat: THREE.MeshStandardMaterial;
  private readonly shelterMat: THREE.MeshStandardMaterial;
  private readonly bollardMat: THREE.MeshStandardMaterial;

  private readonly allMaterials: THREE.MeshStandardMaterial[];

  // Shared unit geometries
  private readonly canopyGeom: THREE.BufferGeometry;
  private readonly trunkGeom: THREE.BufferGeometry;
  private readonly lightPoleGeom: THREE.BufferGeometry;
  private readonly lightLampGeom: THREE.BufferGeometry;
  private readonly signalPoleGeom: THREE.BufferGeometry;
  private readonly signalLensGeom: THREE.BufferGeometry;
  private readonly guardrailGeom: THREE.BufferGeometry;
  private readonly bollardGeom: THREE.BufferGeometry;
  private readonly benchGeom: THREE.BufferGeometry;
  private readonly shelterGeom: THREE.BufferGeometry;

  private envData: UrbanBaseEnvironment | null = null;
  private lastBuildingCount = -1;
  private isDark: boolean;
  private activeLod: StreetscapeLodTier = 'near';
  private streetscapeInstanceCount = 0;
  private visible = true;
  private currentOpacity = 1.0;

  private shibuyaTreeColorTransforms: PlacementTransform[] = [];
  private tokyoParkTreeTransforms: PlacementTransform[] = [];
  private shibuyaCanopyMesh: THREE.InstancedMesh | null = null;
  private tokyoParkCanopyMesh: THREE.InstancedMesh | null = null;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[], cutawayUniforms?: CutawayUniforms) {
    this.isDark = isDark;
    this.group.name = 'city-streetscape-layer';
    this.nearGroup.name = 'shibuya-streetscape-near';
    this.midNearGroup.name = 'shibuya-streetscape-mid';
    this.parkVegetationGroup.name = 'tokyo-park-vegetation';
    this.group.add(this.parkVegetationGroup, this.midNearGroup, this.nearGroup);

    const mkMat = (opts: THREE.MeshStandardMaterialParameters) =>
      new THREE.MeshStandardMaterial({
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        clippingPlanes: clipPlanes,
        ...opts,
      });

    this.crosswalkMat = mkMat({
      color: isDark ? 0xcbd5e1 : 0xf2f0eb,
      roughness: 0.72,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: CROSSWALK_PO,
      polygonOffsetUnits: CROSSWALK_PO,
    });

    this.curbMat = mkMat({
      color: isDark ? 0x3b4452 : 0xc5c0b7,
      roughness: 0.88,
      metalness: 0.03,
    });

    this.poleMat = mkMat({
      color: isDark ? 0x4b5563 : 0x5c646e,
      roughness: 0.45,
      metalness: 0.65,
    });

    this.lampMat = mkMat({
      color: isDark ? 0xffe6a8 : 0xdbe2ea,
      emissive: new THREE.Color(isDark ? 0xffd280 : 0x000000),
      emissiveIntensity: isDark ? 2.2 : 0.0,
      roughness: 0.35,
      metalness: 0.1,
    });

    this.signalLensMat = mkMat({
      color: 0x22c55e,
      emissive: new THREE.Color(isDark ? 0x22c55e : 0x16a34a),
      emissiveIntensity: isDark ? 1.15 : 0.45,
      roughness: 0.3,
      metalness: 0.1,
    });

    this.guardrailMat = mkMat({
      color: isDark ? 0x8b95a3 : 0xe4e7eb,
      roughness: 0.42,
      metalness: 0.32,
    });

    this.trunkMat = mkMat({
      color: isDark ? 0x2e251d : 0x5c4a3a,
      roughness: 0.94,
      metalness: 0.0,
    });

    this.canopyMat = mkMat({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
    });

    this.benchMat = mkMat({
      color: isDark ? 0x4c4036 : 0x7d654d,
      roughness: 0.82,
      metalness: 0.12,
    });

    this.shelterMat = mkMat({
      color: isDark ? 0x455162 : 0x6c7886,
      roughness: 0.38,
      metalness: 0.48,
    });

    this.bollardMat = mkMat({
      color: isDark ? 0x6b7280 : 0x7a828c,
      roughness: 0.36,
      metalness: 0.68,
    });

    this.allMaterials = [
      this.crosswalkMat,
      this.curbMat,
      this.poleMat,
      this.lampMat,
      this.signalLensMat,
      this.guardrailMat,
      this.trunkMat,
      this.canopyMat,
      this.benchMat,
      this.shelterMat,
      this.bollardMat,
    ];

    if (cutawayUniforms) {
      for (const mat of this.allMaterials) {
        injectRadialCutaway(mat, cutawayUniforms, 'building');
      }
    }

    this.canopyGeom = buildMultiLobeCanopyGeometry();
    this.trunkGeom = buildTreeTrunkGeometry();
    this.lightPoleGeom = buildStreetlightPoleGeometry();
    this.lightLampGeom = buildStreetlightLampGeometry();
    this.signalPoleGeom = buildSignalPoleGeometry();
    this.signalLensGeom = buildSignalLensGeometry();
    this.guardrailGeom = buildGuardrailGeometry();
    this.bollardGeom = new THREE.CylinderGeometry(0.11, 0.12, 0.88, 7);
    this.bollardGeom.translate(0, 0.44, 0);
    this.benchGeom = buildBenchGeometry();
    this.shelterGeom = buildShelterGeometry();
  }

  private clearGroupMeshes(target: THREE.Group): void {
    const toRemove = [...target.children];
    for (const child of toRemove) {
      target.remove(child);
      if (child instanceof THREE.Mesh) {
        // Dispose merged per-build geometries, not shared unit geometries
        const shared = new Set([
          this.canopyGeom,
          this.trunkGeom,
          this.lightPoleGeom,
          this.lightLampGeom,
          this.signalPoleGeom,
          this.signalLensGeom,
          this.guardrailGeom,
          this.bollardGeom,
          this.benchGeom,
          this.shelterGeom,
        ]);
        if (!shared.has(child.geometry)) {
          child.geometry.dispose();
        }
        if (child instanceof THREE.InstancedMesh) {
          child.dispose();
        }
      }
    }
  }

  populate(env: UrbanBaseEnvironment, shibuyaBuildings: UrbanBuildingRecord[] = []): void {
    this.envData = env;
    this.lastBuildingCount = shibuyaBuildings.length;

    this.clearGroupMeshes(this.nearGroup);
    this.clearGroupMeshes(this.midNearGroup);
    this.clearGroupMeshes(this.parkVegetationGroup);
    this.shibuyaTreeColorTransforms = [];
    this.tokyoParkTreeTransforms = [];
    this.shibuyaCanopyMesh = null;
    this.tokyoParkCanopyMesh = null;

    const bounds = showcaseZoneBounds(SHIBUYA_SHOWCASE_ZONE);
    const pad = 120;

    // 1. Build Spatial Clearance Grid inside Shibuya Showcase
    const clearance = new StreetClearanceGrid(2.5);
    for (const r of env.roads) {
      if (r.el === 1) continue;
      if (
        !r.pts.some(
          ([x, z]) =>
            x >= bounds.minX - pad &&
            x <= bounds.maxX + pad &&
            z >= bounds.minZ - pad &&
            z <= bounds.maxZ + pad,
        )
      ) {
        continue;
      }
      clearance.markPolyline('road', r.pts, r.w * 0.48);
    }

    for (const rv of env.riverLines) {
      if (!isSurfaceRiverVisible(rv.name)) continue;
      if (
        !rv.pts.some(
          ([x, z]) =>
            x >= bounds.minX - pad &&
            x <= bounds.maxX + pad &&
            z >= bounds.minZ - pad &&
            z <= bounds.maxZ + pad,
        )
      ) {
        continue;
      }
      clearance.markPolyline('obstacle', rv.pts, getEffectiveRiverWidth(rv.name, rv.width) * 0.5 + 2.5);
    }

    if (env.railCorridors) {
      for (const rc of env.railCorridors) {
        if (
          !rc.pts.some(
            ([x, z]) =>
              x >= bounds.minX - pad &&
              x <= bounds.maxX + pad &&
              z >= bounds.minZ - pad &&
              z <= bounds.maxZ + pad,
          )
        ) {
          continue;
        }
        clearance.markPolyline('obstacle', rc.pts, rc.width * 0.52);
      }
    }

    for (const lm of env.landmarks) {
      if (
        lm.x >= bounds.minX - pad &&
        lm.x <= bounds.maxX + pad &&
        lm.z >= bounds.minZ - pad &&
        lm.z <= bounds.maxZ + pad
      ) {
        const lmRad = lm.radius ?? Math.max(lm.width ?? 55, lm.depth ?? 55) * 0.54;
        clearance.markObstacleDisc(lm.x, lm.z, lmRad + 2.5);
      }
    }

    for (const b of shibuyaBuildings) {
      clearance.markBuilding(b, 1.3);
    }

    // 2. Detect Real Surface Intersections in Shibuya
    const intersections = detectSurfaceIntersections(env.roads, env.intersections, bounds);
    for (const j of intersections) {
      clearance.markObstacleDisc(j.x, j.z, j.radius + 1.5);
    }

    // 3. Zebra Crosswalks & Stop Lines (Merged BufferGeometry -> midNearGroup)
    const crosswalkGeoms = this.buildCrosswalkGeometries(intersections);
    if (crosswalkGeoms.length > 0) {
      const merged = mergeGeometries(crosswalkGeoms, false);
      if (merged) {
        const cwMesh = new THREE.Mesh(merged, this.crosswalkMat);
        cwMesh.name = 'shibuya-zebra-crosswalks';
        cwMesh.receiveShadow = true;
        cwMesh.renderOrder = 11;
        this.midNearGroup.add(cwMesh);
      }
      crosswalkGeoms.forEach((g) => g.dispose());
    }

    // 4. Raised 3D Sidewalk Curbs + Placement Sampling along Arterial/Secondary Roads
    const curbGeoms: THREE.BufferGeometry[] = [];
    const lightTransforms: PlacementTransform[] = [];
    const guardrailTransforms: PlacementTransform[] = [];
    const streetTreeTransforms: PlacementTransform[] = [];
    const shelterTransforms: PlacementTransform[] = [];

    const nearAnyIntersection = (px: number, pz: number, extraM: number) =>
      intersections.some((j) => Math.hypot(px - j.x, pz - j.z) < j.radius + extraM);

    const occupiedSpots: [number, number][] = [];
    const canPlaceProp = (px: number, pz: number, minSpacingM: number, clearRadiusM: number) => {
      if (px < bounds.minX || px > bounds.maxX || pz < bounds.minZ || pz > bounds.maxZ) {
        return false;
      }
      if (!clearance.isClear(px, pz, clearRadiusM)) return false;
      for (const [ox, oz] of occupiedSpots) {
        if (Math.hypot(px - ox, pz - oz) < minSpacingM) return false;
      }
      occupiedSpots.push([px, pz]);
      return true;
    };

    for (const r of env.roads) {
      if (r.el === 1) continue;
      if (r.hw !== 'trunk' && r.hw !== 'primary' && r.hw !== 'secondary') continue;

      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i]!;
        const [bx, bz] = r.pts[i + 1]!;
        const inZone =
          (ax >= bounds.minX && ax <= bounds.maxX && az >= bounds.minZ && az <= bounds.maxZ) ||
          (bx >= bounds.minX && bx <= bounds.maxX && bz >= bounds.minZ && bz <= bounds.maxZ);
        if (!inZone) continue;

        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 10) continue;

        const tx = dx / segLen;
        const tz = dz / segLen;
        const nx = -tz;
        const nz = tx;
        const roadRotY = Math.atan2(-dz, dx);

        // 4a. Sidewalk Curbs (3.5m spans, trimmed cleanly away from intersections)
        const curbOffset = r.w * 0.5 + 0.28;
        const curbStep = 4.5;
        for (let d = 3.0; d < segLen - 3.0; d += curbStep) {
          const mx = ax + tx * d;
          const mz = az + tz * d;
          if (nearAnyIntersection(mx, mz, 3.0)) continue;
          for (const side of [-1, 1]) {
            const cx = mx + nx * side * curbOffset;
            const cz = mz + nz * side * curbOffset;
            if (cx < bounds.minX || cx > bounds.maxX || cz < bounds.minZ || cz > bounds.maxZ) {
              continue;
            }
            if (clearance.isRoadBlocked(cx, cz)) continue;
            const box = new THREE.BoxGeometry(Math.min(curbStep - 0.1, segLen - 2), 0.26, 0.34);
            box.rotateY(roadRotY);
            box.translate(cx, 0.07, cz);
            curbGeoms.push(normalizeForMerge(box));
          }
        }

        // 4b. Pedestrian Guardrails along major arterial curbs
        if (r.hw === 'trunk' || r.hw === 'primary') {
          const railOff = r.w * 0.5 + 0.62;
          for (let d = 8; d < segLen - 8; d += 3.5) {
            const mx = ax + tx * d;
            const mz = az + tz * d;
            if (nearAnyIntersection(mx, mz, 6.5)) continue;
            for (const side of [-1, 1]) {
              const gx = mx + nx * side * railOff;
              const gz = mz + nz * side * railOff;
              if (gx < bounds.minX || gx > bounds.maxX || gz < bounds.minZ || gz > bounds.maxZ) {
                continue;
              }
              if (!clearance.isClear(gx, gz, 0.4)) continue;
              guardrailTransforms.push({
                x: gx,
                y: SIDEWALK_Y,
                z: gz,
                rotY: roadRotY,
                sx: 1,
                sy: 1,
                sz: 1,
              });
            }
          }
        }

        // 4c. Streetlights (~30m spacing) & Street Trees (~24m spacing)
        const poleOff = r.w * 0.5 + 1.05;
        for (let d = 12; d < segLen - 10; d += 30) {
          const mx = ax + tx * d;
          const mz = az + tz * d;
          if (nearAnyIntersection(mx, mz, 5.5)) continue;
          const sides = r.hw === 'secondary' ? [i % 2 === 0 ? 1 : -1] : [-1, 1];
          for (const side of sides) {
            const px = mx + nx * side * poleOff;
            const pz = mz + nz * side * poleOff;
            if (!canPlaceProp(px, pz, 12, 0.8)) continue;
            const inX = -nx * side;
            const inZ = -nz * side;
            lightTransforms.push({
              x: px,
              y: SIDEWALK_Y,
              z: pz,
              rotY: Math.atan2(-inZ, inX),
              sx: 1,
              sy: 1,
              sz: 1,
            });
          }
        }

        if (r.hw === 'trunk' || r.hw === 'primary') {
          const treeOff = r.w * 0.5 + 2.05;
          for (let d = 16; d < segLen - 12; d += 24) {
            const mx = ax + tx * d;
            const mz = az + tz * d;
            if (nearAnyIntersection(mx, mz, 7.5)) continue;
            for (const side of [-1, 1]) {
              const px = mx + nx * side * treeOff;
              const pz = mz + nz * side * treeOff;
              if (!canPlaceProp(px, pz, 9.5, 1.5)) continue;
              const rnd = hashDet(px, pz, 71);
              const sc = 0.8 + rnd * 0.36;
              streetTreeTransforms.push({
                x: px,
                y: SIDEWALK_Y,
                z: pz,
                rotY: rnd * Math.PI * 2,
                sx: sc,
                sy: sc,
                sz: sc,
                colorHex: TREE_CANOPY_DAY[Math.floor(rnd * TREE_CANOPY_DAY.length)]!,
              });
            }
          }

          // Modest transit waiting shelters on very wide trunk avenues
          if (r.hw === 'trunk' && segLen > 45) {
            const mid = segLen * 0.5;
            const mx = ax + tx * mid;
            const mz = az + tz * mid;
            if (!nearAnyIntersection(mx, mz, 14) && shelterTransforms.length < 10) {
              const sx = mx + nx * (r.w * 0.5 + 2.1);
              const sz = mz + nz * (r.w * 0.5 + 2.1);
              if (canPlaceProp(sx, sz, 38, 1.8)) {
                shelterTransforms.push({
                  x: sx,
                  y: SIDEWALK_Y,
                  z: sz,
                  rotY: roadRotY,
                  sx: 1,
                  sy: 1,
                  sz: 1,
                });
              }
            }
          }
        }
      }
    }

    if (curbGeoms.length > 0) {
      const mergedCurbs = mergeGeometries(curbGeoms, false);
      if (mergedCurbs) {
        const curbMesh = new THREE.Mesh(mergedCurbs, this.curbMat);
        curbMesh.name = 'shibuya-sidewalk-curbs';
        curbMesh.receiveShadow = true;
        this.nearGroup.add(curbMesh);
      }
      curbGeoms.forEach((g) => g.dispose());
    }

    // 5. Traffic Signals & Corner Bollards at Major Shibuya Intersections
    const signalTransforms: PlacementTransform[] = [];
    const bollardTransforms: PlacementTransform[] = [];

    for (const j of intersections) {
      if (j.arms.length < 3 && !j.isScramble) continue;
      // Place 2–3 traffic signal masts at opposite/adjacent corners
      for (let ai = 0; ai < Math.min(3, j.arms.length); ai++) {
        const arm = j.arms[ai]!;
        if (arm.hw === 'tertiary' && !j.isScramble) continue;
        const bx = Math.cos(arm.angle);
        const bz = Math.sin(arm.angle);
        const lx = -bz;
        const lz = bx;
        const cornerDist = j.radius + 1.8;
        const sideOff = arm.width * 0.5 + 1.15;
        const px = j.x + bx * cornerDist + lx * sideOff;
        const pz = j.z + bz * cornerDist + lz * sideOff;
        if (canPlaceProp(px, pz, 5, 0.7)) {
          // Point signal cantilever bar back across approaching lane (-lx, -lz)
          signalTransforms.push({
            x: px,
            y: SIDEWALK_Y,
            z: pz,
            rotY: Math.atan2(lz, -lx),
            sx: 1,
            sy: 1,
            sz: 1,
          });
        }

        // Corner pedestrian bollards
        for (const step of [-1.8, 1.8]) {
          const bpx = j.x + bx * (cornerDist - 0.5) + lx * (sideOff + step * 0.6);
          const bpz = j.z + bz * (cornerDist - 0.5) + lz * (sideOff + step * 0.6);
          if (clearance.isClear(bpx, bpz, 0.4)) {
            bollardTransforms.push({ x: bpx, y: SIDEWALK_Y, z: bpz, rotY: 0, sx: 1, sy: 1, sz: 1 });
          }
        }
      }
    }

    // 6. Miyashita Park Grove & Plaza Benches
    const benchTransforms: PlacementTransform[] = [];
    const miyashita = env.parkPolygons.find((p) => p.name && p.name.includes('宮下'));
    if (miyashita && miyashita.pts.length >= 3) {
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const [px, pz] of miyashita.pts) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
      for (let x = minX + 4; x <= maxX - 4; x += 11) {
        for (let z = minZ + 4; z <= maxZ - 4; z += 11) {
          if (!pointInPoly(x, z, miyashita.pts)) continue;
          const rnd = hashDet(x, z, 211);
          const jx = x + (rnd - 0.5) * 4;
          const jz = z + (hashDet(x, z, 223) - 0.5) * 4;
          if (!clearance.isClear(jx, jz, 1.2)) continue;
          const sc = 0.88 + rnd * 0.45;
          streetTreeTransforms.push({
            x: jx,
            y: PARK_Y,
            z: jz,
            rotY: rnd * Math.PI * 2,
            sx: sc,
            sy: sc,
            sz: sc,
            colorHex: TREE_CANOPY_DAY[Math.floor(rnd * TREE_CANOPY_DAY.length)]!,
          });
          if (rnd > 0.72 && benchTransforms.length < 24) {
            benchTransforms.push({
              x: jx + 2.2,
              y: PARK_Y,
              z: jz,
              rotY: Math.PI * 0.5,
              sx: 1,
              sy: 1,
              sz: 1,
            });
          }
        }
      }
    }

    // Station plaza benches & bollards
    if (env.stationPlazas) {
      for (const sp of env.stationPlazas) {
        if (sp.x < bounds.minX || sp.x > bounds.maxX || sp.z < bounds.minZ || sp.z > bounds.maxZ) {
          continue;
        }
        for (let a = 0; a < Math.PI * 2; a += Math.PI * 0.5) {
          const bx = sp.x + Math.cos(a) * (sp.rx * 0.48);
          const bz = sp.z + Math.sin(a) * (sp.rz * 0.48);
          if (canPlaceProp(bx, bz, 8, 1.0)) {
            benchTransforms.push({ x: bx, y: SIDEWALK_Y + 0.01, z: bz, rotY: a, sx: 1, sy: 1, sz: 1 });
          }
        }
      }
    }

    // 7. Tokyo-Wide Major Parks Vegetation (Imperial Palace, Yoyogi, Shinjuku Gyoen, Ueno, etc.)
    const parkTreeTransforms: PlacementTransform[] = [];
    for (const pk of env.parkPolygons) {
      if (pk.name && pk.name.includes('宮下')) continue;
      if (pk.pts.length < 3) continue;
      let area2 = 0;
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (let i = 0; i < pk.pts.length; i++) {
        const [x1, z1] = pk.pts[i]!;
        const [x2, z2] = pk.pts[(i + 1) % pk.pts.length]!;
        area2 += x1 * z2 - x2 * z1;
        if (x1 < minX) minX = x1;
        if (x1 > maxX) maxX = x1;
        if (z1 < minZ) minZ = z1;
        if (z1 > maxZ) maxZ = z1;
      }
      const area = Math.abs(area2) * 0.5;
      if (area < 14_000) continue;

      const step = area > 350_000 ? 115 : area > 80_000 ? 75 : 52;
      for (let x = minX + step * 0.4; x < maxX - step * 0.3; x += step) {
        for (let z = minZ + step * 0.4; z < maxZ - step * 0.3; z += step) {
          if (parkTreeTransforms.length >= 460) break;
          const rnd = hashDet(x, z, 307);
          const jx = x + (rnd - 0.5) * step * 0.45;
          const jz = z + (hashDet(x, z, 313) - 0.5) * step * 0.45;
          if (!pointInPoly(jx, jz, pk.pts)) continue;
          const sc = 1.45 + rnd * 1.1;
          parkTreeTransforms.push({
            x: jx,
            y: PARK_Y,
            z: jz,
            rotY: rnd * Math.PI * 2,
            sx: sc,
            sy: sc,
            sz: sc,
            colorHex: TREE_CANOPY_DAY[Math.floor(rnd * TREE_CANOPY_DAY.length)]!,
          });
        }
      }
    }

    // 8. Build InstancedMeshes cleanly into LOD groups
    this.shibuyaTreeColorTransforms = streetTreeTransforms;
    this.tokyoParkTreeTransforms = parkTreeTransforms;

    const addInst = (
      parent: THREE.Group,
      name: string,
      geom: THREE.BufferGeometry,
      mat: THREE.Material,
      list: PlacementTransform[],
      castShadow: boolean,
      usePaletteColors = false,
    ): THREE.InstancedMesh | null => {
      if (list.length === 0) return null;
      const mesh = new THREE.InstancedMesh(geom, mat, list.length);
      mesh.name = name;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      for (let i = 0; i < list.length; i++) {
        const t = list[i]!;
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.rotY, 0);
        dummy.scale.set(t.sx, t.sy, t.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (usePaletteColors) {
          const pal = this.isDark ? TREE_CANOPY_NIGHT : TREE_CANOPY_DAY;
          col.setHex(pal[i % pal.length]!);
          mesh.setColorAt(i, col);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (usePaletteColors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      return mesh;
    };

    // Mid+Near group
    addInst(this.midNearGroup, 'shibuya-streetlight-poles', this.lightPoleGeom, this.poleMat, lightTransforms, false);
    addInst(this.midNearGroup, 'shibuya-streetlight-lamps', this.lightLampGeom, this.lampMat, lightTransforms, false);
    addInst(this.midNearGroup, 'shibuya-tree-trunks', this.trunkGeom, this.trunkMat, streetTreeTransforms, false);
    this.shibuyaCanopyMesh = addInst(
      this.midNearGroup,
      'shibuya-tree-canopies',
      this.canopyGeom,
      this.canopyMat,
      streetTreeTransforms,
      true,
      true,
    );

    // Near-only group
    addInst(this.nearGroup, 'shibuya-signal-poles', this.signalPoleGeom, this.poleMat, signalTransforms, false);
    addInst(this.nearGroup, 'shibuya-signal-lenses', this.signalLensGeom, this.signalLensMat, signalTransforms, false);
    addInst(this.nearGroup, 'shibuya-guardrails', this.guardrailGeom, this.guardrailMat, guardrailTransforms, false);
    addInst(this.nearGroup, 'shibuya-bollards', this.bollardGeom, this.bollardMat, bollardTransforms, false);
    addInst(this.nearGroup, 'shibuya-benches', this.benchGeom, this.benchMat, benchTransforms, false);
    addInst(this.nearGroup, 'shibuya-shelters', this.shelterGeom, this.shelterMat, shelterTransforms, true);

    // Tokyo-wide Park Vegetation
    addInst(
      this.parkVegetationGroup,
      'tokyo-park-tree-trunks',
      this.trunkGeom,
      this.trunkMat,
      parkTreeTransforms,
      false,
    );
    this.tokyoParkCanopyMesh = addInst(
      this.parkVegetationGroup,
      'tokyo-park-tree-canopies',
      this.canopyGeom,
      this.canopyMat,
      parkTreeTransforms,
      false,
      true,
    );

    this.streetscapeInstanceCount =
      lightTransforms.length +
      streetTreeTransforms.length +
      signalTransforms.length +
      guardrailTransforms.length +
      bollardTransforms.length +
      benchTransforms.length +
      shelterTransforms.length +
      parkTreeTransforms.length;
  }

  private buildCrosswalkGeometries(intersections: DetectedIntersection[]): THREE.BufferGeometry[] {
    const geoms: THREE.BufferGeometry[] = [];
    for (const j of intersections) {
      for (const arm of j.arms) {
        const cx = j.x + Math.cos(arm.angle) * (j.radius + 1.8);
        const cz = j.z + Math.sin(arm.angle) * (j.radius + 1.8);
        const rotY = Math.atan2(-Math.sin(arm.angle), Math.cos(arm.angle));
        const spanW = Math.max(3.6, Math.min(arm.width - 1.0, 12.5));
        const barPitch = 1.0;
        const numBars = Math.max(3, Math.floor(spanW / barPitch));
        const startOff = -((numBars - 1) * barPitch) * 0.5;
        const perpX = -Math.sin(arm.angle);
        const perpZ = Math.cos(arm.angle);

        for (let b = 0; b < numBars; b++) {
          const off = startOff + b * barPitch;
          geoms.push(
            makeUpwardQuad(cx + perpX * off, CROSSWALK_Y, cz + perpZ * off, 3.0, 0.45, rotY),
          );
        }

        // Stop line across approaching right-side lane
        const stopCx =
          j.x + Math.cos(arm.angle) * (j.radius + 4.4) + perpX * (spanW * 0.24);
        const stopCz =
          j.z + Math.sin(arm.angle) * (j.radius + 4.4) + perpZ * (spanW * 0.24);
        geoms.push(makeUpwardQuad(stopCx, CROSSWALK_Y, stopCz, 0.4, spanW * 0.42, rotY));
      }

      // Authentic Shibuya Scramble diagonal zebra crosswalks!
      if (j.isScramble) {
        const diagAngles = [0.68, -0.82];
        for (const da of diagAngles) {
          const rotY = Math.atan2(-Math.sin(da), Math.cos(da));
          const span = 18.5;
          for (let d = -span * 0.5; d <= span * 0.5; d += 1.2) {
            geoms.push(
              makeUpwardQuad(
                j.x + Math.cos(da) * d,
                CROSSWALK_Y + 0.004,
                j.z + Math.sin(da) * d,
                0.46,
                2.9,
                rotY,
              ),
            );
          }
        }
      }
    }
    return geoms;
  }

  /**
   * Rebuilds streetscape once Shibuya OSM buildings finish loading so every prop & tree
   * honors real building footprints.
   */
  rebuildWithBuildings(shibuyaBuildings: UrbanBuildingRecord[]): void {
    if (!this.envData) return;
    if (shibuyaBuildings.length === this.lastBuildingCount) return;
    this.populate(this.envData, shibuyaBuildings);
  }

  updateForCamera(camera: THREE.PerspectiveCamera, focusTarget: THREE.Vector3): void {
    const distToFocus = camera.position.distanceTo(focusTarget);
    const distToShibuya = Math.hypot(
      focusTarget.x - SHIBUYA_SHOWCASE_ZONE.centerX,
      focusTarget.z - SHIBUYA_SHOWCASE_ZONE.centerZ,
    );
    const camToShibuya = Math.hypot(
      camera.position.x - SHIBUYA_SHOWCASE_ZONE.centerX,
      camera.position.z - SHIBUYA_SHOWCASE_ZONE.centerZ,
    );

    const nearShibuya = distToShibuya < 1600 || camToShibuya < 1800;
    const midShibuya = distToShibuya < 2400 || camToShibuya < 2600;

    let nextLod: StreetscapeLodTier = this.activeLod;
    if (!midShibuya) {
      nextLod = 'far';
    } else if (this.activeLod === 'near') {
      if (!nearShibuya || distToFocus > 920) {
        nextLod = distToFocus < 1850 ? 'mid' : 'far';
      }
    } else if (this.activeLod === 'mid') {
      if (nearShibuya && distToFocus < 780) nextLod = 'near';
      else if (distToFocus > 1850) nextLod = 'far';
    } else {
      if (nearShibuya && distToFocus < 780) nextLod = 'near';
      else if (distToFocus < 1650) nextLod = 'mid';
    }

    this.activeLod = nextLod;
    this.nearGroup.visible = this.visible && nextLod === 'near';
    this.midNearGroup.visible = this.visible && (nextLod === 'near' || nextLod === 'mid');
    this.parkVegetationGroup.visible = this.visible && distToFocus < 4800;
  }

  setVisibilityAndOpacity(visible: boolean, opacity: number, cutawayActive: boolean): void {
    this.visible = visible;
    this.currentOpacity = Math.max(0.08, Math.min(1.0, opacity));
    const effectiveOpacity = cutawayActive
      ? this.currentOpacity < 0.55
        ? 0.65
        : 1.0
      : this.currentOpacity;
    const isTranslucent = effectiveOpacity < 0.99;

    for (const mat of this.allMaterials) {
      const needRecompile = mat.transparent !== isTranslucent;
      mat.transparent = isTranslucent;
      mat.opacity = effectiveOpacity;
      mat.depthWrite = !isTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }

    if (!visible) {
      this.nearGroup.visible = false;
      this.midNearGroup.visible = false;
      this.parkVegetationGroup.visible = false;
    }
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;

    this.crosswalkMat.color.setHex(isDark ? 0xcbd5e1 : 0xf2f0eb);
    this.curbMat.color.setHex(isDark ? 0x3b4452 : 0xc5c0b7);
    this.poleMat.color.setHex(isDark ? 0x4b5563 : 0x5c646e);
    this.lampMat.color.setHex(isDark ? 0xffe6a8 : 0xdbe2ea);
    this.lampMat.emissive.setHex(isDark ? 0xffd280 : 0x000000);
    this.lampMat.emissiveIntensity = isDark ? 2.2 : 0.0;
    this.signalLensMat.emissive.setHex(isDark ? 0x22c55e : 0x16a34a);
    this.signalLensMat.emissiveIntensity = isDark ? 1.15 : 0.45;
    this.guardrailMat.color.setHex(isDark ? 0x8b95a3 : 0xe4e7eb);
    this.trunkMat.color.setHex(isDark ? 0x2e251d : 0x5c4a3a);
    this.benchMat.color.setHex(isDark ? 0x4c4036 : 0x7d654d);
    this.shelterMat.color.setHex(isDark ? 0x455162 : 0x6c7886);
    this.bollardMat.color.setHex(isDark ? 0x6b7280 : 0x7a828c);

    const pal = isDark ? TREE_CANOPY_NIGHT : TREE_CANOPY_DAY;
    const col = new THREE.Color();
    for (const [mesh, list] of [
      [this.shibuyaCanopyMesh, this.shibuyaTreeColorTransforms],
      [this.tokyoParkCanopyMesh, this.tokyoParkTreeTransforms],
    ] as const) {
      if (!mesh) continue;
      for (let i = 0; i < list.length; i++) {
        col.setHex(pal[i % pal.length]!);
        mesh.setColorAt(i, col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  getStats(): {
    streetscapeLod: StreetscapeLodTier;
    streetscapeInstances: number;
    showcaseActive: boolean;
  } {
    return {
      streetscapeLod: this.activeLod,
      streetscapeInstances: this.streetscapeInstanceCount,
      showcaseActive: this.activeLod !== 'far',
    };
  }

  dispose(): void {
    this.clearGroupMeshes(this.nearGroup);
    this.clearGroupMeshes(this.midNearGroup);
    this.clearGroupMeshes(this.parkVegetationGroup);

    this.canopyGeom.dispose();
    this.trunkGeom.dispose();
    this.lightPoleGeom.dispose();
    this.lightLampGeom.dispose();
    this.signalPoleGeom.dispose();
    this.signalLensGeom.dispose();
    this.guardrailGeom.dispose();
    this.bollardGeom.dispose();
    this.benchGeom.dispose();
    this.shelterGeom.dispose();

    for (const m of this.allMaterials) m.dispose();
  }
}
