import { assertOdbLIsolation, isSkId } from '@senkiro/contracts';
import { umedaHubDataset } from '@senkiro/data-stations/umeda';
import { TrackGraphIndex } from '@senkiro/domain-core';
import { describe, expect, it } from 'vitest';
import {
  KANSAI_LINE_SPECS,
  KANSAI_OPERATOR_SPECS,
  KANSAI_THROUGH_SERVICES,
  kansaiAtlasBundle,
  kansaiThroughServices,
  kansaiTrackGraph,
  kansaiUnalignedRecords,
  searchAtlasEntities,
} from '../src/index.ts';

describe('Kansai 8-operator TrackGraph invariants', () => {
  it('indexes with zero TrackGraphIndex issues and valid v1.0 four-segment SkIds', () => {
    const index = new TrackGraphIndex(kansaiAtlasBundle.trackGraph);
    expect(index.issues).toEqual([]);

    for (const op of kansaiTrackGraph.operators) {
      expect(isSkId(op.id, 'operator')).toBe(true);
    }
    for (const line of kansaiTrackGraph.lines) {
      expect(isSkId(line.id, 'line')).toBe(true);
    }
    for (const st of kansaiTrackGraph.stations) {
      expect(isSkId(st.id, 'station')).toBe(true);
    }
    for (const seg of kansaiTrackGraph.segments) {
      expect(isSkId(seg.id, 'segment')).toBe(true);
    }
    for (const cx of kansaiTrackGraph.complexes) {
      expect(isSkId(cx.id, 'complex')).toBe(true);
    }
    for (const ic of kansaiTrackGraph.interchanges) {
      expect(isSkId(ic.id, 'interchange')).toBe(true);
    }
    for (const ts of kansaiThroughServices) {
      expect(isSkId(ts.id, 'through')).toBe(true);
    }
  });

  it('passes assertOdbLIsolation with zero shareAlike or unknown sources', () => {
    const records = [
      ...kansaiTrackGraph.operators,
      ...kansaiTrackGraph.lines,
      ...kansaiTrackGraph.stations,
      ...kansaiTrackGraph.segments,
      ...kansaiTrackGraph.complexes,
      ...kansaiTrackGraph.interchanges,
      ...kansaiThroughServices,
    ];
    expect(() =>
      assertOdbLIsolation({
        sources: kansaiTrackGraph.sources,
        records,
      }),
    ).not.toThrow();
  });

  it('includes all 8 frozen operators, 63 frozen lines, 19 Umeda lines, and 5 through services', () => {
    expect(kansaiTrackGraph.operators).toHaveLength(8);
    const opIds = new Set(kansaiTrackGraph.operators.map((o) => o.id));
    for (const spec of KANSAI_OPERATOR_SPECS) {
      expect(opIds.has(spec.id)).toBe(true);
    }

    expect(kansaiTrackGraph.lines).toHaveLength(KANSAI_LINE_SPECS.length);
    const lineIds = new Set(kansaiTrackGraph.lines.map((l) => l.id));
    for (const umedaLine of umedaHubDataset.lines) {
      expect(lineIds.has(umedaLine.id)).toBe(true);
    }
    for (const line of kansaiTrackGraph.lines) {
      expect(line.stationIds.length).toBeGreaterThan(0);
    }

    expect(kansaiThroughServices).toHaveLength(KANSAI_THROUGH_SERVICES.length);
    const stationIds = new Set(kansaiTrackGraph.stations.map((s) => s.id));
    for (const ts of kansaiThroughServices) {
      expect(stationIds.has(ts.boundaryStationId)).toBe(true);
      expect(lineIds.has(ts.fromRailLineId)).toBe(true);
      expect(lineIds.has(ts.toRailLineId)).toBe(true);
    }
  });

  it('matches Umeda 7 stations 100% and enforces Kyoto 4-station anti-merge boundaries', () => {
    const umedaComplex = kansaiTrackGraph.complexes.find(
      (c) => c.id === 'sk:complex:kansai:osaka-umeda',
    );
    expect(umedaComplex).toBeDefined();
    expect(umedaComplex?.stationIds).toEqual(umedaHubDataset.complex.stationIds);

    const kyotoComplex = kansaiTrackGraph.complexes.find((c) => c.id === 'sk:complex:kansai:kyoto');
    expect(kyotoComplex).toBeDefined();
    expect(kyotoComplex?.stationIds).toEqual([
      'sk:station:kansai:jr-west-kyoto',
      'sk:station:kansai:jr-central-kyoto',
      'sk:station:kansai:kintetsu-kyoto',
      'sk:station:kansai:kyoto-subway-kyoto',
    ]);
    const excludedIds = new Set(
      kyotoComplex?.explicitlyExcluded.map((e) => e.stationId).filter(Boolean) ?? [],
    );
    expect(excludedIds.has('sk:station:kansai:hankyu-kyoto-kawaramachi')).toBe(true);
    expect(excludedIds.has('sk:station:kansai:keihan-gion-shijo')).toBe(true);
    expect(excludedIds.has('sk:station:kansai:hankyu-karasuma')).toBe(true);
    expect(excludedIds.has('sk:station:kansai:kyoto-subway-shijo')).toBe(true);
    expect(excludedIds.has('sk:station:kansai:keihan-shichijo')).toBe(true);

    // Takeda in Kyoto must not merge Hyogo Bantan Line Takeda
    const takedaComplex = kansaiTrackGraph.complexes.find(
      (c) => c.id === 'sk:complex:kansai:takeda',
    );
    expect(takedaComplex?.stationIds).toEqual([
      'sk:station:kansai:kyoto-subway-takeda',
      'sk:station:kansai:kintetsu-takeda',
    ]);
    expect(
      takedaComplex?.explicitlyExcluded.some(
        (e) => e.stationId === 'sk:station:kansai:jr-west-bantan-takeda',
      ),
    ).toBe(true);
  });

  it('keeps unverified operatingKm and walkingMinutes null and preserves UnalignedRecord[]', () => {
    for (const seg of kansaiTrackGraph.segments) {
      expect(seg.operatingKm).toBeNull();
      expect(seg.distanceNature).toBe('unknown');
    }
    for (const ic of kansaiTrackGraph.interchanges) {
      expect(ic.walkingMinutes).toBeNull();
    }
    expect(kansaiUnalignedRecords.length).toBeGreaterThan(0);
  });

  it('disambiguates Osaka, Umeda, Kyoto, Kawaramachi, and Gion-Shijo in search fixtures', () => {
    const osakaHits = searchAtlasEntities(kansaiTrackGraph, '大阪');
    expect(osakaHits.some((h) => h.id === 'sk:complex:kansai:osaka-umeda')).toBe(true);
    expect(osakaHits.some((h) => h.id === 'sk:station:kansai:jr-west-osaka')).toBe(true);
    expect(osakaHits.some((h) => h.id === 'sk:station:kansai:jr-west-shinosaka')).toBe(true);

    const umedaHits = searchAtlasEntities(kansaiTrackGraph, '梅田');
    expect(umedaHits.some((h) => h.id === 'sk:station:kansai:osaka-metro-umeda')).toBe(true);
    expect(umedaHits.some((h) => h.id === 'sk:station:kansai:hankyu-osaka-umeda')).toBe(true);
    expect(umedaHits.some((h) => h.id === 'sk:station:kansai:hanshin-osaka-umeda')).toBe(true);

    const kyotoHits = searchAtlasEntities(kansaiTrackGraph, '京都');
    expect(kyotoHits.some((h) => h.id === 'sk:complex:kansai:kyoto')).toBe(true);
    expect(kyotoHits.some((h) => h.id === 'sk:station:kansai:jr-west-kyoto')).toBe(true);
    expect(kyotoHits.some((h) => h.id === 'sk:station:kansai:hankyu-kyoto-kawaramachi')).toBe(true);

    const kawaramachiHits = searchAtlasEntities(kansaiTrackGraph, '河原町');
    const kawaStation = kawaramachiHits.find(
      (h) => h.id === 'sk:station:kansai:hankyu-kyoto-kawaramachi',
    );
    expect(kawaStation?.stationComplexId).toBe('sk:complex:kansai:shijo-kawaramachi');
    expect(kawaStation?.stationComplexId).not.toBe('sk:complex:kansai:kyoto');

    const gionHits = searchAtlasEntities(kansaiTrackGraph, '祇園四条');
    const gionStation = gionHits.find((h) => h.id === 'sk:station:kansai:keihan-gion-shijo');
    expect(gionStation?.stationComplexId).toBe('sk:complex:kansai:shijo-kawaramachi');
    expect(gionStation?.stationComplexId).not.toBe('sk:complex:kansai:kyoto');
  });
});
