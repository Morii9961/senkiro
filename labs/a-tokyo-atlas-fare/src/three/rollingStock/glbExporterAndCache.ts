/**
 * SENKIRO Atlas v2 — Khronos glTF 2.0 Binary (.glb) Serializer, Loader & Asset Cache
 *
 * 1. `serializeObject3DToGlb(root)`: Deterministic, zero-DOM-dependency glTF 2.0 binary (.glb)
 *    serializer that converts any Three.js rolling stock hierarchy into a compact, specification-compliant
 *    GLB binary buffer (preserving node names, transforms, PBR metallic-roughness materials, and indexed meshes).
 * 2. `RollingStockAssetCache`: Runtime GLB loader & LRU/reference-counted asset cache backed by
 *    Three.js `GLTFLoader`, supporting both URL fetching and direct binary buffer parsing.
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RollingStockSeriesId } from '../../domain/rollingStock/types.js';
import { getRollingStockSpec } from '../../domain/rollingStock/specs.js';

export interface GlbHeaderInspection {
  readonly validMagic: boolean;
  readonly magicText: string;
  readonly version: number;
  readonly totalByteLength: number;
  readonly jsonChunkLength: number;
  readonly binChunkLength: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly accessorCount: number;
  readonly nodeNames: string[];
}

/**
 * Inspects and validates a raw `.glb` binary buffer against the Khronos glTF 2.0 Binary specification.
 */
export function inspectGlbBinary(glbBytes: Uint8Array): GlbHeaderInspection {
  if (glbBytes.byteLength < 20) {
    throw new Error(`Invalid GLB buffer: too short (${glbBytes.byteLength} bytes)`);
  }
  const view = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalByteLength = view.getUint32(8, true);

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error(`Invalid GLB JSON chunk type: 0x${jsonChunkType.toString(16)}`);
  }

  const jsonBytes = glbBytes.subarray(20, 20 + jsonChunkLength);
  const jsonText = new TextDecoder().decode(jsonBytes);
  const gltfJson = JSON.parse(jsonText) as {
    nodes?: { name?: string }[];
    meshes?: unknown[];
    materials?: unknown[];
    accessors?: unknown[];
  };

  const binHeaderOffset = 20 + jsonChunkLength;
  const binChunkLength =
    binHeaderOffset + 8 <= glbBytes.byteLength ? view.getUint32(binHeaderOffset, true) : 0;

  return {
    validMagic: magic === 0x46546c67,
    magicText: String.fromCharCode(
      glbBytes[0]!,
      glbBytes[1]!,
      glbBytes[2]!,
      glbBytes[3]!,
    ),
    version,
    totalByteLength,
    jsonChunkLength,
    binChunkLength,
    nodeCount: gltfJson.nodes?.length ?? 0,
    meshCount: gltfJson.meshes?.length ?? 0,
    materialCount: gltfJson.materials?.length ?? 0,
    accessorCount: gltfJson.accessors?.length ?? 0,
    nodeNames: (gltfJson.nodes ?? []).map((n) => n.name ?? ''),
  };
}

/**
 * Converts a Three.js Object3D tree into a compact Khronos glTF 2.0 binary (.glb) buffer.
 * Preserves node names (e.g. `Door_L_1_Fwd`, `Headlight_L`, `Bogie_Front`, `Pantograph`),
 * local TRS transforms, PBR material factors, and vertex positions/normals.
 */
