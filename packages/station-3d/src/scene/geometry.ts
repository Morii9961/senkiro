import type { PlanRect, PlatformSide, StationHubDataset, StationPlace } from '@senkiro/contracts';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { StationSelectionId } from '../plan2d/StationPlan2D.tsx';
import type { StationPalette } from '../theme.ts';

type Tone = keyof StationPalette;
type Point = [number, number, number];

interface Instance {
  owner: StationSelectionId;
  tone: Tone;
  matrix: Matrix4;
}

const UP = new Vector3(0, 1, 0);
const DECK = 0.38;
const EXPLODE_GAP = 5;

function subtract(rect: PlanRect, hole: PlanRect): PlanRect[] {
  const x0 = Math.max(rect.x0, hole.x0);
  const z0 = Math.max(rect.z0, hole.z0);
  const x1 = Math.min(rect.x1, hole.x1);
  const z1 = Math.min(rect.z1, hole.z1);
  if (x1 <= x0 || z1 <= z0) {
    return [rect];
  }
  return [
    { ...rect, x1: x0 },
    { ...rect, x0: x1 },
    { ...rect, x0, x1, z1: z0 },
    { ...rect, x0, x1, z0: z1 },
  ].filter((part) => part.x0 < part.x1 && part.z0 < part.z1);
}

function platformEdge(rect: PlanRect, side: PlatformSide, y: number, offset = 0): [Point, Point] {
  if (side.startsWith('x')) {
    const x = side === 'x-' ? rect.x0 - offset : rect.x1 + offset;
    return [
      [x, y, rect.z0],
      [x, y, rect.z1],
    ];
  }
  const z = side === 'z-' ? rect.z0 - offset : rect.z1 + offset;
  return [
    [rect.x0, y, z],
    [rect.x1, y, z],
  ];
}

function areaTone(place: StationPlace): Tone {
  if (place.kind === 'entrance' || place.kind === 'landing') {
    return place.kind === 'entrance' ? 'entrance' : 'vertical';
  }
  if (place.fareZone === 'roadway' || place.fareZone === 'unpaid') {
    return place.fareZone;
  }
  return place.kind === 'platform' ? 'platform' : 'paid';
}

