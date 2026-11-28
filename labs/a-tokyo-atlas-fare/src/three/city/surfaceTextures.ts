/**
 * Procedural PBR Surface, Road Asphalt, Sidewalk Paver, Urban Plaza, Landuse,
 * Grass, Forest Floor, Bare Soil & Water Ripple Texture Generators for SENKIRO Atlas.
 *
 * Physically grounded low-saturation albedos eliminate washed-out white/pale-grey
 * model-board ground while keeping roughnessMaps and bumpMaps rich at street scale.
 */

import * as THREE from 'three';

export interface SurfaceTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
}

export interface WaterTextureSet {
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export type RoadTextureClass = 'trunk' | 'primary' | 'secondary' | 'tertiary';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for procedural surface texture');
  return [c, ctx];
}

function hash2(x: number, y: number, seed = 409): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function finalizeSurfaceTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  wrapS: THREE.Wrapping,
  wrapT: THREE.Wrapping,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintAsphaltAggregate(
  a: CanvasRenderingContext2D,
  r: CanvasRenderingContext2D,
  b: CanvasRenderingContext2D,
  w: number,
  h: number,
  isDark: boolean,
  includeWheelTracks: boolean,
): void {
  // Deep realistic weathered charcoal asphalt (avoids pale grey flat strips)
  a.fillStyle = isDark ? '#1e242d' : '#31363e';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#dcdcdc'; // ~0.86 base asphalt roughness
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);

  if (includeWheelTracks) {
    const trackGrad = a.createLinearGradient(0, 0, w, 0);
    const edgeShade = isDark ? 'rgba(6,10,16,0.34)' : 'rgba(14,17,22,0.32)';
    const wearShade = isDark ? 'rgba(10,14,20,0.16)' : 'rgba(18,22,28,0.18)';
    trackGrad.addColorStop(0.0, edgeShade);
    trackGrad.addColorStop(0.06, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(0.24, wearShade);
    trackGrad.addColorStop(0.38, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(0.62, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(0.76, wearShade);
    trackGrad.addColorStop(0.94, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(1.0, edgeShade);
    a.fillStyle = trackGrad;
    a.fillRect(0, 0, w, h);

    // Subtle tire-polished wheel channels (slightly lower roughness)
    r.fillStyle = '#b8b8b8';
    r.fillRect(Math.floor(w * 0.19), 0, Math.floor(w * 0.14), h);
    r.fillRect(Math.floor(w * 0.67), 0, Math.floor(w * 0.14), h);
  }

  for (let i = 0; i < 4200; i++) {
    const px = Math.floor(hash2(i, 1, 17) * w);
    const py = Math.floor(hash2(i, 2, 17) * h);
    const v = hash2(i, 3, 17);
    const sz = v > 0.85 ? 2 : 1;
    if (v > 0.62) {
      a.fillStyle = isDark ? 'rgba(148,163,184,0.06)' : 'rgba(205,212,220,0.08)';
      b.fillStyle = '#9a9a9a';
    } else {
      a.fillStyle = isDark ? 'rgba(8,12,18,0.22)' : 'rgba(14,17,22,0.18)';
      b.fillStyle = '#686868';
    }
    a.fillRect(px, py, sz, sz);
    b.fillRect(px, py, sz, sz);
  }
}

/**
 * Generates road asphalt + Japanese road markings (u across road width 0..1, v repeating every 16m).
 * Nighttime streetlamp curb spill is restrained so roads look natural rather than neon strips.
 */
export function createAsphaltRoadTextureSet(
  roadClass: RoadTextureClass,
  isDark: boolean,
): SurfaceTextureSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  paintAsphaltAggregate(a, r, b, w, h, isDark, true);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const whitePaint = isDark ? 'rgba(210,218,228,0.68)' : 'rgba(225,226,222,0.82)';
  const amberPaint = isDark ? 'rgba(205,148,46,0.74)' : 'rgba(218,158,48,0.88)';

  const paintLine = (
    uCenter: number,
    pxWidth: number,
    color: string,
    dashed: boolean,
  ) => {
    const x0 = Math.round(uCenter * w - pxWidth * 0.5);
    if (!dashed) {
      a.fillStyle = color;
      a.fillRect(x0, 0, pxWidth, h);
      r.fillStyle = '#7e7e7e';
      r.fillRect(x0, 0, pxWidth, h);
      b.fillStyle = '#949494';
      b.fillRect(x0, 0, pxWidth, h);
    } else {
      for (const yStart of [24, 280]) {
        const dashH = 160;
        a.fillStyle = color;
        a.fillRect(x0, yStart, pxWidth, dashH);
        r.fillStyle = '#7e7e7e';
        r.fillRect(x0, yStart, pxWidth, dashH);
        b.fillStyle = '#949494';
        b.fillRect(x0, yStart, pxWidth, dashH);
      }
    }
  };

  if (roadClass === 'trunk') {
    paintLine(0.055, 6, whitePaint, false);
    paintLine(0.945, 6, whitePaint, false);
    paintLine(0.486, 5, amberPaint, false);
    paintLine(0.514, 5, amberPaint, false);
    paintLine(0.275, 5, whitePaint, true);
    paintLine(0.725, 5, whitePaint, true);
  } else if (roadClass === 'primary') {
    paintLine(0.06, 7, whitePaint, false);
    paintLine(0.94, 7, whitePaint, false);
    paintLine(0.5, 7, whitePaint, true);
  } else if (roadClass === 'secondary') {
    paintLine(0.07, 8, whitePaint, false);
    paintLine(0.93, 8, whitePaint, false);
    paintLine(0.5, 7, whitePaint, true);
  } else {
    paintLine(0.095, 9, whitePaint, false);
    paintLine(0.905, 9, whitePaint, false);
  }

  // Layered Tokyo streetlamp illumination rhythm along curbs (warm sodium trunks -> crisp LED avenues -> subtle residential)
  const drawLampPool = (lx: number, ly: number, rad: number, innerCol: string, midCol: string) => {
    const grad = e.createRadialGradient(lx, ly, 3, lx, ly, rad);
    grad.addColorStop(0, innerCol);
    grad.addColorStop(0.45, midCol);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = grad;
    e.fillRect(lx - rad, ly - rad, rad * 2, rad * 2);
  };

  if (roadClass === 'trunk') {
    e.fillStyle = 'rgba(255,178,96,0.16)';
    e.fillRect(0, 0, w, h);
    for (const ly of [56, 184, 312, 440]) {
      drawLampPool(32, ly, 165, 'rgba(255,204,132,0.82)', 'rgba(255,164,82,0.34)');
      drawLampPool(w - 32, (ly + 64) % h, 165, 'rgba(255,204,132,0.82)', 'rgba(255,164,82,0.34)');
    }
    // Subtle traffic lane wash & illuminated road center markings
    e.fillStyle = 'rgba(255,214,158,0.14)';
    e.fillRect(Math.round(w * 0.16), 0, Math.round(w * 0.26), h);
    e.fillRect(Math.round(w * 0.58), 0, Math.round(w * 0.26), h);
    e.fillStyle = 'rgba(255,244,224,0.42)';
    e.fillRect(Math.round(w * 0.27), 64, 6, 26);
    e.fillStyle = 'rgba(255,82,66,0.42)';
    e.fillRect(Math.round(w * 0.68), 260, 6, 24);
  } else if (roadClass === 'primary') {
    e.fillStyle = 'rgba(248,214,166,0.12)';
    e.fillRect(0, 0, w, h);
    for (const ly of [80, 240, 400]) {
      drawLampPool(36, ly, 148, 'rgba(255,218,162,0.72)', 'rgba(242,194,134,0.28)');
      drawLampPool(w - 36, (ly + 80) % h, 148, 'rgba(255,218,162,0.72)', 'rgba(242,194,134,0.28)');
    }
  } else if (roadClass === 'secondary') {
    e.fillStyle = 'rgba(218,224,234,0.08)';
    e.fillRect(0, 0, w, h);
    for (const ly of [96, 352]) {
      drawLampPool(40, ly, 128, 'rgba(245,232,210,0.56)', 'rgba(208,212,226,0.20)');
      drawLampPool(w - 40, (ly + 128) % h, 128, 'rgba(245,232,210,0.56)', 'rgba(208,212,226,0.20)');
    }
  } else {
    e.fillStyle = 'rgba(182,196,216,0.05)';
    e.fillRect(0, 0, w, h);
    drawLampPool(48, 128, 108, 'rgba(226,234,248,0.38)', 'rgba(184,198,222,0.14)');
    drawLampPool(w - 48, 368, 108, 'rgba(226,234,248,0.38)', 'rgba(184,198,222,0.14)');
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.ClampToEdgeWrapping, THREE.RepeatWrapping, 1, 1),
    roughnessMap: finalizeSurfaceTexture(
      cRgh,
      false,
      THREE.ClampToEdgeWrapping,
      THREE.RepeatWrapping,
      1,
      1,
    ),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.ClampToEdgeWrapping, THREE.RepeatWrapping, 1, 1),
    emissiveMap: finalizeSurfaceTexture(
      cEmi,
      true,
      THREE.ClampToEdgeWrapping,
      THREE.RepeatWrapping,
      1,
      1,
    ),
  };
}

