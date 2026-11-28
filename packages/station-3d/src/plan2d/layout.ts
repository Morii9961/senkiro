/**
 * Page layout of the 2D plan of one floor (Lab C `planLayout.ts` split-panel algorithm with
 * Lab B's shared scale). Model coordinates are never changed: a block of places is only
 * turned and moved as a whole when drawn.
 *
 * Blocks: two places of a floor belong to one block when a same-floor link joins them or
 * their footprints come within `joinGap` units. Orientation: the floor is turned a quarter
 * when its main block (most places) is taller than wide, so the main block lies
 * horizontally; the whole floor turns together, so one compass holds for every panel.
 * Panels: blocks are laid out left to right, a column holding one panel or a few stacked,
 * all at one shared scale (so parts of a floor keep their relative sizes). Distances between
 * panels are not to scale, and the plan says so.
 */
import type {
  PlanPoint,
  PlanRect,
  PlatformSide,
  SkId,
  StationLevel,
  StationPlace,
} from '@senkiro/contracts';
import { type IndoorGraphInput, isVerticalLinkKind } from '../graph/build.ts';

export const DEFAULT_JOIN_GAP = 6;
export const PANEL_MARGIN = 14;
export const PANEL_HEAD = 26;
export const PANEL_GAP = 12;
export const PANEL_MIN_W = 150;
/** Exhaustive column partitions are tried up to this many blocks, then a single row. */
const MAX_EXHAUSTIVE_BLOCKS = 11;

export interface PlanBlock {
  placeIds: SkId<'place'>[];
  /** Extent of the block's footprints, model coordinates. */
  extent: PlanRect;
}

export interface FloorLayout {
  ordinal: number;
  levels: StationLevel[];
  places: StationPlace[];
  blocks: PlanBlock[];
  blockOfPlace: ReadonlyMap<SkId<'place'>, number>;
  /** Quarter turn applied to the whole floor (sheet x = −z, sheet y = x). */
  rotated: boolean;
}

export function unionRect(a: PlanRect, b: PlanRect): PlanRect {
  return {
    x0: Math.min(a.x0, b.x0),
    x1: Math.max(a.x1, b.x1),
    z0: Math.min(a.z0, b.z0),
    z1: Math.max(a.z1, b.z1),
  };
}

/** Distance between two rectangles (0 when they touch or overlap). */
export function rectGap(a: PlanRect, b: PlanRect): number {
  const gx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const gz = Math.max(0, b.z0 - a.z1, a.z0 - b.z1);
  return Math.hypot(gx, gz);
}

function footprintExtent(place: StationPlace): PlanRect {
  const [first, ...rest] = place.footprint;
  const base = first ?? {
    x0: place.anchor.x,
    x1: place.anchor.x,
    z0: place.anchor.z,
    z1: place.anchor.z,
  };
  return rest.reduce(unionRect, base);
}

/** Model point → turned sheet point. */
export function toSheet(rotated: boolean, p: PlanPoint): { x: number; y: number } {
  return rotated ? { x: -p.z, y: p.x } : { x: p.x, y: p.z };
}

/** Model rectangle → its extent on the turned sheet (x across, z down the page). */
export function turnedRect(rotated: boolean, r: PlanRect): PlanRect {
  return rotated ? { x0: -r.z1, x1: -r.z0, z0: r.x0, z1: r.x1 } : r;
}

/**
 * Screen direction of north, or `null` when no source establishes it.
 * `planNorth` is the model axis that points north (e.g. `'x-'`: north is towards −x).
 */
export function northVector(
  rotated: boolean,
  planNorth: PlatformSide | null,
): { x: number; y: number } | null {
  if (planNorth === null) {
    return null;
  }
  const sign = planNorth.endsWith('-') ? -1 : 1;
  const model = planNorth.startsWith('x') ? { x: sign, z: 0 } : { x: 0, z: sign };
  return toSheet(rotated, model);
}

