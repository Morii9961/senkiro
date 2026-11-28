export type MvtPropertyValue = string | number | boolean;

export type MvtFeatureGeometry =
  | { type: 'Point'; points: ReadonlyArray<readonly [number, number]> }
  | { type: 'LineString'; lines: ReadonlyArray<ReadonlyArray<readonly [number, number]>> }
  | { type: 'Polygon'; rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>> };

export interface MvtFeatureInput {
  id?: number;
  properties: Readonly<Record<string, MvtPropertyValue | null | undefined>>;
  geometry: MvtFeatureGeometry;
}

export interface MvtLayerInput {
  name: string;
  extent?: number;
  features: readonly MvtFeatureInput[];
}

export interface MvtTileInput {
  layers: readonly MvtLayerInput[];
}

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_BYTES = 2;

const CMD_MOVE_TO = 1;
const CMD_LINE_TO = 2;
const CMD_CLOSE_PATH = 7;

class ProtobufWriter {
  private buf: number[] = [];

  writeVarint(value: number): void {
    let v = value >>> 0;
    if (value >= 0x100000000 || value < 0) {
      this.writeBigVarint(BigInt(Math.trunc(value)));
      return;
    }
    while (v >= 0x80) {
      this.buf.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.buf.push(v);
  }

  writeBigVarint(value: bigint): void {
    let v = BigInt.asUintN(64, value);
    while (v >= 0x80n) {
      this.buf.push(Number(v & 0x7fn) | 0x80);
      v >>= 7n;
    }
    this.buf.push(Number(v));
  }

  writeTag(fieldNumber: number, wireType: number): void {
    this.writeVarint((fieldNumber << 3) | wireType);
  }

  writeString(fieldNumber: number, value: string): void {
    const encoded = Buffer.from(value, 'utf8');
    this.writeTag(fieldNumber, WIRE_BYTES);
    this.writeVarint(encoded.length);
    for (const byte of encoded) {
      this.buf.push(byte);
    }
  }

  writeBytes(fieldNumber: number, bytes: Uint8Array): void {
    this.writeTag(fieldNumber, WIRE_BYTES);
    this.writeVarint(bytes.length);
    for (const byte of bytes) {
      this.buf.push(byte);
    }
  }

  writeDouble(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, WIRE_FIXED64);
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) {
      this.buf.push(view.getUint8(i));
    }
  }

  writeSint64(fieldNumber: number, value: number): void {
    this.writeTag(fieldNumber, WIRE_VARINT);
    const big = BigInt(Math.trunc(value));
    const zigzag = (big << 1n) ^ (big >> 63n);
    this.writeBigVarint(zigzag);
  }

  writeBool(fieldNumber: number, value: boolean): void {
    this.writeTag(fieldNumber, WIRE_VARINT);
    this.buf.push(value ? 1 : 0);
  }

  writePackedUint32(fieldNumber: number, values: readonly number[]): void {
    if (values.length === 0) {
      return;
    }
    const inner = new ProtobufWriter();
    for (const v of values) {
      inner.writeVarint(v);
    }
    this.writeBytes(fieldNumber, inner.toUint8Array());
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

export function zigzag32(n: number): number {
  const i = Math.trunc(n) | 0;
  return ((i << 1) ^ (i >> 31)) >>> 0;
}

function commandInteger(id: number, count: number): number {
  return ((id & 0x7) | (count << 3)) >>> 0;
}

function encodeGeometryCommands(geom: MvtFeatureGeometry): {
  geomType: number;
  commands: number[];
} {
  const commands: number[] = [];
  let cursorX = 0;
  let cursorY = 0;

  if (geom.type === 'Point') {
    if (geom.points.length === 0) {
      return { geomType: 1, commands: [] };
    }
    commands.push(commandInteger(CMD_MOVE_TO, geom.points.length));
    for (const [rawX, rawY] of geom.points) {
      const x = Math.round(rawX);
      const y = Math.round(rawY);
      commands.push(zigzag32(x - cursorX), zigzag32(y - cursorY));
      cursorX = x;
      cursorY = y;
    }
    return { geomType: 1, commands };
  }

  if (geom.type === 'LineString') {
    for (const line of geom.lines) {
      if (line.length < 2) {
        continue;
      }
      const deduped: Array<readonly [number, number]> = [];
      for (const [rawX, rawY] of line) {
        const x = Math.round(rawX);
        const y = Math.round(rawY);
        const prev = deduped[deduped.length - 1];
        if (prev === undefined || prev[0] !== x || prev[1] !== y) {
          deduped.push([x, y]);
        }
      }
      if (deduped.length < 2) {
        continue;
      }
      const first = deduped[0];
      if (first === undefined) {
        continue;
      }
      commands.push(commandInteger(CMD_MOVE_TO, 1));
      commands.push(zigzag32(first[0] - cursorX), zigzag32(first[1] - cursorY));
      cursorX = first[0];
      cursorY = first[1];
      commands.push(commandInteger(CMD_LINE_TO, deduped.length - 1));
      for (let i = 1; i < deduped.length; i++) {
        const pt = deduped[i];
        if (pt === undefined) {
          continue;
        }
        commands.push(zigzag32(pt[0] - cursorX), zigzag32(pt[1] - cursorY));
        cursorX = pt[0];
        cursorY = pt[1];
      }
    }
    return { geomType: 2, commands };
  }

  // Polygon
  for (const ring of geom.rings) {
    if (ring.length < 3) {
      continue;
    }
    const pts = ring.map(([rx, ry]) => [Math.round(rx), Math.round(ry)] as const);
    const first = pts[0];
    if (first === undefined) {
      continue;
    }
    const last = pts[pts.length - 1];
    const endIdx =
      last !== undefined && last[0] === first[0] && last[1] === first[1]
        ? pts.length - 1
        : pts.length;
    if (endIdx < 3) {
      continue;
    }
    commands.push(commandInteger(CMD_MOVE_TO, 1));
    commands.push(zigzag32(first[0] - cursorX), zigzag32(first[1] - cursorY));
    cursorX = first[0];
    cursorY = first[1];
    commands.push(commandInteger(CMD_LINE_TO, endIdx - 1));
    for (let i = 1; i < endIdx; i++) {
      const pt = pts[i];
      if (pt === undefined) {
        continue;
      }
      commands.push(zigzag32(pt[0] - cursorX), zigzag32(pt[1] - cursorY));
      cursorX = pt[0];
      cursorY = pt[1];
    }
    commands.push(commandInteger(CMD_CLOSE_PATH, 1));
  }
  return { geomType: 3, commands };
}

function encodeValueMessage(value: MvtPropertyValue): Uint8Array {
  const writer = new ProtobufWriter();
  if (typeof value === 'string') {
    writer.writeString(1, value);
  } else if (typeof value === 'boolean') {
    writer.writeBool(7, value);
  } else if (Number.isSafeInteger(value)) {
    writer.writeSint64(6, value);
  } else {
    writer.writeDouble(3, value);
  }
  return writer.toUint8Array();
}

function valueKey(value: MvtPropertyValue): string {
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (typeof value === 'boolean') {
    return `b:${value ? '1' : '0'}`;
  }
  if (Number.isSafeInteger(value)) {
    return `i:${value}`;
  }
  return `d:${value}`;
}

/**
 * Pure TypeScript Mapbox Vector Tile v2.1 Protobuf encoder.
 */
export function encodeMvtTile(tile: MvtTileInput): Uint8Array {
  const tileWriter = new ProtobufWriter();

  for (const layer of tile.layers) {
    const layerWriter = new ProtobufWriter();
    const keys: string[] = [];
    const keyIndexMap = new Map<string, number>();
    const values: MvtPropertyValue[] = [];
    const valueIndexMap = new Map<string, number>();

    const internKey = (key: string): number => {
      const existing = keyIndexMap.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const idx = keys.length;
      keys.push(key);
      keyIndexMap.set(key, idx);
      return idx;
    };

    const internValue = (value: MvtPropertyValue): number => {
      const vk = valueKey(value);
      const existing = valueIndexMap.get(vk);
      if (existing !== undefined) {
        return existing;
      }
      const idx = values.length;
      values.push(value);
      valueIndexMap.set(vk, idx);
      return idx;
    };

    const encodedFeatures: Uint8Array[] = [];
    for (const feat of layer.features) {
      const { geomType, commands } = encodeGeometryCommands(feat.geometry);
      if (commands.length === 0) {
        continue;
      }
      const tags: number[] = [];
      for (const [k, rawVal] of Object.entries(feat.properties)) {
        if (rawVal === undefined || rawVal === null) {
          continue;
        }
        tags.push(internKey(k), internValue(rawVal));
      }
      const featWriter = new ProtobufWriter();
      if (feat.id !== undefined) {
        featWriter.writeTag(1, WIRE_VARINT);
        featWriter.writeVarint(feat.id);
      }
      featWriter.writePackedUint32(2, tags);
      featWriter.writeTag(3, WIRE_VARINT);
      featWriter.writeVarint(geomType);
      featWriter.writePackedUint32(4, commands);
      encodedFeatures.push(featWriter.toUint8Array());
    }

    if (encodedFeatures.length === 0) {
      continue;
    }

    // MVT v2.1 Layer fields
    layerWriter.writeTag(15, WIRE_VARINT);
    layerWriter.writeVarint(2);
    layerWriter.writeString(1, layer.name);
    for (const featBytes of encodedFeatures) {
      layerWriter.writeBytes(2, featBytes);
    }
    for (const k of keys) {
      layerWriter.writeString(3, k);
    }
    for (const v of values) {
      layerWriter.writeBytes(4, encodeValueMessage(v));
    }
    layerWriter.writeTag(5, WIRE_VARINT);
    layerWriter.writeVarint(layer.extent ?? 4096);

    tileWriter.writeBytes(3, layerWriter.toUint8Array());
  }

  return tileWriter.toUint8Array();
}
