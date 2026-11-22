import { Quaternion, Vector3 } from 'three'
import type { DrawBlock as Block } from './buildings'
import { Finish } from './surfaces'
import type { Link, Place } from './domain/types'

type Beam = (
  from: Vector3,
  to: Vector3,
  w: number,
  d: number,
  color: number,
) => void
const up = new Vector3(0, 1, 0)
const stone = 0xbab9aa,
  metal = 0x465963,
  brass = 0xf0b959,
  enamel = 0x294447

const lineColors: Record<string, number> = {
  'sk:line:loop': 0xbe684b,
  'sk:line:kobe': 0x436e86,
  'sk:line:kyoto': 0x567c97,
  'sk:line:east': 0x5a877c,
  'sk:line:midosuji': 0xa94445,
  'sk:line:hk-kyoto': 0x556d53,
  'sk:line:hk-takarazuka': 0x986c40,
  'sk:line:hk-kobe': 0x51667e,
  'sk:line:hs-main': 0x345e79,
  'sk:line:jr-tozai': 0x996a86,
  'sk:line:tanimachi': 0x7a6388,
  'sk:line:yotsubashi': 0x397f97,
}

// Sizes, modular bays, sign panels and car shapes are original diagram symbols.
export function platformFittings(
  n: Place,
  at: Vector3,
  landings: Vector3[],
  block: Block,
  board: (p: Vector3, alongX: boolean) => void,
) {
  const alongX = n.size[0] > n.size[1],
    length = Math.max(...n.size)
  const accent = lineColors[n.serviceLineIds?.[0] ?? ''] ?? enamel
  const part = (
    s: number,
    y: number,
    t: number,
    l: number,
    h: number,
    w: number,
    c: number,
  ) =>
    block(
      at.clone().add(new Vector3(alongX ? s : t, y, alongX ? t : s)),
      alongX ? l : w,
      h,
      alongX ? w : l,
      c,
    )
  for (let s = -length / 2 + 2; s < length / 2 - 1; s += 6.1) {
    const stationPoint = at
      .clone()
      .add(new Vector3(alongX ? s : 0, 0, alongX ? 0 : s))
    if (
      landings.some(
        (k) => Math.hypot(stationPoint.x - k.x, stationPoint.z - k.z) < 1.8,
      )
    )
      continue
    for (const [y, width, height, colour] of [
      [0.45, 0.47, 0.24, metal],
      [1.37, 0.25, 1.7, stone],
      [1.31, 0.27, 0.15, accent],
      [2.29, 0.42, 0.18, metal],
    ]) {
      part(s, y, -0.22, width, height, width, colour)
    }
    part(s, 2.4, -0.22, 2.1, 0.13, 0.42, metal)
    part(s + 0.75, 2.05, -0.22, 0.19, 0.46, 1.49, enamel)
    board(
      at
        .clone()
        .add(
          new Vector3(
            alongX ? s + 0.75 : -0.22,
            2.05,
            alongX ? -0.22 : s + 0.75,
          ),
        ),
      !alongX,
    )
    part(s + 0.75, 1.82, -0.22, 0.2, 0.04, 1.49, accent)
    for (const foot of [-0.38, 0.38])
      part(s + foot, 0.52, 0.37, 0.12, 0.27, 0.28, metal)
    for (const slat of [-0.15, 0, 0.15])
      part(s, 0.71, 0.37 + slat, 1.13, 0.09, 0.11, 0xaf8b64)
    part(s, 0.84, 0.15, 1.12, 0.23, 0.075, 0xa57f58)
    part(s, 2.4, -0.22, 0.11, 0.17, 1.28, 0x777d7c)
    part(s, 2.32, 0.24, 0.49, 0.055, 0.1, 0xfcf1d2)
  }
}
export function horizontalSpan(
  a: Vector3,
  b: Vector3,
  w: number,
  h: number,
  color: number,
  block: Block,
) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz)
  if (len < 0.02) return
  block(
    a.clone().lerp(b, 0.5),
    w,
    h,
    len,
    color,
    new Quaternion().setFromAxisAngle(up, Math.atan2(dx, dz)),
  )
}
export function stairs(
  e: Link,
  a: Vector3,
  b: Vector3,
  block: Block,
  beam: Beam,
  tread = stone,
) {
  const low = a.y < b.y ? a : b,
    high = low === a ? b : a
  const run = high.clone().sub(low)
  run.y = 0
  const length = run.length()
  run.normalize()
  const side = new Vector3(run.z, 0, -run.x),
    width = e.kind === 'Stairs' ? 1.32 : 1.08
  const rotation = new Quaternion().setFromAxisAngle(
    up,
    Math.atan2(run.x, run.z),
  )
  const rise = high.y - low.y,
    count = Math.max(6, Math.ceil(rise / 0.33))
  for (let i = 0; i < count; i++) {
    const center = low.clone().lerp(high, (i + 0.5) / count)
    block(
      center,
      width,
      rise / count + 0.05,
      length / count + 0.02,
      tread,
      rotation,
    )
    block(
      center
        .clone()
        .addScaledVector(run, (-length / count) * 0.44)
        .addScaledVector(up, (rise / count) * 0.5 + 0.032),
      width - 0.09,
      0.035,
      0.055,
      brass,
      rotation,
    )
  }
  for (const s of [-1, 1]) {
    const base = low.clone().addScaledVector(side, s * (width / 2 + 0.06))
    const top = high.clone().addScaledVector(side, s * (width / 2 + 0.06))
    beam(base, top, 0.14, 0.27, metal)
    const railHeight = e.kind === 'Stairs' ? 0.77 : 0.94
    beam(
      base.clone().addScaledVector(up, railHeight),
      top.clone().addScaledVector(up, railHeight),
      0.09,
      0.11,
      metal,
    )
    for (const f of [0, 0.5, 1])
      block(
        base
          .clone()
          .lerp(top, f)
          .addScaledVector(up, railHeight / 2),
        0.09,
        railHeight,
        0.09,
        metal,
      )
    if (e.kind === 'Escalator')
      beam(
        base.addScaledVector(up, 0.42),
        top.addScaledVector(up, 0.42),
        0.15,
        0.61,
        0x78999c,
      )
  }
}
export function lift(
  a: Vector3,
  b: Vector3,
  showA: boolean,
  showB: boolean,
  block: Block,
  beam: Beam,
  shaft: boolean,
) {
  for (const [pos, show] of [
    [a, showA],
    [b, showB],
  ] as const) {
    if (!show) continue
    const part = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: number,
    ) => block(pos.clone().add(new Vector3(x, y, z)), w, h, d, c)
    part(0, 0.97, -0.16, 1.25, 1.94, 1.04, 0x758f96)
    for (const side of [-1, 1]) {
      part(side * 0.29, 0.88, 0.38, 0.55, 1.62, 0.055, 0xafbab9)
      part(side * 0.29, 1.2, 0.42, 0.37, 0.42, 0.043, 0x51656b)
      part(side * 0.29, 0.27, 0.415, 0.48, 0.15, 0.035, 0x899192)
      part(side * 0.64, 0.97, 0.38, 0.12, 1.95, 0.15, metal)
    }
    part(0, 1.79, 0.4, 1.2, 0.18, 0.13, enamel)
    part(0.82, 1.07, 0.38, 0.19, 0.37, 0.1, brass)
    part(0, 2, -0.09, 1.47, 0.11, 1.24, metal)
  }
  if (shaft) {
    for (const x of [-0.66, 0.66])
      for (const z of [-0.58, 0.58])
        beam(
          a.clone().add(new Vector3(x, 0, z)),
          b.clone().add(new Vector3(x, 0, z)),
          0.1,
          0.1,
          metal,
        )
    const low = a.y < b.y ? a : b,
      high = low === a ? b : a
    block(
      low
        .clone()
        .lerp(high, 0.5)
        .add(new Vector3(0, 0, -0.59)),
      1.24,
      high.y - low.y,
      0.045,
      0x8aabb4,
      undefined,
      Finish.glazing,
    )
    for (const f of [0.33, 0.66])
      block(a.clone().lerp(b, f), 1.4, 0.1, 1.24, 0x70878b)
  }
}
export function gate(a: Vector3, b: Vector3, block: Block) {
  const walk = b.clone().sub(a)
  walk.y = 0
  walk.normalize()
  const side = new Vector3(walk.z, 0, -walk.x),
    mid = a.clone().lerp(b, 0.5)
  const rotation = new Quaternion().setFromAxisAngle(
    up,
    Math.atan2(walk.x, walk.z),
  )
  const part = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
  ) =>
    block(
      mid
        .clone()
        .addScaledVector(side, x)
        .addScaledVector(up, y)
        .addScaledVector(walk, z),
      w,
      h,
      d,
      c,
      rotation,
    )
  for (const lane of [-1.35, -0.45, 0.45, 1.35]) {
    part(lane, 0.44, 0, 0.31, 0.88, 1.32, metal)
    part(lane, 0.91, 0, 0.34, 0.1, 1.35, 0x9bada6)
    part(lane, 0.975, -0.39, 0.21, 0.04, 0.28, brass)
  }
  for (const x of [-1.35, -0.45, 0.45])
    part(x + 0.24, 0.54, 0.08, 0.23, 0.31, 0.065, 0x8b6659)
  for (const x of [-1.35, -0.45, 0.45, 1.35]) {
    part(x, 0.93, 0.47, 0.22, 0.035, 0.22, 0x273337)
    part(x, 0.73, -0.67, 0.18, 0.12, 0.035, 0x78a38a)
    part(x, 0.17, 0, 0.33, 0.085, 1.37, 0x96a1a1)
  }
  for (const x of [-1.72, 1.72]) part(x, 1.14, 0, 0.14, 2.28, 0.14, metal)
  part(0, 2.3, 0, 3.6, 0.36, 0.18, enamel)
  part(0, 2.12, 0, 3.6, 0.06, 0.19, brass)
}
// Cut the upper deck back along each arriving flight so the last treads are visible.
export function deck(
  n: Place,
  at: Vector3,
  flights: { top: Vector3; foot: Vector3 }[],
  colour: number,
  block: Block,
) {
  const [width, depth] = n.size,
    x0 = at.x - width / 2,
    x1 = at.x + width / 2,
    z0 = at.z - depth / 2,
    z1 = at.z + depth / 2
  const cuts = flights.flatMap(({ top, foot }) => {
    if (top.x < x0 || top.x > x1 || top.z < z0 || top.z > z1) return []
    const edge = top.clone().lerp(foot, 0.94)
    const xAligned = Math.abs(top.x - foot.x) > Math.abs(top.z - foot.z)
    const sx = xAligned ? 0.15 : 0.75,
      sz = xAligned ? 0.75 : 0.15
    return [
      {
        x0: Math.max(x0, Math.min(top.x, edge.x) - sx),
        x1: Math.min(x1, Math.max(top.x, edge.x) + sx),
        z0: Math.max(z0, Math.min(top.z, edge.z) - sz),
        z1: Math.min(z1, Math.max(top.z, edge.z) + sz),
      },
    ]
  })
  if (!cuts.length) {
    block(at, width, 0.54, depth, colour)
    return
  }
  const xs = [...new Set([x0, x1, ...cuts.flatMap((c) => [c.x0, c.x1])])].sort(
    (a, b) => a - b,
  )
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i] + xs[i - 1]) / 2
    const slot = cuts.filter((c) => c.x0 < cx && cx < c.x1)
    const zs = [
      ...new Set([z0, z1, ...slot.flatMap((c) => [c.z0, c.z1])]),
    ].sort((a, b) => a - b)
    for (let j = 1; j < zs.length; j++) {
      const cz = (zs[j] + zs[j - 1]) / 2
      if (!slot.some((c) => c.z0 < cz && cz < c.z1))
        block(
          new Vector3(cx, at.y, cz),
          xs[i] - xs[i - 1],
          0.54,
          zs[j] - zs[j - 1],
          colour,
        )
    }
  }
}

