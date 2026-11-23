import { expect, test } from 'vitest'
import { demoTimetable } from '../data/manual/demoTimetable'
import { model } from '../data/manual/model'
import { vehicleSeries } from '../data/manual/vehicles'
import { buildTrainPlans, positionAt, trainInstanceAt } from '../src/trains/simulate'
import { deriveTrackPaths } from '../src/trains/trackPaths'

const records = demoTimetable.records
const tracks = deriveTrackPaths(model)
const options = { day: 'weekday', serviceDate: null, feedKind: 'demo' } as const
const plans = () => buildTrainPlans(records, tracks, vehicleSeries, options)

test('AT-TRN-04: the terminal arrival brakes to rest and the departure accelerates back out', () => {
  const plan = plans().find((entry) => entry.record === records[0])!
  const now = (seconds: number) => positionAt(plan, seconds)!
  const samples = [
    plan.enter + 1, plan.arrive - 2, plan.arrive, plan.arrive + 2, plan.arrive + 8,
    plan.depart! - 5, plan.depart! - 1, plan.depart! + 1, plan.leave - 1,
  ]
  expect(samples.map((seconds) => now(seconds).phase)).toEqual([
    'approaching', 'braking', 'stopped', 'doors-opening', 'doors-open',
    'doors-closing', 'stopped', 'departing', 'departing',
  ])
  expect(now(plan.arrive - 2).speedFactor).toBeLessThan(now(plan.enter + 1).speedFactor)
  expect(now(plan.arrive).speedFactor).toBe(0)
  expect(now(plan.arrive).s).toBe(now(plan.depart! - 1).s)
  expect(now(plan.depart!).speedFactor).toBe(0)
  expect(now(plan.depart! + 1).speedFactor).toBeLessThan(now(plan.leave - 1).speedFactor)
  expect(now(plan.depart! + 1).s).toBeGreaterThan(now(plan.leave - 1).s)
  expect(now(plan.arrive - 2)).toEqual(now(plan.arrive - 2))
  expect(positionAt(plan, plan.enter - 1)).toBeNull()
  expect(positionAt(plan, plan.leave)).toBeNull()
  const instance = trainInstanceAt(plan, plan.arrive + 8)!
  expect(instance).toMatchObject({ doorsOpen: true, liveState: 'scheduled', feedKind: 'demo' })
  expect(instance.position[0]).toBe(plan.track.polyline[0][0])
  expect(instance.heading[2]).toBe(1)
  expect(trainInstanceAt(plan, plan.depart! + 1)?.heading[2]).toBe(-1)
})

test('AT-TRN-01/04: a plan requires an unambiguous known approach and flags assumed times', () => {
  expect(plans().map(({ record }) => record.platform_id)).toEqual(['sk:platform:hk-3', 'sk:platform:hk-5'])
  expect(plans()[1]?.arrivalAssumed).toBe(true)
  const weekend = buildTrainPlans(records, tracks, vehicleSeries, { ...options, day: 'weekend' })
  expect(weekend.map(({ record }) => record.platform_id)).toEqual(['sk:platform:hk-3', 'sk:platform:hk-8'])
  expect(weekend[1]?.vehicle.status).toBe('unknown')
  const row = { ...records[0]!, platform_id: 'sk:platform:metro-1' }
  expect(buildTrainPlans([row], tracks, vehicleSeries, options)).toEqual([])

  const minute = { ...records[0]!, arrival_time_local: '09:00', departure_time_local: '09:00' }
  const next = { ...minute, trip_id: 'demo:overlapping', departure_time_local: '09:01' }
  const [short] = buildTrainPlans([minute, next], tracks, vehicleSeries, options)
  expect(short?.shortStopAssumed).toBe(true)
  expect(short?.arrivalAssumed).toBe(false)
  expect(buildTrainPlans([minute, next], tracks, vehicleSeries, options)).toHaveLength(1)
})
