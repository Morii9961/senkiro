/**
 * SENKIRO Atlas v2 — 3D-to-Screen Label Projection & Multi-Tier Anchor Registry.
 *
 * Collects world-space anchors from AtlasDataset + SolvedRailwayNetwork3D + Landmarks +
 * Simulated Trains, projects visible anchors into screen space, and delegates deconfliction
 * to the pure-TS `resolveLabelLayout()` solver.
 */

import * as THREE from 'three';
import type { CameraModeId } from '../domain/cameraModeStateMachine.js';
import type { SolvedRailwayNetwork3D } from '../domain/elevationSolver.js';
import {
  resolveLabelLayout,
  type LabelCandidateInput,
  type MapLabelKind,
  type PlacedMapLabel,
} from '../domain/labelLayout.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import { lonLatToWorld } from './geoProjection.js';
import type { UrbanLandmarkRecord } from './types.js';
import type { TrainSimulationState } from './uxContracts.js';

interface WorldLabelAnchor {
  id: string;
  kind: MapLabelKind;
  textPrimaryJa: string;
  textPrimaryEn: string;
  textSecondaryJa?: string;
  textSecondaryEn?: string;
  badge?: string | null;
  color?: string | null;
  tier?: LabelCandidateInput['tier'];
  isUnderground: boolean;
  isMajorHub: boolean;
  operatorId?: SkId<'operator'> | null;
  lineId?: SkId<'line'> | null;
  entityKind?: LabelCandidateInput['entityKind'];
  entityId?: string | null;
  priority: number;
  x: number;
  baseY: number;
  z: number;
}

const TOKYO_DISTRICT_ANCHORS: {
  id: string;
  ja: string;
  en: string;
  lon: number;
  lat: number;
  priority: number;
}[] = [
  { id: 'dist-shinjuku', ja: '新宿エリア', en: 'Shinjuku', lon: 139.7004, lat: 35.6896, priority: 340 },
  { id: 'dist-shibuya', ja: '渋谷エリア', en: 'Shibuya', lon: 139.7016, lat: 35.658, priority: 335 },
  { id: 'dist-tokyo', ja: '東京・丸の内', en: 'Tokyo / Marunouchi', lon: 139.7662, lat: 35.6826, priority: 350 },
  { id: 'dist-shinagawa', ja: '品川・高輪', en: 'Shinagawa', lon: 139.739, lat: 35.6285, priority: 320 },
  { id: 'dist-ikebukuro', ja: '池袋エリア', en: 'Ikebukuro', lon: 139.7109, lat: 35.7295, priority: 318 },
  { id: 'dist-ueno', ja: '上野・御徒町', en: 'Ueno', lon: 139.7772, lat: 35.7138, priority: 300 },
  { id: 'dist-roppongi', ja: '六本木・赤坂', en: 'Roppongi', lon: 139.731, lat: 35.6628, priority: 280 },
  { id: 'dist-ginza', ja: '銀座・日比谷', en: 'Ginza / Hibiya', lon: 139.765, lat: 35.6717, priority: 290 },
  { id: 'dist-oshiage', ja: '押上・スカイツリー', en: 'Oshiage / Skytree', lon: 139.8107, lat: 35.7101, priority: 285 },
];

export class SpatialLabelRegistry {
  private readonly staticAnchors: WorldLabelAnchor[] = [];
  private readonly landmarkAnchors: WorldLabelAnchor[] = [];
  private readonly tmpVec = new THREE.Vector3();

