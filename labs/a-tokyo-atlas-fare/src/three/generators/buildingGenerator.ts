/**
 * Procedural 3D Tokyo Building, Landmark, Spatial Chunk & Multi-Tier LOD System (P2).
 *
 * All geometry is procedurally generated in code from real OpenStreetMap building footprints,
 * heights, typologies, and clearly tagged schematic street-block infill (NO imported city models!):
 *  - LOD0 (Near, < 2050m / exit 2600m): Extruded footprints with meter-accurate wall UVs,
 *    separate concrete/gravel rooftop meshes, rooftop mechanical penthouses & setback crowns,
 *    per-building low-saturation Japanese architectural color variation & baked ground-contact AO.
 *  - LOD1/LOD2 (Mid/Far): Single textured InstancedMesh per chunk using real oriented bounding boxes
 *    and per-instance architectural tone variation.
 *  - Landmarks: 13 custom multi-part procedural silhouettes across Shibuya, Shinjuku,
 *    Tokyo/Marunouchi, Shinagawa, Ikebukuro, Roppongi, Shiba & Oshiage.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import { FacadeMaterialLibrary, getBuildingTintHex } from '../materials/facadeLibrary.js';
import type {
  UrbanBuildingRecord,
  UrbanChunkData,
  UrbanChunkMeta,
  UrbanLandmarkRecord,
  UrbanManifest,
} from '../types.js';

const _tmpColor = new THREE.Color();

interface SplitWallRoof {
  wall: THREE.BufferGeometry | null;
  roof: THREE.BufferGeometry | null;
}

/**
 * Splits a non-indexed BufferGeometry into vertical walls (with meter-scale box UVs &
 * ground-contact AO vertex colors) and upward-facing roofs (planar world UVs), while
 * discarding hidden downward-facing bottom caps to save ~15% triangles.
 */
