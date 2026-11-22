/**
 * Pure TypeScript Hierarchical Screen-Space Map Label Layout & Deconfliction Engine.
 *
 * Solves dense overlapping 3D labels via:
 *  - 4 Context Tiers: City Overview -> Mid Distance -> Close/Street-Level -> Underground
 *  - Distance-based culling & per-line label deduplication
 *  - Priority sorting (Selected / Hovered > Hub/District > Crossing > Station > Line > Facility)
 *  - 2D bounding-box spatial collision avoidance + local cell density cap + HUD safe margins
 */

import type { SchematicTierId } from '../../domain/elevationSolver.js';
import type { CameraModeId } from './cameraModeStateMachine.js';

export type MapLabelKind =
  | 'district'
  | 'hub'
  | 'station'
  | 'line'
  | 'tunnel'
  | 'crossing'
  | 'facility'
  | 'train';

export type LabelZoomTier = 'overview' | 'mid' | 'close' | 'underground';

export interface LabelCandidateInput {
  id: string;
  kind: MapLabelKind;
  textPrimary: string;
  textSecondary?: string | null;
  badge?: string | null;
  color?: string | null;
  tier?: SchematicTierId | null;
  isUnderground: boolean;
  isMajorHub?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  lineId?: string | null;
  entityKind?: 'station' | 'line' | 'train' | 'hub';
  entityId?: string | null;
  priority: number;
  screenX: number;
  screenY: number;
  /** Distance from camera to 3D world anchor (meters) */
  distanceM: number;
  /** Optional world-to-cutaway-center distance for underground cutaway aperture filtering */
  cutawayDistM?: number;
}

export interface PlacedMapLabel extends LabelCandidateInput {
  boxX: number;
  boxY: number;
  width: number;
  height: number;
  opacity: number;
  highlighted: boolean;
  zoomTier: LabelZoomTier;
}

export interface LabelLayoutOptions {
  mode: CameraModeId;
  cameraDistanceM: number;
  viewportWidth: number;
  viewportHeight: number;
  cutawayRadiusM?: number;
  maxLabels?: number;
  safeMargins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  minGapPx?: number;
}

export function classifyZoomTier(mode: CameraModeId, cameraDistanceM: number): LabelZoomTier {
  if (mode === 'underground_cutaway' || mode === 'underground_explorer') {
    return 'underground';
  }
  if (mode === 'street_level' || cameraDistanceM < 680) {
    return 'close';
  }
  if (cameraDistanceM < 2350) {
    return 'mid';
  }
  return 'overview';
}

export function estimateLabelDimensions(candidate: LabelCandidateInput): {
  width: number;
  height: number;
} {
  const estimateCharsPx = (str: string | null | undefined, charW: number): number => {
    if (!str) return 0;
    let units = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      units += code > 0x2e80 ? 1.65 : 0.92;
    }
    return units * charW;
  };

  const primaryW = estimateCharsPx(candidate.textPrimary, 7.6);
  const badgeW = candidate.badge ? estimateCharsPx(candidate.badge, 6.6) + 12 : 0;
  const secondaryW = candidate.textSecondary
    ? estimateCharsPx(candidate.textSecondary, 6.4)
    : 0;

  const topRowW = primaryW + badgeW + (candidate.color ? 10 : 0);
  const contentW = Math.max(topRowW, secondaryW);
  const width = Math.max(46, Math.min(240, Math.round(contentW + 18)));
  const height = candidate.textSecondary ? 36 : 24;

  return { width, height };
}

export function isCandidateEligibleForTier(
  c: LabelCandidateInput,
  zoomTier: LabelZoomTier,
  mode: CameraModeId,
  cutawayRadiusM = 850,
): boolean {
  if (c.isSelected || c.isHovered) {
    return c.distanceM <= 24_000;
  }

  if (c.kind === 'train') {
    if (mode === 'underground_explorer') return c.isUnderground && c.distanceM < 1800;
    if (mode === 'underground_cutaway') {
      return (
        c.distanceM < 3200 &&
        (!c.isUnderground || (c.cutawayDistM ?? 0) <= cutawayRadiusM + 160)
      );
    }
    return !c.isUnderground && c.distanceM < 6500;
  }

  switch (zoomTier) {
    case 'overview': {
      if (c.isUnderground) return false;
      if (c.kind === 'district' || c.kind === 'hub') return c.distanceM < 22_000;
      if (c.kind === 'station' && c.isMajorHub) return c.distanceM < 12_000;
      return false;
    }

    case 'mid': {
      if (c.isUnderground) return false;
      if (c.kind === 'district' || c.kind === 'hub') return c.distanceM < 9000;
      if (c.kind === 'line') return c.distanceM < 5200;
      if (c.kind === 'station') {
        return c.isMajorHub ? c.distanceM < 5500 : c.distanceM < 2600;
      }
      return false;
    }

    case 'close': {
      if (c.isUnderground) return false;
      if (c.kind === 'facility') return c.distanceM < 620;
      if (c.kind === 'station') return c.distanceM < 1900;
      if (c.kind === 'line') return c.distanceM < 1600;
      if (c.kind === 'hub') return c.distanceM < 2200;
      if (c.kind === 'district') return c.distanceM >= 420 && c.distanceM < 4500;
      return false;
    }

    case 'underground': {
      if (mode === 'underground_explorer') {
        if (c.kind === 'tunnel' || c.kind === 'crossing') return c.distanceM < 1600;
        if (c.kind === 'station' && c.isUnderground) return c.distanceM < 1900;
        if (c.kind === 'hub') return c.distanceM < 1500;
        return false;
      }
      const inPit =
        c.cutawayDistM === undefined || c.cutawayDistM <= cutawayRadiusM + 180;
      if (c.kind === 'tunnel' || c.kind === 'crossing') {
        return inPit && c.distanceM < 4200;
      }
      if (c.kind === 'station') {
        if (c.isUnderground) return inPit && c.distanceM < 4200;
        return Boolean(c.isMajorHub) && inPit && c.distanceM < 3200;
      }
      if (c.kind === 'hub') {
        return c.distanceM < 6500;
      }
      if (c.kind === 'line' && c.isUnderground) {
        return inPit && c.distanceM < 3600;
      }
      return false;
    }
  }
}

function boxesOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap: number,
): boolean {
  return !(
    ax + aw + gap <= bx ||
    bx + bw + gap <= ax ||
    ay + ah + gap <= by ||
    by + bh + gap <= ay
  );
}

/**
 * Resolves hierarchical, collision-free screen-space labels.
 * Guarantees zero overlap between placed label rectangles and respects HUD safe margins.
 */
export function resolveLabelLayout(
  candidates: LabelCandidateInput[],
  options: LabelLayoutOptions,
): PlacedMapLabel[] {
  const {
    mode,
    cameraDistanceM,
    viewportWidth,
    viewportHeight,
    cutawayRadiusM = 850,
    maxLabels,
    minGapPx = 8,
    safeMargins,
  } = options;

  if (viewportWidth <= 0 || viewportHeight <= 0) return [];

  const margins = safeMargins ?? {
    top: 108,
    bottom: 84,
    left: viewportWidth > 860 ? 268 : 16,
    right: 16,
  };

  const zoomTier = classifyZoomTier(mode, cameraDistanceM);
  const cap =
    maxLabels ??
    (zoomTier === 'overview' ? 16 : zoomTier === 'mid' ? 22 : zoomTier === 'close' ? 26 : 24);

  const eligible: (LabelCandidateInput & {
    effectivePriority: number;
    width: number;
    height: number;
  })[] = [];

  for (const c of candidates) {
    if (!Number.isFinite(c.screenX) || !Number.isFinite(c.screenY)) continue;
    if (
      c.screenX < -80 ||
      c.screenX > viewportWidth + 80 ||
      c.screenY < -40 ||
      c.screenY > viewportHeight + 40
    ) {
      continue;
    }
    if (!isCandidateEligibleForTier(c, zoomTier, mode, cutawayRadiusM)) continue;

    const { width, height } = estimateLabelDimensions(c);
    const distBonus = Math.max(0, 120 - c.distanceM * 0.015);
    const effectivePriority =
      c.priority +
      (c.isSelected ? 10_000 : 0) +
      (c.isHovered ? 8_000 : 0) +
      (c.isUnderground && zoomTier === 'underground' ? 180 : 0) +
      distBonus;

    eligible.push({ ...c, effectivePriority, width, height });
  }

  eligible.sort((a, b) => b.effectivePriority - a.effectivePriority);

  const placed: PlacedMapLabel[] = [];
  const placedLineIds = new Set<string>();
  const cellCounts = new Map<string, number>();

  const minX = margins.left;
  const maxX = Math.max(minX + 120, viewportWidth - margins.right);
  const minY = margins.top;
  const maxY = Math.max(minY + 80, viewportHeight - margins.bottom);

  for (const item of eligible) {
    if (placed.length >= cap) break;

    const highlighted = Boolean(item.isSelected || item.isHovered);

    if ((item.kind === 'line' || item.kind === 'tunnel') && item.lineId && !highlighted) {
      if (placedLineIds.has(item.lineId)) continue;
    }

    const offsets: [number, number][] = [
      [-item.width * 0.5, -item.height - 8],
      [10, -item.height * 0.5],
      [-item.width - 10, -item.height * 0.5],
      [-item.width * 0.5, 10],
    ];

    let chosenBox: { x: number; y: number } | null = null;
    for (const [ox, oy] of offsets) {
      const bx = Math.round(item.screenX + ox);
      const by = Math.round(item.screenY + oy);

      if (bx < minX || bx + item.width > maxX || by < minY || by + item.height > maxY) {
        continue;
      }

      const cellKey = `${Math.floor((bx + item.width * 0.5) / 220)},${Math.floor(
        (by + item.height * 0.5) / 120,
      )}`;
      if (!highlighted && (cellCounts.get(cellKey) ?? 0) >= 2) {
        continue;
      }

      let collides = false;
      for (const p of placed) {
        if (
          boxesOverlap(bx, by, item.width, item.height, p.boxX, p.boxY, p.width, p.height, minGapPx)
        ) {
          collides = true;
          break;
        }
      }
      if (!collides) {
        chosenBox = { x: bx, y: by };
        cellCounts.set(cellKey, (cellCounts.get(cellKey) ?? 0) + 1);
        break;
      }
    }

    if (!chosenBox) continue;

    if ((item.kind === 'line' || item.kind === 'tunnel') && item.lineId) {
      placedLineIds.add(item.lineId);
    }

    const fadeStart = zoomTier === 'overview' ? 14_000 : zoomTier === 'mid' ? 4_200 : 1_500;
    const fadeEnd = zoomTier === 'overview' ? 22_000 : zoomTier === 'mid' ? 6_500 : 2_500;
    const opacity = highlighted
      ? 1.0
      : Math.max(
          0.62,
          Math.min(1.0, 1.0 - (item.distanceM - fadeStart) / Math.max(1, fadeEnd - fadeStart)),
        );

    placed.push({
      ...item,
      boxX: chosenBox.x,
      boxY: chosenBox.y,
      width: item.width,
      height: item.height,
      opacity: Math.round(opacity * 100) / 100,
      highlighted,
      zoomTier,
    });
  }

  return placed;
}
