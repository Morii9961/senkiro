/**
 * Merges primitives into a handful of BufferGeometries so the whole station
 * costs a few draw calls instead of several hundred.
 *
 * Each beam contributes 24 vertices / 12 triangles, so triangle index ÷ 12
 * gives the primitive — and through it the model element — under the cursor.
 */
import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { Prim, Vec3 } from './build';

const linearCache = new Map<string, [number, number, number]>();

/** Palette colours are sRGB hex; vertex colours must be in the linear working space. */
function linearRgb(hex: string): [number, number, number] {
  let c = linearCache.get(hex);
  if (!c) {
    const col = new Color(hex);
    c = [col.r, col.g, col.b];
    linearCache.set(hex, c);
  }
  return c;
}

export interface MergedMesh {
  geometry: BufferGeometry;
  /** Model element per primitive, in geometry order. */
  elementIds: (string | null)[];
  pickable: boolean[];
  triangleCount: number;
}

const TRIANGLES_PER_PRIM = 12;

function corners(p: Prim): Vec3[] {
  const [ax, ay, az] = p.a;
  const [bx, by, bz] = p.b;
  let dx = bx - ax;
  let dy = by - ay;
  let dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  // side = d × Y (horizontal, perpendicular to the beam); falls back to X for vertical beams
  let sx = -dz;
  let sy = 0;
  let sz = dx;
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-6) {
    sx = 1;
    sz = 0;
  } else {
    sx /= sl;
    sz /= sl;
  }
  // up = side × d
  const ux = sy * dz - sz * dy;
  const uy = sz * dx - sx * dz;
  const uz = sx * dy - sy * dx;
  const hw = p.width / 2;
  const ht = p.thickness / 2;
  const out: Vec3[] = [];
  for (const [ex, ey, ez] of [p.a, p.b]) {
    for (const s of [-1, 1]) {
      for (const u of [-1, 1]) {
        out.push([ex + sx * hw * s + ux * ht * u, ey + sy * hw * s + uy * ht * u, ez + sz * hw * s + uz * ht * u]);
      }
    }
  }
  // index = end*4 + side*2 + up
  return out;
}

// quads as corner indices, wound counter-clockwise seen from outside
const FACES: [number, number, number, number][] = [
  [0, 1, 3, 2], // start cap
  [4, 6, 7, 5], // end cap
  [0, 4, 5, 1], // side −
  [2, 3, 7, 6], // side +
  [0, 2, 6, 4], // bottom
  [1, 5, 7, 3], // top
];

const EDGES: [number, number][] = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function mergePrims(prims: Prim[]): MergedMesh {
  const n = prims.length;
  const positions = new Float32Array(n * 24 * 3);
  const normals = new Float32Array(n * 24 * 3);
  const colors = new Float32Array(n * 24 * 4);
  const index = new Uint32Array(n * 36);
  const elementIds: (string | null)[] = [];
  const pickable: boolean[] = [];

  prims.forEach((p, pi) => {
    const c = corners(p);
    const [r, g, b] = linearRgb(p.color);
    elementIds.push(p.elementId);
    pickable.push(p.pickable);
    // make the faces outward whatever the beam direction: flip if the box is mirrored
    const centre: Vec3 = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
    FACES.forEach((face, fi) => {
      const v = face.map((i) => c[i]!);
      const e1: Vec3 = [v[1]![0] - v[0]![0], v[1]![1] - v[0]![1], v[1]![2] - v[0]![2]];
      const e2: Vec3 = [v[2]![0] - v[0]![0], v[2]![1] - v[0]![1], v[2]![2] - v[0]![2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1];
      let ny = e1[2] * e2[0] - e1[0] * e2[2];
      let nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const outward = (v[0]![0] - centre[0]) * nx + (v[0]![1] - centre[1]) * ny + (v[0]![2] - centre[2]) * nz;
      const flip = outward < 0;
      if (flip) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const base = pi * 24 + fi * 4;
      v.forEach((vert, vi) => {
        const o = (base + vi) * 3;
        positions[o] = vert[0];
        positions[o + 1] = vert[1];
        positions[o + 2] = vert[2];
        normals[o] = nx;
        normals[o + 1] = ny;
        normals[o + 2] = nz;
        const co = (base + vi) * 4;
        colors[co] = r;
        colors[co + 1] = g;
        colors[co + 2] = b;
        colors[co + 3] = p.alpha;
      });
      const io = pi * 36 + fi * 6;
      const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      order.forEach((k, j) => {
        index[io + j] = base + k;
      });
    });
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return { geometry, elementIds, pickable, triangleCount: n * TRIANGLES_PER_PRIM };
}

export function elementAtFace(mesh: MergedMesh, faceIndex: number | null | undefined): string | null {
  if (faceIndex === null || faceIndex === undefined) return null;
  const pi = Math.floor(faceIndex / TRIANGLES_PER_PRIM);
  return mesh.pickable[pi] ? (mesh.elementIds[pi] ?? null) : null;
}

export function buildOutlines(prims: Prim[]): BufferGeometry {
  const outlined = prims.filter((p) => p.outline);
  const positions = new Float32Array(outlined.length * EDGES.length * 2 * 3);
  const colors = new Float32Array(outlined.length * EDGES.length * 2 * 3);
  outlined.forEach((p, pi) => {
    const c = corners(p);
    const [r, g, b] = linearRgb(p.outlineColor);
    EDGES.forEach(([i, j], ei) => {
      const o = (pi * EDGES.length + ei) * 6;
      const vi = c[i]!;
      const vj = c[j]!;
      positions.set([vi[0], vi[1], vi[2], vj[0], vj[1], vj[2]], o);
      colors.set([r, g, b, r, g, b], o);
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Splits primitives by how they have to be rendered. */
export function partition(prims: Prim[]): { opaque: Prim[]; translucent: Prim[] } {
  const opaque: Prim[] = [];
  const translucent: Prim[] = [];
  for (const p of prims) {
    if (p.alpha >= 0.999) opaque.push(p);
    else if (p.alpha > 0.004) translucent.push(p);
  }
  return { opaque, translucent };
}
