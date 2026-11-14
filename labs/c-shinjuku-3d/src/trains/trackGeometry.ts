/**
 * Where a track lies beside its platform, in the schematic plan. Shared by
 * the platform builder (which draws the track bed) and the train simulation
 * (which puts trains on it), so that the two cannot drift apart.
 */
import type { Platform, PlanRect } from '../domain/types';

export const TRACK_W = 0.62;
export const TRACK_GAP = 0.04;
/** How far the drawn track continues past each end of the platform. */
export const TRACK_STUB = 1.6;

export type TrackSide = NonNullable<Platform['tracks'][number]['side']>;

export interface PlatformEdge {
  /** Long axis of the platform: the axis trains move along. */
  axis: 'x' | 'z';
  /** Coordinate of the platform edge across that axis. */
  at: number;
  /** +1 / -1: the side of the edge the track is on. */
  out: 1 | -1;
  lo: number;
  hi: number;
}

export function edgeOf(r: PlanRect, side: TrackSide): PlatformEdge {
  switch (side) {
    case 'z-':
      return { axis: 'x', at: r.z0, out: -1, lo: r.x0, hi: r.x1 };
    case 'z+':
      return { axis: 'x', at: r.z1, out: 1, lo: r.x0, hi: r.x1 };
    case 'x-':
      return { axis: 'z', at: r.x0, out: -1, lo: r.z0, hi: r.z1 };
    case 'x+':
      return { axis: 'z', at: r.x1, out: 1, lo: r.z0, hi: r.z1 };
  }
}

export interface TrackLine {
  axis: 'x' | 'z';
  /** Centre line of the track, across the axis. */
  centre: number;
  /** +1 / -1: the side of the track the platform is on (where the doors open). */
  platformSide: 1 | -1;
  /** Extent of the platform along the axis. */
  lo: number;
  hi: number;
  /** Extent of the drawn track: a train is only visible between these. */
  clipLo: number;
  clipHi: number;
  levelId: string;
}

/**
 * One pair of rails. Some tracks have a platform on each side (Odakyu's
 * boarding and alighting platforms): the two platform numbers are then two
 * faces of the same track, and share this key.
 */
export function physicalTrackKey(line: TrackLine): string {
  return `${line.levelId}|${line.axis}|${line.centre.toFixed(2)}`;
}

/** The track with this number beside a platform, or null when its side was not recorded. */
export function trackLine(platform: Platform, trackNumber: string): TrackLine | null {
  const track = platform.tracks.find((t) => t.number === trackNumber);
  const rect = platform.footprint[0];
  if (!track?.side || !rect) return null;
  const e = edgeOf(rect, track.side);
  return {
    axis: e.axis,
    centre: e.at + e.out * (TRACK_GAP + TRACK_W / 2),
    platformSide: e.out === 1 ? -1 : 1,
    lo: e.lo,
    hi: e.hi,
    clipLo: e.lo - TRACK_STUB,
    clipHi: e.hi + TRACK_STUB,
    levelId: platform.levelId,
  };
}