/** Distinct floors (ordinals) of a hub, top floor first — the order of a floor picker. */
export function floorsTopDown(levels: readonly StationLevel[]): number[] {
  return [...new Set(levels.map((l) => l.ordinal))].sort((a, b) => b - a);
}

/** The label printed for a floor: the most common operator label on that ordinal. */
export function floorLabel(levels: readonly StationLevel[], ordinal: number): string {
  const counts = new Map<string, number>();
  for (const level of levels) {
    if (level.ordinal === ordinal) {
      counts.set(level.label, (counts.get(level.label) ?? 0) + 1);
    }
  }
  let best = '';
  let bestCount = 0;
  for (const [label, count] of [...counts.entries()].sort()) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

export function floorLayout(
  input: IndoorGraphInput,
  ordinal: number,
  joinGap = DEFAULT_JOIN_GAP,
): FloorLayout {
  const levels = input.levels.filter((l) => l.ordinal === ordinal);
  const levelIds = new Set(levels.map((l) => l.id));
  const places = input.places.filter((p) => levelIds.has(p.levelId));
  const index = new Map(places.map((p, i) => [p.id, i]));

  const parent = places.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) {
      root = parent[root] ?? root;
    }
    let at = i;
    while (parent[at] !== root) {
      const next = parent[at] ?? root;
      parent[at] = root;
      at = next;
    }
    return root;
  };
  const join = (a: number | undefined, b: number | undefined) => {
    if (a !== undefined && b !== undefined) {
      parent[find(a)] = find(b);
    }
  };
  for (const link of input.links) {
    if (!isVerticalLinkKind(link.kind)) {
      join(index.get(link.fromPlaceId), index.get(link.toPlaceId));
    }
  }
  const extents = places.map(footprintExtent);
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const a = extents[i];
      const b = extents[j];
      if (a !== undefined && b !== undefined && rectGap(a, b) <= joinGap) {
        join(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < places.length; i += 1) {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  }
  const blocks: PlanBlock[] = [...groups.values()]
    .map((members) => {
      const rects = members.map((i) => extents[i]).filter((r): r is PlanRect => r !== undefined);
      const [first, ...rest] = rects;
      return {
        placeIds: members
          .map((i) => places[i]?.id)
          .filter((id): id is SkId<'place'> => id !== undefined),
        extent: rest.reduce(unionRect, first ?? { x0: -1, x1: 1, z0: -1, z1: 1 }),
      };
    })
    .sort((a, b) => a.extent.x0 - b.extent.x0 || a.extent.z0 - b.extent.z0);

  const main = blocks.reduce<PlanBlock | undefined>(
    (best, block) =>
      best === undefined || block.placeIds.length > best.placeIds.length ? block : best,
    undefined,
  );
  const rotated =
    main !== undefined && main.extent.z1 - main.extent.z0 > main.extent.x1 - main.extent.x0;

  const blockOfPlace = new Map<SkId<'place'>, number>();
  blocks.forEach((block, k) => {
    for (const id of block.placeIds) {
      blockOfPlace.set(id, k);
    }
  });
  return { ordinal, levels, places, blocks, blockOfPlace, rotated };
}

export interface PanelBox {
  block: number;
  /** Panel rectangle in px, title bar included. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelGrid {
  /** Shared px per model unit of every panel of the floor. */
  scale: number;
  panels: PanelBox[];
}

/**
 * Lay a floor's panels out in a `rowW × rowH` px area at one shared scale (Lab C
 * `panelGrid`): columns left to right in the blocks' order across the turned sheet, a
 * column holding one panel or several stacked. Of all contiguous column cuts the one with
 * the largest scale wins (more columns when within 5 %); the scale never exceeds `cap`.
 */
