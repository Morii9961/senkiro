import type { VehicleAssignment, VehicleSeries } from '../../data/manual/vehicles.ts'
import type { Model } from '../domain/types.ts'

export const nominalCarLength = 3.4

// The rake is measured along the cab section. The corner value controls its shoulders.
export const cabProfiles = {
  'cab-flat': { rake: 0.04, corner: 0.12 },
  'cab-rounded': { rake: 0.21, corner: 0.64 },
  'cab-angled': { rake: 0.36, corner: 0.42 },
  'cab-raked': { rake: 0.58, corner: 0.24 },
  'cab-squared': { rake: 0.13, corner: 0.27 },
} as const
type CabShape = keyof typeof cabProfiles
export type VehicleShape = 'box' | 'coach' | 'roof' | 'front-panel' | 'wheel' | 'brace' | CabShape

export type VehiclePart = {
  kind: 'body' | 'roof' | 'glass' | 'door' | 'trim' | 'bogie' | 'headlight' | 'coupler' | 'pantograph'
  shape: VehicleShape
  center: [number, number, number]
  size: [number, number, number]
  color: string
  facing: -1 | 1
  slide?: number
}

interface Exterior {
  cab: CabShape
  cabDepth: number
  height: number
  doors: number[]
  panes: number[]
  glassHeight: number
  gangway: 'central' | 'offset' | null
  headlights: [height: number, spacing: number, width: number]
  waist: 'orange-panels' | 'triple' | 'cream' | 'metro' | 'brow' | 'blue-apron' | 'plain'
  overhead: boolean
}

const metroModern: Exterior = {
  cab: 'cab-rounded', cabDepth: 0.26, height: 0.58, doors: [-0.34, -0.12, 0.12, 0.34],
  panes: [1, 1, 1, 1, 1], glassHeight: 0.30, gangway: 'offset', headlights: [0.32, 0.32, 0.16],
  waist: 'metro', overhead: false,
}
const exteriors: Record<string, Exterior> = {
  'sk:vehicle:jr-323': {
    cab: 'cab-angled', cabDepth: 0.28, height: 0.60, doors: [-0.29, 0, 0.29],
    panes: [1, 2, 2, 1], glassHeight: 0.30, gangway: 'central', headlights: [0.35, 0.31, 0.16],
    waist: 'orange-panels', overhead: true,
  },
  'sk:vehicle:jr-225': {
    cab: 'cab-angled', cabDepth: 0.36, height: 0.57, doors: [-0.30, 0, 0.30],
    panes: [1, 3, 3, 1], glassHeight: 0.34, gangway: 'central', headlights: [0.42, 0.31, 0.15],
    waist: 'triple', overhead: true,
  },
  'sk:vehicle:jr-221': {
    cab: 'cab-rounded', cabDepth: 0.35, height: 0.59, doors: [-0.30, 0, 0.30],
    panes: [1, 3, 3, 1], glassHeight: 0.32, gangway: 'central', headlights: [0.23, 0.29, 0.13],
    waist: 'cream', overhead: true,
  },
  'sk:vehicle:metro-30000': metroModern,
  'sk:vehicle:metro-32': metroModern,
  'sk:vehicle:metro-23': {
    cab: 'cab-flat', cabDepth: 0.22, height: 0.58, doors: [-0.34, -0.11, 0.12, 0.35],
    panes: [1, 1, 1, 1, 1], glassHeight: 0.29, gangway: 'offset', headlights: [0.25, 0.10, 0.12],
    waist: 'metro', overhead: false,
  },
  'sk:vehicle:hankyu-9300': {
    cab: 'cab-raked', cabDepth: 0.34, height: 0.57, doors: [-0.31, 0, 0.31],
    panes: [1, 1, 1, 1], glassHeight: 0.38, gangway: 'central', headlights: [0.74, 0.30, 0.11],
    waist: 'brow', overhead: true,
  },
  'sk:vehicle:hankyu-1000': {
    cab: 'cab-squared', cabDepth: 0.23, height: 0.60, doors: [-0.29, 0, 0.29],
    panes: [1, 2, 3, 1], glassHeight: 0.31, gangway: 'central', headlights: [0.75, 0.32, 0.11],
    waist: 'brow', overhead: true,
  },
  'sk:vehicle:hanshin-5700': {
    cab: 'cab-squared', cabDepth: 0.25, height: 0.59, doors: [-0.29, 0, 0.29],
    panes: [1, 2, 2, 1], glassHeight: 0.33, gangway: 'central', headlights: [0.80, 0.31, 0.13],
    waist: 'blue-apron', overhead: true,
  },
}
const unverified: Exterior = {
  cab: 'cab-flat', cabDepth: 0.19, height: 0.56, doors: [-0.26, 0.26],
  panes: [1, 2, 1], glassHeight: 0.29, gangway: null, headlights: [0.35, 0.30, 0.14],
  waist: 'plain', overhead: false,
}

