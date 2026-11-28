import type { LineClass, LonLat, SkId, TrackSegment } from '@senkiro/contracts';

export interface CorridorSlotAssignment {
  corridorSlot: number;
  corridorCount: number;
}

export interface AssignCorridorSlotsOptions {
  stationToComplex?: ReadonlyMap<SkId<'station'>, SkId<'complex'>>;
}

const LINE_CLASS_PRIORITY: Readonly<Record<LineClass, number>> = {
  shinkansen: 0,
  trunk: 1,
  private: 2,
  metro: 3,
  local_line: 4,
  unknown: 5,
};

function slotForOrderIndex(index: number): number {
  if (index === 0) {
    return 0;
  }
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? magnitude : -magnitude;
}

function segmentMidpoint(geometry: readonly LonLat[]): LonLat {
  const first = geometry[0];
  if (first === undefined) {
    return [0, 0];
  }
  const mid = geometry[Math.floor(geometry.length / 2)];
  return mid ?? first;
}

function undirectedBearingBucket(geometry: readonly LonLat[]): number {
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (first === undefined || last === undefined) {
    return 0;
  }
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  if (dx === 0 && dy === 0) {
    return 0;
  }
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg < 0) {
    deg += 180;
  }
  if (deg >= 180) {
    deg -= 180;
  }
  return Math.round(deg / 30) % 6;
}

function endpointCorridorKey(
  seg: TrackSegment,
  stationToComplex?: ReadonlyMap<SkId<'station'>, SkId<'complex'>>,
): string {
  const a = stationToComplex?.get(seg.fromStationId) ?? seg.fromStationId;
  const b = stationToComplex?.get(seg.toStationId) ?? seg.toStationId;
  return a <= b ? `${a}::${b}` : `${b}::${a}`;
}

function spatialCorridorKey(seg: TrackSegment): string {
  const mid = segmentMidpoint(seg.geometry);
  const qLon = Math.round(mid[0] / 0.0025);
  const qLat = Math.round(mid[1] / 0.0025);
  const bearing = undirectedBearingBucket(seg.geometry);
  return `geo:${qLon},${qLat}:${bearing}`;
}

/**
 * Assign deterministic parallel track offset slots (`0, 1, -1, 2, -2...`) to segments
 * sharing the same station/complex corridor or nearby parallel spatial corridor.
 */
export function assignCorridorSlots(
  segments: readonly TrackSegment[],
  options: AssignCorridorSlotsOptions = {},
): Map<SkId<'segment'>, CorridorSlotAssignment> {
  const count = segments.length;
  const parent = Array.from({ length: count }, (_, idx) => idx);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      root = parent[root] ?? root;
    }
    let cur = x;
    while (cur !== root) {
      const next = parent[cur] ?? root;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  };

  const byEndpoint = new Map<string, number>();
  const bySpatial = new Map<string, number>();

  for (const [idx, seg] of segments.entries()) {
    const epKey = endpointCorridorKey(seg, options.stationToComplex);
    const prevEp = byEndpoint.get(epKey);
    if (prevEp === undefined) {
      byEndpoint.set(epKey, idx);
    } else {
      union(prevEp, idx);
    }

    const spKey = spatialCorridorKey(seg);
    const prevSp = bySpatial.get(spKey);
    if (prevSp === undefined) {
      bySpatial.set(spKey, idx);
    } else {
      const prevSeg = segments[prevSp];
      const prevPrimary = prevSeg?.railLineIds[0] ?? '';
      const curPrimary = seg.railLineIds[0] ?? '';
      if (prevPrimary !== curPrimary) {
        union(prevSp, idx);
      }
    }
  }

  const groups = new Map<number, TrackSegment[]>();
  for (const [idx, seg] of segments.entries()) {
    const root = find(idx);
    const list = groups.get(root);
    if (list === undefined) {
      groups.set(root, [seg]);
    } else {
      list.push(seg);
    }
  }

  const result = new Map<SkId<'segment'>, CorridorSlotAssignment>();
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const pa = LINE_CLASS_PRIORITY[a.lineClass];
      const pb = LINE_CLASS_PRIORITY[b.lineClass];
      if (pa !== pb) {
        return pa - pb;
      }
      const lineCmp = (a.railLineIds[0] ?? '').localeCompare(b.railLineIds[0] ?? '');
      if (lineCmp !== 0) {
        return lineCmp;
      }
      return a.id.localeCompare(b.id);
    });

    const corridorCount = group.length;
    for (const [idx, seg] of group.entries()) {
      result.set(seg.id, {
        corridorSlot: slotForOrderIndex(idx),
        corridorCount,
      });
    }
  }

  return result;
}
