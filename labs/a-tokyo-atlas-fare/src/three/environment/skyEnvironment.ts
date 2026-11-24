/**
 * Procedural Dynamic Time-of-Day Atmospheric Sky Dome, Solar Arc & PMREM Environment Reflections.
 *
 * Computes realistic continuous Tokyo (35.68°N) solar elevation/azimuth lighting, Rayleigh/Mie
 * atmospheric scattering, golden hour sunset horizon glow, blue hour twilight, night starfield
 * and moon glow, matched distance linear fog, and throttled PMREM environment reflections for
 * glass curtain walls, steel rails, and shimmering water with zero external HDR assets.
 */

import * as THREE from 'three';
import type { CityLightingPreset } from '../../contracts/atlasV2.js';

export interface SolarLightingState {
  hour: number;
  nightFactor: number; // 0 = bright noon, 0.5 = golden hour / twilight, 1 = full night
  sunElevationRad: number;
  sunAzimuthRad: number;
  sunDirection: THREE.Vector3;
  skyTopColor: THREE.Color;
  skyMidColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  skyGroundColor: THREE.Color;
  sunDiscColor: THREE.Color;
  sunIntensity: number;
  horizonGlow: number;
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
uniform vec3 uGroundColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform float uHorizonGlow;
uniform float uStarVisibility;
uniform float uMoonGlow;

varying vec3 vWorldDir;

float skyHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 dir = normalize(vWorldDir);
  vec3 sunDir = normalize(uSunDir);
  float h = dir.y;

