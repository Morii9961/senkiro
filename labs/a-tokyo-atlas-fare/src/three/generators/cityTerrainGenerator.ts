/**
 * Procedural City Ground, Urban Landuse Blocks, Rivers/Coastline, Parks, Paved Sidewalks,
 * Station Plazas, Railway Gravel Yards, UV-Marked Asphalt Roads & Intersections Generator (Atlas v2).
 *
 * Built strictly from real OpenStreetMap Tokyo 23-ward polygons & polylines in base-environment.json
 * plus railway corridors derived from atlas.json.
 *
 * Rendering Stability Guarantees:
 *  - Every surface layer renders strictly opaque (transparent: false, depthWrite: true, FrontSide)
 *    during surface browsing.
 *  - All road/river/sidewalk ribbons use verified upward (+Y) triangle winding.
 *  - Strictly ordered vertical elevation stratification (-1.10m .. +0.135m) + polygonOffset tiers
 *    eliminate Z-fighting & surface flicker during orbit/pan/zoom.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  SURFACE_ELEVATION_LAYERS,
  type CityTerrainElevationSampler,
} from '../../contracts/atlasV2.js';
import {
  detectSurfaceIntersections,
  getEffectiveRiverWidth,
  isSurfaceRiverVisible,
  pointInPoly,
  showcaseZoneBounds,
  TERRAIN_ELEVATION_LEVELS,
} from '../city/cityGeometryHelpers.js';
import {
  buildImperialPalaceModel,
  IMPERIAL_PALACE_ARCHITECTURAL_FOOTPRINTS,
  IMPERIAL_PALACE_INNER_POLY,
  IMPERIAL_PALACE_PLATEAU_Y,
  isPointInImperialMoat,
  isPointOnImperialPlateau,
  type ImperialPalaceHandle,
} from '../city/imperialPalace.js';
import { ShibuyaStreetscapeLayer } from '../city/streetscapeGenerator.js';
import { registerStreetscapeForCutaway } from '../city/streetscapeRegistry.js';
import {
  createAsphaltRoadTextureSet,
  createIndustrialPortTextureSet,
  createIntersectionAsphaltTextureSet,
  createRailYardTextureSet,
  createSidewalkPaverTextureSet,
  createUrbanParcelTextureSet,
  createWaterTextureSet,
  type SurfaceTextureSet,
  type WaterTextureSet,
} from '../city/surfaceTextures.js';
import {
  buildTokyoAirportComplexes,
  type AirportComplexesHandle,
} from '../city/airportComplexes.js';
import {
  buildTokyoBayWaterfront,
  TOKYO_BAY_OCEAN_POLYGON,
  type BayfrontDetailHandle,
} from '../city/tokyoBayWaterfront.js';
import {
  buildTokyoStreetLightNetwork,
  type StreetLightNetworkHandle,
} from '../city/streetLights.js';
import { injectRadialCutaway, type CutawayUniforms } from '../materials/cutawayShader.js';
import { createParkCanopyTexture } from '../materials/facadeLibrary.js';
import type { UrbanBaseEnvironment } from '../types.js';

type UvMode = 'none' | 'world' | 'preserve';

const LEVEL_BY_ID = new Map(TERRAIN_ELEVATION_LEVELS.map((l) => [l.id, l]));
const levelY = (id: string) => LEVEL_BY_ID.get(id)!.y;
const levelPo = (id: string) => LEVEL_BY_ID.get(id)!.poFactor;

function normalizeFlatGeometry(geom: THREE.BufferGeometry, uvMode: UvMode): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (uvMode === 'world') {
    const pos = g.getAttribute('position');
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i);
      uvs[i * 2 + 1] = pos.getZ(i);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  } else if (uvMode === 'none') {
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
  }
  return g;
}

function buildPolygonGeometryXZ(
  pts: [number, number][],
  y: number,
  uvMode: UvMode = 'none',
): THREE.BufferGeometry | null {
  if (pts.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0]![0], -pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i]![0], -pts[i]![1]);
  }
  shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);
  return normalizeFlatGeometry(geom, uvMode);
}

/**
 * Builds an upward-facing (+Y normal) ribbon mesh along a polyline in XZ with optional road UVs.
 * For `uvMode === 'road'`, `u = 0..1` across width and `v = meters / 16` along road length.
 */
function buildRibbonGeometryXZ(
  pts: [number, number][],
  width: number,
  y: number,
  uvMode: 'none' | 'world' | 'road' = 'none',
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const half = width * 0.5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let accumLen = 0;

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!;
    if (i > 0) {
      const prevPt = pts[i - 1]!;
      accumLen += Math.hypot(cur[0] - prevPt[0], cur[1] - prevPt[1]);
    }

    let tPrevX = 0;
    let tPrevZ = 0;
    let tNextX = 0;
    let tNextZ = 0;

    if (i > 0) {
      const p = pts[i - 1]!;
      const dx = cur[0] - p[0];
      const dz = cur[1] - p[1];
      const l = Math.hypot(dx, dz) || 1;
      tPrevX = dx / l;
      tPrevZ = dz / l;
    }
    if (i < pts.length - 1) {
      const n = pts[i + 1]!;
      const dx = n[0] - cur[0];
      const dz = n[1] - cur[1];
      const l = Math.hypot(dx, dz) || 1;
      tNextX = dx / l;
      tNextZ = dz / l;
    }
    if (i === 0) {
      tPrevX = tNextX;
      tPrevZ = tNextZ;
    } else if (i === pts.length - 1) {
      tNextX = tPrevX;
      tNextZ = tPrevZ;
    }

    const nPrevX = -tPrevZ;
    const nPrevZ = tPrevX;
    const nNextX = -tNextZ;
    const nNextZ = tNextX;

    let ux = nPrevX + nNextX;
    let uz = nPrevZ + nNextZ;
    const avgLen = Math.hypot(ux, uz);
    let scale = half;
    if (avgLen > 1e-4) {
      ux /= avgLen;
      uz /= avgLen;
      const dot = ux * nNextX + uz * nNextZ;
      scale = half / Math.max(0.72, dot);
    } else {
      ux = nNextX;
      uz = nNextZ;
    }

    positions.push(cur[0] + ux * scale, y, cur[1] + uz * scale);
    positions.push(cur[0] - ux * scale, y, cur[1] - uz * scale);

    if (uvMode === 'road') {
      const vCoord = accumLen / 16;
      uvs.push(0, vCoord);
      uvs.push(1, vCoord);
    }

    if (i > 0) {
      const base = (i - 1) * 2;
      // Verified upward (+Y) front-face triangle winding
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvMode === 'road') {
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return normalizeFlatGeometry(geom, uvMode === 'road' ? 'preserve' : uvMode);
}

const TREE_CANOPY_DAY_PALETTE = [
  0x4f7c47,
  0x5d8b51,
  0x406c3c,
  0x6a9659,
  0x4a7545,
  0x739c5f,
  0x57834c,
  0x7b9855,
];

const TREE_CANOPY_NIGHT_PALETTE = [
  0x1d3525,
  0x233e2b,
  0x182d20,
  0x294631,
  0x1f3827,
  0x2c4b34,
  0x213a29,
  0x2a442d,
];

function hashTree(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 668265263);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Builds an organic multi-lobe 3D foliage canopy geometry (3 merged low-poly lobes = 60 tris)
 * for ultra-fast instanced urban park & boulevard trees.
 */
function createOrganicCanopyGeometry(): THREE.BufferGeometry {
  const lobeMain = new THREE.IcosahedronGeometry(2.35, 0);
  lobeMain.scale(1.05, 0.92, 1.0);
  lobeMain.translate(0, 4.9, 0);

  const lobeSideA = new THREE.IcosahedronGeometry(1.75, 0);
  lobeSideA.scale(1.05, 0.85, 0.95);
  lobeSideA.translate(1.25, 4.25, 0.65);

  const lobeSideB = new THREE.IcosahedronGeometry(1.65, 0);
  lobeSideB.scale(0.98, 0.88, 1.05);
  lobeSideB.translate(-1.15, 4.4, -0.7);

  const parts = [lobeMain, lobeSideA, lobeSideB].map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (ni.getAttribute('uv')) ni.deleteAttribute('uv');
    ni.computeVertexNormals();
    if (ni !== g) g.dispose();
    return ni;
  });

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) {
    const fallback = new THREE.IcosahedronGeometry(2.3, 0);
    fallback.translate(0, 4.8, 0);
    return fallback;
  }
  return merged;
}

