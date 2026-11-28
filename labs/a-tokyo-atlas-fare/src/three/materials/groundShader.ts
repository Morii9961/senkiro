/**
 * Unified Time-of-Day Lighting Uniforms & Multi-Scale Procedural Ground Surface Shader
 * for SENKIRO Atlas.
 *
 * Eliminates flat white/grey model-board ground and hard outer-city cutoffs by adding:
 *  - Multi-scale world-space FBM breakup (zero texture tiling repetition)
 *  - Distance-adaptive micro-detail fade to prevent far-field aliasing
 *  - Outer Kanto metropolitan landcover & radial urban-corridor blending beyond 13km
 *  - Continuous Time-of-Day (Day / Golden Hour / Blue Hour / Night) ground response
 *  - Subtle nocturnal urban hub ambient bounce + restrained sun-aware aerial perspective
 */

import * as THREE from 'three';

export type VisualMode = 'atlas' | 'cinematic';

export type GroundSurfaceKind =
  | 'baseGround'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'railYard'
  | 'sidewalk'
  | 'plaza'
  | 'parkGrass'
  | 'forestFloor'
  | 'bareSoil'
  | 'road';

export interface CityLightingUniforms {
  uTimeSec: { value: number };
  uTimeHour: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyTopColor: { value: THREE.Color };
  uSkyHorizonColor: { value: THREE.Color };
  uNightFactor: { value: number };
  uGoldenFactor: { value: number };
  uBlueHourFactor: { value: number };
  uVisualMode: { value: number }; // 0.0 = atlas, 1.0 = cinematic
  uAerialColor: { value: THREE.Color };
  uMaxLoadRadius: { value: number };
}

