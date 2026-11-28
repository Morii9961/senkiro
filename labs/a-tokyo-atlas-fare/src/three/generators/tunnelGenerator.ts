/**
 * Procedural 3D Underground Tunnels, Portals, Concourses & Instanced Architectural Station
 * Platforms Generator (P4: Physical Engineering Structures + Massive Draw-Call Reduction).
 *
 * Key Architectural & Performance Upgrades:
 *  - Continuous 8-sided circular shield tunnels & rectangular cut-and-cover concrete box tunnels
 *    mapped with procedural segmented precast concrete ring texture
 *  - Replaces 300+ individual per-station meshes/materials (300+ draw calls & neon blocks) with
 *    4 batched InstancedMesh layers (concrete platform slab + slate canopy + slim restrained
 *    line-color fascia stripe + street-level subway entrance kiosks) = 4 draw calls total!
 *  - Native Raycaster `instanceId` picking for clicking any surface, elevated, or underground station
 *  - Smart surface-mode occlusion culling: underground tunnel shells & concourses automatically
 *    hide while ground is fully opaque, revealing instantaneously in Underground Cutaway Mode!
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  UndergroundCutawayState,
  UndergroundRenderStats,
} from '../../contracts/atlasV2.js';
import type {
  SchematicTierId,
  SolvedRailwayNetwork3D,
  SolvedStationNode3D,
} from '../../domain/elevationSolver.js';
import type { SkId } from '../../domain/types.js';
import type {
  UndergroundFilterParams,
  UndergroundLayerAdapter,
} from '../contracts/adapters.js';
import type { UndergroundRailwayQueryAPI } from '../underground/domain/tunnelTypes.js';
import { UndergroundRailwaySystem } from '../underground/UndergroundRailwaySystem.js';

interface TunnelBatch {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  tier: SchematicTierId;
  group: THREE.Group;
  shellMaterial: THREE.MeshStandardMaterial;
  filterVisible: boolean;
}

interface StationInstanceMeta {
  node: SolvedStationNode3D;
  index: number;
  isUnderground: boolean;
  isShinkansen: boolean;
  angle: number;
  dirX: number;
  dirZ: number;
  rightX: number;
  rightZ: number;
  len: number;
  platformW: number;
  halfTrackSpacing: number;
  lateralOffset: number;
  baseY: number;
  majorHubIndex: number; // -1 if not a major surface/elevated hub
  visible: boolean;
}

function createPlatformDeckTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Architectural precast concrete platform paving
    ctx.fillStyle = '#cfd4da';
    ctx.fillRect(0, 0, size, size);

    // Subtle concrete stone aggregate & paving tiles
    ctx.strokeStyle = 'rgba(71,85,105,0.18)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= size; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    for (let i = 0; i < 240; i++) {
      const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * size;
      const y = (Math.sin(i * 311.7 + 0.8) * 0.5 + 0.5) * (size - 48);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(30,41,59,0.06)';
      ctx.fillRect(x, y, 4, 4);
    }

    // Track-facing edge sits at bottom of canvas (local +Z on BoxGeometry top face)
    // Concrete coping slab along platform edge
    ctx.fillStyle = '#dde2e8';
    ctx.fillRect(0, size - 20, size, 20);

    // Crisp Japanese white safety border line
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, size - 25, size, 6);

    // Authentic bright yellow Japanese tactile warning blocks (点字ブロック)
    const blockY = size - 44;
    const blockH = 16;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, blockY, size, blockH);

    // Raised tactile block joints & dots
    ctx.strokeStyle = 'rgba(161,98,7,0.38)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x < size; x += 16) {
      ctx.strokeRect(x + 0.5, blockY + 0.5, 15, blockH - 1);
      ctx.fillStyle = 'rgba(202,138,4,0.45)';
      for (let dx = 4; dx <= 12; dx += 4) {
        ctx.fillRect(x + dx, blockY + 4, 2, 2);
        ctx.fillRect(x + dx, blockY + 10, 2, 2);
      }
    }

    // Dark edge shadow strip right at trackside coping drop-off
    ctx.fillStyle = 'rgba(15,23,42,0.28)';
    ctx.fillRect(0, size - 4, size, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(6, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPlatformScreenDoorTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Sleek stainless steel waist-high home-door body
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, w, h);

    // Top anodized aluminum handrail
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, w, 7);

    // Bottom toe kick plate
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, h - 10, w, 10);

    // Sliding glass door panels & fixed gate housings
    for (let x = 0; x < w; x += 32) {
      // Fixed aluminum gate pillar
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x, 7, 10, h - 17);
      // Translucent glazed sliding door panel
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(x + 11, 10, 19, h - 24);
      // Subtle vertical glass sheen
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + 13, 12, 4, h - 28);
      // Door seam
      ctx.fillStyle = 'rgba(30,41,59,0.45)';
      ctx.fillRect(x + 20, 10, 1.5, h - 24);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(8, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createCanopyRoofTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Architectural standing-seam steel canopy roof
    ctx.fillStyle = '#525f70';
    ctx.fillRect(0, 0, size, size);

    // Ribbed standing metal roof seams along platform length
    for (let x = 0; x < size; x += 16) {
      ctx.fillStyle = 'rgba(15,23,42,0.34)';
      ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = 'rgba(226,232,240,0.16)';
      ctx.fillRect(x + 3, 0, 2, size);
    }

    // Translucent frosted glass skylight band running along canopy spine
    const skyY = Math.floor(size * 0.34);
    const skyH = Math.floor(size * 0.32);
    ctx.fillStyle = '#b9d4e8';
    ctx.fillRect(0, skyY, size, skyH);

    // Skylight mullion frames
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, skyY, size, 4);
    ctx.fillRect(0, skyY + skyH - 4, size, 4);
    for (let x = 0; x < size; x += 32) {
      ctx.fillRect(x, skyY, 3, skyH);
    }

    // Subtle diagonal glass highlight across skylight
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(0, skyY + 6, size, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createConcourseBridgeTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Modern Japanese station overbridge fascia
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, w, h);

    // Top parapet & bottom structural steel girder
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 12, w, 12);

    // Glazed curtain-wall pedestrian gallery windows
    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(0, 12, w, h - 26);

    // Warm interior passenger corridor glow behind glass
    ctx.fillStyle = 'rgba(254,243,199,0.55)';
    ctx.fillRect(0, 22, w, h - 38);

    // Vertical aluminum curtain-wall mullions
    ctx.fillStyle = '#334155';
    for (let x = 0; x < w; x += 16) {
      ctx.fillRect(x, 10, 2.5, h - 22);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createTunnelConcreteTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Cast precast concrete tunnel lining
    ctx.fillStyle = '#adb4bc';
    ctx.fillRect(0, 0, size, size);

    // Subtle concrete aggregate noise
    for (let i = 0; i < 180; i++) {
      const x = (Math.sin(i * 91.3) * 0.5 + 0.5) * size;
      const y = (Math.sin(i * 47.7 + 1.2) * 0.5 + 0.5) * size;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
      ctx.fillRect(x, y, 4, 4);
    }

    // Precast circumferential tunnel ring joints (horizontal along V)
    ctx.fillStyle = 'rgba(30,41,59,0.34)';
    for (let y = 0; y < size; y += 32) {
      ctx.fillRect(0, y, size, 3);
      ctx.fillStyle = 'rgba(241,245,249,0.22)';
      ctx.fillRect(0, y + 3, size, 2);
      ctx.fillStyle = 'rgba(30,41,59,0.34)';
    }

    // Longitudinal staggered segment seams (vertical along U)
    ctx.fillStyle = 'rgba(30,41,59,0.24)';
    for (let row = 0; row < 4; row++) {
      const shift = (row % 2) * 16;
      for (let x = shift; x < size; x += 32) {
        ctx.fillRect(x, row * 32, 2, 32);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeCircularTunnelProfile(
  radius: number,
  centerOffsetY: number,
  segments = 8,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, centerOffsetY + Math.sin(a) * radius]);
  }
  return pts;
}

function makeBoxTunnelProfile(halfW: number, bottomY: number, topY: number): [number, number][] {
  return [
    [-halfW, bottomY],
    [-halfW, topY],
    [halfW, topY],
    [halfW, bottomY],
  ];
}

export class TunnelAndStationLayer implements UndergroundLayerAdapter {
  readonly group = new THREE.Group();
  readonly interactiveStationMeshes: THREE.Object3D[] = [];
  readonly undergroundSystem: UndergroundRailwaySystem;

  private readonly tunnelBatches: TunnelBatch[] = [];
  private readonly stationMeta: StationInstanceMeta[] = [];
  private readonly portalGroup = new THREE.Group();
  private readonly concourseGroup = new THREE.Group();
  private readonly transferGroup = new THREE.Group();
  private readonly transferConnectorCount: number;
  private verticalScale = 1.0;

  private readonly stationSlabInst: THREE.InstancedMesh | null = null;
  private readonly platformScreenInst: THREE.InstancedMesh | null = null;
  private readonly stationAccentInst: THREE.InstancedMesh | null = null;
  private readonly canopyColumnInst: THREE.InstancedMesh | null = null;
  private readonly stationCanopyInst: THREE.InstancedMesh | null = null;
  private readonly canopyLightInst: THREE.InstancedMesh | null = null;
  private readonly concourseBridgeInst: THREE.InstancedMesh | null = null;
  private readonly entranceKioskInst: THREE.InstancedMesh | null = null;
  private readonly selectedBeacon: THREE.Group;
  private readonly beaconBars: THREE.Mesh[];

  private readonly tunnelTexture: THREE.CanvasTexture;
  private readonly platformDeckTexture: THREE.CanvasTexture;
  private readonly screenDoorTexture: THREE.CanvasTexture;
  private readonly canopyRoofTexture: THREE.CanvasTexture;
  private readonly concourseBridgeTexture: THREE.CanvasTexture;
  private readonly portalMaterial: THREE.MeshStandardMaterial;
  private readonly concourseMaterial: THREE.MeshStandardMaterial;
  private readonly entranceShaftMaterial: THREE.MeshStandardMaterial;
  private readonly stationSlabMat: THREE.MeshStandardMaterial;
  private readonly platformScreenMat: THREE.MeshStandardMaterial;
  private readonly stationAccentMat: THREE.MeshStandardMaterial;
  private readonly canopyColumnMat: THREE.MeshStandardMaterial;
  private readonly stationCanopyMat: THREE.MeshStandardMaterial;
  private readonly canopyLightMat: THREE.MeshStandardMaterial;
  private readonly concourseBridgeMat: THREE.MeshStandardMaterial;
  private readonly kioskMat: THREE.MeshStandardMaterial;
  private readonly beaconMat: THREE.MeshStandardMaterial;
  private readonly transferMaterials: Record<
    'in_gate' | 'out_of_gate' | 'unknown',
    THREE.MeshStandardMaterial
  >;

  private undergroundActive = false;
  private clipEnabled = false;
  private interiorMode = false;
  private anyUndergroundTierVisible = true;
  private selectedStationId: SkId<'station'> | null = null;
  private camDist = 1200;

  constructor(solved: SolvedRailwayNetwork3D, clipPlanes: THREE.Plane[]) {
    this.group.name = 'procedural-3d-tunnels-and-stations';
    this.portalGroup.name = 'tunnel-portals';
    this.concourseGroup.name = 'underground-station-concourses';
    this.transferGroup.name = 'complex-vertical-transfers';
    this.transferConnectorCount = solved.transferConnectors.length;
    this.undergroundSystem = new UndergroundRailwaySystem(solved, clipPlanes);
    this.group.add(
      this.portalGroup,
      this.concourseGroup,
      this.transferGroup,
      this.undergroundSystem.group,
      this.undergroundSystem.lightingSystem.group,
    );
    this.interactiveStationMeshes.push(...this.undergroundSystem.interactiveStationMeshes);

    this.tunnelTexture = createTunnelConcreteTexture();
    this.platformDeckTexture = createPlatformDeckTexture();
    this.screenDoorTexture = createPlatformScreenDoorTexture();
    this.canopyRoofTexture = createCanopyRoofTexture();
    this.concourseBridgeTexture = createConcourseBridgeTexture();

    this.portalMaterial = new THREE.MeshStandardMaterial({
      color: 0x7b8490,
      roughness: 0.85,
      metalness: 0.08,
      clippingPlanes: clipPlanes,
    });

    this.concourseMaterial = new THREE.MeshStandardMaterial({
      color: 0xaab4c0,
      roughness: 0.68,
      metalness: 0.1,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      clippingPlanes: clipPlanes,
    });

    this.entranceShaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x5ba3d0,
      emissive: 0x0284c7,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.12,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      clippingPlanes: clipPlanes,
    });

    this.stationSlabMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.platformDeckTexture,
      emissive: new THREE.Color(0xdceeff),
      emissiveIntensity: 0,
      roughness: 0.86,
      metalness: 0.04,
      clippingPlanes: clipPlanes,
    });

    this.platformScreenMat = new THREE.MeshStandardMaterial({
      color: 0xeef6fc,
      map: this.screenDoorTexture,
      emissive: new THREE.Color(0xffe4b8),
      emissiveIntensity: 0,
      roughness: 0.26,
      metalness: 0.35,
      transparent: true,
      opacity: 0.86,
      clippingPlanes: clipPlanes,
    });

    this.stationAccentMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.14,
      clippingPlanes: clipPlanes,
    });

    this.canopyColumnMat = new THREE.MeshStandardMaterial({
      color: 0x2f3a47,
      roughness: 0.48,
      metalness: 0.56,
      clippingPlanes: clipPlanes,
    });

    this.stationCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      map: this.canopyRoofTexture,
      emissive: new THREE.Color(0xd8e6f8),
      emissiveIntensity: 0,
      roughness: 0.42,
      metalness: 0.38,
      envMapIntensity: 0.9,
      clippingPlanes: clipPlanes,
    });

    this.canopyLightMat = new THREE.MeshStandardMaterial({
      color: 0xfff8eb,
      emissive: 0xffedd5,
      emissiveIntensity: 0.28,
      roughness: 0.25,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });

    this.concourseBridgeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      map: this.concourseBridgeTexture,
      emissive: 0xfef3c7,
      emissiveIntensity: 0.12,
      roughness: 0.34,
      metalness: 0.28,
      clippingPlanes: clipPlanes,
    });

    this.kioskMat = new THREE.MeshStandardMaterial({
      color: 0x3b4858,
      emissive: new THREE.Color(0xfff0d2),
      emissiveIntensity: 0,
      roughness: 0.32,
      metalness: 0.45,
      envMapIntensity: 1.0,
      clippingPlanes: clipPlanes,
    });

    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.15,
      roughness: 0.3,
      metalness: 0.15,
      transparent: true,
      opacity: 0.92,
      clippingPlanes: clipPlanes,
    });

    // Hollow architectural glowing perimeter highlight frame (4 perimeter rails + 4 corner accents)
    // so selected stations are clearly framed without ever covering trains or platforms.
    this.selectedBeacon = new THREE.Group();
    this.selectedBeacon.visible = false;
    this.selectedBeacon.name = 'selected-station-highlight';
    const beaconBarGeom = new THREE.BoxGeometry(1, 1, 1);
    this.beaconBars = [];
    for (let i = 0; i < 8; i++) {
      const bar = new THREE.Mesh(beaconBarGeom, this.beaconMat);
      this.beaconBars.push(bar);
      this.selectedBeacon.add(bar);
    }
    this.group.add(this.selectedBeacon);

    this.transferMaterials = {
      in_gate: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.38,
        transparent: true,
        opacity: 0.78,
        clippingPlanes: clipPlanes,
      }),
      out_of_gate: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.34,
        transparent: true,
        opacity: 0.74,
        clippingPlanes: clipPlanes,
      }),
      unknown: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.58,
        clippingPlanes: clipPlanes,
      }),
    };

    // ---- 1 & 2. Underground Tunnels & Open Portals ----
    // Atlas v2: Replaced legacy single-shell translucent tubes & solid blocking portal boxes
    // with true dual-surface solid tunnels & open portals in `UndergroundRailwaySystem`.
    // Keep empty `tunnelBatches` & `portalGroup` here so surface/elevated stations, entrance kiosks
    // and vertical complex transfer connectors remain 100% compatible.
    void makeCircularTunnelProfile;
    void makeBoxTunnelProfile;

    // ---- 3. Batched Architectural Dual-Side-Platform Stations (InstancedMeshes!) ----
    const count = solved.stationNodes.length;
    const concourseGeoms: THREE.BufferGeometry[] = [];
    const entranceShaftGeoms: THREE.BufferGeometry[] = [];
    const kioskTransforms: { x: number; z: number; angle: number }[] = [];

    if (count > 0) {
      let majorHubSurfaceCount = 0;
      for (let i = 0; i < count; i++) {
        const node = solved.stationNodes[i]!;
        const dLen = Math.hypot(node.dirX, node.dirZ) || 1;
        const dirX = node.dirX / dLen;
        const dirZ = node.dirZ / dLen;
        const angle = Math.atan2(dirZ, dirX);
        const rightX = -dirZ;
        const rightZ = dirX;
        const isUnderground =
          node.structure === 'tunnel_box' || node.structure === 'tunnel_shield';
        const isShinkansen =
          node.lineId === 'sk:line:jr-central-tokaido-shinkansen' ||
          node.lineId === 'sk:line:jr-east-tohoku-shinkansen';
        const halfTrackSpacing = isShinkansen ? 2.65 : 2.15;
        const platformW = node.isMajorHub ? 4.4 : 3.4;
        const len = node.isMajorHub ? 128 : 82;
        const lateralOffset = halfTrackSpacing + 1.85 + platformW * 0.5;
        const majorHubIndex = !isUnderground && node.isMajorHub ? majorHubSurfaceCount++ : -1;

        this.stationMeta.push({
          node,
          index: i,
          isUnderground,
          isShinkansen,
          angle,
          dirX,
          dirZ,
          rightX,
          rightZ,
          len,
          platformW,
          halfTrackSpacing,
          lateralOffset,
          baseY: node.y,
          majorHubIndex,
          visible: true,
        });

        if (isUnderground) {
          const concourseY = Math.min(-4.2, node.y + 6.5);
          const wid = node.isMajorHub ? 15.5 : 11.5;
          const cBox = new THREE.BoxGeometry(len * 0.56, 3.0, wid * 1.12);
          cBox.rotateY(-angle);
          cBox.translate(node.x, concourseY, node.z);
          concourseGeoms.push(cBox.toNonIndexed());

          const shaftH = Math.max(3, -concourseY);
          const shaft = new THREE.CylinderGeometry(2.2, 2.2, shaftH, 8);
          shaft.translate(node.x, concourseY + shaftH * 0.5, node.z);
          entranceShaftGeoms.push(shaft.toNonIndexed());

          // Compact ground-level Tokyo Metro entrance kiosk
          kioskTransforms.push({ x: node.x, z: node.z, angle });
        }
      }

      const sideCount = count * 2;
      const unitBox = new THREE.BoxGeometry(1, 1, 1);

      this.stationSlabInst = new THREE.InstancedMesh(unitBox, this.stationSlabMat, sideCount);
      this.stationSlabInst.name = 'stations-dual-side-platforms';
      this.stationSlabInst.receiveShadow = true;

      this.platformScreenInst = new THREE.InstancedMesh(
        unitBox.clone(),
        this.platformScreenMat,
        sideCount,
      );
      this.platformScreenInst.name = 'stations-platform-screen-doors';

      this.stationAccentInst = new THREE.InstancedMesh(
        unitBox.clone(),
        this.stationAccentMat,
        sideCount,
      );
      this.stationAccentInst.name = 'stations-line-identity-bands';

      this.canopyColumnInst = new THREE.InstancedMesh(
        unitBox.clone(),
        this.canopyColumnMat,
        count * 8,
      );
      this.canopyColumnInst.name = 'stations-canopy-steel-columns';

      this.stationCanopyInst = new THREE.InstancedMesh(
        unitBox.clone(),
        this.stationCanopyMat,
        sideCount,
      );
      this.stationCanopyInst.name = 'stations-ribbed-skylight-canopies';

      this.canopyLightInst = new THREE.InstancedMesh(
        unitBox.clone(),
        this.canopyLightMat,
        sideCount,
      );
      this.canopyLightInst.name = 'stations-under-canopy-linear-lights';

      if (majorHubSurfaceCount > 0) {
        this.concourseBridgeInst = new THREE.InstancedMesh(
          unitBox.clone(),
          this.concourseBridgeMat,
          majorHubSurfaceCount,
        );
        this.concourseBridgeInst.name = 'stations-major-hub-concourse-bridges';
      }

      const slabTint = new THREE.Color();
      for (const m of this.stationMeta) {
        // Subtle architectural concrete tint variation per station
        slabTint.setHex(m.node.structure === 'viaduct' ? 0xf3f5f8 : 0xeceff3);
        const lineCol = new THREE.Color(m.node.color);
        const leftIdx = m.index * 2;
        const rightIdx = m.index * 2 + 1;
        this.stationSlabInst.setColorAt(leftIdx, slabTint);
        this.stationSlabInst.setColorAt(rightIdx, slabTint);
        this.stationAccentInst.setColorAt(leftIdx, lineCol);
        this.stationAccentInst.setColorAt(rightIdx, lineCol);
      }

      if (this.stationSlabInst.instanceColor) this.stationSlabInst.instanceColor.needsUpdate = true;
      if (this.stationAccentInst.instanceColor) {
        this.stationAccentInst.instanceColor.needsUpdate = true;
      }

      this.group.add(
        this.stationSlabInst,
        this.platformScreenInst,
        this.stationAccentInst,
        this.canopyColumnInst,
        this.stationCanopyInst,
        this.canopyLightInst,
      );
      if (this.concourseBridgeInst) {
        this.group.add(this.concourseBridgeInst);
      }
      this.interactiveStationMeshes.push(this.stationSlabInst, this.stationCanopyInst);
      this.updateStationInstanceMatrices();
    }

    if (kioskTransforms.length > 0) {
      const kioskGeom = new THREE.BoxGeometry(5.8, 2.8, 8.6);
      const inst = new THREE.InstancedMesh(kioskGeom, this.kioskMat, kioskTransforms.length);
      inst.name = 'subway-entrance-kiosks';
      const dummy = new THREE.Object3D();
      for (let i = 0; i < kioskTransforms.length; i++) {
        const k = kioskTransforms[i]!;
        dummy.position.set(k.x, 1.4, k.z);
        dummy.rotation.set(0, -k.angle, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.entranceKioskInst = inst;
      this.group.add(inst);
    }

    if (concourseGeoms.length > 0) {
      const m = mergeGeometries(concourseGeoms, false);
      concourseGeoms.forEach((g) => g.dispose());
      if (m) this.concourseGroup.add(new THREE.Mesh(m, this.concourseMaterial));
    }
    if (entranceShaftGeoms.length > 0) {
      const m = mergeGeometries(entranceShaftGeoms, false);
      entranceShaftGeoms.forEach((g) => g.dispose());
      if (m) this.concourseGroup.add(new THREE.Mesh(m, this.entranceShaftMaterial));
    }

    // ---- 4. Multi-Level Complex Vertical Transfer Connectors ----
    const xferByGate: Record<'in_gate' | 'out_of_gate' | 'unknown', THREE.BufferGeometry[]> = {
      in_gate: [],
      out_of_gate: [],
      unknown: [],
    };
    const upVec = new THREE.Vector3(0, 1, 0);

    for (const conn of solved.transferConnectors) {
      const p1 = new THREE.Vector3(conn.x1, conn.y1, conn.z1);
      const p2 = new THREE.Vector3(conn.x2, conn.y2, conn.z2);
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const dist = dir.length();
      if (dist < 2) continue;

      const cyl = new THREE.CylinderGeometry(2.0, 2.0, dist, 8);
      const quat = new THREE.Quaternion().setFromUnitVectors(upVec, dir.normalize());
      cyl.applyQuaternion(quat);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      cyl.translate(mid.x, mid.y, mid.z);
      xferByGate[conn.gateType].push(cyl.toNonIndexed());
    }

    for (const gt of ['in_gate', 'out_of_gate', 'unknown'] as const) {
      const geoms = xferByGate[gt];
      if (geoms.length === 0) continue;
      const m = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      if (m) this.transferGroup.add(new THREE.Mesh(m, this.transferMaterials[gt]));
    }

    this.concourseGroup.visible = false;
    this.transferGroup.visible = false;
  }

  /**
   * Resolves a Three.js Raycaster intersection against batched InstancedMesh surface/elevated
   * dual side station platforms OR Atlas v2 underground station cavern meshes.
   */
  resolveStationHit(hit: THREE.Intersection): SkId<'station'> | null {
    const ugHit = this.undergroundSystem.resolveStationHit(hit);
    if (ugHit) return ugHit;
    if (typeof hit.instanceId !== 'number') return null;
    const meta = this.stationMeta[Math.floor(hit.instanceId / 2)];
    if (!meta || !meta.visible) return null;
    return meta.node.stationId;
  }

  getUndergroundAPI(): UndergroundRailwayQueryAPI {
    return this.undergroundSystem;
  }

  setCutawayState(state: UndergroundCutawayState): void {
    this.verticalScale = Math.max(1.0, state.verticalExaggeration || 1.0);
    this.undergroundSystem.setCutawayStyle(state.tunnelCutawayStyle);
    const isInterior = state.tunnelCutawayStyle === 'interior_view';
    this.setInteriorMode(isInterior);
    // In Scheme A Global Ghost-Surface underground view, show crisp official Tokyo line-color crown strips
    this.undergroundSystem.setSectionCutState({
      mode: state.tunnelCutawayStyle === 'section_cutaway' ? 'tunnel_roof_open' : 'none',
      revealAllRoofs: state.tunnelCutawayStyle === 'section_cutaway',
      lineOverlayVisible: state.enabled && !isInterior,
    });
  }

  setNightFactor(nightFactor: number): void {
    const nf = Math.max(0, Math.min(1, nightFactor));
    this.stationSlabMat.emissiveIntensity = nf * 0.58;
    this.stationCanopyMat.emissiveIntensity = nf * 0.22;
    this.platformScreenMat.emissiveIntensity = nf * 0.28;
    this.kioskMat.emissiveIntensity = nf * 0.65;
    this.canopyLightMat.emissiveIntensity = 0.28 + nf * 1.65;
    this.concourseBridgeMat.emissiveIntensity = 0.12 + nf * 0.85;
  }

  setTheme(isDark: boolean): void {
    this.undergroundSystem.setTheme(isDark);
    this.setNightFactor(isDark ? 1.0 : 0.0);
  }

  getStats(): UndergroundRenderStats {
    const t = this.undergroundSystem.getTelemetry();
    return {
      tunnelBatchCount: t.totalTunnelChunks,
      undergroundStationCount: t.totalStationCaverns,
      portalCount: t.portalCount,
      transferConnectorCount: this.transferConnectorCount,
      tunnelCutawayStyle: this.undergroundSystem.getCutawayStyle(),
      activeInteriorLightCount: t.activePointLights,
    };
  }

  private updateStationInstanceMatrices(): void {
    if (
      !this.stationSlabInst ||
      !this.platformScreenInst ||
      !this.stationAccentInst ||
      !this.canopyColumnInst ||
      !this.stationCanopyInst ||
      !this.canopyLightInst
    ) {
      return;
    }
    const showCanopies = this.camDist < 4800;
    const colFracs = [-0.36, -0.12, 0.12, 0.36];

    const dummy = new THREE.Object3D();
    const hiddenMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -9999, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0, 0, 0),
    );
    let beaconPlaced = false;

    for (const m of this.stationMeta) {
      // Atlas v2: Underground stations are modeled as genuine widened enterable station caverns
      // in `UndergroundRailwaySystem` — only render surface & elevated dual-side stations here!
      const show = m.visible && !m.isUnderground;
      const leftIdx = m.index * 2;
      const rightIdx = leftIdx + 1;

      if (!show) {
        this.stationSlabInst.setMatrixAt(leftIdx, hiddenMatrix);
        this.stationSlabInst.setMatrixAt(rightIdx, hiddenMatrix);
        this.platformScreenInst.setMatrixAt(leftIdx, hiddenMatrix);
        this.platformScreenInst.setMatrixAt(rightIdx, hiddenMatrix);
        this.stationAccentInst.setMatrixAt(leftIdx, hiddenMatrix);
        this.stationAccentInst.setMatrixAt(rightIdx, hiddenMatrix);
        this.stationCanopyInst.setMatrixAt(leftIdx, hiddenMatrix);
        this.stationCanopyInst.setMatrixAt(rightIdx, hiddenMatrix);
        this.canopyLightInst.setMatrixAt(leftIdx, hiddenMatrix);
        this.canopyLightInst.setMatrixAt(rightIdx, hiddenMatrix);
        for (let c = 0; c < 8; c++) {
          this.canopyColumnInst.setMatrixAt(m.index * 8 + c, hiddenMatrix);
        }
        if (m.majorHubIndex >= 0 && this.concourseBridgeInst) {
          this.concourseBridgeInst.setMatrixAt(m.majorHubIndex, hiddenMatrix);
        }
        continue;
      }

      const n = m.node;
      const baseRotY = -m.angle;

      for (let sideSlot = 0; sideSlot < 2; sideSlot++) {
        const side = sideSlot === 0 ? -1 : 1;
        const instIdx = leftIdx + sideSlot;
        // Rotate right-side platform 180° around Y so local +Z (white safety line + yellow tactile
        // blocks) faces directly toward the tracks on BOTH left and right platforms!
        const faceTrackRotY = side === -1 ? baseRotY : baseRotY + Math.PI;

        // 1. Dual Side Platform Deck (top at baseY + 1.15m, grounded to baseY - 0.15m, ZERO track overlap!)
        const platAcross = side * m.lateralOffset;
        dummy.position.set(
          n.x + m.rightX * platAcross,
          m.baseY + 0.5,
          n.z + m.rightZ * platAcross,
        );
        dummy.rotation.set(0, faceTrackRotY, 0);
        dummy.scale.set(m.len, 1.3, m.platformW);
        dummy.updateMatrix();
        this.stationSlabInst.setMatrixAt(instIdx, dummy.matrix);

        // 2. Waist-high translucent steel/glass platform screen doors along track-facing edge
        const screenAcross = side * (m.halfTrackSpacing + 1.85 + 0.14);
        const screenX = n.x + m.rightX * screenAcross;
        const screenZ = n.z + m.rightZ * screenAcross;
        dummy.position.set(screenX, m.baseY + 1.775, screenZ);
        dummy.rotation.set(0, baseRotY, 0);
        dummy.scale.set(m.len * 0.96, 1.25, 0.18);
        dummy.updateMatrix();
        this.platformScreenInst.setMatrixAt(instIdx, dummy.matrix);

        // 3. Crisp slim line-color identity stripe along screen-door rail
        dummy.position.set(screenX, m.baseY + 2.16, screenZ);
        dummy.rotation.set(0, baseRotY, 0);
        dummy.scale.set(m.len * 0.96, 0.24, 0.22);
        dummy.updateMatrix();
        this.stationAccentInst.setMatrixAt(instIdx, dummy.matrix);

        if (showCanopies) {
          // 4. Structural steel H-columns along each platform's outer spine (4 per side)
          const colAcross = side * (m.lateralOffset + m.platformW * 0.24);
          for (let c = 0; c < 4; c++) {
            const along = colFracs[c]! * m.len;
            dummy.position.set(
              n.x + m.dirX * along + m.rightX * colAcross,
              m.baseY + 3.175,
              n.z + m.dirZ * along + m.rightZ * colAcross,
            );
            dummy.rotation.set(0, baseRotY, 0);
            dummy.scale.set(0.42, 4.05, 0.42);
            dummy.updateMatrix();
            this.canopyColumnInst.setMatrixAt(m.index * 8 + sideSlot * 4 + c, dummy.matrix);
          }

          // 5. Ribbed metal & skylight roof canopy cantilevered over each platform (open sky slot over tracks)
          const canopyAcross = side * (m.lateralOffset - 0.15);
          dummy.position.set(
            n.x + m.rightX * canopyAcross,
            m.baseY + 5.2,
            n.z + m.rightZ * canopyAcross,
          );
          dummy.rotation.set(0, baseRotY, 0);
          dummy.scale.set(m.len * 0.92, 0.42, m.platformW + 1.0);
          dummy.updateMatrix();
          this.stationCanopyInst.setMatrixAt(instIdx, dummy.matrix);

          // 6. Warm linear ceiling light strip underneath canopy
          dummy.position.set(
            n.x + m.rightX * platAcross,
            m.baseY + 4.94,
            n.z + m.rightZ * platAcross,
          );
          dummy.rotation.set(0, baseRotY, 0);
          dummy.scale.set(m.len * 0.86, 0.1, 0.52);
          dummy.updateMatrix();
          this.canopyLightInst.setMatrixAt(instIdx, dummy.matrix);
        } else {
          for (let c = 0; c < 4; c++) {
            this.canopyColumnInst.setMatrixAt(m.index * 8 + sideSlot * 4 + c, hiddenMatrix);
          }
          this.stationCanopyInst.setMatrixAt(instIdx, hiddenMatrix);
          this.canopyLightInst.setMatrixAt(instIdx, hiddenMatrix);
        }
      }

      // 7. Glazed overhead pedestrian concourse footbridge connecting both platforms on major hubs
      if (m.majorHubIndex >= 0 && this.concourseBridgeInst) {
        if (showCanopies) {
          const bridgeSpan = 2 * (m.lateralOffset + m.platformW * 0.5) + 0.8;
          dummy.position.set(n.x, m.baseY + 6.4, n.z);
          dummy.rotation.set(0, baseRotY, 0);
          dummy.scale.set(16.0, 2.4, bridgeSpan);
          dummy.updateMatrix();
          this.concourseBridgeInst.setMatrixAt(m.majorHubIndex, dummy.matrix);
        } else {
          this.concourseBridgeInst.setMatrixAt(m.majorHubIndex, hiddenMatrix);
        }
      }

      // 8. Hollow glowing architectural perimeter frame around the selected station (never blocks trains!)
      if (this.selectedStationId === n.stationId && !beaconPlaced) {
        const frameL = m.len + 5.0;
        const totalW = 2 * (m.lateralOffset + m.platformW * 0.5) + 3.0;
        const halfL = frameL * 0.5;
        const halfW = totalW * 0.5;

        this.selectedBeacon.position.set(n.x, m.baseY, n.z);
        this.selectedBeacon.rotation.set(0, baseRotY, 0);

        // 4 perimeter base rails
        this.beaconBars[0]!.position.set(0, 0.35, -halfW);
        this.beaconBars[0]!.scale.set(frameL, 0.42, 0.55);
        this.beaconBars[1]!.position.set(0, 0.35, halfW);
        this.beaconBars[1]!.scale.set(frameL, 0.42, 0.55);
        this.beaconBars[2]!.position.set(-halfL, 0.35, 0);
        this.beaconBars[2]!.scale.set(0.55, 0.42, totalW);
        this.beaconBars[3]!.position.set(halfL, 0.35, 0);
        this.beaconBars[3]!.scale.set(0.55, 0.42, totalW);

        // 4 corner vertical accent pylons
        this.beaconBars[4]!.position.set(-halfL, 3.0, -halfW);
        this.beaconBars[4]!.scale.set(0.52, 5.6, 0.52);
        this.beaconBars[5]!.position.set(halfL, 3.0, -halfW);
        this.beaconBars[5]!.scale.set(0.52, 5.6, 0.52);
        this.beaconBars[6]!.position.set(-halfL, 3.0, halfW);
        this.beaconBars[6]!.scale.set(0.52, 5.6, 0.52);
        this.beaconBars[7]!.position.set(halfL, 3.0, halfW);
        this.beaconBars[7]!.scale.set(0.52, 5.6, 0.52);

        this.selectedBeacon.visible = true;
        beaconPlaced = true;
      }
    }

    if (!beaconPlaced) {
      this.selectedBeacon.visible = false;
    }

    this.stationSlabInst.instanceMatrix.needsUpdate = true;
    this.platformScreenInst.instanceMatrix.needsUpdate = true;
    this.stationAccentInst.instanceMatrix.needsUpdate = true;
    this.canopyColumnInst.instanceMatrix.needsUpdate = true;
    this.stationCanopyInst.instanceMatrix.needsUpdate = true;
    this.canopyLightInst.instanceMatrix.needsUpdate = true;
    this.stationSlabInst.computeBoundingSphere();
    this.platformScreenInst.computeBoundingSphere();
    this.stationAccentInst.computeBoundingSphere();
    this.canopyColumnInst.computeBoundingSphere();
    this.stationCanopyInst.computeBoundingSphere();
    this.canopyLightInst.computeBoundingSphere();
    if (this.concourseBridgeInst) {
      this.concourseBridgeInst.instanceMatrix.needsUpdate = true;
      this.concourseBridgeInst.computeBoundingSphere();
    }
  }

  setInteriorMode(active: boolean): void {
    if (this.interiorMode === active) return;
    this.interiorMode = active;
    const allowUnderground = this.undergroundActive || this.clipEnabled;
    this.concourseGroup.visible = !active && this.anyUndergroundTierVisible && allowUnderground;
    this.transferGroup.visible = !active && (allowUnderground || this.selectedStationId !== null);
  }

  updateLod(camDist: number, cameraPos?: THREE.Vector3): void {
    const prevCanopies = this.camDist < 4800;
    const nextCanopies = camDist < 4800;
    this.camDist = camDist;

    this.portalGroup.visible = camDist < 3200;
    if (this.entranceKioskInst) {
      this.entranceKioskInst.visible = camDist < 2400 && !this.undergroundActive;
    }
    const { isCameraInsideTunnel } = this.undergroundSystem.updateForLod(
      camDist,
      cameraPos,
      this.verticalScale,
    );
    this.setInteriorMode(isCameraInsideTunnel);
    if (prevCanopies !== nextCanopies) {
      this.updateStationInstanceMatrices();
    }
  }

  applyFilters(params: Omit<UndergroundFilterParams, 'clipEnabled'> & { clipEnabled?: boolean }): void {
    const {
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      selectedStationId,
      fareSliceOnly,
      fareSliceLineIds,
      undergroundActive,
      clipEnabled = false,
    } = params;

    this.undergroundActive = undergroundActive;
    this.clipEnabled = clipEnabled;
    this.selectedStationId = selectedStationId;
    this.anyUndergroundTierVisible = Boolean(
      visibleTiers['L-1'] || visibleTiers['L-2'] || visibleTiers['L-3'] || visibleTiers['L-4'],
    );
    const allowUnderground = undergroundActive || clipEnabled;

    this.concourseGroup.visible =
      !this.interiorMode && this.anyUndergroundTierVisible && allowUnderground;
    this.transferGroup.visible =
      !this.interiorMode && (allowUnderground || selectedStationId !== null);
    if (this.entranceKioskInst) {
      this.entranceKioskInst.visible = this.camDist < 2400 && !undergroundActive;
    }

    for (const tb of this.tunnelBatches) {
      tb.filterVisible =
        visibleOperatorIds.has(tb.operatorId) &&
        Boolean(visibleTiers[tb.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(tb.lineId));

      tb.group.visible = tb.filterVisible && allowUnderground;
      if (!tb.group.visible) continue;

      const isSelected = selectedLineId !== null && tb.lineId === selectedLineId;
      const isDimmed = selectedLineId !== null && !isSelected;
      tb.shellMaterial.opacity = isSelected ? 0.66 : isDimmed ? 0.08 : 0.48;
      tb.shellMaterial.emissiveIntensity = isSelected ? 0.44 : 0.14;
    }

    for (const m of this.stationMeta) {
      const n = m.node;
      m.visible =
        visibleOperatorIds.has(n.operatorId) &&
        Boolean(visibleTiers[n.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(n.lineId));
    }

    this.undergroundSystem.applyFilters({
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      fareSliceOnly,
      fareSliceLineIds,
      undergroundActive,
      clipEnabled,
    });

    this.updateStationInstanceMatrices();
  }

  dispose(): void {
    this.undergroundSystem.dispose();
    for (const tb of this.tunnelBatches) {
      tb.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      tb.shellMaterial.dispose();
    }
    this.stationSlabInst?.geometry.dispose();
    this.platformScreenInst?.geometry.dispose();
    this.stationAccentInst?.geometry.dispose();
    this.canopyColumnInst?.geometry.dispose();
    this.stationCanopyInst?.geometry.dispose();
    this.canopyLightInst?.geometry.dispose();
    this.concourseBridgeInst?.geometry.dispose();
    this.entranceKioskInst?.geometry.dispose();
    this.beaconBars[0]?.geometry.dispose();
    for (const grp of [this.portalGroup, this.concourseGroup, this.transferGroup]) {
      grp.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.tunnelTexture.dispose();
    this.platformDeckTexture.dispose();
    this.screenDoorTexture.dispose();
    this.canopyRoofTexture.dispose();
    this.concourseBridgeTexture.dispose();
    this.portalMaterial.dispose();
    this.concourseMaterial.dispose();
    this.entranceShaftMaterial.dispose();
    this.stationSlabMat.dispose();
    this.platformScreenMat.dispose();
    this.stationAccentMat.dispose();
    this.canopyColumnMat.dispose();
    this.stationCanopyMat.dispose();
    this.canopyLightMat.dispose();
    this.concourseBridgeMat.dispose();
    this.kioskMat.dispose();
    this.beaconMat.dispose();
    Object.values(this.transferMaterials).forEach((m) => m.dispose());
  }
}
