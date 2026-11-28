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
  showcaseZoneBounds,
  TERRAIN_ELEVATION_LEVELS,
} from '../city/cityGeometryHelpers.js';
import {
  buildImperialPalaceModel,
  IMPERIAL_PALACE_INNER_POLY,
  type ImperialPalaceHandle,
} from '../city/imperialPalace.js';
import { ShibuyaStreetscapeLayer } from '../city/streetscapeGenerator.js';
import { registerStreetscapeForCutaway } from '../city/streetscapeRegistry.js';
import {
  createAsphaltRoadTextureSet,
  createBareSoilTextureSet,
  createCommercialHardscapeTextureSet,
  createForestFloorTextureSet,
  createGrassMeadowTextureSet,
  createIndustrialPortTextureSet,
  createIntersectionAsphaltTextureSet,
  createRailYardTextureSet,
  createSidewalkPaverTextureSet,
  createUrbanParcelTextureSet,
  createUrbanPlazaTextureSet,
  createWaterTextureSet,
  type SurfaceTextureSet,
  type WaterTextureSet,
} from '../city/surfaceTextures.js';
import {
  createCityLightingUniforms,
  injectUrbanGroundShader,
  type CityLightingUniforms,
} from '../materials/groundShader.js';
import { injectWaterShader } from '../materials/waterShader.js';
import {
  buildNaturalVegetation,
  type VegetationSystemHandle,
} from '../city/vegetationSystem.js';
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

interface TerrainTextureBundle {
  parcel: SurfaceTextureSet;
  commercialHardscape: SurfaceTextureSet;
  industrialPort: SurfaceTextureSet;
  railYard: SurfaceTextureSet;
  sidewalk: SurfaceTextureSet;
  urbanPlaza: SurfaceTextureSet;
  grassMeadow: SurfaceTextureSet;
  forestFloor: SurfaceTextureSet;
  bareSoil: SurfaceTextureSet;
  intersection: SurfaceTextureSet;
  roadTrunk: SurfaceTextureSet;
  roadPrimary: SurfaceTextureSet;
  roadSecondary: SurfaceTextureSet;
  roadTertiary: SurfaceTextureSet;
  water: WaterTextureSet;
}

export class CityTerrainLayer {
  readonly group = new THREE.Group();
  readonly streetscapeLayer: ShibuyaStreetscapeLayer;
  readonly lightingUniforms: CityLightingUniforms;
  readonly elevationSampler: CityTerrainElevationSampler = {
    datumKind: 'flat_datum',
    sampleGroundY: () => 0,
  };

  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly bayMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly quayMaterial: THREE.MeshStandardMaterial;
  private readonly parkMaterial: THREE.MeshStandardMaterial;
  private readonly forestFloorMaterial: THREE.MeshStandardMaterial;
  private readonly bareSoilMaterial: THREE.MeshStandardMaterial;
  private readonly landuseCommercialMat: THREE.MeshStandardMaterial;
  private readonly landuseResidentialMat: THREE.MeshStandardMaterial;
  private readonly landuseIndustrialMat: THREE.MeshStandardMaterial;
  private readonly railYardMaterial: THREE.MeshStandardMaterial;
  private readonly sidewalkPlazaMaterial: THREE.MeshStandardMaterial;
  private readonly urbanPlazaMaterial: THREE.MeshStandardMaterial;
  private readonly trunkRoadMaterial: THREE.MeshStandardMaterial;
  private readonly primaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly secondaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly tertiaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly intersectionRoadMaterial: THREE.MeshStandardMaterial;
  private readonly elevatedRoadMaterial: THREE.MeshStandardMaterial;

  private readonly surfaceMaterials: THREE.MeshStandardMaterial[];
  private readonly clipPlanes: THREE.Plane[];
  private readonly cutawayUniforms?: CutawayUniforms;
  private readonly undergroundReferenceGrid: THREE.GridHelper;
  private bayfrontDetails: BayfrontDetailHandle | null = null;
  private airportComplexes: AirportComplexesHandle | null = null;
  private imperialPalaceDetails: ImperialPalaceHandle | null = null;
  private streetLightNetwork: StreetLightNetworkHandle | null = null;
  private vegetation: VegetationSystemHandle | null = null;
  private textures: TerrainTextureBundle;
  private isDark: boolean;

