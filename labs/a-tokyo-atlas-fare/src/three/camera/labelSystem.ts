/**
 * SENKIRO Atlas v2 — 3D-to-Screen Label Projection & Multi-Tier Anchor Registry.
 *
 * Consumes `AtlasDataset`, `SolvedRailwayNetwork3D`, landmark anchors, and
 * Session 0's `SimulatedTrainState[]` to project visible anchors into screen space
 * and delegate deconfliction to `resolveLabelLayout()`.
 */

import * as THREE from 'three';
import type { SimulatedTrainState } from '../../contracts/atlasV2.js';
import type { SolvedRailwayNetwork3D } from '../../domain/elevationSolver.js';
import type { AtlasDataset, SkId } from '../../domain/types.js';
import { pickLocale, type Locale } from '../../ui/i18n.js';
import { lonLatToWorld } from '../geoProjection.js';
import type { UrbanLandmarkRecord } from '../types.js';
import type { CameraModeId } from './cameraModeStateMachine.js';
import {
  resolveLabelLayout,
  type LabelCandidateInput,
  type MapLabelKind,
  type PlacedMapLabel,
  type StationLineBadge,
} from './labelLayout.js';

interface StationLineEntry {
  lineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  stationId: SkId<'station'>;
  codeJa: string;
  codeEn: string;
  nameJa: string;
  nameZh: string;
  nameEn: string;
  color: string;
  isSubway: boolean;
  isShinkansen: boolean;
  sortOrder: number;
  tier: LabelCandidateInput['tier'];
}

interface WorldLabelAnchor {
  id: string;
  kind: MapLabelKind;
  textPrimaryJa: string;
  textPrimaryZh: string;
  textPrimaryEn: string;
  textSecondaryJa?: string;
  textSecondaryZh?: string;
  textSecondaryEn?: string;
  badge?: string | null;
  color?: string | null;
  tier?: LabelCandidateInput['tier'];
  isUnderground: boolean;
  hasUnderground?: boolean;
  isMajorHub: boolean;
  operatorId?: SkId<'operator'> | null;
  allOperatorIds?: Set<SkId<'operator'>>;
  allStationIds?: Set<SkId<'station'>>;
  allLineIds?: Set<SkId<'line'>>;
  stationLines?: StationLineEntry[];
  lineId?: SkId<'line'> | null;
  entityKind?: LabelCandidateInput['entityKind'];
  entityId?: string | null;
  priority: number;
  x: number;
  baseY: number;
  z: number;
}

function resolveLineBadgeCode(
  line: { id: string; stationCodePrefix: string | null; lineClass: string; names: { ja?: string | null } } | undefined,
): { ja: string; en: string } {
  if (!line) return { ja: '線', en: 'L' };
  if (line.stationCodePrefix) {
    return { ja: line.stationCodePrefix, en: line.stationCodePrefix };
  }
  if (line.lineClass === 'shinkansen') {
    return { ja: '新', en: 'SHK' };
  }
  if (line.id.includes('hachiko')) {
    return { ja: '八', en: 'HC' };
  }
  const jaHead = (line.names.ja ?? '').replace(/線.*/, '').slice(0, 2);
  return { ja: jaHead || '線', en: 'RL' };
}

function normalizeStationGroupName(name: string): string {
  return name.replace(/[（(].*?[）)]/g, '').replace(/駅$/, '').trim();
}

