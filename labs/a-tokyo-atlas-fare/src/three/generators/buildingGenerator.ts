/**
 * Procedural 3D Tokyo Building, Landmark, Spatial Chunk & Multi-Tier LOD System.
 *
 * All geometry is procedurally generated in code from real OpenStreetMap building footprints,
 * heights, and typologies (NO imported pre-built city models!):
 *  - LOD0 (Near, < 2400m): Extruded real footprint polygons with typology-driven setbacks,
 *    crowns, mechanical penthouses, and procedural glass/concrete/brick facade textures,
 *    batched via mergeGeometries per typology.
 *  - LOD1/LOD2 (Mid/Far, >= 2400m): Single InstancedMesh per chunk using real oriented
 *    bounding boxes (cx, cz, w, d, angle, h) and per-instance typology shading.
 *  - Landmarks: 9 custom multi-part procedural silhouettes (Tokyo Tower, Tokyo Skytree,
 *    Tokyo Metropolitan Government Twin Towers, Mode Gakuen Cocoon Tower, Shibuya Scramble
 *    Square, Shibuya Hikarie, Tokyo Station Marunouchi Heritage Brick Building,
 *    Roppongi Hills Mori Tower, Sunshine 60).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  UrbanBuildingRecord,
  UrbanChunkData,
  UrbanChunkMeta,
  UrbanLandmarkRecord,
  UrbanManifest,
} from '../types.js';

function createFacadeTexture(
  kind: 'office' | 'commercial' | 'residential' | 'brick',
  isDark: boolean,
): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (kind === 'office') {
      ctx.fillStyle = isDark ? '#2b3a4d' : '#c6d2df';
      ctx.fillRect(0, 0, w, h);
      // Curtain-wall horizontal glass bands
      for (let y = 4; y < h; y += 16) {
        ctx.fillStyle = isDark ? '#3c536e' : '#96b1c9';
        ctx.fillRect(0, y, w, 10);
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.32)';
        for (let x = 2; x < w; x += 16) {
          ctx.fillRect(x, y + 1, 12, 8);
        }
      }
    } else if (kind === 'commercial') {
      ctx.fillStyle = isDark ? '#363f4c' : '#d8dde4';
      ctx.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 22) {
        ctx.fillStyle = isDark ? '#4d5d73' : '#b2c0cf';
        ctx.fillRect(6, y, w - 12, 11);
      }
    } else if (kind === 'brick') {
      ctx.fillStyle = isDark ? '#6d3528' : '#a84f3b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = isDark ? '#8c4b39' : '#c9b39d';
      for (let y = 12; y < h; y += 28) {
        ctx.fillRect(0, y, w, 3);
      }
      ctx.fillStyle = isDark ? '#2c3540' : '#4a5568';
      for (let y = 20; y < h; y += 28) {
        for (let x = 8; x < w; x += 22) {
          ctx.fillRect(x, y, 10, 14);
        }
      }
    } else {
      ctx.fillStyle = isDark ? '#323842' : '#e0e3e7';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = isDark ? '#464f5e' : '#c1c8d1';
      for (let y = 8; y < h; y += 20) {
        for (let x = 8; x < w; x += 24) {
          ctx.fillRect(x, y, 14, 9);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.04, 0.04);
  tex.anisotropy = 4;
  return tex;
}

function normalizeForMerge(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const pos = g.getAttribute('position');
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i) * 0.05;
      uvs[i * 2 + 1] = pos.getY(i) * 0.05;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  return g;
}

function extrudeFootprint(
  cx: number,
  cz: number,
  poly: [number, number][],
  baseY: number,
  height: number,
  scaleXY = 1.0,
): THREE.BufferGeometry | null {
  if (poly.length < 3 || height <= 0.5) return null;
  const shape = new THREE.Shape();
  shape.moveTo(poly[0]![0] * scaleXY, -poly[0]![1] * scaleXY);
  for (let i = 1; i < poly.length; i++) {
    shape.lineTo(poly[i]![0] * scaleXY, -poly[i]![1] * scaleXY);
  }
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // ExtrudeGeometry extrudes along +Z; rotate -PI/2 around X maps +Z -> +Y and -Y -> +Z!
  geom.rotateX(-Math.PI / 2);
  geom.translate(cx, baseY, cz);
  return normalizeForMerge(geom);
}

function makeOrientedBox(
  cx: number,
  cz: number,
  w: number,
  d: number,
  angle: number,
  baseY: number,
  height: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, height, d);
  g.rotateY(-angle);
  g.translate(cx, baseY + height * 0.5, cz);
  return normalizeForMerge(g);
}

/**
 * Generates procedural architectural building massing for one building in LOD0.
 * Differentiates skyscrapers (stepped setbacks + penthouse crown), commercial podiums,
 * station pavilions, and varied residential blocks.
 */
