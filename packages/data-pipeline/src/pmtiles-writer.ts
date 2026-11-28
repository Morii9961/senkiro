import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  resolveLocalizedName,
  type SkId,
  type StationComplex,
  type ThroughService,
  type TrackGraph,
  type TrackVerticalLayer,
} from '@senkiro/contracts';
import { Compression, TileType, zxyToTileId } from 'pmtiles';
import { assignCorridorSlots } from './corridor-slots.ts';
import geojsonvt, { type GeoJsonVtFeatureCompat } from './geojson-vt-bridge.ts';
import type { GeoBBox } from './ksj-reader.ts';
import {
  encodeMvtTile,
  type MvtFeatureGeometry,
  type MvtFeatureInput,
  type MvtLayerInput,
  type MvtPropertyValue,
} from './mvt-encoder.ts';

export interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, MvtPropertyValue | null | undefined>;
  geometry:
    | { type: 'Point'; coordinates: readonly [number, number] }
    | { type: 'LineString'; coordinates: ReadonlyArray<readonly [number, number]> };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface PmtilesLayerSpec {
  name: string;
  featureCollection: GeoJsonFeatureCollection;
  minZoom?: number;
  maxZoom?: number;
  featureFilter?: (
    props: Record<string, MvtPropertyValue | null | undefined>,
    z: number,
  ) => boolean;
}

export interface BuildPmtilesOptions {
  layers: readonly PmtilesLayerSpec[];
  minZoom: number;
  maxZoom: number;
  bounds: GeoBBox;
  center: readonly [number, number, number];
  metadata?: Record<string, unknown>;
  /** Override max gzipped root directory bytes (16257 in PMTiles v3 spec). */
  maxRootDirBytes?: number;
  /** Initial entries per leaf directory when splitting. */
  leafChunkSize?: number;
}

interface DirEntry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

const PMTILES_HEADER_SIZE = 127;
const MAX_ROOT_DIR_BYTES = 16384 - PMTILES_HEADER_SIZE;

function lonToTileX(lon: number, z: number): number {
  const n = 2 ** z;
  return Math.max(0, Math.min(n - 1, Math.floor(((lon + 180) / 360) * n)));
}

function latToTileY(lat: number, z: number): number {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return Math.max(0, Math.min(n - 1, y));
}

function writeVarintSafe(out: number[], value: number): void {
  let v = BigInt(Math.trunc(value));
  while (v >= 0x80n) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
}

function serializeDirectory(entries: readonly DirEntry[]): Buffer {
  const out: number[] = [];
  writeVarintSafe(out, entries.length);

  let lastId = 0;
  for (const e of entries) {
    writeVarintSafe(out, e.tileId - lastId);
    lastId = e.tileId;
  }
  for (const e of entries) {
    writeVarintSafe(out, e.runLength);
  }
  for (const e of entries) {
    writeVarintSafe(out, e.length);
  }
  let lastOffset = 0;
  let lastLength = 0;
  for (const [idx, e] of entries.entries()) {
    if (idx > 0 && e.offset === lastOffset + lastLength) {
      writeVarintSafe(out, 0);
    } else {
      writeVarintSafe(out, e.offset + 1);
    }
    lastOffset = e.offset;
    lastLength = e.length;
  }

  return gzipSync(Uint8Array.from(out));
}

function convertVtGeometry(vtFeat: GeoJsonVtFeatureCompat): MvtFeatureGeometry | null {
  if (vtFeat.type === 1) {
    const raw = vtFeat.geometry as ReadonlyArray<readonly [number, number]>;
    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }
    return { type: 'Point', points: raw };
  }
  if (vtFeat.type === 2) {
    const raw = vtFeat.geometry as ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }
    return { type: 'LineString', lines: raw };
  }
  if (vtFeat.type === 3) {
    const raw = vtFeat.geometry as ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }
    return { type: 'Polygon', rings: raw };
  }
  return null;
}

