/**
 * Detailed 3D Procedural Airport Architecture, Widebody Fleet, Night Runway/Apron Lighting,
 * and Surrounding Urban & Port Districts for Haneda (HND) & Narita (NRT) — SENKIRO Atlas v2.
 *
 * Zero external asset dependencies; renders in ~10 batched/instanced draw calls and honors
 * radial cutaway, station X-ray focus, day/dusk/night lighting, and section clipping planes.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectBuildingLightingShader } from '../materials/buildingLightingShader.js';
import { injectInstancedFacadeUv, injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import { generateInstancedFacadeSet } from '../materials/facadeLibrary.js';
import type { CityLightingUniforms } from '../materials/groundShader.js';
import type { UrbanBaseEnvironment } from '../types.js';
import { getEffectiveRiverWidth, isSurfaceRiverVisible, pointInPoly } from './cityGeometryHelpers.js';
import {
  isPointInTokyoBayWater,
  isPointOnHanedaAirport,
  isPointOnTokyoBayPort,
  TOKYO_BAY_ISLANDS,
} from './tokyoBayWaterfront.js';

export interface AirportComplexesHandle {
  readonly group: THREE.Group;
  setTheme(isDark: boolean): void;
  setNightFactor(nf: number): void;
  setOpacity(opacity: number, isTranslucent: boolean): void;
  dispose(): void;
}

const HANEDA_ROT = 0.42;
const NARITA_ROT = 0.43;

function hashDet(a: number, b: number, salt = 41): number {
  let h =
    Math.imul(a | 0, 374761393) ^
    Math.imul(b | 0, 668265263) ^
    Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function cleanGeometry(g: THREE.BufferGeometry, includeWorldUv = false): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  for (const attr of Object.keys(out.attributes)) {
    if (attr !== 'position' && attr !== 'normal' && !(includeWorldUv && attr === 'uv')) {
      out.deleteAttribute(attr);
    }
  }
  return out;
}

/**
 * Matches Three.js `BoxGeometry.rotateY(rotY)` convention (+Z rotated toward +X).
 */
function localToWorldXZ(
  ox: number,
  oz: number,
  rotY: number,
  lx: number,
  lz: number,
): [number, number] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}

function makeOrientedBox(
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  baseY: number,
  rotY: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(cx, baseY + h * 0.5, cz);
  return cleanGeometry(g);
}

function makeOrientedCylinder(
  cx: number,
  cz: number,
  rTop: number,
  rBot: number,
  h: number,
  segments: number,
  baseY: number,
  rotY = 0,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segments);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(cx, baseY + h * 0.5, cz);
  return cleanGeometry(g);
}

function makeOrientedFlatQuad(
  cx: number,
  cz: number,
  w: number,
  d: number,
  y: number,
  rotY: number,
  keepUv = false,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(cx, y, cz);
  return cleanGeometry(g, keepUv);
}

function buildRibbonXZ(
  pts: readonly [number, number][],
  width: number,
  y: number,
  includeWorldUv = false,
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const half = width * 0.5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!;
    let dx = 0;
    let dz = 0;
    if (i < pts.length - 1) {
      dx += pts[i + 1]![0] - cur[0];
      dz += pts[i + 1]![1] - cur[1];
    }
    if (i > 0) {
      dx += cur[0] - pts[i - 1]![0];
      dz += cur[1] - pts[i - 1]![1];
    }
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const ax = cur[0] + nx * half;
    const az = cur[1] + nz * half;
    const bx = cur[0] - nx * half;
    const bz = cur[1] - nz * half;
    positions.push(ax, y, az);
    positions.push(bx, y, bz);
    if (includeWorldUv) {
      uvs.push(ax, az, bx, bz);
    }
    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (includeWorldUv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  g.setIndex(indices);
  g.computeVertexNormals();
  return cleanGeometry(g, includeWorldUv);
}

function buildFlatPolygonXZ(pts: readonly [number, number][], y: number): THREE.BufferGeometry | null {
  if (pts.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0]![0], -pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i]![0], -pts[i]![1]);
  }
  shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);
  return cleanGeometry(geom);
}

function createAirportRunwayTexture(isDark: boolean): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#1c222b' : '#383e47';
    ctx.fillRect(0, 0, w, h);

    // Subtle rubber tire-mark center wear
    const wearGrad = ctx.createLinearGradient(0, 0, w, 0);
    wearGrad.addColorStop(0.28, 'rgba(0,0,0,0)');
    wearGrad.addColorStop(0.5, isDark ? 'rgba(8,10,14,0.34)' : 'rgba(20,24,28,0.28)');
    wearGrad.addColorStop(0.72, 'rgba(0,0,0,0)');
    ctx.fillStyle = wearGrad;
    ctx.fillRect(0, 0, w, h);

    // Side edge lines
    ctx.fillStyle = isDark ? 'rgba(226,232,240,0.72)' : 'rgba(248,250,252,0.90)';
    ctx.fillRect(8, 0, 4, h);
    ctx.fillRect(w - 12, 0, 4, h);

    // Centerline dashes
    for (let y = 16; y < h; y += 64) {
      ctx.fillRect(w / 2 - 2, y, 4, 34);
    }

    // Touchdown piano-key threshold markings & aiming blocks
    for (let x = 18; x < w - 18; x += 11) {
      if (Math.abs(x - w / 2) < 9) continue;
      ctx.fillRect(x, 12, 6, 36);
      ctx.fillRect(x, h - 48, 6, 36);
    }
    ctx.fillRect(28, 76, 12, 26);
    ctx.fillRect(w - 40, 76, 12, 26);
    ctx.fillRect(28, h - 102, 12, 26);
    ctx.fillRect(w - 40, h - 102, 12, 26);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a clean sculpted parked widebody commercial jetliner (+Z = Nose, +Y = Up, ~52m wingspan).
 */
function createWidebodyAircraftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Fuselage cylinder along Z
  const fuselage = new THREE.CylinderGeometry(2.9, 2.9, 44, 10);
  fuselage.rotateX(Math.PI / 2);
  fuselage.translate(0, 4.2, 0);
  parts.push(cleanGeometry(fuselage));

  // Nose radome cone (+Z)
  const nose = new THREE.ConeGeometry(2.9, 8.5, 10);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 4.0, 26.2);
  parts.push(cleanGeometry(nose));

  // Tail cone (-Z)
  const tailCone = new THREE.ConeGeometry(2.85, 10.5, 10);
  tailCone.rotateX(-Math.PI / 2);
  tailCone.translate(0, 4.4, -27.2);
  parts.push(cleanGeometry(tailCone));

  // Swept port & starboard main wings
  for (const side of [-1, 1] as const) {
    const wing = new THREE.BoxGeometry(25, 0.7, 7.2);
    wing.rotateY(side * -0.44);
    wing.translate(side * 12.2, 3.6, -2.5);
    parts.push(cleanGeometry(wing));

    // Underwing turbofan engine pod
    const eng = new THREE.CylinderGeometry(1.35, 1.25, 5.2, 8);
    eng.rotateX(Math.PI / 2);
    eng.translate(side * 9.8, 2.3, 1.2);
    parts.push(cleanGeometry(eng));

    // Horizontal stabilizer
    const hStab = new THREE.BoxGeometry(9.5, 0.5, 3.6);
    hStab.rotateY(side * -0.36);
    hStab.translate(side * 4.8, 4.9, -27.0);
    parts.push(cleanGeometry(hStab));
  }

  // Tall vertical tailfin
  const vStab = new THREE.BoxGeometry(0.65, 11.2, 7.2);
  vStab.rotateX(-0.28);
  vStab.translate(0, 10.2, -26.5);
  parts.push(cleanGeometry(vStab));

  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

