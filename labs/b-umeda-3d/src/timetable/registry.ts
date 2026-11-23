import type { Model } from '../domain/types.ts'

/** Timetable identifiers resolve against the Umeda model's own stable IDs. */
export function createTimetableRegistry(model: Model) {
  return {
    stations: new Map(model.stations.map((station) => [station.id, station])),
    lines: new Map(model.lines.map((line) => [line.id, line])),
    platforms: new Map(model.places.filter((place) => place.kind === 'Platform').map((platform) => [platform.id, platform])),
  }
}

export type TimetableRegistry = ReturnType<typeof createTimetableRegistry>
