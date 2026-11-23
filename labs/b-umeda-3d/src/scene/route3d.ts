import * as T from 'three'
import type { Step } from '../domain/graph.ts'
import type { Place } from '../domain/types.ts'

type Point = [number, number, number]

type RouteBand = {
  linkId: string
  points: Point[]
  active: boolean
  dimmed: boolean
  width: number
}

export function routeBands(steps: readonly Step[], { ordinal, visible, gap, active }: {
  ordinal: (place: Place) => number
  visible: (place: Place) => boolean
  gap: number
  active: number
}): RouteBand[] {
  const current = steps[active]
  const activeFloors = current ? [ordinal(current.from), ordinal(current.to)] : null
  return steps.flatMap(({ link, from, to }, index) => {
    const showFrom = visible(from)
    const showTo = visible(to)
    const fromFloor = ordinal(from)
    const toFloor = ordinal(to)
    if ((!showFrom && !showTo) || (fromFloor === toFloor && (!showFrom || !showTo))) return []
    const a: Point = [from.point[0], fromFloor * gap + 0.56, from.point[1]]
    const b: Point = [to.point[0], toFloor * gap + 0.56, to.point[1]]
    const x = (a[0] + b[0]) / 2
    const z = (a[2] + b[2]) / 2
    const points: Point[] = fromFloor === toFloor ? [a, b]
      : showFrom && showTo ? [a, [x, a[1], z], [x, b[1], z], b]
        : showFrom ? [a, [x, a[1], z]] : [[x, b[1], z], b]
    return [{
      linkId: link.id, points, active: index === active, width: index === active ? 0.51 : 0.34,
      dimmed: !!activeFloors && (!activeFloors.includes(fromFloor) || !activeFloors.includes(toFloor)),
    }]
  })
}

export function createRouteOverlay(world: T.Scene) {
  const group = new T.Group()
  world.add(group)
  const bar = new T.BoxGeometry()
  const joint = new T.CylinderGeometry(0.5, 0.5, 1, 10)
  const regular = new T.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 })
  const quiet = new T.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true, opacity: 0.41 })
  const orange = new T.Color(0xff870c)
  const strong = new T.Color(0xc54316)
  const pale = new T.Color(0xffedd1)
  const up = new T.Vector3(0, 1, 0)
  const dummy = new T.Object3D()
  let ids: string[] = []

  function clear() {
    for (const mesh of [...group.children] as T.InstancedMesh[]) {
      group.remove(mesh)
      mesh.dispose()
    }
    ids = []
  }

  function rebuild(bands: RouteBand[]) {
    clear()
    const layers = [[false, false], [true, false], [false, true]] as const
    for (const [dimmed, active] of layers) {
      const bars: { matrix: T.Matrix4; color: T.Color }[] = []
      const joints: T.Matrix4[] = []
      const color = active ? strong : orange
      function paint(a: T.Vector3, b: T.Vector3, width: number, tint: T.Color) {
        const direction = b.clone().sub(a)
        const length = direction.length()
        if (length < 0.0001) return
        dummy.position.copy(a).lerp(b, 0.5)
        if (Math.abs(direction.y) < 0.0001) {
          dummy.rotation.set(0, -Math.atan2(direction.z, direction.x), 0)
          dummy.scale.set(length + 0.02, 0.08, width)
        } else {
          dummy.quaternion.setFromUnitVectors(up, direction.normalize())
          dummy.scale.set(width, length + 0.02, width)
        }
        dummy.updateMatrix()
        bars.push({ matrix: dummy.matrix.clone(), color: tint })
      }
      for (const band of bands) {
        if (band.dimmed !== dimmed || band.active !== active) continue
        const points = band.points.map((point) => new T.Vector3(...point))
        let arrow: [T.Vector3, T.Vector3] | null = null
        let arrowLength = 0
        for (const [i, point] of points.entries()) {
          const next = points[i + 1]
          if (next) {
            paint(point, next, band.width, color)
            const length = point.distanceTo(next)
            if (length > arrowLength) {
              arrow = [point, next]
              arrowLength = length
            }
          }
          dummy.position.copy(point)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(band.width * 1.32, 0.09, band.width * 1.32)
          dummy.updateMatrix()
          joints.push(dummy.matrix.clone())
        }
        if (arrow && arrowLength > 0.65) {
          const [from, to] = arrow
          const direction = to.clone().sub(from).normalize()
          const side = Math.abs(direction.y) > 0.99
            ? new T.Vector3(1, 0, 0) : new T.Vector3(direction.z, 0, -direction.x).normalize()
          const tip = from.clone().lerp(to, 0.68)
          for (const sign of [-1, 1]) {
            const tail = tip.clone().addScaledVector(direction, -0.27).addScaledVector(side, sign * 0.15)
            paint(tail, tip, 0.09, pale)
          }
        }
      }
      if (bars.length) {
        const mesh = new T.InstancedMesh(bar, dimmed ? quiet : regular, bars.length)
        for (const [i, piece] of bars.entries()) {
          mesh.setMatrixAt(i, piece.matrix)
          mesh.setColorAt(i, piece.color)
        }
        mesh.renderOrder = active ? 6 : 4
        group.add(mesh)
      }
      if (joints.length) {
        const mesh = new T.InstancedMesh(joint, dimmed ? quiet : regular, joints.length)
        for (const [i, matrix] of joints.entries()) {
          mesh.setMatrixAt(i, matrix)
          mesh.setColorAt(i, color)
        }
        mesh.renderOrder = active ? 5 : 3
        group.add(mesh)
      }
    }
    ids = bands.map(({ linkId }) => linkId)
  }

  return {
    rebuild,
    show(visible: boolean) {
      group.visible = visible && ids.length > 0
      return group.visible ? ids : []
    },
    dispose() {
      clear()
      world.remove(group)
      bar.dispose()
      joint.dispose()
      regular.dispose()
      quiet.dispose()
    },
  }
}
