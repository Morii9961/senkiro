/**
 * Procedural 3D Underground Tunnel, Portal & Simplified Multi-Level Station Volume Generator.
 *
 * Core Underground Railway Architecture (Section 4):
 *  - Continuous circular shield tunnels (deep lines: Oedo, Fukutoshin, Namboku, Yurakucho, Toyoko)
 *    and rectangular cut-and-cover box tunnels (shallow lines: Marunouchi, Ginza, Hibiya, Asakusa)
 *  - Semi-transparent cutaway tunnel shells so internal steel rails & line colors glow clearly
 *  - Physical tunnel portal arches at surface/elevated-to-underground transitions
 *  - Simplified underground & surface station platforms, upper concourse mezzanines,
 *    vertical transfer shafts between stacked StationComplex lines, and conceptual entrance shafts
 *    rising to ground level y = 0.
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
}

interface StationMarkerEntry {
  node: SolvedStationNode3D;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

function makeCircularTunnelProfile(radius: number, centerOffsetY: number, segments = 10): [number, number][] {
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
  readonly interactiveStationMeshes: THREE.Mesh[] = [];

  private readonly tunnelBatches: TunnelBatch[] = [];
  private readonly stationEntries: StationMarkerEntry[] = [];
  private readonly portalGroup = new THREE.Group();
  private readonly concourseGroup = new THREE.Group();
  private readonly transferGroup = new THREE.Group();

  private readonly portalMaterial: THREE.MeshStandardMaterial;
  private readonly concourseMaterial: THREE.MeshStandardMaterial;
  private readonly entranceShaftMaterial: THREE.MeshStandardMaterial;
  private readonly transferMaterials: Record<'in_gate' | 'out_of_gate' | 'unknown', THREE.MeshStandardMaterial>;

  constructor(solved: SolvedRailwayNetwork3D, clipPlanes: THREE.Plane[]) {
    this.group.name = 'procedural-3d-tunnels-and-stations';
    this.portalGroup.name = 'tunnel-portals';
    this.concourseGroup.name = 'underground-station-concourses';
    this.transferGroup.name = 'complex-vertical-transfers';
    this.group.add(this.portalGroup, this.concourseGroup, this.transferGroup);

    this.portalMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.82,
      metalness: 0.12,
      clippingPlanes: clipPlanes,
    });

    this.concourseMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.55,
      metalness: 0.14,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      clippingPlanes: clipPlanes,
    });

    this.entranceShaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      clippingPlanes: clipPlanes,
    });

    this.transferMaterials = {
      in_gate: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.72,
        clippingPlanes: clipPlanes,
      }),
      out_of_gate: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.68,
        clippingPlanes: clipPlanes,
      }),
      unknown: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.55,
        clippingPlanes: clipPlanes,
      }),
    };

    // ---- 1. Continuous 3D Underground Tunnel Shells ----
    const shieldProfile = makeCircularTunnelProfile(5.4, 2.2, 10);
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
      // Extract contiguous underground runs (y < -2.2)
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
        const g = sweepProfileAlong3D(run, profile, true);
        if (g) entry.geoms.push(g);
      }
    }

    for (const entry of tunnelsByKey.values()) {
      if (entry.geoms.length === 0) continue;
      const merged = mergeGeometries(entry.geoms, false);
      entry.geoms.forEach((g) => g.dispose());
      if (!merged) continue;

      const lineColor = new THREE.Color(entry.color);
      // Semi-transparent architectural cutaway shell tinted subtly with line identity
      const shellMaterial = new THREE.MeshStandardMaterial({
        color: lineColor.clone().lerp(new THREE.Color(0x94a3b8), 0.62),
        emissive: lineColor,
        emissiveIntensity: 0.14,
        roughness: 0.55,
        metalness: 0.15,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
        clippingPlanes: clipPlanes,
      });

      const grp = new THREE.Group();
      grp.name = `tunnel-${entry.lineId}-${entry.tier}`;
      const mesh = new THREE.Mesh(merged, shellMaterial);
      grp.add(mesh);
      this.group.add(grp);

      this.tunnelBatches.push({
        lineId: entry.lineId,
        operatorId: entry.operatorId,
        tier: entry.tier,
        group: grp,
        shellMaterial,
      });
    }

    // ---- 2. Physical Tunnel Portal Arches ----
    const portalGeoms: THREE.BufferGeometry[] = [];
    for (const seg of solved.segments) {
      for (const p of seg.portals) {
        const angle = Math.atan2(p.dirZ, p.dirX);
        // Reinforced concrete portal collar frame
        const headwall = new THREE.BoxGeometry(4.5, 8.5, 16);
        headwall.rotateY(-angle);
        headwall.translate(p.x, p.y + 1.5, p.z);
        portalGeoms.push(headwall.toNonIndexed());
      }
    }
    if (portalGeoms.length > 0) {
      const m = mergeGeometries(portalGeoms, false);
      portalGeoms.forEach((g) => g.dispose());
      if (m) {
        const mesh = new THREE.Mesh(m, this.portalMaterial);
        this.portalGroup.add(mesh);
      }
    }

    // ---- 3. Interactive 3D Station Volumes (Platforms + Underground Concourses + Entrance Shafts) ----
    const concourseGeoms: THREE.BufferGeometry[] = [];
    const entranceShaftGeoms: THREE.BufferGeometry[] = [];

    for (const node of solved.stationNodes) {
      const angle = Math.atan2(node.dirZ, node.dirX);
      const isUnderground =
        node.structure === 'tunnel_box' || node.structure === 'tunnel_shield';
      const len = node.isMajorHub ? 110 : 68;
      const wid = node.isMajorHub ? 17 : 12.5;
      const ht = isUnderground ? 4.4 : 3.2;

      const platGeom = new THREE.BoxGeometry(len, ht, wid);
      const col = new THREE.Color(node.color);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: isUnderground ? 0.35 : 0.18,
        roughness: 0.42,
        metalness: 0.15,
        transparent: true,
        opacity: isUnderground ? 0.82 : 0.92,
        clippingPlanes: clipPlanes,
      });

      const mesh = new THREE.Mesh(platGeom, mat);
      mesh.position.set(node.x, node.y + (isUnderground ? 1.8 : 1.0), node.z);
      mesh.rotation.y = -angle;
      mesh.userData = {
        kind: 'station',
        stationId: node.stationId,
        lineId: node.lineId,
        tier: node.tier,
        y: node.y,
        heightBasis: node.heightBasis,
      };
      this.group.add(mesh);
      this.interactiveStationMeshes.push(mesh);
      this.stationEntries.push({ node, mesh, material: mat });

      // For underground stations: add simplified upper concourse box + conceptual ground entrance shaft!
      if (isUnderground) {
        const concourseY = Math.min(-4.2, node.y + 6.5);
        const cBox = new THREE.BoxGeometry(len * 0.65, 3.2, wid * 1.15);
        cBox.rotateY(-angle);
        cBox.translate(node.x, concourseY, node.z);
        concourseGeoms.push(cBox.toNonIndexed());

        // Conceptual vertical entrance shaft connecting concourse cleanly to ground surface y = 0
        const shaftH = Math.max(3, -concourseY);
        const shaft = new THREE.CylinderGeometry(2.6, 2.6, shaftH, 8);
        shaft.translate(node.x, concourseY + shaftH * 0.5, node.z);
        entranceShaftGeoms.push(shaft.toNonIndexed());
      }
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

      const cyl = new THREE.CylinderGeometry(2.2, 2.2, dist, 8);
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
  }

  applyFilters(params: {
    visibleOperatorIds: Set<SkId<'operator'>>;
    visibleTiers: Record<SchematicTierId, boolean>;
    selectedLineId: SkId<'line'> | null;
    selectedStationId: SkId<'station'> | null;
    fareSliceOnly: boolean;
    fareSliceLineIds: Set<SkId<'line'>>;
    undergroundActive: boolean;
  }): void {
    const {
      visibleOperatorIds,
      visibleTiers,
      selectedLineId,
      selectedStationId,
      fareSliceOnly,
      fareSliceLineIds,
      undergroundActive,
    } = params;

    const anyUndergroundTierVisible = Boolean(
      visibleTiers['L-1'] || visibleTiers['L-2'] || visibleTiers['L-3'] || visibleTiers['L-4'],
    );
    this.concourseGroup.visible = anyUndergroundTierVisible && undergroundActive;
    this.transferGroup.visible = undergroundActive || selectedStationId !== null;

    for (const tb of this.tunnelBatches) {
      const visible =
        visibleOperatorIds.has(tb.operatorId) &&
        Boolean(visibleTiers[tb.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(tb.lineId));
      tb.group.visible = visible;
      if (!visible) continue;

      const isSelected = selectedLineId !== null && tb.lineId === selectedLineId;
      const isDimmed = selectedLineId !== null && !isSelected;
      tb.shellMaterial.opacity = isSelected ? 0.56 : isDimmed ? 0.08 : undergroundActive ? 0.4 : 0.25;
      tb.shellMaterial.emissiveIntensity = isSelected ? 0.42 : 0.14;
    }

    for (const entry of this.stationEntries) {
      const n = entry.node;
      const visible =
        visibleOperatorIds.has(n.operatorId) &&
        Boolean(visibleTiers[n.tier]) &&
        (!fareSliceOnly || fareSliceLineIds.has(n.lineId));
      entry.mesh.visible = visible;
      if (!visible) continue;

      const isSelStation = selectedStationId === n.stationId;
      const isSelLine = selectedLineId !== null && n.lineId === selectedLineId;
      const isDimmed = selectedLineId !== null && !isSelLine && !isSelStation;

      entry.material.opacity = isDimmed ? 0.18 : 0.94;
      entry.material.emissiveIntensity = isSelStation ? 0.9 : isSelLine ? 0.55 : 0.24;
      entry.mesh.scale.setScalar(isSelStation ? 1.32 : isSelLine ? 1.12 : 1.0);
    }
  }

  dispose(): void {
    for (const tb of this.tunnelBatches) {
      tb.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      tb.shellMaterial.dispose();
    }
    for (const s of this.stationEntries) {
      s.mesh.geometry.dispose();
      s.material.dispose();
    }
    for (const grp of [this.portalGroup, this.concourseGroup, this.transferGroup]) {
      grp.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.portalMaterial.dispose();
    this.concourseMaterial.dispose();
    this.entranceShaftMaterial.dispose();
    Object.values(this.transferMaterials).forEach((m) => m.dispose());
  }
}
