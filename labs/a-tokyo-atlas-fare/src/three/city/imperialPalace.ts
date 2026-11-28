/**
 * Procedural 3D Imperial Palace (皇居 / Edo Castle Complex) & Kitanomaru Nippon Budokan Model
 * for SENKIRO Atlas v2.
 *
 * Pure Three.js geometry (zero external assets, zero DOM dependencies, ~8 merged draw calls):
 *  - Complete Imperial Palace Outer & Inner Moat Water Ring (桜田濠・日比谷濠・馬場先濠・和田倉濠・大手濠・平川濠・桔梗濠・二重橋濠)
 *  - Elevated Castle Plateau & Battered Granite Ishigaki Retaining Walls (石垣)
 *  - Kokyo Gaien Outer Garden Emerald Pine Lawn & Compact Gravel Forecourt (皇居外苑・皇居前広場)
 *  - Kyuden Imperial Palace Complex with Signature Verdigris Copper Hipped Roofs (皇居宮殿)
 *  - Nijubashi Twin-Arch Bridge & Seimon Gatehouse (二重橋・正門)
 *  - Edo Castle Tenshudai Monumental Stone Donjon Foundation (江戸城天守台)
 *  - Fujimi-yagura & Sakurada-Tatsumi Yagura Multi-Tiered Turrets (富士見櫓・巽櫓)
 *  - Otemon, Kikyomon & Sakuradamon Masugata Castle Gates (大手門・桔梗門・桜田門)
 *  - Nippon Budokan Octagonal Hall & Golden Giboshi Finial in Kitanomaru Park (日本武道館)
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SURFACE_ELEVATION_LAYERS } from '../../contracts/atlasV2.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import { pointInPoly } from './cityGeometryHelpers.js';

export const IMPERIAL_PALACE_PLATEAU_Y = 4.2;

/**
 * Inner moat-enclosed Imperial Palace & East Gardens plateau perimeter (world meters relative to Tokyo Station).
 * Traces the true Edo Castle rampart bordered by Hanzo-bori, Sakurada-bori, Nijubashi/Kikyo-bori,
 * Ote/Hirakawa-bori, and Kitanomaru Park.
 */
export const IMPERIAL_PALACE_INNER_POLY: [number, number][] = [
  [-1680, -960],
  [-1260, -1040],
  [-880, -990],
  [-665, -860],
  [-600, -420],
  [-745, -205],
  [-1015, -45],
  [-1145, 130],
  [-1250, 290],
  [-1480, 405],
  [-1860, 260],
  [-1915, -180],
  [-1855, -620],
];

/**
 * Continuous outer & inner Imperial Palace moat water polygons (matching real Tokyo moat ring
 * where OSM urban-water-parks.json omitted the southern/eastern moats).
 */
export const IMPERIAL_PALACE_MOAT_POLYS: readonly (readonly [number, number][])[] = [
  // 1. 桜田濠 (Sakurada-bori: Hanzomon -> Miyakezaka -> Sakuradamon West)
  [
    [-1985, -220],
    [-2035, 140],
    [-1985, 375],
    [-1505, 530],
    [-1365, 515],
    [-1365, 455],
    [-1495, 435],
    [-1880, 275],
    [-1935, -180],
  ],
  // 2. 凱旋濠・日比谷濠 (Gaisen-bori & Hibiya-bori: Sakuradamon East -> Hibiya -> Babasaki)
  [
    [-1260, 520],
    [-695, 580],
    [-565, 190],
    [-515, -80],
    [-585, -95],
    [-635, 180],
    [-740, 490],
    [-1250, 455],
  ],
  // 3. 馬場先濠・和田倉濠 (Babasaki-bori & Wadakura-bori)
  [
    [-585, -95],
    [-510, -80],
    [-505, -420],
    [-585, -420],
    [-580, -160],
  ],
  // 4. 大手濠・平川濠 (Ote-bori & Hirakawa-bori: Otemon -> Takebashi)
  [
    [-585, -420],
    [-505, -440],
    [-605, -920],
    [-930, -1075],
    [-960, -1015],
    [-665, -865],
    [-595, -445],
  ],
  // 5. 桔梗濠・蛤濠・二重橋濠 (Kikyo-bori, Hamaguri-bori & Nijubashi-bori)
  [
    [-1255, 310],
    [-1140, 145],
    [-1010, -35],
    [-740, -200],
    [-620, -390],
    [-670, -415],
    [-795, -250],
    [-1055, -75],
    [-1185, 125],
    [-1295, 280],
  ],
];

