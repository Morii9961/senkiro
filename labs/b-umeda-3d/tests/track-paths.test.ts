import { expect, it } from 'vitest'
import { deriveTrackPaths, validateTrackPaths } from '../src/trains/trackPaths'
import { floors, nodes, station } from '../src/model'

it('AT-TRN-01: track IDs follow explicit boarding sides and only the documented terminal approach is available', () => {
  const tracks = deriveTrackPaths(station)
  const expected = station.places.flatMap((place) =>
    place.boarding?.trackSides.map((side) => 'track:' + place.id + ':' + side) ?? [],
  )
  expect(tracks.map(({ id }) => id)).toEqual(expected)
  expect(tracks).toHaveLength(19)
  expect(tracks.filter(({ entrance }) => entrance !== null)).toHaveLength(9)
  expect(tracks.find(({ id }) => id === 'track:sk:platform:hk-3:-1')).toMatchObject({
    entrance: 'z-', terminal: true, derivedFrom: 'platform-geometry',
  })
  expect(tracks.find(({ id }) => id === 'track:sk:platform:hs-1-2:1')).toMatchObject({
    entrance: null, terminal: true,
  })
  expect(() => validateTrackPaths(station, tracks)).not.toThrow()
})

it('AT-TRN-02: each path stays within 0.05 units of the rendered rail center, on the same deck', () => {
  for (const track of deriveTrackPaths(station)) {
    const platform = nodes.get(track.platformId)!
    const [w, d] = platform.size
    const lateral = w > d ? 2 : 0
    const center = platform.point[lateral === 2 ? 1 : 0]
    const floor = floors.get(platform.levelId)!.ordinal
    const shift = track.side * (Math.min(w, d) / 2 + 0.54)
    const railCenter = ((center + shift - 0.32) + (center + shift + 0.32)) / 2
    for (const point of track.polyline) {
      expect(Math.abs(point[lateral] - railCenter)).toBeLessThan(0.05)
      expect(point[1]).toBeCloseTo(floor * 5 - 0.22 + 0.17 / 2, 6)
    }
  }
})

it('AT-TRN-01 and AT-TRN-02: rejects duplicates, unsupported approaches and displaced track geometry', () => {
  const tracks = deriveTrackPaths(station)
  const known = tracks[0]
  const unknownIndex = tracks.findIndex(({ entrance }) => entrance === null)
  expect(() => validateTrackPaths(station, [...tracks, known])).toThrow(/duplicate/i)
  expect(() => validateTrackPaths(station, tracks.map((track, index) =>
    index === unknownIndex ? { ...track, entrance: 'x-' } : track,
  ))).toThrow(/approach/i)
  const displaced = structuredClone(tracks)
  displaced[0].polyline[0][0] += 1
  expect(() => validateTrackPaths(station, displaced)).toThrow(/geometry/i)
})