/**
 * Unmarked matching asphalt apron for road intersections so lane lines stop cleanly at junctions.
 */
export function createIntersectionAsphaltTextureSet(isDark: boolean): SurfaceTextureSet {
  const w = 512;
  const h = 512;
  const [cAlb, a] = makeCanvas(w, h);
  const [cRgh, r] = makeCanvas(w, h);
  const [cBmp, b] = makeCanvas(w, h);
  const [cEmi, e] = makeCanvas(w, h);

  paintAsphaltAggregate(a, r, b, w, h, isDark, false);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);
  e.fillStyle = 'rgba(255,212,158,0.20)';
  e.fillRect(0, 0, w, h);
  const juncGrad = e.createRadialGradient(w * 0.5, h * 0.5, 16, w * 0.5, h * 0.5, w * 0.50);
  juncGrad.addColorStop(0, 'rgba(255,234,202,0.72)');
  juncGrad.addColorStop(0.55, 'rgba(255,208,148,0.32)');
  juncGrad.addColorStop(1, 'rgba(0,0,0,0)');
  e.fillStyle = juncGrad;
  e.fillRect(0, 0, w, h);
  // Subtle illuminated intersection edge markings
  e.fillStyle = 'rgba(255,244,228,0.22)';
  e.fillRect(w * 0.20, h * 0.14, w * 0.60, 8);
  e.fillRect(w * 0.20, h * 0.84, w * 0.60, 8);

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.06, 0.06),
    roughnessMap: finalizeSurfaceTexture(
      cRgh,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.06,
      0.06,
    ),
    bumpMap: finalizeSurfaceTexture(
      cBmp,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.06,
      0.06,
    ),
    emissiveMap: finalizeSurfaceTexture(
      cEmi,
      true,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.06,
      0.06,
    ),
  };
}

