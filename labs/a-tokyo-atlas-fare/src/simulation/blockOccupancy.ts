/**
 * SENKIRO Atlas v2 — Simplified Railway Block Occupancy & Safe Headway Controller.
 *
 * Ensures deterministic multi-train safety without requiring a full interlocking signal simulator:
 *  1. Tracks discrete `TrackBlockSection` occupancy keyed by `physicalTrackKey`
 *     (shared across directions on single-track lines, separated by direction on double-track lines).
 *  2. Enforces continuous nose-to-tail minimum safe separation (`minSafeSeparationM`)
 *     between trains on the same route (including wrap-around on closed `loop` routes).
 *  3. Prevents train spawning or terminal turnaround onto an already-occupied platform block.
 */

import type { RunnableTrackRoute, TrackBlockSection } from './types.js';

export interface ActiveTrainFootprint {
  readonly trainId: string;
  readonly route: RunnableTrackRoute;
  /** Monotonic or loop-normalized leading nose arc-length (meters) */
  readonly headArcLengthM: number;
  /** Trailing coupler arc-length (`headArcLengthM - consistLengthM`) */
  readonly tailArcLengthM: number;
  readonly consistLengthM: number;
  readonly isTerminated: boolean;
}

export interface AheadClearanceResult {
  /**
   * Maximum distance (meters) the train's leading nose may advance before it must stop
   * to avoid entering an occupied block or violating `minSafeSeparationM`.
   * `null` if the track ahead is completely clear.
   */
  readonly clearanceAheadM: number | null;
  /** Actual raw nose-to-tail distance (meters) to the closest train ahead, or `null` */
  readonly rawDistanceToTrainAheadM: number | null;
  /** ID of the train ahead causing the restriction, or `null` */
  readonly blockedByTrainId: string | null;
  /** IDs of the discrete `TrackBlockSection`s currently occupied by this train */
  readonly occupiedBlockIds: readonly string[];
}

/**
 * Checks whether two 1D intervals `[a0, a1]` and `[b0, b1]` overlap.
 */
function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.max(a0, b0) <= Math.min(a1, b1);
}

/**
 * Computes which `TrackBlockSection`s along `route` are overlapped by the train span
 * `[tailArcLengthM, headArcLengthM]`. Handles loop wrap-around when `route.isLoop` is true.
 */
export function getOccupiedBlocksForSpan(
  route: RunnableTrackRoute,
  tailArcLengthM: number,
  headArcLengthM: number,
): TrackBlockSection[] {
  const L = route.totalLengthM;
  if (route.blocks.length === 0 || L <= 0) return [];

  const clampedHead = route.isLoop
    ? ((headArcLengthM % L) + L) % L
    : Math.max(0, Math.min(L, headArcLengthM));
  const spanLen = Math.max(1, headArcLengthM - tailArcLengthM);

  const ranges: [number, number][] = [];
  if (route.isLoop) {
    const rawTail = clampedHead - spanLen;
    if (rawTail >= 0) {
      ranges.push([rawTail, clampedHead]);
    } else {
      ranges.push([0, clampedHead]);
      ranges.push([Math.max(0, L + rawTail), L]);
    }
  } else {
    const lo = Math.max(0, Math.min(L, tailArcLengthM));
    const hi = Math.max(lo, Math.min(L, headArcLengthM));
    ranges.push([lo, hi]);
  }

  const occupied: TrackBlockSection[] = [];
  for (const blk of route.blocks) {
    for (const [r0, r1] of ranges) {
      if (intervalsOverlap(blk.startArcLengthM, blk.endArcLengthM, r0, r1)) {
        occupied.push(blk);
        break;
      }
    }
  }
  return occupied;
}

export class BlockOccupancyController {
  private minSafeSeparationM: number;
  /** Map of physicalTrackKey -> occupying trainId */
  private readonly physicalKeyOwner = new Map<string, string>();
  /** Map of route blockId -> occupying trainId */
  private readonly blockIdOwner = new Map<string, string>();
  /** Map of trainId -> occupied TrackBlockSections */
  private readonly trainBlocks = new Map<string, TrackBlockSection[]>();

  constructor(minSafeSeparationM = 80) {
    this.minSafeSeparationM = Math.max(15, minSafeSeparationM);
  }

  setMinSafeSeparationM(minSafeSeparationM: number): void {
    this.minSafeSeparationM = Math.max(15, minSafeSeparationM);
  }

  getMinSafeSeparationM(): number {
    return this.minSafeSeparationM;
  }

  /**
   * Rebuilds the complete block occupancy table deterministically from all active trains.
   */
  rebuildOccupancies(trains: readonly ActiveTrainFootprint[]): void {
    this.physicalKeyOwner.clear();
    this.blockIdOwner.clear();
    this.trainBlocks.clear();

    for (const t of trains) {
      if (t.isTerminated) continue;
      const blocks = getOccupiedBlocksForSpan(t.route, t.tailArcLengthM, t.headArcLengthM);
      this.trainBlocks.set(t.trainId, blocks);
      for (const blk of blocks) {
        if (!this.physicalKeyOwner.has(blk.physicalTrackKey)) {
          this.physicalKeyOwner.set(blk.physicalTrackKey, t.trainId);
        }
        if (!this.blockIdOwner.has(blk.blockId)) {
          this.blockIdOwner.set(blk.blockId, t.trainId);
        }
      }
    }
  }

