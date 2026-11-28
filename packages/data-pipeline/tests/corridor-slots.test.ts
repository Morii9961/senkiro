import type { LineClass, SkId, TrackSegment } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import { assignCorridorSlots } from '../src/corridor-slots.ts';

function makeSeg(
  id: string,
  lineId: string,
  lineClass: LineClass,
  from = 'sk:station:kansai:jr-west-osaka',
  to = 'sk:station:kansai:jr-west-shinosaka',
): TrackSegment {
  return {
    id: id as SkId<'segment'>,
    externalIds: {},
    names: { ja: id, ja_kana: null, en: id, zh: id },
    provenance: {
      sourceIds: ['sk:source:jp:mlit-ksj-n02-24'],
      dataNature: 'derived',
      lastVerifiedAt: '2026-11-28',
    },
    validFrom: null,
    validTo: null,
    fromStationId: from as SkId<'station'>,
    toStationId: to as SkId<'station'>,
    railLineIds: [lineId as SkId<'line'>],
    operatorId: 'sk:operator:jp:jr-west',
    geometry: [
      [135.495, 34.702],
      [135.502, 34.734],
    ],
    operatingKm: null,
    distanceNature: 'unknown',
    lineClass,
    isShinkansen: lineClass === 'shinkansen',
    parallelConventionalLineId: null,
    fareZoneTags: [],
  };
}

describe('assignCorridorSlots', () => {
  it('assigns slot 0 and count 1 for an isolated segment', () => {
    const seg = makeSeg('sk:segment:kansai:solo', 'sk:line:kansai:jr-west-kyoto', 'trunk');
    const slots = assignCorridorSlots([seg]);
    expect(slots.get(seg.id)).toEqual({ corridorSlot: 0, corridorCount: 1 });
  });

  it('assigns deterministic alternating slots (0, 1, -1, 2, -2) for 5 parallel corridor tracks', () => {
    const s1 = makeSeg('sk:segment:kansai:s-metro', 'sk:line:kansai:osaka-metro-midosuji', 'metro');
    const s2 = makeSeg(
      'sk:segment:kansai:s-shinkansen',
      'sk:line:kansai:jr-west-sanyo-shinkansen',
      'shinkansen',
    );
    const s3 = makeSeg('sk:segment:kansai:s-trunk', 'sk:line:kansai:jr-west-kyoto', 'trunk');
    const s4 = makeSeg('sk:segment:kansai:s-private', 'sk:line:kansai:hankyu-kyoto', 'private');
    const s5 = makeSeg('sk:segment:kansai:s-local', 'sk:line:kansai:jr-west-east', 'local_line');

    const slots = assignCorridorSlots([s1, s2, s3, s4, s5]);
    expect(slots.get(s2.id)).toEqual({ corridorSlot: 0, corridorCount: 5 });
    expect(slots.get(s3.id)).toEqual({ corridorSlot: 1, corridorCount: 5 });
    expect(slots.get(s4.id)).toEqual({ corridorSlot: -1, corridorCount: 5 });
    expect(slots.get(s1.id)).toEqual({ corridorSlot: 2, corridorCount: 5 });
    expect(slots.get(s5.id)).toEqual({ corridorSlot: -2, corridorCount: 5 });
  });
});