  constructor(dataset: AtlasDataset, solved: SolvedRailwayNetwork3D) {
    const lineById = new Map(dataset.railLines.map((l) => [l.id, l]));
    const complexById = new Map(dataset.stationComplexes.map((c) => [c.id, c]));

    // 1. Urban Districts (City Overview primary landmarks)
    for (const d of TOKYO_DISTRICT_ANCHORS) {
      const { x, z } = lonLatToWorld(d.lon, d.lat);
      this.staticAnchors.push({
        id: d.id,
        kind: 'district',
        textPrimaryJa: d.ja,
        textPrimaryEn: d.en,
        isUnderground: false,
        isMajorHub: true,
        entityKind: 'hub',
        entityId: d.id,
        priority: d.priority,
        x,
        baseY: 52,
        z,
      });
    }

    // 2. Station Anchors & Subway Surface Facilities
    const seenFacilityCells = new Set<string>();
    for (const node of solved.stationNodes) {
      const isUg = node.y < -2.2;
      const line = lineById.get(node.lineId);
      const lineShortJa = line?.names.ja?.split('（')[0] ?? '';
      const lineShortEn = line?.names.en?.split(' (')[0] ?? lineShortJa;

      this.staticAnchors.push({
        id: `lbl-st-${node.stationId}-${node.lineId}`,
        kind: 'station',
        textPrimaryJa: node.nameJa,
        textPrimaryEn: node.nameEn ?? node.nameJa,
        textSecondaryJa: isUg ? `${lineShortJa} · ${node.tier}` : lineShortJa || undefined,
        textSecondaryEn: isUg ? `${lineShortEn} · ${node.tier}` : lineShortEn || undefined,
        badge: node.stationCode ?? (isUg ? node.tier : null),
        color: node.color,
        tier: node.tier,
        isUnderground: isUg,
        isMajorHub: node.isMajorHub,
        operatorId: node.operatorId,
        lineId: node.lineId,
        entityKind: 'station',
        entityId: node.stationId,
        priority: node.isMajorHub ? 220 : isUg ? 150 : 120,
        x: node.x,
        baseY: node.y + (isUg ? 4.5 : 7.5),
        z: node.z,
      });

      if (isUg) {
        const fKey = `${Math.round(node.x / 65)},${Math.round(node.z / 65)}`;
        if (!seenFacilityCells.has(fKey)) {
          seenFacilityCells.add(fKey);
          this.staticAnchors.push({
            id: `lbl-fac-${node.stationId}`,
            kind: 'facility',
            textPrimaryJa: `${node.nameJa} 地下鉄出入口`,
            textPrimaryEn: `${node.nameEn ?? node.nameJa} Subway Exit`,
            color: node.color,
            isUnderground: false,
            isMajorHub: false,
            operatorId: node.operatorId,
            entityKind: 'station',
            entityId: node.stationId,
            priority: 65,
            x: node.x,
            baseY: 4.5,
            z: node.z,
          });
        }
      }
    }

    // 3. Rail Line & Tunnel Midpoint Anchors (up to 3 distributed samples per line)
    const segsByLine = new Map<SkId<'line'>, typeof solved.segments>();
    for (const seg of solved.segments) {
      if (!segsByLine.has(seg.primaryLineId)) segsByLine.set(seg.primaryLineId, []);
      segsByLine.get(seg.primaryLineId)!.push(seg);
    }

    for (const [lid, segs] of segsByLine.entries()) {
      const line = lineById.get(lid);
      if (!line || segs.length === 0) continue;
      const sampleIndices = Array.from(
        new Set([
          Math.floor(segs.length * 0.2),
          Math.floor(segs.length * 0.5),
          Math.floor(segs.length * 0.8),
        ]),
      );
      const shortJa = line.names.ja?.split('（')[0] ?? line.id;
      const shortEn = line.names.en?.split(' (')[0] ?? shortJa;

      for (const idx of sampleIndices) {
        const seg = segs[idx];
        if (!seg || seg.points.length === 0) continue;
        const mid = seg.points[Math.floor(seg.points.length * 0.5)]!;
        const isUg = mid.y < -2.2;
        this.staticAnchors.push({
          id: `lbl-line-${lid}-${idx}`,
          kind: isUg ? 'tunnel' : 'line',
          textPrimaryJa: shortJa,
          textPrimaryEn: shortEn,
          badge: isUg ? mid.tier : line.stationCodePrefix ?? null,
          color: line.color,
          tier: mid.tier,
          isUnderground: isUg,
          isMajorHub: false,
          operatorId: line.operatorId,
          lineId: lid,
          entityKind: 'line',
          entityId: lid,
          priority: isUg ? 135 : 95,
          x: mid.x,
          baseY: mid.y + (isUg ? 5.5 : 8),
          z: mid.z,
        });
      }
    }

    // 4. Underground Transfer / Crossing Anchors (deduplicated per complex)
    const seenComplexCrossing = new Set<SkId<'complex'>>();
    for (const conn of solved.transferConnectors) {
      if (seenComplexCrossing.has(conn.complexId)) continue;
      if (conn.y1 >= -2 && conn.y2 >= -2) continue;
      seenComplexCrossing.add(conn.complexId);
      const comp = complexById.get(conn.complexId);
      const mx = (conn.x1 + conn.x2) * 0.5;
      const my = (conn.y1 + conn.y2) * 0.5;
      const mz = (conn.z1 + conn.z2) * 0.5;
      const gateJa =
        conn.gateType === 'in_gate'
          ? '改札内乗換'
          : conn.gateType === 'out_of_gate'
            ? '改札外乗換'
            : '地下連絡';
      const gateEn =
        conn.gateType === 'in_gate'
          ? 'In-Gate Transfer'
          : conn.gateType === 'out_of_gate'
            ? 'Out-of-Gate Transfer'
            : 'Transfer';

      this.staticAnchors.push({
        id: `lbl-xfer-${conn.complexId}`,
        kind: 'crossing',
        textPrimaryJa: `${comp?.names.ja?.replace('複合体', '') ?? '乗換'} · ${gateJa}`,
        textPrimaryEn: `${comp?.names.en?.replace(' Complex', '') ?? 'Hub'} · ${gateEn}`,
        isUnderground: true,
        isMajorHub: true,
        entityKind: 'station',
        entityId: conn.fromStationId,
        priority: 185,
        x: mx,
        baseY: my,
        z: mz,
      });
    }
  }