const TOKYO_DISTRICT_ANCHORS: {
  id: string;
  ja: string;
  zh: string;
  en: string;
  lon: number;
  lat: number;
  priority: number;
}[] = [
  { id: 'dist-shinjuku', ja: '新宿エリア', zh: '新宿区域', en: 'Shinjuku', lon: 139.7004, lat: 35.6896, priority: 340 },
  { id: 'dist-shibuya', ja: '渋谷エリア', zh: '涩谷区域', en: 'Shibuya', lon: 139.7016, lat: 35.658, priority: 335 },
  { id: 'dist-tokyo', ja: '東京・丸の内', zh: '东京・丸之内', en: 'Tokyo / Marunouchi', lon: 139.7662, lat: 35.6826, priority: 350 },
  { id: 'dist-shinagawa', ja: '品川・高輪', zh: '品川・高轮', en: 'Shinagawa', lon: 139.739, lat: 35.6285, priority: 320 },
  { id: 'dist-ikebukuro', ja: '池袋エリア', zh: '池袋区域', en: 'Ikebukuro', lon: 139.7109, lat: 35.7295, priority: 318 },
  { id: 'dist-ueno', ja: '上野・御徒町', zh: '上野・御徒町', en: 'Ueno', lon: 139.7772, lat: 35.7138, priority: 300 },
  { id: 'dist-roppongi', ja: '六本木・赤坂', zh: '六本木・赤坂', en: 'Roppongi', lon: 139.731, lat: 35.6628, priority: 280 },
  { id: 'dist-ginza', ja: '銀座・日比谷', zh: '银座・日比谷', en: 'Ginza / Hibiya', lon: 139.765, lat: 35.6717, priority: 290 },
  { id: 'dist-oshiage', ja: '押上・スカイツリー', zh: '押上・晴空塔', en: 'Oshiage / Skytree', lon: 139.8107, lat: 35.7101, priority: 285 },
];

export class SpatialLabelRegistry {
  private readonly staticAnchors: WorldLabelAnchor[] = [];
  private readonly landmarkAnchors: WorldLabelAnchor[] = [];
  private readonly stationNamesById = new Map<SkId<'station'>, { ja: string; zh: string; en: string }>();
  private readonly lineNamesById = new Map<SkId<'line'>, { ja: string; zh: string; en: string }>();
  private readonly tmpVec = new THREE.Vector3();