export function panelGrid(layout: FloorLayout, rowW: number, rowH: number, cap = 40): PanelGrid {
  const ext = layout.blocks.map((b) => turnedRect(layout.rotated, b.extent));
  const order = ext
    .map((_, k) => k)
    .sort((a, b) => {
      const ea = ext[a];
      const eb = ext[b];
      return (ea ? ea.x0 + ea.x1 : 0) - (eb ? eb.x0 + eb.x1 : 0);
    });
  if (order.length === 0) {
    return { scale: 1, panels: [] };
  }
  const w = (k: number) => {
    const e = ext[k];
    return e ? e.x1 - e.x0 : 1;
  };
  const h = (k: number) => {
    const e = ext[k];
    return e ? e.z1 - e.z0 : 1;
  };
  const panelW = (k: number, s: number) => Math.max(PANEL_MIN_W, w(k) * s + PANEL_MARGIN * 2);
  const panelH = (k: number, s: number) => h(k) * s + PANEL_MARGIN * 2 + PANEL_HEAD;
  const fits = (cols: number[][], s: number) => {
    const total =
      cols.reduce((acc, col) => acc + Math.max(...col.map((k) => panelW(k, s))), 0) +
      PANEL_GAP * (cols.length - 1);
    if (total > rowW) {
      return false;
    }
    return cols.every(
      (col) => col.reduce((acc, k) => acc + panelH(k, s), 0) + PANEL_GAP * (col.length - 1) <= rowH,
    );
  };
  const bestScale = (cols: number[][]) => {
    if (fits(cols, cap)) {
      return cap;
    }
    let lo = 0;
    let hi = cap;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(cols, mid)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  };
  const options: number[][][] = [];
  if (order.length <= MAX_EXHAUSTIVE_BLOCKS) {
    for (let mask = 0; mask < 1 << (order.length - 1); mask += 1) {
      const cols: number[][] = [];
      order.forEach((k, i) => {
        const last = cols[cols.length - 1];
        if (i > 0 && last !== undefined && mask & (1 << (i - 1))) {
          last.push(k);
        } else {
          cols.push([k]);
        }
      });
      options.push(cols);
    }
  } else {
    options.push(order.map((k) => [k]));
  }
  const scored = options.map((cols) => ({ cols, s: bestScale(cols) }));
  const top = Math.max(...scored.map((o) => o.s));
  const pick =
    scored
      .filter((o) => o.s >= top * 0.95)
      .sort((a, b) => b.cols.length - a.cols.length || b.s - a.s)[0] ?? scored[0];
  const scale = Math.max(0.25, pick?.s ?? 1);
  const panels: PanelBox[] = [];
  let x = 0;
  for (const col of pick?.cols ?? []) {
    const colW = Math.max(...col.map((k) => panelW(k, scale)));
    let y = 0;
    for (const k of col) {
      const height = panelH(k, scale);
      panels.push({ block: k, x, y, width: colW, height });
      y += height + PANEL_GAP;
    }
    x += colW + PANEL_GAP;
  }
  return { scale, panels };
}

/** Maps model coordinates into one panel's px frame. */
export interface PanelProjection {
  point(p: PlanPoint): { x: number; y: number };
  rect(r: PlanRect): { x: number; y: number; width: number; height: number };
}

export function panelProjection(
  layout: FloorLayout,
  grid: PanelGrid,
  box: PanelBox,
): PanelProjection {
  const block = layout.blocks[box.block];
  const ext = turnedRect(layout.rotated, block?.extent ?? { x0: 0, x1: 1, z0: 0, z1: 1 });
  const s = grid.scale;
  const drawingW = (ext.x1 - ext.x0) * s;
  const ox = box.x + (box.width - drawingW) / 2 - ext.x0 * s;
  const oy = box.y + PANEL_HEAD + PANEL_MARGIN - ext.z0 * s;
  return {
    point(p) {
      const q = toSheet(layout.rotated, p);
      return { x: ox + q.x * s, y: oy + q.y * s };
    },
    rect(r) {
      const t = turnedRect(layout.rotated, r);
      return {
        x: ox + t.x0 * s,
        y: oy + t.z0 * s,
        width: (t.x1 - t.x0) * s,
        height: (t.z1 - t.z0) * s,
      };
    },
  };
}
