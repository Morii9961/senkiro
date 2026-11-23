import { expect, it } from 'vitest'
import { vehicleAssignments, vehicleSeries } from '../data/manual/vehicles'
import { sources } from '../data/manual/sources'
import { station } from '../src/model'
import { buildVehicleBody, validateVehicles } from '../src/trains/vehicles'

const sourceIds = new Set(sources.map(({ id }) => id))

it('AT-TRN-03 and AT-HON-02: every modeled line lists sourced representative or unknown vehicle data', () => {
  expect(() => validateVehicles(station, vehicleSeries, vehicleAssignments, sourceIds)).not.toThrow()
  expect(vehicleAssignments.map(({ lineId }) => lineId).sort()).toEqual(station.lines.map(({ id }) => id).sort())
  expect(new Set(vehicleSeries.map(({ operatorId }) => operatorId)).size).toBe(4)
  expect(new Set(vehicleSeries.map(({ category }) => category))).toEqual(
    new Set(['commuter', 'rapid', 'limited-express', 'subway']),
  )
  expect(vehicleAssignments.every(({ status }) => status !== 'verified')).toBe(true)
})

it('AT-TRN-03: original body geometry, proportions and sourced formations differ', () => {
  const bodies = vehicleSeries.map((series) => buildVehicleBody(series, 35, series.formations[0]?.cars ?? null))
  expect(new Set(bodies.map(({ width }) => width)).size).toBeGreaterThanOrEqual(4)
  expect(new Set(bodies.map(({ cars }) => cars)).size).toBeGreaterThanOrEqual(3)
  for (const [index, body] of bodies.entries()) {
    const series = vehicleSeries[index]
    expect(body.parts.some(({ color }) => color === series.livery.body)).toBe(true)
    for (const { center, size } of body.parts) {
      expect(Math.abs(center[0]) + size[0] / 2).toBeLessThanOrEqual(body.length / 2 + 1e-6)
      expect(Math.abs(center[2]) + size[2] / 2).toBeLessThanOrEqual(body.width / 2 + 1e-6)
    }
  }
  const generic = buildVehicleBody(null, 30, null)
  expect(generic.cars).toBeNull()
  expect(generic.length).toBeCloseTo(21.6, 8)
  expect(generic.parts.every(({ color }) => /^#([0-9a-f]{2})\1\1$/i.test(color))).toBe(true)
  expect(buildVehicleBody(vehicleSeries[0], 16, 12).length).toBeLessThanOrEqual(15)
})

it('AT-HON-01: a vehicle assignment without a registered source or supported operator is rejected', () => {
  const assignment = vehicleAssignments.find(({ seriesId }) => seriesId !== null)!
  const invalid = vehicleAssignments.map((entry) => entry === assignment ? { ...entry, sourceIds: [] } : entry)
  expect(() => validateVehicles(station, vehicleSeries, invalid, sourceIds)).toThrow(/source/i)
  const conflicting = vehicleAssignments.map((entry) => entry === assignment
    ? { ...entry, seriesId: vehicleSeries.find(({ operatorId }) =>
        operatorId !== station.lines.find(({ id }) => id === assignment.lineId)!.operatorId,
      )!.id }
    : entry)
  expect(() => validateVehicles(station, vehicleSeries, conflicting, sourceIds)).toThrow(/operator/i)
})

it('AT-TRN-03: representative cars differ in construction and carry series-specific details', () => {
  const models = Object.fromEntries(vehicleSeries.map((series) => [
    series.id,
    buildVehicleBody(series, 4.5, 1),
  ]))
  const vehicle = (id: string) => models['sk:vehicle:' + id]
  const geometry = (id: string) => vehicle(id).parts.map(({ color, ...part }) => part)
  expect(geometry('hankyu-9300')).not.toEqual(geometry('hankyu-1000'))
  const nose = (id: string) => vehicle(id).parts.find((part) => part.kind === 'body' && part.shape.startsWith('cab-'))?.shape
  expect(new Set(['jr-225', 'jr-221', 'metro-23', 'hankyu-9300'].map(nose)).size).toBe(4)
  expect(nose('metro-30000')).toBe(nose('metro-32'))
  for (const [id, doors] of [
    ['jr-323', 3], ['jr-225', 3], ['jr-221', 3], ['metro-30000', 4], ['metro-32', 4],
    ['metro-23', 4], ['hankyu-9300', 3], ['hankyu-1000', 3], ['hanshin-5700', 3],
  ] as const) {
    const { parts } = vehicle(id)
    expect(parts.filter((part) => part.kind === 'door' && part.center[2] > 0)).toHaveLength(doors * 2)
    expect(parts.filter((part) => part.kind === 'headlight')).toHaveLength(4)
    expect(parts.filter((part) => part.shape === 'wheel')).toHaveLength(8)
    expect(parts.some((part) => part.kind === 'pantograph')).toBe(!id.startsWith('metro-'))
  }
  expect(vehicle('jr-323').parts.filter((part) => part.kind === 'trim' && part.size[1] > 0.25)).not.toHaveLength(0)
})
