import { expect, it } from 'vitest'
import { createFacilityIndex, type PlatformService } from '../src/domain/index'
import { describePlatform } from '../src/domain/describe/platform'
import { station } from '../src/model'
import { services } from '../data/manual/services'

it('AT-DET-02: each of the 24 platform pages represents missing fields as null', () => {
  const index = createFacilityIndex(station, { services })
  const platforms = station.places.filter((place) => place.kind === 'Platform')
  expect(platforms).toHaveLength(24)
  for (const platform of platforms) {
    const result = describePlatform(index, platform.id, { lang: 'ja' })
    expect(result.title.trim()).not.toBe('')
    if (!services.some((entry) => entry.platformId === platform.id && entry.directions?.some((item) => item.towards))) {
      expect(result.facts.find((fact) => fact.key === 'direction')?.value).toBeNull()
    }
    expect(result.facts.every((fact) => fact.label.trim() && (
      fact.value === null || (typeof fact.value === 'string' && fact.value.trim() !== '')
    ))).toBe(true)
    expect(result.provenance.sourceIds.length).toBeGreaterThan(0)
  }
})

it('AT-DET-08: removing a platform service leaves the direction row in place', () => {
  const platform = station.places.find(({ id }) => id === 'sk:platform:hk-3')!
  const service: PlatformService = {
    platformId: platform.id, lineId: platform.serviceLineIds![0], track: null,
    provenance: { ...platform.provenance, dataNature: 'synthetic' },
    directions: [{
      id: 'synthetic:test-direction', towards: { ja: 'TEST FIXTURE', en: null },
      bound: null, terminusStationName: null, neighborStationName: null, sourceIds: [],
    }],
  }
  const direction = (withService: PlatformService[]) => describePlatform(
    createFacilityIndex(station, { services: withService }), platform.id, { lang: 'ja' },
  ).facts.find(({ key }) => key === 'direction')?.value
  expect(direction([service])).toBe('TEST FIXTURE')
  expect(direction([])).toBeNull()
})
