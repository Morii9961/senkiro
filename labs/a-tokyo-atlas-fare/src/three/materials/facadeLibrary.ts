/**
 * Reusable Procedural PBR Architectural Facade & Roof Material Library
 * for SENKIRO Atlas v2.
 *
 * Generates zero-external-asset 512x512 CanvasTextures (Albedo + RoughnessMap + BumpMap +
 * Night EmissiveMap) tuned for semi-realistic Japanese urban architecture across 14 distinct
 * material families, eliminating uniform blue-white curtain-wall monotony.
 */

import * as THREE from 'three';
import { injectInstancedFacadeUv } from './cutawayShader.js';

export type FacadeMaterialKey =
  | 'officeGlassCool'
  | 'officeGlassWarm'
  | 'commercialStone'
  | 'commercialMetal'
  | 'commercialTile'
  | 'concreteModern'
  | 'residentialBalcony'
  | 'residentialPlaster'
  | 'groundStorefront'
  | 'stationCivic'
  | 'heritageBrick'
  | 'roofParapet'
  | 'roofPitched'
  | 'roofEquipment'
  | 'foundationPlinth'
  | 'instancedFacade';

export type BuildingFacadeVariant =
  | 'officeGlassCool'
  | 'officeGlassWarm'
  | 'commercialStone'
  | 'commercialMetal'
  | 'commercialTile'
  | 'concreteModern'
  | 'residentialBalcony'
  | 'residentialPlaster'
  | 'stationCivic';

export const BUILDING_FACADE_VARIANTS: readonly BuildingFacadeVariant[] = [
  'officeGlassCool',
  'officeGlassWarm',
  'commercialStone',
  'commercialMetal',
  'commercialTile',
  'concreteModern',
  'residentialBalcony',
  'residentialPlaster',
  'stationCivic',
] as const;

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
  tex.anisotropy = 8;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Deterministic pseudo-random in [0, 1) */
function hash2(x: number, y: number, seed = 1337): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function hashId(id: number, salt = 0): number {
  const mixed = Math.imul((id ^ (salt * 374761393)) | 0, 668265263);
  return ((mixed ^ (mixed >>> 13)) >>> 0) / 4294967296;
}

/**
 * Deterministically selects an architectural facade variant from building id, typology, and height.
 * Breaks uniform curtain-wall repetition while preserving realistic Tokyo urban zoning character.
 */
export function selectFacadeVariant(
  id: number,
  typology: 'o' | 'c' | 'r' | 's',
  height: number,
): BuildingFacadeVariant {
  if (typology === 's') return 'stationCivic';
  const r = hashId(id, 17);

  if (typology === 'o') {
    if (height >= 60) {
      if (r < 0.42) return 'officeGlassCool';
      if (r < 0.75) return 'officeGlassWarm';
      if (r < 0.9) return 'commercialMetal';
      return 'concreteModern';
    }
    if (r < 0.25) return 'officeGlassCool';
    if (r < 0.5) return 'officeGlassWarm';
    if (r < 0.72) return 'commercialStone';
    if (r < 0.88) return 'commercialMetal';
    return 'concreteModern';
  }

  if (typology === 'c') {
    if (r < 0.24) return 'commercialTile';
    if (r < 0.46) return 'commercialMetal';
    if (r < 0.66) return 'commercialStone';
    if (r < 0.82) return 'concreteModern';
    if (r < 0.92) return 'officeGlassWarm';
    return 'officeGlassCool';
  }

  // Residential ('r')
  if (height >= 14) {
    if (r < 0.62) return 'residentialBalcony';
    if (r < 0.82) return 'concreteModern';
    return 'commercialTile';
  }
  if (r < 0.58) return 'residentialPlaster';
  if (r < 0.82) return 'residentialBalcony';
  return 'concreteModern';
}

function generateOfficeGlassSet(isDark: boolean, warm: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Structural aluminum mullions & floor slab spandrels
  a.fillStyle = isDark
    ? warm
      ? '#2f2b29'
      : '#26313e'
    : warm
      ? '#7c7670'
      : '#8a95a2';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#9c9c9c';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#dcdcdc';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floors = 7;
  const bays = 8;
  const floorH = h / floors;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const y1 = Math.round((fy + 1) * floorH);
    const fh = y1 - y0;
    const spandrelH = Math.round(fh * 0.27);

    // Metallic spandrel band with horizontal reveal
    a.fillStyle = isDark
      ? warm
        ? '#252120'
        : '#1e2733'
      : warm
        ? '#68625c'
        : '#768392';
    a.fillRect(0, y0, w, spandrelH);
    r.fillStyle = '#848484';
    r.fillRect(0, y0, w, spandrelH);
    b.fillStyle = '#c4c4c4';
    b.fillRect(0, y0, w, spandrelH);

    // Architectural louver shadow strip on spandrel
    a.fillStyle = 'rgba(0,0,0,0.22)';
    a.fillRect(0, y0 + spandrelH - 3, w, 3);

    const floorLit = hash2(0, fy, warm ? 79 : 47) > 0.36;

    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, warm ? 31 : 11);
      const blindRnd = hash2(bx + 13, fy + 7, warm ? 97 : 53);

      // Glass tint variation per bay (slate/teal vs warm bronze/olive)
      let glassTone: string;
      if (warm) {
        glassTone = isDark
          ? rnd > 0.55
            ? '#332f2c'
            : '#252322'
          : rnd > 0.65
            ? '#6c685e'
            : rnd > 0.3
              ? '#5d5b54'
              : '#4e504c';
      } else {
        glassTone = isDark
          ? rnd > 0.6
            ? '#24384c'
            : '#1c2b3b'
          : rnd > 0.65
            ? '#5c758d'
            : rnd > 0.3
              ? '#4f6880'
              : '#445b72';
      }

      const gx = x0 + 3;
      const gy = y0 + spandrelH + 2;
      const gw = bw - 6;
      const gh = fh - spandrelH - 4;

      a.fillStyle = glassTone;
      a.fillRect(gx, gy, gw, gh);

      // Subtle interior floor slab + blind occlusion inside glass
      if (blindRnd > 0.52) {
        const blindH = Math.round(gh * (0.28 + blindRnd * 0.35));
        a.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(220,224,228,0.24)';
        a.fillRect(gx, gy, gw, blindH);
      }

      // Richer architectural sky-reflection sheen & interior depth gradient
      const skyGrad = a.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh);
      if (isDark) {
        skyGrad.addColorStop(0, 'rgba(175,215,250,0.11)');
        skyGrad.addColorStop(0.55, 'rgba(120,165,210,0.03)');
        skyGrad.addColorStop(1, 'rgba(10,16,24,0.18)');
      } else {
        skyGrad.addColorStop(0, warm ? 'rgba(255,248,236,0.24)' : 'rgba(226,242,255,0.28)');
        skyGrad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
        skyGrad.addColorStop(1, 'rgba(22,32,44,0.14)');
      }
      a.fillStyle = skyGrad;
      a.fillRect(gx, gy, gw, gh);

      // Crisp diagonal sky reflection highlight
      a.fillStyle = isDark ? 'rgba(185,220,255,0.08)' : 'rgba(255,255,255,0.17)';
      a.beginPath();
      a.moveTo(gx, gy);
      a.lineTo(gx + gw * 0.65, gy);
      a.lineTo(gx + gw * 0.2, gy + gh);
      a.lineTo(gx, gy + gh);
      a.closePath();
      a.fill();

      // Subtle mullion shadow reveal under spandrel
      a.fillStyle = 'rgba(8,14,22,0.24)';
      a.fillRect(gx, gy, gw, 3);

      // Glossy glass roughness (~0.12) & deeply recessed bump
      r.fillStyle = '#1f1f1f';
      r.fillRect(gx, gy, gw, gh);
      b.fillStyle = '#323232';
      b.fillRect(gx, gy, gw, gh);

      // Clustered realistic office lighting at night
      if (floorLit && rnd > 0.3) {
        e.fillStyle =
          rnd > 0.78 ? (warm ? '#ffd89b' : '#ffe3b3') : warm ? '#ffecc7' : '#d7e9ff';
        e.fillRect(gx + 2, gy + 2, gw - 4, gh - 4);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.035, 0.035, true),
    roughnessMap: finalizeTexture(cRgh, 0.035, 0.035, false),
    bumpMap: finalizeTexture(cBmp, 0.035, 0.035, false),
    emissiveMap: finalizeTexture(cEmi, 0.035, 0.035, true),
  };
}

function generateCommercialStoneSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  a.fillStyle = isDark ? '#3a404a' : '#d3cec4';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#d4d4d4';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#cfcfcf';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floors = 7;
  const bays = 6;
  const floorH = h / floors;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const y1 = Math.round((fy + 1) * floorH);
    const fh = y1 - y0;

    // Precast stone slab joint & cornice shadow
    a.fillStyle = isDark ? '#2a3038' : '#b7b1a6';
    a.fillRect(0, y0, w, 4);
    b.fillStyle = '#ececec';
    b.fillRect(0, y0, w, 4);

    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, 23);

      // Subtle limestone panel block tone variance
      a.fillStyle = isDark
        ? rnd > 0.5
          ? 'rgba(72,82,96,0.22)'
          : 'rgba(30,36,44,0.18)'
        : rnd > 0.5
          ? 'rgba(244,240,232,0.26)'
          : 'rgba(170,165,155,0.16)';
      a.fillRect(x0 + 1, y0 + 5, bw - 2, fh - 6);

      // Deeply recessed architectural punch window
      const wx = x0 + 10;
      const wy = y0 + Math.round(fh * 0.28);
      const ww = bw - 20;
      const wh = Math.round(fh * 0.5);

      a.fillStyle = isDark ? '#1e2835' : rnd > 0.55 ? '#4c5968' : '#3e4b59';
      a.fillRect(wx, wy, ww, wh);
      // Deep stone lintel shadow
      a.fillStyle = 'rgba(12,16,22,0.34)';
      a.fillRect(wx, wy, ww, 5);
      // Vertical steel mullion
      a.fillStyle = isDark ? '#404854' : '#9aa0a6';
      a.fillRect(wx + Math.floor(ww * 0.5) - 1, wy, 3, wh);

      r.fillStyle = '#363636';
      r.fillRect(wx, wy, ww, wh);
      b.fillStyle = '#383838';
      b.fillRect(wx, wy, ww, wh);

      if (rnd > 0.52) {
        e.fillStyle = rnd > 0.8 ? '#ffe2b0' : '#ffcf86';
        e.fillRect(wx + 2, wy + 4, ww - 4, wh - 6);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.038, 0.038, true),
    roughnessMap: finalizeTexture(cRgh, 0.038, 0.038, false),
    bumpMap: finalizeTexture(cBmp, 0.038, 0.038, false),
    emissiveMap: finalizeTexture(cEmi, 0.038, 0.038, true),
  };
}

function generateCommercialMetalSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Brushed gunmetal / anodized aluminum cladding (common in Shibuya mid-rise retail/office)
  a.fillStyle = isDark ? '#2a3038' : '#8c929a';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#787878'; // semi-metallic brushed panel ~0.47
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#c0c0c0';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  // Fine vertical corrugated metallic ribs
  for (let x = 0; x < w; x += 8) {
    a.fillStyle = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.12)';
    a.fillRect(x, 0, 2, h);
    a.fillStyle = isDark ? 'rgba(0,0,0,0.2)' : 'rgba(25,30,36,0.12)';
    a.fillRect(x + 4, 0, 2, h);
    b.fillStyle = '#d6d6d6';
    b.fillRect(x, 0, 3, h);
  }

  const floors = 7;
  const floorH = h / floors;
  const bays = 8;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const fh = Math.round((fy + 1) * floorH) - y0;
    const wy = y0 + Math.round(fh * 0.25);
    const wh = Math.round(fh * 0.52);

    // Continuous dark horizontal ribbon window frame
    a.fillStyle = isDark ? '#1a2029' : '#2e3640';
    a.fillRect(0, wy - 2, w, wh + 4);
    b.fillStyle = '#424242';
    b.fillRect(0, wy, w, wh);
    r.fillStyle = '#2e2e2e';
    r.fillRect(0, wy, w, wh);

    const floorLit = hash2(3, fy, 117) > 0.35;
    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, 131);

      a.fillStyle = isDark
        ? '#1d2734'
        : rnd > 0.5
          ? '#3b4856'
          : '#323e4b';
      a.fillRect(x0 + 2, wy + 2, bw - 4, wh - 4);

      if (floorLit && rnd > 0.32) {
        e.fillStyle = rnd > 0.72 ? '#ffdba6' : '#e0edff';
        e.fillRect(x0 + 4, wy + 4, bw - 8, wh - 8);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.038, 0.038, true),
    roughnessMap: finalizeTexture(cRgh, 0.038, 0.038, false),
    bumpMap: finalizeTexture(cBmp, 0.038, 0.038, false),
    emissiveMap: finalizeTexture(cEmi, 0.038, 0.038, true),
  };
}

function generateCommercialTileSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Warm Japanese ceramic tile (45-ni-choume exterior tile: warm ochre/taupe)
  a.fillStyle = isDark ? '#3d332d' : '#c6b199';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#c8c8c8'; // slight ceramic glaze ~0.78
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#c6c6c6';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  // Subtle horizontal & vertical ceramic tile courses
  for (let ty = 0; ty < h; ty += 12) {
    a.fillStyle = isDark ? 'rgba(20,14,10,0.22)' : 'rgba(90,72,56,0.12)';
    a.fillRect(0, ty, w, 1);
    b.fillStyle = '#9c9c9c';
    b.fillRect(0, ty, w, 1);
  }
  for (let tx = 0; tx < w; tx += 24) {
    a.fillStyle = isDark ? 'rgba(20,14,10,0.16)' : 'rgba(90,72,56,0.08)';
    a.fillRect(tx, 0, 1, h);
  }

  const floors = 7;
  const bays = 7;
  const floorH = h / floors;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const fh = Math.round((fy + 1) * floorH) - y0;

    // Expansion joint band
    a.fillStyle = isDark ? '#2a231e' : '#a8947d';
    a.fillRect(0, y0, w, 3);

    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, 173);

      const wx = x0 + 9;
      const wy = y0 + Math.round(fh * 0.24);
      const ww = bw - 18;
      const wh = Math.round(fh * 0.48);

      // Dark aluminum sash window
      a.fillStyle = isDark ? '#1c232d' : '#3a4652';
      a.fillRect(wx, wy, ww, wh);
      a.fillStyle = isDark ? '#323a45' : '#858d94';
      a.fillRect(wx + Math.floor(ww * 0.5) - 1, wy, 2, wh);
      // Top reveal shadow
      a.fillStyle = 'rgba(0,0,0,0.28)';
      a.fillRect(wx, wy, ww, 4);

      r.fillStyle = '#363636';
      r.fillRect(wx, wy, ww, wh);
      b.fillStyle = '#3c3c3c';
      b.fillRect(wx, wy, ww, wh);

      // Small mechanical AC louver below every 3rd bay
      if ((bx + fy) % 3 === 0) {
        a.fillStyle = isDark ? '#2a2f36' : '#7b7872';
        a.fillRect(wx + 4, wy + wh + 5, ww - 8, 6);
      }

      if (rnd > 0.5) {
        e.fillStyle = rnd > 0.78 ? '#ffd38e' : '#ffe4b5';
        e.fillRect(wx + 2, wy + 3, ww - 4, wh - 5);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.038, 0.038, true),
    roughnessMap: finalizeTexture(cRgh, 0.038, 0.038, false),
    bumpMap: finalizeTexture(cBmp, 0.038, 0.038, false),
    emissiveMap: finalizeTexture(cEmi, 0.038, 0.038, true),
  };
}

function generateConcreteModernSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Japanese architectural fair-faced concrete (uchippanashi)
  a.fillStyle = isDark ? '#363b42' : '#b7b9bc';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#dedede';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#c4c4c4';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  // Formwork panel grid & subtle tie-cone holes
  const panW = 64;
  const panH = 36;
  for (let py = 0; py < h; py += panH) {
    for (let px = 0; px < w; px += panW) {
      const rnd = hash2(px, py, 211);
      a.fillStyle = isDark
        ? rnd > 0.5
          ? 'rgba(255,255,255,0.025)'
          : 'rgba(0,0,0,0.08)'
        : rnd > 0.5
          ? 'rgba(255,255,255,0.08)'
          : 'rgba(40,45,50,0.06)';
      a.fillRect(px + 1, py + 1, panW - 2, panH - 2);

      // Tie-cone pin dots
      a.fillStyle = isDark ? 'rgba(15,20,28,0.45)' : 'rgba(80,84,90,0.34)';
      a.fillRect(px + 12, py + 10, 3, 3);
      a.fillRect(px + panW - 15, py + 10, 3, 3);
      a.fillRect(px + 12, py + panH - 13, 3, 3);
      a.fillRect(px + panW - 15, py + panH - 13, 3, 3);
    }
  }

  const floors = 7;
  const floorH = h / floors;
  const bays = 8;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const fh = Math.round((fy + 1) * floorH) - y0;
    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, 251);
      // Skip occasional bay for authentic asymmetric concrete facade rhythm
      if (rnd < 0.16) continue;

      const wx = x0 + 12;
      const wy = y0 + Math.round(fh * 0.16);
      const ww = bw - 24;
      const wh = Math.round(fh * 0.64);

      a.fillStyle = isDark ? '#1b222c' : '#35404b';
      a.fillRect(wx, wy, ww, wh);
      r.fillStyle = '#303030';
      r.fillRect(wx, wy, ww, wh);
      b.fillStyle = '#383838';
      b.fillRect(wx, wy, ww, wh);

      if (rnd > 0.56) {
        e.fillStyle = '#ffd99e';
        e.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
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

function generateResidentialMansionSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Japanese RC mansion warm ceramic/stucco walls
  a.fillStyle = isDark ? '#353a44' : '#ddd7cd';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#dedede';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#c8c8c8';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floors = 8; // ~2.85m per story at repeat 0.044
  const units = 4;
  const floorH = h / floors;
  const unitW = w / units;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const fh = Math.round((fy + 1) * floorH) - y0;
    const recessH = Math.round(fh * 0.42);
    const railH = Math.round(fh * 0.34);

    // Recessed balcony soffit shadow
    a.fillStyle = isDark ? '#1a2029' : '#7b8088';
    a.fillRect(0, y0 + 6, w, recessH);
    b.fillStyle = '#363636';
    b.fillRect(0, y0 + 6, w, recessH);

    // Balcony concrete parapet / frosted glass rail
    a.fillStyle = isDark ? '#434c59' : '#cfc9be';
    a.fillRect(0, y0 + 6 + recessH, w, railH);
    b.fillStyle = '#ebebeb';
    b.fillRect(0, y0 + 6 + recessH, w, railH);

    // Metal handrail cap
    a.fillStyle = isDark ? '#5c6674' : '#9ba0a7';
    a.fillRect(0, y0 + 5 + recessH, w, 3);

    for (let ux = 0; ux < units; ux++) {
      const x0 = Math.round(ux * unitW);
      const uw = Math.round((ux + 1) * unitW) - x0;
      const rnd = hash2(ux, fy, 91);

      // Party-wall divider column between units
      a.fillStyle = isDark ? '#3c434f' : '#d5cfc5';
      a.fillRect(x0, y0, 12, fh);
      b.fillStyle = '#f2f2f2';
      b.fillRect(x0, y0, 12, fh);

      // Frosted balcony glass panel insert
      a.fillStyle = isDark ? '#2f3d4d' : '#96a5b4';
      a.fillRect(x0 + 22, y0 + 9 + recessH, uw - 34, railH - 6);
      r.fillStyle = '#686868';
      r.fillRect(x0 + 22, y0 + 9 + recessH, uw - 34, railH - 6);

      // Sliding terrace glass window behind balcony
      a.fillStyle = isDark ? '#202b38' : '#4f5d6c';
      a.fillRect(x0 + 18, y0 + 8, uw - 28, recessH - 4);
      r.fillStyle = '#3c3c3c';
      r.fillRect(x0 + 18, y0 + 8, uw - 28, recessH - 4);

      if (rnd > 0.64) {
        e.fillStyle = '#ffd596';
        e.fillRect(x0 + 22, y0 + 10, uw - 36, recessH - 8);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.044, 0.044, true),
    roughnessMap: finalizeTexture(cRgh, 0.044, 0.044, false),
    bumpMap: finalizeTexture(cBmp, 0.044, 0.044, false),
    emissiveMap: finalizeTexture(cEmi, 0.044, 0.044, true),
  };
}

function generateResidentialPlasterSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Japanese low-rise residential warm stucco/siding
  a.fillStyle = isDark ? '#32353c' : '#dcd6cb';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#ebebeb';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#c8c8c8';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  // Fine horizontal siding lines
  for (let y = 0; y < h; y += 8) {
    a.fillStyle = isDark ? 'rgba(0,0,0,0.12)' : 'rgba(90,84,76,0.06)';
    a.fillRect(0, y, w, 1);
  }

  const floors = 7;
  const floorH = h / floors;
  const bays = 6;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const fh = Math.round((fy + 1) * floorH) - y0;

    // Eave shadow band
    a.fillStyle = isDark ? 'rgba(0,0,0,0.25)' : 'rgba(65,60,54,0.14)';
    a.fillRect(0, y0, w, 5);

    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, 307);
      if (rnd < 0.22) continue;

      const narrow = rnd > 0.72;
      const wx = x0 + (narrow ? 24 : 14);
      const wy = y0 + Math.round(fh * 0.24);
      const ww = bw - (narrow ? 48 : 28);
      const wh = Math.round(fh * 0.48);

      a.fillStyle = isDark ? '#1e242d' : '#3a4450';
      a.fillRect(wx, wy, ww, wh);
      a.fillStyle = isDark ? '#4a505a' : '#bab4aa';
      a.fillRect(wx - 2, wy - 2, ww + 4, 2);
      a.fillRect(wx - 2, wy + wh, ww + 4, 3);

      r.fillStyle = '#404040';
      r.fillRect(wx, wy, ww, wh);
      b.fillStyle = '#424242';
      b.fillRect(wx, wy, ww, wh);

      if (rnd > 0.62) {
        e.fillStyle = '#ffd59a';
        e.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.05, 0.05, true),
    roughnessMap: finalizeTexture(cRgh, 0.05, 0.05, false),
    bumpMap: finalizeTexture(cBmp, 0.05, 0.05, false),
    emissiveMap: finalizeTexture(cEmi, 0.05, 0.05, true),
  };
}

/**
 * Dedicated street-level retail/lobby storefront plinth (y = 0 .. ~4.5m).
 * v=0 sits at bottom of canvas (sidewalk threshold) and v=1 sits at top (canopy fascia).
 */
function generateGroundStorefrontSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Dark granite / architectural steel pilasters & street-level frame
  a.fillStyle = isDark ? '#1b2028' : '#3e434a';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#707070';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#d4d4d4';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  // Top canopy fascia / cornice transition (top of canvas = top of ground story)
  a.fillStyle = isDark ? '#2a313c' : '#575d66';
  a.fillRect(0, 0, w, 72);
  a.fillStyle = isDark ? '#10141a' : '#25292e';
  a.fillRect(0, 68, w, 12);
  b.fillStyle = '#f0f0f0';
  b.fillRect(0, 0, w, 72);

  // Bottom granite sidewalk threshold kickplate (bottom of canvas = y = 0m)
  a.fillStyle = isDark ? '#161a21' : '#31353b';
  a.fillRect(0, h - 54, w, 54);
  b.fillStyle = '#e0e0e0';
  b.fillRect(0, h - 54, w, 54);

  const bays = 4;
  const bayW = w / bays;
  for (let bx = 0; bx < bays; bx++) {
    const x0 = Math.round(bx * bayW);
    const bw = Math.round((bx + 1) * bayW) - x0;
    const rnd = hash2(bx, 1, 419);

    const gx = x0 + 14;
    const gy = 86;
    const gw = bw - 28;
    const gh = h - 54 - gy;

    // Large street-facing retail vitrine glass with warm depth
    const grad = a.createLinearGradient(0, gy, 0, gy + gh);
    if (isDark) {
      grad.addColorStop(0, '#362d22');
      grad.addColorStop(0.6, '#5c4932');
      grad.addColorStop(1, '#26211c');
    } else {
      grad.addColorStop(0, '#2e3842');
      grad.addColorStop(0.55, '#4c5762');
      grad.addColorStop(1, '#3b4046');
    }
    a.fillStyle = grad;
    a.fillRect(gx, gy, gw, gh);

    // Subtle interior storefront shelving / warm display accents
    a.fillStyle = isDark ? 'rgba(255,214,150,0.16)' : 'rgba(255,228,185,0.16)';
    a.fillRect(gx + 10, gy + Math.round(gh * 0.42), gw - 20, Math.round(gh * 0.35));

    // Glass mullion & entrance door frame on 2nd bay
    a.fillStyle = isDark ? '#1c222a' : '#2a2f35';
    a.fillRect(gx + Math.floor(gw * 0.5) - 2, gy, 4, gh);
    if (bx === 1) {
      a.strokeStyle = isDark ? '#8e96a0' : '#c6cbd0';
      a.lineWidth = 3;
      a.strokeRect(gx + 8, gy + 44, Math.floor(gw * 0.44), gh - 46);
    }

    // Glossy shopfront glass
    r.fillStyle = '#222222';
    r.fillRect(gx, gy, gw, gh);
    b.fillStyle = '#343434';
    b.fillRect(gx, gy, gw, gh);

    // Subtle signage plaque above vitrine
    if (rnd > 0.28) {
      a.fillStyle = isDark ? '#4a5568' : '#b8bec6';
      a.fillRect(gx + 12, 26, gw - 24, 24);
      if (isDark) {
        e.fillStyle = rnd > 0.65 ? '#ffdfab' : '#cfe5ff';
        e.fillRect(gx + 14, 28, gw - 28, 20);
      }
    }

    // Warm street-level retail glow at night
    e.fillStyle = rnd > 0.5 ? '#ffd699' : '#ffe4b8';
    e.fillRect(gx + 4, gy + 8, gw - 8, gh - 12);
  }

  return {
    map: finalizeTexture(cAlb, 0.065, 0.21, true),
    roughnessMap: finalizeTexture(cRgh, 0.065, 0.21, false),
    bumpMap: finalizeTexture(cBmp, 0.065, 0.21, false),
    emissiveMap: finalizeTexture(cEmi, 0.065, 0.21, true),
  };
}

function generateStationCivicSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 256;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  a.fillStyle = isDark ? '#384352' : '#d2d7dd';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#b4b4b4';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#cccccc';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 64) {
    a.fillStyle = isDark ? '#24374a' : '#6f879d';
    a.fillRect(0, y + 14, w, 34);
    r.fillStyle = '#303030';
    r.fillRect(0, y + 14, w, 34);
    b.fillStyle = '#484848';
    b.fillRect(0, y + 14, w, 34);

    for (let x = 0; x < w; x += 16) {
      a.fillStyle = isDark ? '#465465' : '#c8ced5';
      a.fillRect(x, y, 4, 64);
      b.fillStyle = '#f0f0f0';
      b.fillRect(x, y, 4, 64);
    }

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

  a.fillStyle = isDark ? '#6c3427' : '#a44d39';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#d6d6d6';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#b4b4b4';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

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

  for (let y = 14; y < h; y += 64) {
    a.fillStyle = isDark ? '#8e7c6a' : '#dfd2bf';
    a.fillRect(0, y, w, 6);
    b.fillStyle = '#f2f2f2';
    b.fillRect(0, y, w, 6);

    for (let x = 12; x < w; x += 36) {
      a.fillStyle = isDark ? '#26303d' : '#435163';
      a.fillRect(x, y + 12, 18, 36);
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

  a.fillStyle = isDark ? '#29303b' : '#b7bbc0';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#e6e6e6';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);

  a.strokeStyle = isDark ? 'rgba(15,23,42,0.4)' : 'rgba(78,84,92,0.22)';
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

function generateRoofPitchedSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 256;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);

  // Japanese slate / kawara roof tiles
  a.fillStyle = isDark ? '#1e242c' : '#4a5159';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#bcbcbc';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#909090';
  b.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 16) {
    a.fillStyle = isDark ? 'rgba(0,0,0,0.34)' : 'rgba(18,22,28,0.28)';
    a.fillRect(0, y, w, 3);
    b.fillStyle = '#505050';
    b.fillRect(0, y, w, 3);
    for (let x = 0; x < w; x += 24) {
      const rnd = hash2(x, y, 509);
      a.fillStyle = rnd > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      a.fillRect(x + ((y / 16) % 2) * 12, y + 3, 22, 12);
    }
  }

  return {
    map: finalizeTexture(cAlb, 0.14, 0.14, true),
    roughnessMap: finalizeTexture(cRgh, 0.14, 0.14, false),
    bumpMap: finalizeTexture(cBmp, 0.14, 0.14, false),
    emissiveMap: null,
  };
}

function generateRoofEquipmentSet(isDark: boolean): FacadePbrSet {
  const w = 256;
  const h = 256;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);

  // Louvered galvanized HVAC penthouse & chiller casing
  a.fillStyle = isDark ? '#3a424d' : '#9aa1a8';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#969696';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#a4a4a4';
  b.fillRect(0, 0, w, h);

  for (let y = 24; y < h - 24; y += 10) {
    a.fillStyle = isDark ? '#1e242c' : '#585f66';
    a.fillRect(20, y, w - 40, 4);
    b.fillStyle = '#484848';
    b.fillRect(20, y, w - 40, 4);
  }
  a.strokeStyle = isDark ? '#545e6b' : '#7a8088';
  a.lineWidth = 3;
  a.strokeRect(4, 4, w - 8, h - 8);

  return {
    map: finalizeTexture(cAlb, 0.12, 0.12, true),
    roughnessMap: finalizeTexture(cRgh, 0.12, 0.12, false),
    bumpMap: finalizeTexture(cBmp, 0.12, 0.12, false),
    emissiveMap: null,
  };
}

function generateFoundationPlinthSet(isDark: boolean): FacadePbrSet {
  const w = 128;
  const h = 128;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);

  a.fillStyle = isDark ? '#1a2028' : '#5e5b55';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#dcdcdc';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#a0a0a0';
  b.fillRect(0, 0, w, h);

  for (let x = 0; x < w; x += 32) {
    a.fillStyle = isDark ? 'rgba(0,0,0,0.28)' : 'rgba(20,20,20,0.18)';
    a.fillRect(x, 0, 2, h);
  }

  return {
    map: finalizeTexture(cAlb, 0.1, 0.4, true),
    roughnessMap: finalizeTexture(cRgh, 0.1, 0.4, false),
    bumpMap: finalizeTexture(cBmp, 0.1, 0.4, false),
    emissiveMap: null,
  };
}

/**
 * Dedicated high-contrast architectural LOD1 instanced facade texture (repeat = 1, 1).
 * Paired with `injectInstancedFacadeUv`, which computes true world-meter wall UVs from
 * `instanceMatrix` scale so distant buildings remain richly detailed instead of flat white boxes.
 */
function generateInstancedFacadeSet(isDark: boolean): FacadePbrSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  // Crisp precast architectural masonry / aluminum mullion grid base
  a.fillStyle = isDark ? '#323a46' : '#c6c2b9';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#c8c8c8';
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#d6d6d6';
  b.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const floors = 7;
  const bays = 8;
  const floorH = h / floors;
  const bayW = w / bays;

  for (let fy = 0; fy < floors; fy++) {
    const y0 = Math.round(fy * floorH);
    const y1 = Math.round((fy + 1) * floorH);
    const fh = y1 - y0;
    const spandrelH = Math.round(fh * 0.28);

    // Distinct architectural floor slab band & shadow reveal
    a.fillStyle = isDark ? '#242b36' : '#a8a49b';
    a.fillRect(0, y0, w, spandrelH);
    a.fillStyle = 'rgba(12,16,22,0.28)';
    a.fillRect(0, y0 + spandrelH - 3, w, 3);
    b.fillStyle = '#e8e8e8';
    b.fillRect(0, y0, w, spandrelH);

    const floorLit = hash2(2, fy, 613) > 0.34;

    for (let bx = 0; bx < bays; bx++) {
      const x0 = Math.round(bx * bayW);
      const bw = Math.round((bx + 1) * bayW) - x0;
      const rnd = hash2(bx, fy, 641);
      const blindRnd = hash2(bx + 19, fy + 11, 709);

      // Vertical architectural pilaster highlight
      a.fillStyle = isDark ? '#3c4553' : '#d2cec6';
      a.fillRect(x0, y0 + spandrelH, 4, fh - spandrelH);
      b.fillStyle = '#f0f0f0';
      b.fillRect(x0, y0 + spandrelH, 4, fh - spandrelH);

      const gx = x0 + 6;
      const gy = y0 + spandrelH + 3;
      const gw = bw - 10;
      const gh = fh - spandrelH - 6;

      // High-contrast recessed dark architectural glazing (clearly reads from 5km+!)
      a.fillStyle = isDark
        ? rnd > 0.55
          ? '#1a2838'
          : '#14202d'
        : rnd > 0.65
          ? '#425568'
          : rnd > 0.3
            ? '#374859'
            : '#2e3e4d';
      a.fillRect(gx, gy, gw, gh);

      // Interior blinds & diagonal sky reflection sheen
      if (blindRnd > 0.58) {
        a.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(218,224,230,0.22)';
        a.fillRect(gx, gy, gw, Math.round(gh * 0.38));
      }
      a.fillStyle = isDark ? 'rgba(170,210,250,0.08)' : 'rgba(235,246,255,0.18)';
      a.beginPath();
      a.moveTo(gx, gy);
      a.lineTo(gx + gw * 0.64, gy);
      a.lineTo(gx + gw * 0.16, gy + gh);
      a.lineTo(gx, gy + gh);
      a.closePath();
      a.fill();

      // Deep lintel reveal shadow + center mullion bar
      a.fillStyle = 'rgba(8,12,18,0.34)';
      a.fillRect(gx, gy, gw, 4);
      a.fillStyle = isDark ? '#3a4350' : '#8b9199';
      a.fillRect(gx + Math.floor(gw * 0.5) - 1, gy, 2, gh);

      // Glossy glass roughness & crisp recessed bump
      r.fillStyle = '#242424';
      r.fillRect(gx, gy, gw, gh);
      b.fillStyle = '#363636';
      b.fillRect(gx, gy, gw, gh);

      // Crisp clustered Tokyo night window lights (warm amber & cool office whites)
      if (floorLit && rnd > 0.32) {
        e.fillStyle =
          rnd > 0.76 ? '#ffd28a' : rnd > 0.5 ? '#ffe7bc' : '#d6ebff';
        e.fillRect(gx + 2, gy + 3, gw - 4, gh - 5);
      }
    }
  }

  return {
    map: finalizeTexture(cAlb, 1, 1, true),
    roughnessMap: finalizeTexture(cRgh, 1, 1, false),
    bumpMap: finalizeTexture(cBmp, 1, 1, false),
    emissiveMap: finalizeTexture(cEmi, 1, 1, true),
  };
}