interface TreeInstanceRecord {
  x: number;
  z: number;
  scaleXZ: number;
  scaleY: number;
  rotY: number;
  paletteIdx: number;
}

interface TerrainTextureBundle {
  parcel: SurfaceTextureSet;
  industrialPort: SurfaceTextureSet;
  railYard: SurfaceTextureSet;
  sidewalk: SurfaceTextureSet;
  intersection: SurfaceTextureSet;
  roadTrunk: SurfaceTextureSet;
  roadPrimary: SurfaceTextureSet;
  roadSecondary: SurfaceTextureSet;
  roadTertiary: SurfaceTextureSet;
  water: WaterTextureSet;
  parkMap: THREE.CanvasTexture;
}

export class CityTerrainLayer {
  readonly group = new THREE.Group();
  readonly streetscapeLayer: ShibuyaStreetscapeLayer;
  readonly elevationSampler: CityTerrainElevationSampler = {
    datumKind: 'flat_datum',
    sampleGroundY: () => 0,
  };

  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly bayMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly quayMaterial: THREE.MeshStandardMaterial;
  private readonly parkMaterial: THREE.MeshStandardMaterial;
  private readonly landuseCommercialMat: THREE.MeshStandardMaterial;
  private readonly landuseResidentialMat: THREE.MeshStandardMaterial;
  private readonly landuseIndustrialMat: THREE.MeshStandardMaterial;
  private readonly railYardMaterial: THREE.MeshStandardMaterial;
  private readonly sidewalkPlazaMaterial: THREE.MeshStandardMaterial;
  private readonly trunkRoadMaterial: THREE.MeshStandardMaterial;
  private readonly primaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly secondaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly tertiaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly intersectionRoadMaterial: THREE.MeshStandardMaterial;
  private readonly elevatedRoadMaterial: THREE.MeshStandardMaterial;
  private readonly treeTrunkMaterial: THREE.MeshStandardMaterial;
  private readonly treeCanopyMaterial: THREE.MeshStandardMaterial;

