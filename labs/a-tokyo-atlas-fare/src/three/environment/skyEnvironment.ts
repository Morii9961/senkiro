/**
 * Procedural Cinematic 24-Hour Atmospheric Sky Dome, High-Altitude Lit Clouds,
 * Solar/Lunar Arc & PMREM Environment Reflections.
 *
 * Computes realistic continuous Tokyo (35.68°N) solar elevation/azimuth lighting,
 * Rayleigh + azimuthal Mie + anti-solar Belt of Venus scattering, high-altitude
 * sunlit/sunset-underlit cirrus clouds, night starfield and moon glow, matched
 * atmospheric distance fog (never muddy brown), and throttled PMREM reflections.
 */

import * as THREE from 'three';
import type { CityLightingPreset } from '../../contracts/atlasV2.js';

export interface SolarLightingState {
  hour: number;
  nightFactor: number; // 0 = bright noon, 0.5 = golden hour / sunset, 1 = full night
  sunElevationRad: number;
  sunAzimuthRad: number;
  sunDirection: THREE.Vector3;
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
  float h = dir.y;

  // Azimuthal sunward (+1) vs anti-solar (-1) alignment for Belt of Venus & warm sunset fan
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

    // Directional solar / lunar Mie forward scattering + crisp glowing disc
    float sunDot = clamp(dot(dir, sunDir), 0.0, 1.0);
    float broadHalo = sunDot > 1e-4 ? pow(sunDot, 7.0) * 0.22 : 0.0;
    float tightHalo = sunDot > 1e-4 ? pow(sunDot, 72.0) * 0.44 : 0.0;
    float disc = sunDot > 0.9 ? pow(sunDot, 780.0) * (1.35 + uMoonGlow * 0.4) : 0.0;
    col += uSunColor * (broadHalo + tightHalo + disc) * uSunIntensity;

    // Warm sunset/sunrise Mie horizon scatter band toward sun azimuth
    if (uHorizonGlow > 0.01) {
      float fwd = clamp(azAlign, 0.0, 1.0);
      float band = exp(-h * 7.2) * (fwd > 1e-4 ? pow(fwd, 1.85) : 0.0);
      col += uSunColor * band * uHorizonGlow * 0.52;
    }

    // Subtle procedural high-altitude cirrus / altostratus clouds
    if (uCloudOpacity > 0.01 && h > 0.025) {
      vec2 cloudUv = dir.xz / (h + 0.16) * 0.65;
      cloudUv += vec2(uTimeSec * 0.0025, uTimeSec * 0.0012);
      float n1 = fbmClouds(cloudUv * vec2(1.0, 1.45));
      float n2 = fbmClouds(cloudUv * 2.1 + vec2(n1 * 1.4, -n1 * 0.9));
      float wisps = smoothstep(0.54, 0.84, mix(n1, n2, 0.45));
      float elevFade = smoothstep(0.025, 0.20, h) * (1.0 - smoothstep(0.70, 0.98, h) * 0.45);
      // Sunward cloud edges catch extra warm illumination
      float cloudSun = sunDot > 1e-4 ? pow(sunDot, 4.0) * 0.55 : 0.0;
      vec3 litCloud = mix(uCloudColor, uSunColor * 1.15, cloudSun);
      col = mix(col, litCloud, wisps * elevFade * uCloudOpacity);
    }

    // Crisp procedural night starfield in upper sky dome
    if (uStarVisibility > 0.02 && h > 0.06) {
      vec3 cell = floor(dir * 270.0);
      float r = skyHash(cell);
      if (r > 0.9964) {
        float starBright = smoothstep(0.9964, 0.9998, r) * smoothstep(0.06, 0.34, h);
        vec3 starCol = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.95, 0.85), fract(r * 97.3));
        col += starCol * starBright * uStarVisibility * 0.88;
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
  exposure: number;
}