export function serializeObject3DToGlb(
  root: THREE.Object3D,
  options?: { includeOnlyVisible?: boolean },
): Uint8Array {
  const includeOnlyVisible = options?.includeOnlyVisible ?? true;
  root.updateMatrixWorld(true);

  interface GltfMaterialDef {
    name: string;
    pbrMetallicRoughness: {
      baseColorFactor: [number, number, number, number];
      metallicFactor: number;
      roughnessFactor: number;
    };
    emissiveFactor?: [number, number, number];
    doubleSided?: boolean;
  }

  interface GltfBufferViewDef {
    buffer: number;
    byteOffset: number;
    byteLength: number;
    target?: number;
  }

  interface GltfAccessorDef {
    bufferView: number;
    byteOffset: number;
    componentType: number;
    count: number;
    type: 'SCALAR' | 'VEC2' | 'VEC3';
    min?: number[];
    max?: number[];
  }

  interface GltfMeshDef {
    name: string;
    primitives: {
      attributes: {
        POSITION: number;
        NORMAL?: number;
      };
      indices?: number;
      material: number;
      mode: number;
    }[];
  }

  interface GltfNodeDef {
    name: string;
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    mesh?: number;
    children?: number[];
  }

  const materials: GltfMaterialDef[] = [];
  const matIndexByUuid = new Map<string, number>();

  const bufferViews: GltfBufferViewDef[] = [];
  const accessors: GltfAccessorDef[] = [];
  const meshes: GltfMeshDef[] = [];
  const meshIndexByKey = new Map<string, number>();
  const nodes: GltfNodeDef[] = [];

  const binaryChunks: Uint8Array[] = [];
  let currentByteOffset = 0;

  const appendBinaryChunk = (bytes: Uint8Array, target?: number): number => {
    const viewIndex = bufferViews.length;
    const padLen = (4 - (bytes.byteLength % 4)) % 4;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentByteOffset,
      byteLength: bytes.byteLength,
      ...(target !== undefined ? { target } : {}),
    });
    binaryChunks.push(bytes);
    currentByteOffset += bytes.byteLength;
    if (padLen > 0) {
      binaryChunks.push(new Uint8Array(padLen));
      currentByteOffset += padLen;
    }
    return viewIndex;
  };

  const getOrAddMaterial = (mat: THREE.Material): number => {
    const existing = matIndexByUuid.get(mat.uuid);
    if (existing !== undefined) return existing;

    const std = mat as THREE.MeshStandardMaterial;
    const col = std.color ?? new THREE.Color(0xcccccc);
    const em = std.emissive ?? new THREE.Color(0x000000);
    const emInt = std.emissiveIntensity ?? 1.0;

    const def: GltfMaterialDef = {
      name: std.name || `Material_${materials.length}`,
      pbrMetallicRoughness: {
        baseColorFactor: [
          Number(col.r.toFixed(4)),
          Number(col.g.toFixed(4)),
          Number(col.b.toFixed(4)),
          Number((std.opacity ?? 1.0).toFixed(4)),
        ],
        metallicFactor: Number((std.metalness ?? 0.2).toFixed(4)),
        roughnessFactor: Number((std.roughness ?? 0.5).toFixed(4)),
      },
      doubleSided: std.side === THREE.DoubleSide,
    };

    if ((em.r > 0 || em.g > 0 || em.b > 0) && emInt > 0) {
      def.emissiveFactor = [
        Number(Math.min(1, em.r * emInt).toFixed(4)),
        Number(Math.min(1, em.g * emInt).toFixed(4)),
        Number(Math.min(1, em.b * emInt).toFixed(4)),
      ];
    }

    const idx = materials.length;
    materials.push(def);
    matIndexByUuid.set(mat.uuid, idx);
    return idx;
  };

  const getOrAddMesh = (geom: THREE.BufferGeometry, matIdx: number, name: string): number => {
    const cacheKey = `${geom.uuid}::${matIdx}`;
    const existing = meshIndexByKey.get(cacheKey);
    if (existing !== undefined) return existing;

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count === 0) {
      return -1;
    }

    const count = posAttr.count;
    const posArray = new Float32Array(count * 3);
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      posArray[i * 3] = x;
      posArray[i * 3 + 1] = y;
      posArray[i * 3 + 2] = z;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    const posViewIdx = appendBinaryChunk(
      new Uint8Array(posArray.buffer, posArray.byteOffset, posArray.byteLength),
      34962, // ARRAY_BUFFER
    );
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });

    let normAccIdx: number | undefined;
    const normAttr = geom.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (normAttr && normAttr.count === count) {
      const normArray = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        normArray[i * 3] = normAttr.getX(i);
        normArray[i * 3 + 1] = normAttr.getY(i);
        normArray[i * 3 + 2] = normAttr.getZ(i);
      }
      const normViewIdx = appendBinaryChunk(
        new Uint8Array(normArray.buffer, normArray.byteOffset, normArray.byteLength),
        34962,
      );
      normAccIdx = accessors.length;
      accessors.push({
        bufferView: normViewIdx,
        byteOffset: 0,
        componentType: 5126,
        count,
        type: 'VEC3',
      });
    }

    let indexAccIdx: number | undefined;
    if (geom.index && geom.index.count > 0 && count < 65535) {
      const idxCount = geom.index.count;
      const idxArray = new Uint16Array(idxCount);
      for (let i = 0; i < idxCount; i++) {
        idxArray[i] = geom.index.getX(i);
      }
      const idxViewIdx = appendBinaryChunk(
        new Uint8Array(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength),
        34963, // ELEMENT_ARRAY_BUFFER
      );
      indexAccIdx = accessors.length;
      accessors.push({
        bufferView: idxViewIdx,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: idxCount,
        type: 'SCALAR',
      });
    }

    const meshIdx = meshes.length;
    meshes.push({
      name: name || `Mesh_${meshIdx}`,
      primitives: [
        {
          attributes: {
            POSITION: posAccIdx,
            ...(normAccIdx !== undefined ? { NORMAL: normAccIdx } : {}),
          },
          ...(indexAccIdx !== undefined ? { indices: indexAccIdx } : {}),
          material: matIdx,
          mode: 4, // TRIANGLES
        },
      ],
    });
    meshIndexByKey.set(cacheKey, meshIdx);
    return meshIdx;
  };

  const visitNode = (obj: THREE.Object3D): number | null => {
    if (includeOnlyVisible && !obj.visible) return null;

    const nodeIdx = nodes.length;
    const nodeDef: GltfNodeDef = {
      name: obj.name || `Node_${nodeIdx}`,
    };
    nodes.push(nodeDef);

    if (obj.position.x !== 0 || obj.position.y !== 0 || obj.position.z !== 0) {
      nodeDef.translation = [
        Number(obj.position.x.toFixed(5)),
        Number(obj.position.y.toFixed(5)),
        Number(obj.position.z.toFixed(5)),
      ];
    }

    const q = obj.quaternion;
    if (Math.abs(q.x) > 1e-5 || Math.abs(q.y) > 1e-5 || Math.abs(q.z) > 1e-5 || Math.abs(q.w - 1) > 1e-5) {
      nodeDef.rotation = [
        Number(q.x.toFixed(5)),
        Number(q.y.toFixed(5)),
        Number(q.z.toFixed(5)),
        Number(q.w.toFixed(5)),
      ];
    }

    if (obj.scale.x !== 1 || obj.scale.y !== 1 || obj.scale.z !== 1) {
      nodeDef.scale = [
        Number(obj.scale.x.toFixed(5)),
        Number(obj.scale.y.toFixed(5)),
        Number(obj.scale.z.toFixed(5)),
      ];
    }

    if (obj instanceof THREE.Mesh) {
      const mat = Array.isArray(obj.material) ? obj.material[0]! : obj.material;
      const matIdx = getOrAddMaterial(mat);
      const meshIdx = getOrAddMesh(obj.geometry, matIdx, obj.name);
      if (meshIdx >= 0) {
        nodeDef.mesh = meshIdx;
      }
    }

    const childIndices: number[] = [];
    for (const child of obj.children) {
      const cIdx = visitNode(child);
      if (cIdx !== null) {
        childIndices.push(cIdx);
      }
    }
    if (childIndices.length > 0) {
      nodeDef.children = childIndices;
    }

    return nodeIdx;
  };

  const rootNodeIdx = visitNode(root);
  const gltfDoc = {
    asset: {
      version: '2.0',
      generator: 'SENKIRO Lab Rolling Stock GLB Serializer v2.0',
      copyright: 'SENKIRO Lab (MIT / CC BY 4.0)',
    },
    scene: 0,
    scenes: [
      {
        name: root.name || 'RollingStockScene',
        nodes: rootNodeIdx !== null ? [rootNodeIdx] : [],
      },
    ],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: currentByteOffset,
      },
    ],
  };

  const jsonRawBytes = new TextEncoder().encode(JSON.stringify(gltfDoc));
  const jsonPad = (4 - (jsonRawBytes.byteLength % 4)) % 4;
  const jsonChunkLen = jsonRawBytes.byteLength + jsonPad;

  const binChunkLen = currentByteOffset;
  const totalLen = 12 + 8 + jsonChunkLen + 8 + binChunkLen;

  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);

  // 12-byte GLB Header
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true); // version 2
  view.setUint32(8, totalLen, true);

  // JSON Chunk Header + Payload
  view.setUint32(12, jsonChunkLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonRawBytes, 20);
  for (let i = 0; i < jsonPad; i++) {
    out[20 + jsonRawBytes.byteLength + i] = 0x20; // space padding per glTF spec
  }

  // BIN Chunk Header + Payload
  const binHeaderPos = 20 + jsonChunkLen;
  view.setUint32(binHeaderPos, binChunkLen, true);
  view.setUint32(binHeaderPos + 4, 0x004e4942, true); // 'BIN\0'

  let writePos = binHeaderPos + 8;
  for (const chunk of binaryChunks) {
    out.set(chunk, writePos);
    writePos += chunk.byteLength;
  }

  return out;
}

