import { describe, expect, it } from 'vitest';
import {
  alignExternalStations,
  normalizeStationNameJa,
  type CanonicalStationTarget,
  type ExternalStationCandidate,
} from '../../src/domain/alignment.js';
import { StaticAtlasProvider } from '../../src/providers/atlasProvider.js';
import type { VerticalClass } from '../../src/domain/types.js';

const provider = new StaticAtlasProvider();
const dataset = provider.getAtlasDataset();
const allSources = provider.getAllSources();

describe('Cross-Source Station Alignment Rules', () => {
  const targets: CanonicalStationTarget[] = [
    {
      stationId: 'sk:station:tokyo-metro-kasumigaseki',
      operatorId: 'sk:operator:tokyo-metro',
      railLineIds: ['sk:line:metro-chiyoda'],
      canonicalJaName: '霞ケ関',
      coordinates: [139.7511, 35.6739],
    },
    {
      stationId: 'sk:station:jr-east-shinjuku',
      operatorId: 'sk:operator:jr-east',
      railLineIds: ['sk:line:jr-east-yamanote'],
      canonicalJaName: '新宿',
      coordinates: [139.7005, 35.6896],
    },
    {
      stationId: 'sk:station:toei-oshiage',
      operatorId: 'sk:operator:toei',
      railLineIds: ['sk:line:toei-asakusa'],
      canonicalJaName: '押上',
      coordinates: [139.8133, 35.7107],
    },
  ];

  it('normalizes ヶ/ケ variants and strips parenthetical sub-names without conflating distinct stations', () => {
    expect(normalizeStationNameJa('霞ヶ関駅')).toBe('霞ケ関');
    expect(normalizeStationNameJa('押上（スカイツリー前）')).toBe('押上');
    expect(normalizeStationNameJa('新宿')).not.toBe(normalizeStationNameJa('新宿三丁目'));
    expect(normalizeStationNameJa('新宿')).not.toBe(normalizeStationNameJa('西武新宿'));
  });

  it('matches valid cross-source candidates and preserves unaligned mismatches explicitly', () => {
    const candidates: ExternalStationCandidate[] = [
      {
        sourceId: 'src-test',
        externalId: 'ext-1',
        rawName: '霞ヶ関',
        operatorRaw: '東京メトロ',
        lineRaw: '千代田線',
        coordinates: [139.7512, 35.674],
      },
      {
        sourceId: 'src-test',
        externalId: 'ext-2',
        rawName: '押上（スカイツリー前）',
        operatorRaw: '東京都交通局',
        lineRaw: '浅草線',
        coordinates: [139.8134, 35.7106],
      },
      {
        sourceId: 'src-test',
        externalId: 'ext-3',
        rawName: '西武新宿',
        operatorRaw: 'JR東日本', // Wrong operator & distinct name — must NOT merge into JR Shinjuku
        lineRaw: '山手線',
        coordinates: [139.7005, 35.694],
      },
      {
        sourceId: 'src-test',
        externalId: 'ext-4',
        rawName: '新宿',
        operatorRaw: 'JR東日本',
        lineRaw: '山手線',
        coordinates: [139.85, 35.6896], // Way beyond 650m spatial guard!
      },
    ];

    const res = alignExternalStations(candidates, targets);
    expect(res.matched.length).toBe(2);
    expect(res.matched.map((m) => m.stationId)).toEqual([
      'sk:station:tokyo-metro-kasumigaseki',
      'sk:station:toei-oshiage',
    ]);
    expect(res.unaligned.length).toBe(2);
    expect(res.unaligned[0]?.externalId).toBe('ext-3');
    expect(res.unaligned[1]?.externalId).toBe('ext-4');
    expect(res.unaligned[1]?.reason).toContain('spatial guard');
  });
});

