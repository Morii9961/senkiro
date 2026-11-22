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
  SchematicTierId,
  SolvedPoint3D,
  SolvedRailwayNetwork3D,
  SolvedStationNode3D,
} from '../../domain/elevationSolver.js';
import type { SkId } from '../../domain/types.js';
import { sweepProfileAlong3D } from './railTrackGenerator.js';

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
  angle: number;
  len: number;
  wid: number;
  baseY: number;
  visible: boolean;
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

export class TunnelAndStationLayer {
  readonly group = new THREE.Group();
  readonly interactiveStationMeshes: THREE.Object3D[] = [];

  private readonly tunnelBatches: TunnelBatch[] = [];
  private readonly stationMeta: StationInstanceMeta[] = [];
  private readonly portalGroup = new THREE.Group();
  private readonly concourseGroup = new THREE.Group();
  private readonly transferGroup = new THREE.Group();

  private readonly stationSlabInst: THREE.InstancedMesh | null = null;
  private readonly stationCanopyInst: THREE.InstancedMesh | null = null;
  private readonly stationAccentInst: THREE.InstancedMesh | null = null;
  private readonly entranceKioskInst: THREE.InstancedMesh | null = null;
  private readonly selectedBeacon: THREE.Mesh;

  private readonly tunnelTexture: THREE.CanvasTexture;
  private readonly portalMaterial: THREE.MeshStandardMaterial;
  private readonly concourseMaterial: THREE.MeshStandardMaterial;
  private readonly entranceShaftMaterial: THREE.MeshStandardMaterial;
  private readonly stationSlabMat: THREE.MeshStandardMaterial;
  private readonly stationCanopyMat: THREE.MeshStandardMaterial;
  private readonly stationAccentMat: THREE.MeshStandardMaterial;
  private readonly kioskMat: THREE.MeshStandardMaterial;
  private readonly beaconMat: THREE.MeshStandardMaterial;
  private readonly transferMaterials: Record<
    'in_gate' | 'out_of_gate' | 'unknown',
    THREE.MeshStandardMaterial
  >;

  private undergroundActive = false;
  private clipEnabled = false;
  private anyUndergroundTierVisible = true;
  private selectedStationId: SkId<'station'> | null = null;
  private camDist = 1200;

