import type { Model, Place } from '../domain/types.ts'

export type TrackEntrance = 'x-' | 'x+' | 'z-' | 'z+'

export interface TrackPath {
  id: string
  platformId: string
  side: -1 | 1
  polyline: [number, number, number][]
  stopRange: [number, number]
  entrance: TrackEntrance | null
  terminal: boolean
  derivedFrom: 'platform-geometry'
}

export const trackFloorGap = 5
export const railCenterHeight = -0.22
export const railHeight = 0.17

export const trackOffset = (breadth: number, side: -1 | 1) => side * (breadth / 2 + 0.54)

function platformPaths(place: Place, floor: number): TrackPath[] {
  const boarding = place.boarding
  if (place.kind !== 'Platform' || !boarding) return []
  const [width, depth] = place.size
  const alongX = width > depth
  const length = Math.max(width, depth)
  const breadth = Math.min(width, depth)
  const height = floor * trackFloorGap + railCenterHeight + railHeight / 2
  // The handoff establishes the layout approach only for Hankyu's terminal tracks.
  const approach = place.stationId === 'sk:station:hankyu-osaka-umeda' && boarding.terminalEnd
    ? -boarding.terminalEnd : null
  const sign = approach ?? -1
  const entrance = approach === null ? null
    : ((alongX ? 'x' : 'z') + (approach < 0 ? '-' : '+')) as TrackEntrance
  const margin = Math.min(0.5, length / 4)
  return boarding.trackSides.map((side) => {
    const offset = trackOffset(breadth, side)
    const at = (distance: number): [number, number, number] => [
      place.point[0] + (alongX ? distance : offset),
      height,
      place.point[1] + (alongX ? offset : distance),
    ]
    return {
      id: 'track:' + place.id + ':' + side,
      platformId: place.id,
      side,
      polyline: [at(sign * length / 2), at(-sign * length / 2)],
      stopRange: [margin, length - margin],
      entrance,
      terminal: boarding.terminalEnd !== undefined,
      derivedFrom: 'platform-geometry',
    }
  })
}

export function deriveTrackPaths(model: Model): TrackPath[] {
  const floors = new Map(model.levels.map((level) => [level.id, level.ordinal]))
  return model.places.flatMap((place) => platformPaths(place, floors.get(place.levelId)!))
}

export function validateTrackPaths(model: Model, tracks: TrackPath[]) {
  const expectedTracks = deriveTrackPaths(model)
  const expected = new Map<string, TrackPath>()
  for (const track of expectedTracks) {
    if (expected.has(track.id)) throw new Error('Duplicate boarding side: ' + track.id)
    expected.set(track.id, track)
  }
  const seen = new Set<string>()
  for (const track of tracks) {
    if (seen.has(track.id)) throw new Error('Duplicate track path: ' + track.id)
    seen.add(track.id)
    const original = expected.get(track.id)
    if (!original || track.side !== original.side || track.platformId !== original.platformId) {
      throw new Error('Track has no matching boarding side: ' + track.id)
    }
    if (track.entrance !== original.entrance || track.terminal !== original.terminal) {
      throw new Error('Unsupported track approach or terminal: ' + track.id)
    }
    if (track.derivedFrom !== original.derivedFrom || track.polyline.length !== original.polyline.length ||
      track.polyline.some((point, index) => point.length !== 3 || point.some((value, axis) =>
        !Number.isFinite(value) || Math.abs(value - original.polyline[index][axis]) >= 0.05,
      )) || track.stopRange.length !== 2 ||
      track.stopRange.some((value, index) => value !== original.stopRange[index])) {
      throw new Error('Track geometry or stopping range differs from its platform rail: ' + track.id)
    }
  }
  for (const id of expected.keys()) {
    if (!seen.has(id)) throw new Error('Missing track path: ' + id)
  }
}
