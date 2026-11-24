/**
 * Accurate Tokyo Bay Waterfront Coastline, Reclaimed Islands, Seawall Quays,
 * Port Container Terminals (Odaiba / Aomi / Oi Wharf), Oi Shinkansen Rail Yard Depots,
 * and Haneda Airport (HND) Procedural Architecture.
 *
 * Replaces the legacy 5-vertex straight-line ocean backdrop with realistic Tokyo Bay
 * reclaimed island landmasses and lightweight instanced/merged maritime & railway depot details
 * (~6 draw calls total).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import type { UrbanBaseEnvironment } from '../types.js';
import { pointInPoly } from './cityGeometryHelpers.js';

/**
 * Multi-point Tokyo Bay mainland ocean boundary polygon (world meters relative to Tokyo Station).
 * Follows real Tokyo 23-ward coastline from Urayasu/Kasai -> Tatsumi -> Tsukiji -> Takeshiba ->
 * Shibaura -> Shinagawa Konan -> Samezu -> Omori -> Tama River Mouth -> Kawasaki -> Tokyo Bay.
 */
export const TOKYO_BAY_OCEAN_POLYGON: readonly [number, number][] = [
  [12921, 4579],
  [10661, 4801],
  [8852, 4468],
  [7044, 4579],
  [6140, 3467],
  [5235, 3578],
  [4060, 2912],
  [2794, 2134],
  [1347, 1911],
  [81, 2356],
  [-552, 3245],
  [-1004, 4468],
  [-1637, 5579],
  [-1727, 6690],
  [-2089, 8135],
  [-2360, 10135],
  [-2179, 12580],
  [-1817, 14358],
  [-1365, 15470],
  [-2270, 16803],
  [-1094, 19026],
  [-2450, 22360],
  [-6067, 25694],
  [25580, 25694],
  [25580, 2356],
  [17442, 2912],
];

export interface ReclaimedIslandSpec {
  id: string;
  name: string;
  kind: 'urban' | 'port' | 'airport';
  pts: readonly [number, number][];
}

/**
 * Reclaimed artificial islands in Tokyo Bay (aligned to OSM roads, bridges, parks & port blocks).
 */
export const TOKYO_BAY_ISLANDS: readonly ReclaimedIslandSpec[] = [
  {
    id: 'harumi-toyosu',
    name: 'Harumi / Toyosu',
    kind: 'urban',
    pts: [
      [580, 2680],
      [1890, 2245],
      [3180, 2790],
      [3380, 4050],
      [2071, 4380],
      [680, 3810],
    ],
  },
  {
    id: 'tatsumi-shinkiba',
    name: 'Tatsumi / Shin-Kiba / Yumenoshima',
    kind: 'urban',
    pts: [
      [3450, 3120],
      [6450, 3245],
      [6620, 4720],
      [4602, 5060],
      [3517, 4260],
    ],
  },
  {
    id: 'ariake',
    name: 'Ariake',
    kind: 'urban',
    pts: [
      [1360, 4780],
      [2630, 4220],
      [3420, 5023],
      [2880, 6680],
      [1680, 6080],
    ],
  },
  {
    id: 'odaiba-aomi',
    name: 'Odaiba / Aomi Container Terminal',
    kind: 'port',
    pts: [
      [-190, 5560],
      [840, 5110],
      [1480, 5580],
      [2860, 5940],
      [2860, 7560],
      [2380, 8890],
      [860, 8880],
      [480, 8220],
      [310, 6800],
    ],
  },
  {
    id: 'shinagawa-oi-wharf',
    name: 'Shinagawa Wharf / Oi Wharf & Shinkansen Rail Yard',
    kind: 'port',
    pts: [
      [-1460, 4020],
      [-540, 4020],
      [-480, 5780],
      [-320, 7750],
      [-260, 10840],
      [-1440, 10860],
      [-1640, 8357],
      [-1546, 6579],
    ],
  },
  {
    id: 'central-breakwater',
    name: 'Central Breakwater Reclaimed Islands',
    kind: 'port',
    pts: [
      [2380, 7480],
      [4420, 7520],
      [4440, 9480],
      [2460, 9160],
    ],
  },
  {
    id: 'heiwajima-showajima',
    name: 'Heiwajima / Showajima',
    kind: 'port',
    pts: [
      [-1998, 10620],
      [-480, 10820],
      [-220, 12580],
      [-1546, 12803],
    ],
  },
  {
    id: 'jonanjima-keihinjima',
    name: 'Jonanjima / Keihinjima',
    kind: 'port',
    pts: [
      [-160, 10940],
      [1820, 11140],
      [1640, 12580],
      [-20, 12360],
    ],
  },
  {
    id: 'haneda-airport',
    name: 'Haneda International Airport (HND)',
    kind: 'airport',
    pts: [
      [-1275, 13247],
      [1347, 12914],
      [3156, 14136],
      [3517, 16025],
      [2071, 16692],
      [-461, 16137],
      [-1546, 14914],
    ],
  },
  {
    id: 'haneda-runway-d',
    name: 'Haneda Runway D Pier (05/23)',
    kind: 'airport',
    pts: [
      [2520, 16100],
      [4850, 15020],
      [5120, 15580],
      [2820, 16660],
    ],
  },
];

