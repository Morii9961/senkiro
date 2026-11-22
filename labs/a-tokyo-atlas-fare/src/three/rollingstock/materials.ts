/**
 * SENKIRO Atlas v2 — Procedural PBR Material & Texture Registry for Japanese Rolling Stock
 *
 * Uses pure RGBA buffer `THREE.DataTexture` generation so textures render identically in both
 * Browser WebGL and headless Node.js (Vitest unit tests & GLB binary exporter) with zero DOM dependency.
 * All shared materials and textures are cached in a singleton registry to maximize GPU reuse across consists.
 */

import * as THREE from 'three';
import type { RollingStockSeriesId, TrainLightState, TravelDirection } from './domain/types.js';

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

function hexToRgba(hex: string, a = 255): RgbaColor {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a,
  };
}

class PixelBufferPainter {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, fillHex = '#ffffff') {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.fillRect(0, 0, width, height, hexToRgba(fillHex));
  }

  setPixel(x: number, y: number, c: RgbaColor): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    this.data[idx] = c.r;
    this.data[idx + 1] = c.g;
    this.data[idx + 2] = c.b;
    this.data[idx + 3] = c.a ?? 255;
  }

  fillRect(x0: number, y0: number, w: number, h: number, c: RgbaColor): void {
    const startX = Math.max(0, Math.floor(x0));
    const endX = Math.min(this.width, Math.floor(x0 + w));
    const startY = Math.max(0, Math.floor(y0));
    const endY = Math.min(this.height, Math.floor(y0 + h));
    const a = c.a ?? 255;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * this.width + x) * 4;
        this.data[idx] = c.r;
        this.data[idx + 1] = c.g;
        this.data[idx + 2] = c.b;
        this.data[idx + 3] = a;
      }
    }
  }

  /**
   * Adds subtle horizontal brushed metal hairline grain across a region.
   */
  addHorizontalBrushGrain(x0: number, y0: number, w: number, h: number, amplitude = 8): void {
    const startX = Math.max(0, Math.floor(x0));
    const endX = Math.min(this.width, Math.floor(x0 + w));
    const startY = Math.max(0, Math.floor(y0));
    const endY = Math.min(this.height, Math.floor(y0 + h));

    for (let y = startY; y < endY; y++) {
      // Deterministic pseudo-random streak per row
      const rowHash = Math.sin(y * 12.9898) * 43758.5453;
      const delta = Math.round(((rowHash - Math.floor(rowHash)) - 0.5) * 2 * amplitude);
      for (let x = startX; x < endX; x++) {
        const idx = (y * this.width + x) * 4;
        const fine = ((x * 7 + y * 13) % 5) - 2;
        this.data[idx] = Math.max(0, Math.min(255, this.data[idx]! + delta + fine));
        this.data[idx + 1] = Math.max(0, Math.min(255, this.data[idx + 1]! + delta + fine));
        this.data[idx + 2] = Math.max(0, Math.min(255, this.data[idx + 2]! + delta + fine));
      }
    }
  }

  /**
   * Draws E235 signature graduated dot-matrix pattern in Uguisu Green.
   */
  drawDotMatrixBand(x0: number, y0: number, w: number, h: number, dotHex: string): void {
    const c = hexToRgba(dotHex);
    const step = 4;
    for (let dy = 0; dy < h; dy += step) {
      const normY = dy / Math.max(1, h);
      // Denser in middle, graduated smaller dots near top & bottom edges
      const edgeFactor = Math.sin(normY * Math.PI);
      const dotSize = Math.max(1, Math.round(edgeFactor * 3.5));
      for (let dx = 0; dx < w; dx += step) {
        this.fillRect(x0 + dx, y0 + dy, dotSize, dotSize, c);
      }
    }
  }

  toDataTexture(srgb = true): THREE.DataTexture {
    const tex = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  }
}

/**
 * Generates E235-0 passenger door texture with iconic vertical Uguisu Green graduated dot-matrix stripe.
 */
