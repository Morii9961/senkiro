import type { MvtPropertyValue } from './mvt-encoder.ts';

export interface DecodedMvtFeature {
  id?: number;
  type: 1 | 2 | 3;
  properties: Record<string, MvtPropertyValue>;
  geometry: Array<Array<readonly [number, number]>>;
}

export interface DecodedMvtLayer {
  name: string;
  version: number;
  extent: number;
  features: DecodedMvtFeature[];
}

export interface DecodedMvtTile {
  layers: Record<string, DecodedMvtLayer>;
}

class ProtobufReader {
  private pos = 0;
  private readonly view: DataView;

  constructor(
    private readonly bytes: Uint8Array,
    start = 0,
    private readonly end = bytes.length,
  ) {
    this.pos = start;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  hasMore(): boolean {
    return this.pos < this.end;
  }

  readVarintBig(): bigint {
    let result = 0n;
    let shift = 0n;
    while (this.pos < this.end) {
      const byte = this.bytes[this.pos] ?? 0;
      this.pos += 1;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift += 7n;
    }
    throw new Error('Unexpected EOF reading varint');
  }

  readVarint(): number {
    return Number(this.readVarintBig());
  }

  readSint64(): number {
    const v = this.readVarintBig();
    return Number((v >> 1n) ^ -(v & 1n));
  }

  readDouble(): number {
    const val = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return val;
  }

  readFloat(): number {
    const val = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readBytes(): Uint8Array {
    const len = this.readVarint();
    const slice = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }

  readString(): string {
    return Buffer.from(this.readBytes()).toString('utf8');
  }

  skipField(wireType: number): void {
    if (wireType === 0) {
      this.readVarintBig();
    } else if (wireType === 1) {
      this.pos += 8;
    } else if (wireType === 2) {
      const len = this.readVarint();
      this.pos += len;
    } else if (wireType === 5) {
      this.pos += 4;
    } else {
      throw new Error(`Unsupported wireType ${wireType}`);
    }
  }
}

function unzigzag32(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

function decodeGeometry(commands: readonly number[]): Array<Array<readonly [number, number]>> {
  const paths: Array<Array<readonly [number, number]>> = [];
  let current: Array<readonly [number, number]> = [];
  let x = 0;
  let y = 0;
  let i = 0;

  while (i < commands.length) {
    const cmdInt = commands[i] ?? 0;
    i += 1;
    const cmdId = cmdInt & 0x7;
    const count = cmdInt >>> 3;

    if (cmdId === 1) {
      for (let j = 0; j < count; j++) {
        if (current.length > 0) {
          paths.push(current);
          current = [];
        }
        x += unzigzag32(commands[i] ?? 0);
        y += unzigzag32(commands[i + 1] ?? 0);
        i += 2;
        current.push([x, y]);
      }
    } else if (cmdId === 2) {
      for (let j = 0; j < count; j++) {
        x += unzigzag32(commands[i] ?? 0);
        y += unzigzag32(commands[i + 1] ?? 0);
        i += 2;
        current.push([x, y]);
      }
    } else if (cmdId === 7) {
      const first = current[0];
      if (first !== undefined) {
        current.push(first);
      }
    }
  }
  if (current.length > 0) {
    paths.push(current);
  }
  return paths;
}

function decodeValue(bytes: Uint8Array): MvtPropertyValue {
  const r = new ProtobufReader(bytes);
  while (r.hasMore()) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1 && wire === 2) {
      return r.readString();
    }
    if (field === 2 && wire === 5) {
      return r.readFloat();
    }
    if (field === 3 && wire === 1) {
      return r.readDouble();
    }
    if ((field === 4 || field === 5) && wire === 0) {
      return r.readVarint();
    }
    if (field === 6 && wire === 0) {
      return r.readSint64();
    }
    if (field === 7 && wire === 0) {
      return r.readVarint() !== 0;
    }
    r.skipField(wire);
  }
  return '';
}

function decodePackedUint32(bytes: Uint8Array): number[] {
  const r = new ProtobufReader(bytes);
  const out: number[] = [];
  while (r.hasMore()) {
    out.push(r.readVarint());
  }
  return out;
}

function decodeLayer(bytes: Uint8Array): DecodedMvtLayer {
  const r = new ProtobufReader(bytes);
  let name = '';
  let version = 1;
  let extent = 4096;
  const rawFeatures: Uint8Array[] = [];
  const keys: string[] = [];
  const values: MvtPropertyValue[] = [];

  while (r.hasMore()) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1 && wire === 2) {
      name = r.readString();
    } else if (field === 2 && wire === 2) {
      rawFeatures.push(r.readBytes());
    } else if (field === 3 && wire === 2) {
      keys.push(r.readString());
    } else if (field === 4 && wire === 2) {
      values.push(decodeValue(r.readBytes()));
    } else if (field === 5 && wire === 0) {
      extent = r.readVarint();
    } else if (field === 15 && wire === 0) {
      version = r.readVarint();
    } else {
      r.skipField(wire);
    }
  }

  const features: DecodedMvtFeature[] = rawFeatures.map((fb) => {
    const fr = new ProtobufReader(fb);
    let id: number | undefined;
    let type: 1 | 2 | 3 = 1;
    let tags: number[] = [];
    let geomCmds: number[] = [];
    while (fr.hasMore()) {
      const tag = fr.readVarint();
      const field = tag >>> 3;
      const wire = tag & 0x7;
      if (field === 1 && wire === 0) {
        id = fr.readVarint();
      } else if (field === 2 && wire === 2) {
        tags = decodePackedUint32(fr.readBytes());
      } else if (field === 3 && wire === 0) {
        const rawType = fr.readVarint();
        type = rawType === 2 || rawType === 3 ? rawType : 1;
      } else if (field === 4 && wire === 2) {
        geomCmds = decodePackedUint32(fr.readBytes());
      } else {
        fr.skipField(wire);
      }
    }
    const properties: Record<string, MvtPropertyValue> = {};
    for (let i = 0; i + 1 < tags.length; i += 2) {
      const kIdx = tags[i] ?? 0;
      const vIdx = tags[i + 1] ?? 0;
      const k = keys[kIdx];
      const v = values[vIdx];
      if (k !== undefined && v !== undefined) {
        properties[k] = v;
      }
    }
    const decoded: DecodedMvtFeature = {
      type,
      properties,
      geometry: decodeGeometry(geomCmds),
    };
    if (id !== undefined) {
      decoded.id = id;
    }
    return decoded;
  });

  return { name, version, extent, features };
}

/** Decode an uncompressed MVT v2.1 byte array for verification and tests. */
export function decodeMvtTile(bytes: Uint8Array): DecodedMvtTile {
  const r = new ProtobufReader(bytes);
  const layers: Record<string, DecodedMvtLayer> = {};
  while (r.hasMore()) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 3 && wire === 2) {
      const layer = decodeLayer(r.readBytes());
      layers[layer.name] = layer;
    } else {
      r.skipField(wire);
    }
  }
  return { layers };
}
