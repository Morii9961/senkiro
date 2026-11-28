import type { SkId } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import {
  type AlignmentOptions,
  alignExternalStations,
  type CanonicalStationTarget,
  DEFAULT_ALIGNMENT_GUARD_METERS,
  type ExternalStationCandidate,
  haversineMeters,
  normalizeStationNameJa,
} from '../src/index.ts';

/**
 * Real-world normalisation cases carried over from the Lab A suite. The alias tables are test
 * input: regional pipelines own them, the core ships none.
 */
const METRO: SkId<'operator'> = 'sk:operator:jp:tokyo-metro';
const TOEI: SkId<'operator'> = 'sk:operator:jp:toei';
const JR_EAST: SkId<'operator'> = 'sk:operator:jp:jr-east';

const options: AlignmentOptions = {
  operatorAliases: {
    東京メトロ: METRO,
    東京都交通局: TOEI,
    JR東日本: JR_EAST,
  },
  lineAliases: {
    浅草線: 'sk:line:kanto:toei-asakusa',
  },
};

const targets: CanonicalStationTarget[] = [
  {
    stationId: 'sk:station:kanto:tokyo-metro-kasumigaseki',
    operatorId: METRO,
    railLineIds: ['sk:line:kanto:metro-chiyoda'],
    canonicalJaName: '霞ケ関',
    coordinates: [139.7511, 35.6739],
  },
  {
    stationId: 'sk:station:kanto:jr-east-shinjuku',
    operatorId: JR_EAST,
    railLineIds: ['sk:line:kanto:jr-east-yamanote'],
    canonicalJaName: '新宿',
    coordinates: [139.7005, 35.6896],
  },
  {
    stationId: 'sk:station:kanto:toei-oshiage',
    operatorId: TOEI,
    railLineIds: ['sk:line:kanto:toei-asakusa'],
    canonicalJaName: '押上',
    coordinates: [139.8133, 35.7107],
  },
];

const candidate = (
  externalId: string,
  rawName: string,
  operatorRaw: string,
  lineRaw: string,
  coordinates: [number, number] | null,
): ExternalStationCandidate => ({
  sourceId: 'src-test',
  externalId,
  rawName,
  operatorRaw,
  lineRaw,
  coordinates,
});

describe('normalizeStationNameJa', () => {
  it('folds orthographic variants and parenthetical sub-names', () => {
    expect(normalizeStationNameJa('霞ヶ関駅')).toBe('霞ケ関');
    expect(normalizeStationNameJa('押上（スカイツリー前）')).toBe('押上');
    expect(normalizeStationNameJa('押上〈スカイツリー前〉')).toBe('押上');
    expect(normalizeStationNameJa('　御茶ノ水 ')).toBe('御茶の水');
  });

  it('never conflates semantically distinct names', () => {
    expect(normalizeStationNameJa('新宿')).not.toBe(normalizeStationNameJa('新宿三丁目'));
    expect(normalizeStationNameJa('新宿')).not.toBe(normalizeStationNameJa('西武新宿'));
    expect(normalizeStationNameJa('新宿')).not.toBe(normalizeStationNameJa('新宿西口'));
  });
});

describe('alignExternalStations — 650 m guard and explicit unaligned records', () => {
  it('uses 650 m as the default guard', () => {
    expect(DEFAULT_ALIGNMENT_GUARD_METERS).toBe(650);
  });

  it('matches valid candidates and keeps every mismatch with a reason (Lab A golden case)', () => {
    const result = alignExternalStations(
      [
        candidate('ext-1', '霞ヶ関', '東京メトロ', '千代田線', [139.7512, 35.674]),
        candidate('ext-2', '押上（スカイツリー前）', '東京都交通局', '浅草線', [139.8134, 35.7106]),
        candidate('ext-3', '西武新宿', 'JR東日本', '山手線', [139.7005, 35.694]),
        candidate('ext-4', '新宿', 'JR東日本', '山手線', [139.85, 35.6896]),
      ],
      targets,
      options,
    );
    expect(result.matched.map((m) => m.stationId)).toEqual([
      'sk:station:kanto:tokyo-metro-kasumigaseki',
      'sk:station:kanto:toei-oshiage',
    ]);
    expect(result.matched[0]?.ruleApplied).toBe('operator+normalized-name+spatial');
    expect(result.matched[1]?.ruleApplied).toBe('operator+normalized-name+line+spatial');
    expect(result.unaligned.map((u) => [u.externalId, u.reasonCode])).toEqual([
      ['ext-3', 'NO_NAME_MATCH'],
      ['ext-4', 'BEYOND_SPATIAL_GUARD'],
    ]);
    expect(result.unaligned[1]?.reason).toContain('spatial guard');
    expect(result.matched.length + result.unaligned.length).toBe(4);
  });

  it('rejects unknown operators, wrong lines and missing coordinates explicitly', () => {
    const result = alignExternalStations(
      [
        candidate('u-1', '押上', '謎の鉄道', '浅草線', [139.8133, 35.7107]),
        candidate('u-2', '押上', '東京都交通局', '浅草線', null),
        candidate('u-3', '霞ヶ関', '東京メトロ', '浅草線', [139.7511, 35.6739]),
      ],
      targets,
      options,
    );
    expect(result.matched).toEqual([]);
    expect(result.unaligned.map((u) => u.reasonCode)).toEqual([
      'UNKNOWN_OPERATOR',
      'MISSING_COORDINATES',
      'NOT_ON_LINE',
    ]);
  });

  it('honours a custom guard distance and a custom normaliser', () => {
    const near = candidate('n-1', '霞ヶ関', '東京メトロ', '', [139.7535, 35.6739]);
    const distance = haversineMeters([139.7535, 35.6739], [139.7511, 35.6739]);
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(650);
    expect(alignExternalStations([near], targets, options).matched).toHaveLength(1);
    expect(
      alignExternalStations([near], targets, { ...options, maxDistanceMeters: 100 }).unaligned[0]
        ?.reasonCode,
    ).toBe('BEYOND_SPATIAL_GUARD');
    expect(
      alignExternalStations([near], targets, { ...options, normalizeName: (raw) => raw })
        .unaligned[0]?.reasonCode,
    ).toBe('NO_NAME_MATCH');
  });
});