function createE235DoorTexture(): THREE.DataTexture {
  const p = new PixelBufferPainter(128, 256, '#D4DAE0');
  p.addHorizontalBrushGrain(0, 0, 128, 256, 7);

  // Outer door frame seam
  p.fillRect(0, 0, 3, 256, hexToRgba('#9AA3AE'));
  p.fillRect(125, 0, 3, 256, hexToRgba('#9AA3AE'));

  // Vertical Uguisu Green stripe along center-inner vertical band of the door leaf
  p.fillRect(18, 20, 92, 108, hexToRgba('#80C241'));
  // Graduated dot-matrix transitions at top and bottom of the green door band
  p.drawDotMatrixBand(18, 4, 92, 18, '#80C241');
  p.drawDotMatrixBand(18, 128, 92, 24, '#80C241');
  p.drawDotMatrixBand(18, 224, 92, 22, '#80C241');

  // Upper door glass window with dark rounded bezel (note: DataTexture Y=0 is bottom, Y=255 is top)
  p.fillRect(22, 134, 84, 92, hexToRgba('#1E262E'));
  p.fillRect(27, 139, 74, 82, hexToRgba('#1A303C'));
  // Subtle diagonal glass highlight
  p.fillRect(34, 146, 12, 68, hexToRgba('#345264'));

  return p.toDataTexture(true);
}

/**
 * Generates Ginza Line 1000 Series side body & door texture:
 * Vivid Lemon Yellow body + Ginza Orange / White / Dark Brown waist belt + Maroon cantrail trim.
 */
function createGinza1000SideTexture(): THREE.DataTexture {
  const p = new PixelBufferPainter(256, 256, '#F5B100');
  // Subtle warm gloss variation
  p.addHorizontalBrushGrain(0, 0, 256, 256, 3);

  // Lower skirt dark shadow trim (Y: 0..14)
  p.fillRect(0, 0, 256, 14, hexToRgba('#B87E00'));

  // Iconic Ginza Line Waist Belt beneath window level (Y: 92..118)
  p.fillRect(0, 92, 256, 4, hexToRgba('#4E2217')); // Lower dark maroon-brown pinstripe
  p.fillRect(0, 96, 256, 4, hexToRgba('#FFFFFF')); // White accent line
  p.fillRect(0, 100, 256, 14, hexToRgba('#FF8C00')); // Ginza Orange core band
  p.fillRect(0, 114, 256, 4, hexToRgba('#FFFFFF')); // Upper white accent line
  p.fillRect(0, 118, 256, 3, hexToRgba('#4E2217')); // Upper dark maroon-brown pinstripe

  // Upper roof eave classic maroon border (Y: 234..256)
  p.fillRect(0, 234, 256, 22, hexToRgba('#6E3428'));

  return p.toDataTexture(true);
}

/**
 * Generates Ginza Line 1000 Series sliding door leaf texture:
 * Lemon-Yellow door panel + Ginza Orange/White/Brown waist stripe + dark-framed upper door window glass.
 */
function createGinza1000DoorTexture(): THREE.DataTexture {
  const p = new PixelBufferPainter(128, 256, '#F5B100');
  p.addHorizontalBrushGrain(0, 0, 128, 256, 3);

  // Outer door frame seam
  p.fillRect(0, 0, 3, 256, hexToRgba('#B47D00'));
  p.fillRect(125, 0, 3, 256, hexToRgba('#B47D00'));

  // Continuation of Ginza Orange + White + Maroon-Brown waist belt across door (Y: 94..122)
  p.fillRect(3, 94, 122, 4, hexToRgba('#4E2217'));
  p.fillRect(3, 98, 122, 4, hexToRgba('#FFFFFF'));
  p.fillRect(3, 102, 122, 14, hexToRgba('#FF8C00'));
  p.fillRect(3, 116, 122, 4, hexToRgba('#FFFFFF'));
  p.fillRect(3, 120, 122, 3, hexToRgba('#4E2217'));

  // Upper door glass window with dark retro frame (Y: 132..228)
  p.fillRect(20, 132, 88, 96, hexToRgba('#22262E'));
  p.fillRect(25, 137, 78, 86, hexToRgba('#1A2B38'));
  p.fillRect(32, 144, 12, 72, hexToRgba('#324C5E'));

  return p.toDataTexture(true);
}