  constructor(dataset: AtlasDataset, solved: SolvedRailwayNetwork3D) {
    const lineById = new Map(dataset.railLines.map((l) => [l.id, l]));
    const complexById = new Map(dataset.stationComplexes.map((c) => [c.id, c]));

    for (const s of dataset.stations) {
      this.stationNamesById.set(s.id, {
        ja: s.names.ja ?? s.id,
        zh: s.names.zh ?? s.names.ja ?? s.id,
        en: s.names.en ?? s.names.ja ?? s.id,
      });
    }
    for (const l of dataset.railLines) {
      this.lineNamesById.set(l.id, {
        ja: l.names.ja?.split('（')[0] ?? l.id,
        zh: l.names.zh?.split('（')[0] ?? l.names.ja?.split('（')[0] ?? l.id,
        en: l.names.en?.split(' (')[0] ?? l.names.ja ?? l.id,
      });
    }

    for (const d of TOKYO_DISTRICT_ANCHORS) {
      const { x, z } = lonLatToWorld(d.lon, d.lat);
      this.staticAnchors.push({
        id: d.id,
        kind: 'district',
        textPrimaryJa: d.ja,
        textPrimaryZh: d.zh,
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

    const stationById = new Map(dataset.stations.map((s) => [s.id, s]));

    // Aggregate all co-located station nodes (same stationComplexId OR same station name within 420m)
    // into a single unified hub anchor displaying the station name ONCE with ALL serving line badges
    // (surface JR/Shinkansen/private + underground Tokyo Metro/Toei subways).
    interface StationGroupAccum {
      key: string;
      normName: string;
      nameJa: string;
      nameZh: string;
      nameEn: string;
      primaryStationId: SkId<'station'>;
      primaryColor: string;
      primaryTier: LabelCandidateInput['tier'];
      isMajorHub: boolean;
      hasSurface: boolean;
      hasUnderground: boolean;
      surfaceSumX: number;
      surfaceSumY: number;
      surfaceSumZ: number;
      surfaceCount: number;
      allSumX: number;
      allSumY: number;
      allSumZ: number;
      allCount: number;
      allOperatorIds: Set<SkId<'operator'>>;
      allStationIds: Set<SkId<'station'>>;
      allLineIds: Set<SkId<'line'>>;
      linesById: Map<SkId<'line'>, StationLineEntry>;
    }

    const groups: StationGroupAccum[] = [];
    const groupByComplex = new Map<SkId<'complex'>, StationGroupAccum>();
    const seenFacilityCells = new Set<string>();

    for (const node of solved.stationNodes) {
      const st = stationById.get(node.stationId);
      const complexId = st?.stationComplexId ?? null;
      const normName = normalizeStationGroupName(node.nameJa);
      const isUg = node.y < -2.2;
      const line = lineById.get(node.lineId);
      const isSubway = line?.lineClass === 'metro' || isUg;
      const isShinkansen = line?.lineClass === 'shinkansen';

      let grp: StationGroupAccum | undefined;
      if (complexId) {
        grp = groupByComplex.get(complexId);
      }
      if (!grp) {
        grp = groups.find(
          (g) =>
            g.normName === normName &&
            Math.hypot(g.allSumX / g.allCount - node.x, g.allSumZ / g.allCount - node.z) <= 420,
        );
      }
      if (!grp) {
        const stZh = this.stationNamesById.get(node.stationId)?.zh ?? node.nameJa;
        grp = {
          key: complexId ?? `${normName}-${Math.round(node.x / 100)}-${Math.round(node.z / 100)}`,
          normName,
          nameJa: node.nameJa,
          nameZh: stZh,
          nameEn: node.nameEn ?? node.nameJa,
          primaryStationId: node.stationId,
          primaryColor: node.color,
          primaryTier: node.tier,
          isMajorHub: node.isMajorHub,
          hasSurface: !isUg,
          hasUnderground: isUg,
          surfaceSumX: 0,
          surfaceSumY: 0,
          surfaceSumZ: 0,
          surfaceCount: 0,
          allSumX: 0,
          allSumY: 0,
          allSumZ: 0,
          allCount: 0,
          allOperatorIds: new Set(),
          allStationIds: new Set(),
          allLineIds: new Set(),
          linesById: new Map(),
        };
        groups.push(grp);
        if (complexId) groupByComplex.set(complexId, grp);
      } else if (complexId && !groupByComplex.has(complexId)) {
        groupByComplex.set(complexId, grp);
      }

      grp.allSumX += node.x;
      grp.allSumY += node.y;
      grp.allSumZ += node.z;
      grp.allCount += 1;
      if (!isUg) {
        grp.hasSurface = true;
        grp.surfaceSumX += node.x;
        grp.surfaceSumY += node.y;
        grp.surfaceSumZ += node.z;
        grp.surfaceCount += 1;
        // Prefer surface JR / major hub station as primary click target & border accent
        if (line?.lineClass === 'trunk' || !grp.allStationIds.size) {
          grp.primaryStationId = node.stationId;
          grp.primaryColor = node.color;
        }
      } else {
        grp.hasUnderground = true;
      }
      if (node.isMajorHub) grp.isMajorHub = true;

      grp.allOperatorIds.add(node.operatorId);
      grp.allStationIds.add(node.stationId);
      grp.allLineIds.add(node.lineId);

      if (!grp.linesById.has(node.lineId)) {
        const lineShortJa = line?.names.ja?.split('（')[0] ?? '';
        const lineShortZh = line?.names.zh?.split('（')[0] ?? lineShortJa;
        const lineShortEn = line?.names.en?.split(' (')[0] ?? lineShortJa;
        const codes = resolveLineBadgeCode(line);
        const sortOrder = isShinkansen ? 0 : line?.lineClass === 'trunk' ? 1 : !isSubway ? 2 : 3;
        grp.linesById.set(node.lineId, {
          lineId: node.lineId,
          operatorId: node.operatorId,
          stationId: node.stationId,
          codeJa: codes.ja,
          codeEn: codes.en,
          nameJa: lineShortJa,
          nameZh: lineShortZh,
          nameEn: lineShortEn,
          color: line?.color ?? node.color,
          isSubway,
          isShinkansen,
          sortOrder,
          tier: node.tier,
        });
      }

      if (isUg) {
        const fKey = `${Math.round(node.x / 65)},${Math.round(node.z / 65)}`;
        if (!seenFacilityCells.has(fKey)) {
          seenFacilityCells.add(fKey);
          const stationNameZh = this.stationNamesById.get(node.stationId)?.zh ?? node.nameJa;
          this.staticAnchors.push({
            id: `lbl-fac-${node.stationId}`,
            kind: 'facility',
            textPrimaryJa: `${node.nameJa} 地下鉄出入口`,
            textPrimaryZh: `${stationNameZh} 地铁出入口`,
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

    for (const grp of groups) {
      const stationLines = Array.from(grp.linesById.values()).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.codeEn.localeCompare(b.codeEn);
      });
      const onlyUnderground = grp.hasUnderground && !grp.hasSurface;
      const ax = grp.surfaceCount > 0 ? grp.surfaceSumX / grp.surfaceCount : grp.allSumX / grp.allCount;
      const ay = grp.surfaceCount > 0 ? grp.surfaceSumY / grp.surfaceCount : grp.allSumY / grp.allCount;
      const az = grp.surfaceCount > 0 ? grp.surfaceSumZ / grp.surfaceCount : grp.allSumZ / grp.allCount;

      const lineBonus = Math.min(45, (stationLines.length - 1) * 8);
      this.staticAnchors.push({
        id: `lbl-st-${grp.primaryStationId}`,
        kind: 'station',
        textPrimaryJa: grp.nameJa,
        textPrimaryZh: grp.nameZh,
        textPrimaryEn: grp.nameEn,
        color: grp.primaryColor,
        tier: grp.primaryTier,
        isUnderground: onlyUnderground,
        hasUnderground: grp.hasUnderground,
        isMajorHub: grp.isMajorHub || stationLines.length >= 3,
        allOperatorIds: grp.allOperatorIds,
        allStationIds: grp.allStationIds,
        allLineIds: grp.allLineIds,
        stationLines,
        entityKind: 'station',
        entityId: grp.primaryStationId,
        priority: (grp.isMajorHub ? 230 : onlyUnderground ? 155 : 125) + lineBonus,
        x: ax,
        baseY: ay + (onlyUnderground ? 4.5 : 8.5),
        z: az,
      });
    }

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
      const shortZh = line.names.zh?.split('（')[0] ?? shortJa;
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
          textPrimaryZh: shortZh,
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
      const gateZh =
        conn.gateType === 'in_gate'
          ? '站内换乘'
          : conn.gateType === 'out_of_gate'
            ? '出站换乘'
            : '地下通道';
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
        textPrimaryZh: `${comp?.names.zh?.replace('复合体', '') ?? comp?.names.ja?.replace('複合体', '') ?? '换乘'} · ${gateZh}`,
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
        textPrimaryZh: lm.nameJa,
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
    locale: Locale;
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
    trains: readonly SimulatedTrainState[];
    trainsVisible: boolean;
    hasRightInspector?: boolean;
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
      hasRightInspector = false,
    } = params;

    if (viewportWidth <= 0 || viewportHeight <= 0) return [];

    camera.updateMatrixWorld();
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
      if (this.tmpVec.z < -1 || this.tmpVec.z > 1) return null;
      return {
        sx: (this.tmpVec.x + 1) * halfW,
        sy: (1 - this.tmpVec.y) * halfH,
        distM,
      };
    };

    const allStatic = [...this.staticAnchors, ...this.landmarkAnchors];
    const isUgMode = mode === 'underground_cutaway' || mode === 'underground_explorer';
    for (const a of allStatic) {
      let lineBadges: StationLineBadge[] | undefined;
      if (a.stationLines && a.stationLines.length > 0) {
        const visibleLines = a.stationLines.filter((sl) => visibleOperatorIds.has(sl.operatorId));
        if (visibleLines.length === 0) continue;
        // Deduplicate visually identical prefix+color icons (e.g., dual-branch same code) while keeping distinct lines
        const seenIconKey = new Set<string>();
        lineBadges = [];
        for (const sl of visibleLines) {
          const code = locale === 'en' ? sl.codeEn : sl.codeJa;
          const iconKey = `${code}::${sl.color.toLowerCase()}::${sl.isSubway ? 'u' : 's'}`;
          if (seenIconKey.has(iconKey)) continue;
          seenIconKey.add(iconKey);
          lineBadges.push({
            lineId: sl.lineId,
            code,
            label: pickLocale(locale, sl.nameJa, sl.nameZh, sl.nameEn),
            color: sl.color,
            isSubway: sl.isSubway,
            tier: sl.tier ?? null,
            stationId: sl.stationId,
          });
        }
      } else if (a.operatorId && !visibleOperatorIds.has(a.operatorId)) {
        continue;
      }

      const worldY = a.baseY < 0 ? a.baseY * verticalExaggeration : a.baseY;
      const proj = projectAnchor(a.x, worldY, a.z);
      if (!proj) continue;

      const isSelected =
        (a.entityKind === 'station' &&
          (a.entityId === selectedStationId || Boolean(selectedStationId && a.allStationIds?.has(selectedStationId)))) ||
        (a.entityKind === 'line' && a.entityId === selectedLineId);

      // In underground view, treat mixed surface+underground hubs as underground-eligible too
      const effectiveIsUg = a.isUnderground || (isUgMode && Boolean(a.hasUnderground));

      candidates.push({
        id: a.id,
        kind: a.kind,
        textPrimary: pickLocale(locale, a.textPrimaryJa, a.textPrimaryZh, a.textPrimaryEn),
        textSecondary: lineBadges
          ? null
          : pickLocale(
              locale,
              a.textSecondaryJa,
              a.textSecondaryZh ?? a.textSecondaryJa,
              a.textSecondaryEn ?? a.textSecondaryJa,
            ),
        badge: lineBadges ? null : a.badge ?? null,
        color: a.color ?? null,
        lineBadges,
        tier: a.tier ?? null,
        isUnderground: effectiveIsUg,
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
        // Session 0 SimulatedTrainState.headPose.y already incorporates verticalExaggeration!
        const wy = tr.headPose.y + 6.5;
        const proj = projectAnchor(tr.headPose.x, wy, tr.headPose.z);
        if (!proj) continue;

        const isSel = tr.trainId === selectedTrainId;
        const lineName = this.lineNamesById.get(tr.lineId);
        const nextSt = this.stationNamesById.get(tr.nextStationId);
        const lineText = pickLocale(
          locale,
          lineName?.ja ?? tr.lineId,
          lineName?.zh ?? tr.lineId,
          lineName?.en ?? tr.lineId,
        );
        const nextText = nextSt
          ? pickLocale(
              locale,
              `次: ${nextSt.ja}`,
              `下一站: ${nextSt.zh}`,
              `Next: ${nextSt.en}`,
            )
          : '';
        const speedText =
          locale === 'zh' && tr.phase === 'dwelling'
            ? '停站'
            : `${Math.round(tr.speedKmh)} km/h`;

        candidates.push({
          id: `lbl-tr-${tr.trainId}`,
          kind: 'train',
          textPrimary: `${lineText} ${tr.runNumber}`,
          textSecondary: `${nextText} · ${speedText}`,
          badge: pickLocale(locale, `模擬 ${tr.tier}`, `模拟 ${tr.tier}`, `SIM ${tr.tier}`),
          color: tr.lineColor,
          tier: tr.tier,
          isUnderground: tr.isUnderground,
          isSelected: isSel,
          lineId: tr.lineId,
          entityKind: 'train',
          entityId: tr.trainId,
          priority: isSel ? 420 : 175,
          screenX: proj.sx,
          screenY: proj.sy,
          distanceM: proj.distM,
          cutawayDistM: Math.hypot(
            tr.headPose.x - cutawayCenterX,
            tr.headPose.z - cutawayCenterZ,
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
      safeMargins: {
        top: 108,
        bottom: 84,
        left: viewportWidth > 860 ? 268 : 16,
        right: hasRightInspector && viewportWidth > 920 ? 306 : 16,
      },
    });
  }
}
