import * as T from 'three'
import { cabProfiles, type VehicleShape } from './vehicles'

type Section = readonly (readonly [y: number, z: number])[]
const bodySection: Section = [
  [-0.50, -0.39], [-0.36, -0.50], [0.28, -0.50], [0.41, -0.46], [0.50, -0.36],
  [0.50, 0.36], [0.41, 0.46], [0.28, 0.50], [-0.36, 0.50], [-0.50, 0.39],
]
const roofSection: Section = [
  [-0.50, -0.50], [0.03, -0.50], [0.30, -0.39], [0.49, -0.25],
  [0.49, 0.25], [0.30, 0.39], [0.03, 0.50], [-0.50, 0.50],
]

// All primitives use the same unit bounds for instancing, clipping and picks.
function shell(section: Section, rake = 0, corner = 0) {
  const points: number[] = []
  const back = (i: number): number[] => [-0.5, ...section[i]]
  const front = (i: number): number[] => {
    const [y, z] = section[i]
    const shoulder = Math.max(0, (Math.abs(z) - 0.4) / 0.1)
    return [0.5 - (y + 0.5) * rake - (1 - rake) * corner * shoulder, y, z]
  }
  for (let i = 0; i < section.length; i++) {
    const next = (i + 1) % section.length
    const a = back(i), b = back(next), c = front(next), d = front(i)
    points.push(...a, ...b, ...c, ...a, ...c, ...d)
    points.push(-0.5, 0, 0, ...b, ...a)
    points.push(0.5 - rake * 0.5, 0, 0, ...d, ...c)
  }
  return triangles(points)
}

function triangles(points: number[]) {
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function createVehicleGeometries() {
  const wheel = new T.CylinderGeometry(0.5, 0.5, 1, 10)
  wheel.rotateX(Math.PI / 2)
  const bottomLeft = [0.5, -0.5, -0.5]
  const topLeft = [-0.5, 0.5, -0.5]
  const topRight = [-0.5, 0.5, 0.5]
  const bottomRight = [0.5, -0.5, 0.5]
  const frontPanel = triangles([
    ...bottomLeft, ...topLeft, ...topRight, ...bottomLeft, ...topRight, ...bottomRight,
  ])
  const brace = new T.BoxGeometry(0.2, 1, 1)
  brace.applyMatrix4(new T.Matrix4().set(
    1, 0.8, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ))
  const geometries = new Map<VehicleShape, T.BufferGeometry>([
    ['box', new T.BoxGeometry()], ['coach', shell(bodySection)], ['roof', shell(roofSection)],
    ['front-panel', frontPanel], ['wheel', wheel], ['brace', brace],
  ])
  for (const [shape, { rake, corner }] of Object.entries(cabProfiles)) {
    geometries.set(shape as VehicleShape, shell(bodySection, rake, corner))
  }
  return geometries
}