/**
 * Generates Tokyo Metro 17000 Series sliding door leaf texture:
 * Anodized brushed aluminum door leaf + Gold/Brown dual waist stripe + rounded dark upper door window.
 */
function createMetro17000DoorTexture(): THREE.DataTexture {
  const p = new PixelBufferPainter(128, 256, '#D8DDE4');
  p.addHorizontalBrushGrain(0, 0, 128, 256, 7);

  // Outer door frame seam
  p.fillRect(0, 0, 3, 256, hexToRgba('#98A2AE'));
  p.fillRect(125, 0, 3, 256, hexToRgba('#98A2AE'));

  // Continuation of Fukutoshin Brown + White + Yurakucho Gold dual waist belt (Y: 88..118)
  p.fillRect(3, 88, 122, 12, hexToRgba('#8F5126'));
  p.fillRect(3, 100, 122, 3, hexToRgba('#F8FAFC'));
  p.fillRect(3, 103, 122, 15, hexToRgba('#C8A96E'));

  // Upper smoked door glass window (Y: 132..228)
  p.fillRect(20, 132, 88, 96, hexToRgba('#181F28'));
  p.fillRect(25, 137, 78, 86, hexToRgba('#14232F'));
  p.fillRect(33, 145, 12, 70, hexToRgba('#2D4759'));

  return p.toDataTexture(true);
}

/**
 * Generates Tokyo Metro 17000 Series side body texture:
 * Brushed double-skin A-train aluminum + Yurakucho Gold (#C1A470) & Fukutoshin Brown (#9C5E31) dual belts.
 */
function createMetro17000SideTexture(): THREE.DataTexture {
  const p = new PixelBufferPainter(256, 256, '#D8DDE4');
  p.addHorizontalBrushGrain(0, 0, 256, 256, 8);

  // Lower body panel seam
  p.fillRect(0, 12, 256, 3, hexToRgba('#A2ABB6'));

  // Iconic Dual Waist Belt below windows (Y: 88..118):
  // Fukutoshin Line Brown + White separator + Yurakucho Line Gold
  p.fillRect(0, 88, 256, 12, hexToRgba('#8F5126')); // Fukutoshin Brown
  p.fillRect(0, 100, 256, 3, hexToRgba('#F8FAFC')); // Crisp white separator
  p.fillRect(0, 103, 256, 15, hexToRgba('#C8A96E')); // Yurakucho Gold

  // Upper Eave / Cantrail Dual Belt (Y: 230..248)
  p.fillRect(0, 230, 256, 8, hexToRgba('#C8A96E')); // Yurakucho Gold
  p.fillRect(0, 238, 256, 2, hexToRgba('#F8FAFC'));
  p.fillRect(0, 240, 256, 8, hexToRgba('#8F5126')); // Fukutoshin Brown

  return p.toDataTexture(true);
}

/**
 * Generates louvered HVAC roof air-conditioner unit texture.
 */
function createHvacLouverTexture(): THREE.DataTexture {
  const p = new PixelBufferPainter(128, 64, '#C2C9D1');
  p.addHorizontalBrushGrain(0, 0, 128, 64, 5);
  // Dark louver grille slots on left & right fan bays
  for (let y = 10; y < 54; y += 5) {
    p.fillRect(14, y, 40, 2, hexToRgba('#4B535E'));
    p.fillRect(74, y, 40, 2, hexToRgba('#4B535E'));
  }
  // Center seam
  p.fillRect(63, 4, 2, 56, hexToRgba('#88919C'));
  return p.toDataTexture(true);
}

/**
 * Generates glowing LED destination matrix board texture for each series.
 */