const AIRPORT_LIGHT_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

attribute vec3 aColor;
attribute float aSize;
attribute float aGain;

uniform float uPixelScale;
uniform float uDpr;
uniform float uMinPx;
uniform float uMaxPx;

varying vec3 vColor;
varying float vGain;
varying float vFogFade;

void main() {
  vColor = aColor;
  vGain = aGain;
  vec3 transformed = vec3(position);
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  float camDist = max(-mvPosition.z, 14.0);
  vFogFade = 1.0 - smoothstep(11500.0, 38000.0, camDist);
  gl_PointSize = clamp(
    aSize * projectionMatrix[1][1] * uPixelScale / camDist,
    uMinPx * uDpr,
    uMaxPx * uDpr
  );
}
`;

const AIRPORT_LIGHT_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

uniform float uNightGlow;
uniform float uOpacity;

varying vec3 vColor;
varying float vGain;
varying float vFogFade;

void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord - vec2(0.5);
  float r2 = dot(p, p);
  if (r2 > 0.25) discard;
  float core = exp(-r2 * 16.0);
  float halo = exp(-r2 * 3.4) * 0.44;
  float falloff = core + halo;
  vec3 incandescent = mix(vColor, vec3(1.0, 0.98, 0.94), core * 0.55) * vGain;
  float alpha = clamp(falloff * uNightGlow * uOpacity * vFogFade, 0.0, 1.0);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(incandescent, alpha);
}
`;

function pointToSegmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-6) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

interface ClearancePolyline {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  padSq: number;
  pts: readonly [number, number][];
}

function buildClearancePolylines(
  env: UrbanBaseEnvironment,
  extraLines: readonly { pts: readonly [number, number][]; halfW: number }[],
): ClearancePolyline[] {
  const out: ClearancePolyline[] = [];
  const push = (pts: readonly [number, number][], pad: number) => {
    if (pts.length < 2) return;
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
    out.push({
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
      padSq: pad * pad,
      pts,
    });
  };

  for (const rv of env.riverLines) {
    if (!isSurfaceRiverVisible(rv.name)) continue;
    push(rv.pts, getEffectiveRiverWidth(rv.name, rv.width) * 0.5 + 14);
  }
  if (env.railCorridors) {
    for (const c of env.railCorridors) {
      push(c.pts, c.width * 0.5 + 14);
    }
  }
  for (const r of env.roads) {
    if (r.el === 1) continue;
    push(r.pts, r.w * 0.5 + 10);
  }
  for (const ex of extraLines) {
    push(ex.pts, ex.halfW);
  }
  return out;
}

function isNearAnyPolyline(x: number, z: number, lines: readonly ClearancePolyline[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (x < l.minX || x > l.maxX || z < l.minZ || z > l.maxZ) continue;
    for (let s = 0; s < l.pts.length - 1; s++) {
      const [ax, az] = l.pts[s]!;
      const [bx, bz] = l.pts[s + 1]!;
      if (pointToSegmentDistSq(x, z, ax, az, bx, bz) <= l.padSq) return true;
    }
  }
  return false;
}

