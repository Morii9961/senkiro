/**
 * Building Fresnel Sky Reflection, Per-Building/Floor Night Window Modulation,
 * Street-Bounce Ambient Silhouette Lift, Aerial Perspective & Smooth Distance Fade Shader
 * for SENKIRO Atlas.
 *
 * Composes cleanly with `injectInstancedFacadeUv` and `injectRadialCutaway`.
 */

import * as THREE from 'three';
import type { CityLightingUniforms } from './groundShader.js';

export interface BuildingShaderOptions {
  isGlazed?: boolean;
  isRoof?: boolean;
  isLandmark?: boolean;
  fadeWithDistance?: boolean;
}

const BLDG_GLSL_HELPERS = /* glsl */ `
float senkiroBldgHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float senkiroBldgBayer2(vec2 p) {
  return 2.0 * mod(p.x + p.y, 2.0) + mod(p.y, 2.0);
}
float senkiroBldgBayer4x4(vec2 fragCoord) {
  vec2 f = mod(floor(fragCoord), 4.0);
  float hi = senkiroBldgBayer2(mod(f, 2.0));
  float lo = senkiroBldgBayer2(floor(f * 0.5));
  return (4.0 * hi + lo + 0.5) / 16.0;
}
`;

export function injectBuildingLightingShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CityLightingUniforms,
  options: BuildingShaderOptions = {},
): void {
  const isGlazed = Boolean(options.isGlazed);
  const isRoof = Boolean(options.isRoof);
  const isLandmark = Boolean(options.isLandmark);
  const fadeWithDistance = options.fadeWithDistance ?? !isLandmark;

  const glassWeightVal = isGlazed ? 0.92 : isRoof ? 0.10 : 0.42;
  const isRoofVal = isRoof ? 1.0 : 0.0;
  const fadeVal = fadeWithDistance ? 1.0 : 0.0;

  const cacheTag = 'senkiro-bldg-lit-v2';
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uBldgGlassWeight = { value: glassWeightVal };
    shader.uniforms.uBldgIsRoof = { value: isRoofVal };
    shader.uniforms.uBldgFadeEnabled = { value: fadeVal };
    shader.uniforms.uBldgSunDir = uniforms.uSunDir;
    shader.uniforms.uBldgSunColor = uniforms.uSunColor;
    shader.uniforms.uBldgSkyTop = uniforms.uSkyTopColor;
    shader.uniforms.uBldgSkyHorizon = uniforms.uSkyHorizonColor;
    shader.uniforms.uBldgNight = uniforms.uNightFactor;
    shader.uniforms.uBldgGolden = uniforms.uGoldenFactor;
    shader.uniforms.uBldgBlueHour = uniforms.uBlueHourFactor;
    shader.uniforms.uBldgHour = uniforms.uTimeHour;
    shader.uniforms.uBldgVisualMode = uniforms.uVisualMode;
    shader.uniforms.uBldgAerialColor = uniforms.uAerialColor;
    shader.uniforms.uBldgMaxLoadRadius = uniforms.uMaxLoadRadius;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBldgWorldPos;
varying vec3 vBldgWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 bWp = vec4( transformed, 1.0 );
vec3 bWn = objectNormal;
#ifdef USE_INSTANCING
  bWp = instanceMatrix * bWp;
  bWn = mat3(instanceMatrix) * bWn;
#endif
bWp = modelMatrix * bWp;
bWn = normalize(mat3(modelMatrix) * bWn);
vBldgWorldPos = bWp.xyz;
vBldgWorldNormal = bWn;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uBldgGlassWeight;
uniform float uBldgIsRoof;
uniform float uBldgFadeEnabled;
uniform vec3 uBldgSunDir;
uniform vec3 uBldgSunColor;
uniform vec3 uBldgSkyTop;
uniform vec3 uBldgSkyHorizon;
uniform float uBldgNight;
uniform float uBldgGolden;
uniform float uBldgBlueHour;
uniform float uBldgHour;
uniform float uBldgVisualMode;
uniform vec3 uBldgAerialColor;
uniform float uBldgMaxLoadRadius;
varying vec3 vBldgWorldPos;
varying vec3 vBldgWorldNormal;
${BLDG_GLSL_HELPERS}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if (uBldgFadeEnabled > 0.5) {
  float camHorizDist = length(cameraPosition.xz - vBldgWorldPos.xz);
  float fadeStart = uBldgMaxLoadRadius * 0.84;
  float fadeEnd = uBldgMaxLoadRadius * 1.02;
  if (camHorizDist > fadeStart) {
    float keep = 1.0 - smoothstep(fadeStart, fadeEnd, camHorizDist);
    if (keep < 0.999 && senkiroBldgBayer4x4(gl_FragCoord.xy) > keep) discard;
  }
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  // Per-building & per-floor night window diversity (skipped completely at daytime!)
  if (uBldgIsRoof < 0.5 && (uBldgNight + uBldgBlueHour) > 0.02) {
    vec2 bCell = floor(vBldgWorldPos.xz / 15.0);
    float bSeed = senkiroBldgHash(bCell);
    float floorBand = floor(max(0.0, vBldgWorldPos.y) / 3.5);
    float floorSeed = senkiroBldgHash(bCell + vec2(floorBand * 1.37, floorBand * 0.73));
    float roomSeed = senkiroBldgHash(floor(vBldgWorldPos.xz / 4.2) + vec2(floorBand * 2.1, 7.3));

    // Distance anti-aliasing: smooth out sub-pixel 1px confetti dots on 5km..25km horizon towers
    // while keeping distant illuminated skyline legible in urban panoramas
    float bCamDist = length(cameraPosition - vBldgWorldPos);
    float winMicroKeep = 1.0 - smoothstep(1600.0, 6200.0, bCamDist);
    float farEmissiveAtten = mix(1.0, 0.48, smoothstep(4200.0, 17500.0, bCamDist));
    float roomFactor = mix(0.88, mix(0.65, 1.22, roomSeed), winMicroKeep);
    float floorFactor = mix(0.84, mix(0.28, 1.32, step(0.26, floorSeed)), mix(0.42, 1.0, winMicroKeep));

    // Time-of-day activity curve: late-evening lights taper gently after 23:00
    float lateNightFade = 1.0 - smoothstep(22.5, 24.0, uBldgHour) * 0.22 - (1.0 - smoothstep(4.5, 6.2, uBldgHour)) * 0.35 * step(uBldgHour, 6.5);
    float winMod = floorFactor * mix(0.60, 1.24, bSeed) * roomFactor * clamp(lateNightFade, 0.48, 1.15) * farEmissiveAtten;

    // Warm vs cool interior color temperature variation per building
    vec3 tintTemp = mix(vec3(1.06, 0.96, 0.84), vec3(0.88, 0.95, 1.08), bSeed);
    totalEmissiveRadiance *= winMod * tintTemp;

    // Selective architectural crown uplighting on high-rises (> 70m)
    if (vBldgWorldPos.y > 70.0 && bSeed > 0.72) {
      float crownMask = smoothstep(70.0, 145.0, vBldgWorldPos.y);
      vec3 crownTint = bSeed > 0.86 ? vec3(0.16, 0.22, 0.34) : vec3(0.22, 0.17, 0.11);
      float crownStrength = clamp(uBldgBlueHour * 0.82 + uBldgNight, 0.0, 1.0);
      totalEmissiveRadiance += crownTint * crownMask * crownStrength * (0.48 + 0.52 * uBldgVisualMode) * farEmissiveAtten;
    }
  }

  // Tight, crisp nocturnal street-canyon lower bounce + delicate sky rim
  float twilightOrNight = clamp(uBldgBlueHour * 0.85 + uBldgNight, 0.0, 1.0);
  if (twilightOrNight > 0.02) {
    float wallWeight = vBldgWorldNormal.y > 0.55 ? 0.12 : 1.0;
    float streetBounceClose = exp(-max(0.0, vBldgWorldPos.y) / 7.5);
    vec3 bounceCol = vec3(0.072, 0.048, 0.026) * streetBounceClose * wallWeight * twilightOrNight;
    float roofOrUpper = vBldgWorldNormal.y > 0.45 ? 0.022 : 0.018;
    vec3 skyRim = uBldgSkyHorizon * roofOrUpper * (0.40 + 0.60 * clamp(vBldgWorldPos.y / 80.0, 0.0, 1.0)) * twilightOrNight;
    totalEmissiveRadiance += (bounceCol + skyRim) * (0.65 + 0.35 * uBldgVisualMode);
  }
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  // Physically inspired grazing Schlick Fresnel sky & golden-hour reflection on glazed curtain walls
  vec3 viewDirW = normalize(cameraPosition - vBldgWorldPos);
  vec3 nW = normalize(vBldgWorldNormal);
  float ndotv = clamp(dot(nW, viewDirW), 0.0, 1.0);
  float fresnel = 0.03 + 0.97 * pow(max(1.0 - ndotv, 0.0001), 4.0);
  float smoothness = clamp(1.0 - roughnessFactor, 0.0, 1.0);
  float glassWeight = smoothness * smoothness * uBldgGlassWeight;

  if (glassWeight > 0.01) {
    vec3 reflDir = reflect(-viewDirW, nW);
    float upT = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyRefl = mix(uBldgSkyHorizon, uBldgSkyTop, smoothstep(0.45, 0.92, upT));
    float sunReflDot = clamp(dot(reflDir, normalize(uBldgSunDir)), 0.0, 1.0);
    float sunGlint = sunReflDot > 0.01 ? pow(sunReflDot, 18.0) * (0.55 + 1.15 * uBldgGolden) * (1.0 - uBldgNight * 0.75) : 0.0;
    vec3 reflColor = skyRefl * (0.55 + 0.45 * uBldgVisualMode) + uBldgSunColor * sunGlint;
    outgoingLight += reflColor * fresnel * glassWeight * (0.35 + 0.65 * (1.0 - uBldgNight * 0.45));
  }
}
#include <opaque_fragment>`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `{
  // Distance aerial perspective matching groundShader.ts in linear space before tone mapping
  float vDist = length(vViewPosition);
  float aerialT = smoothstep(7200.0, 34000.0, vDist) * (0.34 + 0.36 * uBldgVisualMode);
  vec3 viewDirW = normalize(vBldgWorldPos - cameraPosition);
  float sunAlign = clamp(dot(viewDirW, normalize(uBldgSunDir)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 hazeCol = mix(uBldgAerialColor, uBldgSunColor * 0.72 + uBldgSkyHorizon * 0.28, pow(max(sunAlign, 0.001), 2.5) * uBldgGolden * 0.65);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, aerialT);
}
#include <tonemapping_fragment>`,
      );
  };
  material.needsUpdate = true;
}
