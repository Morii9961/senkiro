/**
 * Procedural Tokyo City-Wide 3D Streetlamp Network & Flowing Night Traffic Streams (Atlas v2).
 *
 * Driven strictly by real OpenStreetMap roads, elevated expressways, intersections, and
 * curated Imperial Palace landmark coordinates in 2 GPU draw calls:
 *  - Layer A (`tokyo-streetlamp-beads`): up to 42,000 perspective-scaled luminous streetlamp
 *    heads along trunk/primary/secondary/tertiary roads, Shuto Expressway viaducts, junctions,
 *    and subtle Imperial Palace perimeter/turret uplights.
 *  - Layer B (`tokyo-night-traffic-streams`): up to 8,000 GPU-animated opposing-lane
 *    headlight/taillight beads flowing along Tokyo arterials & elevated expressways.
 *
 * Uses Three.js `logdepthbuf` + `clipping_planes` shader chunks for watertight skyscraper
 * occlusion and seamless horizontal cutaway slicing, and disables itself cleanly during midday.
 */

import * as THREE from 'three';
import { SURFACE_ELEVATION_LAYERS } from '../../contracts/atlasV2.js';
import { TERRAIN_ELEVATION_LEVELS } from './cityGeometryHelpers.js';
import type { UrbanBaseEnvironment } from '../types.js';

const PRIMARY_ROAD_Y = TERRAIN_ELEVATION_LEVELS.find((l) => l.id === 'roadPrimary')?.y ?? 0.125;

export interface StreetLightNetworkHandle {
  readonly group: THREE.Group;
  readonly lampCount: number;
  readonly trafficCount: number;
  setNightFactor(nf: number): void;
  setOpacity(opacity: number, isTranslucent: boolean): void;
  updateAnimation(elapsedSec: number): void;
  dispose(): void;
}

const MAX_LAMP_POINTS = 42_000;
const MAX_TRAFFIC_POINTS = 8_000;

function hashDet(a: number, b: number, salt = 17): number {
  let h =
    Math.imul(a | 0, 374761393) ^
    Math.imul(b | 0, 668265263) ^
    Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNightLampRamp(nf: number): number {
  const clamped = Math.max(0, Math.min(1, nf));
  const t = Math.max(0, Math.min(1, (clamped - 0.20) / 0.65));
  return t * t * (3 - 2 * t);
}

const LAMP_VERTEX_SHADER = /* glsl */ `
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

  float camDist = max(-mvPosition.z, 12.0);
  vFogFade = 1.0 - smoothstep(10500.0, 35000.0, camDist);
  gl_PointSize = clamp(
    aSize * projectionMatrix[1][1] * uPixelScale / camDist,
    uMinPx * uDpr,
    uMaxPx * uDpr
  );
}
`;

const TRAFFIC_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec3 aColor;
attribute float aSize;
attribute float aGain;
attribute float aPhase;
attribute float aSpeed;

uniform float uTimeSec;
uniform float uPixelScale;
uniform float uDpr;
uniform float uMinPx;
uniform float uMaxPx;

varying vec3 vColor;
varying float vGain;
varying float vFogFade;

void main() {
  float t = fract(aPhase + uTimeSec * aSpeed);
  float edgeFade = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t);
  vColor = aColor;
  vGain = aGain * edgeFade;

  vec3 transformed = mix(aStart, aEnd, t);
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>

  float camDist = max(-mvPosition.z, 12.0);
  vFogFade = 1.0 - smoothstep(10500.0, 35000.0, camDist);
  gl_PointSize = clamp(
    aSize * projectionMatrix[1][1] * uPixelScale / camDist,
    uMinPx * uDpr,
    uMaxPx * uDpr
  );
}
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
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

