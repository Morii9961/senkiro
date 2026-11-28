/**
 * Natural 7-Category Urban Vegetation System for SENKIRO Atlas.
 *
 * Replaces uniform grid tree scattering with:
 *  - 7 green-space classes: Dense Forest (Imperial Fukiage, Meiji Jingu, Shinjuku Gyoen),
 *    Historic Park (Kokyo Gaien black pines), Urban Park (grove clusters + lawn clearings),
 *    Open Lawn, Riverbank Vegetation, Boulevard Street Trees, and Residential Courtyard Greenery.
 *  - Clustered multi-scale density fields + Poisson-disk minimum-distance enforcement.
 *  - 3 low-cost 3D foliage archetypes (multi-lobe broadleaf, tiered cedar/pine conifer, shrub)
 *    + shared trunks (~4 instanced draw calls total).
 *  - Canopy height-AO shader (darker shaded underside, sunlit top, Golden/Blue/Night response).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import type { CityLightingUniforms } from '../materials/groundShader.js';
import type { UrbanBaseEnvironment } from '../types.js';
import { getEffectiveRiverWidth, isSurfaceRiverVisible, pointInPoly } from './cityGeometryHelpers.js';
import {
  IMPERIAL_PALACE_ARCHITECTURAL_FOOTPRINTS,
  IMPERIAL_PALACE_INNER_POLY,
  IMPERIAL_PALACE_PLATEAU_Y,
  isPointInImperialMoat,
  isPointOnImperialPlateau,
} from './imperialPalace.js';
import { showcaseZoneBounds } from './cityGeometryHelpers.js';
import { isPointInTokyoBayWater } from './tokyoBayWaterfront.js';

export type VegetationCategory =
  | 'dense_forest'
  | 'historic_park'
  | 'urban_park'
  | 'open_lawn'
  | 'street_tree'
  | 'riverbank'
  | 'courtyard';

type FoliageArchetype = 'broadleaf' | 'conifer' | 'shrub';

interface VegInstance {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  rotY: number;
  archetype: FoliageArchetype;
  hasTrunk: boolean;
  paletteIdx: number;
}

export interface VegetationSystemHandle {
  readonly group: THREE.Group;
  readonly treeCount: number;
  setTimeOfDay(nightFactor: number, goldenFactor: number, blueHourFactor: number): void;
  setTheme(isDark: boolean): void;
  setOpacity(opacity: number, isTranslucent: boolean): void;
  dispose(): void;
}

const CANOPY_PALETTE_DAY = [
  0x3f6b3a, // deep forest broadleaf
  0x4c7944, // zelkova green
  0x355d34, // shaded pine / cedar
  0x59864c, // sunlit foliage
  0x466d40, // mid olive oak
  0x648d52, // warm spring leaf
  0x3a643d, // evergreen camphor
  0x6b8b4b, // ginkgo olive
];

const CANOPY_PALETTE_NIGHT = [
  0x182b1f,
  0x1e3426,
  0x14241a,
  0x243b2c,
  0x1b2f22,
  0x27402e,
  0x182c20,
  0x243929,
];

function hashTree(a: number, b: number, salt: number): number {
  let h =
    Math.imul(a | 0, 374761393) ^
    Math.imul(b | 0, 668265263) ^
    Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 668265263);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fbmDensity(x: number, z: number, seed: number): number {
  const n1 = Math.sin(x * 0.011 + seed) * Math.cos(z * 0.013 - seed * 0.6);
  const n2 = Math.sin((x + z) * 0.027 - seed * 1.3) * Math.cos((x - z) * 0.024 + seed);
  return (n1 * 0.62 + n2 * 0.38) * 0.5 + 0.5;
}

function normalizeGeom(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ni = g.index ? g.toNonIndexed() : g;
  if (ni !== g) g.dispose();
  if (ni.getAttribute('uv')) ni.deleteAttribute('uv');
  ni.computeVertexNormals();
  return ni;
}

function createBroadleafCanopyGeometry(): THREE.BufferGeometry {
  const lobes: [number, number, number, number, number, number, number][] = [
    [2.45, 0, 4.95, 0, 1.08, 0.92, 1.02],
    [1.82, 1.32, 4.35, 0.72, 1.05, 0.85, 0.96],
    [1.72, -1.18, 4.48, -0.78, 0.98, 0.88, 1.06],
    [1.42, 0.25, 5.75, -0.35, 0.95, 0.82, 0.95],
  ];
  const parts = lobes.map(([r, tx, ty, tz, sx, sy, sz]) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(sx, sy, sz);
    g.translate(tx, ty, tz);
    return normalizeGeom(g);
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function createConiferCanopyGeometry(): THREE.BufferGeometry {
  const tiers: [number, number, number][] = [
    [2.25, 3.3, 2.8],
    [1.82, 3.0, 4.5],
    [1.25, 2.7, 6.2],
  ];
  const parts = tiers.map(([rad, h, cy]) => {
    const g = new THREE.ConeGeometry(rad, h, 7);
    g.translate(0, cy, 0);
    return normalizeGeom(g);
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function createShrubCanopyGeometry(): THREE.BufferGeometry {
  const g1 = new THREE.IcosahedronGeometry(1.45, 0);
  g1.scale(1.18, 0.72, 1.05);
  g1.translate(0, 1.15, 0);
  const g2 = new THREE.IcosahedronGeometry(1.05, 0);
  g2.scale(1.05, 0.68, 1.05);
  g2.translate(0.92, 0.9, 0.35);
  const parts = [normalizeGeom(g1), normalizeGeom(g2)];
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

function injectCanopyLightingShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CityLightingUniforms,
): void {
  const cacheTag = 'senkiro-canopy-lit-v1';
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uVegSunDir = uniforms.uSunDir;
    shader.uniforms.uVegSunColor = uniforms.uSunColor;
    shader.uniforms.uVegSkyHorizon = uniforms.uSkyHorizonColor;
    shader.uniforms.uVegNight = uniforms.uNightFactor;
    shader.uniforms.uVegGolden = uniforms.uGoldenFactor;
    shader.uniforms.uVegVisualMode = uniforms.uVisualMode;
    shader.uniforms.uVegAerialColor = uniforms.uAerialColor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vCanopyLocalY;
varying vec3 vCanopyWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vCanopyLocalY = clamp((position.y - 0.8) / 5.5, 0.0, 1.0);
vec4 cWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  cWp = instanceMatrix * cWp;
#endif
cWp = modelMatrix * cWp;
vCanopyWorldPos = cWp.xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uVegSunDir;
uniform vec3 uVegSunColor;
uniform vec3 uVegSkyHorizon;
uniform float uVegNight;
uniform float uVegGolden;
uniform float uVegVisualMode;
uniform vec3 uVegAerialColor;
varying float vCanopyLocalY;
varying vec3 vCanopyWorldPos;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  // Crown underside self-shadowing AO + sunlit upper foliage warmth
  float crownAo = mix(0.58, 1.12, smoothstep(0.0, 0.92, vCanopyLocalY));
  diffuseColor.rgb *= crownAo;
  if (uVegGolden > 0.02) {
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.02, 0.86), vCanopyLocalY * uVegGolden * 0.55);
  }
}`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `{
  float vDist = length(vViewPosition);
  float aerialT = smoothstep(8500.0, 48000.0, vDist) * (0.26 + 0.34 * uVegVisualMode);
  vec3 viewDirW = normalize(vCanopyWorldPos - cameraPosition);
  float sunAlign = clamp(dot(viewDirW, normalize(uVegSunDir)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 hazeCol = mix(uVegAerialColor, uVegSunColor * 0.72 + uVegSkyHorizon * 0.28, pow(max(sunAlign, 0.001), 2.5) * uVegGolden * 0.65);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, aerialT);
}
#include <tonemapping_fragment>`,
      );
  };
  material.needsUpdate = true;
}

function classifyParkCategory(
  name: string | null,
  kind?: 'forest' | 'park' | 'grass' | 'soil',
  isImperial = false,
): VegetationCategory {
  if (isImperial || kind === 'forest') return 'dense_forest';
  if (kind === 'grass') return 'open_lawn';
  if (name) {
    if (
      name.includes('明治神宮') ||
      name.includes('新宿御苑') ||
      name.includes('自然教育園') ||
      name.includes('吹上') ||
      name.includes('の森') ||
      name.includes('林試')
    ) {
      return 'dense_forest';
    }
    if (name.includes('皇居外苑') || name.includes('北の丸')) {
      return 'historic_park';
    }
  }
  return 'urban_park';
}

export function buildNaturalVegetation(
  env: UrbanBaseEnvironment,
  isDark: boolean,
  clipPlanes: THREE.Plane[],
  lightingUniforms: CityLightingUniforms,
  cutawayUniforms?: CutawayUniforms,
): VegetationSystemHandle {
  const group = new THREE.Group();
  group.name = 'urban-natural-vegetation';

  const maxTotal = 26_000;
  const parkBudget = 19_500;
  const instances: VegInstance[] = [];

  // 7m Poisson-disk spatial hash for organic minimum-distance enforcement without grid artifacts
  const cellSize = 7;
  const spatialHash = new Map<number, [number, number][]>();
  const bucketKey = (x: number, z: number) =>
    (Math.floor(x / cellSize) + 4096) * 8192 + (Math.floor(z / cellSize) + 4096);

  const isTooClose = (x: number, z: number, minDist: number): boolean => {
    const rCells = Math.ceil(minDist / cellSize);
    const gx0 = Math.floor(x / cellSize);
    const gz0 = Math.floor(z / cellSize);
    const minSq = minDist * minDist;
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dz = -rCells; dz <= rCells; dz++) {
        const list = spatialHash.get((gx0 + dx + 4096) * 8192 + (gz0 + dz + 4096));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const [px, pz] = list[i]!;
          const ddx = px - x;
          const ddz = pz - z;
          if (ddx * ddx + ddz * ddz < minSq) return true;
        }
      }
    }
    return false;
  };

  const acceptSample = (
    x: number,
    z: number,
    minDist: number,
    rec: Omit<VegInstance, 'x' | 'z'>,
  ): boolean => {
    if (instances.length >= maxTotal) return false;
    if (isTooClose(x, z, minDist)) return false;
    const key = bucketKey(x, z);
    const arr = spatialHash.get(key);
    if (arr) arr.push([x, z]);
    else spatialHash.set(key, [[x, z]]);
    instances.push({ x, z, ...rec });
    return true;
  };

  const isInsideImperialArchitecture = (x: number, z: number): boolean => {
    if (x >= -1165 && x <= -895 && z >= 120 && z <= 325) return true;
    if (x >= -920 && x <= -575 && z >= -25 && z <= 85) return true;
    for (const fp of IMPERIAL_PALACE_ARCHITECTURAL_FOOTPRINTS) {
      if (Math.hypot(x - fp.x, z - fp.z) < fp.r) return true;
    }
    return false;
  };

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

  const isInWater = (x: number, z: number): boolean => {
    if (isPointInImperialMoat(x, z)) return true;
    if (isPointInTokyoBayWater(x, z)) return true;
    for (let i = 0; i < waterBounds.length; i++) {
      const wb = waterBounds[i]!;
      if (x < wb.minX || x > wb.maxX || z < wb.minZ || z > wb.maxZ) continue;
      if (pointInPoly(x, z, wb.pts)) return true;
    }
    return false;
  };

  const blockedGrid = new Set<number>();
  const markBlockedDisc = (x: number, z: number, radM: number) => {
    const rCells = Math.ceil(radM / 12);
    const gx0 = Math.floor(x / 12);
    const gz0 = Math.floor(z / 12);
    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dz = -rCells; dz <= rCells; dz++) {
        blockedGrid.add((gx0 + dx + 4096) * 8192 + (gz0 + dz + 4096));
      }
    }
  };
  const isRoadOrRailBlocked = (x: number, z: number) =>
    blockedGrid.has((Math.floor(x / 12) + 4096) * 8192 + (Math.floor(z / 12) + 4096));

  for (const [ix, iz, rad] of env.intersections) {
    markBlockedDisc(ix, iz, rad + 4);
  }
  if (env.railCorridors) {
    for (const c of env.railCorridors) {
      for (let i = 0; i < c.pts.length - 1; i++) {
        const [ax, az] = c.pts[i]!;
        const [bx, bz] = c.pts[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(len / 14));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          markBlockedDisc(ax + (bx - ax) * t, az + (bz - az) * t, c.width * 0.5 + 3.5);
        }
      }
    }
  }
  for (const rv of env.riverLines) {
    if (!isSurfaceRiverVisible(rv.name)) continue;
    const rw = getEffectiveRiverWidth(rv.name, rv.width) * 0.5 + 4;
    for (let i = 0; i < rv.pts.length - 1; i++) {
      const [ax, az] = rv.pts[i]!;
      const [bx, bz] = rv.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 16));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        markBlockedDisc(ax + (bx - ax) * t, az + (bz - az) * t, rw);
      }
    }
  }

  // 1. Forests, Historic Greenspaces, Urban Parks & Open Lawns via Poisson-disk + Density Field
  const greenPolys: {
    name: string | null;
    kind?: 'forest' | 'park' | 'grass' | 'soil';
    pts: [number, number][];
    isImperial?: boolean;
  }[] = [
    {
      name: '皇居内苑・吹上御苑',
      kind: 'forest',
      pts: IMPERIAL_PALACE_INNER_POLY as [number, number][],
      isImperial: true,
    },
    ...env.parkPolygons,
  ];

  for (let pi = 0; pi < greenPolys.length && instances.length < parkBudget; pi++) {
    const polyEntry = greenPolys[pi]!;
    const pts = polyEntry.pts;
    if (pts.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    if (spanX < 14 || spanZ < 14) continue;
    if (Math.abs((minX + maxX) * 0.5) > 17_500 || Math.abs((minZ + maxZ) * 0.5) > 17_500) continue;

    const category = classifyParkCategory(polyEntry.name, polyEntry.kind, polyEntry.isImperial);
    const approxArea = spanX * spanZ;
    const minDist =
      category === 'dense_forest'
        ? 8.5
        : category === 'historic_park'
          ? 14.5
          : category === 'open_lawn'
            ? 24.0
            : 11.5;
    const cap =
      category === 'dense_forest'
        ? Math.min(3400, Math.max(220, Math.floor(approxArea / 140)))
        : category === 'open_lawn'
          ? Math.min(200, Math.floor(approxArea / 1300))
          : Math.min(1800, Math.max(90, Math.floor(approxArea / 280)));
    // Adaptive spacing spreads the polygon cap across the entire polygon (prevents west-to-east sweep exhaustion)
    const sampleStep = Math.max(minDist * 1.15, Math.sqrt((approxArea * 0.56) / Math.max(1, cap)));

    let added = 0;
    for (
      let gx = minX + sampleStep * 0.4;
      gx < maxX && added < cap && instances.length < parkBudget;
      gx += sampleStep
    ) {
      for (
        let gz = minZ + sampleStep * 0.4;
        gz < maxZ && added < cap && instances.length < parkBudget;
        gz += sampleStep
      ) {
        const ix = Math.round(gx);
        const iz = Math.round(gz);
        const rJ1 = hashTree(ix, iz, pi * 17 + 31);
        const rJ2 = hashTree(ix, iz, pi * 23 + 57);
        const rType = hashTree(ix, iz, pi * 41 + 83);
        const rScale = hashTree(ix, iz, pi * 53 + 107);

        const px = gx + (rJ1 - 0.5) * sampleStep * 0.92;
        const pz = gz + (rJ2 - 0.5) * sampleStep * 0.92;
        const density = fbmDensity(px, pz, pi * 1.7);

        if (category === 'dense_forest') {
          // Continuous lush woodland canopy with rare glades
          if (density < 0.18 && rType < 0.65) continue;
        } else if (category === 'historic_park') {
          // Kokyo Gaien open ceremonial pine lawn
          if (density < 0.46) continue;
        } else if (category === 'open_lawn') {
          // Retain 80%+ open grassy field
          if (density < 0.72) continue;
        } else {
          // Urban park: natural grove clusters separated by lawns and paths
          if (density < 0.40) continue;
        }

        if (!pointInPoly(px, pz, pts)) continue;
        if (isInsideImperialArchitecture(px, pz)) continue;
        if (isInWater(px, pz) || isRoadOrRailBlocked(px, pz)) continue;

        const baseY = isPointOnImperialPlateau(px, pz) ? IMPERIAL_PALACE_PLATEAU_Y : 0;
        let archetype: FoliageArchetype = 'broadleaf';
        if (category === 'dense_forest') {
          archetype = rType > 0.62 ? 'conifer' : rType < 0.14 ? 'shrub' : 'broadleaf';
        } else if (category === 'historic_park') {
          archetype = rType > 0.35 ? 'conifer' : 'broadleaf';
        } else if (category === 'urban_park') {
          archetype = rType > 0.76 ? 'conifer' : rType < 0.18 ? 'shrub' : 'broadleaf';
        }

        const sizeBoost =
          category === 'dense_forest' ? 1.35 + density * 0.65 : 1.05 + density * 0.45;
        const sx = (0.75 + rScale * 0.65) * sizeBoost;
        const sy = (0.8 + hashTree(ix, iz, 131) * 0.65) * sizeBoost;

        if (
          acceptSample(px, pz, minDist, {
            y: baseY,
            sx,
            sy,
            rotY: hashTree(ix, iz, 163) * Math.PI * 2,
            archetype,
            hasTrunk: archetype !== 'shrub',
            paletteIdx: Math.floor(hashTree(ix, iz, 193) * CANOPY_PALETTE_DAY.length),
          })
        ) {
          added++;
        }
      }
    }
  }

  // 2. Riverbank Vegetation along Sumida / Arakawa / Kanda / Meguro embankments
  for (let ri = 0; ri < env.riverLines.length && instances.length < maxTotal - 2500; ri++) {
    const rv = env.riverLines[ri]!;
    if (!isSurfaceRiverVisible(rv.name) || rv.pts.length < 2) continue;
    const rw = getEffectiveRiverWidth(rv.name, rv.width);
    if (rw < 16) continue;
    const bankOffset = rw * 0.5 + 5.2;

    for (let si = 0; si < rv.pts.length - 1; si++) {
      const [ax, az] = rv.pts[si]!;
      const [bx, bz] = rv.pts[si + 1]!;
      if (Math.abs(ax) > 13_500 || Math.abs(az) > 13_500) continue;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 22) continue;
      const nx = -dz / len;
      const nz = dx / len;

      for (let dist = 12; dist < len - 10; dist += 28) {
        const t = dist / len;
        const cx = ax + dx * t;
        const cz = az + dz * t;
        for (const side of [-1, 1] as const) {
          const r = hashTree(Math.round(cx), Math.round(cz), ri * 11 + side);
          if (r < 0.35) continue;
          const vx = cx + nx * bankOffset * side;
          const vz = cz + nz * bankOffset * side;
          if (isInWater(vx, vz) || isRoadOrRailBlocked(vx, vz)) continue;
          acceptSample(vx, vz, 11.0, {
            y: 0,
            sx: 0.72 + r * 0.42,
            sy: 0.78 + r * 0.38,
            rotY: r * Math.PI * 2,
            archetype: r > 0.72 ? 'shrub' : 'broadleaf',
            hasTrunk: r <= 0.72,
            paletteIdx: Math.floor(hashTree(Math.round(vx), Math.round(vz), 271) * CANOPY_PALETTE_DAY.length),
          });
        }
      }
    }
  }

  // 3. Boulevard Street Trees along primary & trunk avenues (outside Shibuya showcase core)
  const shibuya = showcaseZoneBounds();
  const streetSpacing = 32;
  for (let ri = 0; ri < env.roads.length && instances.length < maxTotal - 800; ri++) {
    const r = env.roads[ri]!;
    if (r.el === 1 || (r.hw !== 'primary' && r.hw !== 'trunk') || r.pts.length < 2) continue;
    const lateralOffset = r.w * 0.5 + 2.3;
    let carry = 12;

    for (let si = 0; si < r.pts.length - 1 && instances.length < maxTotal - 800; si++) {
      const [ax, az] = r.pts[si]!;
      const [bx, bz] = r.pts[si + 1]!;
      if (Math.abs(ax) > 13_500 || Math.abs(az) > 13_500) continue;
      const dx = bx - ax;
      const dz = bz - az;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 8) continue;
      const nx = -dz / segLen;
      const nz = dx / segLen;

      let dist = carry;
      while (dist < segLen - 6 && instances.length < maxTotal - 800) {
        const t = dist / segLen;
        const cx = ax + dx * t;
        const cz = az + dz * t;
        const inShibuyaCore =
          cx >= shibuya.minX &&
          cx <= shibuya.maxX &&
          cz >= shibuya.minZ &&
          cz <= shibuya.maxZ;
        if (!inShibuyaCore) {
          for (const side of [-1, 1] as const) {
            const tx = cx + nx * lateralOffset * side;
            const tz = cz + nz * lateralOffset * side;
            if (isRoadOrRailBlocked(tx, tz) || isInWater(tx, tz)) continue;
            const rScale = hashTree(Math.round(tx), Math.round(tz), ri * 13 + side);
            acceptSample(tx, tz, 9.0, {
              y: 0,
              sx: 0.72 + rScale * 0.34,
              sy: 0.78 + hashTree(Math.round(tx), Math.round(tz), 211) * 0.34,
              rotY: rScale * Math.PI * 2,
              archetype: 'broadleaf',
              hasTrunk: true,
              paletteIdx: Math.floor(
                hashTree(Math.round(tx), Math.round(tz), 257) * CANOPY_PALETTE_DAY.length,
              ),
            });
          }
        }
        dist += streetSpacing;
      }
      carry = Math.max(4, dist - segLen);
    }
  }

  // 4. Subtle Residential Courtyard Shrubs/Trees inside residential landuse blocks
  if (env.landuseBlocks) {
    for (let bi = 0; bi < env.landuseBlocks.length && instances.length < maxTotal; bi++) {
      const blk = env.landuseBlocks[bi]!;
      if (blk.kind !== 'residential' || blk.pts.length < 3) continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of blk.pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      for (let x = minX + 18; x < maxX - 18 && instances.length < maxTotal; x += 48) {
        for (let z = minZ + 18; z < maxZ - 18 && instances.length < maxTotal; z += 48) {
          const r = hashTree(Math.round(x), Math.round(z), bi + 911);
          if (r < 0.52) continue;
          const jx = x + (hashTree(Math.round(x), Math.round(z), 919) - 0.5) * 18;
          const jz = z + (hashTree(Math.round(x), Math.round(z), 929) - 0.5) * 18;
          if (!pointInPoly(jx, jz, blk.pts)) continue;
          if (isInWater(jx, jz) || isRoadOrRailBlocked(jx, jz)) continue;
          acceptSample(jx, jz, 12.0, {
            y: 0,
            sx: 0.65 + r * 0.35,
            sy: 0.68 + r * 0.35,
            rotY: r * Math.PI * 2,
            archetype: r > 0.78 ? 'broadleaf' : 'shrub',
            hasTrunk: r > 0.78,
            paletteIdx: Math.floor(r * CANOPY_PALETTE_DAY.length),
          });
        }
      }
    }
  }

  const trunkMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x2a231e : 0x524234,
    roughness: 0.94,
    metalness: 0.02,
    clippingPlanes: clipPlanes,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
    envMapIntensity: 0.48,
    clippingPlanes: clipPlanes,
  });
  injectCanopyLightingShader(canopyMat, lightingUniforms);
  if (cutawayUniforms) {
    injectRadialCutaway(trunkMat, cutawayUniforms, 'building');
    injectRadialCutaway(canopyMat, cutawayUniforms, 'building');
  }

  const broadleafList = instances.filter((i) => i.archetype === 'broadleaf');
  const coniferList = instances.filter((i) => i.archetype === 'conifer');
  const shrubList = instances.filter((i) => i.archetype === 'shrub');
  const trunkList = instances.filter((i) => i.hasTrunk);

  const paletteRefs: { mesh: THREE.InstancedMesh; indices: Uint8Array }[] = [];
  const instMeshes: THREE.InstancedMesh[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const initialPalette = isDark ? CANOPY_PALETTE_NIGHT : CANOPY_PALETTE_DAY;

  const buildCanopyMesh = (
    name: string,
    geom: THREE.BufferGeometry,
    list: VegInstance[],
  ): THREE.InstancedMesh | null => {
    if (list.length === 0) {
      geom.dispose();
      return null;
    }
    const mesh = new THREE.InstancedMesh(geom, canopyMat, list.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 11;
    const indices = new Uint8Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const tr = list[i]!;
      dummy.position.set(tr.x, tr.y, tr.z);
      dummy.rotation.set(0, tr.rotY, 0);
      dummy.scale.set(tr.sx, tr.sy, tr.sx);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      indices[i] = tr.paletteIdx;
      color.setHex(initialPalette[tr.paletteIdx]!);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    instMeshes.push(mesh);
    paletteRefs.push({ mesh, indices });
    return mesh;
  };

  buildCanopyMesh('urban-veg-broadleaf', createBroadleafCanopyGeometry(), broadleafList);
  buildCanopyMesh('urban-veg-conifer', createConiferCanopyGeometry(), coniferList);
  buildCanopyMesh('urban-veg-shrubs', createShrubCanopyGeometry(), shrubList);

  if (trunkList.length > 0) {
    const trunkGeom = new THREE.CylinderGeometry(0.2, 0.34, 3.2, 5);
    trunkGeom.translate(0, 1.35, 0);
    const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, trunkList.length);
    trunkMesh.name = 'urban-veg-trunks';
    trunkMesh.castShadow = false;
    trunkMesh.receiveShadow = true;
    trunkMesh.renderOrder = 11;
    for (let i = 0; i < trunkList.length; i++) {
      const tr = trunkList[i]!;
      dummy.position.set(tr.x, tr.y, tr.z);
      dummy.rotation.set(0, tr.rotY, 0);
      dummy.scale.set(tr.sx, tr.sy, tr.sx);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    group.add(trunkMesh);
    instMeshes.push(trunkMesh);
  }

  return {
    group,
    treeCount: instances.length,
    setTimeOfDay(nightFactor: number, goldenFactor: number, _blueHourFactor: number): void {
      const cDay = new THREE.Color(0xffffff);
      const cGolden = new THREE.Color(0xffcfa6);
      const cNight = new THREE.Color(0x526b8c);
      canopyMat.color
        .copy(cDay)
        .lerp(cNight, nightFactor * 0.65)
        .lerp(cGolden, goldenFactor * 0.22);
      const tDay = new THREE.Color(0x524234);
      const tNight = new THREE.Color(0x232026);
      trunkMat.color.copy(tDay).lerp(tNight, nightFactor * 0.75);
    },
    setTheme(nextDark: boolean): void {
      const palette = nextDark ? CANOPY_PALETTE_NIGHT : CANOPY_PALETTE_DAY;
      for (const ref of paletteRefs) {
        for (let i = 0; i < ref.indices.length; i++) {
          color.setHex(palette[ref.indices[i]!]!);
          ref.mesh.setColorAt(i, color);
        }
        if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
      }
      trunkMat.color.setHex(nextDark ? 0x2a231e : 0x524234);
    },
    setOpacity(opacity: number, isTranslucent: boolean): void {
      for (const m of [trunkMat, canopyMat]) {
        const need = m.transparent !== isTranslucent;
        m.transparent = isTranslucent;
        m.opacity = opacity;
        m.depthWrite = !isTranslucent;
        if (need) m.needsUpdate = true;
      }
    },
    dispose(): void {
      for (const im of instMeshes) {
        im.geometry.dispose();
        im.dispose();
      }
      trunkMat.dispose();
      canopyMat.dispose();
    },
  };
}
