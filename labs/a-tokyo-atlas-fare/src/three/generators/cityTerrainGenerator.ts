/**
 * Procedural City Ground, Urban Landuse Blocks, Rivers/Coastline, Parks, Sidewalks,
 * Station Plazas, Railway Gravel Yards, Major/Secondary Roads & Intersections Generator (P0 + P1).
 *
 * Built from real OpenStreetMap Tokyo 23-ward polygons & polylines in base-environment.json
 * plus railway corridor corridors derived from atlas.json.
 *
 * P0 Rendering Stability Guarantees:
 *  - Every surface layer renders strictly opaque (transparent: false, depthWrite: true, FrontSide)
 *    during surface browsing.
 *  - Clean vertical elevation stratification (-1.25m .. +0.16m) + calibrated polygonOffset tiers
 *    eliminate Z-fighting & transparent sort flicker during orbit/pan/zoom.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createParkCanopyTexture, createUrbanGroundTexture } from '../materials/facadeLibrary.js';
import type { UrbanBaseEnvironment } from '../types.js';

function normalizeFlatGeometry(geom: THREE.BufferGeometry, keepWorldUv = false): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (keepWorldUv) {
    const pos = g.getAttribute('position');
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i);
      uvs[i * 2 + 1] = pos.getZ(i);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  } else if (g.getAttribute('uv')) {
    g.deleteAttribute('uv');
  }
  return g;
}

function buildPolygonGeometryXZ(
  pts: [number, number][],
  y: number,
  keepWorldUv = false,
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
  return normalizeFlatGeometry(geom, keepWorldUv);
}

function buildRibbonGeometryXZ(
  pts: [number, number][],
  width: number,
  y: number,
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const half = width * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const cur = pts[i]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;

    positions.push(cur[0] + nx, y, cur[1] + nz);
    positions.push(cur[0] - nx, y, cur[1] - nz);

    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return normalizeFlatGeometry(geom, false);
}

export class CityTerrainLayer {
  readonly group = new THREE.Group();
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
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly secondaryRoadMaterial: THREE.MeshStandardMaterial;
  private readonly elevatedRoadMaterial: THREE.MeshStandardMaterial;

  private readonly surfaceMaterials: THREE.MeshStandardMaterial[];
  private readonly undergroundReferenceGrid: THREE.GridHelper;
  private groundTexture: THREE.CanvasTexture;
  private parkTexture: THREE.CanvasTexture;
  private isDark: boolean;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[]) {
    this.isDark = isDark;
    this.group.name = 'city-terrain-layer';

    this.groundTexture = createUrbanGroundTexture(isDark);
    this.parkTexture = createParkCanopyTexture(isDark);

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

    // Strictly ordered opaque elevation & polygonOffset hierarchy (P0)
    this.groundMaterial = mkSurfaceMat(
      { map: this.groundTexture, roughness: 0.96, metalness: 0.01 },
      6,
    );

    this.bayMaterial = mkSurfaceMat(
      {
        color: isDark ? 0x10283f : 0x6b9ec2,
        roughness: 0.16,
        metalness: 0.28,
        envMapIntensity: 1.3,
      },
      5,
    );

    this.landuseCommercialMat = mkSurfaceMat(
      { color: isDark ? 0x1c2430 : 0xd3cec6, roughness: 0.94, metalness: 0.02 },
      4,
    );

    this.landuseResidentialMat = mkSurfaceMat(
      { color: isDark ? 0x18202b : 0xdfdcd4, roughness: 0.96, metalness: 0.01 },
      4,
    );

    this.landuseIndustrialMat = mkSurfaceMat(
      { color: isDark ? 0x1b212a : 0xc9ccd0, roughness: 0.95, metalness: 0.03 },
      4,
    );

    this.quayMaterial = mkSurfaceMat(
      { color: isDark ? 0x2a3340 : 0xbab6ae, roughness: 0.9, metalness: 0.04 },
      3.5,
    );

    this.waterMaterial = mkSurfaceMat(
      {
        color: isDark ? 0x153552 : 0x77a9cf,
        roughness: 0.18,
        metalness: 0.26,
        envMapIntensity: 1.25,
      },
      3,
    );

    this.parkMaterial = mkSurfaceMat(
      {
        map: this.parkTexture,
        color: 0xffffff,
        roughness: 0.96,
        metalness: 0.0,
      },
      2,
    );

    this.railYardMaterial = mkSurfaceMat(
      { color: isDark ? 0x242a33 : 0x918c84, roughness: 0.96, metalness: 0.04 },
      1,
    );

    this.sidewalkPlazaMaterial = mkSurfaceMat(
      { color: isDark ? 0x26303d : 0xd9d5cd, roughness: 0.88, metalness: 0.02 },
      0,
    );

    this.secondaryRoadMaterial = mkSurfaceMat(
      { color: isDark ? 0x222c39 : 0x7c848e, roughness: 0.88, metalness: 0.04 },
      -1,
    );

    this.roadMaterial = mkSurfaceMat(
      { color: isDark ? 0x1d2632 : 0x67707a, roughness: 0.85, metalness: 0.05 },
      -1.5,
    );

    this.elevatedRoadMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x394557 : 0xa5abb3,
      roughness: 0.82,
      metalness: 0.07,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      clippingPlanes: clipPlanes,
    });

    this.surfaceMaterials = [
      this.groundMaterial,
      this.bayMaterial,
      this.landuseCommercialMat,
      this.landuseResidentialMat,
      this.landuseIndustrialMat,
      this.quayMaterial,
      this.waterMaterial,
      this.parkMaterial,
      this.railYardMaterial,
      this.sidewalkPlazaMaterial,
      this.secondaryRoadMaterial,
      this.roadMaterial,
    ];

    // Base metropolitan ground plane at y = -1.25
    const basePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(110_000, 110_000),
      this.groundMaterial,
    );
    basePlane.rotation.x = -Math.PI / 2;
    basePlane.position.y = -1.25;
    basePlane.receiveShadow = true;
    basePlane.renderOrder = 0;
    basePlane.name = 'metropolitan-ground';
    this.group.add(basePlane);

    // Subtle deep reference datum grid at y = -44 (visible when exploring underground!)
    this.undergroundReferenceGrid = new THREE.GridHelper(32_000, 64, 0x38bdf8, 0x334155);
    this.undergroundReferenceGrid.position.y = -44;
    const gridMat = this.undergroundReferenceGrid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.22;
    this.undergroundReferenceGrid.visible = false;
    this.group.add(this.undergroundReferenceGrid);
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
    // 1. Tokyo Bay ocean backdrop at y = -0.95
    const bayPts: [number, number][] = [
      [1500, 4200],
      [18000, 2200],
      [25000, 24000],
      [-6000, 24000],
      [-2000, 11500],
    ];
    const bayGeom = buildPolygonGeometryXZ(bayPts, -0.95);
    if (bayGeom) {
      const bayMesh = new THREE.Mesh(bayGeom, this.bayMaterial);
      bayMesh.receiveShadow = true;
      bayMesh.renderOrder = 1;
      bayMesh.name = 'tokyo-bay-ocean';
      this.group.add(bayMesh);
    }

    // 2. Real OSM Urban Landuse Districts & Railway Yards (y = -0.82 .. -0.74)
    if (env.landuseBlocks && env.landuseBlocks.length > 0) {
      const commGeoms: THREE.BufferGeometry[] = [];
      const resGeoms: THREE.BufferGeometry[] = [];
      const indGeoms: THREE.BufferGeometry[] = [];
      const railYardGeoms: THREE.BufferGeometry[] = [];

      for (let i = 0; i < env.landuseBlocks.length; i++) {
        const blk = env.landuseBlocks[i]!;
        if (blk.kind === 'railway') {
          const g = buildPolygonGeometryXZ(blk.pts, -0.17 + (i % 3) * 0.006);
          if (g) railYardGeoms.push(g);
        } else if (blk.kind === 'commercial') {
          const g = buildPolygonGeometryXZ(blk.pts, -0.76 + (i % 4) * 0.005);
          if (g) commGeoms.push(g);
        } else if (blk.kind === 'industrial') {
          const g = buildPolygonGeometryXZ(blk.pts, -0.79 + (i % 4) * 0.005);
          if (g) indGeoms.push(g);
        } else {
          const g = buildPolygonGeometryXZ(blk.pts, -0.83 + (i % 4) * 0.005);
          if (g) resGeoms.push(g);
        }
      }

      this.addMergedLayer(resGeoms, this.landuseResidentialMat, 'osm-landuse-residential', 2);
      this.addMergedLayer(indGeoms, this.landuseIndustrialMat, 'osm-landuse-industrial', 2);
      this.addMergedLayer(commGeoms, this.landuseCommercialMat, 'osm-landuse-commercial', 2);
      this.addMergedLayer(railYardGeoms, this.railYardMaterial, 'osm-landuse-railway-yards', 5);
    }

    // 3. Real OSM Inland Waterbodies, Rivers & Embankment Quay Borders
    const quayGeoms: THREE.BufferGeometry[] = [];
    const waterGeoms: THREE.BufferGeometry[] = [];
    for (let i = 0; i < env.waterPolygons.length; i++) {
      const wp = env.waterPolygons[i]!;
      const y = -0.58 + (i % 5) * 0.01;
      const g = buildPolygonGeometryXZ(wp.pts, y);
      if (g) waterGeoms.push(g);
    }
    for (let i = 0; i < env.riverLines.length; i++) {
      const rv = env.riverLines[i]!;
      const q = buildRibbonGeometryXZ(rv.pts, rv.width * 0.62 + 8, -0.65 + (i % 3) * 0.006);
      if (q) quayGeoms.push(q);
      const g = buildRibbonGeometryXZ(rv.pts, rv.width * 0.55, -0.49 + (i % 4) * 0.01);
      if (g) waterGeoms.push(g);
    }
    this.addMergedLayer(quayGeoms, this.quayMaterial, 'osm-river-quays', 2);
    this.addMergedLayer(waterGeoms, this.waterMaterial, 'osm-water-layer', 3);

    // 4. Real OSM Parks & Botanical Forests (keepWorldUv = true for organic canopy stipple!)
    const parkGeoms: THREE.BufferGeometry[] = [];
    for (let i = 0; i < env.parkPolygons.length; i++) {
      const pk = env.parkPolygons[i]!;
      const y = -0.34 + (i % 7) * 0.014;
      const g = buildPolygonGeometryXZ(pk.pts, y, true);
      if (g) parkGeoms.push(g);
    }
    this.addMergedLayer(parkGeoms, this.parkMaterial, 'osm-parks-layer', 4);

    // 5. Railway Right-of-Way Ballast Corridors (derived from surface railway segments)
    if (env.railCorridors && env.railCorridors.length > 0) {
      const corrGeoms: THREE.BufferGeometry[] = [];
      for (let i = 0; i < env.railCorridors.length; i++) {
        const c = env.railCorridors[i]!;
        const g = buildRibbonGeometryXZ(c.pts, c.width, -0.14 + (i % 4) * 0.004);
        if (g) corrGeoms.push(g);
      }
      this.addMergedLayer(corrGeoms, this.railYardMaterial, 'rail-corridor-yards', 5);
    }

    // 6. Sidewalk Curbs, Pedestrian Squares & Station Forecourt Plazas (y = -0.06)
    const plazaGeoms: THREE.BufferGeometry[] = [];
    if (env.plazaPolygons) {
      for (let i = 0; i < env.plazaPolygons.length; i++) {
        const g = buildPolygonGeometryXZ(env.plazaPolygons[i]!.pts, -0.055 + (i % 3) * 0.004);
        if (g) plazaGeoms.push(g);
      }
    }
    if (env.stationPlazas) {
      const plazaBox = normalizeFlatGeometry(new THREE.CircleGeometry(1, 16), false);
      plazaBox.rotateX(-Math.PI / 2);
      for (let i = 0; i < env.stationPlazas.length; i++) {
        const sp = env.stationPlazas[i]!;
        const g = plazaBox.clone();
        g.scale(sp.rx, 1, sp.rz);
        g.rotateY(-sp.a);
        g.translate(sp.x, -0.045 + (i % 3) * 0.004, sp.z);
        plazaGeoms.push(g);
      }
      plazaBox.dispose();
    }

    // 7. Real OSM Road Network (Major Arterials + Secondary/Tertiary Streets + Flanking Sidewalks)
    const majorRoadGeoms: THREE.BufferGeometry[] = [];
    const minorRoadGeoms: THREE.BufferGeometry[] = [];
    const elevatedRoadGeoms: THREE.BufferGeometry[] = [];

    for (let i = 0; i < env.roads.length; i++) {
      const r = env.roads[i]!;
      if (r.el === 1) {
        const g = buildRibbonGeometryXZ(r.pts, r.w * 0.85, 7.4 + (i % 3) * 0.04);
        if (g) elevatedRoadGeoms.push(g);
      } else if (r.hw === 'trunk' || r.hw === 'primary') {
        // Flanking paved sidewalk ribbon slightly below road crown
        const sw = buildRibbonGeometryXZ(r.pts, r.w + 6.5, -0.065 + (i % 4) * 0.003);
        if (sw) plazaGeoms.push(sw);

        const classY = r.hw === 'trunk' ? 0.115 : 0.085;
        const g = buildRibbonGeometryXZ(r.pts, r.w, classY + (i % 5) * 0.004);
        if (g) majorRoadGeoms.push(g);
      } else {
        if (r.hw === 'secondary') {
          const sw = buildRibbonGeometryXZ(r.pts, r.w + 4.2, -0.075 + (i % 3) * 0.003);
          if (sw) plazaGeoms.push(sw);
        }
        const classY = r.hw === 'secondary' ? 0.05 : 0.025;
        const g = buildRibbonGeometryXZ(r.pts, r.w, classY + (i % 5) * 0.003);
        if (g) minorRoadGeoms.push(g);
      }
    }

    // Add road intersection discs cleanly
    const discTemplate = normalizeFlatGeometry(new THREE.CircleGeometry(1, 10), false);
    discTemplate.rotateX(-Math.PI / 2);
    for (let i = 0; i < env.intersections.length; i++) {
      const [ix, iz, rad] = env.intersections[i]!;
      const g = discTemplate.clone();
      g.scale(rad, 1, rad);
      g.translate(ix, 0.145 + (i % 3) * 0.004, iz);
      majorRoadGeoms.push(g);
    }
    discTemplate.dispose();

    this.addMergedLayer(plazaGeoms, this.sidewalkPlazaMaterial, 'osm-sidewalks-plazas', 6);
    this.addMergedLayer(minorRoadGeoms, this.secondaryRoadMaterial, 'osm-secondary-streets', 7);
    this.addMergedLayer(majorRoadGeoms, this.roadMaterial, 'osm-surface-roads', 7);
    this.addMergedLayer(elevatedRoadGeoms, this.elevatedRoadMaterial, 'osm-elevated-roads', 8, false);
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
    const elevTranslucent = isTranslucent && clamped < 0.85;
    const elevNeed = this.elevatedRoadMaterial.transparent !== elevTranslucent;
    this.elevatedRoadMaterial.transparent = elevTranslucent;
    this.elevatedRoadMaterial.opacity = elevTranslucent ? Math.min(1, clamped + 0.18) : 1.0;
    this.elevatedRoadMaterial.depthWrite = !elevTranslucent;
    if (elevNeed) this.elevatedRoadMaterial.needsUpdate = true;
    this.undergroundReferenceGrid.visible = undergroundActive || clamped < 0.7;
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;

    this.groundTexture.dispose();
    this.groundTexture = createUrbanGroundTexture(isDark);
    this.groundMaterial.map = this.groundTexture;
    this.groundMaterial.needsUpdate = true;

    this.parkTexture.dispose();
    this.parkTexture = createParkCanopyTexture(isDark);
    this.parkMaterial.map = this.parkTexture;
    this.parkMaterial.needsUpdate = true;

    this.bayMaterial.color.setHex(isDark ? 0x10283f : 0x6b9ec2);
    this.waterMaterial.color.setHex(isDark ? 0x153552 : 0x77a9cf);
    this.quayMaterial.color.setHex(isDark ? 0x2a3340 : 0xbab6ae);
    this.landuseCommercialMat.color.setHex(isDark ? 0x1c2430 : 0xd3cec6);
    this.landuseResidentialMat.color.setHex(isDark ? 0x18202b : 0xdfdcd4);
    this.landuseIndustrialMat.color.setHex(isDark ? 0x1b212a : 0xc9ccd0);
    this.railYardMaterial.color.setHex(isDark ? 0x242a33 : 0x918c84);
    this.sidewalkPlazaMaterial.color.setHex(isDark ? 0x26303d : 0xd9d5cd);
    this.secondaryRoadMaterial.color.setHex(isDark ? 0x222c39 : 0x7c848e);
    this.roadMaterial.color.setHex(isDark ? 0x1d2632 : 0x67707a);
    this.elevatedRoadMaterial.color.setHex(isDark ? 0x394557 : 0xa5abb3);
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.groundTexture.dispose();
    this.parkTexture.dispose();
    for (const mat of this.surfaceMaterials) mat.dispose();
    this.elevatedRoadMaterial.dispose();
  }
}
