import { expect, it } from 'vitest'
import { exits } from '../data/manual/exits'
import { services } from '../data/manual/services'
import { sources } from '../data/manual/sources'
import { describePlatform } from '../src/domain/describe/platform'
import { createFacilityIndex } from '../src/domain/index'
import { validatePassengerData } from '../src/domain/passengerData'
import { station } from '../src/model'

const registered = new Set(sources.map(({ id }) => id))
const platformId = 'sk:platform:metro-1'
const service = services.find((entry) => entry.platformId === platformId)!
const exit = exits.find((entry) => entry.placeId === 'sk:entrance:midosuji-south')!

it('AT-HON-02: passenger facts use known platforms, lines, entrances and sources', () => {
  expect(service).toBeDefined()
  expect(exit.exitLabel?.ja).toBe('御堂筋南口')
  expect(() => validatePassengerData(station, services, exits, registered)).not.toThrow()
})

it('AT-HON-02: invalid or unattributed facts are rejected before exporting', () => {
  const check = (entry = service, info = exit) => validatePassengerData(station, [entry], [info], registered)
  expect(() => check({ ...service, platformId: exit.placeId })).toThrow(/platform/i)
  expect(() => check({ ...service, lineId: 'sk:line:kobe' })).toThrow(/line/i)
  const direction = service.directions![0]
  expect(() => check({ ...service, directions: [{ ...direction, towards: { ja: ' ', en: null } }] })).toThrow(/text/i)
  expect(() => check({ ...service, directions: [{ ...direction, sourceIds: [] }] })).toThrow(/source/i)
  expect(() => check({ ...service, provenance: { ...service.provenance, dataNature: 'synthetic' } })).toThrow(/nature/i)
  expect(() => check({ ...service, provenance: { ...service.provenance, sourceIds: ['missing'] } })).toThrow(/source/i)
  expect(() => check(service, { ...exit, placeId: platformId })).toThrow(/entrance/i)
})

it('AT-DET-08: the verified Metro direction and adjacent station vanish together when service is removed', () => {
  const details = (withService: typeof services) =>
    describePlatform(createFacilityIndex(station, { services: withService }), platformId, { lang: 'ja' })
  expect(details(services).facts.find(({ key }) => key === 'direction')?.value).toMatch(/なかもず/)
  expect(details(services).facts.find(({ key }) => key === 'neighbors')?.value).toBe('淀屋橋')
  const missing = details(services.filter((entry) => entry.platformId !== platformId))
  expect(missing.facts.find(({ key }) => key === 'direction')?.value).toBeNull()
  expect(missing.facts.find(({ key }) => key === 'neighbors')?.value).toBeNull()
})