function splitWallsAndRoof(
  source: THREE.BufferGeometry,
  tintHex: number,
  buildingTotalHeight: number,
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
  const aoSpan = Math.min(10, Math.max(4, buildingTotalHeight * 0.22));

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const ny = (norm.getY(i0) + norm.getY(i0 + 1) + norm.getY(i0 + 2)) / 3;

    // Discard invisible underground bottom caps
    if (ny < -0.68) continue;

    if (ny > 0.68) {
      // Flat architectural roof cap (slightly muted tone)
      for (let k = 0; k < 3; k++) {
        const idx = i0 + k;
        const x = pos.getX(idx);
        const y = pos.getY(idx);
        const z = pos.getZ(idx);
        roofPos.push(x, y, z);
        roofNorm.push(0, 1, 0);
        roofUv.push(x, z);
        roofCol.push(br * 0.93, bg * 0.93, bb * 0.94);
      }
    } else {
      // Vertical facade wall with meter-consistent UVs and ground-contact AO
      const avgAbsNx =
        (Math.abs(norm.getX(i0)) + Math.abs(norm.getX(i0 + 1)) + Math.abs(norm.getX(i0 + 2))) / 3;
      const avgAbsNz =
        (Math.abs(norm.getZ(i0)) + Math.abs(norm.getZ(i0 + 1)) + Math.abs(norm.getZ(i0 + 2))) / 3;
      const useZForU = avgAbsNx > avgAbsNz;

      for (let k = 0; k < 3; k++) {
        const idx = i0 + k;
        const x = pos.getX(idx);
        const y = pos.getY(idx);
        const z = pos.getZ(idx);
        const nx = norm.getX(idx);
        const nny = norm.getY(idx);
        const nz = norm.getZ(idx);
        wallPos.push(x, y, z);
        wallNorm.push(nx, nny, nz);
        wallUv.push(useZForU ? z : x, y);

        // Soft ground-contact AO darkening near street level (0..aoSpan meters)
        const ao = y < aoSpan ? 0.78 + 0.22 * Math.max(0, y / aoSpan) : 1.0;
        wallCol.push(br * ao, bg * ao, bb * ao);
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
  if (poly.length < 3 || height <= 0.5) return null;
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
 * Generates procedural architectural building massing for one building in LOD0:
 *  - High-rise offices: podium + shaft + upper terrace crown + rooftop mechanical core
 *  - Commercial blocks: lower retail mass + setback upper floors + rooftop parapet/equipment
 *  - Stations/civic halls: articulated concourse body + clerestory monitor skylight roof
 *  - Residential mansions: clean real footprint + rooftop elevator shaft / penthouse
 */
function buildProceduralBuildingSplit(
  b: UrbanBuildingRecord,
  isDark: boolean,
): { walls: THREE.BufferGeometry[]; roofs: THREE.BufferGeometry[] } {
  const rawParts: THREE.BufferGeometry[] = [];
  const hasPoly = Boolean(b.p && b.p.length >= 3);

  if (b.t === 'o' && b.h >= 45) {
    const podiumH = Math.min(14, b.h * 0.16);
    const shaftH = b.h * 0.72;
    const crownH = Math.max(4, b.h - podiumH - shaftH);
    const coreH = Math.min(7.5, Math.max(3.5, b.h * 0.05));

    if (hasPoly) {
      const p1 = extrudeFootprintRaw(b.cx, b.cz, b.p!, 0, podiumH, 1.0);
      const p2 = extrudeFootprintRaw(b.cx, b.cz, b.p!, podiumH, shaftH, 0.88);
      const p3 = extrudeFootprintRaw(b.cx, b.cz, b.p!, podiumH + shaftH, crownH, 0.72);
      if (p1) rawParts.push(p1);
      if (p2) rawParts.push(p2);
      if (p3) rawParts.push(p3);
    } else {
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w, b.d, b.a, 0, podiumH));
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w * 0.86, b.d * 0.86, b.a, podiumH, shaftH));
      rawParts.push(
        makeOrientedBoxRaw(b.cx, b.cz, b.w * 0.68, b.d * 0.68, b.a, podiumH + shaftH, crownH),
      );
    }
    rawParts.push(
      makeOrientedBoxRaw(
        b.cx,
        b.cz,
        Math.min(16, b.w * 0.38),
        Math.min(14, b.d * 0.36),
        b.a,
        b.h,
        coreH,
      ),
    );
  } else if (b.t === 'c' && b.h >= 22) {
    const lowerH = b.h * 0.78;
    const upperH = b.h - lowerH;
    if (hasPoly) {
      const p1 = extrudeFootprintRaw(b.cx, b.cz, b.p!, 0, lowerH, 1.0);
      const p2 = extrudeFootprintRaw(b.cx, b.cz, b.p!, lowerH, upperH, 0.84);
      if (p1) rawParts.push(p1);
      if (p2) rawParts.push(p2);
    } else {
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w, b.d, b.a, 0, lowerH));
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w * 0.84, b.d * 0.84, b.a, lowerH, upperH));
    }
    // Rooftop HVAC penthouse
    rawParts.push(
      makeOrientedBoxRaw(
        b.cx,
        b.cz,
        Math.min(10, b.w * 0.32),
        Math.min(9, b.d * 0.32),
        b.a,
        b.h,
        3.2,
      ),
    );
  } else if (b.t === 's') {
    const mainH = b.h * 0.82;
    const roofH = Math.max(2.8, b.h * 0.18);
    if (hasPoly) {
      const p1 = extrudeFootprintRaw(b.cx, b.cz, b.p!, 0, mainH, 1.0);
      const p2 = extrudeFootprintRaw(b.cx, b.cz, b.p!, mainH, roofH, 0.74);
      if (p1) rawParts.push(p1);
      if (p2) rawParts.push(p2);
    } else {
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w, b.d, b.a, 0, mainH));
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w * 0.74, b.d * 0.74, b.a, mainH, roofH));
    }
  } else {
    if (hasPoly) {
      const p1 = extrudeFootprintRaw(b.cx, b.cz, b.p!, 0, b.h, 1.0);
      if (p1) rawParts.push(p1);
    } else {
      rawParts.push(makeOrientedBoxRaw(b.cx, b.cz, b.w, b.d, b.a, 0, b.h));
    }
    if (b.h >= 16) {
      rawParts.push(
        makeOrientedBoxRaw(
          b.cx,
          b.cz,
          Math.min(7, b.w * 0.34),
          Math.min(7, b.d * 0.34),
          b.a,
          b.h,
          2.8,
        ),
      );
    }
  }

  const tintHex = getBuildingTintHex(b.id, b.t, isDark);
  const walls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];

  for (const raw of rawParts) {
    const { wall, roof } = splitWallsAndRoof(raw, tintHex, b.h);
    if (wall) walls.push(wall);
    if (roof) roofs.push(roof);
    raw.dispose();
  }

  return { walls, roofs };
}

/**
 * Generates distinctive multi-part procedural silhouettes for Tokyo's 13 major landmarks
 * covering Shibuya, Shinjuku, Tokyo/Marunouchi, Shinagawa, Ikebukuro, Roppongi, Shiba & Oshiage.
 */
