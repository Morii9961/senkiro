/**
 * GPU World-Space Architectural Cutaway, Station-Focus Frosted Glass & Instanced World-UV Shader Injection.
 *
 * Injects:
 *  1. Feathered architectural X-ray cutaway (`uCutawayActive`) — replaces harsh dark pits with
 *     high-frequency 4x4 Bayer screen-space dissolve, 50m coordinate blueprint grid lines, soft
 *     sky-cyan rim highlights, and frosted glass ghost building silhouettes.
 *  2. Selected station-focus semi-transparency (`uStationFocusActive`) — works EVEN when cutaway
 *     is OFF, turning surrounding buildings into crisp frosted architectural glass so selected
 *     platforms & trains remain unobstructed, and opening a clean terrain X-ray window over
 *     selected underground stations (`uStationFocusUnderground`).
 *  3. World-meter UV scaling + concrete rooftop shading + ground-contact AO for LOD1 instanced
 *     buildings (`injectInstancedFacadeUv`), eliminating stretched white box artifacts.
 */

import * as THREE from 'three';

export interface CutawayUniforms {
  uCutawayActive: { value: number };
  uCutawayCenter: { value: THREE.Vector3 };
  uCutawayRadius: { value: number };
  uStationFocusActive: { value: number };
  uStationFocusCenter: { value: THREE.Vector3 };
  uStationFocusRadius: { value: number };
  uStationFocusUnderground: { value: number };
}

export function createCutawayUniforms(): CutawayUniforms {
  return {
    uCutawayActive: { value: 0.0 },
    uCutawayCenter: { value: new THREE.Vector3(0, 0, 0) },
    uCutawayRadius: { value: 850.0 },
    uStationFocusActive: { value: 0.0 },
    uStationFocusCenter: { value: new THREE.Vector3(0, 0, 0) },
    uStationFocusRadius: { value: 220.0 },
    uStationFocusUnderground: { value: 0.0 },
  };
}

export interface RadialCutawayOptions {
  applyInstancedWorldUv?: boolean;
}

const BAYER_GLSL = /* glsl */ `
float senkiroBayer2(vec2 p) {
  return 2.0 * mod(p.x + p.y, 2.0) + mod(p.y, 2.0);
}
float senkiroBayer4x4(vec2 fragCoord) {
  vec2 f = mod(floor(fragCoord), 4.0);
  float hi = senkiroBayer2(mod(f, 2.0));
  float lo = senkiroBayer2(floor(f * 0.5));
  return (4.0 * hi + lo + 0.5) / 16.0;
}
`;

/**
 * Injects per-instance world-meter wall UVs, architectural concrete rooftop shading (no windows
 * on rooftops!), vertical ground-contact AO darkening, and roof emissive suppression into an
 * instanced LOD1 building MeshStandardMaterial rendered on BoxGeometry(1, 1, 1).
 */