function createDestinationLedTexture(seriesId: RollingStockSeriesId): THREE.DataTexture {
  const p = new PixelBufferPainter(128, 32, '#0A0D12');
  // Outer dark housing border
  p.fillRect(2, 2, 124, 28, hexToRgba('#121720'));

  if (seriesId === 'jr-east-e235-0') {
    // JY green line badge on left + white/green dot matrix text blocks + digital flower motif on right
    p.fillRect(8, 6, 22, 20, hexToRgba('#80C241'));
    p.fillRect(11, 9, 16, 14, hexToRgba('#142810'));
    p.fillRect(13, 11, 12, 10, hexToRgba('#A3E635'));
    // Simulated Japanese/English LED characters
    for (let x = 36; x < 96; x += 6) {
      p.fillRect(x, 9, 4, 14, hexToRgba('#F0FDF4'));
    }
    p.fillRect(104, 8, 14, 16, hexToRgba('#80C241'));
  } else if (seriesId === 'tokyo-metro-1000') {
    // [G] Ginza Orange circle badge + warm amber LED destination characters
    p.fillRect(8, 6, 20, 20, hexToRgba('#FF8C00'));
    for (let x = 34; x < 114; x += 7) {
      p.fillRect(x, 9, 5, 14, hexToRgba('#FBBF24'));
    }
  } else {
    // [Y][F] Gold & Brown badges + crisp white LED characters
    p.fillRect(6, 6, 16, 20, hexToRgba('#C8A96E'));
    p.fillRect(24, 6, 16, 20, hexToRgba('#8F5126'));
    for (let x = 46; x < 118; x += 6) {
      p.fillRect(x, 9, 4, 14, hexToRgba('#FEF9C3'));
    }
  }
  return p.toDataTexture(true);
}

export interface SeriesSharedMaterials {
  readonly seriesId: RollingStockSeriesId;
  readonly bodyPrimary: THREE.MeshStandardMaterial;
  readonly bodySecondary: THREE.MeshStandardMaterial;
  readonly roof: THREE.MeshStandardMaterial;
  readonly primaryStripe: THREE.MeshStandardMaterial;
  readonly secondaryStripe: THREE.MeshStandardMaterial;
  readonly doorLeaf: THREE.MeshStandardMaterial;
  readonly frontMask: THREE.MeshStandardMaterial;
  readonly windowGlass: THREE.MeshStandardMaterial;
  readonly destinationLed: THREE.MeshStandardMaterial;
  readonly hvacUnit: THREE.MeshStandardMaterial;
  readonly bogieFrame: THREE.MeshStandardMaterial;
  readonly wheelSteel: THREE.MeshStandardMaterial;
  readonly pantographMetal: THREE.MeshStandardMaterial;
  readonly gangwayBellows: THREE.MeshStandardMaterial;
  readonly collectorShoe: THREE.MeshStandardMaterial;
}

/**
 * Per-consist dynamic lighting material bundle so each train consist can independently control:
 *  - Travel direction ('forward' vs 'reverse', swapping active headlights & taillights between Car 1 and Car N)
 *  - Headlight & taillight ON/OFF state and brightness
 *  - Interior cabin window night illumination
 */
export interface ConsistDynamicLightMaterials {
  /** Applied to Lead Car #1 (+X front end) headlights */
  readonly frontEndHeadlight: THREE.MeshStandardMaterial;
  /** Applied to Lead Car #1 (+X front end) taillights */
  readonly frontEndTaillight: THREE.MeshStandardMaterial;
  /** Applied to Tail Car #N (-X rear end) headlights */
  readonly rearEndHeadlight: THREE.MeshStandardMaterial;
  /** Applied to Tail Car #N (-X rear end) taillights */
  readonly rearEndTaillight: THREE.MeshStandardMaterial;
  /** Applied to destination LED boards */
  readonly destinationSign: THREE.MeshStandardMaterial;
  /** Applied to passenger window glass (supports subtle interior cabin glow at night) */
  readonly cabinWindowGlass: THREE.MeshStandardMaterial;
  dispose(): void;
}

export class RollingStockMaterialRegistry {
  private static instance: RollingStockMaterialRegistry | null = null;

  static getInstance(): RollingStockMaterialRegistry {
    if (!RollingStockMaterialRegistry.instance) {
      RollingStockMaterialRegistry.instance = new RollingStockMaterialRegistry();
    }
    return RollingStockMaterialRegistry.instance;
  }

  private readonly cache = new Map<RollingStockSeriesId, SeriesSharedMaterials>();
  private readonly textures: THREE.Texture[] = [];