function buildProceduralLandmark(
  lm: UrbanLandmarkRecord,
  lib: FacadeMaterialLibrary,
): THREE.Group {
  const g = new THREE.Group();
  g.name = `landmark-${lm.id}`;
  g.position.set(lm.x, 0, lm.z);

  const glassMat = lib.materials.landmarkGlass;
  const stoneMat = lib.materials.instanced;
  const brickMat = lib.materials.brick;
  const orangeMat = lib.materials.towerOrange;
  const whiteMat = lib.materials.towerWhite;

  switch (lm.kind) {
    case 'lattice_tower_orange': {
      // Tokyo Tower: alternating international orange & white tapered lattice sections + decks + spire
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
      // FootTown base podium
      const foot = new THREE.Mesh(new THREE.BoxGeometry(58, 18, 58), stoneMat);
      foot.position.y = 9;
      g.add(foot);
      break;
    }
    case 'skytree_tower': {
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
      g.add(lower, deck1, mid, deck2, spire);
      break;
    }
    case 'twin_stepped_tower': {
      // Tokyo Metropolitan Government Building (Shinjuku iconic twin Gothic-modern towers)
      const podium = new THREE.Mesh(new THREE.BoxGeometry(96, 150, 48), stoneMat);
      podium.position.y = 75;
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
      // Shinjuku Park Tower (Kenzo Tange iconic triple stepped pyramidal crowns!)
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(44, 162, 42), glassMat);
      b1.position.set(-22, 81, 0);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(44, 198, 42), glassMat);
      b2.position.set(0, 99, 0);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(44, 232, 42), glassMat);
      b3.position.set(22, 116, 0);
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
      const body = new THREE.Mesh(new THREE.SphereGeometry(24, 16, 14), glassMat);
      body.scale.set(1.0, 4.25, 0.85);
      body.position.y = 102;
      g.add(body);
      break;
    }
    case 'heritage_brick_station': {
      // Tokyo Station Marunouchi Heritage Red-Brick Hall (central portico + twin octagonal slate domes)
      const mainHall = new THREE.Mesh(new THREE.BoxGeometry(28, 20, 316), brickMat);
      mainHall.position.y = 10;
      const centerPavilion = new THREE.Mesh(new THREE.BoxGeometry(38, 27, 64), brickMat);
      centerPavilion.position.y = 13.5;
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
      // Marunouchi / Shin-Marunouchi iconic 31m limestone podium + setback glass high-rise
      const w = lm.width ?? 68;
      const d = lm.depth ?? 62;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(w, 34, d), stoneMat);
      podium.position.y = 17;
      const shaftH = Math.max(90, lm.height - 46);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, shaftH, d * 0.78), glassMat);
      shaft.position.y = 34 + shaftH * 0.5;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 12, d * 0.72), stoneMat);
      crown.position.y = 34 + shaftH + 6;
      g.add(podium, shaft, crown);
      break;
    }
    case 'glass_stepped_hub': {
      // Shibuya Scramble Square: crisp tall glass shaft + sky deck + lower retail terrace
      const w = lm.width ?? 62;
      const d = lm.depth ?? 48;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 60, d), stoneMat);
      lower.position.y = 30;
      const main = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 154, d * 0.82), glassMat);
      main.position.set(4, 60 + 77, 0);
      const skyDeck = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 16, d * 0.86), glassMat);
      skyDeck.position.set(4, 222, 0);
      g.add(lower, main, skyDeck);
      break;
    }
    case 'stepped_stream_tower': {
      // Shibuya Stream: modern stepped urban glass hub along Shibuya River
      const w = lm.width ?? 56;
      const d = lm.depth ?? 42;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(w, 32, d), stoneMat);
      podium.position.y = 16;
      const mid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 96, d * 0.84), glassMat);
      mid.position.set(-3, 32 + 48, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 52, d * 0.74), glassMat);
      top.position.set(2, 128 + 26, 0);
      g.add(podium, mid, top);
      break;
    }
    case 'tiered_cultural_tower': {
      // Shibuya Hikarie: stacked cantilevered cultural cubes
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(58, 52, 44), stoneMat);
      b1.position.y = 26;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(50, 56, 38), glassMat);
      b2.position.set(3, 52 + 28, 0);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(44, 74, 34), glassMat);
      b3.position.set(-2, 108 + 37, 0);
      g.add(b1, b2, b3);
      break;
    }
    case 'intercity_trio': {
      // Shinagawa Intercity A/B/C: three sculpted glass towers framing Shinagawa East Konan concourse
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
      const deck = new THREE.Mesh(new THREE.BoxGeometry(56, 12, 240), stoneMat);
      deck.position.set(0, 6, 0);
      g.add(deck);
      break;
    }
    case 'octagonal_crown_tower': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(36, 40, 210, 8), glassMat);
      shaft.position.y = 105;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(28, 34, 28, 8), stoneMat);
      crown.position.y = 224;
      g.add(shaft, crown);
      break;
    }
    default: {
      // Sunshine 60 slab skyscraper with twin mechanical shoulders
      const w = lm.width ?? 64;
      const d = lm.depth ?? 38;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(w * 1.18, 22, d * 1.3), stoneMat);
      podium.position.y = 11;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, lm.height, d), glassMat);
      slab.position.y = lm.height * 0.5;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 10, d * 0.72), stoneMat);
      crown.position.y = lm.height + 5;
      g.add(podium, slab, crown);
      break;
    }
  }

  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Scale UVs to true world meters so procedural facade textures render realistic floor heights on landmarks!
      const geom = obj.geometry;
      const pos = geom.getAttribute('position');
      const norm = geom.getAttribute('normal');
      if (pos && norm) {
        const sx = obj.scale.x;
        const sy = obj.scale.y;
        const sz = obj.scale.z;
        const uvs = new Float32Array(pos.count * 2);
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
        }
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
    }
  });
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
  private landmarks: UrbanLandmarkRecord[] = [];
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly loadingKeys = new Set<string>();
  private readonly unitBoxGeom = new THREE.BoxGeometry(1, 1, 1);
  private readonly facadeLib: FacadeMaterialLibrary;

  private isDark: boolean;
  private buildingsVisible = true;
  private currentOpacity = 1.0;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[], cutawayUniforms?: CutawayUniforms) {
    this.isDark = isDark;
    this.group.name = 'city-buildings-chunked';
    this.landmarksGroup.name = 'tokyo-procedural-landmarks';
    this.group.add(this.landmarksGroup);
    this.facadeLib = new FacadeMaterialLibrary(isDark, clipPlanes);

    if (cutawayUniforms) {
      // Discard generic city buildings cleanly inside the cutaway aperture while keeping outer Tokyo 100% opaque!
      // Hero landmarks (landmarkGlass/brick/towerOrange/towerWhite) stay as spatial orientation anchors!
      for (const mat of [
        this.facadeLib.materials.office,
        this.facadeLib.materials.commercial,
        this.facadeLib.materials.residential,
        this.facadeLib.materials.station,
        this.facadeLib.materials.roof,
        this.facadeLib.materials.instanced,
      ]) {
        injectRadialCutaway(mat, cutawayUniforms, 'building');
      }
    }
  }

  setManifest(manifest: UrbanManifest, landmarks: UrbanLandmarkRecord[]): void {
    this.manifest = manifest;
    this.landmarks = landmarks;
    for (const lm of landmarks) {
      const lmGroup = buildProceduralLandmark(lm, this.facadeLib);
      this.landmarksGroup.add(lmGroup);
    }
  }

  getLandmarks(): readonly UrbanLandmarkRecord[] {
    return this.landmarks;
  }

  /**
   * Streams chunks within range, switches LOD0 <-> LOD1 with P0 hysteresis band,
   * and applies frustum visibility checks!
   */
  updateForCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    if (!this.manifest) return;
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projScreen);

    const camPos = camera.position;
    const loadRadius = Math.min(14_000, Math.max(5_400, camPos.distanceTo(target) * 2.2));
    const lod0EnterRadius = 2050;
    const lod0ExitRadius = 2600;

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

      // P7 GPU Memory Eviction: dispose heavy LOD0 geometry for distant chunks while keeping LOD1 skyline!
      if (chunk.lod0Group && distToTarget > lod0EvictRadius && distToCam > lod0EvictRadius) {
        this.disposeLod0(chunk);
      }

      if (!this.buildingsVisible || !inFrustum || distToTarget > loadRadius + 2800) {
        if (chunk.lod0Group) chunk.lod0Group.visible = false;
        chunk.lod1Mesh.visible = false;
        chunk.activeLod = -1;
      } else {
        const wantLod0 =
          chunk.activeLod === 0
            ? distToCam < lod0ExitRadius || (chunk.meta.hub && distToTarget < 2100)
            : distToCam < lod0EnterRadius || (chunk.meta.hub && distToTarget < 1700);
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
      // P7 Lazy LOD0: build only ultra-light InstancedMesh LOD1 on fetch; LOD0 extrudes on demand!
      const built = this.buildChunkLod1(meta, data.buildings);
      this.loaded.set(meta.key, built);
      this.group.add(built.lod1Mesh);
    } catch {
      // Graceful degradation if chunk fetch fails offline
    } finally {
      this.loadingKeys.delete(meta.key);
    }
  }

  private buildLod0Group(
    meta: UrbanChunkMeta,
    buildings: UrbanBuildingRecord[],
  ): THREE.Group {
    const lod0Group = new THREE.Group();
    lod0Group.name = `chunk-lod0-${meta.key}`;
    const byTypology: Record<'o' | 'c' | 'r' | 's', THREE.BufferGeometry[]> = {
      o: [],
      c: [],
      r: [],
      s: [],
    };
    const allRoofs: THREE.BufferGeometry[] = [];

    for (const b of buildings) {
      const { walls, roofs } = buildProceduralBuildingSplit(b, this.isDark);
      byTypology[b.t].push(...walls);
      allRoofs.push(...roofs);
    }

    const matFor = (t: 'o' | 'c' | 'r' | 's') =>
      t === 'o'
        ? this.facadeLib.materials.office
        : t === 'c'
          ? this.facadeLib.materials.commercial
          : t === 's'
            ? this.facadeLib.materials.station
            : this.facadeLib.materials.residential;

    for (const key of ['o', 'c', 'r', 's'] as const) {
      const geoms = byTypology[key];
      if (geoms.length === 0) continue;
      const merged = mergeGeometries(geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, matFor(key));
        mesh.castShadow = key === 'o' || key === 'c' || key === 's';
        mesh.receiveShadow = true;
        lod0Group.add(mesh);
      }
      geoms.forEach((g) => g.dispose());
    }

    if (allRoofs.length > 0) {
      const mergedRoofs = mergeGeometries(allRoofs, false);
      if (mergedRoofs) {
        const roofMesh = new THREE.Mesh(mergedRoofs, this.facadeLib.materials.roof);
        roofMesh.castShadow = false;
        roofMesh.receiveShadow = true;
        lod0Group.add(roofMesh);
      }
      allRoofs.forEach((g) => g.dispose());
    }

    return lod0Group;
  }

  private buildChunkLod1(
    meta: UrbanChunkMeta,
    buildings: UrbanBuildingRecord[],
  ): LoadedChunk {
    // --- LOD1/LOD2: Single textured InstancedMesh with natural Japanese architectural palette ---
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
      dummy.position.set(b.cx, b.h * 0.5, b.cz);
      dummy.rotation.set(0, -b.a, 0);
      dummy.scale.set(b.w, b.h, b.d);
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

    // Generic buildings: stay 100% OPAQUE outside the circular cutaway pit (zero ghost soup!),
    // unless outer opacity is explicitly lowered below 0.55!
    const genericOpacity = cutawayActive ? (this.currentOpacity < 0.55 ? 0.65 : 1.0) : this.currentOpacity;
    const genericTranslucent = genericOpacity < 0.99;

    for (const mat of [
      this.facadeLib.materials.office,
      this.facadeLib.materials.commercial,
      this.facadeLib.materials.residential,
      this.facadeLib.materials.station,
      this.facadeLib.materials.roof,
      this.facadeLib.materials.instanced,
    ]) {
      const needRecompile = mat.transparent !== genericTranslucent;
      mat.transparent = genericTranslucent;
      mat.opacity = genericOpacity;
      mat.depthWrite = !genericTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }

    // Hero landmarks: crisp translucent spatial anchors inside Underground Cutaway Mode!
    const lmOpacity = cutawayActive ? 0.34 : outerTranslucent ? this.currentOpacity : 1.0;
    const lmTranslucent = lmOpacity < 0.99;
    for (const mat of [
      this.facadeLib.materials.landmarkGlass,
      this.facadeLib.materials.brick,
      this.facadeLib.materials.towerOrange,
      this.facadeLib.materials.towerWhite,
    ]) {
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
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.facadeLib.setTheme(isDark);

    // Refresh LOD1 instance colors cleanly for Day / Night palette
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

  /**
   * Read-only spatial collision resolver for Street-Level & Free Look camera anti-clipping.
   * Pushes camera out of loaded OSM buildings & landmarks in local OBB coordinates or raises cleanly over roofs.
   */
  resolveCameraCollision(
    pos: { x: number; y: number; z: number },
    clearanceM = 4.5,
    minY = 4.5,
  ): { x: number; y: number; z: number } {
    let x = pos.x;
    let y = Math.max(minY, pos.y);
    let z = pos.z;
    if (!this.buildingsVisible) return { x, y, z };

    // 1. Check landmarks (always loaded)
    for (const lm of this.landmarks) {
      if (y > lm.height + clearanceM) continue;
      const hw = (lm.width ?? lm.radius ?? 26) * 0.5 + clearanceM;
      const hd = (lm.depth ?? lm.radius ?? 26) * 0.5 + clearanceM;
      const dx = x - lm.x;
      const dz = z - lm.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const pushX = hw - Math.abs(dx);
        const pushZ = hd - Math.abs(dz);
        if (pushX < pushZ) {
          x += dx >= 0 ? pushX : -pushX;
        } else {
          z += dz >= 0 ? pushZ : -pushZ;
        }
      }
    }

    // 2. Check nearby loaded chunk buildings (only chunk containing or adjacent to camera)
    const chunkSize = this.manifest?.chunkSizeMeters ?? 2000;
    const camCx = Math.floor(x / chunkSize);
    const camCz = Math.floor(z / chunkSize);
    for (let dcx = -1; dcx <= 1; dcx++) {
      for (let dcz = -1; dcz <= 1; dcz++) {
        const chunk = this.loaded.get(`${camCx + dcx}_${camCz + dcz}`);
        if (!chunk) continue;
        for (const b of chunk.buildings) {
          if (y > b.h + clearanceM) continue;
          const dx = x - b.cx;
          const dz = z - b.cz;
          // Fast radial reject before oriented box check
          const maxSpan = (b.w + b.d) * 0.5 + clearanceM + 2;
          if (dx * dx + dz * dz > maxSpan * maxSpan) continue;

          const cosA = Math.cos(b.a);
          const sinA = Math.sin(b.a);
          // Transform offset into building local OBB space
          const lx = dx * cosA - dz * sinA;
          const lz = dx * sinA + dz * cosA;
          const hw = b.w * 0.5 + clearanceM;
          const hd = b.d * 0.5 + clearanceM;

          if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
            const penX = hw - Math.abs(lx);
            const penZ = hd - Math.abs(lz);
            let pushLx = 0;
            let pushLz = 0;
            if (penX < penZ) {
              pushLx = lx >= 0 ? penX : -penX;
            } else {
              pushLz = lz >= 0 ? penZ : -penZ;
            }
            // Rotate push back to world XZ
            x += pushLx * cosA + pushLz * sinA;
            z += -pushLx * sinA + pushLz * cosA;
          }
        }
      }
    }

    return { x, y, z };
  }

  describeNearestLandmark(pos: {
    x: number;
    z: number;
  }): { nameJa: string; nameEn: string; distanceM: number; bearingDeg: number } | null {
    if (this.landmarks.length === 0) return null;
    let best: UrbanLandmarkRecord | null = null;
    let bestD = Infinity;
    for (const lm of this.landmarks) {
      const d = Math.hypot(lm.x - pos.x, lm.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = lm;
      }
    }
    if (!best) return null;
    // Bearing from camera to landmark (0 = North = -Z, 90 = East = +X)
    const rad = Math.atan2(best.x - pos.x, -(best.z - pos.z));
    const bearingDeg = ((rad * 180) / Math.PI + 360) % 360;
    return {
      nameJa: best.nameJa,
      nameEn: best.nameEn,
      distanceM: Math.round(bestD),
      bearingDeg: Math.round(bearingDeg),
    };
  }

  getStats(): {
    loadedChunks: number;
    totalChunks: number;
    renderedBuildings: number;
    realOsmBuildings: number;
    infillBuildings: number;
    lod0Chunks: number;
    lod1Chunks: number;
  } {
    let renderedBuildings = 0;
    let realOsmBuildings = 0;
    let infillBuildings = 0;
    let lod0Chunks = 0;
    let lod1Chunks = 0;
    for (const c of this.loaded.values()) {
      if (c.activeLod === 0 || c.activeLod === 1) {
        if (c.activeLod === 0) lod0Chunks++;
        else lod1Chunks++;
        renderedBuildings += c.meta.count;
        realOsmBuildings += c.meta.realCount ?? c.meta.count;
        infillBuildings += c.meta.infillCount ?? 0;
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
