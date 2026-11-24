/**
 * Procedural PBR Surface, Road Asphalt, Sidewalk Paver & Water Ripple Texture Generators
 * for SENKIRO Atlas v2.
 *
 * Zero external bitmap dependencies; all textures are deterministic CanvasTextures
 * calibrated for Japanese urban architecture and streetscape rendering.
 */

import * as THREE from 'three';

export interface SurfaceTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
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
  a.fillStyle = isDark ? '#1e242d' : '#40464e';
  a.fillRect(0, 0, w, h);
  r.fillStyle = '#e0e0e0'; // matte asphalt ~0.88
  r.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);

  if (includeWheelTracks) {
    // Subtle polished wheel paths in left/right travel zones + gutter edge shadow
    const trackGrad = a.createLinearGradient(0, 0, w, 0);
    const edgeShade = isDark ? 'rgba(6,10,16,0.34)' : 'rgba(20,24,28,0.26)';
    const wearShade = isDark ? 'rgba(10,14,20,0.16)' : 'rgba(28,32,38,0.12)';
    trackGrad.addColorStop(0.0, edgeShade);
    trackGrad.addColorStop(0.05, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(0.24, wearShade);
    trackGrad.addColorStop(0.38, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(0.62, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(0.76, wearShade);
    trackGrad.addColorStop(0.95, 'rgba(0,0,0,0)');
    trackGrad.addColorStop(1.0, edgeShade);
    a.fillStyle = trackGrad;
    a.fillRect(0, 0, w, h);

    r.fillStyle = '#c4c4c4';
    r.fillRect(Math.floor(w * 0.19), 0, Math.floor(w * 0.14), h);
    r.fillRect(Math.floor(w * 0.67), 0, Math.floor(w * 0.14), h);
  }

  // Fine mineral asphalt aggregate speckle (deterministic, zero tile seam)
  for (let i = 0; i < 4200; i++) {
    const px = Math.floor(hash2(i, 1, 17) * w);
    const py = Math.floor(hash2(i, 2, 17) * h);
    const v = hash2(i, 3, 17);
    const sz = v > 0.85 ? 2 : 1;
    if (v > 0.62) {
      a.fillStyle = isDark ? 'rgba(148,163,184,0.06)' : 'rgba(235,238,242,0.09)';
      b.fillStyle = '#9a9a9a';
    } else {
      a.fillStyle = isDark ? 'rgba(8,12,18,0.22)' : 'rgba(22,25,30,0.14)';
      b.fillStyle = '#686868';
    }
    a.fillRect(px, py, sz, sz);
    b.fillRect(px, py, sz, sz);
  }
}

/**
 * Generates road asphalt + Japanese road markings (u across road width 0..1, v repeating every 16m).
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

  paintAsphaltAggregate(a, r, b, w, h, isDark, true);

  const whitePaint = isDark ? 'rgba(218,226,236,0.72)' : 'rgba(244,244,240,0.88)';
  const amberPaint = isDark ? 'rgba(217,155,46,0.78)' : 'rgba(232,168,48,0.92)';

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
      r.fillStyle = '#7e7e7e'; // road paint slightly smoother than asphalt
      r.fillRect(x0, 0, pxWidth, h);
      b.fillStyle = '#949494';
      b.fillRect(x0, 0, pxWidth, h);
    } else {
      // 2 dashes per 16m V-tile (5m paint + 3m gap)
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
    // 4-lane Tokyo arterial: solid white shoulders, double amber center, dashed lane lines
    paintLine(0.055, 6, whitePaint, false);
    paintLine(0.945, 6, whitePaint, false);
    paintLine(0.486, 5, amberPaint, false);
    paintLine(0.514, 5, amberPaint, false);
    paintLine(0.275, 5, whitePaint, true);
    paintLine(0.725, 5, whitePaint, true);
  } else if (roadClass === 'primary') {
    // 2/4-lane avenue: solid white shoulders + crisp dashed white centerline
    paintLine(0.06, 7, whitePaint, false);
    paintLine(0.94, 7, whitePaint, false);
    paintLine(0.5, 7, whitePaint, true);
  } else if (roadClass === 'secondary') {
    // 2-lane street: white edge lines + dashed white centerline
    paintLine(0.07, 8, whitePaint, false);
    paintLine(0.93, 8, whitePaint, false);
    paintLine(0.5, 7, whitePaint, true);
  } else {
    // Tertiary Tokyo street: Japanese pedestrian side-strips (路側帯) on dark asphalt
    paintLine(0.095, 9, whitePaint, false);
    paintLine(0.905, 9, whitePaint, false);
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

  paintAsphaltAggregate(a, r, b, w, h, isDark, false);

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
  };
}

/**
 * Japanese interlocking concrete block sidewalk & station plaza paver texture (~40cm tiles).
 */
export function createSidewalkPaverTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 512;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#28313e' : '#d5d0c7';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#dcdcdc';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#b4b4b4';
  b.fillRect(0, 0, size, size);

  const cell = 16; // 32x32 tiles in 512px; repeat=0.075 => ~0.42m stone pavers
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
          ? 'rgba(242,238,230,0.28)'
          : rnd < 0.3
            ? 'rgba(182,177,168,0.22)'
            : 'rgba(214,209,200,0.16)';
      a.fillRect(x + 1, y + 1, cell - 2, cell - 2);

      // Subtle grout seam in albedo & bump
      a.fillStyle = isDark ? 'rgba(12,16,23,0.42)' : 'rgba(135,130,122,0.24)';
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
  };
}

