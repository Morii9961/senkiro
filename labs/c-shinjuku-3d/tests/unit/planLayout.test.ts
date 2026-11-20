import { describe, expect, it } from 'vitest';
import { floorsOf } from '../../src/domain/floors';
import type { StationModel } from '../../src/domain/types';
import { JOIN_GAP, PANEL_HEAD_PX, fitScale, northOf, planBlocks, planOverlays, rectGap, scaleCap, sheetLayout, toSheet, turn } from '../../src/ui/planLayout';
import { loadModel } from './helpers';

const model = loadModel();
const floors = floorsOf(model);
const ordinalOf = (label: string) => floors.find((f) => f.label === label)!.ordinal;
const areasOn = (m: StationModel, ordinal: number) => {
  const ids = new Set(m.levels.filter((l) => l.ordinal === ordinal).map((l) => l.id));
  return m.areas.filter((a) => ids.has(a.levelId));
};
const [W, H] = [966, 716]; // the plan at 1366 × 768 with the side panel open

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
    for (const f of floors) sheetLayout(m, f.ordinal, W, H, floors.length);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe('plan layout: orientation', () => {
  it('lays the main building of each floor horizontally', () => {
    const north = Object.fromEntries(floors.map((f) => [f.label, northOf(planBlocks(model, f.ordinal).blocks)]));
    expect(north).toEqual({ '4F': 'up', '3F': 'up', '2F': 'up', '1F': 'left', B1F: 'up', B2F: 'up', B3F: 'left', B4F: 'up', B5F: 'up', B7F: 'left' });
    for (const f of floors) {
      const lay = sheetLayout(model, f.ordinal, W, H, floors.length);
      const main = lay.blocks.reduce((best, b) => (b.areaIds.length > best.areaIds.length ? b : best));
      const a = toSheet(lay.north, main, { x: main.extent.x0, z: main.extent.z0 });
      const b = toSheet(lay.north, main, { x: main.extent.x1, z: main.extent.z1 });
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(Math.abs(a.z - b.z));
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
  });
});

describe('plan layout: panels', () => {
  for (const f of floors) {
    it(`${f.label}: separate blocks sit in one row of equal panels, in their order on the turned plan, each inside its own panel`, () => {
      const lay = sheetLayout(model, f.ordinal, W, H, floors.length, () => 150);
      if (lay.blocks.length === 1) {
        expect(lay.blocks[0]!.panel).toBeNull();
        return;
      }
      const s = fitScale(lay.bounds, W, H, planOverlays(W, H, floors.length));
      const byLeft = [...lay.blocks].sort((a, b) => a.panel!.x0 - b.panel!.x0);
      for (let i = 0; i < byLeft.length; i++) {
        const b = byLeft[i]!;
        const p = b.panel!;
        expect(p.y0).toBe(byLeft[0]!.panel!.y0);
        expect(p.y1).toBe(byLeft[0]!.panel!.y1);
        // wide enough for its title (sized in a few rounds against the default scale, so within a few per cent)
        expect((p.x1 - p.x0) * s).toBeGreaterThanOrEqual(150 * 0.97);
        if (i > 0) expect(p.x0).toBeGreaterThan(byLeft[i - 1]!.panel!.x1);
        // the block, turned and moved, lies inside its panel and below the title bar
        const c = [toSheet(lay.north, b, { x: b.extent.x0, z: b.extent.z0 }), toSheet(lay.north, b, { x: b.extent.x1, z: b.extent.z1 })];
        expect(Math.min(c[0]!.x, c[1]!.x)).toBeGreaterThanOrEqual(p.x0 - 1e-6);
        expect(Math.max(c[0]!.x, c[1]!.x)).toBeLessThanOrEqual(p.x1 + 1e-6);
        expect(Math.min(c[0]!.z, c[1]!.z)).toBeGreaterThanOrEqual(p.y0 + (PANEL_HEAD_PX / s) * 0.9);
        expect(Math.max(c[0]!.z, c[1]!.z)).toBeLessThanOrEqual(p.y1 + 1e-6);
      }
      // panels follow the blocks' own left-to-right order on the turned plan
      const centre = (b: (typeof lay.blocks)[number]) => {
        const c = [turn(lay.north, { x: b.extent.x0, z: b.extent.z0 }), turn(lay.north, { x: b.extent.x1, z: b.extent.z1 })];
        return c[0]!.x + c[1]!.x;
      };
      for (let i = 1; i < byLeft.length; i++) expect(centre(byLeft[i]!)).toBeGreaterThan(centre(byLeft[i - 1]!));
    });
  }

  it('2F: west to east, the JR / Odakyu panel comes before the Seibu panel (Seibu lies to the north-east)', () => {
    const lay = sheetLayout(model, ordinalOf('2F'), W, H, floors.length);
    const seibu = lay.blocks.find((b) => b.areaIds.some((id) => id.includes('seibu')))!;
    const jr = lay.blocks.find((b) => b.areaIds.some((id) => id.includes('jr-2f')))!;
    expect(jr.panel!.x1).toBeLessThan(seibu.panel!.x0);
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
      const all = floors.map((f) => ({ label: f.label, areas: areasOn(model, f.ordinal).length, bounds: sheetLayout(model, f.ordinal, w, h, floors.length).bounds }));
      const cap = scaleCap(all, w, h, overlays);
      const fitOf = (label: string) => fitScale(all.find((x) => x.label === label)!.bounds, w, h, overlays);
      expect(fitOf('B7F')).toBeGreaterThan(cap * 1.2);
      expect(Math.min(fitOf('B7F'), cap)).toBeCloseTo(cap, 6);
      // the cap comes from a floor with more than one area, which is therefore not shrunk
      expect(all.filter((x) => x.areas > 1).some((x) => fitOf(x.label) === cap)).toBe(true);
    });
  }

  it('keeps the drawing clear of the floor list: a wide floor passes beside it, not under it', () => {
    const overlays = planOverlays(W, H, floors.length);
    for (const f of floors) {
      const b = sheetLayout(model, f.ordinal, W, H, floors.length).bounds;
      const s = fitScale(b, W, H, overlays);
      const left = W / 2 - ((b.x1 - b.x0) / 2) * s;
      const top = H / 2 - ((b.z1 - b.z0) / 2) * s;
      expect(left >= overlays[0]!.x1 || top >= overlays[0]!.y1).toBe(true);
    }
  });
});
