import { assertOdbLIsolation, isSkId } from '@senkiro/contracts';
import { shinjukuHubDataset } from '@senkiro/data-stations/shinjuku';
import { TrackGraphIndex } from '@senkiro/domain-core';
import { describe, expect, it } from 'vitest';
import {
  kantoPreviewAtlasBundle,
  kantoThroughServices,
  kantoTrackGraph,
  kantoUnalignedRecords,
  kantoVerticalLayer,
} from '../src/kanto-preview/index.ts';

describe('Kanto preview TrackGraph and ODbL isolation invariants', () => {
  it('indexes with zero TrackGraphIndex issues and valid v1.0 SkIds', () => {
    const index = new TrackGraphIndex(kantoPreviewAtlasBundle.trackGraph);
    expect(index.issues).toEqual([]);

    for (const op of kantoTrackGraph.operators) {
      expect(isSkId(op.id, 'operator')).toBe(true);
    }
    for (const line of kantoTrackGraph.lines) {
      expect(isSkId(line.id, 'line')).toBe(true);
    }
    for (const st of kantoTrackGraph.stations) {
      expect(isSkId(st.id, 'station')).toBe(true);
    }
    for (const seg of kantoTrackGraph.segments) {
      expect(isSkId(seg.id, 'segment')).toBe(true);
    }
    for (const cx of kantoTrackGraph.complexes) {
      expect(isSkId(cx.id, 'complex')).toBe(true);
    }
    for (const ts of kantoThroughServices) {
      expect(isSkId(ts.id, 'through')).toBe(true);
    }
    expect(kantoUnalignedRecords.length).toBeGreaterThan(0);
  });

  it('isolates OSM ODbL vertical layer cleanly from kantoTrackGraph', () => {
    const records = [
      ...kantoTrackGraph.operators,
      ...kantoTrackGraph.lines,
      ...kantoTrackGraph.stations,
      ...kantoTrackGraph.segments,
      ...kantoTrackGraph.complexes,
      ...kantoTrackGraph.interchanges,
      ...kantoThroughServices,
    ];
    expect(() =>
      assertOdbLIsolation({
        sources: kantoTrackGraph.sources,
        records,
      }),
    ).not.toThrow();

    expect(kantoVerticalLayer.sources.some((s) => s.shareAlike === true)).toBe(true);
    expect(kantoVerticalLayer.attributes.length).toBeGreaterThan(400);
    const segIdSet = new Set(kantoTrackGraph.segments.map((s) => s.id));
    for (const attr of kantoVerticalLayer.attributes) {
      expect(segIdSet.has(attr.trackSegmentId)).toBe(true);
    }
  });

  it('matches Shinjuku 10 stations with shinjukuHubDataset and Kanto JR fare-engine line IDs', () => {
    const shinjukuComplex = kantoTrackGraph.complexes.find(
      (c) => c.id === 'sk:complex:kanto:shinjuku',
    );
    expect(shinjukuComplex).toBeDefined();
    expect(shinjukuComplex?.stationIds).toEqual(shinjukuHubDataset.complex.stationIds);

    const lineIds = new Set(kantoTrackGraph.lines.map((l) => l.id));
    for (const expectedLine of [
      'sk:line:kanto:jr-east-tohoku',
      'sk:line:kanto:jr-east-tohoku-oku',
      'sk:line:kanto:jr-east-tohoku-saikyo',
      'sk:line:kanto:jr-east-tokaido',
      'sk:line:kanto:jr-east-tokaido-hinkaku',
    ] as const) {
      expect(lineIds.has(expectedLine)).toBe(true);
    }

    const jrStations = kantoTrackGraph.stations.filter((s) =>
      s.fareZoneTags.includes('suburban:tokyo'),
    );
    expect(jrStations.length).toBeGreaterThan(20);
  });
});
