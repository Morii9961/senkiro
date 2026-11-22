/**
 * Procedural PBR Concrete, Metal & Wayside Materials for SENKIRO Atlas v2 Underground System.
 *
 * Design rules:
 *  - All physical tunnel & railway materials are strictly realistic neutral colors
 *    (concrete greys, weathered/polished steels, industrial conduits, warm-neutral lighting).
 *  - Operating line colors NEVER tint physical tunnels or rails; they live strictly in
 *    `lineOverlayHighlight.ts`.
 *  - Inner lining materials support subterranean distance depth attenuation via shader uniform
 *    so tunnel interiors have authentic depth falloff (neither over-bright nor pitch black).
 */

import * as THREE from 'three';

export interface TunnelAttenuationUniforms {
  uTunnelAttenActive: { value: number };
  uTunnelAttenNear: { value: number };
  uTunnelAttenFar: { value: number };
  uTunnelAttenColor: { value: THREE.Color };
}

export function createTunnelAttenuationUniforms(): TunnelAttenuationUniforms {
  return {
    uTunnelAttenActive: { value: 0.0 },
    uTunnelAttenNear: { value: 38.0 },
    uTunnelAttenFar: { value: 235.0 },
    uTunnelAttenColor: { value: new THREE.Color(0x111720) },
  };
}

/**
 * Injects subtle interior subterranean depth attenuation + gentle ceiling-to-invert AO gradient
 * without overriding Three.js standard PBR lighting, shadows, or clippingPlanes.
 */
