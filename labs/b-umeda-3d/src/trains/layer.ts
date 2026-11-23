import * as T from 'three'
import { trainInstanceAt, type TrainPlan } from './simulate'
import { railCenterHeight, railHeight, trackFloorGap } from './trackPaths'
import { createVehicleGeometries } from './vehicleGeometry'
import type { VehicleShape } from './vehicles'

/** Vehicle primitives update separately from the station mesh and its static shadows. */
export function createTrainLayer(world: T.Scene, canvas: HTMLCanvasElement, trace: boolean) {
  const geometries = createVehicleGeometries()
  const material = new T.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 })
  const transform = new T.Object3D()
  const color = new T.Color()
  const accent = new T.Color('#e14815')
  const box = new T.Box3()
  const unit = new T.Box3(new T.Vector3(-0.5, -0.5, -0.5), new T.Vector3(0.5, 0.5, 0.5))
  const drawn = new Map<string, { bounds: T.Box3; instance: NonNullable<ReturnType<typeof trainInstanceAt>> }>()
  const batches = new Map<VehicleShape, { mesh: T.InstancedMesh; capacity: number; count: number }>()
  let previous: ReturnType<typeof framesAt> = []
  let previousGap = 0
  let previousSelection: string | null = null
  canvas.dataset.trains = '[]'
  if (trace) canvas.dataset.trainState = '[]'

  function framesAt(plans: readonly TrainPlan[], seconds: number) {
    return plans.flatMap((plan) => {
      const instance = trainInstanceAt(plan, seconds)
      return instance ? [{ plan, instance }] : []
    })
  }

  function update(plans: readonly TrainPlan[], seconds: number, spreadGap: number, selection: string | null) {
    const frames = framesAt(plans, seconds)
    if (previousSelection === selection && previousGap === spreadGap && frames.length === previous.length &&
      frames.every(({ plan, instance }, index) => {
        const old = previous[index]
        return old.plan === plan && old.instance.s === instance.s &&
          old.instance.doors === instance.doors && old.instance.phase === instance.phase
      })) return false
    previous = frames
    previousGap = spreadGap
    previousSelection = selection

    const needed = new Map<VehicleShape, number>()
    for (const { plan } of frames) {
      for (const { shape } of plan.body.parts) needed.set(shape, (needed.get(shape) ?? 0) + 1)
    }
    for (const batch of batches.values()) batch.count = 0
    for (const [shape, count] of needed) {
      const previous = batches.get(shape)
      if (previous && previous.capacity >= count) continue
      if (previous) {
        world.remove(previous.mesh)
        previous.mesh.dispose()
      }
      const capacity = Math.max(count, (previous?.capacity ?? 0) * 2)
      const mesh = new T.InstancedMesh(geometries.get(shape)!, material, capacity)
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
      mesh.frustumCulled = false
      world.add(mesh)
      batches.set(shape, { mesh, capacity, count: 0 })
    }
    drawn.clear()
    for (const { plan, instance } of frames) {
      const [dx, , dz] = plan.trackHeading
      const [x, y, z] = plan.track.polyline[0]
      const ordinal = (y - railCenterHeight - railHeight / 2) / trackFloorGap
      const baseY = y + ordinal * spreadGap
      const heading = -Math.atan2(dz, dx)
      const bounds = new T.Box3()
      for (const part of plan.body.parts) {
        const [offset, height, cross] = part.center
        const [width, h, d] = part.size
        const along = offset + (part.slide ?? 0) * instance.doors
        // Clip each physical part to the modeled rail ends as the train crosses the boundary.
        const near = Math.max(0, instance.s + along - width / 2)
        const far = Math.min(plan.trackLength, instance.s + along + width / 2)
        if (far <= near) continue
        const s = (near + far) / 2
        transform.rotation.y = heading + (part.facing < 0 ? Math.PI : 0)
        transform.position.set(x + s * dx - cross * dz, baseY + height, z + s * dz + cross * dx)
        transform.scale.set(far - near, h, d)
        transform.updateMatrix()
        const batch = batches.get(part.shape)!
        batch.mesh.setMatrixAt(batch.count, transform.matrix)
        color.set(part.color)
        if (selection === instance.id) color.lerp(accent, 0.18)
        batch.mesh.setColorAt(batch.count, color)
        batch.count++
        bounds.union(box.copy(unit).applyMatrix4(transform.matrix))
      }
      if (!bounds.isEmpty()) drawn.set(instance.id, { instance, bounds })
    }
    for (const { mesh, count } of batches.values()) {
      mesh.count = count
      mesh.visible = count > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    canvas.dataset.trains = JSON.stringify([...drawn.keys()])
    if (trace) canvas.dataset.trainState = JSON.stringify([...drawn.values()].map(({ instance, bounds }) =>
      ({ ...instance, bounds: [bounds.min.toArray(), bounds.max.toArray()] }),
    ))
    return true
  }

  return {
    update,
    drawn,
    hitTest(ray: T.Ray) {
      let closest: { id: string; distance: number } | null = null
      const point = new T.Vector3()
      for (const [id, { bounds }] of drawn) {
        if (!ray.intersectBox(bounds, point)) continue
        const distance = point.distanceTo(ray.origin)
        if (!closest || distance < closest.distance) closest = { id, distance }
      }
      return closest
    },
    dispose() {
      for (const { mesh } of batches.values()) {
        world.remove(mesh)
        mesh.dispose()
      }
      for (const geometry of geometries.values()) geometry.dispose()
      material.dispose()
    },
  }
}