  vec3 col;
  if (h >= 0.0) {
    float midMix = smoothstep(0.0, 0.28, h);
    float topMix = smoothstep(0.20, 0.84, h);
    col = mix(uHorizonColor, uMidColor, midMix);
    col = mix(col, uTopColor, topMix);

    // Directional solar / lunar Mie forward scattering + crisp glowing solar disc
    float sunDot = max(dot(dir, sunDir), 0.0);
    float broadHalo = pow(sunDot, 10.0) * 0.24;
    float tightHalo = pow(sunDot, 96.0) * 0.48;
    float disc = pow(sunDot, 720.0) * (1.35 + uMoonGlow * 0.45);
    col += uSunColor * (broadHalo + tightHalo + disc) * uSunIntensity;

    // Warm sunset/sunrise Mie horizon scatter band toward sun azimuth
    if (uHorizonGlow > 0.01) {
      vec2 hDir = normalize(dir.xz + vec2(1e-5));
      vec2 sDir = normalize(sunDir.xz + vec2(1e-5));
      float azAlign = max(dot(hDir, sDir), 0.0);
      float band = exp(-h * 8.5) * pow(azAlign, 2.2);
      col += uSunColor * band * uHorizonGlow * 0.48;
    }

    // Subtle crisp procedural night stars in upper sky dome
    if (uStarVisibility > 0.02 && h > 0.07) {
      vec3 cell = floor(dir * 260.0);
      float r = skyHash(cell);
      if (r > 0.9965) {
        float starBright = smoothstep(0.9965, 0.9998, r) * smoothstep(0.07, 0.35, h);
        vec3 starCol = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.95, 0.85), fract(r * 97.3));
        col += starCol * starBright * uStarVisibility * 0.85;
      }
    }
  } else {
    float downMix = smoothstep(0.0, -0.35, h);
    col = mix(uHorizonColor * 0.88, uGroundColor, downMix);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

interface TimeKeyframe {
  hour: number;
  nightFactor: number;
  top: number;
  mid: number;
  horizon: number;
  ground: number;
  sunDisc: number;
  sunIntensity: number;
  horizonGlow: number;
  starVisibility: number;
  moonGlow: number;
  sunLight: number;
  sunLightIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  subFill: number;
  subFillIntensity: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
}

const TIME_KEYFRAMES: readonly TimeKeyframe[] = [
  {
    hour: 0.0,
    nightFactor: 1.0,
    top: 0x050b16,
    mid: 0x0c1a30,
    horizon: 0x172942,
    ground: 0x080e17,
    sunDisc: 0xa6ccfa,
    sunIntensity: 0.42,
    horizonGlow: 0.0,
    starVisibility: 1.0,
    moonGlow: 0.9,
    sunLight: 0x9ac0ee,
    sunLightIntensity: 0.82,
    hemiSky: 0x5c82b0,
    hemiGround: 0x141d2b,
    hemiIntensity: 0.56,
    subFill: 0x3b82f6,
    subFillIntensity: 0.48,
    fogNear: 7000,
    fogFar: 32000,
    exposure: 1.03,
  },
  {
    hour: 4.8,
    nightFactor: 0.94,
    top: 0x091326,
    mid: 0x162844,
    horizon: 0x2b3b57,
    ground: 0x0c1320,
    sunDisc: 0xdab8c0,
    sunIntensity: 0.52,
    horizonGlow: 0.16,
    starVisibility: 0.72,
    moonGlow: 0.45,
    sunLight: 0xb7c6e0,
    sunLightIntensity: 0.88,
    hemiSky: 0x7390b8,
    hemiGround: 0x1e2532,
    hemiIntensity: 0.6,
    subFill: 0x5a8cd8,
    subFillIntensity: 0.44,
    fogNear: 7200,
    fogFar: 33000,
    exposure: 1.04,
  },
  {
    hour: 6.0,
    nightFactor: 0.42,
    top: 0x3a649c,
    mid: 0x9c8fa8,
    horizon: 0xf4b68c,
    ground: 0x7d6c61,
    sunDisc: 0xffba78,
    sunIntensity: 1.25,
    horizonGlow: 0.85,
    starVisibility: 0.08,
    moonGlow: 0.0,
    sunLight: 0xffc48e,
    sunLightIntensity: 1.38,
    hemiSky: 0xced8ec,
    hemiGround: 0x7d6f66,
    hemiIntensity: 0.72,
    subFill: 0x93bce6,
    subFillIntensity: 0.38,
    fogNear: 7200,
    fogFar: 34000,
    exposure: 1.05,
  },
  {
    hour: 7.5,
    nightFactor: 0.08,
    top: 0x4f84be,
    mid: 0xa6c7e4,
    horizon: 0xe9e6de,
    ground: 0xbeb9b0,
    sunDisc: 0xfff0d0,
    sunIntensity: 1.12,
    horizonGlow: 0.25,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xffe8c6,
    sunLightIntensity: 1.68,
    hemiSky: 0xd8e8f8,
    hemiGround: 0xa29c92,
    hemiIntensity: 0.78,
    subFill: 0xb7d4ef,
    subFillIntensity: 0.34,
    fogNear: 8000,
    fogFar: 36000,
    exposure: 1.05,
  },
  {
    hour: 10.0,
    nightFactor: 0.0,
    top: 0x548ac4,
    mid: 0xb1cfe8,
    horizon: 0xe6edf3,
    ground: 0xc8c6c0,
    sunDisc: 0xfff6e2,
    sunIntensity: 1.04,
    horizonGlow: 0.05,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xfff4e0,
    sunLightIntensity: 1.82,
    hemiSky: 0xdcebf9,
    hemiGround: 0xa8a298,
    hemiIntensity: 0.82,
    subFill: 0xbdd7f0,
    subFillIntensity: 0.34,
    fogNear: 8500,
    fogFar: 38000,
    exposure: 1.04,
  },
  {
    hour: 13.5,
    nightFactor: 0.0,
    top: 0x5c92c8,
    mid: 0xb5d1e8,
    horizon: 0xe6edf2,
    ground: 0xc8c6c0,
    sunDisc: 0xfff6e4,
    sunIntensity: 1.02,
    horizonGlow: 0.04,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xfff3de,
    sunLightIntensity: 1.85,
    hemiSky: 0xdcebf9,
    hemiGround: 0xa6a096,
    hemiIntensity: 0.8,
    subFill: 0xbdd7f0,
    subFillIntensity: 0.34,
    fogNear: 8500,
    fogFar: 38000,
    exposure: 1.04,
  },
  {
    hour: 16.0,
    nightFactor: 0.06,
    top: 0x4c7eb6,
    mid: 0xa7bfd8,
    horizon: 0xeddcc8,
    ground: 0xb3a99c,
    sunDisc: 0xffdfad,
    sunIntensity: 1.2,
    horizonGlow: 0.36,
    starVisibility: 0.0,
    moonGlow: 0.0,
    sunLight: 0xffdfa8,
    sunLightIntensity: 1.72,
    hemiSky: 0xd4e2f2,
    hemiGround: 0x998e82,
    hemiIntensity: 0.76,
    subFill: 0xaac8e8,
    subFillIntensity: 0.36,
    fogNear: 7800,
    fogFar: 36000,
    exposure: 1.06,
  },
  {
    hour: 17.35,
    nightFactor: 0.48,
    top: 0x2e4876,
    mid: 0x8e6f8c,
    horizon: 0xf4a56b,
    ground: 0x67554b,
    sunDisc: 0xffa458,
    sunIntensity: 1.45,
    horizonGlow: 1.0,
    starVisibility: 0.06,
    moonGlow: 0.0,
    sunLight: 0xffa860,
    sunLightIntensity: 1.42,
    hemiSky: 0xc2b2ce,
    hemiGround: 0x625049,
    hemiIntensity: 0.68,
    subFill: 0x7ca4da,
    subFillIntensity: 0.42,
    fogNear: 7200,
    fogFar: 34000,
    exposure: 1.08,
  },
  {
    hour: 18.5,
    nightFactor: 0.82,
    top: 0x132240,
    mid: 0x2f3b62,
    horizon: 0x645478,
    ground: 0x202230,
    sunDisc: 0xe69f8a,
    sunIntensity: 0.75,
    horizonGlow: 0.42,
    starVisibility: 0.55,
    moonGlow: 0.35,
    sunLight: 0x9db4df,
    sunLightIntensity: 0.96,
    hemiSky: 0x708ab8,
    hemiGround: 0x222838,
    hemiIntensity: 0.6,
    subFill: 0x4b85e8,
    subFillIntensity: 0.46,
    fogNear: 7000,
    fogFar: 33000,
    exposure: 1.06,
  },
  {
    hour: 20.0,
    nightFactor: 0.96,
    top: 0x071020,
    mid: 0x10203a,
    horizon: 0x1e3250,
    ground: 0x0a111c,
    sunDisc: 0xa4c8f8,
    sunIntensity: 0.48,
    horizonGlow: 0.06,
    starVisibility: 0.92,
    moonGlow: 0.8,
    sunLight: 0x9ec2f0,
    sunLightIntensity: 0.88,
    hemiSky: 0x648ab8,
    hemiGround: 0x151e2c,
    hemiIntensity: 0.58,
    subFill: 0x3b82f6,
    subFillIntensity: 0.48,
    fogNear: 7000,
    fogFar: 32000,
    exposure: 1.04,
  },
  {
    hour: 21.5,
    nightFactor: 1.0,
    top: 0x060d19,
    mid: 0x0f1d33,
    horizon: 0x1a2c44,
    ground: 0x090f18,
    sunDisc: 0x9ec5f8,
    sunIntensity: 0.45,
    horizonGlow: 0.0,
    starVisibility: 1.0,
    moonGlow: 0.92,
    sunLight: 0xa3c4f0,
    sunLightIntensity: 0.9,
    hemiSky: 0x6e96c4,
    hemiGround: 0x16202e,
    hemiIntensity: 0.58,
    subFill: 0x3b82f6,
    subFillIntensity: 0.48,
    fogNear: 7000,
    fogFar: 32000,
    exposure: 1.03,
  },
  {
    hour: 24.0,
    nightFactor: 1.0,
    top: 0x050b16,
    mid: 0x0c1a30,
    horizon: 0x172942,
    ground: 0x080e17,
    sunDisc: 0xa6ccfa,
    sunIntensity: 0.42,
    horizonGlow: 0.0,
    starVisibility: 1.0,
    moonGlow: 0.9,
    sunLight: 0x9ac0ee,
    sunLightIntensity: 0.82,
    hemiSky: 0x5c82b0,
    hemiGround: 0x141d2b,
    hemiIntensity: 0.56,
    subFill: 0x3b82f6,
    subFillIntensity: 0.48,
    fogNear: 7000,
    fogFar: 32000,
    exposure: 1.03,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: number, hexB: number, t: number): THREE.Color {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

function presetToDefaultHour(preset: CityLightingPreset): number {
  if (preset === 'dusk') return 17.4;
  if (preset === 'night') return 21.5;
  return 13.5;
}

/**
 * Computes continuous Tokyo solar position, Rayleigh/Mie sky palette, directional sun/moon
 * lighting, hemisphere bounce, fog, and tone-mapping exposure for any hour in [0, 24).
 */
export function computeSolarLightingState(rawHour: number): SolarLightingState {
  const hour = ((rawHour % 24) + 24) % 24;

  // Locate surrounding keyframes
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
  // Smoothstep easing for seamless transitions between atmospheric phases
  const t = rawT * rawT * (3 - 2 * rawT);

  const nightFactor = lerp(k0.nightFactor, k1.nightFactor, t);

  // Realistic Tokyo (35.68°N) solar arc:
  // East (+X, +Z south) at dawn (~5.75h) -> South high at solar noon (~12h, 58°) -> West (-X, +Z) at sunset (~17.75h)
  const dayStart = 5.4;
  const dayEnd = 18.2;
  let sunElevationRad: number;
  let sunAzimuthRad: number;
  const sunDirection = new THREE.Vector3();

  if (hour >= dayStart && hour <= dayEnd) {
    const dayPhase = (hour - dayStart) / (dayEnd - dayStart); // 0..1
    const rawElev = Math.sin(dayPhase * Math.PI) * 1.02; // max ~58.5 deg
    sunElevationRad = Math.max(0.08, rawElev);
    // Azimuth sweeps from ENE (-0.42 rad) through South (+PI/2) to WNW (PI + 0.42)
    sunAzimuthRad = lerp(-0.32, Math.PI + 0.32, dayPhase);
    const cosE = Math.cos(sunElevationRad);
    sunDirection
      .set(Math.cos(sunAzimuthRad) * cosE, Math.sin(sunElevationRad), Math.sin(sunAzimuthRad) * cosE)
      .normalize();
  } else {
    // Moonlight arc during nighttime: elevated cool key light so shadows remain crisp & upright
    const nightHour = hour > dayEnd ? hour - dayEnd : hour + (24 - dayEnd);
    const nightLen = 24 - (dayEnd - dayStart);
    const nightPhase = nightHour / nightLen;
    sunElevationRad = 0.52 + Math.sin(nightPhase * Math.PI) * 0.28;
    sunAzimuthRad = lerp(0.55, 2.55, nightPhase);
    const cosE = Math.cos(sunElevationRad);
    sunDirection
      .set(Math.cos(sunAzimuthRad) * cosE, Math.sin(sunElevationRad), Math.sin(sunAzimuthRad) * cosE)
      .normalize();
  }

  const skyHorizonColor = lerpHex(k0.horizon, k1.horizon, t);
  const preset: CityLightingPreset =
    nightFactor >= 0.72 ? 'night' : nightFactor >= 0.28 ? 'dusk' : 'day';
  const isDark = nightFactor >= 0.62;

  return {
    hour,
    nightFactor,
    sunElevationRad,
    sunAzimuthRad,
    sunDirection,
    skyTopColor: lerpHex(k0.top, k1.top, t),
    skyMidColor: lerpHex(k0.mid, k1.mid, t),
    skyHorizonColor,
    skyGroundColor: lerpHex(k0.ground, k1.ground, t),
    sunDiscColor: lerpHex(k0.sunDisc, k1.sunDisc, t),
    sunIntensity: lerp(k0.sunIntensity, k1.sunIntensity, t),
    horizonGlow: lerp(k0.horizonGlow, k1.horizonGlow, t),
    starVisibility: lerp(k0.starVisibility, k1.starVisibility, t),
    moonGlow: lerp(k0.moonGlow, k1.moonGlow, t),
    sunLightColor: lerpHex(k0.sunLight, k1.sunLight, t),
    sunLightIntensity: lerp(k0.sunLightIntensity, k1.sunLightIntensity, t),
    hemiSkyColor: lerpHex(k0.hemiSky, k1.hemiSky, t),
    hemiGroundColor: lerpHex(k0.hemiGround, k1.hemiGround, t),
    hemiIntensity: lerp(k0.hemiIntensity, k1.hemiIntensity, t),
    subFillColor: lerpHex(k0.subFill, k1.subFill, t),
    subFillIntensity: lerp(k0.subFillIntensity, k1.subFillIntensity, t),
    fogColor: skyHorizonColor.clone(),
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
        uGroundColor: { value: initialState.skyGroundColor.clone() },
        uSunColor: { value: initialState.sunDiscColor.clone() },
        uSunDir: { value: this.sunDirection.clone() },
        uSunIntensity: { value: initialState.sunIntensity },
        uHorizonGlow: { value: initialState.horizonGlow },
        uStarVisibility: { value: initialState.starVisibility },
        uMoonGlow: { value: initialState.moonGlow },
      },
    });

    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(52_000, 32, 18), this.skyMaterial);
    this.skyMesh.name = 'atmospheric-sky-dome';
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
        uGroundColor: { value: state.skyGroundColor.clone() },
        uSunColor: { value: state.sunDiscColor.clone() },
        uSunDir: { value: state.sunDirection.clone() },
        uSunIntensity: { value: state.sunIntensity * 1.28 },
        uHorizonGlow: { value: state.horizonGlow },
        uStarVisibility: { value: 0.0 },
        uMoonGlow: { value: state.moonGlow },
      },
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 14), envMat);
    envScene.add(sphere);

    // Specular solar/lunar reflection highlight card for crisp glass & water glints
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

  /**
   * Smoothly updates sky dome, solar vector, fog, and throttled PMREM reflections for any
   * continuous time-of-day hour in [0, 24).
   */
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
    (this.skyMaterial.uniforms.uGroundColor!.value as THREE.Color).copy(state.skyGroundColor);
    (this.skyMaterial.uniforms.uSunColor!.value as THREE.Color).copy(state.sunDiscColor);
    (this.skyMaterial.uniforms.uSunDir!.value as THREE.Vector3).copy(state.sunDirection);
    this.skyMaterial.uniforms.uSunIntensity!.value = state.sunIntensity;
    this.skyMaterial.uniforms.uHorizonGlow!.value = state.horizonGlow;
    this.skyMaterial.uniforms.uStarVisibility!.value = state.starVisibility;
    this.skyMaterial.uniforms.uMoonGlow!.value = state.moonGlow;

    scene.background = state.skyHorizonColor.clone();
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
      (wrappedHourDiff >= 1.1 && nowMs - this.lastPmremMs >= 450);

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

  updateForCamera(cameraPos: THREE.Vector3): void {
    this.skyMesh.position.copy(cameraPos);
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