/** Schematic architecture. Counts, dimensions and finishes are render rules, not station facts. */
export function buildStationInstances(
  dataset: StationHubDataset,
  active: number | null,
  exploded: boolean,
) {
  const instances: Instance[] = [];
  const anchors = new Map<StationSelectionId, Vector3>();
  const levels = new Map(dataset.levels.map((level) => [level.id, level]));
  const places = new Map(dataset.places.map((place) => [place.id, place]));
  const holes = new Map<string, PlanRect[]>();
  const visible = (place: StationPlace) =>
    active === null || levels.get(place.levelId)?.ordinal === active;
  const height = (place: StationPlace) => {
    const level = levels.get(place.levelId);
    return (level?.elevation ?? 0) + (exploded ? (level?.ordinal ?? 0) * EXPLODE_GAP : 0);
  };
  const position = (place: StationPlace): Point => [place.anchor.x, height(place), place.anchor.z];
  const box = (owner: StationSelectionId, tone: Tone, center: Point, size: Point, yaw = 0) => {
    instances.push({
      owner,
      tone,
      matrix: new Matrix4().compose(
        new Vector3(...center),
        new Quaternion().setFromAxisAngle(UP, yaw),
        new Vector3(...size),
      ),
    });
  };
  const beam = (
    owner: StationSelectionId,
    tone: Tone,
    a: Point,
    b: Point,
    width: number,
    thickness: number,
  ) => {
    const start = new Vector3(...a);
    const delta = new Vector3(...b).sub(start);
    const length = delta.length();
    if (length < 0.01) {
      return;
    }
    const across = new Vector3(-delta.z, 0, delta.x).normalize();
    if (across.lengthSq() === 0) {
      across.set(1, 0, 0);
    }
    const forward = delta.normalize();
    const normal = new Vector3().crossVectors(forward, across);
    const matrix = new Matrix4().makeBasis(across, normal, forward);
    matrix
      .scale(new Vector3(width, thickness, length))
      .setPosition(start.addScaledVector(forward, length / 2));
    instances.push({ owner, tone, matrix });
  };

  // A landing may be separate from its host slab in the portable graph.
  const landingHosts = new Map<string, StationPlace>();
  for (const link of dataset.links) {
    const a = places.get(link.fromPlaceId);
    const b = places.get(link.toPlaceId);
    if (link.kind !== 'passage' || !a || !b) {
      continue;
    }
    if (a.kind === 'landing' && b.kind !== 'landing') {
      landingHosts.set(a.id, b);
    } else if (b.kind === 'landing' && a.kind !== 'landing') {
      landingHosts.set(b.id, a);
    }
  }

  for (const link of dataset.links) {
    const a = places.get(link.fromPlaceId);
    const b = places.get(link.toPlaceId);
    if (!a || !b || (!visible(a) && !visible(b))) {
      continue;
    }
    const start = position(a);
    const end = position(b);
    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const run = Math.hypot(dx, dz);
    const ux = run > 0.01 ? dx / run : 1;
    const uz = run > 0.01 ? dz / run : 0;
    const yaw = Math.atan2(ux, uz);
    const both = visible(a) && visible(b);
    const center: Point = [
      link.position?.x ?? (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      link.position?.z ?? (start[2] + end[2]) / 2,
    ];
    const shown = visible(a) ? start : end;
    anchors.set(link.id, new Vector3(...(both ? center : shown)));

    if (link.kind === 'gate') {
      for (const lane of [-1, 0, 1]) {
        box(
          link.id,
          'gate',
          [center[0] - uz * lane * 0.8, center[1] + 0.48, center[2] + ux * lane * 0.8],
          [0.31, 0.96, 1.04],
          yaw,
        );
      }
    } else if (link.kind === 'passage') {
      beam(
        link.id,
        link.connection === 'verified' ? 'link' : 'outline',
        [start[0], start[1] + 0.035, start[2]],
        [end[0], end[1] + 0.035, end[2]],
        0.28,
        0.04,
      );
    } else if (link.kind === 'elevator') {
      for (const point of both ? [start, end] : [shown]) {
        box(link.id, 'vertical', [point[0], point[1] + 0.68, point[2]], [1, 1.36, 0.9]);
      }
      if (both) {
        beam(link.id, 'railing', start, end, 0.46, 0.46);
      }
    } else {
      const upper = start[1] > end[1] ? a : b;
      const top = start[1] > end[1] ? start : end;
      const sign = upper === b ? -1 : 1;
      const alongX = Math.abs(ux) >= Math.abs(uz);
      const host = landingHosts.get(upper.id) ?? upper;
      const bottom = start[1] > end[1] ? end : start;
      const width = link.kind === 'stairs' ? 1.2 : 0.82;
      const length = Math.min(2.4, run * 0.75);
      if (visible(upper) && length > 0.3) {
        const edge = (alongX ? top[0] : top[2]) + sign * Math.sign(alongX ? ux : uz) * length;
        const hole = alongX
          ? {
              x0: Math.min(top[0], edge),
              x1: Math.max(top[0], edge),
              z0: top[2] - width / 2,
              z1: top[2] + width / 2,
            }
          : {
              x0: top[0] - width / 2,
              x1: top[0] + width / 2,
              z0: Math.min(top[2], edge),
              z1: Math.max(top[2], edge),
            };
        if (
          host.footprint.some(
            (r) => r.x0 < hole.x1 && r.x1 > hole.x0 && r.z0 < hole.z1 && r.z1 > hole.z0,
          )
        ) {
          const current = holes.get(host.id) ?? [];
          current.push(hole);
          holes.set(host.id, current);
          for (const side of alongX ? (['z-', 'z+'] as const) : (['x-', 'x+'] as const)) {
            const [from, to] = platformEdge(hole, side, top[1] + 0.76);
            beam(link.id, 'railing', from, to, 0.08, 0.12);
            for (const post of [from, to]) {
              box(link.id, 'railing', [post[0], top[1] + 0.36, post[2]], [0.08, 0.72, 0.08]);
            }
          }
        }
      }
      const marks = [
        [top, sign * -1, visible(upper)],
        [bottom, sign, visible(upper === a ? b : a)],
      ] as const;
      for (const [point, outward, shown] of marks) {
        if (shown) {
          box(
            link.id,
            'selection',
            [point[0] + ux * outward * 0.36, point[1] + 0.045, point[2] + uz * outward * 0.36],
            [width, 0.06, 0.22],
            yaw,
          );
        }
      }
      if (both && run > 0.01 && link.kind === 'stairs') {
        const count = Math.min(24, Math.max(4, Math.ceil(run / 0.48)));
        for (let i = 0; i < count; i += 1) {
          const t = (i + 0.5) / count;
          box(
            link.id,
            'vertical',
            [start[0] + dx * t, start[1] + (end[1] - start[1]) * t - 0.09, start[2] + dz * t],
            [width, 0.24, run / count + 0.01],
            yaw,
          );
        }
      } else if (both) {
        beam(link.id, 'vertical', start, end, width, 0.32);
      }
    }
  }

  for (const place of dataset.places) {
    if (!visible(place)) {
      continue;
    }
    const [x, y, z] = position(place);
    anchors.set(place.id, new Vector3(x, y, z));
    if (place.kind === 'landing' || place.kind === 'entrance') {
      box(place.id, areaTone(place), [x, y + 0.13, z], [0.52, 0.26, 0.52]);
      continue;
    }
    for (const rect of place.footprint) {
      const parts = (holes.get(place.id) ?? []).reduce(
        (parts, hole) => parts.flatMap((part) => subtract(part, hole)),
        [rect],
      );
      for (const part of parts) {
        box(
          place.id,
          areaTone(place),
          [(part.x0 + part.x1) / 2, y - DECK / 2, (part.z0 + part.z1) / 2],
          [part.x1 - part.x0, DECK, part.z1 - part.z0],
        );
      }
    }
    const primary = place.footprint[0];
    if (!primary || place.kind !== 'platform') {
      continue;
    }
    for (const track of place.tracks ?? []) {
      if (!track.side) {
        continue;
      }
      const [from, to] = platformEdge(primary, track.side, y - 0.28, 0.65);
      beam(place.id, 'track', from, to, 0.45, 0.12);
      if (track.platformDoors?.status === 'installed') {
        const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
        const count = Math.min(32, Math.max(1, Math.floor(length / 2.2)));
        const [a, b] = platformEdge(primary, track.side, y + 0.53);
        for (let i = 0; i < count; i += 1) {
          const t = (i + 0.5) / count;
          const segment = (n: number): Point => [
            a[0] + (b[0] - a[0]) * n,
            a[1],
            a[2] + (b[2] - a[2]) * n,
          ];
          beam(
            place.id,
            'platformDoor',
            segment(t - 0.36 / count),
            segment(t + 0.36 / count),
            0.12,
            0.94,
          );
        }
      }
    }
    if (place.terminus) {
      const [a, b] = platformEdge(primary, place.terminus.end, y + 0.26);
      beam(place.id, 'bufferStop', a, b, 0.26, 0.52);
    }
  }
  return { instances, anchors };
}
