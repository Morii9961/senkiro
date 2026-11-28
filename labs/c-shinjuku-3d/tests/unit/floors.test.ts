import { describe, expect, it } from 'vitest';
import { floorLabel, floorSequence, floorsOf, ordinalByLevel } from '../../src/domain/floors';
import { makeT } from '../../src/ui/i18n';
import { makeNamer } from '../../src/ui/naming';
import { hasCard } from '../../src/ui/panels/FacilityCard';
import { loadModel } from './helpers';

const model = loadModel();

describe('floors: the passenger-facing grouping of levels', () => {
  const floors = floorsOf(model);

  it('lists every floor once, top floor first, named by position', () => {
    expect(floors.map((f) => f.ordinal)).toEqual([...floors.map((f) => f.ordinal)].sort((a, b) => b - a));
    expect(new Set(floors.map((f) => f.label)).size).toBe(floors.length);
    expect(floorLabel(1)).toBe('2F');
    expect(floorLabel(0)).toBe('1F');
    expect(floorLabel(-1)).toBe('B1F');
  });

  it('every level belongs to exactly one floor', () => {
    const ids = floors.flatMap((f) => f.levelIds);
    expect(ids.sort()).toEqual(model.levels.map((l) => l.id).sort());
  });

  it("two operators' levels with the same ordinal share one floor", () => {
    const operatorsOnB1 = new Set(model.levels.filter((l) => l.ordinal === -1).map((l) => l.operatorId));
    expect(operatorsOnB1.size).toBeGreaterThan(1);
    expect(floors.filter((f) => f.ordinal === -1)).toHaveLength(1);
  });

  it('a floor sequence drops consecutive repeats only', () => {
    const ord = ordinalByLevel(model);
    const jrB1 = model.levels.find((l) => l.ordinal === -1 && l.operatorId.endsWith('jr-east'))!.id;
    const keioB1 = model.levels.find((l) => l.ordinal === -1 && l.operatorId.endsWith('keio'))!.id;
    const jr1 = model.levels.find((l) => l.ordinal === 0)!.id;
    expect(floorSequence([jr1, jrB1, keioB1, jr1], ord)).toEqual([0, -1, 0]);
  });
});

describe('names shown to passengers', () => {
  for (const lang of ['ja', 'en', 'zh'] as const) {
    const namer = makeNamer(model, lang, makeT(lang));

    it(`[${lang}] a floor is never labelled with an operator`, () => {
      for (const level of model.levels) expect(namer.level(level.id)).toMatch(/^(B?\d+F)$/);
    });

    it(`[${lang}] platforms carry their line names and stay distinguishable although track numbers repeat`, () => {
      const platforms = model.areas.filter((a) => a.kind === 'platform');
      const names = platforms.map((a) => namer.name(a.id));
      expect(new Set(names).size).toBe(names.length);
      for (const a of platforms) {
        if (a.kind !== 'platform') continue;
        const lines = namer.linesOf(a);
        expect(lines.length).toBeGreaterThan(0);
        expect(namer.name(a.id)).toContain(namer.lineName(lines[0]!.id));
      }
    });
  }

  it('an English working title never stands in for a missing Japanese name', () => {
    const namer = makeNamer(model, 'ja', makeT('ja'));
    for (const e of model.entrances) {
      if (e.names.ja === null && e.names.en) expect(namer.name(e.id)).not.toBe(e.names.en);
    }
  });
});

describe('facility cards', () => {
  it('platforms, gates, entrances and lifts have a card; halls, corridors and links do not', () => {
    for (const a of model.areas) expect(hasCard(model, a.id), a.id).toBe(a.kind === 'platform');
    for (const g of model.gates) expect(hasCard(model, g.id)).toBe(true);
    for (const e of model.entrances) expect(hasCard(model, e.id)).toBe(true);
    for (const v of model.verticals) expect(hasCard(model, v.id)).toBe(true);
    for (const l of model.passages) expect(hasCard(model, l.id)).toBe(false);
  });
});