// Short rails leave the ends of a concourse and all graph crossings open.
export function hallRails(
  n: Place,
  at: Vector3,
  openings: Vector3[],
  block: Block,
) {
  const alongX = n.size[0] > n.size[1],
    length = Math.max(...n.size),
    breadth = Math.min(...n.size)
  if (length < 5) return
  for (const side of [-1, 1]) {
    const lateral = side * (breadth / 2 - 0.12)
    for (let x = -length / 2 + 0.35; x + 1.5 < length / 2 - 0.2; x += 1.9) {
      const center = at
        .clone()
        .add(
          new Vector3(
            alongX ? x + 0.75 : lateral,
            0.74,
            alongX ? lateral : x + 0.75,
          ),
        )
      if (
        openings.some((v) => Math.hypot(v.x - center.x, v.z - center.z) < 2.5)
      )
        continue
      block(center, alongX ? 1.55 : 0.09, 0.1, alongX ? 0.09 : 1.55, metal)
      for (const dir of [-1, 1])
        block(
          center
            .clone()
            .add(
              new Vector3(
                alongX ? dir * 0.69 : 0,
                -0.22,
                alongX ? 0 : dir * 0.69,
              ),
            ),
          0.08,
          0.43,
          0.08,
          metal,
        )
    }
  }
}
