import * as T from 'three'
import { lineStyleById, nodes, station } from './model'
import { lineBadgeTextColor } from './domain/lines'
import type { Place } from './domain/types'
export interface Board {
  position: T.Vector3
  alongX: boolean
  platform: string
}

// One locally drawn sign atlas shared by all platform boards. Text and numbers come from station data.
export function signage() {
  const platforms = station.places.filter((p) => p.kind === 'Platform')
  const rows = Math.ceil(platforms.length / 4),
    tex = document.createElement('canvas')
  tex.width = 1536
  tex.height = rows * 112
  const ctx = tex.getContext('2d')!
  for (const [i, p] of platforms.entries()) {
    const x = (i % 4) * 384,
      y = Math.floor(i / 4) * 112
    const num =
      p.boarding?.label ??
      p.id
        .split(':')
        .pop()!
        .replace(/^(jr|metro)-/, '')
        .replace('-', '・')
    const st = station.stations.find((s) => s.id === p.stationId)!
    const name = st.names.ja.replace(/（.*）/, '')
    ctx.fillStyle = '#18282e'
    ctx.fillRect(x, y, 384, 112)
    ctx.fillStyle = '#f1eee0'
    ctx.font = 'bold 40px sans-serif'
    ctx.fillText(name, x + 12, y + 49, 246)
    ctx.font = '21px sans-serif'
    ctx.fillText(st.names.en, x + 13, y + 83, 231)
    let markX = x + 254
    for (const id of p.serviceLineIds ?? []) {
      const style = lineStyleById.get(id)
      const code = style?.stationNumberPrefix ?? style?.shortName?.ja
      if (!code) continue
      ctx.font = 'bold 11px sans-serif'
      const width = Math.max(20, ctx.measureText(code).width + 6)
      const hex = style?.color?.hex ?? '#e1e3e3'
      ctx.fillStyle = hex
      ctx.fillRect(markX, y + 75, width, 21)
      ctx.fillStyle = lineBadgeTextColor(hex)
      ctx.textAlign = 'center'
      ctx.fillText(code, markX + width / 2, y + 89)
      markX += width + 3
    }
    ctx.fillStyle = '#e9e4d5'
    ctx.font = 'bold 45px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(num, x + 370, y + 66, 114)
    ctx.textAlign = 'left'
  }
  const texture = new T.CanvasTexture(tex)
  texture.colorSpace = T.SRGBColorSpace
  const material = new T.MeshBasicMaterial({ map: texture })
  let mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial> | null = null
  function rebuild(boards: Board[], scene: T.Scene) {
    if (mesh) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      mesh = null
    }
    if (!boards.length) return
    const pos: number[] = [],
      uv: number[] = [],
      indices: number[] = []
    for (const board of boards) {
      const slot = platforms.indexOf(nodes.get(board.platform) as Place),
        row = Math.floor(slot / 4),
        col = slot % 4
      const ux = (col * 384 + 2) / tex.width,
        v0 = 1 - (row * 112 + 110) / tex.height,
        ux1 = ((col + 1) * 384 - 2) / tex.width,
        v1 = 1 - (row * 112 + 2) / tex.height
      for (const side of [-1, 1]) {
        const v = board.position,
          basis = board.alongX
            ? new T.Vector3(side, 0, 0)
            : new T.Vector3(0, 0, -side)
        const n = board.alongX
          ? new T.Vector3(0, 0, side)
          : new T.Vector3(side, 0, 0)
        const start = pos.length / 3
        for (const [x, y] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const vertex = v
            .clone()
            .addScaledVector(basis, x * 0.72)
            .addScaledVector(n, 0.102)
          pos.push(vertex.x, vertex.y + y * 0.216, vertex.z)
        }
        uv.push(ux, v0, ux1, v0, ux1, v1, ux, v1)
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
      }
    }
    const geom = new T.BufferGeometry()
    geom.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geom.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geom.setIndex(indices)
    mesh = new T.Mesh(geom, material)
    scene.add(mesh)
  }
  return {
    rebuild,
    dispose() {
      mesh?.geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
