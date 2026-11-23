import * as T from 'three'
import { trainInstanceAt, type TrainPlan } from './simulate'
import { railCenterHeight, railHeight, trackFloorGap } from './trackPaths'

/** The train layer owns only its box instances. The station mesh and shadows stay static. */
export function createTrainLayer(world: T.Scene, canvas: HTMLCanvasElement, trace: boolean) {
  const geometry = new T.BoxGeometry()
  const material = new T.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 })
  const transform = new T.Object3D()
  const color = new T.Color()
  const box = new T.Box3()
  const unit = new T.Box3(new T.Vector3(-0.5, -0.5, -0.5), new T.Vector3(0.5, 0.5, 0.5))
  let mesh: T.InstancedMesh | null = null
  let capacity = 0
  let previous: ReturnType<typeof framesAt> = []
  let previousGap = 0
  canvas.dataset.trains = '[]'
  if (trace) canvas.dataset.trainState = '[]'

  function framesAt(plans: readonly TrainPlan[], seconds: number) {
    return plans.flatMap((plan) => {
      const instance = trainInstanceAt(plan, seconds)
      return instance ? [{ plan, instance }] : []
    })
  }

  function update(plans: readonly TrainPlan[], seconds: number, spreadGap: number) {
    const frames = framesAt(plans, seconds)
    if (previousGap === spreadGap && frames.length === previous.length &&
      frames.every(({ plan, instance }, index) => {
        const old = previous[index]
        return old.plan === plan && old.instance.s === instance.s &&
          old.instance.doors === instance.doors && old.instance.phase === instance.phase
      })) return false
    previous = frames
    previousGap = spreadGap

    const needed = frames.reduce((count, { plan }) => count + plan.body.parts.reduce(
      (parts, part) => parts + (part.kind === 'door' ? 3 : 1), 0,
    ), 0)
    if (needed > capacity) {
      if (mesh) {
        world.remove(mesh)
        mesh.dispose()
      }
      capacity = Math.max(needed, capacity * 2)
      mesh = new T.InstancedMesh(geometry, material, capacity)
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
      mesh.frustumCulled = false
      world.add(mesh)
    }
    let count = 0
    const visible: string[] = []
    const traced: object[] = []
    for (const { plan, instance } of frames) {
      const [dx, , dz] = plan.trackHeading
      const [x, y, z] = plan.track.polyline[0]
      const ordinal = (y - railCenterHeight - railHeight / 2) / trackFloorGap
      const baseY = y + ordinal * spreadGap
      transform.rotation.y = -Math.atan2(dz, dx)
      const start = count
      const bounds = trace ? new T.Box3() : null
      const add = (along: number, height: number, cross: number, width: number, h: number, d: number, paint: string) => {
        // Clip each physical part to the modeled rail ends as the train crosses the boundary.
        const near = Math.max(0, instance.s + along - width / 2)
        const far = Math.min(plan.trackLength, instance.s + along + width / 2)
        if (far <= near) return
        const s = (near + far) / 2
        transform.position.set(x + s * dx - cross * dz, baseY + height, z + s * dz + cross * dx)
        transform.scale.set(far - near, h, d)
        transform.updateMatrix()
        mesh!.setMatrixAt(count, transform.matrix)
        mesh!.setColorAt(count, color.set(paint))
        count++
        bounds?.union(box.copy(unit).applyMatrix4(transform.matrix))
      }
      for (const { kind, center: [along, height, cross], size: [width, h, d], color: paint } of plan.body.parts) {
        if (kind !== 'door' || instance.doors === 0) {
          add(along, height, cross, width, h, d, paint)
        } else {
          add(along, height, cross, width, h, d, '#263438')
          for (const side of [-1, 1]) {
            const shifted = along + side * width * (0.25 + 0.4 * instance.doors)
            add(shifted, height, cross + Math.sign(cross) * 0.003, width / 2, h, d, paint)
          }
        }
      }
      if (count === start) continue
      visible.push(instance.id)
      if (bounds) traced.push({ ...instance, bounds: [bounds.min.toArray(), bounds.max.toArray()] })
    }
    if (mesh) {
      mesh.count = count
      mesh.visible = count > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    canvas.dataset.trains = JSON.stringify(visible)
    if (trace) canvas.dataset.trainState = JSON.stringify(traced)
    return true
  }

  return {
    update,
    dispose() {
      if (mesh) {
        world.remove(mesh)
        mesh.dispose()
      }
      geometry.dispose()
      material.dispose()
    },
  }
}