function buildProceduralBuildingParts(b: UrbanBuildingRecord): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const hasPoly = Boolean(b.p && b.p.length >= 3);

  if (b.t === 'o' && b.h >= 45) {
    // High-rise Office Tower: podium + main glass shaft + setback upper crown + mechanical penthouse
    const podiumH = Math.min(14, b.h * 0.16);
    const shaftH = b.h * 0.72;
    const crownH = Math.max(4, b.h - podiumH - shaftH);

    if (hasPoly) {
      const p1 = extrudeFootprint(b.cx, b.cz, b.p!, 0, podiumH, 1.0);
      const p2 = extrudeFootprint(b.cx, b.cz, b.p!, podiumH, shaftH, 0.88);
      const p3 = extrudeFootprint(b.cx, b.cz, b.p!, podiumH + shaftH, crownH, 0.72);
      if (p1) parts.push(p1);
      if (p2) parts.push(p2);
      if (p3) parts.push(p3);
    } else {
      parts.push(makeOrientedBox(b.cx, b.cz, b.w, b.d, b.a, 0, podiumH));
      parts.push(makeOrientedBox(b.cx, b.cz, b.w * 0.86, b.d * 0.86, b.a, podiumH, shaftH));
      parts.push(
        makeOrientedBox(b.cx, b.cz, b.w * 0.68, b.d * 0.68, b.a, podiumH + shaftH, crownH),
      );
    }
  } else if (b.t === 'c' && b.h >= 24) {
    // Commercial block: full ground footprint + slight upper terrace setback
    const lowerH = b.h * 0.78;
    const upperH = b.h - lowerH;
    if (hasPoly) {
      const p1 = extrudeFootprint(b.cx, b.cz, b.p!, 0, lowerH, 1.0);
      const p2 = extrudeFootprint(b.cx, b.cz, b.p!, lowerH, upperH, 0.82);
      if (p1) parts.push(p1);
      if (p2) parts.push(p2);
    } else {
      parts.push(makeOrientedBox(b.cx, b.cz, b.w, b.d, b.a, 0, lowerH));
      parts.push(makeOrientedBox(b.cx, b.cz, b.w * 0.82, b.d * 0.82, b.a, lowerH, upperH));
    }
  } else if (b.t === 's') {
    // Station / civic hall volume: broad base + subtle clerestory roof volume
    const mainH = b.h * 0.84;
    const roofH = Math.max(2.5, b.h * 0.16);
    if (hasPoly) {
      const p1 = extrudeFootprint(b.cx, b.cz, b.p!, 0, mainH, 1.0);
      const p2 = extrudeFootprint(b.cx, b.cz, b.p!, mainH, roofH, 0.76);
      if (p1) parts.push(p1);
      if (p2) parts.push(p2);
    } else {
      parts.push(makeOrientedBox(b.cx, b.cz, b.w, b.d, b.a, 0, mainH));
      parts.push(makeOrientedBox(b.cx, b.cz, b.w * 0.76, b.d * 0.76, b.a, mainH, roofH));
    }
  } else {
    // Residential / standard mid-rise block with real footprint
    if (hasPoly) {
      const p1 = extrudeFootprint(b.cx, b.cz, b.p!, 0, b.h, 1.0);
      if (p1) parts.push(p1);
    } else {
      parts.push(makeOrientedBox(b.cx, b.cz, b.w, b.d, b.a, 0, b.h));
    }
    // Add compact rooftop elevator overrun on mid-rise residential (>= 18m)
    if (b.h >= 18) {
      parts.push(
        makeOrientedBox(b.cx, b.cz, Math.min(8, b.w * 0.35), Math.min(8, b.d * 0.35), b.a, b.h, 3.2),
      );
    }
  }
  return parts;
}

/**
 * Generates distinctive multi-part procedural silhouettes for Tokyo's 9 major landmarks.
 */