/**
 * Legacy helper retained for backward compatibility; prefer surfaceTextures.createUrbanParcelTextureSet.
 */
export function createUrbanGroundTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = isDark ? '#131a24' : '#d2cec6';
  ctx.fillRect(0, 0, size, size);
  return finalizeTexture(canvas, 140, 140, true);
}

/**
 * Natural low-saturation botanical canopy stipple texture for Tokyo parks.
 */
export function createParkCanopyTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = isDark ? '#1b3325' : '#89a87f';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    const cx = hash2(i, 1, 88) * size;
    const cy = hash2(i, 2, 88) * size;
    const rad = 5 + hash2(i, 3, 88) * 12;
    const tone = hash2(i, 4, 88);
    ctx.fillStyle = isDark
      ? tone > 0.5
        ? 'rgba(38,76,52,0.48)'
        : 'rgba(16,34,24,0.48)'
      : tone > 0.65
        ? 'rgba(112,148,101,0.45)'
        : tone > 0.3
          ? 'rgba(98,132,90,0.38)'
          : 'rgba(154,178,136,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(canvas, 0.014, 0.014, true);
}

const PALETTE_DAY: Record<'o' | 'c' | 'r' | 's', number[]> = {
  o: [0xdce5ee, 0xd4dde6, 0xe4e7ea, 0xced7e0, 0xe8e3da, 0xd8dcd6, 0xdfe4e8, 0xe6e1d7, 0xd5dce3, 0xe2e5e8],
  c: [0xefeae1, 0xe7dfd3, 0xdde2e6, 0xeadfd1, 0xd8d5ce, 0xe5e6e9, 0xebe3d5, 0xded9cf, 0xe3dfd8, 0xd6dce2],
  r: [0xf1ece4, 0xe9e1d4, 0xe2ddd4, 0xede6da, 0xded9d0, 0xe8e4dc, 0xebe0d2, 0xdad6ce, 0xe5e0d6, 0xefe9de],
  s: [0xe6eaef, 0xdde3ea, 0xeceee9, 0xe1e5ea],
};

