import { Box3, Matrix4, Ray, Vector3 } from 'three'

export interface OcclusionProxy {
  owner: string
  floorOrdinal: number | null
  bounds: Box3
  worldToLocal?: Matrix4
}

const ANCHOR_MARGIN = 0.15

export function isLabelOccluded(
  anchor: Vector3,
  towardCamera: Vector3,
  distance: number,
  proxies: OcclusionProxy[],
  owner: string | null,
  floorOrdinal: number | null,
): boolean {
  if (distance <= ANCHOR_MARGIN) return false
  const start = anchor.clone().addScaledVector(towardCamera, ANCHOR_MARGIN)
  const end = anchor.clone().addScaledVector(towardCamera, distance)
  const localStart = new Vector3()
  const localEnd = new Vector3()
  const ray = new Ray()
  const delta = new Vector3()
  const hit = new Vector3()
  for (const proxy of proxies) {
    if (proxy.owner === owner) continue
    if (proxy.floorOrdinal !== null &&
      ((floorOrdinal !== null && proxy.floorOrdinal <= floorOrdinal) ||
        proxy.bounds.min.y <= anchor.y + ANCHOR_MARGIN)) continue
    localStart.copy(start)
    localEnd.copy(end)
    if (proxy.worldToLocal) {
      localStart.applyMatrix4(proxy.worldToLocal)
      localEnd.applyMatrix4(proxy.worldToLocal)
    }
    delta.subVectors(localEnd, localStart)
    const length = delta.length()
    ray.set(localStart, delta.multiplyScalar(1 / length))
    if (ray.intersectBox(proxy.bounds, hit) && hit.distanceToSquared(localStart) < length ** 2) {
      return true
    }
  }
  return false
}

export function proxyBounds(proxy: OcclusionProxy): Box3 {
  const box = proxy.bounds.clone()
  return proxy.worldToLocal ? box.applyMatrix4(proxy.worldToLocal.clone().invert()) : box
}
