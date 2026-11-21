/**
 * Layout of the 2D plan of one floor: which parts of the floor are drawn as
 * separate panels, which way the floor is turned, where each panel goes on the
 * sheet, and the default drawing scale.
 *
 * This is page layout only. Model coordinates, areas and links are never
 * changed; a block is only turned and moved as a whole when it is drawn.
 *
 * Blocks. Two areas of the floor belong to the same block when
 *   - a passage, a gate or a lift / flight with both ends on this floor joins them, or
 *   - their footprints come within JOIN_GAP schematic units of each other.
 * Everything else on the floor (tracks, gates, entrances, flights, services)
 * goes with the block of the area it stands in.
 *
 * Orientation. The main block (the one with the most areas) is laid
 * horizontally: when it runs east–west the floor is drawn north-up, otherwise
 * north to the left (the model's own frame, as in 3D). The whole floor turns
 * together, so one compass holds for every panel.
 *
 * Panels. A floor of two or more blocks is drawn as a row of separate panels,
 * one block each, each with its own view (pan and zoom do not move the
 * others). Distances and positions between panels are not to scale, and the
 * plan says so.
 */
import type { PlanPoint, PlanRect, StationModel } from '../domain/types';

/** Areas this close (schematic units) are one block even without a link between them. */
export const JOIN_GAP = 10;
/** Margin round the whole plan in the default view (schematic units). */
export const FIT_PAD = 3.5;
/** Clear space kept between the drawing and what stands over it (px). */
export const OVERLAY_CLEARANCE = 12;
/** Margin round a block inside its panel (px). */
export const PANEL_MARGIN = 18;

export type North = 'left' | 'up';

export interface ScreenRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * What stands over the plan (px, relative to the plan): the floor list at the
 * top left, the view buttons at the bottom right, and the compass with the
 * note on panels above it at the bottom left. The default view keeps the
 * drawing clear of them.
 */
export function planOverlays(w: number, h: number, floors: number): ScreenRect[] {
  return [
    { x0: 0, x1: 112, y0: 0, y1: 16 + floors * 32 },
    { x0: w - 170, x1: w, y0: h - 60, y1: h },
    { x0: 0, x1: 112, y0: h - 180, y1: h },
  ];
}

export interface PlanBlock {
  /** Areas of this block. */
  areaIds: string[];
  /** Extent of what is drawn for the block, model coordinates. */
  extent: PlanRect;
}

export interface PlanBlocks {
  blocks: PlanBlock[];
  blockOfArea: Map<string, number>;
  /** The block whose areas are nearest to a point (model coordinates); 0 when the floor has none. */
  blockAt(p: PlanPoint): number;
}

function union(a: PlanRect, b: PlanRect): PlanRect {
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
}

function aroundPoint(p: PlanPoint, d: number): PlanRect {
  return { x0: p.x - d, x1: p.x + d, z0: p.z - d, z1: p.z + d };
}

/** Distance between two rectangles (0 when they touch or overlap). */
export function rectGap(a: PlanRect, b: PlanRect): number {
  const gx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const gz = Math.max(0, b.z0 - a.z1, a.z0 - b.z1);
  return Math.hypot(gx, gz);
}

function pointGap(p: PlanPoint, r: PlanRect): number {
  const gx = Math.max(0, r.x0 - p.x, p.x - r.x1);
  const gz = Math.max(0, r.z0 - p.z, p.z - r.z1);
  return Math.hypot(gx, gz);
}