/**
 * Full 15-vertex protected Imperial Palace + Kitanomaru Park + Kokyo Gaien perimeter
 * tightly hugging Uchibori-dori / outer moats so peripheral city blocks fill cleanly right up to the avenue.
 */
export const IMPERIAL_PALACE_EXCLUSION_POLY: [number, number][] = [
  [-1740, -1510],
  [-1260, -1520],
  [-930, -1090],
  [-600, -930],
  [-500, -420],
  [-495, -80],
  [-555, 220],
  [-695, 605],
  [-1360, 550],
  [-1510, 545],
  [-1995, 380],
  [-2050, 125],
  [-1980, -250],
  [-2015, -745],
  [-1940, -1260],
];

export const IMPERIAL_PALACE_ARCHITECTURAL_FOOTPRINTS: readonly {
  x: number;
  z: number;
  r: number;
}[] = [
  { x: -1356, z: -144, r: 95 }, // Kyuden Imperial Palace & East Courtyard
  { x: -1221, z: 100, r: 42 }, // Nijubashi & Seimon
  { x: -1121, z: -833, r: 44 }, // Edo Castle Tenshudai
  { x: -958, z: -645, r: 78 }, // Honmaru East Gardens central lawn clearing
  { x: -1085, z: -356, r: 28 }, // Fujimi-yagura
  { x: -732, z: -156, r: 24 }, // Sakurada-Tatsumi Yagura
  { x: -687, z: -389, r: 34 }, // Otemon
  { x: -877, z: -133, r: 30 }, // Kikyomon
  { x: -1320, z: 511, r: 36 }, // Sakuradamon
  { x: -1555, z: -1345, r: 70 }, // Nippon Budokan
];

export function isPointOnImperialPlateau(x: number, z: number): boolean {
  if (x < -1930 || x > -585 || z < -1060 || z > 420) return false;
  return pointInPoly(x, z, IMPERIAL_PALACE_INNER_POLY);
}

export function isPointInImperialExclusion(x: number, z: number): boolean {
  if (x < -2060 || x > -485 || z < -1530 || z > 620) return false;
  return pointInPoly(x, z, IMPERIAL_PALACE_EXCLUSION_POLY);
}

export function isPointInImperialMoat(x: number, z: number): boolean {
  if (x < -2050 || x > -495 || z < -1090 || z > 600) return false;
  for (let i = 0; i < IMPERIAL_PALACE_MOAT_POLYS.length; i++) {
    if (pointInPoly(x, z, IMPERIAL_PALACE_MOAT_POLYS[i] as [number, number][])) return true;
  }
  return false;
}

export interface ImperialPalaceHandle {
  readonly group: THREE.Group;
  setTheme(isDark: boolean): void;
  setNightFactor(nightFactor: number): void;
  setOpacity(opacity: number, isTranslucent: boolean): void;
  dispose(): void;
}

function toNonIndexedClean(geom: THREE.BufferGeometry, includeWorldUv = false): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (g !== geom) geom.dispose();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  for (const attr of Object.keys(g.attributes)) {
    if (attr !== 'position' && attr !== 'normal') {
      g.deleteAttribute(attr);
    }
  }
  if (includeWorldUv) {
    const pos = g.getAttribute('position');
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i);
      uvs[i * 2 + 1] = pos.getZ(i);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  return g;
}

