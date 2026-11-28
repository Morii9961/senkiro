import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export interface ZipEntryMeta {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ReadOnlyZipArchive {
  listEntries(): string[];
  hasEntry(name: string): boolean;
  readBuffer(name: string): Buffer;
  readText(name: string): string;
}

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MIN_EOCD_SIZE = 22;
const MAX_EOCD_SEARCH = 65557;

function findEndOfCentralDirectory(buf: Buffer): number {
  const minOffset = Math.max(0, buf.length - MAX_EOCD_SEARCH);
  for (let i = buf.length - MIN_EOCD_SIZE; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new Error('Invalid ZIP archive: End of Central Directory record not found');
}

function parseCentralDirectory(buf: Buffer): Map<string, ZipEntryMeta> {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, ZipEntryMeta>();

  let pos = centralDirOffset;
  const end = centralDirOffset + centralDirSize;
  while (pos + 46 <= end) {
    if (buf.readUInt32LE(pos) !== CD_SIGNATURE) {
      break;
    }
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Open a ZIP buffer in read-only mode using Node's built-in `zlib`.
 * Supports Store (0) and Deflate (8) entries.
 */
export function openZipBuffer(data: Uint8Array): ReadOnlyZipArchive {
  const buf = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const entries = parseCentralDirectory(buf);

  const readBuffer = (name: string): Buffer => {
    const entry = entries.get(name);
    if (entry === undefined) {
      throw new Error(`ZIP entry not found: "${name}"`);
    }
    const offset = entry.localHeaderOffset;
    if (buf.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
      throw new Error(`Invalid ZIP local header for entry "${name}"`);
    }
    const localNameLen = buf.readUInt16LE(offset + 26);
    const localExtraLen = buf.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.compressionMethod === 0) {
      return Buffer.from(compressed);
    }
    if (entry.compressionMethod === 8) {
      return inflateRawSync(compressed);
    }
    throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for "${name}"`);
  };

  return {
    listEntries: () => [...entries.keys()],
    hasEntry: (name: string) => entries.has(name),
    readBuffer,
    readText: (name: string) => readBuffer(name).toString('utf8'),
  };
}

/** Read a ZIP archive from disk strictly read-only. */
export function openZipFile(filePath: string): ReadOnlyZipArchive {
  return openZipBuffer(readFileSync(filePath));
}