  constructor(
    isDark: boolean,
    clipPlanes: THREE.Plane[],
    cutawayUniforms?: CutawayUniforms,
    lightingUniforms?: CityLightingUniforms,
  ) {
    this.isDark = isDark;
    this.clipPlanes = clipPlanes;
    this.cutawayUniforms = cutawayUniforms;
    this.lightingUniforms = lightingUniforms ?? createCityLightingUniforms();
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
        bumpScale: 0.16,
        emissiveMap: this.textures.parcel.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.34 : 0.0,
        roughness: 1.0,
        metalness: 0.01,
      },
      levelPo('baseGround'),
    );

    this.bayMaterial = mkSurfaceMat(
      {
        color: isDark ? 0x10283f : 0x35648a,
        roughnessMap: this.textures.water.roughnessMap,
        bumpMap: this.textures.water.bumpMap,
        bumpScale: 0.28,
        roughness: 0.36,
        metalness: 0.12,
        envMapIntensity: 1.85,
      },
      levelPo('tokyoBay'),
    );

    this.quayMaterial = mkSurfaceMat(
      { color: isDark ? 0x2b333f : 0x8d8a84, roughness: 0.9, metalness: 0.04 },
      levelPo('riverQuay'),
    );

    this.waterMaterial = mkSurfaceMat(
      {
        color: isDark ? 0x153654 : 0x3b6e94,
        roughnessMap: this.textures.water.roughnessMap,
        bumpMap: this.textures.water.bumpMap,
        bumpScale: 0.24,
        roughness: 0.38,
        metalness: 0.1,
        envMapIntensity: 1.85,
      },
      levelPo('inlandWater'),
    );

    this.landuseResidentialMat = mkSurfaceMat(
      {
        map: this.textures.parcel.map,
        roughnessMap: this.textures.parcel.roughnessMap,
        bumpMap: this.textures.parcel.bumpMap,
        bumpScale: 0.14,
        emissiveMap: this.textures.parcel.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.44 : 0.0,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.01,
      },
      levelPo('landuseResidential'),
    );

    this.landuseIndustrialMat = mkSurfaceMat(
      {
        map: this.textures.industrialPort.map,
        roughnessMap: this.textures.industrialPort.roughnessMap,
        bumpMap: this.textures.industrialPort.bumpMap,
        bumpScale: 0.16,
        emissive: new THREE.Color(isDark ? 0xffcb8c : 0x000000),
        emissiveIntensity: isDark ? 0.12 : 0.0,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.04,
      },
      levelPo('landuseIndustrial'),
    );

    this.landuseCommercialMat = mkSurfaceMat(
      {
        map: this.textures.commercialHardscape.map,
        roughnessMap: this.textures.commercialHardscape.roughnessMap,
        bumpMap: this.textures.commercialHardscape.bumpMap,
        bumpScale: 0.14,
        emissiveMap: this.textures.commercialHardscape.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.78 : 0.0,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.03,
      },
      levelPo('landuseCommercial'),
    );

    this.parkMaterial = mkSurfaceMat(
      {
        map: this.textures.grassMeadow.map,
        roughnessMap: this.textures.grassMeadow.roughnessMap,
        bumpMap: this.textures.grassMeadow.bumpMap,
        bumpScale: 0.18,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
      },
      levelPo('parks'),
    );

    this.forestFloorMaterial = mkSurfaceMat(
      {
        map: this.textures.forestFloor.map,
        roughnessMap: this.textures.forestFloor.roughnessMap,
        bumpMap: this.textures.forestFloor.bumpMap,
        bumpScale: 0.22,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
      },
      levelPo('parks'),
    );

    this.bareSoilMaterial = mkSurfaceMat(
      {
        map: this.textures.bareSoil.map,
        roughnessMap: this.textures.bareSoil.roughnessMap,
        bumpMap: this.textures.bareSoil.bumpMap,
        bumpScale: 0.18,
        color: 0xffffff,
        roughness: 1.0,
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
        roughness: 1.0,
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
        emissiveIntensity: isDark ? 0.22 : 0.0,
        roughness: 1.0,
        metalness: 0.02,
      },
      levelPo('sidewalksPlazas'),
    );

    this.urbanPlazaMaterial = mkSurfaceMat(
      {
        map: this.textures.urbanPlaza.map,
        roughnessMap: this.textures.urbanPlaza.roughnessMap,
        bumpMap: this.textures.urbanPlaza.bumpMap,
        bumpScale: 0.16,
        emissiveMap: this.textures.urbanPlaza.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.28 : 0.0,
        roughness: 1.0,
        metalness: 0.03,
      },
      levelPo('sidewalksPlazas'),
    );

    this.tertiaryRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadTertiary.map,
        roughnessMap: this.textures.roadTertiary.roughnessMap,
        bumpMap: this.textures.roadTertiary.bumpMap,
        bumpScale: 0.12,
        emissiveMap: this.textures.roadTertiary.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.22 : 0.0,
        roughness: 1.0,
        metalness: 0.04,
      },
      levelPo('roadTertiary'),
    );

    this.secondaryRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadSecondary.map,
        roughnessMap: this.textures.roadSecondary.roughnessMap,
        bumpMap: this.textures.roadSecondary.bumpMap,
        bumpScale: 0.12,
        emissiveMap: this.textures.roadSecondary.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.36 : 0.0,
        roughness: 1.0,
        metalness: 0.04,
      },
      levelPo('roadSecondary'),
    );

    this.primaryRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadPrimary.map,
        roughnessMap: this.textures.roadPrimary.roughnessMap,
        bumpMap: this.textures.roadPrimary.bumpMap,
        bumpScale: 0.12,
        emissiveMap: this.textures.roadPrimary.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.50 : 0.0,
        roughness: 1.0,
        metalness: 0.05,
      },
      levelPo('roadPrimary'),
    );

    this.trunkRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.roadTrunk.map,
        roughnessMap: this.textures.roadTrunk.roughnessMap,
        bumpMap: this.textures.roadTrunk.bumpMap,
        bumpScale: 0.12,
        emissiveMap: this.textures.roadTrunk.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.64 : 0.0,
        roughness: 1.0,
        metalness: 0.05,
      },
      levelPo('roadTrunk'),
    );

    this.intersectionRoadMaterial = mkSurfaceMat(
      {
        map: this.textures.intersection.map,
        roughnessMap: this.textures.intersection.roughnessMap,
        bumpMap: this.textures.intersection.bumpMap,
        bumpScale: 0.12,
        emissiveMap: this.textures.intersection.emissiveMap ?? null,
        emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
        emissiveIntensity: isDark ? 0.48 : 0.0,
        roughness: 1.0,
        metalness: 0.04,
      },
      levelPo('roadIntersectionApron'),
    );

    this.elevatedRoadMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.roadTrunk.map,
      roughnessMap: this.textures.roadTrunk.roughnessMap,
      bumpMap: this.textures.roadTrunk.bumpMap,
      bumpScale: 0.12,
      emissiveMap: this.textures.roadTrunk.emissiveMap ?? null,
      emissive: new THREE.Color(isDark ? 0xffffff : 0x000000),
      emissiveIntensity: isDark ? 0.58 : 0.0,
      roughness: 1.0,
      metalness: 0.07,
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
      this.forestFloorMaterial,
      this.bareSoilMaterial,
      this.railYardMaterial,
      this.sidewalkPlazaMaterial,
      this.urbanPlazaMaterial,
      this.tertiaryRoadMaterial,
      this.secondaryRoadMaterial,
      this.primaryRoadMaterial,
      this.trunkRoadMaterial,
      this.intersectionRoadMaterial,
    ];

    injectUrbanGroundShader(this.groundMaterial, this.lightingUniforms, 'baseGround');
    injectUrbanGroundShader(this.landuseResidentialMat, this.lightingUniforms, 'residential');
    injectUrbanGroundShader(this.landuseCommercialMat, this.lightingUniforms, 'commercial');
    injectUrbanGroundShader(this.landuseIndustrialMat, this.lightingUniforms, 'industrial');
    injectUrbanGroundShader(this.railYardMaterial, this.lightingUniforms, 'railYard');
    injectUrbanGroundShader(this.sidewalkPlazaMaterial, this.lightingUniforms, 'sidewalk');
    injectUrbanGroundShader(this.urbanPlazaMaterial, this.lightingUniforms, 'plaza');
    injectUrbanGroundShader(this.parkMaterial, this.lightingUniforms, 'parkGrass');
    injectUrbanGroundShader(this.forestFloorMaterial, this.lightingUniforms, 'forestFloor');
    injectUrbanGroundShader(this.bareSoilMaterial, this.lightingUniforms, 'bareSoil');
    injectUrbanGroundShader(this.tertiaryRoadMaterial, this.lightingUniforms, 'road');
    injectUrbanGroundShader(this.secondaryRoadMaterial, this.lightingUniforms, 'road');
    injectUrbanGroundShader(this.primaryRoadMaterial, this.lightingUniforms, 'road');
    injectUrbanGroundShader(this.trunkRoadMaterial, this.lightingUniforms, 'road');
    injectUrbanGroundShader(this.intersectionRoadMaterial, this.lightingUniforms, 'road');
    injectUrbanGroundShader(this.elevatedRoadMaterial, this.lightingUniforms, 'road');
    injectWaterShader(this.bayMaterial, this.lightingUniforms, 'bay');
    injectWaterShader(this.waterMaterial, this.lightingUniforms, 'river');

    if (cutawayUniforms) {
      for (const mat of this.surfaceMaterials) {
        injectRadialCutaway(mat, cutawayUniforms, 'terrain');
      }
      injectRadialCutaway(this.elevatedRoadMaterial, cutawayUniforms, 'terrain');
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
      commercialHardscape: createCommercialHardscapeTextureSet(isDark),
      industrialPort: createIndustrialPortTextureSet(isDark),
      railYard: createRailYardTextureSet(isDark),
      sidewalk: createSidewalkPaverTextureSet(isDark),
      urbanPlaza: createUrbanPlazaTextureSet(isDark),
      grassMeadow: createGrassMeadowTextureSet(isDark),
      forestFloor: createForestFloorTextureSet(isDark),
      bareSoil: createBareSoilTextureSet(isDark),
      intersection: createIntersectionAsphaltTextureSet(isDark),
      roadTrunk: createAsphaltRoadTextureSet('trunk', isDark),
      roadPrimary: createAsphaltRoadTextureSet('primary', isDark),
      roadSecondary: createAsphaltRoadTextureSet('secondary', isDark),
      roadTertiary: createAsphaltRoadTextureSet('tertiary', isDark),
      water: createWaterTextureSet(isDark),
    };
  }

  private disposeTextures(bundle: TerrainTextureBundle): void {
    const sets = [
      bundle.parcel,
      bundle.commercialHardscape,
      bundle.industrialPort,
      bundle.railYard,
      bundle.sidewalk,
      bundle.urbanPlaza,
      bundle.grassMeadow,
      bundle.forestFloor,
      bundle.bareSoil,
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
      this.lightingUniforms,
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

    // 4. Real OSM Parks, Woodland Forests, Open Grass Lawns & Bare Soil (+ Imperial Palace understory)
    const parkGeoms: THREE.BufferGeometry[] = [];
    const forestGeoms: THREE.BufferGeometry[] = [];
    const soilGeoms: THREE.BufferGeometry[] = [];

    const palaceGeom = buildPolygonGeometryXZ(
      IMPERIAL_PALACE_INNER_POLY as [number, number][],
      levelY('parks') - 0.008,
      'world',
    );
    if (palaceGeom) forestGeoms.push(palaceGeom);

    for (let i = 0; i < env.parkPolygons.length; i++) {
      const pk = env.parkPolygons[i]!;
      const y = Math.min(SURFACE_ELEVATION_LAYERS.parkMaxY, levelY('parks') + (i % 6) * 0.014);
      const g = buildPolygonGeometryXZ(pk.pts, y, 'world');
      if (!g) continue;
      const isWoodland =
        pk.kind === 'forest' ||
        (pk.name !== null &&
          (pk.name.includes('明治神宮') ||
            pk.name.includes('新宿御苑') ||
            pk.name.includes('自然教育園') ||
            pk.name.includes('林') ||
            pk.name.includes('森')));
      if (isWoodland) forestGeoms.push(g);
      else parkGeoms.push(g);
    }
    if (env.bareSoilPolygons) {
      for (let i = 0; i < env.bareSoilPolygons.length; i++) {
        const sp = env.bareSoilPolygons[i]!;
        const g = buildPolygonGeometryXZ(
          sp.pts,
          Math.min(SURFACE_ELEVATION_LAYERS.parkMaxY, levelY('parks') + 0.018 + (i % 3) * 0.004),
          'world',
        );
        if (g) soilGeoms.push(g);
      }
    }
    // Kokyo Gaien ceremonial gravel forecourt (east of Imperial Palace inner moat)
    const kokyoGravel = buildPolygonGeometryXZ(
      [
        [-1165, 115],
        [-885, 115],
        [-885, 330],
        [-1165, 330],
      ],
      Math.min(SURFACE_ELEVATION_LAYERS.parkMaxY, levelY('parks') + 0.022),
      'world',
    );
    if (kokyoGravel) soilGeoms.push(kokyoGravel);

    this.addMergedLayer(parkGeoms, this.parkMaterial, 'osm-parks-layer', 4);
    this.addMergedLayer(forestGeoms, this.forestFloorMaterial, 'osm-forest-floors', 4);
    this.addMergedLayer(soilGeoms, this.bareSoilMaterial, 'osm-bare-soil', 4);

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
    const sidewalkGeoms: THREE.BufferGeometry[] = [];
    const urbanPlazaGeoms: THREE.BufferGeometry[] = [];
    if (env.plazaPolygons) {
      for (let i = 0; i < env.plazaPolygons.length; i++) {
        const g = buildPolygonGeometryXZ(
          env.plazaPolygons[i]!.pts,
          levelY('sidewalksPlazas') + (i % 3) * 0.003,
          'world',
        );
        if (g) urbanPlazaGeoms.push(g);
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
        urbanPlazaGeoms.push(normalizeFlatGeometry(g, 'world'));
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
      if (sw) sidewalkGeoms.push(sw);

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

    this.addMergedLayer(sidewalkGeoms, this.sidewalkPlazaMaterial, 'osm-sidewalks-plazas', 6);
    this.addMergedLayer(urbanPlazaGeoms, this.urbanPlazaMaterial, 'osm-urban-plazas', 6);
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
    if (this.vegetation) {
      this.group.remove(this.vegetation.group);
      this.vegetation.dispose();
      this.vegetation = null;
    }
    this.vegetation = buildNaturalVegetation(
      env,
      this.isDark,
      this.clipPlanes,
      this.lightingUniforms,
      this.cutawayUniforms,
    );
    this.group.add(this.vegetation.group);
    if (this.streetLightNetwork) {
      this.group.remove(this.streetLightNetwork.group);
      this.streetLightNetwork.dispose();
    }
    this.streetLightNetwork = buildTokyoStreetLightNetwork(env, this.isDark, this.clipPlanes);
    this.group.add(this.streetLightNetwork.group);
    this.streetscapeLayer.populate(env);
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

    // Smooth continuous Time-of-Day luminance grading (handled primarily in groundShader without texture swap)
    this.groundMaterial.color.setHex(0xffffff);
    this.landuseResidentialMat.color.setHex(0xffffff);
    this.landuseCommercialMat.color.setHex(0xffffff);

    // Arterial, expressway, intersection, sidewalk, plaza & neighborhood night lighting ramp
    const lampT = Math.max(0, Math.min(1, (nf - 0.16) / 0.66));
    const lampGlow = lampT * lampT * (3 - 2 * lampT);
    const lampCol = lampGlow > 0.002 ? 0xffffff : 0x000000;
    this.trunkRoadMaterial.emissive.setHex(lampCol);
    this.trunkRoadMaterial.emissiveIntensity = lampGlow * 1.35;
    this.elevatedRoadMaterial.emissive.setHex(lampCol);
    this.elevatedRoadMaterial.emissiveIntensity = lampGlow * 1.20;
    this.primaryRoadMaterial.emissive.setHex(lampCol);
    this.primaryRoadMaterial.emissiveIntensity = lampGlow * 1.15;
    this.secondaryRoadMaterial.emissive.setHex(lampCol);
    this.secondaryRoadMaterial.emissiveIntensity = lampGlow * 0.88;
    this.tertiaryRoadMaterial.emissive.setHex(lampCol);
    this.tertiaryRoadMaterial.emissiveIntensity = lampGlow * 0.58;
    this.intersectionRoadMaterial.emissive.setHex(lampCol);
    this.intersectionRoadMaterial.emissiveIntensity = lampGlow * 1.30;
    this.sidewalkPlazaMaterial.emissive.setHex(lampCol);
    this.sidewalkPlazaMaterial.emissiveIntensity = lampGlow * 0.95;
    this.urbanPlazaMaterial.emissive.setHex(lampCol);
    this.urbanPlazaMaterial.emissiveIntensity = lampGlow * 0.92;
    this.landuseCommercialMat.emissive.setHex(lampCol);
    this.landuseCommercialMat.emissiveIntensity = lampGlow * 0.78;
    this.landuseResidentialMat.emissive.setHex(lampCol);
    this.landuseResidentialMat.emissiveIntensity = lampGlow * 0.44;
    this.groundMaterial.emissive.setHex(lampCol);
    this.groundMaterial.emissiveIntensity = lampGlow * 0.34;
    this.landuseIndustrialMat.emissive.setHex(lampGlow > 0.002 ? 0xffcb8c : 0x000000);
    this.landuseIndustrialMat.emissiveIntensity = lampGlow * 0.12;
    this.railYardMaterial.emissive.setHex(lampGlow > 0.002 ? 0xdce8f8 : 0x000000);
    this.railYardMaterial.emissiveIntensity = lampGlow * 0.14;
    this.streetLightNetwork?.setNightFactor(nf);
    this.imperialPalaceDetails?.setNightFactor(nf);
    this.airportComplexes?.setNightFactor(nf);

    // Atmospheric canopy & park lighting tint
    this.vegetation?.setTimeOfDay(
      nf,
      this.lightingUniforms.uGoldenFactor.value,
      this.lightingUniforms.uBlueHourFactor.value,
    );

    const canopyDay = new THREE.Color(0xffffff);
    const canopyGolden = new THREE.Color(0xffcfa6);
    const canopyNight = new THREE.Color(0x6e8cb0);
    this.parkMaterial.color
      .copy(canopyDay)
      .lerp(canopyNight, nf * 0.25)
      .lerp(canopyGolden, goldenWarmth * 0.16);
    this.forestFloorMaterial.color.copy(this.parkMaterial.color);
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

    this.vegetation?.setOpacity(clamped, isTranslucent);

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
    bindSurface(this.urbanPlazaMaterial, this.textures.urbanPlaza);
    bindSurface(this.intersectionRoadMaterial, this.textures.intersection);
    bindSurface(this.trunkRoadMaterial, this.textures.roadTrunk);
    bindSurface(this.primaryRoadMaterial, this.textures.roadPrimary);
    bindSurface(this.secondaryRoadMaterial, this.textures.roadSecondary);
    bindSurface(this.tertiaryRoadMaterial, this.textures.roadTertiary);

    bindSurface(this.landuseResidentialMat, this.textures.parcel);
    this.landuseResidentialMat.color.setHex(0xffffff);

    this.landuseIndustrialMat.map = this.textures.industrialPort.map;
    this.landuseIndustrialMat.roughnessMap = this.textures.industrialPort.roughnessMap;
    this.landuseIndustrialMat.bumpMap = this.textures.industrialPort.bumpMap;
    this.landuseIndustrialMat.color.setHex(0xffffff);
    this.landuseIndustrialMat.needsUpdate = true;

    bindSurface(this.landuseCommercialMat, this.textures.commercialHardscape);
    this.landuseCommercialMat.color.setHex(0xffffff);

    this.bayMaterial.roughnessMap = this.textures.water.roughnessMap;
    this.bayMaterial.bumpMap = this.textures.water.bumpMap;
    this.bayMaterial.color.setHex(isDark ? 0x10283f : 0x35648a);
    this.bayMaterial.needsUpdate = true;

    this.waterMaterial.roughnessMap = this.textures.water.roughnessMap;
    this.waterMaterial.bumpMap = this.textures.water.bumpMap;
    this.waterMaterial.color.setHex(isDark ? 0x153654 : 0x3b6e94);
    this.waterMaterial.needsUpdate = true;

    bindSurface(this.parkMaterial, this.textures.grassMeadow);
    bindSurface(this.forestFloorMaterial, this.textures.forestFloor);
    bindSurface(this.bareSoilMaterial, this.textures.bareSoil);

    this.quayMaterial.color.setHex(isDark ? 0x2b333f : 0x8d8a84);
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
    this.vegetation?.setTheme(isDark);

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
    if (this.vegetation) {
      this.group.remove(this.vegetation.group);
      this.vegetation.dispose();
      this.vegetation = null;
    }
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.disposeTextures(this.textures);
    for (const mat of this.surfaceMaterials) mat.dispose();
    this.elevatedRoadMaterial.dispose();
  }
}