export function buildTokyoAirportComplexes(
  env: UrbanBaseEnvironment,
  isDark: boolean,
  clipPlanes: THREE.Plane[],
  waterMaterial: THREE.MeshStandardMaterial,
  cutawayUniforms?: CutawayUniforms,
  lightingUniforms?: CityLightingUniforms,
): AirportComplexesHandle {
  const group = new THREE.Group();
  group.name = 'tokyo-haneda-narita-airports';

  const nightUniform = { value: isDark ? 1.0 : 0.0 };

  let runwayTex = createAirportRunwayTexture(isDark);
  const runwayMat = new THREE.MeshStandardMaterial({
    map: runwayTex,
    roughness: 0.86,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    clippingPlanes: clipPlanes,
  });

  const apronMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x262e38 : 0xb6bec8,
    roughness: 0.9,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    clippingPlanes: clipPlanes,
  });

  const taxiwayMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x1d232b : 0x515760,
    roughness: 0.88,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    clippingPlanes: clipPlanes,
  });

  const turfMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x182b20 : 0x628554,
    roughness: 0.95,
    metalness: 0.0,
    clippingPlanes: clipPlanes,
  });

  const terminalBodyMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x455364 : 0xf0f4f8,
    roughness: 0.54,
    metalness: 0.26,
    clippingPlanes: clipPlanes,
  });

  const terminalGlassMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x22364a : 0x446888,
    emissive: new THREE.Color(isDark ? 0xffe9c2 : 0x000000),
    emissiveIntensity: isDark ? 0.85 : 0.0,
    roughness: 0.24,
    metalness: 0.52,
    envMapIntensity: 1.4,
    clippingPlanes: clipPlanes,
  });

  const hangarMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x384350 : 0xaab4bf,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.0,
    roughness: 0.62,
    metalness: 0.36,
    clippingPlanes: clipPlanes,
  });

  const towerAccentMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x64748b : 0xf1f5f9,
    emissive: new THREE.Color(isDark ? 0xffdfa8 : 0x000000),
    emissiveIntensity: isDark ? 0.28 : 0.0,
    roughness: 0.44,
    metalness: 0.3,
    clippingPlanes: clipPlanes,
  });

  const aircraftMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(isDark ? 0xfff3dc : 0x000000),
    emissiveIntensity: isDark ? 0.18 : 0.0,
    roughness: 0.28,
    metalness: 0.45,
    clippingPlanes: clipPlanes,
  });

  let facadeSet = generateInstancedFacadeSet(isDark);
  const districtBuildingMat = new THREE.MeshStandardMaterial({
    map: facadeSet.map,
    roughnessMap: facadeSet.roughnessMap,
    bumpMap: facadeSet.bumpMap,
    bumpScale: 0.46,
    emissiveMap: facadeSet.emissiveMap,
    emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
    emissiveIntensity: isDark ? 0.92 : 0.0,
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.22,
    envMapIntensity: isDark ? 0.85 : 0.95,
    clippingPlanes: clipPlanes,
  });
  injectInstancedFacadeUv(districtBuildingMat, nightUniform);
  if (lightingUniforms) {
    injectBuildingLightingShader(districtBuildingMat, lightingUniforms, {
      isGlazed: false,
      fadeWithDistance: false,
    });
  }

  const terrainMats = [runwayMat, apronMat, taxiwayMat, turfMat];
  const buildingMats = [
    terminalBodyMat,
    terminalGlassMat,
    hangarMat,
    towerAccentMat,
    aircraftMat,
    districtBuildingMat,
  ];
  const allStdMats = [...terrainMats, ...buildingMats];

  if (cutawayUniforms) {
    for (const m of terrainMats) injectRadialCutaway(m, cutawayUniforms, 'terrain');
    for (const m of buildingMats) injectRadialCutaway(m, cutawayUniforms, 'building');
  }

  const runwayGeoms: THREE.BufferGeometry[] = [];
  const apronGeoms: THREE.BufferGeometry[] = [];
  const taxiwayGeoms: THREE.BufferGeometry[] = [];
  const turfGeoms: THREE.BufferGeometry[] = [];
  const riverMouthGeoms: THREE.BufferGeometry[] = [];
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const glassGeoms: THREE.BufferGeometry[] = [];
  const hangarGeoms: THREE.BufferGeometry[] = [];
  const accentGeoms: THREE.BufferGeometry[] = [];

  const aircraftRecords: { x: number; y: number; z: number; yaw: number; scale: number; hex: number }[] = [];
  const buildingRecords: { cx: number; cz: number; w: number; d: number; h: number; a: number; hex: number }[] = [];

  const lightPos: number[] = [];
  const lightCol: number[] = [];
  const lightSize: number[] = [];
  const lightGain: number[] = [];
  const tmpColor = new THREE.Color();

  const pushLight = (x: number, y: number, z: number, hex: number, size: number, gain: number) => {
    tmpColor.setHex(hex);
    lightPos.push(x, y, z);
    lightCol.push(tmpColor.r, tmpColor.g, tmpColor.b);
    lightSize.push(size);
    lightGain.push(gain);
  };

  const addRunwayWithLights = (cx: number, cz: number, len: number, wid: number, rotY: number, baseY: number) => {
    runwayGeoms.push(makeOrientedFlatQuad(cx, cz, wid, len, baseY, rotY, true));

    // Edge & threshold lights along runway length (local Z from -len/2 .. +len/2)
    const steps = Math.max(12, Math.floor(len / 120));
    const halfW = wid * 0.52;
    const halfL = len * 0.485;
    for (let i = 0; i <= steps; i++) {
      const lz = -halfL + (i / steps) * (halfL * 2);
      const isEnd = i === 0 || i === steps;
      const col = isEnd ? (i === 0 ? 0x22e58a : 0xff3b30) : i > steps * 0.8 || i < steps * 0.2 ? 0xffc66e : 0xfff4de;
      for (const sx of [-halfW, halfW]) {
        const [wx, wz] = localToWorldXZ(cx, cz, rotY, sx, lz);
        pushLight(wx, baseY + 1.2, wz, col, 8.2, isEnd ? 1.25 : 0.95);
      }
    }
    // High-intensity threshold crossbar
    for (const endZ of [-halfL, halfL]) {
      const threshCol = endZ < 0 ? 0x22e58a : 0xff3b30;
      for (let tx = -halfW * 0.7; tx <= halfW * 0.7; tx += halfW * 0.35) {
        const [wx, wz] = localToWorldXZ(cx, cz, rotY, tx, endZ);
        pushLight(wx, baseY + 1.4, wz, threshCol, 9.0, 1.3);
      }
    }
  };

  const addTaxiStrip = (
    ox: number,
    oz: number,
    rotY: number,
    lx0: number,
    lz0: number,
    lx1: number,
    lz1: number,
    width: number,
    baseY: number,
    addBlueLights = true,
  ) => {
    const p0 = localToWorldXZ(ox, oz, rotY, lx0, lz0);
    const p1 = localToWorldXZ(ox, oz, rotY, lx1, lz1);
    const rib = buildRibbonXZ([p0, p1], width, baseY);
    if (rib) taxiwayGeoms.push(rib);
    if (addBlueLights) {
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const count = Math.max(2, Math.floor(len / 95));
      for (let i = 1; i < count; i++) {
        const t = i / count;
        const px = p0[0] + (p1[0] - p0[0]) * t;
        const pz = p0[1] + (p1[1] - p0[1]) * t;
        pushLight(px, baseY + 1.0, pz, 0x3b9eff, 5.2, 0.85);
      }
    }
  };

  const addControlTower = (tx: number, tz: number, height: number, baseY: number) => {
    bodyGeoms.push(makeOrientedCylinder(tx, tz, 9.5, 13.5, height * 0.84, 10, baseY));
    glassGeoms.push(makeOrientedCylinder(tx, tz, 17, 11.5, height * 0.11, 12, baseY + height * 0.83));
    accentGeoms.push(makeOrientedCylinder(tx, tz, 19, 17.5, 3.2, 12, baseY + height * 0.94));
    accentGeoms.push(makeOrientedCylinder(tx, tz, 0.7, 1.4, 14, 6, baseY + height * 0.96));
    pushLight(tx, baseY + height + 11, tz, 0xff2b20, 12.5, 1.45);
    pushLight(tx, baseY + height * 0.89, tz, 0xffe4b2, 14.0, 1.15);
  };

  const pushAircraftLocal = (
    ox: number,
    oz: number,
    rotY: number,
    lx: number,
    lz: number,
    localYaw: number,
    baseY: number,
    scale = 1.0,
    hex = 0xf4f7fb,
  ) => {
    const [wx, wz] = localToWorldXZ(ox, oz, rotY, lx, lz);
    aircraftRecords.push({ x: wx, y: baseY, z: wz, yaw: rotY + localYaw, scale, hex });
  };

  // ============================================================================
  // 1. HANEDA INTERNATIONAL AIRPORT (HND) — Island & Surrounding Mainland
  // ============================================================================
  const H_Y = -0.5;
  const hOriginX = 1380;
  const hOriginZ = 14680;

  // Mowed infield turf inset strictly inside Haneda island seawall + concrete aprons
  const hanedaTurfPoly = buildFlatPolygonXZ(
    [
      [-1180, 13340],
      [1310, 13010],
      [3040, 14190],
      [3390, 15950],
      [2020, 16580],
      [-420, 16040],
      [-1440, 14880],
    ],
    H_Y + 0.03,
  );
  if (hanedaTurfPoly) turfGeoms.push(hanedaTurfPoly);
  // Central Domestic Terminal Apron (T1 <-> T2)
  apronGeoms.push(makeOrientedFlatQuad(1380, 14660, 1120, 1380, H_Y + 0.06, HANEDA_ROT));
  // Terminal 3 International & West Apron (directly behind/northeast of T3)
  const [t3Ax, t3Az] = localToWorldXZ(88, 15180, HANEDA_ROT, 170, 0);
  apronGeoms.push(makeOrientedFlatQuad(t3Ax, t3Az, 520, 1020, H_Y + 0.06, HANEDA_ROT));
  // North Cargo & Maintenance Apron
  const [ncAx, ncAz] = localToWorldXZ(hOriginX, hOriginZ, HANEDA_ROT, -1100, -1080);
  apronGeoms.push(makeOrientedFlatQuad(ncAx, ncAz, 740, 720, H_Y + 0.06, HANEDA_ROT));

  // Haneda 4 Marked Runways + Night Runway Lights
  const hanedaRunways = [
    { cx: 520, cz: 14720, len: 2950, wid: 66, rotY: 0.42 }, // Runway A
    { cx: 2150, cz: 14880, len: 3180, wid: 66, rotY: 0.42 }, // Runway C
    { cx: 880, cz: 13640, len: 2420, wid: 62, rotY: -1.16 }, // Runway B
    { cx: 3820, cz: 15840, len: 2450, wid: 62, rotY: -1.14 }, // Runway D
  ];
  for (const rw of hanedaRunways) {
    addRunwayWithLights(rw.cx, rw.cz, rw.len, rw.wid, rw.rotY, H_Y + 0.12);
  }

  // Parallel & cross taxiways connecting Runways A/B/C/D and T1/T2/T3 aprons
  addTaxiStrip(hOriginX, hOriginZ, HANEDA_ROT, -620, -1420, -620, 1420, 32, H_Y + 0.08);
  addTaxiStrip(hOriginX, hOriginZ, HANEDA_ROT, 480, -1450, 480, 1500, 32, H_Y + 0.08);
  addTaxiStrip(hOriginX, hOriginZ, HANEDA_ROT, -950, -620, 820, -620, 28, H_Y + 0.08);
  addTaxiStrip(hOriginX, hOriginZ, HANEDA_ROT, -950, 740, 880, 740, 28, H_Y + 0.08);
  addTaxiStrip(hOriginX, hOriginZ, HANEDA_ROT, -1280, -1350, -1280, 1250, 28, H_Y + 0.08);
  // Runway D connecting taxiway bridge over Tokyo Bay pier
  addTaxiStrip(2500, 15900, -1.14, 0, -520, 0, 580, 38, H_Y + 0.10);

  // Terminal 1 ("Big Bird" West Domestic Terminal, lx = -260)
  {
    const [t1x, t1z] = localToWorldXZ(hOriginX, hOriginZ, HANEDA_ROT, -270, 60);
    bodyGeoms.push(makeOrientedBox(t1x, t1z, 92, 23, 470, H_Y, HANEDA_ROT));
    accentGeoms.push(makeOrientedBox(t1x, t1z, 34, 6, 360, H_Y + 23, HANEDA_ROT));
    const [g1x, g1z] = localToWorldXZ(t1x, t1z, HANEDA_ROT, -42, 0);
    glassGeoms.push(makeOrientedBox(g1x, g1z, 18, 17, 450, H_Y + 3, HANEDA_ROT));
    // North & South Satellite Wings
    for (const wzOff of [-320, 320]) {
      const [wx, wz] = localToWorldXZ(t1x, t1z, HANEDA_ROT, -16, wzOff);
      bodyGeoms.push(makeOrientedBox(wx, wz, 52, 16, 170, H_Y, HANEDA_ROT));
      glassGeoms.push(makeOrientedBox(wx, wz, 56, 10, 164, H_Y + 4, HANEDA_ROT));
    }
    // P1 & P2 Parking Decks on landside (+95m)
    for (const pzOff of [-160, 160]) {
      const [px, pz] = localToWorldXZ(t1x, t1z, HANEDA_ROT, 102, pzOff);
      hangarGeoms.push(makeOrientedBox(px, pz, 76, 19, 175, H_Y, HANEDA_ROT));
    }
    // Jetbridges + Parked Aircraft along West Apron
    for (let i = -7; i <= 7; i++) {
      const gz = i * 44;
      const [jx, jz] = localToWorldXZ(t1x, t1z, HANEDA_ROT, -62, gz);
      accentGeoms.push(makeOrientedBox(jx, jz, 34, 4.2, 6.5, H_Y + 6.2, HANEDA_ROT));
      if (Math.abs(i) % 2 === 0) {
        pushAircraftLocal(t1x, t1z, HANEDA_ROT, -106, gz, Math.PI * 0.5, H_Y + 0.1, 0.96, 0xf8fafc);
      }
      if (i % 3 === 0) {
        pushLight(jx, H_Y + 22, jz, 0xffe4b8, 13.0, 1.05);
      }
    }
  }

  // Terminal 2 (East Domestic Terminal + North Satellite + Hotel, lx = +270)
  {
    const [t2x, t2z] = localToWorldXZ(hOriginX, hOriginZ, HANEDA_ROT, 270, -60);
    bodyGeoms.push(makeOrientedBox(t2x, t2z, 90, 24, 530, H_Y, HANEDA_ROT));
    accentGeoms.push(makeOrientedCylinder(t2x, t2z, 38, 44, 5.5, 16, H_Y + 23.5, HANEDA_ROT));
    const [g2x, g2z] = localToWorldXZ(t2x, t2z, HANEDA_ROT, 40, 0);
    glassGeoms.push(makeOrientedBox(g2x, g2z, 18, 18, 510, H_Y + 3, HANEDA_ROT));
    // T2 North Satellite Pier + link bridge
    const [nsx, nsz] = localToWorldXZ(t2x, t2z, HANEDA_ROT, 10, -400);
    bodyGeoms.push(makeOrientedBox(nsx, nsz, 54, 16, 220, H_Y, HANEDA_ROT));
    glassGeoms.push(makeOrientedBox(nsx, nsz, 58, 11, 212, H_Y + 4, HANEDA_ROT));
    const [lx, lz] = localToWorldXZ(t2x, t2z, HANEDA_ROT, 0, -280);
    glassGeoms.push(makeOrientedBox(lx, lz, 20, 12, 85, H_Y + 4, HANEDA_ROT));
    // P3 & P4 Parking Decks + Excel Hotel Wing
    for (const pzOff of [-170, 170]) {
      const [px, pz] = localToWorldXZ(t2x, t2z, HANEDA_ROT, -104, pzOff);
      hangarGeoms.push(makeOrientedBox(px, pz, 78, 19, 185, H_Y, HANEDA_ROT));
    }
    const [hx, hz] = localToWorldXZ(t2x, t2z, HANEDA_ROT, -20, 290);
    bodyGeoms.push(makeOrientedBox(hx, hz, 68, 32, 82, H_Y, HANEDA_ROT));
    // Jetbridges + Parked Aircraft along East Apron
    for (let i = -8; i <= 8; i++) {
      const gz = i * 44;
      const [jx, jz] = localToWorldXZ(t2x, t2z, HANEDA_ROT, 62, gz);
      accentGeoms.push(makeOrientedBox(jx, jz, 34, 4.2, 6.5, H_Y + 6.2, HANEDA_ROT));
      if (Math.abs(i) % 2 === 1) {
        pushAircraftLocal(t2x, t2z, HANEDA_ROT, 106, gz, -Math.PI * 0.5, H_Y + 0.1, 0.96, 0xeef6ff);
      }
      if (i % 3 === 0) {
        pushLight(jx, H_Y + 22, jz, 0xdceeff, 13.0, 1.05);
      }
    }
  }

  // Haneda New Control Tower (116m) & Old Control Tower (78m) between T1 & T2
  addControlTower(1360, 14680, 116, H_Y);
  addControlTower(1240, 14840, 78, H_Y);

  // Terminal 3 International Terminal + Haneda Airport Garden (centered over Keikyu T3 at 88, 15180)
  {
    const t3x = 88;
    const t3z = 15180;
    bodyGeoms.push(makeOrientedBox(t3x, t3z, 100, 24, 340, H_Y, HANEDA_ROT));
    const [wgx, wgz] = localToWorldXZ(t3x, t3z, HANEDA_ROT, 42, 0);
    glassGeoms.push(makeOrientedBox(wgx, wgz, 22, 18, 330, H_Y + 3, HANEDA_ROT));
    accentGeoms.push(makeOrientedBox(t3x, t3z, 48, 5, 290, H_Y + 24, HANEDA_ROT));
    // Y-shaped North & South Concourse Fingers extending northeast onto Runway A apron
    for (const sideZ of [-1, 1] as const) {
      const [fx, fz] = localToWorldXZ(t3x, t3z, HANEDA_ROT, 145, sideZ * 175);
      bodyGeoms.push(makeOrientedBox(fx, fz, 195, 16, 44, H_Y, HANEDA_ROT - sideZ * 0.35));
      glassGeoms.push(makeOrientedBox(fx, fz, 190, 10, 48, H_Y + 4, HANEDA_ROT - sideZ * 0.35));
    }
    // P5 Parking Deck & Haneda Airport Garden Hotel/Commercial Complex
    const [p5x, p5z] = localToWorldXZ(t3x, t3z, HANEDA_ROT, -110, 110);
    hangarGeoms.push(makeOrientedBox(p5x, p5z, 92, 20, 155, H_Y, HANEDA_ROT));
    const [hgx, hgz] = localToWorldXZ(t3x, t3z, HANEDA_ROT, -105, -125);
    bodyGeoms.push(makeOrientedBox(hgx, hgz, 72, 34, 145, H_Y, HANEDA_ROT));
    glassGeoms.push(makeOrientedBox(hgx, hgz, 74, 24, 138, H_Y + 6, HANEDA_ROT));

    // Jetbridges + Widebody International Aircraft at T3
    for (let i = -3; i <= 3; i++) {
      const gz = i * 48;
      const [jx, jz] = localToWorldXZ(t3x, t3z, HANEDA_ROT, 68, gz);
      accentGeoms.push(makeOrientedBox(jx, jz, 36, 4.4, 7.0, H_Y + 6.4, HANEDA_ROT));
      pushAircraftLocal(t3x, t3z, HANEDA_ROT, 118, gz, -Math.PI * 0.5, H_Y + 0.1, 1.05, 0xffffff);
      if (i % 2 === 0) pushLight(jx, H_Y + 24, jz, 0xffdfb0, 13.5, 1.1);
    }
  }

  // JAL / ANA Maintenance Hangars, West Cargo & Haneda Innovation City (新整備場・整備場・天空橋)
  const hanedaHangarCenters: [number, number, number, number, number][] = [
    [-220, 14120, 120, 21, 78],
    [-280, 13960, 115, 21, 76],
    [-340, 13800, 125, 22, 82],
    [-400, 13640, 110, 19, 72],
    [-460, 13480, 95, 17, 68],
    [-480, 14480, 105, 18, 66],
    [-540, 14320, 96, 16, 62],
    [-620, 14160, 92, 16, 60],
    [-340, 15380, 115, 18, 72],
    [-410, 15220, 108, 17, 68],
    [-480, 15060, 95, 16, 64],
    [-580, 15540, 90, 15, 62],
    // Haneda Innovation City near Tenkubashi (-1112, 14824), flanking Kanpachi-dori cleanly
    [-1020, 14650, 86, 22, 105],
    [-820, 14720, 74, 18, 88],
    [-1140, 15020, 82, 24, 102],
  ];
  for (const [hx, hz, hw, hh, hd] of hanedaHangarCenters) {
    hangarGeoms.push(makeOrientedBox(hx, hz, hw, hh, hd, H_Y, HANEDA_ROT));
    pushLight(hx, H_Y + hh + 3, hz, 0xffe4bd, 10.5, 0.78);
  }
  // A couple aircraft parked outside maintenance hangars
  pushAircraftLocal(-130, 14050, HANEDA_ROT, 0, 0, Math.PI * 0.5, H_Y + 0.1, 1.0, 0xf1f5f9);
  pushAircraftLocal(-210, 13880, HANEDA_ROT, 0, 0, Math.PI * 0.5, H_Y + 0.1, 1.0, 0xe2e8f0);

  // Tama River Mouth & Ebitori Canal bordering Haneda West/South edge (natural waterfront framing)
  const tamaMouthRib = buildRibbonXZ(
    [
      [-7600, 18200],
      [-5600, 17150],
      [-3750, 16420],
      [-2150, 15920],
      [-1420, 15840],
      [-480, 16260],
      [920, 16720],
      [2150, 17050],
    ],
    220,
    -0.55,
    true,
  );
  if (tamaMouthRib) riverMouthGeoms.push(tamaMouthRib);

  const ebitoriRib = buildRibbonXZ(
    [
      [-1260, 13350],
      [-1540, 14250],
      [-1600, 15020],
      [-1360, 15780],
    ],
    76,
    -0.55,
    true,
  );
  if (ebitoriRib) riverMouthGeoms.push(ebitoriRib);

  // ============================================================================
  // 2. NARITA INTERNATIONAL AIRPORT (NRT) — Runways A & B, T1/T2/T3 & Cargo
  // ============================================================================
  const N_Y = -0.3;
  const nOriginX = 55980;
  const nOriginZ = -9280;

  // Narita forested Chiba perimeter & mowed airport turf + concrete terminal aprons
  turfGeoms.push(makeOrientedFlatQuad(nOriginX - 80, nOriginZ - 260, 4800, 5600, N_Y - 0.12, NARITA_ROT));
  apronGeoms.push(makeOrientedFlatQuad(55680, -9220, 740, 1420, N_Y + 0.04, NARITA_ROT)); // T1 Apron
  apronGeoms.push(makeOrientedFlatQuad(56420, -9720, 760, 1540, N_Y + 0.04, NARITA_ROT)); // T2/T3 Apron
  apronGeoms.push(makeOrientedFlatQuad(55420, -8380, 560, 640, N_Y + 0.04, NARITA_ROT)); // South Cargo Apron

  // Runway A (4000m) & Runway B (2500m)
  addRunwayWithLights(55180, -9420, 4000, 62, NARITA_ROT, N_Y + 0.12);
  addRunwayWithLights(57180, -10420, 2500, 62, NARITA_ROT, N_Y + 0.12);

  // Narita taxiways connecting T1, T2, Runway A & Runway B
  addTaxiStrip(55180, -9420, NARITA_ROT, 175, -1880, 175, 1880, 32, N_Y + 0.07);
  addTaxiStrip(57180, -10420, NARITA_ROT, -165, -1180, -165, 1180, 30, N_Y + 0.07);
  addTaxiStrip(55980, -9280, NARITA_ROT, -560, -240, 960, -960, 28, N_Y + 0.07);
  addTaxiStrip(55980, -9280, NARITA_ROT, -560, 320, 960, -320, 28, N_Y + 0.07);

  // Narita Terminal 1 (Central + North/South Wings + 4 Octagonal Satellites)
  {
    const t1x = 55620;
    const t1z = -9220;
    bodyGeoms.push(makeOrientedBox(t1x, t1z, 92, 24, 250, N_Y, NARITA_ROT));
    glassGeoms.push(makeOrientedBox(t1x, t1z, 96, 17, 238, N_Y + 4, NARITA_ROT));
    for (const szOff of [-225, 225]) {
      const [wx, wz] = localToWorldXZ(t1x, t1z, NARITA_ROT, -20, szOff);
      bodyGeoms.push(makeOrientedBox(wx, wz, 64, 20, 210, N_Y, NARITA_ROT));
      glassGeoms.push(makeOrientedBox(wx, wz, 68, 13, 198, N_Y + 4, NARITA_ROT));
      // Two octagonal airside satellites per wing
      for (const satOff of [-75, 75]) {
        const [sx, sz] = localToWorldXZ(wx, wz, NARITA_ROT, -125, satOff);
        bodyGeoms.push(makeOrientedCylinder(sx, sz, 48, 52, 16, 8, N_Y, NARITA_ROT));
        glassGeoms.push(makeOrientedCylinder(sx, sz, 50, 50, 9, 8, N_Y + 5, NARITA_ROT));
        const [bx, bz] = localToWorldXZ(wx, wz, NARITA_ROT, -65, satOff);
        glassGeoms.push(makeOrientedBox(bx, bz, 88, 10, 20, N_Y + 5, NARITA_ROT));
        pushAircraftLocal(sx, sz, NARITA_ROT, -62, 0, Math.PI * 0.5, N_Y + 0.1, 1.05, 0xffffff);
        pushAircraftLocal(sx, sz, NARITA_ROT, 0, satOff < 0 ? -62 : 62, 0, N_Y + 0.1, 1.0, 0xf1f5f9);
        pushLight(sx, N_Y + 22, sz, 0xffe4b8, 13.5, 1.1);
      }
    }
    // P1 & P5 Multi-Story Parking Decks
    for (const pzOff of [-165, 165]) {
      const [px, pz] = localToWorldXZ(t1x, t1z, NARITA_ROT, 125, pzOff);
      hangarGeoms.push(makeOrientedBox(px, pz, 84, 19, 175, N_Y, NARITA_ROT));
    }
  }

  // Narita Terminal 2 (Main Building + Parallel Satellite + Shuttle Link + Parking)
  {
    const t2x = 56380;
    const t2z = -9650;
    bodyGeoms.push(makeOrientedBox(t2x, t2z, 86, 24, 510, N_Y, NARITA_ROT));
    glassGeoms.push(makeOrientedBox(t2x, t2z, 90, 17, 495, N_Y + 4, NARITA_ROT));
    // Parallel airside satellite
    const [satX, satZ] = localToWorldXZ(t2x, t2z, NARITA_ROT, 170, 0);
    bodyGeoms.push(makeOrientedBox(satX, satZ, 62, 18, 430, N_Y, NARITA_ROT));
    glassGeoms.push(makeOrientedBox(satX, satZ, 66, 12, 416, N_Y + 4, NARITA_ROT));
    const [lnkX, lnkZ] = localToWorldXZ(t2x, t2z, NARITA_ROT, 85, 0);
    glassGeoms.push(makeOrientedBox(lnkX, lnkZ, 120, 11, 28, N_Y + 5, NARITA_ROT));
    for (const pzOff of [-155, 155]) {
      const [px, pz] = localToWorldXZ(t2x, t2z, NARITA_ROT, -110, pzOff);
      hangarGeoms.push(makeOrientedBox(px, pz, 76, 18, 170, N_Y, NARITA_ROT));
    }
    for (let i = -3; i <= 3; i++) {
      const gz = i * 58;
      const [jx, jz] = localToWorldXZ(satX, satZ, NARITA_ROT, 48, gz);
      accentGeoms.push(makeOrientedBox(jx, jz, 34, 4.2, 6.5, N_Y + 6.2, NARITA_ROT));
      pushAircraftLocal(satX, satZ, NARITA_ROT, 94, gz, -Math.PI * 0.5, N_Y + 0.1, 1.05, 0xffffff);
      if (i % 2 === 0) pushLight(jx, N_Y + 21, jz, 0xdceeff, 13.0, 1.05);
    }
  }

  // Narita Terminal 3 (LCC Terminal North of T2) + 87m Control Tower
  {
    const t3x = 56520;
    const t3z = -10280;
    bodyGeoms.push(makeOrientedBox(t3x, t3z, 64, 15, 250, N_Y, NARITA_ROT));
    glassGeoms.push(makeOrientedBox(t3x, t3z, 68, 9, 236, N_Y + 3, NARITA_ROT));
    for (const gz of [-75, 0, 75]) {
      pushAircraftLocal(t3x, t3z, NARITA_ROT, 78, gz, -Math.PI * 0.5, N_Y + 0.1, 0.85, 0xf8fafc);
    }
  }
  addControlTower(55920, -9460, 87, N_Y);

  // Narita Cargo City North & South Warehouses/Hangars
  for (let i = 0; i < 6; i++) {
    const [cx, cz] = localToWorldXZ(55460, -8420, NARITA_ROT, (i % 2) * 145, Math.floor(i / 2) * 135 - 120);
    hangarGeoms.push(makeOrientedBox(cx, cz, 110, 15, 86, N_Y, NARITA_ROT));
    pushLight(cx, N_Y + 18, cz, 0xffe0b2, 11.0, 0.85);
  }
  for (let i = 0; i < 8; i++) {
    const [cx, cz] = localToWorldXZ(55540, -10280, NARITA_ROT, (i % 2) * 145, Math.floor(i / 2) * 125 - 180);
    hangarGeoms.push(makeOrientedBox(cx, cz, 108, 15, 82, N_Y, NARITA_ROT));
    pushLight(cx, N_Y + 18, cz, 0xffe0b2, 11.0, 0.85);
  }

  // ============================================================================
  // 3. PORT ISLANDS (Heiwajima / Showajima & Jonanjima / Keihinjima) +
  //    MAINLAND DISTRICTS (Kamata, Kojiya, Otorii, Kawasaki) + NARITA APPROACH
  // ============================================================================
  const mainlandRoads: [number, number][][] = [
    // Kannana / Dai-ichi Keihin / Sangyo-doro corridors south to Kawasaki
    [[-4600, 11100], [-4200, 12600], [-3870, 13311], [-4600, 14800], [-6017, 16538], [-6425, 16750]],
    [[-2800, 11100], [-2550, 12800], [-2505, 14321], [-2900, 16200], [-4200, 17800]],
    // Kanpachi-dori east-west corridor to Haneda T3/T1
    [[-6400, 13200], [-3870, 13311], [-3415, 14084], [-2505, 14321], [-1838, 14571], [-1112, 14824], [88, 15180]],
    // Bayfront Tokyo Port Highway corridor (Heiwajima -> Jonanjima -> Haneda)
    [[-1600, 10600], [-1200, 11800], [-1100, 13200], [-950, 14500]],
    // Tamagawa Sky Bridge (Tonomachi Kawasaki <-> Haneda T3)
    [[-2100, 16500], [-1350, 16150], [-480, 15520], [40, 15220]],
    // Narita Western Approach Hotel & Logistics Spine
    [[52200, -10400], [53400, -9850], [54500, -9450], [55620, -9220]],
    [[52800, -11200], [53350, -9850], [53900, -8200]],
  ];
  for (const pts of mainlandRoads) {
    const rib = buildRibbonXZ(pts, 22, 0.08);
    if (rib) taxiwayGeoms.push(rib);
  }

  // Jonanjima Seaside Park green belt along eastern/southern edge of Jonanjima
  const jonanPark = buildFlatPolygonXZ(
    [
      [1180, 11100],
      [1800, 11160],
      [1620, 12550],
      [1080, 12490],
    ],
    -0.28,
  );
  if (jonanPark) turfGeoms.push(jonanPark);

  // Port Island Logistics Warehouses on Heiwajima/Showajima & Jonanjima/Keihinjima
  for (const islId of ['heiwajima-showajima', 'jonanjima-keihinjima'] as const) {
    const isl = TOKYO_BAY_ISLANDS.find((x) => x.id === islId);
    if (!isl) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of isl.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const stepX = 128;
    const stepZ = 92;
    for (let x = minX + 60; x < maxX - 60; x += stepX) {
      for (let z = minZ + 55; z < maxZ - 55; z += stepZ) {
        const jx = x + (hashDet(x, z, 307) - 0.5) * 36;
        const jz = z + (hashDet(x, z, 311) - 0.5) * 36;
        if (islId === 'jonanjima-keihinjima' && jx > 1080) continue; // Keep Seaside Park open
        if (!pointInPoly(jx, jz, isl.pts as [number, number][])) continue;
        const r = hashDet(x, z, 313);
        if (r < 0.38) continue; // 38% open staging-yard voids
        const w = 42 + r * 78;
        const d = 24 + hashDet(x, z, 337) * 30;
        const h = 9 + hashDet(x, z, 353) * 11;
        const rot = hashDet(x, z, 367) > 0.5 ? 0.09 : 0.09 + Math.PI * 0.5;
        hangarGeoms.push(makeOrientedBox(jx, jz, w, h, d, -0.5, rot));
        if (r > 0.72) {
          pushLight(jx, h + 1.5, jz, 0xffdfb2, 10.0, 0.72);
        }
      }
    }
  }

  // Clearance lines for mainland infill so buildings stay clear of tracks, rivers & avenues
  const clearanceLines = buildClearancePolylines(
    env,
    [
      ...mainlandRoads.map((pts) => ({ pts, halfW: 20 })),
      {
        pts: [
          [-7600, 18200],
          [-5600, 17150],
          [-3750, 16420],
          [-2150, 15920],
          [-1420, 15840],
          [-480, 16260],
          [920, 16720],
          [2150, 17050],
        ],
        halfW: 130,
      },
      {
        pts: [
          [-1260, 13350],
          [-1540, 14250],
          [-1600, 15020],
          [-1360, 15780],
        ],
        halfW: 52,
      },
    ],
  );

  const waterBounds = env.waterPolygons.map((wp) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of wp.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return { minX, maxX, minZ, maxZ, pts: wp.pts };
  });

  const isWaterBlocked = (x: number, z: number): boolean => {
    if (isPointInTokyoBayWater(x, z)) return true;
    for (let i = 0; i < waterBounds.length; i++) {
      const wb = waterBounds[i]!;
      if (x < wb.minX || x > wb.maxX || z < wb.minZ || z > wb.maxZ) continue;
      if (pointInPoly(x, z, wb.pts)) return true;
    }
    return false;
  };

  const dayPal = [0xefeae1, 0xe7dfd3, 0xdde2e6, 0xeadfd1, 0xd8d5ce, 0xe5e6e9, 0xd6dce2];
  const nightPal = [0x6b7c8e, 0x627385, 0x768596, 0x5d6d7e, 0x73767d, 0x6d757f];
  const activePal = isDark ? nightPal : dayPal;

  // Ota-ku (Kamata / Kojiya / Otorii / Anamori-Inari) & Kawasaki mainland corridor south of urban chunks
  // Note: base urban chunk infill stops at centerZ = 9000 (z <= 10000), so start cleanly at z = 10040.
  const hubBoostCenters: [number, number, number][] = [
    [-3870, 13311, 52], // Keikyu Kamata
    [-6017, 16538, 66], // Kawasaki Station East
    [-2505, 14321, 32], // Otorii
    [-1838, 14571, 28], // Anamori-Inari
    [-3415, 14084, 34], // Kojiya
  ];

  const otaStep = 62;
  for (let gx = -1250; gx >= -7400 && buildingRecords.length < 2_200; gx -= otaStep) {
    for (let gz = 10050; gz <= 17600 && buildingRecords.length < 2_200; gz += otaStep) {
      const r0 = hashDet(gx, gz, 509);
      const cx = gx + (hashDet(gx, gz, 521) - 0.5) * 48;
      const cz = gz + (hashDet(gx, gz, 541) - 0.5) * 48;
      if (isWaterBlocked(cx, cz) || isPointOnHanedaAirport(cx, cz) || isPointOnTokyoBayPort(cx, cz)) {
        continue;
      }
      if (isNearAnyPolyline(cx, cz, clearanceLines)) continue;

      let minDHub = Infinity;
      let hubH = 0;
      for (const [hx, hz, maxH] of hubBoostCenters) {
        const d = Math.hypot(cx - hx, cz - hz);
        if (d < minDHub) minDHub = d;
        if (d < 680) {
          hubH = Math.max(hubH, maxH * Math.max(0, 1 - d / 680));
        }
      }

      const corridorFade = Math.exp(-Math.pow(minDHub / 1850, 2.2));
      if (corridorFade < 0.08) continue;
      const cl = 0.5 + 0.5 * Math.sin(cx * 0.0028 + cz * 0.0021);
      if (r0 > corridorFade * (0.58 + 0.42 * cl)) continue;

      const r1 = hashDet(gx, gz, 563);
      const r2 = hashDet(gx, gz, 587);
      const w = 14 + r1 * 18;
      const d = 12 + r2 * 14;
      const h = Math.max(7, Math.min(42, Math.round((7 + r0 * 14 + hubH * (0.45 + r1 * 0.55)) * (0.65 + 0.35 * corridorFade))));
      const angle = -0.22 + (hashDet(gx, gz, 599) - 0.5) * 0.35 + (r0 > 0.7 ? Math.PI * 0.5 : 0);
      const hex = activePal[Math.floor(hashDet(gx, gz, 607) * activePal.length)]!;
      buildingRecords.push({ cx, cz, w, d, h, a: angle, hex });
    }
  }

  // Narita Western Approach Hotel, Logistics & Airport Town Corridor (x: 52200..54500, z: -11200..-7400)
  for (let gx = 52200; gx <= 54480 && buildingRecords.length < 3_200; gx += 62) {
    for (let gz = -11100; gz <= -7450 && buildingRecords.length < 3_200; gz += 58) {
      const r0 = hashDet(gx, gz, 701);
      const cx = gx + (hashDet(gx, gz, 719) - 0.5) * 20;
      const cz = gz + (hashDet(gx, gz, 733) - 0.5) * 20;
      const radialDist = Math.hypot((cx - 53500) / 1400, (cz + 9450) / 1700);
      if (r0 > Math.exp(-radialDist * radialDist * 1.1) * 0.72) continue;
      if (isNearAnyPolyline(cx, cz, clearanceLines)) continue;

      const r1 = hashDet(gx, gz, 743);
      const r2 = hashDet(gx, gz, 757);
      const nearApproach = Math.abs(cz + 9650) < 950;
      const w = nearApproach ? 24 + r1 * 22 : 16 + r1 * 14;
      const d = nearApproach ? 20 + r2 * 18 : 14 + r2 * 12;
      const h = Math.round((nearApproach ? 14 : 8) + r0 * (nearApproach ? 26 : 12));
      const hex = activePal[Math.floor(hashDet(gx, gz, 773) * activePal.length)]!;
      buildingRecords.push({ cx, cz, w, d, h, a: -0.35, hex });
    }
  }

  // ---- Finalize Merged Airport Meshes ----
  const addMerged = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    renderOrder: number,
    castShadow = false,
  ) => {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    if (!merged) return;
    const m = new THREE.Mesh(merged, mat);
    m.name = name;
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.renderOrder = renderOrder;
    group.add(m);
  };

  addMerged(turfGeoms, turfMat, 'airports-infield-turf', 2);
  addMerged(apronGeoms, apronMat, 'airports-concrete-aprons', 3);
  addMerged(taxiwayGeoms, taxiwayMat, 'airports-taxiways-roads', 4);
  addMerged(runwayGeoms, runwayMat, 'airports-marked-runways', 5);
  addMerged(riverMouthGeoms, waterMaterial, 'haneda-tama-ebitori-water', 3);
  addMerged(bodyGeoms, terminalBodyMat, 'airports-terminal-halls', 7, true);
  addMerged(glassGeoms, terminalGlassMat, 'airports-terminal-glass', 7, true);
  addMerged(hangarGeoms, hangarMat, 'airports-hangars-garages', 7, true);
  addMerged(accentGeoms, towerAccentMat, 'airports-jetbridges-accents', 8, true);

  // ---- Finalize Instanced Parked Aircraft ----
  const dummy = new THREE.Object3D();
  let aircraftInst: THREE.InstancedMesh | null = null;
  if (aircraftRecords.length > 0) {
    const jetGeom = createWidebodyAircraftGeometry();
    aircraftInst = new THREE.InstancedMesh(jetGeom, aircraftMat, aircraftRecords.length);
    aircraftInst.name = 'airports-parked-aircraft';
    aircraftInst.castShadow = true;
    aircraftInst.receiveShadow = true;
    aircraftInst.renderOrder = 8;
    for (let i = 0; i < aircraftRecords.length; i++) {
      const ac = aircraftRecords[i]!;
      dummy.position.set(ac.x, ac.y, ac.z);
      dummy.rotation.set(0, ac.yaw, 0);
      dummy.scale.setScalar(ac.scale);
      dummy.updateMatrix();
      aircraftInst.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(ac.hex);
      aircraftInst.setColorAt(i, tmpColor);
    }
    aircraftInst.instanceMatrix.needsUpdate = true;
    if (aircraftInst.instanceColor) aircraftInst.instanceColor.needsUpdate = true;
    aircraftInst.computeBoundingSphere();
    group.add(aircraftInst);
  }

  // ---- Finalize Instanced Surrounding Mainland & Narita Buildings ----
  let districtInst: THREE.InstancedMesh | null = null;
  if (buildingRecords.length > 0) {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    districtInst = new THREE.InstancedMesh(unitBox, districtBuildingMat, buildingRecords.length);
    districtInst.name = 'airports-surrounding-districts';
    districtInst.castShadow = false;
    districtInst.receiveShadow = true;
    districtInst.renderOrder = 6;
    for (let i = 0; i < buildingRecords.length; i++) {
      const b = buildingRecords[i]!;
      dummy.position.set(b.cx, (b.h - 1.25) * 0.5, b.cz);
      dummy.rotation.set(0, -b.a, 0);
      dummy.scale.set(b.w, b.h + 1.25, b.d);
      dummy.updateMatrix();
      districtInst.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(b.hex);
      districtInst.setColorAt(i, tmpColor);
    }
    districtInst.instanceMatrix.needsUpdate = true;
    if (districtInst.instanceColor) districtInst.instanceColor.needsUpdate = true;
    districtInst.computeBoundingSphere();
    group.add(districtInst);
  }

  // ---- Finalize Airport Runway / Taxiway / Apron Night Lights ----
  const smoothNightRamp = (nf: number) => {
    const c = Math.max(0, Math.min(1, nf));
    const t = Math.max(0, Math.min(1, (c - 0.2) / 0.65));
    return t * t * (3 - 2 * t);
  };
  let curGlow = smoothNightRamp(isDark ? 1.0 : 0.0);
  let curOpacity = 1.0;

  const initialDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const initialScale =
    typeof window !== 'undefined' ? Math.max(240, window.innerHeight * 0.5) * initialDpr : 450;

  const lightGeom = new THREE.BufferGeometry();
  lightGeom.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
  lightGeom.setAttribute('aColor', new THREE.Float32BufferAttribute(lightCol, 3));
  lightGeom.setAttribute('aSize', new THREE.Float32BufferAttribute(lightSize, 1));
  lightGeom.setAttribute('aGain', new THREE.Float32BufferAttribute(lightGain, 1));
  lightGeom.computeBoundingSphere();

  const lightMat = new THREE.ShaderMaterial({
    vertexShader: AIRPORT_LIGHT_VERT,
    fragmentShader: AIRPORT_LIGHT_FRAG,
    uniforms: {
      uNightGlow: { value: curGlow },
      uOpacity: { value: 1.0 },
      uPixelScale: { value: initialScale },
      uDpr: { value: initialDpr },
      uMinPx: { value: 2.0 },
      uMaxPx: { value: 14.0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    clipping: true,
    clippingPlanes: clipPlanes,
    toneMapped: true,
  });

  const drawSize = new THREE.Vector2();
  const lightPoints = new THREE.Points(lightGeom, lightMat);
  lightPoints.name = 'airports-night-lighting';
  lightPoints.frustumCulled = false;
  lightPoints.renderOrder = 12;
  lightPoints.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(drawSize);
    if (drawSize.y > 0) {
      lightMat.uniforms.uPixelScale!.value = drawSize.y * 0.5;
      lightMat.uniforms.uDpr!.value = renderer.getPixelRatio();
    }
  };
  const syncLightVis = () => {
    lightPoints.visible = curGlow > 0.002 && curOpacity >= 0.18;
  };
  syncLightVis();
  group.add(lightPoints);

  return {
    group,
    setTheme(nextDark: boolean): void {
      apronMat.color.setHex(nextDark ? 0x262e38 : 0xb6bec8);
      taxiwayMat.color.setHex(nextDark ? 0x1d232b : 0x515760);
      turfMat.color.setHex(nextDark ? 0x182b20 : 0x628554);
      terminalBodyMat.color.setHex(nextDark ? 0x455364 : 0xf0f4f8);
      terminalGlassMat.color.setHex(nextDark ? 0x22364a : 0x446888);
      hangarMat.color.setHex(nextDark ? 0x384350 : 0xaab4bf);
      towerAccentMat.color.setHex(nextDark ? 0x64748b : 0xf1f5f9);

      const oldRunway = runwayTex;
      runwayTex = createAirportRunwayTexture(nextDark);
      runwayMat.map = runwayTex;
      runwayMat.needsUpdate = true;
      oldRunway.dispose();

      const oldFacade = facadeSet;
      facadeSet = generateInstancedFacadeSet(nextDark);
      districtBuildingMat.map = facadeSet.map;
      districtBuildingMat.roughnessMap = facadeSet.roughnessMap;
      districtBuildingMat.bumpMap = facadeSet.bumpMap;
      if (facadeSet.emissiveMap) districtBuildingMat.emissiveMap = facadeSet.emissiveMap;
      districtBuildingMat.needsUpdate = true;
      oldFacade.map.dispose();
      oldFacade.roughnessMap.dispose();
      oldFacade.bumpMap.dispose();
      oldFacade.emissiveMap?.dispose();

      if (districtInst) {
        const pal = nextDark ? nightPal : dayPal;
        for (let i = 0; i < buildingRecords.length; i++) {
          const b = buildingRecords[i]!;
          const hex = pal[Math.floor(hashDet(Math.round(b.cx), Math.round(b.cz), 607) * pal.length)]!;
          tmpColor.setHex(hex);
          districtInst.setColorAt(i, tmpColor);
        }
        if (districtInst.instanceColor) districtInst.instanceColor.needsUpdate = true;
      }
      this.setNightFactor(nextDark ? 1.0 : 0.0);
    },
    setNightFactor(nf: number): void {
      const clamped = Math.max(0, Math.min(1, nf));
      nightUniform.value = clamped;
      curGlow = smoothNightRamp(clamped);
      lightMat.uniforms.uNightGlow!.value = curGlow;
      syncLightVis();

      const gt = Math.max(0, Math.min(1, (clamped - 0.16) / 0.84));
      const glow = gt * gt * (3 - 2 * gt);
      terminalGlassMat.emissive.setHex(glow > 0.002 ? 0xffe9c2 : 0x000000);
      terminalGlassMat.emissiveIntensity = glow * 0.85;
      hangarMat.emissive.setHex(0x000000);
      hangarMat.emissiveIntensity = 0.0;
      towerAccentMat.emissive.setHex(glow > 0.002 ? 0xffdfa8 : 0x000000);
      towerAccentMat.emissiveIntensity = glow * 0.28;
      aircraftMat.emissive.setHex(glow > 0.002 ? 0xfff3dc : 0x000000);
      aircraftMat.emissiveIntensity = glow * 0.18;
      districtBuildingMat.emissive.setHex(glow > 0.002 ? 0xffffff : 0x000000);
      districtBuildingMat.emissiveIntensity = glow * 0.92;
    },
    setOpacity(opacity: number, isTranslucent: boolean): void {
      curOpacity = Math.max(0, Math.min(1, opacity));
      lightMat.uniforms.uOpacity!.value = curOpacity;
      syncLightVis();
      for (const m of allStdMats) {
        const need = m.transparent !== isTranslucent;
        m.transparent = isTranslucent;
        m.opacity = opacity;
        m.depthWrite = !isTranslucent;
        if (need) m.needsUpdate = true;
      }
    },
    dispose(): void {
      aircraftInst?.dispose();
      districtInst?.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      lightGeom.dispose();
      lightMat.dispose();
      runwayTex.dispose();
      facadeSet.map.dispose();
      facadeSet.roughnessMap.dispose();
      facadeSet.bumpMap.dispose();
      facadeSet.emissiveMap?.dispose();
      for (const m of allStdMats) m.dispose();
    },
  };
}
