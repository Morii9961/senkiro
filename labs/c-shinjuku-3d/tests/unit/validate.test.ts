import { describe, expect, it } from 'vitest';
import { stationModelInput } from '../../data/manual/shinjuku';
import { RETRIEVED_AT, sources as manualSources } from '../../data/manual/sources';
import type { Passage, StationModel, VerticalFacility } from '../../src/domain/types';
import { validateModel } from '../../src/domain/validate';
import { loadModel, loadSources } from './helpers';

const rules = (model: StationModel) => validateModel(model, loadSources()).map((i) => i.rule);

describe('data validation', () => {
  it('the shipped model has no validation issues', () => {
    expect(validateModel(loadModel(), loadSources())).toEqual([]);
  });

  it('committed JSON is exactly what data/manual produces (npm run data:build is reproducible)', () => {
    expect(loadModel()).toEqual(JSON.parse(JSON.stringify({ ...stationModelInput, generatedAt: RETRIEVED_AT })));
    expect(loadSources()).toEqual(JSON.parse(JSON.stringify(manualSources)));
  });

  it('rejects a passage that joins a paid and an unpaid area', () => {
    const model = loadModel();
    const template = model.passages[0]!;
    const leak: Passage = {
      ...template,
      id: 'sk:passage:test-leak',
      fromAreaId: 'sk:area:jr-b1f-east-west-free-passage', // unpaid
      toAreaId: 'sk:area:jr-b1f-north-concourse', // paid
    };
    model.passages.push(leak);
    const found = rules(model);
    expect(found).toContain('fare-zone');
    expect(found).toContain('graph-fare-boundary');
  });

  it('rejects stairs that would carry people across the fare boundary', () => {
    const model = loadModel();
    const stairs = model.verticals.find((v) => v.id === 'sk:vertical:jr-stairs-east-exit')!;
    // move the lower end from the unpaid basement into the paid central passage
    stairs.stops[0] = { levelId: stairs.stops[0]!.levelId, areaId: 'sk:area:jr-b1f-central-passage', position: { x: 0, z: 0 } };
    expect(rules(model)).toContain('fare-zone');
  });

  it('rejects an entrance that opens straight into a paid area', () => {
    const model = loadModel();
    model.entrances[0]!.areaId = 'sk:area:jr-2f-south-concourse';
    expect(rules(model)).toContain('fare-zone');
  });

  it('rejects a ticket gate whose two sides are in the same zone', () => {
    const model = loadModel();
    const east = model.gates.find((g) => g.id === 'sk:gate:jr-east-gate')!;
    east.sides = [{ areaId: 'sk:area:jr-b1f-north-concourse' }, { areaId: 'sk:area:jr-b1f-central-passage' }];
    expect(rules(model)).toContain('gate-sides');
  });

  describe('vertical facilities', () => {
    const skipping = (): { model: StationModel; lift: VerticalFacility } => {
      const model = loadModel();
      const lift = model.verticals.find((v) => v.id === 'sk:vertical:jr-elevator-g')!;
      // drop the middle (1F) stop: B1F → 2F now skips a level
      lift.stops = [lift.stops[0]!, lift.stops[2]!];
      return { model, lift };
    };

    it('rejects a facility that skips a level without declaring it', () => {
      expect(rules(skipping().model)).toContain('vertical-adjacent');
    });

    it('accepts the same facility once the non-adjacent span is declared', () => {
      const { model, lift } = skipping();
      lift.declaredNonAdjacent = { reason: 'test: express lift that does not open on 1F' };
      expect(rules(model)).not.toContain('vertical-adjacent');
    });

    it('rejects a stop placed on a level its area is not on', () => {
      const model = loadModel();
      const lift = model.verticals.find((v) => v.id === 'sk:vertical:jr-elevator-a')!;
      lift.stops[0]!.levelId = 'sk:level:jr-east-shinjuku-b1f';
      expect(rules(model)).toContain('vertical-stops');
    });

    it('rejects a lift whose stops are not above one another', () => {
      const model = loadModel();
      const lift = model.verticals.find((v) => v.id === 'sk:vertical:jr-elevator-a')!;
      lift.stops[1]!.position = { x: lift.stops[1]!.position.x + 1, z: lift.stops[1]!.position.z };
      expect(rules(model)).toContain('geometry');
    });
  });

  it('rejects an element without a source, and a reference to an unknown source', () => {
    const a = loadModel();
    a.gates[0]!.provenance.sourceIds = [];
    expect(rules(a)).toContain('provenance');
    const b = loadModel();
    b.gates[0]!.provenance.sourceIds = ['src:does-not-exist'];
    expect(rules(b)).toContain('provenance');
  });

  it('does not let an unverified element claim better than "unknown" geometry', () => {
    const model = loadModel();
    model.unverifiedBlocks[0]!.geometryConfidence = 'schematic';
    expect(rules(model)).toContain('geometry-confidence');
  });

  it('does not let hand-entered geometry call itself "verified"', () => {
    const model = loadModel();
    model.gates[0]!.geometryConfidence = 'verified';
    expect(rules(model)).toContain('geometry-confidence');
  });

  it('rejects two areas overlapping on one level', () => {
    const model = loadModel();
    const north = model.areas.find((x) => x.id === 'sk:area:jr-b1f-north-concourse')!;
    north.footprint[0]!.x0 = -17; // push into the free passage
    expect(rules(model)).toContain('geometry');
  });
});