/**
 * Japanese interlocking concrete block sidewalk paver texture (~40cm tiles, calibrated mid-grey).
 */
export function createSidewalkPaverTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 512;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);
  const [cEmi, e] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#28313e' : '#9c988f';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#dcdcdc';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#b4b4b4';
  b.fillRect(0, 0, size, size);
  e.fillStyle = '#241d15';
  e.fillRect(0, 0, size, size);

  for (let i = 0; i < 22; i++) {
    const px = hash2(i, 1, 313) * size;
    const py = hash2(i, 2, 313) * size;
    const rad = 48 + hash2(i, 3, 313) * 68;
    const isCool = hash2(i, 4, 313) > 0.56;
    const grad = e.createRadialGradient(px, py, 3, px, py, rad);
    grad.addColorStop(0, isCool ? 'rgba(222,238,255,0.44)' : 'rgba(255,212,158,0.56)');
    grad.addColorStop(0.55, isCool ? 'rgba(182,208,242,0.16)' : 'rgba(235,182,120,0.20)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = grad;
    e.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  const cell = 16;
  for (let gy = 0; gy < size / cell; gy++) {
    for (let gx = 0; gx < size / cell; gx++) {
      const rnd = hash2(gx, gy, 613);
      const stagger = (gy % 2) * (cell * 0.5);
      const x = (gx * cell + stagger) % size;
      const y = gy * cell;

      a.fillStyle = isDark
        ? rnd > 0.65
          ? 'rgba(54,66,82,0.34)'
          : rnd < 0.3
            ? 'rgba(20,26,35,0.28)'
            : 'rgba(40,49,62,0.2)'
        : rnd > 0.65
          ? 'rgba(174,170,160,0.34)'
          : rnd < 0.3
            ? 'rgba(132,127,118,0.28)'
            : 'rgba(154,150,141,0.20)';
      a.fillRect(x + 1, y + 1, cell - 2, cell - 2);

      a.fillStyle = isDark ? 'rgba(12,16,23,0.42)' : 'rgba(92,88,81,0.28)';
      a.fillRect(x, y, cell, 1);
      a.fillRect(x, y, 1, cell);

      b.fillStyle = '#6c6c6c';
      b.fillRect(x, y, cell, 1);
      b.fillRect(x, y, 1, cell);

      r.fillStyle = rnd > 0.5 ? '#d0d0d0' : '#e4e4e4';
      r.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.075, 0.075),
    roughnessMap: finalizeSurfaceTexture(
      cRgh,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.075,
      0.075,
    ),
    bumpMap: finalizeSurfaceTexture(
      cBmp,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.075,
      0.075,
    ),
    emissiveMap: finalizeSurfaceTexture(
      cEmi,
      true,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.075,
      0.075,
    ),
  };
}

/**
 * Architectural granite/stone flagstone paving for Tokyo urban plazas & station forecourts.
 */
export function createUrbanPlazaTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 512;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);
  const [cEmi, e] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#2a3340' : '#a49f96';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#c8c8c8';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#b0b0b0';
  b.fillRect(0, 0, size, size);
  e.fillStyle = '#221c15';
  e.fillRect(0, 0, size, size);

  const cellW = 32;
  const cellH = 24;
  for (let row = 0; row < Math.ceil(size / cellH); row++) {
    const y = row * cellH;
    const isBand = row % 6 === 0;
    for (let col = 0; col < Math.ceil(size / cellW); col++) {
      const x = col * cellW;
      const rnd = hash2(col, row, 757);
      if (isBand) {
        a.fillStyle = isDark ? '#343e4c' : '#8d887f';
      } else {
        a.fillStyle = isDark
          ? rnd > 0.55
            ? '#2f3947'
            : '#252e3a'
          : rnd > 0.6
            ? '#aba69d'
            : rnd < 0.25
              ? '#959087'
              : '#a09b92';
      }
      a.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      r.fillStyle = isBand ? '#b0b0b0' : rnd > 0.5 ? '#c4c4c4' : '#d6d6d6';
      r.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      b.fillStyle = '#686868';
      b.fillRect(x, y, cellW, 1);
      b.fillRect(x, y, 1, cellH);
    }
  }

  for (let i = 0; i < 16; i++) {
    const px = hash2(i, 1, 773) * size;
    const py = hash2(i, 2, 773) * size;
    const rad = 58 + hash2(i, 3, 773) * 72;
    const grad = e.createRadialGradient(px, py, 3, px, py, rad);
    grad.addColorStop(0, 'rgba(255,222,172,0.52)');
    grad.addColorStop(0.5, 'rgba(240,192,132,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = grad;
    e.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
    emissiveMap: finalizeSurfaceTexture(cEmi, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
  };
}

/**
 * Low-saturation warm-grey residential ground, inner courtyards, gardens & narrow roji alleys
 * (eliminates bright white/beige model-board ground between Tokyo houses).
 */
export function createUrbanParcelTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 512;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);
  const [cEmi, e] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#1a212b' : '#8d8980';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#ebebeb';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#909090';
  b.fillRect(0, 0, size, size);
  e.fillStyle = '#120f0b';
  e.fillRect(0, 0, size, size);

  const step = 16;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const rnd = hash2(x, y, 811);
      const tone = hash2(x + 7, y + 3, 919);
      if (tone > 0.84) {
        // Residential courtyard garden / hedge patch
        a.fillStyle = isDark ? 'rgba(26,48,36,0.44)' : 'rgba(96,114,82,0.38)';
      } else if (tone < 0.14) {
        // Exposed residential soil / driveway gravel
        a.fillStyle = isDark ? 'rgba(30,28,26,0.36)' : 'rgba(128,118,104,0.30)';
      } else if (rnd > 0.5) {
        a.fillStyle = isDark ? 'rgba(34,42,54,0.28)' : 'rgba(150,145,137,0.26)';
      } else {
        a.fillStyle = isDark ? 'rgba(18,24,32,0.28)' : 'rgba(118,114,107,0.24)';
      }
      a.fillRect(x + 1, y + 1, step - 2, step - 2);

      if (tone > 0.90) {
        a.fillStyle = isDark ? 'rgba(20,42,30,0.5)' : 'rgba(82,104,68,0.36)';
        a.fillRect(x + 4, y + 4, 6, 6);
      }

      r.fillStyle = tone > 0.84 ? '#f4f4f4' : rnd > 0.5 ? '#dcdcdc' : '#eaeaea';
      r.fillRect(x + 1, y + 1, step - 2, step - 2);
    }
  }

  // Organic narrow-alley porch lamps, neighborhood intersections & vending machine light accents
  for (let i = 0; i < 24; i++) {
    const px = hash2(i, 1, 941) * size;
    const py = hash2(i, 2, 941) * size;
    const rad = 26 + hash2(i, 3, 941) * 44;
    const coolLed = hash2(i, 4, 941) > 0.68;
    const grad = e.createRadialGradient(px, py, 2, px, py, rad);
    grad.addColorStop(0, coolLed ? 'rgba(210,228,255,0.42)' : 'rgba(255,204,138,0.48)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = grad;
    e.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  a.strokeStyle = isDark ? 'rgba(10,16,24,0.24)' : 'rgba(72,68,62,0.16)';
  a.lineWidth = 1;
  e.strokeStyle = 'rgba(255,206,144,0.24)';
  e.lineWidth = 2;
  for (let i = 8; i < size; i += 32) {
    a.beginPath();
    a.moveTo(i, 0);
    a.lineTo(i, size);
    a.stroke();
    a.beginPath();
    a.moveTo(0, i);
    a.lineTo(size, i);
    a.stroke();
    if (i % 64 === 8) {
      e.beginPath();
      e.moveTo(i, 0);
      e.lineTo(i, size);
      e.stroke();
      e.beginPath();
      e.moveTo(0, i);
      e.lineTo(size, i);
      e.stroke();
    }
  }

  b.strokeStyle = '#707070';
  b.lineWidth = 1;
  for (let i = 0; i <= size; i += 64) {
    b.beginPath();
    b.moveTo(i, 0);
    b.lineTo(i, size);
    b.stroke();
    b.beginPath();
    b.moveTo(0, i);
    b.lineTo(size, i);
    b.stroke();
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.032, 0.032),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.032, 0.032),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.032, 0.032),
    emissiveMap: finalizeSurfaceTexture(cEmi, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.032, 0.032),
  };
}