const TIME_KEYFRAMES: readonly TimeKeyframe[] = [
  {
    hour: 0.0,
    nightFactor: 1.0,
    top: 0x040812,
    mid: 0x091529,
    horizon: 0x12223a,
    antiHorizon: 0x0d1a2e,
    ground: 0x060b14,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.36,
    horizonGlow: 0.0,
    cloudColor: 0x1a2a44,
    cloudOpacity: 0.12,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.72,
    hemiSky: 0x35517a,
    hemiGround: 0x0b121e,
    hemiIntensity: 0.44,
    subFill: 0x2b5fa8,
    subFillIntensity: 0.34,
    fogColor: 0x0c1729,
    fogNear: 11500,
    fogFar: 46000,
    exposure: 1.05,
  },
  {
    hour: 4.5,
    nightFactor: 0.96,
    top: 0x071022,
    mid: 0x12223d,
    horizon: 0x253450,
    antiHorizon: 0x152238,
    ground: 0x0a101c,
    sunDisc: 0xd0b8c8,
    sunIntensity: 0.44,
    horizonGlow: 0.18,
    cloudColor: 0x2e3b56,
    cloudOpacity: 0.16,
    starVisibility: 0.76,
    moonGlow: 0.5,
    sunLight: 0x9ab4dc,
    sunLightIntensity: 0.76,
    hemiSky: 0x46638f,
    hemiGround: 0x121926,
    hemiIntensity: 0.48,
    subFill: 0x3e6db8,
    subFillIntensity: 0.34,
    fogColor: 0x162238,
    fogNear: 11800,
    fogFar: 47000,
    exposure: 1.05,
  },
  {
    hour: 5.8,
    nightFactor: 0.42,
    top: 0x24497e,
    mid: 0x6f7ea2,
    horizon: 0xf4a672,
    antiHorizon: 0x867a9c,
    ground: 0x524c54,
    sunDisc: 0xffb36b,
    sunIntensity: 1.25,
    horizonGlow: 0.85,
    cloudColor: 0xf6af7e,
    cloudOpacity: 0.34,
    starVisibility: 0.08,
    moonGlow: 0.0,
    sunLight: 0xffb470,
    sunLightIntensity: 1.65,
    hemiSky: 0x8fb0dc,
    hemiGround: 0x3f4354,
    hemiIntensity: 0.58,
    subFill: 0x7aa4da,
    subFillIntensity: 0.32,
    fogColor: 0x8a879e,
    fogNear: 12500,
    fogFar: 50000,
    exposure: 1.04,
  },
  {
    hour: 7.5,
    nightFactor: 0.08,
    top: 0x346db0,
    mid: 0x86b8e3,
    horizon: 0xe3e8ef,
    antiHorizon: 0xcfdceb,
    ground: 0xb6b5b0,
    sunDisc: 0xfff1d4,
    sunIntensity: 1.08,
    horizonGlow: 0.22,
    cloudColor: 0xfff5e8,
    cloudOpacity: 0.26,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xffeacc,
    sunLightIntensity: 1.82,
    hemiSky: 0xcbe2f7,
    hemiGround: 0x87837c,
    hemiIntensity: 0.68,
    subFill: 0xa8cceb,
    subFillIntensity: 0.28,
    fogColor: 0xd5e0ec,
    fogNear: 13000,
    fogFar: 54000,
    exposure: 1.03,
  },
  {
    hour: 10.5,
    nightFactor: 0.0,
    top: 0x2e6eb5,
    mid: 0x7fb4e2,
    horizon: 0xdbe7f2,
    antiHorizon: 0xd3e1ee,
    ground: 0xbdbcb7,
    sunDisc: 0xfff7e4,
    sunIntensity: 0.98,
    horizonGlow: 0.04,
    cloudColor: 0xf8fbff,
    cloudOpacity: 0.24,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xfff6e8,
    sunLightIntensity: 1.95,
    hemiSky: 0xd4e8fa,
    hemiGround: 0x8d8982,
    hemiIntensity: 0.72,
    subFill: 0xb4d1ee,
    subFillIntensity: 0.28,
    fogColor: 0xd4e2ee,
    fogNear: 13500,
    fogFar: 56000,
    exposure: 1.02,
  },
  {
    hour: 13.5,
    nightFactor: 0.0,
    top: 0x2e6eb5,
    mid: 0x7fb4e2,
    horizon: 0xdbe7f2,
    antiHorizon: 0xd3e1ee,
    ground: 0xbdbcb7,
    sunDisc: 0xfff7e4,
    sunIntensity: 0.98,
    horizonGlow: 0.04,
    cloudColor: 0xf8fbff,
    cloudOpacity: 0.24,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xfff6e8,
    sunLightIntensity: 1.95,
    hemiSky: 0xd4e8fa,
    hemiGround: 0x8d8982,
    hemiIntensity: 0.72,
    subFill: 0xb4d1ee,
    subFillIntensity: 0.28,
    fogColor: 0xd4e2ee,
    fogNear: 13500,
    fogFar: 56000,
    exposure: 1.02,
  },
  {
    hour: 16.25,
    nightFactor: 0.06,
    top: 0x2c63a6,
    mid: 0x80a9d4,
    horizon: 0xebd7c0,
    antiHorizon: 0xb7c6dc,
    ground: 0x9b9690,
    sunDisc: 0xffe2ae,
    sunIntensity: 1.15,
    horizonGlow: 0.34,
    cloudColor: 0xffe8cb,
    cloudOpacity: 0.28,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xffe0b0,
    sunLightIntensity: 2.05,
    hemiSky: 0xbcd4f0,
    hemiGround: 0x6f6c68,
    hemiIntensity: 0.64,
    subFill: 0x95b9e2,
    subFillIntensity: 0.30,
    fogColor: 0xd8dce4,
    fogNear: 13000,
    fogFar: 54000,
    exposure: 1.03,
  },
  {
    hour: 17.25,
    nightFactor: 0.36,
    top: 0x1f427a,
    mid: 0x62739e,
    horizon: 0xffa652,
    antiHorizon: 0x9c82a0,
    ground: 0x45404b,
    sunDisc: 0xffaa52,
    sunIntensity: 1.48,
    horizonGlow: 0.96,
    cloudColor: 0xffb36c,
    cloudOpacity: 0.36,
    starVisibility: 0.02,
    moonGlow: 0.0,
    sunLight: 0xff9f4a,
    sunLightIntensity: 2.25,
    hemiSky: 0x7296cc,
    hemiGround: 0x2a2d3c,
    hemiIntensity: 0.56,
    subFill: 0x648ed0,
    subFillIntensity: 0.32,
    fogColor: 0x9b8e9e,
    fogNear: 13000,
    fogFar: 52000,
    exposure: 1.05,
  },
  {
    hour: 17.75,
    nightFactor: 0.62,
    top: 0x13264c,
    mid: 0x3b4875,
    horizon: 0xf07846,
    antiHorizon: 0x3e4c73,
    ground: 0x222638,
    sunDisc: 0xff8244,
    sunIntensity: 1.32,
    horizonGlow: 0.92,
    cloudColor: 0xe6845c,
    cloudOpacity: 0.32,
    starVisibility: 0.14,
    moonGlow: 0.05,
    sunLight: 0xff863b,
    sunLightIntensity: 1.65,
    hemiSky: 0x4c6fa8,
    hemiGround: 0x181f30,
    hemiIntensity: 0.50,
    subFill: 0x4876c4,
    subFillIntensity: 0.34,
    fogColor: 0x3f4c6e,
    fogNear: 12500,
    fogFar: 50000,
    exposure: 1.06,
  },
  {
    hour: 18.4,
    nightFactor: 0.86,
    top: 0x091632,
    mid: 0x18315c,
    horizon: 0x4e435e,
    antiHorizon: 0x1a2c4e,
    ground: 0x101726,
    sunDisc: 0x9ebde8,
    sunIntensity: 0.42,
    horizonGlow: 0.24,
    cloudColor: 0x4a4968,
    cloudOpacity: 0.20,
    starVisibility: 0.58,
    moonGlow: 0.42,
    sunLight: 0x7da2d6,
    sunLightIntensity: 0.42,
    hemiSky: 0x406498,
    hemiGround: 0x111928,
    hemiIntensity: 0.48,
    subFill: 0x3564b5,
    subFillIntensity: 0.34,
    fogColor: 0x1a2b4a,
    fogNear: 12000,
    fogFar: 48000,
    exposure: 1.06,
  },
  {
    hour: 20.0,
    nightFactor: 0.98,
    top: 0x040915,
    mid: 0x0a172d,
    horizon: 0x142640,
    antiHorizon: 0x0f1d34,
    ground: 0x070c16,
    sunDisc: 0x9ac2f4,
    sunIntensity: 0.38,
    horizonGlow: 0.03,
    cloudColor: 0x1e2e4a,
    cloudOpacity: 0.14,
    starVisibility: 0.94,
    moonGlow: 0.85,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.70,
    hemiSky: 0x385580,
    hemiGround: 0x0c1320,
    hemiIntensity: 0.45,
    subFill: 0x2b5fa8,
    subFillIntensity: 0.34,
    fogColor: 0x0d192c,
    fogNear: 11500,
    fogFar: 46000,
    exposure: 1.05,
  },
  {
    hour: 21.5,
    nightFactor: 1.0,
    top: 0x040812,
    mid: 0x091529,
    horizon: 0x12223a,
    antiHorizon: 0x0d1a2e,
    ground: 0x060b14,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.36,
    horizonGlow: 0.0,
    cloudColor: 0x1a2a44,
    cloudOpacity: 0.12,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.72,
    hemiSky: 0x35517a,
    hemiGround: 0x0b121e,
    hemiIntensity: 0.44,
    subFill: 0x2b5fa8,
    subFillIntensity: 0.34,
    fogColor: 0x0c1729,
    fogNear: 11500,
    fogFar: 46000,
    exposure: 1.05,
  },
  {
    hour: 24.0,
    nightFactor: 1.0,
    top: 0x040812,
    mid: 0x091529,
    horizon: 0x12223a,
    antiHorizon: 0x0d1a2e,
    ground: 0x060b14,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.36,
    horizonGlow: 0.0,
    cloudColor: 0x1a2a44,
    cloudOpacity: 0.12,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0x82aee3,
    sunLightIntensity: 0.72,
    hemiSky: 0x35517a,
    hemiGround: 0x0b121e,
    hemiIntensity: 0.44,
    subFill: 0x2b5fa8,
    subFillIntensity: 0.34,
    fogColor: 0x0c1729,
    fogNear: 11500,
    fogFar: 46000,
    exposure: 1.05,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: number, hexB: number, t: number): THREE.Color {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

function presetToDefaultHour(preset: CityLightingPreset): number {
  if (preset === 'dusk') return 17.45;
  if (preset === 'night') return 21.5;
  return 13.5;
}

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

  // Realistic Tokyo (35.68°N) solar arc with smooth sunset/sunrise descent
  const dayStart = 5.35;
  const dayEnd = 18.15;
  let sunElevationRad: number;
  let sunAzimuthRad: number;
  const sunDirection = new THREE.Vector3();

  if (hour >= dayStart && hour <= dayEnd) {
    const dayPhase = (hour - dayStart) / (dayEnd - dayStart);
    const rawElev = Math.sin(dayPhase * Math.PI) * 1.02;
    sunElevationRad = Math.max(0.035, rawElev);
    sunAzimuthRad = lerp(-0.34, Math.PI + 0.34, dayPhase);
    const cosE = Math.cos(sunElevationRad);
    sunDirection
      .set(Math.cos(sunAzimuthRad) * cosE, Math.sin(sunElevationRad), Math.sin(sunAzimuthRad) * cosE)
      .normalize();
  } else {
    const nightHour = hour > dayEnd ? hour - dayEnd : hour + (24 - dayEnd);
    const nightLen = 24 - (dayEnd - dayStart);
    const nightPhase = nightHour / nightLen;
    sunElevationRad = 0.48 + Math.sin(nightPhase * Math.PI) * 0.28;
    sunAzimuthRad = lerp(0.55, 2.55, nightPhase);
    const cosE = Math.cos(sunElevationRad);
    sunDirection
      .set(Math.cos(sunAzimuthRad) * cosE, Math.sin(sunElevationRad), Math.sin(sunAzimuthRad) * cosE)
      .normalize();
  }

  const skyHorizonColor = lerpHex(k0.horizon, k1.horizon, t);
  const skyAntiHorizonColor = lerpHex(k0.antiHorizon, k1.antiHorizon, t);
  const fogColor = lerpHex(k0.fogColor, k1.fogColor, t);
  const preset: CityLightingPreset =
    nightFactor >= 0.78 ? 'night' : nightFactor >= 0.25 ? 'dusk' : 'day';
  // Delay discrete dark texture swap until deep blue hour so golden hour & sunset stay seamless
  const isDark = nightFactor >= 0.78;

  return {
    hour,
    nightFactor,
    sunElevationRad,
    sunAzimuthRad,
    sunDirection,
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
    toneMappingExposure: lerp(k0.exposure, k1.exposure, t),
    isDark,
    preset,
  };
}

export class SkyEnvironmentSystem {
  readonly skyMesh: THREE.Mesh;
  readonly sunDirection = new THREE.Vector3(0.62, 0.56, 0.54).normalize();

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
        uSunIntensity: { value: state.sunIntensity * 1.28 },
        uHorizonGlow: { value: state.horizonGlow },
        uCloudColor: { value: state.cloudTintColor.clone() },
        uCloudOpacity: { value: state.cloudOpacity * 0.5 },
        uStarVisibility: { value: 0.0 },
        uMoonGlow: { value: state.moonGlow },
        uTimeSec: { value: 0.0 },
      },
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 14), envMat);
    envScene.add(sphere);

    const sunCard = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({
        color: state.sunDiscColor,
        side: THREE.DoubleSide,
      }),
    );
    sunCard.position.copy(state.sunDirection).multiplyScalar(14);
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

    (this.skyMaterial.uniforms.uTopColor!.value as THREE.Color).copy(state.skyTopColor);
    (this.skyMaterial.uniforms.uMidColor!.value as THREE.Color).copy(state.skyMidColor);
    (this.skyMaterial.uniforms.uHorizonColor!.value as THREE.Color).copy(state.skyHorizonColor);
    (this.skyMaterial.uniforms.uAntiHorizonColor!.value as THREE.Color).copy(
      state.skyAntiHorizonColor,
    );
    (this.skyMaterial.uniforms.uGroundColor!.value as THREE.Color).copy(state.skyGroundColor);
    (this.skyMaterial.uniforms.uSunColor!.value as THREE.Color).copy(state.sunDiscColor);
    (this.skyMaterial.uniforms.uSunDir!.value as THREE.Vector3).copy(state.sunDirection);
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
      (wrappedHourDiff >= 0.8 && nowMs - this.lastPmremMs >= 420);

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
