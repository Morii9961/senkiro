import { describe, expect, it } from 'vitest'
import { createFacilityIndex } from '../src/domain/index'
import { station } from '../src/model'

const index = createFacilityIndex(station)
const platforms = (...names: string[]) => names.map((name) => 'sk:platform:' + name).sort()

describe('AT-DET-09: paid-side gate coverage in the verified model', () => {
  it.each([
    ['jr-midosuji', platforms('jr-1-2', 'jr-3-4', 'jr-5-6', 'jr-7-8', 'jr-9-10', 'jr-11', 'jr-21-22', 'jr-23-24')],
    ['metro-northeast', platforms('metro-1')],
    ['hk-3f', platforms('hk-1', 'hk-2', 'hk-3', 'hk-4', 'hk-5', 'hk-6', 'hk-7', 'hk-8', 'hk-9')],
    ['hs-east', platforms('hs-1-2', 'hs-3-4')],
    ['higashi-1', platforms('higashi-1')],
    ['kita-gate', platforms('kita-1-2')],
    ['nishi-gate', platforms('nishi-1-2')],
  ] as const)('%s serves these platforms without a further gate', (name, expected) => {
    const view = index.gateView('sk:gate:' + name)
    expect(view.insideSide.zone).toBe('paid')
    expect(view.outsideSide.zone).toBe('unpaid')
    expect(view.servedPlatforms.map((place) => place.id).sort()).toEqual(expected)
    expect(view.facilitiesOutside.every((place) => place.zone === 'unpaid')).toBe(true)
  })
})

it('AT-SEL-06: returns the owner sets used by the scene', () => {
  const platform = 'sk:platform:jr-3-4'
  expect(index.ownersOf({ kind: 'platform', id: platform })).toEqual(new Set([platform]))
  expect(index.ownersOf({ kind: 'line', id: 'sk:line:kobe' })).toEqual(
    new Set(platforms('jr-3-4', 'jr-5-6')),
  )
  const stationId = 'sk:station:jr-osaka'
  const osakaPlaces = new Set(station.places.filter((place) => place.stationId === stationId).map((place) => place.id))
  const osakaLinks = station.links.filter((link) => osakaPlaces.has(link.from) || osakaPlaces.has(link.to))
  expect(index.ownersOf({ kind: 'station', id: stationId })).toEqual(
    new Set([...osakaPlaces, ...osakaLinks.map((link) => link.id)]),
  )
})

it('returns the documented levels and lines with derived transfer and exit relations', () => {
  const platform = index.platformView('sk:platform:jr-3-4')
  expect(index.levelOf(platform.platform.id)?.label).toBe('2F')
  expect(index.stationOf(platform.platform.id)).toEqual(platform.station)
  expect(platform.lines.map((line) => line.id)).toEqual(['sk:line:kobe'])
  expect(platform.services).toEqual([])
  expect(platform.nearestVerticals.length).toBeGreaterThan(0)
  expect(platform.transfers.length).toBeLessThanOrEqual(8)
  expect(platform.transfers.some((transfer) => transfer.gates === 0)).toBe(true)
  expect(index.relatedTargets({ kind: 'platform', id: platform.platform.id })).toContainEqual({
    kind: 'platform', id: 'sk:platform:jr-5-6',
  })
  const entrance = index.exitView('sk:entrance:midosuji-south')
  expect(entrance.info).toBeNull()
  expect(entrance.nearestArea?.id).toBe('sk:concourse:jr-midosuji-out')
  expect(entrance.reachableLines.map((line) => line.id)).toContain('sk:line:kobe')
  const vertical = index.verticalView('sk:elevator:metro-platform')
  expect([vertical.fromLevel.label, vertical.toLevel.label]).toEqual(['B1F', 'B2F'])
  expect(vertical.servedPlatforms.map((place) => place.id)).toEqual(['sk:platform:metro-1'])
})