  /**
   * Returns a snapshot dictionary of `{ [blockId]: trainId }` for telemetry and scene output.
   */
  getActiveBlockOccupancyRecord(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [blkId, trainId] of this.blockIdOwner.entries()) {
      out[blkId] = trainId;
    }
    return out;
  }

  /**
   * Checks whether a candidate train footprint `[tailS, headS]` on `route` can be safely
   * acquired by `trainId` without colliding with any other active train.
   */
  canAcquireSpan(
    trainId: string,
    route: RunnableTrackRoute,
    tailArcLengthM: number,
    headArcLengthM: number,
    allTrains: readonly ActiveTrainFootprint[],
  ): { allowed: boolean; conflictingTrainId: string | null } {
    const candidateBlocks = getOccupiedBlocksForSpan(route, tailArcLengthM, headArcLengthM);
    for (const blk of candidateBlocks) {
      const owner = this.physicalKeyOwner.get(blk.physicalTrackKey);
      if (owner && owner !== trainId) {
        return { allowed: false, conflictingTrainId: owner };
      }
    }

    // Also verify direct distance separation on the same route
    const L = route.totalLengthM;
    for (const other of allTrains) {
      if (other.trainId === trainId || other.isTerminated) continue;
      if (other.route.routeId !== route.routeId) continue;

      if (route.isLoop && L > 0) {
        const myHead = ((headArcLengthM % L) + L) % L;
        const otherHead = ((other.headArcLengthM % L) + L) % L;
        const fwdDist = ((otherHead - myHead) % L + L) % L;
        const bwdDist = ((myHead - otherHead) % L + L) % L;
        if (
          fwdDist < other.consistLengthM + this.minSafeSeparationM ||
          bwdDist < (headArcLengthM - tailArcLengthM) + this.minSafeSeparationM
        ) {
          return { allowed: false, conflictingTrainId: other.trainId };
        }
      } else {
        const pad = this.minSafeSeparationM;
        if (
          intervalsOverlap(
            tailArcLengthM - pad,
            headArcLengthM + pad,
            other.tailArcLengthM,
            other.headArcLengthM,
          )
        ) {
          return { allowed: false, conflictingTrainId: other.trainId };
        }
      }
    }

    return { allowed: true, conflictingTrainId: null };
  }

  /**
   * Computes the forward safe stopping clearance ahead of `train` considering both:
   *  1. Preceding trains on the same route (continuous nose-to-tail distance - `minSafeSeparationM`).
   *  2. Discrete `TrackBlockSection`s ahead occupied by any other train (including opposing
   *     trains on single-track segments or shared track corridors).
   */
  computeAheadClearance(
    train: ActiveTrainFootprint,
    allTrains: readonly ActiveTrainFootprint[],
  ): AheadClearanceResult {
    const occupiedBlocks = this.trainBlocks.get(train.trainId) ?? [];
    const occupiedBlockIds = occupiedBlocks.map((b) => b.blockId);

    const route = train.route;
    const L = route.totalLengthM;
    if (L <= 0) {
      return {
        clearanceAheadM: null,
        rawDistanceToTrainAheadM: null,
        blockedByTrainId: null,
        occupiedBlockIds,
      };
    }

    let bestClearanceM: number | null = null;
    let bestRawDistM: number | null = null;
    let blockingTrainId: string | null = null;

    // 1. Continuous same-route preceding train separation check
    const myHead = route.isLoop
      ? ((train.headArcLengthM % L) + L) % L
      : train.headArcLengthM;

    for (const other of allTrains) {
      if (other.trainId === train.trainId || other.isTerminated) continue;
      if (other.route.routeId !== route.routeId) continue;

      let noseToTailM: number | null = null;
      if (route.isLoop) {
        const otherHead = ((other.headArcLengthM % L) + L) % L;
        const fwdHeadDist = ((otherHead - myHead) % L + L) % L;
        if (fwdHeadDist > 1e-3) {
          noseToTailM = fwdHeadDist - other.consistLengthM;
        }
      } else {
        if (other.headArcLengthM > train.headArcLengthM) {
          noseToTailM = other.tailArcLengthM - train.headArcLengthM;
        }
      }

      if (noseToTailM !== null) {
        const allowedMoveM = Math.max(0, noseToTailM - this.minSafeSeparationM);
        if (bestClearanceM === null || allowedMoveM < bestClearanceM) {
          bestClearanceM = allowedMoveM;
          bestRawDistM = Math.max(0, noseToTailM);
          blockingTrainId = other.trainId;
        }
      }
    }

    // 2. Discrete physical block occupancy scan ahead along the route
    // (catches cross-route shared physical tracks and single-track opposing occupancy)
    const BLOCK_SIGNAL_BUFFER_M = 10.0;
    for (const blk of route.blocks) {
      const owner = this.physicalKeyOwner.get(blk.physicalTrackKey);
      if (!owner || owner === train.trainId) continue;

      let distToBlockEntryM: number | null = null;
      if (route.isLoop) {
        if (blk.startArcLengthM >= myHead) {
          distToBlockEntryM = blk.startArcLengthM - myHead;
        } else if (blk.endArcLengthM < myHead) {
          distToBlockEntryM = L - myHead + blk.startArcLengthM;
        }
      } else {
        if (blk.startArcLengthM >= train.headArcLengthM - 1.0) {
          distToBlockEntryM = Math.max(0, blk.startArcLengthM - train.headArcLengthM);
        }
      }

      if (distToBlockEntryM !== null) {
        const allowedMoveM = Math.max(0, distToBlockEntryM - BLOCK_SIGNAL_BUFFER_M);
        if (bestClearanceM === null || allowedMoveM < bestClearanceM) {
          bestClearanceM = allowedMoveM;
          if (bestRawDistM === null || distToBlockEntryM < bestRawDistM) {
            bestRawDistM = distToBlockEntryM;
          }
          blockingTrainId = owner;
        }
      }
    }

    return {
      clearanceAheadM: bestClearanceM,
      rawDistanceToTrainAheadM: bestRawDistM,
      blockedByTrainId: blockingTrainId,
      occupiedBlockIds,
    };
  }
}