/**
 * Hardened commercial district ground (slate-grey urban concrete paving & plaza connectors).
 */
export function createCommercialHardscapeTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 512;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);
  const [cEmi, e] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#202834' : '#7d8188';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#cfcfcf';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#929292';
  b.fillRect(0, 0, size, size);
  e.fillStyle = '#221c15';
  e.fillRect(0, 0, size, size);

  const cell = 32;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const rnd = hash2(x, y, 887);
      a.fillStyle = isDark
        ? rnd > 0.5
          ? 'rgba(46,56,72,0.32)'
          : 'rgba(20,26,36,0.32)'
        : rnd > 0.5
          ? 'rgba(138,142,148,0.28)'
          : 'rgba(104,108,114,0.24)';
      a.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      r.fillStyle = rnd > 0.5 ? '#c0c0c0' : '#d8d8d8';
      r.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }

  for (let i = 0; i < 28; i++) {
    const px = hash2(i, 1, 991) * size;
    const py = hash2(i, 2, 991) * size;
    const rad = 36 + hash2(i, 3, 991) * 58;
    const isCool = hash2(i, 4, 991) > 0.55;
    const grad = e.createRadialGradient(px, py, 2, px, py, rad);
    grad.addColorStop(0, isCool ? 'rgba(218,236,255,0.52)' : 'rgba(255,212,152,0.62)');
    grad.addColorStop(0.55, isCool ? 'rgba(176,204,242,0.18)' : 'rgba(240,180,112,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = grad;
    e.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  a.strokeStyle = isDark ? 'rgba(10,14,22,0.35)' : 'rgba(62,66,72,0.22)';
  a.lineWidth = 1;
  b.strokeStyle = '#6c6c6c';
  e.strokeStyle = 'rgba(255,220,172,0.28)';
  e.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    a.beginPath();
    a.moveTo(i, 0);
    a.lineTo(i, size);
    a.stroke();
    a.beginPath();
    a.moveTo(0, i);
    a.lineTo(size, i);
    a.stroke();
    b.beginPath();
    b.moveTo(i, 0);
    b.lineTo(i, size);
    b.stroke();
    b.beginPath();
    b.moveTo(0, i);
    b.lineTo(size, i);
    b.stroke();
    e.beginPath();
    e.moveTo(i, 0);
    e.lineTo(i, size);
    e.stroke();
    e.beginPath();
    e.moveTo(0, i);
    e.lineTo(size, i);
    e.stroke();
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.036, 0.036),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.036, 0.036),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.036, 0.036),
    emissiveMap: finalizeSurfaceTexture(cEmi, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.036, 0.036),
  };
}