const CURATED_IMPERIAL_PALACE_LIGHTS: readonly {
  x: number;
  y: number;
  z: number;
  hex: number;
  size: number;
  gain: number;
}[] = [
  // Nijubashi Twin-Arch Bridge & Seimon Gatehouse
  { x: -1222, y: 7.2, z: 158, hex: 0xffc676, size: 12.5, gain: 0.94 },
  { x: -1208, y: 7.2, z: 118, hex: 0xffc676, size: 12.5, gain: 0.94 },
  { x: -1226, y: 10.5, z: 86, hex: 0xffd18d, size: 12.0, gain: 0.90 },
  // Kyuden Imperial Palace Courtyard & East Wing
  { x: -1332, y: 9.8, z: -144, hex: 0xffcf88, size: 12.0, gain: 0.88 },
  { x: -1356, y: 11.2, z: -190, hex: 0xffc878, size: 11.0, gain: 0.82 },
  { x: -1356, y: 11.2, z: -98, hex: 0xffc878, size: 11.0, gain: 0.82 },
  // Fujimi-yagura & Sakurada-Tatsumi Yagura Turrets
  { x: -1085, y: 11.8, z: -356, hex: 0xffc472, size: 11.5, gain: 0.92 },
  { x: -732, y: 10.4, z: -156, hex: 0xffc472, size: 11.5, gain: 0.92 },
  // Otemon, Kikyomon & Sakuradamon Gates
  { x: -687, y: 8.5, z: -389, hex: 0xffca7a, size: 11.5, gain: 0.90 },
  { x: -877, y: 8.5, z: -133, hex: 0xffca7a, size: 11.0, gain: 0.86 },
  { x: -1320, y: 8.5, z: 511, hex: 0xffca7a, size: 11.5, gain: 0.90 },
  // Edo Castle Tenshudai stone rampart uplights
  { x: -1121, y: 11.5, z: -833, hex: 0xffc270, size: 11.0, gain: 0.80 },
  // Kokyo Gaien ceremonial approach & plaza lanterns
  { x: -1080, y: 6.4, z: 220, hex: 0xffd596, size: 10.0, gain: 0.78 },
  { x: -975, y: 6.4, z: 210, hex: 0xffd596, size: 10.0, gain: 0.78 },
  { x: -840, y: 6.4, z: 55, hex: 0xffd596, size: 10.0, gain: 0.78 },
  { x: -710, y: 6.4, z: 28, hex: 0xffd596, size: 10.0, gain: 0.78 },
  { x: -610, y: 6.4, z: 10, hex: 0xffd596, size: 10.0, gain: 0.78 },
  // Inner moat corner perimeter uplights
  { x: -1255, y: 6.0, z: 465, hex: 0xffbf6c, size: 10.5, gain: 0.76 },
  { x: -735, y: 6.0, z: 495, hex: 0xffbf6c, size: 10.5, gain: 0.76 },
  { x: -575, y: 6.0, z: 185, hex: 0xffbf6c, size: 10.5, gain: 0.76 },
  { x: -600, y: 6.0, z: -430, hex: 0xffbf6c, size: 10.5, gain: 0.76 },
  { x: -660, y: 6.0, z: -860, hex: 0xffbf6c, size: 10.5, gain: 0.76 },
  // Kitanomaru Nippon Budokan warm exterior lamps
  { x: -1555, y: 10.2, z: -1392, hex: 0xffce84, size: 12.5, gain: 0.92 },
  { x: -1555, y: 10.2, z: -1298, hex: 0xffce84, size: 12.5, gain: 0.92 },
];

