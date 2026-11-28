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
  getEffectiveRiverWidth,
  isSurfaceRiverVisible,
  pointInPoly,
} from '../city/cityGeometryHelpers.js';
import { isPointInImperialExclusion } from '../city/imperialPalace.js';
import {
  isPointInTokyoBayWater,
  isPointOnHanedaAirport,
  isPointOnTokyoBayPort,
} from '../city/tokyoBayWaterfront.js';
import {
  SHIBUYA_SHOWCASE_ZONE,
  getStreetscapeForCutaway,
} from '../city/streetscapeRegistry.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import type { CityLightingUniforms } from '../materials/groundShader.js';
import {
  buildIrregularFootprintPoly,
  sample23WardFade,
  sampleDistrictProfile,
} from '../city/districtProfiles.js';
import {
  FacadeMaterialLibrary,
  getBuildingTintHex,
  selectFacadeVariant,
  type BuildingFacadeVariant,
} from '../materials/facadeLibrary.js';
import type {
  UrbanBaseEnvironment,
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
  contactAos: THREE.BufferGeometry[];
}

const PITCHED_ROOF_TINTS = [0xd8dce0, 0xc4cad0, 0xb8bec6, 0xd8c8bc] as const;

function makeContactAoApron(b: UrbanBuildingRecord): THREE.BufferGeometry {
  const pad = Math.min(2.2, Math.max(0.9, Math.min(b.w, b.d) * 0.12));
  const g = new THREE.PlaneGeometry(b.w + pad * 2, b.d + pad * 2);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-b.a);
  g.translate(b.cx, 0.028, b.cz);
  const ni = g.index ? g.toNonIndexed() : g;
  if (ni !== g) g.dispose();
  if (ni.getAttribute('uv')) ni.deleteAttribute('uv');
  ni.computeVertexNormals();
  return ni;
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
  const pitchedTint = PITCHED_ROOF_TINTS[Math.abs(b.id) % PITCHED_ROOF_TINTS.length]!;
  buckets.contactAos.push(makeContactAoApron(b));

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

  // Streamlined single-mass (or pitched low-rise) geometry for schematic infill (hb === 'p')
  // so high-density 2000-building chunks generate LOD0 rapidly while preserving multi-part
  // architectural massing for all real OSM buildings.
  if (b.hb === 'p') {
    const wantInfillPitched =
      b.t === 'r' &&
      b.h < 13 &&
      b.w <= 22 &&
      b.d <= 22 &&
      (Math.abs(b.id) % 11) < 6;
    if (wantInfillPitched) {
      const wallH = Math.max(4.0, b.h * 0.86);
      const ridgeH = Math.min(3.2, Math.max(1.4, Math.min(b.w, b.d) * 0.24));
      pushSplit(makeMassPart(b, -1.25, wallH + 1.25, 1.0), variant, 'roof', { discardRoof: true });
      const gableRaw = makeGableRoofRaw(
        b.cx,
        b.cz,
        b.w + 0.4,
        b.d + 0.4,
        b.a,
        wallH,
        ridgeH,
      );
      pushSplit(gableRaw, variant, 'roofPitched', { tintOverride: pitchedTint });
    } else {
      pushSplit(makeMassPart(b, -1.25, b.h + 1.25, 1.0), variant, 'roof');
    }
    return;
  }

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

