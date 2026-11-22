/**
 * Reusable Procedural PBR Material & Texture Library for Tokyo Architectural Visualization (P2).
 *
 * Generates zero-external-asset CanvasTextures (Albedo + RoughnessMap + BumpMap + Night EmissiveMap)
 * tuned for low-saturation, semi-realistic Japanese urban architecture:
 *  - officeGlass       (curtain-wall glass skyscrapers with aluminum mullions & spandrels)
 *  - commercialStone   (Marunouchi / Shibuya / Shinjuku precast limestone & ribbon windows)
 *  - residentialMansion (Japanese RC apartment / mansion with recessed horizontal balconies)
 *  - stationCivic      (JR / Metro station terminal precast concrete & glass louver facade)
 *  - heritageBrick     (Tokyo Station Marunouchi Meiji red brick & granite stringcourses)
 *  - roofParapet       (flat gravel/membrane urban rooftop with waterproof seams & parapet frame)
 */

import * as THREE from 'three';

export type FacadeMaterialKey =
  | 'officeGlass'
  | 'commercialStone'
  | 'residentialMansion'
  | 'stationCivic'
  | 'heritageBrick'
  | 'roofParapet';

export interface FacadePbrSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture | null;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for procedural facade texture');
  return [c, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  isColor: boolean,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Deterministic pseudo-random in [0, 1) */
function hash2(x: number, y: number, seed = 1337): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function generateOfficeGlassSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Base metallic spandrel & structural mullions
  a.fillStyle = isDark ? '#2a3747' : '#bcc7d4';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#a8a8a8'; // mullions roughness ~0.66
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#d8d8d8'; // raised mullions
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floorH = 32; // ~3.8m per floor
  const bayW = 32;
  for (let fy = 0; fy < h / floorH; fy++) {
    const y0 = fy * floorH;
    // Spandrel structural band at bottom of floor
    a.fillStyle = isDark ? '#212d3b' : '#aebbc9';
    a.fillRect(0, y0, w, 9);
    b.fillStyle = '#c0c0c0';
    b.fillRect(0, y0, w, 9);

    for (let bx = 0; bx < w / bayW; bx++) {
      const x0 = bx * bayW;
      const rnd = hash2(bx, fy, 11);
      // Subtle curtain-wall sky/interior glass tint variation per bay
      const glassTone = isDark
        ? rnd > 0.6
          ? '#324861'
          : '#243548'
        : rnd > 0.65
          ? '#9db7ce'
          : rnd > 0.3
            ? '#8da8c1'
            : '#839eb7';
      a.fillStyle = glassTone;
      a.fillRect(x0 + 2, y0 + 10, bayW - 4, floorH - 12);

      // Subtle diagonal architectural reflection sheen inside glass
      a.fillStyle = isDark ? 'rgba(186,216,245,0.06)' : 'rgba(255,255,255,0.16)';
      a.fillRect(x0 + 3, y0 + 11, (bayW - 6) * 0.45, floorH - 15);

      // Glossy glass roughness (~0.18) & recessed bump
      r.fillStyle = '#303030';
      r.fillRect(x0 + 2, y0 + 10, bayW - 4, floorH - 12);
      b.fillStyle = '#484848';
      b.fillRect(x0 + 2, y0 + 10, bayW - 4, floorH - 12);

      // Night interior lit floors (clustered realistic office occupancy)
      const floorLit = hash2(0, fy, 47) > 0.42;
      if (floorLit && rnd > 0.34) {
        e.fillStyle = rnd > 0.78 ? '#ffd9a0' : '#cfe5ff';
        e.fillRect(x0 + 3, y0 + 12, bayW - 6, floorH - 16);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.032, 0.032, true),
    roughnessMap: finalizeTexture(cRgh, 0.032, 0.032, false),
    bumpMap: finalizeTexture(cBmp, 0.032, 0.032, false),
    emissiveMap: finalizeTexture(cEmi, 0.032, 0.032, true),
  };
}

function generateCommercialStoneSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Warm natural Japanese architectural stone / precast concrete base
  a.fillStyle = isDark ? '#3a424d' : '#dedbd4';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#d4d4d4'; // matte stone ~0.83
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#cfcfcf';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floorH = 36;
  const bayW = 42;
  for (let fy = 0; fy < Math.ceil(h / floorH); fy++) {
    const y0 = fy * floorH;
    // Horizontal slab cornice shadow line
    a.fillStyle = isDark ? '#2c333d' : '#c6c2b9';
    a.fillRect(0, y0, w, 3);
    b.fillStyle = '#f0f0f0';
    b.fillRect(0, y0, w, 3);

    // Subtle stone panel variation
    for (let bx = 0; bx < Math.ceil(w / bayW); bx++) {
      const x0 = bx * bayW;
      const rnd = hash2(bx, fy, 23);
      // Recessed window bay
      a.fillStyle = isDark ? '#273445' : rnd > 0.5 ? '#6d7e90' : '#7b8c9d';
      a.fillRect(x0 + 5, y0 + 11, bayW - 10, 17);

      // Subtle top shadow inside reveal
      a.fillStyle = 'rgba(15,23,42,0.22)';
      a.fillRect(x0 + 5, y0 + 11, bayW - 10, 3);

      // Window reflection & mullions
      a.fillStyle = isDark ? '#3d4754' : '#c4c0b7';
      a.fillRect(x0 + Math.floor(bayW * 0.5) - 1, y0 + 11, 2, 17);

      r.fillStyle = '#424242';
      r.fillRect(x0 + 5, y0 + 11, bayW - 10, 17);
      b.fillStyle = '#3c3c3c';
      b.fillRect(x0 + 5, y0 + 11, bayW - 10, 17);

      if (rnd > 0.56) {
        e.fillStyle = rnd > 0.8 ? '#ffe2b0' : '#ffcf86';
        e.fillRect(x0 + 6, y0 + 13, bayW - 12, 13);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.036, 0.036, true),
    roughnessMap: finalizeTexture(cRgh, 0.036, 0.036, false),
    bumpMap: finalizeTexture(cBmp, 0.036, 0.036, false),
    emissiveMap: finalizeTexture(cEmi, 0.036, 0.036, true),
  };
}

function generateResidentialMansionSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Authentic Japanese RC apartment / mansion warm tiled stucco
  a.fillStyle = isDark ? '#353b45' : '#e4e0d8';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#e0e0e0'; // matte plaster/ceramic tile ~0.88
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#c8c8c8';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floorH = 28; // ~3.0m residential story
  const unitW = 64;
  for (let fy = 0; fy < Math.ceil(h / floorH); fy++) {
    const y0 = fy * floorH;
    // Recessed balcony dark soffit shadow
    a.fillStyle = isDark ? '#1f252e' : '#9b9fa5';
    a.fillRect(0, y0 + 4, w, 12);
    b.fillStyle = '#383838';
    b.fillRect(0, y0 + 4, w, 12);

    // Balcony concrete parapet / frosted glass rail
    a.fillStyle = isDark ? '#434b57' : '#d5d2ca';
    a.fillRect(0, y0 + 13, w, 9);
    b.fillStyle = '#e8e8e8';
    b.fillRect(0, y0 + 13, w, 9);

    // Subtle handrail metal lip
    a.fillStyle = isDark ? '#586270' : '#b2b6bc';
    a.fillRect(0, y0 + 12, w, 2);

    for (let ux = 0; ux < w / unitW; ux++) {
      const x0 = ux * unitW;
      const rnd = hash2(ux, fy, 91);
      // Vertical structural party-wall divider between apartments
      a.fillStyle = isDark ? '#3c434f' : '#dcd8cf';
      a.fillRect(x0, y0, 7, floorH);
      b.fillStyle = '#f2f2f2';
      b.fillRect(x0, y0, 7, floorH);

      // Sliding terrace glass window behind balcony
      a.fillStyle = isDark ? '#253140' : '#738291';
      a.fillRect(x0 + 11, y0 + 5, unitW - 18, 8);
      r.fillStyle = '#4c4c4c';
      r.fillRect(x0 + 11, y0 + 5, unitW - 18, 8);

      if (rnd > 0.68) {
        e.fillStyle = '#ffd596';
        e.fillRect(x0 + 13, y0 + 6, unitW - 22, 6);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.042, 0.042, true),
    roughnessMap: finalizeTexture(cRgh, 0.042, 0.042, false),
    bumpMap: finalizeTexture(cBmp, 0.042, 0.042, false),
    emissiveMap: finalizeTexture(cEmi, 0.042, 0.042, true),
  };
}

function generateStationCivicSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 256;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Clean Japanese station terminal white-silver precast & louver glazing
  a.fillStyle = isDark ? '#3c4959' : '#d7dce2';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#b4b4b4';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#cccccc';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 64) {
    // Tall concourse glass clerestory band
    a.fillStyle = isDark ? '#2d445c' : '#8da7bd';
    a.fillRect(0, y + 14, w, 34);
    r.fillStyle = '#363636';
    r.fillRect(0, y + 14, w, 34);
    b.fillStyle = '#505050';
    b.fillRect(0, y + 14, w, 34);

    // Vertical architectural louver fins
    for (let x = 0; x < w; x += 16) {
      a.fillStyle = isDark ? '#4a596b' : '#cfd5dc';
      a.fillRect(x, y, 4, 64);
      b.fillStyle = '#f0f0f0';
      b.fillRect(x, y, 4, 64);
    }

    // Warm station concourse light at night
    e.fillStyle = '#e6f0ff';
    e.fillRect(4, y + 18, w - 8, 26);
  }

  return {
    map: finalizeTexture(cAlb, 0.035, 0.035, true),
    roughnessMap: finalizeTexture(cRgh, 0.035, 0.035, false),
    bumpMap: finalizeTexture(cBmp, 0.035, 0.035, false),
    emissiveMap: finalizeTexture(cEmi, 0.035, 0.035, true),
  };
}

function generateHeritageBrickSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 256;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Meiji red brick (Tokyo Station Marunouchi)
  a.fillStyle = isDark ? '#6c3427' : '#a44d39';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#d6d6d6';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#b4b4b4';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  // Subtle brick micro-variation
  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 16) {
      const rnd = hash2(x, y, 7);
      a.fillStyle =
        rnd > 0.5
          ? isDark
            ? 'rgba(130,62,46,0.35)'
            : 'rgba(182,92,70,0.28)'
          : 'rgba(40,15,10,0.12)';
      a.fillRect(x + ((y / 8) % 2) * 8, y, 14, 6);
    }
  }

  // Cream granite horizontal stringcourses
  for (let y = 14; y < h; y += 64) {
    a.fillStyle = isDark ? '#8e7c6a' : '#dfd2bf';
    a.fillRect(0, y, w, 6);
    b.fillStyle = '#f2f2f2';
    b.fillRect(0, y, w, 6);

    // Tall recessed heritage windows
    for (let x = 12; x < w; x += 36) {
      a.fillStyle = isDark ? '#26303d' : '#435163';
      a.fillRect(x, y + 12, 18, 36);
      // Cream stone keystone lintel
      a.fillStyle = isDark ? '#8e7c6a' : '#dfd2bf';
      a.fillRect(x - 2, y + 9, 22, 4);
      r.fillStyle = '#3a3a3a';
      r.fillRect(x, y + 12, 18, 36);
      b.fillStyle = '#383838';
      b.fillRect(x, y + 12, 18, 36);
      e.fillStyle = '#ffd596';
      e.fillRect(x + 2, y + 15, 14, 30);
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.04, 0.04, true),
    roughnessMap: finalizeTexture(cRgh, 0.04, 0.04, false),
    bumpMap: finalizeTexture(cBmp, 0.04, 0.04, false),
    emissiveMap: finalizeTexture(cEmi, 0.04, 0.04, true),
  };
}

function generateRoofParapetSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 256;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);

  // Japanese flat concrete/waterproof membrane rooftop
  a.fillStyle = isDark ? '#2c333e' : '#c6c9cd';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#e6e6e6'; // matte gravel/membrane ~0.90
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);

  // Subtle waterproof seam expansion joints
  a.strokeStyle = isDark ? 'rgba(15,23,42,0.35)' : 'rgba(90,98,108,0.18)';
  a.lineWidth = 2;
  for (let i = 0; i <= w; i += 64) {
    a.beginPath();
    a.moveTo(i, 0);
    a.lineTo(i, h);
    a.stroke();
    a.beginPath();
    a.moveTo(0, i);
    a.lineTo(w, i);
    a.stroke();
  }

  // Subtle weathered gravel micro-speckle & rooftop equipment pads
  for (let i = 0; i < 420; i++) {
    const px = hash2(i, 1, 51) * w;
    const py = hash2(i, 2, 51) * h;
    const shade = hash2(i, 3, 51) > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    a.fillStyle = shade;
    a.fillRect(px, py, 3, 3);
    b.fillStyle = hash2(i, 4, 51) > 0.5 ? '#9c9c9c' : '#686868';
    b.fillRect(px, py, 2, 2);
  }

  return {
    map: finalizeTexture(cAlb, 0.04, 0.04, true),
    roughnessMap: finalizeTexture(cRgh, 0.04, 0.04, false),
    bumpMap: finalizeTexture(cBmp, 0.04, 0.04, false),
    emissiveMap: null,
  };
}