/**
 * Natural low-saturation olive-green grass & open park meadow texture.
 */
export function createGrassMeadowTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 256;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#1a2f22' : '#5b7849';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#f0f0f0';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#888888';
  b.fillRect(0, 0, size, size);

  for (let i = 0; i < 650; i++) {
    const px = hash2(i, 1, 103) * size;
    const py = hash2(i, 2, 103) * size;
    const rad = 3 + hash2(i, 3, 103) * 9;
    const tone = hash2(i, 4, 103);
    a.fillStyle = isDark
      ? tone > 0.5
        ? 'rgba(34,62,42,0.34)'
        : 'rgba(16,32,22,0.34)'
      : tone > 0.65
        ? 'rgba(104,132,78,0.34)'
        : tone > 0.3
          ? 'rgba(78,108,62,0.30)'
          : 'rgba(126,138,88,0.22)';
    a.beginPath();
    a.arc(px, py, rad, 0, Math.PI * 2);
    a.fill();
    b.fillStyle = tone > 0.5 ? '#9c9c9c' : '#747474';
    b.fillRect(px, py, 2, 2);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.022, 0.022),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.022, 0.022),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.022, 0.022),
  };
}

/**
 * Deep shaded forest understory floor (Imperial Palace Fukiage, Meiji Jingu, Ueno woods).
 */