function rleCollapseEntries(rawEntries: readonly DirEntry[]): DirEntry[] {
  const sorted = [...rawEntries].sort((a, b) => a.tileId - b.tileId);
  const collapsed: DirEntry[] = [];
  for (const entry of sorted) {
    const prev = collapsed[collapsed.length - 1];
    if (
      prev !== undefined &&
      prev.tileId + prev.runLength === entry.tileId &&
      prev.offset === entry.offset &&
      prev.length === entry.length
    ) {
      prev.runLength += 1;
    } else {
      collapsed.push({ ...entry });
    }
  }
  return collapsed;
}

function encodeHeader(params: {
  rootDirOffset: number;
  rootDirLength: number;
  jsonMetadataOffset: number;
  jsonMetadataLength: number;
  leafDirsOffset: number;
  leafDirsLength: number;
  tileDataOffset: number;
  tileDataLength: number;
  numAddressedTiles: number;
  numTileEntries: number;
  numTileContents: number;
  minZoom: number;
  maxZoom: number;
  bounds: GeoBBox;
  center: readonly [number, number, number];
}): Buffer {
  const buf = Buffer.alloc(PMTILES_HEADER_SIZE);
  buf.write('PMTiles', 0, 'ascii');
  buf.writeUInt8(3, 7);
  buf.writeBigUInt64LE(BigInt(params.rootDirOffset), 8);
  buf.writeBigUInt64LE(BigInt(params.rootDirLength), 16);
  buf.writeBigUInt64LE(BigInt(params.jsonMetadataOffset), 24);
  buf.writeBigUInt64LE(BigInt(params.jsonMetadataLength), 32);
  buf.writeBigUInt64LE(BigInt(params.leafDirsOffset), 40);
  buf.writeBigUInt64LE(BigInt(params.leafDirsLength), 48);
  buf.writeBigUInt64LE(BigInt(params.tileDataOffset), 56);
  buf.writeBigUInt64LE(BigInt(params.tileDataLength), 64);
  buf.writeBigUInt64LE(BigInt(params.numAddressedTiles), 72);
  buf.writeBigUInt64LE(BigInt(params.numTileEntries), 80);
  buf.writeBigUInt64LE(BigInt(params.numTileContents), 88);
  buf.writeUInt8(1, 96); // clustered
  buf.writeUInt8(Compression.Gzip, 97); // internalCompression
  buf.writeUInt8(Compression.Gzip, 98); // tileCompression
  buf.writeUInt8(TileType.Mvt, 99); // tileType
  buf.writeUInt8(params.minZoom, 100);
  buf.writeUInt8(params.maxZoom, 101);
  buf.writeInt32LE(Math.round(params.bounds[0] * 1e7), 102);
  buf.writeInt32LE(Math.round(params.bounds[1] * 1e7), 106);
  buf.writeInt32LE(Math.round(params.bounds[2] * 1e7), 110);
  buf.writeInt32LE(Math.round(params.bounds[3] * 1e7), 114);
  buf.writeUInt8(params.center[2], 118);
  buf.writeInt32LE(Math.round(params.center[0] * 1e7), 119);
  buf.writeInt32LE(Math.round(params.center[1] * 1e7), 123);
  return buf;
}

/**
 * Pure TypeScript PMTiles v3 archive builder using `geojson-vt`, MVT v2.1 encoding,
 * SHA-256 tile deduplication, RLE compression, and automatic root/leaf directory splitting.
 */