function makeBox(
  cx: number,
  cz: number,
  w: number,
  d: number,
  baseY: number,
  h: number,
  rotY = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(cx, baseY + h * 0.5, cz);
  return toNonIndexedClean(g);
}

function makeTaperedStoneBase(
  cx: number,
  cz: number,
  botW: number,
  botD: number,
  topW: number,
  topD: number,
  baseY: number,
  h: number,
  rotY = 0,
): THREE.BufferGeometry {
  const topRatio = Math.max(0.25, (topW + topD) / Math.max(1, botW + botD));
  const g = new THREE.CylinderGeometry(topRatio, 1.0, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(botW / Math.SQRT2, 1, botD / Math.SQRT2);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(cx, baseY + h * 0.5, cz);
  return toNonIndexedClean(g);
}

function makeHippedRoof(
  cx: number,
  cz: number,
  w: number,
  d: number,
  baseY: number,
  peakH: number,
  rotY = 0,
): THREE.BufferGeometry {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const ridgeAlongX = w >= d;
  const rx = ridgeAlongX ? Math.max(0, hw - hd * 0.68) : 0;
  const rz = ridgeAlongX ? 0 : Math.max(0, hd - hw * 0.68);

  const p: [number, number, number][] = [
    [-hw, 0, -hd],
    [hw, 0, -hd],
    [hw, 0, hd],
    [-hw, 0, hd],
    [-rx, peakH, -rz],
    [rx, peakH, rz],
  ];

  const tris = ridgeAlongX
    ? [
        [0, 4, 5],
        [0, 5, 1],
        [2, 5, 4],
        [2, 4, 3],
        [3, 4, 0],
        [1, 5, 2],
        [0, 1, 2],
        [0, 2, 3],
      ]
    : [
        [0, 4, 5],
        [0, 5, 3],
        [2, 5, 4],
        [2, 4, 1],
        [0, 1, 4],
        [3, 5, 2],
        [0, 1, 2],
        [0, 2, 3],
      ];

  const pos: number[] = [];
  for (const [ia, ib, ic] of tris) {
    for (const idx of [ia!, ib!, ic!]) {
      pos.push(p[idx]![0], p[idx]![1], p[idx]![2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(cx, baseY, cz);
  return g;
}

function insetPolygon(pts: readonly [number, number][], insetM: number): [number, number][] {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of pts) {
    cx += x;
    cz += z;
  }
  cx /= pts.length;
  cz /= pts.length;
  return pts.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const scale = Math.max(0.5, (len - insetM) / len);
    return [cx + dx * scale, cz + dz * scale];
  });
}

function buildPolygonTop(
  pts: readonly [number, number][],
  y: number,
  includeWorldUv = false,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0]![0], -pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i]![0], -pts[i]![1]);
  }
  shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);
  return toNonIndexedClean(geom, includeWorldUv);
}