describe('Dataset Consistency & Honesty Invariants (Must #16 & Should #21)', () => {
  const sourceIdSet = new Set(allSources.map((s) => s.id));

  it('every visible entity has valid provenance referencing registered SourceRecords', () => {
    const allEntities = [
      ...dataset.operators,
      ...dataset.railLines,
      ...dataset.stations,
      ...dataset.stationComplexes,
      ...dataset.trackSegments,
      ...dataset.interchanges,
      ...dataset.servicePatterns,
      ...dataset.throughServices,
    ];
    expect(allEntities.length).toBeGreaterThan(500);
    for (const entity of allEntities) {
      expect(entity.id).toMatch(/^sk:[a-z]+:/);
      expect(entity.provenance.sourceIds.length).toBeGreaterThan(0);
      expect(entity.provenance.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const sid of entity.provenance.sourceIds) {
        expect(sourceIdSet.has(sid)).toBe(true);
      }
    }
  });

  it('every RailLine has a continuous station sequence backed by TrackSegments', () => {
    const segSet = new Set<string>();
    for (const seg of dataset.trackSegments) {
      for (const lid of seg.railLineIds) {
        segSet.add(`${lid}::${seg.fromStationId}::${seg.toStationId}`);
        segSet.add(`${lid}::${seg.toStationId}::${seg.fromStationId}`);
      }
    }

    for (const line of dataset.railLines) {
      expect(line.stationIds.length).toBeGreaterThanOrEqual(2);
      // No consecutive duplicate stations
      for (let i = 0; i < line.stationIds.length - 1; i++) {
        const a = line.stationIds[i];
        const b = line.stationIds[i + 1];
        expect(a).not.toBe(b);
        expect(segSet.has(`${line.id}::${a}::${b}`)).toBe(true);
      }
    }
  });

  it('similar-name distinct stations (新宿 / 新宿三丁目 / 西武新宿 / 新宿西口) are strictly different StationComplexes', () => {
    const findComplexes = (name: string) => [
      ...new Set(
        dataset.stations
          .filter((s) => s.names.ja === name)
          .map((s) => s.stationComplexId),
      ),
    ];

    const shinjuku = findComplexes('新宿');
    const sanchome = findComplexes('新宿三丁目');
    const seibu = findComplexes('西武新宿');
    const nishiguchi = findComplexes('新宿西口');

    expect(shinjuku).toEqual(['sk:complex:shinjuku']);
    expect(sanchome).toEqual(['sk:complex:shinjuku-sanchome']);
    expect(seibu).toEqual(['sk:complex:seibu-shinjuku']);
    expect(nishiguchi).toEqual(['sk:complex:shinjuku-nishiguchi']);
  });

  it('different-name walkable hubs share StationComplex (上野+京成上野 and 溜池山王+国会議事堂前)', () => {
    const ueno = dataset.stations.find(
      (s) => s.operatorId === 'sk:operator:jr-east' && s.names.ja === '上野',
    );
    const keiseiUeno = dataset.stations.find(
      (s) => s.operatorId === 'sk:operator:keisei' && s.names.ja === '京成上野',
    );
    expect(ueno?.stationComplexId).toBe('sk:complex:ueno');
    expect(keiseiUeno?.stationComplexId).toBe('sk:complex:ueno');

    const tameike = dataset.stations.find((s) => s.names.ja === '溜池山王');
    const kokkai = dataset.stations.find((s) => s.names.ja === '国会議事堂前');
    expect(tameike?.stationComplexId).toBe('sk:complex:tameike-kokkai');
    expect(kokkai?.stationComplexId).toBe('sk:complex:tameike-kokkai');
  });

  it('every station in the JR fare slice exists in the map dataset with coordinates', () => {
    const fareSliceLines = dataset.railLines.filter((l) => l.inFareSlice);
    expect(fareSliceLines.length).toBeGreaterThanOrEqual(10);
    const stationMap = new Map(dataset.stations.map((s) => [s.id, s]));
    for (const line of fareSliceLines) {
      for (const sid of line.stationIds) {
        const st = stationMap.get(sid);
        expect(st).toBeDefined();
        expect(st?.inFareSlice).toBe(true);
        expect(st?.coordinates.length).toBe(2);
      }
    }
  });

  it('preserves unaligned ODPT Toei GTFS records explicitly rather than silently dropping them', () => {
    expect(dataset.unalignedRecords.length).toBeGreaterThan(0);
    for (const rec of dataset.unalignedRecords) {
      expect(rec.reason.length).toBeGreaterThan(5);
      expect(rec.sourceId).toBe('src-odpt-toei-gtfs');
    }
  });

  it('maintains strict ODbL isolation: core atlas has NO share-alike sources, and isolated osm-vertical.json covers every TrackSegment with null elevationM', async () => {
    expect(dataset.sources.every((s) => s.shareAlike === false)).toBe(true);

    const vertical = await provider.loadOsmVerticalOverlay();
    expect(vertical.source.shareAlike).toBe(true);
    expect(vertical.source.license).toContain('ODbL');

    const validClasses = new Set<VerticalClass>([
      'elevated',
      'at_grade',
      'underground',
      'unknown',
    ]);
    const bySegId = new Map(vertical.records.map((r) => [r.trackSegmentId, r]));

    for (const seg of dataset.trackSegments) {
      const rec = bySegId.get(seg.id);
      expect(rec).toBeDefined();
      expect(validClasses.has(rec!.verticalClass)).toBe(true);
      // Honesty rule (Should #21): without an official manual-verified elevation source, elevationM MUST be null
      expect(rec!.elevationM).toBeNull();
      expect(rec!.provenance.sourceIds).toEqual(['src-osm-overpass-vertical']);
    }
  });
});