export function buildPmtilesArchive(options: BuildPmtilesOptions): Buffer {
  const { minZoom, maxZoom, bounds, center } = options;
  const indexedLayers = options.layers.map((layer) => ({
    spec: layer,
    layerMinZoom: layer.minZoom ?? minZoom,
    layerMaxZoom: layer.maxZoom ?? maxZoom,
    vt: geojsonvt(layer.featureCollection, {
      maxZoom: layer.maxZoom ?? maxZoom,
      indexMaxZoom: layer.maxZoom ?? maxZoom,
      indexMaxPoints: 0,
      extent: 4096,
      buffer: 64,
      tolerance: 3,
    }),
  }));

  const visitedKeys = new Set<string>();
  const tileQueue: Array<{ z: number; x: number; y: number }> = [];

  const enqueue = (z: number, x: number, y: number): void => {
    const key = `${z}/${x}/${y}`;
    if (!visitedKeys.has(key)) {
      visitedKeys.add(key);
      tileQueue.push({ z, x, y });
    }
  };

  // Seed bounding-box tile ranges at archive minZoom and each layer's minZoom
  const seedZooms = new Set<number>([minZoom]);
  for (const item of indexedLayers) {
    seedZooms.add(Math.max(minZoom, item.layerMinZoom));
  }
  for (const z of seedZooms) {
    const minX = lonToTileX(bounds[0], z);
    const maxX = lonToTileX(bounds[2], z);
    const minY = latToTileY(bounds[3], z);
    const maxY = latToTileY(bounds[1], z);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        enqueue(z, x, y);
      }
    }
  }

  const blobByHash = new Map<string, { offset: number; length: number; data: Buffer }>();
  const tileBlobs: Buffer[] = [];
  let tileDataOffsetCursor = 0;
  const rawEntries: DirEntry[] = [];

  while (tileQueue.length > 0) {
    const coord = tileQueue.shift();
    if (coord === undefined) {
      continue;
    }
    const { z, x, y } = coord;
    const mvtLayers: MvtLayerInput[] = [];
    let anyLayerHasRawTile = false;

    for (const item of indexedLayers) {
      if (z > item.layerMaxZoom) {
        continue;
      }
      const vtTile = item.vt.getTile(z, x, y);
      if (vtTile === null || vtTile.features.length === 0) {
        continue;
      }
      anyLayerHasRawTile = true;
      if (z < item.layerMinZoom) {
        continue;
      }

      const features: MvtFeatureInput[] = [];
      for (const vtFeat of vtTile.features) {
        if (item.spec.featureFilter !== undefined && !item.spec.featureFilter(vtFeat.tags, z)) {
          continue;
        }
        const geom = convertVtGeometry(vtFeat);
        if (geom === null) {
          continue;
        }
        features.push({
          properties: vtFeat.tags,
          geometry: geom,
        });
      }
      if (features.length > 0) {
        mvtLayers.push({ name: item.spec.name, extent: 4096, features });
      }
    }

    if (anyLayerHasRawTile && z < maxZoom) {
      enqueue(z + 1, x * 2, y * 2);
      enqueue(z + 1, x * 2 + 1, y * 2);
      enqueue(z + 1, x * 2, y * 2 + 1);
      enqueue(z + 1, x * 2 + 1, y * 2 + 1);
    }

    if (mvtLayers.length === 0) {
      continue;
    }

    const mvtBytes = encodeMvtTile({ layers: mvtLayers });
    if (mvtBytes.length === 0) {
      continue;
    }
    const compressed = gzipSync(mvtBytes);
    const hash = createHash('sha256').update(compressed).digest('hex');
    let blob = blobByHash.get(hash);
    if (blob === undefined) {
      blob = {
        offset: tileDataOffsetCursor,
        length: compressed.length,
        data: compressed,
      };
      blobByHash.set(hash, blob);
      tileBlobs.push(compressed);
      tileDataOffsetCursor += compressed.length;
    }

    rawEntries.push({
      tileId: zxyToTileId(z, x, y),
      offset: blob.offset,
      length: blob.length,
      runLength: 1,
    });
  }

  const collapsedEntries = rleCollapseEntries(rawEntries);
  const numAddressedTiles = rawEntries.length;
  const numTileEntries = collapsedEntries.length;
  const numTileContents = tileBlobs.length;

  const maxRootBytes = options.maxRootDirBytes ?? MAX_ROOT_DIR_BYTES;
  let rootDirBytes = serializeDirectory(collapsedEntries);
  let leafDirBytes = Buffer.alloc(0);

  if (rootDirBytes.length > maxRootBytes) {
    let chunkSize =
      options.leafChunkSize ?? Math.min(4096, Math.max(64, Math.ceil(collapsedEntries.length / 8)));
    while (chunkSize >= 1) {
      const rootEntries: DirEntry[] = [];
      const leafBuffers: Buffer[] = [];
      let leafOffset = 0;

      for (let i = 0; i < collapsedEntries.length; i += chunkSize) {
        const chunk = collapsedEntries.slice(i, i + chunkSize);
        const first = chunk[0];
        if (first === undefined) {
          continue;
        }
        const leafBuf = serializeDirectory(chunk);
        leafBuffers.push(leafBuf);
        rootEntries.push({
          tileId: first.tileId,
          offset: leafOffset,
          length: leafBuf.length,
          runLength: 0,
        });
        leafOffset += leafBuf.length;
      }

      const candidateRoot = serializeDirectory(rootEntries);
      if (candidateRoot.length <= maxRootBytes || chunkSize === 1) {
        rootDirBytes = candidateRoot;
        leafDirBytes = Buffer.concat(leafBuffers);
        break;
      }
      chunkSize = Math.max(
        1,
        Math.floor(chunkSize * 1.5) === chunkSize ? chunkSize - 1 : Math.floor(chunkSize / 2),
      );
    }
  }

  const vectorLayersMeta = options.layers.map((l) => ({
    id: l.name,
    minzoom: l.minZoom ?? minZoom,
    maxzoom: l.maxZoom ?? maxZoom,
  }));
  const metadataJson = gzipSync(
    Buffer.from(
      JSON.stringify({
        vector_layers: vectorLayersMeta,
        ...(options.metadata ?? {}),
      }),
      'utf8',
    ),
  );

  const rootDirOffset = PMTILES_HEADER_SIZE;
  const jsonMetadataOffset = rootDirOffset + rootDirBytes.length;
  const leafDirsOffset = jsonMetadataOffset + metadataJson.length;
  const tileDataOffset = leafDirsOffset + leafDirBytes.length;

  const header = encodeHeader({
    rootDirOffset,
    rootDirLength: rootDirBytes.length,
    jsonMetadataOffset,
    jsonMetadataLength: metadataJson.length,
    leafDirsOffset,
    leafDirsLength: leafDirBytes.length,
    tileDataOffset,
    tileDataLength: tileDataOffsetCursor,
    numAddressedTiles,
    numTileEntries,
    numTileContents,
    minZoom,
    maxZoom,
    bounds,
    center,
  });

  return Buffer.concat([header, rootDirBytes, metadataJson, leafDirBytes, ...tileBlobs]);
}

