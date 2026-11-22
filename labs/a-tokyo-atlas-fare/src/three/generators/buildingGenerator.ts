/**
 * Procedural 3D Tokyo Building, Landmark, Spatial Chunk & Multi-Tier LOD System (Atlas v2).
 *
 * All geometry is procedurally generated in code from real OpenStreetMap building footprints,
 * heights, typologies, and clearly tagged schematic street-block infill:
 *  - Grounded foundation skirts (-1.25m .. 0m) eliminate floating buildings across all ground tiers.
 *  - Ground-floor retail/lobby plinths (y = 0 .. ~4.4m) articulate street-level architecture.
 *  - Varied multi-part massing: podiums, setback shafts, crowns, pitched low-rise roofs, and
 *    rooftop mechanical equipment clusters across 9 distinct facade material families.
 *  - LOD0 (Near, < 2050m / exit 2600m): Extruded footprints with meter-accurate UVs, per-building
 *    horizontal UV phase offset, architectural contact/setback AO, and separated roof materials.
 *  - LOD1/LOD2 (Mid/Far): Single textured InstancedMesh per chunk using real oriented bounding boxes.
 *  - Landmarks: 13 custom multi-part procedural silhouettes across Tokyo's major hubs.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  SHIBUYA_SHOWCASE_ZONE,
  getStreetscapeForCutaway,
} from '../city/streetscapeRegistry.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import {
  FacadeMaterialLibrary,
  getBuildingTintHex,
  selectFacadeVariant,
  type BuildingFacadeVariant,
} from '../materials/facadeLibrary.js';
import type {
  UrbanBuildingRecord,
  UrbanChunkData,
  UrbanChunkMeta,
  UrbanLandmarkRecord,
  UrbanManifest,
} from '../types.js';

export interface BuildingProvenanceCounts {
  osmExplicitHeight: number;
  osmLevels: number;
  osmEstimated: number;
  schematicInfill: number;
}

const _tmpColor = new THREE.Color();

interface SplitWallRoof {
  wall: THREE.BufferGeometry | null;
  roof: THREE.BufferGeometry | null;
}

/**
 * Splits a non-indexed BufferGeometry into vertical walls (with meter-scale box UVs,
 * per-building horizontal phase offset & architectural contact/setback AO) and upward-facing roofs,
 * while discarding hidden downward-facing bottom caps and optional flush top caps.
 */
function splitWallsAndRoof(
  source: THREE.BufferGeometry,
  tintHex: number,
  uOffsetM: number,
  options: {
    discardRoof?: boolean;
    creaseBaseY?: number;
    aoRoofTint?: number;
  } = {},
): SplitWallRoof {
  const g = source.index ? source.toNonIndexed() : source;
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const norm = g.getAttribute('normal');

  _tmpColor.setHex(tintHex);
  const br = _tmpColor.r;
  const bg = _tmpColor.g;
  const bb = _tmpColor.b;

  const wallPos: number[] = [];
  const wallNorm: number[] = [];
  const wallUv: number[] = [];
  const wallCol: number[] = [];

  const roofPos: number[] = [];
  const roofNorm: number[] = [];
  const roofUv: number[] = [];
  const roofCol: number[] = [];

  const triCount = Math.floor(pos.count / 3);
  const creaseBaseY = options.creaseBaseY ?? -999;
  const roofTint = options.aoRoofTint ?? 0.94;

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const ny = (norm.getY(i0) + norm.getY(i0 + 1) + norm.getY(i0 + 2)) / 3;

    // Discard invisible downward bottom caps
    if (ny < -0.68) continue;

    // Upward flat roofs or sloped pitched roofs (ny > 0.32 catches gable slopes cleanly!)
    if (ny > 0.32) {
      if (options.discardRoof) continue;
      for (let k = 0; k < 3; k++) {
        const idx = i0 + k;
        const x = pos.getX(idx);
        const y = pos.getY(idx);
        const z = pos.getZ(idx);
        roofPos.push(x, y, z);
        roofNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        roofUv.push(x + uOffsetM, z);
        roofCol.push(br * roofTint, bg * roofTint, bb * roofTint);
      }
    } else {
      const avgNx = (norm.getX(i0) + norm.getX(i0 + 1) + norm.getX(i0 + 2)) / 3;
      const avgNz = (norm.getZ(i0) + norm.getZ(i0 + 1) + norm.getZ(i0 + 2)) / 3;
      const useZForU = Math.abs(avgNx) > Math.abs(avgNz);

      // Subtle architectural facet contrast across cardinal wall orientations
      const facetShade =
        avgNx > 0.3 ? 1.0 : avgNz > 0.3 ? 0.97 : avgNx < -0.3 ? 0.93 : 0.91;

      for (let k = 0; k < 3; k++) {
        const idx = i0 + k;
        const x = pos.getX(idx);
        const y = pos.getY(idx);
        const z = pos.getZ(idx);
        wallPos.push(x, y, z);
        wallNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        wallUv.push((useZForU ? z : x) + uOffsetM, Math.max(0, y));

        // Ground-contact & sub-grade plinth darkening (-1.25..0m -> 0.48, 0..6m -> 0.75..1.0) + setback crease AO
        let ao = y < 0 ? 0.48 : y < 6.0 ? 0.75 + 0.25 * (y / 6.0) : 1.0;
        if (y >= creaseBaseY && y < creaseBaseY + 2.5) {
          ao *= 0.84 + 0.16 * ((y - creaseBaseY) / 2.5);
        }
        const mul = ao * facetShade;
        wallCol.push(br * mul, bg * mul, bb * mul);
      }
    }
  }

  if (g !== source) g.dispose();

  const buildBuf = (
    p: number[],
    n: number[],
    u: number[],
    c: number[],
  ): THREE.BufferGeometry | null => {
    if (p.length === 0) return null;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    out.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return out;
  };

  return {
    wall: buildBuf(wallPos, wallNorm, wallUv, wallCol),
    roof: buildBuf(roofPos, roofNorm, roofUv, roofCol),
  };
}

