import { describe, expect, it } from 'vitest';
import { floorsOf } from '../../src/domain/floors';
import type { PlanRect, StationModel } from '../../src/domain/types';
import { FRAME_GUTTER, JOIN_GAP, fitScale, planLayout, planOverlays, rectGap, scaleCap, squeeze } from '../../src/ui/planLayout';
import { loadModel } from './helpers';

const model = loadModel();
const floors = floorsOf(model);
const ordinalOf = (label: string) => floors.find((f) => f.label === label)!.ordinal;
const areasOn = (m: StationModel, ordinal: number) => {
  const ids = new Set(m.levels.filter((l) => l.ordinal === ordinal).map((l) => l.id));
  return m.areas.filter((a) => ids.has(a.levelId));
};
const disjoint = (a: PlanRect, b: PlanRect) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0;

describe('squeeze', () => {
  it('shortens every empty band longer than the gutter, and only those', () => {
    // [0,10] … 30 empty … [40,50] [52,60] … 2 empty … [62,70]
    const shifts = squeeze([[40, 50], [0, 10], [62, 70], [52, 60]], 4);
    expect(shifts).toEqual([-26, 0, -26, -26]);
  });

  it('leaves overlapping intervals together', () => {
    expect(squeeze([[0, 10], [5, 20], [8, 9]], 4)).toEqual([0, 0, 0]);
  });
});

describe('plan layout: blocks of a floor', () => {
  it('splits 2F into the Seibu block and the JR / Odakyu block, Seibu (north) on the left', () => {
    const lay = planLayout(model, ordinalOf('2F'));
    expect(lay.blocks).toHaveLength(2);
    const [north, south] = lay.blocks;
    expect(north!.areaIds.every((id) => id.includes('seibu'))).toBe(true);
    expect(south!.areaIds.some((id) => id.includes('jr-2f'))).toBe(true);
    expect(south!.areaIds.some((id) => id.includes('odakyu-2f'))).toBe(true);
    // the empty stretch between them is cut down to the gutter; east–west stays as modelled
    expect(south!.frame.x0 - north!.frame.x1).toBeCloseTo(FRAME_GUTTER, 6);
    expect(north!.dz).toBe(0);
    expect(south!.dz).toBe(0);
  });

  it('draws 1F as the two Seibu exits and the JR / Odakyu platforms with their street-level landings', () => {
    const lay = planLayout(model, ordinalOf('1F'));
    expect(lay.blocks.map((b) => b.areaIds.length)).toEqual([2, 1, 15]);
    const main = lay.blocks[2]!;
    expect(main.areaIds).toContain('sk:area:jr-1f-east-exit-street-level');
    expect(main.areaIds).toContain('sk:area:jr-1f-southeast-street-level');
    expect(main.areaIds).toContain('sk:area:odakyu-1f-west-ground-gate-unpaid');
    expect(main.dx).toBe(0); // the block with the most areas stays where the model puts it
    expect(lay.blocks[0]!.areaIds).toEqual(['sk:area:seibu-1f-north-gate-inside', 'sk:area:seibu-1f-north-gate-unpaid']);
  });

  it('keeps B1F, where everything is linked, in one block that is not moved', () => {
    const lay = planLayout(model, ordinalOf('B1F'));
    expect(lay.blocks).toHaveLength(1);
    expect(lay.blocks[0]!.dx).toBe(0);
    expect(lay.blocks[0]!.dz).toBe(0);
  });

  for (const f of floors) {
    it(`${f.label}: blocks follow the rule, keep their order and never overlap`, () => {
      const lay = planLayout(model, f.ordinal);
      const areas = areasOn(model, f.ordinal);
      // every area is in exactly one block
      expect(lay.blocks.flatMap((b) => b.areaIds).sort()).toEqual(areas.map((a) => a.id).sort());
      // linked or near areas share a block
      const byId = new Map(areas.map((a) => [a.id, a]));
      for (const l of model.passages) {
        if (byId.has(l.fromAreaId) && byId.has(l.toAreaId)) expect(lay.blockOfArea.get(l.fromAreaId)).toBe(lay.blockOfArea.get(l.toAreaId));
      }
      for (const a of areas) {
        for (const b of areas) {
          if (a.footprint.some((ra) => b.footprint.some((rb) => rectGap(ra, rb) <= JOIN_GAP))) expect(lay.blockOfArea.get(a.id)).toBe(lay.blockOfArea.get(b.id));
        }
      }
      // areas of different blocks are far apart
      for (let i = 0; i < lay.blocks.length; i++) {
        for (let j = i + 1; j < lay.blocks.length; j++) {
          for (const ia of lay.blocks[i]!.areaIds) {
            for (const ib of lay.blocks[j]!.areaIds) {
              const gap = Math.min(...byId.get(ia)!.footprint.flatMap((ra) => byId.get(ib)!.footprint.map((rb) => rectGap(ra, rb))));
              expect(gap).toBeGreaterThan(JOIN_GAP);
            }
          }
          const [a, b] = [lay.blocks[i]!, lay.blocks[j]!];
          expect(disjoint(a.frame, b.frame)).toBe(true);
          // a block wholly north (left) / east (top) of another stays so
          if (a.extent.x1 < b.extent.x0) expect(a.frame.x1).toBeLessThan(b.frame.x0);
          if (b.extent.x1 < a.extent.x0) expect(b.frame.x1).toBeLessThan(a.frame.x0);
          if (a.extent.z1 < b.extent.z0) expect(a.frame.z1).toBeLessThan(b.frame.z0);
          if (b.extent.z1 < a.extent.z0) expect(b.frame.z1).toBeLessThan(a.frame.z0);
        }
      }
      // every area's anchor is found in its own block
      for (const a of areas) expect(lay.blockAt(a.anchor)).toBe(lay.blockOfArea.get(a.id));
    });
  }

  it('is layout only: the model is not changed', () => {
    const m = loadModel();
    const before = JSON.stringify(m);
    for (const f of floors) planLayout(m, f.ordinal);
    expect(JSON.stringify(m)).toBe(before);
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
      const all = floors.map((f) => ({ label: f.label, areas: areasOn(model, f.ordinal).length, bounds: planLayout(model, f.ordinal).bounds }));
      const cap = scaleCap(all, w, h, overlays);
      const scale = (label: string) => {
        const f = all.find((x) => x.label === label)!;
        return Math.min(fitScale(f.bounds, w, h, overlays), cap);
      };
      // B7F (one platform) would fit far larger, and is capped
      expect(fitScale(all.find((x) => x.label === 'B7F')!.bounds, w, h, overlays)).toBeGreaterThan(cap * 1.4);
      expect(scale('B7F')).toBeCloseTo(cap, 6);
      // the cap comes from a floor with more than one area, which is therefore not shrunk
      expect(all.filter((x) => x.areas > 1).some((x) => fitScale(x.bounds, w, h, overlays) === cap)).toBe(true);
      for (const x of all.filter((y) => y.areas > 1)) expect(scale(x.label)).toBeCloseTo(fitScale(x.bounds, w, h, overlays), 6);
    });
  }

  it('keeps the drawing clear of the floor list: a wide floor passes beside it, not under it', () => {
    const [w, h] = [966, 716];
    const overlays = planOverlays(w, h, floors.length);
    const lay = planLayout(model, ordinalOf('1F'));
    const s = fitScale(lay.bounds, w, h, overlays);
    const left = w / 2 - ((lay.bounds.x1 - lay.bounds.x0) / 2) * s;
    expect(left).toBeGreaterThanOrEqual(overlays[0]!.x1);
  });
});
