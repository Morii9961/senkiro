/**
 * Procedural City Ground, Rivers/Waterbodies, Parks, Major Roads & Intersections Generator.
 * Built directly from real OpenStreetMap Tokyo 23-ward polygons & polylines in base-environment.json.
 * Supports smooth Underground View opacity fading and horizontal depth slicing.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { UrbanBaseEnvironment } from '../types.js';

function createSubtleGroundGridTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#141c26' : '#e6eaef';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(71,85,105,0.11)';
    ctx.lineWidth = 1;
    // Fine 1/4 grid lines
    for (let i = 0; i <= 4; i++) {
      const p = (i * size) / 4;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(71,85,105,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.anisotropy = 4;
  return tex;
}

function normalizeFlatGeometry(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

function buildPolygonGeometryXZ(pts: [number, number][], y: number): THREE.BufferGeometry | null {
  if (pts.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0]![0], -pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i]![0], -pts[i]![1]);
  }
  shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  // ShapeGeometry sits on XY; rotate -PI/2 around X so (x, y) -> (x, 0, -y), mapping -z back to +z!
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);
  return normalizeFlatGeometry(geom);
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
  return normalizeFlatGeometry(geom);
}

export class CityTerrainLayer {
  readonly group = new THREE.Group();
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly parkMaterial: THREE.MeshStandardMaterial;
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly elevatedRoadMaterial: THREE.MeshStandardMaterial;
  private readonly undergroundReferenceGrid: THREE.GridHelper;
  private groundTexture: THREE.CanvasTexture;
  private isDark: boolean;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[]) {
    this.isDark = isDark;
    this.group.name = 'city-terrain-layer';

    this.groundTexture = createSubtleGroundGridTexture(isDark);

    this.groundMaterial = new THREE.MeshStandardMaterial({
      map: this.groundTexture,
      roughness: 0.92,
      metalness: 0.02,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      clippingPlanes: clipPlanes,
    });

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x163856 : 0x8dbce0,
      roughness: 0.28,
      metalness: 0.18,
      transparent: true,
      opacity: 0.96,
      clippingPlanes: clipPlanes,
    });

    this.parkMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1d3b2c : 0xb5d6b2,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.96,
      clippingPlanes: clipPlanes,
    });

    this.roadMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x263140 : 0xc4ccd6,
      roughness: 0.88,
      metalness: 0.04,
      transparent: true,
      opacity: 0.95,
      clippingPlanes: clipPlanes,
    });

    this.elevatedRoadMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x3b495c : 0xaab4c2,
      roughness: 0.82,
      metalness: 0.06,
      transparent: true,
      opacity: 0.94,
      clippingPlanes: clipPlanes,
    });

    // Base metropolitan ground plane (90km x 90km covering Tokyo 23 wards + Omiya + Yokohama)
    const basePlane = new THREE.Mesh(new THREE.PlaneGeometry(110_000, 110_000), this.groundMaterial);
    basePlane.rotation.x = -Math.PI / 2;
    basePlane.position.y = -0.35;
    basePlane.receiveShadow = true;
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

  populateFromEnvironment(env: UrbanBaseEnvironment): void {
    // 1. Waterbodies (Tokyo Bay backdrop southeast + real OSM water polygons + river channels)
    const waterGeoms: THREE.BufferGeometry[] = [];
    // Simplified Tokyo Bay southeast water backdrop (real shoreline clipped visually by land/roads/buildings)
    const bayPts: [number, number][] = [
      [1500, 4200],
      [18000, 2200],
      [25000, 24000],
      [-6000, 24000],
      [-2000, 11500],
    ];
    const bayGeom = buildPolygonGeometryXZ(bayPts, -0.22);
    if (bayGeom) waterGeoms.push(bayGeom);

    for (const wp of env.waterPolygons) {
      const g = buildPolygonGeometryXZ(wp.pts, -0.14);
      if (g) waterGeoms.push(g);
    }
    for (const rv of env.riverLines) {
      const g = buildRibbonGeometryXZ(rv.pts, rv.width * 0.55, -0.12);
      if (g) waterGeoms.push(g);
    }
    if (waterGeoms.length > 0) {
      const merged = mergeGeometries(waterGeoms, false);
      if (merged) {
        const waterMesh = new THREE.Mesh(merged, this.waterMaterial);
        waterMesh.receiveShadow = true;
        waterMesh.name = 'osm-water-layer';
        this.group.add(waterMesh);
      }
      waterGeoms.forEach((g) => g.dispose());
    }

    // 2. Real OSM Parks (Imperial Palace, Yoyogi Park, Shinjuku Gyoen, Ueno Park, Hibiya Park...)
    const parkGeoms: THREE.BufferGeometry[] = [];
    for (const pk of env.parkPolygons) {
      const g = buildPolygonGeometryXZ(pk.pts, -0.06);
      if (g) parkGeoms.push(g);
    }
    if (parkGeoms.length > 0) {
      const merged = mergeGeometries(parkGeoms, false);
      if (merged) {
        const parkMesh = new THREE.Mesh(merged, this.parkMaterial);
        parkMesh.receiveShadow = true;
        parkMesh.name = 'osm-parks-layer';
        this.group.add(parkMesh);
      }
      parkGeoms.forEach((g) => g.dispose());
    }

    // 3. Real OSM Major Roads & Road Intersections (batched into 2 meshes: surface roads + elevated expressways)
    const surfaceRoadGeoms: THREE.BufferGeometry[] = [];
    const elevatedRoadGeoms: THREE.BufferGeometry[] = [];
    for (const r of env.roads) {
      if (r.el === 1) {
        const g = buildRibbonGeometryXZ(r.pts, r.w * 0.85, 7.2);
        if (g) elevatedRoadGeoms.push(g);
      } else {
        const g = buildRibbonGeometryXZ(r.pts, r.w, 0.08);
        if (g) surfaceRoadGeoms.push(g);
      }
    }

    // Add road intersection plazas cleanly (normalized to match ribbon attributes!)
    const discTemplate = normalizeFlatGeometry(new THREE.CircleGeometry(1, 10));
    discTemplate.rotateX(-Math.PI / 2);
    for (const [ix, iz, rad] of env.intersections) {
      const g = discTemplate.clone();
      g.scale(rad, 1, rad);
      g.translate(ix, 0.11, iz);
      surfaceRoadGeoms.push(g);
    }
    discTemplate.dispose();

    if (surfaceRoadGeoms.length > 0) {
      const merged = mergeGeometries(surfaceRoadGeoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.roadMaterial);
        mesh.receiveShadow = true;
        mesh.name = 'osm-surface-roads';
        this.group.add(mesh);
      }
      surfaceRoadGeoms.forEach((g) => g.dispose());
    }

    if (elevatedRoadGeoms.length > 0) {
      const merged = mergeGeometries(elevatedRoadGeoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.elevatedRoadMaterial);
        mesh.name = 'osm-elevated-roads';
        this.group.add(mesh);
      }
      elevatedRoadGeoms.forEach((g) => g.dispose());
    }
  }

  setSurfaceOpacity(opacity: number, undergroundActive: boolean): void {
    const clamped = Math.max(0.04, Math.min(1.0, opacity));
    const isTranslucent = clamped < 0.95;

    for (const mat of [
      this.groundMaterial,
      this.waterMaterial,
      this.parkMaterial,
      this.roadMaterial,
    ]) {
      mat.opacity = clamped;
      mat.depthWrite = !isTranslucent;
      mat.needsUpdate = true;
    }
    this.elevatedRoadMaterial.opacity = Math.min(1, clamped + 0.12);
    this.elevatedRoadMaterial.depthWrite = !isTranslucent;
    this.undergroundReferenceGrid.visible = undergroundActive || clamped < 0.7;
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.groundTexture.dispose();
    this.groundTexture = createSubtleGroundGridTexture(isDark);
    this.groundMaterial.map = this.groundTexture;
    this.groundMaterial.needsUpdate = true;
    this.waterMaterial.color.setHex(isDark ? 0x163856 : 0x8dbce0);
    this.parkMaterial.color.setHex(isDark ? 0x1d3b2c : 0xb5d6b2);
    this.roadMaterial.color.setHex(isDark ? 0x263140 : 0xc4ccd6);
    this.elevatedRoadMaterial.color.setHex(isDark ? 0x3b495c : 0xaab4c2);
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.groundTexture.dispose();
    this.groundMaterial.dispose();
    this.waterMaterial.dispose();
    this.parkMaterial.dispose();
    this.roadMaterial.dispose();
    this.elevatedRoadMaterial.dispose();
  }
}