export function createForestFloorTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 256;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#112117' : '#334a2f';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#f4f4f4';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#848484';
  b.fillRect(0, 0, size, size);

  for (let i = 0; i < 520; i++) {
    const px = hash2(i, 1, 223) * size;
    const py = hash2(i, 2, 223) * size;
    const rad = 4 + hash2(i, 3, 223) * 11;
    const tone = hash2(i, 4, 223);
    a.fillStyle = isDark
      ? tone > 0.5
        ? 'rgba(22,44,30,0.42)'
        : 'rgba(10,20,14,0.45)'
      : tone > 0.6
        ? 'rgba(62,88,52,0.38)'
        : tone > 0.25
          ? 'rgba(38,58,34,0.44)'
          : 'rgba(72,64,46,0.30)';
    a.beginPath();
    a.arc(px, py, rad, 0, Math.PI * 2);
    a.fill();
    b.fillStyle = tone > 0.5 ? '#a2a2a2' : '#646464';
    b.fillRect(px, py, 2, 2);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.018, 0.018),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.018, 0.018),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.018, 0.018),
  };
}

/**
 * Low-saturation natural earth & fine gravel texture (Kokyo Gaien forecourt, sports fields, riverbanks).
 */
export function createBareSoilTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 256;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#2b2824' : '#938774';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#f2f2f2';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#848484';
  b.fillRect(0, 0, size, size);

  for (let i = 0; i < 1600; i++) {
    const px = Math.floor(hash2(i, 1, 337) * size);
    const py = Math.floor(hash2(i, 2, 337) * size);
    const tone = hash2(i, 3, 337);
    a.fillStyle = isDark
      ? tone > 0.5
        ? 'rgba(72,64,56,0.22)'
        : 'rgba(18,16,14,0.25)'
      : tone > 0.55
        ? 'rgba(168,156,136,0.26)'
        : 'rgba(112,100,84,0.22)';
    a.fillRect(px, py, 2, 2);
    b.fillStyle = tone > 0.5 ? '#9e9e9e' : '#6a6a6a';
    b.fillRect(px, py, 2, 2);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.035, 0.035),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.035, 0.035),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.035, 0.035),
  };
}

