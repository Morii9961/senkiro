import { expect, it } from 'vitest'
import { effectiveBand, nextBand, permitsLabel, Z1, Z2, type ZoomBand } from '../src/scene/labels/config'

it('AT-LBL-06: 5% oscillation around either threshold does not change the band', () => {
  for (const [threshold, low, high] of [[Z1, 'far', 'mid'], [Z2, 'mid', 'near']] as const) {
    let band: ZoomBand = low
    for (let index = 0; index < 100; index++) {
      band = nextBand(band, threshold * (index % 2 ? 1.05 : 0.95))
      expect(band).toBe(low)
    }
    expect(nextBand(band, threshold * 1.13)).toBe(high)
    expect(nextBand(high, threshold * 0.87)).toBe(low)
  }
})

it('enforces the depth cap, near station retirement and one-band promotion', () => {
  expect(effectiveBand('far', true)).toBe('mid')
  expect(effectiveBand('mid', true)).toBe('near')
  expect(permitsLabel(0, 'far', 'guide')).toBe(true)
  expect(permitsLabel(2, 'far', 'guide')).toBe(false)
  expect(permitsLabel(1, 'near', 'guide')).toBe(false)
  expect(permitsLabel(3, 'near', 'facility')).toBe(true)
  expect(permitsLabel(4, 'near', 'guide')).toBe(false)
  expect(permitsLabel(4, 'near', 'structure')).toBe(true)
})