function buildBatteredWallSkirt(
  outerPts: readonly [number, number][],
  innerPts: readonly [number, number][],
  yBot: number,
  yTop: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = outerPts.length;

  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = outerPts[i]!;
    const [x2, z2] = outerPts[(i + 1) % n]!;
    area2 += x1 * z2 - x2 * z1;
  }
  const cw = area2 > 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ox0, oz0] = outerPts[i]!;
    const [ox1, oz1] = outerPts[j]!;
    const [ix0, iz0] = innerPts[i]!;
    const [ix1, iz1] = innerPts[j]!;

    const b0: [number, number, number] = [ox0, yBot, oz0];
    const b1: [number, number, number] = [ox1, yBot, oz1];
    const t0: [number, number, number] = [ix0, yTop, iz0];
    const t1: [number, number, number] = [ix1, yTop, iz1];

    if (cw) {
      pos.push(...b0, ...t0, ...b1, ...b1, ...t0, ...t1);
    } else {
      pos.push(...b0, ...b1, ...t0, ...b1, ...t1, ...t0);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildImperialPalaceModel(
  isDark: boolean,
  clipPlanes: THREE.Plane[],
  waterMaterial: THREE.MeshStandardMaterial,
  cutawayUniforms?: CutawayUniforms,
): ImperialPalaceHandle {
  const group = new THREE.Group();
  group.name = 'imperial-palace-3d';

  const mkMat = (opts: THREE.MeshStandardMaterialParameters, kind: 'terrain' | 'building') => {
    const mat = new THREE.MeshStandardMaterial({
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      side: THREE.FrontSide,
      clippingPlanes: clipPlanes,
      ...opts,
    });
    if (cutawayUniforms) injectRadialCutaway(mat, cutawayUniforms, kind);
    return mat;
  };

  const stoneWallMat = mkMat(
    {
      color: isDark ? 0x4b5563 : 0x9b978f,
      roughness: 0.92,
      metalness: 0.04,
    },
    'building',
  );
  const plateauGroundMat = mkMat(
    {
      color: isDark ? 0x1b3424 : 0x5c854e,
      roughness: 0.95,
      metalness: 0.0,
    },
    'terrain',
  );
  const gravelPlazaMat = mkMat(
    {
      color: isDark ? 0x2c3440 : 0xd6d0c4,
      roughness: 0.94,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: 1.5,
      polygonOffsetUnits: 1.5,
    },
    'terrain',
  );
  const plasterWallMat = mkMat(
    {
      color: isDark ? 0xa3adb8 : 0xf2eee6,
      emissive: isDark ? 0xffe4b5 : 0x000000,
      emissiveIntensity: isDark ? 0.16 : 0.0,
      roughness: 0.85,
      metalness: 0.02,
    },
    'building',
  );
  const slateRoofMat = mkMat(
    {
      color: isDark ? 0x26313d : 0x3f4954,
      roughness: 0.72,
      metalness: 0.14,
    },
    'building',
  );
  const verdigrisRoofMat = mkMat(
    {
      color: isDark ? 0x244943 : 0x3c7a6e,
      roughness: 0.62,
      metalness: 0.24,
    },
    'building',
  );
  const goldAccentMat = mkMat(
    {
      color: 0xd9a83e,
      emissive: isDark ? 0xb47b1e : 0x000000,
      emissiveIntensity: isDark ? 0.35 : 0.0,
      roughness: 0.34,
      metalness: 0.78,
    },
    'building',
  );

  const stoneGeoms: THREE.BufferGeometry[] = [];
  const groundGeoms: THREE.BufferGeometry[] = [];
  const gravelGeoms: THREE.BufferGeometry[] = [];
  const plasterGeoms: THREE.BufferGeometry[] = [];
  const slateGeoms: THREE.BufferGeometry[] = [];
  const verdigrisGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];
  const moatWaterGeoms: THREE.BufferGeometry[] = [];

  const P_Y = IMPERIAL_PALACE_PLATEAU_Y;

  // ---- 0. Complete Outer & Inner Imperial Moat Ring ----
  const moatWaterY = SURFACE_ELEVATION_LAYERS.riverWaterMinY + 0.018;
  for (const poly of IMPERIAL_PALACE_MOAT_POLYS) {
    moatWaterGeoms.push(buildPolygonTop(poly, moatWaterY, true));
  }

  // ---- 1. Elevated Castle Plateau & Battered Ishigaki Moat Walls ----
  const innerTopPts = insetPolygon(IMPERIAL_PALACE_INNER_POLY, 6.0);
  stoneGeoms.push(buildBatteredWallSkirt(IMPERIAL_PALACE_INNER_POLY, innerTopPts, -1.25, P_Y));
  groundGeoms.push(buildPolygonTop(innerTopPts, P_Y));

  // Honmaru East Gardens slightly raised inner lawn terrace (-958, -645)
  const honmaruLawnPts: [number, number][] = [
    [-1080, -760],
    [-850, -760],
    [-830, -540],
    [-1050, -520],
  ];
  stoneGeoms.push(
    buildBatteredWallSkirt(honmaruLawnPts, insetPolygon(honmaruLawnPts, 2.5), P_Y - 0.2, P_Y + 0.55),
  );
  groundGeoms.push(buildPolygonTop(insetPolygon(honmaruLawnPts, 2.5), P_Y + 0.55));

  // ---- 2. Kokyo Gaien Outer Garden Emerald Lawn & Compact Ceremonial Gravel Forecourt ----
  const kokyoGaienLawnPts: [number, number][] = [
    [-1350, 470],
    [-725, 495],
    [-585, 170],
    [-585, -240],
    [-785, -250],
    [-1050, -60],
    [-1245, 305],
  ];
  groundGeoms.push(buildPolygonTop(kokyoGaienLawnPts, SURFACE_ELEVATION_LAYERS.parkMinY + 0.008));

  // Compact ceremonial white-gravel forecourt directly facing Nijubashi (皇居前広場)
  const gaienPlazaPts: [number, number][] = [
    [-1165, 165],
    [-920, 120],
    [-895, 295],
    [-1155, 325],
  ];
  gravelGeoms.push(buildPolygonTop(gaienPlazaPts, SURFACE_ELEVATION_LAYERS.sidewalkPlazaY + 0.015));

  // Gyoko-dori ceremonial approach promenade toward Tokyo Station
  const gyokoPathPts: [number, number][] = [
    [-920, 30],
    [-575, -25],
    [-575, 35],
    [-920, 85],
  ];
  gravelGeoms.push(buildPolygonTop(gyokoPathPts, SURFACE_ELEVATION_LAYERS.sidewalkPlazaY + 0.012));

  // ---- 3. Kyuden Imperial Palace Complex (皇居宮殿 at -1356, -144) ----
  const kyX = -1356;
  const kyZ = -144;
  stoneGeoms.push(makeBox(kyX, kyZ, 128, 168, P_Y - 0.3, 2.3, 0.06));
  plasterGeoms.push(makeBox(kyX - 24, kyZ, 26, 118, P_Y + 2.0, 9.5, 0.06));
  verdigrisGeoms.push(makeHippedRoof(kyX - 24, kyZ, 34, 128, P_Y + 11.4, 5.2, 0.06));
  plasterGeoms.push(makeBox(kyX + 10, kyZ - 48, 52, 22, P_Y + 2.0, 8.2, 0.06));
  verdigrisGeoms.push(makeHippedRoof(kyX + 10, kyZ - 48, 58, 29, P_Y + 10.1, 4.2, 0.06));
  plasterGeoms.push(makeBox(kyX + 10, kyZ + 48, 52, 22, P_Y + 2.0, 8.2, 0.06));
  verdigrisGeoms.push(makeHippedRoof(kyX + 10, kyZ + 48, 58, 29, P_Y + 10.1, 4.2, 0.06));
  gravelGeoms.push(makeBox(kyX + 14, kyZ, 48, 72, P_Y + 2.0, 0.25, 0.06));
  goldGeoms.push(makeBox(kyX - 24, kyZ, 1.8, 76, P_Y + 16.4, 0.8, 0.06));

  // ---- 4. Nijubashi Twin-Arch Bridge & Seimon Gatehouse (二重橋 at -1221, 100) ----
  stoneGeoms.push(makeBox(-1215, 138, 15, 76, -1.0, 4.5, 0.22));
  plasterGeoms.push(makeBox(-1222, 138, 1.6, 74, 3.5, 1.1, 0.22));
  plasterGeoms.push(makeBox(-1208, 138, 1.6, 74, 3.5, 1.1, 0.22));
  stoneGeoms.push(makeTaperedStoneBase(-1226, 86, 36, 22, 31, 18, P_Y - 0.5, 3.8, 0.22));
  plasterGeoms.push(makeBox(-1226, 86, 26, 13, P_Y + 3.3, 6.2, 0.22));
  slateGeoms.push(makeHippedRoof(-1226, 86, 31, 18, P_Y + 9.4, 4.0, 0.22));

  // ---- 5. Edo Castle Tenshudai Stone Donjon Foundation (天守台 at -1121, -833) ----
  stoneGeoms.push(makeTaperedStoneBase(-1121, -833, 52, 56, 36, 40, P_Y - 0.4, 12.5, 0.04));
  stoneGeoms.push(makeTaperedStoneBase(-1121, -802, 22, 18, 16, 12, P_Y - 0.4, 7.2, 0.04));

  // ---- 6. Fujimi-yagura & Sakurada-Tatsumi Yagura Turrets ----
  const addTurret = (tx: number, tz: number, baseW: number, tiers: number, rotY = 0) => {
    stoneGeoms.push(
      makeTaperedStoneBase(tx, tz, baseW + 8, baseW + 8, baseW + 2, baseW + 2, P_Y - 0.4, 4.5, rotY),
    );
    let curY = P_Y + 4.1;
    for (let t = 0; t < tiers; t++) {
      const s = 1 - t * 0.22;
      const w = baseW * 0.72 * s;
      const wallH = 4.6 - t * 0.45;
      plasterGeoms.push(makeBox(tx, tz, w, w, curY, wallH, rotY));
      const eaveW = w + 4.2;
      slateGeoms.push(
        makeHippedRoof(tx, tz, eaveW, eaveW, curY + wallH - 0.1, 2.8 - t * 0.25, rotY),
      );
      curY += wallH + 1.2;
    }
  };
  addTurret(-1085, -356, 20, 3, 0.08);
  addTurret(-732, -156, 15, 2, -0.15);

  // ---- 7. Masugata Castle Gates: Otemon, Kikyomon & Sakuradamon ----
  const addCastleGate = (gx: number, gz: number, rotY: number, spanW: number) => {
    stoneGeoms.push(makeBox(gx, gz, spanW * 0.52, 46, -1.0, 2.2, rotY));
    stoneGeoms.push(makeTaperedStoneBase(gx, gz, spanW + 10, 22, spanW + 5, 17, -1.0, 6.2, rotY));
    plasterGeoms.push(makeBox(gx, gz, spanW, 11, 5.1, 5.4, rotY));
    slateGeoms.push(makeHippedRoof(gx, gz, spanW + 5.5, 15.5, 10.4, 3.6, rotY));
  };
  addCastleGate(-687, -389, 1.38, 28); // 大手門 (Otemon)
  addCastleGate(-877, -133, 1.32, 24); // 桔梗門 (Kikyomon)
  addCastleGate(-1320, 511, 0.12, 28); // 桜田門 (Sakuradamon)

  // ---- 8. Nippon Budokan Octagonal Hall (日本武道館 at -1555, -1345) ----
  const bkX = -1555;
  const bkZ = -1345;
  const bkPlinth = new THREE.CylinderGeometry(52, 56, 5.2, 8);
  bkPlinth.rotateY(Math.PI / 8);
  bkPlinth.translate(bkX, 1.35, bkZ);
  stoneGeoms.push(toNonIndexedClean(bkPlinth));

  const bkBody = new THREE.CylinderGeometry(45, 48, 16, 8);
  bkBody.rotateY(Math.PI / 8);
  bkBody.translate(bkX, 11.8, bkZ);
  plasterGeoms.push(toNonIndexedClean(bkBody));

  const bkSkirt = new THREE.CylinderGeometry(35, 57, 7.5, 8);
  bkSkirt.rotateY(Math.PI / 8);
  bkSkirt.translate(bkX, 23.0, bkZ);
  slateGeoms.push(toNonIndexedClean(bkSkirt));

  const bkUpperRoof = new THREE.CylinderGeometry(4.5, 38, 15.5, 8);
  bkUpperRoof.rotateY(Math.PI / 8);
  bkUpperRoof.translate(bkX, 34.0, bkZ);
  slateGeoms.push(toNonIndexedClean(bkUpperRoof));

  const bkFinialBase = new THREE.CylinderGeometry(3.2, 4.5, 2.2, 8);
  bkFinialBase.translate(bkX, 42.6, bkZ);
  goldGeoms.push(toNonIndexedClean(bkFinialBase));
  const bkGiboshi = new THREE.SphereGeometry(2.6, 8, 6);
  bkGiboshi.scale(1, 1.35, 1);
  bkGiboshi.translate(bkX, 45.4, bkZ);
  goldGeoms.push(toNonIndexedClean(bkGiboshi));

  const ownedMaterials = [
    stoneWallMat,
    plateauGroundMat,
    gravelPlazaMat,
    plasterWallMat,
    slateRoofMat,
    verdigrisRoofMat,
    goldAccentMat,
  ];

  const addMerged = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    renderOrder: number,
    castShadow = true,
  ) => {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    if (merged) {
      const m = new THREE.Mesh(merged, mat);
      m.name = name;
      m.castShadow = castShadow;
      m.receiveShadow = true;
      m.renderOrder = renderOrder;
      group.add(m);
    }
  };

  addMerged(moatWaterGeoms, waterMaterial, 'imperial-palace-moats-water', 3, false);
  addMerged(stoneGeoms, stoneWallMat, 'imperial-palace-ishigaki-stone', 6, true);
  addMerged(groundGeoms, plateauGroundMat, 'imperial-palace-plateau-ground', 5, false);
  addMerged(gravelGeoms, gravelPlazaMat, 'imperial-palace-gaien-gravel', 5, false);
  addMerged(plasterGeoms, plasterWallMat, 'imperial-palace-plaster-halls', 7, true);
  addMerged(slateGeoms, slateRoofMat, 'imperial-palace-slate-roofs', 7, true);
  addMerged(verdigrisGeoms, verdigrisRoofMat, 'imperial-palace-kyuden-roofs', 7, true);
  addMerged(goldGeoms, goldAccentMat, 'imperial-palace-gold-finials', 8, false);

  return {
    group,
    setTheme(nextDark: boolean): void {
      stoneWallMat.color.setHex(nextDark ? 0x4b5563 : 0x9b978f);
      plateauGroundMat.color.setHex(nextDark ? 0x1b3424 : 0x5c854e);
      gravelPlazaMat.color.setHex(nextDark ? 0x2c3440 : 0xd6d0c4);
      plasterWallMat.color.setHex(nextDark ? 0xa3adb8 : 0xf2eee6);
      slateRoofMat.color.setHex(nextDark ? 0x26313d : 0x3f4954);
      verdigrisRoofMat.color.setHex(nextDark ? 0x244943 : 0x3c7a6e);
      this.setNightFactor(nextDark ? 1.0 : 0.0);
    },
    setNightFactor(nightFactor: number): void {
      const nf = Math.max(0, Math.min(1, nightFactor));
      const t = Math.max(0, Math.min(1, (nf - 0.25) / 0.65));
      const glow = t * t * (3 - 2 * t);

      stoneWallMat.emissive.setHex(glow > 0.002 ? 0xffd29a : 0x000000);
      stoneWallMat.emissiveIntensity = glow * 0.09;

      plasterWallMat.emissive.setHex(glow > 0.002 ? 0xffe0ad : 0x000000);
      plasterWallMat.emissiveIntensity = glow * 0.22;

      goldAccentMat.emissive.setHex(glow > 0.002 ? 0xd4962c : 0x000000);
      goldAccentMat.emissiveIntensity = glow * 0.42;

      gravelPlazaMat.emissive.setHex(glow > 0.002 ? 0xffe0b8 : 0x000000);
      gravelPlazaMat.emissiveIntensity = glow * 0.07;
    },
    setOpacity(opacity: number, isTranslucent: boolean): void {
      for (const m of ownedMaterials) {
        const need = m.transparent !== isTranslucent;
        m.transparent = isTranslucent;
        m.opacity = opacity;
        m.depthWrite = !isTranslucent;
        if (need) m.needsUpdate = true;
      }
    },
    dispose(): void {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of ownedMaterials) m.dispose();
    },
  };
}
