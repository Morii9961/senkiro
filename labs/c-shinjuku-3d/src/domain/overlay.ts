/**
 * Operations overlay — the contract between "something that knows how trains
 * are running" and the station model.
 *
 * It ties a line's running status, delays and departures to the platform
 * tracks of the StationModel. Every snapshot says where it came from and when,
 * and whether it is real: there is no code path that turns a synthetic
 * snapshot into something that looks live.
 */
import type { DataNature, PlatformTrack, StationModel } from './types';

export type RunningStatus = 'normal' | 'delayed' | 'suspended' | 'partial-suspension' | 'unknown';

export interface LineStatus {
  railLineId: string;
  status: RunningStatus;
  /** null when the source gives no figure. Never estimated. */
  delayMinutes: number | null;
  messageJa: string | null;
  messageEn: string | null;
  /** When the operator says this status was valid. */
  observedAt: string | null;
}

export interface TrackDeparture {
  /** Area id of the platform island. */
  platformId: string;
  /** Track number as printed, e.g. "14". */
  trackNumber: string;
  railLineId: string;
  /** Local time "HH:MM" from the timetable. */
  scheduledTime: string;
  /** Only when the source publishes a prediction; otherwise null. */
  estimatedTime: string | null;
  destinationJa: string | null;
  destinationEn: string | null;
  trainTypeJa: string | null;
}

export interface OperationSnapshot {
  /** SourceRecord id. */
  sourceId: string;
  sourceTitle: string;
  dataNature: DataNature;
  /** True for anything not obtained from an operator feed. The UI must then show the example banner. */
  isSynthetic: boolean;
  /** When this prototype obtained (or, for synthetic data, built) the snapshot. */
  fetchedAt: string;
  lineStatuses: LineStatus[];
  departures: TrackDeparture[];
  /**
   * Train positions are deliberately absent from this interface: no source
   * usable here publishes them, and the UI never animates trains.
   */
  disclaimer: string;
}

export type OverlayUnavailableReason =
  | 'missing-key'
  | 'license-restricted'
  | 'not-implemented'
  | 'network-error'
  | 'bad-response';

export type OverlayResult =
  | { status: 'ok'; snapshot: OperationSnapshot }
  | { status: 'unavailable'; reason: OverlayUnavailableReason; detail: string; sourceId: string };

export interface OperationOverlayProvider {
  id: string;
  /** Shown in the UI's source picker. */
  label: { ja: string; en: string; zh: string };
  /** Whether results from this provider are real operator data. */
  live: boolean;
  getSnapshot(): Promise<OverlayResult>;
}

// ---------------------------------------------------------------------------
// Binding a snapshot to the station model
// ---------------------------------------------------------------------------

export interface TrackOverlay {
  platformId: string;
  track: PlatformTrack;
  /** One status per line serving this track (a track can serve two lines). */
  statuses: LineStatus[];
  departures: TrackDeparture[];
}

export interface BoundOverlay {
  snapshot: OperationSnapshot;
  tracks: TrackOverlay[];
  /** Entries of the snapshot that name a line / platform / track the model does not have. */
  unmatched: { kind: 'line' | 'departure'; ref: string }[];
}

/**
 * Joins a snapshot to platform tracks. Pure and total: entries that do not
 * match the model are reported in `unmatched`, never dropped silently and
 * never attached to a guessed platform.
 */
export function bindOverlay(model: StationModel, snapshot: OperationSnapshot): BoundOverlay {
  const lineIds = new Set(model.railLines.map((l) => l.id));
  const statusByLine = new Map<string, LineStatus>();
  const unmatched: BoundOverlay['unmatched'] = [];

  for (const s of snapshot.lineStatuses) {
    if (lineIds.has(s.railLineId)) statusByLine.set(s.railLineId, s);
    else unmatched.push({ kind: 'line', ref: s.railLineId });
  }

  const tracks: TrackOverlay[] = [];
  const trackKey = (platformId: string, n: string) => `${platformId}#${n}`;
  const byKey = new Map<string, TrackOverlay>();
  for (const area of model.areas) {
    if (area.kind !== 'platform') continue;
    for (const track of area.tracks) {
      const statuses: LineStatus[] = [];
      for (const svc of track.services) {
        const st = statusByLine.get(svc.railLineId);
        if (st && !statuses.includes(st)) statuses.push(st);
      }
      const entry: TrackOverlay = { platformId: area.id, track, statuses, departures: [] };
      tracks.push(entry);
      byKey.set(trackKey(area.id, track.number), entry);
    }
  }

  for (const d of snapshot.departures) {
    const entry = byKey.get(trackKey(d.platformId, d.trackNumber));
    const servesLine = entry?.track.services.some((s) => s.railLineId === d.railLineId) ?? false;
    if (entry && servesLine) entry.departures.push(d);
    else unmatched.push({ kind: 'departure', ref: `${d.platformId}#${d.trackNumber} ${d.railLineId} ${d.scheduledTime}` });
  }
  for (const t of tracks) t.departures.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  return { snapshot, tracks, unmatched };
}

/** Worst status on a platform island, for colouring it in the views. */
export function worstStatus(statuses: LineStatus[]): RunningStatus {
  const order: RunningStatus[] = ['suspended', 'partial-suspension', 'delayed', 'normal', 'unknown'];
  for (const s of order) if (statuses.some((x) => x.status === s)) return s;
  return 'unknown';
}