function hashInfill(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Lightweight 8m-resolution Uint8Array spatial exclusion mask & 80m street-orientation field
 * covering Tokyo 23-ward core ([-11500..11500] x [-10500..10500]). Prevents runtime procedural infill
 * buildings from ever overlapping roads, rivers, Tokyo Bay, parks, rail corridors, plazas,
 * landmarks, or the Imperial Palace protected green enclosure.
 */
class UrbanInfillExclusionMask {
  private readonly cellSize = 10;
  private readonly minX = -15500;
  private readonly maxX = 14500;
  private readonly minZ = -13500;
  private readonly maxZ = 14500;
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;

  private readonly angleCellSize = 80;
  private readonly angleCols: number;
  private readonly angleRows: number;
  private readonly roadAngleQ: Int16Array;

  constructor(env: UrbanBaseEnvironment) {
    this.cols = Math.ceil((this.maxX - this.minX) / this.cellSize);
    this.rows = Math.ceil((this.maxZ - this.minZ) / this.cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);

    this.angleCols = Math.ceil((this.maxX - this.minX) / this.angleCellSize);
    this.angleRows = Math.ceil((this.maxZ - this.minZ) / this.angleCellSize);
    this.roadAngleQ = new Int16Array(this.angleCols * this.angleRows);

    // 1. Surface roads with tight sidewalk/curb clearance + street orientation field
    for (const r of env.roads) {
      if (r.el === 1 || r.pts.length < 2) continue;
      const clearance = r.w * 0.5 + 2.2;
      this.markPolyline(r.pts, clearance, true);
    }

    // 2. Road intersections
    for (const [ix, iz, rad] of env.intersections) {
      this.markDisc(ix, iz, rad + 3.0);
    }

    // 3. Surface rivers & canals
    for (const rv of env.riverLines) {
      if (!isSurfaceRiverVisible(rv.name) || rv.pts.length < 2) continue;
      const halfW = getEffectiveRiverWidth(rv.name, rv.width) * 0.5 + 5.5;
      this.markPolyline(rv.pts, halfW, false);
    }

    // 4. Railway ballast corridors
    if (env.railCorridors) {
      for (const c of env.railCorridors) {
        if (c.pts.length < 2) continue;
        this.markPolyline(c.pts, c.width * 0.5 + 5.0, false);
      }
    }

    // 5. Station forecourt plazas & hero landmarks
    if (env.stationPlazas) {
      for (const sp of env.stationPlazas) {
        this.markDisc(sp.x, sp.z, Math.max(sp.rx, sp.rz) + 3.5);
      }
    }
    for (const lm of env.landmarks) {
      const footprintR = Math.max(lm.width ?? 56, lm.depth ?? 56) * 0.58 + 8.0;
      this.markDisc(lm.x, lm.z, footprintR);
    }

    // 6. Water bodies, parks, pedestrian plazas & railway yards
    for (const wp of env.waterPolygons) this.markPolygon(wp.pts, 5);
    for (const pk of env.parkPolygons) this.markPolygon(pk.pts, 4);
    if (env.plazaPolygons) {
      for (const pl of env.plazaPolygons) this.markPolygon(pl.pts, 4);
    }
    if (env.landuseBlocks) {
      for (const blk of env.landuseBlocks) {
        if (blk.kind === 'railway') {
          this.markPolygon(blk.pts, 4);
        } else if (blk.kind === 'industrial' && blk.pts.some(([, z]) => z > 4200)) {
          this.markPolygon(blk.pts, 4);
        }
      }
    }
  }

  private markDisc(x: number, z: number, radiusM: number): void {
    if (
      x + radiusM < this.minX ||
      x - radiusM > this.maxX ||
      z + radiusM < this.minZ ||
      z - radiusM > this.maxZ
    ) {
      return;
    }
    const cMin = Math.max(0, Math.floor((x - radiusM - this.minX) / this.cellSize));
    const cMax = Math.min(this.cols - 1, Math.floor((x + radiusM - this.minX) / this.cellSize));
    const rMin = Math.max(0, Math.floor((z - radiusM - this.minZ) / this.cellSize));
    const rMax = Math.min(this.rows - 1, Math.floor((z + radiusM - this.minZ) / this.cellSize));
    const rSq = radiusM * radiusM;

    for (let r = rMin; r <= rMax; r++) {
      const cz = this.minZ + (r + 0.5) * this.cellSize;
      const dz = cz - z;
      const dzSq = dz * dz;
      const rowOff = r * this.cols;
      for (let c = cMin; c <= cMax; c++) {
        const cx = this.minX + (c + 0.5) * this.cellSize;
        const dx = cx - x;
        if (dx * dx + dzSq <= rSq) {
          this.blocked[rowOff + c] = 1;
        }
      }
    }
  }

  private recordAngle(x: number, z: number, angleRad: number): void {
    if (x < this.minX || x >= this.maxX || z < this.minZ || z >= this.maxZ) return;
    const ac = Math.floor((x - this.minX) / this.angleCellSize);
    const ar = Math.floor((z - this.minZ) / this.angleCellSize);
    if (ac < 0 || ac >= this.angleCols || ar < 0 || ar >= this.angleRows) return;
    const idx = ar * this.angleCols + ac;
    if (this.roadAngleQ[idx] !== 0) return;
    // Normalize into [-PI/2, PI/2) so building alignment is clean
    let a = angleRad % Math.PI;
    if (a > Math.PI * 0.5) a -= Math.PI;
    if (a < -Math.PI * 0.5) a += Math.PI;
    this.roadAngleQ[idx] = Math.round(a * 1000) + 1;
  }

  private markPolyline(pts: [number, number][], halfWidthM: number, recordRoadAngle: boolean): void {
    const stepM = 8.0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      if (
        Math.max(ax, bx) + halfWidthM < this.minX ||
        Math.min(ax, bx) - halfWidthM > this.maxX ||
        Math.max(az, bz) + halfWidthM < this.minZ ||
        Math.min(az, bz) - halfWidthM > this.maxZ
      ) {
        continue;
      }
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const angle = recordRoadAngle && len > 4 ? Math.atan2(dz, dx) : 0;
      const steps = Math.max(1, Math.ceil(len / stepM));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = ax + dx * t;
        const pz = az + dz * t;
        this.markDisc(px, pz, halfWidthM);
        if (recordRoadAngle && s % 2 === 0) {
          this.recordAngle(px, pz, angle);
        }
      }
    }
  }

  private markPolygon(pts: [number, number][], padM: number): void {
    if (pts.length < 3) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (
      maxX + padM < this.minX ||
      minX - padM > this.maxX ||
      maxZ + padM < this.minZ ||
      minZ - padM > this.maxZ
    ) {
      return;
    }

    const cMin = Math.max(0, Math.floor((minX - this.minX) / this.cellSize));
    const cMax = Math.min(this.cols - 1, Math.floor((maxX - this.minX) / this.cellSize));
    const rMin = Math.max(0, Math.floor((minZ - this.minZ) / this.cellSize));
    const rMax = Math.min(this.rows - 1, Math.floor((maxZ - this.minZ) / this.cellSize));

    for (let r = rMin; r <= rMax; r++) {
      const cz = this.minZ + (r + 0.5) * this.cellSize;
      const rowOff = r * this.cols;
      for (let c = cMin; c <= cMax; c++) {
        if (this.blocked[rowOff + c] !== 0) continue;
        const cx = this.minX + (c + 0.5) * this.cellSize;
        if (pointInPoly(cx, cz, pts)) {
          this.blocked[rowOff + c] = 1;
        }
      }
    }
    if (padM > 0) {
      this.markPolyline([...pts, pts[0]!], padM, false);
    }
  }

  isPointClear(x: number, z: number): boolean {
    // Accurate 12-vertex Imperial Palace + Kitanomaru + Kokyo Gaien moat-bounded enclosure
    if (isPointInImperialExclusion(x, z)) return false;
    // Accurate Tokyo Bay open water, Haneda Airport runways & container port zones exclusion
    if (isPointInTokyoBayWater(x, z)) return false;
    if (isPointOnHanedaAirport(x, z)) return false;
    if (isPointOnTokyoBayPort(x, z)) return false;

    if (x < this.minX || x >= this.maxX || z < this.minZ || z >= this.maxZ) return false;
    const c = Math.floor((x - this.minX) / this.cellSize);
    const r = Math.floor((z - this.minZ) / this.cellSize);
    return this.blocked[r * this.cols + c] === 0;
  }

  isFootprintClear(cx: number, cz: number, w: number, d: number, angle: number): boolean {
    if (!this.isPointClear(cx, cz)) return false;
    const hw = w * 0.5 + 0.8;
    const hd = d * 0.5 + 0.8;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const corners: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    for (const [lx, lz] of corners) {
      const wx = cx + lx * cosA - lz * sinA;
      const wz = cz + lx * sinA + lz * cosA;
      if (!this.isPointClear(wx, wz)) return false;
    }
    return true;
  }

  sampleRoadAngle(x: number, z: number): number {
    if (x < this.minX || x >= this.maxX || z < this.minZ || z >= this.maxZ) return 0;
    const ac = Math.floor((x - this.minX) / this.angleCellSize);
    const ar = Math.floor((z - this.minZ) / this.angleCellSize);
    for (let rad = 0; rad <= 2; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const r = ar + dr;
          const c = ac + dc;
          if (r < 0 || r >= this.angleRows || c < 0 || c >= this.angleCols) continue;
          const v = this.roadAngleQ[r * this.angleCols + c]!;
          if (v !== 0) return (v - 1) / 1000;
        }
      }
    }
    return Math.sin(x * 0.00068 + z * 0.00052) * 0.58 + Math.cos(x * 0.00041 - z * 0.00073) * 0.24;
  }
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
  private infillMask: UrbanInfillExclusionMask | null = null;
  private waterBounds: { minX: number; maxX: number; minZ: number; maxZ: number; pts: [number, number][] }[] = [];
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly loadingKeys = new Set<string>();
  private readonly unitBoxGeom = new THREE.BoxGeometry(1, 1, 1);
  private readonly facadeLib: FacadeMaterialLibrary;
  private readonly contactAoMaterial: THREE.MeshBasicMaterial;
  private readonly lightingUniforms?: CityLightingUniforms;
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
    lightingUniforms?: CityLightingUniforms,
  ) {
    this.isDark = isDark;
    this.lightingUniforms = lightingUniforms;
    this.cutawayUniforms = cutawayUniforms;
    this.onChunkLoadedCb = onChunkLoaded;
    this.group.name = 'city-buildings-chunked';
    this.landmarksGroup.name = 'tokyo-procedural-landmarks';
    this.group.add(this.landmarksGroup);
    this.facadeLib = new FacadeMaterialLibrary(isDark, clipPlanes, lightingUniforms);
    this.contactAoMaterial = new THREE.MeshBasicMaterial({
      color: 0x0e1218,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -0.2,
      polygonOffsetUnits: -0.2,
      clippingPlanes: clipPlanes,
    });

    if (cutawayUniforms) {
      for (const mat of this.getGenericCityMaterials()) {
        injectRadialCutaway(mat, cutawayUniforms, 'building');
      }
      for (const mat of this.getLandmarkMaterials()) {
        injectRadialCutaway(mat, cutawayUniforms, 'building');
      }
      injectRadialCutaway(
        this.contactAoMaterial as unknown as THREE.MeshStandardMaterial,
        cutawayUniforms,
        'terrain',
      );
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

  setEnvironmentForInfill(env: UrbanBaseEnvironment): void {
    this.infillMask = new UrbanInfillExclusionMask(env);
    this.waterBounds = env.waterPolygons.map((wp) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of wp.pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      return { minX, maxX, minZ, maxZ, pts: wp.pts };
    });
  }

  private isRuntimeWaterOrExclusion(b: UrbanBuildingRecord): boolean {
    if (b.t === 's') return false;
    if (isPointInTokyoBayWater(b.cx, b.cz)) return true;
    if (isPointInImperialExclusion(b.cx, b.cz)) return true;
    if (b.hb !== 'p') return false;
    for (let i = 0; i < this.waterBounds.length; i++) {
      const wb = this.waterBounds[i]!;
      if (b.cx < wb.minX || b.cx > wb.maxX || b.cz < wb.minZ || b.cz > wb.maxZ) continue;
      if (pointInPoly(b.cx, b.cz, wb.pts)) return true;
    }
    return false;
  }

  setNightFactor(nightFactor: number): void {
    this.facadeLib.setNightFactor(nightFactor);
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
    const allowLod0 = camDist < 5800;
    const loadRadius = Math.min(28_000, Math.max(9_500, camDist * 3.0));
    if (this.lightingUniforms) {
      this.lightingUniforms.uMaxLoadRadius.value = loadRadius;
    }
    const lod0EnterRadius = 3200;
    const lod0ExitRadius = 4000;

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
      if (this.loadingKeys.size + triggered >= 10) break;
      triggered++;
      void this.loadChunk(c.meta);
    }

    const box = new THREE.Box3();
    let lazyBuiltThisTick = 0;
    const lod0EvictRadius = 9000;

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

      if (!this.buildingsVisible || !inFrustum || distToTarget > loadRadius + 3600) {
        if (chunk.lod0Group) chunk.lod0Group.visible = false;
        chunk.lod1Mesh.visible = false;
        chunk.activeLod = -1;
      } else {
        const wantLod0 =
          allowLod0 &&
          (chunk.activeLod === 0
            ? distToCam < lod0ExitRadius || (chunk.meta.hub && distToTarget < 3600)
            : distToCam < lod0EnterRadius || (chunk.meta.hub && distToTarget < 2800));
        if (wantLod0) {
          if (!chunk.lod0Group && lazyBuiltThisTick < 4) {
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

  /**
   * Deterministically fills sparse Tokyo street-block sub-cells with road-oriented,
   * district-correlated parcel infill (`hb: 'p'`) strictly clear of roads, rivers,
   * Tokyo Bay, parks, rail corridors, landmarks, Imperial Palace, and existing OSM buildings.
   */
  private synthesizeChunkInfill(
    meta: UrbanChunkMeta,
    sourceBuildings: UrbanBuildingRecord[],
  ): { meta: UrbanChunkMeta; buildings: UrbanBuildingRecord[] } {
    if (!this.infillMask) {
      return { meta, buildings: sourceBuildings };
    }
    const chunkFade = sample23WardFade(meta.centerX, meta.centerZ);
    if (chunkFade < 0.03) {
      return { meta, buildings: sourceBuildings };
    }
    const chunkProfile = sampleDistrictProfile(meta.centerX, meta.centerZ);

    const chunkSize = this.manifest?.chunkSizeMeters ?? 2000;
    const half = chunkSize * 0.5;
    const chunkMinX = meta.centerX - half;
    const chunkMinZ = meta.centerZ - half;
    const minX = chunkMinX + 12;
    const maxX = meta.centerX + half - 12;
    const minZ = chunkMinZ + 12;
    const maxZ = meta.centerZ + half - 12;

    const occCell = 4;
    const occCols = Math.ceil((chunkSize + 64) / occCell);
    const occRows = Math.ceil((chunkSize + 64) / occCell);
    const occOriginX = chunkMinX - 32;
    const occOriginZ = chunkMinZ - 32;
    const occupied = new Uint8Array(occCols * occRows);

    const checkOrMarkRect = (
      cx: number,
      cz: number,
      w: number,
      d: number,
      angle: number,
      margin: number,
      mark: boolean,
    ): boolean => {
      const hw = w * 0.5 + margin;
      const hd = d * 0.5 + margin;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const aabbHalfX = Math.abs(hw * cosA) + Math.abs(hd * sinA);
      const aabbHalfZ = Math.abs(hw * sinA) + Math.abs(hd * cosA);

      const c0 = Math.max(0, Math.floor((cx - aabbHalfX - occOriginX) / occCell));
      const c1 = Math.min(occCols - 1, Math.floor((cx + aabbHalfX - occOriginX) / occCell));
      const r0 = Math.max(0, Math.floor((cz - aabbHalfZ - occOriginZ) / occCell));
      const r1 = Math.min(occRows - 1, Math.floor((cz + aabbHalfZ - occOriginZ) / occCell));

      for (let r = r0; r <= r1; r++) {
        const wz = occOriginZ + (r + 0.5) * occCell;
        const dz = wz - cz;
        const rowOff = r * occCols;
        for (let c = c0; c <= c1; c++) {
          const wx = occOriginX + (c + 0.5) * occCell;
          const dx = wx - cx;
          const lx = dx * cosA + dz * sinA;
          const lz = -dx * sinA + dz * cosA;
          if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
            if (mark) {
              occupied[rowOff + c] = 1;
            } else if (occupied[rowOff + c] !== 0) {
              return false;
            }
          }
        }
      }
      return true;
    };

    for (const b of sourceBuildings) {
      checkOrMarkRect(b.cx, b.cz, b.w, b.d, b.a, 1.5, true);
    }

    const combined = sourceBuildings.slice();
    const targetCount = Math.round((meta.hub ? 1580 : 1320) * (0.22 + 0.78 * chunkFade));
    if (combined.length >= targetCount) {
      return { meta, buildings: sourceBuildings };
    }

    const chunkSalt = Math.imul(meta.cx + 512, 73856093) ^ Math.imul(meta.cz + 512, 19349663);
    let nextId = 900_000_000 + Math.abs(chunkSalt % 80_000_000);
    let added = 0;

    // Stratified shuffled candidate sampling across the entire 2km x 2km chunk (eliminates strip/cluster bands!)
    const cellM =
      chunkProfile.typology === 'cbd_highrise'
        ? 30
        : chunkProfile.typology === 'commercial_hub'
          ? 26
          : 22;
    const gridN = Math.floor((chunkSize - 24) / cellM);
    const totalCells = gridN * gridN;

    const gcd = (a: number, b: number): number => {
      let x = a;
      let y = b;
      while (y !== 0) {
        const t = x % y;
        x = y;
        y = t;
      }
      return x;
    };
    let stride = Math.max(1, Math.floor(totalCells * 0.61803398875) | 1);
    while (gcd(stride, totalCells) !== 1) {
      stride += 2;
    }
    const startIdx = Math.abs(chunkSalt) % totalCells;

    for (let step = 0; step < totalCells && combined.length < targetCount; step++) {
      const idx = (startIdx + step * stride) % totalCells;
      const gx = idx % gridN;
      const gz = Math.floor(idx / gridN);
      const salt =
        chunkSalt ^
        Math.imul(gx * 73 + 11, 19349663) ^
        Math.imul(gz * 137 + 29, 83492791);

      const cx = minX + (gx + 0.08 + hashInfill(gx, gz, salt ^ 29) * 0.84) * cellM;
      const cz = minZ + (gz + 0.08 + hashInfill(gx, gz, salt ^ 53) * 0.84) * cellM;
      if (cx < minX || cx > maxX || cz < minZ || cz > maxZ) continue;

      const ptFade = sample23WardFade(cx, cz);
      if (ptFade < 0.02) continue;

      const profile = sampleDistrictProfile(cx, cz);
      const clusterNoise =
        0.5 +
        0.5 *
          Math.sin(cx * 0.0029 + Math.cos(cz * 0.0023) * 2.2) *
          Math.cos(cz * 0.0026 - Math.sin(cx * 0.0019) * 1.8);
      const rFade = hashInfill(gx, gz, salt ^ 11);
      const keepProb = ptFade * (0.68 + 0.52 * clusterNoise) * (1.0 - profile.courtyardVoidProb * 0.85);
      if (rFade > keepProb) continue;

      const baseAngle = this.infillMask.sampleRoadAngle(cx, cz);
      const rAng = hashInfill(gx, gz, salt ^ 71);
      const cornerRot = rAng > 0.74 ? Math.PI * 0.5 : 0;
      const angle = baseAngle + cornerRot + (hashInfill(gx, gz, salt ^ 83) - 0.5) * 0.14;

      const rW = hashInfill(gx, gz, salt ^ 97);
      const rD = hashInfill(gx, gz, salt ^ 149);
      const rH = hashInfill(gx, gz, salt ^ 191);
      const rShape = hashInfill(gx, gz, salt ^ 239);

      const w = profile.parcelWidthMin + rW * (profile.parcelWidthMax - profile.parcelWidthMin);
      const d = profile.parcelDepthMin + rD * (profile.parcelDepthMax - profile.parcelDepthMin);

      if (!checkOrMarkRect(cx, cz, w, d, angle, Math.max(1.8, profile.buildingGapM * 0.65), false)) {
        continue;
      }
      if (!this.infillMask.isFootprintClear(cx, cz, w, d, angle)) continue;

      const rawH =
        (profile.heightMin + Math.pow(rH, profile.heightExponent) * (profile.heightMax - profile.heightMin)) *
        (0.64 + 0.36 * ptFade);
      const typology: 'c' | 'r' | 'o' =
        rFade < profile.commercialRatio * ptFade
          ? rawH >= 42 && rShape < profile.officeShare
            ? 'o'
            : 'c'
          : 'r';
      const h = Math.round(Math.max(5.8, Math.min(68, rawH)) * 10) / 10;
      const irregularPoly =
        rShape < profile.irregularFootprintProb && w >= 9.5 && d >= 8.5
          ? buildIrregularFootprintPoly(w, d, angle, rShape * 11.3)
          : undefined;

      combined.push({
        id: nextId++,
        cx: Math.round(cx * 10) / 10,
        cz: Math.round(cz * 10) / 10,
        w: Math.round(w * 10) / 10,
        d: Math.round(d * 10) / 10,
        a: Math.round(angle * 1000) / 1000,
        h,
        hb: 'p',
        t: typology,
        ...(irregularPoly ? { p: irregularPoly } : {}),
      });
      checkOrMarkRect(cx, cz, w, d, angle, Math.max(1.8, profile.buildingGapM * 0.65), true);
      added++;
    }

    if (added === 0) return { meta, buildings: sourceBuildings };

    const realCount = meta.realCount ?? sourceBuildings.filter((b) => b.hb !== 'p').length;
    const prevInfill = meta.infillCount ?? sourceBuildings.filter((b) => b.hb === 'p').length;
    return {
      meta: {
        ...meta,
        count: combined.length,
        realCount,
        infillCount: prevInfill + added,
      },
      buildings: combined,
    };
  }

  private async loadChunk(meta: UrbanChunkMeta): Promise<void> {
    this.loadingKeys.add(meta.key);
    try {
      const res = await fetch(`./data/urban-chunks/${meta.file}`);
      if (!res.ok) return;
      const data = (await res.json()) as UrbanChunkData;
      const filteredBuildings = data.buildings.filter((b) => {
        if (this.isRuntimeWaterOrExclusion(b)) return false;
        const ptFade = sample23WardFade(b.cx, b.cz);
        if (b.t !== 's' && ptFade < 0.85) {
          const clusterN = 0.5 + 0.5 * Math.sin(b.cx * 0.0025 + b.cz * 0.0019);
          const keepP = Math.max(0, Math.min(1, (ptFade / 0.85) * (0.72 + 0.45 * clusterN)));
          if (hashInfill(b.id, Math.round(b.cx), 77) > keepP) return false;
        }
        return true;
      });
      const enriched = this.synthesizeChunkInfill(meta, filteredBuildings);
      const built = this.buildChunkLod1(enriched.meta, enriched.buildings);
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
      this.onChunkLoadedCb?.(enriched.meta, enriched.buildings);
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
      contactAos: [],
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

    if (buckets.contactAos.length > 0) {
      const mergedAo = mergeGeometries(buckets.contactAos, false);
      buckets.contactAos.forEach((g) => g.dispose());
      if (mergedAo) {
        const aoMesh = new THREE.Mesh(mergedAo, this.contactAoMaterial);
        aoMesh.name = `chunk-ao-${meta.key}`;
        aoMesh.castShadow = false;
        aoMesh.receiveShadow = false;
        aoMesh.renderOrder = 7;
        lod0Group.add(aoMesh);
      }
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
    this.currentOpacity = Math.max(0.05, Math.min(1.0, opacity));
    this.landmarksGroup.visible = visible;

    // Scheme A Global Ghost-Surface: smoothly honor ghost opacity across all buildings & landmarks
    const genericOpacity = cutawayActive
      ? Math.max(0.05, Math.min(0.85, this.currentOpacity))
      : this.currentOpacity;
    const genericTranslucent = genericOpacity < 0.99;

    for (const mat of this.getGenericCityMaterials()) {
      const needRecompile = mat.transparent !== genericTranslucent;
      mat.transparent = genericTranslucent;
      mat.opacity = genericOpacity;
      mat.depthWrite = !genericTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }

    const lmOpacity = cutawayActive
      ? Math.max(0.14, Math.min(0.85, this.currentOpacity + 0.08))
      : this.currentOpacity;
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
      if (chunk.lod0Group) {
        this.disposeLod0(chunk);
        chunk.activeLod = 1;
        chunk.lod1Mesh.visible = this.buildingsVisible;
      }
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
    this.contactAoMaterial.dispose();
    this.facadeLib.dispose();
  }
}
