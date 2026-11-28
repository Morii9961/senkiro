/**
 * Accurate Tokyo Bay Waterfront Coastline, Reclaimed Islands, Seawall Quays,
 * Port Container Terminals (Odaiba / Aomi / Oi Wharf) & Oi Shinkansen Rail Yard Depots.
 * (Detailed Haneda & Narita airport complexes live in `airportComplexes.ts`.)
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
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

      // Place orderly maritime bay rows + logistics warehouses (clear crane/truck avenues every ~135m)
      const stepX = 28;
      const stepZ = 22;
      for (let x = minX + 24; x < maxX - 24 && containerRecords.length < 1800; x += stepX) {
        if (Math.abs((x - minX) % 135) < 22) continue;
        for (let z = minZ + 20; z < maxZ - 20 && containerRecords.length < 1800; z += stepZ) {
          if (Math.abs((z - minZ) % 135) < 20) continue;
          if (!pointInPoly(x, z, blk.pts)) continue;
          const r = hashDet(x, z, bi + 7);
          if (r < 0.26) continue; // realistic truck aisles
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

  return {
    group,
    setTheme(nextDark: boolean): void {
      containerMat.color.setHex(nextDark ? 0x5c6878 : 0xffffff);
      craneMat.color.setHex(nextDark ? 0x7a3430 : 0xa84840);
      depotHallMat.color.setHex(nextDark ? 0x475569 : 0xc8cfd8);
    },
    setOpacity(opacity: number, isTranslucent: boolean): void {
      for (const m of detailMaterials) {
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
    },
  };
}
