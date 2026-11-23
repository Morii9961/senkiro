import type { VehicleSeries } from '../../data/manual/vehicles'
import { parseServiceTime, serviceDateTypeApplies, type DayType } from '../timetable/time'
import type { TimetableRecord, VehicleAssignmentStatus } from '../timetable/types'
import {
  APPROACH_SECONDS, ASSUMED_DWELL_SECONDS, DEPART_SECONDS, DOOR_CLOSED_BEFORE, DOOR_MOVE_SECONDS,
  DOOR_OPEN_AFTER, FOLLOW_GAP_SECONDS, MIN_APPROACH_SECONDS, SHORT_STOP_SECONDS, TERMINATING_HOLD_SECONDS,
} from './constants'
import type { TrackPath } from './trackPaths'
import { buildVehicleBody } from './vehicles'

type Point3 = [number, number, number]
type FeedKind = 'demo' | 'timetable-sim'
export type TrainPhase = 'approaching' | 'braking' | 'doors-opening' | 'doors-open' | 'doors-closing' | 'stopped' | 'departing'

export interface TrainInstance {
  id: string
  planId: string
  platformId: string
  trackPathId: string
  lineId: string | null
  serviceClass: string | null
  destinationText: string | null
  phase: TrainPhase
  position: Point3
  heading: Point3
  doorsOpen: boolean
  scheduledArrival: string | null
  scheduledDeparture: string | null
  arrivalAssumed: boolean
  shortStopAssumed: boolean
  vehicle: {
    seriesId: string | null
    status: VehicleAssignmentStatus
    cars: number | null
    livery: VehicleSeries['livery'] | null
  }
  liveState: 'scheduled'
  feedKind: FeedKind
}

interface PlanOptions {
  day: DayType
  serviceDate: string | null
  feedKind: FeedKind
}

export interface TrainPlan {
  id: string
  record: TimetableRecord
  track: TrackPath
  trackLength: number
  trackHeading: Point3
  enter: number
  arrive: number
  depart: number | null
  leave: number
  stopAt: number
  arrivalAssumed: boolean
  shortStopAssumed: boolean
  body: ReturnType<typeof buildVehicleBody>
  vehicle: TrainInstance['vehicle']
  feedKind: FeedKind
}

function minuteOnly(time: string | null) {
  return time !== null && /^\d{1,2}:\d{2}$/.test(time.trim())
}

export function buildTrainPlans(
  records: readonly TimetableRecord[], tracks: readonly TrackPath[], catalog: readonly VehicleSeries[],
  { day, serviceDate, feedKind }: PlanOptions,
): TrainPlan[] {
  const tracksByPlatform = new Map<string, TrackPath[]>()
  for (const track of tracks) {
    const candidates = tracksByPlatform.get(track.platformId) ?? []
    candidates.push(track)
    tracksByPlatform.set(track.platformId, candidates)
  }
  const seriesById = new Map(catalog.map((series) => [series.id, series]))
  const candidates: TrainPlan[] = []
  for (const record of records) {
    if (record.platform_id === null || !serviceDateTypeApplies(record.service_date_type, day)) continue
    if (serviceDate && ((record.valid_from && serviceDate < record.valid_from) ||
        (record.valid_until && serviceDate > record.valid_until))) continue
    const platformTracks = tracksByPlatform.get(record.platform_id)
    // The timetable supplies a platform ID. Never guess which side of a shared platform to use.
    const track = platformTracks?.length === 1 ? platformTracks[0] : null
    if (!track?.entrance || track.polyline.length !== 2) continue
    const [start, end] = track.polyline
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const trackLength = Math.hypot(dx, dz)
    if (trackLength <= 0) continue
    const arrival = parseServiceTime(record.arrival_time_local)
    const departure = parseServiceTime(record.departure_time_local)
    if (arrival === null && departure === null) continue
    const arrive = arrival ?? departure! - ASSUMED_DWELL_SECONDS
    const shortStopAssumed = arrival !== null && departure === arrival &&
      minuteOnly(record.arrival_time_local) && minuteOnly(record.departure_time_local)
    const depart = shortStopAssumed ? arrive + SHORT_STOP_SECONDS : departure
    const series = record.vehicle_assignment_status === 'unknown' || record.vehicle_series === null
      ? null : seriesById.get(record.vehicle_series) ?? null
    const knownSeries = series?.operatorId === record.operator_id ? series : null
    const body = buildVehicleBody(knownSeries, trackLength, record.formation_length)
    candidates.push({
      id: feedKind === 'demo' ? record.trip_id : [record.station_id, record.service_date_type, record.trip_id].join('|'),
      record, track, body, trackLength, trackHeading: [dx / trackLength, 0, dz / trackLength],
      enter: arrive - APPROACH_SECONDS,
      arrive, depart, leave: depart === null ? arrive + TERMINATING_HOLD_SECONDS : depart + DEPART_SECONDS,
      stopAt: track.terminal ? track.stopRange[1] - body.length / 2 : (track.stopRange[0] + track.stopRange[1]) / 2,
      arrivalAssumed: arrival === null,
      shortStopAssumed,
      vehicle: {
        seriesId: knownSeries?.id ?? null,
        status: knownSeries ? record.vehicle_assignment_status : 'unknown',
        cars: record.formation_length,
        livery: knownSeries?.livery ?? null,
      },
      feedKind,
    })
  }

  const clearAt = new Map<string, number>()
  const plans: TrainPlan[] = []
  for (const plan of candidates.sort((a, b) => a.arrive - b.arrive)) {
    const enter = Math.max(plan.enter, clearAt.get(plan.track.id) ?? -Infinity)
    if (plan.arrive - enter < MIN_APPROACH_SECONDS) continue
    plans.push({ ...plan, enter })
    clearAt.set(plan.track.id, plan.leave + (plan.track.terminal ? 0 : FOLLOW_GAP_SECONDS))
  }
  return plans.sort((a, b) => a.enter - b.enter)
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, value))

