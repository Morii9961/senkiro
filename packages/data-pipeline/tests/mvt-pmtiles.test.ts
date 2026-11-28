import type {
  Operator,
  RailLine,
  Station,
  StationComplex,
  ThroughService,
  TrackGraph,
  TrackSegment,
  TrackVerticalLayer,
} from '@senkiro/contracts';
import { Compression, PMTiles, type RangeResponse, type Source, TileType } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import {
  buildAtlasPmtiles,
  buildPmtilesArchive,
  buildVerticalOdblPmtiles,
  decodeMvtTile,
  encodeMvtTile,
  zigzag32,
} from '../src/index.ts';

function bufferToSource(buf: Buffer, key = 'memory://test.pmtiles'): Source {
  return {
    getKey: () => key,
    async getBytes(offset: number, length: number): Promise<RangeResponse> {
      const end = Math.min(buf.length, offset + length);
      const slice = buf.subarray(offset, end);
      const copy = new Uint8Array(slice.length);
      copy.set(slice);
      return { data: copy.buffer };
    },
  };
}

function makeFixtureGraph(): {
  trackGraph: TrackGraph;
  throughServices: ThroughService[];
  verticalLayer: TrackVerticalLayer;
} {
  const provenance = {
    sourceIds: ['sk:source:jp:mlit-ksj-n02-24'],
    dataNature: 'derived' as const,
    lastVerifiedAt: '2026-11-28',
  };

  const operators: Operator[] = [
    {
      id: 'sk:operator:jp:jr-west',
      externalIds: {},
      names: { ja: 'JR西日本', ja_kana: null, en: 'JR West', zh: 'JR西日本' },
      provenance,
      validFrom: null,
      validTo: null,
      category: 'jr',
      brandColor: '#0072bc',
      coverageStatus: 'full',
      coverageNotes: '',
    },
  ];

  const lines: RailLine[] = [
    {
      id: 'sk:line:kansai:jr-west-kyoto',
      externalIds: {},
      names: { ja: 'JR京都線', ja_kana: null, en: 'JR Kyoto Line', zh: 'JR京都线' },
      provenance,
      validFrom: null,
      validTo: null,
      operatorId: 'sk:operator:jp:jr-west',
      color: '#0071bb',
      stationCodePrefix: 'A',
      lineClass: 'trunk',
      stationIds: ['sk:station:kansai:jr-west-osaka', 'sk:station:kansai:jr-west-kyoto'],
      coverageStatus: 'full',
    },
  ];

  const stations: Station[] = [
    {
      id: 'sk:station:kansai:jr-west-osaka',
      externalIds: {},
      names: { ja: '大阪', ja_kana: null, en: 'Osaka', zh: '大阪' },
      provenance,
      validFrom: null,
      validTo: null,
      operatorId: 'sk:operator:jp:jr-west',
      railLineIds: ['sk:line:kansai:jr-west-kyoto'],
      stationComplexId: 'sk:complex:kansai:osaka-umeda',
      stationCode: 'A47',
      coordinates: [135.49491, 34.70248],
      municipalityCode: null,
      wardOrCity: '大阪市北区',
      fareZoneTags: [],
    },
    {
      id: 'sk:station:kansai:jr-west-kyoto',
      externalIds: {},
      names: { ja: '京都', ja_kana: null, en: 'Kyoto', zh: '京都' },
      provenance,
      validFrom: null,
      validTo: null,
      operatorId: 'sk:operator:jp:jr-west',
      railLineIds: ['sk:line:kansai:jr-west-kyoto'],
      stationComplexId: 'sk:complex:kansai:kyoto',
      stationCode: 'A31',
      coordinates: [135.75876, 34.98562],
      municipalityCode: null,
      wardOrCity: '京都市下京区',
      fareZoneTags: [],
    },
  ];

  const complexes: StationComplex[] = [
    {
      id: 'sk:complex:kansai:osaka-umeda',
      externalIds: {},
      names: { ja: '大阪・梅田', ja_kana: null, en: 'Osaka / Umeda', zh: '大阪·梅田' },
      provenance,
      validFrom: null,
      validTo: null,
      stationIds: ['sk:station:kansai:jr-west-osaka'],
      coordinates: [135.49725, 34.70158],
      wardOrCity: '大阪市北区',
      explicitlyExcluded: [],
    },
    {
      id: 'sk:complex:kansai:kyoto',
      externalIds: {},
      names: { ja: '京都', ja_kana: null, en: 'Kyoto', zh: '京都' },
      provenance,
      validFrom: null,
      validTo: null,
      stationIds: ['sk:station:kansai:jr-west-kyoto'],
      coordinates: [135.75876, 34.98562],
      wardOrCity: '京都市下京区',
      explicitlyExcluded: [],
    },
  ];

  const segments: TrackSegment[] = [
    {
      id: 'sk:segment:kansai:jr-west-kyoto--osaka--kyoto',
      externalIds: { ksj: '西日本旅客鉄道::東海道線' },
      names: { ja: '大阪 — 京都', ja_kana: null, en: 'Osaka - Kyoto', zh: '大阪 — 京都' },
      provenance,
      validFrom: null,
      validTo: null,
      fromStationId: 'sk:station:kansai:jr-west-osaka',
      toStationId: 'sk:station:kansai:jr-west-kyoto',
      railLineIds: ['sk:line:kansai:jr-west-kyoto'],
      operatorId: 'sk:operator:jp:jr-west',
      geometry: [
        [135.49491, 34.70248],
        [135.6157, 34.8515],
        [135.75876, 34.98562],
      ],
      operatingKm: null,
      distanceNature: 'unknown',
      lineClass: 'trunk',
      isShinkansen: false,
      parallelConventionalLineId: null,
      fareZoneTags: [],
    },
  ];

  const throughServices: ThroughService[] = [
    {
      id: 'sk:through:kansai:jr-west-biwako-kyoto-kobe-special-rapid',
      externalIds: {},
      names: {
        ja: 'JR新快速 直通',
        ja_kana: null,
        en: 'JR Special Rapid Through',
        zh: 'JR新快速直通',
      },
      provenance,
      validFrom: null,
      validTo: null,
      boundaryStationId: 'sk:station:kansai:jr-west-kyoto',
      fromRailLineId: 'sk:line:kansai:jr-west-kyoto',
      toRailLineId: 'sk:line:kansai:jr-west-kyoto',
      operatorIds: ['sk:operator:jp:jr-west'],
      serviceDescription: 'Special Rapid',
      notes: null,
    },
  ];

  const verticalLayer: TrackVerticalLayer = {
    sources: [
      {
        id: 'sk:source:jp:osm-rail-vertical',
        title: 'OSM Rail Vertical',
        publisher: 'OpenStreetMap',
        url: null,
        retrievedAt: '2026-11-28',
        sourceDate: null,
        license: 'ODbL 1.0',
        licenseUrl: null,
        commercialUse: 'yes',
        redistribution: 'yes',
        shareAlike: true,
        attributionText: '© OpenStreetMap contributors',
        notes: '',
      },
    ],
    attributes: [
      {
        trackSegmentId: 'sk:segment:kansai:jr-west-kyoto--osaka--kyoto',
        verticalClass: 'elevated',
        verticalOrder: 1,
        elevationM: null,
        provenance: {
          sourceIds: ['sk:source:jp:osm-rail-vertical'],
          dataNature: 'derived',
          lastVerifiedAt: '2026-11-28',
        },
      },
    ],
  };

  return {
    trackGraph: {
      operators,
      lines,
      segments,
      stations,
      complexes,
      interchanges: [],
      sources: [],
    },
    throughServices,
    verticalLayer,
  };
}