export function injectInstancedFacadeUv(material: THREE.MeshStandardMaterial): void {
  const userData = material.userData as { __senkiroInstancedUv?: boolean };
  if (userData.__senkiroInstancedUv) return;
  userData.__senkiroInstancedUv = true;

  const cacheTag = 'senkiro-instanced-world-uv-v2';
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vInstRoofMask;
varying float vInstWallShade;
varying vec2 vInstRoofWorldXz;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vInstRoofMask = 0.0;
vInstWallShade = 1.0;
vInstRoofWorldXz = vec2(0.0);
#ifdef USE_INSTANCING
  {
    float instSx = length(instanceMatrix[0].xyz);
    float instSy = length(instanceMatrix[1].xyz);
    float instSz = length(instanceMatrix[2].xyz);
    float isRoof = step(0.5, normal.y);
    vInstRoofMask = isRoof;
    float wallW = abs(normal.x) > 0.5 ? instSz : instSx;
    float instPhase = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 2.0;
    vec2 worldWallUv = isRoof > 0.5
      ? vec2(uv.x * instSx * 0.04, uv.y * instSz * 0.04)
      : vec2(uv.x * wallW * 0.042 + instPhase, uv.y * instSy * 0.042);
    vInstRoofWorldXz = vec2(uv.x * instSx, uv.y * instSz);

    // Ground-contact AO darkening near base + subtle cardinal facet shading
    float heightM = clamp(position.y + 0.5, 0.0, 1.0) * instSy;
    float baseAo = mix(0.70, 1.0, smoothstep(0.0, 6.5, heightM));
    float facetShade = normal.x > 0.5 ? 1.0 : normal.z > 0.5 ? 0.96 : normal.x < -0.5 ? 0.92 : 0.90;
    vInstWallShade = isRoof > 0.5 ? 0.96 : baseAo * facetShade;

    #ifdef USE_MAP
      vMapUv = worldWallUv;
    #endif
    #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv = worldWallUv;
    #endif
    #ifdef USE_BUMPMAP
      vBumpMapUv = worldWallUv;
    #endif
    #ifdef USE_EMISSIVEMAP
      vEmissiveMapUv = worldWallUv;
    #endif
  }
#endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vInstRoofMask;
varying float vInstWallShade;
varying vec2 vInstRoofWorldXz;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
if (vInstRoofMask > 0.5) {
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    vec3 instTint = vColor.rgb;
  #else
    vec3 instTint = vec3(1.0);
  #endif
  // Clean architectural concrete parapet roof (zero window texture on rooftops)
  vec2 roofTile = abs(fract(vInstRoofWorldXz * 0.125) - 0.5);
  float seam = smoothstep(0.46, 0.5, max(roofTile.x, roofTile.y));
  vec3 concreteRoof = vec3(0.67, 0.69, 0.72) * (1.0 - seam * 0.08);
  diffuseColor.rgb = concreteRoof * instTint;
} else {
  diffuseColor.rgb *= vInstWallShade;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.92, vInstRoofMask);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance *= (1.0 - vInstRoofMask);`,
      );
  };
  material.needsUpdate = true;
}

export function injectRadialCutaway(
  material: THREE.MeshStandardMaterial,
  uniforms: CutawayUniforms,
  mode: 'terrain' | 'building',
  options?: RadialCutawayOptions,
): void {
  if (options?.applyInstancedWorldUv) {
    injectInstancedFacadeUv(material);
  }

  const cacheTag = `senkiro-cutaway-${mode}-v2`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uCutawayActive = uniforms.uCutawayActive;
    shader.uniforms.uCutawayCenter = uniforms.uCutawayCenter;
    shader.uniforms.uCutawayRadius = uniforms.uCutawayRadius;
    shader.uniforms.uStationFocusActive = uniforms.uStationFocusActive;
    shader.uniforms.uStationFocusCenter = uniforms.uStationFocusCenter;
    shader.uniforms.uStationFocusRadius = uniforms.uStationFocusRadius;
    shader.uniforms.uStationFocusUnderground = uniforms.uStationFocusUnderground;

    // 1. Vertex shader: unconditionally compute world position for both Mesh & InstancedMesh
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCutWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 cutWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  cutWp = instanceMatrix * cutWp;
#endif
cutWp = modelMatrix * cutWp;
vCutWorldPos = cutWp.xyz;`,
      );

    // 2. Fragment shader: selected-station frosted glass focus (zero circular pit or glowing disc!)
    const fragmentClipChunk =
      mode === 'terrain'
        ? `
float senkiroGridMask = 0.0;
float senkiroRimGlow = 0.0;
{
  float keepProb = 1.0;

  // Gentle local terrain reveal ONLY when user selects an underground station while in surface mode
  if (uCutawayActive < 0.5 && uStationFocusActive > 0.5 && uStationFocusUnderground > 0.5) {
    float stDist = length(vCutWorldPos.xz - uStationFocusCenter.xz);
    float stR = uStationFocusRadius * 0.78;
    float stInner = stR * 0.50;
    if (stDist < stR) {
      float stFeather = smoothstep(stInner, stR, stDist);
      keepProb = min(keepProb, mix(0.14, 1.0, stFeather));
    }
  }

  if (keepProb < 0.999) {
    if (senkiroBayer4x4(gl_FragCoord.xy) > keepProb) discard;
  }
}`
        : `
float senkiroGhostMix = 0.0;
{
  float keepProb = 1.0;

  // Selected-station frosted glass focus while browsing on surface (Global Ghost-Surface handles full underground mode)
  if (uCutawayActive < 0.5 && uStationFocusActive > 0.5) {
    float stDist = length(vCutWorldPos.xz - uStationFocusCenter.xz);
    if (stDist < uStationFocusRadius) {
      float stT = smoothstep(uStationFocusRadius * 0.68, uStationFocusRadius, stDist);
      keepProb = min(keepProb, mix(0.20, 1.0, stT));
      senkiroGhostMix = max(senkiroGhostMix, 1.0 - stT);
    }
  }

  if (keepProb < 0.999) {
    if (senkiroBayer4x4(gl_FragCoord.xy) > keepProb) discard;
  }
}`;

    const fragmentTintChunk =
      mode === 'terrain'
        ? `
if (senkiroGridMask > 0.01 || senkiroRimGlow > 0.01) {
  vec3 archCyan = vec3(0.52, 0.80, 0.96);
  float blend = clamp(senkiroRimGlow * 0.65 + senkiroGridMask * 0.55, 0.0, 0.82);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, archCyan, blend);
}`
        : `
if (senkiroGhostMix > 0.01) {
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.75, 0.85, 0.95), senkiroGhostMix * 0.35);
}`;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uCutawayActive;
uniform vec3 uCutawayCenter;
uniform float uCutawayRadius;
uniform float uStationFocusActive;
uniform vec3 uStationFocusCenter;
uniform float uStationFocusRadius;
uniform float uStationFocusUnderground;
varying vec3 vCutWorldPos;
${BAYER_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
${fragmentClipChunk}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `${fragmentTintChunk}
#include <dithering_fragment>`,
      );
  };
  material.needsUpdate = true;
}
