/**
 * Accurate Tokyo Bay Waterfront Coastline, Reclaimed Islands, Seawall Quays,
 * Port Container Terminals (Odaiba / Aomi / Oi Wharf) & Oi Shinkansen Rail Yard Depots.
 * (Detailed Haneda & Narita airport complexes live in `airportComplexes.ts`.)
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectBuildingLightingShader } from '../materials/buildingLightingShader.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import type { CityLightingUniforms } from '../materials/groundShader.js';
import type { UrbanBaseEnvironment } from '../types.js';
import { pointInPoly } from './cityGeometryHelpers.js';
import {
  isPointInTokyoBayWater,
  isPointOnHanedaAirport,
  isPointOnTokyoBayPort,
  TOKYO_BAY_ISLANDS,
  TOKYO_BAY_OCEAN_POLYGON,
  type ReclaimedIslandSpec,
} from './tokyoCoastlineData.js';

export {
  isPointInTokyoBayWater,
  isPointOnHanedaAirport,
  isPointOnTokyoBayPort,
  TOKYO_BAY_ISLANDS,
  TOKYO_BAY_OCEAN_POLYGON,
  type ReclaimedIslandSpec,
};

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

const CONTAINER_PALETTE = [
  0x4b5c6e, // Weathered steel slate blue
  0x5d6975, // Cool maritime grey
  0x7a544e, // Muted rust oxide
  0x4d6261, // Seafoam industrial teal
  0xb8c0c8, // Reefer off-white
  0x74695c, // Drab khaki cargo
  0x464e57, // Charcoal iron
  0x684e50, // Dark terracotta
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
  lightingUniforms?: CityLightingUniforms,
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

  // Sea Forest Park (海の森公園) green coastal landscape on southeastern Central Breakwater
  const forestParkMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x16241b : 0x46633d,
    roughness: 0.95,
    metalness: 0.0,
    clippingPlanes: clipPlanes,
  });
  if (cutawayUniforms) {
    injectRadialCutaway(forestParkMat, cutawayUniforms, 'terrain');
  }
  const seaForestGeom = buildFlatWorldPoly(
    [
      [3150, 8850],
      [4350, 8880],
      [4360, 9840],
      [3120, 9820],
    ],
    -0.60,
  );
  if (seaForestGeom) {
    const seaForestMesh = new THREE.Mesh(seaForestGeom, forestParkMat);
    seaForestMesh.name = 'tokyo-bay-sea-forest-park';
    seaForestMesh.receiveShadow = true;
    seaForestMesh.renderOrder = 2;
    group.add(seaForestMesh);
  }

  // ---- Materials for 3D Port & Depot Architecture ----
  const containerMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x5c6878 : 0xffffff,
    roughness: 0.72,
    metalness: 0.22,
    clippingPlanes: clipPlanes,
  });
  const craneMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x7a3430 : 0xa84840,
    roughness: 0.56,
    metalness: 0.30,
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

  const detailMaterials = [
    containerMat,
    craneMat,
    depotHallMat,
    parkedTrainMat,
  ];
  if (lightingUniforms) {
    for (const m of detailMaterials) {
      injectBuildingLightingShader(m, lightingUniforms, {
        isGlazed: false,
        fadeWithDistance: false,
      });
    }
  }
  if (cutawayUniforms) {
    for (const m of detailMaterials) {
      injectRadialCutaway(m, cutawayUniforms, 'building');
    }
  }

  // ---- 1. Port Container Stacks, Warehouses & Quay Gantry Cranes inside Bayfront Industrial Blocks ----
  const containerRecords: { x: number; z: number; h: number; a: number; color: number }[] = [];
  const craneRecords: { x: number; z: number; a: number }[] = [];
  const depotHallRecords: { x: number; z: number; w: number; h: number; d: number; a: number }[] = [];
  const parkedTrainRecords: { x: number; z: number; len: number; a: number; color: number }[] = [];

  const blocks = env.landuseBlocks ?? [];
  const railwayBlocks = blocks.filter((b) => b.kind === 'railway' && b.pts.length >= 3);
  const surfaceBayRoads = env.roads.filter(
    (r) => r.el !== 1 && r.pts.length >= 2 && r.pts.some(([, z]) => z >= 3800),
  );
  const placedPortCells = new Set<string>();
  const portCellKey = (x: number, z: number) => `${Math.round(x / 22)},${Math.round(z / 22)}`;

  const isInRailwayYard = (px: number, pz: number): boolean => {
    for (let i = 0; i < railwayBlocks.length; i++) {
      if (pointInPoly(px, pz, railwayBlocks[i]!.pts)) return true;
    }
    return false;
  };

  const isNearSurfaceRoad = (px: number, pz: number, padM = 16): boolean => {
    const padSq = padM * padM;
    for (let i = 0; i < surfaceBayRoads.length; i++) {
      const r = surfaceBayRoads[i]!;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const [ax, az] = r.pts[s]!;
        const [bx, bz] = r.pts[s + 1]!;
        const dx = bx - ax;
        const dz = bz - az;
        const lenSq = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
        const dSq = (px - (ax + dx * t)) ** 2 + (pz - (az + dz * t)) ** 2;
        if (dSq <= padSq + r.w * r.w * 0.25) return true;
      }
    }
    return false;
  };

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

      // Place orderly maritime bay rows + logistics warehouses (per-block cap prevents starvation!)
      const stepX = 28;
      const stepZ = 22;
      let blockContainers = 0;
      const maxBlockContainers = Math.min(480, Math.max(90, Math.floor((spanX * spanZ) / 3600)));

      for (
        let x = minX + 24;
        x < maxX - 24 && blockContainers < maxBlockContainers && containerRecords.length < 4200;
        x += stepX
      ) {
        if (Math.abs((x - minX) % 135) < 22) continue;
        for (
          let z = minZ + 20;
          z < maxZ - 20 && blockContainers < maxBlockContainers && containerRecords.length < 4200;
          z += stepZ
        ) {
          if (Math.abs((z - minZ) % 135) < 20) continue;
          if (!pointInPoly(x, z, blk.pts)) continue;
          const ck = portCellKey(x, z);
          if (placedPortCells.has(ck)) continue;
          const r = hashDet(x, z, bi + 7);
          if (r < 0.26) continue; // realistic truck aisles
          placedPortCells.add(ck);
          if (r > 0.87 && depotHallRecords.length < 380) {
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
            // Intermodal container stack (2..4 containers high -> 5.2m..10.4m), bay-grouped color
            const tiers = 2 + Math.floor(hashDet(x, z, 41) * 3);
            const bayX = Math.floor(x / 84);
            const bayZ = Math.floor(z / 44);
            const colIdx = Math.floor(hashDet(bayX, bayZ, 53) * CONTAINER_PALETTE.length);
            containerRecords.push({
              x,
              z,
              h: tiers * 2.6,
              a: rowAngle,
              color: CONTAINER_PALETTE[colIdx]!,
            });
            blockContainers++;
          }
        }
      }

      // Line iconic red-white quay gantry cranes along eastern/southern berth edges
      if (spanZ > 450 && craneRecords.length < 120) {
        const quayX = maxX - 18;
        for (let z = minZ + 90; z < maxZ - 90 && craneRecords.length < 120; z += 135) {
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
          if (r < 0.36 && depotHallRecords.length < 380) {
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

  // ---- 1b. Direct Island-Aware Port Terminals (Oi Wharf, Odaiba/Aomi, Central Breakwater) ----
  const addIslandPortGrid = (
    islPts: readonly [number, number][],
    bounds: { x0: number; x1: number; z0: number; z1: number },
    opts: {
      stepX: number;
      stepZ: number;
      rowAngle: number;
      warehouseProb: number;
      maxContainers: number;
      skipPredicate?: (x: number, z: number) => boolean;
    },
  ) => {
    let addedContainers = 0;
    for (
      let x = bounds.x0;
      x <= bounds.x1 && addedContainers < opts.maxContainers && containerRecords.length < 4200;
      x += opts.stepX
    ) {
      if (Math.abs((x - bounds.x0) % 140) < opts.stepX * 0.8) continue;
      for (
        let z = bounds.z0;
        z <= bounds.z1 && addedContainers < opts.maxContainers && containerRecords.length < 4200;
        z += opts.stepZ
      ) {
        if (Math.abs((z - bounds.z0) % 140) < opts.stepZ * 0.8) continue;
        if (opts.skipPredicate?.(x, z)) continue;
        if (!pointInPoly(x, z, islPts as [number, number][])) continue;
        if (isInRailwayYard(x, z) || isNearSurfaceRoad(x, z, 18)) continue;
        const ck = portCellKey(x, z);
        if (placedPortCells.has(ck)) continue;
        const r = hashDet(x, z, 409);
        if (r < 0.24) continue;
        placedPortCells.add(ck);

        if (r > 1.0 - opts.warehouseProb && depotHallRecords.length < 380) {
          depotHallRecords.push({
            x,
            z,
            w: 48 + hashDet(x, z, 419) * 47,
            h: 10 + hashDet(x, z, 431) * 6,
            d: 22 + hashDet(x, z, 439) * 14,
            a: opts.rowAngle,
          });
        } else {
          const tiers = 2 + Math.floor(hashDet(x, z, 449) * 3);
          const colIdx = Math.floor(
            hashDet(Math.floor(x / 72), Math.floor(z / 48), 461) * CONTAINER_PALETTE.length,
          );
          containerRecords.push({
            x,
            z,
            h: tiers * 2.6,
            a: opts.rowAngle,
            color: CONTAINER_PALETTE[colIdx]!,
          });
          addedContainers++;
        }
      }
    }
  };

  // (i) Shinagawa Wharf / Oi Container Terminal east of Oi Rail Yard
  const oiIsl = TOKYO_BAY_ISLANDS.find((isl) => isl.id === 'shinagawa-oi-wharf');
  if (oiIsl) {
    const oiQuaySegments: [[number, number], [number, number]][] = [
      [[-565, 4250], [-505, 5780]],
      [[-505, 5780], [-345, 7750]],
      [[-345, 7750], [645, 9380]],
      [[645, 9380], [645, 10650]],
    ];
    for (let ci = 0; ci < 18 && craneRecords.length < 120; ci++) {
      const seg = oiQuaySegments[Math.floor((ci / 18) * oiQuaySegments.length)]!;
      const localT = ((ci / 18) * oiQuaySegments.length) % 1;
      const cx = seg[0][0] + (seg[1][0] - seg[0][0]) * localT;
      const cz = seg[0][1] + (seg[1][1] - seg[0][1]) * localT;
      if (pointInPoly(cx - 24, cz, oiIsl.pts as [number, number][])) {
        craneRecords.push({ x: cx, z: cz, a: 0 });
      }
    }
    addIslandPortGrid(
      oiIsl.pts,
      { x0: -1400, x1: 620, z0: 4120, z1: 10720 },
      {
        stepX: 32,
        stepZ: 24,
        rowAngle: Math.PI * 0.5,
        warehouseProb: 0.14,
        maxContainers: 650,
        skipPredicate: (x, z) => x <= -620 && z >= 7000,
      },
    );
  }

  // (ii) Odaiba / Aomi Container Terminal (south) & Waterfront Commercial/Exhibition Complex (north)
  const aomiIsl = TOKYO_BAY_ISLANDS.find((isl) => isl.id === 'odaiba-aomi');
  if (aomiIsl) {
    for (let ci = 0; ci < 16 && craneRecords.length < 120; ci++) {
      const t = (ci + 0.5) / 16;
      const cz = 6400 + t * (8750 - 6400);
      const cx = cz < 8220 ? 350 + ((cz - 6800) / 1420) * 165 : 515 + ((cz - 8220) / 660) * 320;
      const clampedX = Math.max(360, cx);
      if (pointInPoly(clampedX + 26, cz, aomiIsl.pts as [number, number][])) {
        craneRecords.push({ x: clampedX, z: cz, a: Math.PI });
      }
    }
    addIslandPortGrid(
      aomiIsl.pts,
      { x0: 550, x1: 2650, z0: 6450, z1: 8750 },
      {
        stepX: 34,
        stepZ: 24,
        rowAngle: Math.PI * 0.5,
        warehouseProb: 0.15,
        maxContainers: 580,
      },
    );
    // Northern Odaiba commercial & Big Sight/exhibition waterfront masses
    let odaibaBlocksAdded = 0;
    for (let x = 200; x <= 2500 && odaibaBlocksAdded < 14 && depotHallRecords.length < 380; x += 210) {
      for (let z = 5350; z <= 6250 && odaibaBlocksAdded < 14 && depotHallRecords.length < 380; z += 195) {
        const jx = x + (hashDet(x, z, 631) - 0.5) * 65;
        const jz = z + (hashDet(x, z, 643) - 0.5) * 55;
        if (!pointInPoly(jx, jz, aomiIsl.pts as [number, number][])) continue;
        if (isNearSurfaceRoad(jx, jz, 28) || isInRailwayYard(jx, jz)) continue;
        const r = hashDet(x, z, 653);
        if (r < 0.25) continue;
        depotHallRecords.push({
          x: jx,
          z: jz,
          w: 42 + r * 53,
          h: 18 + hashDet(x, z, 661) * 34,
          d: 32 + hashDet(x, z, 673) * 36,
          a: (hashDet(x, z, 683) - 0.5) * 0.45,
        });
        odaibaBlocksAdded++;
      }
    }
  }

  // (iii) Central Breakwater (中央防波堤) Northern Container Terminal & Logistics Yards
  const cbIsl = TOKYO_BAY_ISLANDS.find((isl) => isl.id === 'central-breakwater');
  if (cbIsl) {
    for (let ci = 0; ci < 12 && craneRecords.length < 120; ci++) {
      const cx = 2420 + (ci / 11) * (4280 - 2420);
      craneRecords.push({ x: cx, z: 7580, a: Math.PI * 0.5 });
    }
    addIslandPortGrid(
      cbIsl.pts,
      { x0: 2400, x1: 4250, z0: 7680, z1: 8450 },
      {
        stepX: 32,
        stepZ: 24,
        rowAngle: 0,
        warehouseProb: 0.10,
        maxContainers: 420,
      },
    );
    // Logistics sheds behind container terminal (west of Sea Forest Park)
    for (let x = 2380; x <= 3040 && depotHallRecords.length < 380; x += 145) {
      for (let z = 8560; z <= 9150 && depotHallRecords.length < 380; z += 110) {
        if (!pointInPoly(x, z, cbIsl.pts as [number, number][])) continue;
        depotHallRecords.push({
          x,
          z,
          w: 88 + hashDet(x, z, 709) * 32,
          h: 11 + hashDet(x, z, 719) * 5,
          d: 34 + hashDet(x, z, 727) * 14,
          a: 0,
        });
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

  return {
    group,
    setTheme(nextDark: boolean): void {
      containerMat.color.setHex(nextDark ? 0x5c6878 : 0xffffff);
      craneMat.color.setHex(nextDark ? 0x7a3430 : 0xa84840);
      depotHallMat.color.setHex(nextDark ? 0x475569 : 0xc8cfd8);
      forestParkMat.color.setHex(nextDark ? 0x16241b : 0x46633d);
    },
    setOpacity(opacity: number, isTranslucent: boolean): void {
      for (const m of [...detailMaterials, forestParkMat]) {
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
      for (const m of detailMaterials) m.dispose();
      forestParkMat.dispose();
    },
  };
}