  private readonly surfaceMaterials: THREE.MeshStandardMaterial[];
  private readonly clipPlanes: THREE.Plane[];
  private readonly cutawayUniforms?: CutawayUniforms;
  private readonly undergroundReferenceGrid: THREE.GridHelper;
  private bayfrontDetails: BayfrontDetailHandle | null = null;
  private airportComplexes: AirportComplexesHandle | null = null;
  private imperialPalaceDetails: ImperialPalaceHandle | null = null;
  private streetLightNetwork: StreetLightNetworkHandle | null = null;
  private treeTrunkMesh: THREE.InstancedMesh | null = null;
  private treeCanopyMesh: THREE.InstancedMesh | null = null;
  private treePaletteIndices: Uint8Array | null = null;
  private textures: TerrainTextureBundle;
  private isDark: boolean;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[], cutawayUniforms?: CutawayUniforms) {
    this.isDark = isDark;
    this.clipPlanes = clipPlanes;
    this.cutawayUniforms = cutawayUniforms;
    this.group.name = 'city-terrain-layer';

    this.streetscapeLayer = new ShibuyaStreetscapeLayer(isDark, clipPlanes, cutawayUniforms);
    this.group.add(this.streetscapeLayer.group);
    registerStreetscapeForCutaway(cutawayUniforms, this.streetscapeLayer);

    this.textures = this.createTextures(isDark);

    const mkSurfaceMat = (
      opts: THREE.MeshStandardMaterialParameters,
      poFactor: number,
    ): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: poFactor,
        polygonOffsetUnits: poFactor,
        clippingPlanes: clipPlanes,
        ...opts,
      });

    this.groundMaterial = mkSurfaceMat(
      {
        map: this.textures.parcel.map,
        roughnessMap: this.textures.parcel.roughnessMap,
        bumpMap: this.textures.parcel.bumpMap,
        bumpScale: 0.14,
        roughness: 0.94,
        metalness: 0.01,
      },
      levelPo('baseGround'),
    );

    this.bayMaterial = mkSurfaceMat(
      {
        color: isDark ? 0x10283f : 0x4f84ad,
        roughnessMap: this.textures.water.roughnessMap,
        bumpMap: this.textures.water.bumpMap,
        bumpScale: 0.28,
        roughness: 0.55,
        metalness: 0.34,
        envMapIntensity: 1.75,
      },
      levelPo('tokyoBay'),
    );

    this.quayMaterial = mkSurfaceMat(
      { color: isDark ? 0x2b333f : 0xb3afa7, roughness: 0.9, metalness: 0.04 },
      levelPo('riverQuay'),
    );

    this.waterMaterial = mkSurfaceMat(
      {
        color: isDark ? 0x153654 : 0x5990b8,
        roughnessMap: this.textures.water.roughnessMap,
        bumpMap: this.textures.water.bumpMap,
        bumpScale: 0.24,
        roughness: 0.55,
        metalness: 0.34,
        envMapIntensity: 1.75,
      },
      levelPo('inlandWater'),
    );

    this.landuseResidentialMat = mkSurfaceMat(
      {
        map: this.textures.parcel.map,
        roughnessMap: this.textures.parcel.roughnessMap,
        bumpMap: this.textures.parcel.bumpMap,
        bumpScale: 0.12,
        color: isDark ? 0xd9e2ec : 0xe6e1d8,
        roughness: 0.95,
        metalness: 0.01,
      },
      levelPo('landuseResidential'),
    );

    this.landuseIndustrialMat = mkSurfaceMat(
      {
        map: this.textures.industrialPort.map,
        roughnessMap: this.textures.industrialPort.roughnessMap,
        bumpMap: this.textures.industrialPort.bumpMap,
        bumpScale: 0.14,
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.04,
      },
      levelPo('landuseIndustrial'),
    );

    this.landuseCommercialMat = mkSurfaceMat(
      {
        map: this.textures.parcel.map,
        roughnessMap: this.textures.parcel.roughnessMap,
        bumpMap: this.textures.parcel.bumpMap,
        bumpScale: 0.12,
        color: isDark ? 0xcad4df : 0xd9d4cb,
        roughness: 0.92,
        metalness: 0.02,
      },
      levelPo('landuseCommercial'),
    );

    this.parkMaterial = mkSurfaceMat(
      {
        map: this.textures.parkMap,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.0,
      },
      levelPo('parks'),
    );

    this.railYardMaterial = mkSurfaceMat(
      {
        map: this.textures.railYard.map,
        roughnessMap: this.textures.railYard.roughnessMap,
        bumpMap: this.textures.railYard.bumpMap,
        bumpScale: 0.22,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.12,
      },
      levelPo('railCorridors'),
    );

    this.sidewalkPlazaMaterial = mkSurfaceMat(
      {
        map: this.textures.sidewalk.map,
        roughnessMap: this.textures.sidewalk.roughnessMap,
        bumpMap: this.textures.sidewalk.bumpMap,
        bumpScale: 0.14,
        emissiveMap: this.textures.sidewalk.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.34 : 0.0,
        roughness: 0.9,
        metalness: 0.02,
      },
      levelPo('sidewalksPlazas'),
    );

    this.tertiaryRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadTertiary.map,
        roughnessMap: this.textures.roadTertiary.roughnessMap,
        bumpMap: this.textures.roadTertiary.bumpMap,
        bumpScale: 0.1,
        emissiveMap: this.textures.roadTertiary.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.42 : 0.0,
        roughness: 0.88,
        metalness: 0.04,
      },
      levelPo('roadTertiary'),
    );

    this.secondaryRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadSecondary.map,
        roughnessMap: this.textures.roadSecondary.roughnessMap,
        bumpMap: this.textures.roadSecondary.bumpMap,
        bumpScale: 0.1,
        emissiveMap: this.textures.roadSecondary.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.66 : 0.0,
        roughness: 0.86,
        metalness: 0.04,
      },
      levelPo('roadSecondary'),
    );

    this.primaryRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadPrimary.map,
        roughnessMap: this.textures.roadPrimary.roughnessMap,
        bumpMap: this.textures.roadPrimary.bumpMap,
        bumpScale: 0.1,
        emissiveMap: this.textures.roadPrimary.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.92 : 0.0,
        roughness: 0.85,
        metalness: 0.05,
      },
      levelPo('roadPrimary'),
    );

    this.trunkRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadTrunk.map,
        roughnessMap: this.textures.roadTrunk.roughnessMap,
        bumpMap: this.textures.roadTrunk.bumpMap,
        bumpScale: 0.1,
        emissiveMap: this.textures.roadTrunk.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 1.15 : 0.0,
        roughness: 0.84,
        metalness: 0.05,
      },
      levelPo('roadTrunk'),
    );

    this.intersectionRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.intersection.map,
        roughnessMap: this.textures.intersection.roughnessMap,
        bumpMap: this.textures.intersection.bumpMap,
        bumpScale: 0.1,
        emissiveMap: this.textures.intersection.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.92 : 0.0,
        roughness: 0.86,
        metalness: 0.04,
      },
      levelPo('roadIntersectionApron'),
    );

    this.elevatedRoadMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.roadTrunk.map,
      roughnessMap: this.textures.roadTrunk.roughnessMap,
      bumpMap: this.textures.roadTrunk.bumpMap,
      bumpScale: 0.1,
      emissiveMap: this.textures.roadTrunk.emissiveMap ?? null,
      emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
      emissiveIntensity: isDark ? 1.10 : 0.0,
      roughness: 0.82,
      metalness: 0.07,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.treeTrunkMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x2a231e : 0x5c4b3c,
      roughness: 0.94,
      metalness: 0.02,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.treeCanopyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.45,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.surfaceMaterials = [
      this.groundMaterial,
      this.bayMaterial,
      this.quayMaterial,
      this.waterMaterial,
      this.landuseResidentialMat,
      this.landuseIndustrialMat,
      this.landuseCommercialMat,
      this.parkMaterial,
      this.railYardMaterial,
      this.sidewalkPlazaMaterial,
      this.tertiaryRoadMaterial,
      this.secondaryRoadMaterial,
      this.primaryRoadMaterial,
      this.trunkRoadMaterial,
      this.intersectionRoadMaterial,
    ];

    if (cutawayUniforms) {
      for (const mat of this.surfaceMaterials) {
        injectRadialCutaway(mat, cutawayUniforms, 'terrain');
      }
      injectRadialCutaway(this.elevatedRoadMaterial, cutawayUniforms, 'terrain');
      injectRadialCutaway(this.treeTrunkMaterial, cutawayUniforms, 'building');
      injectRadialCutaway(this.treeCanopyMaterial, cutawayUniforms, 'building');
    }

    // Base metropolitan ground plane at y = -1.25 (covers 23 wards + Narita NRT at +56km)
    const baseGeom = new THREE.PlaneGeometry(180_000, 180_000);
    baseGeom.rotateX(-Math.PI / 2);
    baseGeom.translate(0, levelY('baseGround'), 0);
    const normalizedBase = normalizeFlatGeometry(baseGeom, 'world');
    const basePlane = new THREE.Mesh(normalizedBase, this.groundMaterial);
    basePlane.receiveShadow = true;
    basePlane.renderOrder = 0;
    basePlane.name = 'metropolitan-ground';
    this.group.add(basePlane);

    this.undergroundReferenceGrid = new THREE.GridHelper(32_000, 64, 0x38bdf8, 0x334155);
    this.undergroundReferenceGrid.position.y = -44;
    const gridMat = this.undergroundReferenceGrid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.22;
    this.undergroundReferenceGrid.visible = false;
    this.group.add(this.undergroundReferenceGrid);
  }

  private createTextures(isDark: boolean): TerrainTextureBundle {
    return {
      parcel: createUrbanParcelTextureSet(isDark),
      industrialPort: createIndustrialPortTextureSet(isDark),
      railYard: createRailYardTextureSet(isDark),
      sidewalk: createSidewalkPaverTextureSet(isDark),
      intersection: createIntersectionAsphaltTextureSet(isDark),
      roadTrunk: createAsphaltRoadTextureSet('trunk', isDark),
      roadPrimary: createAsphaltRoadTextureSet('primary', isDark),
      roadSecondary: createAsphaltRoadTextureSet('secondary', isDark),
      roadTertiary: createAsphaltRoadTextureSet('tertiary', isDark),
      water: createWaterTextureSet(isDark),
      parkMap: createParkCanopyTexture(isDark),
    };
  }

  private disposeTextures(bundle: TerrainTextureBundle): void {
    const sets = [
      bundle.parcel,
      bundle.industrialPort,
      bundle.railYard,
      bundle.sidewalk,
      bundle.intersection,
      bundle.roadTrunk,
      bundle.roadPrimary,
      bundle.roadSecondary,
      bundle.roadTertiary,
    ];
    for (const s of sets) {
      s.map.dispose();
      s.roughnessMap.dispose();
      s.bumpMap.dispose();
      s.emissiveMap?.dispose();
    }
    bundle.water.roughnessMap.dispose();
    bundle.water.bumpMap.dispose();
    bundle.parkMap.dispose();
  }

  private addMergedLayer(
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    renderOrder: number,
    receiveShadow = true,
  ): void {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = receiveShadow;
      mesh.renderOrder = renderOrder;
      mesh.name = name;
      this.group.add(mesh);
    }
    geoms.forEach((g) => g.dispose());
  }

  populateFromEnvironment(env: UrbanBaseEnvironment): void {
    // 1. Accurate Tokyo Bay ocean coastline backdrop at y = -0.82
    const bayGeom = buildPolygonGeometryXZ(
      TOKYO_BAY_OCEAN_POLYGON as [number, number][],
      levelY('tokyoBay'),
      'world',
    );
    if (bayGeom) {
      const bayMesh = new THREE.Mesh(bayGeom, this.bayMaterial);
      bayMesh.receiveShadow = true;
      bayMesh.renderOrder = 1;
      bayMesh.name = 'tokyo-bay-ocean';
      this.group.add(bayMesh);
    }

    // 1b. Reclaimed Tokyo Bay artificial islands, seawall quays, port container stacks,
    //     gantry cranes, Oi Shinkansen rail-yard depots & Haneda Airport (HND) runways/terminals
    if (this.bayfrontDetails) {
      this.group.remove(this.bayfrontDetails.group);
      this.bayfrontDetails.dispose();
    }
    this.bayfrontDetails = buildTokyoBayWaterfront(
      env,
      this.isDark,
      this.clipPlanes,
      this.groundMaterial,
      this.quayMaterial,
      this.cutawayUniforms,
    );
    this.group.add(this.bayfrontDetails.group);

    // 1b-2. Haneda (HND) & Narita (NRT) 3D Airport Complexes, Fleet & Surrounding Urban/Port Districts
    if (this.airportComplexes) {
      this.group.remove(this.airportComplexes.group);
      this.airportComplexes.dispose();
    }
    this.airportComplexes = buildTokyoAirportComplexes(
      env,
      this.isDark,
      this.clipPlanes,
      this.waterMaterial,
      this.cutawayUniforms,
    );
    this.group.add(this.airportComplexes.group);

    // 1c. 3D Imperial Palace Complex (plateau, stone ishigaki walls, Kyuden, Nijubashi, Yagura & Budokan)
    if (this.imperialPalaceDetails) {
      this.group.remove(this.imperialPalaceDetails.group);
      this.imperialPalaceDetails.dispose();
    }
    this.imperialPalaceDetails = buildImperialPalaceModel(
      this.isDark,
      this.clipPlanes,
      this.waterMaterial,
      this.cutawayUniforms,
    );
    this.group.add(this.imperialPalaceDetails.group);

    // 2. Real OSM Urban Landuse Districts & Railway Yards
    if (env.landuseBlocks && env.landuseBlocks.length > 0) {
      const commGeoms: THREE.BufferGeometry[] = [];
      const resGeoms: THREE.BufferGeometry[] = [];
      const indGeoms: THREE.BufferGeometry[] = [];
      const railYardGeoms: THREE.BufferGeometry[] = [];

      for (let i = 0; i < env.landuseBlocks.length; i++) {
        const blk = env.landuseBlocks[i]!;
        if (blk.kind === 'railway') {
          const g = buildPolygonGeometryXZ(
            blk.pts,
            levelY('railCorridors') - 0.02 + (i % 3) * 0.004,
            'world',
          );
          if (g) railYardGeoms.push(g);
        } else if (blk.kind === 'commercial') {
          const g = buildPolygonGeometryXZ(
            blk.pts,
            levelY('landuseCommercial') + (i % 4) * 0.004,
            'world',
          );
          if (g) commGeoms.push(g);
        } else if (blk.kind === 'industrial') {
          const g = buildPolygonGeometryXZ(
            blk.pts,
            levelY('landuseIndustrial') + (i % 4) * 0.004,
            'world',
          );
          if (g) indGeoms.push(g);
        } else {
          const g = buildPolygonGeometryXZ(
            blk.pts,
            levelY('landuseResidential') + (i % 4) * 0.004,
            'world',
          );
          if (g) resGeoms.push(g);
        }
      }

      this.addMergedLayer(resGeoms, this.landuseResidentialMat, 'osm-landuse-residential', 2);
      this.addMergedLayer(indGeoms, this.landuseIndustrialMat, 'osm-landuse-industrial', 2);
      this.addMergedLayer(commGeoms, this.landuseCommercialMat, 'osm-landuse-commercial', 2);
      this.addMergedLayer(railYardGeoms, this.railYardMaterial, 'osm-landuse-railway-yards', 5);
    }

    // 3. Real OSM Inland Waterbodies, Rivers & Concrete Embankments (excluding underground culverts)
    const quayGeoms: THREE.BufferGeometry[] = [];
    const waterGeoms: THREE.BufferGeometry[] = [];
    for (let i = 0; i < env.waterPolygons.length; i++) {
      const wp = env.waterPolygons[i]!;
      const y = Math.min(
        SURFACE_ELEVATION_LAYERS.riverWaterMaxY,
        levelY('inlandWater') + (i % 4) * 0.012,
      );
      const g = buildPolygonGeometryXZ(wp.pts, y, 'world');
      if (g) waterGeoms.push(g);
    }
    for (let i = 0; i < env.riverLines.length; i++) {
      const rv = env.riverLines[i]!;
      if (!isSurfaceRiverVisible(rv.name)) continue;
      const effectiveW = getEffectiveRiverWidth(rv.name, rv.width);
      const q = buildRibbonGeometryXZ(
        rv.pts,
        effectiveW + 5,
        levelY('riverQuay') + (i % 3) * 0.005,
        'none',
      );
      if (q) quayGeoms.push(q);
      const g = buildRibbonGeometryXZ(
        rv.pts,
        effectiveW,
        Math.min(
          SURFACE_ELEVATION_LAYERS.riverWaterMaxY,
          levelY('inlandWater') + 0.03 + (i % 4) * 0.014,
        ),
        'world',
      );
      if (g) waterGeoms.push(g);
    }
    this.addMergedLayer(quayGeoms, this.quayMaterial, 'osm-river-quays', 2);
    this.addMergedLayer(waterGeoms, this.waterMaterial, 'osm-water-layer', 3);

    // 4. Real OSM Parks & Botanical Forests (+ Imperial Palace base green under-skirt)
    const parkGeoms: THREE.BufferGeometry[] = [];
    const palaceGeom = buildPolygonGeometryXZ(
      IMPERIAL_PALACE_INNER_POLY as [number, number][],
      levelY('parks') - 0.008,
      'world',
    );
    if (palaceGeom) parkGeoms.push(palaceGeom);
    for (let i = 0; i < env.parkPolygons.length; i++) {
      const pk = env.parkPolygons[i]!;
      const y = Math.min(SURFACE_ELEVATION_LAYERS.parkMaxY, levelY('parks') + (i % 6) * 0.014);
      const g = buildPolygonGeometryXZ(pk.pts, y, 'world');
      if (g) parkGeoms.push(g);
    }
    this.addMergedLayer(parkGeoms, this.parkMaterial, 'osm-parks-layer', 4);

    // 5. Railway Right-of-Way Ballast Corridors
    if (env.railCorridors && env.railCorridors.length > 0) {
      const corrGeoms: THREE.BufferGeometry[] = [];
      for (let i = 0; i < env.railCorridors.length; i++) {
        const c = env.railCorridors[i]!;
        const g = buildRibbonGeometryXZ(
          c.pts,
          c.width,
          levelY('railCorridors') + (i % 4) * 0.004,
          'world',
        );
        if (g) corrGeoms.push(g);
      }
      this.addMergedLayer(corrGeoms, this.railYardMaterial, 'rail-corridor-yards', 5);
    }

    // 6. Sidewalk Pavers, Pedestrian Squares & Station Forecourt Plazas
    const plazaGeoms: THREE.BufferGeometry[] = [];
    if (env.plazaPolygons) {
      for (let i = 0; i < env.plazaPolygons.length; i++) {
        const g = buildPolygonGeometryXZ(
          env.plazaPolygons[i]!.pts,
          levelY('sidewalksPlazas') + (i % 3) * 0.003,
          'world',
        );
        if (g) plazaGeoms.push(g);
      }
    }
    if (env.stationPlazas) {
      const plazaCircle = new THREE.CircleGeometry(1, 16);
      plazaCircle.rotateX(-Math.PI / 2);
      for (let i = 0; i < env.stationPlazas.length; i++) {
        const sp = env.stationPlazas[i]!;
        const g = plazaCircle.clone();
        g.scale(sp.rx, 1, sp.rz);
        g.rotateY(-sp.a);
        g.translate(sp.x, levelY('sidewalksPlazas') + 0.005 + (i % 3) * 0.003, sp.z);
        plazaGeoms.push(normalizeFlatGeometry(g, 'world'));
      }
      plazaCircle.dispose();
    }

    // 7. Real OSM Road Network (4 road tiers with baked lane-markings + flanking sidewalks)
    const trunkGeoms: THREE.BufferGeometry[] = [];
    const primaryGeoms: THREE.BufferGeometry[] = [];
    const secondaryGeoms: THREE.BufferGeometry[] = [];
    const tertiaryGeoms: THREE.BufferGeometry[] = [];
    const elevatedRoadGeoms: THREE.BufferGeometry[] = [];

    for (let i = 0; i < env.roads.length; i++) {
      const r = env.roads[i]!;
      if (r.el === 1) {
        const g = buildRibbonGeometryXZ(
          r.pts,
          r.w * 0.85,
          SURFACE_ELEVATION_LAYERS.elevatedExpresswayY + (i % 3) * 0.04,
          'road',
        );
        if (g) elevatedRoadGeoms.push(g);
        continue;
      }

      const sidewalkPad =
        r.hw === 'trunk'
          ? 7.2
          : r.hw === 'primary'
            ? 6.4
            : r.hw === 'secondary'
              ? 4.6
              : 2.6;
      const sw = buildRibbonGeometryXZ(
        r.pts,
        r.w + sidewalkPad,
        levelY('sidewalksPlazas') - 0.006 + (i % 4) * 0.002,
        'world',
      );
      if (sw) plazaGeoms.push(sw);

      if (r.hw === 'trunk') {
        const g = buildRibbonGeometryXZ(
          r.pts,
          r.w,
          levelY('roadTrunk') + (i % 4) * 0.003,
          'road',
        );
        if (g) trunkGeoms.push(g);
      } else if (r.hw === 'primary') {
        const g = buildRibbonGeometryXZ(
          r.pts,
          r.w,
          levelY('roadPrimary') + (i % 4) * 0.003,
          'road',
        );
        if (g) primaryGeoms.push(g);
      } else if (r.hw === 'secondary') {
        const g = buildRibbonGeometryXZ(
          r.pts,
          r.w,
          levelY('roadSecondary') + (i % 4) * 0.003,
          'road',
        );
        if (g) secondaryGeoms.push(g);
      } else {
        const g = buildRibbonGeometryXZ(
          r.pts,
          r.w,
          levelY('roadTertiary') + (i % 4) * 0.002,
          'road',
        );
        if (g) tertiaryGeoms.push(g);
      }
    }

    // 8. Unmarked Asphalt Intersection Aprons (23-ward intersections + Shibuya detected crossings)
    const intersectionGeoms: THREE.BufferGeometry[] = [];
    const discTemplate = new THREE.CircleGeometry(1, 14);
    discTemplate.rotateX(-Math.PI / 2);

    const seenAp = new Set<string>();
    const addApron = (ix: number, iz: number, rad: number, yOff: number) => {
      const k = `${Math.round(ix / 5)},${Math.round(iz / 5)}`;
      if (seenAp.has(k)) return;
      seenAp.add(k);
      const g = discTemplate.clone();
      g.scale(rad, 1, rad);
      g.translate(ix, yOff, iz);
      intersectionGeoms.push(normalizeFlatGeometry(g, 'world'));
    };

    const shibuyaIntersections = detectSurfaceIntersections(
      env.roads,
      env.intersections,
      showcaseZoneBounds(),
    );
    for (let i = 0; i < shibuyaIntersections.length; i++) {
      const j = shibuyaIntersections[i]!;
      addApron(j.x, j.z, j.radius, levelY('roadIntersectionApron') + (i % 3) * 0.002);
    }
    for (let i = 0; i < env.intersections.length; i++) {
      const [ix, iz, rad] = env.intersections[i]!;
      addApron(ix, iz, rad * 0.88, levelY('roadIntersectionApron') + (i % 3) * 0.002);
    }
    // Watertight endpoint caps where separate OSM road ways connect end-to-end
    for (let i = 0; i < env.roads.length; i++) {
      const r = env.roads[i]!;
      if (r.el === 1 || r.pts.length < 2) continue;
      const capY =
        r.hw === 'trunk'
          ? levelY('roadTrunk') - 0.004
          : r.hw === 'primary'
            ? levelY('roadPrimary') - 0.004
            : r.hw === 'secondary'
              ? levelY('roadSecondary') - 0.004
              : levelY('roadTertiary') - 0.004;
      const p0 = r.pts[0]!;
      const p1 = r.pts[r.pts.length - 1]!;
      addApron(p0[0], p0[1], r.w * 0.49, capY);
      addApron(p1[0], p1[1], r.w * 0.49, capY);
    }
    discTemplate.dispose();

    this.addMergedLayer(plazaGeoms, this.sidewalkPlazaMaterial, 'osm-sidewalks-plazas', 6);
    this.addMergedLayer(tertiaryGeoms, this.tertiaryRoadMaterial, 'osm-tertiary-streets', 7);
    this.addMergedLayer(secondaryGeoms, this.secondaryRoadMaterial, 'osm-secondary-streets', 7);
    this.addMergedLayer(primaryGeoms, this.primaryRoadMaterial, 'osm-primary-roads', 8);
    this.addMergedLayer(trunkGeoms, this.trunkRoadMaterial, 'osm-trunk-roads', 8);
    this.addMergedLayer(
      intersectionGeoms,
      this.intersectionRoadMaterial,
      'osm-intersection-aprons',
      9,
    );
    this.addMergedLayer(elevatedRoadGeoms, this.elevatedRoadMaterial, 'osm-elevated-roads', 10, false);
    this.populateInstancedTrees(env);
    if (this.streetLightNetwork) {
      this.group.remove(this.streetLightNetwork.group);
      this.streetLightNetwork.dispose();
    }
    this.streetLightNetwork = buildTokyoStreetLightNetwork(env, this.isDark, this.clipPlanes);
    this.group.add(this.streetLightNetwork.group);
    this.streetscapeLayer.populate(env);
  }

  /**
   * Populates 3D instanced park groves & primary/trunk boulevard street trees across Tokyo
   * in strictly 2 InstancedMesh draw calls (trunks + multi-lobe canopies) with natural green variation.
   */
  private populateInstancedTrees(env: UrbanBaseEnvironment): void {
    const maxTrees = 22_000;
    const parkBudget = 17_500;
    const trees: TreeInstanceRecord[] = [];
    const seenCells = new Set<number>();

    const cellKey = (x: number, z: number) =>
      (Math.floor(x / 8) + 4096) * 8192 + (Math.floor(z / 8) + 4096);

    const isInsideImperialArchitecture = (x: number, z: number): boolean => {
      // Keep compact Kokyo Gaien ceremonial gravel forecourt & Gyoko-dori axis clear while allowing outer lawn black pines
      if (x >= -1165 && x <= -895 && z >= 120 && z <= 325) return true;
      if (x >= -920 && x <= -575 && z >= -25 && z <= 85) return true;
      for (const fp of IMPERIAL_PALACE_ARCHITECTURAL_FOOTPRINTS) {
        if (Math.hypot(x - fp.x, z - fp.z) < fp.r) return true;
      }
      return false;
    };

    // Quick AABB-filtered water polygon check so park/boulevard trees stay on dry land
    const waterBounds = env.waterPolygons.map((wp) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of wp.pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      return { minX, maxX, minZ, maxZ, pts: wp.pts };
    });

    const isInWater = (x: number, z: number): boolean => {
      if (isPointInImperialMoat(x, z)) return true;
      for (let i = 0; i < waterBounds.length; i++) {
        const wb = waterBounds[i]!;
        if (x < wb.minX || x > wb.maxX || z < wb.minZ || z > wb.maxZ) continue;
        if (pointInPoly(x, z, wb.pts)) return true;
      }
      return false;
    };

    // Quick spatial grid for intersections & rail corridors (avoid placing boulevard trees in junctions/tracks)
    const blockedRoadSide = new Set<number>();
    const markBlockedDisc = (x: number, z: number, radM: number) => {
      const rCells = Math.ceil(radM / 12);
      const gx0 = Math.floor(x / 12);
      const gz0 = Math.floor(z / 12);
      for (let dx = -rCells; dx <= rCells; dx++) {
        for (let dz = -rCells; dz <= rCells; dz++) {
          blockedRoadSide.add((gx0 + dx + 4096) * 8192 + (gz0 + dz + 4096));
        }
      }
    };
    const isRoadSideBlocked = (x: number, z: number) =>
      blockedRoadSide.has((Math.floor(x / 12) + 4096) * 8192 + (Math.floor(z / 12) + 4096));

    for (const [ix, iz, rad] of env.intersections) {
      markBlockedDisc(ix, iz, rad + 4);
    }
    if (env.railCorridors) {
      for (const c of env.railCorridors) {
        for (let i = 0; i < c.pts.length - 1; i++) {
          const [ax, az] = c.pts[i]!;
          const [bx, bz] = c.pts[i + 1]!;
          const len = Math.hypot(bx - ax, bz - az);
          const steps = Math.max(1, Math.ceil(len / 14));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            markBlockedDisc(ax + (bx - ax) * t, az + (bz - az) * t, c.width * 0.5 + 3);
          }
        }
      }
    }
    for (const rv of env.riverLines) {
      if (!isSurfaceRiverVisible(rv.name)) continue;
      const rw = getEffectiveRiverWidth(rv.name, rv.width) * 0.5 + 4;
      for (let i = 0; i < rv.pts.length - 1; i++) {
        const [ax, az] = rv.pts[i]!;
        const [bx, bz] = rv.pts[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(len / 16));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          markBlockedDisc(ax + (bx - ax) * t, az + (bz - az) * t, rw);
        }
      }
    }

    // 1. Imperial Palace Fukiage & East Gardens Forest + all OSM Park groves
    const forestPolys: { name: string | null; pts: [number, number][]; isImperial?: boolean }[] = [
      {
        name: '皇居内苑・吹上御苑',
        pts: IMPERIAL_PALACE_INNER_POLY as [number, number][],
        isImperial: true,
      },
      ...env.parkPolygons,
    ];

    for (let pi = 0; pi < forestPolys.length && trees.length < parkBudget; pi++) {
      const polyEntry = forestPolys[pi]!;
      const pts = polyEntry.pts;
      if (pts.length < 3) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      if (spanX < 14 || spanZ < 14) continue;
      if (Math.abs((minX + maxX) * 0.5) > 16500 || Math.abs((minZ + maxZ) * 0.5) > 16500) continue;

      const approxArea = spanX * spanZ;
      const spacing = polyEntry.isImperial
        ? 16
        : approxArea > 280_000
          ? 18
          : approxArea > 60_000
            ? 15
            : 13;
      let parkAdded = 0;
      const parkCap = polyEntry.isImperial
        ? 2200
        : Math.min(1800, Math.max(120, Math.floor(approxArea / 360)));

      for (let gx = minX + spacing * 0.4; gx < maxX && parkAdded < parkCap && trees.length < parkBudget; gx += spacing) {
        for (let gz = minZ + spacing * 0.4; gz < maxZ && parkAdded < parkCap && trees.length < parkBudget; gz += spacing) {
          const ix = Math.round(gx);
          const iz = Math.round(gz);
          const r0 = hashTree(ix, iz, pi * 17 + 3);
          const jx = gx + (hashTree(ix, iz, 31) - 0.5) * spacing * 0.65;
          const jz = gz + (hashTree(ix, iz, 57) - 0.5) * spacing * 0.65;

          // Organic grove clearings & lawns via low-frequency smooth wave
          const clearingWave = Math.sin(jx * 0.017 + pi) * Math.cos(jz * 0.019 - pi * 0.7);
          if ((clearingWave > 0.62 && r0 < 0.72) || r0 < 0.12) continue;

          if (!pointInPoly(jx, jz, pts)) continue;
          if (isInsideImperialArchitecture(jx, jz)) continue;
          if (isInWater(jx, jz) || isRoadSideBlocked(jx, jz)) continue;

          const ck = cellKey(jx, jz);
          if (seenCells.has(ck)) continue;
          seenCells.add(ck);

          const scaleXZ = 1.25 + hashTree(ix, iz, 83) * 1.1;
          const scaleY = 1.15 + hashTree(ix, iz, 107) * 1.0;
          trees.push({
            x: jx,
            z: jz,
            scaleXZ,
            scaleY,
            rotY: hashTree(ix, iz, 131) * Math.PI * 2,
            paletteIdx: Math.floor(hashTree(ix, iz, 163) * TREE_CANOPY_DAY_PALETTE.length),
          });
          parkAdded++;
        }
      }
    }

    // 2. Boulevard street trees along primary & trunk avenues (strictly outside road asphalt width)
    const shibuya = showcaseZoneBounds();
    const streetSpacing = 34;
    for (let ri = 0; ri < env.roads.length && trees.length < maxTrees; ri++) {
      const r = env.roads[ri]!;
      if (r.el === 1 || (r.hw !== 'primary' && r.hw !== 'trunk') || r.pts.length < 2) continue;

      // Sidewalk tree line offset strictly outside road asphalt width
      const lateralOffset = r.w * 0.5 + 2.3;
      let carry = 12;

      for (let si = 0; si < r.pts.length - 1 && trees.length < maxTrees; si++) {
        const [ax, az] = r.pts[si]!;
        const [bx, bz] = r.pts[si + 1]!;
        if (Math.abs(ax) > 13500 || Math.abs(az) > 13500) continue;

        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 8) continue;

        const nx = -dz / segLen;
        const nz = dx / segLen;

        let dist = carry;
        while (dist < segLen - 6 && trees.length < maxTrees) {
          const t = dist / segLen;
          const cx = ax + dx * t;
          const cz = az + dz * t;

          // Skip Shibuya showcase core where ShibuyaStreetscapeLayer renders dedicated hero street trees
          const inShibuyaCore =
            cx >= shibuya.minX &&
            cx <= shibuya.maxX &&
            cz >= shibuya.minZ &&
            cz <= shibuya.maxZ;

          if (!inShibuyaCore) {
            for (const side of [-1, 1] as const) {
              if (trees.length >= maxTrees) break;
              const tx = cx + nx * lateralOffset * side;
              const tz = cz + nz * lateralOffset * side;
              if (isRoadSideBlocked(tx, tz) || isInWater(tx, tz)) continue;
              const ck = cellKey(tx, tz);
              if (seenCells.has(ck)) continue;
              seenCells.add(ck);

              const rScale = hashTree(Math.round(tx), Math.round(tz), ri * 13 + side);
              trees.push({
                x: tx,
                z: tz,
                scaleXZ: 0.72 + rScale * 0.34,
                scaleY: 0.76 + hashTree(Math.round(tx), Math.round(tz), 211) * 0.34,
                rotY: rScale * Math.PI * 2,
                paletteIdx: Math.floor(
                  hashTree(Math.round(tx), Math.round(tz), 257) * TREE_CANOPY_DAY_PALETTE.length,
                ),
              });
            }
          }

          dist += streetSpacing;
        }
        carry = Math.max(4, dist - segLen);
      }
    }

    if (trees.length === 0) return;

    const trunkGeom = new THREE.CylinderGeometry(0.22, 0.36, 3.3, 5);
    trunkGeom.translate(0, 1.35, 0); // bottom extends to -0.3m for watertight grounding
    const canopyGeom = createOrganicCanopyGeometry();

    const trunkMesh = new THREE.InstancedMesh(trunkGeom, this.treeTrunkMaterial, trees.length);
    trunkMesh.name = 'urban-trees-trunks';
    trunkMesh.castShadow = false;
    trunkMesh.receiveShadow = true;
    trunkMesh.renderOrder = 11;

    const canopyMesh = new THREE.InstancedMesh(canopyGeom, this.treeCanopyMaterial, trees.length);
    canopyMesh.name = 'urban-trees-canopies';
    canopyMesh.castShadow = false;
    canopyMesh.receiveShadow = true;
    canopyMesh.renderOrder = 11;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = this.isDark ? TREE_CANOPY_NIGHT_PALETTE : TREE_CANOPY_DAY_PALETTE;
    const indices = new Uint8Array(trees.length);

    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i]!;
      const baseY = isPointOnImperialPlateau(tr.x, tr.z) ? IMPERIAL_PALACE_PLATEAU_Y : 0;
      dummy.position.set(tr.x, baseY, tr.z);
      dummy.rotation.set(0, tr.rotY, 0);
      dummy.scale.set(tr.scaleXZ, tr.scaleY, tr.scaleXZ);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      canopyMesh.setMatrixAt(i, dummy.matrix);

      indices[i] = tr.paletteIdx;
      color.setHex(palette[tr.paletteIdx]!);
      canopyMesh.setColorAt(i, color);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    canopyMesh.computeBoundingSphere();

    this.treeTrunkMesh = trunkMesh;
    this.treeCanopyMesh = canopyMesh;
    this.treePaletteIndices = indices;
    this.group.add(trunkMesh, canopyMesh);
  }

  /**
   * Gently animates Tokyo Bay & inland river water bump/roughness UV offsets for shimmering reflections.
   */
  updateAnimation(elapsedSec: number): void {
    const w = this.textures.water;
    w.bumpMap.offset.set((elapsedSec * 0.012) % 1, (elapsedSec * 0.008) % 1);
    w.roughnessMap.offset.set((-elapsedSec * 0.007) % 1, (elapsedSec * 0.011) % 1);
    this.streetLightNetwork?.updateAnimation(elapsedSec);
  }

  /**
   * Smoothly tints Tokyo Bay, rivers, arterial streetlamp glow, foliage canopies, and ground
   * ambiance across dawn, noon, golden hour, sunset, blue hour twilight, and night.
   */
  setTimeOfDay(hour: number, rawNightFactor: number): void {
    const h = ((hour % 24) + 24) % 24;
    const nf = Math.max(0, Math.min(1, rawNightFactor));

    // Golden-hour / dawn warmth peaks around 5.8h and 17.35h
    const sunsetWarm = Math.exp(-Math.pow((h - 17.35) / 0.85, 2));
    const dawnWarm = Math.exp(-Math.pow((h - 5.85) / 0.85, 2));
    const goldenWarmth = Math.min(1, Math.max(sunsetWarm, dawnWarm * 0.85));

    const bayDay = new THREE.Color(0x427aa8);
    const bayGolden = new THREE.Color(0x9c7262);
    const bayNight = new THREE.Color(0x0c1e36);
    this.bayMaterial.color
      .copy(bayDay)
      .lerp(bayNight, nf)
      .lerp(bayGolden, goldenWarmth * 0.42);
    this.bayMaterial.envMapIntensity = 1.75 + goldenWarmth * 0.45 - nf * 0.2;

    const riverDay = new THREE.Color(0x4c85b2);
    const riverGolden = new THREE.Color(0xa67a68);
    const riverNight = new THREE.Color(0x102744);
    this.waterMaterial.color
      .copy(riverDay)
      .lerp(riverNight, nf)
      .lerp(riverGolden, goldenWarmth * 0.42);
    this.waterMaterial.envMapIntensity = 1.75 + goldenWarmth * 0.45 - nf * 0.2;

    // Smooth dusk ground dimming before dark textures swap in at deep blue hour
    const duskMul = this.isDark ? 1.0 : 1.0 - nf * 0.54;
    this.groundMaterial.color.setRGB(duskMul, duskMul * (this.isDark ? 1.0 : 1.0 + nf * 0.03), duskMul * (this.isDark ? 1.0 : 1.0 + nf * 0.08));
    if (this.isDark) {
      this.landuseResidentialMat.color.setHex(0xd9e2ec);
      this.landuseCommercialMat.color.setHex(0xcad4df);
    } else {
      const resDay = new THREE.Color(0xe6e1d8);
      const comDay = new THREE.Color(0xd9d4cb);
      const duskTint = new THREE.Color(0x6b788e);
      this.landuseResidentialMat.color.copy(resDay).lerp(duskTint, nf * 0.72);
      this.landuseCommercialMat.color.copy(comDay).lerp(duskTint, nf * 0.72);
    }

    // Arterial, expressway, intersection & sidewalk streetlamp glow ramp during dusk -> night
    const lampT = Math.max(0, Math.min(1, (nf - 0.22) / 0.62));
    const lampGlow = lampT * lampT * (3 - 2 * lampT);
    const lampCol = lampGlow > 0.002 ? 0xffffff : 0x000000;
    this.trunkRoadMaterial.emissive.setHex(lampCol);
    this.trunkRoadMaterial.emissiveIntensity = lampGlow * 1.15;
    this.elevatedRoadMaterial.emissive.setHex(lampCol);
    this.elevatedRoadMaterial.emissiveIntensity = lampGlow * 1.10;
    this.primaryRoadMaterial.emissive.setHex(lampCol);
    this.primaryRoadMaterial.emissiveIntensity = lampGlow * 0.92;
    this.secondaryRoadMaterial.emissive.setHex(lampCol);
    this.secondaryRoadMaterial.emissiveIntensity = lampGlow * 0.66;
    this.tertiaryRoadMaterial.emissive.setHex(lampCol);
    this.tertiaryRoadMaterial.emissiveIntensity = lampGlow * 0.42;
    this.intersectionRoadMaterial.emissive.setHex(lampCol);
    this.intersectionRoadMaterial.emissiveIntensity = lampGlow * 0.92;
    this.sidewalkPlazaMaterial.emissive.setHex(lampCol);
    this.sidewalkPlazaMaterial.emissiveIntensity = lampGlow * 0.34;
    this.streetLightNetwork?.setNightFactor(nf);
    this.imperialPalaceDetails?.setNightFactor(nf);
    this.airportComplexes?.setNightFactor(nf);

    // Subtle atmospheric canopy & park lighting tint
    const canopyDay = new THREE.Color(0xffffff);
    const canopyGolden = new THREE.Color(0xffcfa6);
    const canopyNight = new THREE.Color(0x6e8cb0);
    this.treeCanopyMaterial.color
      .copy(canopyDay)
      .lerp(canopyNight, nf * 0.55)
      .lerp(canopyGolden, goldenWarmth * 0.24);

    this.parkMaterial.color
      .copy(canopyDay)
      .lerp(canopyNight, nf * 0.35)
      .lerp(canopyGolden, goldenWarmth * 0.18);
  }

  setSurfaceOpacity(opacity: number, undergroundActive: boolean): void {
    const clamped = Math.max(0.04, Math.min(1.0, opacity));
    const isTranslucent = clamped < 0.99;

    for (const mat of this.surfaceMaterials) {
      const needRecompile = mat.transparent !== isTranslucent;
      mat.transparent = isTranslucent;
      mat.opacity = clamped;
      mat.depthWrite = !isTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }
    const elevTranslucent = isTranslucent;
    const elevNeed = this.elevatedRoadMaterial.transparent !== elevTranslucent;
    this.elevatedRoadMaterial.transparent = elevTranslucent;
    this.elevatedRoadMaterial.opacity = elevTranslucent ? Math.min(1, clamped + 0.08) : 1.0;
    this.elevatedRoadMaterial.depthWrite = !elevTranslucent;
    if (elevNeed) this.elevatedRoadMaterial.needsUpdate = true;

    for (const treeMat of [this.treeTrunkMaterial, this.treeCanopyMaterial]) {
      const needTreeRecompile = treeMat.transparent !== isTranslucent;
      treeMat.transparent = isTranslucent;
      treeMat.opacity = clamped;
      treeMat.depthWrite = !isTranslucent;
      if (needTreeRecompile) treeMat.needsUpdate = true;
    }

    this.bayfrontDetails?.setOpacity(clamped, isTranslucent);
    this.airportComplexes?.setOpacity(clamped, isTranslucent);
    this.imperialPalaceDetails?.setOpacity(clamped, isTranslucent);
    this.streetLightNetwork?.setOpacity(clamped, isTranslucent);
    // Keep ghost-surface view spotless without legacy cyan grid clutter
    this.undergroundReferenceGrid.visible = false;
    this.streetscapeLayer.setVisibilityAndOpacity(true, clamped, undergroundActive);
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;

    const oldTextures = this.textures;
    this.textures = this.createTextures(isDark);

    const bindSurface = (mat: THREE.MeshStandardMaterial, set: SurfaceTextureSet) => {
      mat.map = set.map;
      mat.roughnessMap = set.roughnessMap;
      mat.bumpMap = set.bumpMap;
      if (set.emissiveMap !== undefined) {
        mat.emissiveMap = set.emissiveMap ?? null;
      }
      mat.needsUpdate = true;
    };

    bindSurface(this.groundMaterial, this.textures.parcel);
    bindSurface(this.sidewalkPlazaMaterial, this.textures.sidewalk);
    bindSurface(this.intersectionRoadMaterial, this.textures.intersection);
    bindSurface(this.trunkRoadMaterial, this.textures.roadTrunk);
    bindSurface(this.primaryRoadMaterial, this.textures.roadPrimary);
    bindSurface(this.secondaryRoadMaterial, this.textures.roadSecondary);
    bindSurface(this.tertiaryRoadMaterial, this.textures.roadTertiary);

    this.landuseResidentialMat.map = this.textures.parcel.map;
    this.landuseResidentialMat.roughnessMap = this.textures.parcel.roughnessMap;
    this.landuseResidentialMat.bumpMap = this.textures.parcel.bumpMap;
    this.landuseResidentialMat.color.setHex(isDark ? 0xd9e2ec : 0xe6e1d8);
    this.landuseResidentialMat.needsUpdate = true;

    this.landuseIndustrialMat.map = this.textures.industrialPort.map;
    this.landuseIndustrialMat.roughnessMap = this.textures.industrialPort.roughnessMap;
    this.landuseIndustrialMat.bumpMap = this.textures.industrialPort.bumpMap;
    this.landuseIndustrialMat.color.setHex(0xffffff);
    this.landuseIndustrialMat.needsUpdate = true;

    this.landuseCommercialMat.map = this.textures.parcel.map;
    this.landuseCommercialMat.roughnessMap = this.textures.parcel.roughnessMap;
    this.landuseCommercialMat.bumpMap = this.textures.parcel.bumpMap;
    this.landuseCommercialMat.color.setHex(isDark ? 0xcad4df : 0xd9d4cb);
    this.landuseCommercialMat.needsUpdate = true;

    this.bayMaterial.roughnessMap = this.textures.water.roughnessMap;
    this.bayMaterial.bumpMap = this.textures.water.bumpMap;
    this.bayMaterial.color.setHex(isDark ? 0x10283f : 0x4f84ad);
    this.bayMaterial.needsUpdate = true;

    this.waterMaterial.roughnessMap = this.textures.water.roughnessMap;
    this.waterMaterial.bumpMap = this.textures.water.bumpMap;
    this.waterMaterial.color.setHex(isDark ? 0x153654 : 0x5990b8);
    this.waterMaterial.needsUpdate = true;

    this.parkMaterial.map = this.textures.parkMap;
    this.parkMaterial.color.setHex(0xffffff);
    this.parkMaterial.needsUpdate = true;

    this.quayMaterial.color.setHex(isDark ? 0x2b333f : 0xb3afa7);
    this.railYardMaterial.map = this.textures.railYard.map;
    this.railYardMaterial.roughnessMap = this.textures.railYard.roughnessMap;
    this.railYardMaterial.bumpMap = this.textures.railYard.bumpMap;
    this.railYardMaterial.color.setHex(0xffffff);
    this.railYardMaterial.needsUpdate = true;
    bindSurface(this.elevatedRoadMaterial, this.textures.roadTrunk);
    this.elevatedRoadMaterial.color.setHex(0xffffff);
    this.bayfrontDetails?.setTheme(isDark);
    this.airportComplexes?.setTheme(isDark);
    this.imperialPalaceDetails?.setTheme(isDark);
    this.streetLightNetwork?.setNightFactor(isDark ? 1.0 : 0.0);

    this.treeTrunkMaterial.color.setHex(isDark ? 0x2a231e : 0x5c4b3c);
    this.treeCanopyMaterial.color.setHex(0xffffff);
    if (this.treeCanopyMesh && this.treePaletteIndices) {
      const palette = isDark ? TREE_CANOPY_NIGHT_PALETTE : TREE_CANOPY_DAY_PALETTE;
      const color = new THREE.Color();
      for (let i = 0; i < this.treePaletteIndices.length; i++) {
        color.setHex(palette[this.treePaletteIndices[i]!]!);
        this.treeCanopyMesh.setColorAt(i, color);
      }
      if (this.treeCanopyMesh.instanceColor) this.treeCanopyMesh.instanceColor.needsUpdate = true;
    }

    this.streetscapeLayer.setTheme(isDark);
    this.disposeTextures(oldTextures);
  }

  dispose(): void {
    this.group.remove(this.streetscapeLayer.group);
    this.streetscapeLayer.dispose();
    if (this.bayfrontDetails) {
      this.group.remove(this.bayfrontDetails.group);
      this.bayfrontDetails.dispose();
      this.bayfrontDetails = null;
    }
    if (this.airportComplexes) {
      this.group.remove(this.airportComplexes.group);
      this.airportComplexes.dispose();
      this.airportComplexes = null;
    }
    if (this.imperialPalaceDetails) {
      this.group.remove(this.imperialPalaceDetails.group);
      this.imperialPalaceDetails.dispose();
      this.imperialPalaceDetails = null;
    }
    if (this.streetLightNetwork) {
      this.group.remove(this.streetLightNetwork.group);
      this.streetLightNetwork.dispose();
      this.streetLightNetwork = null;
    }
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.treeTrunkMesh?.dispose();
    this.treeCanopyMesh?.dispose();
    this.disposeTextures(this.textures);
    for (const mat of this.surfaceMaterials) mat.dispose();
    this.elevatedRoadMaterial.dispose();
    this.treeTrunkMaterial.dispose();
    this.treeCanopyMaterial.dispose();
  }
}