  constructor(solved: SolvedRailwayNetwork3D, clipPlanes: THREE.Plane[]) {
    this.group.name = 'procedural-3d-tunnels-and-stations';
    this.portalGroup.name = 'tunnel-portals';
    this.concourseGroup.name = 'underground-station-concourses';
    this.transferGroup.name = 'complex-vertical-transfers';
    this.group.add(this.portalGroup, this.concourseGroup, this.transferGroup);

    this.tunnelTexture = createTunnelConcreteTexture();

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
      roughness: 0.84,
      metalness: 0.05,
      clippingPlanes: clipPlanes,
    });

    this.stationCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x4c5664,
      roughness: 0.46,
      metalness: 0.34,
      envMapIntensity: 0.85,
      clippingPlanes: clipPlanes,
    });

    this.stationAccentMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.12,
      clippingPlanes: clipPlanes,
    });

    this.kioskMat = new THREE.MeshStandardMaterial({
      color: 0x3b4858,
      roughness: 0.32,
      metalness: 0.45,
      envMapIntensity: 1.0,
      clippingPlanes: clipPlanes,
    });

    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.9,
      clippingPlanes: clipPlanes,
    });

    this.selectedBeacon = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.beaconMat);
    this.selectedBeacon.visible = false;
    this.selectedBeacon.name = 'selected-station-highlight';
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

    // ---- 1. Continuous 3D Segmented Concrete Underground Tunnel Shells ----
    const shieldProfile = makeCircularTunnelProfile(5.4, 2.2, 8);
    const boxProfile = makeBoxTunnelProfile(5.8, -1.2, 5.4);

    const tunnelsByKey = new Map<
      string,
      {
        lineId: SkId<'line'>;
        operatorId: SkId<'operator'>;
        tier: SchematicTierId;
        color: string;
        geoms: THREE.BufferGeometry[];
      }
    >();

    for (const seg of solved.segments) {
      const runs: SolvedPoint3D[][] = [];
      let curRun: SolvedPoint3D[] = [];
      for (const pt of seg.points) {
        if (pt.y < -2.2) {
          curRun.push(pt);
        } else if (curRun.length > 0) {
          if (curRun.length >= 2) runs.push(curRun);
          curRun = [];
        }
      }
      if (curRun.length >= 2) runs.push(curRun);
      if (runs.length === 0) continue;

      const key = `${seg.primaryLineId}::${seg.dominantTier}`;
      if (!tunnelsByKey.has(key)) {
        tunnelsByKey.set(key, {
          lineId: seg.primaryLineId,
          operatorId: seg.operatorId,
          tier: seg.dominantTier,
          color: seg.color,
          geoms: [],
        });
      }
      const entry = tunnelsByKey.get(key)!;
      const isShield = seg.dominantStructure === 'tunnel_shield' || seg.minY <= -24;
      const profile = isShield ? shieldProfile : boxProfile;

      for (const run of runs) {
        const g = sweepProfileAlong3D(run, profile, true, true);
        if (g) entry.geoms.push(g);
      }
    }

    for (const entry of tunnelsByKey.values()) {
      if (entry.geoms.length === 0) continue;
      const merged = mergeGeometries(entry.geoms, false);
      entry.geoms.forEach((g) => g.dispose());
      if (!merged) continue;

      const lineColor = new THREE.Color(entry.color);
      // Realistic precast concrete tunnel lining by default; line color appears only as subtle highlight when selected!
      const shellMaterial = new THREE.MeshStandardMaterial({
        map: this.tunnelTexture,
        color: new THREE.Color(0x9ca5b0),
        emissive: lineColor,
        emissiveIntensity: 0.0,
        roughness: 0.82,
        metalness: 0.06,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
        clippingPlanes: clipPlanes,
      });

      const grp = new THREE.Group();
      grp.name = `tunnel-${entry.lineId}-${entry.tier}`;
      grp.visible = false; // Culled while ground is opaque in surface mode!
      grp.add(new THREE.Mesh(merged, shellMaterial));
      this.group.add(grp);

      this.tunnelBatches.push({
        lineId: entry.lineId,
        operatorId: entry.operatorId,
        tier: entry.tier,
        group: grp,
        shellMaterial,
        filterVisible: true,
      });
    }

    // ---- 2. Physical Concrete Tunnel Portal Headwalls ----
    const portalGeoms: THREE.BufferGeometry[] = [];
    for (const seg of solved.segments) {
      for (const p of seg.portals) {
        const angle = Math.atan2(p.dirZ, p.dirX);
        const headwall = new THREE.BoxGeometry(4.2, 8.2, 15.5);
        headwall.rotateY(-angle);
        headwall.translate(p.x, p.y + 1.4, p.z);
        portalGeoms.push(headwall.toNonIndexed());
      }
    }
    if (portalGeoms.length > 0) {
      const m = mergeGeometries(portalGeoms, false);
      portalGeoms.forEach((g) => g.dispose());
      if (m) {
        const mesh = new THREE.Mesh(m, this.portalMaterial);
        mesh.receiveShadow = true;
        this.portalGroup.add(mesh);
      }
    }

    // ---- 3. Batched Architectural Station Platforms (300+ draw calls -> 4 InstancedMeshes!) ----
    const count = solved.stationNodes.length;
    const concourseGeoms: THREE.BufferGeometry[] = [];
    const entranceShaftGeoms: THREE.BufferGeometry[] = [];
    const kioskTransforms: { x: number; z: number; angle: number }[] = [];

    if (count > 0) {
      const unitBox = new THREE.BoxGeometry(1, 1, 1);
      this.stationSlabInst = new THREE.InstancedMesh(unitBox, this.stationSlabMat, count);
      this.stationSlabInst.name = 'stations-concrete-slabs';
      this.stationSlabInst.receiveShadow = true;

      this.stationCanopyInst = new THREE.InstancedMesh(unitBox.clone(), this.stationCanopyMat, count);
      this.stationCanopyInst.name = 'stations-slate-canopies';

      this.stationAccentInst = new THREE.InstancedMesh(unitBox.clone(), this.stationAccentMat, count);
      this.stationAccentInst.name = 'stations-line-fascia';

      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const node = solved.stationNodes[i]!;
        const angle = Math.atan2(node.dirZ, node.dirX);
        const isUnderground =
          node.structure === 'tunnel_box' || node.structure === 'tunnel_shield';
        const len = node.isMajorHub ? 108 : 66;
        const wid = node.isMajorHub ? 15.5 : 11.5;

        this.stationMeta.push({
          node,
          index: i,
          isUnderground,
          angle,
          len,
          wid,
          baseY: node.y,
          visible: true,
        });

        // Concrete slab neutral tone (slightly cooler underground, warm stone on surface)
        color.setHex(isUnderground ? 0xbfc8d4 : 0xd3d6db);
        this.stationSlabInst.setColorAt(i, color);

        // Slim restrained line-color identity fascia band (not giant glowing neon blocks!)
        const lineCol = new THREE.Color(node.color);
        if (!isUnderground) {
          lineCol.lerp(new THREE.Color(0x475569), 0.14);
        }
        this.stationAccentInst.setColorAt(i, lineCol);

        if (isUnderground) {
          const concourseY = Math.min(-4.2, node.y + 6.5);
          const cBox = new THREE.BoxGeometry(len * 0.62, 3.0, wid * 1.12);
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

      if (this.stationSlabInst.instanceColor) this.stationSlabInst.instanceColor.needsUpdate = true;
      if (this.stationAccentInst.instanceColor) this.stationAccentInst.instanceColor.needsUpdate = true;

      this.group.add(this.stationSlabInst, this.stationCanopyInst, this.stationAccentInst);
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
   * Resolves a Three.js Raycaster intersection against batched InstancedMesh station platforms.
   */
  resolveStationHit(hit: THREE.Intersection): SkId<'station'> | null {
    if (typeof hit.instanceId !== 'number') return null;
    const meta = this.stationMeta[hit.instanceId];
    if (!meta || !meta.visible) return null;
    return meta.node.stationId;
  }

  private updateStationInstanceMatrices(): void {
    if (!this.stationSlabInst || !this.stationCanopyInst || !this.stationAccentInst) return;
    const allowUnderground = this.undergroundActive || this.clipEnabled;
    const showCanopies = this.camDist < 4800;

    const dummy = new THREE.Object3D();
    let beaconPlaced = false;

    for (const m of this.stationMeta) {
      const show = m.visible && (!m.isUnderground || allowUnderground);
      if (!show) {
        dummy.position.set(0, -9999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        this.stationSlabInst.setMatrixAt(m.index, dummy.matrix);
        this.stationCanopyInst.setMatrixAt(m.index, dummy.matrix);
        this.stationAccentInst.setMatrixAt(m.index, dummy.matrix);
        continue;
      }

      const n = m.node;
      // 1. Concrete platform base slab
      dummy.position.set(n.x, m.baseY + (m.isUnderground ? 0.55 : 0.45), n.z);
      dummy.rotation.set(0, -m.angle, 0);
      dummy.scale.set(m.len, m.isUnderground ? 1.8 : 1.4, m.wid);
      dummy.updateMatrix();
      this.stationSlabInst.setMatrixAt(m.index, dummy.matrix);

      // 2. Slim restrained line-color architectural fascia stripe along platform edge
      dummy.position.set(n.x, m.baseY + (m.isUnderground ? 1.65 : 1.35), n.z);
      dummy.rotation.set(0, -m.angle, 0);
      dummy.scale.set(m.len * 0.98, 0.75, m.wid + 0.5);
      dummy.updateMatrix();
      this.stationAccentInst.setMatrixAt(m.index, dummy.matrix);

      // 3. Sleek dark-slate canopy roof (surface/elevated only, hidden at Far overview!)
      if (!m.isUnderground && showCanopies) {
        dummy.position.set(n.x, m.baseY + 4.8, n.z);
        dummy.rotation.set(0, -m.angle, 0);
        dummy.scale.set(m.len * 0.86, 0.65, m.wid * 0.96);
        dummy.updateMatrix();
        this.stationCanopyInst.setMatrixAt(m.index, dummy.matrix);
      } else {
        dummy.position.set(0, -9999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        this.stationCanopyInst.setMatrixAt(m.index, dummy.matrix);
      }

      // 4. Selected station architectural highlight frame
      if (this.selectedStationId === n.stationId && !beaconPlaced) {
        this.selectedBeacon.position.set(n.x, m.baseY + 2.4, n.z);
        this.selectedBeacon.rotation.set(0, -m.angle, 0);
        this.selectedBeacon.scale.set(m.len + 6, 4.6, m.wid + 5);
        this.selectedBeacon.visible = true;
        beaconPlaced = true;
      }
    }

    if (!beaconPlaced) {
      this.selectedBeacon.visible = false;
    }

    this.stationSlabInst.instanceMatrix.needsUpdate = true;
    this.stationCanopyInst.instanceMatrix.needsUpdate = true;
    this.stationAccentInst.instanceMatrix.needsUpdate = true;
    this.stationSlabInst.computeBoundingSphere();
    this.stationCanopyInst.computeBoundingSphere();
    this.stationAccentInst.computeBoundingSphere();
  }

  updateLod(camDist: number): void {
    const prevCanopies = this.camDist < 4800;
    const nextCanopies = camDist < 4800;
    this.camDist = camDist;

    this.portalGroup.visible = camDist < 3200;
    if (this.entranceKioskInst) {
      this.entranceKioskInst.visible = camDist < 2400 && !this.undergroundActive;
    }
    if (prevCanopies !== nextCanopies) {
      this.updateStationInstanceMatrices();
    }
  }

  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    selectedStationId: SkId<'station'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
    undergroundActive: boolean;
    clipEnabled?: boolean;
    explorerInterior?: boolean;
  }): void {
    const {
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      selectedStationId,
      fareSliceOnly,
      fareSliceLineIds,
      undergroundActive,
      clipEnabled = false,
      explorerInterior = false,
    } = params;

    this.undergroundActive = undergroundActive;
    this.clipEnabled = clipEnabled;
    this.selectedStationId = selectedStationId;
    this.anyUndergroundTierVisible = Boolean(
      visibleTiers['L-1'] || visibleTiers['L-2'] || visibleTiers['L-3'] || visibleTiers['L-4'],
    );
    const allowUnderground = undergroundActive || clipEnabled;

    this.concourseGroup.visible = this.anyUndergroundTierVisible && allowUnderground;
    this.transferGroup.visible = allowUnderground || selectedStationId !== null;
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
      if (explorerInterior) {
        // Inside tunnels: solid depth-writing concrete walls prevent wrong-perspective bleed-through!
        const needUpdate = tb.shellMaterial.transparent !== false;
        tb.shellMaterial.transparent = false;
        tb.shellMaterial.opacity = 1.0;
        tb.shellMaterial.depthWrite = true;
        tb.shellMaterial.color.setHex(isDimmed ? 0x6b7480 : 0xa3acb8);
        tb.shellMaterial.emissiveIntensity = isSelected ? 0.16 : 0.0;
        if (needUpdate) tb.shellMaterial.needsUpdate = true;
      } else {
        // Cutaway analytical mode: semi-transparent concrete shells reveal crossing depths; line color highlights on select
        const needUpdate = tb.shellMaterial.transparent !== true;
        tb.shellMaterial.transparent = true;
        tb.shellMaterial.depthWrite = false;
        tb.shellMaterial.opacity = isSelected ? 0.64 : isDimmed ? 0.08 : 0.44;
        tb.shellMaterial.color.setHex(0x9ca5b0);
        tb.shellMaterial.emissiveIntensity = isSelected ? 0.28 : 0.0;
        if (needUpdate) tb.shellMaterial.needsUpdate = true;
      }
    }

    for (const m of this.stationMeta) {
      const n = m.node;
      m.visible =
        visibleOperatorIds.has(n.operatorId) &&
        Boolean(visibleTiers[n.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(n.lineId));
    }

    this.updateStationInstanceMatrices();
  }

  dispose(): void {
    for (const tb of this.tunnelBatches) {
      tb.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      tb.shellMaterial.dispose();
    }
    this.stationSlabInst?.geometry.dispose();
    this.stationCanopyInst?.geometry.dispose();
    this.stationAccentInst?.geometry.dispose();
    this.entranceKioskInst?.geometry.dispose();
    this.selectedBeacon.geometry.dispose();
    for (const grp of [this.portalGroup, this.concourseGroup, this.transferGroup]) {
      grp.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.tunnelTexture.dispose();
    this.portalMaterial.dispose();
    this.concourseMaterial.dispose();
    this.entranceShaftMaterial.dispose();
    this.stationSlabMat.dispose();
    this.stationCanopyMat.dispose();
    this.stationAccentMat.dispose();
    this.kioskMat.dispose();
    this.beaconMat.dispose();
    Object.values(this.transferMaterials).forEach((m) => m.dispose());
  }
}
