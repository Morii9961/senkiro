import { existsSync } from 'node:fs';
import type { SkId, TrackSegment } from '@senkiro/contracts';
import { describe, expect, it } from 'vitest';
import {
  alignKsjStationsToTargets,
  KANSAI_BBOX,
  readKsjN02Archive,
  resolveKsjZipPath,
  splitJrWestTokaidoSanyoLine,
} from '../src/index.ts';

function chainSegment(id: string, from: string, to: string, ksjRaw: string): TrackSegment {
  return {
    id: id as SkId<'segment'>,
    externalIds: { ksj: ksjRaw },
    names: { ja: `${from} - ${to}`, ja_kana: null, en: null, zh: null },
    provenance: {
      sourceIds: ['sk:source:jp:mlit-ksj-n02-24'],
      dataNature: 'derived',
      lastVerifiedAt: '2026-11-28',
    },
    validFrom: null,
    validTo: null,
    fromStationId: from as SkId<'station'>,
    toStationId: to as SkId<'station'>,
    railLineIds: ['sk:line:kansai:jr-west-kyoto'],
    operatorId: 'sk:operator:jp:jr-west',
    geometry: [
      [135.0, 34.7],
      [135.1, 34.8],
    ],
    operatingKm: null,
    distanceNature: 'unknown',
    lineClass: 'trunk',
    isShinkansen: false,
    parallelConventionalLineId: null,
    fareZoneTags: [],
  };
}

describe('KSJ N02-24 splitter, 650m alignment, and local archive reading', () => {
  it('splits JR West Tokaido and Sanyo lines deterministically at Kyoto and Osaka boundaries', () => {
    const tokaido = [
      chainSegment(
        'sk:segment:kansai:seg-1',
        'sk:station:kansai:jr-west-maibara',
        'sk:station:kansai:jr-west-yamashina',
        '西日本旅客鉄道::東海道線',
      ),
      chainSegment(
        'sk:segment:kansai:seg-2',
        'sk:station:kansai:jr-west-yamashina',
        'sk:station:kansai:jr-west-kyoto',
        '西日本旅客鉄道::東海道線',
      ),
      chainSegment(
        'sk:segment:kansai:seg-3',
        'sk:station:kansai:jr-west-kyoto',
        'sk:station:kansai:jr-west-shinosaka',
        '西日本旅客鉄道::東海道線',
      ),
      chainSegment(
        'sk:segment:kansai:seg-4',
        'sk:station:kansai:jr-west-shinosaka',
        'sk:station:kansai:jr-west-osaka',
        '西日本旅客鉄道::東海道線',
      ),
      chainSegment(
        'sk:segment:kansai:seg-5',
        'sk:station:kansai:jr-west-osaka',
        'sk:station:kansai:jr-west-sannomiya',
        '西日本旅客鉄道::東海道線',
      ),
      chainSegment(
        'sk:segment:kansai:seg-6',
        'sk:station:kansai:jr-west-sannomiya',
        'sk:station:kansai:jr-west-kobe',
        '西日本旅客鉄道::東海道線',
      ),
    ];

    const sanyo = [
      chainSegment(
        'sk:segment:kansai:seg-7',
        'sk:station:kansai:jr-west-kobe',
        'sk:station:kansai:jr-west-himeji',
        '西日本旅客鉄道::山陽線',
      ),
    ];

    const split = splitJrWestTokaidoSanyoLine(tokaido, sanyo, {
      maibaraStationId: 'sk:station:kansai:jr-west-maibara',
      kyotoStationId: 'sk:station:kansai:jr-west-kyoto',
      osakaStationId: 'sk:station:kansai:jr-west-osaka',
      kobeStationId: 'sk:station:kansai:jr-west-kobe',
      himejiStationId: 'sk:station:kansai:jr-west-himeji',
      biwakoLineId: 'sk:line:kansai:jr-west-biwako',
      kyotoLineId: 'sk:line:kansai:jr-west-kyoto',
      kobeLineId: 'sk:line:kansai:jr-west-kobe',
    });

    const lineMap = new Map(split.map((s) => [s.id, s.railLineIds[0]]));
    expect(lineMap.get('sk:segment:kansai:seg-1')).toBe('sk:line:kansai:jr-west-biwako');
    expect(lineMap.get('sk:segment:kansai:seg-2')).toBe('sk:line:kansai:jr-west-biwako');
    expect(lineMap.get('sk:segment:kansai:seg-3')).toBe('sk:line:kansai:jr-west-kyoto');
    expect(lineMap.get('sk:segment:kansai:seg-4')).toBe('sk:line:kansai:jr-west-kyoto');
    expect(lineMap.get('sk:segment:kansai:seg-5')).toBe('sk:line:kansai:jr-west-kobe');
    expect(lineMap.get('sk:segment:kansai:seg-6')).toBe('sk:line:kansai:jr-west-kobe');
    expect(lineMap.get('sk:segment:kansai:seg-7')).toBe('sk:line:kansai:jr-west-kobe');
    expect(split[0]?.externalIds.ksj).toBe('西日本旅客鉄道::東海道線');
    expect(split[6]?.externalIds.ksj).toBe('西日本旅客鉄道::山陽線');
  });

  it('enforces the 650m spatial guard and retains unaligned records', () => {
    const result = alignKsjStationsToTargets(
      [
        {
          operatorName: '京都市',
          lineName: '烏丸線',
          stationName: '竹田',
          stationCode: '006172',
          groupCode: '006172',
          geometryPoints: [[135.75613, 34.95701]],
          midpoint: [135.75613, 34.95701],
        },
        {
          operatorName: '京都市',
          lineName: '烏丸線',
          stationName: '竹田',
          stationCode: '005116',
          groupCode: '005116',
          geometryPoints: [[134.83546, 35.29859]],
          midpoint: [134.83546, 35.29859],
        },
      ],
      [
        {
          stationId: 'sk:station:kansai:kyoto-subway-takeda',
          operatorId: 'sk:operator:jp:kyoto-subway',
          railLineIds: ['sk:line:kansai:kyoto-subway-karasuma'],
          canonicalJaName: '竹田',
          coordinates: [135.75613, 34.95701],
        },
      ],
      {
        sourceId: 'sk:source:jp:mlit-ksj-n02-24',
        operatorAliases: { 京都市: 'sk:operator:jp:kyoto-subway' },
        lineAliases: { 烏丸線: 'sk:line:kansai:kyoto-subway-karasuma' },
      },
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.stationId).toBe('sk:station:kansai:kyoto-subway-takeda');
    expect(result.unaligned).toHaveLength(1);
    expect(result.unaligned[0]?.reasonCode).toBe('BEYOND_SPATIAL_GUARD');
  });

  it('reads Kansai 8-operator features from local ksj-n02.zip in read-only mode', () => {
    const zipPath = resolveKsjZipPath();
    if (!existsSync(zipPath)) {
      return;
    }
    const data = readKsjN02Archive(zipPath, {
      bbox: KANSAI_BBOX,
      operators: new Set(['京都市', '阪急電鉄']),
    });
    expect(data.stations.length).toBeGreaterThan(80);
    expect(data.sections.length).toBeGreaterThan(80);
    expect(data.stations.some((s) => s.stationName === '京都河原町')).toBe(true);
    // Shikoku 三条 or Hyogo Bantan 竹田 are not in those operators / bbox
    expect(data.stations.some((s) => s.stationCode === '005116')).toBe(false);
  });
});