export function buildTokyoStreetLightNetwork(
  env: UrbanBaseEnvironment,
  isDark: boolean,
  clipPlanes: THREE.Plane[],
): StreetLightNetworkHandle {
  const group = new THREE.Group();
  group.name = 'tokyo-city-streetlights';

  // ---- Layer A: Static 3D Streetlamp Beads & Junction Lighting ----
  const lampPos: number[] = [];
  const lampCol: number[] = [];
  const lampSize: number[] = [];
  const lampGain: number[] = [];
  const seenLampCells = new Set<number>();
  const seenIntCells = new Set<number>();
  const tmpColor = new THREE.Color();

  const lampCellKey = (x: number, z: number, cellM: number) =>
    (Math.floor(x / cellM) + 4096) * 8192 + (Math.floor(z / cellM) + 4096);

  const pushLamp = (
    x: number,
    y: number,
    z: number,
    hex: number,
    size: number,
    gain: number,
    dedupCellM = 10,
    useIntGrid = false,
  ): void => {
    if (lampSize.length >= MAX_LAMP_POINTS) return;
    if (Math.abs(x) > 14_500 || Math.abs(z) > 14_500) return;

    if (dedupCellM > 0) {
      const ck = lampCellKey(x, z, dedupCellM);
      const grid = useIntGrid ? seenIntCells : seenLampCells;
      if (grid.has(ck)) return;
      grid.add(ck);
    }

    tmpColor.setHex(hex);
    lampPos.push(x, y, z);
    lampCol.push(tmpColor.r, tmpColor.g, tmpColor.b);
    lampSize.push(size);
    lampGain.push(gain);
  };

  // 1. Intersections: floodlamp hubs + Japanese traffic signals on major crossings
  for (let i = 0; i < env.intersections.length && lampSize.length < MAX_LAMP_POINTS; i++) {
    const [ix, iz, rad] = env.intersections[i]!;
    if (Math.abs(ix) > 14_500 || Math.abs(iz) > 14_500) continue;
    const h = hashDet(Math.round(ix), Math.round(iz), 19);
    const floodHex = h > 0.45 ? 0xfff2de : 0xeef6ff;
    pushLamp(ix, 8.4, iz, floodHex, 7.2, 0.72, 16, true);

    if (rad >= 9 && lampSize.length < MAX_LAMP_POINTS) {
      const ang = h * Math.PI * 2;
      const sx = ix + Math.cos(ang) * (rad * 0.52);
      const sz = iz + Math.sin(ang) * (rad * 0.52);
      const sigHex = (i % 2 === 0) ? 0xff3b30 : 0x2be6a8;
      pushLamp(sx, 6.4, sz, sigHex, 4.8, 0.85, 0);
    }
  }

  // 2. Priority road pass: Trunk & Elevated Expressways first so arterials are never starved by budget
  const sampleRoads = (predicate: (hw: string, el: number) => boolean) => {
    for (let ri = 0; ri < env.roads.length && lampSize.length < MAX_LAMP_POINTS; ri++) {
      const r = env.roads[ri]!;
      if (r.pts.length < 2 || !predicate(r.hw, r.el)) continue;

      const isElevated = r.el === 1;
      const maxRange =
        !isElevated && r.hw === 'tertiary'
          ? 8_000
          : !isElevated && r.hw === 'secondary'
            ? 11_500
            : 14_500;

      const spacing = isElevated
        ? 46
        : r.hw === 'trunk'
          ? 42
          : r.hw === 'primary'
            ? 46
            : r.hw === 'secondary'
              ? 58
              : 85;

      const lampY = isElevated
        ? SURFACE_ELEVATION_LAYERS.elevatedExpresswayY + 6.2
        : r.hw === 'trunk'
          ? 7.8
          : r.hw === 'primary'
            ? 6.8
            : r.hw === 'secondary'
              ? 5.6
              : 4.8;

      const curbOffset = isElevated
        ? 0
        : r.hw === 'trunk'
          ? r.w * 0.5 + 1.1
          : r.hw === 'primary'
            ? r.w * 0.5 + 0.9
            : r.hw === 'secondary'
              ? r.w * 0.5 + 0.7
              : r.w * 0.5 + 0.5;

      let carry = (ri % 3) * (spacing * 0.3);
      let poleSeq = 0;

      for (let si = 0; si < r.pts.length - 1 && lampSize.length < MAX_LAMP_POINTS; si++) {
        const [ax, az] = r.pts[si]!;
        const [bx, bz] = r.pts[si + 1]!;
        if (
          (Math.abs(ax) > maxRange && Math.abs(bx) > maxRange) ||
          (Math.abs(az) > maxRange && Math.abs(bz) > maxRange)
        ) {
          continue;
        }
        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 6) continue;

        const nx = -dz / segLen;
        const nz = dx / segLen;

        let dist = carry;
        while (dist < segLen - 3 && lampSize.length < MAX_LAMP_POINTS) {
          const t = dist / segLen;
          const cx = ax + dx * t;
          const cz = az + dz * t;
          if (Math.abs(cx) <= maxRange && Math.abs(cz) <= maxRange) {
            const rnd = hashDet(Math.round(cx), Math.round(cz), ri * 17 + poleSeq);
            if (isElevated) {
              const sideSign = poleSeq % 2 === 0 ? 1 : -1;
              const off = Math.min(r.w * 0.25, 2.2) * sideSign;
              const hex = rnd > 0.4 ? 0xffad42 : 0xffbf66;
              pushLamp(cx + nx * off, lampY, cz + nz * off, hex, 5.8, 0.64 + rnd * 0.16, 10);
            } else if (r.hw === 'trunk') {
              // Both curbs on Tokyo trunk arterials (opposite side staggered half-phase)
              const hA = hashDet(Math.round(cx), Math.round(cz), 31);
              const hexA = hA < 0.68 ? (hA < 0.34 ? 0xffbc62 : 0xffaa44) : hA < 0.90 ? 0xffe2b4 : 0xf2f7ff;
              pushLamp(
                cx + nx * curbOffset,
                lampY,
                cz + nz * curbOffset,
                hexA,
                6.0,
                0.62 + hA * 0.18,
                10,
              );

              // Staggered opposite curb 21m ahead when still inside segment
              const oppDist = dist + spacing * 0.5;
              if (oppDist < segLen - 2 && lampSize.length < MAX_LAMP_POINTS) {
                const ot = oppDist / segLen;
                const ocx = ax + dx * ot;
                const ocz = az + dz * ot;
                const hB = hashDet(Math.round(ocx), Math.round(ocz), 53);
                const hexB = hB < 0.68 ? (hB < 0.34 ? 0xffbc62 : 0xffaa44) : hB < 0.90 ? 0xffe2b4 : 0xf2f7ff;
                pushLamp(
                  ocx - nx * curbOffset,
                  lampY,
                  ocz - nz * curbOffset,
                  hexB,
                  6.0,
                  0.62 + hB * 0.18,
                  10,
                );
              }
            } else if (r.hw === 'primary') {
              const side = poleSeq % 2 === 0 ? 1 : -1;
              const hex = rnd < 0.45 ? 0xffc474 : rnd < 0.85 ? 0xffe8c6 : 0xeaf4ff;
              pushLamp(
                cx + nx * curbOffset * side,
                lampY,
                cz + nz * curbOffset * side,
                hex,
                5.0,
                0.50 + rnd * 0.18,
                10,
              );
            } else if (r.hw === 'secondary') {
              const side = poleSeq % 2 === 0 ? 1 : -1;
              const hex = rnd < 0.40 ? 0xffe4bd : rnd < 0.85 ? 0xdcecff : 0xffca82;
              pushLamp(
                cx + nx * curbOffset * side,
                lampY,
                cz + nz * curbOffset * side,
                hex,
                3.8,
                0.32 + rnd * 0.14,
                10,
              );
            } else {
              // Tertiary residential side street (sparse single side)
              const hex = rnd > 0.45 ? 0xdceaff : 0xffe6c4;
              pushLamp(
                cx + nx * curbOffset,
                lampY,
                cz + nz * curbOffset,
                hex,
                2.8,
                0.20 + rnd * 0.10,
                10,
              );
            }
          }
          poleSeq++;
          dist += spacing;
        }
        carry = Math.max(4, dist - segLen);
      }
    }
  };

  sampleRoads((hw, el) => el !== 1 && hw === 'trunk');
  sampleRoads((_hw, el) => el === 1);
  sampleRoads((hw, el) => el !== 1 && hw === 'primary');
  sampleRoads((hw, el) => el !== 1 && hw === 'secondary');
  sampleRoads((hw, el) => el !== 1 && hw === 'tertiary');

  // 3. Curated Imperial Palace perimeter & heritage landmark uplights
  for (const ip of CURATED_IMPERIAL_PALACE_LIGHTS) {
    pushLamp(ip.x, ip.y, ip.z, ip.hex, ip.size, ip.gain, 0);
  }

  const lampCount = lampSize.length;
  const lampGeom = new THREE.BufferGeometry();
  lampGeom.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  lampGeom.setAttribute('aColor', new THREE.Float32BufferAttribute(lampCol, 3));
  lampGeom.setAttribute('aSize', new THREE.Float32BufferAttribute(lampSize, 1));
  lampGeom.setAttribute('aGain', new THREE.Float32BufferAttribute(lampGain, 1));
  lampGeom.computeBoundingSphere();

  const initialGlow = smoothNightLampRamp(isDark ? 1.0 : 0.0);
  const initialDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const initialScale =
    typeof window !== 'undefined' ? Math.max(240, window.innerHeight * 0.5) * initialDpr : 450;

  const lampMat = new THREE.ShaderMaterial({
    vertexShader: LAMP_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    uniforms: {
      uNightGlow: { value: initialGlow },
      uOpacity: { value: 1.0 },
      uPixelScale: { value: initialScale },
      uDpr: { value: initialDpr },
      uMinPx: { value: 1.2 },
      uMaxPx: { value: 7.5 },
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
  const lampPoints = new THREE.Points(lampGeom, lampMat);
  lampPoints.name = 'tokyo-streetlamp-beads';
  lampPoints.frustumCulled = false;
  lampPoints.renderOrder = 12;
  lampPoints.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(drawSize);
    if (drawSize.y > 0) {
      lampMat.uniforms.uPixelScale!.value = drawSize.y * 0.5;
      lampMat.uniforms.uDpr!.value = renderer.getPixelRatio();
    }
  };
  group.add(lampPoints);

  // ---- Layer B: Flowing Night Arterial & Expressway Traffic Beads ----
  const tPos: number[] = [];
  const tStart: number[] = [];
  const tEnd: number[] = [];
  const tCol: number[] = [];
  const tSize: number[] = [];
  const tGain: number[] = [];
  const tPhase: number[] = [];
  const tSpeed: number[] = [];

  const headlightCol = new THREE.Color(0xfff6e3);
  const taillightCol = new THREE.Color(0xff2e2e);

  const pushTrafficPair = (
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    col: THREE.Color,
    size: number,
    gain: number,
    phase: number,
    speed: number,
  ): void => {
    if (tSize.length >= MAX_TRAFFIC_POINTS) return;
    tPos.push((sx + ex) * 0.5, (sy + ey) * 0.5, (sz + ez) * 0.5);
    tStart.push(sx, sy, sz);
    tEnd.push(ex, ey, ez);
    tCol.push(col.r, col.g, col.b);
    tSize.push(size);
    tGain.push(gain);
    tPhase.push(phase);
    tSpeed.push(speed);
  };

  for (let ri = 0; ri < env.roads.length && tSize.length < MAX_TRAFFIC_POINTS; ri++) {
    const r = env.roads[ri]!;
    const isEligible = r.el === 1 || r.hw === 'trunk' || (r.hw === 'primary' && r.w >= 13);
    if (!isEligible || r.pts.length < 2) continue;

    const roadY =
      r.el === 1
        ? SURFACE_ELEVATION_LAYERS.elevatedExpresswayY + 1.1
        : (r.hw === 'trunk'
            ? SURFACE_ELEVATION_LAYERS.arterialRoadY
            : PRIMARY_ROAD_Y) + 1.1;

    const laneOff = Math.max(2.2, r.w * 0.22);

    for (let si = 0; si < r.pts.length - 1 && tSize.length < MAX_TRAFFIC_POINTS; si++) {
      const [ax, az] = r.pts[si]!;
      const [bx, bz] = r.pts[si + 1]!;
      if (
        Math.abs(ax) > 11_500 ||
        Math.abs(az) > 11_500 ||
        Math.abs(bx) > 11_500 ||
        Math.abs(bz) > 11_500
      ) {
        continue;
      }
      const segLen = Math.hypot(bx - ax, bz - az);
      if (segLen < 35) continue;

      const nx = -(bz - az) / segLen;
      const nz = (bx - ax) / segLen;
      const beadsPerLane = Math.min(4, Math.max(1, Math.floor(segLen / 95)));
      const speedMps = r.el === 1 ? 22 : r.hw === 'trunk' ? 16 : 13;

      for (let bi = 0; bi < beadsPerLane && tSize.length < MAX_TRAFFIC_POINTS; bi++) {
        const rnd = hashDet(ri * 37 + si, bi, 809);
        const speedNorm = (speedMps * (0.85 + rnd * 0.35)) / segLen;
        const basePhase = ((bi / beadsPerLane) + rnd * 0.45) % 1;

        // Left-hand Japanese driving: forward stream on -normal side (warm headlights),
        // opposing stream traveling b -> a on +normal side (ruby taillights).
        pushTrafficPair(
          ax - nx * laneOff,
          roadY,
          az - nz * laneOff,
          bx - nx * laneOff,
          roadY,
          bz - nz * laneOff,
          headlightCol,
          3.4,
          0.80,
          basePhase,
          speedNorm,
        );
        pushTrafficPair(
          bx + nx * laneOff,
          roadY,
          bz + nz * laneOff,
          ax + nx * laneOff,
          roadY,
          az + nz * laneOff,
          taillightCol,
          3.2,
          0.78,
          (basePhase + 0.53) % 1,
          speedNorm,
        );
      }
    }
  }

  const trafficCount = tSize.length;
  const trafficGeom = new THREE.BufferGeometry();
  trafficGeom.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
  trafficGeom.setAttribute('aStart', new THREE.Float32BufferAttribute(tStart, 3));
  trafficGeom.setAttribute('aEnd', new THREE.Float32BufferAttribute(tEnd, 3));
  trafficGeom.setAttribute('aColor', new THREE.Float32BufferAttribute(tCol, 3));
  trafficGeom.setAttribute('aSize', new THREE.Float32BufferAttribute(tSize, 1));
  trafficGeom.setAttribute('aGain', new THREE.Float32BufferAttribute(tGain, 1));
  trafficGeom.setAttribute('aPhase', new THREE.Float32BufferAttribute(tPhase, 1));
  trafficGeom.setAttribute('aSpeed', new THREE.Float32BufferAttribute(tSpeed, 1));
  trafficGeom.computeBoundingSphere();

  const trafficMat = new THREE.ShaderMaterial({
    vertexShader: TRAFFIC_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    uniforms: {
      uTimeSec: { value: 0 },
      uNightGlow: { value: initialGlow },
      uOpacity: { value: 1.0 },
      uPixelScale: { value: initialScale },
      uDpr: { value: initialDpr },
      uMinPx: { value: 1.1 },
      uMaxPx: { value: 5.5 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    clipping: true,
    clippingPlanes: clipPlanes,
    toneMapped: true,
  });

  const trafficPoints = new THREE.Points(trafficGeom, trafficMat);
  trafficPoints.name = 'tokyo-night-traffic-streams';
  trafficPoints.frustumCulled = false;
  trafficPoints.renderOrder = 13;
  trafficPoints.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(drawSize);
    if (drawSize.y > 0) {
      trafficMat.uniforms.uPixelScale!.value = drawSize.y * 0.5;
      trafficMat.uniforms.uDpr!.value = renderer.getPixelRatio();
    }
  };
  group.add(trafficPoints);

  let curNightGlow = initialGlow;
  let curOpacity = 1.0;

  const syncVisibility = () => {
    group.visible = curNightGlow > 0.002 && curOpacity >= 0.18;
  };
  syncVisibility();

  return {
    group,
    lampCount,
    trafficCount,
    setNightFactor(nf: number): void {
      curNightGlow = smoothNightLampRamp(nf);
      lampMat.uniforms.uNightGlow!.value = curNightGlow;
      trafficMat.uniforms.uNightGlow!.value = curNightGlow;
      syncVisibility();
    },
    setOpacity(opacity: number, _isTranslucent: boolean): void {
      curOpacity = Math.max(0, Math.min(1, opacity));
      lampMat.uniforms.uOpacity!.value = curOpacity;
      trafficMat.uniforms.uOpacity!.value = curOpacity;
      syncVisibility();
    },
    updateAnimation(elapsedSec: number): void {
      if (group.visible) {
        trafficMat.uniforms.uTimeSec!.value = elapsedSec;
      }
    },
    dispose(): void {
      lampGeom.dispose();
      lampMat.dispose();
      trafficGeom.dispose();
      trafficMat.dispose();
    },
  };
}