/**
 * Detailed urban parcel / courtyard concrete & micro-lot ground texture so spaces between buildings
 * have rich architectural paving breakup instead of uniform grey/beige void.
 */
export function createUrbanParcelTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 512;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  a.fillStyle = isDark ? '#18212d' : '#cbc6bd';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#e8e8e8';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#909090';
  b.fillRect(0, 0, size, size);

  // Subtle urban cadastral micro-parcels & courtyard paving
  const step = 16;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const rnd = hash2(x, y, 811);
      const tone = hash2(x + 7, y + 3, 919);
      if (tone > 0.88) {
        a.fillStyle = isDark ? 'rgba(30,54,42,0.35)' : 'rgba(154,168,142,0.24)';
      } else if (rnd > 0.5) {
        a.fillStyle = isDark ? 'rgba(34,44,58,0.24)' : 'rgba(222,218,210,0.24)';
      } else {
        a.fillStyle = isDark ? 'rgba(17,24,34,0.24)' : 'rgba(176,171,163,0.16)';
      }
      a.fillRect(x + 1, y + 1, step - 2, step - 2);

      r.fillStyle = tone > 0.88 ? '#f2f2f2' : rnd > 0.5 ? '#d8d8d8' : '#eaeaea';
      r.fillRect(x + 1, y + 1, step - 2, step - 2);
    }
  }

  // Soft expansion joints
  a.strokeStyle = isDark ? 'rgba(148,163,184,0.06)' : 'rgba(110,106,99,0.08)';
  a.lineWidth = 1;
  b.strokeStyle = '#747474';
  b.lineWidth = 1;
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
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.032, 0.032),
    roughnessMap: finalizeSurfaceTexture(
      cRgh,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.032,
      0.032,
    ),
    bumpMap: finalizeSurfaceTexture(
      cBmp,
      false,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      0.032,
      0.032,
    ),
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
      const rghVal = Math.max(20, Math.min(110, Math.round(baseRgh + wave * 14)));
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
 * Multi-track railway yard ballast, sleeper rhythm & parallel steel rails texture
 * (eliminates flat grey untextured slabs on Oi / Shinagawa / Tabata railway yards).
 */