  getSeriesMaterials(seriesId: RollingStockSeriesId): SeriesSharedMaterials {
    const existing = this.cache.get(seriesId);
    if (existing) return existing;

    const created = this.buildSeriesMaterials(seriesId);
    this.cache.set(seriesId, created);
    return created;
  }

  /**
   * Creates lightweight per-consist light materials that respond to `applyLightState`.
   */
  createConsistLightMaterials(seriesId: RollingStockSeriesId): ConsistDynamicLightMaterials {
    const base = this.getSeriesMaterials(seriesId);

    const frontEndHeadlight = new THREE.MeshStandardMaterial({
      name: `${seriesId}-front-headlight`,
      color: 0xfffbeb,
      emissive: 0xfff0b3,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.1,
    });

    const frontEndTaillight = new THREE.MeshStandardMaterial({
      name: `${seriesId}-front-taillight`,
      color: 0x3b1216,
      emissive: 0xdc2626,
      emissiveIntensity: 0.0,
      roughness: 0.2,
      metalness: 0.1,
    });

    const rearEndHeadlight = new THREE.MeshStandardMaterial({
      name: `${seriesId}-rear-headlight`,
      color: 0x2a3038,
      emissive: 0xfff0b3,
      emissiveIntensity: 0.0,
      roughness: 0.2,
      metalness: 0.1,
    });

    const rearEndTaillight = new THREE.MeshStandardMaterial({
      name: `${seriesId}-rear-taillight`,
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.25,
      roughness: 0.18,
      metalness: 0.1,
    });

    const destinationSign = base.destinationLed.clone();
    const cabinWindowGlass = base.windowGlass.clone();

    return {
      frontEndHeadlight,
      frontEndTaillight,
      rearEndHeadlight,
      rearEndTaillight,
      destinationSign,
      cabinWindowGlass,
      dispose() {
        frontEndHeadlight.dispose();
        frontEndTaillight.dispose();
        rearEndHeadlight.dispose();
        rearEndTaillight.dispose();
        destinationSign.dispose();
        cabinWindowGlass.dispose();
      },
    };
  }

  /**
   * Updates the per-consist dynamic light materials according to travel direction and light switches.
   */
  applyConsistLightState(
    mats: ConsistDynamicLightMaterials,
    direction: TravelDirection,
    lights: TrainLightState,
  ): void {
    const b = Math.max(0, Math.min(2.5, lights.brightness));
    const forwardActive = direction === 'forward';

    const frontHeadOn = lights.headlights && forwardActive;
    const frontTailOn = lights.taillights && !forwardActive;
    const rearHeadOn = lights.headlights && !forwardActive;
    const rearTailOn = lights.taillights && forwardActive;

    mats.frontEndHeadlight.color.setHex(frontHeadOn ? 0xfffbeb : 0x262c34);
    mats.frontEndHeadlight.emissiveIntensity = frontHeadOn ? 1.45 * b : 0.0;

    mats.frontEndTaillight.color.setHex(frontTailOn ? 0xff4d4d : 0x331215);
    mats.frontEndTaillight.emissiveIntensity = frontTailOn ? 1.3 * b : 0.0;

    mats.rearEndHeadlight.color.setHex(rearHeadOn ? 0xfffbeb : 0x262c34);
    mats.rearEndHeadlight.emissiveIntensity = rearHeadOn ? 1.45 * b : 0.0;

    mats.rearEndTaillight.color.setHex(rearTailOn ? 0xff4d4d : 0x331215);
    mats.rearEndTaillight.emissiveIntensity = rearTailOn ? 1.3 * b : 0.0;

    mats.destinationSign.emissiveIntensity = lights.destinationSign ? 0.95 * b : 0.0;

    if (lights.interiorLights) {
      mats.cabinWindowGlass.emissive.setHex(0xfde68a);
      mats.cabinWindowGlass.emissiveIntensity = 0.28 * b;
    } else {
      mats.cabinWindowGlass.emissive.setHex(0x000000);
      mats.cabinWindowGlass.emissiveIntensity = 0.0;
    }
  }