/**
 * Natural low-saturation Japanese urban ground texture (subtle parcel micro-variation, never sterile grey).
 */
export function createUrbanGroundTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = isDark ? '#131a24' : '#dedbd4';
  ctx.fillRect(0, 0, size, size);

  // Subtle urban cadastral block stipple
  for (let y = 0; y < size; y += 32) {
    for (let x = 0; x < size; x += 32) {
      const rnd = hash2(x, y, 303);
      ctx.fillStyle = isDark
        ? rnd > 0.5
          ? 'rgba(30,41,59,0.28)'
          : 'rgba(15,23,42,0.22)'
        : rnd > 0.5
          ? 'rgba(255,252,245,0.24)'
          : 'rgba(180,175,165,0.16)';
      ctx.fillRect(x + 1, y + 1, 30, 30);
    }
  }

  // Very delicate cadastral hairlines
  ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(115,112,106,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  return finalizeTexture(canvas, 140, 140, true);
}

/**
 * Natural low-saturation botanical canopy stipple texture for Tokyo parks (Imperial Palace, Yoyogi, Ueno, Shinjuku Gyoen).
 */
export function createParkCanopyTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = isDark ? '#1d3728' : '#93b18a';
  ctx.fillRect(0, 0, size, size);

  // Soft organic foliage canopy clusters
  for (let i = 0; i < 240; i++) {
    const cx = hash2(i, 1, 88) * size;
    const cy = hash2(i, 2, 88) * size;
    const rad = 5 + hash2(i, 3, 88) * 12;
    const tone = hash2(i, 4, 88);
    ctx.fillStyle = isDark
      ? tone > 0.5
        ? 'rgba(42,84,58,0.45)'
        : 'rgba(18,38,26,0.45)'
      : tone > 0.65
        ? 'rgba(124,158,113,0.42)'
        : tone > 0.3
          ? 'rgba(108,142,100,0.36)'
          : 'rgba(164,185,146,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(canvas, 0.014, 0.014, true);
}

/**
 * Restrained low-saturation Japanese architectural per-building color multiplier (for vertexColors / instanceColor).
 * Produces subtle real-world Tokyo tone diversity (limestone, warm concrete, pale ivory, cool glass, muted slate).
 */
const PALETTE_DAY: Record<'o' | 'c' | 'r' | 's', number[]> = {
  o: [0xdce6f0, 0xd4dfe8, 0xe2e8ee, 0xc9d7e3, 0xd8dee4, 0xe5e9ed],
  c: [0xf0ece4, 0xe8e3da, 0xe0e4e8, 0xebe6dc, 0xdcd9d3, 0xe6e8eb],
  r: [0xf2eee7, 0xebe4d8, 0xe4dfd7, 0xede8df, 0xdfdbd4, 0xe8e5de],
  s: [0xe6eaef, 0xdde3ea, 0xeceee9],
};

const PALETTE_NIGHT: Record<'o' | 'c' | 'r' | 's', number[]> = {
  o: [0xa6b9cc, 0x95abc2, 0xb2c2d4, 0x8fa3b8],
  c: [0xaeb4bc, 0xa3a9b3, 0xb5b2aa, 0x9ba3ad],
  r: [0xa4a9b2, 0x9c9fa8, 0xaba69f, 0x959aa3],
  s: [0xb4c0ce, 0xa5b4c4],
};

export function getBuildingTintHex(
  id: number,
  typology: 'o' | 'c' | 'r' | 's',
  isDark: boolean,
): number {
  const pal = isDark ? PALETTE_NIGHT[typology] : PALETTE_DAY[typology];
  const idx = Math.abs(Math.imul(id ^ 0x5bd1e995, 2654435761)) % pal.length;
  return pal[idx]!;
}