const PALETTE_NIGHT: Record<'o' | 'c' | 'r' | 's', number[]> = {
  o: [0xa6b8ca, 0x95a9bf, 0xb2c0d0, 0x8fa1b4, 0xa8a49c, 0x9ca5af],
  c: [0xadb2ba, 0xa2a7b0, 0xb4afa6, 0x9aa0aa, 0xa8a096, 0x9fa6ae],
  r: [0xa4a9b2, 0x9c9fa8, 0xaba59d, 0x959aa3, 0xa6a198, 0x989da5],
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
    officeGlassCool: THREE.MeshStandardMaterial;
    officeGlassWarm: THREE.MeshStandardMaterial;
    commercialStone: THREE.MeshStandardMaterial;
    commercialMetal: THREE.MeshStandardMaterial;
    commercialTile: THREE.MeshStandardMaterial;
    concreteModern: THREE.MeshStandardMaterial;
    residentialBalcony: THREE.MeshStandardMaterial;
    residentialPlaster: THREE.MeshStandardMaterial;
    groundStorefront: THREE.MeshStandardMaterial;
    stationCivic: THREE.MeshStandardMaterial;
    brick: THREE.MeshStandardMaterial;
    roof: THREE.MeshStandardMaterial;
    roofPitched: THREE.MeshStandardMaterial;
    roofEquipment: THREE.MeshStandardMaterial;
    foundationPlinth: THREE.MeshStandardMaterial;
    instanced: THREE.MeshStandardMaterial;
    towerOrange: THREE.MeshStandardMaterial;
    towerWhite: THREE.MeshStandardMaterial;
    landmarkGlass: THREE.MeshStandardMaterial;
  };
  private isDark: boolean;
  private nightFactor: number;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[]) {
    this.isDark = isDark;
    this.nightFactor = isDark ? 1.0 : 0.0;
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
      officeGlassCool: baseOpaque({
        map: this.sets.officeGlassCool.map,
        roughnessMap: this.sets.officeGlassCool.roughnessMap,
        bumpMap: this.sets.officeGlassCool.bumpMap,
        bumpScale: 0.52,
        emissiveMap: this.sets.officeGlassCool.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffe4b8 : 0x000000),
        emissiveIntensity: isDark ? 0.92 : 0.0,
        roughness: 0.54,
        metalness: 0.46,
        envMapIntensity: isDark ? 1.1 : 1.55,
        vertexColors: true,
      }),
      officeGlassWarm: baseOpaque({
        map: this.sets.officeGlassWarm.map,
        roughnessMap: this.sets.officeGlassWarm.roughnessMap,
        bumpMap: this.sets.officeGlassWarm.bumpMap,
        bumpScale: 0.52,
        emissiveMap: this.sets.officeGlassWarm.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffe0ad : 0x000000),
        emissiveIntensity: isDark ? 0.88 : 0.0,
        roughness: 0.52,
        metalness: 0.48,
        envMapIntensity: isDark ? 1.05 : 1.48,
        vertexColors: true,
      }),
      commercialStone: baseOpaque({
        map: this.sets.commercialStone.map,
        roughnessMap: this.sets.commercialStone.roughnessMap,
        bumpMap: this.sets.commercialStone.bumpMap,
        bumpScale: 0.62,
        emissiveMap: this.sets.commercialStone.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffd79e : 0x000000),
        emissiveIntensity: isDark ? 0.68 : 0.0,
        roughness: 0.84,
        metalness: 0.08,
        envMapIntensity: 0.65,
        vertexColors: true,
      }),
      commercialMetal: baseOpaque({
        map: this.sets.commercialMetal.map,
        roughnessMap: this.sets.commercialMetal.roughnessMap,
        bumpMap: this.sets.commercialMetal.bumpMap,
        bumpScale: 0.56,
        emissiveMap: this.sets.commercialMetal.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffdfb0 : 0x000000),
        emissiveIntensity: isDark ? 0.76 : 0.0,
        roughness: 0.56,
        metalness: 0.52,
        envMapIntensity: 1.2,
        vertexColors: true,
      }),
      commercialTile: baseOpaque({
        map: this.sets.commercialTile.map,
        roughnessMap: this.sets.commercialTile.roughnessMap,
        bumpMap: this.sets.commercialTile.bumpMap,
        bumpScale: 0.56,
        emissiveMap: this.sets.commercialTile.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffd79c : 0x000000),
        emissiveIntensity: isDark ? 0.68 : 0.0,
        roughness: 0.76,
        metalness: 0.06,
        envMapIntensity: 0.6,
        vertexColors: true,
      }),
      concreteModern: baseOpaque({
        map: this.sets.concreteModern.map,
        roughnessMap: this.sets.concreteModern.roughnessMap,
        bumpMap: this.sets.concreteModern.bumpMap,
        bumpScale: 0.58,
        emissiveMap: this.sets.concreteModern.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffd9a0 : 0x000000),
        emissiveIntensity: isDark ? 0.62 : 0.0,
        roughness: 0.88,
        metalness: 0.05,
        envMapIntensity: 0.5,
        vertexColors: true,
      }),
      residentialBalcony: baseOpaque({
        map: this.sets.residentialBalcony.map,
        roughnessMap: this.sets.residentialBalcony.roughnessMap,
        bumpMap: this.sets.residentialBalcony.bumpMap,
        bumpScale: 0.7,
        emissiveMap: this.sets.residentialBalcony.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffcf88 : 0x000000),
        emissiveIntensity: isDark ? 0.58 : 0.0,
        roughness: 0.88,
        metalness: 0.04,
        envMapIntensity: 0.45,
        vertexColors: true,
      }),
      residentialPlaster: baseOpaque({
        map: this.sets.residentialPlaster.map,
        roughnessMap: this.sets.residentialPlaster.roughnessMap,
        bumpMap: this.sets.residentialPlaster.bumpMap,
        bumpScale: 0.54,
        emissiveMap: this.sets.residentialPlaster.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffcf88 : 0x000000),
        emissiveIntensity: isDark ? 0.56 : 0.0,
        roughness: 0.9,
        metalness: 0.02,
        envMapIntensity: 0.38,
        vertexColors: true,
      }),
      groundStorefront: baseOpaque({
        map: this.sets.groundStorefront.map,
        roughnessMap: this.sets.groundStorefront.roughnessMap,
        bumpMap: this.sets.groundStorefront.bumpMap,
        bumpScale: 0.54,
        emissiveMap: this.sets.groundStorefront.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffd79b : 0xfff0d6),
        emissiveIntensity: isDark ? 1.05 : 0.06,
        roughness: 0.58,
        metalness: 0.28,
        envMapIntensity: 1.05,
        vertexColors: true,
      }),
      stationCivic: baseOpaque({
        map: this.sets.stationCivic.map,
        roughnessMap: this.sets.stationCivic.roughnessMap,
        bumpMap: this.sets.stationCivic.bumpMap,
        bumpScale: 0.48,
        emissiveMap: this.sets.stationCivic.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xdbeafe : 0x000000),
        emissiveIntensity: isDark ? 0.72 : 0.0,
        roughness: 0.68,
        metalness: 0.22,
        envMapIntensity: 0.95,
        vertexColors: true,
      }),
      brick: baseOpaque({
        map: this.sets.heritageBrick.map,
        roughnessMap: this.sets.heritageBrick.roughnessMap,
        bumpMap: this.sets.heritageBrick.bumpMap,
        bumpScale: 0.64,
        emissiveMap: this.sets.heritageBrick.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffce85 : 0x000000),
        emissiveIntensity: isDark ? 0.74 : 0.0,
        roughness: 0.82,
        metalness: 0.06,
      }),
      roof: baseOpaque({
        map: this.sets.roofParapet.map,
        roughnessMap: this.sets.roofParapet.roughnessMap,
        bumpMap: this.sets.roofParapet.bumpMap,
        bumpScale: 0.38,
        roughness: 0.92,
        metalness: 0.05,
        vertexColors: true,
      }),
      roofPitched: baseOpaque({
        map: this.sets.roofPitched.map,
        roughnessMap: this.sets.roofPitched.roughnessMap,
        bumpMap: this.sets.roofPitched.bumpMap,
        bumpScale: 0.55,
        roughness: 0.82,
        metalness: 0.08,
        vertexColors: true,
      }),
      roofEquipment: baseOpaque({
        map: this.sets.roofEquipment.map,
        roughnessMap: this.sets.roofEquipment.roughnessMap,
        bumpMap: this.sets.roofEquipment.bumpMap,
        bumpScale: 0.45,
        roughness: 0.65,
        metalness: 0.38,
        vertexColors: true,
      }),
      foundationPlinth: baseOpaque({
        map: this.sets.foundationPlinth.map,
        roughnessMap: this.sets.foundationPlinth.roughnessMap,
        bumpMap: this.sets.foundationPlinth.bumpMap,
        bumpScale: 0.35,
        roughness: 0.92,
        metalness: 0.04,
        vertexColors: true,
      }),
      instanced: baseOpaque({
        map: this.sets.instancedFacade.map,
        roughnessMap: this.sets.instancedFacade.roughnessMap,
        bumpMap: this.sets.instancedFacade.bumpMap,
        bumpScale: 0.46,
        emissiveMap: this.sets.instancedFacade.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffdb9e : 0x000000),
        emissiveIntensity: isDark ? 0.72 : 0.0,
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.22,
        envMapIntensity: isDark ? 0.85 : 0.95,
      }),
      landmarkGlass: baseOpaque({
        map: this.sets.officeGlassCool.map,
        roughnessMap: this.sets.officeGlassCool.roughnessMap,
        bumpMap: this.sets.officeGlassCool.bumpMap,
        bumpScale: 0.48,
        emissiveMap: this.sets.officeGlassCool.emissiveMap,
        emissive: new THREE.Color(isDark ? 0xffe4b8 : 0x000000),
        emissiveIntensity: isDark ? 0.96 : 0.0,
        color: isDark ? 0x9bb5cf : 0xc8d8e6,
        roughness: 0.46,
        metalness: 0.52,
        envMapIntensity: isDark ? 1.15 : 1.65,
      }),
      towerOrange: baseOpaque({
        color: 0xd94820,
        roughness: 0.46,
        metalness: 0.26,
        emissive: new THREE.Color(isDark ? 0xf97316 : 0x000000),
        emissiveIntensity: isDark ? 0.62 : 0.0,
      }),
      towerWhite: baseOpaque({
        color: isDark ? 0xdbe5f0 : 0xf2f4f7,
        roughness: 0.42,
        metalness: 0.24,
        emissive: new THREE.Color(isDark ? 0x93c5fd : 0x000000),
        emissiveIntensity: isDark ? 0.32 : 0.0,
      }),
    };

    // Apply per-instance world-meter UV scaling + concrete roof shading to LOD1 instanced buildings
    injectInstancedFacadeUv(this.materials.instanced);
  }

  private buildAllSets(isDark: boolean): Record<FacadeMaterialKey, FacadePbrSet> {
    return {
      officeGlassCool: generateOfficeGlassSet(isDark, false),
      officeGlassWarm: generateOfficeGlassSet(isDark, true),
      commercialStone: generateCommercialStoneSet(isDark),
      commercialMetal: generateCommercialMetalSet(isDark),
      commercialTile: generateCommercialTileSet(isDark),
      concreteModern: generateConcreteModernSet(isDark),
      residentialBalcony: generateResidentialMansionSet(isDark),
      residentialPlaster: generateResidentialPlasterSet(isDark),
      groundStorefront: generateGroundStorefrontSet(isDark),
      stationCivic: generateStationCivicSet(isDark),
      heritageBrick: generateHeritageBrickSet(isDark),
      roofParapet: generateRoofParapetSet(isDark),
      roofPitched: generateRoofPitchedSet(isDark),
      roofEquipment: generateRoofEquipmentSet(isDark),
      foundationPlinth: generateFoundationPlinthSet(isDark),
      instancedFacade: generateInstancedFacadeSet(isDark),
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

  /**
   * Smoothly controls time-of-day interior window illumination & reflection sheen:
   *  - 0.0: bright noon (crisp daylight glass reflections, minimal emissive)
   *  - 0.5: golden hour / twilight warm amber interior glow
   *  - 1.0: full vibrant Tokyo night skyline (warm amber + cool office lights)
   */
  setNightFactor(rawNightFactor: number): void {
    const nf = Math.max(0, Math.min(1, rawNightFactor));
    this.nightFactor = nf;

    // Smooth activation ramp so daylight stays clean while twilight/night lights bloom gracefully
    const t = Math.max(0, Math.min(1, (nf - 0.16) / 0.84));
    const glow = t * t * (3 - 2 * t);
    // Warm amber accent strongest during golden hour / blue hour twilight (nf ~ 0.45..0.65)
    const twilightWarm = Math.sin(nf * Math.PI);

    const setEmissive = (
      mat: THREE.MeshStandardMaterial,
      nightHex: number,
      maxIntensity: number,
      dayFloor = 0,
      dayHex = 0x000000,
    ) => {
      const intensity = dayFloor + (maxIntensity - dayFloor) * glow;
      mat.emissiveIntensity = intensity;
      if (intensity <= 0.002) {
        mat.emissive.setHex(0x000000);
      } else if (glow <= 0.002) {
        mat.emissive.setHex(dayHex);
      } else {
        mat.emissive.setHex(nightHex).lerp(new THREE.Color(0xffb86c), twilightWarm * 0.22);
      }
    };

    const m = this.materials;
    setEmissive(m.officeGlassCool, 0xffe4b8, 0.92);
    setEmissive(m.officeGlassWarm, 0xffe0ad, 0.88);
    setEmissive(m.commercialStone, 0xffd79e, 0.68);
    setEmissive(m.commercialMetal, 0xffdfb0, 0.76);
    setEmissive(m.commercialTile, 0xffd79c, 0.68);
    setEmissive(m.concreteModern, 0xffd9a0, 0.62);
    setEmissive(m.residentialBalcony, 0xffcf88, 0.58);
    setEmissive(m.residentialPlaster, 0xffcf88, 0.56);
    setEmissive(m.groundStorefront, 0xffd79b, 1.05, 0.06, 0xfff0d6);
    setEmissive(m.stationCivic, 0xdbeafe, 0.72);
    setEmissive(m.brick, 0xffce85, 0.74);
    setEmissive(m.instanced, 0xffdb9e, 0.72);
    setEmissive(m.landmarkGlass, 0xffe4b8, 0.96);
    setEmissive(m.towerOrange, 0xf97316, 0.62);
    setEmissive(m.towerWhite, 0x93c5fd, 0.32);

    // Rich daytime sky sheen -> atmospheric twilight/night reflection balance
    m.officeGlassCool.envMapIntensity = 1.55 - nf * 0.45;
    m.officeGlassWarm.envMapIntensity = 1.48 - nf * 0.43;
    m.landmarkGlass.envMapIntensity = 1.65 - nf * 0.5;
    m.instanced.envMapIntensity = 0.95 - nf * 0.1;
  }

  getNightFactor(): number {
    return this.nightFactor;
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    const oldSets = this.sets;
    this.sets = this.buildAllSets(isDark);

    const bind = (mat: THREE.MeshStandardMaterial, set: FacadePbrSet) => {
      mat.map = set.map;
      mat.roughnessMap = set.roughnessMap;
      mat.bumpMap = set.bumpMap;
      if (set.emissiveMap) {
        mat.emissiveMap = set.emissiveMap;
      }
      mat.needsUpdate = true;
    };

    bind(this.materials.officeGlassCool, this.sets.officeGlassCool);
    bind(this.materials.officeGlassWarm, this.sets.officeGlassWarm);
    bind(this.materials.commercialStone, this.sets.commercialStone);
    bind(this.materials.commercialMetal, this.sets.commercialMetal);
    bind(this.materials.commercialTile, this.sets.commercialTile);
    bind(this.materials.concreteModern, this.sets.concreteModern);
    bind(this.materials.residentialBalcony, this.sets.residentialBalcony);
    bind(this.materials.residentialPlaster, this.sets.residentialPlaster);
    bind(this.materials.groundStorefront, this.sets.groundStorefront);
    bind(this.materials.stationCivic, this.sets.stationCivic);
    bind(this.materials.brick, this.sets.heritageBrick);
    bind(this.materials.roof, this.sets.roofParapet);
    bind(this.materials.roofPitched, this.sets.roofPitched);
    bind(this.materials.roofEquipment, this.sets.roofEquipment);
    bind(this.materials.foundationPlinth, this.sets.foundationPlinth);
    bind(this.materials.landmarkGlass, this.sets.officeGlassCool);
    this.materials.landmarkGlass.color.setHex(isDark ? 0x9bb5cf : 0xc8d8e6);

    bind(this.materials.instanced, this.sets.instancedFacade);
    this.materials.towerWhite.color.setHex(isDark ? 0xdbe5f0 : 0xf2f4f7);

    this.setNightFactor(isDark ? 1.0 : 0.0);
    this.disposeSets(oldSets);
  }

  dispose(): void {
    this.disposeSets(this.sets);
    for (const m of Object.values(this.materials)) {
      m.dispose();
    }
  }
}