  private buildSeriesMaterials(seriesId: RollingStockSeriesId): SeriesSharedMaterials {
    const hvacTex = createHvacLouverTexture();
    const destTex = createDestinationLedTexture(seriesId);
    this.textures.push(hvacTex, destTex);

    const hvacUnit = new THREE.MeshStandardMaterial({
      name: `${seriesId}-hvac`,
      map: hvacTex,
      color: 0xd0d6dc,
      roughness: 0.46,
      metalness: 0.38,
    });

    const bogieFrame = new THREE.MeshStandardMaterial({
      name: `${seriesId}-bogie-frame`,
      color: 0x262b33,
      roughness: 0.72,
      metalness: 0.45,
    });

    const wheelSteel = new THREE.MeshStandardMaterial({
      name: `${seriesId}-wheel-steel`,
      color: 0xa2abb5,
      roughness: 0.24,
      metalness: 0.88,
    });

    const pantographMetal = new THREE.MeshStandardMaterial({
      name: `${seriesId}-pantograph`,
      color: 0xa4acb6,
      roughness: 0.35,
      metalness: 0.78,
    });

    const gangwayBellows = new THREE.MeshStandardMaterial({
      name: `${seriesId}-gangway`,
      color: 0x1e2229,
      roughness: 0.88,
      metalness: 0.06,
    });

    const collectorShoe = new THREE.MeshStandardMaterial({
      name: `${seriesId}-collector-shoe`,
      color: 0xf59e0b,
      roughness: 0.42,
      metalness: 0.25,
    });

    const destinationLed = new THREE.MeshStandardMaterial({
      name: `${seriesId}-dest-led`,
      map: destTex,
      emissiveMap: destTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.1,
    });

    if (seriesId === 'jr-east-e235-0') {
      const doorTex = createE235DoorTexture();
      const brushedTex = new PixelBufferPainter(128, 128, '#D6DCE2');
      brushedTex.addHorizontalBrushGrain(0, 0, 128, 128, 8);
      const bodyTex = brushedTex.toDataTexture(true);
      this.textures.push(doorTex, bodyTex);

      return {
        seriesId,
        bodyPrimary: new THREE.MeshStandardMaterial({
          name: 'e235-sustina-stainless',
          map: bodyTex,
          color: 0xdce2e8,
          roughness: 0.25,
          metalness: 0.84,
          envMapIntensity: 1.25,
        }),
        bodySecondary: new THREE.MeshStandardMaterial({
          name: 'e235-skirt-white',
          color: 0xecf0f3,
          roughness: 0.36,
          metalness: 0.22,
        }),
        roof: new THREE.MeshStandardMaterial({
          name: 'e235-roof',
          color: 0x9aa3ad,
          roughness: 0.62,
          metalness: 0.42,
        }),
        primaryStripe: new THREE.MeshStandardMaterial({
          name: 'e235-uguisu-green',
          color: 0x80c241,
          roughness: 0.32,
          metalness: 0.14,
        }),
        secondaryStripe: new THREE.MeshStandardMaterial({
          name: 'e235-dark-trim',
          color: 0x161b22,
          roughness: 0.3,
          metalness: 0.2,
        }),
        doorLeaf: new THREE.MeshStandardMaterial({
          name: 'e235-door-leaf',
          map: doorTex,
          color: 0xffffff,
          roughness: 0.28,
          metalness: 0.55,
        }),
        frontMask: new THREE.MeshStandardMaterial({
          name: 'e235-front-black-glass',
          color: 0x10151c,
          roughness: 0.11,
          metalness: 0.28,
          envMapIntensity: 1.5,
        }),
        windowGlass: new THREE.MeshStandardMaterial({
          name: 'e235-window-glass',
          color: 0x182b36,
          roughness: 0.12,
          metalness: 0.35,
          envMapIntensity: 1.4,
        }),
        destinationLed,
        hvacUnit,
        bogieFrame,
        wheelSteel,
        pantographMetal,
        gangwayBellows,
        collectorShoe,
      };
    }

    if (seriesId === 'tokyo-metro-1000') {
      const sideTex = createGinza1000SideTexture();
      const door1000Tex = createGinza1000DoorTexture();
      this.textures.push(sideTex, door1000Tex);

      return {
        seriesId,
        bodyPrimary: new THREE.MeshStandardMaterial({
          name: 'metro1000-lemon-yellow',
          map: sideTex,
          color: 0xffffff,
          roughness: 0.24,
          metalness: 0.12,
          envMapIntensity: 1.15,
        }),
        bodySecondary: new THREE.MeshStandardMaterial({
          name: 'metro1000-pure-yellow',
          color: 0xf5b100,
          roughness: 0.24,
          metalness: 0.12,
        }),
        roof: new THREE.MeshStandardMaterial({
          name: 'metro1000-maroon-roof',
          color: 0x683024,
          roughness: 0.68,
          metalness: 0.08,
        }),
        primaryStripe: new THREE.MeshStandardMaterial({
          name: 'metro1000-ginza-orange',
          color: 0xff8c00,
          roughness: 0.3,
          metalness: 0.1,
        }),
        secondaryStripe: new THREE.MeshStandardMaterial({
          name: 'metro1000-cream-white-trim',
          color: 0xf8fafc,
          roughness: 0.32,
          metalness: 0.08,
        }),
        doorLeaf: new THREE.MeshStandardMaterial({
          name: 'metro1000-door-leaf',
          map: door1000Tex,
          color: 0xffffff,
          roughness: 0.26,
          metalness: 0.14,
        }),
        frontMask: new THREE.MeshStandardMaterial({
          name: 'metro1000-front-trim',
          color: 0x262930,
          roughness: 0.28,
          metalness: 0.4,
        }),
        windowGlass: new THREE.MeshStandardMaterial({
          name: 'metro1000-window-glass',
          color: 0x1a2632,
          roughness: 0.12,
          metalness: 0.32,
          envMapIntensity: 1.35,
        }),
        destinationLed,
        hvacUnit,
        bogieFrame,
        wheelSteel,
        pantographMetal,
        gangwayBellows,
        collectorShoe,
      };
    }

    // Tokyo Metro 17000 Series (Yurakucho & Fukutoshin Lines)
    const side17000Tex = createMetro17000SideTexture();
    const door17000Tex = createMetro17000DoorTexture();
    this.textures.push(side17000Tex, door17000Tex);

    return {
      seriesId,
      bodyPrimary: new THREE.MeshStandardMaterial({
        name: 'metro17000-atrain-aluminum',
        map: side17000Tex,
        color: 0xffffff,
        roughness: 0.27,
        metalness: 0.78,
        envMapIntensity: 1.25,
      }),
      bodySecondary: new THREE.MeshStandardMaterial({
        name: 'metro17000-champagne-gold-skirt',
        color: 0xc5a467,
        roughness: 0.28,
        metalness: 0.65,
      }),
      roof: new THREE.MeshStandardMaterial({
        name: 'metro17000-roof',
        color: 0x9aa2ad,
        roughness: 0.58,
        metalness: 0.45,
      }),
      primaryStripe: new THREE.MeshStandardMaterial({
        name: 'metro17000-yurakucho-gold',
        color: 0xc8a96e,
        roughness: 0.3,
        metalness: 0.52,
      }),
      secondaryStripe: new THREE.MeshStandardMaterial({
        name: 'metro17000-fukutoshin-brown',
        color: 0x8f5126,
        roughness: 0.36,
        metalness: 0.24,
      }),
      doorLeaf: new THREE.MeshStandardMaterial({
        name: 'metro17000-door-leaf',
        map: door17000Tex,
        color: 0xffffff,
        roughness: 0.28,
        metalness: 0.65,
      }),
      frontMask: new THREE.MeshStandardMaterial({
        name: 'metro17000-aero-black-dome',
        color: 0x0e131a,
        roughness: 0.1,
        metalness: 0.32,
        envMapIntensity: 1.6,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        name: 'metro17000-window-glass',
        color: 0x16222d,
        roughness: 0.12,
        metalness: 0.35,
        envMapIntensity: 1.4,
      }),
      destinationLed,
      hvacUnit,
      bogieFrame,
      wheelSteel,
      pantographMetal,
      gangwayBellows,
      collectorShoe,
    };
  }
}
