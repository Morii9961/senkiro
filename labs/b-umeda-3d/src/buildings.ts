import { Quaternion, Vector3 } from 'three'
import { Finish } from './surfaces'
import type { Place } from './domain/types'
export type DrawBlock = (
  at: Vector3,
  w: number,
  h: number,
  d: number,
  c: number,
  r?: Quaternion,
  finish?: number,
) => void
type Beam = (a: Vector3, b: Vector3, w: number, d: number, c: number) => void
const frame = 0x657071,
  flange = 0xb0b3ac,
  skin = 0xe4e1d7,
  brass = 0xa78358
const V = (x: number, y: number, z: number) => new Vector3(x, y, z)

// One section of Osaka Station City's sloping train shed. Bays and member profiles are illustrative.
export function osakaShed(platformY: number, block: DrawBlock, beam: Beam) {
  const xs = [-23, -16, -9, -2, 5, 12, 19, 24]
  const y = (z: number) => platformY + 7.2 + (15 - z) * 0.2
  const lower = (x: number, z: number) =>
    V(x, y(z) - 0.7 - 0.4 * Math.sin(((z + 16) * Math.PI) / 32), z)
  for (const x of xs) {
    beam(V(x, y(-16), -16), V(x, y(16), 16), 0.13, 0.2, flange)
    for (let z = -16; z < 16; z += 4) {
      beam(lower(x, z), lower(x, z + 4), 0.12, 0.13, frame)
      beam(lower(x, z), V(x, y(z + 2), z + 2), 0.077, 0.077, frame)
      beam(V(x, y(z + 2), z + 2), lower(x, z + 4), 0.077, 0.077, frame)
    }
    for (const z of [-16, 16]) {
      // End portals carry each roof rib down to its side of the station.
      beam(V(x, platformY - 0.35, z), lower(x, z), 0.26, 0.32, frame)
      beam(
        V(x, platformY + 3.3, z),
        lower(x, z - Math.sign(z) * 2.4),
        0.14,
        0.16,
        frame,
      )
    }
  }
  for (const z of [-16, -13, -10, 0, 10, 16])
    beam(V(-23, y(z) + 0.03, z), V(24, y(z) + 0.03, z), 0.11, 0.12, flange)
  const pitch = new Quaternion().setFromAxisAngle(V(1, 0, 0), Math.atan(0.2))
  // Cut most of the skin away. Retain a narrow glazed clerestory and standing-seam eave.
  for (let x = -23; x < 24; x += 1.7) {
    const width = Math.min(1.7, 24 - x)
    block(
      V(x + width / 2, y(-14.7) + 0.09, -14.7),
      width - 0.04,
      0.1,
      2.55,
      0xbac0be,
      pitch,
      Finish.roof,
    )
    block(
      V(x + width / 2, y(-11.8) + 0.08, -11.8),
      width - 0.06,
      0.055,
      2.96,
      0x9eb7bf,
      pitch,
      Finish.glazing,
    )
  }
}
export function terminalRoof(
  hall: Place,
  at: Vector3,
  block: DrawBlock,
  beam: Beam,
) {
  // A cut terminal roof at the head of the nine tracks; leave the passenger platforms exposed.
  for (let x = -13.5; x <= 13.6; x += 4.5) {
    const xw = at.x + x,
      z = at.z
    block(V(xw, at.y + 1.72, z + 1.3), 0.21, 3.38, 0.22, flange)
    beam(
      V(xw, at.y + 3.2, z + 1.3),
      V(xw, at.y + 3.72, z - 5.5),
      0.16,
      0.23,
      frame,
    )
    beam(
      V(xw, at.y + 2.63, z + 1.3),
      V(xw, at.y + 3.56, z - 2.1),
      0.09,
      0.13,
      frame,
    )
  }
  for (const z of [-5.3, -3.3, 0.8])
    block(
      V(at.x, at.y + 3.65 - z * 0.055, at.z + z),
      hall.size[0],
      0.16,
      0.12,
      flange,
    )
  block(
    V(at.x, at.y + 3.78, at.z + 0.3),
    hall.size[0],
    0.15,
    2.15,
    0xd9d5c6,
    undefined,
    Finish.roof,
  )
  block(V(at.x, at.y + 3.57, at.z + 1.4), hall.size[0], 0.29, 0.12, 0x624941)
}
export function concourseWalls(
  n: Place,
  at: Vector3,
  openings: Vector3[],
  block: DrawBlock,
  interior = false,
) {
  const retail = n.id.includes('whity-') || n.id.includes('diamor')
  const alongX = n.size[0] >= n.size[1],
    len = Math.max(...n.size),
    wide = Math.min(...n.size)
  if (len < 4) return
  const part = (
    s: number,
    y: number,
    t: number,
    l: number,
    h: number,
    w: number,
    c: number,
    f = Finish.metal as number,
  ) =>
    block(
      at.clone().add(V(alongX ? s : t, y, alongX ? t : s)),
      alongX ? l : w,
      h,
      alongX ? w : l,
      c,
      undefined,
      f,
    )
  for (const side of [-1, 1]) {
    const t = side * (wide / 2 - 0.09),
      nr = Math.max(1, Math.ceil(len / (retail ? 3.3 : 3.0))),
      bay = len / nr
    for (let i = 0; i < nr; i++) {
      const s = -len / 2 + (i + 0.5) * bay
      const world = at.clone().add(V(alongX ? s : t, 0, alongX ? t : s))
      if (
        openings.some(
          (v) => Math.hypot(v.x - world.x, v.z - world.z) < bay * 0.48 + 0.12,
        )
      )
        continue
      const front = side === 1 && !interior,
        height = front ? 0.56 : retail ? 2.5 : 1.45
      part(
        s,
        0.3 + height / 2,
        t,
        bay - 0.018,
        height,
        0.15,
        retail && !front ? 0x708785 : skin,
        retail && !front ? Finish.glazing : Finish.ceramic,
      )
      part(s, 0.39, t, bay, 0.14, 0.19, frame)
      part(s, 0.31 + height, t, bay, 0.095, 0.22, front ? flange : 0xc5beb0)
      part(
        s - bay * 0.48,
        0.32 + height / 2,
        t,
        0.13,
        height + 0.1,
        0.23,
        retail ? brass : flange,
      )
      if (!front) {
        part(
          s,
          retail ? 2.43 : 1.38,
          t,
          bay - 0.08,
          retail ? 0.24 : 0.08,
          0.2,
          retail ? 0x6c5645 : 0xa99880,
        )
        if (retail) {
          part(s, 1.6, t, bay - 0.16, 0.055, 0.19, brass)
          part(s, 2.19, t, bay - 0.35, 0.13, 0.23, 0xffdf9b)
          part(s, 0.49, t - 0.17 * side, bay * 0.93, 0.11, 0.3, 0x80634b)
          part(s, 2.69, t - 0.22 * side, bay, 0.085, 0.7, brass)
          part(
            s,
            2.635,
            t - 0.46 * side,
            bay * 0.89,
            0.04,
            0.1,
            0xffedce,
            Finish.light,
          )
        } else {
          part(s, 1.57, t, bay * 0.69, 0.045, 0.22, 0xf5e6c5)
        }
      }
    }
  }
}
export function undergroundPlatform(
  n: Place,
  at: Vector3,
  sides: (-1 | 1)[],
  block: DrawBlock,
) {
  const along = n.size[0] > n.size[1],
    len = Math.max(...n.size),
    width = Math.min(...n.size)
  const part = (
    s: number,
    y: number,
    t: number,
    l: number,
    h: number,
    w: number,
    c: number,
    f = Finish.metal as number,
  ) =>
    block(
      at.clone().add(V(along ? s : t, y, along ? t : s)),
      along ? l : w,
      h,
      along ? w : l,
      c,
      undefined,
      f,
    )
  // A tiled backing wall only on a non-track edge, never between two boarding faces.
  for (const side of [-1, 1] as const) {
    if (sides.includes(side)) continue
    const edge = side * (width / 2 - 0.1)
    for (let x = -len / 2; x < len / 2 - 0.05; x += 3.5) {
      const w = Math.min(3.5, len / 2 - x),
        mid = x + w / 2
      part(mid, 1.03, edge, w - 0.02, 1.32, 0.15, skin, Finish.ceramic)
      part(mid, 1.39, edge, w - 0.02, 0.12, 0.18, 0x778c90)
      part(mid, 0.48, edge, w - 0.02, 0.18, 0.18, frame)
    }
  }
}
export function passageEdges(
  a: Vector3,
  b: Vector3,
  width: number,
  block: DrawBlock,
) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz)
  if (len < 3) return
  const q = new Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(dx, dz))
  const side = V(dz / len, 0, -dx / len)
  for (const sign of [-1, 1]) {
    const axis = a
      .clone()
      .lerp(b, 0.5)
      .addScaledVector(side, sign * (width / 2 - 0.05))
    const h = sign === 1 ? 0.29 : 0.63
    block(
      axis.clone().add(V(0, h / 2, 0)),
      0.11,
      h,
      len - 0.5,
      skin,
      q,
      Finish.ceramic,
    )
    block(
      axis.clone().add(V(0, h + 0.035, 0)),
      0.14,
      0.065,
      len - 0.5,
      flange,
      q,
    )
  }
}
export function passengerCeiling(n: Place, at: Vector3, block: DrawBlock) {
  const terminal = n.id === 'sk:concourse:hk-headhall'
  const c = terminal ? V(47.5, at.y, -32) : at
  const w = terminal ? 32 : n.size[0],
    d = terminal ? 36 : n.size[1]
  const along = w > d,
    len = Math.max(w, d),
    wide = Math.min(w, d),
    h = terminal ? 4.7 : 3.35
  const part = (
    a: number,
    y: number,
    b: number,
    l: number,
    dy: number,
    s: number,
    col: number,
    finish: number,
  ) =>
    block(
      c.clone().add(V(along ? a : b, y, along ? b : a)),
      along ? l : s,
      dy,
      along ? s : l,
      col,
      undefined,
      finish,
    )
  if (terminal) {
    part(0, -0.61, 0, len, 0.18, wide, 0x594f45, Finish.ballast)
    for (const flank of [-1, 1]) {
      const edge = flank * (wide / 2 - 0.04)
      part(
        0,
        0.23,
        edge - flank * 0.54,
        len,
        0.18,
        1.14,
        0xbab9ad,
        Finish.concrete,
      )
      part(0, 0.74, edge, len, 1.54, 0.22, 0xcebfae, Finish.ceramic)
      part(0, 2.6, edge, len, 2.2, 0.15, 0xabc3c4, Finish.glazing)
      part(0, 4.02, edge, len, 1.14, 0.22, 0xafaba4, Finish.ceramic)
      for (let a = -len / 2 + 0.2; a < len / 2; a += 2.25)
        part(
          a,
          2.6,
          edge - flank * 0.1,
          0.075,
          2.3,
          0.13,
          0x536061,
          Finish.metal,
        )
      part(
        0,
        2.21,
        edge - flank * 0.1,
        len,
        0.065,
        0.15,
        0x666e6e,
        Finish.metal,
      )
    }
  }
  if (n.id === 'sk:concourse:whity-izumi') {
    // A cut-set backdrop for the east end of the scene, inset between the side passages.
    for (let k = 0; k < 8; k++) {
      const at = c
        .clone()
        .add(V(w / 2 + 0.12, 1.66, -d / 2 + ((k + 0.5) * d) / 8))
      block(
        at,
        0.18,
        3.12,
        d / 8 - 0.03,
        k % 2 ? 0x91a6a0 : 0xaaa68d,
        undefined,
        Finish.ceramic,
      )
      block(
        at.clone().add(V(-0.11, 1.11, 0)),
        0.05,
        0.045,
        d / 8 - 0.12,
        0xffe3aa,
        undefined,
        Finish.light,
      )
    }
  }
  part(
    0,
    h + 0.16,
    0,
    len,
    0.23,
    wide,
    terminal ? 0x8f8c81 : 0xc6beb0,
    Finish.roof,
  )
  for (let s = -len / 2 + 0.2; s < len / 2; s += terminal ? 4.6 : 3.4)
    part(
      s,
      h - 0.03,
      0,
      0.19,
      0.22,
      wide,
      terminal ? 0x707576 : 0xa7a29a,
      Finish.metal,
    )
  for (let t = -wide / 2 + 0.6; t < wide / 2; t += terminal ? 3.1 : 2.4) {
    part(0, h - 0.17, t, len, 0.11, 0.22, 0x827f76, Finish.metal)
    for (let s = -len / 2 + 0.05; s < len / 2 - 0.1; s += 3.3) {
      const size = Math.min(3.04, len / 2 - s)
      part(s + size / 2, h - 0.245, t, size, 0.04, 0.14, 0xfff1ce, Finish.light)
    }
  }
}
export function plazaTree(at: Vector3, block: DrawBlock, beam: Beam) {
  const foot = at.clone().add(V(1.95, 0.35, 1.55))
  block(foot, 1.15, 0.21, 1.15, 0xb5c0bb, undefined, Finish.ceramic)
  const fork = foot.clone().add(V(0, 1.45, 0))
  beam(foot, fork, 0.13, 0.13, 0xd4e1dc)
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4,
      tip = fork
        .clone()
        .add(V(Math.cos(a) * 0.94, 0.58 + (j % 3) * 0.14, Math.sin(a) * 0.94))
    beam(fork, tip, 0.055, 0.055, 0xdce5e1)
    beam(
      tip,
      tip
        .clone()
        .add(V(Math.cos(a + 0.6) * 0.4, 0.36, Math.sin(a + 0.6) * 0.4)),
      0.035,
      0.035,
      0x9bcbd1,
    )
  }
}