function extrudeFootprintRaw(
  cx: number,
  cz: number,
  poly: [number, number][],
  baseY: number,
  height: number,
  scaleXY = 1.0,
): THREE.BufferGeometry | null {
  if (poly.length < 3 || height <= 0.4) return null;
  const shape = new THREE.Shape();
  shape.moveTo(poly[0]![0] * scaleXY, -poly[0]![1] * scaleXY);
  for (let i = 1; i < poly.length; i++) {
    shape.lineTo(poly[i]![0] * scaleXY, -poly[i]![1] * scaleXY);
  }
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.rotateX(-Math.PI / 2);
  geom.translate(cx, baseY, cz);
  return geom;
}

function makeOrientedBoxRaw(
  cx: number,
  cz: number,
  w: number,
  d: number,
  angle: number,
  baseY: number,
  height: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, height, d);
  g.rotateY(-angle);
  g.translate(cx, baseY + height * 0.5, cz);
  return g;
}

/**
 * Generates an oriented Japanese pitched gable roof prism atop a rectangular footprint.
 */
function makeGableRoofRaw(
  cx: number,
  cz: number,
  w: number,
  d: number,
  angle: number,
  baseY: number,
  ridgeH: number,
): THREE.BufferGeometry {
  const hw = w * 0.5;
  const hd = d * 0.5;
  // Ridge always runs along the longer horizontal dimension
  const ridgeAlongX = w >= d;
  const rx = ridgeAlongX ? hw * 0.86 : 0;
  const rz = ridgeAlongX ? 0 : hd * 0.86;

  // 6 vertices of hipped/gable roof: 4 base corners + 2 ridge ends
  const p = [
    [-hw, 0, -hd], // 0: NW
    [hw, 0, -hd], // 1: NE
    [hw, 0, hd], // 2: SE
    [-hw, 0, hd], // 3: SW
    [-rx, ridgeH, -rz], // 4: ridge start
    [rx, ridgeH, rz], // 5: ridge end
  ];

  const tris: number[][] = ridgeAlongX
    ? [
        [0, 4, 5],
        [0, 5, 1], // north slope
        [2, 5, 4],
        [2, 4, 3], // south slope
        [3, 4, 0], // west hip
        [1, 5, 2], // east hip
      ]
    : [
        [0, 4, 5],
        [0, 5, 3], // west slope
        [2, 5, 4],
        [2, 4, 1], // east slope
        [0, 1, 4], // north hip
        [3, 5, 2], // south hip
      ];

  const pos: number[] = [];
  for (const [ia, ib, ic] of tris) {
    for (const idx of [ia!, ib!, ic!]) {
      pos.push(p[idx]![0]!, p[idx]![1]!, p[idx]![2]!);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.rotateY(-angle);
  g.translate(cx, baseY, cz);
  return g;
}

type WallBucketKey =
  | BuildingFacadeVariant
  | 'groundStorefront'
  | 'roofEquipment';

type RoofBucketKey = 'roof' | 'roofPitched';

interface BuildingGeometryBuckets {
  walls: Record<WallBucketKey, THREE.BufferGeometry[]>;
  roofs: Record<RoofBucketKey, THREE.BufferGeometry[]>;
}

function makeMassPart(
  b: UrbanBuildingRecord,
  baseY: number,
  height: number,
  scaleXY = 1.0,
): THREE.BufferGeometry | null {
  if (height <= 0.4) return null;
  if (b.p && b.p.length >= 3) {
    return extrudeFootprintRaw(b.cx, b.cz, b.p, baseY, height, scaleXY);
  }
  return makeOrientedBoxRaw(b.cx, b.cz, b.w * scaleXY, b.d * scaleXY, b.a, baseY, height);
}

function appendBuildingToBuckets(
  b: UrbanBuildingRecord,
  isDark: boolean,
  buckets: BuildingGeometryBuckets,
): void {
  const tintHex = getBuildingTintHex(b.id, b.t, isDark);
  const variant = selectFacadeVariant(b.id, b.t, b.h);
  const uOffset = ((Math.abs(b.id) % 97) / 97) * 19.0;

  const pushSplit = (
    raw: THREE.BufferGeometry | null,
    wallBucket: WallBucketKey,
    roofBucket: RoofBucketKey | 'roofEquipment',
    opts: { discardRoof?: boolean; creaseBaseY?: number; tintOverride?: number } = {},
  ) => {
    if (!raw) return;
    const { wall, roof } = splitWallsAndRoof(raw, opts.tintOverride ?? tintHex, uOffset, {
      discardRoof: opts.discardRoof,
      creaseBaseY: opts.creaseBaseY,
    });
    if (wall) buckets.walls[wallBucket].push(wall);
    if (roof) {
      if (roofBucket === 'roofEquipment') buckets.walls.roofEquipment.push(roof);
      else buckets.roofs[roofBucket].push(roof);
    }
    raw.dispose();
  };

  const pushEquipment = (eqW: number, eqD: number, baseY: number, eqH: number, dx = 0, dz = 0) => {
    const cosA = Math.cos(-b.a);
    const sinA = Math.sin(-b.a);
    const ox = dx * cosA - dz * sinA;
    const oz = dx * sinA + dz * cosA;
    const eqRaw = makeOrientedBoxRaw(b.cx + ox, b.cz + oz, eqW, eqD, b.a, baseY, eqH);
    pushSplit(eqRaw, 'roofEquipment', 'roofEquipment', { tintOverride: 0xe6eaef });
  };

  // Typology-specific architectural massing; lowest base starts at y = -1.25m for watertight grounding
  if (b.t === 'o' && b.h >= 40) {
    const groundH = Math.min(4.6, b.h * 0.1);
    const podiumTop = Math.min(16, Math.max(groundH + 4, b.h * 0.18));
    const podiumUpperH = podiumTop - groundH;
    const shaftH = (b.h - podiumTop) * 0.78;
    const crownH = Math.max(4, b.h - podiumTop - shaftH);
    const coreH = Math.min(7.5, Math.max(3.5, b.h * 0.045));

    pushSplit(makeMassPart(b, -1.25, groundH + 1.25, 1.0), 'groundStorefront', 'roof', {
      discardRoof: true,
      tintOverride: 0xf4f1ec,
    });
    pushSplit(makeMassPart(b, groundH, podiumUpperH, 1.0), variant, 'roof', {
      creaseBaseY: groundH,
    });
    pushSplit(makeMassPart(b, podiumTop, shaftH, 0.88), variant, 'roof', {
      creaseBaseY: podiumTop,
    });
    pushSplit(makeMassPart(b, podiumTop + shaftH, crownH, 0.72), variant, 'roof', {
      creaseBaseY: podiumTop + shaftH,
    });

    const coreW = Math.max(4, Math.min(15, b.w * 0.34));
    const coreD = Math.max(4, Math.min(13, b.d * 0.32));
    pushEquipment(coreW, coreD, b.h, coreH);
    if (b.w > 28 && b.d > 24) {
      pushEquipment(Math.min(5.5, b.w * 0.14), Math.min(4.5, b.d * 0.14), b.h, 2.2, b.w * 0.18, 0);
    }
    return;
  }

  if (b.t === 'c' && b.h >= 22) {
    const groundH = 4.2;
    const lowerUpperH = Math.max(4, b.h * 0.76 - groundH);
    const upperBase = groundH + lowerUpperH;
    const upperH = Math.max(3.5, b.h - upperBase);

    pushSplit(makeMassPart(b, -1.25, groundH + 1.25, 1.0), 'groundStorefront', 'roof', {
      discardRoof: true,
      tintOverride: 0xf4f1ec,
    });
    pushSplit(makeMassPart(b, groundH, lowerUpperH, 1.0), variant, 'roof', {
      creaseBaseY: groundH,
    });
    pushSplit(makeMassPart(b, upperBase, upperH, 0.84), variant, 'roof', {
      creaseBaseY: upperBase,
    });
    pushEquipment(Math.max(3.5, Math.min(10, b.w * 0.28)), Math.max(3.5, Math.min(8, b.d * 0.28)), b.h, 3.0);
    return;
  }

  if (b.t === 's') {
    const hasGround = b.h >= 9.5;
    const groundH = hasGround ? 4.2 : 0;
    const mainH = Math.max(3.5, b.h * 0.82 - groundH);
    const monitorH = Math.max(2.6, b.h - groundH - mainH);

    if (hasGround) {
      pushSplit(makeMassPart(b, -1.25, groundH + 1.25, 1.0), 'groundStorefront', 'roof', {
        discardRoof: true,
        tintOverride: 0xf4f1ec,
      });
      pushSplit(makeMassPart(b, groundH, mainH, 1.0), 'stationCivic', 'roof', {
        creaseBaseY: groundH,
      });
    } else {
      pushSplit(makeMassPart(b, -1.25, mainH + 1.25, 1.0), 'stationCivic', 'roof');
    }
    pushSplit(makeMassPart(b, groundH + mainH, monitorH, 0.74), 'stationCivic', 'roof', {
      creaseBaseY: groundH + mainH,
    });
    return;
  }

  // Mid-rise commercial / office or residential with street-level retail/lobby plinth
  const hasRetailPlinth =
    b.h >= 8.0 && (b.t === 'c' || b.t === 'o' || (b.t === 'r' && b.h >= 13.5));

  if (hasRetailPlinth) {
    const groundH = Math.min(4.2, Math.max(3.3, b.h * 0.26));
    const upperH = b.h - groundH;
    pushSplit(makeMassPart(b, -1.25, groundH + 1.25, 1.0), 'groundStorefront', 'roof', {
      discardRoof: true,
      tintOverride: 0xf4f1ec,
    });
    pushSplit(makeMassPart(b, groundH, upperH, 1.0), variant, 'roof', {
      creaseBaseY: groundH,
    });
    if (b.h >= 15) {
      pushEquipment(
        Math.max(3, Math.min(7.5, b.w * 0.28)),
        Math.max(3, Math.min(7.5, b.d * 0.28)),
        b.h,
        2.6,
      );
    }
    return;
  }

  // Low-rise residential / compact buildings: option for authentic Japanese pitched roof!
  const isCompactRect = !b.p || b.p.length <= 5;
  const wantPitched =
    b.t === 'r' &&
    b.h < 13 &&
    b.w <= 22 &&
    b.d <= 22 &&
    isCompactRect &&
    (Math.abs(b.id) % 11) < 6;

  if (wantPitched) {
    const wallH = Math.max(4.0, b.h * 0.86);
    const ridgeH = Math.min(3.2, Math.max(1.4, Math.min(b.w, b.d) * 0.24));
    pushSplit(makeMassPart(b, -1.25, wallH + 1.25, 1.0), variant, 'roof', { discardRoof: true });
    if (b.p && b.p.length >= 3) {
      pushSplit(makeMassPart(b, wallH - 0.15, 0.25, 1.0), variant, 'roof');
    }
    const gableRaw = makeGableRoofRaw(
      b.cx,
      b.cz,
      b.p ? b.w * 0.94 : b.w + 0.5,
      b.p ? b.d * 0.94 : b.d + 0.5,
      b.a,
      wallH,
      ridgeH,
    );
    pushSplit(gableRaw, variant, 'roofPitched', { tintOverride: 0xd8dce0 });
  } else {
    pushSplit(makeMassPart(b, -1.25, b.h + 1.25, 1.0), variant, 'roof');
  }
}

/**
 * Generates distinctive multi-part procedural silhouettes for Tokyo's 13 major landmarks.
 * All pedestals extend down to y = -1.25m for watertight grounding.
 */
function buildProceduralLandmark(
  lm: UrbanLandmarkRecord,
  lib: FacadeMaterialLibrary,
): THREE.Group {
  const g = new THREE.Group();
  g.name = `landmark-${lm.id}`;
  g.position.set(lm.x, 0, lm.z);

  const glassMat = lib.materials.landmarkGlass;
  const stoneMat = lib.materials.commercialStone;
  const metalMat = lib.materials.commercialMetal;
  const brickMat = lib.materials.brick;
  const orangeMat = lib.materials.towerOrange;
  const whiteMat = lib.materials.towerWhite;
  const plinthMat = lib.materials.foundationPlinth;

  switch (lm.kind) {
    case 'lattice_tower_orange': {
      const bands: [number, number, number, number, boolean][] = [
        [0, 75, 28, 17, true],
        [75, 145, 17, 11, false],
        [145, 160, 14.5, 14.5, true],
        [160, 235, 10, 6.5, false],
        [235, 252, 8.8, 8.8, true],
        [252, 333, 4.5, 0.7, false],
      ];
      for (const [y0, y1, rBot, rTop, isOrange] of bands) {
        const h = y1 - y0;
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(rTop, rBot, h, 4),
          isOrange ? orangeMat : whiteMat,
        );
        m.position.y = y0 + h * 0.5;
        m.rotation.y = Math.PI / 4;
        g.add(m);
      }
      const foot = new THREE.Mesh(new THREE.BoxGeometry(58, 19.25, 58), stoneMat);
      foot.position.y = 8.375;
      g.add(foot);
      break;
    }
    case 'skytree_tower': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 4, 6), plinthMat);
      base.position.y = 0.75;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(16, 34, 340, 6), whiteMat);
      lower.position.y = 170;
      const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(24, 22, 22, 16), glassMat);
      deck1.position.y = 350;
      const mid = new THREE.Mesh(new THREE.CylinderGeometry(11, 15, 95, 12), whiteMat);
      mid.position.y = 408;
      const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 15.5, 14, 16), glassMat);
      deck2.position.y = 455;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 8, 172, 10), whiteMat);
      spire.position.y = 548;
      g.add(base, lower, deck1, mid, deck2, spire);
      break;
    }
    case 'twin_stepped_tower': {
      const podium = new THREE.Mesh(new THREE.BoxGeometry(96, 151.25, 48), stoneMat);
      podium.position.y = 74.375;
      const northTower = new THREE.Mesh(new THREE.BoxGeometry(36, 93, 44), glassMat);
      northTower.position.set(0, 150 + 46.5, -24);
      const southTower = new THREE.Mesh(new THREE.BoxGeometry(36, 93, 44), glassMat);
      southTower.position.set(0, 150 + 46.5, 24);
      const bridgeCrown = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 18), stoneMat);
      bridgeCrown.position.set(0, 156, 0);
      const crownN = new THREE.Mesh(new THREE.BoxGeometry(28, 12, 34), stoneMat);
      crownN.position.set(0, 246, -24);
      const crownS = crownN.clone();
      crownS.position.set(0, 246, 24);
      g.add(podium, northTower, southTower, bridgeCrown, crownN, crownS);
      break;
    }
    case 'triple_stepped_tower': {
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(44, 163.25, 42), glassMat);
      b1.position.set(-22, 80.375, 0);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(44, 199.25, 42), glassMat);
      b2.position.set(0, 98.375, 0);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(44, 233.25, 42), glassMat);
      b3.position.set(22, 115.375, 0);
      const cap1 = new THREE.Mesh(new THREE.ConeGeometry(28, 16, 4), stoneMat);
      cap1.rotation.y = Math.PI / 4;
      cap1.position.set(-22, 170, 0);
      const cap2 = cap1.clone();
      cap2.position.set(0, 206, 0);
      const cap3 = cap1.clone();
      cap3.position.set(22, 240, 0);
      g.add(b1, b2, b3, cap1, cap2, cap3);
      break;
    }
    case 'cocoon_ellipsoid': {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 6, 12), plinthMat);
      plinth.position.y = 1.75;
      const body = new THREE.Mesh(new THREE.SphereGeometry(24, 16, 14), glassMat);
      body.scale.set(1.0, 4.25, 0.85);
      body.position.y = 102;
      g.add(plinth, body);
      break;
    }
    case 'heritage_brick_station': {
      const mainHall = new THREE.Mesh(new THREE.BoxGeometry(28, 21.25, 316), brickMat);
      mainHall.position.y = 9.375;
      const centerPavilion = new THREE.Mesh(new THREE.BoxGeometry(38, 28.25, 64), brickMat);
      centerPavilion.position.y = 12.875;
      const roofRidge = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 306), stoneMat);
      roofRidge.position.y = 23;
      const northDome = new THREE.Mesh(new THREE.CylinderGeometry(11, 17, 15, 8), stoneMat);
      northDome.position.set(0, 27.5, -112);
      const southDome = northDome.clone();
      southDome.position.set(0, 27.5, 112);
      g.add(mainHall, centerPavilion, roofRidge, northDome, southDome);
      break;
    }
    case 'marunouchi_tower': {
      const w = lm.width ?? 68;
      const d = lm.depth ?? 62;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(w, 35.25, d), stoneMat);
      podium.position.y = 16.375;
      const shaftH = Math.max(90, lm.height - 46);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, shaftH, d * 0.78), glassMat);
      shaft.position.y = 34 + shaftH * 0.5;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 12, d * 0.72), stoneMat);
      crown.position.y = 34 + shaftH + 6;
      g.add(podium, shaft, crown);
      break;
    }
    case 'glass_stepped_hub': {
      // Shibuya Scramble Square: grounded plinth, stacked vertical fin podium, glass tower + sky deck
      const w = lm.width ?? 62;
      const d = lm.depth ?? 48;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 6.25, d + 2), plinthMat);
      plinth.position.y = 1.875;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 55, d), metalMat);
      lower.position.y = 5 + 27.5;
      const main = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 152, d * 0.82), glassMat);
      main.position.set(4, 60 + 76, 0);
      const deckCollar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 5, d * 0.85), metalMat);
      deckCollar.position.set(4, 212.5, 0);
      const skyDeck = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 14, d * 0.86), glassMat);
      skyDeck.position.set(4, 221, 0);
      g.add(plinth, lower, main, deckCollar, skyDeck);
      break;
    }
    case 'stepped_stream_tower': {
      // Shibuya Stream: riverfront granite plinth + stepped staggered glass volumes
      const w = lm.width ?? 56;
      const d = lm.depth ?? 42;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 6.25, d + 2), plinthMat);
      plinth.position.y = 1.875;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(w, 27, d), stoneMat);
      podium.position.y = 5 + 13.5;
      const mid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 96, d * 0.84), glassMat);
      mid.position.set(-3, 32 + 48, 0);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 4, d * 0.8), metalMat);
      band.position.set(0, 128, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 50, d * 0.74), glassMat);
      top.position.set(2, 130 + 25, 0);
      g.add(plinth, podium, mid, band, top);
      break;
    }
    case 'tiered_cultural_tower': {
      // Shibuya Hikarie: stacked cantilevered cultural cubes with metallic structural collars
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(60, 6.25, 46), plinthMat);
      plinth.position.y = 1.875;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(58, 47, 44), metalMat);
      b1.position.y = 5 + 23.5;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(50, 56, 38), glassMat);
      b2.position.set(3, 52 + 28, 0);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(52, 4, 40), stoneMat);
      collar.position.set(1, 108, 0);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(44, 72, 34), glassMat);
      b3.position.set(-2, 110 + 36, 0);
      g.add(plinth, b1, b2, collar, b3);
      break;
    }
    case 'intercity_trio': {
      const offsets: [number, number, number][] = [
        [0, -95, 144],
        [0, 0, 142],
        [0, 95, 140],
      ];
      for (const [ox, oz, h] of offsets) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(46, h, 42), glassMat);
        tower.position.set(ox, h * 0.5, oz);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(36, 10, 32), stoneMat);
        cap.position.set(ox, h + 5, oz);
        g.add(tower, cap);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(56, 13.25, 240), stoneMat);
      deck.position.set(0, 5.375, 0);
      g.add(deck);
      break;
    }
    case 'octagonal_crown_tower': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(36, 40, 211.25, 8), glassMat);
      shaft.position.y = 104.375;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(28, 34, 28, 8), stoneMat);
      crown.position.y = 224;
      g.add(shaft, crown);
      break;
    }
    default: {
      const w = lm.width ?? 64;
      const d = lm.depth ?? 38;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(w * 1.18, 23.25, d * 1.3), stoneMat);
      podium.position.y = 10.375;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, lm.height, d), glassMat);
      slab.position.y = lm.height * 0.5;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 10, d * 0.72), stoneMat);
      crown.position.y = lm.height + 5;
      g.add(podium, slab, crown);
      break;
    }
  }

  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const toRemove: THREE.Object3D[] = [];

  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.updateMatrix();
      const geom = obj.geometry as THREE.BufferGeometry;
      const pos = geom.getAttribute('position');
      const norm = geom.getAttribute('normal');
      if (pos && norm) {
        const sx = obj.scale.x;
        const sy = obj.scale.y;
        const sz = obj.scale.z;
        const uvs = new Float32Array(pos.count * 2);
        const cols = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) * sx;
          const y = pos.getY(i) * sy;
          const z = pos.getZ(i) * sz;
          const nx = Math.abs(norm.getX(i));
          const ny = Math.abs(norm.getY(i));
          const nz = Math.abs(norm.getZ(i));
          if (ny > 0.72) {
            uvs[i * 2] = x;
            uvs[i * 2 + 1] = z;
          } else {
            uvs[i * 2] = nx > nz ? z : x;
            uvs[i * 2 + 1] = y;
          }
          cols[i * 3] = 1.0;
          cols[i * 3 + 1] = 1.0;
          cols[i * 3 + 2] = 1.0;
        }
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        if (!geom.getAttribute('color')) {
          geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        }
      }

      const baked = geom.index ? geom.toNonIndexed() : geom.clone();
      for (const attrName of Object.keys(baked.attributes)) {
        if (
          attrName !== 'position' &&
          attrName !== 'normal' &&
          attrName !== 'uv' &&
          attrName !== 'color'
        ) {
          baked.deleteAttribute(attrName);
        }
      }
      baked.applyMatrix4(obj.matrix);
      geom.dispose();

      const mat = obj.material as THREE.Material;
      const bucket = byMaterial.get(mat);
      if (bucket) bucket.push(baked);
      else byMaterial.set(mat, [baked]);
      toRemove.push(obj);
    }
  });

  for (const child of toRemove) g.remove(child);

  let partIdx = 0;
  for (const [mat, parts] of byMaterial) {
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (merged) {
      const m = new THREE.Mesh(merged, mat);
      m.name = `landmark-${lm.id}-${partIdx++}`;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}

interface LoadedChunk {
  meta: UrbanChunkMeta;
  buildings: UrbanBuildingRecord[];
  lod0Group: THREE.Group | null;
  lod1Mesh: THREE.InstancedMesh;
  activeLod: 0 | 1 | -1;
}

export class CityChunkManager {
  readonly group = new THREE.Group();
  readonly landmarksGroup = new THREE.Group();
  private manifest: UrbanManifest | null = null;
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly loadingKeys = new Set<string>();
  private readonly unitBoxGeom = new THREE.BoxGeometry(1, 1, 1);
  private readonly facadeLib: FacadeMaterialLibrary;
  private readonly cutawayUniforms?: CutawayUniforms;
  private readonly onChunkLoadedCb?: (meta: UrbanChunkMeta, buildings: UrbanBuildingRecord[]) => void;

  private isDark: boolean;
  private buildingsVisible = true;
  private currentOpacity = 1.0;

  constructor(
    isDark: boolean,
    clipPlanes: THREE.Plane[],
    cutawayUniforms?: CutawayUniforms,
    onChunkLoaded?: (meta: UrbanChunkMeta, buildings: UrbanBuildingRecord[]) => void,
  ) {
    this.isDark = isDark;
    this.cutawayUniforms = cutawayUniforms;
    this.onChunkLoadedCb = onChunkLoaded;
    this.group.name = 'city-buildings-chunked';
    this.landmarksGroup.name = 'tokyo-procedural-landmarks';
    this.group.add(this.landmarksGroup);
    this.facadeLib = new FacadeMaterialLibrary(isDark, clipPlanes);

    if (cutawayUniforms) {
      for (const mat of this.getGenericCityMaterials()) {
        injectRadialCutaway(mat, cutawayUniforms, 'building');
      }
    }
  }

  private getGenericCityMaterials(): THREE.MeshStandardMaterial[] {
    const m = this.facadeLib.materials;
    return [
      m.officeGlassCool,
      m.officeGlassWarm,
      m.commercialStone,
      m.commercialMetal,
      m.commercialTile,
      m.concreteModern,
      m.residentialBalcony,
      m.residentialPlaster,
      m.groundStorefront,
      m.stationCivic,
      m.roof,
      m.roofPitched,
      m.roofEquipment,
      m.foundationPlinth,
      m.instanced,
    ];
  }

  private getLandmarkMaterials(): THREE.MeshStandardMaterial[] {
    const m = this.facadeLib.materials;
    return [m.landmarkGlass, m.brick, m.towerOrange, m.towerWhite];
  }

  setManifest(manifest: UrbanManifest, landmarks: UrbanLandmarkRecord[]): void {
    this.manifest = manifest;
    for (const lm of landmarks) {
      const lmGroup = buildProceduralLandmark(lm, this.facadeLib);
      this.landmarksGroup.add(lmGroup);
    }
  }

  getBuildingsInBounds(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): UrbanBuildingRecord[] {
    const out: UrbanBuildingRecord[] = [];
    for (const chunk of this.loaded.values()) {
      for (const b of chunk.buildings) {
        if (b.cx >= minX && b.cx <= maxX && b.cz >= minZ && b.cz <= maxZ) {
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Streams chunks within range, switches LOD0 <-> LOD1 with hysteresis band,
   * and applies frustum visibility checks.
   */
  updateForCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    getStreetscapeForCutaway(this.cutawayUniforms)?.updateForCamera(camera, target);
    if (!this.manifest) return;
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projScreen);

    const camPos = camera.position;
    const camDist = camPos.distanceTo(target);
    const allowLod0 = camDist < 2400;
    const loadRadius = Math.min(14_000, Math.max(5_400, camDist * 2.2));
    const lod0EnterRadius = 1550;
    const lod0ExitRadius = 2000;

    const candidates: { meta: UrbanChunkMeta; distToTarget: number }[] = [];
    for (const meta of this.manifest.chunks) {
      const distToTarget = Math.hypot(meta.centerX - target.x, meta.centerZ - target.z);
      if (distToTarget <= loadRadius) {
        candidates.push({ meta, distToTarget });
      }
    }
    candidates.sort((a, b) => a.distToTarget - b.distToTarget);

    let triggered = 0;
    for (const c of candidates) {
      if (this.loaded.has(c.meta.key) || this.loadingKeys.has(c.meta.key)) continue;
      if (this.loadingKeys.size + triggered >= 6) break;
      triggered++;
      void this.loadChunk(c.meta);
    }

    const box = new THREE.Box3();
    let lazyBuiltThisTick = 0;
    const lod0EvictRadius = 5800;

    for (const chunk of this.loaded.values()) {
      const half = (this.manifest.chunkSizeMeters ?? 2000) * 0.65;
      box.min.set(chunk.meta.centerX - half, -10, chunk.meta.centerZ - half);
      box.max.set(chunk.meta.centerX + half, 380, chunk.meta.centerZ + half);

      const inFrustum = frustum.intersectsBox(box);
      const distToCam = Math.hypot(chunk.meta.centerX - camPos.x, chunk.meta.centerZ - camPos.z);
      const distToTarget = Math.hypot(chunk.meta.centerX - target.x, chunk.meta.centerZ - target.z);

      if (chunk.lod0Group && distToTarget > lod0EvictRadius && distToCam > lod0EvictRadius) {
        this.disposeLod0(chunk);
      }

      if (!this.buildingsVisible || !inFrustum || distToTarget > loadRadius + 2800) {
        if (chunk.lod0Group) chunk.lod0Group.visible = false;
        chunk.lod1Mesh.visible = false;
        chunk.activeLod = -1;
      } else {
        const wantLod0 =
          allowLod0 &&
          (chunk.activeLod === 0
            ? distToCam < lod0ExitRadius || (chunk.meta.hub && distToTarget < 1800)
            : distToCam < lod0EnterRadius || (chunk.meta.hub && distToTarget < 1400));
        if (wantLod0) {
          if (!chunk.lod0Group && lazyBuiltThisTick < 2) {
            chunk.lod0Group = this.buildLod0Group(chunk.meta, chunk.buildings);
            this.group.add(chunk.lod0Group);
            lazyBuiltThisTick++;
          }
          if (chunk.lod0Group) {
            chunk.lod0Group.visible = true;
            chunk.lod1Mesh.visible = false;
            chunk.activeLod = 0;
          } else {
            chunk.lod1Mesh.visible = true;
            chunk.activeLod = 1;
          }
        } else {
          if (chunk.lod0Group) chunk.lod0Group.visible = false;
          chunk.lod1Mesh.visible = true;
          chunk.activeLod = 1;
        }
      }
    }
  }

  private disposeLod0(chunk: LoadedChunk): void {
    if (!chunk.lod0Group) return;
    chunk.lod0Group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.group.remove(chunk.lod0Group);
    chunk.lod0Group = null;
  }

  private async loadChunk(meta: UrbanChunkMeta): Promise<void> {
    this.loadingKeys.add(meta.key);
    try {
      const res = await fetch(`./data/urban-chunks/${meta.file}`);
      if (!res.ok) return;
      const data = (await res.json()) as UrbanChunkData;
      const built = this.buildChunkLod1(meta, data.buildings);
      this.loaded.set(meta.key, built);
      this.group.add(built.lod1Mesh);
      if (
        Math.abs(meta.centerX - SHIBUYA_SHOWCASE_ZONE.centerX) <= 1650 &&
        Math.abs(meta.centerZ - SHIBUYA_SHOWCASE_ZONE.centerZ) <= 1650
      ) {
        getStreetscapeForCutaway(this.cutawayUniforms)?.rebuildWithBuildings(
          this.getBuildingsInBounds(
            SHIBUYA_SHOWCASE_ZONE.centerX - SHIBUYA_SHOWCASE_ZONE.halfSizeM - 60,
            SHIBUYA_SHOWCASE_ZONE.centerX + SHIBUYA_SHOWCASE_ZONE.halfSizeM + 60,
            SHIBUYA_SHOWCASE_ZONE.centerZ - SHIBUYA_SHOWCASE_ZONE.halfSizeM - 60,
            SHIBUYA_SHOWCASE_ZONE.centerZ + SHIBUYA_SHOWCASE_ZONE.halfSizeM + 60,
          ),
        );
      }
      this.onChunkLoadedCb?.(meta, data.buildings);
    } catch {
      // Graceful degradation if chunk fetch fails offline
    } finally {
      this.loadingKeys.delete(meta.key);
    }
  }

  private buildLod0Group(meta: UrbanChunkMeta, buildings: UrbanBuildingRecord[]): THREE.Group {
    const lod0Group = new THREE.Group();
    lod0Group.name = `chunk-lod0-${meta.key}`;

    const buckets: BuildingGeometryBuckets = {
      walls: {
        officeGlassCool: [],
        officeGlassWarm: [],
        commercialStone: [],
        commercialMetal: [],
        commercialTile: [],
        concreteModern: [],
        residentialBalcony: [],
        residentialPlaster: [],
        groundStorefront: [],
        stationCivic: [],
        roofEquipment: [],
      },
      roofs: {
        roof: [],
        roofPitched: [],
      },
    };

    for (const b of buildings) {
      appendBuildingToBuckets(b, this.isDark, buckets);
    }

    const m = this.facadeLib.materials;
    const wallMaterials: Record<WallBucketKey, THREE.MeshStandardMaterial> = {
      officeGlassCool: m.officeGlassCool,
      officeGlassWarm: m.officeGlassWarm,
      commercialStone: m.commercialStone,
      commercialMetal: m.commercialMetal,
      commercialTile: m.commercialTile,
      concreteModern: m.concreteModern,
      residentialBalcony: m.residentialBalcony,
      residentialPlaster: m.residentialPlaster,
      groundStorefront: m.groundStorefront,
      stationCivic: m.stationCivic,
      roofEquipment: m.roofEquipment,
    };

    for (const key of Object.keys(buckets.walls) as WallBucketKey[]) {
      const geoms = buckets.walls[key];
      if (geoms.length === 0) continue;
      const merged = mergeGeometries(geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, wallMaterials[key]);
        mesh.castShadow =
          key !== 'groundStorefront' &&
          key !== 'residentialPlaster' &&
          key !== 'roofEquipment';
        mesh.receiveShadow = true;
        lod0Group.add(mesh);
      }
      geoms.forEach((g) => g.dispose());
    }

    const roofMaterials: Record<RoofBucketKey, THREE.MeshStandardMaterial> = {
      roof: m.roof,
      roofPitched: m.roofPitched,
    };

    for (const rKey of Object.keys(buckets.roofs) as RoofBucketKey[]) {
      const geoms = buckets.roofs[rKey];
      if (geoms.length === 0) continue;
      const merged = mergeGeometries(geoms, false);
      if (merged) {
        const roofMesh = new THREE.Mesh(merged, roofMaterials[rKey]);
        roofMesh.castShadow = false;
        roofMesh.receiveShadow = true;
        lod0Group.add(roofMesh);
      }
      geoms.forEach((g) => g.dispose());
    }

    return lod0Group;
  }

  private buildChunkLod1(meta: UrbanChunkMeta, buildings: UrbanBuildingRecord[]): LoadedChunk {
    const lod1Mesh = new THREE.InstancedMesh(
      this.unitBoxGeom,
      this.facadeLib.materials.instanced,
      buildings.length,
    );
    lod1Mesh.name = `chunk-lod1-${meta.key}`;
    lod1Mesh.castShadow = false;
    lod1Mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]!;
      // Extend LOD1 boxes down to y = -1.25m for watertight grounding
      dummy.position.set(b.cx, (b.h - 1.25) * 0.5, b.cz);
      dummy.rotation.set(0, -b.a, 0);
      dummy.scale.set(b.w, b.h + 1.25, b.d);
      dummy.updateMatrix();
      lod1Mesh.setMatrixAt(i, dummy.matrix);

      color.setHex(getBuildingTintHex(b.id, b.t, this.isDark));
      lod1Mesh.setColorAt(i, color);
    }
    lod1Mesh.instanceMatrix.needsUpdate = true;
    if (lod1Mesh.instanceColor) lod1Mesh.instanceColor.needsUpdate = true;
    lod1Mesh.computeBoundingSphere();

    lod1Mesh.visible = this.buildingsVisible;

    return { meta, buildings, lod0Group: null, lod1Mesh, activeLod: 1 };
  }

  setVisibilityAndOpacity(visible: boolean, opacity: number, cutawayActive = false): void {
    this.buildingsVisible = visible;
    this.currentOpacity = Math.max(0.08, Math.min(1.0, opacity));
    const outerTranslucent = !cutawayActive && this.currentOpacity < 0.99;
    this.landmarksGroup.visible = visible;

    const genericOpacity = cutawayActive
      ? this.currentOpacity < 0.55
        ? 0.65
        : 1.0
      : this.currentOpacity;
    const genericTranslucent = genericOpacity < 0.99;

    for (const mat of this.getGenericCityMaterials()) {
      const needRecompile = mat.transparent !== genericTranslucent;
      mat.transparent = genericTranslucent;
      mat.opacity = genericOpacity;
      mat.depthWrite = !genericTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }

    const lmOpacity = cutawayActive ? 0.34 : outerTranslucent ? this.currentOpacity : 1.0;
    const lmTranslucent = lmOpacity < 0.99;
    for (const mat of this.getLandmarkMaterials()) {
      const needRecompile = mat.transparent !== lmTranslucent;
      mat.transparent = lmTranslucent;
      mat.opacity = lmOpacity;
      mat.depthWrite = !lmTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }

    if (!visible) {
      for (const chunk of this.loaded.values()) {
        if (chunk.lod0Group) chunk.lod0Group.visible = false;
        chunk.lod1Mesh.visible = false;
      }
    }
    getStreetscapeForCutaway(this.cutawayUniforms)?.setVisibilityAndOpacity(
      visible,
      opacity,
      cutawayActive,
    );
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.facadeLib.setTheme(isDark);

    const color = new THREE.Color();
    for (const chunk of this.loaded.values()) {
      for (let i = 0; i < chunk.buildings.length; i++) {
        const b = chunk.buildings[i]!;
        color.setHex(getBuildingTintHex(b.id, b.t, isDark));
        chunk.lod1Mesh.setColorAt(i, color);
      }
      if (chunk.lod1Mesh.instanceColor) chunk.lod1Mesh.instanceColor.needsUpdate = true;
    }
  }

  getStats(): {
    loadedChunks: number;
    totalChunks: number;
    renderedBuildings: number;
    realOsmBuildings: number;
    infillBuildings: number;
    lod0Chunks: number;
    lod1Chunks: number;
    landmarkCount: number;
    provenance: BuildingProvenanceCounts;
  } {
    let renderedBuildings = 0;
    let realOsmBuildings = 0;
    let infillBuildings = 0;
    let lod0Chunks = 0;
    let lod1Chunks = 0;
    let osmExplicitHeight = 0;
    let osmLevels = 0;
    let osmEstimated = 0;
    let schematicInfill = 0;

    for (const c of this.loaded.values()) {
      if (c.activeLod === 0 || c.activeLod === 1) {
        if (c.activeLod === 0) lod0Chunks++;
        else lod1Chunks++;
        renderedBuildings += c.meta.count;
        realOsmBuildings += c.meta.realCount ?? c.meta.count;
        infillBuildings += c.meta.infillCount ?? 0;

        for (const b of c.buildings) {
          if (b.hb === 'o') osmExplicitHeight++;
          else if (b.hb === 'l') osmLevels++;
          else if (b.hb === 'i') osmEstimated++;
          else if (b.hb === 'p') schematicInfill++;
        }
      }
    }
    return {
      loadedChunks: this.loaded.size,
      totalChunks: this.manifest?.totalChunks ?? 0,
      renderedBuildings,
      realOsmBuildings,
      infillBuildings,
      lod0Chunks,
      lod1Chunks,
      landmarkCount: this.landmarksGroup.children.length,
      provenance: {
        osmExplicitHeight,
        osmLevels,
        osmEstimated,
        schematicInfill,
      },
    };
  }

  dispose(): void {
    for (const c of this.loaded.values()) {
      this.disposeLod0(c);
      c.lod1Mesh.dispose();
    }
    this.landmarksGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.unitBoxGeom.dispose();
    this.facadeLib.dispose();
  }
}