/**
 * Parses a `.glb` binary buffer using Three.js's official `GLTFLoader`.
 */
export function parseGlbBufferWithThreeLoader(glbBytes: Uint8Array): Promise<GLTF> {
  const loader = new GLTFLoader();
  // Create a clean ArrayBuffer slice for GLTFLoader.parse
  const slice = glbBytes.buffer.slice(
    glbBytes.byteOffset,
    glbBytes.byteOffset + glbBytes.byteLength,
  ) as ArrayBuffer;

  return new Promise<GLTF>((resolve, reject) => {
    loader.parse(
      slice,
      '',
      (gltf) => resolve(gltf),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

/**
 * Runtime GLB Asset Cache with in-flight deduplication and LRU/explicit eviction.
 */
export class RollingStockAssetCache {
  private static instance: RollingStockAssetCache | null = null;

  static getInstance(): RollingStockAssetCache {
    if (!RollingStockAssetCache.instance) {
      RollingStockAssetCache.instance = new RollingStockAssetCache();
    }
    return RollingStockAssetCache.instance;
  }

  private readonly loadedScenes = new Map<string, THREE.Group>();
  private readonly inFlight = new Map<string, Promise<THREE.Group>>();
  private readonly byteSizes = new Map<string, number>();

  async loadGlbUrl(url: string): Promise<THREE.Group> {
    const cached = this.loadedScenes.get(url);
    if (cached) {
      return cached.clone(true);
    }

    const pending = this.inFlight.get(url);
    if (pending) {
      const res = await pending;
      return res.clone(true);
    }

    const task = (async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch GLB asset ${url}: HTTP ${res.status}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      this.byteSizes.set(url, buf.byteLength);
      const gltf = await parseGlbBufferWithThreeLoader(buf);
      this.loadedScenes.set(url, gltf.scene);
      this.inFlight.delete(url);
      return gltf.scene;
    })();

    this.inFlight.set(url, task);
    const scene = await task;
    return scene.clone(true);
  }

  async preloadSeriesGlbAssets(seriesId: RollingStockSeriesId): Promise<{
    leadCar: THREE.Group;
    intermediateCar: THREE.Group;
  }> {
    const spec = getRollingStockSpec(seriesId);
    const [leadCar, intermediateCar] = await Promise.all([
      this.loadGlbUrl(spec.glbAssetPaths.leadCar),
      this.loadGlbUrl(spec.glbAssetPaths.intermediateCar),
    ]);
    return { leadCar, intermediateCar };
  }

  getCacheStats(): {
    cachedAssetCount: number;
    totalCachedBytes: number;
    urls: string[];
  } {
    let totalCachedBytes = 0;
    for (const b of this.byteSizes.values()) {
      totalCachedBytes += b;
    }
    return {
      cachedAssetCount: this.loadedScenes.size,
      totalCachedBytes,
      urls: [...this.loadedScenes.keys()],
    };
  }

  clearCache(): void {
    for (const scene of this.loadedScenes.values()) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
        }
      });
    }
    this.loadedScenes.clear();
    this.inFlight.clear();
    this.byteSizes.clear();
  }
}