export interface BuildAtlasPmtilesInput {
  trackGraph: TrackGraph;
  throughServices: readonly ThroughService[];
  hubKeyByComplexId?: ReadonlyMap<SkId<'complex'>, 'umeda' | 'kyoto' | 'shinjuku'>;
  importanceRankByStationId?: ReadonlyMap<SkId<'station'>, 1 | 2 | 3>;
  bounds: GeoBBox;
  center: readonly [number, number, number];
  minZoom?: number;
  maxZoom?: number;
  name: string;
  attribution: string;
}

function buildStationImportanceLookup(
  trackGraph: TrackGraph,
  complexesById: ReadonlyMap<SkId<'complex'>, StationComplex>,
  hubKeyByComplexId?: ReadonlyMap<SkId<'complex'>, 'umeda' | 'kyoto' | 'shinjuku'>,
  explicit?: ReadonlyMap<SkId<'station'>, 1 | 2 | 3>,
): Map<SkId<'station'>, 1 | 2 | 3> {
  const result = new Map<SkId<'station'>, 1 | 2 | 3>();
  for (const station of trackGraph.stations) {
    const preset = explicit?.get(station.id);
    if (preset !== undefined) {
      result.set(station.id, preset);
      continue;
    }
    const complex =
      station.stationComplexId === null ? undefined : complexesById.get(station.stationComplexId);
    if (
      complex !== undefined &&
      (complex.stationIds.length >= 2 || hubKeyByComplexId?.has(complex.id) === true)
    ) {
      result.set(station.id, 1);
    } else if (station.railLineIds.length >= 2) {
      result.set(station.id, 2);
    } else {
      result.set(station.id, 3);
    }
  }
  return result;
}

