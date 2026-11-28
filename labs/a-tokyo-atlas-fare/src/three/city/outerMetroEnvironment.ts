/**
 * Outer Kanto Metropolitan Context (13km – 55km beyond Tokyo 23 Wards).
 *
 * Provides honest, low-detail geographic continuity without infinite fictional sprawl:
 *  - Outer river continuations (Tama River, Arakawa north, Edogawa east)
 *  - Low-poly distant western & southern mountain/hill horizon silhouettes
 *    (Okutama / Mt. Takao / Tanzawa / Boso ridges blending softly into aerial haze)
 *  - Lightweight instanced regional hub massing ONLY at real neighboring urban cores
 *    (Yokohama Minato Mirai, Kawasaki, Musashi-Kosugi, Kawaguchi, Funabashi, Tachikawa)
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SURFACE_ELEVATION_LAYERS } from '../../contracts/atlasV2.js';
import { lonLatToWorld } from '../geoProjection.js';
import { injectBuildingLightingShader } from '../materials/buildingLightingShader.js';
import type { CityLightingUniforms } from '../materials/groundShader.js';
import { injectWaterShader } from '../materials/waterShader.js';

export interface OuterMetroHandle {
  readonly group: THREE.Group;
  setTimeOfDay(nightFactor: number, goldenFactor: number, blueHourFactor: number): void;
  setVisibility(visible: boolean): void;
  dispose(): void;
}

function hashDet(i: number, salt: number): number {
  const h = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function buildRibbonXZ(
  pts: readonly [number, number][],
  width: number,
  y: number,
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const half = width * 0.5;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const ax = cur[0] + nx * half;
    const az = cur[1] + nz * half;
    const bx = cur[0] - nx * half;
    const bz = cur[1] - nz * half;
    pos.push(ax, y, az);
    pos.push(bx, y, bz);
    uvs.push(ax, az, bx, bz);
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const ni = g.toNonIndexed();
  g.dispose();
  ni.computeVertexNormals();
  return ni;
}

export function buildOuterMetroEnvironment(
  clipPlanes: THREE.Plane[],
  lightingUniforms: CityLightingUniforms,
): OuterMetroHandle {
  const group = new THREE.Group();
  group.name = 'outer-kanto-metro-context';

  // 1. Outer River Continuations (Tama River, Arakawa north, Edogawa east)
  const riverPaths: { pts: [number, number][]; w: number }[] = [
    // Tama River west-to-bay outside central chunk coverage
    {
      pts: [
        [-28_000, 4_200],
        [-19_000, 8_600],
        [-12_500, 12_800],
        [-6_800, 16_900],
        [-2_200, 18_200],
        [400, 18_600],
      ],
      w: 155,
    },
    // Arakawa northern continuation toward Toda / Kawaguchi / Saitama
    {
      pts: [
        [-4_800, -11_800],
        [-8_600, -14_200],
        [-14_200, -16_800],
        [-21_000, -21_500],
      ],
      w: 175,
    },
    // Edogawa eastern boundary toward Ichikawa / Matsudo
    {
      pts: [
        [10_800, -15_000],
        [11_200, -8_500],
        [11_600, -1_500],
        [12_400, 4_600],
      ],
      w: 145,
    },
  ];

  const riverGeoms: THREE.BufferGeometry[] = [];
  for (const rp of riverPaths) {
    const g = buildRibbonXZ(rp.pts, rp.w, SURFACE_ELEVATION_LAYERS.riverWaterMinY - 0.04);
    if (g) riverGeoms.push(g);
  }
  const outerRiverMat = new THREE.MeshStandardMaterial({
    color: 0x3b6e94,
    roughness: 0.36,
    metalness: 0.14,
    envMapIntensity: 1.5,
    clippingPlanes: clipPlanes,
  });
  injectWaterShader(outerRiverMat, lightingUniforms, 'river');
  let riverMesh: THREE.Mesh | null = null;
  if (riverGeoms.length > 0) {
    const mergedRivers = mergeGeometries(riverGeoms, false);
    riverGeoms.forEach((g) => g.dispose());
    if (mergedRivers) {
      riverMesh = new THREE.Mesh(mergedRivers, outerRiverMat);
      riverMesh.name = 'outer-kanto-rivers';
      riverMesh.receiveShadow = true;
      riverMesh.renderOrder = 3;
      group.add(riverMesh);
    }
  }

  // 3. Lightweight Real Neighboring Regional Sub-Center Skylines (low-LOD distant context)
  const regionalHubs = [
    { lon: 139.6316, lat: 35.4549, count: 48, spread: 900, maxH: 185 }, // Yokohama Minato Mirai
    { lon: 139.6968, lat: 35.5313, count: 42, spread: 750, maxH: 105 }, // Kawasaki
    { lon: 139.6596, lat: 35.5764, count: 32, spread: 580, maxH: 165 }, // Musashi-Kosugi
    { lon: 139.7239, lat: 35.8020, count: 30, spread: 700, maxH: 110 }, // Kawaguchi
    { lon: 139.9852, lat: 35.7016, count: 34, spread: 800, maxH: 85 },  // Funabashi
    { lon: 139.4137, lat: 35.6980, count: 28, spread: 700, maxH: 95 },  // Tachikawa
    { lon: 139.5803, lat: 35.7031, count: 26, spread: 620, maxH: 82 },  // Kichijoji
  ];

  const records: { x: number; z: number; w: number; d: number; h: number; a: number }[] = [];
  for (let hi = 0; hi < regionalHubs.length; hi++) {
    const hub = regionalHubs[hi]!;
    const center = lonLatToWorld(hub.lon, hub.lat);
    for (let i = 0; i < hub.count; i++) {
      const r1 = hashDet(i, hi * 17 + 3);
      const r2 = hashDet(i, hi * 23 + 9);
      const r3 = hashDet(i, hi * 31 + 13);
      const r4 = hashDet(i, hi * 43 + 19);
      const dist = Math.pow(r1, 0.72) * hub.spread;
      const theta = r2 * Math.PI * 2;
      const x = center.x + Math.cos(theta) * dist;
      const z = center.z + Math.sin(theta) * dist;
      const centerFalloff = Math.max(0.2, 1.0 - dist / hub.spread);
      const h = 14 + Math.pow(r3, 1.4) * hub.maxH * centerFalloff;
      records.push({
        x,
        z,
        w: 18 + r4 * 26,
        d: 16 + r3 * 24,
        h,
        a: (r4 - 0.5) * 0.6,
      });
    }
  }

  const regionalMat = new THREE.MeshStandardMaterial({
    color: 0xaab2ba,
    roughness: 0.76,
    metalness: 0.18,
    clippingPlanes: clipPlanes,
  });
  injectBuildingLightingShader(regionalMat, lightingUniforms, {
    isGlazed: false,
    fadeWithDistance: false,
  });

  const boxGeom = new THREE.BoxGeometry(1, 1, 1);
  const regionalInst = new THREE.InstancedMesh(boxGeom, regionalMat, records.length);
  regionalInst.name = 'outer-regional-subcenters';
  regionalInst.castShadow = false;
  regionalInst.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    dummy.position.set(r.x, (r.h - 1.25) * 0.5, r.z);
    dummy.rotation.set(0, r.a, 0);
    dummy.scale.set(r.w, r.h + 1.25, r.d);
    dummy.updateMatrix();
    regionalInst.setMatrixAt(i, dummy.matrix);
    const tone = 0.82 + hashDet(i, 91) * 0.18;
    col.setRGB(tone, tone * 0.99, tone * 0.97);
    regionalInst.setColorAt(i, col);
  }
  regionalInst.instanceMatrix.needsUpdate = true;
  if (regionalInst.instanceColor) regionalInst.instanceColor.needsUpdate = true;
  regionalInst.computeBoundingSphere();
  group.add(regionalInst);

  return {
    group,
    setTimeOfDay(nightFactor: number, goldenFactor: number, _blueHourFactor: number): void {
      const riverDay = new THREE.Color(0x3b6e94);
      const riverGolden = new THREE.Color(0x8c6858);
      const riverNight = new THREE.Color(0x102744);
      outerRiverMat.color
        .copy(riverDay)
        .lerp(riverNight, nightFactor)
        .lerp(riverGolden, goldenFactor * 0.36);

      const regDay = new THREE.Color(0xb2bac2);
      const regNight = new THREE.Color(0x394558);
      regionalMat.color.copy(regDay).lerp(regNight, nightFactor);
    },
    setVisibility(visible: boolean): void {
      group.visible = visible;
    },
    dispose(): void {
      riverMesh?.geometry.dispose();
      boxGeom.dispose();
      regionalInst.dispose();
      outerRiverMat.dispose();
      regionalMat.dispose();
    },
  };
}