  setLandmarks(landmarks: readonly UrbanLandmarkRecord[]): void {
    this.landmarkAnchors.length = 0;
    for (const lm of landmarks) {
      this.landmarkAnchors.push({
        id: `lbl-lm-${lm.id}`,
        kind: 'hub',
        textPrimaryJa: lm.nameJa,
        textPrimaryEn: lm.nameEn,
        isUnderground: false,
        isMajorHub: true,
        entityKind: 'hub',
        entityId: lm.id,
        priority: 245,
        x: lm.x,
        baseY: lm.height + 10,
        z: lm.z,
      });
    }
  }

  computeVisibleLabels(params: {
    camera: THREE.PerspectiveCamera;
    mode: CameraModeId;
    locale: 'ja' | 'en';
    viewportWidth: number;
    viewportHeight: number;
    cameraDistanceM: number;
    verticalExaggeration: number;
    cutawayCenterX: number;
    cutawayCenterZ: number;
    cutawayRadiusM: number;
    visibleOperatorIds: Set<SkId<'operator'>>;
    selectedStationId: SkId<'station'> | null;
    selectedLineId: SkId<'line'> | null;
    selectedTrainId: string | null;
    trains: TrainSimulationState[];
    trainsVisible: boolean;
  }): PlacedMapLabel[] {
    const {
      camera,
      mode,
      locale,
      viewportWidth,
      viewportHeight,
      cameraDistanceM,
      verticalExaggeration,
      cutawayCenterX,
      cutawayCenterZ,
      cutawayRadiusM,
      visibleOperatorIds,
      selectedStationId,
      selectedLineId,
      selectedTrainId,
      trains,
      trainsVisible,
    } = params;

    if (viewportWidth <= 0 || viewportHeight <= 0) return [];

    const candidates: LabelCandidateInput[] = [];
    const camPos = camera.position;
    const halfW = viewportWidth * 0.5;
    const halfH = viewportHeight * 0.5;

    const projectAnchor = (
      ax: number,
      ay: number,
      az: number,
    ): { sx: number; sy: number; distM: number } | null => {
      this.tmpVec.set(ax, ay, az);
      const distM = camPos.distanceTo(this.tmpVec);
      this.tmpVec.project(camera);
      // Behind camera or beyond far clip
      if (this.tmpVec.z < -1 || this.tmpVec.z > 1) return null;
      return {
        sx: (this.tmpVec.x + 1) * halfW,
        sy: (1 - this.tmpVec.y) * halfH,
        distM,
      };
    };

    const allStatic = [...this.staticAnchors, ...this.landmarkAnchors];
    for (const a of allStatic) {
      if (a.operatorId && !visibleOperatorIds.has(a.operatorId)) continue;
      const worldY = a.baseY < 0 ? a.baseY * verticalExaggeration : a.baseY;
      const proj = projectAnchor(a.x, worldY, a.z);
      if (!proj) continue;

      const isSelected =
        (a.entityKind === 'station' && a.entityId === selectedStationId) ||
        (a.entityKind === 'line' && a.entityId === selectedLineId);

      candidates.push({
        id: a.id,
        kind: a.kind,
        textPrimary: locale === 'ja' ? a.textPrimaryJa : a.textPrimaryEn,
        textSecondary:
          locale === 'ja' ? a.textSecondaryJa : a.textSecondaryEn ?? a.textSecondaryJa,
        badge: a.badge ?? null,
        color: a.color ?? null,
        tier: a.tier ?? null,
        isUnderground: a.isUnderground,
        isMajorHub: a.isMajorHub,
        isSelected,
        lineId: a.lineId ?? null,
        entityKind: a.entityKind,
        entityId: a.entityId ?? null,
        priority: a.priority,
        screenX: proj.sx,
        screenY: proj.sy,
        distanceM: proj.distM,
        cutawayDistM: Math.hypot(a.x - cutawayCenterX, a.z - cutawayCenterZ),
      });
    }

    if (trainsVisible) {
      for (const tr of trains) {
        const wy = tr.position.y * verticalExaggeration + 6.5;
        const proj = projectAnchor(tr.position.x, wy, tr.position.z);
        if (!proj) continue;
        const isSel = tr.id === selectedTrainId;
        candidates.push({
          id: `lbl-tr-${tr.id}`,
          kind: 'train',
          textPrimary: tr.label,
          textSecondary: locale === 'ja' ? tr.nextStationJa ?? '' : tr.nextStationEn ?? '',
          badge: locale === 'ja' ? `模擬 ${tr.tier}` : `SIM ${tr.tier}`,
          color: tr.color,
          tier: tr.tier,
          isUnderground: tr.isUnderground,
          isSelected: isSel,
          lineId: tr.lineId,
          entityKind: 'train',
          entityId: tr.id,
          priority: isSel ? 420 : 175,
          screenX: proj.sx,
          screenY: proj.sy,
          distanceM: proj.distM,
          cutawayDistM: Math.hypot(
            tr.position.x - cutawayCenterX,
            tr.position.z - cutawayCenterZ,
          ),
        });
      }
    }

    return resolveLabelLayout(candidates, {
      mode,
      cameraDistanceM,
      viewportWidth,
      viewportHeight,
      cutawayRadiusM,
    });
  }
}
