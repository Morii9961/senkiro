import { expect, it } from 'vitest'
import { nextPlaceId, planRoute } from '../src/domain/graph'
import { sites, station } from '../src/model'

it('AT-NAV-01 and AT-NAV-03: the documented transfer is eight segments in consecutive floor groups', () => {
  const plan = planRoute(station, 'sk:concourse:jr-midosuji-in', 'sk:platform:metro-1', { stepFreeOnly: true })
  expect(plan).toMatchObject({
    summary: { segments: 8, levelChanges: 2, gates: 2 },
    floorSpans: [{ fromLabel: '1F', toLabel: 'B1F', stepIndexes: [0, 1, 2, 3] },
      { fromLabel: 'B1F', toLabel: 'B2F', stepIndexes: [4, 5, 6, 7] }],
    distanceMeters: null, durationSeconds: null, unknownStepFree: [],
  })
})

it('AT-NAV-04: reports the first step-free blocker and keeps no route steps', () => {
  expect(planRoute(station, 'sk:landing:foot-83', 'sk:landing:head-83', { stepFreeOnly: true })).toEqual({
    reason: 'step-free-blocked', firstBlockingLinkId: 'sk:stairs:jr-83', blocker: 'stairs',
  })
})

it('AT-NAV-07: only verified, contiguous and correctly directed links reach the modeled sites', () => {
  const endpoints = [...sites.map(({ anchorId }) => anchorId), 'sk:entrance:midosuji-south']
  const links = new Set(station.links)
  for (const start of endpoints) {
    for (const end of endpoints) {
      const result = planRoute(station, start, end)
      if ('reason' in result) {
        expect(result).toEqual({ reason: 'no-path' })
        continue
      }
      let current = start
      for (const step of result.steps) {
        expect(links.has(step.link)).toBe(true)
        expect(step.link.connection).toBe('verified')
        expect(step.from.id).toBe(current)
        expect(nextPlaceId(step.link, current)).toBe(step.to.id)
        current = step.to.id
      }
      expect(current).toBe(end)
    }
  }
  const isolated = { ...station, links: [] }
  expect(planRoute(isolated, endpoints[0], endpoints[1])).toEqual({ reason: 'no-path' })
  expect(planRoute(station, 'missing', endpoints[1])).toEqual({ reason: 'no-path' })
})
