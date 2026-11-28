/**
 * Unified 24-Hour Tokyo Time-of-Day Controller, Atmospheric Sky Dome,
 * Continuous Solar/Lunar Arc & PMREM Environment Reflections.
 *
 * Drives solar directional light, sky irradiance, PMREM IBL, atmospheric fog,
 * golden-hour Mie scattering, independent luminous Blue Hour twilight, and
 * readable nocturnal ambiance from a single continuous Tokyo (35.68°N) model.
 */

import * as THREE from 'three';
import type { CityLightingPreset } from '../../contracts/atlasV2.js';

export interface SolarLightingState {
  hour: number;
  nightFactor: number; // 0 = bright noon, 0.4..0.65 = golden/blue hour, 1 = full night
  goldenFactor: number; // 0..1 peaks around sunrise (05:50) and golden hour (17:15)
  blueHourFactor: number; // 0..1 independent state peaking around 18:25 and 05:05
  sunElevationRad: number;
  sunElevationDeg: number;
  sunAzimuthRad: number;
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
  activeLightDirection: THREE.Vector3;
  skyTopColor: THREE.Color;
  skyMidColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  skyAntiHorizonColor: THREE.Color;
  skyGroundColor: THREE.Color;
  sunDiscColor: THREE.Color;
  sunIntensity: number;
  horizonGlow: number;
  cloudTintColor: THREE.Color;
  cloudOpacity: number;
  starVisibility: number;
  moonGlow: number;
  sunLightColor: THREE.Color;
  sunLightIntensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  subFillColor: THREE.Color;
  subFillIntensity: number;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  aerialScatterColor: THREE.Color;
  envIntensity: number;
  bloomStrength: number;
  bloomThreshold: number;
  toneMappingExposure: number;
  isDark: boolean;
  preset: CityLightingPreset;
}

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uMidColor;
uniform vec3 uHorizonColor;
uniform vec3 uAntiHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uSunIntensity;
uniform float uHorizonGlow;
uniform vec3 uCloudColor;
uniform float uCloudOpacity;
uniform float uStarVisibility;
uniform float uMoonGlow;
uniform float uTimeSec;

varying vec3 vWorldDir;

float skyHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbmClouds(vec2 p) {
  float v = 0.0;
  float amp = 0.52;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += amp * valueNoise(p);
    p = rot * p * 2.08 + vec2(13.1, 7.7);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  vec3 sunDir = normalize(uSunDir);
  vec3 moonDir = normalize(uMoonDir);
  float h = dir.y;

  float hLen = length(dir.xz);
  float sLen = length(sunDir.xz);
  vec2 hDir = hLen > 1e-4 ? dir.xz / hLen : vec2(1.0, 0.0);
  vec2 sDir = sLen > 1e-4 ? sunDir.xz / sLen : vec2(1.0, 0.0);
  float azAlign = clamp(dot(hDir, sDir), -1.0, 1.0);
  float sunward = clamp(azAlign * 0.5 + 0.5, 0.0, 1.0);
  float sunPow = pow(max(sunward, 1e-4), 1.35);

  vec3 col;
  if (h >= 0.0) {
    vec3 horizonBand = mix(uAntiHorizonColor, uHorizonColor, sunPow);
    float midMix = smoothstep(0.0, 0.24, h);
    float topMix = smoothstep(0.16, 0.82, h);
    col = mix(horizonBand, uMidColor, midMix);
    col = mix(col, uTopColor, topMix);

    // Controlled physical solar disc + natural Mie atmospheric aureole
    float sunVis = smoothstep(-0.08, 0.06, sunDir.y);
    float sunDot = clamp(dot(dir, sunDir), 0.0, 1.0);
    float broadHalo = sunDot > 1e-4 ? pow(sunDot, 6.0) * 0.18 : 0.0;
    float tightHalo = sunDot > 1e-4 ? pow(sunDot, 64.0) * 0.36 : 0.0;
    float disc = sunDot > 0.94 ? pow(sunDot, 2200.0) * 2.1 : 0.0;
    col += uSunColor * (broadHalo + tightHalo + disc) * uSunIntensity * sunVis;

    // Lunar subtle night disc & halo
    if (uMoonGlow > 0.01) {
      float moonDot = clamp(dot(dir, moonDir), 0.0, 1.0);
      float mHalo = moonDot > 1e-4 ? pow(moonDot, 42.0) * 0.18 : 0.0;
      float mDisc = moonDot > 0.96 ? pow(moonDot, 2600.0) * 1.15 : 0.0;
      col += vec3(0.68, 0.82, 1.0) * (mHalo + mDisc) * uMoonGlow;
    }

    // Warm sunset/sunrise Mie horizon scatter band toward sun azimuth
    if (uHorizonGlow > 0.01) {
      float fwd = clamp(azAlign, 0.0, 1.0);
      float band = exp(-h * 6.8) * (fwd > 1e-4 ? pow(fwd, 1.75) : 0.0);
      col += uSunColor * band * uHorizonGlow * 0.48;
    }

    // Subtle procedural high-altitude cirrus / altostratus clouds
    if (uCloudOpacity > 0.01 && h > 0.025) {
      vec2 cloudUv = dir.xz / (h + 0.16) * 0.65;
      cloudUv += vec2(uTimeSec * 0.0025, uTimeSec * 0.0012);
      float n1 = fbmClouds(cloudUv * vec2(1.0, 1.45));
      float n2 = fbmClouds(cloudUv * 2.1 + vec2(n1 * 1.4, -n1 * 0.9));
      float wisps = smoothstep(0.54, 0.84, mix(n1, n2, 0.45));
      float elevFade = smoothstep(0.025, 0.20, h) * (1.0 - smoothstep(0.70, 0.98, h) * 0.45);
      float cloudSun = sunDot > 1e-4 ? pow(sunDot, 4.0) * 0.55 * sunVis : 0.0;
      vec3 litCloud = mix(uCloudColor, uSunColor * 1.12, cloudSun);
      col = mix(col, litCloud, wisps * elevFade * uCloudOpacity);
    }

    if (uStarVisibility > 0.02 && h > 0.08) {
      vec3 cell = floor(dir * 270.0);
      float r = skyHash(cell);
      if (r > 0.9966) {
        float starBright = smoothstep(0.9966, 0.9998, r) * smoothstep(0.08, 0.36, h);
        vec3 starCol = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.95, 0.85), fract(r * 97.3));
        col += starCol * starBright * uStarVisibility * 0.78;
      }
    }
  } else {
    float downMix = smoothstep(0.0, -0.32, h);
    vec3 horizonBand = mix(uAntiHorizonColor, uHorizonColor, sunPow);
    col = mix(horizonBand * 0.90, uGroundColor, downMix);
  }

  col = clamp(col, vec3(0.0), vec3(4.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

interface TimeKeyframe {
  hour: number;
  nightFactor: number;
  goldenFactor: number;
  blueHourFactor: number;
  top: number;
  mid: number;
  horizon: number;
  antiHorizon: number;
  ground: number;
  sunDisc: number;
  sunIntensity: number;
  horizonGlow: number;
  cloudColor: number;
  cloudOpacity: number;
  starVisibility: number;
  moonGlow: number;
  sunLight: number;
  sunLightIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  subFill: number;
  subFillIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  aerialScatter: number;
  envIntensity: number;
  bloomStrength: number;
  bloomThreshold: number;
  exposure: number;
}

const TIME_KEYFRAMES: readonly TimeKeyframe[] = [
  {
    hour: 0.0,
    nightFactor: 1.0,
    goldenFactor: 0.0,
    blueHourFactor: 0.0,
    top: 0x050b18,
    mid: 0x0c1a30,
    horizon: 0x182b47,
    antiHorizon: 0x101e34,
    ground: 0x080e18,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.0,
    horizonGlow: 0.0,
    cloudColor: 0x1a2a44,
    cloudOpacity: 0.14,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.58,
    hemiSky: 0x355686,
    hemiGround: 0x1b202a,
    hemiIntensity: 0.56,
    subFill: 0x2c5698,
    subFillIntensity: 0.30,
    fogColor: 0x0f1c30,
    fogNear: 12000,
    fogFar: 52000,
    aerialScatter: 0x122238,
    envIntensity: 0.85,
    bloomStrength: 0.24,
    bloomThreshold: 0.82,
    exposure: 1.06,
  },
  {
    hour: 4.5,
    nightFactor: 0.92,
    goldenFactor: 0.06,
    blueHourFactor: 0.24,
    top: 0x081328,
    mid: 0x142748,
    horizon: 0x2b3e62,
    antiHorizon: 0x172642,
    ground: 0x0c1220,
    sunDisc: 0xd0b8c8,
    sunIntensity: 0.12,
    horizonGlow: 0.16,
    cloudColor: 0x303e5c,
    cloudOpacity: 0.18,
    starVisibility: 0.65,
    moonGlow: 0.45,
    sunLight: 0x8fb0de,
    sunLightIntensity: 0.44,
    hemiSky: 0x45669a,
    hemiGround: 0x192030,
    hemiIntensity: 0.62,
    subFill: 0x3a64ab,
    subFillIntensity: 0.32,
    fogColor: 0x192844,
    fogNear: 12500,
    fogFar: 54000,
    aerialScatter: 0x1f3252,
    envIntensity: 0.92,
    bloomStrength: 0.20,
    bloomThreshold: 0.84,
    exposure: 1.07,
  },
  {
    hour: 5.15,
    nightFactor: 0.64,
    goldenFactor: 0.34,
    blueHourFactor: 0.86,
    top: 0x0e224b,
    mid: 0x224680,
    horizon: 0x5c688c,
    antiHorizon: 0x243b68,
    ground: 0x182133,
    sunDisc: 0xffb37a,
    sunIntensity: 0.45,
    horizonGlow: 0.46,
    cloudColor: 0x6f7396,
    cloudOpacity: 0.24,
    starVisibility: 0.16,
    moonGlow: 0.08,
    sunLight: 0xffa66b,
    sunLightIntensity: 0.38,
    hemiSky: 0x527cc2,
    hemiGround: 0x222c42,
    hemiIntensity: 0.72,
    subFill: 0x406cb8,
    subFillIntensity: 0.34,
    fogColor: 0x2d436e,
    fogNear: 13000,
    fogFar: 56000,
    aerialScatter: 0x365080,
    envIntensity: 1.02,
    bloomStrength: 0.18,
    bloomThreshold: 0.85,
    exposure: 1.07,
  },
  {
    hour: 5.9,
    nightFactor: 0.34,
    goldenFactor: 0.88,
    blueHourFactor: 0.18,
    top: 0x254f88,
    mid: 0x7288b0,
    horizon: 0xf4a872,
    antiHorizon: 0x8685a8,
    ground: 0x545058,
    sunDisc: 0xffb46b,
    sunIntensity: 1.18,
    horizonGlow: 0.84,
    cloudColor: 0xf6b584,
    cloudOpacity: 0.34,
    starVisibility: 0.02,
    moonGlow: 0.0,
    sunLight: 0xffb168,
    sunLightIntensity: 1.92,
    hemiSky: 0x88b0e2,
    hemiGround: 0x424858,
    hemiIntensity: 0.64,
    subFill: 0x6e98d6,
    subFillIntensity: 0.30,
    fogColor: 0x9493aa,
    fogNear: 13500,
    fogFar: 58000,
    aerialScatter: 0xc29e96,
    envIntensity: 1.12,
    bloomStrength: 0.14,
    bloomThreshold: 0.88,
    exposure: 1.03,
  },
  {
    hour: 7.5,
    nightFactor: 0.05,
    goldenFactor: 0.24,
    blueHourFactor: 0.0,
    top: 0x2c69b0,
    mid: 0x7db3e2,
    horizon: 0xdce6f0,
    antiHorizon: 0xc8d9ea,
    ground: 0x8a8b88,
    sunDisc: 0xfff0d2,
    sunIntensity: 1.08,
    horizonGlow: 0.20,
    cloudColor: 0xfff4e6,
    cloudOpacity: 0.26,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xffe8c6,
    sunLightIntensity: 2.18,
    hemiSky: 0xb6d6f4,
    hemiGround: 0x625f59,
    hemiIntensity: 0.62,
    subFill: 0x92bbe6,
    subFillIntensity: 0.20,
    fogColor: 0xcad9e8,
    fogNear: 14500,
    fogFar: 64000,
    aerialScatter: 0xcbd9e8,
    envIntensity: 1.05,
    bloomStrength: 0.06,
    bloomThreshold: 0.94,
    exposure: 1.0,
  },
  {
    hour: 10.5,
    nightFactor: 0.0,
    goldenFactor: 0.0,
    blueHourFactor: 0.0,
    top: 0x2768b3,
    mid: 0x76afe2,
    horizon: 0xd2e2f0,
    antiHorizon: 0xc8daea,
    ground: 0x868885,
    sunDisc: 0xfff7e6,
    sunIntensity: 1.0,
    horizonGlow: 0.04,
    cloudColor: 0xf8fbff,
    cloudOpacity: 0.24,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xfff6ea,
    sunLightIntensity: 2.35,
    hemiSky: 0x9cc4ec,
    hemiGround: 0x55524c,
    hemiIntensity: 0.62,
    subFill: 0x9dc2e8,
    subFillIntensity: 0.16,
    fogColor: 0xc8d9ea,
    fogNear: 15500,
    fogFar: 68000,
    aerialScatter: 0xc6d8ea,
    envIntensity: 1.0,
    bloomStrength: 0.04,
    bloomThreshold: 0.96,
    exposure: 0.98,
  },
  {
    hour: 13.5,
    nightFactor: 0.0,
    goldenFactor: 0.0,
    blueHourFactor: 0.0,
    top: 0x2768b3,
    mid: 0x76afe2,
    horizon: 0xd2e2f0,
    antiHorizon: 0xc8daea,
    ground: 0x868885,
    sunDisc: 0xfff7e6,
    sunIntensity: 1.0,
    horizonGlow: 0.04,
    cloudColor: 0xf8fbff,
    cloudOpacity: 0.24,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xfff6ea,
    sunLightIntensity: 2.35,
    hemiSky: 0x9cc4ec,
    hemiGround: 0x55524c,
    hemiIntensity: 0.62,
    subFill: 0x9dc2e8,
    subFillIntensity: 0.16,
    fogColor: 0xc8d9ea,
    fogNear: 15500,
    fogFar: 68000,
    aerialScatter: 0xc6d8ea,
    envIntensity: 1.0,
    bloomStrength: 0.04,
    bloomThreshold: 0.96,
    exposure: 0.98,
  },
  {
    hour: 16.1,
    nightFactor: 0.06,
    goldenFactor: 0.28,
    blueHourFactor: 0.0,
    top: 0x275ea2,
    mid: 0x7aa5d2,
    horizon: 0xe6d4be,
    antiHorizon: 0xadc0d8,
    ground: 0x7a7874,
    sunDisc: 0xffe0aa,
    sunIntensity: 1.15,
    horizonGlow: 0.34,
    cloudColor: 0xffe6c6,
    cloudOpacity: 0.28,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xffddb0,
    sunLightIntensity: 2.40,
    hemiSky: 0x8db6e0,
    hemiGround: 0x4e4d4b,
    hemiIntensity: 0.60,
    subFill: 0x7ea8d8,
    subFillIntensity: 0.22,
    fogColor: 0xd0d6df,
    fogNear: 14500,
    fogFar: 64000,
    aerialScatter: 0xd6cfc6,
    envIntensity: 1.05,
    bloomStrength: 0.08,
    bloomThreshold: 0.92,
    exposure: 1.0,
  },
  {
    hour: 17.25,
    nightFactor: 0.32,
    goldenFactor: 1.0,
    blueHourFactor: 0.08,
    top: 0x1d4380,
    mid: 0x5d76a4,
    horizon: 0xffa452,
    antiHorizon: 0x70789e,
    ground: 0x3b3844,
    sunDisc: 0xffaa52,
    sunIntensity: 1.42,
    horizonGlow: 0.96,
    cloudColor: 0xffb36c,
    cloudOpacity: 0.36,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xff9d46,
    sunLightIntensity: 2.55,
    hemiSky: 0x5c88c6,
    hemiGround: 0x262b3b,
    hemiIntensity: 0.64,
    subFill: 0x4b77be,
    subFillIntensity: 0.34,
    fogColor: 0x8e869c,
    fogNear: 13500,
    fogFar: 58000,
    aerialScatter: 0xd9966a,
    envIntensity: 1.18,
    bloomStrength: 0.16,
    bloomThreshold: 0.87,
    exposure: 1.04,
  },
  {
    hour: 17.8,
    nightFactor: 0.48,
    goldenFactor: 0.72,
    blueHourFactor: 0.46,
    top: 0x122a5a,
    mid: 0x3a5488,
    horizon: 0xe67b4d,
    antiHorizon: 0x344a78,
    ground: 0x21283c,
    sunDisc: 0xff8244,
    sunIntensity: 1.08,
    horizonGlow: 0.82,
    cloudColor: 0xe68864,
    cloudOpacity: 0.32,
    starVisibility: 0.06,
    moonGlow: 0.0,
    sunLight: 0xff8442,
    sunLightIntensity: 1.25,
    hemiSky: 0x4a75b8,
    hemiGround: 0x1d2538,
    hemiIntensity: 0.68,
    subFill: 0x3d6bb6,
    subFillIntensity: 0.36,
    fogColor: 0x42547c,
    fogNear: 13000,
    fogFar: 55000,
    aerialScatter: 0x88687a,
    envIntensity: 1.12,
    bloomStrength: 0.20,
    bloomThreshold: 0.85,
    exposure: 1.06,
  },
  {
    hour: 18.12,
    nightFactor: 0.56,
    goldenFactor: 0.22,
    blueHourFactor: 0.88,
    top: 0x0d214a,
    mid: 0x224682,
    horizon: 0x625a7a,
    antiHorizon: 0x223c6c,
    ground: 0x162034,
    sunDisc: 0xff9466,
    sunIntensity: 0.35,
    horizonGlow: 0.32,
    cloudColor: 0x5c5b7c,
    cloudOpacity: 0.24,
    starVisibility: 0.18,
    moonGlow: 0.06,
    sunLight: 0x9ab0dc,
    sunLightIntensity: 0.28,
    hemiSky: 0x4874bd,
    hemiGround: 0x1c2539,
    hemiIntensity: 0.74,
    subFill: 0x3664b0,
    subFillIntensity: 0.36,
    fogColor: 0x263d66,
    fogNear: 12500,
    fogFar: 54000,
    aerialScatter: 0x385280,
    envIntensity: 1.06,
    bloomStrength: 0.21,
    bloomThreshold: 0.84,
    exposure: 1.08,
  },
  {
    hour: 18.42,
    nightFactor: 0.64,
    goldenFactor: 0.04,
    blueHourFactor: 1.0,
    top: 0x0b1d42,
    mid: 0x1e3f78,
    horizon: 0x4b5c82,
    antiHorizon: 0x1e3562,
    ground: 0x121b2d,
    sunDisc: 0x9ec0ec,
    sunIntensity: 0.0,
    horizonGlow: 0.14,
    cloudColor: 0x3b4d74,
    cloudOpacity: 0.20,
    starVisibility: 0.38,
    moonGlow: 0.22,
    sunLight: 0x7ca2d8,
    sunLightIntensity: 0.18,
    hemiSky: 0x4874bd,
    hemiGround: 0x1c2539,
    hemiIntensity: 0.76,
    subFill: 0x3562ad,
    subFillIntensity: 0.36,
    fogColor: 0x1d3156,
    fogNear: 12500,
    fogFar: 54000,
    aerialScatter: 0x263f6e,
    envIntensity: 1.02,
    bloomStrength: 0.22,
    bloomThreshold: 0.83,
    exposure: 1.08,
  },
  {
    hour: 19.2,
    nightFactor: 0.88,
    goldenFactor: 0.0,
    blueHourFactor: 0.44,
    top: 0x061024,
    mid: 0x112546,
    horizon: 0x253c60,
    antiHorizon: 0x152744,
    ground: 0x0b1322,
    sunDisc: 0x9ac2f4,
    sunIntensity: 0.0,
    horizonGlow: 0.02,
    cloudColor: 0x223352,
    cloudOpacity: 0.16,
    starVisibility: 0.78,
    moonGlow: 0.68,
    sunLight: 0x80a9dc,
    sunLightIntensity: 0.44,
    hemiSky: 0x3a5d92,
    hemiGround: 0x1b212e,
    hemiIntensity: 0.62,
    subFill: 0x2f5aa0,
    subFillIntensity: 0.32,
    fogColor: 0x13223b,
    fogNear: 12000,
    fogFar: 52000,
    aerialScatter: 0x182b48,
    envIntensity: 0.90,
    bloomStrength: 0.24,
    bloomThreshold: 0.82,
    exposure: 1.06,
  },
  {
    hour: 21.5,
    nightFactor: 1.0,
    goldenFactor: 0.0,
    blueHourFactor: 0.0,
    top: 0x050b18,
    mid: 0x0c1a30,
    horizon: 0x182b47,
    antiHorizon: 0x101e34,
    ground: 0x080e18,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.0,
    horizonGlow: 0.0,
    cloudColor: 0x1a2a44,
    cloudOpacity: 0.14,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.58,
    hemiSky: 0x355686,
    hemiGround: 0x1b202a,
    hemiIntensity: 0.56,
    subFill: 0x2c5698,
    subFillIntensity: 0.30,
    fogColor: 0x0f1c30,
    fogNear: 12000,
    fogFar: 52000,
    aerialScatter: 0x122238,
    envIntensity: 0.85,
    bloomStrength: 0.24,
    bloomThreshold: 0.82,
    exposure: 1.06,
  },
  {
    hour: 24.0,
    nightFactor: 1.0,
    goldenFactor: 0.0,
    blueHourFactor: 0.0,
    top: 0x050b18,
    mid: 0x0c1a30,
    horizon: 0x182b47,
    antiHorizon: 0x101e34,
    ground: 0x080e18,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.0,
    horizonGlow: 0.0,
    cloudColor: 0x1a2a44,
    cloudOpacity: 0.14,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.58,
    hemiSky: 0x355686,
    hemiGround: 0x1b202a,
    hemiIntensity: 0.56,
    subFill: 0x2c5698,
    subFillIntensity: 0.30,
    fogColor: 0x0f1c30,
    fogNear: 12000,
    fogFar: 52000,
    aerialScatter: 0x122238,
    envIntensity: 0.85,
    bloomStrength: 0.24,
    bloomThreshold: 0.82,
    exposure: 1.06,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: number, hexB: number, t: number): THREE.Color {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

function presetToDefaultHour(preset: CityLightingPreset): number {
  if (preset === 'dusk') return 17.25;
  if (preset === 'night') return 21.5;
  return 13.5;
}

/**
 * Computes current Tokyo local fractional hour (JST = UTC+9) for real-time mode.
 */
export function getTokyoLocalHour(date: Date = new Date()): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const jstMinutes = (utcMinutes + 9 * 60) % (24 * 60);
  return jstMinutes / 60;
}

/**
 * Computes continuous 24h Tokyo solar/lunar directions & physical lighting state.
 * Sun elevation & azimuth remain strictly continuous across all 24 hours; directional
 * shadow source transitions from sun to moon only while directional light intensity is near 0.
 */
export function computeSolarLightingState(rawHour: number): SolarLightingState {
  const hour = ((rawHour % 24) + 24) % 24;

  let k0 = TIME_KEYFRAMES[0]!;
  let k1 = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1]!;
  for (let i = 0; i < TIME_KEYFRAMES.length - 1; i++) {
    const a = TIME_KEYFRAMES[i]!;
    const b = TIME_KEYFRAMES[i + 1]!;
    if (hour >= a.hour && hour <= b.hour) {
      k0 = a;
      k1 = b;
      break;
    }
  }
  const span = Math.max(1e-4, k1.hour - k0.hour);
  const rawT = Math.max(0, Math.min(1, (hour - k0.hour) / span));
  const t = rawT * rawT * (3 - 2 * rawT);

  const nightFactor = lerp(k0.nightFactor, k1.nightFactor, t);
  const goldenFactor = lerp(k0.goldenFactor, k1.goldenFactor, t);
  const blueHourFactor = lerp(k0.blueHourFactor, k1.blueHourFactor, t);

  // Continuous Tokyo (35.68°N) solar elevation & azimuth over full 24h cycle (no 18:15 jump!)
  // Solar noon at ~11:55, sunrise ~05:45, sunset ~18:05
  const solarPhaseRad = ((hour - 11.92) / 24) * Math.PI * 2;
  const maxNoonRad = 0.96; // ~55°
  const sunElevationRad = Math.sin(Math.cos(solarPhaseRad) * (Math.PI * 0.5)) * maxNoonRad;
  const sunElevationDeg = (sunElevationRad * 180) / Math.PI;
  // Azimuth sweeps smoothly E (+X/+Z) -> S (+Z) -> W (-X/+Z) -> N (-Z)
  const sunAzimuthRad = Math.PI * 0.5 + Math.sin(solarPhaseRad) * 1.95;

  const cosE = Math.cos(sunElevationRad);
  const sunDirection = new THREE.Vector3(
    -Math.cos(sunAzimuthRad) * cosE,
    Math.sin(sunElevationRad),
    Math.sin(sunAzimuthRad) * cosE,
  ).normalize();

  // Continuous night moonlight arc (elevated high in south/southwest sky for crisp night silhouettes)
  const moonHour = hour >= 18 ? hour - 18 : hour + 6;
  const moonPhase = moonHour / 12;
  const moonElev = 0.52 + Math.sin(moonPhase * Math.PI) * 0.24;
  const moonAz = lerp(0.55, 2.5, moonPhase);
  const moonDirection = new THREE.Vector3(
    Math.cos(moonAz) * Math.cos(moonElev),
    Math.sin(moonElev),
    Math.sin(moonAz) * Math.cos(moonElev),
  ).normalize();

  // Switch active shadow/key light direction ONLY when solar elevation < -4.2° (during Blue Hour
  // directional light intensity is already near-zero, preventing any sudden shadow jump)
  const activeLightDirection =
    sunElevationDeg >= -4.2
      ? new THREE.Vector3(
          sunDirection.x,
          Math.max(0.055, sunDirection.y),
          sunDirection.z,
        ).normalize()
      : moonDirection.clone();

  const skyHorizonColor = lerpHex(k0.horizon, k1.horizon, t);
  const skyAntiHorizonColor = lerpHex(k0.antiHorizon, k1.antiHorizon, t);
  const fogColor = lerpHex(k0.fogColor, k1.fogColor, t);
  const preset: CityLightingPreset =
    nightFactor >= 0.78 ? 'night' : nightFactor >= 0.24 ? 'dusk' : 'day';
  const isDark = nightFactor >= 0.78;

  return {
    hour,
    nightFactor,
    goldenFactor,
    blueHourFactor,
    sunElevationRad,
    sunElevationDeg,
    sunAzimuthRad,
    sunDirection,
    moonDirection,
    activeLightDirection,
    skyTopColor: lerpHex(k0.top, k1.top, t),
    skyMidColor: lerpHex(k0.mid, k1.mid, t),
    skyHorizonColor,
    skyAntiHorizonColor,
    skyGroundColor: lerpHex(k0.ground, k1.ground, t),
    sunDiscColor: lerpHex(k0.sunDisc, k1.sunDisc, t),
    sunIntensity: lerp(k0.sunIntensity, k1.sunIntensity, t),
    horizonGlow: lerp(k0.horizonGlow, k1.horizonGlow, t),
    cloudTintColor: lerpHex(k0.cloudColor, k1.cloudColor, t),
    cloudOpacity: lerp(k0.cloudOpacity, k1.cloudOpacity, t),
    starVisibility: lerp(k0.starVisibility, k1.starVisibility, t),
    moonGlow: lerp(k0.moonGlow, k1.moonGlow, t),
    sunLightColor: lerpHex(k0.sunLight, k1.sunLight, t),
    sunLightIntensity: lerp(k0.sunLightIntensity, k1.sunLightIntensity, t),
    hemiSkyColor: lerpHex(k0.hemiSky, k1.hemiSky, t),
    hemiGroundColor: lerpHex(k0.hemiGround, k1.hemiGround, t),
    hemiIntensity: lerp(k0.hemiIntensity, k1.hemiIntensity, t),
    subFillColor: lerpHex(k0.subFill, k1.subFill, t),
    subFillIntensity: lerp(k0.subFillIntensity, k1.subFillIntensity, t),
    fogColor,
    fogNear: lerp(k0.fogNear, k1.fogNear, t),
    fogFar: lerp(k0.fogFar, k1.fogFar, t),
    aerialScatterColor: lerpHex(k0.aerialScatter, k1.aerialScatter, t),
    envIntensity: lerp(k0.envIntensity, k1.envIntensity, t),
    bloomStrength: lerp(k0.bloomStrength, k1.bloomStrength, t),
    bloomThreshold: lerp(k0.bloomThreshold, k1.bloomThreshold, t),
    toneMappingExposure: lerp(k0.exposure, k1.exposure, t),
    isDark,
    preset,
  };
}

export class SkyEnvironmentSystem {
  readonly skyMesh: THREE.Mesh;
  readonly sunDirection = new THREE.Vector3(0.62, 0.56, 0.54).normalize();
  readonly activeLightDirection = new THREE.Vector3(0.62, 0.56, 0.54).normalize();

  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pmremGenerator: THREE.PMREMGenerator;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private isDark: boolean;
  private preset: CityLightingPreset;
  private currentHour: number;
  private lastPmremHour = -999;
  private lastPmremMs = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    isDark: boolean,
    preset?: CityLightingPreset,
  ) {
    this.isDark = isDark;
    this.preset = preset ?? (isDark ? 'night' : 'day');
    this.currentHour = presetToDefaultHour(this.preset);
    this.renderer = renderer;
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    const initialState = computeSolarLightingState(this.currentHour);
    this.sunDirection.copy(initialState.sunDirection);
    this.activeLightDirection.copy(initialState.activeLightDirection);

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: initialState.skyTopColor.clone() },
        uMidColor: { value: initialState.skyMidColor.clone() },
        uHorizonColor: { value: initialState.skyHorizonColor.clone() },
        uAntiHorizonColor: { value: initialState.skyAntiHorizonColor.clone() },
        uGroundColor: { value: initialState.skyGroundColor.clone() },
        uSunColor: { value: initialState.sunDiscColor.clone() },
        uSunDir: { value: this.sunDirection.clone() },
        uMoonDir: { value: initialState.moonDirection.clone() },
        uSunIntensity: { value: initialState.sunIntensity },
        uHorizonGlow: { value: initialState.horizonGlow },
        uCloudColor: { value: initialState.cloudTintColor.clone() },
        uCloudOpacity: { value: initialState.cloudOpacity },
        uStarVisibility: { value: initialState.starVisibility },
        uMoonGlow: { value: initialState.moonGlow },
        uTimeSec: { value: 0 },
      },
    });

    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), this.skyMaterial);
    this.skyMesh.name = 'atmospheric-sky-dome';
    this.skyMesh.scale.setScalar(48_000);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -10;
    scene.add(this.skyMesh);

    this.applyToScene(scene, isDark, this.preset);
  }

  private buildPmremFromState(state: SolarLightingState): THREE.WebGLRenderTarget {
    const envScene = new THREE.Scene();

    const envMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      uniforms: {
        uTopColor: { value: state.skyTopColor.clone() },
        uMidColor: { value: state.skyMidColor.clone() },
        uHorizonColor: { value: state.skyHorizonColor.clone() },
        uAntiHorizonColor: { value: state.skyAntiHorizonColor.clone() },
        uGroundColor: { value: state.skyGroundColor.clone() },
        uSunColor: { value: state.sunDiscColor.clone() },
        uSunDir: { value: state.sunDirection.clone() },
        uMoonDir: { value: state.moonDirection.clone() },
        uSunIntensity: { value: state.sunIntensity * 1.35 },
        uHorizonGlow: { value: state.horizonGlow },
        uCloudColor: { value: state.cloudTintColor.clone() },
        uCloudOpacity: { value: state.cloudOpacity * 0.45 },
        uStarVisibility: { value: 0.0 },
        uMoonGlow: { value: state.moonGlow },
        uTimeSec: { value: 0.0 },
      },
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 14), envMat);
    envScene.add(sphere);

    const sunCard = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 6.5),
      new THREE.MeshBasicMaterial({
        color: state.sunDiscColor.clone().multiplyScalar(Math.max(0.15, state.sunIntensity)),
        side: THREE.DoubleSide,
      }),
    );
    sunCard.position.copy(state.activeLightDirection).multiplyScalar(14);
    sunCard.lookAt(0, 0, 0);
    envScene.add(sunCard);

    const prevRenderTarget = this.renderer.getRenderTarget();
    const rt = this.pmremGenerator.fromScene(envScene, 0.04);
    this.renderer.setRenderTarget(prevRenderTarget);
    this.renderer.setScissorTest(false);

    sphere.geometry.dispose();
    envMat.dispose();
    sunCard.geometry.dispose();
    (sunCard.material as THREE.Material).dispose();
    return rt;
  }

  applyTimeOfDay(
    scene: THREE.Scene,
    hour: number,
    options?: { forcePmrem?: boolean },
  ): SolarLightingState {
    const state = computeSolarLightingState(hour);
    this.currentHour = state.hour;
    this.isDark = state.isDark;
    this.preset = state.preset;
    this.sunDirection.copy(state.sunDirection);
    this.activeLightDirection.copy(state.activeLightDirection);

    (this.skyMaterial.uniforms.uTopColor!.value as THREE.Color).copy(state.skyTopColor);
    (this.skyMaterial.uniforms.uMidColor!.value as THREE.Color).copy(state.skyMidColor);
    (this.skyMaterial.uniforms.uHorizonColor!.value as THREE.Color).copy(state.skyHorizonColor);
    (this.skyMaterial.uniforms.uAntiHorizonColor!.value as THREE.Color).copy(
      state.skyAntiHorizonColor,
    );
    (this.skyMaterial.uniforms.uGroundColor!.value as THREE.Color).copy(state.skyGroundColor);
    (this.skyMaterial.uniforms.uSunColor!.value as THREE.Color).copy(state.sunDiscColor);
    (this.skyMaterial.uniforms.uSunDir!.value as THREE.Vector3).copy(state.sunDirection);
    (this.skyMaterial.uniforms.uMoonDir!.value as THREE.Vector3).copy(state.moonDirection);
    this.skyMaterial.uniforms.uSunIntensity!.value = state.sunIntensity;
    this.skyMaterial.uniforms.uHorizonGlow!.value = state.horizonGlow;
    (this.skyMaterial.uniforms.uCloudColor!.value as THREE.Color).copy(state.cloudTintColor);
    this.skyMaterial.uniforms.uCloudOpacity!.value = state.cloudOpacity;
    this.skyMaterial.uniforms.uStarVisibility!.value = state.starVisibility;
    this.skyMaterial.uniforms.uMoonGlow!.value = state.moonGlow;

    scene.background = state.fogColor.clone();
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(state.fogColor);
      scene.fog.near = state.fogNear;
      scene.fog.far = state.fogFar;
    } else {
      scene.fog = new THREE.Fog(state.fogColor, state.fogNear, state.fogFar);
    }

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const rawHourDiff = Math.abs(state.hour - this.lastPmremHour);
    const wrappedHourDiff = Math.min(rawHourDiff, 24 - rawHourDiff);
    const shouldRebuildPmrem =
      options?.forcePmrem ||
      this.envRenderTarget === null ||
      (wrappedHourDiff >= 0.35 && nowMs - this.lastPmremMs >= 260);

    if (shouldRebuildPmrem) {
      const prevRt = this.envRenderTarget;
      this.envRenderTarget = this.buildPmremFromState(state);
      scene.environment = this.envRenderTarget.texture;
      prevRt?.dispose();
      this.lastPmremHour = state.hour;
      this.lastPmremMs = nowMs;
    }

    return state;
  }

  applyToScene(scene: THREE.Scene, isDark: boolean, preset?: CityLightingPreset): void {
    const resolvedPreset: CityLightingPreset = preset ?? (isDark ? 'night' : 'day');
    const targetHour = presetToDefaultHour(resolvedPreset);
    this.applyTimeOfDay(scene, targetHour, { forcePmrem: true });
    this.isDark = resolvedPreset === 'night' ? true : isDark;
    this.preset = resolvedPreset;
  }

  updateForCamera(cameraPos: THREE.Vector3, cameraFar?: number): void {
    this.skyMesh.position.copy(cameraPos);
    if (cameraFar !== undefined && Number.isFinite(cameraFar) && cameraFar > 0) {
      this.skyMesh.scale.setScalar(Math.max(12_000, cameraFar * 0.78));
    }
  }

  updateTime(elapsedSec: number): void {
    this.skyMaterial.uniforms.uTimeSec!.value = elapsedSec;
  }

  getIsDark(): boolean {
    return this.isDark;
  }

  getPreset(): CityLightingPreset {
    return this.preset;
  }

  getCurrentHour(): number {
    return this.currentHour;
  }

  dispose(): void {
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.envRenderTarget?.dispose();
    this.pmremGenerator.dispose();
  }
}