function buildProceduralLandmark(
  lm: UrbanLandmarkRecord,
  materials: {
    office: THREE.MeshStandardMaterial;
    commercial: THREE.MeshStandardMaterial;
    brick: THREE.MeshStandardMaterial;
    towerOrange: THREE.MeshStandardMaterial;
    towerWhite: THREE.MeshStandardMaterial;
  },
): THREE.Group {
  const g = new THREE.Group();
  g.name = `landmark-${lm.id}`;
  g.position.set(lm.x, 0, lm.z);

  switch (lm.kind) {
    case 'lattice_tower_orange': {
      // Tokyo Tower: alternating international orange & white tapered lattice sections + decks + spire
      const bands: [number, number, number, number, boolean][] = [
        [0, 75, 28, 17, true],
        [75, 145, 17, 11, false],
        [145, 160, 14, 14, true], // Main Deck
        [160, 235, 10, 6.5, false],
        [235, 252, 8.5, 8.5, true], // Top Deck
        [252, 333, 4.5, 0.8, false], // Broadcast antenna spire
      ];
      for (const [y0, y1, rBot, rTop, isOrange] of bands) {
        const h = y1 - y0;
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(rTop, rBot, h, 4),
          isOrange ? materials.towerOrange : materials.towerWhite,
        );
        m.position.y = y0 + h * 0.5;
        m.rotation.y = Math.PI / 4;
        g.add(m);
      }
      break;
    }
    case 'skytree_tower': {
      // Tokyo Skytree: triangular base transitioning smoothly to circular shaft + dual decks + mast
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(16, 34, 340, 6),
        materials.towerWhite,
      );
      lower.position.y = 170;
      const deck1 = new THREE.Mesh(
        new THREE.CylinderGeometry(23, 21, 22, 16),
        materials.office,
      );
      deck1.position.y = 350;
      const mid = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 15, 95, 12),
        materials.towerWhite,
      );
      mid.position.y = 408;
      const deck2 = new THREE.Mesh(
        new THREE.CylinderGeometry(15, 15, 14, 16),
        materials.office,
      );
      deck2.position.y = 455;
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 8, 172, 10),
        materials.towerWhite,
      );
      spire.position.y = 548;
      g.add(lower, deck1, mid, deck2, spire);
      break;
    }
    case 'twin_stepped_tower': {
      // Tokyo Metropolitan Government Building (Shinjuku twin towers!)
      const podium = new THREE.Mesh(new THREE.BoxGeometry(96, 152, 48), materials.commercial);
      podium.position.y = 76;
      const northTower = new THREE.Mesh(new THREE.BoxGeometry(36, 91, 44), materials.office);
      northTower.position.set(0, 152 + 45.5, -24);
      const southTower = new THREE.Mesh(new THREE.BoxGeometry(36, 91, 44), materials.office);
      southTower.position.set(0, 152 + 45.5, 24);
      const bridgeCrown = new THREE.Mesh(new THREE.BoxGeometry(32, 12, 18), materials.commercial);
      bridgeCrown.position.set(0, 158, 0);
      g.add(podium, northTower, southTower, bridgeCrown);
      break;
    }
    case 'cocoon_ellipsoid': {
      // Mode Gakuen Cocoon Tower
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(24, 14, 12),
        materials.office,
      );
      body.scale.set(1.0, 4.25, 0.85);
      body.position.y = 102;
      g.add(body);
      break;
    }
    case 'heritage_brick_station': {
      // Tokyo Station Marunouchi Heritage Red-Brick Hall (central hall + north/south octagonal domes)
      const mainHall = new THREE.Mesh(new THREE.BoxGeometry(28, 20, 310), materials.brick);
      mainHall.position.y = 10;
      const centerPavilion = new THREE.Mesh(new THREE.BoxGeometry(36, 26, 62), materials.brick);
      centerPavilion.position.y = 13;
      const northDome = new THREE.Mesh(
        new THREE.CylinderGeometry(10, 16, 14, 8),
        materials.commercial,
      );
      northDome.position.set(0, 26, -110);
      const southDome = northDome.clone();
      southDome.position.set(0, 26, 110);
      g.add(mainHall, centerPavilion, northDome, southDome);
      break;
    }
    case 'glass_stepped_hub': {
      // Shibuya Scramble Square: crisp tall glass shaft + offset sky deck + lower retail terrace
      const w = lm.width ?? 60;
      const d = lm.depth ?? 46;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 64, d), materials.commercial);
      lower.position.y = 32;
      const main = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 152, d * 0.82), materials.office);
      main.position.set(4, 64 + 76, 0);
      const skyDeck = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 14, d * 0.86), materials.office);
      skyDeck.position.set(4, 223, 0);
      g.add(lower, main, skyDeck);
      break;
    }
    case 'tiered_cultural_tower': {
      // Shibuya Hikarie: stacked cantilevered cultural cubes
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(58, 52, 44), materials.commercial);
      b1.position.y = 26;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(50, 56, 38), materials.office);
      b2.position.set(3, 52 + 28, 0);
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(44, 74, 34), materials.office);
      b3.position.set(-2, 108 + 37, 0);
      g.add(b1, b2, b3);
      break;
    }
    case 'octagonal_crown_tower': {
      // Roppongi Hills Mori Tower
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(36, 40, 210, 8), materials.office);
      shaft.position.y = 105;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(28, 34, 28, 8), materials.commercial);
      crown.position.y = 224;
      g.add(shaft, crown);
      break;
    }
    default: {
      // Sunshine 60 slab skyscraper
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(lm.width ?? 64, lm.height, lm.depth ?? 38),
        materials.office,
      );
      slab.position.y = lm.height * 0.5;
      g.add(slab);
      break;
    }
  }

  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return g;
}