export function createRailYardTextureSet(isDark: boolean): SurfaceTextureSet {
  const size = 256;
  const [cAlb, a] = makeCanvas(size, size);
  const [cRgh, r] = makeCanvas(size, size);
  const [cBmp, b] = makeCanvas(size, size);

  // Crushed dark gravel ballast bed
  a.fillStyle = isDark ? '#212730' : '#7b7770';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#ececec';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#787878';
  b.fillRect(0, 0, size, size);

  // Fine stone ballast speckle
  for (let i = 0; i < 1800; i++) {
    const px = Math.floor(hash2(i, 1, 701) * size);
    const py = Math.floor(hash2(i, 2, 701) * size);
    const v = hash2(i, 3, 701);
    a.fillStyle = v > 0.55
      ? isDark
        ? 'rgba(148,163,184,0.12)'
        : 'rgba(235,230,222,0.18)'
      : isDark
        ? 'rgba(5,8,14,0.28)'
        : 'rgba(42,38,34,0.22)';
    a.fillRect(px, py, 2, 2);
    b.fillStyle = v > 0.5 ? '#9c9c9c' : '#585858';
    b.fillRect(px, py, 2, 2);
  }

  // 4 parallel yard tracks along V with concrete sleepers + twin steel rails
  const tracks = 4;
  const laneW = size / tracks;
  for (let t = 0; t < tracks; t++) {
    const cx = Math.round((t + 0.5) * laneW);
    // Darker track trough
    a.fillStyle = isDark ? 'rgba(10,14,20,0.34)' : 'rgba(52,48,44,0.22)';
    a.fillRect(cx - 14, 0, 28, size);

    // Concrete sleepers every 8px
    a.fillStyle = isDark ? 'rgba(90,98,108,0.45)' : 'rgba(195,190,182,0.55)';
    b.fillStyle = '#b4b4b4';
    for (let y = 2; y < size; y += 8) {
      a.fillRect(cx - 11, y, 22, 3);
      b.fillRect(cx - 11, y, 22, 3);
    }

    // Twin gleaming steel rails
    a.fillStyle = isDark ? '#708090' : '#cfd6de';
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

  a.fillStyle = isDark ? '#252c36' : '#c6c9cd';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#dcdcdc';
  r.fillRect(0, 0, size, size);
  b.fillStyle = '#848484';
  b.fillRect(0, 0, size, size);

  // Concrete apron slab grid + subtle tone variance
  const slab = 32;
  for (let y = 0; y < size; y += slab) {
    for (let x = 0; x < size; x += slab) {
      const v = hash2(x, y, 811);
      a.fillStyle = v > 0.5
        ? isDark
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(255,255,255,0.12)'
        : isDark
          ? 'rgba(0,0,0,0.10)'
          : 'rgba(40,48,58,0.08)';
      a.fillRect(x + 1, y + 1, slab - 2, slab - 2);
    }
  }

  a.strokeStyle = isDark ? 'rgba(12,16,24,0.45)' : 'rgba(92,98,106,0.28)';
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

  // Subtle yellow/white port logistics lane markings every 128px
  a.fillStyle = isDark ? 'rgba(217,160,52,0.34)' : 'rgba(202,148,38,0.42)';
  a.fillRect(0, 62, size, 3);
  a.fillRect(0, 190, size, 3);
  a.fillStyle = isDark ? 'rgba(203,213,225,0.22)' : 'rgba(248,250,252,0.48)';
  for (let x = 8; x < size; x += 24) {
    a.fillRect(x, 126, 12, 2);
  }

  return {
    map: finalizeSurfaceTexture(cAlb, true, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.025, 0.025),
    roughnessMap: finalizeSurfaceTexture(cRgh, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.025, 0.025),
    bumpMap: finalizeSurfaceTexture(cBmp, false, THREE.RepeatWrapping, THREE.RepeatWrapping, 0.025, 0.025),
  };
}