export class FacadeMaterialLibrary {
  private sets: Record<FacadeMaterialKey, FacadePbrSet>;
  readonly materials: {
    office: THREE.MeshStandardMaterial;
    commercial: THREE.MeshStandardMaterial;
    residential: THREE.MeshStandardMaterial;
    station: THREE.MeshStandardMaterial;
    brick: THREE.MeshStandardMaterial;
    roof: THREE.MeshStandardMaterial;
    instanced: THREE.MeshStandardMaterial;
    towerOrange: THREE.MeshStandardMaterial;
    towerWhite: THREE.MeshStandardMaterial;
    landmarkGlass: THREE.MeshStandardMaterial;
  };
  private isDark: boolean;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[]) {
    this.isDark = isDark;
    this.sets = this.buildAllSets(isDark);

    const baseOpaque = (opts: THREE.MeshStandardMaterialParameters) =>
      new THREE.MeshStandardMaterial({
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        clippingPlanes: clipPlanes,
        ...opts,
      });

    this.materials = {
      office: baseOpaque({
        map: this.sets.officeGlass.map,
        roughnessMap: this.sets.officeGlass.roughnessMap,
        bumpMap: this.sets.officeGlass.bumpMap,
        bumpScale: 0.45,
        emissiveMap: this.sets.officeGlass.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffe4b8 : 0x000000),
        emissiveIntensity: isDark ? 0.58 : 0.0,
        roughness: 0.72,
        metalness: 0.34,
        envMapIntensity: isDark ? 0.8 : 1.15,
        vertexColors: true,
      }),
      commercial: baseOpaque({
        map: this.sets.commercialStone.map,
        roughnessMap: this.sets.commercialStone.roughnessMap,
        bumpMap: this.sets.commercialStone.bumpMap,
        bumpScale: 0.55,
        emissiveMap: this.sets.commercialStone.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffd79e : 0x000000),
        emissiveIntensity: isDark ? 0.42 : 0.0,
        roughness: 0.84,
        metalness: 0.1,
        envMapIntensity: 0.65,
        vertexColors: true,
      }),
      residential: baseOpaque({
        map: this.sets.residentialMansion.map,
        roughnessMap: this.sets.residentialMansion.roughnessMap,
        bumpMap: this.sets.residentialMansion.bumpMap,
        bumpScale: 0.65,
        emissiveMap: this.sets.residentialMansion.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffcf88 : 0x000000),
        emissiveIntensity: isDark ? 0.36 : 0.0,
        roughness: 0.9,
        metalness: 0.04,
        envMapIntensity: 0.4,
        vertexColors: true,
      }),
      station: baseOpaque({
        map: this.sets.stationCivic.map,
        roughnessMap: this.sets.stationCivic.roughnessMap,
        bumpMap: this.sets.stationCivic.bumpMap,
        bumpScale: 0.45,
        emissiveMap: this.sets.stationCivic.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xdbeafe : 0x000000),
        emissiveIntensity: isDark ? 0.45 : 0.0,
        roughness: 0.72,
        metalness: 0.18,
        envMapIntensity: 0.85,
        vertexColors: true,
      }),
      brick: baseOpaque({
        map: this.sets.heritageBrick.map,
        roughnessMap: this.sets.heritageBrick.roughnessMap,
        bumpMap: this.sets.heritageBrick.bumpMap,
        bumpScale: 0.6,
        emissiveMap: this.sets.heritageBrick.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffce85 : 0x000000),
        emissiveIntensity: isDark ? 0.5 : 0.0,
        roughness: 0.82,
        metalness: 0.06,
      }),
      roof: baseOpaque({
        map: this.sets.roofParapet.map,
        roughnessMap: this.sets.roofParapet.roughnessMap,
        bumpMap: this.sets.roofParapet.bumpMap,
        bumpScale: 0.35,
        roughness: 0.92,
        metalness: 0.05,
        vertexColors: true,
      }),
      instanced: baseOpaque({
        map: this.sets.commercialStone.map,
        roughnessMap: this.sets.commercialStone.roughnessMap,
        emissiveMap: this.sets.commercialStone.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffd599 : 0x000000),
        emissiveIntensity: isDark ? 0.28 : 0.0,
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.1,
        envMapIntensity: 0.55,
      }),
      landmarkGlass: baseOpaque({
        map: this.sets.officeGlass.map,
        roughnessMap: this.sets.officeGlass.roughnessMap,
        bumpMap: this.sets.officeGlass.bumpMap,
        bumpScale: 0.4,
        emissiveMap: this.sets.officeGlass.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffe4b8 : 0x000000),
        emissiveIntensity: isDark ? 0.62 : 0.0,
        color: isDark ? 0x9bb5cf : 0xd2e0ee,
        roughness: 0.62,
        metalness: 0.4,
        envMapIntensity: 1.25,
      }),
      towerOrange: baseOpaque({
        color: 0xd94820,
        roughness: 0.48,
        metalness: 0.24,
        emissive: new THREE.Color(isDark ? 0xea580c : 0x000000),
        emissiveIntensity: isDark ? 0.35 : 0.0,
      }),
      towerWhite: baseOpaque({
        color: isDark ? 0xdbe5f0 : 0xf2f4f7,
        roughness: 0.44,
        metalness: 0.22,
        emissive: new THREE.Color(isDark ? 0x93c5fd : 0x000000),
        emissiveIntensity: isDark ? 0.18 : 0.0,
      }),
    };
  }

  private buildAllSets(isDark: boolean): Record<FacadeMaterialKey, FacadePbrSet> {
    return {
      officeGlass: generateOfficeGlassSet(isDark),
      commercialStone: generateCommercialStoneSet(isDark),
      residentialMansion: generateResidentialMansionSet(isDark),
      stationCivic: generateStationCivicSet(isDark),
      heritageBrick: generateHeritageBrickSet(isDark),
      roofParapet: generateRoofParapetSet(isDark),
    };
  }

  private disposeSets(sets: Record<FacadeMaterialKey, FacadePbrSet>): void {
    for (const s of Object.values(sets)) {
      s.map.dispose();
      s.roughnessMap.dispose();
      s.bumpMap.dispose();
      s.emissiveMap?.dispose();
    }
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    const oldSets = this.sets;
    this.sets = this.buildAllSets(isDark);

    const bind = (
      mat: THREE.MeshStandardMaterial,
      set: FacadePbrSet,
      emissiveHex: number,
      emissiveInt: number,
    ) => {
      mat.map = set.map;
      mat.roughnessMap = set.roughnessMap;
      mat.bumpMap = set.bumpMap;
      if (set.emissiveMap) {
        mat.emissiveMap = set.emissiveMap;
        mat.emissive.setHex(isDark ? emissiveHex : 0x000000);
        mat.emissiveIntensity = isDark ? emissiveInt : 0.0;
      }
      mat.needsUpdate = true;
    };

    bind(this.materials.office, this.sets.officeGlass, 0xffe4b8, 0.58);
    bind(this.materials.commercial, this.sets.commercialStone, 0xffd79e, 0.42);
    bind(this.materials.residential, this.sets.residentialMansion, 0xffcf88, 0.36);
    bind(this.materials.station, this.sets.stationCivic, 0xdbeafe, 0.45);
    bind(this.materials.brick, this.sets.heritageBrick, 0xffce85, 0.5);
    bind(this.materials.roof, this.sets.roofParapet, 0x000000, 0.0);
    bind(this.materials.landmarkGlass, this.sets.officeGlass, 0xffe4b8, 0.62);
    this.materials.landmarkGlass.color.setHex(isDark ? 0x9bb5cf : 0xd2e0ee);

    this.materials.instanced.map = this.sets.commercialStone.map;
    this.materials.instanced.roughnessMap = this.sets.commercialStone.roughnessMap;
    this.materials.instanced.emissiveMap = this.sets.commercialStone.emissiveMap;
    this.materials.instanced.emissive.setHex(isDark ? 0xffd599 : 0x000000);
    this.materials.instanced.emissiveIntensity = isDark ? 0.28 : 0.0;
    this.materials.instanced.needsUpdate = true;

    this.materials.towerOrange.emissive.setHex(isDark ? 0xea580c : 0x000000);
    this.materials.towerOrange.emissiveIntensity = isDark ? 0.35 : 0.0;
    this.materials.towerWhite.color.setHex(isDark ? 0xdbe5f0 : 0xf2f4f7);
    this.materials.towerWhite.emissive.setHex(isDark ? 0x93c5fd : 0x000000);
    this.materials.towerWhite.emissiveIntensity = isDark ? 0.18 : 0.0;

    this.disposeSets(oldSets);
  }

  dispose(): void {
    this.disposeSets(this.sets);
    for (const m of Object.values(this.materials)) {
      m.dispose();
    }
  }
}
