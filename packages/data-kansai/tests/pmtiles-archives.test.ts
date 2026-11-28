import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMvtTile } from '@senkiro/data-pipeline';
import { Compression, PMTiles, type RangeResponse, type Source, TileType } from 'pmtiles';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TILES_DIR = path.resolve(__dirname, '..', 'tiles');

function fileBufferSource(filePath: string): Source {
  const buf = readFileSync(filePath);
  return {
    getKey: () => filePath,
    async getBytes(offset: number, length: number): Promise<RangeResponse> {
      const end = Math.min(buf.length, offset + length);
      const slice = buf.subarray(offset, end);
      const copy = new Uint8Array(slice.length);
      copy.set(slice);
      return { data: copy.buffer };
    },
  };
}

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

describe('Generated PMTiles v3 archives', () => {
  it('kansai-rail.pmtiles has z6-z15 MVT tiles with all 4 spec §3.2 layers and no ODbL rail_vertical', async () => {
    const filePath = path.join(TILES_DIR, 'kansai-rail.pmtiles');
    expect(statSync(filePath).size).toBeLessThan(10 * 1024 * 1024);

    const pm = new PMTiles(fileBufferSource(filePath));
    const header = await pm.getHeader();
    expect(header.minZoom).toBe(6);
    expect(header.maxZoom).toBe(15);
    expect(header.tileType).toBe(TileType.Mvt);
    expect(header.tileCompression).toBe(Compression.Gzip);

    for (const z of [6, 8, 10, 12, 15]) {
      const { x, y } = lonLatToTile(135.49725, 34.70158, z); // Osaka-Umeda
      const res = await pm.getZxy(z, x, y);
      expect(res).toBeDefined();
      if (res === undefined) {
        continue;
      }
      const decoded = decodeMvtTile(new Uint8Array(res.data));
      expect(Object.keys(decoded.layers)).not.toContain('rail_vertical');
      expect(decoded.layers.rail_segments?.features.length ?? 0).toBeGreaterThan(0);

      if (z >= 8) {
        expect(decoded.layers.rail_stations?.features.length ?? 0).toBeGreaterThan(0);
        expect(decoded.layers.station_complexes?.features.length ?? 0).toBeGreaterThan(0);
      }
      if (z === 12) {
        const segProps = decoded.layers.rail_segments?.features[0]?.properties;
        expect(segProps).toBeDefined();
        expect(typeof segProps?.id).toBe('string');
        expect(typeof segProps?.operator_id).toBe('string');
        expect(typeof segProps?.primary_line_id).toBe('string');
        expect(typeof segProps?.line_ids_json).toBe('string');
        expect(typeof segProps?.color).toBe('string');
        expect(typeof segProps?.line_class).toBe('string');
        expect(typeof segProps?.is_shinkansen).toBe('boolean');
        expect(typeof segProps?.corridor_slot).toBe('number');
        expect(typeof segProps?.corridor_count).toBe('number');
        expect(typeof segProps?.label_zh_cn).toBe('string');
        expect(typeof segProps?.label_ja).toBe('string');
        expect(typeof segProps?.label_en).toBe('string');

        const umedaComplex = decoded.layers.station_complexes?.features.find(
          (f) => f.properties.id === 'sk:complex:kansai:osaka-umeda',
        );
        expect(umedaComplex?.properties.hub_key).toBe('umeda');
        expect(umedaComplex?.properties.station_count).toBe(7);
      }
    }

    // Kyoto tile at z12 must expose kyoto complex (4 stations) & through_boundaries
    const kyotoTileCoord = lonLatToTile(135.75876, 34.98562, 12);
    const kyotoRes = await pm.getZxy(12, kyotoTileCoord.x, kyotoTileCoord.y);
    expect(kyotoRes).toBeDefined();
    if (kyotoRes !== undefined) {
      const kDecoded = decodeMvtTile(new Uint8Array(kyotoRes.data));
      const kyotoCx = kDecoded.layers.station_complexes?.features.find(
        (f) => f.properties.id === 'sk:complex:kansai:kyoto',
      );
      expect(kyotoCx?.properties.hub_key).toBe('kyoto');
      expect(kyotoCx?.properties.station_count).toBe(4);
      expect(kDecoded.layers.through_boundaries?.features.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('kanto-rail.pmtiles has z6-z15 MVT tiles with Shinjuku hub and no ODbL rail_vertical', async () => {
    const filePath = path.join(TILES_DIR, 'kanto-rail.pmtiles');
    expect(statSync(filePath).size).toBeLessThan(10 * 1024 * 1024);

    const pm = new PMTiles(fileBufferSource(filePath));
    const header = await pm.getHeader();
    expect(header.minZoom).toBe(6);
    expect(header.maxZoom).toBe(15);

    const { x, y } = lonLatToTile(139.70061, 35.69011, 12); // Shinjuku
    const res = await pm.getZxy(12, x, y);
    expect(res).toBeDefined();
    if (res !== undefined) {
      const decoded = decodeMvtTile(new Uint8Array(res.data));
      expect(Object.keys(decoded.layers)).not.toContain('rail_vertical');
      const shinjukuCx = decoded.layers.station_complexes?.features.find(
        (f) => f.properties.id === 'sk:complex:kanto:shinjuku',
      );
      expect(shinjukuCx?.properties.hub_key).toBe('shinjuku');
      expect(shinjukuCx?.properties.station_count).toBe(10);
    }
  });

  it('kanto-rail-vertical.odbl.pmtiles is physically isolated and contains only rail_vertical', async () => {
    const filePath = path.join(TILES_DIR, 'kanto-rail-vertical.odbl.pmtiles');
    expect(statSync(filePath).size).toBeLessThan(5 * 1024 * 1024);

    const pm = new PMTiles(fileBufferSource(filePath));
    const header = await pm.getHeader();
    expect(header.minZoom).toBe(10);
    expect(header.maxZoom).toBe(15);

    const { x, y } = lonLatToTile(139.70061, 35.69011, 12);
    const res = await pm.getZxy(12, x, y);
    expect(res).toBeDefined();
    if (res !== undefined) {
      const decoded = decodeMvtTile(new Uint8Array(res.data));
      expect(Object.keys(decoded.layers)).toEqual(['rail_vertical']);
      const feat = decoded.layers.rail_vertical?.features[0];
      expect(typeof feat?.properties.segment_id).toBe('string');
      expect(typeof feat?.properties.vertical_class).toBe('string');
    }
  });
});