describe('MVT v2.1 codec and PMTiles v3 builder', () => {
  it('computes zigzag32 encoding and round-trips Point + LineString MVT features', () => {
    expect(zigzag32(0)).toBe(0);
    expect(zigzag32(-1)).toBe(1);
    expect(zigzag32(1)).toBe(2);
    expect(zigzag32(-2)).toBe(3);

    const encoded = encodeMvtTile({
      layers: [
        {
          name: 'rail_stations',
          extent: 4096,
          features: [
            {
              id: 10,
              properties: { id: 'st-1', rank: 1, active: true, ratio: 1.5 },
              geometry: { type: 'Point', points: [[1200, 2400]] },
            },
          ],
        },
        {
          name: 'rail_segments',
          extent: 4096,
          features: [
            {
              id: 20,
              properties: { id: 'seg-1', corridor_slot: -2 },
              geometry: {
                type: 'LineString',
                lines: [
                  [
                    [100, 200],
                    [500, 600],
                    [900, 1000],
                  ],
                ],
              },
            },
          ],
        },
      ],
    });

    const decoded = decodeMvtTile(encoded);
    const stLayer = decoded.layers.rail_stations;
    expect(stLayer?.version).toBe(2);
    expect(stLayer?.extent).toBe(4096);
    expect(stLayer?.features[0]).toEqual({
      id: 10,
      type: 1,
      properties: { id: 'st-1', rank: 1, active: true, ratio: 1.5 },
      geometry: [[[1200, 2400]]],
    });

    const segLayer = decoded.layers.rail_segments;
    expect(segLayer?.features[0]).toEqual({
      id: 20,
      type: 2,
      properties: { id: 'seg-1', corridor_slot: -2 },
      geometry: [
        [
          [100, 200],
          [500, 600],
          [900, 1000],
        ],
      ],
    });
  });

  it('builds a valid PMTiles v3 archive readable with new PMTiles(...) across all 4 spec layers', async () => {
    const { trackGraph, throughServices, verticalLayer } = makeFixtureGraph();
    const hubKeys = new Map([
      ['sk:complex:kansai:osaka-umeda' as const, 'umeda' as const],
      ['sk:complex:kansai:kyoto' as const, 'kyoto' as const],
    ]);
    const archiveBuf = buildAtlasPmtiles({
      trackGraph,
      throughServices,
      hubKeyByComplexId: hubKeys,
      bounds: [135.4, 34.6, 135.9, 35.1],
      center: [135.62, 34.85, 10],
      minZoom: 6,
      maxZoom: 12,
      name: 'test-kansai',
      attribution: 'KSJ N02-24',
    });

    expect(archiveBuf.subarray(0, 7).toString('ascii')).toBe('PMTiles');
    expect(archiveBuf.readUInt8(7)).toBe(3);

    const pmtiles = new PMTiles(bufferToSource(archiveBuf));
    const header = await pmtiles.getHeader();
    expect(header.minZoom).toBe(6);
    expect(header.maxZoom).toBe(12);
    expect(header.tileType).toBe(TileType.Mvt);
    expect(header.internalCompression).toBe(Compression.Gzip);
    expect(header.tileCompression).toBe(Compression.Gzip);

    const meta = (await pmtiles.getMetadata()) as { name?: string };
    expect(meta.name).toBe('test-kansai');

    // Tile covering Osaka (135.49491, 34.70248) at z12: x = 3589, y = 1626
    const x = Math.floor(((135.49491 + 180) / 360) * 2 ** 12);
    const latRad = (34.70248 * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** 12,
    );
    const tileRes = await pmtiles.getZxy(12, x, y);
    expect(tileRes).toBeDefined();
    if (tileRes === undefined) {
      throw new Error('Expected tile at z12 over Osaka');
    }

    const decoded = decodeMvtTile(new Uint8Array(tileRes.data));
    expect(Object.keys(decoded.layers)).not.toContain('rail_vertical');
    expect(decoded.layers.rail_segments?.features[0]?.properties).toMatchObject({
      id: 'sk:segment:kansai:jr-west-kyoto--osaka--kyoto',
      operator_id: 'sk:operator:jp:jr-west',
      primary_line_id: 'sk:line:kansai:jr-west-kyoto',
      color: '#0071bb',
      line_class: 'trunk',
      is_shinkansen: false,
      corridor_slot: 0,
      corridor_count: 1,
      label_zh_cn: 'JR京都线',
      label_ja: 'JR京都線',
      label_en: 'JR Kyoto Line',
    });
    expect(decoded.layers.rail_stations?.features[0]?.properties).toMatchObject({
      id: 'sk:station:kansai:jr-west-osaka',
      complex_id: 'sk:complex:kansai:osaka-umeda',
      station_code: 'A47',
      importance_rank: 1,
      label_zh_cn: '大阪',
    });
    expect(decoded.layers.station_complexes?.features[0]?.properties).toMatchObject({
      id: 'sk:complex:kansai:osaka-umeda',
      hub_key: 'umeda',
      station_count: 1,
    });

    // Kyoto through boundary at z12
    const kx = Math.floor(((135.75876 + 180) / 360) * 2 ** 12);
    const kLatRad = (34.98562 * Math.PI) / 180;
    const ky = Math.floor(
      ((1 - Math.log(Math.tan(kLatRad) + 1 / Math.cos(kLatRad)) / Math.PI) / 2) * 2 ** 12,
    );
    const kyotoTile = await pmtiles.getZxy(12, kx, ky);
    expect(kyotoTile).toBeDefined();
    if (kyotoTile !== undefined) {
      const kDecoded = decodeMvtTile(new Uint8Array(kyotoTile.data));
      expect(kDecoded.layers.through_boundaries?.features[0]?.properties).toMatchObject({
        id: 'sk:through:kansai:jr-west-biwako-kyoto-kobe-special-rapid',
        boundary_station_id: 'sk:station:kansai:jr-west-kyoto',
      });
    }

    // Isolated ODbL archive contains only rail_vertical
    const odblBuf = buildVerticalOdblPmtiles({
      trackGraph,
      verticalLayer,
      bounds: [135.4, 34.6, 135.9, 35.1],
      center: [135.62, 34.85, 10],
      minZoom: 10,
      maxZoom: 12,
      name: 'test-odbl',
      attribution: '© OpenStreetMap contributors',
    });
    const odblPm = new PMTiles(bufferToSource(odblBuf, 'memory://odbl.pmtiles'));
    const odblTile = await odblPm.getZxy(12, x, y);
    expect(odblTile).toBeDefined();
    if (odblTile !== undefined) {
      const odblDecoded = decodeMvtTile(new Uint8Array(odblTile.data));
      expect(Object.keys(odblDecoded.layers)).toEqual(['rail_vertical']);
      expect(odblDecoded.layers.rail_vertical?.features[0]?.properties).toEqual({
        segment_id: 'sk:segment:kansai:jr-west-kyoto--osaka--kyoto',
        vertical_class: 'elevated',
      });
    }
  });

  it('splits oversized directories into PMTiles v3 leaf directories transparently', async () => {
    const { trackGraph } = makeFixtureGraph();
    const seg = trackGraph.segments[0];
    if (seg === undefined) {
      throw new Error('Missing segment');
    }
    const buf = buildPmtilesArchive({
      minZoom: 8,
      maxZoom: 12,
      bounds: [135.4, 34.6, 135.9, 35.1],
      center: [135.62, 34.85, 10],
      maxRootDirBytes: 40,
      leafChunkSize: 4,
      layers: [
        {
          name: 'rail_segments',
          featureCollection: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { id: seg.id },
                geometry: { type: 'LineString', coordinates: seg.geometry },
              },
            ],
          },
        },
      ],
    });

    const pmtiles = new PMTiles(bufferToSource(buf, 'memory://leaf.pmtiles'));
    const header = await pmtiles.getHeader();
    expect(header.leafDirectoryLength).toBeGreaterThan(0);

    const x = Math.floor(((135.49491 + 180) / 360) * 2 ** 12);
    const latRad = (34.70248 * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** 12,
    );
    const tile = await pmtiles.getZxy(12, x, y);
    expect(tile).toBeDefined();
    if (tile !== undefined) {
      const decoded = decodeMvtTile(new Uint8Array(tile.data));
      expect(decoded.layers.rail_segments?.features[0]?.properties.id).toBe(seg.id);
    }
  });
});