/**
 * Returns true if world coordinate `(x, z)` lies over open Tokyo Bay water
 * (inside the ocean coastline polygon and NOT on any reclaimed artificial island).
 */
export function isPointInTokyoBayWater(x: number, z: number): boolean {
  if (z < 1850) return false;
  if (!pointInPoly(x, z, TOKYO_BAY_OCEAN_POLYGON as [number, number][])) return false;
  for (const isl of TOKYO_BAY_ISLANDS) {
    if (pointInPoly(x, z, isl.pts as [number, number][])) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if `(x, z)` lies on Haneda Airport landmass (protects runways from urban infill).
 */
export function isPointOnHanedaAirport(x: number, z: number): boolean {
  if (z < 12800 || z > 17000 || x < -1700 || x > 5300) return false;
  for (const isl of TOKYO_BAY_ISLANDS) {
    if (isl.kind === 'airport' && pointInPoly(x, z, isl.pts as [number, number][])) {
      return true;
    }
  }
  return false;
}

function hashDet(x: number, z: number, salt = 31): number {
  const h = Math.sin(x * 0.0173 + z * 0.0291 + salt * 43.17) * 43758.5453123;
  return h - Math.floor(h);
}

function expandPolygonOutward(pts: readonly [number, number][], padM: number): [number, number][] {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of pts) {
    cx += x;
    cz += z;
  }
  cx /= pts.length;
  cz /= pts.length;
  return pts.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const len = Math.hypot(dx, dz) || 1;
    return [x + (dx / len) * padM, z + (dz / len) * padM];
  });
}

function buildFlatWorldPoly(pts: readonly [number, number][], y: number): THREE.BufferGeometry | null {
  if (pts.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0]![0], -pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i]![0], -pts[i]![1]);
  }
  shape.closePath();
  const raw = new THREE.ShapeGeometry(shape);
  raw.rotateX(-Math.PI / 2);
  raw.translate(0, y, 0);
  const g = raw.index ? raw.toNonIndexed() : raw;
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = pos.getX(i);
    uvs[i * 2 + 1] = pos.getZ(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (g !== raw) raw.dispose();
  return g;
}

function createGantryCraneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const push = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    parts.push(b.toNonIndexed());
  };
  // Four portal legs (height 34m)
  for (const lx of [-5.5, 5.5]) {
    for (const lz of [-7.5, 7.5]) {
      push(1.4, 34, 1.4, lx, 17, lz);
    }
  }
  // Upper portal frame & machinery house
  push(13, 3.2, 17, 0, 32, 0);
  push(8.5, 5.5, 11, 0, 36.5, 0);
  // Long cantilevered seaside + landside boom (48m span along +X)
  push(48, 2.2, 4.2, 8, 28, 0);
  // Top A-frame apex & stay tie beams
  push(2.0, 12, 12, 0, 44, 0);

  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function createRunwayStripeTexture(isDark: boolean): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#1d232c' : '#3a4048';
    ctx.fillRect(0, 0, w, h);

    // Side edge lines
    ctx.fillStyle = isDark ? 'rgba(226,232,240,0.72)' : 'rgba(248,250,252,0.88)';
    ctx.fillRect(10, 0, 4, h);
    ctx.fillRect(w - 14, 0, 4, h);

    // Centerline dashes
    for (let y = 18; y < h; y += 64) {
      ctx.fillRect(w / 2 - 2, y, 4, 34);
    }

    // Touchdown zone piano-key threshold markings near ends
    for (let x = 22; x < w - 22; x += 12) {
      if (Math.abs(x - w / 2) < 9) continue;
      ctx.fillRect(x, 12, 6, 36);
      ctx.fillRect(x, h - 48, 6, 36);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CONTAINER_PALETTE = [
  0xb91c1c, // Maritime crimson (K-Line / Hamburg)
  0x0369a1, // Ocean blue (Maersk)
  0xd9468f, // ONE magenta (Japan Ocean Network Express!)
  0x15803d, // Evergreen green
  0xc2410c, // Hapag-Lloyd orange
  0x1e3a5f, // Deep navy (NYK / MOL)
  0xdbe3ec, // Reefer white
  0xb45309, // Ochre brown
];

export interface BayfrontDetailHandle {
  readonly group: THREE.Group;
  setTheme(isDark: boolean): void;
  setOpacity(opacity: number, isTranslucent: boolean): void;
  dispose(): void;
}

/**
 * Builds the realistic Tokyo Bay reclaimed islands, concrete seawalls, port container stacks,
 * quay gantry cranes, Oi & Shinagawa rail-yard inspection sheds + parked trains, and Haneda Airport.
 */
export function buildTokyoBayWaterfront(
  env: UrbanBaseEnvironment,
  isDark: boolean,
  clipPlanes: THREE.Plane[],
  groundMaterial: THREE.MeshStandardMaterial,
  quayMaterial: THREE.MeshStandardMaterial,
  cutawayUniforms?: CutawayUniforms,
): BayfrontDetailHandle {
  const group = new THREE.Group();
  group.name = 'tokyo-bay-waterfront-architecture';

  const islandSeawallGeoms: THREE.BufferGeometry[] = [];
  const islandGroundGeoms: THREE.BufferGeometry[] = [];

  for (let i = 0; i < TOKYO_BAY_ISLANDS.length; i++) {
    const isl = TOKYO_BAY_ISLANDS[i]!;
    const expanded = expandPolygonOutward(isl.pts, 26);
    const seawall = buildFlatWorldPoly(expanded, -0.74 + (i % 3) * 0.004);
    if (seawall) islandSeawallGeoms.push(seawall);

    const ground = buildFlatWorldPoly(isl.pts, -0.68 + (i % 3) * 0.004);
    if (ground) islandGroundGeoms.push(ground);
  }

  const addMerged = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    renderOrder: number,
    castShadow = false,
  ) => {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = castShadow;
    mesh.renderOrder = renderOrder;
    group.add(mesh);
  };

  addMerged(islandSeawallGeoms, quayMaterial, 'tokyo-bay-island-seawalls', 1);
  addMerged(islandGroundGeoms, groundMaterial, 'tokyo-bay-reclaimed-islands', 1);

  // ---- Materials for 3D Port & Depot Architecture ----
  const containerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.28,
    clippingPlanes: clipPlanes,
  });
  const craneMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0xb83b32 : 0xd64538,
    roughness: 0.48,
    metalness: 0.35,
    clippingPlanes: clipPlanes,
  });
  const depotHallMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x475569 : 0xc8cfd8,
    roughness: 0.58,
    metalness: 0.36,
    clippingPlanes: clipPlanes,
  });
  const parkedTrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0.42,
    clippingPlanes: clipPlanes,
  });
  let runwayTex = createRunwayStripeTexture(isDark);
  const runwayMat = new THREE.MeshStandardMaterial({
    map: runwayTex,
    roughness: 0.86,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    clippingPlanes: clipPlanes,
  });
  const terminalMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x52657a : 0xdde4ec,
    roughness: 0.38,
    metalness: 0.35,
    emissive: new THREE.Color(isDark ? 0xffe4b5 : 0x000000),
    emissiveIntensity: isDark ? 0.35 : 0.0,
    clippingPlanes: clipPlanes,
  });

  const detailMaterials = [
    containerMat,
    craneMat,
    depotHallMat,
    parkedTrainMat,
    terminalMat,
  ];
  if (cutawayUniforms) {
    for (const m of detailMaterials) {
      injectRadialCutaway(m, cutawayUniforms, 'building');
    }
    injectRadialCutaway(runwayMat, cutawayUniforms, 'terrain');
  }

  // ---- 1. Port Container Stacks, Warehouses & Quay Gantry Cranes inside Bayfront Industrial Blocks ----
  const containerRecords: { x: number; z: number; h: number; a: number; color: number }[] = [];
  const craneRecords: { x: number; z: number; a: number }[] = [];
  const depotHallRecords: { x: number; z: number; w: number; h: number; d: number; a: number }[] = [];
  const parkedTrainRecords: { x: number; z: number; len: number; a: number; color: number }[] = [];

  const blocks = env.landuseBlocks ?? [];
  for (let bi = 0; bi < blocks.length; bi++) {
    const blk = blocks[bi]!;
    if (blk.pts.length < 3) continue;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, z] of blk.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;

    // Focus on southern bayfront port / industrial blocks (z > 4200, substantial footprint)
    if (blk.kind === 'industrial' && maxZ > 4200 && spanX * spanZ > 120_000) {
      // Longest edge determines container row orientation
      let bestLen = 0;
      let rowAngle = 0;
      for (let i = 0; i < blk.pts.length; i++) {
        const p0 = blk.pts[i]!;
        const p1 = blk.pts[(i + 1) % blk.pts.length]!;
        const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (l > bestLen) {
          bestLen = l;
          rowAngle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        }
      }

      // Place container yard rows + logistics warehouses
      const stepX = 34;
      const stepZ = 22;
      for (let x = minX + 24; x < maxX - 24 && containerRecords.length < 1800; x += stepX) {
        for (let z = minZ + 20; z < maxZ - 20 && containerRecords.length < 1800; z += stepZ) {
          if (!pointInPoly(x, z, blk.pts)) continue;
          const r = hashDet(x, z, bi + 7);
          if (r < 0.28) continue; // leave realistic truck aisles
          if (r > 0.87 && depotHallRecords.length < 220) {
            // Port logistics warehouse shed
            depotHallRecords.push({
              x,
              z,
              w: 28 + hashDet(x, z, 19) * 18,
              h: 9 + hashDet(x, z, 23) * 6,
              d: 18 + hashDet(x, z, 29) * 10,
              a: rowAngle,
            });
          } else {
            // Intermodal container stack (2..4 containers high -> 5.2m..10.4m)
            const tiers = 2 + Math.floor(hashDet(x, z, 41) * 3);
            const colIdx = Math.floor(hashDet(x, z, 53) * CONTAINER_PALETTE.length);
            containerRecords.push({
              x,
              z,
              h: tiers * 2.6,
              a: rowAngle,
              color: CONTAINER_PALETTE[colIdx]!,
            });
          }
        }
      }

      // Line iconic red-white quay gantry cranes along eastern/southern berth edges
      if (spanZ > 450 && craneRecords.length < 70) {
        const quayX = maxX - 18;
        for (let z = minZ + 90; z < maxZ - 90 && craneRecords.length < 70; z += 135) {
          if (pointInPoly(quayX - 25, z, blk.pts)) {
            craneRecords.push({ x: quayX, z, a: 0 });
          }
        }
      }
    }

    // Railway yards (Oi Shinkansen Depot, Shinagawa Yard, etc.): add ribbed maintenance halls & parked trains!
    if (blk.kind === 'railway' && spanX * spanZ > 80_000) {
      let bestLen = 0;
      let trackAngle = Math.PI * 0.5;
      for (let i = 0; i < blk.pts.length; i++) {
        const p0 = blk.pts[i]!;
        const p1 = blk.pts[(i + 1) % blk.pts.length]!;
        const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (l > bestLen) {
          bestLen = l;
          trackAngle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        }
      }

      const isOiShinkansenYard = minZ > 7200 && maxX > -1200 && minX < -300;
      const stepX = 30;
      const stepZ = 165;
      for (let x = minX + 22; x < maxX - 22; x += stepX) {
        for (let z = minZ + 70; z < maxZ - 70; z += stepZ) {
          if (!pointInPoly(x, z, blk.pts)) continue;
          const r = hashDet(x, z, bi + 91);
          if (r < 0.36 && depotHallRecords.length < 260) {
            // Long-span railway maintenance inspection shed
            depotHallRecords.push({
              x,
              z,
              w: 115,
              h: 10.5,
              d: 22,
              a: trackAngle,
            });
          } else if (r < 0.85 && parkedTrainRecords.length < 320) {
            // Parked static Shinkansen (white/blue N700S) or commuter consist rows
            parkedTrainRecords.push({
              x,
              z,
              len: isOiShinkansenYard ? 135 : 95,
              a: trackAngle,
              color: isOiShinkansenYard
                ? r > 0.6
                  ? 0xeef3f8
                  : 0xdbe7f5
                : r > 0.62
                  ? 0xcbd5e1
                  : 0xb8d4b0,
            });
          }
        }
      }
    }
  }

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Instanced shipping containers (1 draw call)
  let containerInst: THREE.InstancedMesh | null = null;
  if (containerRecords.length > 0) {
    const geom = new THREE.BoxGeometry(12.2, 1, 5.2);
    geom.translate(0, 0.5, 0);
    containerInst = new THREE.InstancedMesh(geom, containerMat, containerRecords.length);
    containerInst.name = 'tokyo-bay-shipping-containers';
    containerInst.receiveShadow = true;
    for (let i = 0; i < containerRecords.length; i++) {
      const c = containerRecords[i]!;
      dummy.position.set(c.x, -0.5, c.z);
      dummy.rotation.set(0, -c.a, 0);
      dummy.scale.set(1, c.h, 1);
      dummy.updateMatrix();
      containerInst.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(c.color);
      containerInst.setColorAt(i, tmpColor);
    }
    containerInst.instanceMatrix.needsUpdate = true;
    if (containerInst.instanceColor) containerInst.instanceColor.needsUpdate = true;
    containerInst.computeBoundingSphere();
    group.add(containerInst);
  }

  // Instanced quay gantry cranes (1 draw call)
  let craneInst: THREE.InstancedMesh | null = null;
  if (craneRecords.length > 0) {
    const geom = createGantryCraneGeometry();
    craneInst = new THREE.InstancedMesh(geom, craneMat, craneRecords.length);
    craneInst.name = 'tokyo-bay-gantry-cranes';
    craneInst.castShadow = true;
    craneInst.receiveShadow = true;
    for (let i = 0; i < craneRecords.length; i++) {
      const cr = craneRecords[i]!;
      dummy.position.set(cr.x, -0.5, cr.z);
      dummy.rotation.set(0, cr.a, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      craneInst.setMatrixAt(i, dummy.matrix);
    }
    craneInst.instanceMatrix.needsUpdate = true;
    craneInst.computeBoundingSphere();
    group.add(craneInst);
  }

  // Instanced railway depot inspection sheds & port warehouses (1 draw call)
  let depotInst: THREE.InstancedMesh | null = null;
  if (depotHallRecords.length > 0) {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    geom.translate(0, 0.5, 0);
    depotInst = new THREE.InstancedMesh(geom, depotHallMat, depotHallRecords.length);
    depotInst.name = 'tokyo-bay-rail-depots-warehouses';
    depotInst.castShadow = true;
    depotInst.receiveShadow = true;
    for (let i = 0; i < depotHallRecords.length; i++) {
      const d = depotHallRecords[i]!;
      dummy.position.set(d.x, -0.45, d.z);
      dummy.rotation.set(0, -d.a, 0);
      dummy.scale.set(d.w, d.h, d.d);
      dummy.updateMatrix();
      depotInst.setMatrixAt(i, dummy.matrix);
    }
    depotInst.instanceMatrix.needsUpdate = true;
    depotInst.computeBoundingSphere();
    group.add(depotInst);
  }

  // Instanced parked static train consists inside rail yards (1 draw call)
  let parkedTrainInst: THREE.InstancedMesh | null = null;
  if (parkedTrainRecords.length > 0) {
    const geom = new THREE.BoxGeometry(1, 3.6, 3.2);
    geom.translate(0, 1.8, 0);
    parkedTrainInst = new THREE.InstancedMesh(geom, parkedTrainMat, parkedTrainRecords.length);
    parkedTrainInst.name = 'tokyo-bay-parked-yard-trains';
    parkedTrainInst.receiveShadow = true;
    for (let i = 0; i < parkedTrainRecords.length; i++) {
      const tr = parkedTrainRecords[i]!;
      dummy.position.set(tr.x, -0.2, tr.z);
      dummy.rotation.set(0, -tr.a, 0);
      dummy.scale.set(tr.len, 1, 1);
      dummy.updateMatrix();
      parkedTrainInst.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(tr.color);
      parkedTrainInst.setColorAt(i, tmpColor);
    }
    parkedTrainInst.instanceMatrix.needsUpdate = true;
    if (parkedTrainInst.instanceColor) parkedTrainInst.instanceColor.needsUpdate = true;
    parkedTrainInst.computeBoundingSphere();
    group.add(parkedTrainInst);
  }

  // ---- 2. Haneda International Airport (HND): 4 Marked Runways + Terminals 1, 2, 3 & Control Tower ----
  const runwayGeoms: THREE.BufferGeometry[] = [];
  const runways: { cx: number; cz: number; len: number; wid: number; rotY: number }[] = [
    // Runway A (16R/34L) — west side NNW-SSE
    { cx: 520, cz: 14720, len: 2950, wid: 66, rotY: 0.42 },
    // Runway C (16L/34R) — east side parallel NNW-SSE
    { cx: 2150, cz: 14880, len: 3180, wid: 66, rotY: 0.42 },
    // Runway B (04/22) — northern crosswind ENE-WSW
    { cx: 880, cz: 13640, len: 2420, wid: 62, rotY: -1.16 },
    // Runway D (05/23) — reclaimed offshore pier ENE-WSW
    { cx: 3820, cz: 15840, len: 2450, wid: 62, rotY: -1.14 },
  ];
  for (const rw of runways) {
    const g = new THREE.PlaneGeometry(rw.wid, rw.len);
    g.rotateX(-Math.PI / 2);
    g.rotateY(rw.rotY);
    g.translate(rw.cx, -0.42, rw.cz);
    runwayGeoms.push(g.index ? g.toNonIndexed() : g);
  }
  addMerged(runwayGeoms, runwayMat, 'haneda-airport-runways', 3);

  const terminalGeoms: THREE.BufferGeometry[] = [];
  const pushTerminal = (w: number, h: number, d: number, x: number, z: number, rotY: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(rotY);
    g.translate(x, h * 0.5 - 0.5, z);
    terminalGeoms.push(g.toNonIndexed());
  };
  // Terminal 1 (West domestic concourse)
  pushTerminal(90, 22, 560, 1080, 14840, 0.42);
  // Terminal 2 (East domestic concourse)
  pushTerminal(90, 22, 620, 1520, 14720, 0.42);
  // Terminal 3 (International terminal, west of Runway A)
  pushTerminal(120, 24, 420, -180, 15120, 0.42);
  // Haneda Air Traffic Control Tower (116m icon)
  const towerShaft = new THREE.CylinderGeometry(7, 11, 106, 12);
  towerShaft.translate(1280, 52, 14780);
  terminalGeoms.push(towerShaft.toNonIndexed());
  const towerCab = new THREE.CylinderGeometry(16, 12, 14, 12);
  towerCab.translate(1280, 109, 14780);
  terminalGeoms.push(towerCab.toNonIndexed());
  addMerged(terminalGeoms, terminalMat, 'haneda-airport-terminals', 4, true);

  return {
    group,
    setTheme(nextDark: boolean): void {
      craneMat.color.setHex(nextDark ? 0xb83b32 : 0xd64538);
      depotHallMat.color.setHex(nextDark ? 0x475569 : 0xc8cfd8);
      terminalMat.color.setHex(nextDark ? 0x52657a : 0xdde4ec);
      terminalMat.emissive.setHex(nextDark ? 0xffe4b5 : 0x000000);
      terminalMat.emissiveIntensity = nextDark ? 0.35 : 0.0;
      const oldTex = runwayTex;
      runwayTex = createRunwayStripeTexture(nextDark);
      runwayMat.map = runwayTex;
      runwayMat.needsUpdate = true;
      oldTex.dispose();
    },
    setOpacity(opacity: number, isTranslucent: boolean): void {
      for (const m of [...detailMaterials, runwayMat]) {
        const need = m.transparent !== isTranslucent;
        m.transparent = isTranslucent;
        m.opacity = opacity;
        m.depthWrite = !isTranslucent;
        if (need) m.needsUpdate = true;
      }
    },
    dispose(): void {
      containerInst?.dispose();
      craneInst?.dispose();
      depotInst?.dispose();
      parkedTrainInst?.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      runwayTex.dispose();
      runwayMat.dispose();
      for (const m of detailMaterials) m.dispose();
    },
  };
}