/**
 * Build a main (non-ODbL) PMTiles v3 archive strictly matching `docs/02-phase1-atlas-spec.md` §3.2:
 * `rail_segments`, `rail_stations`, `station_complexes`, `through_boundaries`.
 */
export function buildAtlasPmtiles(input: BuildAtlasPmtilesInput): Buffer {
  const { trackGraph, throughServices } = input;
  const lineById = new Map(trackGraph.lines.map((l) => [l.id, l]));
  const stationById = new Map(trackGraph.stations.map((s) => [s.id, s]));
  const complexById = new Map(trackGraph.complexes.map((c) => [c.id, c]));
  const stationToComplex = new Map<SkId<'station'>, SkId<'complex'>>();
  for (const s of trackGraph.stations) {
    if (s.stationComplexId !== null) {
      stationToComplex.set(s.id, s.stationComplexId);
    }
  }

  const slotMap = assignCorridorSlots(trackGraph.segments, { stationToComplex });
  const rankMap = buildStationImportanceLookup(
    trackGraph,
    complexById,
    input.hubKeyByComplexId,
    input.importanceRankByStationId,
  );

  const segmentFeatures: GeoJsonFeature[] = trackGraph.segments
    .filter((seg) => seg.geometry.length >= 2)
    .map((seg) => {
      const primaryLineId = seg.railLineIds[0] ?? '';
      const line = seg.railLineIds[0] !== undefined ? lineById.get(seg.railLineIds[0]) : undefined;
      const slot = slotMap.get(seg.id) ?? { corridorSlot: 0, corridorCount: 1 };
      const labelSource = line?.names ?? seg.names;
      return {
        type: 'Feature',
        properties: {
          id: seg.id,
          operator_id: seg.operatorId,
          primary_line_id: primaryLineId,
          line_ids_json: JSON.stringify(seg.railLineIds),
          color: line?.color ?? '#64748b',
          line_class: seg.lineClass,
          is_shinkansen: seg.isShinkansen,
          corridor_slot: slot.corridorSlot,
          corridor_count: slot.corridorCount,
          label_zh_cn: resolveLocalizedName(labelSource, 'zh-CN').text,
          label_ja: resolveLocalizedName(labelSource, 'ja').text,
          label_en: resolveLocalizedName(labelSource, 'en').text,
        },
        geometry: {
          type: 'LineString',
          coordinates: seg.geometry,
        },
      };
    });

  const stationFeatures: GeoJsonFeature[] = trackGraph.stations.map((st) => ({
    type: 'Feature',
    properties: {
      id: st.id,
      operator_id: st.operatorId,
      complex_id: st.stationComplexId ?? '',
      station_code: st.stationCode ?? '',
      importance_rank: rankMap.get(st.id) ?? 3,
      label_zh_cn: resolveLocalizedName(st.names, 'zh-CN').text,
      label_ja: resolveLocalizedName(st.names, 'ja').text,
      label_en: resolveLocalizedName(st.names, 'en').text,
    },
    geometry: {
      type: 'Point',
      coordinates: st.coordinates,
    },
  }));

  const complexFeatures: GeoJsonFeature[] = trackGraph.complexes.map((cx) => ({
    type: 'Feature',
    properties: {
      id: cx.id,
      hub_key: input.hubKeyByComplexId?.get(cx.id) ?? '',
      station_count: cx.stationIds.length,
      label_zh_cn: resolveLocalizedName(cx.names, 'zh-CN').text,
      label_ja: resolveLocalizedName(cx.names, 'ja').text,
      label_en: resolveLocalizedName(cx.names, 'en').text,
    },
    geometry: {
      type: 'Point',
      coordinates: cx.coordinates,
    },
  }));

  const throughFeatures: GeoJsonFeature[] = [];
  for (const ts of throughServices) {
    const boundary = stationById.get(ts.boundaryStationId);
    if (boundary === undefined) {
      continue;
    }
    throughFeatures.push({
      type: 'Feature',
      properties: {
        id: ts.id,
        boundary_station_id: ts.boundaryStationId,
        label_zh_cn: resolveLocalizedName(ts.names, 'zh-CN').text,
        label_ja: resolveLocalizedName(ts.names, 'ja').text,
        label_en: resolveLocalizedName(ts.names, 'en').text,
      },
      geometry: {
        type: 'Point',
        coordinates: boundary.coordinates,
      },
    });
  }

  const minZoom = input.minZoom ?? 6;
  const maxZoom = input.maxZoom ?? 15;

  return buildPmtilesArchive({
    minZoom,
    maxZoom,
    bounds: input.bounds,
    center: input.center,
    metadata: {
      name: input.name,
      attribution: input.attribution,
      format: 'pbf',
    },
    layers: [
      {
        name: 'rail_segments',
        featureCollection: { type: 'FeatureCollection', features: segmentFeatures },
        minZoom,
        maxZoom,
      },
      {
        name: 'rail_stations',
        featureCollection: { type: 'FeatureCollection', features: stationFeatures },
        minZoom: Math.max(minZoom, 8),
        maxZoom,
        featureFilter: (props, z) => {
          const rank = Number(props.importance_rank ?? 3);
          if (rank <= 1) {
            return z >= 8;
          }
          if (rank === 2) {
            return z >= 10;
          }
          return z >= 12;
        },
      },
      {
        name: 'station_complexes',
        featureCollection: { type: 'FeatureCollection', features: complexFeatures },
        minZoom: Math.max(minZoom, 8),
        maxZoom,
      },
      {
        name: 'through_boundaries',
        featureCollection: { type: 'FeatureCollection', features: throughFeatures },
        minZoom: Math.max(minZoom, 8),
        maxZoom,
      },
    ],
  });
}