export function createCityLightingUniforms(): CityLightingUniforms {
  return {
    uTimeSec: { value: 0 },
    uTimeHour: { value: 13.5 },
    uSunDir: { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
    uSunColor: { value: new THREE.Color(0xfff5e4) },
    uSkyTopColor: { value: new THREE.Color(0x2a69b2) },
    uSkyHorizonColor: { value: new THREE.Color(0xd2e2f2) },
    uNightFactor: { value: 0 },
    uGoldenFactor: { value: 0 },
    uBlueHourFactor: { value: 0 },
    uVisualMode: { value: 1.0 },
    uAerialColor: { value: new THREE.Color(0xd2e0ee) },
    uMaxLoadRadius: { value: 26_000 },
  };
}

const GROUND_NOISE_GLSL = /* glsl */ `
float senkiroHash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float senkiroValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(senkiroHash21(i), senkiroHash21(i + vec2(1.0, 0.0)), u.x),
    mix(senkiroHash21(i + vec2(0.0, 1.0)), senkiroHash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float senkiroFbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * senkiroValueNoise(p);
    p = rot * p * 2.03 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return v;
}
`;

function surfaceKindCode(kind: GroundSurfaceKind): number {
  switch (kind) {
    case 'baseGround':
      return 0;
    case 'residential':
      return 1;
    case 'commercial':
      return 2;
    case 'industrial':
      return 3;
    case 'railYard':
      return 4;
    case 'sidewalk':
      return 5;
    case 'plaza':
      return 6;
    case 'parkGrass':
      return 7;
    case 'forestFloor':
      return 8;
    case 'bareSoil':
      return 9;
    case 'road':
      return 10;
  }
}

/**
 * Injects world-space multi-scale material variation, outer-Kanto metropolitan landcover
 * transition, distance detail LOD, and unified Day/Golden/Blue-Hour/Night grading into a
 * ground/terrain MeshStandardMaterial. Chains cleanly with `injectRadialCutaway`.
 */
export function injectUrbanGroundShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CityLightingUniforms,
  surfaceKind: GroundSurfaceKind,
): void {
  const kindId = surfaceKindCode(surfaceKind);
  const cacheTag = 'senkiro-urban-ground-v2';
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${cacheTag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uGrSurfaceKind = { value: kindId };
    shader.uniforms.uGrSunDir = uniforms.uSunDir;
    shader.uniforms.uGrSunColor = uniforms.uSunColor;
    shader.uniforms.uGrSkyHorizon = uniforms.uSkyHorizonColor;
    shader.uniforms.uGrNightFactor = uniforms.uNightFactor;
    shader.uniforms.uGrGoldenFactor = uniforms.uGoldenFactor;
    shader.uniforms.uGrBlueHourFactor = uniforms.uBlueHourFactor;
    shader.uniforms.uGrVisualMode = uniforms.uVisualMode;
    shader.uniforms.uGrAerialColor = uniforms.uAerialColor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGroundWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 gWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  gWp = instanceMatrix * gWp;
#endif
gWp = modelMatrix * gWp;
vGroundWorldPos = gWp.xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uGrSurfaceKind;
uniform vec3 uGrSunDir;
uniform vec3 uGrSunColor;
uniform vec3 uGrSkyHorizon;
uniform float uGrNightFactor;
uniform float uGrGoldenFactor;
uniform float uGrBlueHourFactor;
uniform float uGrVisualMode;
uniform vec3 uGrAerialColor;
varying vec3 vGroundWorldPos;
${GROUND_NOISE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 wp = vGroundWorldPos.xz;
  float camDist = length(cameraPosition - vGroundWorldPos);
  float nearDetailFade = 1.0 - smoothstep(1400.0, 9500.0, camDist);

  // Macro district & mid-scale parcel/soil variation (guard heavy FBM on roads for fast compilation)
  float nMacro = uGrSurfaceKind > 9.5 ? senkiroValueNoise(wp * 0.004) : senkiroFbm3(wp * 0.0014);
  float nMid = (nearDetailFade > 0.02 && uGrSurfaceKind <= 9.5) ? senkiroFbm3(wp * 0.016 + vec2(4.2, -3.1)) : 0.5;
  float nFine = (nearDetailFade > 0.02 && uGrSurfaceKind <= 9.5) ? senkiroValueNoise(wp * 0.11) : 0.5;

  float toneVar = mix(0.88, 1.12, nMacro) * mix(0.93, 1.07, nMid * nearDetailFade + 0.5 * (1.0 - nearDetailFade));
  float toneScale = uGrSurfaceKind > 9.5 ? 0.42 : 0.82;
  diffuseColor.rgb *= mix(1.0, toneVar, toneScale);

  if (uGrSurfaceKind < 1.5) {
    // Organic domain-warped Tokyo machizukuri block & courtyard micro-variation (reuses nMacro/nMid)
    vec2 blkWarp = vec2(wp.x * 0.88 - wp.y * 0.47, wp.x * 0.47 + wp.y * 0.88);
    blkWarp += vec2((nMacro - 0.5) * 16.0, (nMid - 0.5) * 14.0);
    vec2 blkUv = blkWarp / 30.0;
    vec2 blkCell = floor(blkUv);
    vec2 blkF = fract(blkUv);
    float cellRnd = senkiroHash21(blkCell);
    float laneDist = min(min(blkF.x, 1.0 - blkF.x), min(blkF.y, 1.0 - blkF.y));
    float showEdge = step(0.34, senkiroHash21(blkCell + vec2(3.7, 8.1)));
    float laneMask = (1.0 - smoothstep(0.025, 0.11, laneDist)) * showEdge;
    float subFade = 1.0 - smoothstep(850.0, 4200.0, camDist);

    float patchVeg = smoothstep(0.56, 0.80, nMid);
    vec3 lotCol = mix(vec3(0.94, 0.92, 0.88), vec3(0.81, 0.79, 0.76), cellRnd);
    lotCol = mix(lotCol, vec3(0.62, 0.71, 0.56), patchVeg * 0.42);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * lotCol, 0.74 * subFade);
    diffuseColor.rgb *= 1.0 - laneMask * 0.11 * subFade;
  }

  if (uGrSurfaceKind < 0.5) {
    // Base ground: subtle warm-earth vs urban-concrete variation inside 23 wards, transitioning
    // smoothly into Kanto regional urban corridors, Musashino woods, and western foothills (>12.5km)
    float radialDist = length(wp - vec2(-2200.0, 400.0));
    float outerBlend = smoothstep(12200.0, 17500.0, radialDist);

    // Real regional urban corridor axes: Yokohama/Kawasaki SW, Saitama N, Chiba E, Tama W
    vec2 dirN = normalize(wp + vec2(0.001));
    float corrSW = pow(max(0.0, dot(dirN, normalize(vec2(-0.42, 0.90)))), 4.0);
    float corrN  = pow(max(0.0, dot(dirN, normalize(vec2(-0.12, -0.99)))), 4.0);
    float corrE  = pow(max(0.0, dot(dirN, normalize(vec2(0.95, -0.15)))), 4.0);
    float corrW  = pow(max(0.0, dot(dirN, normalize(vec2(-0.98, -0.12)))), 4.0);
    float corridorMask = clamp((corrSW + corrN * 0.85 + corrE * 0.80 + corrW * 0.72) * (0.45 + 0.55 * nMacro), 0.0, 1.0);

    // Western hills / green belt (west of x = -18km) & farmland/greenery texture
    float westHills = smoothstep(-16000.0, -34000.0, wp.x) * (0.55 + 0.45 * nMacro);
    vec3 outerUrbanCol = vec3(0.41, 0.40, 0.38) * mix(0.86, 1.12, nFine);
    vec3 outerGreenCol = mix(vec3(0.27, 0.34, 0.23), vec3(0.20, 0.27, 0.18), westHills) * mix(0.85, 1.15, nMid);
    vec3 outerSoilCol  = vec3(0.39, 0.37, 0.32);
    vec3 outerRegion = mix(outerSoilCol, outerGreenCol, clamp(0.45 + westHills * 0.55 - corridorMask * 0.25, 0.0, 1.0));
    outerRegion = mix(outerRegion, outerUrbanCol, corridorMask * (1.0 - westHills * 0.65) * 0.78);

    // Subtle green park/yard speckles inside inner urban parcel base
    float innerGarden = smoothstep(0.60, 0.82, nMid) * 0.22 * (1.0 - outerBlend);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.29, 0.37, 0.26), innerGarden);
    diffuseColor.rgb = mix(diffuseColor.rgb, outerRegion, outerBlend);
  }

  if (uGrSurfaceKind > 6.5 && uGrSurfaceKind < 8.5) {
    // Natural grass & forest floor organic tonal mottling (reuses nMid/nFine without extra FBM loops)
    float lushness = mix(nMacro, nMid, 0.65);
    float canopyDapple = mix(nMid, nFine, 0.55);
    vec3 warmGrass = diffuseColor.rgb * vec3(1.14, 1.08, 0.84);
    vec3 deepMoss  = diffuseColor.rgb * vec3(0.68, 0.82, 0.68);
    diffuseColor.rgb = mix(warmGrass, deepMoss, lushness);
    diffuseColor.rgb *= mix(0.84, 1.09, canopyDapple * nearDetailFade + 0.5 * (1.0 - nearDetailFade));
  }

  // Continuous Time-of-Day albedo & blue-hour / night atmospheric grading (zero discrete snap)
  float duskCool = clamp(uGrBlueHourFactor * 0.65 + uGrNightFactor * 0.85, 0.0, 1.0);
  vec3 nightGrade = mix(vec3(1.0), vec3(0.32, 0.37, 0.46), duskCool);
  diffuseColor.rgb *= nightGrade;

  // Atlas Mode slightly lifts dark ground contrast for rail legibility
  if (uGrVisualMode < 0.5) {
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12 + vec3(0.025), 1.0 - uGrNightFactor * 0.65);
  }
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
{
  float nR = senkiroValueNoise(vGroundWorldPos.xz * 0.035);
  roughnessFactor = clamp(roughnessFactor + (nR - 0.5) * 0.08, 0.25, 0.99);
  if (uGrSurfaceKind > 9.5) {
    // Weathered urban asphalt gains subtle grazing sky & lamp specular sheen at dusk/night
    roughnessFactor = mix(roughnessFactor, 0.42, clamp(uGrBlueHourFactor * 0.55 + uGrNightFactor * 0.80, 0.0, 1.0));
  }
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `if (uGrNightFactor > 0.12 || uGrBlueHourFactor > 0.02) {
#include <emissivemap_fragment>
  // Continuous Dual-Scale Tokyo Night Radiance (zero 46m checkerboards, zero circular hub blobs!)
  // Keeps parks, forest understories & outer countryside naturally dark.
  float nightOn = smoothstep(0.18, 0.85, uGrNightFactor + uGrBlueHourFactor * 0.62);
  if (nightOn > 0.01 && (uGrSurfaceKind < 6.5 || uGrSurfaceKind > 9.5)) {
    vec2 wp = vGroundWorldPos.xz;
    float camDist = length(cameraPosition - vGroundWorldPos);
    float radialDist = length(wp - vec2(-2200.0, 400.0));

    // Organic metropolitan density gradient + real Kanto arterial corridors (SW/N/E/W)
    vec2 dirN = normalize(wp + vec2(0.001));
    float corr = max(
      max(pow(max(0.0, dot(dirN, normalize(vec2(-0.42, 0.90)))), 3.0),
          pow(max(0.0, dot(dirN, normalize(vec2(-0.12, -0.99)))), 3.0)),
      max(pow(max(0.0, dot(dirN, normalize(vec2(0.95, -0.15)))), 3.0),
          pow(max(0.0, dot(dirN, normalize(vec2(-0.98, -0.12)))), 3.0))
    );
    float metroEnvelope = 1.0 - smoothstep(4800.0, 27000.0, radialDist * (1.0 - corr * 0.25));

    // Smooth domain-warped FBM modulation (zero hard cell borders or checkerboards)
    float macroNoise = senkiroFbm3(wp * 0.00085 + vec2(1.7, -2.3));
    float midNoise = senkiroValueNoise(wp * 0.0065 + vec2(macroNoise * 2.4, -macroNoise * 1.9));
    float organicMod = smoothstep(0.16, 0.88, macroNoise * 0.62 + midNoise * 0.38);

    vec3 warmSodium = vec3(1.00, 0.70, 0.36);
    vec3 neutralLed = vec3(0.88, 0.93, 1.00);
    vec3 carpetColor = mix(warmSodium, neutralLed, smoothstep(0.38, 0.86, midNoise) * 0.46);

    // Restrained close-up bounce to preserve deep dark contact shadows around buildings
    float kindWeightClose = 0.032;
    if (uGrSurfaceKind > 9.5) {
      kindWeightClose = 0.030;
    } else if (abs(uGrSurfaceKind - 2.0) < 0.5 || abs(uGrSurfaceKind - 6.0) < 0.5) {
      kindWeightClose = 0.075;
    } else if (abs(uGrSurfaceKind - 5.0) < 0.5) {
      kindWeightClose = 0.095;
    } else if (uGrSurfaceKind > 2.5 && uGrSurfaceKind < 4.5) {
      kindWeightClose = 0.025;
    }
    totalEmissiveRadiance += carpetColor * metroEnvelope * (0.35 + 0.65 * organicMod) * kindWeightClose * nightOn;

    // Panorama-scale sparkling urban micro-light tapestry (fades IN above 1.4km, zero close-up artifacts)
    float panFade = smoothstep(1400.0, 4800.0, camDist) * (1.0 - smoothstep(22000.0, 48000.0, camDist));
    if (panFade > 0.01 && uGrSurfaceKind < 6.5) {
      vec2 w1 = wp * 0.038 + vec2(macroNoise * 3.8, -midNoise * 3.2);
      vec2 w2 = vec2(wp.x * 0.82 - wp.y * 0.57, wp.x * 0.57 + wp.y * 0.82) * 0.019 + vec2(-midNoise * 2.5, macroNoise * 2.9);
      float sparkA = pow(max(senkiroValueNoise(w1), 0.0001), 3.4);
      float sparkB = pow(max(senkiroValueNoise(w2), 0.0001), 2.6);
      float microTapestry = (sparkA * 0.72 + sparkB * 0.48) * (0.40 + 0.60 * organicMod) * metroEnvelope;
      float tempMix = smoothstep(0.32, 0.78, senkiroValueNoise(wp * 0.011 + vec2(7.1, 3.4)));
      vec3 tapColor = mix(vec3(1.00, 0.68, 0.34), vec3(0.86, 0.92, 1.00), tempMix * 0.48);
      float landTapWeight = (abs(uGrSurfaceKind - 2.0) < 0.5 || abs(uGrSurfaceKind - 6.0) < 0.5) ? 0.58 : (uGrSurfaceKind < 1.5 ? 0.42 : 0.20);
      totalEmissiveRadiance += tapColor * microTapestry * landTapWeight * panFade * nightOn;
    }
  }
}`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `{
  // Sun-aware aerial perspective haze in linear space before tone mapping
  float vDist = length(vViewPosition);
  float aerialT = smoothstep(9500.0, 52000.0, vDist) * (0.24 + 0.34 * uGrVisualMode);
  vec3 viewDirW = normalize(vGroundWorldPos - cameraPosition);
  float sunAlign = clamp(dot(viewDirW, normalize(uGrSunDir)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 hazeCol = mix(uGrAerialColor, uGrSunColor * 0.72 + uGrSkyHorizon * 0.28, pow(max(sunAlign, 0.001), 2.5) * uGrGoldenFactor * 0.65);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, aerialT);
}
#include <tonemapping_fragment>`,
      );
  };
  material.needsUpdate = true;
}