/**
 * Calm directional urban water ripple bump + roughness maps for Tokyo Bay and inner rivers.
 */
export function createWaterTextureSet(isDark: boolean): WaterTextureSet {
  const size = 128;
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  const imgR = r.createImageData(size, size);
  const imgB = b.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const wave =
        Math.sin(u * 4 + v * 2) * 0.35 +
        Math.cos(u * 3 - v * 5) * 0.3 +
        Math.sin(u * 9 + v * 7) * 0.2 +
        Math.cos(u * 13 - v * 11) * 0.15;

      const idx = (y * size + x) * 4;
      const bumpVal = Math.max(0, Math.min(255, Math.round(128 + wave * 48)));
      imgB.data[idx] = bumpVal;
      imgB.data[idx + 1] = bumpVal;
      imgB.data[idx + 2] = bumpVal;
      imgB.data[idx + 3] = 255;

      const baseRgh = isDark ? 42 : 48;
      const rghVal = Math.max(24, Math.min(104, Math.round(baseRgh + wave * 14)));
      imgR.data[idx] = rghVal;
      imgR.data[idx + 1] = rghVal;
      imgR.data[idx + 2] = rghVal;
      imgR.data[idx + 3] = 255;
    }
  }
  r.putImageData(imgR, 0, 0);
  b.putImageData(imgB, 0, 0);

  return {
    roughnessMap: finalizeSurfaceTexture(
      cRgh,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.018,
      0.018,
    ),
    bumpMap: finalizeSurfaceTexture(
      cBmp,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.018,
      0.018,
    ),
  };
}

/**
 * Multi-track railway yard ballast, sleeper rhythm & parallel steel rails texture.
 */