export function injectTunnelDepthAttenuation(
  material: THREE.MeshStandardMaterial,
  uniforms: TunnelAttenuationUniforms,
): void {
  const tag = 'senkiro-tunnel-atten-v1';
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}:${tag}`;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uTunnelAttenActive = uniforms.uTunnelAttenActive;
    shader.uniforms.uTunnelAttenNear = uniforms.uTunnelAttenNear;
    shader.uniforms.uTunnelAttenFar = uniforms.uTunnelAttenFar;
    shader.uniforms.uTunnelAttenColor = uniforms.uTunnelAttenColor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vTunnelCamDist;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vTunnelCamDist = length(mvPosition.xyz);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTunnelAttenActive;
uniform float uTunnelAttenNear;
uniform float uTunnelAttenFar;
uniform vec3 uTunnelAttenColor;
varying float vTunnelCamDist;`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
if (uTunnelAttenActive > 0.5) {
  float attenF = smoothstep(uTunnelAttenNear, uTunnelAttenFar, vTunnelCamDist);
  attenF = attenF * attenF * 0.88;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uTunnelAttenColor, attenF);
}`,
      );
  };
  material.needsUpdate = true;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function finishTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy = 4,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Generates bolted precast circular shield tunnel concrete ring textures (Albedo + Bump).
 * V runs along tunnel length (1 tile = 4 rings ≈ 6m), U runs around circumference.
 */
function createShieldConcreteTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 256;
  const [cCol, ctx] = makeCanvas(w, h);
  const [cBump, bCtx] = makeCanvas(w, h);

  if (ctx && bCtx) {
    ctx.fillStyle = '#8b9198';
    ctx.fillRect(0, 0, w, h);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, w, h);

    // Subtle aggregate & wear noise
    for (let i = 0; i < 650; i++) {
      const x = (Math.sin(i * 127.1 + 0.3) * 0.5 + 0.5) * w;
      const y = (Math.sin(i * 311.7 + 1.9) * 0.5 + 0.5) * h;
      const s = 2 + (i % 4);
      const bright = i % 3 === 0;
      ctx.fillStyle = bright ? 'rgba(230,235,240,0.06)' : 'rgba(20,26,34,0.08)';
      ctx.fillRect(x, y, s, s);
      bCtx.fillStyle = bright ? 'rgba(200,200,200,0.12)' : 'rgba(60,60,60,0.12)';
      bCtx.fillRect(x, y, s, s);
    }

    // Subtle moisture / grime streaking along lower invert edges (U near 0 and 1)
    const grimeL = ctx.createLinearGradient(0, 0, 42, 0);
    grimeL.addColorStop(0, 'rgba(22,26,32,0.34)');
    grimeL.addColorStop(1, 'rgba(22,26,32,0)');
    ctx.fillStyle = grimeL;
    ctx.fillRect(0, 0, 42, h);

    const grimeR = ctx.createLinearGradient(w, 0, w - 42, 0);
    grimeR.addColorStop(0, 'rgba(22,26,32,0.34)');
    grimeR.addColorStop(1, 'rgba(22,26,32,0)');
    ctx.fillStyle = grimeR;
    ctx.fillRect(w - 42, 0, 42, h);

    // Circumferential precast ring joints (every 64px = 1.5m)
    for (let row = 0; row < 4; row++) {
      const y = row * 64;
      // Subtle ring-to-ring concrete batch tone variation
      ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
      ctx.fillRect(0, y, w, 64);

      // Deep recessed joint groove
      ctx.fillStyle = 'rgba(22,28,36,0.58)';
      ctx.fillRect(0, y, w, 4);
      ctx.fillStyle = 'rgba(225,232,240,0.16)';
      ctx.fillRect(0, y + 4, w, 2);

      bCtx.fillStyle = '#202020';
      bCtx.fillRect(0, y, w, 4);
      bCtx.fillStyle = '#b4b4b4';
      bCtx.fillRect(0, y + 4, w, 2);

      // Staggered longitudinal segment seams + recessed bolt pockets
      const shift = (row % 2) * 22;
      for (let x = shift; x < w; x += 44) {
        ctx.fillStyle = 'rgba(24,30,38,0.46)';
        ctx.fillRect(x, y, 3, 64);
        bCtx.fillStyle = '#2c2c2c';
        bCtx.fillRect(x, y, 3, 64);

        // Recessed bolt boxes flanking each joint
        ctx.fillStyle = 'rgba(20,25,32,0.42)';
        ctx.fillRect(x + 7, y + 12, 6, 8);
        ctx.fillRect(x + 7, y + 42, 6, 8);
        bCtx.fillStyle = '#383838';
        bCtx.fillRect(x + 7, y + 12, 6, 8);
        bCtx.fillRect(x + 7, y + 42, 6, 8);
      }
    }
  }

  return {
    map: finishTexture(cCol, true),
    bumpMap: finishTexture(cBump, false),
  };
}

/**
 * Generates cast-in-place cut-and-cover rectangular box concrete textures (Albedo + Bump).
 */
function createBoxConcreteTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 256;
  const [cCol, ctx] = makeCanvas(w, h);
  const [cBump, bCtx] = makeCanvas(w, h);

  if (ctx && bCtx) {
    ctx.fillStyle = '#92979e';
    ctx.fillRect(0, 0, w, h);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, w, h);

    // Concrete surface grain & subtle mineral streaks
    for (let i = 0; i < 600; i++) {
      const x = (Math.sin(i * 97.3 + 2.1) * 0.5 + 0.5) * w;
      const y = (Math.sin(i * 193.7 + 0.7) * 0.5 + 0.5) * h;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(18,22,28,0.07)';
      ctx.fillRect(x, y, 3, 5);
      bCtx.fillStyle = i % 2 === 0 ? 'rgba(195,195,195,0.1)' : 'rgba(65,65,65,0.1)';
      bCtx.fillRect(x, y, 3, 5);
    }

    // Formwork panel joints (every 64px) & expansion joint at y = 0
    for (let y = 0; y < h; y += 64) {
      const isExpansion = y === 0;
      ctx.fillStyle = isExpansion ? 'rgba(18,22,28,0.68)' : 'rgba(26,32,40,0.34)';
      ctx.fillRect(0, y, w, isExpansion ? 5 : 2);
      bCtx.fillStyle = isExpansion ? '#181818' : '#4a4a4a';
      bCtx.fillRect(0, y, w, isExpansion ? 5 : 2);
    }

    // Horizontal formwork lines & tie-rod holes
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = 'rgba(28,34,42,0.22)';
      ctx.fillRect(x, 0, 2, h);
      for (let y = 16; y < h; y += 32) {
        ctx.fillStyle = 'rgba(24,28,34,0.32)';
        ctx.beginPath();
        ctx.arc(x + 32, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        bCtx.fillStyle = '#383838';
        bCtx.beginPath();
        bCtx.arc(x + 32, y, 2.2, 0, Math.PI * 2);
        bCtx.fill();
      }
    }
  }

  return {
    map: finishTexture(cCol, true),
    bumpMap: finishTexture(cBump, false),
  };
}

/**
 * Generates clean architectural neutral underground station cavern wall texture.
 */
function createStationWallTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  if (ctx) {
    ctx.fillStyle = '#adb4bc';
    ctx.fillRect(0, 0, w, h);

    // Subtle architectural acoustic concrete / tile panels
    ctx.strokeStyle = 'rgba(38,46,56,0.26)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Subtle horizontal trim shadow
    ctx.fillStyle = 'rgba(30,38,48,0.16)';
    ctx.fillRect(0, 126, w, 4);
  }
  return finishTexture(canvas, true);
}

/**
 * Generates concrete track slab texture with central drainage trough & rail seat bands.
 */
function createTrackSlabTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  if (ctx) {
    ctx.fillStyle = '#6f757d';
    ctx.fillRect(0, 0, w, h);

    // Subtle oil & brake-dust darkening along track zones
    ctx.fillStyle = 'rgba(28,30,34,0.16)';
    ctx.fillRect(28, 0, 76, h);
    ctx.fillRect(152, 0, 76, h);

    // Central concrete drainage gutter
    ctx.fillStyle = '#484e56';
    ctx.fillRect(118, 0, 20, h);
    ctx.fillStyle = 'rgba(20,24,28,0.45)';
    for (let y = 0; y < h; y += 16) {
      ctx.fillRect(120, y, 16, 4);
    }

    // Transverse precast slab expansion seams
    ctx.fillStyle = 'rgba(24,28,34,0.4)';
    for (let y = 0; y < h; y += 64) {
      ctx.fillRect(0, y, w, 3);
    }
  }
  return finishTexture(canvas, true);
}

export class TunnelMaterialLibrary {
  readonly attenuationUniforms: TunnelAttenuationUniforms;

  readonly shieldInnerMat: THREE.MeshStandardMaterial;
  readonly boxInnerMat: THREE.MeshStandardMaterial;
  readonly stationInnerMat: THREE.MeshStandardMaterial;
  readonly outerShellMat: THREE.MeshStandardMaterial;
  readonly portalConcreteMat: THREE.MeshStandardMaterial;

  readonly trackSlabMat: THREE.MeshStandardMaterial;
  readonly railSteelMat: THREE.MeshStandardMaterial;
  readonly sleeperBlockMat: THREE.MeshStandardMaterial;
  readonly walkwayMat: THREE.MeshStandardMaterial;
  readonly handrailMat: THREE.MeshStandardMaterial;
  readonly cableTroughMat: THREE.MeshStandardMaterial;
  readonly thirdRailSteelMat: THREE.MeshStandardMaterial;
  readonly thirdRailCoverMat: THREE.MeshStandardMaterial;
  readonly rigidCatenaryMat: THREE.MeshStandardMaterial;
  readonly columnMat: THREE.MeshStandardMaterial;

  readonly platformDeckMat: THREE.MeshStandardMaterial;
  readonly platformEdgeYellowMat: THREE.MeshStandardMaterial;
  readonly platformApronMat: THREE.MeshStandardMaterial;

  readonly luminaireHousingMat: THREE.MeshStandardMaterial;
  readonly luminaireEmissiveMat: THREE.MeshStandardMaterial;
  readonly signalHousingMat: THREE.MeshStandardMaterial;
  readonly signalAspectMat: THREE.MeshStandardMaterial;
  readonly emergencySignMat: THREE.MeshStandardMaterial;

  private readonly textures: THREE.Texture[] = [];

  constructor(clipPlanes: THREE.Plane[]) {
    this.attenuationUniforms = createTunnelAttenuationUniforms();

    const shieldTex = createShieldConcreteTextures();
    const boxTex = createBoxConcreteTextures();
    const stationWallTex = createStationWallTexture();
    const slabTex = createTrackSlabTexture();
    this.textures.push(
      shieldTex.map,
      shieldTex.bumpMap,
      boxTex.map,
      boxTex.bumpMap,
      stationWallTex,
      slabTex,
    );

    // 1. Inner Lining Materials — STRICTLY opaque FrontSide (normals point INWARD)
    this.shieldInnerMat = new THREE.MeshStandardMaterial({
      map: shieldTex.map,
      bumpMap: shieldTex.bumpMap,
      bumpScale: 0.14,
      color: 0xd0d5dc,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.shieldInnerMat, this.attenuationUniforms);

    this.boxInnerMat = new THREE.MeshStandardMaterial({
      map: boxTex.map,
      bumpMap: boxTex.bumpMap,
      bumpScale: 0.1,
      color: 0xd2d6dc,
      roughness: 0.86,
      metalness: 0.05,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.boxInnerMat, this.attenuationUniforms);

    this.stationInnerMat = new THREE.MeshStandardMaterial({
      map: stationWallTex,
      color: 0xdbe0e6,
      roughness: 0.78,
      metalness: 0.06,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.stationInnerMat, this.attenuationUniforms);

    // 2. Outer Structural Concrete Shell — STRICTLY opaque FrontSide (normals point OUTWARD)
    this.outerShellMat = new THREE.MeshStandardMaterial({
      map: boxTex.map,
      color: 0x89929c,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.portalConcreteMat = new THREE.MeshStandardMaterial({
      map: boxTex.map,
      color: 0x9aa2ab,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    // 3. Neutral Realistic Railway & Wayside Materials
    this.trackSlabMat = new THREE.MeshStandardMaterial({
      map: slabTex,
      color: 0xb6bcc4,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.FrontSide,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.trackSlabMat, this.attenuationUniforms);

    this.railSteelMat = new THREE.MeshStandardMaterial({
      color: 0xcfd6de,
      roughness: 0.25,
      metalness: 0.86,
      envMapIntensity: 0.85,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.railSteelMat, this.attenuationUniforms);

    this.sleeperBlockMat = new THREE.MeshStandardMaterial({
      color: 0x7b7f86,
      roughness: 0.9,
      metalness: 0.06,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.sleeperBlockMat, this.attenuationUniforms);

    this.walkwayMat = new THREE.MeshStandardMaterial({
      color: 0x92979e,
      roughness: 0.88,
      metalness: 0.04,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.walkwayMat, this.attenuationUniforms);

    this.handrailMat = new THREE.MeshStandardMaterial({
      color: 0x99a3ae,
      roughness: 0.42,
      metalness: 0.72,
      clippingPlanes: clipPlanes,
    });

    this.cableTroughMat = new THREE.MeshStandardMaterial({
      color: 0x3b424b,
      roughness: 0.72,
      metalness: 0.22,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.cableTroughMat, this.attenuationUniforms);

    this.thirdRailSteelMat = new THREE.MeshStandardMaterial({
      color: 0xa4acb5,
      roughness: 0.36,
      metalness: 0.82,
      clippingPlanes: clipPlanes,
    });

    this.thirdRailCoverMat = new THREE.MeshStandardMaterial({
      color: 0x9e7d3c,
      roughness: 0.65,
      metalness: 0.1,
      clippingPlanes: clipPlanes,
    });

    this.rigidCatenaryMat = new THREE.MeshStandardMaterial({
      color: 0xaab3bd,
      roughness: 0.34,
      metalness: 0.78,
      clippingPlanes: clipPlanes,
    });

    this.columnMat = new THREE.MeshStandardMaterial({
      color: 0x737b85,
      roughness: 0.68,
      metalness: 0.28,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.columnMat, this.attenuationUniforms);

    // 4. Station Platform Neutral Materials
    this.platformDeckMat = new THREE.MeshStandardMaterial({
      color: 0xc2c7ce,
      roughness: 0.82,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });
    injectTunnelDepthAttenuation(this.platformDeckMat, this.attenuationUniforms);

    this.platformEdgeYellowMat = new THREE.MeshStandardMaterial({
      color: 0xd6aa32,
      roughness: 0.68,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });

    this.platformApronMat = new THREE.MeshStandardMaterial({
      color: 0x5c626b,
      roughness: 0.9,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });

    // 5. Tunnel Lighting & Wayside Signage Materials
    this.luminaireHousingMat = new THREE.MeshStandardMaterial({
      color: 0x383e46,
      roughness: 0.52,
      metalness: 0.58,
      clippingPlanes: clipPlanes,
    });

    this.luminaireEmissiveMat = new THREE.MeshStandardMaterial({
      color: 0xf7f2e8,
      emissive: 0xffecc9,
      emissiveIntensity: 1.55,
      roughness: 0.25,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });

    this.signalHousingMat = new THREE.MeshStandardMaterial({
      color: 0x242930,
      roughness: 0.62,
      metalness: 0.35,
      clippingPlanes: clipPlanes,
    });

    this.signalAspectMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.1,
      clippingPlanes: clipPlanes,
    });

    this.emergencySignMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.95,
      roughness: 0.3,
      metalness: 0.1,
      clippingPlanes: clipPlanes,
    });
  }

  setInteriorAttenuationActive(active: boolean): void {
    this.attenuationUniforms.uTunnelAttenActive.value = active ? 1.0 : 0.0;
  }

  dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.shieldInnerMat.dispose();
    this.boxInnerMat.dispose();
    this.stationInnerMat.dispose();
    this.outerShellMat.dispose();
    this.portalConcreteMat.dispose();
    this.trackSlabMat.dispose();
    this.railSteelMat.dispose();
    this.sleeperBlockMat.dispose();
    this.walkwayMat.dispose();
    this.handrailMat.dispose();
    this.cableTroughMat.dispose();
    this.thirdRailSteelMat.dispose();
    this.thirdRailCoverMat.dispose();
    this.rigidCatenaryMat.dispose();
    this.columnMat.dispose();
    this.platformDeckMat.dispose();
    this.platformEdgeYellowMat.dispose();
    this.platformApronMat.dispose();
    this.luminaireHousingMat.dispose();
    this.luminaireEmissiveMat.dispose();
    this.signalHousingMat.dispose();
    this.signalAspectMat.dispose();
    this.emergencySignMat.dispose();
  }
}
