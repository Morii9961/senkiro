import { expect, it } from 'vitest'
import { inspectRouteCoverage } from '../scripts/check-routes'
import { model } from '../data/manual/model'
import { sources } from '../data/manual/sources'

const sourceIds = new Set(sources.map(({ id }) => id))
const stairs = model.links.find(({ id }) => id === 'sk:stairs:jr-83')!
const fixture = {
  ...model,
  context: [],
  places: model.places.filter(({ id }) => id === stairs.from || id === stairs.to),
  links: [stairs],
}

it('AT-NAV-09: checks each ordered pair in both modes and reports the known stair barriers', () => {
  const report = inspectRouteCoverage(fixture, sourceIds)
  expect(report).toMatchObject({
    endpointCount: 2,
    verticalCount: 1,
    ordinary: { checked: 4, planned: 4, noPath: 0, blocked: 0 },
    stepFree: { checked: 4, planned: 2, noPath: 0, blocked: 2 },
    failures: [],
  })
})

it('AT-NAV-09: records disconnected pairs without fabricating route bands', () => {
  const report = inspectRouteCoverage({ ...fixture, links: [] }, sourceIds)
  expect(report).toMatchObject({
    ordinary: { checked: 4, planned: 2, noPath: 2, blocked: 0 },
    stepFree: { checked: 4, planned: 2, noPath: 2, blocked: 0 },
    failures: [],
  })
})

it('AT-NAV-09: reports invalid vertical spans with their source link ID', () => {
  const links = [{ ...stairs, declaredSpan: null }]
  const report = inspectRouteCoverage({ ...fixture, links }, sourceIds)
  expect(report.failures).toContain('Undeclared span ' + stairs.id)
})
