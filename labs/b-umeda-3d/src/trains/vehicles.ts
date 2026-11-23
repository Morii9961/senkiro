import type { VehicleAssignment, VehicleSeries } from '../../data/manual/vehicles.ts'
import type { Model } from '../domain/types.ts'

export const nominalCarLength = 3.4

export type VehiclePart = {
  kind: 'body' | 'roof' | 'glass' | 'door' | 'trim' | 'bogie'
  center: [number, number, number]
  size: [number, number, number]
  color: string
}

export function buildVehicleBody(series: VehicleSeries | null, platformLength: number, cars: number | null) {
  const margin = Math.min(1, platformLength / 4)
  const length = Math.min(cars === null ? platformLength * 0.72 : cars * nominalCarLength, platformLength - margin)
  const width = Math.min(0.9, nominalCarLength / (series?.proportions.carLengthToWidth ?? 6.0))
  const parts: VehiclePart[] = []
  const { body, accent, stripe } = series?.livery ?? { body: '#969696', accent: '#5a5a5a', stripe: null }
  const profile = {
    commuter: { height: 0.61, roof: 0.74, doors: [-0.30, 0, 0.30], glass: 0.19 },
    rapid: { height: 0.59, roof: 0.64, doors: [-0.26, 0.26], glass: 0.22 },
    'limited-express': { height: 0.55, roof: 0.62, doors: [-0.34, 0.34], glass: 0.25 },
    subway: { height: 0.56, roof: 0.84, doors: [-0.31, 0, 0.31], glass: 0.16 },
    other: { height: 0.57, roof: 0.76, doors: [-0.27, 0.27], glass: 0.18 },
  }[series?.category ?? 'other']
  const drawnCars = cars ?? 1
  const carPitch = length / drawnCars
  const carLength = carPitch - Math.min(0.12, carPitch * 0.05)
  const height = profile.height
  const glassColor = series ? '#304246' : '#474747'
  const bogieColor = series ? '#3e4542' : '#3d3d3d'

  for (let i = 0; i < drawnCars; i++) {
    const center = -length / 2 + (i + 0.5) * carPitch
    const add = (kind: VehiclePart['kind'], x: number, y: number, z: number,
      w: number, h: number, d: number, color: string) => {
      parts.push({ kind, center: [center + x, y, z], size: [w, h, d], color })
    }
    add('body', 0, height / 2 + 0.12, 0, carLength * 0.98, height, width * 0.95, body)
    add('roof', 0, height + 0.16, 0, carLength * 0.97, 0.10, width * profile.roof, accent)
    add('roof', 0, height + 0.22, 0, carLength * 0.77, 0.04, width * profile.roof * 0.68, accent)
    for (const sign of [-1, 1]) {
      add('bogie', sign * carLength * 0.3, 0.12, 0,
        carLength * 0.14, 0.19, width * 0.81, bogieColor)
      const side = sign * width * 0.473
      if (stripe) add('trim', 0, height * 0.39, side, carLength * 0.96, 0.045, width * 0.03, stripe)
      for (const cell of [-0.4, -0.18, 0.18, 0.4]) {
        add('glass', cell * carLength, height * 0.79, side,
          carLength * 0.10, profile.glass, width * 0.03, glassColor)
      }
      for (const door of profile.doors) {
        add('door', door * carLength, height * 0.66, side,
          carLength * 0.065, height * 0.73, width * 0.033, accent)
      }
      const cab = sign < 0 ? i === 0 : i === drawnCars - 1
      if (cab) {
        const nose = sign * carLength * 0.474
        add('glass', nose, height * 0.80, 0, carLength * 0.05, profile.glass, width * 0.70, glassColor)
        for (const side of [-1, 1]) {
          add('trim', nose, height * 0.33, side * width * 0.28,
            carLength * 0.047, 0.056, width * 0.17, series ? '#fff1c7' : '#dedede')
        }
      }
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
