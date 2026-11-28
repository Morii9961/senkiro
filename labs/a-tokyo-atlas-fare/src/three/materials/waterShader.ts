/**
 * Physically Inspired Urban Water Shader (Tokyo Bay & Inland Rivers/Canals/Moats)
 * for SENKIRO Atlas.
 *
 * Adds:
 *  - Schlick Fresnel grazing sky reflection (navy/teal nadir -> sky/sunset/blue-hour horizon)
 *  - Dual-octave animated wave normal perturbation with distance anti-aliasing
 *  - Solar / lunar specular glitter path aligned to active sun/moon direction
 *  - Bay vs inland river/canal tonal & roughness differentiation
 *  - Linear-space aerial perspective haze
 *
 * Composes cleanly with `injectRadialCutaway` and ghost-surface underground opacity.
 */

import * as THREE from 'three';
import type { CityLightingUniforms } from './groundShader.js';

export function injectWaterShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CityLightingUniforms,
  kind: 'bay' | 'river',
): void {
  const isBayVal = kind === 'bay' ? 1.0 : 0.0;
  const cacheTag = 'senkiro-water-v2';
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uWatIsBay = { value: isBayVal };
    shader.uniforms.uWatTime = uniforms.uTimeSec;
    shader.uniforms.uWatSunDir = uniforms.uSunDir;
    shader.uniforms.uWatSunColor = uniforms.uSunColor;
    shader.uniforms.uWatSkyTop = uniforms.uSkyTopColor;
    shader.uniforms.uWatSkyHorizon = uniforms.uSkyHorizonColor;
    shader.uniforms.uWatNight = uniforms.uNightFactor;
    shader.uniforms.uWatGolden = uniforms.uGoldenFactor;
    shader.uniforms.uWatBlueHour = uniforms.uBlueHourFactor;
    shader.uniforms.uWatVisualMode = uniforms.uVisualMode;
    shader.uniforms.uWatAerialColor = uniforms.uAerialColor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWaterWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 wWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  wWp = instanceMatrix * wWp;
#endif
wWp = modelMatrix * wWp;
vWaterWorldPos = wWp.xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWatIsBay;
uniform float uWatTime;
uniform vec3 uWatSunDir;
uniform vec3 uWatSunColor;
uniform vec3 uWatSkyTop;
uniform vec3 uWatSkyHorizon;
uniform float uWatNight;
uniform float uWatGolden;
uniform float uWatBlueHour;
uniform float uWatVisualMode;
uniform vec3 uWatAerialColor;
varying vec3 vWaterWorldPos;

vec3 senkiroWaterNormal(vec2 xz, float t, float distFade, float isBayFlag) {
  float freqA = mix(0.14, 0.075, isBayFlag);
  float freqB = mix(0.32, 0.19, isBayFlag);
  float amp = mix(0.056, 0.088, isBayFlag) * distFade;
  float dx = (cos(xz.x * freqA + xz.y * freqA * 0.65 + t * 1.15) * freqA -
              sin(xz.x * freqB * 0.8 - xz.y * freqB + t * 1.65) * freqB * 0.8 +
              cos((xz.x - xz.y) * freqB * 1.45 - t * 1.35) * freqB * 1.45) * amp;
  float dz = (cos(xz.x * freqA + xz.y * freqA * 0.65 + t * 1.15) * freqA * 0.65 +
              sin(xz.x * freqB * 0.8 - xz.y * freqB + t * 1.65) * freqB -
              cos((xz.x - xz.y) * freqB * 1.45 - t * 1.35) * freqB * 1.45) * amp;
  return normalize(vec3(-dx, 1.0, -dz));
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 viewDirW = normalize(cameraPosition - vWaterWorldPos);
  float camDist = length(cameraPosition - vWaterWorldPos);
  float rippleFade = 1.0 - smoothstep(1800.0, 14500.0, camDist);
  vec3 wNorm = senkiroWaterNormal(vWaterWorldPos.xz, uWatTime, rippleFade, uWatIsBay);

  // Subtle depth / shoreline variation via multi-octave spatial modulation
  float bayPatch = sin(vWaterWorldPos.x * 0.00055) * cos(vWaterWorldPos.z * 0.00065) * 0.5 + 0.5;
  vec3 baseDeep = mix(vec3(0.028, 0.085, 0.125), vec3(0.022, 0.068, 0.118), uWatIsBay);
  vec3 baseShallow = mix(vec3(0.048, 0.125, 0.165), vec3(0.042, 0.115, 0.172), uWatIsBay);
  vec3 waterBodyCol = mix(baseDeep, baseShallow, bayPatch * 0.55);

  // Warm sunset/golden ambient scatter tint + cool twilight/night depth
  float duskCool = clamp(uWatBlueHour * 0.68 + uWatNight * 0.90, 0.0, 1.0);
  waterBodyCol = mix(waterBodyCol, waterBodyCol * vec3(0.95, 0.85, 0.80), uWatGolden * 0.45);
  waterBodyCol = mix(waterBodyCol, waterBodyCol * vec3(0.14, 0.21, 0.34), duskCool);

  // Schlick Fresnel grazing sky & horizon reflection (crisp at oblique angles, deep maritime overhead)
  float ndotv = clamp(dot(wNorm, viewDirW), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(max(1.0 - ndotv, 0.0001), 4.6);

  vec3 reflDir = reflect(-viewDirW, wNorm);
  float reflUp = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyRefl = mix(uWatSkyHorizon, uWatSkyTop, smoothstep(0.42, 0.90, reflUp));
  skyRefl = mix(skyRefl, uWatSunColor * 0.72 + uWatSkyHorizon * 0.28, uWatGolden * 0.38);
  skyRefl *= mix(1.0, 0.56, uWatNight);

  // Solar / lunar specular glitter column across ripples
  vec3 lightDir = normalize(vec3(uWatSunDir.x, max(0.08, uWatSunDir.y), uWatSunDir.z));
  vec3 halfVec = normalize(lightDir + viewDirW);
  float ndoth = clamp(dot(wNorm, halfVec), 0.0, 1.0);
  float specTight = ndoth > 0.01 ? pow(ndoth, mix(135.0, 180.0, uWatIsBay)) : 0.0;
  float specBroad = ndoth > 0.01 ? pow(ndoth, 24.0) : 0.0;
  float sunVis = (1.0 - uWatNight * 0.72) * (0.50 + 0.50 * uWatVisualMode);
  vec3 glint = uWatSunColor * (specTight * 1.75 + specBroad * 0.28) * sunVis;

  // Broken vertical waterfront & bridge city-light shimmer reflections at Blue Hour / Night
  float nightWaterFactor = clamp(uWatBlueHour * 0.78 + uWatNight, 0.0, 1.0);
  vec3 finalWater = mix(waterBodyCol + outgoingLight * 0.16, skyRefl * (0.76 + 0.24 * uWatVisualMode), clamp(fresnel * 0.90, 0.0, 0.92));
  finalWater += glint;
  if (nightWaterFactor > 0.02) {
    float ripplePerturb = wNorm.x * 26.0 + wNorm.z * 18.0;
    float colCoord = vWaterWorldPos.x * 0.032 + ripplePerturb * 0.38;
    float bandHash = fract(sin(floor(colCoord) * 127.1 + floor(vWaterWorldPos.z * 0.008) * 311.7) * 43758.5453);
    float colMask = smoothstep(0.56, 0.92, bandHash);
    float streakBreak = 0.5 + 0.5 * sin(vWaterWorldPos.z * 0.11 + wNorm.z * 42.0 + uWatTime * 1.4);
    float streakWave = pow(clamp(0.5 + 0.5 * cos(fract(colCoord) * 6.283185), 0.0001, 1.0), 3.2);
    float riverMask = mix(1.0, 0.32, uWatIsBay);
    vec3 streakColor = bandHash > 0.72
      ? vec3(1.0, 0.78, 0.42)
      : vec3(0.74, 0.88, 1.0);
    float grazingBoost = 0.35 + 0.65 * (1.0 - ndotv);
    finalWater += streakColor * colMask * streakWave * streakBreak * riverMask * grazingBoost * nightWaterFactor * 0.62;
    finalWater += vec3(0.12, 0.17, 0.26) * mix(0.045, 0.015, uWatIsBay) * nightWaterFactor;
  }
  outgoingLight = finalWater;
}
#include <opaque_fragment>`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `{
  float vDist = length(vViewPosition);
  float aerialT = smoothstep(9500.0, 52000.0, vDist) * (0.26 + 0.34 * uWatVisualMode);
  vec3 viewDirW = normalize(vWaterWorldPos - cameraPosition);
  float sunAlign = clamp(dot(viewDirW, normalize(uWatSunDir)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 hazeCol = mix(uWatAerialColor, uWatSunColor * 0.72 + uWatSkyHorizon * 0.28, pow(max(sunAlign, 0.001), 2.5) * uWatGolden * 0.65);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, aerialT);
}
#include <tonemapping_fragment>`,
      );
  };
  material.needsUpdate = true;
}
