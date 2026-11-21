import { describe, it, expect } from 'vitest'
import { model, firstPlatform, westOutside } from '../data/manual/model'
import { sources } from '../data/manual/sources'
import { cost, route, validate } from '../src/domain/graph'
import { exampleService, liveService } from '../src/providers/service'
const ids = new Set(sources.map((s) => s.id))
describe('Osaka indoor graph', () => {
  it('resolves every endpoint, floor and source', () =>
    expect(() => validate(model, ids)).not.toThrow())
  it('rejects a missing endpoint', () => {
    const m = structuredClone(model)
    m.links[0].to = 'missing'
    expect(() => validate(m, ids)).toThrow('Missing endpoint')
  })
  it('requires a matching declared span for a non-adjacent lift', () => {
    const m = structuredClone(model),
      ab = m.links.find((l) => l.id === 'sk:elevator:jr-ab')!
    ab.declaredSpan = [ab.from, ab.to]
    expect(() => validate(m, ids)).toThrow('Undeclared span')
  })
  it('only lets vertical facilities cross a floor', () => {
    const m = structuredClone(model)
    m.links.find((e) => e.kind === 'Elevator')!.kind = 'Passage'
    expect(() => validate(m, ids)).toThrow('Invalid level change')
  })
  it('rejects any passage through a fare boundary', () => {
    const m = structuredClone(model)
    m.links.find((e) => e.kind === 'Gate')!.kind = 'Passage'
    expect(() => validate(m, ids)).toThrow('Fare boundary')
  })
  it('rejects a same-floor paid link between operators even if labelled a gate', () => {
    for (const kind of ['Gate', 'Passage'] as const) {
      const m = structuredClone(model),
        e = m.links.find((e) => e.kind === 'Gate')!
      e.kind = kind
      e.from = 'sk:concourse:umekita-in'
      e.to = 'sk:concourse:metro-gate-in'
      expect(() => validate(m, ids)).toThrow('No verified transfer gate')
    }
  })
  it('follows the city crossing and Metro ramp, including both ticket gates', () => {
    const p = route(
      model,
      'sk:concourse:jr-midosuji-in',
      'sk:platform:metro-1',
      true,
    )!
    expect(p.map((s) => s.link.id)).toEqual([
      'sk:gate:jr-midosuji',
      'sk:passage:city-approach',
      'sk:passage:city-crossing',
      'sk:elevator:city-six',
      'sk:passage:city-to-metro',
      'sk:gate:metro-northeast',
      'sk:passage:metro-ramp',
      'sk:elevator:metro-platform',
    ])
    const label = (id: string) => model.levels.find((l) => l.id === id)!.label
    expect([
      ...new Set([
        label(p[0].from.levelId),
        ...p.map((s) => label(s.to.levelId)),
      ]),
    ]).toEqual(['1F', 'B1F', 'B2F'])
    expect(cost(p)).toEqual({ gates: 2, changes: 2, segments: 8 })
  })
  it('reaches the underground platforms via B2 passage then B1 concourse', () => {
    const p = route(model, westOutside.id, 'sk:platform:jr-21-22')!
    expect(
      p.filter((s) => s.link.kind === 'Elevator').map((s) => s.link.id),
    ).toEqual(['sk:elevator:jr-ab', 'sk:elevator:jr-ac', 'sk:elevator:jr-ad'])
  })
  it('keeps unverified surroundings outside the routing graph', () => {
    for (const block of model.context)
      expect(route(model, westOutside.id, block.id)).toBeNull()
  })
  it('keeps the synthetic overlay linked to an actual platform and the live provider unavailable', async () => {
    const s = exampleService.updates[0]
    expect(
      model.places.find((p) => p.id === s.platformId)?.serviceLineIds,
    ).toContain(s.lineId)
    expect(ids.has(s.sourceId)).toBe(true)
    expect(s.dataNature).toBe('synthetic')
    expect(await liveService.read()).toEqual({
      mode: 'unavailable',
      reason: 'no-licensed-feed',
    })
  })
  it('routes from the JR West gate across two floors', () => {
    const path = route(model, westOutside.id, firstPlatform.id)!
    expect(path.map((e) => e.link.kind)).toEqual([
      'Gate',
      'Passage',
      'Elevator',
      'Passage',
    ])
  })
})
