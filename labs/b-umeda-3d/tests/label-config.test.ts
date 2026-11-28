import { expect, it } from 'vitest'
import { nextBand, permitsLabel, Z1, Z2, type ZoomBand } from '../src/scene/labels/config'

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

it('shows stations, then lines, then platforms and facilities as zoom increases', () => {
  expect(permitsLabel(0, 'far')).toBe(true)
  expect(permitsLabel(1, 'far')).toBe(true)
  expect(permitsLabel(2, 'far', true)).toBe(false)
  expect(permitsLabel(2, 'mid', true)).toBe(true)
  expect(permitsLabel(2, 'mid')).toBe(false)
  expect(permitsLabel(2, 'near', true)).toBe(false)
  for (const depth of [2, 3, 4]) expect(permitsLabel(depth, 'near')).toBe(true)
})
