import { describe, expect, it } from 'vitest';
import { floorsOf } from '../../src/domain/floors';
import type { StationModel } from '../../src/domain/types';
import {
  JOIN_GAP,
  PANEL_GAP,
  PANEL_HEAD_PX,
  PANEL_MARGIN,
  PANEL_MIN_W,
  fitScale,
  floorBounds,
  floorLayout,
  northOf,
  panelGrid,
  panelOrder,
  planBlocks,
  planOverlays,
  rectGap,
  scaleCap,
  toSheet,
  turn,
  turnedExtent,
} from '../../src/ui/planLayout';
import { loadModel } from './helpers';

const model = loadModel();
const floors = floorsOf(model);
const ordinalOf = (label: string) => floors.find((f) => f.label === label)!.ordinal;
const areasOn = (m: StationModel, ordinal: number) => {
  const ids = new Set(m.levels.filter((l) => l.ordinal === ordinal).map((l) => l.id));
  return m.areas.filter((a) => ids.has(a.levelId));
};
const [W, H] = [966, 716]; // the plan at 1366 × 768 with the side panel open
const capAt = (w: number, h: number) =>
  scaleCap(
    floors.map((f) => ({ areas: areasOn(model, f.ordinal).length, bounds: floorBounds(floorLayout(model, f.ordinal)) })),
    w,
    h,
    planOverlays(w, h, floors.length),
  );