/** The blocks of one floor (independent of screen and orientation). */
export function planBlocks(model: StationModel, ordinal: number): PlanBlocks {
  const levelIds = new Set(model.levels.filter((l) => l.ordinal === ordinal).map((l) => l.id));
  const areas = model.areas.filter((a) => levelIds.has(a.levelId));
  const index = new Map(areas.map((a, i) => [a.id, i]));

  // --- union–find over the areas of the floor
  const parent = areas.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const join = (a: string | undefined, b: string | undefined) => {
    const ia = a === undefined ? undefined : index.get(a);
    const ib = b === undefined ? undefined : index.get(b);
    if (ia !== undefined && ib !== undefined) parent[find(ia)] = find(ib);
  };
  for (const l of model.passages) join(l.fromAreaId, l.toAreaId);
  for (const g of model.gates) {
    const [s0, s1] = g.sides;
    if ('areaId' in s0 && 'areaId' in s1) join(s0.areaId, s1.areaId);
  }
  for (const v of model.verticals) {
    const here = v.stops.filter((s) => levelIds.has(s.levelId));
    for (let i = 1; i < here.length; i++) join(here[0]!.areaId, here[i]!.areaId);
  }
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const near = areas[i]!.footprint.some((ra) => areas[j]!.footprint.some((rb) => rectGap(ra, rb) <= JOIN_GAP));
      if (near) parent[find(i)] = find(j);
    }
  }

  // --- what is drawn for each area: its floor, the tracks beside a platform, and what stands in it
  const drawn = new Map<string, PlanRect>();
  const add = (areaId: string, r: PlanRect) => {
    const prev = drawn.get(areaId);
    drawn.set(areaId, prev ? union(prev, r) : r);
  };
  for (const a of areas) {
    for (const r of a.footprint) {
      add(a.id, r);
      if (a.kind !== 'platform') continue;
      for (const tr of a.tracks) {
        if (!tr.side) continue;
        const alongX = tr.side[0] === 'z';
        const out = tr.side[1] === '-' ? -1 : 1;
        const at = alongX ? (out < 0 ? r.z0 : r.z1) : out < 0 ? r.x0 : r.x1;
        const far = at + out * 0.7;
        add(a.id, alongX ? { x0: r.x0 - 1.6, x1: r.x1 + 1.6, z0: Math.min(at, far), z1: Math.max(at, far) } : { x0: Math.min(at, far), x1: Math.max(at, far), z0: r.z0 - 1.6, z1: r.z1 + 1.6 });
      }
    }
  }
  for (const g of model.gates) {
    if (!levelIds.has(g.levelId)) continue;
    const side = g.sides.find((s): s is { areaId: string } => 'areaId' in s && index.has(s.areaId));
    if (side) add(side.areaId, aroundPoint(g.position, 1.1));
  }
  for (const e of model.entrances) if (levelIds.has(e.levelId) && index.has(e.areaId)) add(e.areaId, aroundPoint(e.position, 0.5));
  for (const s of model.services) if (levelIds.has(s.levelId) && index.has(s.areaId)) add(s.areaId, s.box);
  for (const v of model.verticals) {
    // a flight is drawn from its stop on this floor towards its other end (see Plan2D)
    const here = v.stops.find((s) => levelIds.has(s.levelId));
    if (!here || !index.has(here.areaId)) continue;
    add(here.areaId, aroundPoint(here.position, 0.5));
    const other = v.stops.find((s) => s !== here);
    if (other && v.verticalKind !== 'elevator') add(here.areaId, aroundPoint(other.position, 0.5));
  }

  const byRoot = new Map<number, string[]>();
  areas.forEach((a, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), a.id]));
  const blocks = [...byRoot.values()]
    .map((ids) => ({ areaIds: ids, extent: ids.map((id) => drawn.get(id)!).reduce(union) }))
    .sort((a, b) => a.extent.x0 - b.extent.x0 || a.extent.z0 - b.extent.z0);

  const blockOfArea = new Map<string, number>();
  blocks.forEach((b, i) => b.areaIds.forEach((id) => blockOfArea.set(id, i)));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const blockAt = (p: PlanPoint): number => {
    let best = 0;
    let bestD = Infinity;
    blocks.forEach((b, i) => {
      for (const id of b.areaIds) {
        for (const r of areaById.get(id)!.footprint) {
          const d = pointGap(p, r);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    });
    return best;
  };
  return { blocks, blockOfArea, blockAt };
}

/** Which way the floor is turned: the main block lies horizontally. */
export function northOf(blocks: PlanBlock[]): North {
  if (blocks.length === 0) return 'left';
  const main = blocks.reduce((best, b) => (b.areaIds.length > best.areaIds.length ? b : best));
  return main.extent.z1 - main.extent.z0 > main.extent.x1 - main.extent.x0 ? 'up' : 'left';
}

/**
 * Model point → turned plan, before a block is moved into place. North-left is
 * the model's own frame (x to the right, z down, east at the top). North-up
 * turns it a quarter clockwise: x' = −z (east to the right), y' = x (north at the top).
 */
export function turn(north: North, p: PlanPoint): { x: number; y: number } {
  return north === 'up' ? { x: -p.z, y: p.x } : { x: p.x, y: p.z };
}

/** Extent of a model rectangle on the turned plan (x across, z down the screen). */
export function turnedExtent(north: North, r: PlanRect): PlanRect {
  return north === 'up' ? { x0: -r.z1, x1: -r.z0, z0: r.x0, z1: r.x1 } : r;
}

export interface FloorLayout extends PlanBlocks {
  north: North;
}

/** Blocks and orientation of one floor. */
export function floorLayout(model: StationModel, ordinal: number): FloorLayout {
  const base = planBlocks(model, ordinal);
  return { ...base, north: northOf(base.blocks) };
}

/** Extent of blocks `show` (all when omitted) on the turned plan, in their true places. */
export function floorBounds(layout: FloorLayout, show?: number[]): PlanRect {
  const rects = layout.blocks.filter((_, k) => !show || show.includes(k)).map((b) => turnedExtent(layout.north, b.extent));
  if (rects.length === 0) return { x0: -10, x1: 10, z0: -10, z1: 10 };
  return rects.reduce(union);
}

/** Panels from left to right: the blocks in their order across the turned plan. */
export function panelOrder(layout: FloorLayout): number[] {
  const mid = (k: number) => {
    const e = turnedExtent(layout.north, layout.blocks[k]!.extent);
    return e.x0 + e.x1;
  };
  return layout.blocks.map((_, k) => k).sort((a, b) => mid(a) - mid(b));
}

/** A model point on the turned plan. */
export function toSheet(north: North, p: PlanPoint): PlanPoint {
  const t = turn(north, p);
  return { x: t.x, z: t.y };
}

/** SVG transform that draws model coordinates on the turned plan. */
export function sheetTransform(north: North): string | undefined {
  return north === 'up' ? 'matrix(0 1 -1 0 0 0)' : undefined;
}

/** A panel's title bar (px, borders included), its narrowest width (room for the title) and the gap between panels. */
export const PANEL_HEAD_PX = 34;
export const PANEL_MIN_W = 170;
export const PANEL_GAP = 14;

export interface PanelGrid {
  /** The shared default scale of the floor's panels (px per unit). */
  scale: number;
  /** Columns from left to right; each holds one panel, or several stacked (blocks by index). */
  columns: { width: number; panels: number[] }[];
}

/**
 * The panels of a floor in an area of `rowW` × `rowH` px: columns from left
 * to right in the blocks' order across the turned plan, a column holding one
 * panel or a few stacked. All panels share one default scale, so the parts of
 * a floor keep their sizes relative to one another; a column is as wide as its
 * widest block at that scale (at least PANEL_MIN_W). Of all the ways to cut
 * the order into columns, the one with the largest scale wins (more columns
 * when it is within 5 %); the scale never exceeds `cap`.
 */
export function panelGrid(layout: FloorLayout, rowW: number, rowH: number, cap: number): PanelGrid {
  const order = panelOrder(layout);
  const ext = layout.blocks.map((b) => turnedExtent(layout.north, b.extent));
  const width = (k: number, s: number) => Math.max(PANEL_MIN_W, (ext[k]!.x1 - ext[k]!.x0) * s + PANEL_MARGIN * 2 + 2);
  const fits = (cols: number[][], s: number) => {
    const w = cols.reduce((acc, col) => acc + Math.max(...col.map((k) => width(k, s))), 0) + PANEL_GAP * (cols.length - 1);
    if (w > rowW) return false;
    return cols.every((col) => {
      const each = (rowH - PANEL_GAP * (col.length - 1)) / col.length;
      return col.every((k) => (ext[k]!.z1 - ext[k]!.z0) * s + PANEL_HEAD_PX + PANEL_MARGIN * 2 <= each);
    });
  };
  const best = (cols: number[][]) => {
    if (fits(cols, cap)) return cap;
    let lo = 0;
    let hi = cap === Infinity ? 1000 : cap;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (fits(cols, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // every way of cutting the order into contiguous columns
  const options: number[][][] = [];
  for (let mask = 0; mask < 1 << Math.max(0, order.length - 1); mask++) {
    const cols: number[][] = [[order[0]!]];
    for (let i = 1; i < order.length; i++) {
      if (mask & (1 << (i - 1))) cols[cols.length - 1]!.push(order[i]!);
      else cols.push([order[i]!]);
    }
    options.push(cols);
  }
  const scored = options.map((cols) => ({ cols, s: best(cols) }));
  const top = Math.max(...scored.map((o) => o.s));
  const pick = scored.filter((o) => o.s >= top * 0.95).sort((a, b) => b.cols.length - a.cols.length || b.s - a.s)[0]!;
  const s = Math.max(0.5, pick.s);
  return { scale: s, columns: pick.cols.map((col) => ({ width: Math.max(...col.map((k) => width(k, s))), panels: col })) };
}

/**
 * Pixels per schematic unit of the default view: `bounds` centred in a plan of
 * `w` × `h` px, as large as it fits, and clear of the overlays. The drawing may
 * pass beside an overlay (clear of it in x or in y), not under it.
 */
export function fitScale(bounds: PlanRect, w: number, h: number, overlays: ScreenRect[]): number {
  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.z1 - bounds.z0;
  let s = Math.min(w / (bw + FIT_PAD * 2), (h - 40) / (bh + FIT_PAD * 2));
  const cx = w / 2;
  const cy = h / 2;
  for (const o of overlays) {
    const gx = Math.max(o.x0 - OVERLAY_CLEARANCE - cx, cx - o.x1 - OVERLAY_CLEARANCE);
    const gy = Math.max(o.y0 - OVERLAY_CLEARANCE - cy, cy - o.y1 - OVERLAY_CLEARANCE);
    const sx = gx > 0 ? (gx * 2) / Math.max(bw, 1e-6) : 0;
    const sy = gy > 0 ? (gy * 2) / Math.max(bh, 1e-6) : 0;
    s = Math.min(s, Math.max(sx, sy));
  }
  return Math.max(0.5, s);
}

/**
 * The largest default scale of the station: the scale at which the most
 * closely framed floor that has more than one area fits. A floor of a single
 * platform (B7F) would otherwise be blown up to fill the screen; with this cap
 * it is drawn no larger than the other floors are.
 */
export function scaleCap(layouts: { areas: number; bounds: PlanRect }[], w: number, h: number, overlays: ScreenRect[]): number {
  const scales = layouts.filter((l) => l.areas > 1).map((l) => fitScale(l.bounds, w, h, overlays));
  return scales.length > 0 ? Math.max(...scales) : Infinity;
}