interface LoadedChunk {
  meta: UrbanChunkMeta;
  lod0Group: THREE.Group;
  lod1Mesh: THREE.InstancedMesh;
  activeLod: 0 | 1 | -1;
}

export class CityChunkManager {
  readonly group = new THREE.Group();
  readonly landmarksGroup = new THREE.Group();
  private manifest: UrbanManifest | null = null;
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly loadingKeys = new Set<string>();
  private readonly unitBoxGeom = new THREE.BoxGeometry(1, 1, 1);

  private readonly materials: {
    office: THREE.MeshStandardMaterial;
    commercial: THREE.MeshStandardMaterial;
    residential: THREE.MeshStandardMaterial;
    station: THREE.MeshStandardMaterial;
    brick: THREE.MeshStandardMaterial;
    instanced: THREE.MeshStandardMaterial;
    towerOrange: THREE.MeshStandardMaterial;
    towerWhite: THREE.MeshStandardMaterial;
  };

  private textures: THREE.CanvasTexture[];
  private isDark: boolean;
  private buildingsVisible = true;
  private currentOpacity = 1.0;

  constructor(isDark: boolean, clipPlanes: THREE.Plane[]) {
    this.isDark = isDark;
    this.group.name = 'city-buildings-chunked';
    this.landmarksGroup.name = 'tokyo-procedural-landmarks';
    this.group.add(this.landmarksGroup);

    const texOffice = createFacadeTexture('office', isDark);
    const texComm = createFacadeTexture('commercial', isDark);
    const texRes = createFacadeTexture('residential', isDark);
    const texBrick = createFacadeTexture('brick', isDark);
    this.textures = [texOffice, texComm, texRes, texBrick];

    // P0 FIX: Buildings render STRICTLY OPAQUE in normal surface mode (zero glass-bleed sorting bugs!)
    const mkMat = (opts: THREE.MeshStandardMaterialParameters) =>
      new THREE.MeshStandardMaterial({
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        clippingPlanes: clipPlanes,
        ...opts,
      });

    this.materials = {
      office: mkMat({ map: texOffice, roughness: 0.42, metalness: 0.25 }),
      commercial: mkMat({ map: texComm, roughness: 0.65, metalness: 0.1 }),
      residential: mkMat({ map: texRes, roughness: 0.85, metalness: 0.04 }),
      station: mkMat({ color: isDark ? 0x475569 : 0xcbd5e1, roughness: 0.6, metalness: 0.14 }),
      brick: mkMat({ map: texBrick, roughness: 0.78, metalness: 0.05 }),
      instanced: mkMat({ color: 0xffffff, roughness: 0.72, metalness: 0.08 }),
      towerOrange: mkMat({ color: 0xe84c22, roughness: 0.5, metalness: 0.2 }),
      towerWhite: mkMat({ color: isDark ? 0xdbe5f0 : 0xf4f7fa, roughness: 0.45, metalness: 0.18 }),
    };
  }

  setManifest(manifest: UrbanManifest, landmarks: UrbanLandmarkRecord[]): void {
    this.manifest = manifest;
    for (const lm of landmarks) {
      const lmGroup = buildProceduralLandmark(lm, this.materials);
      this.landmarksGroup.add(lmGroup);
    }
  }

