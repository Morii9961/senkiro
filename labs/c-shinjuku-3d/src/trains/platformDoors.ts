/**
 * Platform doors as door units that line up with the doors of the trains.
 *
 * Doors are drawn only along a platform face whose `platformDoors` status is
 * "installed" (data/manual/laterFacts.ts). Along that face the openings sit
 * where the doors of the line's representative train fall when it stands at
 * the platform (the train stops at the middle of the platform, see
 * simulate.ts): same vehicle, same number of cars, same fitted length as the
 * simulation draws. Between the openings stand fixed panels, at each opening
 * two posts and two leaves that slide into the panels when a train standing
 * at that track opens a door in front of them.
 *
 * Pure geometry in the train-local frame of the track (see parts.ts): `a`
 * along the track, `u` height above the platform surface, `c` across with +
 * towards the platform. Sizes and the look of the units are drawn by rule.
 */
import type { Platform, StationModel } from '../domain/types';
import { LINE_REGISTRY as LINES, STATION_REGISTRY as STATIONS } from '../timetable/registry';
import { doorCentres } from './parts';
import { trainLength } from './simulate';
import { TRACK_GAP, TRACK_W, trackLine, type TrackLine } from './trackGeometry';
import { resolveVehicle } from './vehicles';

export interface DoorPart {
  a0: number;
  a1: number;
  u0: number;
  u1: number;
  c0: number;
  c1: number;
  color: string;
  /** A leaf of the opening `opening`: slides towards +a (1) or −a (−1) by `travel` when it opens. */
  leaf?: 1 | -1;
  travel?: number;
  opening?: number;
}

export interface PlatformDoorSet {
  platformId: string;
  trackNumber: string;
  line: TrackLine;
  /** Centre (along the track, world coordinate) and half width of each opening. */
  openings: { a: number; half: number }[];
  parts: DoorPart[];
}

/** Platform edge, measured from the centre of the track towards the platform. */
const EDGE = TRACK_GAP + TRACK_W / 2;
const PANEL = { c0: EDGE + 0.06, c1: EDGE + 0.095, u1: 0.3 };
const LEAF = { c0: EDGE + 0.07, c1: EDGE + 0.085, u0: 0.02, u1: 0.28 };
const POST = { w: 0.045, u1: 0.34 };
const MARGIN = 0.03;

export const DOOR_COLORS = { panel: '#e6e8eb', top: '#8a929c', post: '#7d858f', leaf: '#aebbc7' };

/** The registry line and station of a platform track, for picking its representative train. */
function representative(platform: Platform, trackNumber: string) {
  const track = platform.tracks.find((t) => t.number === trackNumber);
  const modelLine = track?.services[0]?.railLineId;
  const line = LINES.find((l) => modelLine && l.modelLineIds.includes(modelLine));
  const station = line && STATIONS.find((s) => s.modelStationId === platform.stationId && s.line_ids.includes(line.line_id));
  if (!line || !station) return null;
  return resolveVehicle({
    station_id: station.station_id,
    operator_id: line.operator_id,
    line_id: line.line_id,
    vehicle_series: null,
    formation_length: null,
    vehicle_assignment_status: 'unknown',
    source_id: '',
  });
}

export function buildPlatformDoors(model: StationModel): PlatformDoorSet[] {
  const out: PlatformDoorSet[] = [];
  for (const area of model.areas) {
    if (area.kind !== 'platform') continue;
    for (const t of area.tracks) {
      if (t.platformDoors?.status !== 'installed') continue;
      const line = trackLine(area, t.number);
      if (!line) continue;
      const vehicle = representative(area, t.number);
      const stopAt = (line.lo + line.hi) / 2;
      let openings: { a: number; half: number }[] = [];
      if (vehicle) {
        const { length } = trainLength(line, vehicle.cars, vehicle.spec.carLengthM);
        openings = doorCentres({ spec: vehicle.spec, cars: vehicle.cars, length }).map((d) => ({ a: stopAt + d.a, half: d.width / 2 + MARGIN }));
      }
      if (openings.length === 0) {
        // no representative train: evenly spaced openings, drawn by rule
        const n = Math.max(2, Math.floor((line.hi - line.lo) / 1.1));
        openings = Array.from({ length: n }, (_, k) => ({ a: line.lo + ((line.hi - line.lo) * (k + 0.5)) / n, half: 0.2 }));
      }
      const parts: DoorPart[] = [];
      // fixed panels between the openings, from one end of the platform to the other
      const edges = [line.lo + 0.08, ...openings.flatMap((o) => [o.a - o.half, o.a + o.half]), line.hi - 0.08];
      for (let i = 0; i + 1 < edges.length; i += 2) {
        const a0 = edges[i]!;
        const a1 = edges[i + 1]!;
        if (a1 - a0 < 0.02) continue;
        parts.push({ a0, a1, u0: 0, u1: PANEL.u1, c0: PANEL.c0, c1: PANEL.c1, color: DOOR_COLORS.panel });
        parts.push({ a0, a1, u0: PANEL.u1, u1: PANEL.u1 + 0.025, c0: PANEL.c0 - 0.004, c1: PANEL.c1 + 0.004, color: DOOR_COLORS.top });
      }
      openings.forEach((o, k) => {
        for (const s of [-1, 1] as const) {
          const at = o.a + s * o.half;
          parts.push({ a0: at - POST.w / 2, a1: at + POST.w / 2, u0: 0, u1: POST.u1, c0: PANEL.c0 - 0.006, c1: PANEL.c1 + 0.006, color: DOOR_COLORS.post });
          const [l0, l1] = s === -1 ? [o.a - o.half + POST.w / 2, o.a] : [o.a, o.a + o.half - POST.w / 2];
          parts.push({ a0: l0, a1: l1, u0: LEAF.u0, u1: LEAF.u1, c0: LEAF.c0, c1: LEAF.c1, color: DOOR_COLORS.leaf, leaf: s, travel: (l1 - l0) * 0.95, opening: k });
        }
      });
      out.push({ platformId: area.id, trackNumber: t.number, line, openings, parts });
    }
  }
  return out;
}

/**
 * How far each opening of a set is open (0 … 1), given the trains standing at that track: an opening
 * opens with a train's doors when one of the train's doors stands in front of it.
 */
export function openingStates(set: PlatformDoorSet, trains: { doors: number; doorAs: number[] }[]): number[] {
  return set.openings.map((o) => {
    let open = 0;
    for (const t of trains) if (t.doors > open && t.doorAs.some((a) => Math.abs(a - o.a) < o.half)) open = t.doors;
    return open;
  });
}
