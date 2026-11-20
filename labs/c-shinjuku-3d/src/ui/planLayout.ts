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
 * Panels. A floor of two or more blocks is drawn as a row of panels of equal
 * height, one block each, all at the same scale, in their order from left to
 * right on the turned plan (north → south, or west → east). Distances and
 * positions between panels are not to scale, and the plan says so.
 */
import type { PlanPoint, PlanRect, StationModel } from '../domain/types';

/** Areas this close (schematic units) are one block even without a link between them. */
export const JOIN_GAP = 10;
/** Margin round the whole plan in the default view (schematic units). */
export const FIT_PAD = 3.5;
/** Clear space kept between the drawing and what stands over it (px). */
export const OVERLAY_CLEARANCE = 12;
/** Inner margin of a panel (schematic units). */
export const PANEL_PAD = 2;
/** Height of a panel's title bar, and the gap between panels (px at the default scale). */
export const PANEL_HEAD_PX = 30;
export const PANEL_GAP_PX = 22;

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

function turnRect(north: North, r: PlanRect): ScreenRect {
  return north === 'up' ? { x0: -r.z1, x1: -r.z0, y0: r.x0, y1: r.x1 } : { x0: r.x0, x1: r.x1, y0: r.z0, y1: r.z1 };
}

export interface SheetBlock extends PlanBlock {
  /** Added after turning, to put the block in its panel (sheet units). */
  tx: number;
  ty: number;
  /** The panel round the block (sheet coordinates); null when the floor is a single block. */
  panel: ScreenRect | null;
  /** Height of the panel's title bar (sheet units, at the default scale). */
  head: number;
}

export interface SheetLayout extends PlanBlocks {
  north: North;
  blocks: SheetBlock[];
  /** Extent of everything drawn, sheet coordinates. */
  bounds: PlanRect;
}

/** A model point on the sheet, as drawn in block `b`. */
export function toSheet(north: North, b: { tx: number; ty: number }, p: PlanPoint): PlanPoint {
  const t = turn(north, p);
  return { x: t.x + b.tx, z: t.y + b.ty };
}

/** SVG transform that draws block `b` (model coordinates) on the sheet. */
export function sheetTransform(north: North, b: { tx: number; ty: number }): string | undefined {
  const turnPart = north === 'up' ? ' matrix(0 1 -1 0 0 0)' : '';
  if (b.tx === 0 && b.ty === 0 && !turnPart) return undefined;
  return `translate(${b.tx} ${b.ty})${turnPart}`;
}

function arrange(blocks: PlanBlock[], north: North, head: number, gap: number, minWidth: number[]): { blocks: SheetBlock[]; bounds: PlanRect } {
  const turned = blocks.map((b) => turnRect(north, b.extent));
  if (blocks.length <= 1) {
    const t = turned[0];
    return {
      blocks: blocks.map((b) => ({ ...b, tx: 0, ty: 0, panel: null, head: 0 })),
      bounds: t ? { x0: t.x0, x1: t.x1, z0: t.y0, z1: t.y1 } : { x0: -10, x1: 10, z0: -10, z1: 10 },
    };
  }
  const order = blocks.map((_, i) => i).sort((a, b) => turned[a]!.x0 + turned[a]!.x1 - (turned[b]!.x0 + turned[b]!.x1));
  const inner = Math.max(...turned.map((t) => t.y1 - t.y0));
  const height = head + inner + PANEL_PAD * 2;
  const out: SheetBlock[] = new Array(blocks.length);
  let x = 0;
  for (const i of order) {
    const t = turned[i]!;
    const w = Math.max(t.x1 - t.x0 + PANEL_PAD * 2, minWidth[i] ?? 0);
    const top = head + PANEL_PAD + (inner - (t.y1 - t.y0)) / 2;
    // content centred in its panel (a panel may be wider than its block, to hold its title)
    out[i] = { ...blocks[i]!, tx: x + (w - (t.x1 - t.x0)) / 2 - t.x0, ty: top - t.y0, panel: { x0: x, x1: x + w, y0: 0, y1: height }, head };
    x += w + gap;
  }
  return { blocks: out, bounds: { x0: 0, x1: x - gap, z0: 0, z1: height } };
}

/**
 * The sheet of one floor for a plan of `w` × `h` px. Title bars, gaps and the
 * width a panel needs for its title (`titlePx`, px) are sized for the default
 * scale, which depends on them: a few rounds settle it.
 */
export function sheetLayout(model: StationModel, ordinal: number, w: number, h: number, floors: number, titlePx: (areaIds: string[]) => number = () => 0): SheetLayout {
  const base = planBlocks(model, ordinal);
  const north = northOf(base.blocks);
  const overlays = planOverlays(w, h, floors);
  let laid = arrange(base.blocks, north, 0, 0, []);
  if (base.blocks.length > 1) {
    const need = base.blocks.map((b) => titlePx(b.areaIds));
    for (let round = 0; round < 4; round++) {
      const s = fitScale(laid.bounds, w, h, overlays);
      laid = arrange(base.blocks, north, PANEL_HEAD_PX / s, PANEL_GAP_PX / s, need.map((px) => px / s));
    }
  }
  return { ...base, north, blocks: laid.blocks, bounds: laid.bounds };
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