export function createRailYardTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 256;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#20262f' : '#5e5a54';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#ececec';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#787878';
  b.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const px = Math.floor(hash2(i, 1, 701) * size);
    const py = Math.floor(hash2(i, 2, 701) * size);
    const v = hash2(i, 3, 701);
    a.fillStyle = v > 0.55
      ? isDark
        ? 'rgba(148,163,184,0.12)'
        : 'rgba(205,198,188,0.18)'
      : isDark
        ? 'rgba(5,8,14,0.28)'
        : 'rgba(36,33,30,0.24)';
    a.fillRect(px, py, 2, 2);
    b.fillStyle = v > 0.5 ? '#9c9c9c' : '#585858';
    b.fillRect(px, py, 2, 2);
  }

  const tracks = 4;
  const laneW = size / tracks;
  for (let t = 0; t < tracks; t++) {
    const cx = Math.round((t + 0.5) * laneW);
    a.fillStyle = isDark ? 'rgba(10,14,20,0.34)' : 'rgba(42,39,35,0.26)';
    a.fillRect(cx - 14, 0, 28, size);

    a.fillStyle = isDark ? 'rgba(90,98,108,0.45)' : 'rgba(176,170,162,0.55)';
    b.fillStyle = '#b4b4b4';
    for (let y = 2; y < size; y += 8) {
      a.fillRect(cx - 11, y, 22, 3);
      b.fillRect(cx - 11, y, 22, 3);
    }

    a.fillStyle = isDark ? '#708090' : '#bcc4ce';
    r.fillStyle = '#484848';
    b.fillStyle = '#e0e0e0';
    a.fillRect(cx - 6, 0, 2, size);
    a.fillRect(cx + 4, 0, 2, size);
    r.fillRect(cx - 6, 0, 2, size);
    r.fillRect(cx + 4, 0, 2, size);
    b.fillRect(cx - 6, 0, 2, size);
    b.fillRect(cx + 4, 0, 2, size);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.045, 0.045),
  };
}

/**
 * Port terminal & industrial logistics concrete apron texture with expansion joints
 * and container-bay yellow/white lane markings.
 */
export function createIndustrialPortTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 256;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#252c36' : '#83878e';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#dcdcdc';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#848484';
  b.fillRect(0, 0, size, size);

  const slab = 32;
  for (let y = 0; y < size; y += slab) {
    for (let x = 0; x < size; x += slab) {
      const v = hash2(x, y, 811);
      a.fillStyle = v > 0.5
        ? isDark
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(255,255,255,0.09)'
        : isDark
          ? 'rgba(0,0,0,0.10)'
          : 'rgba(32,38,46,0.12)';
      a.fillRect(x + 1, y + 1, slab - 2, slab - 2);
    }
  }

  a.strokeStyle = isDark ? 'rgba(12,16,24,0.45)' : 'rgba(68,72,78,0.28)';
  a.lineWidth = 1;
  b.strokeStyle = '#626262';
  for (let i = 0; i <= size; i += slab) {
    a.beginPath();
    a.moveTo(i, 0);
    a.lineTo(i, size);
    a.stroke();
    a.beginPath();
    a.moveTo(0, i);
    a.lineTo(size, i);
    a.stroke();

    b.beginPath();
    b.moveTo(i, 0);
    b.lineTo(i, size);
    b.stroke();
    b.beginPath();
    b.moveTo(0, i);
    b.lineTo(size, i);
    b.stroke();
  }

  a.fillStyle = isDark ? 'rgba(217,160,52,0.34)' : 'rgba(196,144,44,0.42)';
  a.fillRect(0, 62, size, 3);
  a.fillRect(0, 190, size, 3);
  a.fillStyle = isDark ? 'rgba(203,213,225,0.22)' : 'rgba(232,236,240,0.40)';
  for (let x = 8; x < size; x += 24) {
    a.fillRect(x, 126, 12, 2);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.025, 0.025),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.025, 0.025),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.025, 0.025),
  };
}