export interface BuildVerticalOdblPmtilesInput {
  trackGraph: TrackGraph;
  verticalLayer: TrackVerticalLayer;
  bounds: GeoBBox;
  center: readonly [number, number, number];
  minZoom?: number;
  maxZoom?: number;
  name: string;
  attribution: string;
}

/**
 * Build a physically isolated ODbL 1.0 PMTiles v3 archive containing ONLY the `rail_vertical`
 * layer (`segment_id`, `vertical_class`).
 */
export function buildVerticalOdblPmtiles(input: BuildVerticalOdblPmtilesInput): Buffer {
  const segmentById = new Map(input.trackGraph.segments.map((s) => [s.id, s]));
  const features: GeoJsonFeature[] = [];
  for (const attr of input.verticalLayer.attributes) {
    const seg = segmentById.get(attr.trackSegmentId);
    if (seg === undefined || seg.geometry.length < 2) {
      continue;
    }
    features.push({
      type: 'Feature',
      properties: {
        segment_id: attr.trackSegmentId,
        vertical_class: attr.verticalClass,
      },
      geometry: {
        type: 'LineString',
        coordinates: seg.geometry,
      },
    });
  }

  const minZoom = input.minZoom ?? 10;
  const maxZoom = input.maxZoom ?? 15;

  return buildPmtilesArchive({
    minZoom,
    maxZoom,
    bounds: input.bounds,
    center: input.center,
    metadata: {
      name: input.name,
      attribution: input.attribution,
      license: 'ODbL 1.0',
      format: 'pbf',
    },
    layers: [
      {
        name: 'rail_vertical',
        featureCollection: { type: 'FeatureCollection', features },
        minZoom,
        maxZoom,
      },
    ],
  });
}