export function positionAt(plan: TrainPlan, seconds: number): {
  phase: TrainPhase; s: number; speedFactor: number; doors: number
} | null {
  const { enter, arrive, depart, leave, stopAt, body, track } = plan
  if (seconds < enter || seconds >= leave) return null
  if (seconds < arrive) {
    const elapsed = (seconds - enter) / (arrive - enter)
    const remaining = 1 - elapsed
    return {
      phase: elapsed < 0.45 ? 'approaching' : 'braking',
      s: stopAt - (stopAt + body.length / 2) * remaining ** 2,
      speedFactor: remaining,
      doors: 0,
    }
  }
  if (depart !== null && seconds >= depart) {
    const elapsed = (seconds - depart) / DEPART_SECONDS
    const exit = track.terminal ? -body.length / 2 : plan.trackLength + body.length / 2
    return { phase: 'departing', s: stopAt + (exit - stopAt) * elapsed ** 2, speedFactor: elapsed, doors: 0 }
  }
  const standsUntil = depart ?? leave
  const dwell = standsUntil - arrive
  const delay = Math.min(DOOR_OPEN_AFTER, dwell * 0.1)
  const shut = Math.min(DOOR_CLOSED_BEFORE, dwell * 0.2)
  const movement = Math.min(DOOR_MOVE_SECONDS, (dwell - delay - shut) / 2)
  const opening = clampUnit((seconds - arrive - delay) / movement)
  const closing = clampUnit((standsUntil - seconds - shut) / movement)
  const doors = Math.min(opening, closing)
  const phase = doors === 0 ? 'stopped' : doors === 1 ? 'doors-open' : opening < closing ? 'doors-opening' : 'doors-closing'
  return { phase, s: stopAt, speedFactor: 0, doors }
}

export function trainInstanceAt(plan: TrainPlan, seconds: number): (TrainInstance & { s: number; doors: number }) | null {
  const state = positionAt(plan, seconds)
  if (state === null) return null
  const { record, track, trackHeading, id } = plan
  const [x, y, z] = track.polyline[0]
  const sign = track.terminal && state.phase === 'departing' ? -1 : 1
  return {
    id, planId: id, platformId: track.platformId, trackPathId: track.id,
    lineId: record.line_id, serviceClass: record.service_class, destinationText: record.destination_text,
    phase: state.phase,
    position: [x + state.s * trackHeading[0], y, z + state.s * trackHeading[2]],
    heading: [sign * trackHeading[0], 0, sign * trackHeading[2]],
    doorsOpen: state.doors === 1,
    scheduledArrival: record.arrival_time_local, scheduledDeparture: record.departure_time_local,
    arrivalAssumed: plan.arrivalAssumed, shortStopAssumed: plan.shortStopAssumed,
    vehicle: plan.vehicle, liveState: 'scheduled', feedKind: plan.feedKind,
    s: state.s, doors: state.doors,
  }
}