export function buildVehicleBody(series: VehicleSeries | null, platformLength: number, cars: number | null) {
  const margin = Math.min(1, platformLength / 4)
  const length = Math.min(cars === null ? platformLength * 0.72 : cars * nominalCarLength, platformLength - margin)
  const width = Math.min(0.9, nominalCarLength / (series?.proportions.carLengthToWidth ?? 6.0))
  const parts: VehiclePart[] = []
  const { body, accent, stripe } = series?.livery ?? { body: '#a0a0a0', accent: '#626262', stripe: null }
  const profile = exteriors[series?.id ?? ''] ?? unverified
  const drawnCars = cars ?? Math.max(1, Math.round(length / nominalCarLength))
  const carPitch = length / drawnCars
  const gap = Math.min(0.12, carPitch * 0.05)
  const carLength = carPitch - gap
  const bodyWidth = width * 0.95
  const base = 0.13
  const top = base + profile.height
  const glass = series ? '#222d35' : '#343434'
  const reflection = series ? '#5e717d' : '#636363'
  const underframe = '#414141'
  const faceInset = Math.min(0.014, gap * 0.25)

  for (let i = 0; i < drawnCars; i++) {
    const center = -length / 2 + (i + 0.5) * carPitch
    const add = (kind: VehiclePart['kind'], at: VehiclePart['center'], size: VehiclePart['size'],
      color: string, shape: VehicleShape = 'box', facing: -1 | 1 = 1, slide?: number) => {
      parts.push({ kind, shape, center: [center + at[0], at[1], at[2]], size, color, facing, slide })
    }
    const y = (fraction: number) => base + profile.height * fraction
    const first = i === 0
    const last = i === drawnCars - 1
    const cabLength = carLength * profile.cabDepth * 0.33
    const shellLength = carLength - (Number(first) + Number(last)) * cabLength
    const shellCenter = (Number(first) - Number(last)) * cabLength / 2
    add('body', [shellCenter, y(0.5), 0], [shellLength, profile.height, bodyWidth], body, 'coach')
    add('roof', [shellCenter, top + 0.014, 0], [shellLength, 0.106, bodyWidth * 0.90], accent, 'roof')
    add('bogie', [0, 0.121, 0], [shellLength * 0.43, 0.088, width * 0.56], underframe)

    const unitLength = shellLength * (profile.waist === 'metro' ? 0.235 : 0.17)
    for (const end of [-1, 1] as const) {
      const roofUnit = shellCenter + end * shellLength * 0.245
      add('roof', [roofUnit, top + 0.081, 0], [unitLength, 0.056, width * 0.64], '#777777', 'roof')
      for (const slat of [-1, 0, 1]) {
        add('roof', [roofUnit + slat * unitLength * 0.21, top + 0.108, 0], [unitLength * 0.11, 0.006, width * 0.45], '#505050')
      }

      const bogie = end * carLength * 0.324
      add('bogie', [bogie, 0.103, 0], [carLength * 0.145, 0.105, width * 0.73], underframe)
      for (const axle of [-1, 1]) {
        for (const side of [-1, 1]) {
          add('bogie', [bogie + axle * carLength * 0.037, 0.071, side * width * 0.32],
            [0.142, 0.142, width * 0.101], '#494949', 'wheel')
        }
      }

      const isCab = end === -1 ? first : last
      if (!isCab) {
        // One bellows per gap, with a narrower coupling beneath it.
        if (end === 1) {
          add('coupler', [carPitch / 2, y(0.47), 0], [gap * 1.55, profile.height * 0.76, width * 0.55], '#303030', 'coach')
          add('coupler', [carPitch / 2, 0.14, 0], [gap * 1.68, 0.072, width * 0.30], underframe)
        }
        continue
      }

      const edge = end * carLength / 2
      const cabCenter = edge - end * cabLength / 2
      add('body', [cabCenter, y(0.5), 0], [cabLength, profile.height, bodyWidth], body, profile.cab, end)
      const rake = cabProfiles[profile.cab].rake * cabLength
      const face = (kind: VehiclePart['kind'], height: number, cross: number, span: number, tall: number,
        color: string, lift = 0) => {
        const x = edge - end * (rake * height - faceInset * (0.55 + lift))
        add(kind, [x, y(height), end * cross * bodyWidth], [rake * tall, profile.height * tall, span * bodyWidth],
          color, 'front-panel', end)
      }
      face('glass', 0.685, 0, 0.80, 0.34, glass)
      face('trim', 0.827, 0, 0.74, 0.018, reflection, 0.12)
      if (profile.gangway) {
        const offset = profile.gangway === 'offset' ? 0.259 : 0
        const frame = profile.waist === 'brow' ? body : '#4e5357'
        face('trim', 0.561, offset, 0.207, 0.59, frame, 0.18)
        face('glass', 0.674, offset, 0.141, 0.302, glass, 0.32)
      }
      if (profile.waist === 'brow') face('trim', 0.884, 0, 0.77, 0.059, stripe!, 0.18)
      if (stripe && profile.waist !== 'brow') {
        const tall = profile.waist === 'blue-apron' ? 0.24 : 0.105
        face('trim', 0.365, 0, 0.796, tall, stripe, 0.16)
      }
      const [lampY, lampCross, lampWidth] = profile.headlights
      for (const housing of [-1, 1]) {
        face('trim', lampY, housing * lampCross, lampWidth + 0.035, 0.108, glass, 0.40)
        face('headlight', lampY, housing * lampCross, lampWidth, 0.051, series ? '#fff3d7' : '#e8e8e8', 0.58)
      }
      add('trim', [edge - end * cabLength * 0.30, 0.141, 0], [cabLength * 0.56, 0.14, bodyWidth * 0.84], accent, 'coach')
      add('coupler', [edge - end * 0.025, 0.127, 0], [Math.min(0.052, gap * 0.74), 0.06, bodyWidth * 0.23], underframe)
    }

    const doorWidth = carLength * (profile.waist === 'brow' ? 0.064 : 0.072)
    const doorPositions = profile.doors.map((position) => position * carLength)
    // Body paint and window openings follow the same door intervals on either side.
    const cabinStart = first ? -carLength / 2 + cabLength * 0.75 : -carLength / 2
    const cabinEnd = last ? carLength / 2 - cabLength * 0.75 : carLength / 2
    for (const side of [-1, 1]) {
      const wall = side * bodyWidth / 2
      const band = (at: number, h: number, paint: string) => add('trim',
        [(cabinStart + cabinEnd) / 2, y(at), wall], [cabinEnd - cabinStart, h, width * 0.012], paint)
      if (stripe && profile.waist === 'brow') {
        add('trim', [shellCenter, y(0.923), side * bodyWidth * 0.406],
          [shellLength, 0.037, width * 0.06], stripe, 'roof')
      } else if (stripe) {
        band(0.404, profile.waist === 'blue-apron' ? 0.086 : 0.051, stripe)
        if (profile.waist === 'triple' || profile.waist === 'cream') {
          band(0.322, 0.035, '#aa9f8b')
          band(0.270, 0.011, '#6d6257')
        }
      }
      for (const [index, panes] of profile.panes.entries()) {
        const start = index === 0 ? cabinStart + 0.024 : doorPositions[index - 1] + doorWidth * 0.66
        const stop = index === doorPositions.length ? cabinEnd - 0.024 : doorPositions[index] - doorWidth * 0.66
        const panePitch = (stop - start) / panes
        if (panePitch <= 0) continue
        for (let p = 0; p < panes; p++) {
          const x = start + (p + 0.5) * panePitch
          const h = profile.glassHeight * profile.height
          const span = panePitch * 0.89
          add('glass', [x, y(0.672), wall], [span, h, width * 0.020], glass)
          add('glass', [x, y(0.672) + h * 0.37, wall], [span * 0.92, h * 0.065, width * 0.025], reflection)
        }
      }
      for (const [index, door] of doorPositions.entries()) {
        const height = profile.height * 0.792
        if (stripe && profile.waist === 'orange-panels') {
          const x = door - doorWidth * 0.71
          if (x > cabinStart) add('trim', [x, y(0.449), wall], [doorWidth * 0.31, height * 0.84, width * 0.022], stripe)
        }
        add('trim', [door, y(0.435), wall], [doorWidth * 1.04, height * 1.025, width * 0.027], glass)
        for (const leaf of [-1, 1]) {
          const move = leaf * doorWidth * 0.38
          const x = door + leaf * doorWidth * 0.25
          add('door', [x, y(0.435), wall], [doorWidth * 0.472, height, width * 0.044], body, 'box', 1, move)
          add('glass', [x, y(0.655), wall], [doorWidth * 0.335, height * 0.32, width * 0.048], glass, 'box', 1, move)
          if (stripe && profile.waist !== 'brow') add('trim', [x, y(0.404), wall],
            [doorWidth * 0.472, profile.waist === 'blue-apron' ? 0.086 : 0.051, width * 0.048], stripe, 'box', 1, move)
        }
        if (index < doorPositions.length - 1 && profile.waist === 'metro') {
          add('trim', [door + doorWidth * 0.59, y(0.825), wall], [doorWidth * 0.18, 0.035, width * 0.030], stripe!)
        }
      }
    }

    // Only depict overhead collection for the known overhead-powered families.
    if (profile.overhead && (drawnCars === 1 || i % 3 === 1)) {
      const p = shellCenter - shellLength * 0.09
      add('pantograph', [p, top + 0.070, 0], [shellLength * 0.17, 0.033, width * 0.49], '#646464')
      add('pantograph', [p, top + 0.114, 0], [shellLength * 0.12, 0.063, width * 0.10], '#555555', 'brace')
      add('pantograph', [p, top + 0.166, 0], [shellLength * 0.12, 0.056, width * 0.086], '#555555', 'brace', -1)
      add('pantograph', [p - shellLength * 0.044, top + 0.195, 0], [shellLength * 0.040, 0.017, width * 0.62], '#444444')
    }
  }
  return { length, width, cars, parts }
}