describe('plan layout: blocks of a floor', () => {
  it('splits 2F into the Seibu block and the JR / Odakyu block', () => {
    const { blocks } = planBlocks(model, ordinalOf('2F'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.areaIds.every((id) => id.includes('seibu'))).toBe(true);
    expect(blocks[1]!.areaIds.some((id) => id.includes('jr-2f'))).toBe(true);
    expect(blocks[1]!.areaIds.some((id) => id.includes('odakyu-2f'))).toBe(true);
  });

  it('draws 1F as the two Seibu exits and the JR / Odakyu platforms with their street-level landings', () => {
    const { blocks } = planBlocks(model, ordinalOf('1F'));
    expect(blocks.map((b) => b.areaIds.length)).toEqual([2, 1, 15]);
    expect(blocks[2]!.areaIds).toContain('sk:area:jr-1f-east-exit-street-level');
    expect(blocks[2]!.areaIds).toContain('sk:area:jr-1f-southeast-street-level');
    expect(blocks[2]!.areaIds).toContain('sk:area:odakyu-1f-west-ground-gate-unpaid');
  });

  it('keeps B1F, where everything is linked, in one block', () => {
    expect(planBlocks(model, ordinalOf('B1F')).blocks).toHaveLength(1);
  });

  for (const f of floors) {
    it(`${f.label}: every area is in one block; linked or near areas share one; areas of different blocks are far apart`, () => {
      const lay = planBlocks(model, f.ordinal);
      const areas = areasOn(model, f.ordinal);
      const byId = new Map(areas.map((a) => [a.id, a]));
      expect(lay.blocks.flatMap((b) => b.areaIds).sort()).toEqual(areas.map((a) => a.id).sort());
      for (const l of model.passages) {
        if (byId.has(l.fromAreaId) && byId.has(l.toAreaId)) expect(lay.blockOfArea.get(l.fromAreaId)).toBe(lay.blockOfArea.get(l.toAreaId));
      }
      for (const a of areas) {
        for (const b of areas) {
          const gap = Math.min(...a.footprint.flatMap((ra) => b.footprint.map((rb) => rectGap(ra, rb))));
          if (gap <= JOIN_GAP) expect(lay.blockOfArea.get(a.id)).toBe(lay.blockOfArea.get(b.id));
          else if (lay.blockOfArea.get(a.id) !== lay.blockOfArea.get(b.id)) expect(gap).toBeGreaterThan(JOIN_GAP);
        }
        expect(lay.blockAt(a.anchor)).toBe(lay.blockOfArea.get(a.id));
      }
    });
  }

  it('is layout only: the model is not changed', () => {
    const m = loadModel();
    const before = JSON.stringify(m);
    for (const f of floors) panelGrid(floorLayout(m, f.ordinal), W - 248, H - 128, 20);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe('plan layout: orientation', () => {
  it('lays the main building of each floor horizontally', () => {
    const north = Object.fromEntries(floors.map((f) => [f.label, northOf(planBlocks(model, f.ordinal).blocks)]));
    expect(north).toEqual({ '4F': 'up', '3F': 'up', '2F': 'up', '1F': 'left', B1F: 'up', B2F: 'up', B3F: 'left', B4F: 'up', B5F: 'up', B7F: 'left' });
    for (const f of floors) {
      const lay = floorLayout(model, f.ordinal);
      const main = lay.blocks.reduce((best, b) => (b.areaIds.length > best.areaIds.length ? b : best));
      const e = turnedExtent(lay.north, main.extent);
      expect(e.x1 - e.x0).toBeGreaterThanOrEqual(e.z1 - e.z0);
    }
  });

  it('turns without mirroring: north goes left or up, east to the top or to the right', () => {
    const o = { x: 3, z: 7 };
    const step = (north: 'left' | 'up', d: { x: number; z: number }) => {
      const a = turn(north, o);
      const b = turn(north, { x: o.x + d.x, z: o.z + d.z });
      return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    };
    // north is −x in the model, east is −z
    expect(step('left', { x: -1, z: 0 })).toEqual({ x: -1, y: 0 });
    expect(step('left', { x: 0, z: -1 })).toEqual({ x: 0, y: -1 });
    expect(step('up', { x: -1, z: 0 })).toEqual({ x: 0, y: -1 });
    expect(step('up', { x: 0, z: -1 })).toEqual({ x: 1, y: 0 });
    // the turned extent of a rectangle holds the turned corners
    const r = { x0: -2, x1: 5, z0: 1, z1: 9 };
    for (const north of ['left', 'up'] as const) {
      const e = turnedExtent(north, r);
      for (const c of [toSheet(north, { x: r.x0, z: r.z0 }), toSheet(north, { x: r.x1, z: r.z1 })]) {
        expect(c.x).toBeGreaterThanOrEqual(e.x0);
        expect(c.x).toBeLessThanOrEqual(e.x1);
        expect(c.z).toBeGreaterThanOrEqual(e.z0);
        expect(c.z).toBeLessThanOrEqual(e.z1);
      }
    }
  });
});

describe('plan layout: panels', () => {
  const [rowW, rowH] = [W - 248, H - 128];
  const cap = capAt(W, H);
  for (const f of floors) {
    it(`${f.label}: columns in the blocks' order across the turned plan; one shared scale; every block fits its panel`, () => {
      const lay = floorLayout(model, f.ordinal);
      const grid = panelGrid(lay, rowW, rowH, cap);
      expect(grid.columns.flatMap((c) => c.panels)).toEqual(panelOrder(lay));
      expect(grid.scale).toBeLessThanOrEqual(cap + 1e-9);
      const total = grid.columns.reduce((acc, c) => acc + c.width, 0) + PANEL_GAP * (grid.columns.length - 1);
      expect(total).toBeLessThanOrEqual(rowW + 1e-6);
      for (const col of grid.columns) {
        expect(col.width).toBeGreaterThanOrEqual(PANEL_MIN_W);
        const each = (rowH - PANEL_GAP * (col.panels.length - 1)) / col.panels.length;
        for (const k of col.panels) {
          const e = turnedExtent(lay.north, lay.blocks[k]!.extent);
          expect((e.x1 - e.x0) * grid.scale + PANEL_MARGIN * 2).toBeLessThanOrEqual(col.width + 1e-6);
          expect((e.z1 - e.z0) * grid.scale + PANEL_MARGIN * 2 + PANEL_HEAD_PX).toBeLessThanOrEqual(each + 1e-6);
        }
      }
    });
  }

  it('2F: the JR / Odakyu panel and the Seibu panel side by side, west to east (Seibu lies to the north-east)', () => {
    const lay = floorLayout(model, ordinalOf('2F'));
    const grid = panelGrid(lay, rowW, rowH, cap);
    expect(grid.columns.map((c) => c.panels.map((k) => lay.blocks[k]!.areaIds.some((id) => id.includes('seibu'))))).toEqual([[false], [true]]);
  });

  it('1F: the two small Seibu exits share a column, so the JR platforms get the width', () => {
    const lay = floorLayout(model, ordinalOf('1F'));
    const grid = panelGrid(lay, rowW, rowH, cap);
    expect(grid.columns.map((c) => c.panels.length)).toEqual([2, 1]);
    expect(grid.scale).toBeGreaterThan(6);
  });
});

describe('plan layout: default scale', () => {
  const sizes = [
    [966, 716], // 1366 × 768 with the side panel
    [1520, 1028], // 1920 × 1080 with the side panel
    [1366, 716], // side panel folded away
  ] as const;
  for (const [w, h] of sizes) {
    it(`a lone platform is drawn no larger than the other floors (${w} × ${h})`, () => {
      const overlays = planOverlays(w, h, floors.length);
      const all = floors.map((f) => ({ label: f.label, areas: areasOn(model, f.ordinal).length, bounds: floorBounds(floorLayout(model, f.ordinal)) }));
      const cap = scaleCap(all, w, h, overlays);
      const fitOf = (label: string) => fitScale(all.find((x) => x.label === label)!.bounds, w, h, overlays);
      expect(fitOf('B7F')).toBeGreaterThan(cap * 1.2);
      expect(Math.min(fitOf('B7F'), cap)).toBeCloseTo(cap, 6);
      // the cap comes from a floor with more than one area, which is therefore not shrunk
      expect(all.filter((x) => x.areas > 1).some((x) => fitOf(x.label) === cap)).toBe(true);
    });
  }

  it('keeps a single-piece floor clear of the floor list: a wide floor passes beside it, not under it', () => {
    const overlays = planOverlays(W, H, floors.length);
    for (const f of floors) {
      const lay = floorLayout(model, f.ordinal);
      if (lay.blocks.length > 1) continue;
      const b = floorBounds(lay);
      const s = fitScale(b, W, H, overlays);
      const left = W / 2 - ((b.x1 - b.x0) / 2) * s;
      const top = H / 2 - ((b.z1 - b.z0) / 2) * s;
      expect(left >= overlays[0]!.x1 || top >= overlays[0]!.y1).toBe(true);
    }
  });
});