  /**
   * Called smoothly as camera moves: streams chunks within range, switches LOD0 <-> LOD1,
   * and applies frustum visibility checks!
   */
  updateForCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    if (!this.manifest) return;
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projScreen);

    const camPos = camera.position;
    const loadRadius = Math.min(13_500, Math.max(5_200, camPos.distanceTo(target) * 2.2));
    // P0 FIX: Hysteresis band (enter LOD0 < 2050m, exit LOD0 > 2600m) prevents LOD popping flicker!
    const lod0EnterRadius = 2050;
    const lod0ExitRadius = 2600;

    // Sort candidates by distance to focus target so Shibuya/Shinjuku/Tokyo load instantaneously!
    const candidates: { meta: UrbanChunkMeta; distToTarget: number; distToCam: number }[] = [];
    for (const meta of this.manifest.chunks) {
      const distToTarget = Math.hypot(meta.centerX - target.x, meta.centerZ - target.z);
      const distToCam = Math.hypot(meta.centerX - camPos.x, meta.centerZ - camPos.z);
      if (distToTarget <= loadRadius) {
        candidates.push({ meta, distToTarget, distToCam });
      }
    }
    candidates.sort((a, b) => a.distToTarget - b.distToTarget);

    // Trigger on-demand fetch for top uncached chunks (cap concurrent fetches to 6)
    let triggered = 0;
    for (const c of candidates) {
      if (this.loaded.has(c.meta.key) || this.loadingKeys.has(c.meta.key)) continue;
      if (this.loadingKeys.size + triggered >= 6) break;
      triggered++;
      void this.loadChunk(c.meta);
    }

    // Update LOD & frustum culling with generous chunk margin so border buildings never pop out!
    const box = new THREE.Box3();
    for (const chunk of this.loaded.values()) {
      const half = (this.manifest.chunkSizeMeters ?? 2000) * 0.65;
      box.min.set(chunk.meta.centerX - half, -10, chunk.meta.centerZ - half);
      box.max.set(chunk.meta.centerX + half, 380, chunk.meta.centerZ + half);

      const inFrustum = frustum.intersectsBox(box);
      const distToCam = Math.hypot(chunk.meta.centerX - camPos.x, chunk.meta.centerZ - camPos.z);
      const distToTarget = Math.hypot(chunk.meta.centerX - target.x, chunk.meta.centerZ - target.z);

      if (!this.buildingsVisible || !inFrustum || distToTarget > loadRadius + 2800) {
        chunk.lod0Group.visible = false;
        chunk.lod1Mesh.visible = false;
        chunk.activeLod = -1;
      } else {
        const wantLod0 =
          chunk.activeLod === 0
            ? distToCam < lod0ExitRadius || (chunk.meta.hub && distToTarget < 2100)
            : distToCam < lod0EnterRadius || (chunk.meta.hub && distToTarget < 1700);
        if (wantLod0) {
          chunk.lod0Group.visible = true;
          chunk.lod1Mesh.visible = false;
          chunk.activeLod = 0;
        } else {
          chunk.lod0Group.visible = false;
          chunk.lod1Mesh.visible = true;
          chunk.activeLod = 1;
        }
      }
    }
  }

  private async loadChunk(meta: UrbanChunkMeta): Promise<void> {
    this.loadingKeys.add(meta.key);
    try {
      const res = await fetch(`./data/urban-chunks/${meta.file}`);
      if (!res.ok) return;
      const data = (await res.json()) as UrbanChunkData;
      const built = this.buildChunkMeshes(meta, data.buildings);
      this.loaded.set(meta.key, built);
      this.group.add(built.lod0Group);
      this.group.add(built.lod1Mesh);
    } catch {
      // Graceful degradation if chunk fetch fails offline
    } finally {
      this.loadingKeys.delete(meta.key);
    }
  }

  private buildChunkMeshes(
    meta: UrbanChunkMeta,
    buildings: UrbanBuildingRecord[],
  ): LoadedChunk {
    // --- Build LOD0 (batched extruded real footprints & stepped architectural typologies) ---
    const lod0Group = new THREE.Group();
    lod0Group.name = `chunk-lod0-${meta.key}`;
    const byTypology: Record<'o' | 'c' | 'r' | 's', THREE.BufferGeometry[]> = {
      o: [],
      c: [],
      r: [],
      s: [],
    };

    for (const b of buildings) {
      const parts = buildProceduralBuildingParts(b);
      byTypology[b.t].push(...parts);
    }

    const matFor = (t: 'o' | 'c' | 'r' | 's') =>
      t === 'o'
        ? this.materials.office
        : t === 'c'
          ? this.materials.commercial
          : t === 's'
            ? this.materials.station
            : this.materials.residential;

    for (const key of ['o', 'c', 'r', 's'] as const) {
      const geoms = byTypology[key];
      if (geoms.length === 0) continue;
      const merged = mergeGeometries(geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, matFor(key));
        mesh.castShadow = key === 'o' || key === 'c';
        mesh.receiveShadow = true;
        lod0Group.add(mesh);
      }
      geoms.forEach((g) => g.dispose());
    }

    // --- Build LOD1/LOD2 (single InstancedMesh using real oriented bounding boxes!) ---
    const lod1Mesh = new THREE.InstancedMesh(
      this.unitBoxGeom,
      this.materials.instanced,
      buildings.length,
    );
    lod1Mesh.name = `chunk-lod1-${meta.key}`;
    lod1Mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]!;
      dummy.position.set(b.cx, b.h * 0.5, b.cz);
      dummy.rotation.set(0, -b.a, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      lod1Mesh.setMatrixAt(i, dummy.matrix);

      // Subtle architectural typology tone
      if (b.t === 'o') color.setHex(this.isDark ? 0x3b526b : 0xb4c7db);
      else if (b.t === 'c') color.setHex(this.isDark ? 0x454f5e : 0xcfd6de);
      else if (b.t === 's') color.setHex(this.isDark ? 0x526378 : 0xbfc8d4);
      else color.setHex(this.isDark ? 0x343c47 : 0xdde1e6);
      lod1Mesh.setColorAt(i, color);
    }
    lod1Mesh.instanceMatrix.needsUpdate = true;
    if (lod1Mesh.instanceColor) lod1Mesh.instanceColor.needsUpdate = true;
    lod1Mesh.computeBoundingSphere();

    lod0Group.visible = false;
    lod1Mesh.visible = this.buildingsVisible;

    return { meta, lod0Group, lod1Mesh, activeLod: 1 };
  }

  setVisibilityAndOpacity(visible: boolean, opacity: number): void {
    this.buildingsVisible = visible;
    this.currentOpacity = Math.max(0.08, Math.min(1.0, opacity));
    const isTranslucent = this.currentOpacity < 0.99;
    this.landmarksGroup.visible = visible;

    for (const mat of Object.values(this.materials)) {
      const needRecompile = mat.transparent !== isTranslucent;
      mat.transparent = isTranslucent;
      mat.opacity = this.currentOpacity;
      mat.depthWrite = !isTranslucent;
      if (needRecompile) mat.needsUpdate = true;
    }

    if (!visible) {
      for (const chunk of this.loaded.values()) {
        chunk.lod0Group.visible = false;
        chunk.lod1Mesh.visible = false;
      }
    }
  }

  setTheme(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.textures.forEach((t) => t.dispose());
    const texOffice = createFacadeTexture('office', isDark);
    const texComm = createFacadeTexture('commercial', isDark);
    const texRes = createFacadeTexture('residential', isDark);
    const texBrick = createFacadeTexture('brick', isDark);
    this.textures = [texOffice, texComm, texRes, texBrick];

    this.materials.office.map = texOffice;
    this.materials.commercial.map = texComm;
    this.materials.residential.map = texRes;
    this.materials.brick.map = texBrick;
    this.materials.station.color.setHex(isDark ? 0x475569 : 0xcbd5e1);
    this.materials.towerWhite.color.setHex(isDark ? 0xdbe5f0 : 0xf4f7fa);
    for (const mat of Object.values(this.materials)) mat.needsUpdate = true;
  }

  getStats(): {
    loadedChunks: number;
    totalChunks: number;
    renderedBuildings: number;
    lod0Chunks: number;
    lod1Chunks: number;
  } {
    let renderedBuildings = 0;
    let lod0Chunks = 0;
    let lod1Chunks = 0;
    for (const c of this.loaded.values()) {
      if (c.activeLod === 0) {
        lod0Chunks++;
        renderedBuildings += c.meta.count;
      } else if (c.activeLod === 1) {
        lod1Chunks++;
        renderedBuildings += c.meta.count;
      }
    }
    return {
      loadedChunks: this.loaded.size,
      totalChunks: this.manifest?.totalChunks ?? 0,
      renderedBuildings,
      lod0Chunks,
      lod1Chunks,
    };
  }

  dispose(): void {
    for (const c of this.loaded.values()) {
      c.lod0Group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      c.lod1Mesh.dispose();
    }
    this.landmarksGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.unitBoxGeom.dispose();
    this.textures.forEach((t) => t.dispose());
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
