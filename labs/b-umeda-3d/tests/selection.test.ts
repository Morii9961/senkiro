import { describe, expect, it } from 'vitest'
import { ownersOf } from '../src/domain/ownersOf'
import { station } from '../src/model'
import { selectionReducer, targetFromOwner } from '../src/state/selection'

describe('selection', () => {
  it('maps the pickable objects and excludes internal landings', () => {
    for (const [kind, id] of [
      ['station', 'sk:station:jr-osaka'],
      ['station', 'sk:context:whity'],
      ['platform', 'sk:platform:jr-3-4'],
      ['gate', 'sk:gate:jr-midosuji'],
      ['vertical', 'sk:elevator:metro-platform'],
      ['entrance', 'sk:entrance:midosuji-south'],
      ['concourse', 'sk:concourse:metro-gate-out'],
      ['passage', 'sk:passage:central-south'],
    ] as const) {
      expect(targetFromOwner(id)).toEqual({ kind, id })
    }
    const landing = station.places.find((place) => place.kind === 'Landing')!
    expect(targetFromOwner(landing.id)).toBeNull()
    expect(targetFromOwner('')).toBeNull()
  })

  it('updates selection and hover independently', () => {
    const target = targetFromOwner('sk:platform:jr-3-4')!
    const initial = { selection: null, hovered: null }
    const selected = selectionReducer(initial, { type: 'select', target })
    expect(selected).toEqual({ selection: target, hovered: null })
    const hovered = selectionReducer(selected, { type: 'hover', target })
    expect(hovered).toEqual({ selection: target, hovered: target })
    expect(selectionReducer(hovered, { type: 'clear' })).toEqual({
      selection: null,
      hovered: target,
    })
  })

  it('maps platforms, stations and lines to their render owners', () => {
    const platform = targetFromOwner('sk:platform:jr-3-4')!
    expect(ownersOf(station, platform)).toEqual(new Set([platform.id]))
    const osaka = targetFromOwner('sk:station:jr-osaka')!
    const osakaOwners = ownersOf(station, osaka)
    expect(osakaOwners.has(platform.id)).toBe(true)
    expect(osakaOwners.has('sk:gate:jr-midosuji')).toBe(true)
    expect(osakaOwners.has('sk:platform:metro-1')).toBe(false)
    expect(ownersOf(station, { kind: 'line', id: 'sk:line:midosuji' })).toEqual(
      new Set(['sk:platform:metro-1']),
    )
  })
})