export function validateVehicles(
  model: Model, series: VehicleSeries[], assignments: VehicleAssignment[], sourceIds: Set<string>,
) {
  const lineById = new Map(model.lines.map((line) => [line.id, line]))
  const operatorIds = new Set(model.operators.map(({ id }) => id))
  const entries = new Map<string, VehicleSeries>()
  const color = /^#[0-9a-f]{6}$/i
  function checkSources(ids: string[], entry: string) {
    if (!ids.length || ids.some((id) => !sourceIds.has(id))) throw new Error('Missing vehicle source: ' + entry)
  }
  for (const item of series) {
    if (entries.has(item.id) || !/^sk:vehicle:[a-z0-9-]+$/.test(item.id)) {
      throw new Error('Invalid or duplicate vehicle series: ' + item.id)
    }
    entries.set(item.id, item)
    if (!operatorIds.has(item.operatorId)) throw new Error('Unknown vehicle operator: ' + item.id)
    checkSources(item.provenance.sourceIds, item.id)
    if (item.provenance.dataNature !== 'manual-verified' && item.provenance.dataNature !== 'official') {
      throw new Error('Invalid vehicle data nature: ' + item.id)
    }
    if (item.livery.nature !== 'schematic' ||
      ![item.livery.body, item.livery.accent, item.livery.stripe ?? '#000000'].every((hex) => color.test(hex)) ||
      !Number.isFinite(item.proportions.carLengthToWidth) || item.proportions.carLengthToWidth <= 0) {
      throw new Error('Invalid schematic livery or proportions: ' + item.id)
    }
    for (const formation of item.formations) {
      checkSources(formation.sourceIds, item.id)
      if (!Number.isSafeInteger(formation.cars) || formation.cars <= 0) {
        throw new Error('Invalid vehicle formation: ' + item.id)
      }
    }
    const declared = item.proportions.carCountDefault
    if (declared !== null && !item.formations.some((formation) => formation.cars === declared)) {
      throw new Error('Unsupported default formation: ' + item.id)
    }
  }
  const assigned = new Set<string>()
  for (const assignment of assignments) {
    const line = lineById.get(assignment.lineId)
    if (!line || assigned.has(line.id)) throw new Error('Unknown or duplicate vehicle line: ' + assignment.lineId)
    assigned.add(line.id)
    if (assignment.status === 'unknown' && assignment.seriesId === null) continue
    const item = assignment.seriesId && entries.get(assignment.seriesId)
    if ((assignment.status !== 'representative' && assignment.status !== 'verified') ||
        !item || item.operatorId !== line.operatorId) {
      throw new Error('Vehicle operator or series does not match line: ' + line.id)
    }
    checkSources(assignment.sourceIds, line.id)
  }
  if (assigned.size !== lineById.size) throw new Error('Missing vehicle assignment for a modeled line')
}
